import { isPermutation } from './order';
import type { Playlist } from './types';

export type PlaylistDetails = Pick<Playlist, 'name' | 'description' | 'artwork'>;
export type PlaylistChange =
  | { type: 'details'; details: PlaylistDetails }
  | { type: 'add'; ids: string[] }
  | { type: 'remove'; id: string }
  | { type: 'move'; id: string; direction: -1 | 1 }
  | { type: 'reorder'; ids: string[] };

export function validatePlaylist(playlist: Playlist): Playlist {
  const name = playlist.name.trim();
  if (!name || name.length > 100) throw new Error('Enter a playlist name of 1–100 characters.');
  if (playlist.description.length > 1000)
    throw new Error('Descriptions can contain up to 1,000 characters.');
  return {
    ...playlist,
    name,
    description: playlist.description.trim(),
    trackIds: [...new Set(playlist.trackIds)],
  };
}

export function applyPlaylistChange(playlist: Playlist, change: PlaylistChange): Playlist {
  let next = { ...playlist, trackIds: [...playlist.trackIds], updatedAt: Date.now() };
  switch (change.type) {
    case 'details':
      next = { ...next, ...change.details };
      break;
    case 'add':
      next.trackIds = [...new Set([...next.trackIds, ...change.ids])];
      break;
    case 'remove':
      next.trackIds = next.trackIds.filter((id) => id !== change.id);
      break;
    case 'reorder':
      if (!isPermutation(change.ids, next.trackIds))
        throw new Error('The playlist changed. Reopen its ordering view.');
      next.trackIds = [...change.ids];
      break;
    case 'move': {
      const index = next.trackIds.indexOf(change.id);
      const target = index + change.direction;
      if (index >= 0 && target >= 0 && target < next.trackIds.length) {
        [next.trackIds[index], next.trackIds[target]] = [
          next.trackIds[target],
          next.trackIds[index],
        ];
      }
      break;
    }
  }
  return validatePlaylist(next);
}
