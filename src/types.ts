export type FormatKoordinat = 'dd' | 'dms' | 'utm';

export interface Setelan {
  format: FormatKoordinat;
  akurasiMaks: number;
}

export interface Titik {
  lat: number;
  lon: number;
  alt?: number;
  waktu?: string;
  akurasi?: number;
}

export interface Fitur {
  id: string;
  jenis: 'titik' | 'jalur';
  nama: string;
  catatan?: string;
  dibuat: string;
  titik: Titik[];
  sedangDirekam?: boolean;
}

export interface KontrolTitik {
  x: number;
  y: number;
  lat: number;
  lon: number;
}

export interface CrsInfo {
  jenis?: string | null;
  epsg?: number | null;
  wkt?: string | null;
  proj4?: string | null;
}

export interface ViewportInfo {
  nama: string;
  bbox: [number, number, number, number];
  kontrol: KontrolTitik[];
  kontrolWgs84?: boolean;
  batas: [number, number][];
  crs: CrsInfo;
}

export interface GeoRefInfo {
  format: 'iso32000' | 'ogc-lgi';
  halaman: number;
  viewports: ViewportInfo[];
}

export interface BatasGeo {
  selatan: number;
  utara: number;
  barat: number;
  timur: number;
}

export interface Transformasi {
  metode: 'afin-proyeksi' | 'afin-geografis' | 'homografi';
  sisaMeter: number | null;
  keHalaman: (lat: number, lon: number) => [number, number];
  keGeografis: (x: number, y: number) => { lat: number; lon: number };
}

export interface PetaRecord {
  id: string;
  nama: string;
  namaFile: string;
  ukuran: number;
  ditambahkan: string;
  berkas: Blob;
  georef: GeoRefInfo;
  batasGeo: BatasGeo;
  crs: string;
  gambarKecil: string;
}

export interface PosisiGPS {
  lat: number;
  lon: number;
  akurasi: number;
  alt?: number | null;
  arah?: number | null;
  kecepatan?: number | null;
  waktu: number;
}
