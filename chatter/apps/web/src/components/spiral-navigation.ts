export interface SpiralRoom {
  slug: string;
  name: string;
  verb: string;
  mark: string;
  group: 'START' | 'MAKE' | 'FINISH';
  color: string;
}

export const SPIRAL_ROOMS: readonly SpiralRoom[] = [
  { slug: '', name: 'Clubhouse', verb: 'Tune in', mark: 'CH', group: 'START', color: '#ffe35a' },
  { slug: 'slate', name: 'Slate', verb: 'Shape it', mark: 'SL', group: 'START', color: '#54e6f1' },
  { slug: 'crew', name: 'Crew', verb: 'Pass it', mark: 'CR', group: 'START', color: '#b899ff' },
  { slug: 'desk', name: 'Desk', verb: 'Write it', mark: 'DE', group: 'START', color: '#baf45f' },
  { slug: 'booth', name: 'Booth', verb: 'Say it', mark: 'BO', group: 'MAKE', color: '#ff7b5f' },
  { slug: 'chatterbox', name: 'Chatterbox', verb: 'Cast it', mark: 'CB', group: 'MAKE', color: '#5fe0c4' },
  { slug: 'foley', name: 'Foley', verb: 'Sound it', mark: 'FO', group: 'MAKE', color: '#79dfcb' },
  { slug: 'blast', name: 'Blast', verb: 'Print it', mark: 'BL', group: 'MAKE', color: '#ad82ff' },
  { slug: 'stinger', name: 'Stinger', verb: 'Edit it', mark: 'SG', group: 'MAKE', color: '#ffd64c' },
  { slug: 'showtime', name: 'Showtime', verb: 'Record it', mark: 'SH', group: 'MAKE', color: '#ff925f' },
  { slug: 'greenlight', name: 'Green Light', verb: 'Check it', mark: 'GL', group: 'FINISH', color: '#a9ed60' },
  { slug: 'files', name: 'Media Bin', verb: 'Pack it', mark: 'MB', group: 'FINISH', color: '#61d5ff' },
  { slug: 'reruns', name: 'Reruns', verb: 'Replay it', mark: 'RR', group: 'FINISH', color: '#c18bff' },
] as const;

export const SPIRAL_ROOM_PURPOSES: Readonly<Record<string, string>> = {
  clubhouse: 'Choose a story and see its route.',
  slate: 'Plan the angle and reporting.',
  crew: 'Claim roles and pass the work.',
  desk: 'Write and revise the story.',
  booth: 'Record narration and interviews.',
  chatterbox: 'Record and edit a podcast.',
  foley: 'Find, create and arrange sounds and cues.',
  blast: 'Design pages, flyers, and covers.',
  stinger: 'Edit footage, sound, and screen graphics.',
  showtime: 'Record cameras and live programmes.',
  greenlight: 'Review the work before release.',
  files: 'Collect exports and story files.',
  reruns: 'Watch and browse finished stories.',
  frontdesk: 'Manage badges, projects, and release work.',
};
