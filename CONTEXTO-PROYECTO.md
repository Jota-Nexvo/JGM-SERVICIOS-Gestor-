# JGM Gestor — Contexto del proyecto (documento de respaldo)

> Este archivo existe para que el proyecto se pueda **retomar desde cero** —en una
> sesión nueva de Claude Code, con otra persona, o directamente vos leyéndolo—
> sin perder nada de lo decidido hasta ahora. Se actualiza cada vez que se agrega
> algo importante. Si alguna vez perdés el chat, **este archivo es la memoria del
> proyecto.**
>
> **Última actualización:** 2026-07-10 — **Etapa A de la ampliación** (rama
> `claude/manager-app-features-v52uqa`): recordatorio de cobro por WhatsApp con
> mensaje pre-escrito, estado de cuenta compartible y vibración nativa. Además
> quedó **aprobado el plan completo de ampliación** (Etapas A/B/C): stock de
> productos importados de China, ventas con garantía, gastos con personal y
> estado de resultados — ver sección 11.

## 1. Qué es

App personal de escritorio/celular para **JGM SERVICIOS** (perforación de pozos
artesianos, mantenimiento, motobombas sumergibles y pesca de equipos) en
Paraguay. Gestiona clientes, trabajos y cobros a crédito. Es de **uso personal**
del dueño, pensada para funcionar **principalmente en el celular**, offline,
sin servidor: todos los datos viven encriptados/protegidos dentro del propio
dispositivo.

## 2. Dónde está el código

- **Repositorio:** `Jota-Nexvo/JGM-SERVICIOS-Gestor-` (GitHub)
- **Publicada:** la app se mergeó a `main` (PR #2, "publicación para instalar")
  y el dueño ya la usa instalada en el celular. Funciona de maravilla según él.
- **Rama de trabajo actual:** `claude/manager-app-features-v52uqa` (la
  ampliación por etapas — ver sección 11).
- El paquete de diseño original (prototipo de referencia) está en
  `Gestor de clientes y pagos.zip`, en la raíz del repo.

### Para retomar en una sesión nueva
Decile a Claude Code: *"Lee CONTEXTO-PROYECTO.md y README.md de este repo,
estamos trabajando en la rama `claude/manager-app-features-v52uqa`."* Con eso
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

- **Seguridad**: pantalla de PIN de acceso (**6 a 10 dígitos**, solo se guarda
  un *hash* PBKDF2-SHA256 con 150.000 iteraciones — el PIN nunca se persiste en
  claro). Bloqueo automático a los 3 min de inactividad y en cada recarga.
  Registro de hasta 4 dispositivos (gestionable desde Ajustes → Seguridad).
  Content-Security-Policy estricta en el `<head>` (sin scripts externos, sin
  `eval`).
- **Bloqueo escalonado por intentos fallidos** (agregado 2026-07-05, opciones
  "A" y "C" pedidas por el dueño): el contador de intentos ahora es
  **persistente** (se guarda en `localStorage`, clave `jgm_lock_att_v1`), así
  que cerrar y reabrir la app **no** reinicia el bloqueo. La espera **crece**
  con cada tanda de fallos: 5 fallos → 30s, 6 → 1min, 7 → 5min, 8 → 15min,
  9 → 30min, 10+ → 1h. En los fallos 3 y 4 avisa "te quedan N intentos". Durante
  la espera hay una **cuenta regresiva viva** en pantalla y el input queda
  deshabilitado. El desbloqueo correcto y "Olvidé mi PIN" limpian el contador.
  Funciones clave en `js/app.js`: `loadAtt/saveAtt/clearAtt`, `lockSecsFor`,
  `fmtWait`, `tickCountdown/stopCountdown`.
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
- **Registro mensual de ingresos** (agregado 2026-07-05): pantalla propia
  `screen-registro` (vista `registro`, se entra desde un botón en Inicio,
  debajo de la tarjeta del mes; se vuelve con "Volver" o el botón atrás).
  Muestra, mes por mes (agrupado por año con subtotal anual y un total
  general arriba): **Facturado** (precio de los trabajos con fecha de ese
  mes, contado o crédito) y **Cobrado** (contado → precio en el mes del
  trabajo; crédito → cada pago en el mes de la fecha del pago = flujo de
  caja real). **No usa datos nuevos**: todo se calcula al vuelo desde
  `jobs`/`payments`. Funciones: `monthlyStats()`, `monthName()`,
  `renderRegistro()` (en `js/app.js`, junto a `renderInicio`). La fila del
  mes actual coincide con la tarjeta "Realizado/Cobrado" de Inicio (misma
  lógica). Es, de hecho, la **mitad de ingresos** de la futura Fase 8.
  - **Detalle por mes** (`screen-regmes`, vista `regmes`, profundidad 2 como
    `cliente`): se entra tocando una fila de mes en el registro; vuelve a la
    lista con "Volver" o el botón atrás (regmes → registro → inicio, ya
    contemplado en el handler de `popstate`). Muestra dos listas: **Facturado**
    (trabajos con fecha de ese mes: cliente, descripción, fecha, monto, chip
    Contado/Crédito) y **Cobrado** (movimientos que entraron ese mes: seña,
    cuota o contado, con cliente, concepto, descripción y fecha). Funciones:
    `monthDetail(ym)`, `renderRegMonth()`; navegación `goRegMonth(ym)`; estado
    `state.regMonth`. **Tocar una fila abre la ficha del cliente**
    (`goClient`, vía `data-open-client`); las filas de clientes eliminados no
    son tocables. Como cualquier ficha, el botón atrás desde ahí vuelve a
    Clientes (comportamiento consistente y balanceado en el historial).

### Etapa A de la ampliación (2026-07-10) — Cobranza más fácil

- **Recordatorio de cobro por WhatsApp**: `waLink(phone, text)` ahora acepta un
  texto opcional (`?text=`). Botón "Recordar por WhatsApp" en la ficha del
  cliente (junto a Registrar pago, solo si hay saldo y teléfono) y botón
  compacto verde en las tarjetas de Cobros. Mensaje: "Hola [nombre], te
  recuerdo el saldo pendiente de ₲ X por [concepto]. ¡Gracias! — JGM
  SERVICIOS" (con un solo trabajo con deuda usa su descripción; con varios,
  "los trabajos realizados"). Funciones: `waRemindMsg`, `openWaRemind`.
