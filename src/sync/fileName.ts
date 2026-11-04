/**
 * A name for a kept song that a player will recognise.
 *
 * `audio/mpeg` is an MP3 and `audio/x-wav` a WAV; taking whatever follows the
 * slash produced `.mpeg` and `.x-wav`, which play but read as a mistake in a
 * folder full of music.
 */
const extensions: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/flac': 'flac',
  'audio/x-flac': 'flac',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/webm': 'webm',
};

/** The file name a borrowed song is added under. */
export function borrowedName(title: string | undefined, mime: string) {
  const extension = extensions[mime.split(';')[0].trim().toLowerCase()] ?? 'audio';
  return `${title ?? 'Borrowed song'}.${extension}`;
}
