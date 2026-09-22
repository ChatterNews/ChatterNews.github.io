import { describe, it, expect } from 'vitest';
import { makeSoundProject, validateSoundProject, validateSoundAttribution, emptySoundAttribution, soundSourceAssetIds } from './sound.js';
import { MemoryStore } from './store-memory.js';

describe('sound documents', () => {
  it('bounds projects and source URLs before persistence', () => {
    const project = makeSoundProject('Hallway'); expect(() => validateSoundProject(project)).not.toThrow();
    expect(() => validateSoundProject({ ...project, exportEnd: 301 })).toThrow();
    expect(() => validateSoundProject({ ...project, credits: 'x'.repeat(10001) })).toThrow();
    expect(() => validateSoundAttribution({ ...emptySoundAttribution(), sourceUrl: 'javascript:alert(1)' })).toThrow();
    expect(() => validateSoundAttribution({ ...emptySoundAttribution(), sourceUrl: 'https://user:secret@example.com' })).toThrow();
    expect(soundSourceAssetIds(project)).toEqual([]);
  });
  it('detects concurrent project edits without losing the winner', async () => {
    const store = new MemoryStore(); const p = makeSoundProject('Cue');
    const initial = await store.soundProjects.save(p, 0);
    const results = await Promise.allSettled([store.soundProjects.save({ ...initial, name: 'A' }, 1), store.soundProjects.save({ ...initial, name: 'B' }, 1)]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect((await store.soundProjects.get(p.id))?.revision).toBe(2);
  });
});
