// Georeferensi GeoPDF: membaca titik kontrol dari PDF lalu membuat transformasi
// lintang/bujur <-> koordinat halaman (ruang pengguna PDF, satuan point).

import * as PDFLibDefault from 'pdf-lib';
import proj4Default from 'proj4';
import { definisiEpsg } from './epsg';
import { BatasGeo, CrsInfo, GeoRefInfo, Transformasi, ViewportInfo } from '../types';

const BATAS_SISA_AFIN_M = 5;
const M_PER_DERAJAT = 111320;

export async function bacaGeoreferensi(
  bytes: Uint8Array,
  injected: { PDFLib?: any; proj4?: any } = {}
): Promise<GeoRefInfo | null> {
  const PDFLib = injected.PDFLib || PDFLibDefault;
  const p4 = injected.proj4 || proj4Default;
  const proj4 = p4.default || p4;

  const doc = await PDFLib.PDFDocument.load(bytes, {
    ignoreEncryption: true,
    updateMetadata: false,
    throwOnInvalidObject: false,
  });
  const keJs = pembuatKeJs(PDFLib, doc.context);
  const halaman = doc.getPages();
  for (let i = 0; i < halaman.length; i++) {
    const node = halaman[i].node;
    const vp = keJs(node.get(PDFLib.PDFName.of('VP')), 6);
    const viewports = (Array.isArray(vp) ? vp : []).map(bacaViewportIso).filter(Boolean) as ViewportInfo[];
    if (viewports.length) return { format: 'iso32000', halaman: i, viewports };

    const lgi = keJs(node.get(PDFLib.PDFName.of('LGIDict')), 5);
    const kotak = halaman[i].getMediaBox();
    const dariLgi = (Array.isArray(lgi) ? lgi : lgi ? [lgi] : [])
      .map((d: any) => bacaLgi(d, kotak, proj4))
      .filter(Boolean) as ViewportInfo[];
    if (dariLgi.length) return { format: 'ogc-lgi', halaman: i, viewports: dariLgi };
  }
  return null;
}

function pembuatKeJs(PDFLib: any, context: any) {
  const { PDFRef, PDFNumber, PDFString, PDFHexString, PDFName, PDFArray, PDFDict, PDFBool } = PDFLib;
  const keJs = (obj: any, kedalaman: number): any => {
    if (obj instanceof PDFRef) obj = context.lookup(obj);
    if (obj == null) return null;
    if (obj instanceof PDFNumber) return obj.asNumber();
    if (obj instanceof PDFString || obj instanceof PDFHexString) return obj.decodeText();
    if (obj instanceof PDFName) return obj.decodeText();
    if (obj instanceof PDFBool) return obj.asBoolean();
    if (kedalaman <= 0) return null;
    if (obj instanceof PDFArray) return obj.asArray().map((o: any) => keJs(o, kedalaman - 1));
    if (obj instanceof PDFDict) {
      const hasil: Record<string, any> = {};
      for (const [kunci, nilai] of obj.entries()) {
        const k = kunci.decodeText();
        if (k === 'Parent' || k === 'P') continue;
        hasil[k] = keJs(nilai, kedalaman - 1);
      }
      return hasil;
    }
    return null;
  };
  return keJs;
}

const angka = (v: any) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
const deretAngka = (v: any) => (Array.isArray(v) ? v.map(angka) : null);
const berpasangan = (a: number[]): [number, number][] => {
  const hasil: [number, number][] = [];
  for (let i = 0; i + 1 < a.length; i += 2) hasil.push([a[i], a[i + 1]]);
  return hasil;
};

function bacaViewportIso(vp: any): ViewportInfo | null {
  const m = vp && vp.Measure;
  if (!m || m.Subtype !== 'GEO') return null;
  const bbox = deretAngka(vp.BBox);
  const gpts = deretAngka(m.GPTS);
  if (!bbox || bbox.length !== 4 || !gpts || gpts.length < 6 || gpts.some(Number.isNaN)) return null;
  const persegi = [0, 0, 0, 1, 1, 1, 1, 0];
  const bounds = deretAngka(m.Bounds) || persegi;
  const lpts = deretAngka(m.LPTS) || bounds;

  const x1 = Math.min(bbox[0], bbox[2]), x2 = Math.max(bbox[0], bbox[2]);
  const y1 = Math.min(bbox[1], bbox[3]), y2 = Math.max(bbox[1], bbox[3]);
  const keHalaman = ([u, v]: [number, number]): [number, number] => [x1 + u * (x2 - x1), y1 + v * (y2 - y1)];

  const geo = berpasangan(gpts);
  const lokal = berpasangan(lpts);
  const kontrol = [];
  for (let i = 0; i < Math.min(geo.length, lokal.length); i++) {
    const [x, y] = keHalaman(lokal[i]);
    kontrol.push({ x, y, lat: geo[i][0], lon: geo[i][1] });
  }
  if (kontrol.length < 3) return null;

  const gcs = m.GCS || {};
  return {
    nama: typeof vp.Name === 'string' ? vp.Name : '',
    bbox: [x1, y1, x2, y2],
    kontrol,
    batas: berpasangan(bounds).map(keHalaman),
    crs: {
      jenis: typeof gcs.Type === 'string' ? gcs.Type : null,
      epsg: Number.isFinite(angka(gcs.EPSG)) ? angka(gcs.EPSG) : null,
      wkt: typeof gcs.WKT === 'string' && gcs.WKT.trim() ? gcs.WKT.trim() : null,
    },
  };
}

