import type { EvidenceType, StorySource } from './types.js';

export const SOURCE_KIND_OPTIONS: readonly { id: EvidenceType; label: string; help: string }[] = [
  { id: 'PERSON', label: 'Person', help: 'Someone who knows, made, or experienced this firsthand.' },
  { id: 'DOCUMENT', label: 'Document', help: 'A schedule, record, email, script, or other original file.' },
  { id: 'OBSERVATION', label: 'Firsthand observation', help: 'Something the crew directly saw, heard, counted, or measured.' },
  { id: 'WEB_LEAD', label: 'Web lead', help: 'A post or webpage saved with the project notes.' },
  { id: 'AI_LEAD', label: 'AI lead', help: 'An AI answer used as a starting point for ideas or search terms.' },
] as const;

export function sourceKind(source: StorySource): EvidenceType {
  return source.evidenceType ?? 'PERSON';
}
