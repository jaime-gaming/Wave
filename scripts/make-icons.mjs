/**
 * Renders the app icons from the same wave stroke used by `public/wave.svg`.
 *
 * Run with `node scripts/make-icons.mjs`. There is no image dependency: the
 * artwork is two primitives (a rounded background and a stroked polyline), so
 * the pixels are drawn here and written as PNG with zlib.
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'icons');

/**
 * The wave glyph from `public/wave.svg`: four cubic segments in a 40×32 box,
 * kept here as control points so the icons match the favicon exactly.
 */
const START = [4, 7];
const CURVES = [
  [
    [7, 7],
    [7, 23],
    [12, 23],
  ],
  [
    [17, 23],
    [17, 7],
    [20, 7],
  ],
  [
    [23, 7],
    [23, 23],
    [28, 23],
  ],
  [
    [33, 23],
    [33, 7],
    [36, 7],
  ],
];

function wavePoints(perCurve = 160) {
  const points = [START];
  let [x0, y0] = START;
  for (const [[c1x, c1y], [c2x, c2y], [x1, y1]] of CURVES) {
    for (let i = 1; i <= perCurve; i += 1) {
      const t = i / perCurve;
      const u = 1 - t;
      points.push([
        u * u * u * x0 + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * x1,
        u * u * u * y0 + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * y1,
      ]);
    }
    [x0, y0] = [x1, y1];
  }
  return points;
}

const WAVE = wavePoints();

function render({ size, scale, offsetX, offsetY, strokeWidth }) {
  const pixels = new Uint8Array(size * size * 4);
  const background = [18, 19, 26];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      pixels[i] = background[0];
      pixels[i + 1] = background[1];
      pixels[i + 2] = background[2];
      pixels[i + 3] = 255;
    }
  }
  const accent = [137, 169, 236];
  const unit = (size / 512) * scale;
  const radius = (strokeWidth * unit) / 2;
  const centreX = offsetX * (size / 512);
  const centreY = offsetY * (size / 512);
  for (const [px, py] of WAVE) {
    const cx = centreX + px * unit;
    const cy = centreY + py * unit;
    const from = Math.max(0, Math.floor(cx - radius - 1));
    const to = Math.min(size - 1, Math.ceil(cx + radius + 1));
    const top = Math.max(0, Math.floor(cy - radius - 1));
    const bottom = Math.min(size - 1, Math.ceil(cy + radius + 1));
    for (let y = top; y <= bottom; y += 1) {
      for (let x = from; x <= to; x += 1) {
        const distance = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        // One pixel of feathering keeps the curve smooth at small sizes.
        const alpha = Math.min(1, Math.max(0, radius + 0.5 - distance));
        if (alpha <= 0) continue;
        const i = (y * size + x) * 4;
        for (let c = 0; c < 3; c += 1)
          pixels[i + c] = Math.round(pixels[i + c] * (1 - alpha) + accent[c] * alpha);
      }
    }
  }
  return encodePng(size, pixels);
}

function encodePng(size, pixels) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0;
    Buffer.from(pixels.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1);
  }
  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

mkdirSync(OUT, { recursive: true });
const icons = [
  ['icon-192.png', { size: 192, scale: 8, offsetX: 96, offsetY: 136, strokeWidth: 3.6 }],
  ['icon-512.png', { size: 512, scale: 8, offsetX: 96, offsetY: 136, strokeWidth: 3.6 }],
  // Maskable icons are cropped to a circle by the launcher, so the glyph sits
  // inside the middle 80 % of the canvas.
  ['icon-maskable-512.png', { size: 512, scale: 6, offsetX: 136, offsetY: 172, strokeWidth: 4.2 }],
  ['apple-touch-icon.png', { size: 180, scale: 8, offsetX: 96, offsetY: 136, strokeWidth: 3.6 }],
];
for (const [name, options] of icons) {
  writeFileSync(join(OUT, name), render(options));
  console.log(`public/icons/${name}`);
}