function bacaLgi(lgi: any, kotak: any, proj4: any): ViewportInfo | null {
  if (!lgi || typeof lgi !== 'object') return null;
  const proyeksi = lgi.Projection || {};
  const jenis = String(proyeksi.ProjectionType || '').toUpperCase();
  let def: string | null = null;
  if (jenis === 'UT') {
    const zona = angka(proyeksi.Zone);
    if (!Number.isFinite(zona)) return null;
    const selatan = String(proyeksi.Hemisphere || 'N').toUpperCase().startsWith('S');
    def = `+proj=utm +zone=${zona}${selatan ? ' +south' : ''} +datum=WGS84 +units=m +no_defs`;
  } else if (jenis === 'GEO' || jenis === 'GEOGRAPHIC' || jenis === 'LL') {
    def = '+proj=longlat +datum=WGS84 +no_defs';
  } else {
    return null;
  }

  const neatline = deretAngka(lgi.Neatline);
  const sudut: [number, number][] = neatline && neatline.length >= 6
    ? berpasangan(neatline)
    : [[kotak.x, kotak.y], [kotak.x, kotak.y + kotak.height], [kotak.x + kotak.width, kotak.y + kotak.height], [kotak.x + kotak.width, kotak.y]];

  let pasangan: { x: number; y: number; X: number; Y: number }[] = [];
  const ctm = deretAngka(lgi.CTM);
  if (ctm && ctm.length === 6 && !ctm.some(Number.isNaN)) {
    pasangan = sudut.map(([x, y]) => ({ x, y, X: ctm[0] * x + ctm[2] * y + ctm[4], Y: ctm[1] * x + ctm[3] * y + ctm[5] }));
  } else if (Array.isArray(lgi.Registration)) {
    pasangan = lgi.Registration.map(deretAngka)
      .filter((r: any) => r && r.length >= 4 && !r.some(Number.isNaN))
      .map(([x, y, X, Y]: [number, number, number, number]) => ({ x, y, X, Y }));
  }
  if (pasangan.length < 3) return null;

  const keGeo = proj4(def, 'EPSG:4326');
  const kontrol = pasangan.map(({ x, y, X, Y }) => {
    const [lon, lat] = keGeo.forward([X, Y]);
    return { x, y, lat, lon };
  });
  return {
    nama: '',
    bbox: kotakDari(sudut),
    kontrol,
    kontrolWgs84: true,
    batas: sudut,
    crs: { jenis: jenis === 'UT' ? 'PROJCS' : 'GEOGCS', epsg: null, wkt: null, proj4: def },
  };
}

