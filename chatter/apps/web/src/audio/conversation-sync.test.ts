import { expect, test } from 'vitest';
import { matchConversation, speechFeatures, type SpeechFeatures } from './conversation-sync.js';
function signal(seconds = 80, seed = 42): SpeechFeatures {
  let state = seed; const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  const frames = new Float32Array(seconds * 50); let level = 0;
  for (let i = 0; i < frames.length; i++) { if (i % 7 === 0) level = random() - .5; frames[i] = level + .1 * (random() - .5); }
  return { frames, hz: 50 };
}
test('finds a late-starting phone despite a different gain and background noise', () => {
  const ref = signal(), noise = signal(60, 8);
  const source = { hz: 50, frames: ref.frames.slice(125, 3125).map((x, i) => x * .25 + noise.frames[i]! * .025) };
  const result = matchConversation(ref, source);
  expect(result.status).toBe('READY'); expect(result.offsetSec).toBeCloseTo(2.5, 2); expect(result.anchors.length).toBeGreaterThanOrEqual(3);
});
test('supports a phone that started before the reference and only partly overlaps', () => {
  const original = signal(100), ref = { hz: 50, frames: original.frames.slice(750) };
  const result = matchConversation(ref, original);
  expect(result.status).toBe('READY'); expect(result.offsetSec).toBeCloseTo(-15, 2);
});
test('silence, short clips and unrelated conversations never become confident matches', () => {
  const ref = signal();
  expect(matchConversation(ref, { hz: 50, frames: new Float32Array(2000) }).status).toBe('CHECK');
  expect(matchConversation(ref, signal(8)).status).toBe('CHECK');
  expect(matchConversation(ref, signal(60, 71)).status).toBe('CHECK');
});
test('a repeated pattern is ambiguous even when correlation is perfect', () => {
  const frames = Float32Array.from({ length: 4000 }, (_, i) => Math.sin(i / 50 * Math.PI * 2));
  expect(matchConversation({ frames, hz: 50 }, { frames: frames.slice(0, 3000), hz: 50 }).status).toBe('CHECK');
});
test('detects clock drift and refuses a misleading offset-only correction', () => {
  const ref = signal(180), source = { hz: 50, frames: Float32Array.from({ length: 7500 }, (_, i) => ref.frames[Math.floor(i * 1.003 + 100)]!) };
  const match = matchConversation(ref, source);
  expect(match.status).toBe('CHECK'); expect(Math.abs(match.driftSec)).toBeGreaterThan(.08); expect(match.reason).toMatch(/drift/);
});
test('a paused or spliced recording is not automatically shifted', () => {
  const ref = signal(100), frames = ref.frames.slice(100, 4100);
  frames.set(ref.frames.slice(2300, 4300), 2000);
  expect(matchConversation(ref, { hz: 50, frames }).status).toBe('CHECK');
});
test('real PCM features tolerate stereo polarity, gain and a different noise floor', () => {
  const sr = 8000, envelope = signal(70).frames;
  const pcm = Float32Array.from({ length: sr * 70 }, (_, i) => (.15 + Math.abs(envelope[Math.floor(i / 160)]!)) * Math.sin(i * 2 * Math.PI * 330 / sr));
  const target = pcm.slice(2 * sr, 62 * sr).map((x, i) => x * .3 + .002 * Math.sin(i * 1.743));
  const ref = speechFeatures([pcm, pcm.map(x => -x)], sr), source = speechFeatures([target], sr);
  expect(matchConversation(ref, source)).toMatchObject({ status: 'READY', offsetSec: 2 });
});
