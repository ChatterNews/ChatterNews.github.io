import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import type { User } from '@chatter/shared';
import { AdviserBadgeEntry } from './AdviserBadgeEntry.js';
import { NewsroomCheckInView, NewsroomDeskControls } from './NewsroomCheckIn.js';

const adviser = {
  id: 'adviser-1', name: 'Ms. Rivera', penName: 'Ms. Rivera', role: 'ADVISER', active: true,
} as User;

const callbacks = {
  onBack() {}, onSetup: async () => true, onUnlock: async () => true,
};

describe('Newsroom Check-In', () => {
  test('offers student, adviser, and demo desks before setup', () => {
    const html = renderToStaticMarkup(createElement(NewsroomCheckInView, {
      firstRun: 'EMPTY',
      onStudent: () => undefined,
      onAdviser: () => undefined,
      onDemo: () => undefined,
      onOpenControls: () => undefined,
    }));

    expect(html).toContain('Student desk');
    expect(html).toContain('Adviser desk');
    expect(html).toContain('Demo desk');
    expect(html).toContain('Desk controls');
  });

  test('keeps the isolated demo desk available after a newsroom is configured', () => {
    const html = renderToStaticMarkup(createElement(NewsroomCheckInView, {
      firstRun: 'CONFIGURED',
      onStudent: () => undefined,
      onAdviser: () => undefined,
      onDemo: () => undefined,
      onOpenControls: () => undefined,
    }));

    expect(html).toContain('Demo desk');
    expect(html).toContain('Practice without changing this newsroom');
    expect(html).toContain('Desk controls');
  });

  test('separates a safe check-in reset from the permanent newsroom erase', () => {
    const html = renderToStaticMarkup(createElement(NewsroomDeskControls, {
      firstRun: 'CONFIGURED',
      hasPin: true,
      pin: '',
      confirmReset: false,
      confirmErase: false,
      busy: false,
      onPinChange: () => undefined,
      onClose: () => undefined,
      onBackup: () => undefined,
      onAskReset: () => undefined,
      onCancelReset: () => undefined,
      onReset: () => undefined,
      onAskErase: () => undefined,
      onCancelErase: () => undefined,
      onErase: () => undefined,
      onSetUpAdviser: () => undefined,
    }));

    expect(html).toContain('Reset check-in');
    expect(html).toContain('Keeps every badge, story, and media file');
    expect(html).toContain('Save a backup');
    expect(html).toContain('Erase this newsroom');
    expect(html).toContain('Adviser PIN');
  });

  test('offers a working recovery reset when older work has no adviser PIN', () => {
    const html = renderToStaticMarkup(createElement(NewsroomDeskControls, {
      firstRun: 'LEGACY',
      hasPin: false,
      pin: '',
      confirmReset: false,
      confirmErase: false,
      busy: false,
      onPinChange: () => undefined,
      onClose: () => undefined,
      onBackup: () => undefined,
      onAskReset: () => undefined,
      onCancelReset: () => undefined,
      onReset: () => undefined,
      onAskErase: () => undefined,
      onCancelErase: () => undefined,
      onErase: () => undefined,
      onSetUpAdviser: () => undefined,
    }));

    expect(html).toContain('Older newsroom found');
    expect(html).toContain('<button type="button">Reset check-in</button>');
    expect(html).toContain('Set up adviser access');
  });

  test('a new adviser makes a badge and confirms a four-digit PIN', () => {
    const html = renderToStaticMarkup(createElement(AdviserBadgeEntry, {
      advisers: [], hasPin: false, ...callbacks,
    }));

    expect(html).toContain('Make the adviser badge');
    expect(html).toContain('Badge name');
    expect(html).toContain('Confirm PIN');
  });

  test('a configured adviser chooses a staff badge and enters the PIN', () => {
    const html = renderToStaticMarkup(createElement(AdviserBadgeEntry, {
      advisers: [adviser], hasPin: true, preferredAdviserId: adviser.id, ...callbacks,
    }));

    expect(html).toContain('Adviser check-in');
    expect(html).toContain('Ms. Rivera');
    expect(html).toContain('Adviser PIN');
  });
});
