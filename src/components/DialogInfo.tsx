import React from 'react';
import { PetaRecord, Transformasi } from '../types';

interface DialogInfoProps {
  peta: PetaRecord;
  tf: Transformasi;
  onDelete: (id: string) => void;
  onClose: () => void;
}

const NAMA_METODE = {
  'afin-proyeksi': 'Afin pada proyeksi peta (tepat)',
  'afin-geografis': 'Afin pada lintang/bujur (tepat)',
  homografi: 'Homografi dari titik kontrol (perkiraan)',
};

const formatUkuran = (b: number) =>
  b < 1048576
    ? `${Math.max(1, Math.round(b / 1024))} KB`
    : `${(b / 1048576).toFixed(1).replace('.', ',')} MB`;

export const DialogInfo: React.FC<DialogInfoProps> = ({ peta, tf, onDelete, onClose }) => {
  const b = peta.batasGeo;
  const baris: [string, string][] = [
    ['Berkas', peta.namaFile],
    ['Ukuran', formatUkuran(peta.ukuran)],
    ['Sistem koordinat', peta.crs],
    [
      'Format georeferensi',
      peta.georef.format === 'iso32000' ? 'ISO 32000 (GeoPDF)' : 'OGC LGIDict',
    ],
    ['Transformasi', NAMA_METODE[tf.metode] || tf.metode],
    ...(tf.sisaMeter != null
      ? [
          [
            'Selisih di titik kontrol',
            `${
              tf.sisaMeter < 0.01
                ? '< 0,01'
                : tf.sisaMeter.toFixed(2).replace('.', ',')
            } m`,
          ] as [string, string],
        ]
      : []),
    ['Batas lintang', `${b.selatan.toFixed(5)} s/d ${b.utara.toFixed(5)}`],
    ['Batas bujur', `${b.barat.toFixed(5)} s/d ${b.timur.toFixed(5)}`],
  ];

  const handleDelete = () => {
    if (confirm(`Hapus peta "${peta.nama}" dari HP ini? Titik dan jalur Anda tidak ikut terhapus.`)) {
      onDelete(peta.id);
    }
  };

  return (
    <dialog open className="lembar" style={{ display: 'block' }}>
      <form onSubmit={(e) => { e.preventDefault(); onClose(); }}>
        <h2>Info peta</h2>
        <dl className="info-daftar">
          {baris.map(([k, v], i) => (
            <React.Fragment key={i}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </React.Fragment>
          ))}
        </dl>
        <div className="aksi">
          <button type="button" className="tombol bahaya" onClick={handleDelete}>
            Hapus peta
          </button>
          <span className="spasi"></span>
          <button type="submit" className="tombol utama">
            Tutup
          </button>
        </div>
      </form>
    </dialog>
  );
};
