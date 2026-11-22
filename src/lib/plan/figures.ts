/**
 * Forecast weather figures as the plan and the UI write them. The forecast model cannot resolve a mixing layer or a
 * wind below a floor, so a value at or under it is not a measurement: it is written as "under" the floor instead of
 * as a precise figure.
 */
import { bilingual, type Text } from './text.js';
import { num } from './format.js';

/** Mixing heights at or below this are the model's floor, not a reading, metres. */
export const MIXING_FLOOR_M = 50;
/** Winds at or below this are calm air the model cannot tell apart, km/h. */
export const WIND_FLOOR_KMH = 2;

const KINDS = {
  mixing: { floor: MIXING_FLOOR_M, unit: bilingual('m', 'मीटर') },
  wind: { floor: WIND_FLOOR_KMH, unit: bilingual('km/h', 'किमी/घंटा') },
} as const;

/** "≈ 120 m" / "≈ 120 मीटर", or "under 50 m" / "50 मीटर से कम" at or below the floor. */
export function weatherFigure(kind: keyof typeof KINDS, value: number): Text {
  const { floor, unit } = KINDS[kind];
  if (value <= floor) return bilingual(`under ${floor} ${unit.en}`, `${floor} ${unit.hi} से कम`);
  return bilingual(`≈ ${num(value)} ${unit.en}`, `≈ ${num(value)} ${unit.hi}`);
}
