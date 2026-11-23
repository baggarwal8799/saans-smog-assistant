import { describe, expect, it } from 'vitest';

import { LIMITS } from './contract.js';
import { COORD_DECIMALS, coords, placeKey, placeLabel, toPlace } from './place.js';

describe('toPlace', () => {
  it('keeps a valid place, trimming text and leaving out empty or non-text parts', () => {
    expect(toPlace({ name: ' Patna ', lat: 25.6, lon: 85.1, region: ' Bihar', country: 'India', extra: 1 })).toEqual({
      name: 'Patna',
      lat: 25.6,
      lon: 85.1,
      region: 'Bihar',
      country: 'India',
    });
    expect(toPlace({ name: 'Leh', lat: 34.16, lon: 77.58, region: '  ', country: 7 })).toEqual({
      name: 'Leh',
      lat: 34.16,
      lon: 77.58,
    });
  });

  it('caps text at the API limits, so the server accepts whatever the browser keeps', () => {
    const place = toPlace({ name: 'x'.repeat(200), lat: 1, lon: 2, country: 'y'.repeat(200) });
    expect(place).toEqual({
      name: 'x'.repeat(LIMITS.shortText),
      lat: 1,
      lon: 2,
      country: 'y'.repeat(LIMITS.placePart),
    });
  });

  it.each([
    ['not an object', 'Delhi'],
    ['an array', [28.6, 77.2]],
    ['null', null],
    ['no name', { lat: 1, lon: 2 }],
    ['a blank name', { name: '  ', lat: 1, lon: 2 }],
    ['a text latitude', { name: 'A', lat: '28.6', lon: 2 }],
    ['an impossible latitude', { name: 'A', lat: 90.5, lon: 2 }],
    ['an impossible longitude', { name: 'A', lat: 1, lon: -180.5 }],
    ['NaN', { name: 'A', lat: Number.NaN, lon: 2 }],
    ['Infinity', { name: 'A', lat: 1, lon: Number.POSITIVE_INFINITY }],
  ])('rejects %s', (_, raw) => {
    expect(toPlace(raw)).toBeNull();
  });

  it('accepts the poles and the antimeridian', () => {
    expect(toPlace({ name: 'Pole', lat: -90, lon: 180 })).toEqual({ name: 'Pole', lat: -90, lon: 180 });
  });
});

describe('coordinate keys', () => {
  const place = { lat: 28.61394, lon: 77.20902 };

  it('rounds to the precision of each purpose, or keeps the coordinates exact', () => {
    expect(placeKey(place, COORD_DECIMALS.grid)).toBe('28.61,77.21');
    expect(placeKey(place, COORD_DECIMALS.summary)).toBe('28.614,77.209');
    expect(placeKey(place)).toBe('28.61394,77.20902');
    expect(coords({ lat: -0.5, lon: 3 }, COORD_DECIMALS.grid)).toEqual(['-0.50', '3.00']);
  });
});

describe('placeLabel', () => {
  it('joins the parts that exist', () => {
    expect(placeLabel({ name: 'Patna', lat: 0, lon: 0, region: 'Bihar', country: 'India' })).toBe(
      'Patna, Bihar, India',
    );
    expect(placeLabel({ name: 'Here', lat: 0, lon: 0 })).toBe('Here');
  });
});
