// Membuat GeoPDF contoh berisi data FIKTIF untuk demo dan tes:
// UTM zona 50N (WGS 84), 10 km × 6,76 km, georeferensi ISO 32000 (/VP + /Measure /GEO).
// Keluaran: contoh/contoh-peta.pdf dan contoh/titik-kontrol.json
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { PDFDocument, PDFName, PDFString, StandardFonts, rgb } = require('pdf-lib');
const proj4 = require('proj4');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const UTM50 = '+proj=utm +zone=50 +datum=WGS84 +units=m +no_defs';
const WKT = 'PROJCS["WGS 84 / UTM zone 50N",GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["latitude_of_origin",0],PARAMETER["central_meridian",117],PARAMETER["scale_factor",0.9996],PARAMETER["false_easting",500000],PARAMETER["false_northing",0],UNIT["metre",1]]';
const keGeo = proj4(UTM50, 'EPSG:4326');

const LEBAR = 842, TINGGI = 595;
const KOTAK = { x1: 40, y1: 40, x2: 802, y2: 540 };
const E0 = 455000, E1 = 465000, N0 = 390000;
const mPerPt = (E1 - E0) / (KOTAK.x2 - KOTAK.x1);
const N1 = N0 + (KOTAK.y2 - KOTAK.y1) * mPerPt;
const keHal = (e, n) => [KOTAK.x1 + (e - E0) / mPerPt, KOTAK.y1 + (n - N0) / mPerPt];

const doc = await PDFDocument.create();
doc.setTitle('Peta contoh (data fiktif)');
doc.setProducer('Peta Lapangan');
const page = doc.addPage([LEBAR, TINGGI]);
const huruf = await doc.embedFont(StandardFonts.Helvetica);
const tebal = await doc.embedFont(StandardFonts.HelveticaBold);

const garis = (titik, warna, tebalGaris) => {
  for (let i = 1; i < titik.length; i++) {
    const [x1, y1] = keHal(...titik[i - 1]), [x2, y2] = keHal(...titik[i]);
    page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, color: warna, thickness: tebalGaris });
  }
};
const teks = (s, x, y, ukuran = 8, warna = rgb(0.2, 0.2, 0.2), f = huruf) => page.drawText(s, { x, y, size: ukuran, font: f, color: warna });

// Latar peta dan grid 1 km
page.drawRectangle({ x: KOTAK.x1, y: KOTAK.y1, width: KOTAK.x2 - KOTAK.x1, height: KOTAK.y2 - KOTAK.y1, color: rgb(0.95, 0.97, 0.92) });
// Kawasan hutan fiktif
for (let e = 458000; e < 463500; e += 500) {
  for (let n = 393500; n < 396300; n += 500) {
    const [x, y] = keHal(e, n);
    page.drawRectangle({ x, y, width: 500 / mPerPt, height: 500 / mPerPt, color: rgb(0.8, 0.9, 0.75) });
  }
}
for (let e = 456000; e < E1; e += 1000) {
  const [x] = keHal(e, N0);
  page.drawLine({ start: { x, y: KOTAK.y1 }, end: { x, y: KOTAK.y2 }, color: rgb(0.6, 0.6, 0.6), thickness: 0.4 });
  teks(String(e), x - 14, KOTAK.y1 - 10, 6);
}
for (let n = 391000; n < N1; n += 1000) {
  const [, y] = keHal(E0, n);
  page.drawLine({ start: { x: KOTAK.x1, y }, end: { x: KOTAK.x2, y }, color: rgb(0.6, 0.6, 0.6), thickness: 0.4 });
  teks(String(n), KOTAK.x1 - 34, y - 2, 6);
}

// Sungai dan jalan fiktif
const sungai = [];
for (let e = E0; e <= E1; e += 100) sungai.push([e, 393200 + 900 * Math.sin((e - E0) / 1400) + 300 * Math.sin((e - E0) / 430)]);
garis(sungai, rgb(0.2, 0.45, 0.85), 2.2);
garis([[455000, 390800], [458500, 391900], [461200, 391700], [465000, 393600]], rgb(0.75, 0.35, 0.15), 1.6);
teks('Sungai Contoh', ...keHal(456300, 394400), 9, rgb(0.15, 0.35, 0.75), tebal);
teks('Jalan desa', ...keHal(461600, 392000), 8, rgb(0.6, 0.25, 0.1));
teks('Hutan adat (fiktif)', ...keHal(459200, 395800), 9, rgb(0.2, 0.45, 0.2), tebal);

