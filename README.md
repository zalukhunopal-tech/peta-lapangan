# Peta Lapangan

Aplikasi web (PWA) untuk kerja lapangan. Fungsinya:

- membuka peta **GeoPDF** tanpa internet;
- menampilkan **posisi GPS** di atas peta;
- **menandai titik** dan **merekam jalur**;
- mengekspor dan mengimpor data dalam format **KML/GPX**.

Semua peta dan data disimpan di HP itu sendiri.

**Buka aplikasinya:** https://zalukhunopal-tech.github.io/peta-lapangan/

Aplikasi ini ditulis dari nol dan tidak memakai kode dari aplikasi peta lain.

## Fitur

- **Impor GeoPDF**: membaca georeferensi format ISO 32000 (ekspor ArcGIS, QGIS, dan lain-lain) dan OGC LGIDict. Peta disimpan di HP dan bisa dibuka tanpa sinyal.
- **Posisi GPS**: titik biru dengan lingkaran akurasi dan arah gerak. Ada tombol untuk mengikuti posisi, dan peringatan bila Anda berada di luar area peta.
- **Tandai titik**: pakai posisi GPS, atau geser peta sampai tanda + tepat di lokasi. Setiap titik bisa diberi nama dan catatan.
- **Rekam jalur**: titik yang akurasinya buruk atau terlalu rapat disaring. Layar dijaga tetap menyala, dan rekaman disimpan bertahap sehingga tidak hilang bila aplikasi tertutup.
- **Format koordinat**: desimal, derajat-menit-detik (LU/LS, BT/BB), atau UTM.
- **Ekspor/impor**: KML (Google Earth) dan GPX (GPS genggam, QGIS).
- **Daftar peta**: menandai peta yang mencakup posisi Anda saat ini.
- **Peta contoh** berisi data fiktif, untuk mencoba aplikasi tanpa GeoPDF sendiri.

## Memakai di HP

GPS dan mode offline hanya jalan bila aplikasi dibuka lewat **HTTPS**. Taruh folder ini di hosting statis, misalnya:

- **Netlify** atau **Cloudflare Pages**: gratis dan bisa terhubung langsung ke repo GitHub privat;
- **GitHub Pages**: gratis untuk repo publik, sedangkan untuk repo privat perlu paket berbayar.

Langkahnya:

1. Buka alamatnya di Chrome Android.
2. Pilih menu ⋮ → **Instal aplikasi** (atau **Tambahkan ke layar utama**).
3. Izinkan akses lokasi.
4. Impor peta GeoPDF dari penyimpanan HP.

Setelah dibuka sekali, aplikasi tetap bisa dipakai tanpa internet.

## Menjalankan di komputer

```bash
npm install
npm run serve
```

Lalu buka `http://localhost:8080`.

## Batasan

- Jalur hanya terekam selama aplikasi terbuka dan layar menyala. Ini batasan aplikasi web: peramban menghentikan GPS saat aplikasi ditutup.
- Data tersimpan di peramban. Kalau data situs dihapus atau aplikasi dicopot, data ikut hilang. **Ekspor KML/GPX secara berkala.**
- GPS memakai datum WGS 84. Peta dengan datum lain dikonversi bila WKT di GeoPDF memuat parameter datum (TOWGS84). DGN95 dan SRGI2013 praktis sama dengan WGS 84.
- Peta tanpa sistem koordinat yang dikenali tetap bisa dipakai lewat homografi dari titik kontrol. Hasilnya berupa perkiraan, dan aplikasi menyebutnya di Info peta.
- Ketinggian dari GPS HP adalah tinggi terhadap elipsoid, bukan tinggi di atas permukaan laut.

## Pengembangan

| Perintah | Fungsi |
|---|---|
| `npm test` | Tes georeferensi, transformasi koordinat, ekspor/impor, dan perekam jalur |
| `npm run contoh` | Membuat ulang `contoh/contoh-peta.pdf` (data fiktif, UTM 50N) |
| `npm run ikon` | Membuat ulang ikon PNG |
| `npm run vendor` | Menyalin pustaka dari `node_modules` ke `vendor/` |

Struktur kode:

- `js/georef.js`: membaca GeoPDF, transformasi lintang/bujur ↔ halaman PDF (afin pada proyeksi peta, atau homografi)
- `js/mapview.js`: penampil peta (geser, cubit-perbesar, render tajam bertahap)
- `js/app.js`: antarmuka
- `js/gps.js`, `js/perekam.js`: GPS dan perekaman jalur
- `js/exporters.js`, `js/coords.js`, `js/epsg.js`, `js/db.js`: KML/GPX, format koordinat, definisi EPSG Indonesia, IndexedDB
- `sw.js`: cache offline. Naikkan `VERSI` setiap kali berkas aplikasi berubah.

Tidak ada langkah build. Pustaka pihak ketiga disimpan di `vendor/` supaya aplikasi bisa jalan offline.

## Lisensi pihak ketiga

- [pdf.js](https://github.com/mozilla/pdf.js) – Apache-2.0 (`vendor/pdfjs/LICENSE`)
- [pdf-lib](https://github.com/Hopding/pdf-lib) – MIT (`vendor/pdf-lib/LICENSE.md`)
- [proj4js](https://github.com/proj4js/proj4js) – MIT (`vendor/proj4/LICENSE.md`)
