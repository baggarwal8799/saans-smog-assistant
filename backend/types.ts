/** What the handler is given from outside: its environment and its logger. */

export interface StoreEnv {
  UPSTASH_REDIS_REST_URL?: string | undefined;
  UPSTASH_REDIS_REST_TOKEN?: string | undefined;
}

export interface AssistantEnv extends StoreEnv {
  GEMINI_API_KEY?: string | undefined;
  GEMINI_MODEL?: string | undefined;
  /** Ceiling on Gemini calls per UTC day (default 1000); shared across instances only with Upstash. */
  MAX_AI_CALLS_PER_DAY?: string | undefined;
  /** Ceiling on answered requests per client address per UTC day (default 60); shared the same way. */
  MAX_AI_REQUESTS_PER_CLIENT_PER_DAY?: string | undefined;
}

/** Injectable, so tests pass a silent logger and nothing logged can reach the client. */
export type Logger = Pick<Console, 'warn'>;
