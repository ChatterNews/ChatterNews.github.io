import { createElement, Suspense } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { lazyNamed } from './room-loaders.js';

describe('room code splitting', () => {
  test('does not request a room module until React renders that room', () => {
    let loads = 0;
    const LazyRoom = lazyNamed(async () => {
      loads += 1;
      return { Room: () => createElement('p', {}, 'Loaded room') };
    }, 'Room');

    expect(loads).toBe(0);
    renderToString(createElement(Suspense, { fallback: createElement('p', {}, 'Opening') }, createElement(LazyRoom)));
    expect(loads).toBe(1);
  });
});
