import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Fitur, PetaRecord, PosisiGPS, Setelan, Titik, Transformasi } from '../types';
import { TampilanPeta } from '../utils/mapview';
import { formatKoordinat, formatJarak, formatDurasi, jarakMeter } from '../utils/coords';
import { diDalamBatas } from '../utils/georef';
import { Icon } from './Icons';

interface MapViewProps {
  peta: PetaRecord;
  dokumen: any;
  transformasi: Transformasi;
  fiturList: Fitur[];
  posisi: PosisiGPS | null;
  galatGps: string | null;
  isMerekam: boolean;
  durasiRekam: number;
  panjangRekam: number;
  setelan: Setelan;
  initialCenter?: Titik | null;
  onBack: () => void;
  onOpenInfo: () => void;
  onToggleRekam: () => void;
  onSelectFitur: (fitur: Fitur) => void;
  onAddPoint: (titik: Titik) => void;
  onToast: (msg: string) => void;
}

const WARNA = {
  titik: '#1f6f4a',
  jalur: '#7b1fa2',
  rekam: '#d32f2f',
  gps: '#1a73e8',
};

function jarakKeRuas(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1, dy = y2 - y1;
  const t = dx || dy ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy))) : 0;
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function gambarPin(ctx: CanvasRenderingContext2D, x: number, y: number, warna: string) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.bezierCurveTo(x - 3, y - 7, x - 9, y - 11, x - 9, y - 19);
  ctx.arc(x, y - 19, 9, Math.PI, 0);
  ctx.bezierCurveTo(x + 9, y - 11, x + 3, y - 7, x, y);
  ctx.closePath();
  ctx.fillStyle = warna;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#fff';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y - 19, 3.5, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();
}

