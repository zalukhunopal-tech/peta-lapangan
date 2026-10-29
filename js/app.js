// Pengendali antarmuka Peta Lapangan: daftar peta, penampil peta, titik, jalur, impor/ekspor.
import * as pdfjs from '../vendor/pdfjs/pdf.min.mjs';
import { db } from './db.js';
import { bacaGeoreferensi, buatTransformasi, pilihViewportUtama, batasGeo, diDalamBatas, namaCrs } from './georef.js';
import { TampilanPeta } from './mapview.js';
import { LayananGps } from './gps.js';
import { PerekamJalur } from './perekam.js';
import { formatKoordinat, formatJarak, formatDurasi, panjangJalur, jarakMeter } from './coords.js';
import { keKML, keGPX, dariKML, dariGPX, buatId } from './exporters.js';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
const { PDFLib, proj4 } = globalThis;

const $ = (s) => document.querySelector(s);
const SETELAN_AWAL = { format: 'dd', akurasiMaks: 30 };
const NAMA_METODE = {
  'afin-proyeksi': 'Afin pada proyeksi peta (tepat)',
  'afin-geografis': 'Afin pada lintang/bujur (tepat)',
  homografi: 'Homografi dari titik kontrol (perkiraan)',
};
const WARNA = { titik: '#1f6f4a', jalur: '#7b1fa2', rekam: '#d32f2f', gps: '#1a73e8' };

const keadaan = {
  peta: [],
  fitur: [],
  petaAktif: null, // { rekaman, dokumen, vp, tf }
  posisi: null,
  galatGps: null,
  ikuti: false,
  modePilih: false,
  setelan: bacaJson('setelan', SETELAN_AWAL),
};

const tampilan = new TampilanPeta($('#kanvas-peta'));
const gps = new LayananGps();
const perekam = new PerekamJalur();
const cacheHalaman = new Map(); // id fitur -> { n, xy: Float64Array } dalam ruang halaman PDF
let fiturRekam = null;
let kunciLayar = null;
let timerRekam = 0;
let timerSimpanRekam = 0;
let timerToast = 0;

// ---------- Utilitas ----------

function bacaJson(kunci, awal) {
  try {
    return { ...awal, ...JSON.parse(localStorage.getItem(kunci) || '{}') };
  } catch {
    return { ...awal };
  }
}

function tulisJson(kunci, nilai) {
  try {
    localStorage.setItem(kunci, JSON.stringify(nilai));
  } catch {
    // penyimpanan lokal tidak tersedia; setelan hanya berlaku selama sesi ini
  }
}

function el(tag, atribut = {}, ...anak) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(atribut)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'class') e.className = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  e.append(...anak.filter((a) => a != null && a !== false));
  return e;
}

function ikon(nama) {
  const ns = 'http://www.w3.org/2000/svg';
  const s = document.createElementNS(ns, 'svg');
  s.setAttribute('class', 'ikon');
  s.setAttribute('aria-hidden', 'true');
  const u = document.createElementNS(ns, 'use');
  u.setAttribute('href', `#i-${nama}`);
  s.append(u);
  return s;
}

