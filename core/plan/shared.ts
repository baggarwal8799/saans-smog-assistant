/** Thresholds and workings shared by several rules. */
import type { Text } from '../copy/text.js';
import { habitRatio, indoorCut, round, shutRatio } from '../impact.js';
import type { Profile } from '../types.js';
import { shutWorking } from './copy/shared.js';

/** The US AQI quoted to schools and societies: above it, sports move indoors (EPA "Unhealthy" starts at 151). */
export const HEAVY_EXERTION_AQI = 150;
/** Ozone (µg/m³) averaged over the peak window from which ozone timing advice is worth giving (≈ 51 ppb). */
export const OZONE_CONCERN_UG = 100;

/** Shutting the windows, worked out from this household's own indoor habit for every tip that asks for it. */
export function shut(profile: Profile): { cut: number; working: Text } {
  const cut = indoorCut(profile);
  return {
    cut,
    working: shutWorking({ now: round(habitRatio(profile) * 100), after: round(shutRatio(profile) * 100), cut }),
  };
}
