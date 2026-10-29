// Gambar ikon PNG aplikasi (192, 512, maskable 512) tanpa pustaka tambahan:
// rasterisasi bentuk sederhana dengan supersampling 4×4 lalu disimpan sebagai PNG.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const HIJAU = [31, 95, 69], HIJAU_MUDA = [127, 201, 163], PUTIH = [255, 255, 255];

// Bentuk dalam koordinat 0..512, sama dengan ikon/ikon.svg
function warnaDi(x, y, maskable) {
  if (!maskable) {
    const r = 112;
    const cx = Math.min(Math.max(x, r), 512 - r), cy = Math.min(Math.max(y, r), 512 - r);
    if (Math.hypot(x - cx, y - cy) > r) return null;
  }
  // Pin: lingkaran r=104 di (256,224) dan ekor meruncing ke (256,402)
  const dx = x - 256, dy = y - 224;
  const dalamLingkaran = Math.hypot(dx, dy) <= 104;
  const dalamEkor = y >= 224 && y <= 402 && Math.abs(dx) <= 104 * Math.sqrt(Math.max(0, (402 - y) / 178)) * 0.92;
  if (dalamLingkaran || dalamEkor) return Math.hypot(dx, y - 222) <= 40 ? HIJAU : PUTIH;
  // Garis kontur peta di bawah pin
  const titik = [[88, 330], [184, 290], [280, 330], [376, 290], [424, 310]];
  for (let i = 1; i < titik.length; i++) {
    const [x1, y1] = titik[i - 1], [x2, y2] = titik[i];
    const t = Math.max(0, Math.min(1, ((x - x1) * (x2 - x1) + (y - y1) * (y2 - y1)) / ((x2 - x1) ** 2 + (y2 - y1) ** 2)));
    if (Math.hypot(x - (x1 + t * (x2 - x1)), y - (y1 + t * (y2 - y1))) <= 9) return HIJAU_MUDA;
  }
  return HIJAU;
}

function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function potongan(jenis, data) {
  const kepala = Buffer.alloc(8);
  kepala.writeUInt32BE(data.length, 0);
  kepala.write(jenis, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([kepala.subarray(4), data])), 0);
  return Buffer.concat([kepala, data, crc]);
}

function png(ukuran, maskable) {
  const ss = 4, skala = 512 / ukuran;
  const baris = Buffer.alloc((ukuran * 4 + 1) * ukuran);
  for (let py = 0; py < ukuran; py++) {
    baris[py * (ukuran * 4 + 1)] = 0;
    for (let px = 0; px < ukuran; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const w = warnaDi((px + (sx + 0.5) / ss) * skala, (py + (sy + 0.5) / ss) * skala, maskable);
          if (!w) continue;
          r += w[0]; g += w[1]; b += w[2]; a += 255;
        }
      }
      const n = ss * ss, o = py * (ukuran * 4 + 1) + 1 + px * 4;
      const cakupan = a / 255 || 1;
      baris[o] = Math.round(r / cakupan);
      baris[o + 1] = Math.round(g / cakupan);
      baris[o + 2] = Math.round(b / cakupan);
      baris[o + 3] = Math.round(a / n);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ukuran, 0);
  ihdr.writeUInt32BE(ukuran, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    potongan('IHDR', ihdr),
    potongan('IDAT', deflateSync(baris, { level: 9 })),
    potongan('IEND', Buffer.alloc(0)),
  ]);
}

for (const [nama, ukuran, maskable] of [['ikon-192.png', 192, false], ['ikon-512.png', 512, false], ['ikon-maskable-512.png', 512, true]]) {
  writeFileSync(join(root, 'ikon', nama), png(ukuran, maskable));
  console.log(`ikon/${nama}`);
}
