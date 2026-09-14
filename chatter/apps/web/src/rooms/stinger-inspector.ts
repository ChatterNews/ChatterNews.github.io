import type { MotionElement } from '@chatter/shared';

export type InspectorTab = 'DESIGN' | 'MOTION' | 'DATA' | 'BRAND';

export interface InspectorTabAvailability {
  id: InspectorTab;
  available: boolean;
  unavailableReason: string | undefined;
}

export function inspectorTabsFor(kind: MotionElement['kind'] | undefined): InspectorTabAvailability[] {
  return [
    { id: 'DESIGN', available: true, unavailableReason: undefined },
    {
      id: 'MOTION',
      available: kind !== undefined,
      unavailableReason: kind === undefined ? 'Select a layer to edit its movement.' : undefined,
    },
    {
      id: 'DATA',
      available: kind === 'TEXT',
      unavailableReason: kind === undefined
        ? 'Select a word layer to link story details.'
        : kind === 'TEXT' ? undefined : 'Story details only work with word layers.',
    },
    { id: 'BRAND', available: true, unavailableReason: undefined },
  ];
}

export function resolveInspectorTab(tab: InspectorTab, kind: MotionElement['kind'] | undefined): InspectorTab {
  return inspectorTabsFor(kind).find((item) => item.id === tab)?.available ? tab : 'DESIGN';
}