function kotakDari(titik: [number, number][]): [number, number, number, number] {
  const xs = titik.map((t) => t[0]), ys = titik.map((t) => t[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

export function pilihViewportUtama(info: GeoRefInfo): ViewportInfo {
  const luas = (v: ViewportInfo) => (v.bbox[2] - v.bbox[0]) * (v.bbox[3] - v.bbox[1]);
  return info.viewports.reduce((a, b) => (luas(b) > luas(a) ? b : a));
}

function ambilGeogcs(wkt?: string | null): string | null {
  if (!wkt) return null;
  const awal = wkt.search(/GEOG(CS|CRS)\s*\[/i);
  if (awal < 0) return null;
  let kedalaman = 0;
  for (let i = wkt.indexOf('[', awal); i < wkt.length; i++) {
    if (wkt[i] === '[') kedalaman++;
    else if (wkt[i] === ']' && --kedalaman === 0) return wkt.slice(awal, i + 1);
  }
  return null;
}

function definisiPeta(crs: CrsInfo | undefined, proj4: any): { def: string; geografis: boolean } | null {
  if (!crs) return null;
  if (crs.proj4) return { def: crs.proj4, geografis: /\+proj=longlat/.test(crs.proj4) };
  if (crs.wkt) {
    try {
      const p = proj4.Proj(crs.wkt);
      if (p && p.projName) return { def: crs.wkt, geografis: p.projName === 'longlat' };
    } catch {
      // WKT tidak dikenali proj4; coba EPSG
    }
  }
  const d = crs.epsg ? definisiEpsg(crs.epsg) : null;
  if (d) return { def: d, geografis: /\+proj=longlat/.test(d) };
  if (crs.jenis === 'GEOGCS') return { def: 'EPSG:4326', geografis: true };
  return null;
}

export function namaCrs(crs?: CrsInfo | null): string {
  const m = crs?.wkt && crs.wkt.match(/^\s*(?:PROJCS|GEOGCS|PROJCRS|GEOGCRS)\s*\[\s*"([^"]+)"/i);
  if (m) return crs.epsg ? `${m[1]} (EPSG:${crs.epsg})` : m[1];
  if (crs?.epsg) return `EPSG:${crs.epsg}`;
  if (crs?.proj4) {
    const z = crs.proj4.match(/\+zone=(\d+)/);
    return z ? `UTM zona ${z[1]}${/\+south/.test(crs.proj4) ? 'S' : 'N'} (WGS 84)` : 'Geografis (WGS 84)';
  }
  return 'Tidak diketahui';
}

export function buatTransformasi(vp: ViewportInfo, p4: any = proj4Default): Transformasi {
  const proj4 = p4.default || p4;
  const titik = vp.kontrol;
  if (titik.length < 3) throw new Error('Titik kontrol georeferensi kurang dari 3');
  const peta = definisiPeta(vp.crs, proj4);
  if (peta) {
    try {
      const gpsKePeta = proj4('EPSG:4326', peta.def);
      const sumberKontrol = vp.kontrolWgs84 ? 'EPSG:4326' : ambilGeogcs(vp.crs?.wkt) || 'EPSG:4326';
      const kontrolKePeta = proj4(sumberKontrol, peta.def);
      const hal = titik.map((k) => [k.x, k.y]);
      const ruangPeta = titik.map((k) => kontrolKePeta.forward([k.lon, k.lat]));
      const A = cocokkanAfin(hal, ruangPeta);
      const sisa = sisaMaks((p: [number, number]) => terapkanAfin(A, p), hal, ruangPeta);
      const sisaMeter = peta.geografis ? sisa * M_PER_DERAJAT : sisa;
      if (Number.isFinite(sisaMeter) && sisaMeter <= BATAS_SISA_AFIN_M) {
        const Ai = balikAfin(A);
        return {
          metode: peta.geografis ? 'afin-geografis' : 'afin-proyeksi',
          sisaMeter,
          keHalaman(lat: number, lon: number) {
            return terapkanAfin(Ai, gpsKePeta.forward([lon, lat])) as [number, number];
          },
          keGeografis(x: number, y: number) {
            const [lon, lat] = gpsKePeta.inverse(terapkanAfin(A, [x, y]));
            return { lat, lon };
          },
        };
      }
    } catch {
      // definisi proyeksi gagal dipakai; jatuh ke homografi
    }
  }
  // Tanpa proyeksi yang bisa dipakai: homografi langsung bujur/lintang <-> halaman.
  const geo = titik.map((k) => [k.lon, k.lat]);
  const hal = titik.map((k) => [k.x, k.y]);
  const H = cocokkanHomografi(geo, hal);
  const Hi = cocokkanHomografi(hal, geo);
  const sisa = sisaMaks((p: [number, number]) => terapkanHomografi(Hi, p), hal, geo) * M_PER_DERAJAT;
  return {
    metode: 'homografi',
    sisaMeter: titik.length > 4 ? sisa : null,
    keHalaman(lat: number, lon: number) {
      return terapkanHomografi(H, [lon, lat]) as [number, number];
    },
    keGeografis(x: number, y: number) {
      const [lon, lat] = terapkanHomografi(Hi, [x, y]);
      return { lat, lon };
    },
  };
}

export function batasGeo(vp: ViewportInfo, tf: Transformasi): BatasGeo {
  const titik = vp.batas.map(([x, y]) => tf.keGeografis(x, y));
  return {
    selatan: Math.min(...titik.map((t) => t.lat)),
    utara: Math.max(...titik.map((t) => t.lat)),
    barat: Math.min(...titik.map((t) => t.lon)),
    timur: Math.max(...titik.map((t) => t.lon)),
  };
}

export function diDalamBatas(vp: ViewportInfo, tf: Transformasi, lat: number, lon: number): boolean {
  const [x, y] = tf.keHalaman(lat, lon);
  return titikDalamPoligon(x, y, vp.batas);
}

function titikDalamPoligon(x: number, y: number, poligon: [number, number][]): boolean {
  let dalam = false;
  for (let i = 0, j = poligon.length - 1; i < poligon.length; j = i++) {
    const [xi, yi] = poligon[i], [xj, yj] = poligon[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dalam = !dalam;
  }
  return dalam;
}

function rataRata(titik: number[][]): [number, number] {
  const n = titik.length;
  return [titik.reduce((s, p) => s + p[0], 0) / n, titik.reduce((s, p) => s + p[1], 0) / n];
}

function cocokkanAfin(asal: number[][], tujuan: number[][]): number[] {
  const ma = rataRata(asal), mt = rataRata(tujuan);
  let sxx = 0, sxy = 0, syy = 0, sxu = 0, syu = 0, sxv = 0, syv = 0;
  for (let i = 0; i < asal.length; i++) {
    const x = asal[i][0] - ma[0], y = asal[i][1] - ma[1];
    const u = tujuan[i][0] - mt[0], v = tujuan[i][1] - mt[1];
    sxx += x * x; sxy += x * y; syy += y * y;
    sxu += x * u; syu += y * u; sxv += x * v; syv += y * v;
  }
  const det = sxx * syy - sxy * sxy;
  if (!det) throw new Error('Titik kontrol segaris');
  const a = (sxu * syy - syu * sxy) / det, b = (syu * sxx - sxu * sxy) / det;
  const d = (sxv * syy - syv * sxy) / det, e = (syv * sxx - sxv * sxy) / det;
  return [a, b, mt[0] - a * ma[0] - b * ma[1], d, e, mt[1] - d * ma[0] - e * ma[1]];
}

function terapkanAfin(A: number[], [x, y]: [number, number]): [number, number] {
  return [A[0] * x + A[1] * y + A[2], A[3] * x + A[4] * y + A[5]];
}

function balikAfin(A: number[]): number[] {
  const det = A[0] * A[4] - A[1] * A[3];
  return [
    A[4] / det, -A[1] / det, (A[1] * A[5] - A[4] * A[2]) / det,
    -A[3] / det, A[0] / det, (A[3] * A[2] - A[0] * A[5]) / det,
  ];
}

function sisaMaks(f: (p: [number, number]) => [number, number], asal: number[][], tujuan: number[][]): number {
  let maks = 0;
  for (let i = 0; i < asal.length; i++) {
    const [u, v] = f(asal[i] as [number, number]);
    maks = Math.max(maks, Math.hypot(u - tujuan[i][0], v - tujuan[i][1]));
  }
  return maks;
}

function normalisasi(titik: number[][]) {
  const [mx, my] = rataRata(titik);
  const r = titik.reduce((s, p) => s + Math.hypot(p[0] - mx, p[1] - my), 0) / titik.length || 1;
  const s = Math.SQRT2 / r;
  return { T: [s, 0, -s * mx, 0, s, -s * my, 0, 0, 1], Ti: [1 / s, 0, mx, 0, 1 / s, my, 0, 0, 1] };
}

function kali3(A: number[], B: number[]): number[] {
  const C = new Array(9).fill(0);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) C[i * 3 + j] += A[i * 3 + k] * B[k * 3 + j];
  return C;
}

function cocokkanHomografi(asal: number[][], tujuan: number[][]): number[] {
  const na = normalisasi(asal), nt = normalisasi(tujuan);
  const A: number[][] = [], b: number[] = [];
  for (let i = 0; i < asal.length; i++) {
    const [x, y] = terapkanHomografi(na.T, asal[i] as [number, number]);
    const [u, v] = terapkanHomografi(nt.T, tujuan[i] as [number, number]);
    A.push([x, y, 1, 0, 0, 0, -x * u, -y * u]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -x * v, -y * v]); b.push(v);
  }
  const M = Array.from({ length: 8 }, () => new Array(9).fill(0));
  for (let r = 0; r < A.length; r++) {
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) M[i][j] += A[r][i] * A[r][j];
      M[i][8] += A[r][i] * b[r];
    }
  }
  const h = selesaikan(M);
  return kali3(nt.Ti, kali3([...h, 1], na.T));
}

function selesaikan(M: number[][]): number[] {
  const n = M.length;
  for (let k = 0; k < n; k++) {
    let p = k;
    for (let i = k + 1; i < n; i++) if (Math.abs(M[i][k]) > Math.abs(M[p][k])) p = i;
    if (Math.abs(M[p][k]) < 1e-12) throw new Error('Titik kontrol tidak cukup untuk homografi');
    [M[k], M[p]] = [M[p], M[k]];
    for (let i = k + 1; i < n; i++) {
      const f = M[i][k] / M[k][k];
      for (let j = k; j <= n; j++) M[i][j] -= f * M[k][j];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = M[i][n];
    for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j];
    x[i] = s / M[i][i];
  }
  return x;
}

function terapkanHomografi(H: number[], [x, y]: [number, number]): [number, number] {
  const w = H[6] * x + H[7] * y + H[8];
  return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
}
