/** Guards for reading untrusted JSON from the weather and air services. */

/** A JSON object: never null, and never an array, which would pass `typeof` and then miss every named field. */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** A malformed series reads as "no hours" rather than throwing. */
export const asArray = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);

/** NaN for anything but a finite number, so a gap is skipped instead of counting as zero. */
export function toNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : Number.NaN;
}
