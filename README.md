# JGM SERVICIOS — Gestor de clientes y cobros

App personal para JGM SERVICIOS (perforación de pozos artesianos, mantenimiento, motobombas sumergibles y pesca de equipos) en Paraguay. Gestiona clientes, trabajos y cobros a crédito, 100% offline: todos los datos viven en el dispositivo (`localStorage` + IndexedDB), sin backend.

La app **arranca vacía**, lista para cargar datos reales. Desde Ajustes hay un botón «Cargar datos de ejemplo» (solo cuando está vacía) por si querés ver cómo se usa.

Cada cliente puede tener, además de sus trabajos: **fotos del lugar** (galería propia del cliente, aparte de las fotos de cada trabajo) y **ubicación** (botón «Marcar mi ubicación» por GPS o pegar un link de Google Maps, con «Ver en el mapa»). Todo entra en los respaldos.

## Cargar números de WhatsApp

En el campo «Teléfono / WhatsApp» de cada cliente cargá el número **normal**, como lo tenés en la agenda: `0975 829 708`. La app arma sola el link `wa.me/595975829708` al tocar el botón verde (le saca el 0 y le pone el 595). Funciona con o sin el 0, con espacios, o ya con el 595.

La referencia de diseño y comportamiento es el prototipo `JGM Gestor.dc.html` incluido en `Gestor de clientes y pagos.zip`.

## Cómo probar

Es una app estática, sin build. Serví la carpeta con cualquier servidor estático y abrila en el navegador:

```bash
npx serve .
# o
python3 -m http.server 8080
```

También funciona abriendo `index.html` directamente en el navegador.

- **Escritorio (≥880px):** sidebar oscura a la izquierda + topbar.
- **Móvil (<880px):** header con logo, tab bar inferior de 4 ítems + botón «+» central.
- Los datos de ejemplo se cargan la primera vez y sobreviven a la recarga (clave `jgm_gestor_v1` de `localStorage`).

## Plan por fases

- [x] **Fase 1 — Esqueleto + datos:** modelo de datos + persistencia localStorage, seed de ejemplo, layout responsive (sidebar / tab bar + FAB), navegación entre las 4 pantallas, logo integrado.
- [x] **Fase 2 — Clientes:** lista con secciones + buscador, ficha, alta/edición/borrado, WhatsApp.
- [x] **Fase 3 — Trabajos y pagos:** alta/edición de trabajos, pagos parciales, recálculo de saldo, historial.
- [x] **Fase 4 — Inicio + Cobros + avisos:** métricas del Inicio, agenda de cobros agrupada, campanita, posponer, notificaciones.
- [x] **Fase 5 — Fotos:** IndexedDB, agregar desde el trabajo, visor, borrado en cascada.
- [x] **Fase 6 — Ajustes + respaldo:** categorías, aviso global, exportar/importar JSON, restablecer/borrar todo.
- [x] **Fase 7 — Pulido + PWA:** manifest + service worker offline, icono con el logo, notificaciones vía service worker (Android), revisión visual fina.
- [x] **Etapa A — Cobranza más fácil (2026-07-10):** botón «Recordar por WhatsApp» con mensaje de cobro pre-escrito (en la ficha del cliente y en las tarjetas de Cobros), botón «Estado de cuenta» que comparte un resumen en texto (trabajos con saldo, pagos y total adeudado) y vibración del celular al confirmar pagos, borrados y al desbloquear.
- [ ] **Etapa B — Mantenimiento periódico** y **Etapa C — Stock, Ventas, Gastos y Finanzas**: en desarrollo (ver `CONTEXTO-PROYECTO.md`, sección 11).

## Seguridad

- **PIN de acceso**: al abrir la app se pide un PIN (4-8 números). Se guarda solo un *hash* con PBKDF2-SHA256 (150.000 iteraciones); el PIN nunca se guarda en texto. Bloqueo automático tras 3 minutos sin uso y en cada recarga. Tras 5 intentos fallidos, espera de 30 s.
- **Copia en la nube (recomendada)**: botón «Guardar copia en la nube» que abre el menú de compartir de Android para enviar la copia a Google Drive, Gmail o WhatsApp. Esa copia **se abre sin PIN**, así se recuperan los datos aunque se olvide el PIN (guardarla en un lugar privado). La app avisa en Inicio cuando hace más de 7 días que no se guarda una copia.
- **Respaldo cifrado (opcional)**: se exporta cifrado con AES-GCM (clave derivada del PIN). Sin el PIN, el archivo es ilegible. Se importa con el mismo PIN.
- **Restaurar**: en un teléfono nuevo, instalar la app → crear PIN → «Importar respaldo» y elegir la copia (la importación reconoce las dos: sin cifrar y cifrada).
- **Registro de dispositivos (máx. 4)**: cada dispositivo se registra al desbloquear; se gestionan desde Ajustes → Seguridad (ver y quitar). Como no hay servidor, el control real es el PIN: solo quien lo conoce puede abrir la app.
- **Endurecido**: Content-Security-Policy estricta (scripts solo propios, sin `eval`), `referrer` desactivado, y todo el contenido de usuario escapado.
- **Olvidé mi PIN**: reinicia la app borrando datos y PIN (recuperable desde un respaldo). No hay puerta trasera.

> Nota honesta: ninguna app web puede bloquear virus del teléfono (eso lo hace Android/Play Protect). Estas medidas protegen tus **datos** ante accesos no autorizados y respaldos filtrados.

## Instalar en el celular (PWA)

La app es instalable y funciona sin conexión. Serví los archivos por HTTPS (GitHub Pages sirve) y desde el celular:

- **Android (Chrome):** menú ⋮ → «Agregar a la pantalla de inicio» / «Instalar app». Queda como una app con el logo de JGM y arranca a pantalla completa, incluso sin internet.
- **iPhone (Safari):** botón Compartir → «Agregar a inicio».

Los datos y las fotos viven en el teléfono; hacé un respaldo desde Ajustes cada tanto.

## Estructura

```
index.html      Estructura de la app (layout, pantallas, tab bar)
css/styles.css  Estilos (tokens del prototipo)
js/app.js       Modelo de datos, persistencia, seed y navegación
assets/         Logo
```
