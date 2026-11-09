// Pixel Tracker backend — Cloudflare Worker
//
// Endpoints:
//   POST /register        { id, subject, to, sentAt }  -> guarda metadatos
//   GET  /px/:id.gif                                    -> sirve gif 1x1 y loguea open
//   GET  /status?ids=a,b,c                              -> estado de open por id
//
// Storage: Workers KV (binding "TRACKER", ver wrangler.toml)

// GIF transparente 1x1 (43 bytes)
const PIXEL = Uint8Array.from(
  atob('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'),
  (c) => c.charCodeAt(0),
);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Ventana para considerar una apertura como "auto-vista" del propio remitente.
// Si el remitente abre su correo (la extensión avisa con /self-view), las
// aperturas dentro de ±esta ventana se marcan self:true y no cuentan.
const SELF_VIEW_WINDOW_MS = 60000;

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS, ...extraHeaders },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    // --- POST /register ----------------------------------------------------
    // Diseño minimal: el backend SOLO guarda el id aleatorio y las aperturas.
    // Nunca recibe ni almacena asunto, destinatarios ni remitente: esos datos
    // viven únicamente en el navegador (chrome.storage.local).
    if (pathname === '/register' && request.method === 'POST') {
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: 'invalid json' }, 400);
      }
      const { id } = body || {};
      if (!id) return json({ error: 'id required' }, 400);

      const record = {
        id,
        registeredAt: Date.now(),
        opens: [],
      };
      await env.TRACKER.put(`msg:${id}`, JSON.stringify(record));
      return json({ ok: true, id });
    }

    // --- GET /px/:id.gif ---------------------------------------------------
    if (pathname.startsWith('/px/') && request.method === 'GET') {
      const id = pathname.slice('/px/'.length).replace(/\.gif$/i, '');
      const raw = await env.TRACKER.get(`msg:${id}`);
      if (raw) {
        const rec = JSON.parse(raw);
        const at = Date.now();
        // Si el remitente avisó que está viendo este correo hace poco, esta
        // apertura es suya (auto-vista) y la marcamos self:true.
        const self =
          !!rec.selfViewAt && Math.abs(at - rec.selfViewAt) <= SELF_VIEW_WINDOW_MS;
        // Minimal: solo marca de tiempo y si vino del proxy de Gmail/Apple.
        // NO guardamos IP ni User-Agent (serían datos personales de terceros
        // que, además, suelen ser del proxy y no del destinatario real).
        rec.opens.push({
          at,
          viaProxy: /GoogleImageProxy|YahooMailProxy|Barracuda/i.test(
            request.headers.get('user-agent') || '',
          ),
          self,
        });
        await env.TRACKER.put(`msg:${id}`, JSON.stringify(rec));
      }
      return new Response(PIXEL, {
        headers: {
          'Content-Type': 'image/gif',
          'Content-Length': String(PIXEL.length),
          // Evita que el proxy/navegador cachee y nos oculte aperturas repetidas.
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
          Pragma: 'no-cache',
          Expires: '0',
        },
      });
    }

    // --- POST /self-view ---------------------------------------------------
    // La extensión del remitente avisa que ESTE usuario está viendo el correo.
    // Guardamos el timestamp y marcamos retroactivamente como self cualquier
    // apertura reciente (por si el pixel se cargó justo antes del aviso).
    if (pathname === '/self-view' && request.method === 'POST') {
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: 'invalid json' }, 400);
      }
      const { id } = body || {};
      if (!id) return json({ error: 'id required' }, 400);

      const raw = await env.TRACKER.get(`msg:${id}`);
      if (!raw) return json({ ok: true, id, found: false });

      const rec = JSON.parse(raw);
      const now = Date.now();
      rec.selfViewAt = now;
      for (const o of rec.opens || []) {
        if (Math.abs(now - o.at) <= SELF_VIEW_WINDOW_MS) o.self = true;
      }
      await env.TRACKER.put(`msg:${id}`, JSON.stringify(rec));
      return json({ ok: true, id });
    }

    // --- GET /status?ids=a,b,c --------------------------------------------
    if (pathname === '/status' && request.method === 'GET') {
      const ids = (url.searchParams.get('ids') || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const out = {};
      await Promise.all(
        ids.map(async (id) => {
          const raw = await env.TRACKER.get(`msg:${id}`);
          if (!raw) return;
          const rec = JSON.parse(raw);
          // Contamos solo aperturas reales del destinatario: excluimos las
          // auto-vistas del propio remitente (self:true).
          const real = (rec.opens || []).filter((o) => !o.self);
          out[id] = {
            opened: real.length > 0,
            count: real.length,
            firstOpen: real[0]?.at || null,
            lastOpen: real[real.length - 1]?.at || null,
            selfCount: (rec.opens || []).length - real.length,
          };
        }),
      );
      return json(out);
    }

    // --- health ------------------------------------------------------------
    if (pathname === '/' || pathname === '/health') {
      return json({ ok: true, service: 'pixel-tracker' });
    }

    return new Response('Not found', { status: 404, headers: CORS });
  },
};
