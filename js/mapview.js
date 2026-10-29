// Penampil halaman peta PDF: geser satu jari, cubit dua jari, roda tetikus, dan lapisan gambar di atasnya.
// Ruang "dasar" = viewport pdf.js skala 1 (px CSS, rotasi halaman sudah diperhitungkan).
// Layar (px CSS) = dasar × zoom + geser.
//
// Halaman digambar sekali ke kanvas "dasar" beresolusi sedang. Setelah tampilan diam sebentar,
// bagian yang terlihat digambar ulang setajam layar ("detail") lalu ditumpuk di atas kanvas dasar.

const SISI_MAKS_DASAR = 3072;
const LUAS_MAKS_DASAR = 8_000_000;
const ZOOM_MAKS = 40;
const JEDA_DETAIL_MS = 180;
const AMBANG_KETUK_PX = 8;
const WARNA_LATAR = '#dcdad3';

export class TampilanPeta {
  constructor(kanvas) {
    this.kanvas = kanvas;
    this.ctx = kanvas.getContext('2d');
    this.zoom = 1;
    this.zoomPas = 1;
    this.gx = 0;
    this.gy = 0;
    this.lebar = 0;
    this.tinggi = 0;
    this.dpr = 1;
    this.halaman = null;
    this.vp1 = null;
    this.dasar = null;
    this.skalaDasar = 1;
    this.detail = null;
    this.tugasDetail = null;
    this.timerDetail = 0;
    this.bingkai = 0;
    this.pointer = new Map();
    this.gestur = null;
    this.ketuk = null;
    // Kait untuk aplikasi
    this.gambarLapisan = null; // (ctx, tampilan) => void, dalam px CSS
    this.saatKetuk = null; // (x, y) px CSS
    this.saatUbah = null; // tampilan bergeser/berubah zoom
    this.saatGeserManual = null; // pengguna menggeser dengan satu jari
    this._pasangInteraksi();
    new ResizeObserver(() => this._ukurUlang()).observe(kanvas);
  }

  async muat(dokumen, nomorHalaman) {
    this.kosongkan();
    const halaman = await dokumen.getPage(nomorHalaman);
    const vp1 = halaman.getViewport({ scale: 1 });
    const skala = Math.min(
      SISI_MAKS_DASAR / Math.max(vp1.width, vp1.height),
      Math.sqrt(LUAS_MAKS_DASAR / (vp1.width * vp1.height)),
    );
    const vp = halaman.getViewport({ scale: skala });
    const dasar = document.createElement('canvas');
    dasar.width = Math.ceil(vp.width);
    dasar.height = Math.ceil(vp.height);
    await halaman.render({ canvasContext: dasar.getContext('2d'), viewport: vp }).promise;
    this.halaman = halaman;
    this.vp1 = vp1;
    this.skalaDasar = skala;
    this.dasar = dasar;
    this._ukurUlang();
    this.pasLayar();
  }

  kosongkan() {
    this._batalkanDetail();
    this.halaman = null;
    this.vp1 = null;
    this.dasar = null;
    this.detail = null;
    this.gambar();
  }

  pasLayar() {
    if (!this.vp1) return;
    this.zoom = this.zoomPas;
    this.gx = (this.lebar - this.vp1.width * this.zoom) / 2;
    this.gy = (this.tinggi - this.vp1.height * this.zoom) / 2;
    this._berubah();
  }

  zoomDi(sx, sy, faktor) {
    if (!this.vp1) return;
    const z = this._batasiZoom(this.zoom * faktor);
    const f = z / this.zoom;
    this.gx = sx - (sx - this.gx) * f;
    this.gy = sy - (sy - this.gy) * f;
    this.zoom = z;
    this._berubah();
  }

  // Pusatkan tampilan pada titik halaman PDF (ruang pengguna).
  pusatkan(x, y, zoom = this.zoom) {
    if (!this.vp1) return;
    const [bx, by] = this.vp1.convertToViewportPoint(x, y);
    this.zoom = this._batasiZoom(zoom);
    this.gx = this.lebar / 2 - bx * this.zoom;
    this.gy = this.tinggi / 2 - by * this.zoom;
    this._berubah();
  }

  // Matriks [a, b, c, d, e, f] dari ruang pengguna PDF ke px CSS layar.
  matriksLayar() {
    const [a, b, c, d, e, f] = this.vp1.transform;
    const z = this.zoom;
    return [a * z, b * z, c * z, d * z, e * z + this.gx, f * z + this.gy];
  }

  keLayar(x, y) {
    const m = this.matriksLayar();
    return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  }

  dariLayar(sx, sy) {
    return this.vp1.convertToPdfPoint((sx - this.gx) / this.zoom, (sy - this.gy) / this.zoom);
  }

  gambar() {
    if (this.bingkai) return;
    this.bingkai = requestAnimationFrame(() => {
      this.bingkai = 0;
      this._render();
    });
  }

  _berubah() {
    this.gambar();
    this._jadwalkanDetail();
    this.saatUbah?.();
  }

  _batasiZoom(z) {
    return Math.min(ZOOM_MAKS, Math.max(this.zoomPas * 0.5, z));
  }

  _ukurUlang() {
    const r = this.kanvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const pusat = this.vp1 && this.lebar
      ? [(this.lebar / 2 - this.gx) / this.zoom, (this.tinggi / 2 - this.gy) / this.zoom]
      : null;
    this.lebar = r.width;
    this.tinggi = r.height;
    this.dpr = window.devicePixelRatio || 1;
    this.kanvas.width = Math.round(r.width * this.dpr);
    this.kanvas.height = Math.round(r.height * this.dpr);
    if (this.vp1) {
      this.zoomPas = Math.min(this.lebar / this.vp1.width, this.tinggi / this.vp1.height) * 0.96;
      if (pusat) {
        this.gx = this.lebar / 2 - pusat[0] * this.zoom;
        this.gy = this.tinggi / 2 - pusat[1] * this.zoom;
      }
    }
    this.detail = null;
    this.gambar();
    this._jadwalkanDetail();
  }

