// Ekspor dan impor titik/jalur dalam format KML dan GPX.
// Bentuk fitur: { id, jenis: 'titik'|'jalur', nama, catatan, dibuat, titik: [{ lat, lon, alt?, waktu? }] }
// DOMParser disuntikkan supaya bisa diuji di Node.

const xml = (s) => String(s ?? '').replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]);
const ada = (v) => v !== null && v !== undefined && Number.isFinite(Number(v));

export function buatId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function keKML(fitur, judul = 'Peta Lapangan') {
  const koord = (t) => `${t.lon},${t.lat}${ada(t.alt) ? `,${t.alt}` : ''}`;
  const placemark = (f) => {
    const geometri = f.jenis === 'titik'
      ? `<Point><coordinates>${koord(f.titik[0])}</coordinates></Point>`
      : `<LineString><tessellate>1</tessellate><coordinates>${f.titik.map(koord).join(' ')}</coordinates></LineString>`;
    return [
      '<Placemark>',
      `<name>${xml(f.nama)}</name>`,
      f.catatan ? `<description>${xml(f.catatan)}</description>` : '',
      f.dibuat ? `<TimeStamp><when>${xml(f.dibuat)}</when></TimeStamp>` : '',
      `<styleUrl>#${f.jenis}</styleUrl>`,
      geometri,
      '</Placemark>',
    ].join('');
  };
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<kml xmlns="http://www.opengis.net/kml/2.2"><Document>',
    `<name>${xml(judul)}</name>`,
    '<Style id="titik"><IconStyle><color>ff2f6f1f</color></IconStyle></Style>',
    '<Style id="jalur"><LineStyle><color>ffa21f7b</color><width>3</width></LineStyle></Style>',
    ...fitur.map(placemark),
    '</Document></kml>',
  ].join('\n');
}

export function keGPX(fitur) {
  const isiTitik = (t) => `${ada(t.alt) ? `<ele>${t.alt}</ele>` : ''}${t.waktu ? `<time>${xml(t.waktu)}</time>` : ''}`;
  const keterangan = (f) => `<name>${xml(f.nama)}</name>${f.catatan ? `<desc>${xml(f.catatan)}</desc>` : ''}`;
  const wpt = fitur.filter((f) => f.jenis === 'titik').map((f) => {
    const t = f.titik[0];
    const waktu = t.waktu || f.dibuat;
    return `<wpt lat="${t.lat}" lon="${t.lon}">${ada(t.alt) ? `<ele>${t.alt}</ele>` : ''}${waktu ? `<time>${xml(waktu)}</time>` : ''}${keterangan(f)}</wpt>`;
  });
  const trk = fitur.filter((f) => f.jenis === 'jalur').map((f) =>
    `<trk>${keterangan(f)}<trkseg>${f.titik.map((t) => `<trkpt lat="${t.lat}" lon="${t.lon}">${isiTitik(t)}</trkpt>`).join('')}</trkseg></trk>`);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="Peta Lapangan" xmlns="http://www.topografix.com/GPX/1/1">',
    ...wpt,
    ...trk,
    '</gpx>',
  ].join('\n');
}

// ---- Impor ----

function namaLokal(n) {
  return n.localName || String(n.nodeName).split(':').pop();
}

function turunan(el, nama) {
  const hasil = [];
  const jalan = (n) => {
    for (let c = n.firstChild; c; c = c.nextSibling) {
      if (c.nodeType !== 1) continue;
      if (namaLokal(c) === nama) hasil.push(c);
      jalan(c);
    }
  };
  jalan(el);
  return hasil;
}

function anak(el, nama) {
  for (let c = el.firstChild; c; c = c.nextSibling) if (c.nodeType === 1 && namaLokal(c) === nama) return c;
  return null;
}

const teks = (el) => (el ? el.textContent.trim() : '');

function urai(isi, DOMParser) {
  const doc = new DOMParser().parseFromString(isi, 'application/xml');
  if (turunan(doc, 'parsererror').length) throw new Error('Berkas XML rusak');
  return doc;
}

function koordinatKml(s) {
  return s.trim().split(/\s+/).map((tuple) => {
    const [lon, lat, alt] = tuple.split(',').map(Number);
    return Number.isFinite(alt) ? { lat, lon, alt } : { lat, lon };
  }).filter((t) => Number.isFinite(t.lat) && Number.isFinite(t.lon));
}

function fiturBaru(jenis, nama, catatan, titik, dibuat) {
  return { id: buatId(), jenis, nama, catatan, dibuat: dibuat || new Date().toISOString(), titik };
}

export function dariKML(isi, DOMParser) {
  const hasil = [];
  for (const pm of turunan(urai(isi, DOMParser), 'Placemark')) {
    const nama = teks(anak(pm, 'name'));
    const catatan = teks(anak(pm, 'description'));
    const waktu = teks(turunan(pm, 'when')[0]) || undefined;
    for (const p of turunan(pm, 'Point')) {
      const t = koordinatKml(teks(anak(p, 'coordinates')));
      if (t.length) hasil.push(fiturBaru('titik', nama || 'Titik', catatan, [t[0]], waktu));
    }
    for (const g of [...turunan(pm, 'LineString'), ...turunan(pm, 'LinearRing')]) {
      const t = koordinatKml(teks(anak(g, 'coordinates')));
      if (t.length >= 2) hasil.push(fiturBaru('jalur', nama || 'Jalur', catatan, t, waktu));
    }
  }
  return hasil;
}

function titikGpx(el) {
  const t = { lat: Number(el.getAttribute('lat')), lon: Number(el.getAttribute('lon')) };
  const ele = Number(teks(anak(el, 'ele')));
  if (anak(el, 'ele') && Number.isFinite(ele)) t.alt = ele;
  const waktu = teks(anak(el, 'time'));
  if (waktu) t.waktu = waktu;
  return t;
}

export function dariGPX(isi, DOMParser) {
  const doc = urai(isi, DOMParser);
  const hasil = [];
  const sah = (t) => Number.isFinite(t.lat) && Number.isFinite(t.lon);
  for (const w of turunan(doc, 'wpt')) {
    const t = titikGpx(w);
    if (sah(t)) hasil.push(fiturBaru('titik', teks(anak(w, 'name')) || 'Titik', teks(anak(w, 'desc')), [t], t.waktu));
  }
  for (const [wadah, butir] of [['trk', 'trkpt'], ['rte', 'rtept']]) {
    for (const j of turunan(doc, wadah)) {
      const titik = turunan(j, butir).map(titikGpx).filter(sah);
      if (titik.length >= 2) hasil.push(fiturBaru('jalur', teks(anak(j, 'name')) || 'Jalur', teks(anak(j, 'desc')), titik, titik[0].waktu));
    }
  }
  return hasil;
}
