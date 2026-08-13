import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Registrar Service Worker para PWA con actualización automática de versión
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => {
        console.log('🚀 Service Worker registrado con éxito:', reg.scope);
        
        // Forzar verificación inmediata de nueva versión
        reg.update();

        reg.onupdatefound = () => {
          const installingWorker = reg.installing;
          if (installingWorker) {
            installingWorker.onstatechange = () => {
              if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                console.log('🔄 Nueva versión detectada. Actualizando la aplicación...');
                // Recargar automáticamente para cargar la última versión
                window.location.reload();
              }
            };
          }
        };
      })
      .catch((err) => console.error('❌ Error al registrar el Service Worker:', err));
  });
}
