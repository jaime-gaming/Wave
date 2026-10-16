let sessionRetryAt = 0;
const KEY = 'wave-lyrics-provider-retry-at';
export function lyricsCooldown() {
  try {
    const time = Number(localStorage.getItem(KEY));
    return Math.max(
      Number.isFinite(time) && time > Date.now() ? time : 0,
      sessionRetryAt > Date.now() ? sessionRetryAt : 0,
    );
  } catch {
    return sessionRetryAt > Date.now() ? sessionRetryAt : 0;
  }
}
export function rememberLyricsCooldown(time?: number) {
  if (!time || !Number.isFinite(time)) return;
  try {
    localStorage.setItem(KEY, String(Math.max(lyricsCooldown(), time)));
  } catch {
    sessionRetryAt = Math.max(sessionRetryAt, time);
  }
}
