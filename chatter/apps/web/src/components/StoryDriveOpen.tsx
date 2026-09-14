import { useRef, useState } from 'react';
import type { Gate, Store } from '@chatter/shared';
import { importPortableStory } from '../portable/portable-project.js';

export type StoryDriveResult = Awaited<ReturnType<typeof importPortableStory>>;
export type StoryDriveOutcome =
  | { status: 'OPENED'; result: StoryDriveResult; message: string }
  | { status: 'CANCELLED'; message: string }
  | { status: 'ERROR'; message: string };

export async function openStoryDriveFile(
  store: Store,
  gate: Gate,
  file: File | undefined,
): Promise<StoryDriveOutcome> {
  if (!file) return { status: 'CANCELLED', message: 'No story was opened.' };
  try {
    const result = await importPortableStory(store, gate, file);
    return {
      status: 'OPENED',
      result,
      message: `${result.updated ? 'Updated' : 'Opened'} “${result.story.title}” with ${result.mediaCount} media file${result.mediaCount === 1 ? '' : 's'}.`,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : '';
    const safe = /Chatter story file|larger than|missing|too many media/i.test(detail)
      ? detail
      : 'That story file did not open. Choose it again to retry.';
    return { status: 'ERROR', message: safe };
  }
}

export function StoryDriveOpen({
  store, gate, label = 'Open a Story Drive', className, disabled = false, onOpened, onMessage, onBusyChange,
}: {
  store: Store;
  gate: Gate;
  label?: string;
  className?: string;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
  onOpened: (result: StoryDriveResult) => void;
  onMessage?: (message: { text: string; error: boolean }) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function open(file: File | undefined) {
    if (busy) return;
    setBusy(true); onBusyChange?.(true);
    const outcome = await openStoryDriveFile(store, gate, file);
    if (input.current) input.current.value = '';
    setBusy(false); onBusyChange?.(false);
    if (outcome.status === 'OPENED') {
      onMessage?.({ text: outcome.message, error: false });
      onOpened(outcome.result);
    } else if (outcome.status === 'ERROR') {
      onMessage?.({ text: outcome.message, error: true });
    }
  }

  return <>
    <button
      type="button"
      className={className}
      disabled={disabled || busy}
      onClick={() => input.current?.click()}
    >{busy ? 'Opening story…' : label}</button>
    <input
      ref={input}
      hidden
      type="file"
      accept={import.meta.env.VITE_ORBIT_MOBILE === 'true' ? undefined : '.chatter,application/zip'}
      onChange={(event) => void open(event.target.files?.[0])}
    />
  </>;
}
