import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';
import { pageFromPath, usePageRoute } from './usePageRoute';

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
