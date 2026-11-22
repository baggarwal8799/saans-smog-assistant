/** Wording and thresholds shared by several rules. */
import { habitRatio, indoorCut, round, shutRatio } from '../impact.js';
import type { Commute, Profile } from '../types.js';
import { bilingual, type Text } from './text.js';

/** The US AQI quoted to schools and societies: above it, sports move indoors (EPA "Unhealthy" starts at 151). */
export const HEAVY_EXERTION_AQI = 150;
/** Ozone (µg/m³) averaged over the peak window from which ozone timing advice is worth giving (≈ 51 ppb). */
export const OZONE_CONCERN_UG = 100;

/** Added to any tip that says to shut windows while the home burns fuel, which needs air against carbon monoxide. */
export const CO_CAVEAT = bilingual(
  ' If anything is burning indoors, keep a window slightly open and never sleep with it lit.',
  ' अगर घर में कुछ भी जल रहा हो, तो एक खिड़की थोड़ी खुली रखें और उसे जलता छोड़कर कभी न सोएँ।',
);

/** Metro lines exist in few cities, so every metro suggestion is conditional on one serving the route. */
export const METRO_IF = bilingual('if a metro line serves your route', 'अगर आपके रास्ते पर मेट्रो लाइन हो');

/** Shutting the windows, worked out from this household's own indoor habit for every tip that asks for it. */
export function shut(p: Profile): { cut: number; working: Text } {
  const now = round(habitRatio(p) * 100);
  const after = round(shutRatio(p) * 100);
  const cut = indoorCut(p);
  return {
    cut,
    working: bilingual(
      `Shut windows keep indoor PM2.5 near ${after}% of outside instead of the ≈ ${now}% your home has now: ${cut}% less.`,
      `बंद खिड़कियों से अंदर का PM2.5 बाहर का लगभग ${after}% रहता है, अभी घर में ≈ ${now}% की जगह: ${cut}% कम।`,
    ),
  };
}

export const SCOPE = {
  outdoors: bilingual('outdoors', 'बाहर'),
  exercise: bilingual('while exercising', 'व्यायाम के दौरान'),
  home: bilingual('at home', 'घर पर'),
  kitchen: bilingual('in the kitchen', 'रसोई में'),
  vulnerable: bilingual('for them in that window', 'उस समय उनके लिए'),
} as const;

export const MODE_NAME: Readonly<Record<Commute, Text>> = {
  car: bilingual('car', 'कार'),
  motorbike: bilingual('motorbike', 'मोटरसाइकिल'),
  auto: bilingual('auto-rickshaw', 'ऑटो'),
  bus: bilingual('bus', 'बस'),
  metro: bilingual('metro', 'मेट्रो'),
  bicycle: bilingual('bicycle', 'साइकिल'),
  walk: bilingual('walking', 'पैदल'),
  wfh: bilingual('home', 'घर'),
};
