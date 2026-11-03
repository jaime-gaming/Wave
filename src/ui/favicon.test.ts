import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyFavicon, DEFAULT_HUE, faviconHref, faviconSvg } from './favicon';

beforeEach(() => {
  document.head.innerHTML = '<link rel="icon" type="image/svg+xml" href="/wave.svg" />';
});
afterEach(() => {
  document.head.innerHTML = '';
});

describe('the tab, in the colour of the music', () => {
  it('paints the mark with the hue it is given', () => {
    const blue = faviconSvg(226, 24);
    const orange = faviconSvg(28, 40);
    expect(blue).not.toBe(orange);
    expect(blue).toContain('hsl(226');
    expect(orange).toContain('hsl(28');
    // Same path as the interface draws, on a tile that survives a tab strip.
    expect(blue).toContain('<rect');
    expect(blue).toContain('stroke-linecap');
    expect(faviconHref(226)).toMatch(/^data:image\/svg\+xml,/u);
  });

  it('keeps the colour inside its own range', () => {
    expect(faviconSvg(400)).toBe(faviconSvg(40));
    expect(faviconSvg(-40)).toBe(faviconSvg(320));
    expect(faviconSvg(Number.NaN, Number.NaN)).toBe(faviconSvg(DEFAULT_HUE, 24));
    expect(faviconSvg(226, 400)).toBe(faviconSvg(226, 100));
  });

  it('replaces the tab icon and leaves it alone when nothing changed', () => {
    const link = document.querySelector('link[rel="icon"]') as HTMLLinkElement;
    applyFavicon(90, 30);
    expect(link.type).toBe('image/svg+xml');
    expect(link.getAttribute('href')).toBe(faviconHref(90, 30));

    // A second call with the same hue must not touch the element again: the
    // browser re-reads the icon every time the attribute changes.
    const before = link.getAttribute('href');
    link.setAttribute('href', before as string);
    applyFavicon(90, 30);
    expect(link.getAttribute('href')).toBe(before);

    applyFavicon(200, 30);
    expect(link.getAttribute('href')).toBe(faviconHref(200, 30));
  });

  it('creates the link when the page has none', () => {
    document.head.innerHTML = '';
    applyFavicon(120, 20);
    const link = document.querySelector('link[rel="icon"]') as HTMLLinkElement;
    expect(link).not.toBeNull();
    expect(link.getAttribute('href')).toBe(faviconHref(120, 20));
  });
});
