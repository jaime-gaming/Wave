/* Visual preferences only. This page never opens the music library or a lyrics connection. */
const waveSystemTheme = globalThis.matchMedia('(prefers-color-scheme: light)');
function applyWaveAppearance() {
  let theme = 'system',
    palette;
  try {
    theme = globalThis.localStorage.getItem('wave-theme') || 'system';
    palette = JSON.parse(globalThis.localStorage.getItem('wave-palette') || 'null');
  } catch {
    /* Default Wave roles also work without storage. */
  }
  const root = globalThis.document.documentElement;
  root.dataset.theme =
    theme === 'light' || (theme === 'system' && waveSystemTheme.matches) ? 'light' : 'dark';
  const hue =
    palette && Number.isFinite(palette.hue) && palette.hue >= 0 && palette.hue <= 360
      ? palette.hue
      : 226;
  root.style.setProperty('--hue', String(hue));
}
applyWaveAppearance();
waveSystemTheme.addEventListener('change', applyWaveAppearance);
globalThis.addEventListener('storage', (event) => {
  if (event.key === null || event.key === 'wave-theme' || event.key === 'wave-palette')
    applyWaveAppearance();
});
