import { initialPlayerState, type PlayerState } from './player';
export const PLAYBACK_SESSION_KEY = 'wave-playback-session-v1';
export const RESUME_ON_RELOAD_KEY = 'wave-resume-on-reload';

export interface PlaybackSession {
  state: PlayerState;
  positions: Record<string, number>;

  wasPlaying: boolean;
}

export function readResumeOnReload(): boolean {
  try {
    return localStorage.getItem(RESUME_ON_RELOAD_KEY) === 'true';
  } catch {
    return false;
  }
}

export function writeResumeOnReload(enabled: boolean) {
  try {
    localStorage.setItem(RESUME_ON_RELOAD_KEY, enabled ? 'true' : 'false');
  } catch {}
}

export function readPlaybackSession(): PlaybackSession {
  const fallback: PlaybackSession = {
    state: { ...initialPlayerState },
    positions: {},
    wasPlaying: false,
  };
  try {
    const value = JSON.parse(localStorage.getItem(PLAYBACK_SESSION_KEY) ?? 'null');
    if (!value || value.version !== 1 || !Array.isArray(value.queue)) return fallback;
    const queue = [
      ...new Set<string>(
        value.queue
          .filter((id: unknown) => typeof id === 'string' && id.length <= 256)
          .slice(0, 10000),
      ),
    ];
    const ordered = Array.isArray(value.orderedQueue)
      ? [
          ...new Set<string>(
            value.orderedQueue.filter(
              (id: unknown) => typeof id === 'string' && queue.includes(id),
            ),
          ),
        ]
      : queue;
    const positions: Record<string, number> = Object.create(null);
    for (const [id, seconds] of Object.entries(value.positions ?? {}))
      if (
        typeof seconds === 'number' &&
        Number.isFinite(seconds) &&
        seconds >= 0 &&
        seconds < 86400
      )
        positions[id] = seconds;
    return {
      state: {
        queue,
        orderedQueue: [...ordered, ...queue.filter((id) => !ordered.includes(id))],
        index: queue.indexOf(value.currentId),
        playing: false,
        repeat: ['one', 'all'].includes(value.repeat) ? value.repeat : 'off',
        shuffled: value.shuffled === true,
      },
      positions,
      wasPlaying: value.wasPlaying === true,
    };
  } catch {
    return fallback;
  }
}

export function writePlaybackSession(state: PlayerState, positions: Record<string, number>) {
  try {
    localStorage.setItem(
      PLAYBACK_SESSION_KEY,
      JSON.stringify({
        version: 1,
        queue: state.queue,
        orderedQueue: state.orderedQueue,
        currentId: state.queue[state.index],
        repeat: state.repeat,
        shuffled: state.shuffled,
        wasPlaying: state.playing,
        positions,
      }),
    );
  } catch {}
}
