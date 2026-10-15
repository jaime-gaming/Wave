const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!,
  );
/** Flat library label with a consistent playlist glyph and member-color spine. */
export function playlistIcon(id: string, name: string, colors: string[] = []): string {
  let hash = 0;
  for (const c of id) hash = (Math.imul(hash, 31) + c.charCodeAt(0)) >>> 0;
  const tones = ['#596c7d', '#736882', '#58716c', '#806858', '#626d8c', '#7c6370'];
  const palette = colors.length
    ? colors.slice(0, 4)
    : [tones[((hash ^ (hash >>> 8)) >>> 0) % tones.length]];
  const rgb = palette[0].match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
  const ink =
    rgb && 0.2126 * Number(rgb[1]) + 0.7152 * Number(rgb[2]) + 0.0722 * Number(rgb[3]) > 165
      ? '#172033'
      : '#fff';
  const letters = Array.from(name.trim()).slice(0, 2).join('').toLocaleUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320"><title>${escape(name)}</title><rect width="320" height="320" rx="32" fill="${escape(palette[0])}"/><rect width="320" height="320" rx="32" fill="#000" opacity=".12"/>${palette.map((c, i) => `<rect x="0" y="${32 + (i * 256) / palette.length}" width="12" height="${256 / palette.length}" fill="${escape(c)}"/>`).join('')}<g fill="none" stroke="${ink}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"><path d="M82 116h89M82 153h89M82 190h49M223 112v94"/><path d="M223 112l27 8"/><ellipse cx="206" cy="210" rx="17" ry="13" fill="${ink}"/></g><text x="28" y="39" font-family="system-ui,sans-serif" font-size="16" font-weight="600" letter-spacing="1" fill="${ink}" opacity=".8">${escape(letters)}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
