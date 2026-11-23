/** Wording used by several rules: caveats, scopes and mode names. */
import { bilingual, type Text } from '../../copy/text.js';
import type { Commute } from '../../types.js';

/** Added to any tip that says to shut windows while the home burns fuel, which needs air against carbon monoxide. */
export const CO_CAVEAT = bilingual(
  ' If anything is burning indoors, keep a window slightly open and never sleep with it lit.',
  ' अगर घर में कुछ भी जल रहा हो, तो एक खिड़की थोड़ी खुली रखें और उसे जलता छोड़कर कभी न सोएँ।',
);

/** Metro lines exist in few cities, so every metro suggestion is conditional on one serving the route. */
export const METRO_IF = bilingual('if a metro line serves your route', 'अगर आपके रास्ते पर मेट्रो लाइन हो');

/** Indoor PM2.5 as a % of outside with the home's habit now and with windows shut, and the cut between them. */
interface ShutFigures {
  now: number;
  after: number;
  cut: number;
}

export const shutWorking = ({ now, after, cut }: ShutFigures): Text =>
  bilingual(
    `Shut windows keep indoor PM2.5 near ${after}% of outside instead of the ≈ ${now}% your home has now: ${cut}% less.`,
    `बंद खिड़कियों से अंदर का PM2.5 बाहर का लगभग ${after}% रहता है, अभी घर में ≈ ${now}% की जगह: ${cut}% कम।`,
  );

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
