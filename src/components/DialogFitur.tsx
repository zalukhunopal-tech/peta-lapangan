import React, { useState, useEffect } from 'react';
import { Fitur } from '../types';
import { formatKoordinat, formatJarak, panjangJalur } from '../utils/coords';

interface DialogFiturProps {
  fitur: Fitur | null;
  isBaru: boolean;
  hasActiveMap: boolean;
  formatCoord: 'dd' | 'dms' | 'utm';
  onSave: (nama: string, catatan: string) => void;
  onDelete: (id: string) => void;
  onViewOnMap: (fitur: Fitur) => void;
  onClose: () => void;
}

export const DialogFitur: React.FC<DialogFiturProps> = ({
  fitur,
  isBaru,
  hasActiveMap,
  formatCoord,
  onSave,
  onDelete,
  onViewOnMap,
  onClose,
}) => {
  const [nama, setNama] = useState('');
  const [catatan, setCatatan] = useState('');

  useEffect(() => {
    if (fitur) {
      setNama(fitur.nama);
      setCatatan(fitur.catatan || '');
    }
  }, [fitur]);

  if (!fitur) return null;

  const fmtTanggal = new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const tanggalStr = fmtTanggal.format(new Date(fitur.dibuat));

  const ringkas =
    fitur.jenis === 'titik'
      ? `${formatKoordinat(fitur.titik[0].lat, fitur.titik[0].lon, formatCoord)}${
          fitur.titik[0].akurasi ? ` · ±${Math.round(fitur.titik[0].akurasi)} m` : ''
        }`
      : `${formatJarak(panjangJalur(fitur.titik))} · ${fitur.titik.length} titik`;

  const jenis = fitur.jenis === 'titik' ? 'titik' : 'jalur';
  const judul = isBaru
    ? jenis === 'titik'
      ? 'Titik baru'
      : 'Simpan jalur'
    : jenis === 'titik'
    ? 'Titik'
    : 'Jalur';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(nama.trim() || fitur.nama, catatan.trim());
  };

  return (
    <dialog open className="lembar" style={{ display: 'block' }}>
      <form onSubmit={handleSubmit}>
        <h2>{judul}</h2>
        <label>
          Nama{' '}
          <input
            value={nama}
            onChange={(e) => setNama(e.target.value)}
            maxLength={120}
            autoComplete="off"
            required
            autoFocus
          />
        </label>
        <label>
          Catatan{' '}
          <textarea
            value={catatan}
            onChange={(e) => setCatatan(e.target.value)}
            rows={3}
          />
        </label>
        <p className="info-kecil">
          {ringkas} · {tanggalStr}
        </p>
        <div className="aksi">
          <button type="submit" className="tombol utama">
            Simpan
          </button>
          {!isBaru && !fitur.sedangDirekam && (
            <button
              type="button"
              className="tombol bahaya"
              onClick={() => onDelete(fitur.id)}
            >
              Hapus
            </button>
          )}
          {!isBaru && !hasActiveMap && (
            <button
              type="button"
              className="tombol sekunder"
              onClick={() => onViewOnMap(fitur)}
            >
              Lihat di peta
            </button>
          )}
          <span className="spasi"></span>
          <button type="button" className="tombol sekunder" onClick={onClose}>
            Tutup
          </button>
        </div>
      </form>
    </dialog>
  );
};
