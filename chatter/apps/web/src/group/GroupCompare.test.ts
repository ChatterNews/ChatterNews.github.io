// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GroupRevision } from '@chatter/shared';
import { GroupCompare, type GroupCompareProps } from './GroupCompare.js';

const revision = (id: string, patch: Partial<GroupRevision> = {}): GroupRevision => ({
  id, contributionId: `piece-${id}`, authorId: `author-${id}`, authorName: 'Sam',
  title: 'Our lunchroom', storyTitle: 'Lunch', groupCode: '0000-0000-0000', kind: 'piece',
  snapshotHash: `sha256:${'a'.repeat(64)}`, contentHash: `sha256:${'b'.repeat(64)}`,
  createdAt: 1, updatedAt: 1,
  body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: `Perspective ${id} has different words.` }] }] },
  ...patch,
});

describe('GroupCompare', () => {
  let host: HTMLDivElement;
  let root: Root;
  const insert = vi.fn();
  const open = vi.fn();
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
    insert.mockClear(); open.mockClear();
  });
  afterEach(async () => {
    await act(async () => root.unmount()); host.remove();
    window.getSelection()?.removeAllRanges(); vi.unstubAllGlobals();
  });
  const mount = async (revisions: GroupRevision[], props: Partial<GroupCompareProps> = {}) => {
    await act(async () => root.render(createElement(GroupCompare, { revisions, onInsert: insert, onOpen: open, ...props })));
  };
  const click = async (element: Element) => { await act(async () => (element as HTMLElement).click()); };
  const button = (text: string, within: Element = host) => Array.from(within.querySelectorAll('button')).find(item => item.textContent === text)!;
  const select = async (start: Node, startOffset: number, end: Node, endOffset: number) => {
    await act(async () => {
      const range = document.createRange(); range.setStart(start, startOffset); range.setEnd(end, endOffset);
      const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
    });
  };

  it('opens all four same-name contributions without collapsing their identities', async () => {
    const revisions = ['one', 'two', 'three', 'four'].map(id => revision(id));
    await mount(revisions);
    expect(host.querySelectorAll('article')).toHaveLength(4);
    expect(host.querySelectorAll('.group-compare-choice input:checked')).toHaveLength(4);
    expect(host.textContent).toContain('4 of 4 pieces open');
    expect(host.querySelector('details')?.open).toBe(false);
    for (const item of revisions) expect(host.querySelector(`[data-revision-id="${item.id}"]`)?.textContent).toContain(`Perspective ${item.id}`);
    await click(host.querySelector('summary')!);
    expect(host.querySelector('details')?.open).toBe(true);
    await click(host.querySelector('.group-compare-choice input')!);
    expect(host.querySelectorAll('article')).toHaveLength(3);
    await click(button('Clear selection'));
    expect(host.querySelectorAll('article')).toHaveLength(0);
    await click(button('Open all pieces'));
    expect(host.querySelectorAll('article')).toHaveLength(4);
    await click(button('Add whole writing', host.querySelector('[data-revision-id="two"]')!));
    expect(insert).toHaveBeenCalledWith(revisions[1]);
    await click(button('Open editable copy', host.querySelector('[data-revision-id="four"]')!));
    expect(open).toHaveBeenCalledWith(revisions[3]);
  });

  it('shows descendant revisions by default regardless of clocks, with all history recoverable', async () => {
    const original = revision('first', { createdAt: 900 });
    const next = revision('second', { contributionId: original.contributionId, parentRevisionId: original.id, createdAt: 100 });
    await mount([original, next]);
    expect(host.querySelectorAll('article')).toHaveLength(1);
    expect(host.querySelector('article')?.getAttribute('data-revision-id')).toBe('second');
    await click(host.querySelector('summary')!);
    await click(host.querySelector('.group-compare-tools input')!);
    expect(host.querySelectorAll('article')).toHaveLength(2);
    expect(host.querySelector('[data-revision-id="first"]')?.textContent).toContain('Earlier version');
    await click(host.querySelector('.group-compare-tools input')!);
    expect(host.querySelectorAll('article')).toHaveLength(1);
  });

  it('keeps divergent versions available together without selecting a timestamp winner', async () => {
    const first = revision('first');
    await mount([first, revision('left', { contributionId: first.contributionId, parentRevisionId: first.id }), revision('right', { contributionId: first.contributionId, parentRevisionId: first.id })]);
    expect(host.querySelectorAll('article')).toHaveLength(2);
    expect(host.textContent).toContain('two versions to compare');
    expect(host.querySelector('[data-revision-id="first"]')).toBeNull();
  });

  it('inserts selected words only when the entire selection belongs to that source writing', async () => {
    const first = revision('one'); const second = revision('two');
    await mount([first, second]);
    const cards = host.querySelectorAll('article');
    const firstText = cards[0]!.querySelector('.group-compare-text')!.firstChild!;
    const secondText = cards[1]!.querySelector('.group-compare-text')!.firstChild!;
    await select(firstText, 0, firstText, 15);
    expect(button('Add selected words', cards[0]!).disabled).toBe(false);
    expect(button('Add selected words', cards[1]!).disabled).toBe(true);
    await click(button('Add selected words', cards[0]!));
    expect(insert).toHaveBeenCalledWith(first, 'Perspective one');
    insert.mockClear();
    await select(firstText, 0, secondText, 15);
    expect(button('Add selected words', cards[0]!).disabled).toBe(true);
    expect(button('Add selected words', cards[1]!).disabled).toBe(true);
    await click(button('Add selected words', cards[0]!));
    expect(insert).not.toHaveBeenCalled();
    const title = cards[0]!.querySelector('h3')!.firstChild!;
    await select(title, 0, title, 3);
    expect(button('Add selected words', cards[0]!).disabled).toBe(true);
  });

  it('rechecks the live selection before inserting and respects unavailable actions', async () => {
    await mount([revision('one')]);
    const text = host.querySelector('.group-compare-text')!.firstChild!;
    await select(text, 0, text, 15);
    // Browsers can update selection between the selectionchange event and a click.
    window.getSelection()!.removeAllRanges();
    await click(button('Add selected words'));
    expect(insert).not.toHaveBeenCalled();
    await mount([revision('one')], { canInsert: false });
    expect(button('Add whole writing').disabled).toBe(true);
    expect(button('Open editable copy').disabled).toBe(false);
    await mount([revision('one')], { busy: true });
    expect(button('Open editable copy').disabled).toBe(true);
  });
});
