import { describe, expect, it } from 'vitest';
import {
  cleanVideoTitle,
  isYouTubeTrack,
  splitVideoTitle,
  youtubeTrack,
  youTubeVideoOf,
} from './youtubeTrack';

describe('YouTube songs', () => {
  it('splits the usual artist - title pattern and removes decoration', () => {
    expect(splitVideoTitle('M83 - Midnight City (Official Video)')).toEqual({
      title: 'Midnight City',
      artist: 'M83',
    });
    expect(splitVideoTitle('Midnight City [Official Audio]')).toEqual({
      title: 'Midnight City',
      artist: 'Unknown artist',
    });
    expect(cleanVideoTitle('Song (Official Video) - Topic')).toBe('Song - Topic');
  });

  it('accepts single videos and rejects playlists and junk', () => {
    expect(youTubeVideoOf('https://youtu.be/dQw4w9WgXcQ')?.videoId).toBe('dQw4w9WgXcQ');
    expect(youTubeVideoOf('https://www.youtube.com/playlist?list=PLabcdefghij')).toBeNull();
    expect(youTubeVideoOf('not a link')).toBeNull();
  });

  it('builds a library record with no local bytes', () => {
    const track = youtubeTrack(
      { videoId: 'dQw4w9WgXcQ', title: 'Midnight City', artist: 'M83', duration: 244 },
      'yt-1',
    );
    expect(track).toMatchObject({
      id: 'yt-1',
      title: 'Midnight City',
      artist: 'M83',
      source: 'youtube',
      videoId: 'dQw4w9WgXcQ',
      size: 0,
      duration: 244,
      album: 'YouTube',
    });
    expect(track.blob).toBeUndefined();
    expect(isYouTubeTrack(track)).toBe(true);
    expect(isYouTubeTrack({ source: 'local' })).toBe(false);
    expect(isYouTubeTrack(undefined)).toBe(false);
  });

  it('falls back to sensible labels instead of empty fields', () => {
    const track = youtubeTrack({ videoId: 'dQw4w9WgXcQ', title: '   ' }, 'yt-2');
    expect(track.title).toBe('Untitled');
    expect(track.artist).toBe('Unknown artist');
    expect(track.duration).toBe(0);
  });
});
