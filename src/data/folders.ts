import { openLibrary, type RememberedFolder } from './library';

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

export interface PickerScope {
  showDirectoryPicker?: (options?: object) => Promise<DirectoryHandleLike>;
}

export function supportsFolderPicker(
  scope: PickerScope | undefined = globalThis.window as PickerScope,
) {
  return typeof scope?.showDirectoryPicker === 'function';
}

export function supportsDirectoryInput(doc: Document | undefined = globalThis.document) {
  if (!doc) return false;
  const input = doc.createElement('input');
  return 'webkitdirectory' in input;
}

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

export async function requestFolderAccess(folder: RememberedFolder): Promise<boolean> {
  const handle = folder.handle as DirectoryHandleLike | undefined;
  if (!handle?.requestPermission) return false;
  try {
    return (await handle.requestPermission({ mode: 'read' })) === 'granted';
  } catch {
    return false;
  }
}

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
          } catch {}
        } else {
          await walk(entry, depth + 1);
        }
      }
    } catch {}
  };
  await walk(handle, 0);
  return files;
}

export function inEmbeddedFrame(
  scope: (PickerScope & { top?: unknown }) | undefined = globalThis.window as PickerScope,
): boolean {
  if (!scope) return false;
  try {
    return Boolean(scope.top) && scope.top !== scope;
  } catch {
    return true;
  }
}

export function canShowFolderPicker(
  scope: (PickerScope & { top?: unknown }) | undefined = globalThis.window as PickerScope,
): boolean {
  return supportsFolderPicker(scope) && !inEmbeddedFrame(scope);
}

export type FolderPick =
  { ok: true; handle: DirectoryHandleLike } | { ok: false; reason: 'cancelled' | 'blocked' };

export async function pickFolder(
  scope: (PickerScope & { top?: unknown }) | undefined = globalThis.window as PickerScope,
): Promise<FolderPick> {
  if (!scope?.showDirectoryPicker) return { ok: false, reason: 'blocked' };
  try {
    const handle = (await scope.showDirectoryPicker({
      id: 'wave-music',
      mode: 'read',
    })) as DirectoryHandleLike;
    return { ok: true, handle };
  } catch (error) {
    const name = (error as { name?: string } | undefined)?.name;

    if (name === 'AbortError') return { ok: false, reason: 'cancelled' };
    return { ok: false, reason: 'blocked' };
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
