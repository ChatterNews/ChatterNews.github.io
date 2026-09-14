import type { CreativeFinding } from './types.js';

export type { CreativeFinding, CreativeMode, CreativeRecipeState, CreativeRole } from './types.js';

const STARTER_PHRASES = new Set([
  'the story starts here',
  'reporter name',
  'a quote worth hearing',
  'of students said yes',
  'your headline here',
  'add your story here',
  'event details here',
  'coming up next',
]);

function rgb(hex: string): [number, number, number] | undefined {
  const raw = hex.trim().replace(/^#/, '');
  const expanded = raw.length === 3 ? [...raw].map((part) => part + part).join('') : raw;
  if (!/^[0-9a-f]{6}$/i.test(expanded)) return undefined;
  return [0, 2, 4].map((at) => Number.parseInt(expanded.slice(at, at + 2), 16)) as [number, number, number];
}

function luminance(hex: string): number | undefined {
  const color = rgb(hex);
  if (!color) return undefined;
  const channels = color.map((value) => {
    const channel = value / 255;
    return channel <= .04045 ? channel / 12.92 : Math.pow((channel + .055) / 1.055, 2.4);
  });
  return channels[0]! * .2126 + channels[1]! * .7152 + channels[2]! * .0722;
}

export function contrastRatio(foreground: string, background: string): number {
  const a = luminance(foreground);
  const b = luminance(background);
  if (a === undefined || b === undefined) return 1;
  const light = Math.max(a, b);
  const dark = Math.min(a, b);
  return Math.round(((light + .05) / (dark + .05)) * 100) / 100;
}

export function looksLikeStarterCopy(text: string | undefined): boolean {
  if (!text) return false;
  return STARTER_PHRASES.has(text.toLowerCase().replace(/[“”'".!?]/g, '').replace(/\s+/g, ' ').trim());
}

export function minimumReadableDurationMs(text: string | undefined): number {
  const words = text?.trim().split(/\s+/).filter(Boolean).length ?? 0;
  return Math.round(Math.max(1800, words / 3.2 * 1000 + 700));
}

export function blockingFindings(findings: readonly CreativeFinding[]): CreativeFinding[] {
  return findings.filter((finding) => finding.severity === 'BLOCKING');
}
