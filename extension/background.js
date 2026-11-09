// Service worker: único punto que habla con el backend.
// Mantiene la URL del backend fuera del content script y evita problemas
// de CORS/mixed-content haciendo los fetch desde aquí.

importScripts('defaults.js');
const DEFAULT_BACKEND_URL = PIXEL_TRACKER_DEFAULTS.BACKEND_URL;

async function getBackendUrl() {
  const { backendUrl } = await chrome.storage.local.get('backendUrl');
  return (backendUrl || DEFAULT_BACKEND_URL).replace(/\/+$/, '');
}

// Guarda el mensaje trackeado localmente (para popup + indicadores) y lo
// registra en el backend.
async function registerMessage(msg) {
  const base = await getBackendUrl();

  // Asunto y destinatarios se guardan SOLO aquí (local). Nunca salen del
  // navegador: el backend únicamente recibe el id aleatorio.
  const { messages = {} } = await chrome.storage.local.get('messages');
  messages[msg.id] = {
    ...msg,
    status: { opened: false, count: 0, firstOpen: null, lastOpen: null },
  };
  await chrome.storage.local.set({ messages });

  try {
    const res = await fetch(`${base}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: msg.id }), // minimal: solo el id
    });
    return { ok: res.ok };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// Consulta el estado de apertura de todos los mensajes trackeados y
// actualiza el storage local.
async function refreshStatus() {
  const base = await getBackendUrl();
  const { messages = {} } = await chrome.storage.local.get('messages');
  const ids = Object.keys(messages);
  if (ids.length === 0) return messages;

  try {
    const res = await fetch(`${base}/status?ids=${encodeURIComponent(ids.join(','))}`);
    if (!res.ok) return messages;
    const statuses = await res.json();
    for (const id of ids) {
      if (statuses[id]) messages[id].status = statuses[id];
    }
    await chrome.storage.local.set({ messages });
  } catch {
    // backend caído: devolvemos lo que tenemos
  }
  return messages;
}

// Avisa al backend que el propio remitente está viendo este correo, para que
// no cuente esa carga del pixel como una apertura real del destinatario.
async function selfView(id) {
  if (!id) return { ok: false };
  const base = await getBackendUrl();
  try {
    const res = await fetch(`${base}/self-view`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    return { ok: res.ok };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

chrome.runtime.onMessage.addListener((req, _sender, sendResponse) => {
  (async () => {
    switch (req?.type) {
      case 'register':
        sendResponse(await registerMessage(req.payload));
        break;
      case 'refreshStatus':
        sendResponse({ messages: await refreshStatus() });
        break;
      case 'getBackendUrl':
        sendResponse({ url: await getBackendUrl() });
        break;
      case 'selfView':
        sendResponse(await selfView(req.payload?.id));
        break;
      default:
        sendResponse({ error: 'unknown message type' });
    }
  })();
  return true; // respuesta asíncrona
});

// Refresco periódico en background.
chrome.alarms?.create('refreshStatus', { periodInMinutes: 1 });
chrome.alarms?.onAlarm.addListener((a) => {
  if (a.name === 'refreshStatus') refreshStatus();
});
