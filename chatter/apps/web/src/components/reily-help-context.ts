import type { ReilyContext } from './reily-advice.js';
import type { ReilyHelpContext, ReilySituation } from './reily-help-types.js';

export function mergeReilySituation(context: ReilyContext, situations: readonly ReilySituation[]): ReilyHelpContext {
  const overlay = [...situations].reverse().find(s => s.scope === 'overlay');
  const room = overlay?.room ?? context.room;
  const matching = situations.filter(s => s.room === room && s.scope !== 'overlay');
  const situation = matching.length || overlay ? Object.assign({ room }, ...matching, overlay) as ReilySituation : undefined;
  if (situation) {
    const sources = overlay ? [overlay] : matching;
    for (const flag of ['busy', 'error', 'recording', 'folderError', 'needsApproval'] as const) {
      if (sources.some(source => source[flag] !== undefined)) situation[flag] = sources.some(source => source[flag] === true);
    }
    if (sources.some(source => source.canEdit !== undefined)) situation.canEdit = !sources.some(source => source.canEdit === false);
    // A save/import failure remains the active problem even when an unrelated
    // editor selection publishes later. Overlay context stays self-contained.
    const groupError = sources.find(source => source.activeTool === 'group-error' && source.error);
    if (groupError) situation.activeTool = 'group-error';
  }
  return { ...context, room, situation,
    focus: context.focus?.startsWith(`${room}.`) ? context.focus : undefined,
    recovery: context.recovery?.kind.startsWith(`${room}.`) ? context.recovery : undefined,
  };
}
