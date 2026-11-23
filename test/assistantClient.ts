/**
 * The assistant client for component tests: the real module with `askAssistant` answering at once with
 * "Answer for <mode>". Use it with
 * `vi.mock('../lib/assistantClient.js', (importOriginal) => withInstantAnswers(importOriginal))`.
 */
import { vi } from 'vitest';

import type * as client from '../src/lib/assistantClient.js';

type Client = typeof client;

export async function withInstantAnswers(importOriginal: () => Promise<Client>): Promise<Client> {
  return {
    ...(await importOriginal()),
    askAssistant: vi.fn(async ({ mode }: { mode: string }) => ({ text: `Answer for ${mode}` })),
  };
}
