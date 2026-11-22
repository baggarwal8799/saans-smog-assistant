/** Errors from a Gemini attempt: an upstream HTTP failure, or the global daily cap refusing the attempt. */

export class GeminiError extends Error {
  /** `detail` is Gemini's own error text: logged on the server for debugging, never sent to the browser. */
  constructor(
    readonly status: number,
    readonly detail = '',
  ) {
    super(detail ? `Gemini HTTP ${status}: ${detail}` : `Gemini HTTP ${status}`);
  }
}

/** The global daily cap refused an upstream attempt: the chain stops at once instead of trying the next model. */
export class CapReachedError extends GeminiError {
  constructor() {
    super(429, 'daily AI call ceiling reached');
  }
}
