/**
 * The mark, in the colour of what is playing.
 *
 * The tab is the one place where Wave is not on screen: a pinned tab, a
 * background window, a bookmark bar. Painting the favicon with the same hue the
 * interface takes from the cover keeps that one square telling the truth, and it
 * costs a single `data:` URI — no network, no canvas, no extra request.
 *
 * The shape is the same path the interface draws, on a rounded tile, because a
 * two-pixel stroke on a transparent background disappears in a tab strip.
 */
const PATH = 'M4 7C7 7 7 23 12 23C17 23 17 7 20 7C23 7 23 23 28 23C33 23 33 7 36 7';

const clampHue = (hue: number) => (Number.isFinite(hue) ? ((hue % 360) + 360) % 360 : 226);
const clampSaturation = (saturation: number) =>
  Number.isFinite(saturation) ? Math.min(100, Math.max(0, saturation)) : 24;

export const DEFAULT_HUE = 226;
export const DEFAULT_SATURATION = 24;

/** The favicon as an SVG source string, for tests and for the link element. */
export function faviconSvg(hue = DEFAULT_HUE, saturation = DEFAULT_SATURATION): string {
  const h = clampHue(hue);
  const s = clampSaturation(saturation);
  const tile = `hsl(${h.toFixed(0)} ${Math.min(100, s + 6).toFixed(0)}% 13%)`;
  const stroke = `hsl(${h.toFixed(0)} 62% 78%)`;
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">',
    `<rect width="64" height="64" rx="16" fill="${tile}"/>`,
    `<path d="${PATH}" transform="translate(6 12.5) scale(1.3)" fill="none" stroke="${stroke}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>`,
    '</svg>',
  ].join('');
}

export function faviconHref(hue?: number, saturation?: number): string {
  return `data:image/svg+xml,${encodeURIComponent(faviconSvg(hue, saturation))}`;
}

/**
 * Points the tab's icon at the current colour.
 *
 * Browsers only re-read the icon when `href` actually changes, so the previous
 * value is compared first: a re-render with the same colour is a no-op.
 */
export function applyFavicon(hue?: number, saturation?: number): void {
  if (typeof document === 'undefined') return;
  const head = document.head;
  if (!head) return;
  let link = head.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    head.appendChild(link);
  }
  const href = faviconHref(hue, saturation);
  if (link.getAttribute('href') === href) return;
  link.type = 'image/svg+xml';
  link.setAttribute('href', href);
}
