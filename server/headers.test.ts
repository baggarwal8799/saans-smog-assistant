// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { securityHeaders } from './headers.js';

describe('securityHeaders on malformed vercel.json', () => {
  it.each([
    ['not an object', '"x"'],
    ['headers not a list', '{"headers":{}}'],
    ['no global rule', '{"headers":[1,{"source":"/api"}]}'],
    ['global rule without a list', '{"headers":[{"source":"/(.*)","headers":"x"}]}'],
  ])('reads %s as no headers', (_label, json) => {
    expect(securityHeaders(json, { https: true })).toEqual({});
  });

  it('skips entries that are not key and value strings', () => {
    const json = JSON.stringify({
      headers: [{ source: '/(.*)', headers: [null, { key: 'A' }, { key: 'B', value: 1 }, { key: 'C', value: 'c' }] }],
    });
    expect(securityHeaders(json, { https: true })).toEqual({ C: 'c' });
  });
});
