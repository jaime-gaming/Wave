import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePlayer } from './usePlayer';
import { makeTrack } from '../test/fixtures';

let element: HTMLAudioElement;
beforeEach(() => {
  element = document.createElement('audio');
  Object.defineProperty(element, 'duration', { value: 20, writable: true, configurable: true });
  vi.stubGlobal(
    'Audio',
    class {
      constructor() {
        return element;
      }
    },
  );
});
afterEach(() => vi.unstubAllGlobals());
describe('audio lifecycle and level', () => {
  it('defaults to original level, clamps volume, remembers preferences, and restores pre-mute level', () => {
    const { result } = renderHook(() => usePlayer([]));
    expect(result.current.volume).toBe(1);
    act(() => result.current.setVolume(0.37));
    expect(element.volume).toBe(0.37);
    act(() => result.current.toggleMute());
    expect(result.current.volume).toBe(0);
    act(() => result.current.toggleMute());
    expect(result.current.volume).toBe(0.37);
    expect(localStorage.getItem('wave-volume')).toBe('0.37');
    act(() => result.current.setVolume(Infinity));
    expect(result.current.volume).toBe(0.37);
    act(() => result.current.setVolume(5));
    expect(element.volume).toBe(1);
    act(() => result.current.setVolume(-1));
    expect(element.volume).toBe(0);
  });
  it('loads valid saved volume and falls back for malformed values', () => {
    localStorage.setItem('wave-volume', '0.42');
    const first = renderHook(() => usePlayer([]));
    expect(first.result.current.volume).toBe(0.42);
    first.unmount();
    localStorage.setItem('wave-volume', 'invalid');
    const second = renderHook(() => usePlayer([]));
    expect(second.result.current.volume).toBe(1);
  });
  it('restores the pre-mute level even after reloading a muted session', () => {
    localStorage.setItem('wave-volume', '0');
    localStorage.setItem('wave-last-audible-volume', '0.37');
    const { result } = renderHook(() => usePlayer([]));
    expect(result.current.volume).toBe(0);
    act(() => result.current.toggleMute());
    expect(result.current.volume).toBe(0.37);
  });
  it('clamps seek to finite duration and ignores non-finite inputs', () => {
    const { result } = renderHook(() => usePlayer([]));
    act(() => result.current.seek(100));
    expect(element.currentTime).toBe(20);
    act(() => result.current.seek(NaN));
    expect(element.currentTime).toBe(20);
    Object.defineProperty(element, 'duration', { value: Infinity });
    act(() => result.current.seek(5));
    expect(element.currentTime).toBe(20);
  });
  it('restores the selected queue order when shuffle is disabled', () => {
    const tracks = ['a', 'b', 'c'].map((id) => makeTrack({ id }));
    const { result } = renderHook(() => usePlayer(tracks));
    act(() => result.current.play([tracks[2], tracks[0], tracks[1]], 'a'));
    act(() => result.current.shuffle());
    act(() => result.current.dispatch({ type: 'remove', id: 'b' }));
    act(() => result.current.shuffle());
    expect(result.current.state.queue).toEqual(['c', 'a']);
    expect(result.current.current?.id).toBe('a');
  });
  it('does not restart a paused track when a late ended event arrives in repeat mode', () => {
    const track = makeTrack();
    const { result } = renderHook(() => usePlayer([track]));
    act(() => result.current.play([track], track.id));
    act(() => result.current.dispatch({ type: 'repeat' }));
    act(() => result.current.dispatch({ type: 'repeat' }));
    act(() => result.current.dispatch({ type: 'pause' }));
    const calls = vi.mocked(element.play).mock.calls.length;
    act(() => element.dispatchEvent(new Event('ended')));
    expect(element.play).toHaveBeenCalledTimes(calls);
    expect(result.current.state.playing).toBe(false);
  });
  it('reports waiting/playing events and revokes audio sources on unmount', () => {
    const track = makeTrack();
    const { result, unmount } = renderHook(() => usePlayer([track]));
    act(() => result.current.play([track], track.id));
    act(() => element.dispatchEvent(new Event('waiting')));
    expect(result.current.buffering).toBe(true);
    act(() => element.dispatchEvent(new Event('playing')));
    expect(result.current.buffering).toBe(false);
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalled();
    expect(element.hasAttribute('src')).toBe(false);
  });
});

