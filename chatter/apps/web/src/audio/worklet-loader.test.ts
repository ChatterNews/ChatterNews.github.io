import { describe, expect, test, vi } from 'vitest';
import { PerContextWorkletLoader, type WorkletContext } from './worklet-loader.js';

interface TestContext extends WorkletContext {
  readonly audioWorklet: { addModule: ReturnType<typeof vi.fn<(url: string) => Promise<void>>> };
}

function context(): TestContext {
  return { audioWorklet: { addModule: vi.fn(async (_url: string): Promise<void> => undefined) } };
}

describe('per-context worklet loading', () => {
  test('loads the processor in a new context even when shared engine code is ready', async () => {
    const loader = new PerContextWorkletLoader<TestContext>('processor.js');
    const first = context(); const second = context(); let shared = false;
    const bootstrap = vi.fn(async (target: TestContext) => { await target.audioWorklet.addModule('processor.js'); shared = true; return true; });

    expect(await loader.ensure(first, () => shared, bootstrap)).toBe(true);
    expect(await loader.ensure(second, () => shared, bootstrap)).toBe(true);
    expect(bootstrap).toHaveBeenCalledTimes(1);
    expect(first.audioWorklet.addModule).toHaveBeenCalledTimes(1);
    expect(second.audioWorklet.addModule).toHaveBeenCalledWith('processor.js');
  });

  test('serializes shared compilation while still registering every context', async () => {
    const loader = new PerContextWorkletLoader<TestContext>('processor.js');
    const first = context(); const second = context(); let shared = false;
    let release!: () => void; const paused = new Promise<void>((resolve) => { release = resolve; });
    const bootstrap = vi.fn(async (target: TestContext) => { await paused; await target.audioWorklet.addModule('processor.js'); shared = true; return true; });

    const a = loader.ensure(first, () => shared, bootstrap); const b = loader.ensure(second, () => shared, bootstrap);
    release();
    expect(await Promise.all([a, b])).toEqual([true, true]);
    expect(bootstrap).toHaveBeenCalledTimes(1);
    expect(first.audioWorklet.addModule).toHaveBeenCalledTimes(1);
    expect(second.audioWorklet.addModule).toHaveBeenCalledTimes(1);
  });

  test('allows a later retry after shared bootstrap fails', async () => {
    const loader = new PerContextWorkletLoader<TestContext>('processor.js');
    const target = context(); let shared = false; let attempts = 0;
    const bootstrap = vi.fn(async (item: TestContext) => { attempts += 1; if (attempts === 1) return false; await item.audioWorklet.addModule('processor.js'); shared = true; return true; });
    expect(await loader.ensure(target, () => shared, bootstrap)).toBe(false);
    expect(await loader.ensure(target, () => shared, bootstrap)).toBe(true);
    expect(bootstrap).toHaveBeenCalledTimes(2);
  });
});
