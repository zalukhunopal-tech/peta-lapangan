# Peta Lapangan (React)

Aplikasi web (PWA) berbasis React dan Vite untuk kerja lapangan:

- Membuka peta **GeoPDF** secara offline;
- Menampilkan **posisi GPS** di atas peta;
- **Menandai titik** dan **merekam jalur**;
- Mengekspor dan mengimpor data dalam format **KML/GPX**.

Semua peta dan data disimpan secara lokal di peramban menggunakan IndexedDB.

## Fitur Utama

- **Impor GeoPDF**: Membaca georeferensi format ISO 32000 (ekspor ArcGIS, QGIS, dll.) dan OGC LGIDict. Peta disimpan di penyimpanan lokal dan bisa dibuka tanpa sinyal internet.
- **Posisi GPS Real-time**: Titik GPS dengan lingkaran akurasi dan arah orientasi/kecepatan gerak. Mendukung mode otomatis mengikuti posisi dan deteksi bila berada di luar cakupan peta.
- **Tandai Titik**: Tandai langsung di posisi GPS atau geser peta ke tanda silang tengah (+). Titik dapat diedit nama dan catatannya.
- **Rekam Jalur**: Titik dengan akurasi buruk atau jarak terlalu rapat otomatis disaring. Layar dijaga tetap aktif (Screen Wake Lock) dan rekaman otomatis disimpan bertahap ke IndexedDB.
- **Format Koordinat**: Desimal (DD), derajat-menit-detik (DMS), dan UTM.
- **Ekspor & Impor**: Format KML (Google Earth) dan GPX (GPS genggam, QGIS).
- **Peta Contoh**: Disediakan peta contoh fiktif untuk langsung mencoba aplikasi tanpa perlu berkas GeoPDF sendiri.

## Pengembangan

```bash
# Instal dependensi
npm install

# Jalankan server pengembangan
npm run dev

# Kompilasi aplikasi untuk produksi
npm run build
```

## Struktur Proyek React

- `src/App.tsx`: Komponen utama pengelola layar (Daftar Peta, Data Lapangan, Penampil Peta), state GPS, dan perekam jalur
- `src/components/MapView.tsx`: Kanvas penampil peta interaktif dengan dukungan gestur cubit zoom, geser, render detail resolusi tinggi bertahap, dan lapisan gambar fitur
- `src/components/DialogFitur.tsx`: Modal edit, hapus, dan lihat fitur pada peta
- `src/components/DialogInfo.tsx`: Modal informasi metadata peta (CRS, format georef, selisih titik kontrol)
- `src/components/DialogSetelan.tsx`: Pengaturan format koordinat dan toleransi akurasi GPS
- `src/utils/georef.ts`: Parser GeoPDF, affine & homography transform WGS84 ↔ ruang koordinat PDF
- `src/utils/mapview.ts`: Logika kanvas rendering PDF.js
- `src/utils/coords.ts`: Transformasi UTM/DMS/DD dan kalkulasi jarak geodesik
- `src/utils/exporters.ts`: Parser dan serializer KML/GPX
- `src/utils/gps.ts`: Layanan geolocation terpusat
- `src/utils/perekam.ts`: Filter dan agregator track recording
- `src/utils/db.ts`: Abstraksi IndexedDB lokal
