import { describe, expect, test } from 'vitest';
import { enterDemoDesk, leaveDemoDesk, readDeskMode, storeNameForDesk } from './desk-mode.js';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear() { values.clear(); },
    getItem(key) { return values.get(key) ?? null; },
    key(index) { return [...values.keys()][index] ?? null; },
    removeItem(key) { values.delete(key); },
    setItem(key, value) { values.set(key, value); },
  };
}

describe('demo desk isolation', () => {
  test('uses a separate newsroom store until the demo desk is left', () => {
    const storage = memoryStorage();

    expect(readDeskMode(storage)).toBe('LIVE');
    expect(storeNameForDesk(readDeskMode(storage))).toBe('chatter');
    enterDemoDesk(storage);
    expect(readDeskMode(storage)).toBe('DEMO');
    expect(storeNameForDesk(readDeskMode(storage))).toBe('chatter-demo');
    leaveDemoDesk(storage);
    expect(readDeskMode(storage)).toBe('LIVE');
  });

  test('treats malformed session values as the live newsroom', () => {
    const storage = memoryStorage();
    storage.setItem('chatter.deskMode.v1', 'NOT-A-DESK');
    expect(readDeskMode(storage)).toBe('LIVE');
  });
});