- **Estado de cuenta compartible**: botón "📄 Estado de cuenta" en la ficha —
  arma texto plano (cliente, cada trabajo con precio/pagado/saldo, total
  adeudado, fecha) y lo ofrece por `navigator.share`; sin soporte, lo copia al
  portapapeles. Funciones: `accountStatement`, `shareStatement`.
- **Vibración nativa**: helper `vib(pattern)`; vibra en la ejecución de toda
  confirmación de doble toque (`confirm2`, pulso doble), al guardar un pago y
  al desbloquear con el PIN.
- Cache del service worker: `jgm-gestor-v2` → `jgm-gestor-v3`.

### Etapa B de la ampliación (2026-07-10) — Mantenimiento periódico

- **Modelo**: campo opcional `client.maint = { months, next }` (sin el campo =
  sin recordatorio; compatible hacia atrás, viaja en los respaldos dentro de
  `clients` sin cambios de estructura).
- **Ficha del cliente**: bloque "Mantenimiento" (entre Ubicación y Fotos del
  lugar). Sin recordatorio → botones "Cada 3/6/12 meses" y "Otro…" (prompt de
  meses, 1–60). Activo → estado "Cada X meses · próximo dd/mm/aaaa (en N
  días / es para hoy / venció hace N días)" + acciones **✓ Hecho** (recalcula
  `next = hoy + months`), **Posponer** (reutiliza el modal de posponer, ahora
  generalizado con `ppForm.maintCid`) y **Quitar** (doble toque).
- **Cobros**: sección "Mantenimientos · N" (tarjetas `maint-card` verdosas con
  chip 🔧, borde rojo si venció) con ✓ Hecho y Posponer. Aparecen los vencidos,
  de hoy y dentro del aviso anticipado global (`remindDays`).
