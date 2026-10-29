// Salin pustaka pihak ketiga dari node_modules ke vendor/ agar aplikasi bisa jalan offline
// tanpa langkah build. Jalankan ulang setelah memperbarui versi di package.json.
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const nm = join(root, 'node_modules');

const files = [
  ['pdfjs-dist/legacy/build/pdf.min.mjs', 'vendor/pdfjs/pdf.min.mjs'],
  ['pdfjs-dist/legacy/build/pdf.worker.min.mjs', 'vendor/pdfjs/pdf.worker.min.mjs'],
  ['pdfjs-dist/LICENSE', 'vendor/pdfjs/LICENSE'],
  ['pdf-lib/dist/pdf-lib.min.js', 'vendor/pdf-lib/pdf-lib.min.js'],
  ['pdf-lib/LICENSE.md', 'vendor/pdf-lib/LICENSE.md'],
  ['proj4/dist/proj4.js', 'vendor/proj4/proj4.js'],
  ['proj4/LICENSE.md', 'vendor/proj4/LICENSE.md'],
];

for (const [from, to] of files) {
  mkdirSync(dirname(join(root, to)), { recursive: true });
  copyFileSync(join(nm, from), join(root, to));
  console.log(`${from} -> ${to}`);
}
