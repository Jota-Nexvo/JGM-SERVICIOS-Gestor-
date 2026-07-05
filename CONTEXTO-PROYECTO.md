# JGM Gestor — Contexto del proyecto (documento de respaldo)

> Este archivo existe para que el proyecto se pueda **retomar desde cero** —en una
> sesión nueva de Claude Code, con otra persona, o directamente vos leyéndolo—
> sin perder nada de lo decidido hasta ahora. Se actualiza cada vez que se agrega
> algo importante. Si alguna vez perdés el chat, **este archivo es la memoria del
> proyecto.**

## 1. Qué es

App personal de escritorio/celular para **JGM SERVICIOS** (perforación de pozos
artesianos, mantenimiento, motobombas sumergibles y pesca de equipos) en
Paraguay. Gestiona clientes, trabajos y cobros a crédito. Es de **uso personal**
del dueño, pensada para funcionar **principalmente en el celular**, offline,
sin servidor: todos los datos viven encriptados/protegidos dentro del propio
dispositivo.

## 2. Dónde está el código

- **Repositorio:** `Jota-Nexvo/JGM-SERVICIOS-Gestor-` (GitHub)
- **Rama de trabajo:** `claude/jgm-gestor-phase-1-mwyfhk` (todo el desarrollo
  vive acá; `main` todavía no tiene nada de esto)
- **Estado del Pull Request:** se creó el PR #1 y **se cerró sin mergear** a
  pedido del dueño (quería revisar bien la seguridad antes de publicar). **La
  app NO está mergeada a `main` ni publicada en ningún lado todavía.**
- El paquete de diseño original (prototipo de referencia) está en
  `Gestor de clientes y pagos.zip`, en la raíz del repo.

### Para retomar en una sesión nueva
Decile a Claude Code: *"Lee CONTEXTO-PROYECTO.md y README.md de este repo,
estamos trabajando en la rama `claude/jgm-gestor-phase-1-mwyfhk`."* Con eso
alcanza para que entienda todo el historial sin releer los commits uno por uno.

## 3. Stack técnico

**Vanilla JS, sin build, sin dependencias, sin backend.** Se eligió así a
propósito: cero configuración, cero paquetes que se rompan con el tiempo, se
abre directo en cualquier navegador.

```
index.html                  Estructura: layout, pantallas, modales, pantalla de PIN
css/styles.css               Todos los estilos (tokens tomados del prototipo)
js/app.js                    Toda la lógica: datos, render, seguridad, PWA
manifest.webmanifest          Metadatos de instalación (PWA)
sw.js                         Service worker (funcionamiento offline)
assets/                       Logo original + íconos generados (192, 512, maskable, apple-touch)
Gestor de clientes y pagos.zip  Paquete de diseño original de referencia
```

`js/app.js` es un único IIFE con secciones comentadas (buscar los bloques
`// ===== Nombre =====`). No hay framework: el render es "borro y vuelvo a
pintar el HTML" (`innerHTML =`) cada vez que cambia algo, con `esc()` para
evitar inyección de HTML en todo texto que viene del usuario.

## 4. Estado actual — TODO lo implementado hasta hoy

Fases del plan original (todas hechas):

- [x] **Fase 1** — Esqueleto, layout responsive (sidebar en escritorio ≥880px /
      tab bar + FAB en celular), modelo de datos, persistencia en `localStorage`.
- [x] **Fase 2** — Clientes: lista con secciones (mayor deuda, últimos
      trabajos, último movimiento, A–Z), buscador (insensible a tildes/ñ),
      ficha, alta/edición/borrado, botón de WhatsApp.
- [x] **Fase 3** — Trabajos y pagos: alta/edición de trabajos (categoría,
      precio, contado/crédito, seña, fechas de cobro), pagos parciales con
      recálculo de saldo. **Pagos editables y borrables** individualmente
      (con recalculo de saldo y de fechas "cumplidas").
- [x] **Fase 4** — Inicio (total por cobrar, vencidos, hoy, mes
      realizado/cobrado, mayores deudores, últimos trabajos), Cobros (agenda
      agrupada: Vencidos/Hoy/Se acercan/Más adelante/Sin fecha, todas con botón
      de cobrar), posponer/fijar fecha, campanita con contador.
- [x] **Fase 5** — Fotos con IndexedDB (comprimidas a 1280px), visor a
      pantalla completa, borrado en cascada.
