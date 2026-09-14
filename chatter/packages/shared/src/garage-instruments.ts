import type { GarageTrackKind } from './garage.js';

export type GarageInstrumentCategory = 'KEYS' | 'SYNTH' | 'BASS' | 'PAD' | 'DRUMS';
export type GarageInstrumentEngine = 'NEON' | 'CUBED' | 'VAPORISATEUR' | 'PLAYFIELD';
export type GarageInstrumentControl = 'tone' | 'character' | 'attack' | 'release' | 'motion' | 'width';
export type GarageInstrumentControls = Record<GarageInstrumentControl, number>;

export interface GarageInstrumentPreset {
  id: string;
  name: string;
  category: GarageInstrumentCategory;
  kind: Exclude<GarageTrackKind, 'AUDIO' | 'SAMPLER'>;
  engine: GarageInstrumentEngine;
  description: string;
  tags: string[];
  icon: string;
  color: string;
  octave: number;
  /** Drum-pad names in chromatic order from MIDI note 36. */
  padNames?: string[];
  controls: GarageInstrumentControls;
  patch: Record<string, number>;
}

const controls = (
  tone = .62, character = .35, attack = .04, release = .3, motion = .08, width = .25,
): GarageInstrumentControls => ({ tone, character, attack, release, motion, width });

/**
 * Chatter's built-in OpenDAW sound library. Melodic sounds are synthesized
 * locally; drum kits use the bundled, offline CC0 one-shot library.
 */
