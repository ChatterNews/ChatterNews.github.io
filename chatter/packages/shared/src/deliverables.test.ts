import { describe, expect, it } from 'vitest';
import { MemoryStore } from './store-memory.js';
import { deliverableBytes, saveDeliverable } from './deliverables.js';

describe('deliverables', () => {
  it('keeps tangible file bytes and production metadata together', async () => {
    const store = new MemoryStore(); await store.open();
    const file = await saveDeliverable(store, { bytes: new TextEncoder().encode('school news'), title: 'Morning script', fileName: 'morning-script.txt', kind: 'DOCUMENT', room: 'DESK', stage: 'REVIEW', mime: 'text/plain', storyId: 'story-1', authorId: 'student-1' });
    expect(file).toMatchObject({ title: 'Morning script', kind: 'DOCUMENT', room: 'DESK', stage: 'REVIEW', bytes: 11, storyId: 'story-1' });
    expect(new TextDecoder().decode(await deliverableBytes(store, file))).toBe('school news');
  });

  it('refreshes an identical export instead of filling the bin with duplicates', async () => {
    const store = new MemoryStore(); await store.open(); const bytes = new Uint8Array([1, 2, 3]);
    const first = await saveDeliverable(store, { bytes, title: 'Mix', fileName: 'mix.wav', kind: 'AUDIO', room: 'GARAGE', mime: 'audio/wav', storyId: 'story-1' });
    const again = await saveDeliverable(store, { bytes, title: 'Mix final', fileName: 'mix.wav', kind: 'AUDIO', room: 'GARAGE', mime: 'audio/wav', storyId: 'story-1', stage: 'FINAL' });
    expect(again.id).toBe(first.id);
    expect(await store.deliverables.list()).toHaveLength(1);
    expect(again).toMatchObject({ title: 'Mix final', stage: 'FINAL' });
  });
});
