import { beforeEach, describe, expect, it } from 'vitest';
import {
  CLIP_STORAGE_KEY,
  clipThumbnail,
  getClip,
  loadClips,
  removeClip,
  saveClip,
} from './videoClips';

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) {
    return this.data.has(key) ? this.data.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
  clear() {
    this.data.clear();
  }
}

const ID = 'dQw4w9WgXcQ';
let store: MemoryStorage;

beforeEach(() => {
  store = new MemoryStorage();
});

describe('video clips', () => {
  it('saves a pasted video link with its start time', () => {
    const result = saveClip('track-1', `https://youtu.be/${ID}?t=42`, store as unknown as Storage);
    expect(result).toMatchObject({ ok: true, clip: { videoId: ID, startAt: 42 } });
    expect(getClip('track-1', loadClips(store as unknown as Storage))).toMatchObject({
      videoId: ID,
    });
  });

  it('refuses playlists, foreign links and empty input', () => {
    expect(
      saveClip(
        't',
        'https://www.youtube.com/playlist?list=PLabc123456',
        store as unknown as Storage,
      ),
    ).toMatchObject({
      ok: false,
      error: expect.stringMatching(/playlist link/i),
    });
    expect(saveClip('t', 'https://vimeo.com/1', store as unknown as Storage)).toMatchObject({
      ok: false,
    });
    expect(saveClip('', `https://youtu.be/${ID}`, store as unknown as Storage)).toMatchObject({
      ok: false,
    });
  });

  it('drops corrupted entries instead of rendering them', () => {
    store.setItem(
      CLIP_STORAGE_KEY,
      JSON.stringify({
        good: { videoId: ID, startAt: 3, addedAt: 1 },
        bad: { videoId: 'nope' },
        weird: 'string',
        negative: { videoId: ID, startAt: -5, addedAt: Number.NaN },
      }),
    );
    const clips = loadClips(store as unknown as Storage);
    expect(Object.keys(clips).sort()).toEqual(['good', 'negative']);
    expect(clips.negative.startAt).toBe(0);
    expect(clips.negative.addedAt).toBe(0);
    store.setItem(CLIP_STORAGE_KEY, '{not json');
    expect(loadClips(store as unknown as Storage)).toEqual({});
  });

  it('removes a clip and survives an unavailable store', () => {
    saveClip('t1', `https://youtu.be/${ID}`, store as unknown as Storage);
    expect(Object.keys(removeClip('t1', store as unknown as Storage))).toEqual([]);
    expect(loadClips(null)).toEqual({});
    expect(saveClip('t1', `https://youtu.be/${ID}`, null).ok).toBe(true);
    expect(clipThumbnail({ videoId: ID, startAt: 0, addedAt: 0 })).toContain(ID);
  });
});
