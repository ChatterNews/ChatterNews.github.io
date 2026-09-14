const ROOM_ALIASES: Readonly<Record<string, string>> = {
  '': 'clubhouse',
  garage: 'studio',
};

export function atmosphereRoomFromPathname(pathname: string): string {
  const room = pathname.split(/[/?#]/).filter(Boolean)[0] ?? '';
  return ROOM_ALIASES[room] ?? room;
}

export interface PointerTrailConditions {
  finePointer: boolean;
  hover: boolean;
  reducedMotion: boolean;
}

export function pointerTrailEnabled(conditions: PointerTrailConditions): boolean {
  return conditions.finePointer && conditions.hover && !conditions.reducedMotion;
}
