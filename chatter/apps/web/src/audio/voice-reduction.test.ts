import { expect, test } from 'vitest';
import { quieterMicCurves } from './voice-reduction.js';
test('keeps each nearby voice and lowers bleed when the other speaker takes over', () => {
  const a = Float32Array.from({ length: 200 }, (_, i) => i < 100 ? .3 : .02);
  const b = Float32Array.from({ length: 200 }, (_, i) => i < 100 ? .01 : .1);
  const curves = quieterMicCurves([{ id: 'a', levels: a }, { id: 'b', levels: b }]);
  expect(curves.get('a')![80]).toBeGreaterThan(.98); expect(curves.get('b')![80]).toBeLessThan(.4);
  expect(curves.get('b')![180]).toBeGreaterThan(.98); expect(curves.get('a')![180]).toBeLessThan(.4);
});
test('preserves competing similar-level voices, including different mic gains', () => {
  const curves = quieterMicCurves([{ id: 'a', levels: new Float32Array(100).fill(.2) }, { id: 'b', levels: new Float32Array(100).fill(.02) }]);
  for (const curve of curves.values()) expect(Math.min(...curve)).toBe(1);
});
test('is bounded, finite and gradual during silence and transitions; never processes a single mic', () => {
  expect(quieterMicCurves([{ id: 'a', levels: new Float32Array(100) }]).size).toBe(0);
  const curves = quieterMicCurves([{ id: 'a', levels: new Float32Array(100) }, { id: 'b', levels: new Float32Array(100).fill(NaN) }]);
  for (const curve of curves.values()) for (let i = 0; i < curve.length; i++) {
    expect(curve[i]).toBeGreaterThanOrEqual(Math.pow(10, -9 / 20) - .00001); expect(curve[i]).toBeLessThanOrEqual(1);
    if (i) expect(Math.abs(curve[i]! - curve[i - 1]!)).toBeLessThan(.11);
  }
});
