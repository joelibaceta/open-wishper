// Configuración por defecto — ÚNICO lugar que hay que editar para reutilizar
// la extensión con otro backend/dominio.
//
// Lo cargan tanto el content script (vía content_scripts en manifest.json)
// como el service worker (vía importScripts en background.js).
//
// La URL también se puede sobreescribir en runtime desde el popup
// (chrome.storage.local -> clave "backendUrl"), que tiene prioridad.
const PIXEL_TRACKER_DEFAULTS = {
  // Dominio del pixel/endpoints. Sin barra final.
  BACKEND_URL: 'https://px.groway.studio',
  // Cada cuánto consultamos el estado de apertura (ms).
  POLL_INTERVAL_MS: 30000,
};

// Exponerlo en el scope del service worker cuando se carga con importScripts.
if (typeof self !== 'undefined') {
  self.PIXEL_TRACKER_DEFAULTS = PIXEL_TRACKER_DEFAULTS;
}