- **Inicio**: banner turquesa si hay mantenimientos vencidos o de hoy (1 → con
  nombre; varios → contador), botón "Ver" → Cobros.
- **Notificación diaria**: ahora suma "N mantenimiento(s) pendiente(s)" al
  texto (función `maybeNotify`).
- Funciones clave en `js/app.js`: `addMonthsIso`, `maintAlerts`,
  `maintDiffLabel`, `setMaint`, `askMaintMonths`, `maintDone`, `clearMaint`,
  `openPostMaint`.

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
nunca el PIN. Intentos fallidos: `jgm_lock_att_v1` = `{ fails, until }`
(contador persistente del bloqueo escalonado). Fecha del último respaldo:
`jgm_lastBackup`. Id del dispositivo: `jgm_device_id`.

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

## 7. Pendiente / ideas evaluadas

**2026-07-10:** el dueño aprobó el plan de ampliación completo (ver sección
11). De la lista original: los puntos 1, 2 y 3 (WhatsApp con mensaje,
estado de cuenta, vibración) **ya están implementados** (Etapa A, sección 4);
el punto 4 (mantenimiento periódico) es la **Etapa B** y el punto 5 (Fase 8 —
gastos y contabilidad) creció y se convirtió en la **Etapa C** (stock +
ventas + gastos + estado de resultados). Lo pendiente ahora es lo que falte
de las etapas B y C según la sección 11.

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

## 10. Charla de seguridad / dominio / tokens (dudas resueltas del dueño)

Preguntas importantes que hizo el dueño y las respuestas acordadas (para no
volver a discutirlas):

- **"¿Pueden gastarme créditos/tokens si acceden al link?"** → **No.** La app
  es HTML/CSS/JS estático: **no usa ningún token, crédito, IA ni API**. No hay
  nada que gastar. `js/app.js` no hace ningún `fetch`/XHR a internet; el único
  `fetch` está en `sw.js` (cachear la propia app). Los tokens/créditos solo se
  consumen en **el chat de desarrollo con Claude Code** (cuenta de Claude del
  dueño, protegida por su login) — quien abre la app instalada nunca toca ese
  chat. Auditoría hecha: sin claves/tokens/secretos en el código; únicas URLs
  externas = Google Fonts (gratis), `wa.me/` y `google.com/maps` (deep links).
  CSP con `connect-src 'self'`.
- **"¿Se exponen los teléfonos de mis clientes si el repo es público?"** →
  **No.** En GitHub solo está **el programa vacío**. Los datos reales (nombres,
  teléfonos, montos, deudas) **nunca se suben**: viven solo en el `localStorage`
  / IndexedDB del teléfono. Quien abre el link ve la app **vacía**. El riesgo
  real solo existe si alguien tiene **físicamente el teléfono** y además pasa el
  PIN.
- **"¿Puedo restringir el acceso solo a mi dominio?"** → Un sitio estático
  gratis (GitHub Pages) **no** puede filtrar por dominio/IP sin un backend
  pago. **No hace falta**: el **PIN es el candado real**, los datos no están en
  la web, y que alguien abra el link **no cuesta nada** (hosting gratis, cero
  tokens).
- **Repo privado → descartado.** GitHub Pages gratis **solo** sirve repos
  **públicos**; ponerlo privado **rompe la instalación gratis**. Como el código
  no tiene datos ni secretos, dejarlo público no expone nada. **Decisión: el
  repo queda público** para poder instalar. (Alternativa mencionada pero no
  elegida: Netlify/Cloudflare Pages sirven desde repo privado gratis, pero es
  más complejo y no da seguridad extra.)
- **Refuerzos elegidos e implementados:** "A" (bloqueo escalonado persistente)
  y "C" (PIN de 6 dígitos). Ver sección 4. **No** se implementó "B" (borrar
  datos tras N fallos) ni "D" (repo privado).
- **Red de seguridad fuera de la app** (recordarle al dueño): bloqueo de
  pantalla del teléfono, "Encontrar mi dispositivo" de Google (borrado remoto
  si lo roban) y el respaldo cifrado para restaurar en un teléfono nuevo.

