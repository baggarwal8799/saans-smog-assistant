import { describe, expect, it, vi } from 'vitest';
import { jsonResponse } from '../test/fixtures';
import { GEO_API, REVERSE_API, coordsLabel, currentPosition, placeLabel, reverseGeocode, sanitizePlaceQuery, searchPlaces } from './geo';

describe('sanitizePlaceQuery', () => {
  it('keeps letters in any script and strips markup', () => {
    expect(sanitizePlaceQuery('  <b>New   Delhi</b>; ')).toBe('bNew Delhib');
    expect(sanitizePlaceQuery('लखनऊ')).toBe('लखनऊ');
    expect(sanitizePlaceQuery('x'.repeat(200))).toHaveLength(80);
  });
});

describe('searchPlaces', () => {
  it('skips the network for very short queries', async () => {
    const f = vi.fn();
    expect(await searchPlaces('a', 'en', f)).toEqual([]);
    expect(f).not.toHaveBeenCalled();
  });

  it('maps and validates results', async () => {
    const f = vi.fn().mockResolvedValue(
      jsonResponse({
        results: [
          { name: 'Lucknow', latitude: 26.84, longitude: 80.92, admin1: 'Uttar Pradesh', country: 'India' },
          { name: 'Broken' },
          null,
        ],
      }),
    );
    const places = await searchPlaces('Lucknow', 'en', f);
    expect(places).toEqual([{ name: 'Lucknow', lat: 26.84, lon: 80.92, region: 'Uttar Pradesh', country: 'India' }]);
    expect(String(f.mock.calls[0]?.[0])).toContain(GEO_API);
  });

  it('returns no results when the API has none, and throws on HTTP errors', async () => {
    expect(await searchPlaces('Nowhere', 'en', vi.fn().mockResolvedValue(jsonResponse({})))).toEqual([]);
    await expect(searchPlaces('Delhi', 'en', vi.fn().mockResolvedValue(new Response('', { status: 500 })))).rejects.toThrow('500');
  });
});

describe('placeLabel', () => {
  it('joins the parts that exist', () => {
    expect(placeLabel({ name: 'Patna', lat: 0, lon: 0, region: 'Bihar', country: 'India' })).toBe('Patna, Bihar, India');
    expect(placeLabel({ name: 'Here', lat: 0, lon: 0 })).toBe('Here');
  });
});

describe('reverseGeocode', () => {
  it('names a position with city, state and country, sending only rounded coordinates', async () => {
    const f = vi.fn().mockResolvedValue(jsonResponse({ city: 'Lucknow', locality: 'Lucknow', principalSubdivision: 'Uttar Pradesh', countryName: 'India' }));
    expect(await reverseGeocode(26.8468, 80.9462, 'en', f)).toEqual({ name: 'Lucknow', lat: 26.8468, lon: 80.9462, region: 'Uttar Pradesh', country: 'India' });
    const url = new URL(String(f.mock.calls[0]?.[0]));
    expect(url.origin + url.pathname).toBe(REVERSE_API);
    expect(url.searchParams.get('latitude')).toBe('26.85');
    expect(url.searchParams.get('localityLanguage')).toBe('en');
  });

  it('falls back to the locality, drops a region equal to the name, and returns null when unnamed or failing', async () => {
    const f = vi.fn().mockResolvedValue(jsonResponse({ city: '', locality: 'Delhi', principalSubdivision: 'Delhi', countryName: 'India' }));
    expect(await reverseGeocode(28.6, 77.2, 'en', f)).toEqual({ name: 'Delhi', lat: 28.6, lon: 77.2, country: 'India' });
    expect(await reverseGeocode(0, 0, 'en', vi.fn().mockResolvedValue(jsonResponse({ city: '', locality: '' })))).toBeNull();
    expect(await reverseGeocode(0, 0, 'en', vi.fn().mockResolvedValue(new Response('', { status: 500 })))).toBeNull();
  });

  it('formats coordinates in every hemisphere', () => {
    expect(coordsLabel(28.613, 77.209)).toBe('28.61° N, 77.21° E');
    expect(coordsLabel(-33.87, -70.65)).toBe('33.87° S, 70.65° W');
  });
});

describe('currentPosition', () => {
  it('rounds coordinates to about 1 km for privacy', async () => {
    const geo = {
      getCurrentPosition: (ok: PositionCallback) => ok({ coords: { latitude: 28.613939, longitude: 77.209023 } } as GeolocationPosition),
    } as unknown as Geolocation;
    await expect(currentPosition('Me', geo)).resolves.toEqual({ name: 'Me', lat: 28.61, lon: 77.21 });
  });

  it('rejects when unsupported or denied', async () => {
    await expect(currentPosition('Me', undefined)).rejects.toThrow('not supported');
    const denied = {
      getCurrentPosition: (_ok: PositionCallback, fail: PositionErrorCallback) => fail({ message: '' } as GeolocationPositionError),
    } as unknown as Geolocation;
    await expect(currentPosition('Me', denied)).rejects.toThrow('denied');
  });
});
