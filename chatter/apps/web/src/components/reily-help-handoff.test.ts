import { describe, expect, it } from 'vitest';
import { REILY_HANDOFF_HELP } from './reily-help-handoff.js';
import type { ReilyHelpContext, ReilySituation } from './reily-help-types.js';

const context = (situation?: ReilySituation): ReilyHelpContext => ({ room: situation?.room ?? 'slate', role: 'STUDENT', situation });
const matches = (id: string, c: ReilyHelpContext) => REILY_HANDOFF_HELP.find(t => t.id === `handoff.${id}`)!.when?.(c) ?? false;

describe('Reily handoff advice conditions', () => {
  it('does not assume a folder failure when it has no folder signal', () => {
    expect(matches('folder-error', context())).toBe(false);
    expect(matches('folder-error', context({ room: 'desk', groupKind: 'main', folderConnected: true, folderError: false }))).toBe(false);
    expect(matches('folder-error', context({ room: 'desk', groupKind: 'main', folderConnected: true, folderError: true }))).toBe(true);
  });
  it('distinguishes unconnected master, watching master and contributor', () => {
    const unconnected = context({ room: 'slate', groupKind: 'main', folderConnected: false });
    const connected = context({ room: 'slate', groupKind: 'main', folderConnected: true });
    const piece = context({ room: 'slate', groupKind: 'piece', folderConnected: false });
    expect(matches('master-connect', unconnected)).toBe(true);
    expect(matches('master-watch', unconnected)).toBe(false);
    expect(matches('master-connect', connected)).toBe(false);
    expect(matches('master-watch', connected)).toBe(true);
    expect(matches('master-connect', piece)).toBe(false);
    expect(matches('save-piece', piece)).toBe(true);
    expect(matches('save-master', piece)).toBe(false);
  });
  it('keeps Media Bin help separate from the Files save drawer', () => {
    const bin = context({ room: 'files', activeTool: 'media-bin', hasContent: false, error: true });
    const drawer = context({ room: 'files', scope: 'overlay', activeTool: 'story-drive', hasContent: false, error: true });
    expect(matches('media-empty', bin)).toBe(true);
    expect(matches('save-error', bin)).toBe(false);
    expect(matches('media-empty', drawer)).toBe(false);
    expect(matches('save-error', drawer)).toBe(true);
    expect(matches('save-error', context({ room: 'files', activeTool: 'story-drive', error: false }))).toBe(false);
  });
  it('requires joined-form and blocked-review facts for high priority advice', () => {
    expect(matches('code-error', context({ room: 'slate', activeTool: 'group-join', error: true }))).toBe(true);
    expect(matches('code-error', context({ room: 'slate', activeTool: 'group-sources', error: true }))).toBe(false);
    expect(matches('review-blocked', context({ room: 'greenlight', projectSelected: false, needsApproval: true }))).toBe(false);
    expect(matches('review-blocked', context({ room: 'greenlight', projectSelected: true, needsApproval: true }))).toBe(true);
  });
  it('recommends side-by-side writing only where it exists and with multiple contributions', () => {
    expect(matches('compare', context({ room: 'desk', groupKind: 'main', contributionCount: 2 }))).toBe(true);
    expect(matches('compare', context({ room: 'desk', groupKind: 'main', contributionCount: 0 }))).toBe(false);
    expect(matches('compare', context({ room: 'slate', groupKind: 'main', contributionCount: 4 }))).toBe(false);
  });
  it('never recommends adviser controls to a student at Front Desk', () => {
    const student = context({ room: 'frontdesk' });
    const adviser = { ...student, role: 'ADVISER' as const };
    expect(matches('frontdesk-adviser', student)).toBe(false);
    expect(matches('frontdesk-student', student)).toBe(true);
    expect(matches('frontdesk-adviser', adviser)).toBe(true);
    expect(matches('frontdesk-student', adviser)).toBe(false);
    expect(matches('frontdesk-backup', student)).toBe(false);
  });
});

import { recommendReilyHelp, searchReilyHelp } from './reily-help.js';

describe('Reily handoff recommendation order', () => {
  it('puts lost folder access before ordinary master advice', () => {
    const c = context({ room: 'desk', groupKind: 'main', folderConnected: true, folderError: true, projectSelected: true });
    expect(recommendReilyHelp(c)[0]?.id).toBe('handoff.folder-error');
    expect(recommendReilyHelp(c).some(t => t.id === 'handoff.master-watch')).toBe(false);
  });
  it('separates contributor save advice from master assembly', () => {
    const c = context({ room: 'slate', groupKind: 'piece', projectSelected: true });
    const ids = recommendReilyHelp(c).map(t => t.id);
    expect(ids).toContain('handoff.save-piece');
    expect(ids).not.toContain('handoff.master-connect');
    expect(ids).not.toContain('handoff.save-master');
    expect(ids).not.toContain('handoff.adopt');
  });
  it('offers concrete release-board help when a selected story is blocked', () => {
    const c = context({ room: 'greenlight', projectSelected: true, needsApproval: true });
    expect(recommendReilyHelp(c)[0]?.id).toBe('handoff.review-blocked');
  });
  it('prioritizes a failed save in the Files overlay rather than the empty Media Bin', () => {
    const c = context({ room: 'files', scope: 'overlay', activeTool: 'story-drive', projectSelected: true, error: true, hasContent: false });
    expect(recommendReilyHelp(c)[0]?.id).toBe('handoff.save-error');
    expect(recommendReilyHelp(c).map(t => t.id)).not.toContain('handoff.media-empty');
  });
  it('can find no-live-sync and lost-folder instructions from student questions', () => {
    const c = context({ room: 'slate', groupKind: 'main', projectSelected: true });
    expect(searchReilyHelp("Why can't my friend see my changes?", c).map(t => t.id)).toContain('handoff.offline-code');
    expect(searchReilyHelp('USB folder disconnected', c).map(t => t.id)).toContain('handoff.folder-error');
    expect(searchReilyHelp('joined wrong story', c).map(t => t.id)).toContain('handoff.wrong-group');
  });
});

it('puts home orientation before portable-file advice', () => {
  expect(recommendReilyHelp({ room: 'home', role: 'STUDENT' })[0]?.id).toBe('handoff.home-start');
});
it('does not confuse failed group collection with the Desk document save', () => {
  const c = context({ room: 'desk', projectSelected: true, groupKind: 'main', error: true, activeTool: 'group-error' });
  expect(recommendReilyHelp(c)[0]?.id).toBe('handoff.group-error');
});
