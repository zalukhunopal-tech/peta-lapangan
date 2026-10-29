// Perekam jalur: menyaring posisi GPS yang kurang akurat atau terlalu rapat sebelum disimpan.

import { jarakMeter, panjangJalur } from './coords.js';

export class PerekamJalur {
  constructor({ akurasiMaks = 30, jarakMin = 3 } = {}) {
    this.akurasiMaks = akurasiMaks;
    this.jarakMin = jarakMin;
    this.titik = [];
    this.aktif = false;
    this.mulaiPada = 0;
    this._panjang = 0;
  }

  mulai() {
    this.titik = [];
    this._panjang = 0;
    this.mulaiPada = Date.now();
    this.aktif = true;
  }

  // Mengembalikan true bila posisi diterima sebagai titik jalur baru.
  tambah(pos) {
    if (!this.aktif || !(pos.akurasi <= this.akurasiMaks)) return false;
    const akhir = this.titik[this.titik.length - 1];
    if (akhir) {
      const jarak = jarakMeter(akhir, pos);
      // Abaikan "lompatan" kecil yang masih di dalam ketidakpastian GPS
      if (jarak < Math.max(this.jarakMin, pos.akurasi / 2)) return false;
      this._panjang += jarak;
    }
    const t = { lat: pos.lat, lon: pos.lon, waktu: new Date(pos.waktu || Date.now()).toISOString(), akurasi: Math.round(pos.akurasi) };
    if (Number.isFinite(pos.alt)) t.alt = Math.round(pos.alt * 10) / 10;
    this.titik.push(t);
    return true;
  }

  get panjang() {
    return this._panjang || panjangJalur(this.titik);
  }

  get durasi() {
    return this.aktif ? Date.now() - this.mulaiPada : 0;
  }

  berhenti() {
    this.aktif = false;
    return this.titik;
  }
}
