/**
 * generate-icons.mjs — produce the PWA placeholder icons with zero dependencies
 * (Node's built-in zlib only). Re-run with `npm run icons`. Phase 2 replaces
 * these with real art.
 *
 * Design: felt-green field, a white rounded "card", and a red diamond pip.
 * Output: public/icons/{pwa-192,pwa-512,pwa-512-maskable,apple-touch-icon}.png
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

// ── minimal PNG encoder (8-bit RGBA) ────────────────────────────────────────
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
};
function encodePNG(size, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0; // filter: none
    rgba.copy(raw, y * stride + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── drawing ─────────────────────────────────────────────────────────────────
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const FELT = hex('#0b6b3a');
const CARD = hex('#f5f3ec');
const RED = hex('#c0392b');

function drawIcon(size, cardScale = 0.7) {
  const buf = Buffer.alloc(size * size * 4);
  const c = size / 2;
  const cardHalf = (size * cardScale) / 2;
  const radius = size * 0.1;
  const dW = size * 0.15;
  const dH = size * 0.22;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = Math.abs(x - c);
      const dy = Math.abs(y - c);
      let rgb = FELT;
      const inCornerCut =
        dx > cardHalf - radius &&
        dy > cardHalf - radius &&
        (dx - (cardHalf - radius)) ** 2 + (dy - (cardHalf - radius)) ** 2 > radius ** 2;
      if (dx <= cardHalf && dy <= cardHalf && !inCornerCut) rgb = CARD;
      if (dx / dW + dy / dH <= 1) rgb = RED; // diamond pip
      const i = (y * size + x) * 4;
      buf[i] = rgb[0];
      buf[i + 1] = rgb[1];
      buf[i + 2] = rgb[2];
      buf[i + 3] = 255;
    }
  }
  return buf;
}

mkdirSync(OUT, { recursive: true });
const files = [
  ['pwa-192.png', 192, 0.7],
  ['pwa-512.png', 512, 0.7],
  ['pwa-512-maskable.png', 512, 0.56], // smaller card -> stays in the maskable safe zone
  ['apple-touch-icon.png', 180, 0.72],
];
for (const [name, size, scale] of files) {
  writeFileSync(join(OUT, name), encodePNG(size, drawIcon(size, scale)));
  console.log('wrote', name);
}