- [x] **Fase 6** — Ajustes: categorías editables, aviso anticipado global,
      notificaciones, exportar/importar respaldo.
- [x] **Fase 7** — PWA instalable: manifest + service worker (100% offline),
      notificaciones vía service worker (arreglado para que funcionen en
      Chrome/Android), íconos generados desde el logo.

### Agregado después de la Fase 7 (a pedido del dueño)

- **Seguridad**: pantalla de PIN de acceso (4-8 dígitos, solo se guarda un
  *hash* PBKDF2-SHA256 con 150.000 iteraciones — el PIN nunca se persiste en
  claro). Bloqueo automático a los 3 min de inactividad y en cada recarga.
  5 intentos fallidos → espera 30s. Registro de hasta 4 dispositivos
  (gestionable desde Ajustes → Seguridad). Content-Security-Policy estricta
  en el `<head>` (sin scripts externos, sin `eval`).
- **Arranque en blanco**: la app empieza sin clientes ni trabajos (solo las
  categorías por defecto). Hay un botón opcional "Cargar datos de ejemplo"
  en Ajustes que **solo aparece cuando la app está vacía** — los datos de
  muestra son genéricos, sin teléfonos reales (el repo puede ser público).
- **Respaldo cifrado**: exportar un JSON cifrado con AES-GCM (clave derivada
  del PIN vía PBKDF2). Sin el PIN, el archivo es ilegible.
- **Copia en la nube (recomendada para uso diario)**: botón "Guardar copia
  en la nube" que arma la copia **sin cifrar** y la ofrece por
  `navigator.share` (menú de compartir de Android) para mandarla a Drive,
  Gmail o WhatsApp. Esta copia se abre **sin PIN** — sirve para recuperar
  los datos aunque se olvide el PIN. Hay un cartel recordatorio en Inicio
  si pasaron 7+ días sin guardar copia.
- **Fotos del lugar + ubicación por cliente**: además de las fotos de cada
  trabajo, cada cliente tiene su propia galería de fotos ("Fotos del
  lugar") y un campo de ubicación: "Marcar mi ubicación" (GPS →
  `https://www.google.com/maps?q=lat,lng`), "Pegar link" manual, "Ver en
  el mapa", "Quitar". Se guarda en `client.mapsUrl`.
- **Pagos sin esperar la fecha**: botón "+ Registrar pago" a nivel del
  cliente en su ficha (antes solo se podía expandiendo un trabajo puntual).
  Si el cliente tiene varios trabajos con saldo, el modal muestra un
  selector. También se agregó el botón "Cobrar" en las secciones "Más
  adelante" y "Con deuda sin fecha" de la pantalla Cobros (antes solo
  Vencidos/Hoy/Se acercan lo tenían).
- **Botón "atrás" de Android integrado**: se agregó manejo de
  `history.pushState`/`popstate` para que el gesto/botón de atrás del
  celular cierre modales y el visor de fotos, y retroceda entre pantallas
  (ficha → Clientes → Inicio) en vez de cerrar la app de golpe.

## 5. Modelo de datos

Clave de `localStorage`: **`jgm_gestor_v1`**. Estructura:

```js
{
  clients: [{
    id, name, phone, address, ci, notes,
    mapsUrl,                 // opcional: link de Google Maps
    photos: [{ id, date }]   // "fotos del lugar"; binarios en IndexedDB
  }],
  jobs: [{
    id, clientId, desc, category, date, price, credit: true|false,
    payments: [{ id, amount, date, note }],
    dueDates: [{ id, date, done }],
    remind: null|number,     // override del aviso global
    photos: [{ id, date }]   // fotos del trabajo; binarios en IndexedDB
  }],
  settings: {
    categories: [...], remindDays, notifEnabled,
    devices: [{ id, name, added }]   // dispositivos autorizados (máx. 4)
  },
  demo: bool
}
```

Fotos (de trabajos y de clientes) en **IndexedDB** `jgm_fotos_v1`, store
`fotos`: clave = id de foto, valor = dataURL JPEG (máx. 1280px, calidad
0.72).

PIN: clave `jgm_lock_v1` en `localStorage` — solo `{ salt, iter, hash }`,
nunca el PIN. Fecha del último respaldo: `jgm_lastBackup`. Id del
dispositivo: `jgm_device_id`.

