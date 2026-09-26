import { describe, expect, it } from 'vitest';
import {
  createReilySeenMemory,
  initialReilyHintOpen,
  initialReilyParked,
  reduceReilyHint,
  reduceReilyPocket,
  readReilyPocket,
  reilySeenKey,
  writeReilyPocket,
} from './reily-session.js';

describe('Reily hint session', () => {
  it('starts closed even on the first visit', () => {
    expect(initialReilyHintOpen(null)).toBe(false);
    expect(initialReilyHintOpen('seen')).toBe(false);
  });

  it('leaves the workspace clear on a phone, with help still available on request', () => {
    expect(initialReilyHintOpen(null, true)).toBe(false);
    expect(reduceReilyHint(initialReilyHintOpen(null, true), 'ASK')).toBe(true);
  });

  it('keeps a dismissed hint closed when the room changes', () => {
    const dismissed = reduceReilyHint(true, 'DISMISS');
    expect(reduceReilyHint(dismissed, 'ROOM_CHANGED')).toBe(false);
  });

  it('opens the hint again only when Reily is asked', () => {
    expect(reduceReilyHint(false, 'ASK')).toBe(true);
  });
});

it('toggles help with repeated character clicks', () => {
  const opened = reduceReilyHint(false, 'TOGGLE');
  expect(opened).toBe(true);
  expect(reduceReilyHint(opened, 'TOGGLE')).toBe(false);
});

describe('Reily pocket', () => {
  it('remembers when Reily was parked on this computer', () => {
    expect(initialReilyParked(null)).toBe(false);
    expect(initialReilyParked('parked')).toBe(true);
  });

  it('stays parked through room changes until the portrait is opened', () => {
    const parked = reduceReilyPocket(false, 'PARK');
    expect(reduceReilyPocket(parked, 'ROOM_CHANGED')).toBe(true);
    expect(reduceReilyPocket(parked, 'RETURN')).toBe(false);
  });

  it('keeps pocket storage behind the session boundary and tolerates blocked storage', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    };
    writeReilyPocket(true, storage);
    expect(readReilyPocket(storage)).toBe(true);
    writeReilyPocket(false, storage);
    expect(readReilyPocket(storage)).toBe(false);
    expect(readReilyPocket({ getItem: () => { throw new Error('blocked'); } })).toBe(false);
  });
});

describe('Reily seen-card memory', () => {
  it('namespaces advice by active badge', () => {
    expect(reilySeenKey('student-7')).toBe('chatter.reily.seen.student-7');
  });

  it('persists unique card ids', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    };
    const memory = createReilySeenMemory('student-7', storage);

    memory.mark('booth-room-01');
    memory.mark('booth-room-01');

    expect(memory.read()).toEqual(['booth-room-01']);
    expect(JSON.parse(values.get(reilySeenKey('student-7'))!)).toEqual(['booth-room-01']);
  });

  it('falls back to memory when storage throws', () => {
    const storage = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
    };
    const memory = createReilySeenMemory('student-7', storage);

    memory.mark('booth-room-01');

    expect(memory.read()).toEqual(['booth-room-01']);
  });

  it('sanitizes corrupt values and caps history', () => {
    const storage = {
      getItem: () => JSON.stringify(['', 'one', 2, 'one', ...Array.from({ length: 510 }, (_, index) => `card-${index}`)]),
      setItem: () => undefined,
    };
    const memory = createReilySeenMemory('student-7', storage);

    expect(memory.read()).toHaveLength(500);
    expect(memory.read()[0]).toBe('card-10');
    expect(memory.read().at(-1)).toBe('card-509');
  });
});
