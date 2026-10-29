import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import '../css/app.css';

const rootEl = document.getElementById('root');
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch((e) => {
    console.warn('Service worker gagal didaftarkan', e);
  });
}