  _render() {
    const { ctx, dpr } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = WARNA_LATAR;
    ctx.fillRect(0, 0, this.kanvas.width, this.kanvas.height);
    if (!this.dasar) return;
    const z = this.zoom;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    const s = (z / this.skalaDasar) * dpr;
    ctx.setTransform(s, 0, 0, s, this.gx * dpr, this.gy * dpr);
    ctx.drawImage(this.dasar, 0, 0);

    const dt = this.detail;
    if (dt) {
      // Detail digambar untuk zoom/geser saat dirender; skala ulang ke tampilan sekarang.
      const f = z / dt.zoom;
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.beginPath();
      ctx.rect(this.gx, this.gy, this.vp1.width * z, this.vp1.height * z);
      ctx.clip();
      ctx.setTransform(f, 0, 0, f, (this.gx - dt.gx * f) * dpr, (this.gy - dt.gy * f) * dpr);
      ctx.drawImage(dt.kanvas, 0, 0);
      ctx.restore();
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.gambarLapisan?.(ctx, this);
  }

  _jadwalkanDetail() {
    this._batalkanDetail();
    if (this.halaman) this.timerDetail = setTimeout(() => this._renderDetail(), JEDA_DETAIL_MS);
  }

  _batalkanDetail() {
    clearTimeout(this.timerDetail);
    if (this.tugasDetail) {
      this.tugasDetail.cancel();
      this.tugasDetail = null;
    }
  }

  async _renderDetail() {
    if (!this.halaman || this.pointer.size) return;
    const skala = this.zoom * this.dpr;
    if (skala <= this.skalaDasar * 1.1) {
      if (this.detail) {
        this.detail = null;
        this.gambar();
      }
      return;
    }
    const kanvas = document.createElement('canvas');
    kanvas.width = this.kanvas.width;
    kanvas.height = this.kanvas.height;
    const keadaan = { zoom: this.zoom, gx: this.gx, gy: this.gy };
    const viewport = this.halaman.getViewport({ scale: skala, offsetX: this.gx * this.dpr, offsetY: this.gy * this.dpr });
    const tugas = this.halaman.render({ canvasContext: kanvas.getContext('2d'), viewport });
    this.tugasDetail = tugas;
    try {
      await tugas.promise;
      if (this.tugasDetail !== tugas) return;
      this.tugasDetail = null;
      this.detail = { kanvas, ...keadaan };
      this.gambar();
    } catch (e) {
      if (e?.name !== 'RenderingCancelledException') console.warn('Gagal menggambar detail peta', e);
    }
  }

  _pasangInteraksi() {
    const k = this.kanvas;
    const posisi = (e) => {
      const r = k.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    k.addEventListener('pointerdown', (e) => {
      k.setPointerCapture(e.pointerId);
      this.pointer.set(e.pointerId, posisi(e));
      this.ketuk = this.pointer.size === 1 ? { ...posisi(e), waktu: performance.now() } : null;
      this._mulaiGestur();
      this._batalkanDetail();
    });
    k.addEventListener('pointermove', (e) => {
      if (!this.pointer.has(e.pointerId)) return;
      this.pointer.set(e.pointerId, posisi(e));
      this._gerakGestur();
    });
    const selesai = (e) => {
      if (!this.pointer.has(e.pointerId)) return;
      this.pointer.delete(e.pointerId);
      if (this.ketuk && e.type === 'pointerup' && performance.now() - this.ketuk.waktu < 500) {
        this.saatKetuk?.(this.ketuk.x, this.ketuk.y);
      }
      this.ketuk = null;
      this._mulaiGestur();
      this._jadwalkanDetail();
    };
    k.addEventListener('pointerup', selesai);
    k.addEventListener('pointercancel', selesai);
    k.addEventListener('wheel', (e) => {
      e.preventDefault();
      const p = posisi(e);
      this.zoomDi(p.x, p.y, Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015)));
    }, { passive: false });
  }

  _mulaiGestur() {
    this.gestur = { zoom: this.zoom, gx: this.gx, gy: this.gy, titik: [...this.pointer.values()].map((p) => ({ ...p })) };
  }

  _gerakGestur() {
    const g = this.gestur;
    if (!g || !this.vp1) return;
    const titik = [...this.pointer.values()];
    if (titik.length === 1 && g.titik.length === 1) {
      const dx = titik[0].x - g.titik[0].x, dy = titik[0].y - g.titik[0].y;
      if (this.ketuk && Math.hypot(dx, dy) < AMBANG_KETUK_PX) return;
      this.ketuk = null;
      this.gx = g.gx + dx;
      this.gy = g.gy + dy;
      this.saatGeserManual?.();
    } else if (titik.length >= 2 && g.titik.length >= 2) {
      const [a0, b0] = g.titik, [a, b] = titik;
      const d0 = Math.hypot(b0.x - a0.x, b0.y - a0.y) || 1;
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      const m0x = (a0.x + b0.x) / 2, m0y = (a0.y + b0.y) / 2;
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const z = this._batasiZoom((g.zoom * d) / d0);
      const bx = (m0x - g.gx) / g.zoom, by = (m0y - g.gy) / g.zoom;
      this.zoom = z;
      this.gx = mx - bx * z;
      this.gy = my - by * z;
    } else {
      return;
    }
    this.gambar();
    this.saatUbah?.();
  }
}