it('stops a removed outgoing queue entry during crossfade without restarting the incoming song', async () => {
  const elements: HTMLAudioElement[] = [];
  vi.stubGlobal(
    'Audio',
    class {
      constructor() {
        const audio = document.createElement('audio');
        Object.defineProperty(audio, 'duration', { value: 20, configurable: true });
        Object.defineProperty(audio, 'readyState', { value: 4, configurable: true });
        elements.push(audio);
        return audio;
      }
    },
  );
  const tracks = [makeTrack({ id: 'a' }), makeTrack({ id: 'b' })];
  const { result } = renderHook(() => usePlayer(tracks));
  act(() => result.current.setMixEnabled(true));
  act(() => result.current.play(tracks, 'a'));
  await act(async () => {
    elements[0].currentTime = 18.1;
    elements[0].dispatchEvent(new Event('timeupdate'));
    await Promise.resolve();
  });
  expect(result.current.current?.id).toBe('b');
  expect(elements[0].hasAttribute('src')).toBe(true);
  elements[1].currentTime = 0.4;
  act(() => result.current.dispatch({ type: 'remove', id: 'a' }));
  expect(elements[0].hasAttribute('src')).toBe(false);
  expect(elements[1].hasAttribute('src')).toBe(true);
  expect(elements[1].currentTime).toBe(0.4);
  expect(result.current.state.playing).toBe(true);
});
it('flushes progress on leaving and restores the selected queue after delayed library hydration', () => {
  const track = makeTrack();
  const first = renderHook(() => usePlayer([track]));
  act(() => first.result.current.play([track], track.id));
  element.currentTime = 7.25;
  act(() => window.dispatchEvent(new Event('pagehide')));
  first.unmount();
  const second = renderHook(({ tracks, ready }) => usePlayer(tracks, ready), {
    initialProps: { tracks: [] as (typeof track)[], ready: false },
  });
  expect(second.result.current.state.queue).toEqual([track.id]);
  act(() => second.rerender({ tracks: [track], ready: true }));
  expect(second.result.current.current?.id).toBe(track.id);
  expect(second.result.current.state.playing).toBe(false);
  expect(second.result.current.time).toBe(7.25);
  expect(element.currentTime).toBe(7.25);
});
it('removes missing queue entries without stopping an unrelated playing song', () => {
  const tracks = [makeTrack(), makeTrack({ id: 'other' })];
  const hook = renderHook(({ tracks }) => usePlayer(tracks), { initialProps: { tracks } });
  act(() => hook.result.current.play(tracks, 'other'));
  act(() => hook.rerender({ tracks: [tracks[1]] }));
  expect(hook.result.current.current?.id).toBe('other');
  expect(hook.result.current.state.playing).toBe(true);
});
it('retains native source/time while reordering and persists mix preferences', () => {
  const tracks = ['a', 'b', 'c'].map((id) => makeTrack({ id }));
  const { result } = renderHook(() => usePlayer(tracks));
  act(() => result.current.play(tracks, 'b'));
  element.currentTime = 7.25;
  const calls = vi.mocked(element.play).mock.calls.length;
  act(() => result.current.reorderQueue(['c', 'a', 'b']));
  expect(result.current.current?.id).toBe('b');
  expect(element.currentTime).toBe(7.25);
  expect(element.play).toHaveBeenCalledTimes(calls);
  expect(result.current.mixEnabled).toBe(true);
  act(() => result.current.setMixEnabled(false));
  expect(localStorage.getItem('wave-mix-v2')).toBe('false');
});
it('migrates prior overlap preferences to one automatic Mix switch and enables local continuation by default', () => {
  localStorage.setItem('wave-crossfade', '0');
  let hook = renderHook(() => usePlayer([]));
  expect(hook.result.current.mixEnabled).toBe(false);
  expect(hook.result.current.autoplay).toBe(true);
  hook.unmount();
  localStorage.removeItem('wave-mix-v2');
  localStorage.setItem('wave-crossfade', '8');
  hook = renderHook(() => usePlayer([]));
  expect(hook.result.current.mixEnabled).toBe(true);
  act(() => hook.result.current.setAutoplay(false));
  expect(localStorage.getItem('wave-autoplay')).toBe('false');
});

it('keeps the interface still while the song plays', async () => {
  const track = makeTrack();
  let renders = 0;
  const { result } = renderHook(() => {
    renders += 1;
    return usePlayer([track]);
  });
  act(() => result.current.play([track], track.id));
  // Let the first duration report and the first position land.
  await new Promise((resolve) => setTimeout(resolve, 200));
  const settled = renders;
  // Ten more ticks of the engine: the position keeps moving, the tree does not.
  for (let step = 1; step <= 6; step++) {
    element.currentTime = 5 + step * 0.5;
    element.dispatchEvent(new Event('timeupdate'));
    await new Promise((resolve) => setTimeout(resolve, 60));
  }
  expect(renders).toBe(settled);
  expect(result.current.time).toBeGreaterThan(5);
});
