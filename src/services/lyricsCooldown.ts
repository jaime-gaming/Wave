const KEY = 'wave-lyrics-provider-retry-at';
export function lyricsCooldown() {
  try {
    const time = Number(localStorage.getItem(KEY));
    return Number.isFinite(time) && time > Date.now() ? time : 0;
  } catch {
    return 0;
  }
}
export function rememberLyricsCooldown(time?: number) {
  if (!time || !Number.isFinite(time)) return;
  try {
    localStorage.setItem(KEY, String(Math.max(lyricsCooldown(), time)));
  } catch {
    /* Session result still retains the deadline. */
  }
}