const fmtTanggal = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const tanggal = (iso) => fmtTanggal.format(new Date(iso));
const formatUkuran = (b) => (b < 1048576 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1048576).toFixed(1).replace('.', ',')} MB`);
const koordinat = (lat, lon) => formatKoordinat(lat, lon, keadaan.setelan.format, proj4);
const dalamKotak = (b, t) => b && t.lat >= b.selatan && t.lat <= b.utara && t.lon >= b.barat && t.lon <= b.timur;
const stempel = () => new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');

function toast(pesan) {
  const t = $('#toast');
  t.textContent = pesan;
  t.classList.add('tampil');
  clearTimeout(timerToast);
  timerToast = setTimeout(() => t.classList.remove('tampil'), 4000);
}

function memuat(pesan) {
  $('#memuat').hidden = !pesan;
  $('#memuat-teks').textContent = pesan || '';
}

function tampilkanLayar(nama) {
  for (const l of document.querySelectorAll('.layar')) l.classList.toggle('aktif', l.id === `layar-${nama}`);
}

function pilihTab(nama) {
  for (const t of document.querySelectorAll('[data-tab]')) t.setAttribute('aria-selected', String(t.dataset.tab === nama));
  $('#tab-peta').hidden = nama !== 'peta';
  $('#tab-data').hidden = nama !== 'data';
  $('#tombol-impor').hidden = nama !== 'peta';
}

// ---------- Daftar peta dan data ----------

async function muatData() {
  const [peta, fitur] = await Promise.all([db.semua('peta'), db.semua('fitur')]);
  keadaan.peta = peta;
  keadaan.fitur = fitur;
  // Jalur yang masih "sedang direkam" berarti halaman tertutup saat merekam; simpan apa adanya.
  const terputus = fitur.filter((f) => f.sedangDirekam);
  for (const f of terputus) {
    f.sedangDirekam = false;
    await db.simpan('fitur', f);
  }
  if (terputus.length) toast(`${terputus.length} jalur yang rekamannya terputus sudah disimpan.`);
  renderDaftarPeta();
  renderDaftarFitur();
}

function renderDaftarPeta() {
  const ul = $('#daftar-peta');
  $('#kosong-peta').hidden = keadaan.peta.length > 0;
  const pos = keadaan.posisi;
  const urut = [...keadaan.peta].sort((a, b) => b.ditambahkan.localeCompare(a.ditambahkan));
  ul.replaceChildren(...urut.map((p) => el('li', {},
    el('button', { class: 'kartu', onclick: () => bukaPeta(p.id) },
      el('img', { src: p.gambarKecil, alt: '', class: 'gambar-kecil' }),
      el('span', { class: 'teks' },
        el('strong', {}, p.nama),
        el('small', {}, `${formatUkuran(p.ukuran)} · ${tanggal(p.ditambahkan)}`),
        pos && dalamKotak(p.batasGeo, pos) ? el('span', { class: 'lencana' }, 'Anda di area peta ini') : null)))));
}

function ringkasFitur(f) {
  if (f.jenis === 'titik') {
    const t = f.titik[0];
    return `${koordinat(t.lat, t.lon)}${t.akurasi ? ` · ±${Math.round(t.akurasi)} m` : ''}`;
  }
  return `${formatJarak(panjangJalur(f.titik))} · ${f.titik.length} titik`;
}

function renderDaftarFitur() {
  const urut = [...keadaan.fitur].sort((a, b) => b.dibuat.localeCompare(a.dibuat));
  $('#kosong-fitur').hidden = urut.length > 0;
  $('#daftar-fitur').replaceChildren(...urut.map((f) => el('li', {},
    el('button', { class: 'kartu', onclick: () => bukaDialogFitur(f) },
      el('span', { class: `ikon-fitur ${f.jenis}` }, ikon(f.jenis)),
      el('span', { class: 'teks' },
        el('strong', {}, f.nama),
        el('small', {}, ringkasFitur(f)),
        el('small', {}, f.sedangDirekam ? 'Sedang direkam…' : tanggal(f.dibuat)))))));
}

// ---------- Impor peta ----------

async function buatGambarKecil(bytes, indeksHalaman) {
  const dok = await pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
  try {
    const hal = await dok.getPage(indeksHalaman + 1);
    const vp1 = hal.getViewport({ scale: 1 });
    const vp = hal.getViewport({ scale: 240 / Math.max(vp1.width, vp1.height) });
    const c = el('canvas', { width: Math.ceil(vp.width), height: Math.ceil(vp.height) });
    await hal.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    return c.toDataURL('image/jpeg', 0.75);
  } finally {
    await dok.destroy();
  }
}

async function imporPeta(berkas) {
  memuat('Membaca georeferensi peta…');
  try {
    const bytes = new Uint8Array(await berkas.arrayBuffer());
    const info = await bacaGeoreferensi(bytes.slice(), { PDFLib, proj4 });
    if (!info) {
      toast('Berkas ini tidak memiliki georeferensi, jadi bukan GeoPDF.');
      return;
    }
    const vp = pilihViewportUtama(info);
    const tf = buatTransformasi(vp, proj4);
    memuat('Menyiapkan gambar kecil…');
    const rekaman = {
      id: buatId(),
      nama: berkas.name.replace(/\.pdf$/i, ''),
      namaFile: berkas.name,
      ukuran: berkas.size,
      ditambahkan: new Date().toISOString(),
      berkas: new Blob([bytes], { type: 'application/pdf' }),
      georef: info,
      batasGeo: batasGeo(vp, tf),
      crs: namaCrs(vp.crs),
      gambarKecil: await buatGambarKecil(bytes, info.halaman),
    };
    await db.simpan('peta', rekaman);
    keadaan.peta.push(rekaman);
    renderDaftarPeta();
    // Minta peramban tidak menghapus data saat ruang penyimpanan menipis
    navigator.storage?.persist?.().catch(() => {});
    toast(`Peta "${rekaman.nama}" ditambahkan.`);
  } catch (e) {
    console.error(e);
    toast(`Gagal membaca peta: ${e.message}`);
  } finally {
    memuat(null);
  }
}

// ---------- Penampil peta ----------

async function bukaPeta(id, { pusat = null } = {}) {
  const rekaman = keadaan.peta.find((p) => p.id === id);
  if (!rekaman) return;
  memuat('Membuka peta…');
  try {
    if (keadaan.petaAktif) await tutupPeta();
    const data = new Uint8Array(await rekaman.berkas.arrayBuffer());
    const dokumen = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
    const vp = pilihViewportUtama(rekaman.georef);
    const tf = buatTransformasi(vp, proj4);
    keadaan.petaAktif = { rekaman, dokumen, vp, tf };
    keadaan.ikuti = false;
    cacheHalaman.clear();
    $('#judul-peta').textContent = rekaman.nama;
    tampilkanLayar('peta');
    if (!history.state?.peta) history.pushState({ peta: id }, '');
    perbaruiTombolLokasi();
    perbaruiTombolRekam();
    perbaruiPanelLokasi();
    await tampilan.muat(dokumen, rekaman.georef.halaman + 1);
    if (pusat) {
      const [x, y] = tf.keHalaman(pusat.lat, pusat.lon);
      tampilan.pusatkan(x, y, tampilan.zoomPas * 4);
    }
    gps.langganan('peta', posisiBaru, galatGps);
  } catch (e) {
    console.error(e);
    toast(`Gagal membuka peta: ${e.message}`);
    await tutupPeta();
  } finally {
    memuat(null);
  }
}

async function tutupPeta() {
  const pa = keadaan.petaAktif;
  keluarModePilih();
  gps.berhenti('peta');
  keadaan.petaAktif = null;
  tampilan.kosongkan();
  tampilkanLayar('daftar');
  renderDaftarPeta();
  if (pa) await pa.dokumen.destroy();
}

function kembaliKeDaftar() {
  if (history.state?.peta) history.back();
  else tutupPeta();
}

window.addEventListener('popstate', () => {
  if (keadaan.petaAktif && !history.state?.peta) tutupPeta();
});

function koordHalaman(f) {
  const tf = keadaan.petaAktif.tf;
  let c = cacheHalaman.get(f.id);
  if (!c || c.n > f.titik.length) c = { n: 0, xy: new Float64Array(0) };
  if (c.n < f.titik.length) {
    const xy = new Float64Array(f.titik.length * 2);
    xy.set(c.xy);
    for (let i = c.n; i < f.titik.length; i++) {
      const [x, y] = tf.keHalaman(f.titik[i].lat, f.titik[i].lon);
      xy[2 * i] = x;
      xy[2 * i + 1] = y;
    }
    c = { n: f.titik.length, xy };
    cacheHalaman.set(f.id, c);
  }
  return c.xy;
}

function gambarPin(ctx, x, y, warna) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.bezierCurveTo(x - 3, y - 7, x - 9, y - 11, x - 9, y - 19);
  ctx.arc(x, y - 19, 9, Math.PI, 0);
  ctx.bezierCurveTo(x + 9, y - 11, x + 3, y - 7, x, y);
  ctx.closePath();
  ctx.fillStyle = warna;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#fff';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y - 19, 3.5, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();
}

function gambarLapisan(ctx) {
  const pa = keadaan.petaAktif;
  if (!pa) return;
  const [a, b, c, d, e, f] = tampilan.matriksLayar();
  const lay = (x, y) => [a * x + c * y + e, b * x + d * y + f];

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const fi of keadaan.fitur) {
    if (fi.jenis !== 'jalur' || fi.titik.length < 2) continue;
    const xy = koordHalaman(fi);
    ctx.beginPath();
    for (let i = 0; i < xy.length; i += 2) {
      const [sx, sy] = lay(xy[i], xy[i + 1]);
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.strokeStyle = fi.sedangDirekam ? WARNA.rekam : WARNA.jalur;
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  ctx.font = '600 13px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  for (const fi of keadaan.fitur) {
    if (fi.jenis !== 'titik') continue;
    const xy = koordHalaman(fi);
    const [sx, sy] = lay(xy[0], xy[1]);
    if (sx < -40 || sy < -40 || sx > tampilan.lebar + 200 || sy > tampilan.tinggi + 40) continue;
    gambarPin(ctx, sx, sy, WARNA.titik);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.strokeText(fi.nama, sx + 12, sy - 19);
    ctx.fillStyle = '#1b1b1b';
    ctx.fillText(fi.nama, sx + 12, sy - 19);
  }

  const p = keadaan.posisi;
  if (p) {
    const [x, y] = pa.tf.keHalaman(p.lat, p.lon);
    const [sx, sy] = lay(x, y);
    // Arah utara di layar dan jari-jari akurasi
    const [xu, yu] = pa.tf.keHalaman(p.lat + p.akurasi / 111320, p.lon);
    const [ux, uy] = lay(xu, yu);
    const r = Math.hypot(ux - sx, uy - sy);
    ctx.beginPath();
    ctx.arc(sx, sy, Math.max(r, 9), 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(26,115,232,0.14)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(26,115,232,0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();
    if (p.arah != null && p.kecepatan > 0.5 && r > 0) {
      const nx = (ux - sx) / r, ny = (uy - sy) / r;
      const t = (p.arah * Math.PI) / 180;
      const hx = nx * Math.cos(t) - ny * Math.sin(t), hy = nx * Math.sin(t) + ny * Math.cos(t);
      ctx.beginPath();
      ctx.moveTo(sx + hx * 22, sy + hy * 22);
      ctx.lineTo(sx - hy * 8, sy + hx * 8);
      ctx.lineTo(sx + hy * 8, sy - hx * 8);
      ctx.closePath();
      ctx.fillStyle = WARNA.gps;
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(sx, sy, 8, 0, Math.PI * 2);
    ctx.fillStyle = WARNA.gps;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
  }
}

function jarakKeRuas(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const t = dx || dy ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy))) : 0;
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function fiturDiLayar(sx, sy) {
  const [a, b, c, d, e, f] = tampilan.matriksLayar();
  const lay = (x, y) => [a * x + c * y + e, b * x + d * y + f];
  let terbaik = null, jarakTerbaik = 24;
  for (const fi of keadaan.fitur) {
    if (fi.jenis !== 'titik') continue;
    const xy = koordHalaman(fi);
    const [px, py] = lay(xy[0], xy[1]);
    const jarak = Math.hypot(px - sx, py - 16 - sy);
    if (jarak < jarakTerbaik) [terbaik, jarakTerbaik] = [fi, jarak];
  }
  if (terbaik) return terbaik;
  jarakTerbaik = 14;
  for (const fi of keadaan.fitur) {
    if (fi.jenis !== 'jalur') continue;
    const xy = koordHalaman(fi);
    let [x0, y0] = lay(xy[0], xy[1]);
    for (let i = 2; i < xy.length; i += 2) {
      const [x1, y1] = lay(xy[i], xy[i + 1]);
      const jarak = jarakKeRuas(sx, sy, x0, y0, x1, y1);
      if (jarak < jarakTerbaik) [terbaik, jarakTerbaik] = [fi, jarak];
      [x0, y0] = [x1, y1];
    }
  }
  return terbaik;
}

tampilan.gambarLapisan = gambarLapisan;
tampilan.saatKetuk = (sx, sy) => {
  if (keadaan.modePilih || !keadaan.petaAktif) return;
  const f = fiturDiLayar(sx, sy);
  if (f) bukaDialogFitur(f);
};
tampilan.saatGeserManual = () => {
  if (keadaan.ikuti) {
    keadaan.ikuti = false;
    perbaruiTombolLokasi();
  }
};
tampilan.saatUbah = () => perbaruiKoordinatTengah();

// ---------- GPS ----------

function posisiBaru(pos) {
  keadaan.posisi = pos;
  keadaan.galatGps = null;
  if (!keadaan.petaAktif) return;
  if (keadaan.ikuti) {
    const [x, y] = keadaan.petaAktif.tf.keHalaman(pos.lat, pos.lon);
    tampilan.pusatkan(x, y);
  }
  tampilan.gambar();
  perbaruiPanelLokasi();
  if (keadaan.modePilih) $('#pilih-gps').disabled = false;
}

function galatGps(pesan) {
  keadaan.galatGps = pesan;
  perbaruiPanelLokasi();
}

function perbaruiPanelLokasi() {
  const panel = $('#panel-lokasi');
  const p = keadaan.posisi;
  const pa = keadaan.petaAktif;
  panel.classList.toggle('galat', !p && !!keadaan.galatGps);
  if (!p) {
    panel.replaceChildren(el('div', { class: 'keterangan' }, keadaan.galatGps || 'Menunggu sinyal GPS…'));
    return;
  }
  const ket = [`±${Math.round(p.akurasi)} m`];
  if (Number.isFinite(p.alt)) ket.push(`tinggi ${Math.round(p.alt)} m`);
  if (pa && !diDalamBatas(pa.vp, pa.tf, p.lat, p.lon)) ket.push('di luar area peta');
  panel.replaceChildren(
    el('div', { class: 'koordinat' }, koordinat(p.lat, p.lon)),
    el('div', { class: 'keterangan' }, ket.join(' · ')),
  );
}

function perbaruiTombolLokasi() {
  $('#tombol-lokasi').classList.toggle('aktif', keadaan.ikuti);
}

function keLokasiSaya() {
  const pa = keadaan.petaAktif, p = keadaan.posisi;
  if (!pa) return;
  if (!p) {
    toast(keadaan.galatGps || 'Menunggu sinyal GPS…');
    return;
  }
  if (!diDalamBatas(pa.vp, pa.tf, p.lat, p.lon)) {
    const b = pa.rekaman.batasGeo;
    const jarak = jarakMeter(p, { lat: (b.utara + b.selatan) / 2, lon: (b.barat + b.timur) / 2 });
    toast(`Posisi Anda di luar area peta ini (±${formatJarak(jarak)} dari tengah peta).`);
    return;
  }
  keadaan.ikuti = true;
  perbaruiTombolLokasi();
  const [x, y] = pa.tf.keHalaman(p.lat, p.lon);
  tampilan.pusatkan(x, y, Math.max(tampilan.zoom, tampilan.zoomPas * 2));
}

// ---------- Menandai titik ----------

function masukModePilih() {
  keadaan.modePilih = true;
  $('#silang').hidden = false;
  $('#bilah-pilih').hidden = false;
  $('#bilah-bawah').hidden = true;
  $('#pilih-gps').disabled = !keadaan.posisi;
  perbaruiKoordinatTengah();
}

function keluarModePilih() {
  keadaan.modePilih = false;
  $('#silang').hidden = true;
  $('#bilah-pilih').hidden = true;
  $('#bilah-bawah').hidden = false;
}

function titikTengah() {
  const [x, y] = tampilan.dariLayar(tampilan.lebar / 2, tampilan.tinggi / 2);
  return keadaan.petaAktif.tf.keGeografis(x, y);
}

function perbaruiKoordinatTengah() {
  if (!keadaan.modePilih || !keadaan.petaAktif || !tampilan.vp1) return;
  const t = titikTengah();
  $('#pilih-koordinat').textContent = koordinat(t.lat, t.lon);
}

function buatTitik(t) {
  keluarModePilih();
  const nomor = keadaan.fitur.filter((f) => f.jenis === 'titik').length + 1;
  const fitur = { id: buatId(), jenis: 'titik', nama: `Titik ${nomor}`, catatan: '', dibuat: new Date().toISOString(), titik: [t] };
  bukaDialogFitur(fitur, { baru: true });
}

function bukaDialogFitur(fitur, { baru = false } = {}) {
  const d = $('#dialog-fitur');
  const jenis = fitur.jenis === 'titik' ? 'titik' : 'jalur';
  $('#fitur-judul').textContent = baru ? (jenis === 'titik' ? 'Titik baru' : 'Simpan jalur') : jenis === 'titik' ? 'Titik' : 'Jalur';
  $('#fitur-nama').value = fitur.nama;
  $('#fitur-catatan').value = fitur.catatan || '';
  $('#fitur-info').textContent = `${ringkasFitur(fitur)} · ${tanggal(fitur.dibuat)}`;
  $('#fitur-hapus').hidden = baru || fitur.sedangDirekam;
  $('#fitur-lihat').hidden = baru || !!keadaan.petaAktif;
  d.returnValue = '';
  d.onclose = async () => {
    const aksi = d.returnValue;
    if (aksi === 'simpan') {
      fitur.nama = $('#fitur-nama').value.trim() || fitur.nama;
      fitur.catatan = $('#fitur-catatan').value.trim();
      await db.simpan('fitur', fitur);
      if (!keadaan.fitur.includes(fitur)) keadaan.fitur.push(fitur);
      toast(baru ? `"${fitur.nama}" disimpan.` : 'Perubahan disimpan.');
    } else if (aksi === 'hapus') {
      if (!confirm(`Hapus "${fitur.nama}"? Tindakan ini tidak bisa dibatalkan.`)) return;
      await db.hapus('fitur', fitur.id);
      keadaan.fitur = keadaan.fitur.filter((f) => f !== fitur);
      cacheHalaman.delete(fitur.id);
    } else if (aksi === 'lihat') {
      lihatDiPeta(fitur);
    }
    renderDaftarFitur();
    tampilan.gambar();
  };
  d.showModal();
}

async function lihatDiPeta(f) {
  const t = f.titik[0];
  const cocok = keadaan.peta.filter((p) => dalamKotak(p.batasGeo, t));
  if (!cocok.length) {
    toast('Belum ada peta yang mencakup lokasi ini.');
    return;
  }
  await bukaPeta(cocok[0].id, { pusat: t });
}

// ---------- Merekam jalur ----------

async function kunciLayarAktif() {
  try {
    kunciLayar = await navigator.wakeLock?.request('screen');
  } catch {
    kunciLayar = null;
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && fiturRekam) kunciLayarAktif();
});

function simpanRekamNanti() {
  if (timerSimpanRekam) return;
  timerSimpanRekam = setTimeout(async () => {
    timerSimpanRekam = 0;
    if (fiturRekam) await db.simpan('fitur', fiturRekam);
  }, 5000);
}

async function mulaiRekam() {
  if (!('geolocation' in navigator)) {
    toast('GPS tidak tersedia di perangkat ini.');
    return;
  }
  perekam.akurasiMaks = Number(keadaan.setelan.akurasiMaks);
  perekam.mulai();
  const sekarang = new Date();
  fiturRekam = {
    id: buatId(),
    jenis: 'jalur',
    nama: `Jalur ${sekarang.toLocaleDateString('id-ID')} ${sekarang.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`,
    catatan: '',
    dibuat: sekarang.toISOString(),
    titik: perekam.titik,
    sedangDirekam: true,
  };
  keadaan.fitur.push(fiturRekam);
  await db.simpan('fitur', fiturRekam);
  gps.langganan('rekam', (pos) => {
    if (perekam.tambah(pos)) {
      simpanRekamNanti();
      tampilan.gambar();
    }
  });
  await kunciLayarAktif();
  timerRekam = setInterval(perbaruiTombolRekam, 1000);
  perbaruiTombolRekam();
  renderDaftarFitur();
  toast('Merekam jalur. Biarkan layar tetap menyala.');
}

async function hentikanRekam() {
  if (!fiturRekam) return;
  gps.berhenti('rekam');
  clearInterval(timerRekam);
  clearTimeout(timerSimpanRekam);
  timerSimpanRekam = 0;
  perekam.berhenti();
  kunciLayar?.release().catch(() => {});
  kunciLayar = null;
  const f = fiturRekam;
  fiturRekam = null;
  f.sedangDirekam = false;
  if (f.titik.length < 2) {
    await db.hapus('fitur', f.id);
    keadaan.fitur = keadaan.fitur.filter((x) => x !== f);
    toast('Jalur terlalu pendek, tidak disimpan.');
  } else {
    await db.simpan('fitur', f);
    bukaDialogFitur(f, { baru: true });
  }
  perbaruiTombolRekam();
  renderDaftarFitur();
  tampilan.gambar();
}

function perbaruiTombolRekam() {
  const aktif = !!fiturRekam;
  const t = $('#tombol-rekam');
  t.classList.toggle('merekam', aktif);
  t.replaceChildren(ikon(aktif ? 'henti' : 'rekam'),
    el('span', {}, aktif ? `${formatDurasi(perekam.durasi)} · ${formatJarak(perekam.panjang)}` : 'Rekam jalur'));
  t.setAttribute('aria-label', aktif ? 'Hentikan rekaman jalur' : 'Mulai rekam jalur');
  const ind = $('#indikator-rekam');
  ind.hidden = !aktif;
  if (aktif) ind.querySelector('span').textContent = `Rekam ${formatJarak(perekam.panjang)}`;
}

// ---------- Info peta dan setelan ----------

function bukaInfoPeta() {
  const pa = keadaan.petaAktif;
  if (!pa) return;
  const r = pa.rekaman, b = r.batasGeo, tf = pa.tf;
  const baris = [
    ['Berkas', r.namaFile],
    ['Ukuran', formatUkuran(r.ukuran)],
    ['Sistem koordinat', r.crs],
    ['Format georeferensi', r.georef.format === 'iso32000' ? 'ISO 32000 (GeoPDF)' : 'OGC LGIDict'],
    ['Transformasi', NAMA_METODE[tf.metode]],
    ...(tf.sisaMeter != null ? [['Selisih di titik kontrol', `${tf.sisaMeter < 0.01 ? '< 0,01' : tf.sisaMeter.toFixed(2).replace('.', ',')} m`]] : []),
    ['Batas lintang', `${b.selatan.toFixed(5)} s/d ${b.utara.toFixed(5)}`],
    ['Batas bujur', `${b.barat.toFixed(5)} s/d ${b.timur.toFixed(5)}`],
  ];
  $('#info-isi').replaceChildren(...baris.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)]));
  const d = $('#dialog-info');
  d.returnValue = '';
  d.onclose = async () => {
    if (d.returnValue !== 'hapus') return;
    if (!confirm(`Hapus peta "${r.nama}" dari HP ini? Titik dan jalur Anda tidak ikut terhapus.`)) return;
    await db.hapus('peta', r.id);
    keadaan.peta = keadaan.peta.filter((p) => p.id !== r.id);
    kembaliKeDaftar();
    toast('Peta dihapus.');
  };
  d.showModal();
}

async function bukaSetelan() {
  const d = $('#dialog-setelan');
  for (const r of d.querySelectorAll('input[name="format"]')) r.checked = r.value === keadaan.setelan.format;
  $('#setelan-akurasi').value = String(keadaan.setelan.akurasiMaks);
  const est = await navigator.storage?.estimate?.().catch(() => null);
  $('#info-penyimpanan').textContent = est ? `Terpakai ${formatUkuran(est.usage || 0)} dari kuota ${formatUkuran(est.quota || 0)}.` : '';
  d.onclose = () => {
    const format = d.querySelector('input[name="format"]:checked')?.value || 'dd';
    keadaan.setelan = { format, akurasiMaks: Number($('#setelan-akurasi').value) };
    tulisJson('setelan', keadaan.setelan);
    renderDaftarFitur();
    perbaruiPanelLokasi();
  };
  d.showModal();
}

// ---------- Ekspor dan impor data ----------

function unduh(nama, isi, tipe) {
  const url = URL.createObjectURL(new Blob([isi], { type: tipe }));
  const a = el('a', { href: url, download: nama });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function ekspor(format) {
  if (!keadaan.fitur.length) {
    toast('Belum ada data untuk diekspor.');
    return;
  }
  if (format === 'kml') unduh(`peta-lapangan-${stempel()}.kml`, keKML(keadaan.fitur), 'application/vnd.google-earth.kml+xml');
  else unduh(`peta-lapangan-${stempel()}.gpx`, keGPX(keadaan.fitur), 'application/gpx+xml');
}

async function imporData(berkas) {
  try {
    const isi = await berkas.text();
    const gpx = berkas.name.toLowerCase().endsWith('.gpx') || /<gpx[\s>]/.test(isi);
    const fitur = gpx ? dariGPX(isi, DOMParser) : dariKML(isi, DOMParser);
    if (!fitur.length) {
      toast('Tidak ada titik atau jalur di berkas ini.');
      return;
    }
    for (const f of fitur) await db.simpan('fitur', f);
    keadaan.fitur.push(...fitur);
    renderDaftarFitur();
    toast(`${fitur.length} titik/jalur diimpor.`);
  } catch (e) {
    toast(`Gagal mengimpor: ${e.message}`);
  }
}

// ---------- Sambungan tombol ----------

for (const t of document.querySelectorAll('[data-tab]')) t.addEventListener('click', () => pilihTab(t.dataset.tab));
$('#tombol-setelan').addEventListener('click', bukaSetelan);
$('#indikator-rekam').addEventListener('click', () => {
  if (confirm('Hentikan rekaman jalur?')) hentikanRekam();
});
$('#masukan-peta').addEventListener('change', (e) => {
  const berkas = e.target.files[0];
  e.target.value = '';
  if (berkas) imporPeta(berkas);
});
$('#masukan-data').addEventListener('change', (e) => {
  const berkas = e.target.files[0];
  e.target.value = '';
  if (berkas) imporData(berkas);
});
$('#tombol-contoh').addEventListener('click', async () => {
  memuat('Mengambil peta contoh…');
  try {
    const r = await fetch('contoh/contoh-peta.pdf');
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    await imporPeta(new File([await r.blob()], 'Peta contoh (fiktif).pdf', { type: 'application/pdf' }));
  } catch (e) {
    memuat(null);
    toast(`Gagal mengambil peta contoh: ${e.message}`);
  }
});
$('#tombol-ekspor-kml').addEventListener('click', () => ekspor('kml'));
$('#tombol-ekspor-gpx').addEventListener('click', () => ekspor('gpx'));

$('#tombol-kembali').addEventListener('click', kembaliKeDaftar);
$('#tombol-info-peta').addEventListener('click', bukaInfoPeta);
$('#tombol-perbesar').addEventListener('click', () => tampilan.zoomDi(tampilan.lebar / 2, tampilan.tinggi / 2, 1.6));
$('#tombol-perkecil').addEventListener('click', () => tampilan.zoomDi(tampilan.lebar / 2, tampilan.tinggi / 2, 1 / 1.6));
$('#tombol-lokasi').addEventListener('click', keLokasiSaya);
$('#tombol-tandai').addEventListener('click', masukModePilih);
$('#tombol-rekam').addEventListener('click', () => (fiturRekam ? hentikanRekam() : mulaiRekam()));
$('#pilih-batal').addEventListener('click', keluarModePilih);
$('#pilih-gps').addEventListener('click', () => {
  const p = keadaan.posisi;
  if (!p) return;
  const t = { lat: p.lat, lon: p.lon, akurasi: Math.round(p.akurasi) };
  if (Number.isFinite(p.alt)) t.alt = Math.round(p.alt * 10) / 10;
  buatTitik(t);
});
$('#pilih-tengah').addEventListener('click', () => buatTitik(titikTengah()));

// ---------- Mulai ----------

pilihTab('peta');
perbaruiTombolRekam();
muatData().catch((e) => {
  console.error(e);
  toast(`Penyimpanan tidak bisa dibuka: ${e.message}`);
});
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service worker gagal didaftarkan', e));
}
