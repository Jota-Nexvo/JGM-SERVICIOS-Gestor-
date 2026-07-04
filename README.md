# JGM SERVICIOS — Gestor de clientes y cobros

App personal para JGM SERVICIOS (perforación de pozos artesianos, mantenimiento, motobombas sumergibles y pesca de equipos) en Paraguay. Gestiona clientes, trabajos y cobros a crédito, 100% offline: todos los datos viven en el dispositivo (`localStorage` + IndexedDB), sin backend.

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
- [ ] **Fase 7 — Pulido + PWA:** manifest + service worker offline, icono, revisión visual fina.

## Estructura

```
index.html      Estructura de la app (layout, pantallas, tab bar)
css/styles.css  Estilos (tokens del prototipo)
js/app.js       Modelo de datos, persistencia, seed y navegación
assets/         Logo
```
