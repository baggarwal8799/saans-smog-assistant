import { describe, expect, it } from 'vitest';

import { ttlCache } from './ttlCache.js';

describe('ttlCache', () => {
  it('serves a value until it is ttl old, then forgets it', () => {
    const cache = ttlCache<string>(1000, 10);
    cache.set('a', 'A', 0);
    expect(cache.get('a', 999)).toBe('A');
    expect(cache.get('a', 1000)).toBeUndefined();
    expect(cache.size).toBe(0);
    expect(cache.get('missing', 0)).toBeUndefined();
  });

  it('drops expired entries on every write, keeping fresh ones', () => {
    const cache = ttlCache<number>(1000, 10);
    cache.set('old', 1, 0);
    cache.set('newer', 2, 500);
    cache.set('now', 3, 1200);
    expect(cache.size).toBe(2);
    expect(cache.get('newer', 1200)).toBe(2);
    expect(cache.get('old', 1200)).toBeUndefined();
  });

  it('evicts the oldest write past the cap, and counts a rewrite as new', () => {
    const cache = ttlCache<number>(60_000, 2);
    cache.set('a', 1, 0);
    cache.set('b', 2, 1);
    cache.set('a', 10, 2);
    cache.set('c', 3, 3);
    expect(cache.get('b', 3)).toBeUndefined();
    expect(cache.get('a', 3)).toBe(10);
    expect(cache.get('c', 3)).toBe(3);
    cache.clear();
    expect(cache.size).toBe(0);
  });

  it('stores nothing, and still returns, when the cap is below zero', () => {
    const cache = ttlCache<number>(60_000, -1);
    cache.set('a', 1, 0);
    expect(cache.size).toBe(0);
  });
});
