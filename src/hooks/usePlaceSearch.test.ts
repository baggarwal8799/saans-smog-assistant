import { act, renderHook } from '@testing-library/react';
import type { SubmitEvent } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Place } from '../../core/types.js';
import { deferred } from '../../test/deferred.js';
import * as geo from '../lib/geo.js';
import { usePlaceSearch } from './usePlaceSearch.js';

vi.mock('../lib/geo.js', async (importOriginal) => ({
  ...(await importOriginal<typeof geo>()),
  searchPlaces: vi.fn(),
  currentPosition: vi.fn(),
  reverseGeocode: vi.fn(),
}));

const searchPlaces = vi.mocked(geo.searchPlaces);
const currentPosition = vi.mocked(geo.currentPosition);
const reverseGeocode = vi.mocked(geo.reverseGeocode);
const submit = { preventDefault: () => undefined } as unknown as SubmitEvent<HTMLFormElement>;
const OLD: Place = { name: 'Old', lat: 1, lon: 1 };
const NEW: Place = { name: 'New', lat: 2, lon: 2 };

async function overtakenSearch() {
  const slow = deferred<Place[]>();
  searchPlaces.mockReturnValueOnce(slow.promise).mockResolvedValueOnce([NEW]);
  const { result } = renderHook(() => usePlaceSearch('en', vi.fn()));
  act(() => void result.current.actions.search(submit));
  await act(() => result.current.actions.search(submit));
  return { slow, result };
}

beforeEach(() => {
  searchPlaces.mockReset();
  currentPosition.mockReset();
  reverseGeocode.mockReset();
});

describe('usePlaceSearch: only the latest search counts', () => {
  it('keeps the newer results when an older search resolves after it', async () => {
    const { slow, result } = await overtakenSearch();
    expect(result.current.view.results).toEqual([NEW]);
    await act(async () => slow.resolve([OLD]));
    expect(result.current.view.results).toEqual([NEW]);
    expect(result.current.view.status).toEqual({ kind: 'idle' });
  });

  it('ignores an older search that fails after a newer one succeeded', async () => {
    const { slow, result } = await overtakenSearch();
    await act(async () => slow.reject(new Error('offline')));
    expect(result.current.view.status).toEqual({ kind: 'idle' });
    expect(result.current.view.results).toEqual([NEW]);
  });

  it('does not reopen the list when a search lands after a place was chosen', async () => {
    const slow = deferred<Place[]>();
    searchPlaces.mockReturnValueOnce(slow.promise);
    const onSelect = vi.fn();
    const { result } = renderHook(() => usePlaceSearch('en', onSelect));
    act(() => void result.current.actions.search(submit));
    act(() => result.current.actions.choose(NEW));
    await act(async () => slow.resolve([OLD]));
    expect(onSelect).toHaveBeenCalledWith(NEW);
    expect(result.current.view.results).toEqual([]);
    expect(result.current.view.status).toEqual({ kind: 'idle' });
  });

  it('shows the search error when the latest search fails', async () => {
    searchPlaces.mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(() => usePlaceSearch('en', vi.fn()));
    await act(() => result.current.actions.search(submit));
    expect(result.current.view.status.kind).toBe('error');
  });

  it('keeps a newer search when an older locate resolves after it', async () => {
    const position = deferred<Place>();
    currentPosition.mockReturnValueOnce(position.promise);
    reverseGeocode.mockResolvedValueOnce(OLD);
    searchPlaces.mockResolvedValueOnce([NEW]);
    const onSelect = vi.fn();
    const { result } = renderHook(() => usePlaceSearch('en', onSelect));
    act(() => void result.current.actions.locate());
    await act(() => result.current.actions.search(submit));
    await act(async () => position.resolve(OLD));
    expect(onSelect).not.toHaveBeenCalled();
    expect(result.current.view.results).toEqual([NEW]);
    expect(result.current.view.status).toEqual({ kind: 'idle' });
  });
});
