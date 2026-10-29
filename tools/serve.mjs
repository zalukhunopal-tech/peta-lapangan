// Server statis kecil untuk mencoba aplikasi di komputer: npm run serve
// (GPS dan service worker hanya jalan di https atau localhost.)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const akar = fileURLToPath(new URL('..', import.meta.url));
const port = Number(process.env.PORT || 8080);
const TIPE = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.pdf': 'application/pdf',
};

createServer(async (req, res) => {
  try {
    let jalur = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (jalur.endsWith('/')) jalur += 'index.html';
    const berkas = normalize(join(akar, jalur));
    if (!berkas.startsWith(akar) || berkas.includes(`${sep}node_modules${sep}`)) {
      res.writeHead(403).end();
      return;
    }
    const isi = await readFile(berkas);
    res.writeHead(200, { 'Content-Type': TIPE[extname(berkas)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(isi);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Tidak ditemukan');
  }
}).listen(port, '127.0.0.1', () => console.log(`Peta Lapangan: http://localhost:${port}/`));
