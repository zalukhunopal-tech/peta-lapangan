import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { bacaGeoreferensi, buatTransformasi, pilihViewportUtama, batasGeo, diDalamBatas, namaCrs } from '../js/georef.js';
import { definisiEpsg } from '../js/epsg.js';

const require = createRequire(import.meta.url);
const PDFLib = require('pdf-lib');
const proj4 = require('proj4');

const pdf = new Uint8Array(readFileSync(new URL('../contoh/contoh-peta.pdf', import.meta.url)));
const kontrol = JSON.parse(readFileSync(new URL('../contoh/titik-kontrol.json', import.meta.url), 'utf8'));

test('membaca georeferensi ISO 32000 dari GeoPDF contoh', async () => {
  const info = await bacaGeoreferensi(pdf, { PDFLib, proj4 });
  assert.equal(info.format, 'iso32000');
  assert.equal(info.halaman, 0);
  const vp = pilihViewportUtama(info);
  assert.equal(vp.crs.epsg, 32650);
  assert.match(vp.crs.wkt, /UTM zone 50N/);
  assert.equal(vp.kontrol.length, 4);
  assert.equal(namaCrs(vp.crs), 'WGS 84 / UTM zone 50N (EPSG:32650)');
});

test('transformasi tepat di titik kontrol yang tergambar di peta', async () => {
  const vp = pilihViewportUtama(await bacaGeoreferensi(pdf, { PDFLib, proj4 }));
  const tf = buatTransformasi(vp, proj4);
  assert.equal(tf.metode, 'afin-proyeksi');
  assert.ok(tf.sisaMeter < 0.01, `sisa ${tf.sisaMeter} m`);
  for (const k of kontrol) {
    const [x, y] = tf.keHalaman(k.lat, k.lon);
    assert.ok(Math.abs(x - k.x) < 0.01 && Math.abs(y - k.y) < 0.01, `${k.nama} ke halaman: ${x},${y} vs ${k.x},${k.y}`);
    const g = tf.keGeografis(k.x, k.y);
    assert.ok(Math.abs(g.lat - k.lat) < 1e-7 && Math.abs(g.lon - k.lon) < 1e-7, `${k.nama} ke geografis`);
  }
});

test('batas peta dan uji di dalam/di luar', async () => {
  const vp = pilihViewportUtama(await bacaGeoreferensi(pdf, { PDFLib, proj4 }));
  const tf = buatTransformasi(vp, proj4);
  const b = batasGeo(vp, tf);
  assert.ok(b.selatan < b.utara && b.barat < b.timur);
  assert.ok(diDalamBatas(vp, tf, kontrol[0].lat, kontrol[0].lon));
  assert.ok(!diDalamBatas(vp, tf, b.utara + 0.01, kontrol[0].lon));
});

// Peta sintetis dalam koordinat geografis: halaman linear terhadap bujur/lintang.
function viewportGeografis(crs) {
  const kontrolSintetis = [[0, 0], [0, 1], [1, 1], [1, 0]].map(([u, v]) => ({
    x: 100 + u * 600, y: 50 + v * 400, lat: 3.5 + v * 0.2, lon: 116.5 + u * 0.3,
  }));
  return { kontrol: kontrolSintetis, batas: kontrolSintetis.map((k) => [k.x, k.y]), bbox: [100, 50, 700, 450], crs };
}

test('peta geografis memakai afin bujur/lintang', () => {
  const tf = buatTransformasi(viewportGeografis({ jenis: 'GEOGCS', epsg: 4326, wkt: null }), proj4);
  assert.equal(tf.metode, 'afin-geografis');
  const [x, y] = tf.keHalaman(3.6, 116.65);
  assert.ok(Math.abs(x - 400) < 1e-6 && Math.abs(y - 250) < 1e-6);
});

test('tanpa sistem koordinat jatuh ke homografi namun tetap tepat di titik kontrol', () => {
  const vp = viewportGeografis({ jenis: null, epsg: null, wkt: null });
  const tf = buatTransformasi(vp, proj4);
  assert.equal(tf.metode, 'homografi');
  for (const k of vp.kontrol) {
    const [x, y] = tf.keHalaman(k.lat, k.lon);
    assert.ok(Math.abs(x - k.x) < 1e-6 && Math.abs(y - k.y) < 1e-6);
  }
});

test('EPSG Indonesia dikenali', () => {
  assert.match(definisiEpsg(23837), /\+lon_0=115.5 /);
  assert.match(definisiEpsg(32750), /\+zone=50 \+south/);
  assert.equal(definisiEpsg(99999), null);
});
