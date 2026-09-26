export interface SpiralRoom {
  slug: string;
  name: string;
  verb: string;
  mark: string;
  group: 'START' | 'MAKE' | 'FINISH';
  color: string;
}

export const SPIRAL_ROOMS: readonly SpiralRoom[] = [
  { slug: '', name: 'Clubhouse', verb: 'Tune in', mark: 'CH', group: 'START', color: '#ffdf55' },
  { slug: 'slate', name: 'Slate', verb: 'Shape it', mark: 'SL', group: 'START', color: '#55dfff' },
  { slug: 'crew', name: 'Crew', verb: 'Pass it', mark: 'CR', group: 'START', color: '#aa9fff' },
  { slug: 'desk', name: 'Desk', verb: 'Write it', mark: 'DE', group: 'START', color: '#aaff55' },
  { slug: 'booth', name: 'Booth', verb: 'Say it', mark: 'BO', group: 'MAKE', color: '#ff7f55' },
  { slug: 'chatterbox', name: 'Chatterbox', verb: 'Cast it', mark: 'CB', group: 'MAKE', color: '#55dfaa' },
  { slug: 'foley', name: 'Foley', verb: 'Sound it', mark: 'FO', group: 'MAKE', color: '#7fdfaa' },
  { slug: 'blast', name: 'Blast', verb: 'Print it', mark: 'BL', group: 'MAKE', color: '#aa7fff' },
  { slug: 'stinger', name: 'Stinger', verb: 'Edit it', mark: 'SG', group: 'MAKE', color: '#ffdf55' },
  { slug: 'showtime', name: 'Showtime', verb: 'Record it', mark: 'SH', group: 'MAKE', color: '#ff9f55' },
  { slug: 'greenlight', name: 'Green Light', verb: 'Check it', mark: 'GL', group: 'FINISH', color: '#aadf55' },
  { slug: 'files', name: 'Media Bin', verb: 'Pack it', mark: 'MB', group: 'FINISH', color: '#55dfff' },
  { slug: 'reruns', name: 'Reruns', verb: 'Replay it', mark: 'RR', group: 'FINISH', color: '#d47fff' },
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
