/**
 * Folders the listener hands to Wave, and the permission to read them again.
 *
 * Importing a folder is a different promise from importing files: a folder has
 * a *name* that keeps existing, so Wave can offer to read it again tomorrow — and
 * that means asking the browser for access a second time. Both halves are here.
 *
 * Three ways in, in order of preference:
 *
 * 1. `showDirectoryPicker()` — the folder is chosen, walked at any depth, and a
 *    handle is stored so the same folder can be re-read later. The browser asks
 *    for permission explicitly the first time, and again after a restart.
 * 2. `<input type="file" webkitdirectory>` — every browser that lacks the above
 *    (Firefox, Safari) still lets a folder be chosen; the files arrive at once
 *    and nothing is remembered.
 * 3. Choosing files one by one, which ever browser can do.
 *
 * Nothing here reads audio data: it produces `File` objects, and the importer
 * hashes and copies them exactly as it does for any other file.
 */
import { openLibrary, type RememberedFolder } from './library';

/** The same list the importer accepts, as extensions. */
export const AUDIO_EXTENSIONS = [
  'mp3',
  'wav',
  'm4a',
  'mp4',
  'aac',
  'flac',
  'ogg',
  'oga',
  'opus',
  'aif',
  'aiff',
  'wma',
] as const;

/** A ceiling, so a folder pointed at `/` cannot lock the page up. */
export const MAX_FOLDER_FILES = 20_000;
export const MAX_FOLDER_DEPTH = 12;

export function isAudioFile(name: string): boolean {
  const extension = name.split('.').pop()?.toLowerCase() ?? '';
  return (AUDIO_EXTENSIONS as readonly string[]).includes(extension);
}

export interface FileHandleLike {
  kind: 'file';
  name: string;
  getFile(): Promise<File>;
}

export interface DirectoryHandleLike {
  kind: 'directory';
  name: string;
  values(): AsyncIterable<FileHandleLike | DirectoryHandleLike>;
  queryPermission?(descriptor: { mode: 'read' }): Promise<PermissionState>;
  requestPermission?(descriptor: { mode: 'read' }): Promise<PermissionState>;
}

/** The part of the window this module needs, so tests can supply their own. */
export interface PickerScope {
  showDirectoryPicker?: (options?: object) => Promise<DirectoryHandleLike>;
}

export function supportsFolderPicker(
  scope: PickerScope | undefined = globalThis.window as PickerScope,
) {
  return typeof scope?.showDirectoryPicker === 'function';
}

/** Whether this browser can be handed a whole folder at once through an input. */
export function supportsDirectoryInput(doc: Document | undefined = globalThis.document) {
  if (!doc) return false;
  const input = doc.createElement('input');
  return 'webkitdirectory' in input;
}

/**
 * What the browser currently thinks about our access.
 *
 * `prompt` is not a failure: it means the browser wants a click before it hands
 * the folder back, which is exactly the explicit permission the interface asks
 * for rather than requesting silently on load.
 */
export async function folderAccess(
  folder: RememberedFolder,
): Promise<'granted' | 'prompt' | 'denied'> {
  const handle = folder.handle as DirectoryHandleLike | undefined;
  if (!handle?.queryPermission) return 'prompt';
  try {
    return (await handle.queryPermission({ mode: 'read' })) as 'granted' | 'prompt' | 'denied';
  } catch {
    return 'denied';
  }
}

/**
 * Asks for access. Must be called from a click: a browser refuses a permission
 * request that has no gesture behind it, and rightly so.
 */
export async function requestFolderAccess(folder: RememberedFolder): Promise<boolean> {
  const handle = folder.handle as DirectoryHandleLike | undefined;
  if (!handle?.requestPermission) return false;
  try {
    return (await handle.requestPermission({ mode: 'read' })) === 'granted';
  } catch {
    return false;
  }
}

/**
 * Every audio file under a handle, depth first.
 *
 * A subdirectory that cannot be read is skipped rather than failing the import:
 * one unreadable folder is not a reason to lose the other four hundred files.
 */
export async function readFolder(
  handle: DirectoryHandleLike,
  options: { depth?: number; limit?: number } = {},
): Promise<File[]> {
  const limit = options.limit ?? MAX_FOLDER_FILES;
  const maxDepth = options.depth ?? MAX_FOLDER_DEPTH;
  const files: File[] = [];
  const walk = async (directory: DirectoryHandleLike, depth: number): Promise<void> => {
    if (depth > maxDepth || files.length >= limit) return;
    let entries: AsyncIterable<FileHandleLike | DirectoryHandleLike>;
    try {
      entries = directory.values();
    } catch {
      return;
    }
    try {
      for await (const entry of entries) {
        if (files.length >= limit) return;
        if (entry.kind === 'file') {
          if (!isAudioFile(entry.name)) continue;
          try {
            files.push(await entry.getFile());
          } catch {
            // A file that vanished between listing and reading is skipped.
          }
        } else {
          await walk(entry, depth + 1);
        }
      }
    } catch {
      // The iterator failed mid-way; keep what was read.
    }
  };
  await walk(handle, 0);
  return files;
}

/** Chosen by the listener, remembered for next time. Null when they cancelled. */
export async function pickFolder(
  scope: PickerScope | undefined = globalThis.window as PickerScope,
) {
  if (!scope?.showDirectoryPicker) return null;
  try {
    return (await scope.showDirectoryPicker({
      id: 'wave-music',
      mode: 'read',
    })) as DirectoryHandleLike;
  } catch {
    // Cancelling the picker throws; that is not an error to report.
    return null;
  }
}

export async function rememberFolder(handle: DirectoryHandleLike): Promise<RememberedFolder> {
  const folder: RememberedFolder = {
    id: `${handle.name}-${Date.now().toString(36)}`,
    name: handle.name || 'Music folder',
    handle,
    addedAt: Date.now(),
    scannedAt: Date.now(),
  };
  const db = await openLibrary();
  try {
    try {
      await db.put('folders', folder);
    } catch {
      // A handle that cannot be stored (an old browser, or a context where the
      // object is not transferable) still leaves a folder worth remembering by
      // name: the sheet asks for it again instead of pretending it never saw it.
      await db.put('folders', { ...folder, handle: undefined });
    }
  } finally {
    db.close();
  }
  return folder;
}

export async function rememberedFolders(): Promise<RememberedFolder[]> {
  const db = await openLibrary();
  try {
    return (await db.getAll('folders')).sort((left, right) => left.addedAt - right.addedAt);
  } finally {
    db.close();
  }
}

export async function markFolderScanned(id: string): Promise<void> {
  const db = await openLibrary();
  try {
    const folder = await db.get('folders', id);
    if (folder) await db.put('folders', { ...folder, scannedAt: Date.now() });
  } finally {
    db.close();
  }
}

export async function forgetFolder(id: string): Promise<void> {
  const db = await openLibrary();
  try {
    await db.delete('folders', id);
  } finally {
    db.close();
  }
}
