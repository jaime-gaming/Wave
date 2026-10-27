import { describe, expect, it } from 'vitest';
import {
  cleanVideoTitle,
  isYouTubeTrack,
  localTwin,
  resolvePlayable,
  splitVideoTitle,
  youtubeTrack,
  youTubeVideoOf,
} from './youtubeTrack';
import { makeTrack } from '../test/fixtures';

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

describe('local twin and playback target', () => {
  const youtubeRow = youtubeTrack(
    { videoId: 'dQw4w9WgXcQ', title: 'Midnight City', artist: 'M83' },
    'yt-1',
  );
  const file = {
    ...makeTrack({ id: 'file-1', title: 'Midnight City', artist: 'M83' }),
    blob: new Blob(['audio']),
  };

  it('prefers the file on this device when the same song exists twice', () => {
    expect(localTwin(youtubeRow, [file])?.id).toBe('file-1');
    const playable = resolvePlayable(youtubeRow, [file]);
    expect(playable?.fromYouTube).toBe(false);
    expect(playable?.track.id).toBe('file-1');
  });

  it('plays from YouTube when there is no file', () => {
    expect(resolvePlayable(youtubeRow, [makeTrack({ id: 'other' })])).toEqual({
      track: youtubeRow,
      fromYouTube: true,
    });
  });

  it('ignores a file with a different artist or title', () => {
    const otherArtist = { ...file, artist: 'Someone else' };
    expect(localTwin(youtubeRow, [otherArtist])).toBeUndefined();
    const otherTitle = { ...file, title: 'Midnight City (live)' };
    expect(localTwin(youtubeRow, [otherTitle])).toBeUndefined();
  });

  it('never treats a local song as a YouTube playback', () => {
    expect(resolvePlayable(file, [file])).toEqual({ track: file, fromYouTube: false });
    expect(resolvePlayable(undefined, [file])).toBeUndefined();
  });
});
