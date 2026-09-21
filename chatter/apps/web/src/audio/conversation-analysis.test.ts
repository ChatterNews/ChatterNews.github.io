import { expect, test, vi } from 'vitest';
import { createPodcastProject, createPodcastShow, makePodcastClip, MemoryStore } from '@chatter/shared';
import { alignmentPositions, analyzeConversation, type ClipMatch } from './conversation-analysis.js';
const ready = (clipId: string, offsetSec: number): ClipMatch => ({ clipId, offsetSec, status: 'READY', driftSec: 0, anchors: [], confidence: .9, reason: '' });
function fixture() {
  const project = createPodcastProject(createPodcastShow({ title: 'Show' }), {});
  project.clips = ['ref', 'early', 'uncertain'].map(id => ({ ...makePodcastClip({ assetId: id, trackId: 'voice', name: id, durationSec: 60 }), id }));
  return project;
}
test('accounts for trims and moves only reference and confident matches out of negative time', () => {
  const project = fixture(); project.clips[0]!.trimInSec = 2; project.clips[1]!.trimInSec = 1;
  const positions = alignmentPositions(project, 'ref', [ready('early', -3), { ...ready('uncertain', 7), status: 'CHECK' }]);
  expect(positions.get('ref')).toBe(4); expect(positions.get('early')).toBe(0); expect(positions.has('uncertain')).toBe(false);
  expect(project.clips.every(c => c.startSec === 0)).toBe(true);
});
test('rejects cut-up, non-overlapping, missing, or empty applications', () => {
  const project = fixture();
  expect(() => alignmentPositions(project, 'ref', [])).toThrow(/No confident/);
  expect(() => alignmentPositions(project, 'ref', [ready('early', 100)])).toThrow(/restore/);
  project.clips[1]!.omittedRanges = [{ start: 5, end: 6 }];
  expect(() => alignmentPositions(project, 'ref', [ready('early', 0)])).toThrow(/changed/);
});
test('analysis checks approval inside its operation before decoding any original', async () => {
  const terminate = vi.fn(); vi.stubGlobal('Worker', class { terminate = terminate; });
  const store = new MemoryStore(); await store.open();
  try {
    await expect(analyzeConversation(store, fixture().clips[0]!, fixture().clips, new AbortController().signal, () => {})).rejects.toThrow(/approve/);
    expect(terminate).toHaveBeenCalled();
  } finally { vi.unstubAllGlobals(); }
});
test('a cancelled analysis never reads source data and terminates its worker', async () => {
  const terminate = vi.fn(); vi.stubGlobal('Worker', class { terminate = terminate; });
  const store = new MemoryStore(); await store.open(); const read = vi.spyOn(store.assets, 'get');
  const controller = new AbortController(); controller.abort();
  try {
    await expect(analyzeConversation(store, fixture().clips[0]!, fixture().clips, controller.signal, () => {})).rejects.toMatchObject({ name: 'AbortError' });
    expect(read).not.toHaveBeenCalled(); expect(terminate).toHaveBeenCalled();
  } finally { vi.unstubAllGlobals(); }
});
