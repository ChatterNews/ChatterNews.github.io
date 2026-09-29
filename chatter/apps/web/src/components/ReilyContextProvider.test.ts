/** @vitest-environment jsdom */
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ReilyContextProvider,
  useReilyFocus,
  useReilyRecovery,
  useReilySignals,
  useReilySituation,
} from './ReilyContextProvider.js';
import type { ReilySituation } from './reily-help-types.js';
import type { ReilyFocus, ReilyRecovery } from './reily-advice.js';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

function FocusPublisher({ value }: { value?: ReilyFocus }) {
  useReilyFocus(value);
  return null;
}

function RecoveryPublisher({ value }: { value?: ReilyRecovery }) {
  useReilyRecovery(value);
  return null;
}

function SituationPublisher({ value }: { value?: ReilySituation }) { useReilySituation(value); return null; }

function Observer() {
  const signals = useReilySignals();
  return createElement('output', { 'data-focus': signals.focus ?? '', 'data-recovery': signals.recovery?.kind ?? '', 'data-situations': JSON.stringify(signals.situations) });
}

function tree(children?: ReactNode) {
  return createElement(ReilyContextProvider, {}, children, createElement(Observer));
}

function render(children: ReactNode) {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(tree(children)));
  return container.querySelector('output')!;
}

describe('Reily room signals', () => {
  it('clears a room focus when its publisher unmounts', () => {
    const output = render(createElement(FocusPublisher, { value: 'blast.text' }));
    expect(output.dataset.focus).toBe('blast.text');

    act(() => root?.render(tree()));

    expect(container?.querySelector('output')?.getAttribute('data-focus')).toBe('');
  });

  it('clears a recovery signal when its publisher unmounts', () => {
    const output = render(createElement(RecoveryPublisher, { value: { kind: 'blast.import', workChanged: false } }));
    expect(output.dataset.recovery).toBe('blast.import');

    act(() => root?.render(tree()));

    expect(container?.querySelector('output')?.getAttribute('data-recovery')).toBe('');
  });
});

it('restores underlying room facts after a dialog closes and does not duplicate identical facts', () => {
  const editor = createElement(SituationPublisher, { key: 'editor', value: { room: 'blast', selectedKind: 'TEXT' } });
  const overlay = createElement(SituationPublisher, { key: 'overlay', value: { room: 'files', scope: 'overlay', busy: true } });
  render([editor, overlay]);
  expect(JSON.parse(container!.querySelector('output')!.dataset.situations!)).toHaveLength(2);
  act(() => root?.render(tree([editor, overlay])));
  expect(JSON.parse(container!.querySelector('output')!.dataset.situations!)).toHaveLength(2);
  act(() => root?.render(tree(editor)));
  expect(JSON.parse(container!.querySelector('output')!.dataset.situations!)).toEqual([{ room: 'blast', selectedKind: 'TEXT' }]);
});
