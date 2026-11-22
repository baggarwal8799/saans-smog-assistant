// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { POST } from './assistant';

describe('Vercel function entry', () => {
  it('delegates to the shared handler', async () => {
    const req = new Request('http://localhost/api/assistant', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'x',
    });
    const res = await POST(req);
    expect(res.status).toBe(415);
  });
});
