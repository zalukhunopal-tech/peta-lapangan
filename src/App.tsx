import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import proj4 from 'proj4';
import { db } from './utils/db';
import {
  bacaGeoreferensi,
  pilihViewportUtama,
  buatTransformasi,
  batasGeo,
  namaCrs,
} from './utils/georef';
import { LayananGps } from './utils/gps';
import { PerekamJalur } from './utils/perekam';
import { formatKoordinat, formatJarak, panjangJalur } from './utils/coords';
import { keKML, keGPX, dariKML, dariGPX, buatId } from './utils/exporters';
import { Fitur, PetaRecord, PosisiGPS, Setelan, Titik, Transformasi } from './types';
import { Icon } from './components/Icons';
import { MapView } from './components/MapView';
import { DialogFitur } from './components/DialogFitur';
import { DialogInfo } from './components/DialogInfo';
import { DialogSetelan } from './components/DialogSetelan';

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/legacy/build/pdf.worker.mjs',
  import.meta.url
).toString();

const SETELAN_AWAL: Setelan = { format: 'dd', akurasiMaks: 30 };

function bacaJson<T>(kunci: string, awal: T): T {
  try {
    return { ...awal, ...JSON.parse(localStorage.getItem(kunci) || '{}') };
  } catch {
    return awal;
  }
}

function tulisJson<T>(kunci: string, nilai: T) {
  try {
    localStorage.setItem(kunci, JSON.stringify(nilai));
  } catch {
    // ignore
  }
}

const fmtTanggal = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const formatUkuran = (b: number) =>
  b < 1048576
    ? `${Math.max(1, Math.round(b / 1024))} KB`
    : `${(b / 1048576).toFixed(1).replace('.', ',')} MB`;

const dalamKotak = (b: { selatan: number; utara: number; barat: number; timur: number }, t: { lat: number; lon: number }) =>
  b && t.lat >= b.selatan && t.lat <= b.utara && t.lon >= b.barat && t.lon <= b.timur;

const stempel = () => new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');

