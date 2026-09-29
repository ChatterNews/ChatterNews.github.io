import type { ReilyContext, ReilyFocus, ReilyRoom } from './reily-advice.js';

/** Small UI facts only. Never send student text, media, filenames or error contents. */
export interface ReilySituation {
  room: ReilyRoom;
  scope?: 'overlay';
  projectSelected?: boolean;
  hasContent?: boolean;
  hasMedia?: boolean;
  hasExport?: boolean;
  selectionCount?: number;
  selectedKind?: string;
  activeTool?: string;
  recording?: boolean;
  busy?: boolean;
  error?: boolean;
  canEdit?: boolean;
  needsApproval?: boolean;
  groupKind?: 'main' | 'piece' | 'joined';
  folderConnected?: boolean;
  folderError?: boolean;
  contributionCount?: number;
}
export interface ReilyHelpContext extends ReilyContext { situation?: ReilySituation }
export interface ReilyHelpTopic {
  id: string;
  room: ReilyRoom | 'any';
  title: string;
  keywords: readonly string[];
  summary: string;
  steps: readonly string[];
  done?: string;
  /** Higher priorities should be reserved for a confirmed blocker or active task. */
  priority?: number;
  focus?: readonly ReilyFocus[];
  when?: (context: ReilyHelpContext) => boolean;
  action?: { label: string; room: ReilyRoom };
}
