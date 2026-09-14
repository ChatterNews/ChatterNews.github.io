import { describe, expect, test } from 'vitest';
import { TRACK_STEPS, trackStepFor, trackIndexFor, roomForStep, storyPath, storyRoomPath } from './track.js';

describe('the track', () => {
  test('has the seven steps in the prototype order', () => {
    expect(TRACK_STEPS.map((s) => s.id)).toEqual([
      'idea', 'report', 'write', 'record', 'check', 'go', 'out',
    ]);
  });

  test('derives the step from Story.status, never a stored field', () => {
    expect(trackStepFor('PITCH')).toBe('idea');
    expect(trackStepFor('WORK')).toBe('write');
    expect(trackStepFor('BOOTH')).toBe('record');
    expect(trackStepFor('REVIEW')).toBe('check');
    expect(trackStepFor('HELD')).toBe('go');
    expect(trackStepFor('DONE')).toBe('out');
  });

  test('gives an index so beads before it render as done', () => {
    expect(trackIndexFor('PITCH')).toBe(0);
    expect(trackIndexFor('DONE')).toBe(6);
  });

  test('each bead names the room that owns that step', () => {
    expect(roomForStep('idea')).toBe('/slate');
    expect(roomForStep('write')).toBe('/desk');
    expect(roomForStep('record')).toBe('/booth');
    expect(roomForStep('go')).toBe('/greenlight');
    expect(roomForStep('out')).toBe('/reruns');
  });

  test('every step carries plain-language next-action copy for the track bar', () => {
    for (const step of TRACK_STEPS) {
      expect(step.next.length).toBeGreaterThan(0);
      expect(step.action.length).toBeGreaterThan(0);
    }
  });

  test('keeps the story attached to its next room', () => {
    expect(storyPath({ id: 'story-1', status: 'WORK' })).toBe('/desk/story-1');
    expect(storyPath({ id: 'story-1', status: 'WORK', creationRecipeId: 'podcast', channels: ['pod'] })).toBe('/booth/story-1');
    expect(storyPath({ id: 'story-1', status: 'WORK', creationRecipeId: 'poster', channels: ['social'] })).toBe('/blast?story=story-1');
    expect(storyPath({ id: 'story-1', status: 'DONE' })).toBe('/reruns/story-1');
    expect(storyRoomPath('/booth', 'story-1')).toBe('/booth/story-1');
    expect(storyRoomPath('/crew', 'story-1')).toBe('/crew?story=story-1');
  });

  test('carries story context through every specialist workspace', () => {
    expect(storyRoomPath('slate', 'story 1')).toBe('/slate/story%201');
    expect(storyRoomPath('/showtime', 'story-1')).toBe('/showtime/story-1');
    expect(storyRoomPath('/studio', 'story-1')).toBe('/studio?story=story-1');
    expect(storyRoomPath('/blast', 'story-1')).toBe('/blast?story=story-1');
    expect(storyRoomPath('/files', 'story-1')).toBe('/files?story=story-1');
  });
});
