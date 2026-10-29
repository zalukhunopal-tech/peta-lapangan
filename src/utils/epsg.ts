// Definisi proj4 untuk kode EPSG yang umum di peta Indonesia.
// Hanya dipakai bila GeoPDF tidak menyertakan WKT; WKT selalu didahulukan.

const WGS84_GEO = '+proj=longlat +datum=WGS84 +no_defs';

export function definisiEpsg(kode: number | string): string | null {
  const k = Number(kode);
  // WGS 84 dan DGN95 (datum Indonesia, praktis sama dengan WGS 84)
  if (k === 4326 || k === 4755) return WGS84_GEO;
  if (k === 3857 || k === 900913) {
    return '+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +no_defs';
  }
  // WGS 84 / UTM zona 1–60 utara (326xx) dan selatan (327xx)
  if (k >= 32601 && k <= 32660) return `+proj=utm +zone=${k - 32600} +datum=WGS84 +units=m +no_defs`;
  if (k >= 32701 && k <= 32760) return `+proj=utm +zone=${k - 32700} +south +datum=WGS84 +units=m +no_defs`;
  // DGN95 / Indonesia TM-3 zona 46.2 (EPSG:23830) s/d 54.1 (EPSG:23845), meridian tengah 94,5°–139,5° BT
  if (k >= 23830 && k <= 23845) {
    const lon0 = 94.5 + 3 * (k - 23830);
    return `+proj=tmerc +lat_0=0 +lon_0=${lon0} +k=0.9999 +x_0=200000 +y_0=1500000 +ellps=WGS84 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs`;
  }
  return null;
}
