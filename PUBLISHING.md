# Publicar en la Chrome Web Store — checklist

> Estado: pendiente. Por ahora solo generamos el ZIP de la extensión.
> El resto (iconos, política de privacidad, ficha) queda documentado aquí
> para hacerlo más adelante.

## 1. Cuenta de desarrollador
- [ ] Registrarse en el [Developer Dashboard](https://chrome.google.com/webstore/devconsole) — **$5 USD pago único**.
- [ ] Verificación de identidad/email.
- [ ] Idealmente usar una cuenta de Google de la marca (Groway).

## 2. Assets de la ficha
- [ ] Iconos **16 / 32 / 48 / 128 px** (128 obligatorio). ⚠️ Hoy el manifest NO tiene iconos.
- [ ] Screenshots 1280×800 (mín. 1, ideal 3–5) mostrando la extensión en acción.
- [ ] (Opcional) imagen promocional 440×280.
- [ ] Descripción, categoría ("Productividad"), idioma.

## 3. Política de privacidad — OBLIGATORIA (accede a datos de correo)
- [ ] URL pública de política de privacidad (p.ej. `groway.studio/privacy`).
- [ ] Rellenar el formulario "Data usage / Privacy practices" en el dashboard.
- [ ] Cumplir "Limited Use" (no vender datos, no publicidad, solo la función declarada).
- ✅ Ventaja: el **diseño minimal** permite declarar con honestidad que NO se
  recolecta contenido, destinatarios, remitente, IP ni PII — solo IDs
  aleatorios y timestamps de apertura. Esto simplifica la aprobación.

## 4. Ajustes técnicos antes de empaquetar (producción)
- [ ] Añadir iconos al `manifest.json` (`icons` + `action.default_icon`).
- [ ] **Quitar `https://*.workers.dev/*`** de `host_permissions`; dejar solo `https://px.groway.studio/*`.
- [ ] Justificar cada permiso en el dashboard: `storage`, `alarms`, y sobre todo el host `mail.google.com` (el más sensible).
- [ ] Empaquetar el **contenido** de `extension/` en un ZIP (no la carpeta).
- [ ] Versión semántica en `manifest.json` (actual: `0.1.0`).

## 5. Puntos de revisión estricta (nuestro caso)
- Acceso a `mail.google.com` = permiso sensible → revisión manual, puede tardar días/semanas.
- Email tracking está permitido (Mailtrack, Streak…), **pero** hay que declararlo
  explícitamente en la descripción: inserta un pixel de seguimiento.
- "Single purpose" claro: "saber si tus correos fueron abiertos".
- Riesgo de rechazo si falta la política de privacidad o no se transparenta el tracking.

## 6. Tareas que podemos automatizar luego
- [ ] Generar iconos 16/32/48/128 y añadirlos al manifest.
- [ ] Endurecer el manifest (quitar comodín workers.dev).
- [ ] Borrador de política de privacidad (acorde al diseño minimal).
- [ ] Descripción de la ficha + justificación de permisos con disclosure del tracking.
- [x] Generar el ZIP (ver `npm run`/comando de empaquetado abajo).

## Empaquetar el ZIP

```bash
cd extension
zip -r -X ../dist/pixel-tracker-extension.zip . -x '.*'
```

Genera `dist/pixel-tracker-extension.zip` con el contenido de `extension/`
(manifest en la raíz del zip, como exige la Chrome Web Store).
