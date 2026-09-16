/** @vitest-environment jsdom */
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import type { Story } from '@chatter/shared';
import { SpiralStage } from './SpiralStage.js';
import { StorySatellite } from './StorySatellite.js';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => vi.unstubAllGlobals());

it('navigates from the compact room picker even when the hidden orbit has no layout height', () => {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('1100px') }));
  const container = document.createElement('div');
  const root = createRoot(container);
  const navigate = vi.fn();
  act(() => root.render(createElement(SpiralStage, {
    currentRoom: '', onNavigate: navigate, storyControl: null, driveControl: null,
    identityControl: null, mediaControl: null, children: 'Workspace',
  })));
  const picker = container.querySelector('details')!;
  picker.open = true;
  act(() => container.querySelector<HTMLButtonElement>('[data-map-station="chatterbox"]')!.click());
  expect(navigate).toHaveBeenCalledExactlyOnceWith('chatterbox');
  expect(picker.open).toBe(false);
  act(() => container.querySelector<HTMLButtonElement>('[aria-label="Go to Clubhouse"]')!.click());
  expect(navigate).toHaveBeenCalledTimes(1); // Already in Clubhouse: do not reload its work.
  act(() => root.unmount());
});

it('expands one story route and closes it after navigating with the same story', () => {
  const story: Story = { id: 'phone-story', createdAt: 1, updatedAt: 1, slug: 'phone-story', title: 'Book fair', channels: ['social'], creationRecipeId: 'poster', status: 'WORK', body: { type: 'doc', content: [] }, readTimeSec: 0, bylineIds: [] };
  function Location() { const location = useLocation(); return createElement('output', {}, location.pathname + location.search); }
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => root.render(createElement(MemoryRouter, {}, createElement(StorySatellite, {story}), createElement(Location))));
  const toggle = container.querySelector<HTMLButtonElement>('.compact-route-toggle')!;
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  act(() => toggle.click());
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  expect(container.querySelectorAll('ol')).toHaveLength(1);
  act(() => container.querySelector<HTMLButtonElement>('[aria-label="Design: current step"]')!.click());
  expect(container.querySelector('output')!.textContent).toBe('/blast?story=phone-story');
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  act(() => root.unmount());
});

it('keeps the current room when a resize restores the desktop orbit', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  const container = document.createElement('div');
  const root = createRoot(container);
  const navigate = vi.fn();
  act(() => root.render(createElement(SpiralStage, {
    currentRoom: 'blast', onNavigate: navigate, storyControl: null, driveControl: null,
    identityControl: null, mediaControl: null, children: 'Existing design',
  })));
  const scroller = container.querySelector<HTMLElement>('.spiral-stage-scroller')!;
  Object.defineProperty(scroller, 'clientHeight', {value: 100});
  act(() => window.dispatchEvent(new Event('resize')));
  act(() => scroller.dispatchEvent(new Event('scrollend')));
  expect(navigate).not.toHaveBeenCalled();
  expect(scroller.scrollTop).toBe(600);
  expect(container.textContent).toContain('Existing design');
  act(() => root.unmount());
});

it('opens an explicitly selected desktop room immediately without waiting for orbit scrolling', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  const container=document.createElement('div');const root=createRoot(container);const navigate=vi.fn();
  act(() => root.render(createElement(SpiralStage, {currentRoom:'',onNavigate:navigate,storyControl:null,driveControl:null,identityControl:null,mediaControl:null,children:'Existing work'})));
  const scroller=container.querySelector<HTMLElement>('.spiral-stage-scroller')!;
  Object.defineProperty(scroller,'clientHeight',{value:900});
  act(() => container.querySelector<HTMLButtonElement>('[data-map-station="desk"]')!.click());
  expect(navigate).toHaveBeenCalledExactlyOnceWith('desk');
  act(() => scroller.dispatchEvent(new Event('scrollend')));
  expect(navigate).toHaveBeenCalledTimes(1);
  act(() => root.unmount());
});


it('switches low-spec mode without remounting the current editor or losing its contents', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  const container=document.createElement('div');const root=createRoot(container);const navigate=vi.fn();
  const draw=(lowSpec: boolean) => root.render(createElement(SpiralStage, {lowSpec,currentRoom:'desk',onNavigate:navigate,storyControl:null,driveControl:null,identityControl:null,mediaControl:null,children:createElement('textarea',{defaultValue:'My draft'})}));
  act(() => draw(false));const editor=container.querySelector('textarea')!;editor.value='Unsaved words';
  act(() => draw(true));expect(container.querySelector('.spiral-stage-scroller')).toBeNull();
  expect(container.querySelector('textarea')).toBe(editor);expect(editor.value).toBe('Unsaved words');
  act(() => container.querySelector<HTMLButtonElement>('[data-map-station="blast"]')!.click());expect(navigate).toHaveBeenCalledExactlyOnceWith('blast');
  act(() => draw(false));expect(container.querySelector('.spiral-stage-scroller')).not.toBeNull();
  expect(container.querySelector('textarea')).toBe(editor);expect(editor.value).toBe('Unsaved words');
  act(() => root.unmount());
});
