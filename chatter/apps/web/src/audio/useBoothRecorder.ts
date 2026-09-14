import { useEffect, useRef, useState } from 'react';
import { newId, type Take } from '@chatter/shared';
import { chooseRecorderMime, microphoneErrorMessage } from './microphone.js';
import { RecordingClock } from './take-audio.js';

export type RecorderPhase = 'OFF' | 'ASKING' | 'READY' | 'COUNTDOWN' | 'RECORDING' | 'PAUSED' | 'SAVING';
export interface CapturedTake { blob: Blob; duration: number; captureId: string; markers: NonNullable<Take['markers']> }

export function useBoothRecorder(onCapture: (capture: CapturedTake) => Promise<void>) {
  const [phase, setPhase] = useState<RecorderPhase>('OFF'); const phaseRef = useRef<RecorderPhase>('OFF');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]); const [deviceId, setDevice] = useState('');
  const [voiceMode, setVoiceMode] = useState(true); const [gainDb, setGainDb] = useState(0);
  const [level, setLevel] = useState(-60); const [peak, setPeak] = useState(-60); const [elapsed, setElapsed] = useState(0);
  const [countdown, setCountdown] = useState(0); const [error, setError] = useState(''); const [markers, setMarkers] = useState<NonNullable<Take['markers']>>([]);
  const stream = useRef<MediaStream>(); const context = useRef<AudioContext>(); const output = useRef<MediaStreamAudioDestinationNode>();
  const gain = useRef<GainNode>(); const recorder = useRef<MediaRecorder>(); const meterFrame = useRef<number>(); const timer = useRef<number>(); const countTimer = useRef<number>();
  const clock = useRef(new RecordingClock()); const markerRef = useRef<NonNullable<Take['markers']>>([]); const live = useRef(true); const request = useRef(0);
  const captureHandler = useRef(onCapture); captureHandler.current = onCapture;
  const apiAvailable = window.isSecureContext && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';
  function changePhase(value: RecorderPhase) { phaseRef.current = value; if (live.current) setPhase(value); }
  function release() {
    cancelAnimationFrame(meterFrame.current ?? 0); clearInterval(timer.current); clearInterval(countTimer.current);
    stream.current?.getTracks().forEach((track) => { track.onended = null; track.stop(); });
    output.current?.stream.getTracks().forEach((track) => track.stop());
    void context.current?.close().catch(() => undefined);
    stream.current = undefined; context.current = undefined; output.current = undefined; gain.current = undefined;
    if (live.current) setLevel(-60);
  }
  useEffect(() => { if (gain.current && context.current) gain.current.gain.setTargetAtTime(Math.pow(10, gainDb / 20), context.current.currentTime, 0.015); }, [gainDb]);
  useEffect(() => {
    live.current = true;
    const warn = (event: BeforeUnloadEvent) => { if (['RECORDING', 'PAUSED', 'SAVING'].includes(phaseRef.current)) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => {
      live.current = false; request.current++; window.removeEventListener('beforeunload', warn);
      if (recorder.current && recorder.current.state !== 'inactive') { clock.current.pause(performance.now()); recorder.current.stop(); }
      release();
    };
  }, []);

  async function checkMicrophone(): Promise<boolean> {
    if (['ASKING', 'COUNTDOWN', 'RECORDING', 'PAUSED', 'SAVING'].includes(phaseRef.current)) return false;
    setError('');
    if (!apiAvailable) { setError('Recording is unavailable in this window. Open Chatter normally, or import a recording.'); return false; }
    const policy = (document as Document & { permissionsPolicy?: { allowsFeature(name: string): boolean } }).permissionsPolicy;
    if (policy && !policy.allowsFeature('microphone')) { setError('This window cannot use the microphone. Open Chatter normally and allow microphone access.'); return false; }
    release(); changePhase('ASKING'); const token = ++request.current;
    let acquired: MediaStream | undefined;
    try {
      acquired = await navigator.mediaDevices.getUserMedia({ audio: { ...(deviceId ? { deviceId: { exact: deviceId } } : {}), channelCount: { ideal: 1 }, echoCancellation: { ideal: voiceMode }, noiseSuppression: { ideal: voiceMode }, autoGainControl: { ideal: false } } });
      if (!live.current || request.current !== token) { acquired.getTracks().forEach((track) => track.stop()); return false; }
      stream.current = acquired; const ctx = new AudioContext(); context.current = ctx;
      await ctx.resume();
      if (!live.current || request.current !== token) { acquired.getTracks().forEach((track) => track.stop()); if (context.current === ctx) release(); else void ctx.close().catch(() => undefined); return false; }
      const source = ctx.createMediaStreamSource(acquired); const inputGain = ctx.createGain(); inputGain.gain.value = Math.pow(10, gainDb / 20); gain.current = inputGain;
      const analyser = ctx.createAnalyser(); analyser.fftSize = 2048;
      const destination = ctx.createMediaStreamDestination(); output.current = destination;
      source.connect(inputGain); inputGain.connect(analyser); analyser.connect(destination);
      // No connection to speakers: a mic check must never create feedback.
      const samples = new Float32Array(analyser.fftSize); let held = -60; let last = 0;
      const meter = (now: number) => {
        if (!live.current || !context.current) return;
        if (now - last > 70) {
          analyser.getFloatTimeDomainData(samples); let max = 0;
          for (const sample of samples) max = Math.max(max, Math.abs(sample));
          const db = Math.max(-60, 20 * Math.log10(Math.max(max, 0.000001))); held = Math.max(db, held - 0.4);
          setLevel(db); setPeak(held); last = now;
        }
        meterFrame.current = requestAnimationFrame(meter);
      };
      meterFrame.current = requestAnimationFrame(meter);
      acquired.getAudioTracks().forEach((track) => { track.onended = () => {
        if (live.current) setError('The microphone disconnected. Any audio already captured is being saved. Reconnect it and check the input again.');
        if (recorder.current?.state !== 'inactive' && recorder.current) stop(); else { release(); changePhase('OFF'); }
      }; });
      try { const nextDevices = await navigator.mediaDevices.enumerateDevices(); if (live.current && request.current === token) setDevices(nextDevices.filter((item) => item.kind === 'audioinput')); } catch { /* The default input still works if enumeration is unavailable. */ }
      if (!live.current || request.current !== token) return false;
      changePhase('READY'); return true;
    } catch (failure) {
      acquired?.getTracks().forEach((track) => track.stop());
      if (request.current === token && live.current) { release(); changePhase('OFF'); setError(microphoneErrorMessage(failure, window.self !== window.top)); }
      return false;
    }
  }

  async function start(countIn: number) {
    if (!['OFF', 'READY'].includes(phaseRef.current)) return;
    setError('');
    if (phaseRef.current !== 'READY' && !await checkMicrophone()) return;
    const token = request.current; const handler = captureHandler.current;
    const begin = () => {
      if (!live.current || token !== request.current || !output.current) return;
      try {
        const mimeType = chooseRecorderMime((mime) => MediaRecorder.isTypeSupported(mime));
        const rec = new MediaRecorder(output.current.stream, mimeType ? { mimeType } : undefined); recorder.current = rec;
        const chunks: Blob[] = []; const captureId = newId(); markerRef.current = []; setMarkers([]);
        rec.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
        rec.onerror = () => { if (live.current) setError('The recorder encountered a problem. Saving any audio it captured.'); if (rec.state !== 'inactive') stop(); };
        rec.onstop = () => {
          clock.current.pause(performance.now()); const duration = clock.current.seconds(performance.now());
          const blob = new Blob(chunks, { type: rec.mimeType || chunks[0]?.type || 'audio/webm' });
          changePhase('SAVING'); release();
          void handler({ blob, duration, captureId, markers: [...markerRef.current] }).catch((failure) => { if (live.current) setError(failure instanceof Error ? failure.message : 'The take did not save. Retry from the recovery panel.'); }).finally(() => changePhase('OFF'));
        };
        rec.start(500); clock.current.start(performance.now()); setElapsed(0); changePhase('RECORDING');
        timer.current = window.setInterval(() => { const seconds = clock.current.seconds(performance.now()); if (live.current) setElapsed(seconds); if (seconds >= 15 * 60) stop(); }, 100);
      } catch (failure) { setError(failure instanceof Error ? failure.message : 'This browser could not start recording.'); release(); changePhase('OFF'); }
    };
    if (countIn > 0) {
      changePhase('COUNTDOWN'); setCountdown(countIn); let remaining = countIn;
      countTimer.current = window.setInterval(() => { remaining--; setCountdown(remaining); if (remaining <= 0) { clearInterval(countTimer.current); begin(); } }, 1000);
    } else begin();
  }
  function stop() {
    if (phaseRef.current === 'COUNTDOWN') { clearInterval(countTimer.current); changePhase('READY'); setCountdown(0); return; }
    const rec = recorder.current;
    if (rec && rec.state !== 'inactive') { clock.current.pause(performance.now()); clearInterval(timer.current); changePhase('SAVING'); rec.stop(); }
  }
  function pause() {
    if (recorder.current?.state === 'recording') { recorder.current.pause(); clock.current.pause(performance.now()); changePhase('PAUSED'); }
    else if (recorder.current?.state === 'paused') { recorder.current.resume(); clock.current.resume(performance.now()); changePhase('RECORDING'); }
  }
  function disable() {
    if (['RECORDING', 'PAUSED', 'SAVING'].includes(phaseRef.current)) return;
    request.current++; release(); changePhase('OFF');
  }
  function mark() {
    if (!['RECORDING', 'PAUSED'].includes(phaseRef.current)) return;
    markerRef.current = [...markerRef.current, { id: newId(), at: clock.current.seconds(performance.now()), label: `Pickup ${markerRef.current.length + 1}` }]; setMarkers(markerRef.current);
  }
  return { phase, devices, deviceId, setDevice: (value: string) => { disable(); setDevice(value); }, voiceMode, setVoiceMode: (value: boolean) => { disable(); setVoiceMode(value); }, gainDb, setGainDb, level, peak, elapsed, countdown, error, markers, apiAvailable, checkMicrophone, start, stop, pause, disable, mark };
}
