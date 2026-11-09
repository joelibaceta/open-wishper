const $ = (id) => document.getElementById(id);

async function load() {
  const { backendUrl } = await chrome.storage.local.get('backendUrl');
  if (backendUrl) {
    $('backend').value = backendUrl;
  } else {
    // Mostrar la URL efectiva (el default de defaults.js) en vez de dejar el
    // campo vacío con un placeholder confuso.
    const r = await new Promise((res) =>
      chrome.runtime.sendMessage({ type: 'getBackendUrl' }, res),
    );
    if (r?.url) $('backend').value = r.url;
  }
  await render();
}

async function render() {
  const res = await new Promise((r) =>
    chrome.runtime.sendMessage({ type: 'refreshStatus' }, r),
  );
  const messages = res?.messages || {};
  const list = $('list');
  const items = Object.values(messages).sort(
    (a, b) => (b.sentAt || 0) - (a.sentAt || 0),
  );

  if (items.length === 0) {
    list.innerHTML = '<div class="empty">Aún no has enviado correos trackeados.</div>';
    return;
  }

  list.innerHTML = '';
  for (const m of items) {
    const opened = m.status?.opened;
    const row = document.createElement('div');
    row.className = 'msg';
    row.innerHTML = `
      <div class="subj">
        ${escapeHtml(m.subject || '(sin asunto)')}
        <div class="to">${escapeHtml(m.to || '')}</div>
      </div>
      <span class="pill ${opened ? 'opened' : 'sent'}">
        ${opened ? `👁 ${m.status.count}` : '✓ enviado'}
      </span>`;
    row.title = opened
      ? `Último open: ${new Date(m.status.lastOpen).toLocaleString()}`
      : 'Aún no abierto';
    list.appendChild(row);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[c]);
}

$('save').addEventListener('click', async () => {
  const url = $('backend').value.trim().replace(/\/+$/, '');
  await chrome.storage.local.set({ backendUrl: url });
  $('saved').textContent = 'Guardado ✓';
  setTimeout(() => ($('saved').textContent = ''), 1500);
});

$('refresh').addEventListener('click', render);

load();