> **Regla de oro de seguridad (NO romper):** el PIN lo crea el dueño **en su
> teléfono** y de él solo se guarda un hash. **Nunca** pedirle ni recibir su PIN
> ni ninguna contraseña — compartirlo rompería el modelo de seguridad.

## 11. Plan de ampliación aprobado (2026-07-10) — Etapas A/B/C

**Contexto de negocio:** JGM va a **importar productos de China** para vender
(motobombas sumergibles —el conjunto **motor + bomba**— y componentes como el
relé falta de fase). La app pasa de solo servicios a **servicios + comercio
con stock**. Todas las decisiones de abajo fueron consultadas y respondidas
por el dueño — no re-preguntar.

- **Etapa A — Cobranza más fácil: HECHA** (ver sección 4).
- **Etapa B — Mantenimiento periódico: HECHA** (ver sección 4).
- **Etapa C — Stock, Ventas, Gastos y Finanzas** (pendiente), decisiones:
  - **Motor y bomba = productos separados** en el catálogo (cada uno con
    stock, costo y precio). Al vender se elige **motor / bomba / ambas**
    ("ambas" sugiere la suma; precio del catálogo es sugerido, se puede
    escribir el precio real de esa venta).
  - **Ventas SIEMPRE con cliente** (por las garantías; sin venta anónima).
    Venta a crédito = igual que trabajo a crédito (seña, fechas, en Cobros).
  - **Garantía por venta**: plazo elegible (6m/1año/sin); vigente/vencida
    visible en ficha de cliente y de producto. También aplica a productos
    instalados dentro de un trabajo.
  - **Trabajo con venta incluida**: en el modal de trabajo se agregan
    productos vendidos; **total = mano de obra + productos (suma automática
    y detallada)**; descuenta stock y congela costo (snapshot).
  - **Las fichas del día a día NO muestran costos ni ganancia** — solo
    precios de venta y pagos. La ganancia real vive SOLO en el Estado de
    resultados.
  - **Compras de importación en DOS pasos**: "Pagué el pedido" (sale de
    caja, pedido en viaje) → "Llegó" (costo total final con flete/aduana →
    **prorrateo proporcional al valor** → costo real por unidad; re-compra =
    **promedio ponderado**). Soporta **precio de conjunto** (motobomba
    completa) que se divide entre motor y bomba con montos editables.
    También **compra local** en un paso (costo directo).
  - **Contabilidad de inventario**: comprar stock NO es gasto del mes (es
    activo); el costo entra al resultado al vender (COGS). **Mermas** con
    botón "ajustar stock" + motivo, visibles en el estado de resultados.
  - **Personal**: ficha nombre/teléfono/CI/notas; pagos al personal como
    gasto categoría Personal con **vínculo opcional a un trabajo** (son
    por trabajo, no fijos).
  - **Gastos**: categorías Movilidad, Combustible, Viáticos (con subtipo
    opcional desayuno/almuerzo/cena/hospedaje), Personal,
    Productos/Materiales, Otro; nota y foto de comprobante opcionales.
  - **Finanzas**: vista principal = **caja real** (entró − salió); vista
    secundaria = resultado económico (Ingresos − COGS − Mermas = Margen
    bruto; − Gastos = Resultado neto, con %). Tarjetas: inventario
    valorizado, pedidos en viaje, desglose de gastos por categoría.
  - **Navegación**: barra inferior Inicio · Clientes · Cobros · **Stock** ·
    **Finanzas**; Ajustes accesible desde Inicio.
  - **Solo guaraníes.** Los precios reales de China los va a cargar el
    dueño solo cuando los tenga (la app queda lista; nada pre-cargado).
  - Sub-fases de construcción: C1 Gastos+Personal → C2 Stock+Compras →
    C3 Ventas+Garantías+Trabajos → C4 Finanzas → C5 integraciones
    (respaldos con todo lo nuevo, Ajustes, seed demo, reset, popstate,
    bump de sw.js).
