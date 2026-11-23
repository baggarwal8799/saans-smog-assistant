/**
 * Named parts of an ISO date-time ("2026-11-18T07:30" or a full `toISOString()`), taken by position. Forecast
 * times are local wall-clock strings, so they are cut, never parsed: parsing would shift them to the runtime's zone.
 */
export const isoDate = (time: string): string => time.slice(0, 10);
export const isoDateHour = (time: string): string => time.slice(0, 13);
export const isoMinute = (time: string): string => time.slice(0, 16);
export const isoHour = (time: string): string => time.slice(11, 13);
export const isoClock = (time: string): string => time.slice(11, 16);
