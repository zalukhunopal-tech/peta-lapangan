// Penyimpanan lokal di IndexedDB: store "peta" (berkas PDF + georeferensi) dan "fitur" (titik/jalur).

const NAMA_DB = 'peta-lapangan';
const VERSI_DB = 1;
let koneksi = null;

function buka() {
  koneksi ??= new Promise((ok, gagal) => {
    const req = indexedDB.open(NAMA_DB, VERSI_DB);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains('peta')) d.createObjectStore('peta', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('fitur')) d.createObjectStore('fitur', { keyPath: 'id' });
    };
    req.onsuccess = () => ok(req.result);
    req.onerror = () => gagal(req.error);
  });
  return koneksi;
}

async function jalankan(store, mode, aksi) {
  const d = await buka();
  return new Promise((ok, gagal) => {
    const tx = d.transaction(store, mode);
    const req = aksi(tx.objectStore(store));
    tx.oncomplete = () => ok(req.result);
    tx.onerror = () => gagal(tx.error);
    tx.onabort = () => gagal(tx.error || new Error('Transaksi dibatalkan'));
  });
}

export const db = {
  semua: (store) => jalankan(store, 'readonly', (s) => s.getAll()),
  ambil: (store, id) => jalankan(store, 'readonly', (s) => s.get(id)),
  simpan: (store, obj) => jalankan(store, 'readwrite', (s) => s.put(obj)),
  hapus: (store, id) => jalankan(store, 'readwrite', (s) => s.delete(id)),
};
