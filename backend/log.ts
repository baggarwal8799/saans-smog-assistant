/** Only an error's message is logged: a stack or an upstream body could carry the request's own text. */
export const errorText = (err: unknown): string => (err instanceof Error ? err.message : 'unknown');
