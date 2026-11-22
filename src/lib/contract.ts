/** Request/response contract shared by the browser client and the serverless function. */
import type { Place, Profile } from './types.js';
export type AssistantLang = 'en' | 'hi';
export type AssistantMode = 'summary' | 'question';
/** The yes/no reply the server's US EPA verdict gives (verdict.ts). */
export type EpaReply = 'yes' | 'no';

export interface AssistantRec {
  title: string;
  impact: string;
  /** Which section shows it: "Safety first", "Do these first" (at most 3) or "More ways to help". */
  group: 'safety' | 'first' | 'more';
}

/** Built on the server from its own air data and plan; never accepted from the browser. */
export interface AssistantContext {
  place: string;
  localTime: string;
  /** "10:30": when the reading was taken, quoted with it so a later update never reads as a contradiction. */
  readingTime: string;
  usAqi: number;
  pm25: number;
  level: string;
  /** The US EPA cautionary statement for today's AQI band (verdict.ts EPA_BANDS); absent for Good air. */
  epaBand?: string;
  bestWindow: string;
  worstWindow: string;
  smogTrap: string;
  /** PM2.5 for each of the next 24 hours, e.g. "14:00 54, 15:00 51, …", so the model can answer "at 7:30?". */
  hourly: string;
  /** Where the current time stands against the smog trap and the most polluted window, on full date-times. */
  now: string;
  /** Spans in the next 24 h fit for outdoor activity for this household: the only source of a time to go out. */
  outdoorHours: string;
  /** One computed fact line per time the user mentioned ("Asked time 07:30 tomorrow: … INSIDE the smog trap …"). */
  askedTimes: string[];
  /** The server's US EPA yes/no for everyone asked about; a yes/no answer opens with it, whatever the model said. */
  epaReply?: EpaReply;
  household: string;
  recommendations: AssistantRec[];
  /** Combined totals of the full plan; each is left out when it is zero, so the model never writes "0 kg". */
  doseCutPct?: number;
  co2KgPerMonth?: number;
  cigarettesPerDay: number;
}

/** What the browser may send: who and where. The server derives everything else itself. */
export interface AssistantRequest {
  lang: AssistantLang;
  mode: AssistantMode;
  question: string;
  place: Place;
  profile: Profile;
  /**
   * Up to three of the user's own earlier questions, so follow-ups ("and for my father?") make sense. Never model
   * answers: a client could forge those to plant "facts", while a question is text it could type anyway.
   */
  history: string[];
}

/** Error codes the client turns into a message in the user's language. */
export type AssistantUiErrorCode =
  'not_configured' | 'ai_rate_limited' | 'ai_unavailable' | 'too_many_requests' | 'daily_limit';

/**
 * Codes for a request the app itself never sends (wrong method, type, origin, size or shape) and for a server
 * fault. The client has no message of its own for them and shows its "unavailable" one.
 */
export type AssistantRequestErrorCode =
  | 'method_not_allowed'
  | 'unsupported_media_type'
  | 'forbidden_origin'
  | 'too_large'
  | 'invalid_request'
  | 'internal_error';

/** Every API error body is `{ error: <one of these> }`, never English text. */
export type AssistantErrorCode = AssistantUiErrorCode | AssistantRequestErrorCode;

export interface AssistantResponse {
  text: string;
}

export const LIMITS = {
  /** Room for the question plus three earlier turns in Hindi (3 bytes per Devanagari letter). */
  bodyBytes: 15_000,
  historyTurns: 3,
  question: 400,
  shortText: 120,
  placePart: 80,
  longText: 300,
  recs: 12,
} as const;
