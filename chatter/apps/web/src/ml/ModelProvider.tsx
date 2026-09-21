import { LoadingStatus } from '../components/LoadingStatus.js';
/**
 * Loads the two on-device models and runs the transcript queue.
 *
 * SPEC S9, Tier 0: the models run in this tab, so nothing waits on another
 * machine being awake. First run downloads a model and caches it.
 */
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { JobQueue, runNextTranscribeJob, type Classifier } from '@chatter/shared';
import { useStore } from '../store/StoreProvider.js';
import { plainLanguageFor, type Backend } from './backend.js';
import type { WhisperInTab, SafetyClassifier } from './workerClient.js';

export interface Models {
  classifier: Classifier;
  /** How the picture checker is getting on, for the Gate to explain itself. */
  checkerState: 'loading' | 'ready' | 'failed';
  checkerProgress: number;
  backend: Backend | 'unknown';
  speedNote: string;
  pendingTranscripts: number;
}

const notLoadedYet: Classifier = { ready: false, async classify() { return 1; } };

/**
 * There is one transcript queue, so there is one drainer. Module scope rather
 * than a ref: StrictMode mounts the provider twice, and two drainers would
 * each claim a different job and run two models at once on a Chromebook.
 */
let draining = false;

const ModelContext = createContext<Models>({
  classifier: notLoadedYet,
  checkerState: 'loading',
  checkerProgress: 0,
  backend: 'unknown',
  speedNote: '',
  pendingTranscripts: 0,
});

export function useModels(): Models { return useContext(ModelContext); }

export function ModelProvider({ children }: { children: ReactNode }) {
  const store = useStore();
  const [models, setModels] = useState<Models>({
    classifier: notLoadedYet,
    checkerState: 'loading',
    checkerProgress: 0,
    backend: 'unknown',
    speedNote: '',
    pendingTranscripts: 0,
  });

  const [checkerActive, setCheckerActive] = useState(false);
  const transcriber = useRef<WhisperInTab>();
  const classifier = useRef<SafetyClassifier>();

  /** Install a light wrapper now; its worker and weights wait for an image. */
  useEffect(() => {
    let cancelled = false;
    let loading: Promise<boolean> | undefined;

    const onDemand: Classifier = {
      get ready() { return classifier.current?.ready ?? false; },
      async prepare() {
        if (classifier.current?.ready) return true;
        if (loading) return loading;

        setCheckerActive(true);
        setModels((m) => ({ ...m, checkerState: 'loading', checkerProgress: 0 }));
        const attempt = (async () => {
          try {
            const { makeSafetyClassifier } = await import('./workerClient.js');
            const made = await makeSafetyClassifier();
            if (cancelled) { made.classifier.dispose(); return false; }

            classifier.current = made.classifier;
            made.classifier.onProgress = (progress) => {
              if (!cancelled) setModels((m) => ({ ...m, checkerProgress: progress }));
            };
            setModels((m) => ({
              ...m,
              backend: made.backend,
              speedNote: plainLanguageFor(made.backend),
            }));
            await made.classifier.load();
            if (cancelled) { made.classifier.dispose(); return false; }
            setModels((m) => ({ ...m, checkerState: 'ready', checkerProgress: 100 }));
            return true;
          } catch {
            if (!cancelled) setModels((m) => ({ ...m, checkerState: 'failed' }));
            return false;
          }
        })();
        loading = attempt;
        void attempt.finally(() => { if (loading === attempt) loading = undefined; if (!cancelled) setCheckerActive(false); });
        return attempt;
      },
      async classify(bytes, mime) {
        if (!classifier.current?.ready) throw new Error('Picture checker is not ready');
        return classifier.current.classify(bytes, mime);
      },
    };

    setModels((m) => ({ ...m, classifier: onDemand }));

    return () => {
      cancelled = true;
      classifier.current?.dispose();
      classifier.current = undefined;
    };
  }, []);

  /** Drain the transcript queue in the background, one take at a time. */
  useEffect(() => {
    const jobs = new JobQueue(store);

    const tick = async () => {
      if (draining) return;
      draining = true;
      try {
        const waiting = await jobs.waiting();
        setModels((m) => ({ ...m, pendingTranscripts: waiting.length }));
        if (waiting.length === 0) return;

        if (!transcriber.current) {
          const { makeTranscriber } = await import('./workerClient.js');
          const made = await makeTranscriber();
          transcriber.current = made.transcriber;
          setModels((m) => ({
            ...m,
            backend: made.backend,
            speedNote: plainLanguageFor(made.backend),
          }));
        }

        while (await runNextTranscribeJob(store, jobs, transcriber.current)) {
          const left = await jobs.waiting();
          setModels((m) => ({ ...m, pendingTranscripts: left.length }));
        }
        const left = await jobs.waiting();
        setModels((m) => ({ ...m, pendingTranscripts: left.length }));
      } finally {
        draining = false;
      }
    };

    const timer = window.setInterval(tick, 4000);
    void tick();
    return () => {
      window.clearInterval(timer);
      transcriber.current?.dispose();
      transcriber.current = undefined;
    };
  }, [store]);

  return <ModelContext.Provider value={models}>{children}
    {(checkerActive || models.pendingTranscripts > 0) && <aside className="orbit-background-work" aria-label="Background processing">
      <LoadingStatus label={checkerActive ? 'Preparing the picture checker…' : 'Making transcripts…'}
        progress={checkerActive && models.checkerProgress > 0 && models.checkerProgress < 100 ? models.checkerProgress / 100 : undefined}
        detail={checkerActive ? 'The first picture check needs to load its tools.' : `${models.pendingTranscripts} recording${models.pendingTranscripts === 1 ? '' : 's'} in the queue. You can keep working.`} />
    </aside>}
  </ModelContext.Provider>;
}
