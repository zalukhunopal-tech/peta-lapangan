import React, { useState, useEffect } from 'react';
import { FormatKoordinat, Setelan } from '../types';

interface DialogSetelanProps {
  setelan: Setelan;
  onSave: (setelan: Setelan) => void;
  onClose: () => void;
}

const formatUkuran = (b: number) =>
  b < 1048576
    ? `${Math.max(1, Math.round(b / 1024))} KB`
    : `${(b / 1048576).toFixed(1).replace('.', ',')} MB`;

export const DialogSetelan: React.FC<DialogSetelanProps> = ({ setelan, onSave, onClose }) => {
  const [format, setFormat] = useState<FormatKoordinat>(setelan.format);
  const [akurasiMaks, setAkurasiMaks] = useState<number>(setelan.akurasiMaks);
  const [storageInfo, setStorageInfo] = useState<string>('');

  useEffect(() => {
    navigator.storage?.estimate?.().then((est) => {
      if (est) {
        setStorageInfo(
          `Terpakai ${formatUkuran(est.usage || 0)} dari kuota ${formatUkuran(est.quota || 0)}.`
        );
      }
    }).catch(() => {});
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ format, akurasiMaks });
    onClose();
  };

  return (
    <dialog open className="lembar" style={{ display: 'block' }}>
      <form onSubmit={handleSubmit}>
        <h2>Setelan</h2>
        <fieldset>
          <legend>Format koordinat</legend>
          <label className="pilihan">
            <input
              type="radio"
              name="format"
              value="dd"
              checked={format === 'dd'}
              onChange={() => setFormat('dd')}
            />{' '}
            Desimal <small>3.584210, 116.630120</small>
          </label>
          <label className="pilihan">
            <input
              type="radio"
              name="format"
              value="dms"
              checked={format === 'dms'}
              onChange={() => setFormat('dms')}
            />{' '}
            Derajat, menit, detik <small>3°35'03,2" LU</small>
          </label>
          <label className="pilihan">
            <input
              type="radio"
              name="format"
              value="utm"
              checked={format === 'utm'}
              onChange={() => setFormat('utm')}
            />{' '}
            UTM <small>50N 459123 mT 396456 mU</small>
          </label>
        </fieldset>
        <label>
          Abaikan titik jalur yang akurasinya lebih buruk dari
          <select
            value={akurasiMaks}
            onChange={(e) => setAkurasiMaks(Number(e.target.value))}
          >
            <option value="10">10 m</option>
            <option value="20">20 m</option>
            <option value="30">30 m</option>
            <option value="50">50 m</option>
            <option value="100">100 m</option>
          </select>
        </label>
        <p className="info-kecil">
          Peta dan data hanya tersimpan di peramban HP ini. Ekspor data (KML/GPX) secara berkala
          sebagai cadangan.
        </p>
        {storageInfo && <p className="info-kecil">{storageInfo}</p>}
        <div className="aksi">
          <span className="spasi"></span>
          <button type="submit" className="tombol utama">
            Selesai
          </button>
        </div>
      </form>
    </dialog>
  );
};
