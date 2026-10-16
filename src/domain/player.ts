import type { RepeatMode } from './types';

export interface PlayerState {
  queue: string[];
  orderedQueue: string[];
  index: number;
  playing: boolean;
  repeat: RepeatMode;
  shuffled: boolean;
}
export const initialPlayerState: PlayerState = {
  queue: [],
  orderedQueue: [],
  index: -1,
  playing: false,
  repeat: 'off',
  shuffled: false,
};
export type PlayerAction =
  | { type: 'restore'; state: PlayerState }
  | { type: 'reconcile'; state: PlayerState }
  | { type: 'load'; queue: string[]; id: string }
  | { type: 'toggle' }
  | { type: 'pause' }
  | { type: 'next' }
  | { type: 'previous' }
  | { type: 'ended' }
  | { type: 'repeat' }
  | { type: 'shuffle'; queue: string[] }
  | { type: 'remove'; id: string }
  | { type: 'enqueue'; ids: string[] }
  | { type: 'jump'; id: string }
  | { type: 'reorder'; ids: string[] }
  | { type: 'continue'; ids: string[]; advance?: boolean };

export function playerReducer(state: PlayerState, action: PlayerAction): PlayerState {
  switch (action.type) {
    case 'reconcile':
      return action.state;
    case 'restore':
      return { ...action.state, playing: false };
    case 'load': {
      const queue = [...new Set(action.queue)];
      const index = queue.indexOf(action.id);
      return index < 0
        ? state
        : { ...state, queue, orderedQueue: [...queue], index, playing: true, shuffled: false };
    }
    case 'continue': {
      if (!state.playing || state.repeat !== 'off' || state.index !== state.queue.length - 1)
        return state;
      const current = state.queue[state.index],
        added = [...new Set(action.ids)].filter((id) => id !== current);
      if (!current || !added.length) return state;
      const queue = [current, ...added];
      return {
        ...state,
        queue,
        orderedQueue: [...queue],
        index: action.advance ? 1 : 0,
        shuffled: false,
      };
    }
    case 'enqueue': {
      const added = [...new Set(action.ids)].filter((id) => !state.queue.includes(id));
      if (!added.length) return state;
      return {
        ...state,
        queue: [...state.queue, ...added],
        orderedQueue: [...state.orderedQueue, ...added],
        index: state.index < 0 ? 0 : state.index,
      };
    }
    case 'jump': {
      const index = state.queue.indexOf(action.id);
      return index < 0 ? state : { ...state, index, playing: true };
    }
    case 'toggle':
      return state.index < 0 ? state : { ...state, playing: !state.playing };
    case 'pause':
      return { ...state, playing: false };
    case 'next':
    case 'ended': {
      if (!state.queue.length) return state;
      if (action.type === 'ended' && state.repeat === 'one') return state;
      if (state.index + 1 < state.queue.length) return { ...state, index: state.index + 1 };
      if (state.repeat === 'all') return { ...state, index: 0 };
      return { ...state, playing: false };
    }
    case 'previous':
      if (!state.queue.length) return state;
      return {
        ...state,
        index:
          state.index > 0 ? state.index - 1 : state.repeat === 'all' ? state.queue.length - 1 : 0,
      };
    case 'repeat':
      return {
        ...state,
        repeat: state.repeat === 'off' ? 'all' : state.repeat === 'all' ? 'one' : 'off',
      };
    case 'reorder': {
      if (
        action.ids.length !== state.queue.length ||
        new Set(action.ids).size !== state.queue.length ||
        action.ids.some((id) => !state.queue.includes(id))
      )
        return state;
      const current = state.queue[state.index];
      return {
        ...state,
        queue: [...action.ids],
        orderedQueue: [...action.ids],
        index: current ? action.ids.indexOf(current) : -1,
        shuffled: false,
      };
    }
    case 'shuffle': {
      if (!state.queue.length) return state;
      const current = state.queue[state.index];
      // Accept only permutations of the existing queue.
      if (
        action.queue.length !== state.queue.length ||
        new Set(action.queue).size !== state.queue.length ||
        action.queue.some((id) => !state.queue.includes(id))
      )
        return state;
      return {
        ...state,
        queue: action.queue,
        index: action.queue.indexOf(current),
        shuffled: !state.shuffled,
      };
    }
    case 'remove': {
      const removed = state.queue.indexOf(action.id);
      if (removed < 0) return state;
      const queue = state.queue.filter((id) => id !== action.id);
      if (!queue.length) return { ...initialPlayerState, repeat: state.repeat };
      const index =
        removed < state.index ? state.index - 1 : Math.min(state.index, queue.length - 1);
      return {
        ...state,
        queue,
        orderedQueue: state.orderedQueue.filter((id) => id !== action.id),
        index,
      };
    }
  }
}

export function shuffleQueue(queue: string[], current: string, random = Math.random): string[] {
  const rest = queue.filter((id) => id !== current);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return queue.includes(current) ? [current, ...rest] : rest;
}
