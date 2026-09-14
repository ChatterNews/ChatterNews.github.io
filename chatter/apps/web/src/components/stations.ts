/** Room controls used by the Clubhouse equipment rack. */
export interface Station {
  v: string; n: string; cls: string; ic: string; d: string; c: string;
  group: 'PLAN' | 'MAKE' | 'FINISH'; accent: string; cue: string;
  countLabel?: [string, string];
}

export const STATIONS: Station[] = [
  { v: 'slate', n: 'Slate', cls: 's-cyan', ic: 'ic-slate', d: 'Shape the story and reporting plan', group: 'PLAN', accent: '#36c9dc', cue: 'Start or open a plan', countLabel: ['active story', 'active stories'], c: '' },
  { v: 'crew', n: 'Crew', cls: 's-grape', ic: 'ic-crew', d: 'Choose jobs and pass work forward', group: 'PLAN', accent: '#9275e8', cue: 'Find your assignment', countLabel: ['open assignment', 'open assignments'], c: '' },
  { v: 'desk', n: 'Desk', cls: 's-lime', ic: 'ic-pen', d: 'Write and edit the story', group: 'PLAN', accent: '#9bdd42', cue: 'Open the writing desk', countLabel: ['draft in progress', 'drafts in progress'], c: '' },
  { v: 'booth', n: 'Booth', cls: 's-tang', ic: 'ic-mic', d: 'Record clean voices and interviews', group: 'MAKE', accent: '#ff845e', cue: 'Set up the microphone', countLabel: ['story ready to record', 'stories ready to record'], c: '' },
  { v: 'studio', n: 'Studio', cls: 's-pink', ic: 'ic-note', d: 'Make music, sound, and mixes', group: 'MAKE', accent: '#ff5f9e', cue: 'Open the sound board', c: '' },
  { v: 'chatterbox', n: 'Chatterbox', cls: 's-cyan', ic: 'ic-mic', d: 'Build and finish podcast episodes', group: 'MAKE', accent: '#54d6d2', cue: 'Open the podcast board', c: '' },
  { v: 'blast', n: 'Blast', cls: 's-grape', ic: 'ic-mail', d: 'Design pages, flyers, and social posts', group: 'MAKE', accent: '#a47ce9', cue: 'Open the layout table', c: '' },
  { v: 'stinger', n: 'Stinger', cls: 's-sun', ic: 'ic-star', d: 'Build titles and broadcast graphics', group: 'MAKE', accent: '#ffd84d', cue: 'Open the graphics switcher', c: '' },
  { v: 'showtime', n: 'Showtime', cls: 's-tang', ic: 'ic-tv', d: 'Shoot, cut, and finish video', group: 'MAKE', accent: '#ff7655', cue: 'Open the edit suite', c: '' },
  { v: 'greenlight', n: 'Green Light', cls: 's-lime', ic: 'ic-light', d: 'Check facts, rights, and final work', group: 'FINISH', accent: '#a7e44a', cue: 'Open the check desk', countLabel: ['item waiting', 'items waiting'], c: '' },
  { v: 'files', n: 'Media Bin', cls: 's-cyan', ic: 'ic-mail', d: 'Find working files and final exports', group: 'FINISH', accent: '#5bd1e5', cue: 'Open the file drawers', c: '' },
  { v: 'reruns', n: 'Reruns', cls: 's-grape', ic: 'ic-rerun', d: 'See published work and replay notes', group: 'FINISH', accent: '#8870d7', cue: 'Open the archive', countLabel: ['published edition', 'published editions'], c: '' },
];