export const App: React.FC = () => {
  const [screen, setScreen] = useState<'daftar' | 'peta'>('daftar');
  const [currentTab, setCurrentTab] = useState<'peta' | 'data'>('peta');
  const [petaList, setPetaList] = useState<PetaRecord[]>([]);
  const [fiturList, setFiturList] = useState<Fitur[]>([]);
  const [setelan, setSetelan] = useState<Setelan>(() => bacaJson('setelan', SETELAN_AWAL));

  const [activePeta, setActivePeta] = useState<PetaRecord | null>(null);
  const [activeDokumen, setActiveDokumen] = useState<any>(null);
  const [activeTransformasi, setActiveTransformasi] = useState<Transformasi | null>(null);
  const [initialCenter, setInitialCenter] = useState<Titik | null>(null);

  const [posisi, setPosisi] = useState<PosisiGPS | null>(null);
  const [galatGps, setGalatGps] = useState<string | null>(null);

  // Recorder state
  const [isMerekam, setIsMerekam] = useState(false);
  const [durasiRekam, setDurasiRekam] = useState(0);
  const [panjangRekam, setPanjangRekam] = useState(0);

  // Dialogs
  const [fiturDialog, setFiturDialog] = useState<{ fitur: Fitur; isBaru: boolean } | null>(null);
  const [infoDialog, setInfoDialog] = useState(false);
  const [setelanDialog, setSetelanDialog] = useState(false);

  // Loading & Toast
  const [memuatPesan, setMemuatPesan] = useState<string | null>(null);
  const [toastPesan, setToastPesan] = useState<string | null>(null);

  const gpsRef = useRef<LayananGps>(new LayananGps());
  const perekamRef = useRef<PerekamJalur>(new PerekamJalur());
  const fiturRekamRef = useRef<Fitur | null>(null);
  const wakeLockRef = useRef<any>(null);
  const timerRekamRef = useRef<any>(0);
  const timerSimpanRef = useRef<any>(0);
  const timerToastRef = useRef<any>(0);

  const toast = useCallback((pesan: string) => {
    setToastPesan(pesan);
    clearTimeout(timerToastRef.current);
    timerToastRef.current = setTimeout(() => setToastPesan(null), 4000);
  }, []);

  // Load initial data from IndexedDB
  useEffect(() => {
    (async () => {
      try {
        const [peta, fitur] = await Promise.all([
          db.semua<PetaRecord>('peta'),
          db.semua<Fitur>('fitur'),
        ]);
        setPetaList(peta);

        // Recover any unfinished recording
        const terputus = fitur.filter((f) => f.sedangDirekam);
        for (const f of terputus) {
          f.sedangDirekam = false;
          await db.simpan('fitur', f);
        }
        setFiturList(fitur);
        if (terputus.length) {
          toast(`${terputus.length} jalur yang rekamannya terputus sudah disimpan.`);
        }
      } catch (e: any) {
        console.error(e);
        toast(`Penyimpanan tidak bisa dibuka: ${e.message}`);
      }
    })();
  }, [toast]);

  // Handle browser back button
  useEffect(() => {
    const handlePopState = () => {
      if (screen === 'peta' && !history.state?.peta) {
        tutupPeta();
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [screen]);

  // GPS subscription for list or map
  useEffect(() => {
    const gps = gpsRef.current;
    gps.langganan(
      'app',
      (p) => {
        setPosisi(p);
        setGalatGps(null);
      },
      (err) => {
        setGalatGps(err);
      }
    );
    return () => {
      gps.berhenti('app');
    };
  }, []);

  // Screen wake lock when recording
  const requestWakeLock = async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await (navigator as any).wakeLock?.request('screen');
      }
    } catch {
      wakeLockRef.current = null;
    }
  };

  const releaseWakeLock = () => {
    wakeLockRef.current?.release().catch(() => {});
    wakeLockRef.current = null;
  };

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && isMerekam) {
        requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [isMerekam]);

  // Thumbnail generator
  const buatGambarKecil = async (bytes: Uint8Array, indeksHalaman: number): Promise<string> => {
    const dok = await pdfjsLib.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
    try {
      const hal = await dok.getPage(indeksHalaman + 1);
      const vp1 = hal.getViewport({ scale: 1 });
      const vp = hal.getViewport({ scale: 240 / Math.max(vp1.width, vp1.height) });
      const c = document.createElement('canvas');
      c.width = Math.ceil(vp.width);
      c.height = Math.ceil(vp.height);
      await hal.render({ canvasContext: c.getContext('2d')!, viewport: vp }).promise;
      return c.toDataURL('image/jpeg', 0.75);
    } finally {
      await dok.destroy();
    }
  };

  // Import GeoPDF
  const imporPeta = async (berkas: File) => {
    setMemuatPesan('Membaca georeferensi peta…');
    try {
      const bytes = new Uint8Array(await berkas.arrayBuffer());
      const info = await bacaGeoreferensi(bytes.slice());
      if (!info) {
        toast('Berkas ini tidak memiliki georeferensi, jadi bukan GeoPDF.');
        return;
      }
      const vp = pilihViewportUtama(info);
      const tf = buatTransformasi(vp, proj4);
      setMemuatPesan('Menyiapkan gambar kecil…');
      const rekaman: PetaRecord = {
        id: buatId(),
        nama: berkas.name.replace(/\.pdf$/i, ''),
        namaFile: berkas.name,
        ukuran: berkas.size,
        ditambahkan: new Date().toISOString(),
        berkas: new Blob([bytes], { type: 'application/pdf' }),
        georef: info,
        batasGeo: batasGeo(vp, tf),
        crs: namaCrs(vp.crs),
        gambarKecil: await buatGambarKecil(bytes, info.halaman),
      };
      await db.simpan('peta', rekaman);
      setPetaList((prev) => [rekaman, ...prev]);
      navigator.storage?.persist?.().catch(() => {});
      toast(`Peta "${rekaman.nama}" ditambahkan.`);
    } catch (e: any) {
      console.error(e);
      toast(`Gagal membaca peta: ${e.message}`);
    } finally {
      setMemuatPesan(null);
    }
  };

  // Open map
  const bukaPeta = async (id: string, opts: { pusat?: Titik | null } = {}) => {
    const rekaman = petaList.find((p) => p.id === id);
    if (!rekaman) return;

    setMemuatPesan('Membuka peta…');
    try {
      if (activeDokumen) {
        await activeDokumen.destroy();
      }
      const data = new Uint8Array(await rekaman.berkas.arrayBuffer());
      const dokumen = await pdfjsLib.getDocument({ data, isEvalSupported: false }).promise;
      const vp = pilihViewportUtama(rekaman.georef);
      const tf = buatTransformasi(vp, proj4);

      setActivePeta(rekaman);
      setActiveDokumen(dokumen);
      setActiveTransformasi(tf);
      setInitialCenter(opts.pusat || null);
      setScreen('peta');

      if (!history.state?.peta) {
        history.pushState({ peta: id }, '');
      }
    } catch (e: any) {
      console.error(e);
      toast(`Gagal membuka peta: ${e.message}`);
      await tutupPeta();
    } finally {
      setMemuatPesan(null);
    }
  };

  const tutupPeta = async () => {
    if (activeDokumen) {
      try {
        await activeDokumen.destroy();
      } catch {
        // ignore
      }
    }
    setActivePeta(null);
    setActiveDokumen(null);
    setActiveTransformasi(null);
    setInitialCenter(null);
    setScreen('daftar');
  };

  const kembaliKeDaftar = () => {
    if (history.state?.peta) {
      history.back();
    } else {
      tutupPeta();
    }
  };

  // Delete map
  const hapusPeta = async (id: string) => {
    await db.hapus('peta', id);
    setPetaList((prev) => prev.filter((p) => p.id !== id));
    setInfoDialog(false);
    kembaliKeDaftar();
    toast('Peta dihapus.');
  };

  // Recorder functions
  const mulaiRekam = async () => {
    if (!('geolocation' in navigator)) {
      toast('GPS tidak tersedia di perangkat ini.');
      return;
    }
    const perekam = perekamRef.current;
    perekam.akurasiMaks = Number(setelan.akurasiMaks);
    perekam.mulai();

    const sekarang = new Date();
    const fitur: Fitur = {
      id: buatId(),
      jenis: 'jalur',
      nama: `Jalur ${sekarang.toLocaleDateString('id-ID')} ${sekarang.toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
      })}`,
      catatan: '',
      dibuat: sekarang.toISOString(),
      titik: perekam.titik,
      sedangDirekam: true,
    };
    fiturRekamRef.current = fitur;

    setFiturList((prev) => [...prev, fitur]);
    await db.simpan('fitur', fitur);

    gpsRef.current.langganan('rekam', (pos) => {
      if (perekam.tambah(pos)) {
        if (!timerSimpanRef.current) {
          timerSimpanRef.current = setTimeout(async () => {
            timerSimpanRef.current = 0;
            if (fiturRekamRef.current) {
              await db.simpan('fitur', fiturRekamRef.current);
            }
          }, 5000);
        }
        setPanjangRekam(perekam.panjang);
      }
    });

    await requestWakeLock();
    setIsMerekam(true);
    setDurasiRekam(0);
    setPanjangRekam(0);

    clearInterval(timerRekamRef.current);
    timerRekamRef.current = setInterval(() => {
      setDurasiRekam(perekam.durasi);
      setPanjangRekam(perekam.panjang);
    }, 1000);

    toast('Merekam jalur. Biarkan layar tetap menyala.');
  };

  const hentikanRekam = async () => {
    const f = fiturRekamRef.current;
    if (!f) return;

    gpsRef.current.berhenti('rekam');
    clearInterval(timerRekamRef.current);
    clearTimeout(timerSimpanRef.current);
    timerSimpanRef.current = 0;

    const perekam = perekamRef.current;
    perekam.berhenti();
    releaseWakeLock();

    fiturRekamRef.current = null;
    setIsMerekam(false);
    f.sedangDirekam = false;

    if (f.titik.length < 2) {
      await db.hapus('fitur', f.id);
      setFiturList((prev) => prev.filter((x) => x.id !== f.id));
      toast('Jalur terlalu pendek, tidak disimpan.');
    } else {
      await db.simpan('fitur', f);
      setFiturList((prev) => prev.map((x) => (x.id === f.id ? { ...f } : x)));
      setFiturDialog({ fitur: f, isBaru: true });
    }
  };

  const toggleRekam = () => {
    if (isMerekam) {
      hentikanRekam();
    } else {
      mulaiRekam();
    }
  };

  // Add Point
  const handleAddPoint = (titik: Titik) => {
    const nomor = fiturList.filter((f) => f.jenis === 'titik').length + 1;
    const f: Fitur = {
      id: buatId(),
      jenis: 'titik',
      nama: `Titik ${nomor}`,
      catatan: '',
      dibuat: new Date().toISOString(),
      titik: [titik],
    };
    setFiturDialog({ fitur: f, isBaru: true });
  };

  // Save / Delete from DialogFitur
  const handleSaveFitur = async (nama: string, catatan: string) => {
    if (!fiturDialog) return;
    const { fitur, isBaru } = fiturDialog;
    const updated: Fitur = { ...fitur, nama, catatan };

    await db.simpan('fitur', updated);
    setFiturList((prev) => {
      const exists = prev.some((x) => x.id === updated.id);
      return exists ? prev.map((x) => (x.id === updated.id ? updated : x)) : [...prev, updated];
    });

    setFiturDialog(null);
    toast(isBaru ? `"${updated.nama}" disimpan.` : 'Perubahan disimpan.');
  };

  const handleDeleteFitur = async (id: string) => {
    const f = fiturList.find((x) => x.id === id);
    if (!f) return;
    if (!confirm(`Hapus "${f.nama}"? Tindakan ini tidak bisa dibatalkan.`)) return;

    await db.hapus('fitur', id);
    setFiturList((prev) => prev.filter((x) => x.id !== id));
    setFiturDialog(null);
    toast(`"${f.nama}" dihapus.`);
  };

  const handleViewOnMap = async (f: Fitur) => {
    setFiturDialog(null);
    const t = f.titik[0];
    const cocok = petaList.filter((p) => dalamKotak(p.batasGeo, t));
    if (!cocok.length) {
      toast('Belum ada peta yang mencakup lokasi ini.');
      return;
    }
    await bukaPeta(cocok[0].id, { pusat: t });
  };

  // Download helper
  const unduh = (nama: string, isi: string, tipe: string) => {
    const url = URL.createObjectURL(new Blob([isi], { type: tipe }));
    const a = document.createElement('a');
    a.href = url;
    a.download = nama;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  // Export
  const handleExport = (format: 'kml' | 'gpx') => {
    if (!fiturList.length) {
      toast('Belum ada data untuk diekspor.');
      return;
    }
    if (format === 'kml') {
      unduh(`peta-lapangan-${stempel()}.kml`, keKML(fiturList), 'application/vnd.google-earth.kml+xml');
    } else {
      unduh(`peta-lapangan-${stempel()}.gpx`, keGPX(fiturList), 'application/gpx+xml');
    }
  };

  // Import KML / GPX
  const handleImportData = async (berkas: File) => {
    try {
      const isi = await berkas.text();
      const gpx = berkas.name.toLowerCase().endsWith('.gpx') || /<gpx[\s>]/.test(isi);
      const imported = gpx ? dariGPX(isi) : dariKML(isi);
      if (!imported.length) {
        toast('Tidak ada titik atau jalur di berkas ini.');
        return;
      }
      for (const f of imported) {
        await db.simpan('fitur', f);
      }
      setFiturList((prev) => [...prev, ...imported]);
      toast(`${imported.length} titik/jalur diimpor.`);
    } catch (e: any) {
      toast(`Gagal mengimpor: ${e.message}`);
    }
  };

  // Load sample map
  const handleLoadSample = async () => {
    setMemuatPesan('Mengambil peta contoh…');
    try {
      const r = await fetch('/contoh/contoh-peta.pdf');
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await imporPeta(
        new File([await r.blob()], 'Peta contoh (fiktif).pdf', { type: 'application/pdf' })
      );
    } catch (e: any) {
      setMemuatPesan(null);
      toast(`Gagal mengambil peta contoh: ${e.message}`);
    }
  };

  // Sort lists
  const sortedPeta = [...petaList].sort((a, b) => b.ditambahkan.localeCompare(a.ditambahkan));
  const sortedFitur = [...fiturList].sort((a, b) => b.dibuat.localeCompare(a.dibuat));

  return (
    <>
      {/* SCREEN: DAFTAR */}
      {screen === 'daftar' && (
        <section id="layar-daftar" className="layar aktif">
          <header className="kepala">
            <Icon name="peta" className="ikon logo" />
            <h1>Peta Lapangan</h1>

            {isMerekam && (
              <button
                id="indikator-rekam"
                className="indikator-rekam"
                onClick={() => {
                  if (confirm('Hentikan rekaman jalur?')) hentikanRekam();
                }}
              >
                <Icon name="henti" className="ikon" />
                <span>{`Rekam ${formatJarak(panjangRekam)}`}</span>
              </button>
            )}

            <button
              id="tombol-setelan"
              className="tombol-ikon"
              aria-label="Setelan"
              onClick={() => setSetelanDialog(true)}
            >
              <Icon name="setelan" />
            </button>
          </header>

          <nav className="tab" role="tablist">
            <button
              role="tab"
              data-tab="peta"
              aria-selected={currentTab === 'peta'}
              onClick={() => setCurrentTab('peta')}
            >
              Peta
            </button>
            <button
              role="tab"
              data-tab="data"
              aria-selected={currentTab === 'data'}
              onClick={() => setCurrentTab('data')}
            >
              Data lapangan
            </button>
          </nav>

          {/* TAB: PETA */}
          {currentTab === 'peta' && (
            <div id="tab-peta" className="isi-tab">
              {sortedPeta.length > 0 ? (
                <ul id="daftar-peta" className="daftar">
                  {sortedPeta.map((p) => {
                    const isHere = posisi && dalamKotak(p.batasGeo, posisi);
                    return (
                      <li key={p.id}>
                        <button className="kartu" onClick={() => bukaPeta(p.id)}>
                          <img src={p.gambarKecil} alt="" className="gambar-kecil" />
                          <span className="teks">
                            <strong>{p.nama}</strong>
                            <small>
                              {formatUkuran(p.ukuran)} · {fmtTanggal.format(new Date(p.ditambahkan))}
                            </small>
                            {isHere && <span className="lencana">Anda di area peta ini</span>}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div id="kosong-peta" className="kosong">
                  <Icon name="peta" className="ikon besar" />
                  <p>
                    <strong>Belum ada peta.</strong>
                    <br />
                    Impor berkas GeoPDF dari HP Anda. Setelah diimpor, peta bisa dibuka tanpa internet.
                  </p>
                  <button
                    id="tombol-contoh"
                    type="button"
                    className="tombol sekunder"
                    onClick={handleLoadSample}
                  >
                    Coba dengan peta contoh
                  </button>
                </div>
              )}

              <label className="fab" id="tombol-impor">
                <Icon name="tambah" />
                Impor peta
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) imporPeta(file);
                  }}
                />
              </label>
            </div>
          )}

          {/* TAB: DATA LAPANGAN */}
          {currentTab === 'data' && (
            <div id="tab-data" className="isi-tab">
              <div className="aksi-data">
                <button
                  id="tombol-ekspor-kml"
                  className="tombol sekunder"
                  onClick={() => handleExport('kml')}
                >
                  <Icon name="unduh" />
                  KML
                </button>
                <button
                  id="tombol-ekspor-gpx"
                  className="tombol sekunder"
                  onClick={() => handleExport('gpx')}
                >
                  <Icon name="unduh" />
                  GPX
                </button>
                <label className="tombol sekunder">
                  <Icon name="unggah" />
                  Impor
                  <input
                    type="file"
                    id="masukan-data"
                    accept=".kml,.gpx,application/vnd.google-earth.kml+xml,application/gpx+xml,text/xml"
                    hidden
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (file) handleImportData(file);
                    }}
                  />
                </label>
              </div>

              {sortedFitur.length > 0 ? (
                <ul id="daftar-fitur" className="daftar">
                  {sortedFitur.map((f) => {
                    const ringkas =
                      f.jenis === 'titik'
                        ? `${formatKoordinat(f.titik[0].lat, f.titik[0].lon, setelan.format)}${
                            f.titik[0].akurasi ? ` · ±${Math.round(f.titik[0].akurasi)} m` : ''
                          }`
                        : `${formatJarak(panjangJalur(f.titik))} · ${f.titik.length} titik`;

                    return (
                      <li key={f.id}>
                        <button
                          className="kartu"
                          onClick={() => setFiturDialog({ fitur: f, isBaru: false })}
                        >
                          <span className={`ikon-fitur ${f.jenis}`}>
                            <Icon name={f.jenis} />
                          </span>
                          <span className="teks">
                            <strong>{f.nama}</strong>
                            <small>{ringkas}</small>
                            <small>
                              {f.sedangDirekam
                                ? 'Sedang direkam…'
                                : fmtTanggal.format(new Date(f.dibuat))}
                            </small>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p id="kosong-fitur" className="kosong">
                  Belum ada titik atau jalur. Buka sebuah peta untuk menandai titik atau merekam jalur.
                </p>
              )}
            </div>
          )}
        </section>
      )}

      {/* SCREEN: PETA */}
      {screen === 'peta' && activePeta && activeDokumen && activeTransformasi && (
        <MapView
          peta={activePeta}
          dokumen={activeDokumen}
          transformasi={activeTransformasi}
          fiturList={fiturList}
          posisi={posisi}
          galatGps={galatGps}
          isMerekam={isMerekam}
          durasiRekam={durasiRekam}
          panjangRekam={panjangRekam}
          setelan={setelan}
          initialCenter={initialCenter}
          onBack={kembaliKeDaftar}
          onOpenInfo={() => setInfoDialog(true)}
          onToggleRekam={toggleRekam}
          onSelectFitur={(f) => setFiturDialog({ fitur: f, isBaru: false })}
          onAddPoint={handleAddPoint}
          onToast={toast}
        />
      )}

      {/* DIALOG FITUR */}
      {fiturDialog && (
        <DialogFitur
          fitur={fiturDialog.fitur}
          isBaru={fiturDialog.isBaru}
          hasActiveMap={screen === 'peta'}
          formatCoord={setelan.format}
          onSave={handleSaveFitur}
          onDelete={handleDeleteFitur}
          onViewOnMap={handleViewOnMap}
          onClose={() => setFiturDialog(null)}
        />
      )}

      {/* DIALOG INFO PETA */}
      {infoDialog && activePeta && activeTransformasi && (
        <DialogInfo
          peta={activePeta}
          tf={activeTransformasi}
          onDelete={hapusPeta}
          onClose={() => setInfoDialog(false)}
        />
      )}

      {/* DIALOG SETELAN */}
      {setelanDialog && (
        <DialogSetelan
          setelan={setelan}
          onSave={(newSetelan) => {
            setSetelan(newSetelan);
            tulisJson('setelan', newSetelan);
          }}
          onClose={() => setSetelanDialog(false)}
        />
      )}

      {/* MEMUAT OVERLAY */}
      {memuatPesan && (
        <div id="memuat" className="memuat">
          <div className="pemutar" />
          <p id="memuat-teks">{memuatPesan}</p>
        </div>
      )}

      {/* TOAST NOTIFICATION */}
      {toastPesan && (
        <div id="toast" className="toast tampil" role="status" aria-live="polite">
          {toastPesan}
        </div>
      )}
    </>
  );
};
