// Content script para Gmail.
//  1. Detecta cuando se abre el editor de redacción.
//  2. Genera un id único por mensaje.
//  3. Inyecta el tracking pixel en el cuerpo al enviar.
//  4. Registra id + metadatos en el backend (vía background).
//  5/6. Consulta estado y pinta indicadores en la lista y en el hilo.

(() => {
  const CFG = (typeof PIXEL_TRACKER_DEFAULTS !== 'undefined' && PIXEL_TRACKER_DEFAULTS) || {
    BACKEND_URL: '',
    POLL_INTERVAL_MS: 30000,
  };

  let backendUrl = CFG.BACKEND_URL;

  // --- utilidades --------------------------------------------------------
  const log = (...a) => console.log('[PixelTracker]', ...a);

  const normalizeSubject = (s) =>
    (s || '')
      .replace(/^\s*(re|rv|fwd|fw)\s*:\s*/i, '') // quita prefijos de reply/forward
      .trim()
      .toLowerCase();

  function sendToBackground(type, payload) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type, payload }, (res) => resolve(res));
    });
  }

  // --- 1 + 2: detectar compose y preparar id -----------------------------
  // Sube hasta la ventana de compose: el ancestro más bajo que contiene A LA VEZ
  // el asunto y el cuerpo editable. Exigir ambos evita devolver un contenedor
  // demasiado alto (que incluiría la lista del inbox y sus direcciones).
  function findComposeRoot(fromEl) {
    let el = fromEl;
    for (let i = 0; i < 20 && el; i++) {
      if (el.querySelector) {
        const body = el.querySelector(
          'div[g_editable="true"], div[aria-label="Message Body"], div[contenteditable="true"][role="textbox"]',
        );
        const subject = el.querySelector('input[name="subjectbox"]');
        if (body && subject) return { root: el, body, subject };
      }
      el = el.parentElement;
    }
    return null;
  }

  function collectRecipients(root) {
    const emails = new Set();
    root
      .querySelectorAll('[email]')
      .forEach((n) => {
        const e = n.getAttribute('email');
        if (e) emails.add(e);
      });
    return [...emails].join(', ');
  }

  // --- 3 + 4: inyectar pixel y registrar ---------------------------------
  async function injectPixelAndRegister(sendButton) {
    const found = findComposeRoot(sendButton);
    if (!found) {
      log('no se encontró el compose asociado al botón Enviar');
      return;
    }
    const { root, body, subject } = found;

    // Evita doble inyección si se disparan mousedown + click.
    if (body.dataset.pixelInjected === '1') return;
    body.dataset.pixelInjected = '1';

    const id = crypto.randomUUID();
    const subjectText = (subject && subject.value) || '';
    const to = collectRecipients(root);

    // Inserta el pixel como último hijo del cuerpo.
    const img = document.createElement('img');
    img.src = `${backendUrl.replace(/\/+$/, '')}/px/${id}.gif`;
    img.width = 1;
    img.height = 1;
    img.alt = '';
    img.setAttribute('style', 'width:1px;height:1px;border:0;opacity:0;');
    body.appendChild(img);

    log('pixel inyectado', { id, subject: subjectText, to });

    await sendToBackground('register', {
      id,
      subject: subjectText,
      to,
      sentAt: Date.now(),
    });
  }

  // Detectamos el envío en fase de captura (antes de que Gmail serialice el
  // correo), tanto por click en "Enviar" como por Ctrl/⌘+Enter.
  // El botón real "Enviar" de Gmail tiene la clase .aoO (independiente del
  // idioma). NO usamos aria-label^="Enviar"/"Send" porque hay un wrapper externo
  // con ese label ("Enviar correo electrónico") que nos llevaría al contenedor
  // equivocado. data-tooltip queda como fallback para otras variantes.
  function isSendButton(el) {
    return (
      el.closest?.(
        'div[role="button"].aoO, ' +
          'div[role="button"][data-tooltip^="Send"], ' +
          'div[role="button"][data-tooltip^="Enviar"]',
      ) || null
    );
  }

  document.addEventListener(
    'click',
    (e) => {
      const btn = isSendButton(e.target);
      if (btn) injectPixelAndRegister(btn);
    },
    true,
  );

  document.addEventListener(
    'keydown',
    (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        const found = findComposeRoot(e.target);
        if (found) injectPixelAndRegister(found.body);
      }
    },
    true,
  );

  // --- 5 + 6: estado e indicadores ---------------------------------------
  let trackedBySubject = new Map(); // normSubject -> status

  async function refreshAndRender() {
    const res = await sendToBackground('refreshStatus');
    const messages = res?.messages || {};
    trackedBySubject = new Map();
    for (const m of Object.values(messages)) {
      const key = normalizeSubject(m.subject);
      if (!key) continue;
      const prev = trackedBySubject.get(key);
      // Si hay varios con el mismo asunto, nos quedamos con el "más abierto".
      if (!prev || (m.status?.count || 0) > (prev.count || 0)) {
        trackedBySubject.set(key, m.status || {});
      }
    }
    renderIndicators();
  }

  function badge(status) {
    const el = document.createElement('span');
    el.className = 'pt-badge';
    if (status?.opened) {
      el.classList.add('pt-opened');
      el.title = `Abierto ${status.count} vez(es) · último: ${
        status.lastOpen ? new Date(status.lastOpen).toLocaleString() : '—'
      }`;
      el.textContent = '👁';
    } else {
      el.classList.add('pt-sent');
      el.title = 'Enviado · aún no abierto';
      el.textContent = '✓';
    }
    return el;
  }

  function renderIndicators() {
    // Indicador en la lista de hilos: filas tr.zA, asunto en .bog / .bqe.
    document.querySelectorAll('tr.zA').forEach((row) => {
      const subjEl = row.querySelector('.bog, .bqe');
      if (!subjEl) return;
      const key = normalizeSubject(subjEl.textContent);
      const status = trackedBySubject.get(key);
      const existing = row.querySelector('.pt-badge');
      if (!status) {
        existing?.remove();
        return;
      }
      if (existing) existing.replaceWith(badge(status));
      else subjEl.parentElement.appendChild(badge(status));
    });

    // Indicador dentro del hilo abierto: asunto en h2.hP.
    const threadSubj = document.querySelector('h2.hP');
    if (threadSubj) {
      const key = normalizeSubject(threadSubj.textContent);
      const status = trackedBySubject.get(key);
      const existing = threadSubj.parentElement.querySelector('.pt-badge-thread');
      existing?.remove();
      if (status) {
        const b = badge(status);
        b.classList.add('pt-badge-thread');
        threadSubj.parentElement.appendChild(b);
      }
    }
  }

  // Re-render cuando cambia el DOM de Gmail (navegación entre vistas).
  const mo = new MutationObserver(() => {
    clearTimeout(mo._t);
    mo._t = setTimeout(renderIndicators, 300);
  });
  mo.observe(document.body, { childList: true, subtree: true });

  // --- arranque ----------------------------------------------------------
  (async () => {
    const r = await sendToBackground('getBackendUrl');
    if (r?.url) backendUrl = r.url;
    log('activo. backend:', backendUrl);
    refreshAndRender();
    setInterval(refreshAndRender, CFG.POLL_INTERVAL_MS);
  })();
})();
