/** Numbers as the plan text quotes them. */
import { round } from '../impact.js';

/** A figure rounded to `digits` decimals, as written in the plan text ("12", "1.5"). */
export const num = (value: number, digits = 0): string => String(round(value, digits));