export const MapView: React.FC<MapViewProps> = ({
  peta,
  dokumen,
  transformasi,
  fiturList,
  posisi,
  galatGps,
  isMerekam,
  durasiRekam,
  panjangRekam,
  setelan,
  initialCenter,
  onBack,
  onOpenInfo,
  onToggleRekam,
  onSelectFitur,
  onAddPoint,
  onToast,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const tampilanRef = useRef<TampilanPeta | null>(null);
  const cacheHalamanRef = useRef<Map<string, { n: number; xy: Float64Array }>>(new Map());

  const [ikuti, setIkuti] = useState(false);
  const [modePilih, setModePilih] = useState(false);
  const [centerCoords, setCenterCoords] = useState<{ lat: number; lon: number } | null>(null);

  const getKoordHalaman = useCallback(
    (f: Fitur) => {
      let c = cacheHalamanRef.current.get(f.id);
      if (!c || c.n > f.titik.length) c = { n: 0, xy: new Float64Array(0) };
      if (c.n < f.titik.length) {
        const xy = new Float64Array(f.titik.length * 2);
        xy.set(c.xy);
        for (let i = c.n; i < f.titik.length; i++) {
          const [x, y] = transformasi.keHalaman(f.titik[i].lat, f.titik[i].lon);
          xy[2 * i] = x;
          xy[2 * i + 1] = y;
        }
        c = { n: f.titik.length, xy };
        cacheHalamanRef.current.set(f.id, c);
      }
      return c.xy;
    },
    [transformasi]
  );

  // Initialize and load canvas map view
  useEffect(() => {
    if (!canvasRef.current || !dokumen) return;

    const t = new TampilanPeta(canvasRef.current);
    tampilanRef.current = t;

    t.muat(dokumen, peta.georef.halaman + 1).then(() => {
      if (initialCenter) {
        const [x, y] = transformasi.keHalaman(initialCenter.lat, initialCenter.lon);
        t.pusatkan(x, y, t.zoomPas * 4);
      }
    });

    return () => {
      t.destroy();
      tampilanRef.current = null;
    };
  }, [dokumen, peta.georef.halaman, initialCenter, transformasi]);

  // Update hooks on TampilanPeta
  useEffect(() => {
    const t = tampilanRef.current;
    if (!t) return;

    t.gambarLapisan = (ctx) => {
      const [a, b, c, d, e, f] = t.matriksLayar();
      const lay = (x: number, y: number): [number, number] => [
        a * x + c * y + e,
        b * x + d * y + f,
      ];

      // Draw paths
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      for (const fi of fiturList) {
        if (fi.jenis !== 'jalur' || fi.titik.length < 2) continue;
        const xy = getKoordHalaman(fi);
        ctx.beginPath();
        for (let i = 0; i < xy.length; i += 2) {
          const [sx, sy] = lay(xy[i], xy[i + 1]);
          if (i === 0) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        }
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 6;
        ctx.stroke();
        ctx.strokeStyle = fi.sedangDirekam ? WARNA.rekam : WARNA.jalur;
        ctx.lineWidth = 3;
        ctx.stroke();
      }

      // Draw points
      ctx.font = '600 13px system-ui, sans-serif';
      ctx.textBaseline = 'middle';
      for (const fi of fiturList) {
        if (fi.jenis !== 'titik') continue;
        const xy = getKoordHalaman(fi);
        const [sx, sy] = lay(xy[0], xy[1]);
        if (sx < -40 || sy < -40 || sx > t.lebar + 200 || sy > t.tinggi + 40) continue;
        gambarPin(ctx, sx, sy, WARNA.titik);
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(255,255,255,0.95)';
        ctx.strokeText(fi.nama, sx + 12, sy - 19);
        ctx.fillStyle = '#1b1b1b';
        ctx.fillText(fi.nama, sx + 12, sy - 19);
      }

      // Draw GPS indicator
      if (posisi) {
        const [x, y] = transformasi.keHalaman(posisi.lat, posisi.lon);
        const [sx, sy] = lay(x, y);
        const [xu, yu] = transformasi.keHalaman(
          posisi.lat + posisi.akurasi / 111320,
          posisi.lon
        );
        const [ux, uy] = lay(xu, yu);
        const r = Math.hypot(ux - sx, uy - sy);

        ctx.beginPath();
        ctx.arc(sx, sy, Math.max(r, 9), 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(26,115,232,0.14)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(26,115,232,0.5)';
        ctx.lineWidth = 1;
        ctx.stroke();

        if (posisi.arah != null && (posisi.kecepatan ?? 0) > 0.5 && r > 0) {
          const nx = (ux - sx) / r,
            ny = (uy - sy) / r;
          const rad = (posisi.arah * Math.PI) / 180;
          const hx = nx * Math.cos(rad) - ny * Math.sin(rad),
            hy = nx * Math.sin(rad) + ny * Math.cos(rad);
          ctx.beginPath();
          ctx.moveTo(sx + hx * 22, sy + hy * 22);
          ctx.lineTo(sx - hy * 8, sy + hx * 8);
          ctx.lineTo(sx + hy * 8, sy - hx * 8);
          ctx.closePath();
          ctx.fillStyle = WARNA.gps;
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(sx, sy, 8, 0, Math.PI * 2);
        ctx.fillStyle = WARNA.gps;
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#fff';
        ctx.stroke();
      }
    };

    t.saatKetuk = (sx, sy) => {
      if (modePilih) return;
      const [a, b, c, d, e, f] = t.matriksLayar();
      const lay = (x: number, y: number): [number, number] => [
        a * x + c * y + e,
        b * x + d * y + f,
      ];
      let terbaik: Fitur | null = null;
      let jarakTerbaik = 24;

      for (const fi of fiturList) {
        if (fi.jenis !== 'titik') continue;
        const xy = getKoordHalaman(fi);
        const [px, py] = lay(xy[0], xy[1]);
        const jarak = Math.hypot(px - sx, py - 16 - sy);
        if (jarak < jarakTerbaik) {
          terbaik = fi;
          jarakTerbaik = jarak;
        }
      }

      if (terbaik) {
        onSelectFitur(terbaik);
        return;
      }

      jarakTerbaik = 14;
      for (const fi of fiturList) {
        if (fi.jenis !== 'jalur') continue;
        const xy = getKoordHalaman(fi);
        let [x0, y0] = lay(xy[0], xy[1]);
        for (let i = 2; i < xy.length; i += 2) {
          const [x1, y1] = lay(xy[i], xy[i + 1]);
          const jarak = jarakKeRuas(sx, sy, x0, y0, x1, y1);
          if (jarak < jarakTerbaik) {
            terbaik = fi;
            jarakTerbaik = jarak;
          }
          [x0, y0] = [x1, y1];
        }
      }

      if (terbaik) {
        onSelectFitur(terbaik);
      }
    };

    t.saatGeserManual = () => {
      setIkuti((prev) => {
        if (prev) return false;
        return prev;
      });
    };

    t.saatUbah = () => {
      if (!t.vp1) return;
      const [x, y] = t.dariLayar(t.lebar / 2, t.tinggi / 2);
      const geo = transformasi.keGeografis(x, y);
      setCenterCoords(geo);
    };

    t.gambar();
  }, [fiturList, posisi, modePilih, getKoordHalaman, transformasi, onSelectFitur]);

  // Handle position update following
  useEffect(() => {
    if (ikuti && posisi && tampilanRef.current) {
      const [x, y] = transformasi.keHalaman(posisi.lat, posisi.lon);
      tampilanRef.current.pusatkan(x, y);
    }
  }, [posisi, ikuti, transformasi]);

  const handleZoomIn = () => {
    const t = tampilanRef.current;
    if (t) t.zoomDi(t.lebar / 2, t.tinggi / 2, 1.6);
  };

  const handleZoomOut = () => {
    const t = tampilanRef.current;
    if (t) t.zoomDi(t.lebar / 2, t.tinggi / 2, 1 / 1.6);
  };

  const handleKeLokasiSaya = () => {
    const t = tampilanRef.current;
    if (!t) return;
    if (!posisi) {
      onToast(galatGps || 'Menunggu sinyal GPS…');
      return;
    }
    const vp = peta.georef.viewports[0];
    if (!diDalamBatas(vp, transformasi, posisi.lat, posisi.lon)) {
      const b = peta.batasGeo;
      const tengah = { lat: (b.utara + b.selatan) / 2, lon: (b.barat + b.timur) / 2 };
      const jarak = jarakMeter(posisi, tengah);
      onToast(`Posisi Anda di luar area peta ini (±${formatJarak(jarak)} dari tengah peta).`);
      return;
    }
    setIkuti(true);
    const [x, y] = transformasi.keHalaman(posisi.lat, posisi.lon);
    t.pusatkan(x, y, Math.max(t.zoom, t.zoomPas * 2));
  };

  const handleMarkAtCenter = () => {
    const t = tampilanRef.current;
    if (!t || !t.vp1) return;
    const [x, y] = t.dariLayar(t.lebar / 2, t.tinggi / 2);
    const geo = transformasi.keGeografis(x, y);
    setModePilih(false);
    onAddPoint(geo);
  };

  const handleMarkAtGps = () => {
    if (!posisi) return;
    const pt: Titik = {
      lat: posisi.lat,
      lon: posisi.lon,
      akurasi: Math.round(posisi.akurasi),
    };
    if (Number.isFinite(posisi.alt)) pt.alt = Math.round((posisi.alt as number) * 10) / 10;
    setModePilih(false);
    onAddPoint(pt);
  };

  // Location panel summary text
  const ketList: string[] = [];
  if (posisi) {
    ketList.push(`±${Math.round(posisi.akurasi)} m`);
    if (Number.isFinite(posisi.alt)) ketList.push(`tinggi ${Math.round(posisi.alt as number)} m`);
    const vp = peta.georef.viewports[0];
    if (!diDalamBatas(vp, transformasi, posisi.lat, posisi.lon)) {
      ketList.push('di luar area peta');
    }
  }

  return (
    <section id="layar-peta" className="layar aktif">
      <canvas id="kanvas-peta" ref={canvasRef} aria-label="Peta" />

      {/* Header */}
      <header className="kepala-peta">
        <button
          id="tombol-kembali"
          className="tombol-bulat"
          aria-label="Kembali ke daftar peta"
          onClick={onBack}
        >
          <Icon name="kembali" />
        </button>
        <div id="judul-peta" className="judul-peta">
          {peta.nama}
        </div>
        <button
          id="tombol-info-peta"
          className="tombol-bulat"
          aria-label="Info peta"
          onClick={onOpenInfo}
        >
          <Icon name="info" />
        </button>
      </header>

      {/* Panel Lokasi */}
      <div
        id="panel-lokasi"
        className={`panel-lokasi ${!posisi && galatGps ? 'galat' : ''}`}
        aria-live="polite"
      >
        {!posisi ? (
          <div className="keterangan">{galatGps || 'Menunggu sinyal GPS…'}</div>
        ) : (
          <>
            <div className="koordinat">{formatKoordinat(posisi.lat, posisi.lon, setelan.format)}</div>
            <div className="keterangan">{ketList.join(' · ')}</div>
          </>
        )}
      </div>

      {/* Kontrol Kanan */}
      <div className="kontrol-kanan">
        <button
          id="tombol-perbesar"
          className="tombol-bulat"
          aria-label="Perbesar"
          onClick={handleZoomIn}
        >
          <Icon name="tambah" />
        </button>
        <button
          id="tombol-perkecil"
          className="tombol-bulat"
          aria-label="Perkecil"
          onClick={handleZoomOut}
        >
          <Icon name="kurang" />
        </button>
        <button
          id="tombol-lokasi"
          className={`tombol-bulat ${ikuti ? 'aktif' : ''}`}
          aria-label="Ke lokasi saya"
          onClick={handleKeLokasiSaya}
        >
          <Icon name="lokasi" />
        </button>
      </div>

      {/* Crosshair indicator in selection mode */}
      {modePilih && <div id="silang" className="silang" />}

      {/* Bilah Pilih Titik */}
      {modePilih && (
        <div id="bilah-pilih" className="bilah-pilih">
          <p>
            Geser peta sampai tanda <strong>+</strong> tepat di lokasi, atau pakai posisi GPS.
          </p>
          <p id="pilih-koordinat" className="koordinat">
            {centerCoords
              ? formatKoordinat(centerCoords.lat, centerCoords.lon, setelan.format)
              : '…'}
          </p>
          <div className="aksi">
            <button
              id="pilih-batal"
              type="button"
              className="tombol sekunder"
              onClick={() => setModePilih(false)}
            >
              Batal
            </button>
            <button
              id="pilih-gps"
              type="button"
              className="tombol sekunder"
              disabled={!posisi}
              onClick={handleMarkAtGps}
            >
              Di GPS saya
            </button>
            <button
              id="pilih-tengah"
              type="button"
              className="tombol utama"
              onClick={handleMarkAtCenter}
            >
              Di tanda +
            </button>
          </div>
        </div>
      )}

      {/* Bilah Bawah (default) */}
      {!modePilih && (
        <footer id="bilah-bawah" className="bilah-bawah">
          <button
            id="tombol-tandai"
            className="tombol utama"
            onClick={() => setModePilih(true)}
          >
            <Icon name="titik" />
            <span>Tandai titik</span>
          </button>
          <button
            id="tombol-rekam"
            className={`tombol sekunder ${isMerekam ? 'merekam' : ''}`}
            aria-label={isMerekam ? 'Hentikan rekaman jalur' : 'Mulai rekam jalur'}
            onClick={onToggleRekam}
          >
            <Icon name={isMerekam ? 'henti' : 'rekam'} />
            <span>
              {isMerekam
                ? `${formatDurasi(durasiRekam)} · ${formatJarak(panjangRekam)}`
                : 'Rekam jalur'}
            </span>
          </button>
        </footer>
      )}
    </section>
  );
};
