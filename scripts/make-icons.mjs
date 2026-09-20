// genera extension/icons/{16,48,128}.png sin dependencias (png escrito a mano + supersampling).
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'extension', 'icons');
mkdirSync(out, { recursive: true });

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
const png = (w, h, rgba) => {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
};

// distancia con signo en coordenadas 0..1
const rrect = (x, y, w, h, r) => { const dx = Math.abs(x - 0.5) - (w / 2 - r), dy = Math.abs(y - 0.5) - (h / 2 - r); return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - r; };
const capsule = (x, y, cx, y0, y1, r) => Math.hypot(x - cx, y - Math.min(Math.max(y, y0), y1)) - r;
const seg = (x, y, ax, ay, bx, by) => { const px = x - ax, py = y - ay, dx = bx - ax, dy = by - ay; const t = Math.min(1, Math.max(0, (px * dx + py * dy) / (dx * dx + dy * dy))); return Math.hypot(px - t * dx, py - t * dy); };

const PAPER = [245, 240, 232], INK = [26, 18, 8];

// papel crema con borde de tinta; dos dedos y un chevron dibujados solo con trazo, como el resto de la interfaz
function render(size) {
  const S = 4, W = size * S, buf = Buffer.alloc(size * size * 4);
  const line = size <= 16 ? 0.075 : size <= 48 ? 0.05 : 0.036;   // el trazo se engrosa en tamaños chicos
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
      const x = (px * S + sx + 0.5) / W, y = (py * S + sy + 0.5) / W;
      const box = rrect(x, y, 1, 1, 0.2);
      if (box > 0) continue;
      let c = PAPER;
      const border = Math.abs(rrect(x, y, 0.92, 0.92, 0.16)) < line / 2;
      const fingers = Math.min(Math.abs(capsule(x, y, 0.4, 0.52, 0.8, 0.075)), Math.abs(capsule(x, y, 0.6, 0.46, 0.8, 0.075))) < line / 2;
      const chevron = Math.min(seg(x, y, 0.34, 0.3, 0.5, 0.15), seg(x, y, 0.5, 0.15, 0.66, 0.3)) < line * 0.6;
      if (border || fingers || chevron) c = INK;
      r += c[0]; g += c[1]; b += c[2]; a += 255;
    }
    const n = S * S, i = (py * size + px) * 4;
    if (a) { buf[i] = r / (a / 255); buf[i + 1] = g / (a / 255); buf[i + 2] = b / (a / 255); buf[i + 3] = a / n; }
  }
  return png(size, size, buf);
}

for (const s of [16, 48, 128]) writeFileSync(join(out, `${s}.png`), render(s));
console.log('iconos generados en', out);