export const GARAGE_INSTRUMENT_PRESETS: readonly GarageInstrumentPreset[] = [
  { id: 'studio-keys', name: 'Digital Keys', category: 'KEYS', kind: 'KEYS', engine: 'NEON', description: 'Clear digital keys for chords, hooks, and melodies.', tags: ['clean', 'digital', 'starter'], icon: '♬', color: '#74E1F1', octave: 4, controls: controls(.58, .22, .03, .28, .04, .2), patch: { lineSelect: 0, modulation: 0, wave1: 2, wave2: 0 } },
  { id: 'soft-electric', name: 'Velvet Keys', category: 'KEYS', kind: 'KEYS', engine: 'NEON', description: 'Rounded keys with a soft attack and gentle release.', tags: ['soft', 'warm', 'chords'], icon: '♬', color: '#AEE8D8', octave: 4, controls: controls(.42, .18, .08, .48, .07, .34), patch: { lineSelect: 2, modulation: 1, wave1: 1, wave2: 0 } },
  { id: 'glass-keys', name: 'Glass Keys', category: 'KEYS', kind: 'KEYS', engine: 'NEON', description: 'Bright digital keys with a bell-like edge.', tags: ['bright', 'bell', 'digital'], icon: '✧', color: '#A8D7FF', octave: 5, controls: controls(.82, .62, .01, .42, .12, .45), patch: { lineSelect: 1, modulation: 2, wave1: 6, wave2: 2 } },
  { id: 'school-organ', name: 'House Organ', category: 'KEYS', kind: 'KEYS', engine: 'NEON', description: 'Steady organ tone for dance chords and hooks.', tags: ['organ', 'house', 'sustain'], icon: '▥', color: '#F6D276', octave: 4, controls: controls(.54, .32, .01, .18, .06, .42), patch: { lineSelect: 3, modulation: 0, wave1: 3, wave2: 3 } },
  { id: 'toy-piano', name: 'Toy Bell', category: 'KEYS', kind: 'KEYS', engine: 'NEON', description: 'Small, bright bell keys for quick melodies.', tags: ['toy', 'bell', 'bright'], icon: '◇', color: '#FFB36A', octave: 5, controls: controls(.76, .48, .01, .12, .03, .22), patch: { lineSelect: 1, modulation: 1, wave1: 7, wave2: 4 } },

  { id: 'pop-lead', name: 'Pop Lead', category: 'SYNTH', kind: 'KEYS', engine: 'VAPORISATEUR', description: 'Focused saw lead that cuts through a chorus.', tags: ['lead', 'wide', 'pop'], icon: '⌁', color: '#FF6DAD', octave: 4, controls: controls(.68, .24, .02, .18, .12, .58), patch: { wave1: 2, wave2: 2, osc1: -6, osc2: -11, osc2Tune: 7, unison: 3, filterEnvelope: .22, mono: 1 } },
  { id: 'soft-lead', name: 'Glide Lead', category: 'SYNTH', kind: 'KEYS', engine: 'VAPORISATEUR', description: 'Smooth solo lead with rounded edges and light glide.', tags: ['lead', 'smooth', 'glide'], icon: '⌁', color: '#E7A6FF', octave: 4, controls: controls(.48, .18, .06, .28, .32, .32), patch: { wave1: 1, wave2: 0, osc1: -5, osc2: -15, osc2Tune: 0, glide: .14, unison: 2, mono: 1 } },
  { id: 'arcade-lead', name: 'Arcade Lead', category: 'SYNTH', kind: 'KEYS', engine: 'VAPORISATEUR', description: 'Square-wave solo sound for quick, game-like hooks.', tags: ['square', 'arcade', 'sharp'], icon: '▦', color: '#9DFF73', octave: 5, controls: controls(.72, .42, .01, .12, .18, .12), patch: { wave1: 3, wave2: 3, osc1: -6, osc2: -14, osc2Octave: 1, osc2Tune: -12, unison: 1, mono: 1 } },
  { id: 'pluck-synth', name: 'Pluck Synth', category: 'SYNTH', kind: 'KEYS', engine: 'VAPORISATEUR', description: 'Short plucked synth for repeating patterns.', tags: ['pluck', 'short', 'pattern'], icon: '◆', color: '#FFD85D', octave: 4, controls: controls(.7, .42, .01, .09, .24, .3), patch: { wave1: 2, wave2: 1, osc1: -5, osc2: -13, filterEnvelope: .76, sustain: .08, decay: .16 } },
  { id: 'synth-brass', name: 'Synth Brass', category: 'SYNTH', kind: 'KEYS', engine: 'VAPORISATEUR', description: 'Layered brass-style synth for stabs and chords.', tags: ['brass', 'chords', 'stabs'], icon: '◖', color: '#FF9B4A', octave: 4, controls: controls(.64, .45, .09, .24, .05, .64), patch: { wave1: 2, wave2: 3, osc1: -4, osc2: -9, osc2Tune: -7, filterEnvelope: .38, unison: 3 } },

  { id: 'deep-sub', name: 'Deep Sub', category: 'BASS', kind: 'BASS', engine: 'VAPORISATEUR', description: 'Clean low sine bass for weight under a track.', tags: ['sub', 'clean', 'low'], icon: '◉', color: '#44D6D2', octave: 2, controls: controls(.26, .12, .01, .22, .01, .04), patch: { wave1: 0, wave2: 0, osc1: -2, osc2: -18, osc2Octave: 0, unison: 1, sustain: .72 } },
  { id: 'round-bass', name: 'Round Bass', category: 'BASS', kind: 'BASS', engine: 'VAPORISATEUR', description: 'Warm bass for pop, R&B, and laid-back tracks.', tags: ['warm', 'round', 'pop'], icon: '◉', color: '#55E0B4', octave: 2, controls: controls(.42, .2, .02, .25, .05, .16), patch: { wave1: 1, wave2: 0, osc1: -3, osc2: -11, osc2Octave: -1, unison: 1, filterEnvelope: .3 } },
  { id: 'acid-bass', name: 'Acid Bass', category: 'BASS', kind: 'BASS', engine: 'CUBED', description: 'Resonant bass for moving electronic lines.', tags: ['acid', 'resonant', 'electronic'], icon: '◉', color: '#B9EE46', octave: 2, controls: controls(.58, .76, .01, .38, .68, .62), patch: { waveform: 0, cutoff: .5, resonance: .78, envMod: .8, decay: .46, accent: .72 } },
  { id: 'square-bass', name: 'Square Bass', category: 'BASS', kind: 'BASS', engine: 'CUBED', description: 'Hollow square bass with a sharp attack.', tags: ['square', 'short', 'electronic'], icon: '◉', color: '#80C8FF', octave: 2, controls: controls(.46, .56, .01, .2, .52, .35), patch: { waveform: 1, cutoff: .42, resonance: .58, envMod: .64, decay: .24, accent: .48 } },
  { id: 'reese-bass', name: 'Wide Bass', category: 'BASS', kind: 'BASS', engine: 'VAPORISATEUR', description: 'Detuned bass with width for louder sections.', tags: ['wide', 'detuned', 'heavy'], icon: '◉', color: '#A98BFF', octave: 2, controls: controls(.5, .5, .03, .34, .16, .86), patch: { wave1: 2, wave2: 2, osc1: -6, osc2: -8, osc2Tune: -11, unison: 5, filterEnvelope: .18 } },

  { id: 'warm-pad', name: 'Warm Pad', category: 'PAD', kind: 'PAD', engine: 'VAPORISATEUR', description: 'Slow, warm pad for filling the background.', tags: ['warm', 'slow', 'chords'], icon: '≈', color: '#FF9778', octave: 4, controls: controls(.42, .22, .52, .72, .16, .78), patch: { wave1: 2, wave2: 1, osc1: -8, osc2: -11, osc2Tune: 7, unison: 5, filterEnvelope: .1 } },
  { id: 'glass-pad', name: 'Glass Pad', category: 'PAD', kind: 'PAD', engine: 'VAPORISATEUR', description: 'Bright, airy pad with gentle movement.', tags: ['bright', 'air', 'motion'], icon: '≈', color: '#82E7FF', octave: 4, controls: controls(.68, .35, .46, .78, .46, .82), patch: { wave1: 1, wave2: 0, osc1: -7, osc2: -13, osc2Octave: 1, unison: 4, noise: -32 } },
  { id: 'dark-pad', name: 'Dark Pad', category: 'PAD', kind: 'PAD', engine: 'VAPORISATEUR', description: 'Low, muted pad for tension and atmosphere.', tags: ['dark', 'low', 'atmosphere'], icon: '≈', color: '#7564B8', octave: 3, controls: controls(.25, .48, .6, .82, .32, .68), patch: { wave1: 2, wave2: 3, osc1: -10, osc2: -15, osc2Octave: -1, unison: 3, noise: -38 } },
  { id: 'choir-pad', name: 'Vowel Pad', category: 'PAD', kind: 'PAD', engine: 'NEON', description: 'Digital vowel-like pad for long chords.', tags: ['vowel', 'digital', 'slow'], icon: '≈', color: '#E5B7FF', octave: 4, controls: controls(.54, .66, .42, .76, .3, .72), patch: { lineSelect: 3, modulation: 2, wave1: 5, wave2: 7 } },
  { id: 'space-pad', name: 'Space Pad', category: 'PAD', kind: 'PAD', engine: 'VAPORISATEUR', description: 'Wide pad with more movement and a long tail.', tags: ['wide', 'motion', 'long'], icon: '≈', color: '#8C9DFF', octave: 4, controls: controls(.58, .38, .7, .9, .72, .95), patch: { wave1: 1, wave2: 2, osc1: -9, osc2: -12, osc2Tune: 12, unison: 7, noise: -36 } },

  { id: 'trap-essentials', name: 'Trap Essentials', category: 'DRUMS', kind: 'DRUMS', engine: 'PLAYFIELD', description: 'Heavy kicks and 808s, sharp snares, fast hats, and dark percussion.', tags: ['trap', '808', 'hard'], icon: '▦', color: '#FF5D79', octave: 2, padNames: ['Hard Kick', 'Kick Alt', 'Kick Knock', '808 Dist', '808 Sub', 'Snare', 'Snare Tight', 'Snare Alt', 'Clap', 'Clap Alt', 'Closed Hat', 'Hat Alt', 'Open Hat', 'Cowbell', 'Rim', 'Crash FX'], controls: controls(.5, .72, .01, .3, .08, .58), patch: { kit: 0 } },
  { id: 'pop-bounce', name: 'Pop Bounce', category: 'DRUMS', kind: 'DRUMS', engine: 'PLAYFIELD', description: 'Round kicks, clean 808s, bright claps, and crisp pop percussion.', tags: ['pop', 'bounce', 'clean'], icon: '▦', color: '#65DFFF', octave: 2, padNames: ['Kick', 'Kick Soft', 'Kick Punch', '808 Long', '808 Punch', 'Snare', 'Snare Snap', 'Snare Alt', 'Clap', 'Clap Wide', 'Closed Hat', 'Open Hat', 'High Tom', 'Low Tom', '808 Round', 'Crash FX'], controls: controls(.52, .46, .01, .24, .04, .72), patch: { kit: 1 } },
  { id: 'dusty-808', name: 'Dusty 808', category: 'DRUMS', kind: 'DRUMS', engine: 'PLAYFIELD', description: 'Warm, worn drums for lo-fi, soul, and boom-bap grooves.', tags: ['lo-fi', 'soul', 'warm'], icon: '▦', color: '#D8B47D', octave: 2, padNames: ['Vinyl Kick', 'Kick Soft', 'Kick Knock', '808 Warm', '808 Short', 'Snare', 'Snare Dust', 'Snare Alt', 'Clap', 'Clap Dust', 'Closed Hat', 'Open Hat', 'Open Hat Alt', 'Maraca', 'Lo-Fi Tom', 'Crash Dust'], controls: controls(.42, .68, .01, .18, .02, .48), patch: { kit: 2 } },
  { id: 'festival-pop', name: 'Festival Pop', category: 'DRUMS', kind: 'DRUMS', engine: 'PLAYFIELD', description: 'Big four-on-the-floor kicks, claps, bright hats, and impact sounds.', tags: ['dance', 'edm', 'pop'], icon: '▦', color: '#B899FF', octave: 2, padNames: ['Dance Kick', 'Kick Punch', 'Kick Low', 'Sub Drop', 'Bass Hit', 'Snare Big', 'Snare Tight', 'Rim', 'Clap Bright', 'Clap Wide', 'Closed Hat', 'Hat Alt', 'Open Hat', 'High Tom', 'Low Tom', 'Crash FX'], controls: controls(.56, .58, .01, .32, .03, .9), patch: { kit: 3 } },
] as const;

export function instrumentPreset(id?: string): GarageInstrumentPreset {
  return GARAGE_INSTRUMENT_PRESETS.find((preset) => preset.id === id) ?? GARAGE_INSTRUMENT_PRESETS[0]!;
}

export function defaultInstrumentPreset(kind: GarageTrackKind): GarageInstrumentPreset | undefined {
  if (kind === 'AUDIO' || kind === 'SAMPLER') return undefined;
  const id = kind === 'KEYS' ? 'studio-keys' : kind === 'BASS' ? 'round-bass' : kind === 'PAD' ? 'warm-pad' : 'trap-essentials';
  return instrumentPreset(id);
}
