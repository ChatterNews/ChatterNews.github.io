import type { SoundGenerator } from '@chatter/shared';

export type StarterCategory = 'Transitions' | 'Accents' | 'Signals' | 'Ambience' | 'Cue building blocks';
export interface StarterSound { name: string; category: StarterCategory; recipe: SoundGenerator }
const tone = (seed: number, duration: number, frequency: number, endFrequency = frequency, attack = 0.01, release = 0.1, pulseHz = 0): SoundGenerator => ({ version: 1, kind: 'TONE', seed, duration, frequency, endFrequency, attack, release, pulseHz, color: 'WHITE' });
const noise = (seed: number, duration: number, frequency: number, endFrequency: number, attack: number, release: number, pulseHz = 0, color: SoundGenerator['color'] = 'LOW'): SoundGenerator => ({ version: 1, kind: 'NOISE', seed, duration, frequency, endFrequency, attack, release, pulseHz, color });
/** Original algorithmic recipes; no recordings, retired kits, or external sample dependencies. */
export const starterSounds: StarterSound[] = [
  { name: 'Paper breeze', category: 'Transitions', recipe: noise(1101, 0.65, 500, 6000, 0.4, 0.22) },
  { name: 'Doorway sweep', category: 'Transitions', recipe: noise(1102, 1.1, 5500, 150, 0.15, 0.8) },
  { name: 'Soft reveal', category: 'Transitions', recipe: noise(1103, 1.8, 120, 4000, 1.5, 0.25) },
  { name: 'Quick zip', category: 'Transitions', recipe: tone(1104, 0.22, 220, 2500, 0.01, 0.08) },
  { name: 'Downward ribbon', category: 'Transitions', recipe: tone(1105, 0.85, 1600, 130, 0.03, 0.5) },
  { name: 'Air punctuation', category: 'Accents', recipe: noise(1201, 0.18, 7500, 3000, 0.005, 0.15, 0, 'WHITE') },
  { name: 'Round knock', category: 'Accents', recipe: tone(1202, 0.15, 190, 70, 0.003, 0.14) },
  { name: 'Rubber drop', category: 'Accents', recipe: tone(1203, 0.36, 540, 90, 0.003, 0.3) },
  { name: 'Low punctuation', category: 'Accents', recipe: noise(1204, 0.45, 220, 45, 0.01, 0.4) },
  { name: 'Tiny glass tone', category: 'Accents', recipe: tone(1205, 0.65, 2349.32, 2349.32, 0.003, 0.64) },
  { name: 'Friendly ping', category: 'Signals', recipe: tone(1301, 0.35, 880, 880, 0.01, 0.25) },
  { name: 'Double beacon', category: 'Signals', recipe: tone(1302, 0.65, 660, 660, 0.01, 0.05, 3) },
  { name: 'Countdown ticks', category: 'Signals', recipe: tone(1303, 2.1, 1100, 1100, 0.003, 0.05, 2) },
  { name: 'Question chirp', category: 'Signals', recipe: tone(1304, 0.32, 440, 990, 0.03, 0.08) },
  { name: 'Answer chirp', category: 'Signals', recipe: tone(1305, 0.4, 990, 440, 0.02, 0.2) },
  { name: 'Distant ventilation', category: 'Ambience', recipe: noise(1401, 12, 130, 130, 0.8, 0.8) },
  { name: 'Steady air', category: 'Ambience', recipe: noise(1402, 10, 1300, 1300, 0.5, 0.5) },
  { name: 'Tidal wash', category: 'Ambience', recipe: noise(1403, 14, 700, 900, 1, 1, 0.2) },
  { name: 'Soft static', category: 'Ambience', recipe: noise(1404, 8, 4000, 4000, 0.4, 0.4, 0, 'WHITE') },
  { name: 'Low flutter', category: 'Ambience', recipe: noise(1405, 10, 220, 350, 0.5, 0.8, 6) },
  { name: 'C warm foundation', category: 'Cue building blocks', recipe: tone(1501, 2.5, 261.6256, 261.6256, 0.12, 1.8) },
  { name: 'E gentle third', category: 'Cue building blocks', recipe: tone(1502, 2.5, 329.6276, 329.6276, 0.16, 1.8) },
  { name: 'G open fifth', category: 'Cue building blocks', recipe: tone(1503, 2.5, 391.9954, 391.9954, 0.2, 1.8) },
  { name: 'C upper sparkle', category: 'Cue building blocks', recipe: tone(1504, 1.8, 523.2511, 523.2511, 0.01, 1.7) },
  { name: 'A thoughtful pulse', category: 'Cue building blocks', recipe: tone(1505, 3, 440, 440, 0.1, 0.5, 2) },
];
export const starterSoundAttribution = {
  creator: 'Foley original synthesis', sourceUrl: '', license: 'Original synthesized audio', licenseUrl: '',
  notes: 'Generated locally from the versioned Foley starter recipes. No external recordings or sample libraries. Member credits may be added separately.',
};
