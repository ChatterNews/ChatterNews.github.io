import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { readReaderSelection, workspaceStorage, workspaceStoreName } from './workspace-context.js';
import { clearSavedSampleFolder, loadSavedSampleFolder, saveSampleFolder } from '../audio/sample-library.js';

const workspaceA = '11111111-1111-4111-8111-111111111111';
const workspaceB = '22222222-2222-4222-8222-222222222222';

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

function selectWorkspace(workspaceId = workspaceA, releaseId = 'pilot-1') {
  window.sessionStorage.setItem('orbit-reader-current', JSON.stringify({ workspaceId, releaseId }));
}

beforeEach(() => {
  vi.stubGlobal('window', {
    localStorage: memoryStorage(),
    sessionStorage: memoryStorage(),
    location: { pathname: '/orbit-reader/r/pilot-1/studio' },
  });
  vi.stubEnv('VITE_ORBIT_READER', 'true');
  vi.stubEnv('BASE_URL', '/orbit-reader/r/pilot-1/');
  vi.stubEnv('VITE_READER_BASE', '/orbit-reader/');
});

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('USB workspace context', () => {
  test('normal app keeps its existing storage and database without reading a USB selection', () => {
    vi.stubEnv('VITE_ORBIT_READER', 'false');
    window.sessionStorage.setItem('orbit-reader-current', 'broken JSON');
    expect(readReaderSelection()).toBeUndefined();
    expect(workspaceStorage(window.localStorage)).toBe(window.localStorage);
    expect(workspaceStoreName('chatter')).toBe('chatter');
    expect(workspaceStoreName('chatter-demo')).toBe('chatter-demo');
  });

  test('binds a workspace to the current release and gives live and demo separate databases', () => {
    selectWorkspace();
    expect(readReaderSelection()).toEqual({ workspaceId: workspaceA, releaseId: 'pilot-1' });
    expect(workspaceStoreName('chatter')).toBe(`orbit:${workspaceA}:chatter`);
    expect(workspaceStoreName('chatter-demo')).toBe(`orbit:${workspaceA}:chatter-demo`);
  });

  test('isolates reads, enumeration, removal and clear while preserving device identity and other workspaces', () => {
    const deviceStorage = window.localStorage;
    deviceStorage.setItem('chatter.deviceId', 'same-physical-device');
    selectWorkspace();
    const a = workspaceStorage(deviceStorage);
    a.setItem('badge', 'student-a');
    a.setItem('return', '/studio');
    selectWorkspace(workspaceB);
    const b = workspaceStorage(deviceStorage);
    expect(b.getItem('badge')).toBeNull();
    b.setItem('badge', 'student-b');
    expect(a.getItem('badge')).toBe('student-a');
    expect(b.length).toBe(1);
    expect(b.key(0)).toBe('badge');
    expect(b.key(1)).toBeNull();
    a.removeItem('return');
    expect(a.length).toBe(1);
    a.clear();
    expect(a.length).toBe(0);
    expect(b.getItem('badge')).toBe('student-b');
    expect(deviceStorage.getItem('chatter.deviceId')).toBe('same-physical-device');
  });

  test('Studio cannot reopen another USB workspace’s linked sample folder', async () => {
    selectWorkspace();
    await saveSampleFolder({ kind: 'directory', name: 'Student A sounds' } as FileSystemDirectoryHandle);
    selectWorkspace(workspaceB);
    expect(await loadSavedSampleFolder()).toBeUndefined();
    await saveSampleFolder({ kind: 'directory', name: 'Student B sounds' } as FileSystemDirectoryHandle);
    selectWorkspace();
    expect((await loadSavedSampleFolder())?.name).toBe('Student A sounds');
    await clearSavedSampleFolder();
    selectWorkspace(workspaceB);
    expect((await loadSavedSampleFolder())?.name).toBe('Student B sounds');
    await clearSavedSampleFolder();
  });

  test.each([
    null,
    'broken JSON',
    'null',
    JSON.stringify({ workspaceId: '../other-work', releaseId: 'pilot-1' }),
    JSON.stringify({ workspaceId: workspaceA, releaseId: 'other-release' }),
    JSON.stringify({ workspaceId: workspaceA, releaseId: '../pilot-1' }),
  ])('refuses invalid or mismatched reader selections instead of opening the normal database: %s', (selection) => {
    if (selection !== null) window.sessionStorage.setItem('orbit-reader-current', selection);
    expect(() => readReaderSelection()).toThrow(/reader|USB/i);
    expect(() => workspaceStoreName('chatter')).toThrow();
  });

  test('refuses a reader build outside its versioned release path', () => {
    selectWorkspace();
    window.location.pathname = '/orbit-reader/r/pilot-10/';
    expect(() => readReaderSelection()).toThrow();
    window.location.pathname = '/orbit-reader/r/pilot-1/';
    vi.stubEnv('BASE_URL', '/');
    expect(() => readReaderSelection()).toThrow();
  });
});
