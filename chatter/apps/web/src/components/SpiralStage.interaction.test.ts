// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { SpiralStage } from './SpiralStage.js';

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
});
afterEach(() => vi.unstubAllGlobals());

test('room tuning restarts only for room changes without remounting editor content', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const render = (currentRoom: string, lowSpec = false) => act(() => root.render(createElement(SpiralStage, {
    currentRoom, lowSpec, onNavigate: () => undefined,
    storyControl: 'Story route', driveControl: null, identityControl: null, mediaControl: null,
    children: createElement('input', { 'aria-label': 'Unsaved draft', defaultValue: 'Original' }),
  })));
  try {
    await render('desk');
    const input = host.querySelector('input')!;
    input.value = 'Work in progress';
    const firstSignal = host.querySelector('.spiral-screen-tuning');
    expect(firstSignal?.getAttribute('aria-hidden')).toBe('true');
    expect(host.querySelector('[data-frame-control="workspace-mode"]')?.getAttribute('aria-pressed')).toBe('false');

    await act(() => (host.querySelector('[data-frame-control="workspace-mode"]') as HTMLButtonElement).click());
    expect(host.querySelector('[data-frame-control="workspace-mode"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelector('.spiral-screen-tuning')).toBe(firstSignal);
    expect(host.querySelector('input')).toBe(input);

    await render('desk');
    expect(host.querySelector('.spiral-screen-tuning')).toBe(firstSignal);
    await render('blast');
    expect(host.querySelector('.spiral-screen-tuning')).not.toBe(firstSignal);
    expect(host.querySelectorAll('.spiral-screen-tuning')).toHaveLength(1);
    expect(host.querySelector('input')).toBe(input);
    expect(input.value).toBe('Work in progress');

    await render('blast', true);
    expect(host.querySelector('.spiral-screen-tuning')).toBeNull();
    expect(host.querySelector('input')).toBe(input);
  } finally {
    await act(() => root.unmount());
    host.remove();
  }
});

test('frame arrows navigate adjacent rooms, wrap the sequence, and retain expanded view', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const onNavigate = vi.fn();
  const render = (currentRoom: string) => act(() => root.render(createElement(SpiralStage, {
    currentRoom, onNavigate,
    storyControl: null, driveControl: null, identityControl: null, mediaControl: null,
    children: createElement('input', { defaultValue: 'Saved work' }),
  })));
  const click = (selector: string) => act(() => (host.querySelector(selector) as HTMLButtonElement).click());
  try {
    await render('desk');
    await click('[data-frame-control="workspace-mode"]');
    await click('[data-room-step="previous"]');
    expect(onNavigate).toHaveBeenLastCalledWith('crew');
    await render('crew');
    expect(host.querySelector('[data-frame-control="workspace-mode"]')?.getAttribute('aria-pressed')).toBe('true');
    await click('[data-room-step="next"]');
    expect(onNavigate).toHaveBeenLastCalledWith('desk');
    await render('reruns');
    await click('[data-room-step="next"]');
    expect(onNavigate).toHaveBeenLastCalledWith('');
    await render('');
    await click('[data-room-step="previous"]');
    expect(onNavigate).toHaveBeenLastCalledWith('reruns');
    expect(host.querySelector('[data-room-step="previous"]')?.getAttribute('aria-label')).toBe('Previous room: Reruns');
  } finally {
    await act(() => root.unmount());
    host.remove();
  }
});
