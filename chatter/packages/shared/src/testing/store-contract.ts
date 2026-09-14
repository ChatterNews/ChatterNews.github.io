/**
 * The Store contract, as executable tests.
 *
 * Every Store implementation runs this same suite. If the browser store and
 * the memory store both pass it, room code genuinely cannot tell which one is
 * running - which is the property that lets Tier 1 sync slot underneath
 * without touching a single room. SPEC S11 step 1.
 */
import { describe, expect, test, beforeEach } from 'vitest';
import type { Store } from '../store.js';

export function testStoreContract(name: string, makeStore: () => Promise<Store>): void {
  describe(`Store contract: ${name}`, () => {
    let store: Store;
    beforeEach(async () => { store = await makeStore(); });

    test('a new story gets an id, a slug and a PITCH status', async () => {
      const story = await store.stories.create({ title: 'The taco bar is back' });
      expect(story.id).toBeTruthy();
      expect(story.slug).toBe('THE-TACO-BAR-IS-BACK');
      expect(story.status).toBe('PITCH');
    });

    test('slugs are unique even when two stories share a title', async () => {
      const a = await store.stories.create({ title: 'Taco bar' });
      const b = await store.stories.create({ title: 'Taco bar' });
      expect(a.slug).not.toBe(b.slug);
    });

    test('readTimeSec is derived on write, never typed in by hand', async () => {
      const story = await store.stories.create({
        title: 'Taco bar',
        body: { type: 'doc', content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'one two three four five six' }] },
        ] },
      });
      expect(story.readTimeSec).toBe(2);
    });

    test('an update recomputes readTimeSec', async () => {
      const story = await store.stories.create({ title: 'Taco bar' });
      const updated = await store.stories.update(story.id, {
        body: { type: 'doc', content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'a '.repeat(150).trim() }] },
        ] },
      });
      expect(updated.readTimeSec).toBe(60);
    });

    test('a story can be found by its slug', async () => {
      await store.stories.create({ title: 'Taco bar' });
      expect((await store.stories.bySlug('TACO-BAR'))!.title).toBe('Taco bar');
    });

    test('a story survives being written and read back', async () => {
      const story = await store.stories.create({ title: 'Taco bar' });
      expect((await store.stories.get(story.id))!.title).toBe('Taco bar');
    });

    test('every write appends to the append-only log', async () => {
      await store.stories.create({ title: 'Taco bar' });
      const events = await store.events.all();
      expect(events.some((e) => e.action === 'stories.create' || e.action === 'story.create')).toBe(true);
    });

    test('the lamport counter advances with every write', async () => {
      await store.stories.create({ title: 'One' });
      await store.stories.create({ title: 'Two' });
      const events = await store.events.all();
      expect(events.at(-1)!.lamport).toBeGreaterThan(events[0]!.lamport);
    });

    test('the log is returned in lamport order', async () => {
      await store.stories.create({ title: 'One' });
      await store.stories.create({ title: 'Two' });
      const lamports = (await store.events.all()).map((e) => e.lamport);
      expect([...lamports].sort((a, b) => a - b)).toEqual(lamports);
    });

    test('this log IS the audit log the Gate requires', async () => {
      await store.events.append({ action: 'gate.reject', target: 'sha256:abc', payload: { score: 0.9 } });
      expect((await store.events.all()).at(-1)!.action).toBe('gate.reject');
    });

    test('blobs are content-addressed: same bytes, same name', async () => {
      const bytes = new TextEncoder().encode('hello');
      expect(await store.blobs.put(bytes)).toBe(await store.blobs.put(bytes));
    });

    test('blob bytes come back out unchanged', async () => {
      const bytes = new TextEncoder().encode('hello');
      const hash = await store.blobs.put(bytes);
      expect(new TextDecoder().decode((await store.blobs.get(hash))!)).toBe('hello');
    });

    test('a missing hash is absent, not an error', async () => {
      expect(await store.blobs.get('sha256:0000')).toBeUndefined();
    });

    test('a removed blob is gone', async () => {
      const hash = await store.blobs.put(new TextEncoder().encode('bye'));
      await store.blobs.remove(hash);
      expect(await store.blobs.has(hash)).toBe(false);
    });

    test('the device id is stable, because merges tiebreak on it', async () => {
      expect(store.deviceId).toBeTruthy();
      expect(store.deviceId).toBe(store.deviceId);
    });

    test('settings start empty, so callers fall back to the defaults', async () => {
      expect(await store.settings.get()).toEqual({});
    });

    test('settings merge rather than replace, and survive a re-read', async () => {
      await store.settings.save({ takeRetentionDays: 30 });
      await store.settings.save({ showName: 'The Chatterbox' });

      expect(await store.settings.get()).toEqual({
        takeRetentionDays: 30, showName: 'The Chatterbox',
      });
    });
  });
}
