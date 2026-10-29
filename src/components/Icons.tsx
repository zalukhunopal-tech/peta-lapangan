import React from 'react';

interface IconProps extends React.SVGProps<SVGSVGElement> {
  className?: string;
  name:
    | 'kembali'
    | 'info'
    | 'setelan'
    | 'tambah'
    | 'kurang'
    | 'lokasi'
    | 'titik'
    | 'jalur'
    | 'rekam'
    | 'henti'
    | 'unduh'
    | 'unggah'
    | 'peta';
}

export const Icon: React.FC<IconProps> = ({ name, className = 'ikon', ...props }) => {
  return (
    <svg className={className} aria-hidden="true" viewBox="0 0 24 24" {...props}>
      {name === 'kembali' && <path d="M15 5l-7 7 7 7" />}
      {name === 'info' && (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v6" />
          <path d="M12 7.5v.01" />
        </>
      )}
      {name === 'setelan' && (
        <>
          <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
          <circle cx="15" cy="7" r="2" />
          <circle cx="9" cy="17" r="2" />
        </>
      )}
      {name === 'tambah' && <path d="M12 5v14M5 12h14" />}
      {name === 'kurang' && <path d="M5 12h14" />}
      {name === 'lokasi' && (
        <>
          <circle cx="12" cy="12" r="7" />
          <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
        </>
      )}
      {name === 'titik' && (
        <>
          <path d="M12 21s-6.5-5.7-6.5-11.2a6.5 6.5 0 0 1 13 0C18.5 15.3 12 21 12 21z" />
          <circle cx="12" cy="9.8" r="2.3" />
        </>
      )}
      {name === 'jalur' && (
        <>
          <path d="M5 18c2.5-5 5.5 1 8.5-4.5S17 6 19 6" />
          <circle cx="5" cy="18" r="2" />
          <circle cx="19" cy="6" r="2" />
        </>
      )}
      {name === 'rekam' && <circle cx="12" cy="12" r="6" fill="currentColor" stroke="none" />}
      {name === 'henti' && <rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" stroke="none" />}
      {name === 'unduh' && <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />}
      {name === 'unggah' && <path d="M12 20V9M7 14l5-5 5 5M5 4h14" />}
      {name === 'peta' && (
        <>
          <path d="M3 6.5l6-3 6 3 6-3v14l-6 3-6-3-6 3z" />
          <path d="M9 3.5v14M15 6.5v14" />
        </>
      )}
    </svg>
  );
};