// Permukiman fiktif
for (const [nama, e, n] of [['Desa Contoh A', 457600, 391400], ['Desa Contoh B', 463100, 392700]]) {
  const [x, y] = keHal(e, n);
  page.drawRectangle({ x: x - 4, y: y - 4, width: 8, height: 8, color: rgb(0.55, 0.1, 0.1) });
  teks(nama, x + 7, y - 3, 8, rgb(0.3, 0.05, 0.05), tebal);
}

// Titik kontrol dengan koordinat tertulis, untuk memeriksa ketepatan posisi
const kontrol = [['KT-1', 457000, 392000], ['KT-2', 462500, 395000], ['KT-3', 460000, 391000], ['KT-4', 464000, 396000]].map(([nama, e, n]) => {
  const [lon, lat] = keGeo.forward([e, n]);
  const [x, y] = keHal(e, n);
  page.drawLine({ start: { x: x - 6, y }, end: { x: x + 6, y }, color: rgb(0, 0, 0), thickness: 1 });
  page.drawLine({ start: { x, y: y - 6 }, end: { x, y: y + 6 }, color: rgb(0, 0, 0), thickness: 1 });
  teks(nama, x + 5, y + 4, 8, rgb(0, 0, 0), tebal);
  teks(`${lat.toFixed(6)}, ${lon.toFixed(6)}`, x + 5, y - 7, 6.5, rgb(0, 0, 0));
  return { nama, e, n, lat, lon, x, y };
});

// Bingkai dan keterangan
page.drawRectangle({ x: KOTAK.x1, y: KOTAK.y1, width: KOTAK.x2 - KOTAK.x1, height: KOTAK.y2 - KOTAK.y1, borderColor: rgb(0.1, 0.1, 0.1), borderWidth: 1.2 });
teks('PETA CONTOH - DATA FIKTIF', KOTAK.x1, TINGGI - 32, 13, rgb(0.1, 0.1, 0.1), tebal);
teks('UTM zona 50N, WGS 84  |  Grid 1 km  |  Hanya untuk uji aplikasi Peta Lapangan', KOTAK.x1, TINGGI - 46, 8);

// Georeferensi ISO 32000
const sudut = [[E0, N0], [E0, N1], [E1, N1], [E1, N0]];
const gpts = sudut.flatMap(([e, n]) => {
  const [lon, lat] = keGeo.forward([e, n]);
  return [lat, lon];
});
const ctx = doc.context;
const viewport = ctx.obj({
  Type: 'Viewport',
  BBox: [KOTAK.x1, KOTAK.y1, KOTAK.x2, KOTAK.y2],
  Name: PDFString.of('Peta contoh'),
  Measure: {
    Type: 'Measure',
    Subtype: 'GEO',
    Bounds: [0, 0, 0, 1, 1, 1, 1, 0],
    GPTS: gpts,
    LPTS: [0, 0, 0, 1, 1, 1, 1, 0],
    GCS: { Type: 'PROJCS', EPSG: 32650, WKT: PDFString.of(WKT) },
    PDU: ['M', 'SQM', 'DEG'],
  },
});
page.node.set(PDFName.of('VP'), ctx.obj([viewport]));

mkdirSync(join(root, 'contoh'), { recursive: true });
writeFileSync(join(root, 'contoh', 'contoh-peta.pdf'), await doc.save());
writeFileSync(join(root, 'contoh', 'titik-kontrol.json'), JSON.stringify(kontrol, null, 2) + '\n');
console.log('contoh/contoh-peta.pdf dan contoh/titik-kontrol.json dibuat');
for (const k of kontrol) console.log(`  ${k.nama}: ${k.lat.toFixed(6)}, ${k.lon.toFixed(6)}`);
