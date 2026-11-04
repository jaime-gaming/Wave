import { describe, expect, it } from 'vitest';
import {
  canShowFolderPicker,
  inEmbeddedFrame,
  folderAccess,
  pickFolder,
  isAudioFile,
  markFolderScanned,
  readFolder,
  rememberFolder,
  rememberedFolders,
  forgetFolder,
  supportsFolderPicker,
  type DirectoryHandleLike,
  type FileHandleLike,
} from './folders';

const file = (name: string): FileHandleLike => ({
  kind: 'file',
  name,
  getFile: async () => new File(['x'], name, { type: 'audio/mpeg' }),
});

function directory(name: string, children: (FileHandleLike | DirectoryHandleLike)[]) {
  return {
    kind: 'directory' as const,
    name,
    values: () =>
      (async function* () {
        for (const child of children) yield child;
      })(),
  };
}

/** A directory whose listener always throws, as a revoked handle does. */
const broken: DirectoryHandleLike = {
  kind: 'directory',
  name: 'locked',
  values() {
    throw new Error('NotAllowedError');
  },
};

describe('Knowing what a folder holds', () => {
  it('accepts the formats the importer accepts', () => {
    expect(isAudioFile('Song.MP3')).toBe(true);
    expect(isAudioFile('take.flac')).toBe(true);
    expect(isAudioFile('cover.jpg')).toBe(false);
    expect(isAudioFile('noextension')).toBe(false);
  });

  it('walks nested folders and keeps only audio', async () => {
    const tree = directory('Music', [
      file('one.mp3'),
      file('notes.txt'),
      directory('Album', [file('two.flac'), directory('Bonus', [file('three.ogg')])]),
    ]);
    const files = await readFolder(tree);
    expect(files.map((entry) => entry.name)).toEqual(['one.mp3', 'two.flac', 'three.ogg']);
  });

  it('keeps going when one subfolder cannot be read', async () => {
    const tree = directory('Music', [broken, file('one.mp3')]);
    expect((await readFolder(tree)).map((entry) => entry.name)).toEqual(['one.mp3']);
  });

  it('stops at the file ceiling instead of walking forever', async () => {
    const many = directory(
      'Music',
      Array.from({ length: 30 }, (_, index) => file(`${index}.mp3`)),
    );
    expect(await readFolder(many, { limit: 5 })).toHaveLength(5);
  });
});

describe('Remembering a folder', () => {
  it('stores, lists and forgets it, and records when it was read', async () => {
    const handle = directory('Bedroom mixes', [file('one.mp3')]);
    const folder = await rememberFolder(handle);
    expect((await rememberedFolders()).map((entry) => entry.name)).toEqual(['Bedroom mixes']);
    await markFolderScanned(folder.id);
    const [again] = await rememberedFolders();
    expect(again.scannedAt).toBeGreaterThanOrEqual(folder.scannedAt ?? 0);
    await forgetFolder(folder.id);
    expect(await rememberedFolders()).toEqual([]);
  });

  it('reports access as needing a click when the browser cannot say', async () => {
    const folder = await rememberFolder(directory('No permissions API', []));
    // jsdom has no permission API on a plain object, so the honest answer is
    // "ask the listener", never "granted".
    expect(await folderAccess(folder)).toBe('prompt');
    await forgetFolder(folder.id);
  });
});

describe('Feature detection', () => {
  it('only claims the picker when the browser really has it', () => {
    expect(supportsFolderPicker(undefined)).toBe(false);
    expect(supportsFolderPicker({})).toBe(false);
    expect(supportsFolderPicker({ showDirectoryPicker: async () => directory('x', []) })).toBe(
      true,
    );
  });

  it("will not promise a chooser inside somebody else's frame", () => {
    const scope = { showDirectoryPicker: async () => directory('Music', []) };
    const window = { ...scope } as { showDirectoryPicker: unknown; top: unknown };
    window.top = window;
    expect(canShowFolderPicker(window as never)).toBe(true);
    // A frame whose `top` is a different object is not a top-level window.
    expect(canShowFolderPicker({ ...scope, top: {} } as never)).toBe(false);
    expect(canShowFolderPicker(undefined)).toBe(false);
    expect(inEmbeddedFrame({} as never)).toBe(false);
  });

  it('tells a cancelled chooser apart from a refused one', async () => {
    const cancelled = {
      showDirectoryPicker: async () => {
        throw Object.assign(new Error('closed'), { name: 'AbortError' });
      },
    };
    expect(await pickFolder(cancelled)).toEqual({ ok: false, reason: 'cancelled' });
    // Chrome refuses the picker in a cross-origin frame with an ordinary error.
    const refused = {
      showDirectoryPicker: async () => {
        throw new Error('Failed to execute showDirectoryPicker');
      },
    };
    expect(await pickFolder(refused)).toEqual({ ok: false, reason: 'blocked' });
    expect(await pickFolder({})).toEqual({ ok: false, reason: 'blocked' });
    const handle = directory('Music', []);
    expect(await pickFolder({ showDirectoryPicker: async () => handle })).toEqual({
      ok: true,
      handle,
    });
  });
});
