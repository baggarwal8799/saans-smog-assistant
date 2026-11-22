import { handleAssistant } from './_lib/assistant.js';

/** Vercel Function (Node.js runtime, Web-standard handler). The Gemini key stays server-side. */
export function POST(request: Request): Promise<Response> {
  return handleAssistant(request, process.env);
}
