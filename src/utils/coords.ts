// Format koordinat dan perhitungan jarak (semua lintang/bujur dalam WGS 84).
import proj4 from 'proj4';
import { FormatKoordinat, Titik } from '../types';

const R_BUMI = 6371008.8;
const RAD = Math.PI / 180;

export function jarakMeter(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const dLat = (b.lat - a.lat) * RAD, dLon = (b.lon - a.lon) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * R_BUMI * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function panjangJalur(titik: Titik[]): number {
  let total = 0;
  for (let i = 1; i < titik.length; i++) total += jarakMeter(titik[i - 1], titik[i]);
  return total;
}

const desimal = (n: number, d: number) => n.toFixed(d).replace('.', ',');

export function formatJarak(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${desimal(m / 1000, m < 10000 ? 2 : 1)} km`;
}

export function formatDurasi(ms: number): string {
  const t = Math.max(0, Math.floor(ms / 1000));
  const jam = Math.floor(t / 3600), menit = Math.floor((t % 3600) / 60), detik = t % 60;
  return `${jam}:${String(menit).padStart(2, '0')}:${String(detik).padStart(2, '0')}`;
}

export function formatDD(lat: number, lon: number): string {
  return `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
}

function dms(nilai: number, positif: string, negatif: string): string {
  const arah = nilai < 0 ? negatif : positif;
  const v = Math.abs(nilai);
  let d = Math.floor(v);
  let m = Math.floor((v - d) * 60);
  let s = ((v - d) * 60 - m) * 60;
  if (s >= 59.95) { s = 0; m += 1; }
  if (m >= 60) { m = 0; d += 1; }
  return `${d}°${String(m).padStart(2, '0')}'${desimal(s, 1).padStart(4, '0')}" ${arah}`;
}

export function formatDMS(lat: number, lon: number): string {
  return `${dms(lat, 'LU', 'LS')}  ${dms(lon, 'BT', 'BB')}`;
}

export function keUtm(lat: number, lon: number, p4: any = proj4): { zona: number; selatan: boolean; e: number; n: number } {
  const zona = Math.min(60, Math.floor((lon + 180) / 6) + 1);
  const selatan = lat < 0;
  const def = `+proj=utm +zone=${zona}${selatan ? ' +south' : ''} +datum=WGS84 +units=m +no_defs`;
  const [e, n] = (p4.default || p4)('EPSG:4326', def).forward([lon, lat]);
  return { zona, selatan, e, n };
}

export function formatUTM(lat: number, lon: number, p4: any = proj4): string {
  const u = keUtm(lat, lon, p4);
  return `${u.zona}${u.selatan ? 'S' : 'N'}  ${Math.round(u.e)} mT  ${Math.round(u.n)} mU`;
}

export function formatKoordinat(lat: number, lon: number, format: FormatKoordinat, p4: any = proj4): string {
  if (format === 'dms') return formatDMS(lat, lon);
  if (format === 'utm') return formatUTM(lat, lon, p4);
  return formatDD(lat, lon);
}
