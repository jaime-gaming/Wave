import { expect, it } from 'vitest';
import { playlistIcon } from './playlistVisual';
it('makes stable distinct vector identities for playlists without covers', () => {
  expect(playlistIcon('one', 'Morning')).toBe(playlistIcon('one', 'Morning'));
  expect(playlistIcon('one', 'Morning')).not.toBe(playlistIcon('two', 'Morning'));
  expect(decodeURIComponent(playlistIcon('one', 'Morning'))).toContain('MO');
});
it('mixes member colors and escapes names instead of injecting markup', () => {
  const svg = decodeURIComponent(playlistIcon('mix', '<&', ['rgb(250,0,0)', 'rgb(0,0,250)']));
  expect(svg).toContain('rgb(250,0,0)');
  expect(svg).toContain('rgb(0,0,250)');
  expect(svg).toContain('&lt;&amp;');
  expect(svg).not.toContain('<text><');
});

it('uses a restrained common glyph without gradients, random rotations or effects', () => {
  const svg = decodeURIComponent(playlistIcon('quiet', 'Long'.repeat(30)));
  expect(svg).not.toMatch(/gradient|rotate\(|<filter|radial/i);
  expect(svg).toContain('M82 116h89');
});
it('keeps the glyph legible on very pale member colors', () => {
  expect(decodeURIComponent(playlistIcon('light', 'Light', ['rgb(255,255,255)']))).toContain(
    'stroke="#172033"',
  );
  expect(decodeURIComponent(playlistIcon('dark', 'Dark', ['rgb(0,0,0)']))).toContain(
    'stroke="#fff"',
  );
});
