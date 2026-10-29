// Satu pemantau GPS bersama untuk beberapa pelanggan (penampil peta, perekam jalur).
import { PosisiGPS } from '../types';

const PESAN_GALAT: Record<number, string> = {
  1: 'Izin lokasi ditolak. Izinkan akses lokasi untuk aplikasi ini di setelan peramban.',
  2: 'Lokasi tidak tersedia. Pastikan Lokasi/GPS di HP menyala.',
  3: 'Sinyal GPS belum didapat. Coba di tempat terbuka.',
};

export class LayananGps {
  private pelanggan = new Map<string, { saatPosisi: (pos: PosisiGPS) => void; saatGalat: (err: string) => void }>();
  private idPantau: number | null = null;
  public terakhir: PosisiGPS | null = null;

  langganan(kunci: string, saatPosisi: (pos: PosisiGPS) => void, saatGalat: (err: string) => void = () => {}) {
    this.pelanggan.set(kunci, { saatPosisi, saatGalat });
    if (!('geolocation' in navigator)) {
      saatGalat('Perangkat atau peramban ini tidak mendukung GPS.');
      return;
    }
    if (this.terakhir) saatPosisi(this.terakhir);
    if (this.idPantau !== null) return;
    this.idPantau = navigator.geolocation.watchPosition(
      (p) => {
        const c = p.coords;
        this.terakhir = {
          lat: c.latitude,
          lon: c.longitude,
          akurasi: c.accuracy,
          alt: c.altitude,
          arah: Number.isFinite(c.heading) ? c.heading : null,
          kecepatan: Number.isFinite(c.speed) ? c.speed : null,
          waktu: p.timestamp,
        };
        for (const s of this.pelanggan.values()) s.saatPosisi(this.terakhir);
      },
      (e) => {
        const pesan = PESAN_GALAT[e.code] || `GPS bermasalah: ${e.message}`;
        for (const s of this.pelanggan.values()) s.saatGalat(pesan);
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 30000 },
    );
  }

  berhenti(kunci: string) {
    this.pelanggan.delete(kunci);
    if (this.pelanggan.size === 0 && this.idPantau !== null) {
      navigator.geolocation.clearWatch(this.idPantau);
      this.idPantau = null;
    }
  }
}
