import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';
import { formatAppRoute, pageFromPath, parseAppRoute, usePageRoute } from './usePageRoute';

beforeEach(() => history.replaceState(null, '', '/'));
it('recognizes direct links and unknown paths safely', () => {
  expect(pageFromPath('/Library')).toBe('library');
  expect(pageFromPath('/wave/Remix/')).toBe('remix');
  expect(pageFromPath('/missing')).toBe('home');
});
it('updates the path and responds to browser navigation', () => {
  const { result } = renderHook(() => usePageRoute(false));
  act(() => result.current[1]('library'));
  expect(location.pathname).toBe('/Library');
  expect(result.current[0]).toBe('library');
  expect(result.current[2]).toBe(1);
  act(() => {
    history.replaceState(null, '', '/Search');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  expect(result.current[0]).toBe('search');
  expect(result.current[2]).toBe(-1);
});
it('opens pairing links in settings without discarding the signal', () => {
  history.replaceState(null, '', '/?wave-pair=example');
  const { result } = renderHook(() => usePageRoute(true));
  expect(result.current[0]).toBe('settings');
  expect(location.search).toContain('wave-pair=example');
});
it('parses and formats deep routes for /Current, /Queue, /Library/*, /Settings/* and /Search', () => {
  expect(parseAppRoute('/Current')).toEqual({ page: 'home', overlay: 'current' });
  expect(parseAppRoute('/Queue')).toEqual({ page: 'home', overlay: 'queue' });
  expect(parseAppRoute('/Settings/Playback')).toEqual({
    page: 'settings',
    settingsSection: 'playback',
  });
  expect(parseAppRoute('/Library/Albums/Pink%20Floyd%3A%3AWish')).toEqual({
    page: 'library',
    view: 'albums',
    group: 'Pink Floyd::Wish',
    playlistId: null,
  });
  expect(parseAppRoute('/Library/Playlists/pl-123')).toEqual({
    page: 'library',
    view: 'playlists',
    playlistId: 'pl-123',
    group: null,
  });
  expect(parseAppRoute('/Search', '?q=radiohead')).toEqual({
    page: 'search',
    query: 'radiohead',
  });
  expect(formatAppRoute({ page: 'home', overlay: 'current' }, '/')).toBe('/Current');
  expect(formatAppRoute({ page: 'settings', settingsSection: 'playback' }, '/')).toBe(
    '/Settings/Playback',
  );
  expect(formatAppRoute({ page: 'library', view: 'favorites' }, '/')).toBe('/Library/Favorites');
  expect(formatAppRoute({ page: 'search', query: 'm83' }, '/')).toBe('/Search?q=m83');
});
