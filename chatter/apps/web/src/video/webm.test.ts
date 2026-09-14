/**
 * The muxer is the difference between "we encoded bytes" and "a phone will
 * play this". These tests read the actual container back, because a .webm
 * extension on raw VP9 chunks is exactly the lie this replaces.
 */
import { describe, expect, test } from 'vitest';
import { WebmWriter, EBML_MAGIC } from './webm.js';

const frame = (type: 'key' | 'delta', timestamp: number, data: number[]) => ({
  data: new Uint8Array(data), type, timestamp,
});

function find(haystack: Uint8Array, needle: Uint8Array | string): number {
  const bytes = typeof needle === 'string'
    ? new TextEncoder().encode(needle)
    : needle;
  outer: for (let i = 0; i <= haystack.length - bytes.length; i++) {
    for (let j = 0; j < bytes.length; j++) if (haystack[i + j] !== bytes[j]) continue outer;
    return i;
  }
  return -1;
}

const options = { width: 1080, height: 1920, frameRate: 30 };

describe('the WebM container', () => {
  test('starts with the EBML header every player looks for', () => {
    const writer = new WebmWriter(options);
    writer.addFrame(frame('key', 0, [1, 2, 3, 4]));
    const file = writer.finish();
    expect([...file.slice(0, 4)]).toEqual([...EBML_MAGIC]);
  });

  test('declares itself a webm file, not just any EBML document', () => {
    const writer = new WebmWriter(options);
    writer.addFrame(frame('key', 0, [1, 2, 3, 4]));
    expect(find(writer.finish(), 'webm')).toBeGreaterThan(0);
  });

  test('names the video codec in a track entry', () => {
    const writer = new WebmWriter(options);
    writer.addFrame(frame('key', 0, [9, 9, 9]));
    expect(find(writer.finish(), 'V_VP9')).toBeGreaterThan(0);
  });

  test('carries the encoded frames themselves, not only a header', () => {
    const writer = new WebmWriter(options);
    const payload = [0x41, 0x42, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48];
    writer.addFrame(frame('key', 0, payload));
    expect(find(writer.finish(), new Uint8Array(payload))).toBeGreaterThan(0);
  });

  test('grows with the number of frames it was given', () => {
    const one = new WebmWriter(options);
    one.addFrame(frame('key', 0, [1, 2, 3, 4]));

    const many = new WebmWriter(options);
    many.addFrame(frame('key', 0, [1, 2, 3, 4]));
    for (let i = 1; i < 30; i++) many.addFrame(frame('delta', i * 33_333, [5, 6, 7, 8, 9]));

    expect(many.finish().byteLength).toBeGreaterThan(one.finish().byteLength);
  });

  test('refuses to be finished twice, rather than writing a broken file', () => {
    const writer = new WebmWriter(options);
    writer.addFrame(frame('key', 0, [1, 2, 3, 4]));
    writer.finish();
    expect(() => writer.finish()).toThrow();
  });

  test('refuses a frame after it has been finished', () => {
    const writer = new WebmWriter(options);
    writer.addFrame(frame('key', 0, [1, 2, 3, 4]));
    writer.finish();
    expect(() => writer.addFrame(frame('delta', 33_333, [5, 6]))).toThrow();
  });
});