Saldo de un trabajo = `price − Σ payments` (se recalcula siempre, nunca se
guarda un campo "saldo" aparte). `dueDates[].done` se recalcula solo según
si el trabajo está saldado o no.

## 6. Decisiones de diseño importantes (para no repetir discusiones)

- **Sin gastos ni recibos** — explícitamente pospuesto en el diseño
  original. Ver punto 7 (pendiente: Fase 8 de contabilidad).
- **Sin backend, sin servidor** — todo vive en el dispositivo a propósito
  (privacidad + simplicidad + costo cero). Cualquier función nueva debe
  respetar esto.
- **Control de acceso real = el PIN**, no un límite técnico de
  dispositivos. El contador de "4 dispositivos" es informativo/gestionable
  por el dueño, no una barrera criptográfica.
- **Dos tipos de respaldo a propósito**: cifrado (seguro pero sin
  recuperación si se olvida el PIN) vs. copia en la nube sin cifrar
  (recuperable siempre, pero hay que cuidar dónde se guarda el archivo).
  Ambas conviven; no unificar en una sola.
- **Números de WhatsApp**: se cargan como número normal
  (ej. `0975 829 708`); la función `waLink()` arma sola el
  `wa.me/595975829708` quitando el 0 y agregando el 595.

## 7. Pendiente / ideas evaluadas, NO implementadas todavía

Estas se ofrecieron y el dueño **todavía no las pidió** (decidir en la
próxima sesión):

1. **WhatsApp con mensaje de cobro pre-escrito** — que el botón de
   WhatsApp abra el chat con un texto armado tipo "Hola [nombre], te
   recuerdo el saldo pendiente de ₲ X…".
2. **Estado de cuenta compartible** — resumen de texto de lo que debe un
   cliente, para mandar o guardar como comprobante.
3. **Vibración (`navigator.vibrate`)** al confirmar borrados/pagos —
   detalle de sensación nativa en el celular.
4. **Recordatorio de mantenimiento periódico** por cliente (ej. "revisar
   este pozo en 6 meses").
5. **Fase 8 — Gastos y contabilidad interna** (tema grande, discutido en
   detalle): agregar un módulo de Gastos (espejo de Trabajos: fecha,
   categoría, monto, nota, foto de comprobante opcional) + una pantalla de
   Finanzas con el resultado mensual = **Cobrado − Gastos**, y acumulado
   anual. Recomendación dada: **libro de caja categorizado**, NO
   contabilidad de partida doble (sería sobre-ingeniería para una empresa
   unipersonal). Integrar en la misma app (reutiliza seguridad, respaldo y
   los datos de ingresos que ya existen), no como app separada.

## 8. Cómo instalar (cuando el dueño lo autorice)

1. **Mergear** la rama `claude/jgm-gestor-phase-1-mwyfhk` a `main` (crear un
   PR nuevo — el PR #1 anterior quedó cerrado sin mergear).
2. Activar **GitHub Pages**: Settings → Pages → Source: "Deploy from a
   branch" → Branch `main` / `/ (root)` → Save. Da una URL tipo
   `https://jota-nexvo.github.io/JGM-SERVICIOS-Gestor-/`.
3. En cada celular: abrir esa URL en **Chrome** → crear el PIN → menú ⋮ →
   "Instalar aplicación" / "Agregar a pantalla de inicio".

**Actualizaciones futuras**: se suben cambios a `main` → el celular los baja
solo la próxima vez que abre la app con internet (hay que cerrarla y
reabrirla una vez). Los datos del usuario nunca se tocan con una
actualización — viven aparte, en `localStorage`/IndexedDB del dispositivo.

## 9. Cómo verificar cambios (para quien retome el desarrollo)

No hay tests automatizados con un framework — se usó **Playwright vía
script suelto** en cada tanda de cambios, simulando los dispositivos
objetivo (Poco X7 Pro ≈ 448×997 CSS @2.72x, Galaxy A25 ≈ 412×892 CSS
@2.625x) con:

```bash
python3 -m http.server 8811 --directory /ruta/al/repo
node script_de_verificacion.js   # Playwright: abre, interactúa, screenshots
```

Revisar siempre: sin errores de consola, sin desborde horizontal
(`document.documentElement.scrollWidth > clientWidth`), y capturas de
pantalla para inspección visual.
