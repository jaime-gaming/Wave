import { describe, expect, it } from 'vitest';
import {
  embedPlayerState,
  isSafeOrigin,
  parseYouTubeLink,
  readEmbedEvent,
  youtubeEmbedUrl,
  youtubeThumbnailUrl,
} from './youtube';

const ID = 'dQw4w9WgXcQ';

describe('YouTube links', () => {
  it('reads the video ID from the usual link shapes', () => {
    for (const link of [
      `https://www.youtube.com/watch?v=${ID}`,
      `https://youtu.be/${ID}`,
      `https://m.youtube.com/watch?v=${ID}&feature=share`,
      `https://music.youtube.com/watch?v=${ID}&list=PLabc123456`,
      `https://www.youtube.com/shorts/${ID}`,
      `https://www.youtube.com/embed/${ID}`,
      `https://www.youtube.com/live/${ID}`,
      ID,
    ])
      expect(parseYouTubeLink(link)).toMatchObject({ kind: 'video', videoId: ID });
  });

  it('keeps playlist context and start time', () => {
    expect(
      parseYouTubeLink(`https://www.youtube.com/watch?v=${ID}&list=PLabc123456&t=1m30s`),
    ).toEqual({
      kind: 'video',
      videoId: ID,
      playlistId: 'PLabc123456',
      startAt: 90,
    });
    expect(parseYouTubeLink(`https://youtu.be/${ID}?t=45`)).toMatchObject({ startAt: 45 });
  });

  it('reads playlist links', () => {
    expect(parseYouTubeLink('https://www.youtube.com/playlist?list=PLabc123456')).toEqual({
      kind: 'playlist',
      playlistId: 'PLabc123456',
    });
    expect(parseYouTubeLink('youtube.com/playlist?list=PLabc123456&si=x')).toMatchObject({
      kind: 'playlist',
    });
  });

  it('rejects other hosts and malformed identifiers', () => {
    expect(parseYouTubeLink('https://vimeo.com/12345')).toBeNull();
    expect(parseYouTubeLink('https://www.youtube.com/watch?v=short')).toBeNull();
    expect(parseYouTubeLink('')).toBeNull();
    expect(parseYouTubeLink('https://www.youtube.com/watch?list=')).toBeNull();
    expect(parseYouTubeLink('https://www.youtube.com@evil.example/watch?v=dQw4w9WgXcQ')).toBeNull();
  });

  it('builds a privacy-enhanced embed URL without unsafe origins', () => {
    const url = new URL(youtubeEmbedUrl(ID, { startAt: 30.7, origin: 'https://wave.example' }));
    expect(url.host).toBe('www.youtube-nocookie.com');
    expect(url.pathname).toBe(`/embed/${ID}`);
    expect(url.searchParams.get('start')).toBe('30');
    expect(url.searchParams.get('origin')).toBe('https://wave.example');
    expect(url.searchParams.get('rel')).toBe('0');
    expect(() => youtubeEmbedUrl('nope')).toThrow();
    expect(
      new URL(youtubeEmbedUrl(ID, { origin: 'javascript:alert(1)' })).searchParams.has('origin'),
    ).toBe(false);
    expect(youtubeThumbnailUrl(ID)).toBe(`https://i.ytimg.com/vi/${ID}/mqdefault.jpg`);
  });

  it('validates origins strictly', () => {
    expect(isSafeOrigin('https://wave.example')).toBe(true);
    expect(isSafeOrigin('https://wave.example/path')).toBe(false);
    expect(isSafeOrigin('javascript:alert(1)')).toBe(false);
    expect(isSafeOrigin('not a url')).toBe(false);
  });

  it('reads only documented player events for the expected video', () => {
    const info = {
      event: 'infoDelivery',
      info: { playerState: 1, currentTime: 12.5, duration: 200, videoData: { video_id: ID } },
    };
    expect(readEmbedEvent(info, ID)).toMatchObject({ state: 'playing', currentTime: 12.5 });
    expect(readEmbedEvent(info, 'aaaaaaaaaaa')).toBeNull();
    expect(readEmbedEvent({ event: 'onReady' }, ID)).toBeNull();
    expect(readEmbedEvent('playing', ID)).toBeNull();
    expect(
      readEmbedEvent({ event: 'infoDelivery', info: { playerState: 77, currentTime: 'x' } }, ID),
    ).toBeNull();
    expect(embedPlayerState(0)).toBe('ended');
    expect(embedPlayerState(4)).toBeNull();
  });
});
