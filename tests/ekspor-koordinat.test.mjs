import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { DOMParser } from '@xmldom/xmldom';
import { keKML, keGPX, dariKML, dariGPX } from '../js/exporters.js';
import { formatDMS, formatUTM, formatJarak, panjangJalur } from '../js/coords.js';
import { PerekamJalur } from '../js/perekam.js';

const proj4 = createRequire(import.meta.url)('proj4');

const fitur = [
  { id: 'a', jenis: 'titik', nama: 'Pohon <ulin> & batas', catatan: 'Diameter 80 cm', dibuat: '2026-10-29T03:00:00.000Z', titik: [{ lat: 3.58, lon: 116.63, alt: 120 }] },
  { id: 'b', jenis: 'jalur', nama: 'Patroli 1', catatan: '', dibuat: '2026-10-29T04:00:00.000Z', titik: [
    { lat: 3.58, lon: 116.63, waktu: '2026-10-29T04:00:00.000Z' },
    { lat: 3.581, lon: 116.631, waktu: '2026-10-29T04:01:00.000Z' },
    { lat: 3.582, lon: 116.633 },
  ] },
];

for (const [nama, ke, dari] of [['KML', keKML, dariKML], ['GPX', keGPX, dariGPX]]) {
  test(`${nama}: ekspor lalu impor kembali menghasilkan data yang sama`, () => {
    const hasil = dari(ke(fitur), DOMParser);
    assert.equal(hasil.length, 2);
    const titik = hasil.find((f) => f.jenis === 'titik');
    const jalur = hasil.find((f) => f.jenis === 'jalur');
    assert.equal(titik.nama, 'Pohon <ulin> & batas');
    assert.equal(titik.catatan, 'Diameter 80 cm');
    assert.deepEqual([titik.titik[0].lat, titik.titik[0].lon, titik.titik[0].alt], [3.58, 116.63, 120]);
    assert.equal(jalur.nama, 'Patroli 1');
    assert.deepEqual(jalur.titik.map((t) => [t.lat, t.lon]), fitur[1].titik.map((t) => [t.lat, t.lon]));
  });
}

test('format koordinat', () => {
  assert.equal(formatDMS(-3.5, 116.25), `3°30'00,0" LS  116°15'00,0" BT`);
  assert.equal(formatUTM(0.0001, 117, proj4).slice(0, 15), '50N  500000 mT ');
  assert.equal(formatJarak(850.4), '850 m');
  assert.equal(formatJarak(1234), '1,23 km');
});

test('perekam jalur menolak posisi tidak akurat dan terlalu rapat', () => {
  const r = new PerekamJalur({ akurasiMaks: 20, jarakMin: 5 });
  r.mulai();
  assert.equal(r.tambah({ lat: 3.58, lon: 116.63, akurasi: 50, waktu: 1 }), false);
  assert.equal(r.tambah({ lat: 3.58, lon: 116.63, akurasi: 5, waktu: 2 }), true);
  assert.equal(r.tambah({ lat: 3.58001, lon: 116.63, akurasi: 5, waktu: 3 }), false);
  assert.equal(r.tambah({ lat: 3.5801, lon: 116.63, akurasi: 5, waktu: 4 }), true);
  assert.ok(Math.abs(r.panjang - panjangJalur(r.titik)) < 1e-9);
});
