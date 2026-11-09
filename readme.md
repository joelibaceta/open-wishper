# Pixel Tracker for Gmail

Extensión de Chrome (Manifest V3) + backend serverless gratuito (Cloudflare
Worker) que inserta un *tracking pixel* en los correos de Gmail y te avisa
cuándo fueron abiertos.

## Qué hace

1. Detecta cuando abres el editor de redacción de Gmail.
2. Genera un identificador único por mensaje (`crypto.randomUUID()`).
3. Inserta un tracking pixel `<img src=".../px/{id}.gif">` en el cuerpo al enviar.
4. Registra el id y sus metadatos (asunto, destinatarios, fecha) en el backend.
5. El backend detecta la carga del píxel y guarda el evento de apertura.
6. Muestra un indicador junto a cada mensaje (en la lista, dentro del hilo y en el popup).

## Estructura

```
extension/        Extensión Chrome (MV3)
  manifest.json
  defaults.js     ÚNICO lugar con la URL del backend (compartido SW + content)
  background.js   Service worker: único que habla con el backend
  content.js      Detecta compose, inyecta pixel, pinta indicadores
  styles.css
  popup.html/js   Configurar backend y ver estado de los mensajes
backend/          Cloudflare Worker + KV
  src/index.js    /register, /px/:id.gif, /status
  wrangler.toml   dominio propio (custom_domain) + binding KV
  package.json
```

## Reutilizable

El proyecto está parametrizado para apuntarlo a cualquier dominio/cuenta:

- **Backend:** cambia `pattern` en `backend/wrangler.toml` (`[[routes]]`) por tu
  subdominio y `account_id` por el tuyo, luego `npx wrangler deploy`.
- **Extensión:** cambia **una sola línea** — `BACKEND_URL` en
  `extension/defaults.js` — o configúralo en runtime desde el popup
  (se guarda en `chrome.storage.local` y tiene prioridad sobre el default).

Despliegue actual de ejemplo: **`https://px.groway.studio`**.

## 1) Desplegar el backend (gratis)

Requiere una cuenta de Cloudflare (gratuita) y Node.

```bash
cd backend
npm install
npx wrangler login              # autentícate (abre el navegador)

# Crea el namespace KV y copia el id que imprime...
npx wrangler kv namespace create TRACKER
# ...pégalo en wrangler.toml -> [[kv_namespaces]] id = "..."

npx wrangler deploy
```

El `wrangler.toml` usa un **dominio propio** gestionado por Cloudflare
(`[[routes]]` con `custom_domain = true`). El dominio debe ser una zona activa
en tu cuenta de Cloudflare; al desplegar, Cloudflare crea el registro DNS y el
certificado SSL automáticamente. Para este proyecto: `px.groway.studio`.

> Si no tienes dominio en Cloudflare, borra el bloque `[[routes]]` y añade
> `workers_dev = true`; obtendrás una URL gratis `*.workers.dev`.

Para probar en local: `npm run dev`.

## 2) Cargar la extensión

1. (Opcional) Si usas otro backend, edita `BACKEND_URL` en
   `extension/defaults.js`. Para `px.groway.studio` ya está listo.
2. Abre `chrome://extensions`, activa **Modo desarrollador**.
3. **Cargar descomprimida** → selecciona la carpeta `extension/`.
4. (Opcional) Abre el popup y sobreescribe la URL del backend → **Guardar**.

> El `manifest.json` incluye `https://px.groway.studio/*` en `host_permissions`.
> Si cambias de dominio, actualiza también esa entrada.

## Cómo probar

1. Entra a Gmail, redacta y envía un correo (a otra cuenta tuya).
2. Abre ese correo desde la otra cuenta **con imágenes habilitadas**.
3. Vuelve a la primera cuenta: el popup y el indicador junto al mensaje
   deberían pasar de `✓ enviado` a `👁 abierto`.

## Limitaciones conocidas (importante)

- **Proxy de imágenes de Gmail:** Gmail sirve las imágenes a través de
  `googleusercontent.com`. Esto puede **pre-cargar** el píxel (falso positivo) o
  **cachearlo** (perdemos aperturas repetidas). El backend marca los hits del
  proxy (`viaProxy`) y envía cabeceras anti-cache, pero la detección no es
  perfecta — es una limitación inherente a todos los trackers de Gmail.
- **Correlación id ↔ fila:** los indicadores en la lista/hilo se emparejan por
  **asunto normalizado** (heurística). El popup es la fuente fiable porque usa
  el id real.
- **Selectores del DOM de Gmail:** Gmail cambia su HTML con frecuencia; si los
  indicadores dejan de aparecer, revisa los selectores en `content.js`.

## Privacidad y uso responsable

El seguimiento de aperturas de correo afecta la privacidad del destinatario.
Úsalo solo en contextos legítimos (tu propio correo, consentimiento, pruebas) y
cumpliendo la normativa aplicable (p. ej. GDPR). Esto es un proyecto educativo.
