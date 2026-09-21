/** Level-based assistance, not speaker recognition. Similar-level overlaps stay open. */
export interface VoiceLevels { id: string; levels: Float32Array }
export const VOICE_LEVEL_HZ = 20;
export function quieterMicCurves(voices: VoiceLevels[]): Map<string, Float32Array> {
  const result = new Map<string, Float32Array>();
  if (voices.length < 2) return result;
  const length = Math.max(...voices.map(v => v.levels.length));
  const normalized = voices.map(v => {
    const active = Array.from(v.levels).filter(x => Number.isFinite(x) && x > .0001).sort((a, b) => a - b);
    const normal = Math.max(.002, active[Math.floor(active.length * .85)] ?? .002);
    return v.levels.map(x => Number.isFinite(x) && x > .0003 ? Math.min(2, x / normal) : 0);
  });
  const gains = voices.map(() => 1), hold = voices.map(() => 0);
  const curves = voices.map(v => { const curve = new Float32Array(length); result.set(v.id, curve); return curve; });
  const floor = Math.pow(10, -9 / 20);
  for (let i = 0; i < length; i++) {
    const loudest = Math.max(...normalized.map(v => v[i] ?? 0));
    for (let v = 0; v < voices.length; v++) {
      const level = normalized[v]![i] ?? 0;
      // Keep competing speakers and a short tail; never hard-mute a microphone.
      if (level >= Math.max(.12, loudest * .5)) hold[v] = 4;
      const target = hold[v]! > 0 ? 1 : floor;
      hold[v] = Math.max(0, hold[v]! - 1);
      const coefficient = target > gains[v]! ? .75 : .15;
      gains[v] = gains[v]! + (target - gains[v]!) * coefficient;
      curves[v]![i] = gains[v]!;
    }
  }
  return result;
}
