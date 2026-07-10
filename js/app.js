/* JGM SERVICIOS — Gestor de clientes y cobros
   Fase 1: modelo de datos + persistencia localStorage, seed, layout y navegación.
   Fase 2: Clientes — lista con secciones + buscador, ficha, CRUD, WhatsApp.
   Modelo y lógica replicados del prototipo (JGM Gestor.dc.html). */

(function () {
  'use strict';

  var STORAGE_KEY = 'jgm_gestor_v1';

  // ===== Utilidades =====
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function initials(name) {
    return (name || '?').trim().split(/\s+/).slice(0, 2).map(function (w) { return w[0]; }).join('').toUpperCase();
  }
  // Normaliza para búsqueda: minúsculas y sin tildes/ñ (ramon = Ramón, dona = Doña)
  function norm(s) {
    return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  // ===== Fechas =====
  function localIso(dt) {
    var p = function (x) { return String(x).padStart(2, '0'); };
    return dt.getFullYear() + '-' + p(dt.getMonth() + 1) + '-' + p(dt.getDate());
  }
  function todayIso() { return localIso(new Date()); }
  function dIso(off) { var d = new Date(); d.setDate(d.getDate() + off); return localIso(d); }
  function daysBetween(a, b) {
    var pa = a.split('-').map(Number), pb = b.split('-').map(Number);
    return Math.round((new Date(pb[0], pb[1] - 1, pb[2]) - new Date(pa[0], pa[1] - 1, pa[2])) / 864e5);
  }
  function addDaysIso(iso, n) {
    var p = iso.split('-').map(Number);
    return localIso(new Date(p[0], p[1] - 1, p[2] + n));
  }
  function dd(iso) { if (!iso) return ''; var p = iso.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }
  function ddShort(iso) { if (!iso) return ''; var p = iso.split('-'); return p[2] + '/' + p[1]; }

  // ===== Dinero (₲ sin decimales, puntos de miles) =====
  function dots(n) {
    n = Math.round(Number(n) || 0);
    return String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }
  function fmtG(n) { return '₲ ' + dots(n); }
  function mill(n) {
    n = Number(n) || 0;
    if (n >= 1e6) { return (Math.round(n / 1e5) / 10).toString().replace('.', ',') + ' M'; }
    return dots(n);
  }

  // ===== Cálculos =====
  function jobPaid(j) {
    if (!j.credit) return Number(j.price) || 0;
    return (j.payments || []).reduce(function (a, p) { return a + (Number(p.amount) || 0); }, 0);
  }
  function jobBalance(j) {
    if (!j.credit) return 0;
    return Math.max(0, (Number(j.price) || 0) - jobPaid(j));
  }

  // ===== Datos =====
  function defaultCats() { return ['Perforación', 'Mantenimiento', 'Motobomba', 'Pesca de equipo', 'Otro']; }
  function defaultExpenseCats() { return ['Movilidad', 'Combustible', 'Viáticos', 'Personal', 'Productos/Materiales', 'Otro']; }
  var VIATICO_SUBS = ['Desayuno', 'Almuerzo', 'Cena', 'Hospedaje'];
  // Arranque en blanco: la app empieza vacía para cargar datos reales.
  function seedData() {
    return {
      clients: [],
      jobs: [],
      expenses: [],
      staff: [],
      settings: { categories: defaultCats(), expenseCategories: defaultExpenseCats(), remindDays: 3, notifEnabled: false, devices: [] },
      demo: false
    };
  }
  // Datos de ejemplo, opcionales (botón "Cargar datos de ejemplo" cuando está vacía).
  function demoData() {
    var d = dIso;
    // Datos de muestra ficticios y sin teléfonos (el repo puede ser público).
    var clients = [
      { id: 'c1', name: 'Cliente de ejemplo 1', phone: '', address: 'Luque', ci: '', notes: 'Datos de muestra — podés borrarlos.' },
      { id: 'c2', name: 'Cliente de ejemplo 2', phone: '', address: 'Pirayú', ci: '', notes: '' },
      { id: 'c3', name: 'Cliente de ejemplo 3', phone: '', address: 'J. Augusto Saldívar', ci: '', notes: '' },
      { id: 'c4', name: 'Cliente de ejemplo 4', phone: '', address: 'Itauguá', ci: '', notes: '' },
      { id: 'c5', name: 'Cliente de ejemplo 5', phone: '', address: 'Capiatá', ci: '', notes: '' },
      { id: 'c6', name: 'Cliente de ejemplo 6', phone: '', address: 'Areguá', ci: '', notes: '' }
    ];
    var jobs = [
      { id: 'j1', clientId: 'c1', category: 'Perforación', desc: 'Perforación de pozo artesiano 48 m, encamisado 4"', date: d(-53), price: 14500000, credit: true, remind: 3, payments: [{ id: 'p1', amount: 5000000, date: d(-53), note: 'Seña' }, { id: 'p2', amount: 3000000, date: d(-27), note: 'Pagó en su casa' }], dueDates: [{ id: 'd1', date: d(-4), done: false }, { id: 'd2', date: d(13), done: false }], photos: [] },
      { id: 'j2', clientId: 'c2', category: 'Perforación', desc: 'Perforación 52 m + motobomba sumergible 3 HP', date: d(-40), price: 15000000, credit: true, remind: 3, payments: [{ id: 'p3', amount: 4000000, date: d(-40), note: 'Seña' }, { id: 'p4', amount: 2000000, date: d(-20), note: '' }], dueDates: [{ id: 'd3', date: d(-2), done: false }, { id: 'd4', date: d(26), done: false }], photos: [] },
      { id: 'j3', clientId: 'c3', category: 'Motobomba', desc: 'Cambio de motobomba sumergible 2 HP', date: d(-8), price: 8200000, credit: true, remind: 3, payments: [{ id: 'p5', amount: 5000000, date: d(-8), note: 'Seña' }], dueDates: [{ id: 'd5', date: d(0), done: false }], photos: [] },
      { id: 'j4', clientId: 'c4', category: 'Mantenimiento', desc: 'Limpieza y desinfección de pozo + cambio de caños', date: d(-15), price: 2800000, credit: true, remind: 2, payments: [{ id: 'p6', amount: 700000, date: d(-15), note: 'Seña' }, { id: 'p7', amount: 700000, date: d(-1), note: '' }], dueDates: [{ id: 'd6', date: d(3), done: false }], photos: [] },
      { id: 'j5', clientId: 'c5', category: 'Pesca de equipo', desc: 'Pesca de bomba trancada a 60 m', date: d(-2), price: 4500000, credit: true, remind: 3, payments: [{ id: 'p8', amount: 2000000, date: d(-2), note: 'Seña' }, { id: 'p9', amount: 2500000, date: d(-1), note: 'Saldo total' }], dueDates: [{ id: 'd7', date: d(-1), done: true }], photos: [] },
      { id: 'j6', clientId: 'c6', category: 'Motobomba', desc: 'Motobomba sumergible 1.5 HP con instalación', date: d(-5), price: 6900000, credit: false, remind: 3, payments: [], dueDates: [], photos: [] }
    ];
    var staff = [
      { id: 's1', name: 'Personal de ejemplo 1', phone: '', ci: '', notes: 'Ayudante de perforación (dato de muestra).' },
      { id: 's2', name: 'Personal de ejemplo 2', phone: '', ci: '', notes: '' }
    ];
    var expenses = [
      { id: 'e1', date: d(-53), category: 'Combustible', subtype: '', amount: 450000, note: 'Nafta para la perforación', staffId: '', jobId: 'j1', photos: [] },
      { id: 'e2', date: d(-52), category: 'Personal', subtype: '', amount: 1200000, note: 'Ayudante, 3 jornales', staffId: 's1', jobId: 'j1', photos: [] },
      { id: 'e3', date: d(-40), category: 'Viáticos', subtype: 'Almuerzo', amount: 90000, note: '', staffId: '', jobId: '', photos: [] },
      { id: 'e4', date: d(-8), category: 'Productos/Materiales', subtype: '', amount: 700000, note: 'Caños y abrazaderas', staffId: '', jobId: 'j3', photos: [] },
      { id: 'e5', date: d(-2), category: 'Movilidad', subtype: '', amount: 120000, note: 'Flete del equipo', staffId: '', jobId: '', photos: [] }
    ];
    return {
      clients: clients,
      jobs: jobs,
      expenses: expenses,
      staff: staff,
      settings: { categories: defaultCats(), expenseCategories: defaultExpenseCats(), remindDays: 3, notifEnabled: false, devices: [] },
      demo: true
    };
  }

  // ===== Persistencia =====
  // Migración suave: completa lo que falte en datos guardados por versiones anteriores
  function normalizeData(d) {
    if (!Array.isArray(d.expenses)) d.expenses = [];
    if (!Array.isArray(d.staff)) d.staff = [];
    if (!Array.isArray(d.settings.devices)) d.settings.devices = [];
    if (!Array.isArray(d.settings.categories)) d.settings.categories = defaultCats();
    if (!Array.isArray(d.settings.expenseCategories)) d.settings.expenseCategories = defaultExpenseCats();
    return d;
  }
  function persist(data) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (e) {}
  }
  function loadData() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var d = JSON.parse(raw);
        if (d && Array.isArray(d.clients) && Array.isArray(d.jobs) && d.settings) {
          normalizeData(d);
          return d;
        }
      }
    } catch (e) {}
    var seed = seedData();
    persist(seed);
    return seed;
  }
  function mutate(fn) {
    var copy = JSON.parse(JSON.stringify(state.data));
    fn(copy);
    persist(copy);
    state.data = copy;
    render();
  }

  // ===== Estado =====
  var state = {
    view: 'inicio',
    clientId: null,
    search: '',
    expandedJobId: null,
    confirmKey: null,
    photoCache: {},
    viewer: null,
    data: loadData()
  };
  var confirmTimer = null;
  var ajustesMsg = '';     // mensaje de estado en Ajustes (respaldo, etc.)
  var _pp = {};            // fotos en carga (evita pedidos duplicados)
  var _photoTarget = null; // { kind:'job'|'client', id } al que se le agregan fotos
  var PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

  // ===== Fotos (IndexedDB) =====
  var _idbP = null;
  function idb() {
    if (!_idbP) {
      _idbP = new Promise(function (res, rej) {
        var rq = indexedDB.open('jgm_fotos_v1', 1);
        rq.onupgradeneeded = function () { rq.result.createObjectStore('fotos'); };
        rq.onsuccess = function () { res(rq.result); };
        rq.onerror = function () { rej(rq.error); };
      });
    }
    return _idbP;
  }
  function idbOp(mode, fn) {
    return idb().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction('fotos', mode);
        var out = fn(tx.objectStore('fotos'));
        tx.oncomplete = function () { res(out && out.result); };
        tx.onerror = function () { rej(tx.error); };
      });
    });
  }
  function idbPut(id, val) { return idbOp('readwrite', function (s) { return s.put(val, id); }); }
  function idbGet(id) { return idbOp('readonly', function (s) { return s.get(id); }); }
  function idbDel(id) { return idbOp('readwrite', function (s) { return s.delete(id); }); }
  function idbClear() { return idbOp('readwrite', function (s) { return s.clear(); }); }

  // Carga a memoria las fotos (dataURL) de una lista [{id}] desde IndexedDB
  function loadPhotos(list) {
    var ids = (list || []).map(function (p) { return p.id; })
      .filter(function (id) { return !(id in state.photoCache) && !_pp[id]; });
    if (!ids.length) return;
    ids.forEach(function (id) { _pp[id] = true; });
    Promise.all(ids.map(function (id) { return idbGet(id).catch(function () { return null; }); })).then(function (vals) {
      var add = {};
      ids.forEach(function (id, i) { if (vals[i]) add[id] = vals[i]; });
      if (Object.keys(add).length) {
        Object.assign(state.photoCache, add);
        render();
      }
    });
  }
  function loadJobPhotos(j) { loadPhotos(j.photos); }
  // Devuelve el objeto (trabajo, cliente o gasto) dueño de las fotos
  function photoOwner(kind, id) {
    if (kind === 'client') return state.data.clients.find(function (x) { return x.id === id; });
    if (kind === 'exp') return (state.data.expenses || []).find(function (x) { return x.id === id; });
    return state.data.jobs.find(function (x) { return x.id === id; });
  }
  function imgFromFile(file) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { res(img); setTimeout(function () { URL.revokeObjectURL(url); }, 1000); };
      img.onerror = rej;
      img.src = url;
    });
  }
  function fileToDataUrl(file) {
    var load = (typeof createImageBitmap === 'function')
      ? createImageBitmap(file, { imageOrientation: 'from-image' }).catch(function () { return imgFromFile(file); })
      : imgFromFile(file);
    return load.then(function (img) {
      var w = img.width, h = img.height;
      var k = Math.min(1, 1280 / Math.max(w, h, 1));
      var cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(w * k));
      cv.height = Math.max(1, Math.round(h * k));
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      return cv.toDataURL('image/jpeg', 0.72);
    });
  }
  // Agrega fotos a un trabajo (kind 'job') o a un cliente (kind 'client')
  function addPhotosTo(kind, id, fileList) {
    var files = Array.prototype.slice.call(fileList || []).filter(function (f) {
      return f && f.type && f.type.indexOf('image/') === 0;
    });
    if (!files.length || !id) return;
    toast(files.length === 1 ? 'Procesando la foto…' : 'Procesando ' + files.length + ' fotos…');
    var work = files.map(function (f) {
      return fileToDataUrl(f).then(function (url) {
        var pid = uid();
        return idbPut(pid, url).then(function () { return { id: pid, url: url }; });
      }).catch(function () { return null; });
    });
    Promise.all(work).then(function (items) {
      var ok = items.filter(Boolean);
      if (!ok.length) { toast('No se pudieron agregar las fotos.'); return; }
      ok.forEach(function (x) { state.photoCache[x.id] = x.url; });
      var entries = ok.map(function (x) { return { id: x.id, date: todayIso() }; });
      mutate(function (d) {
        var o = kind === 'client' ? d.clients.find(function (x) { return x.id === id; })
          : kind === 'exp' ? (d.expenses || []).find(function (x) { return x.id === id; })
          : d.jobs.find(function (x) { return x.id === id; });
        if (o) o.photos = (o.photos || []).concat(entries);
      });
      toast(ok.length === 1 ? 'Foto agregada.' : ok.length + ' fotos agregadas.');
    });
  }
  function delPhotoFrom(kind, id, phId) {
    var owner = photoOwner(kind, id);
    var rest = owner ? (owner.photos || []).filter(function (p) { return p.id !== phId; }) : [];
    idbDel(phId).catch(function () {});
    var vw = state.viewer;
    if (vw && vw.kind === kind && vw.id === id) {
      state.viewer = rest.length ? { kind: kind, id: id, idx: Math.min(vw.idx, rest.length - 1) } : null;
      if (!state.viewer) histConsume();
    }
    mutate(function (d) {
      var o = kind === 'client' ? d.clients.find(function (x) { return x.id === id; }) : d.jobs.find(function (x) { return x.id === id; });
      if (o) o.photos = (o.photos || []).filter(function (p) { return p.id !== phId; });
    });
  }
  function delOwnerPhotos(owner) {
    ((owner && owner.photos) || []).forEach(function (p) { idbDel(p.id).catch(function () {}); });
  }

  // ===== Derivados =====
  function clientBalances() {
    var byClient = {};
    (state.data.jobs || []).forEach(function (j) {
      byClient[j.clientId] = (byClient[j.clientId] || 0) + jobBalance(j);
    });
    return byClient;
  }
  function jobsOf(cid) {
    return (state.data.jobs || []).filter(function (j) { return j.clientId === cid; });
  }
  function urgentCounts() {
    var today = todayIso();
    var venc = 0, hoy = 0;
    (state.data.jobs || []).forEach(function (j) {
      if (!j.credit || jobBalance(j) <= 0) return;
      (j.dueDates || []).forEach(function (x) {
        if (x.done) return;
        var diff = daysBetween(today, x.date);
        if (diff < 0) venc++; else if (diff === 0) hoy++;
      });
    });
    return { venc: venc, hoy: hoy };
  }
  function totalPending() {
    return (state.data.jobs || []).reduce(function (a, j) { return a + jobBalance(j); }, 0);
  }
  function debtClientsCount() {
    var bal = clientBalances();
    return Object.keys(bal).filter(function (k) { return bal[k] > 0; }).length;
  }
  function titles() {
    var D = state.data;
    return {
      inicio: ['Inicio', 'Resumen general del negocio'],
      clientes: ['Clientes', D.clients.length + ' registrados · ' + debtClientsCount() + ' con deuda'],
      cliente: ['Cliente', ''],
      cobros: ['Cobros', 'Avisos de cobro y pendientes'],
      registro: ['Registro mensual', 'Ingresos y gastos mes por mes'],
      regmes: ['Detalle del mes', state.regMonth ? (monthName(state.regMonth) + ' ' + state.regMonth.slice(0, 4)) : ''],
      gastos: ['Gastos', 'Gastos del negocio'],
      personal: ['Personales', 'Tu equipo de trabajo'],
      ajustes: ['Ajustes', 'Configuración y respaldo']
    };
  }

  // ===== Historial (botón "atrás" de Android) =====
  // Empujamos un estado por cada nivel de profundidad (vista) y por cada
  // overlay (modal/visor). "Atrás" cierra lo de más arriba en vez de salir.
  var histDepth = 0;   // estados nuestros vivos en el historial
  var histIgnore = 0;  // popstates que debemos ignorar (los generamos nosotros)
  var curViewDepth = 0; // inicio=0 · clientes/cobros/ajustes=1 · cliente=2
  function histPush() {
    try { history.pushState({ jgm: true }, ''); histDepth++; } catch (e) {}
  }
  function histConsume(n) {
    n = n || 1;
    n = Math.min(n, histDepth);
    if (n <= 0) return;
    histIgnore += n;
    histDepth -= n;
    try { history.go(-n); } catch (e) { histIgnore -= n; }
  }
  function viewDepthOf(v) {
    if (v === 'inicio') return 0;
    if (v === 'cliente' || v === 'regmes' || v === 'gastos') return 2;
    if (v === 'personal') return 3; // se entra desde Gastos
    return 1;
  }
  function syncViewHistory(target) {
    var d = viewDepthOf(target);
    if (d > curViewDepth) { for (var i = curViewDepth; i < d; i++) histPush(); }
    else if (d < curViewDepth) { histConsume(curViewDepth - d); }
    curViewDepth = d;
  }

  // ===== Toast =====
  var toastEl = document.getElementById('toast');
  var toastTimer = null;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2600);
  }

  // ===== Vibración (sensación nativa en el celular) =====
  function vib(pattern) {
    try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) {}
  }

  // ===== Confirmación de doble toque =====
  function confirm2(key, fn) {
    if (state.confirmKey === key) {
      state.confirmKey = null;
      clearTimeout(confirmTimer);
      vib([30, 60, 30]);
      fn();
      return;
    }
    state.confirmKey = key;
    clearTimeout(confirmTimer);
    confirmTimer = setTimeout(function () { state.confirmKey = null; render(); }, 3500);
    render();
  }

  // ===== Navegación =====
  function go(view) {
    if (view !== 'ajustes') ajustesMsg = '';
    syncViewHistory(view);
    state.view = view;
    state.confirmKey = null;
    render();
    window.scrollTo(0, 0);
  }
  function goClient(id) {
    syncViewHistory('cliente');
    state.view = 'cliente';
    state.clientId = id;
    state.expandedJobId = null;
    state.confirmKey = null;
    render();
    window.scrollTo(0, 0);
  }
  function goRegMonth(ym) {
    syncViewHistory('regmes');
    state.view = 'regmes';
    state.regMonth = ym;
    state.confirmKey = null;
    render();
    window.scrollTo(0, 0);
  }

  // ===== Modal cliente =====
  var modalEl = document.getElementById('modal-client');
  var cForm = { id: null };
  function openClientModal(client) {
    cForm = { id: client ? client.id : null };
    document.getElementById('cf-title').textContent = client ? 'Editar cliente' : 'Nuevo cliente';
    document.getElementById('cf-name').value = client ? client.name : '';
    document.getElementById('cf-phone').value = client ? (client.phone || '') : '';
    document.getElementById('cf-address').value = client ? (client.address || '') : '';
    document.getElementById('cf-ci').value = client ? (client.ci || '') : '';
    document.getElementById('cf-notes').value = client ? (client.notes || '') : '';
    var err = document.getElementById('cf-err');
    err.hidden = true;
    err.textContent = '';
    if (modalEl.hidden) histPush();
    modalEl.hidden = false;
    document.getElementById('cf-name').focus();
  }
  function closeClientModal() { if (!modalEl.hidden) { modalEl.hidden = true; histConsume(); } }
  function submitClient() {
    var name = document.getElementById('cf-name').value.trim();
    if (!name) {
      var err = document.getElementById('cf-err');
      err.textContent = 'El nombre es obligatorio.';
      err.hidden = false;
      return;
    }
    var phone = document.getElementById('cf-phone').value;
    var address = document.getElementById('cf-address').value;
    var ci = document.getElementById('cf-ci').value;
    var notes = document.getElementById('cf-notes').value;
    var isNew = !cForm.id;
    var newId = null;
    mutate(function (d) {
      if (cForm.id) {
        var c = d.clients.find(function (x) { return x.id === cForm.id; });
        if (c) { c.name = name; c.phone = phone; c.address = address; c.ci = ci; c.notes = notes; }
      } else {
        newId = uid();
        d.clients.push({ id: newId, name: name, phone: phone, address: address, ci: ci, notes: notes });
      }
    });
    closeClientModal();
    if (isNew && newId) {
      goClient(newId);
      toast('Cliente guardado.');
    }
  }

  // ===== Dinero en inputs =====
  function parseMoney(str) { return Number(String(str || '').replace(/\D/g, '')) || 0; }
  function moneyInput(el) {
    el.addEventListener('input', function () {
      var n = parseMoney(el.value);
      el.value = n ? dots(n) : '';
      if (el._onMoney) el._onMoney(n);
    });
  }

  // ===== Modal trabajo =====
  var jobModalEl = document.getElementById('modal-job');
  var jForm = {};
  function openNewJob(clientId) {
    var S = state.data.settings;
    if (state.data.clients.length === 0) { openClientModal(null); return; }
    jForm = {
      id: null,
      clientId: clientId || '',
      locked: !!clientId,
      category: S.categories[0] || 'Otro',
      dues: [],
      dueNew: addDaysIso(todayIso(), 30),
      credit: true
    };
    document.getElementById('jf-title').textContent = 'Nuevo trabajo';
    document.getElementById('jf-desc').value = '';
    document.getElementById('jf-date').value = todayIso();
    document.getElementById('jf-price').value = '';
    document.getElementById('jf-down').value = '';
    document.getElementById('jf-remind').value = String(S.remindDays);
    document.getElementById('jf-saldo-label').textContent = 'Saldo que quedará';
    openJobModalCommon();
  }
  function openEditJob(j) {
    jForm = {
      id: j.id,
      clientId: j.clientId,
      locked: true,
      category: j.category,
      dues: (j.dueDates || []).filter(function (x) { return !x.done; }).map(function (x) { return { id: x.id, date: x.date }; }),
      dueNew: addDaysIso(todayIso(), 30),
      credit: !!j.credit
    };
    document.getElementById('jf-title').textContent = 'Editar trabajo';
    document.getElementById('jf-desc').value = j.desc || '';
    document.getElementById('jf-date').value = j.date || todayIso();
    document.getElementById('jf-price').value = dots(j.price);
    document.getElementById('jf-down').value = '';
    document.getElementById('jf-remind').value = String(j.remind != null ? j.remind : state.data.settings.remindDays);
    document.getElementById('jf-saldo-label').textContent = 'Saldo actual con este precio';
    openJobModalCommon();
  }
  function openJobModalCommon() {
    var err = document.getElementById('jf-err');
    err.hidden = true;
    err.textContent = '';
    // cliente: fijo o seleccionable
    var lockedEl = document.getElementById('jf-client-locked');
    var selectEl = document.getElementById('jf-client');
    if (jForm.locked) {
      var c = state.data.clients.find(function (x) { return x.id === jForm.clientId; });
      lockedEl.textContent = c ? c.name : '';
      lockedEl.hidden = false;
      selectEl.hidden = true;
    } else {
      var opts = '<option value="">Elegir cliente…</option>' + state.data.clients.slice()
        .sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); })
        .map(function (x) { return '<option value="' + esc(x.id) + '">' + esc(x.name) + '</option>'; }).join('');
      selectEl.innerHTML = opts;
      selectEl.value = jForm.clientId || '';
      lockedEl.hidden = true;
      selectEl.hidden = false;
    }
    document.getElementById('jf-down-wrap').style.display = jForm.id ? 'none' : '';
    document.getElementById('jf-due-new').value = jForm.dueNew;
    renderJobModalDynamic();
    if (jobModalEl.hidden) histPush();
    jobModalEl.hidden = false;
  }
  function renderJobModalDynamic() {
    // categorías
    var catsEl = document.getElementById('jf-cats');
    catsEl.innerHTML = (state.data.settings.categories || []).map(function (name) {
      return '<span class="cat-chip' + (jForm.category === name ? ' active' : '') + '" data-cat="' + esc(name) + '">' + esc(name) + '</span>';
    }).join('');
    catsEl.querySelectorAll('[data-cat]').forEach(function (el) {
      el.addEventListener('click', function () {
        jForm.category = el.getAttribute('data-cat');
        renderJobModalDynamic();
      });
    });
    // contado / crédito
    document.getElementById('jf-contado').classList.toggle('active', !jForm.credit);
    document.getElementById('jf-credito').classList.toggle('active', jForm.credit);
    document.getElementById('jf-credit-block').style.display = jForm.credit ? '' : 'none';
    // fechas de cobro
    var duesEl = document.getElementById('jf-dues');
    if (jForm.dues.length) {
      duesEl.innerHTML = jForm.dues.map(function (x, i) {
        return '<span class="due-form-chip">' + esc(dd(x.date)) + ' <span class="x" data-due-rm="' + i + '">✕</span></span>';
      }).join('');
    } else {
      duesEl.innerHTML = '<span class="no-dues-hint">Sin fechas — el trabajo no generará avisos.</span>';
    }
    duesEl.querySelectorAll('[data-due-rm]').forEach(function (el) {
      el.addEventListener('click', function () {
        jForm.dues.splice(Number(el.getAttribute('data-due-rm')), 1);
        renderJobModalDynamic();
      });
    });
    updateJobPreview();
  }
  function updateJobPreview() {
    var price = parseMoney(document.getElementById('jf-price').value);
    var minus;
    if (jForm.id) {
      var j = state.data.jobs.find(function (x) { return x.id === jForm.id; });
      minus = j ? jobPaid(j) : 0;
    } else {
      minus = parseMoney(document.getElementById('jf-down').value);
    }
    document.getElementById('jf-saldo-preview').textContent = fmtG(Math.max(0, price - minus));
  }
  function closeJobModal() { if (!jobModalEl.hidden) { jobModalEl.hidden = true; histConsume(); } }
  function submitJob() {
    var errEl = document.getElementById('jf-err');
    var showErr = function (m) { errEl.textContent = m; errEl.hidden = false; };
    if (!jForm.locked) jForm.clientId = document.getElementById('jf-client').value;
    var price = parseMoney(document.getElementById('jf-price').value);
    var down = parseMoney(document.getElementById('jf-down').value);
    if (!jForm.clientId) { showErr('Elegí un cliente.'); return; }
    if (price <= 0) { showErr('Cargá el precio del trabajo.'); return; }
    if (jForm.credit && !jForm.id && down > price) { showErr('La seña no puede superar el precio.'); return; }
    var desc = document.getElementById('jf-desc').value;
    var date = document.getElementById('jf-date').value || todayIso();
    var remind = Math.max(0, Number(document.getElementById('jf-remind').value) || 0);
    var credit = jForm.credit;
    var dues = jForm.dues.slice();
    var cid = jForm.clientId;
    var isNew = !jForm.id;
    mutate(function (d) {
      if (jForm.id) {
        var j = d.jobs.find(function (x) { return x.id === jForm.id; });
        if (!j) return;
        j.category = jForm.category; j.desc = desc; j.date = date; j.price = price; j.credit = credit; j.remind = remind;
        var done = (j.dueDates || []).filter(function (x) { return x.done; });
        j.dueDates = credit ? done.concat(dues.map(function (x) { return { id: x.id || uid(), date: x.date, done: false }; })) : done;
      } else {
        var payments = [];
        if (credit && down > 0) payments.push({ id: uid(), amount: down, date: date, note: 'Seña' });
        d.jobs.push({
          id: uid(), clientId: cid, category: jForm.category, desc: desc, date: date, price: price,
          credit: credit, remind: remind, payments: payments,
          dueDates: credit ? dues.map(function (x) { return { id: uid(), date: x.date, done: false }; }) : [],
          photos: []
        });
      }
    });
    closeJobModal();
    if (isNew) { goClient(cid); toast('Trabajo guardado.'); }
    else toast('Trabajo actualizado.');
  }

  // ===== Modal pago =====
  var payModalEl = document.getElementById('modal-pay');
  var pForm = {};
  // Marca las fechas de cobro como cumplidas solo si el trabajo está saldado
  function recomputeDone(j) {
    var paid = (j.payments || []).reduce(function (a, p) { return a + (Number(p.amount) || 0); }, 0);
    var paidOff = paid >= (Number(j.price) || 0);
    (j.dueDates || []).forEach(function (x) { x.done = paidOff; });
    return paidOff;
  }
  function openPay(jobId, payId) {
    var j = state.data.jobs.find(function (x) { return x.id === jobId; });
    if (!j) return;
    var c = state.data.clients.find(function (x) { return x.id === j.clientId; });
    var pay = payId ? (j.payments || []).find(function (x) { return x.id === payId; }) : null;
    if (payId && !pay) return;
    pForm = { jobId: jobId, payId: payId || null };
    document.getElementById('pf-title').textContent = pay ? 'Editar pago' : 'Registrar pago';
    document.getElementById('pf-save').textContent = pay ? 'Guardar cambios' : 'Guardar pago';
    document.getElementById('pf-sub').textContent = (c ? c.name : '') + ' — ' + (j.desc || j.category);
    document.getElementById('pf-saldo').textContent = fmtG(jobBalance(j));
    document.getElementById('pf-amount').value = pay ? dots(pay.amount) : '';
    document.getElementById('pf-date').value = pay ? pay.date : todayIso();
    document.getElementById('pf-note').value = pay ? (pay.note || '') : '';
    var err = document.getElementById('pf-err');
    err.hidden = true;
    err.textContent = '';
    document.getElementById('pf-job-wrap').hidden = true;
    updatePayPreview();
    if (payModalEl.hidden) histPush();
    payModalEl.hidden = false;
    document.getElementById('pf-amount').focus();
  }
  // Registrar pago desde la ficha del cliente, sin esperar fechas de cobro:
  // si tiene un solo trabajo con saldo va directo; si tiene varios, muestra
  // un selector adentro del mismo modal.
  function openPayForClient(cid) {
    var withDebt = jobsOf(cid).filter(function (j) { return j.credit && jobBalance(j) > 0; });
    if (!withDebt.length) { toast('Este cliente está al día — no tiene saldos pendientes.'); return; }
    var firstPend = function (j) {
      var p = (j.dueDates || []).filter(function (x) { return !x.done; })
        .map(function (x) { return x.date; }).sort();
      return p.length ? p[0] : '9999-12-31';
    };
    withDebt.sort(function (a, b) {
      var fa = firstPend(a), fb = firstPend(b);
      if (fa !== fb) return fa < fb ? -1 : 1;
      return a.date < b.date ? -1 : 1;
    });
    openPay(withDebt[0].id);
    if (withDebt.length > 1) {
      var sel = document.getElementById('pf-job');
      sel.innerHTML = withDebt.map(function (j) {
        return '<option value="' + esc(j.id) + '">' + esc((j.desc || j.category) + ' · saldo ' + fmtG(jobBalance(j))) + '</option>';
      }).join('');
      sel.value = withDebt[0].id;
      document.getElementById('pf-job-wrap').hidden = false;
    }
  }
  function updatePayPreview() {
    var j = state.data.jobs.find(function (x) { return x.id === pForm.jobId; });
    if (!j) return;
    var price = Number(j.price) || 0;
    var otherPaid = (j.payments || []).reduce(function (a, p) {
      return a + (p.id === pForm.payId ? 0 : (Number(p.amount) || 0));
    }, 0);
    var amount = parseMoney(document.getElementById('pf-amount').value);
    var txt = fmtG(Math.max(0, price - otherPaid - amount));
    if (amount > 0 && otherPaid + amount >= price) txt += ' — ¡queda pagado!';
    document.getElementById('pf-new').textContent = txt;
  }
  function closePayModal() { if (!payModalEl.hidden) { payModalEl.hidden = true; histConsume(); } }
  function submitPay() {
    var amount = parseMoney(document.getElementById('pf-amount').value);
    if (amount <= 0) {
      var err = document.getElementById('pf-err');
      err.textContent = 'Cargá el monto entregado.';
      err.hidden = false;
      return;
    }
    var date = document.getElementById('pf-date').value || todayIso();
    var note = document.getElementById('pf-note').value || '';
    var editing = !!pForm.payId;
    var paidOff = false;
    mutate(function (d) {
      var j = d.jobs.find(function (x) { return x.id === pForm.jobId; });
      if (!j) return;
      j.payments = j.payments || [];
      if (editing) {
        var p = j.payments.find(function (x) { return x.id === pForm.payId; });
        if (p) { p.amount = amount; p.date = date; p.note = note; }
      } else {
        j.payments.push({ id: uid(), amount: amount, date: date, note: note });
      }
      paidOff = recomputeDone(j);
    });
    closePayModal();
    vib(30);
    toast(editing ? 'Pago actualizado.' : (paidOff ? 'Pago registrado — ¡trabajo saldado!' : 'Pago registrado.'));
  }
  function delPayment(jobId, payId) {
    mutate(function (d) {
      var j = d.jobs.find(function (x) { return x.id === jobId; });
      if (!j) return;
      j.payments = (j.payments || []).filter(function (p) { return p.id !== payId; });
      recomputeDone(j);
    });
    toast('Pago eliminado.');
  }

  // ===== Modal posponer / fijar fecha =====
  var postModalEl = document.getElementById('modal-post');
  var ppForm = {};
  function openPost(jobId, ddId) {
    var j = state.data.jobs.find(function (x) { return x.id === jobId; });
    if (!j) return;
    var target = ddId;
    if (!target) {
      var pend = (j.dueDates || []).filter(function (x) { return !x.done; })
        .sort(function (a, b) { return a.date < b.date ? -1 : 1; });
      target = pend.length ? pend[0].id : null;
    }
    ppForm = { jobId: jobId, ddId: target };
    var c = state.data.clients.find(function (x) { return x.id === j.clientId; });
    document.getElementById('pp-title').textContent = target ? 'Posponer cobro' : 'Fijar fecha de cobro';
    document.getElementById('pp-save').textContent = target ? 'Guardar nueva fecha' : 'Fijar fecha';
    document.getElementById('pp-sub').textContent =
      (c ? c.name : '') + ' — ' + (j.desc || j.category) + ' · debe ' + fmtG(jobBalance(j));
    document.getElementById('pp-date').value = addDaysIso(todayIso(), 7);
    var err = document.getElementById('pp-err');
    err.hidden = true;
    err.textContent = '';
    if (postModalEl.hidden) histPush();
    postModalEl.hidden = false;
  }
  // El mismo modal sirve para posponer un mantenimiento (ppForm.maintCid)
  function openPostMaint(cid) {
    var c = state.data.clients.find(function (x) { return x.id === cid; });
    if (!c || !c.maint) return;
    ppForm = { maintCid: cid };
    document.getElementById('pp-title').textContent = 'Posponer mantenimiento';
    document.getElementById('pp-save').textContent = 'Guardar nueva fecha';
    document.getElementById('pp-sub').textContent =
      c.name + ' — mantenimiento cada ' + c.maint.months + (Number(c.maint.months) === 1 ? ' mes' : ' meses');
    document.getElementById('pp-date').value = addDaysIso(todayIso(), 7);
    var err = document.getElementById('pp-err');
    err.hidden = true;
    err.textContent = '';
    if (postModalEl.hidden) histPush();
    postModalEl.hidden = false;
  }
  function closePostModal() { if (!postModalEl.hidden) { postModalEl.hidden = true; histConsume(); } }
  function submitPost() {
    var v = document.getElementById('pp-date').value;
    if (!v) {
      var err = document.getElementById('pp-err');
      err.textContent = 'Elegí la nueva fecha.';
      err.hidden = false;
      return;
    }
    if (ppForm.maintCid) {
      mutate(function (d) {
        var c = d.clients.find(function (x) { return x.id === ppForm.maintCid; });
        if (c && c.maint) c.maint.next = v;
      });
      closePostModal();
      toast('Mantenimiento pospuesto al ' + dd(v) + '.');
      return;
    }
    var wasFijar = !ppForm.ddId;
    mutate(function (d) {
      var j = d.jobs.find(function (x) { return x.id === ppForm.jobId; });
      if (!j) return;
      j.dueDates = j.dueDates || [];
      if (ppForm.ddId) {
        var x = j.dueDates.find(function (y) { return y.id === ppForm.ddId; });
        if (x) { x.date = v; x.done = false; }
      } else {
        j.dueDates.push({ id: uid(), date: v, done: false });
      }
    });
    closePostModal();
    toast(wasFijar ? 'Fecha de cobro fijada.' : 'Cobro pospuesto al ' + dd(v) + '.');
  }

  // ===== Modal gasto =====
  var expModalEl = document.getElementById('modal-expense');
  var eForm = {};
  function staffById(id) { return (state.data.staff || []).find(function (x) { return x.id === id; }); }
  function renderExpCats() {
    var box = document.getElementById('ef-cats');
    var cats = state.data.settings.expenseCategories || defaultExpenseCats();
    box.innerHTML = cats.map(function (name) {
      return '<span class="cat-chip' + (eForm.category === name ? ' active' : '') + '" data-ecat="' + esc(name) + '">' + esc(name) + '</span>';
    }).join('');
    box.querySelectorAll('[data-ecat]').forEach(function (el) {
      el.addEventListener('click', function () {
        eForm.category = el.getAttribute('data-ecat');
        if (eForm.category !== 'Viáticos') eForm.subtype = '';
        renderExpCats();
      });
    });
    // subtipo de viáticos
    var subWrap = document.getElementById('ef-sub-wrap');
    subWrap.hidden = eForm.category !== 'Viáticos';
    if (!subWrap.hidden) {
      var sb = document.getElementById('ef-subs');
      sb.innerHTML = VIATICO_SUBS.map(function (s) {
        return '<span class="cat-chip' + (eForm.subtype === s ? ' active' : '') + '" data-esub="' + esc(s) + '">' + esc(s) + '</span>';
      }).join('');
      sb.querySelectorAll('[data-esub]').forEach(function (el) {
        el.addEventListener('click', function () {
          eForm.subtype = eForm.subtype === el.getAttribute('data-esub') ? '' : el.getAttribute('data-esub');
          renderExpCats();
        });
      });
    }
    // personal + trabajo (solo categoría Personal)
    var stWrap = document.getElementById('ef-staff-wrap');
    var jbWrap = document.getElementById('ef-job-wrap');
    stWrap.hidden = eForm.category !== 'Personal';
    jbWrap.hidden = eForm.category !== 'Personal';
    if (!stWrap.hidden) {
      var staff = state.data.staff || [];
      var sel = document.getElementById('ef-staff');
      sel.innerHTML = '<option value="">Elegir personal…</option>' + staff.map(function (s) {
        return '<option value="' + esc(s.id) + '">' + esc(s.name) + '</option>';
      }).join('');
      sel.value = eForm.staffId || '';
      sel.onchange = function () { eForm.staffId = sel.value; };
      document.getElementById('ef-staff-hint').hidden = staff.length > 0;
      var jsel = document.getElementById('ef-job');
      var cById = {};
      state.data.clients.forEach(function (c) { cById[c.id] = c; });
      var jobs = (state.data.jobs || []).slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; }).slice(0, 40);
      jsel.innerHTML = '<option value="">Sin trabajo asociado</option>' + jobs.map(function (j) {
        var cn = (cById[j.clientId] || {}).name || '—';
        return '<option value="' + esc(j.id) + '">' + esc(cn + ' · ' + (j.desc || j.category) + ' · ' + ddShort(j.date)) + '</option>';
      }).join('');
      jsel.value = eForm.jobId || '';
      jsel.onchange = function () { eForm.jobId = jsel.value; };
    }
  }
  function openExpenseModal(exp) {
    eForm = exp
      ? { id: exp.id, category: exp.category, subtype: exp.subtype || '', staffId: exp.staffId || '', jobId: exp.jobId || '' }
      : { id: null, category: (state.data.settings.expenseCategories || defaultExpenseCats())[0], subtype: '', staffId: '', jobId: '' };
    document.getElementById('ef-title').textContent = exp ? 'Editar gasto' : 'Registrar gasto';
    document.getElementById('ef-save').textContent = exp ? 'Guardar cambios' : 'Guardar gasto';
    document.getElementById('ef-date').value = exp ? exp.date : todayIso();
    document.getElementById('ef-amount').value = exp ? dots(exp.amount) : '';
    document.getElementById('ef-note').value = exp ? (exp.note || '') : '';
    var err = document.getElementById('ef-err');
    err.hidden = true;
    err.textContent = '';
    renderExpCats();
    if (expModalEl.hidden) histPush();
    expModalEl.hidden = false;
    document.getElementById('ef-amount').focus();
  }
  function closeExpModal() { if (!expModalEl.hidden) { expModalEl.hidden = true; histConsume(); } }
  function expErr(msg) {
    var err = document.getElementById('ef-err');
    err.textContent = msg;
    err.hidden = false;
  }
  function submitExpense() {
    var amount = parseMoney(document.getElementById('ef-amount').value);
    if (amount <= 0) { expErr('Cargá el monto del gasto.'); return; }
    if (!eForm.category) { expErr('Elegí la categoría.'); return; }
    var staffId = eForm.category === 'Personal' ? (document.getElementById('ef-staff').value || '') : '';
    if (eForm.category === 'Personal' && !staffId) { expErr('Elegí a qué personal le pagaste.'); return; }
    var jobId = eForm.category === 'Personal' ? (document.getElementById('ef-job').value || '') : '';
    var date = document.getElementById('ef-date').value || todayIso();
    var note = document.getElementById('ef-note').value || '';
    var editing = !!eForm.id;
    mutate(function (d) {
      if (editing) {
        var x = d.expenses.find(function (e) { return e.id === eForm.id; });
        if (x) {
          x.date = date; x.category = eForm.category; x.subtype = eForm.subtype || '';
          x.amount = amount; x.note = note; x.staffId = staffId; x.jobId = jobId;
        }
      } else {
        d.expenses.push({
          id: uid(), date: date, category: eForm.category, subtype: eForm.subtype || '',
          amount: amount, note: note, staffId: staffId, jobId: jobId, photos: []
        });
      }
    });
    closeExpModal();
    vib(30);
    toast(editing ? 'Gasto actualizado.' : 'Gasto registrado.');
  }
  function delExpense(id) {
    var x = (state.data.expenses || []).find(function (e) { return e.id === id; });
    if (x) delOwnerPhotos(x);
    mutate(function (d) {
      d.expenses = (d.expenses || []).filter(function (e) { return e.id !== id; });
    });
    toast('Gasto eliminado.');
  }

  // ===== Modal personal =====
  var staffModalEl = document.getElementById('modal-staff');
  var sForm = { id: null };
  function openStaffModal(st) {
    sForm = { id: st ? st.id : null };
    document.getElementById('sf-title').textContent = st ? 'Editar personal' : 'Agregar personal';
    document.getElementById('sf-name').value = st ? st.name : '';
    document.getElementById('sf-phone').value = st ? (st.phone || '') : '';
    document.getElementById('sf-ci').value = st ? (st.ci || '') : '';
    document.getElementById('sf-notes').value = st ? (st.notes || '') : '';
    var err = document.getElementById('sf-err');
    err.hidden = true;
    err.textContent = '';
    if (staffModalEl.hidden) histPush();
    staffModalEl.hidden = false;
    document.getElementById('sf-name').focus();
  }
  function closeStaffModal() { if (!staffModalEl.hidden) { staffModalEl.hidden = true; histConsume(); } }
  function submitStaff() {
    var name = document.getElementById('sf-name').value.trim();
    if (!name) {
      var err = document.getElementById('sf-err');
      err.textContent = 'El nombre es obligatorio.';
      err.hidden = false;
      return;
    }
    var phone = document.getElementById('sf-phone').value;
    var ci = document.getElementById('sf-ci').value;
    var notes = document.getElementById('sf-notes').value;
    mutate(function (d) {
      if (sForm.id) {
        var s = d.staff.find(function (x) { return x.id === sForm.id; });
        if (s) { s.name = name; s.phone = phone; s.ci = ci; s.notes = notes; }
      } else {
        d.staff.push({ id: uid(), name: name, phone: phone, ci: ci, notes: notes });
      }
    });
    closeStaffModal();
    toast(sForm.id ? 'Personal actualizado.' : 'Personal guardado.');
  }
  function delStaff(id) {
    mutate(function (d) {
      d.staff = (d.staff || []).filter(function (s) { return s.id !== id; });
    });
    toast('Personal eliminado. Sus pagos registrados se conservan.');
  }

  // ===== Notificaciones (máx. 1/día) =====
  function notifPerm() { return (typeof Notification !== 'undefined') ? Notification.permission : 'unsupported'; }
  function isNotifOn() { return !!state.data.settings.notifEnabled && notifPerm() === 'granted'; }
  // En Android/Chrome `new Notification()` lanza excepción: hay que usar el
  // service worker. Probamos primero el SW y caemos al constructor (escritorio).
  function showNotif(title, opts) {
    if ('serviceWorker' in navigator && navigator.serviceWorker.ready) {
      return navigator.serviceWorker.ready
        .then(function (reg) { return reg.showNotification(title, opts); })
        .catch(function () { try { new Notification(title, opts); } catch (e) {} });
    }
    return Promise.resolve().then(function () { try { new Notification(title, opts); } catch (e) {} });
  }
  function toggleNotif() {
    if (isNotifOn()) {
      mutate(function (d) { d.settings.notifEnabled = false; });
      toast('Avisos desactivados.');
      return;
    }
    if (typeof Notification === 'undefined') { toast('Este navegador no soporta notificaciones.'); return; }
    Notification.requestPermission().then(function (p) {
      mutate(function (d) { d.settings.notifEnabled = (p === 'granted'); });
      toast(p === 'granted' ? 'Notificaciones activadas.' : 'El navegador no dio permiso para avisarte.');
    });
  }
  function maybeNotify() {
    try {
      if (!isNotifOn()) return;
      var key = 'jgm_lastNotif', t = todayIso();
      if (localStorage.getItem(key) === t) return;
      var u = urgentCounts();
      var mDue = maintAlerts().filter(function (m) { return m.diff <= 0; }).length;
      if (u.venc + u.hoy + mDue === 0) return;
      var parts = [];
      if (u.venc) parts.push(u.venc + (u.venc === 1 ? ' cobro vencido' : ' cobros vencidos'));
      if (u.hoy) parts.push(u.hoy + ' para hoy');
      if (mDue) parts.push(mDue + (mDue === 1 ? ' mantenimiento pendiente' : ' mantenimientos pendientes'));
      var partsTxt = parts.length > 1 ? parts.slice(0, -1).join(', ') + ' y ' + parts[parts.length - 1] : parts[0];
      showNotif('JGM SERVICIOS — Cobros', {
        body: 'Tenés ' + partsTxt + '. Abrí la app para ver los detalles.',
        icon: 'assets/icon-192.png', badge: 'assets/icon-192.png', tag: 'jgm-cobros'
      });
      localStorage.setItem(key, t);
    } catch (e) {}
  }

  // ===== Alertas de cobro =====
  function buildAlerts() {
    var S = state.data.settings;
    var today = todayIso();
    var alerts = [];
    (state.data.jobs || []).forEach(function (j) {
      if (!j.credit) return;
      var bal = jobBalance(j);
      if (bal <= 0) return;
      var remind = Number(j.remind != null ? j.remind : S.remindDays) || 0;
      (j.dueDates || []).forEach(function (x) {
        if (x.done) return;
        var diff = daysBetween(today, x.date);
        var group = diff < 0 ? 'venc' : diff === 0 ? 'hoy' : diff <= remind ? 'prox' : 'fut';
        alerts.push({ j: j, x: x, diff: diff, group: group, bal: bal });
      });
    });
    alerts.sort(function (a, b) { return a.x.date < b.x.date ? -1 : 1; });
    return alerts;
  }
  function jobsSinFecha() {
    return (state.data.jobs || []).filter(function (j) {
      return j.credit && jobBalance(j) > 0 && !(j.dueDates || []).some(function (x) { return !x.done; });
    });
  }

  // ===== Mantenimiento periódico por cliente =====
  // client.maint = { months, next } — sin el campo, el cliente no tiene recordatorio.
  function addMonthsIso(iso, months) {
    var p = iso.split('-').map(Number);
    return localIso(new Date(p[0], p[1] - 1 + months, p[2]));
  }
  // Mantenimientos vencidos, de hoy o dentro del aviso anticipado global
  function maintAlerts() {
    var today = todayIso();
    var remind = Number(state.data.settings.remindDays) || 0;
    return (state.data.clients || [])
      .filter(function (c) { return c.maint && c.maint.next; })
      .map(function (c) { return { c: c, diff: daysBetween(today, c.maint.next) }; })
      .filter(function (m) { return m.diff <= remind; })
      .sort(function (a, b) { return a.diff - b.diff; });
  }
  function maintDiffLabel(diff) {
    if (diff < 0) { var n = Math.abs(diff); return 'venció hace ' + n + (n === 1 ? ' día' : ' días'); }
    if (diff === 0) return 'es para hoy';
    return 'en ' + diff + (diff === 1 ? ' día' : ' días');
  }
  function setMaint(cid, months) {
    var next = addMonthsIso(todayIso(), months);
    mutate(function (d) {
      var c = d.clients.find(function (x) { return x.id === cid; });
      if (c) c.maint = { months: months, next: next };
    });
    toast('Recordatorio activado: cada ' + months + (months === 1 ? ' mes' : ' meses') + ' · próximo ' + dd(next) + '.');
  }
  function askMaintMonths(cid) {
    var v = window.prompt('¿Cada cuántos meses hay que hacer el mantenimiento?', '6');
    if (v == null) return;
    var n = parseInt(String(v).replace(/\D/g, ''), 10);
    if (!n || n < 1 || n > 60) { toast('Cargá un número de meses válido (de 1 a 60).'); return; }
    setMaint(cid, n);
  }
  function maintDone(cid) {
    var nextTxt = '';
    mutate(function (d) {
      var c = d.clients.find(function (x) { return x.id === cid; });
      if (c && c.maint) {
        c.maint.next = addMonthsIso(todayIso(), Number(c.maint.months) || 6);
        nextTxt = c.maint.next;
      }
    });
    if (nextTxt) { vib(30); toast('Mantenimiento registrado. Próximo: ' + dd(nextTxt) + '.'); }
  }
  function clearMaint(cid) {
    mutate(function (d) {
      var c = d.clients.find(function (x) { return x.id === cid; });
      if (c) delete c.maint;
    });
    toast('Recordatorio de mantenimiento quitado.');
  }

  // ===== WhatsApp =====
  function waLink(phone, text) {
    var digits = (phone || '').replace(/\D/g, '');
    if (!digits) return '';
    var url = 'https://wa.me/' + (digits.indexOf('595') === 0 ? digits : '595' + digits.replace(/^0/, ''));
    return text ? url + '?text=' + encodeURIComponent(text) : url;
  }
  // Mensaje de cobro pre-escrito
  function waRemindMsg(name, bal, concept) {
    return 'Hola ' + name + ', te recuerdo el saldo pendiente de ' + fmtG(bal) +
      ' por ' + concept + '. ¡Gracias! — JGM SERVICIOS';
  }
  // Abre WhatsApp con el recordatorio de todo lo que debe un cliente
  function openWaRemind(cid) {
    var c = state.data.clients.find(function (x) { return x.id === cid; });
    if (!c || !c.phone) return;
    var debts = jobsOf(cid).filter(function (j) { return j.credit && jobBalance(j) > 0; });
    if (!debts.length) { toast('Este cliente está al día.'); return; }
    var bal = debts.reduce(function (a, j) { return a + jobBalance(j); }, 0);
    var concept = debts.length === 1 ? (debts[0].desc || debts[0].category) : 'los trabajos realizados';
    window.open(waLink(c.phone, waRemindMsg(c.name, bal, concept)), '_blank', 'noopener');
  }

  // ===== Estado de cuenta compartible =====
  function accountStatement(cid) {
    var c = state.data.clients.find(function (x) { return x.id === cid; });
    if (!c) return '';
    var debts = jobsOf(cid).filter(function (j) { return j.credit && jobBalance(j) > 0; })
      .sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    var total = 0;
    var lines = [];
    lines.push('JGM SERVICIOS — Estado de cuenta');
    lines.push('Cliente: ' + c.name);
    lines.push('Fecha: ' + dd(todayIso()));
    lines.push('');
    if (debts.length) {
      lines.push('Trabajos con saldo pendiente:');
      debts.forEach(function (j) {
        var paid = jobPaid(j), balj = jobBalance(j);
        total += balj;
        lines.push('• ' + (j.desc || j.category) + ' — ' + dd(j.date));
        lines.push('  Precio: ' + fmtG(j.price) + ' · Pagado: ' + fmtG(paid) + ' · Saldo: ' + fmtG(balj));
      });
      lines.push('');
      lines.push('TOTAL ADEUDADO: ' + fmtG(total));
    } else {
      lines.push('Sin saldos pendientes — cliente al día. ✓');
    }
    return lines.join('\n');
  }
  function copyStatement(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(function () { toast('Estado de cuenta copiado — pegalo donde quieras.'); })
        .catch(function () { window.prompt('Copiá el estado de cuenta:', text); });
    } else {
      window.prompt('Copiá el estado de cuenta:', text);
    }
  }
  function shareStatement(cid) {
    var text = accountStatement(cid);
    if (!text) return;
    if (navigator.share) {
      navigator.share({ title: 'Estado de cuenta — JGM SERVICIOS', text: text })
        .catch(function (err) {
          if (err && err.name === 'AbortError') return; // el usuario canceló
          copyStatement(text);
        });
    } else {
      copyStatement(text);
    }
  }

  // ===== Ubicación (GPS / link de mapa) =====
  function captureLocation(cid) {
    if (!navigator.geolocation) { toast('Este dispositivo no permite tomar la ubicación.'); return; }
    toast('Obteniendo ubicación…');
    navigator.geolocation.getCurrentPosition(function (pos) {
      var lat = pos.coords.latitude.toFixed(6), lng = pos.coords.longitude.toFixed(6);
      var url = 'https://www.google.com/maps?q=' + lat + ',' + lng;
      mutate(function (d) { var c = d.clients.find(function (x) { return x.id === cid; }); if (c) c.mapsUrl = url; });
      toast('Ubicación guardada.');
    }, function () {
      toast('No se pudo obtener la ubicación. Revisá el permiso de ubicación del navegador.');
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 });
  }
  function pasteLocation(cid) {
    var url = (window.prompt('Pegá el link de Google Maps de este lugar:') || '').trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) { toast('El link no parece válido (tiene que empezar con http).'); return; }
    mutate(function (d) { var c = d.clients.find(function (x) { return x.id === cid; }); if (c) c.mapsUrl = url; });
    toast('Ubicación guardada.');
  }
  function clearLocation(cid) {
    mutate(function (d) { var c = d.clients.find(function (x) { return x.id === cid; }); if (c) delete c.mapsUrl; });
    toast('Ubicación quitada.');
  }

  // ===== Render: lista de clientes =====
  function clientRowHtml(c, bal) {
    var js = jobsOf(c.id);
    var city = (c.address || '').split('·')[0].trim();
    var sub = (city ? city + ' · ' : '') + js.length + (js.length === 1 ? ' trabajo' : ' trabajos');
    var right = bal > 0 ? fmtG(bal) : 'Al día';
    var rightCls = bal > 0 ? 'debt' : 'ok';
    return '<button type="button" class="client-row" data-client="' + esc(c.id) + '">' +
      '<div class="avatar">' + esc(initials(c.name)) + '</div>' +
      '<div class="client-row-main"><div class="client-row-name">' + esc(c.name) + '</div>' +
      '<div class="client-row-sub">' + esc(sub) + '</div></div>' +
      '<span class="client-row-right ' + rightCls + '">' + esc(right) + '</span></button>';
  }

  function renderClientesList() {
    var D = state.data;
    var box = document.getElementById('clientes-list');
    var bal = clientBalances();
    var q = norm((state.search || '').trim());
    var html = '';

    if (D.clients.length === 0) {
      html = '<div class="empty-card">' +
        '<div class="empty-card-title">Todavía no hay clientes</div>' +
        '<div class="empty-card-text">Agregá tu primer cliente para empezar a cargar trabajos.</div>' +
        '<button type="button" class="btn-cta js-empty-new">+ Agregar cliente</button></div>';
    } else if (q) {
      var res = D.clients.filter(function (c) {
        return norm((c.name || '') + ' ' + (c.address || '') + ' ' + (c.phone || '') + ' ' + (c.ci || '')).indexOf(q) !== -1;
      });
      html += '<div class="section-label first">Resultados · ' + res.length + '</div>';
      html += res.map(function (c) { return clientRowHtml(c, bal[c.id] || 0); }).join('');
      if (!res.length) html += '<div class="dashed-card">No encontré clientes con «' + esc(state.search.trim()) + '».</div>';
    } else {
      var jx = D.jobs;
      // ① mayor deuda
      var secDeuda = D.clients
        .map(function (c) { return { c: c, bal: bal[c.id] || 0 }; })
        .filter(function (x) { return x.bal > 0; })
        .sort(function (a, b) { return b.bal - a.bal; })
        .slice(0, 5);
      if (secDeuda.length) {
        html += '<div class="section-label red first">① Mayor deuda</div>';
        html += secDeuda.map(function (x) { return clientRowHtml(x.c, x.bal); }).join('');
      }
      // ② últimos trabajos
      var lastJobDate = {};
      jx.forEach(function (j) {
        if (!lastJobDate[j.clientId] || j.date > lastJobDate[j.clientId]) lastJobDate[j.clientId] = j.date;
      });
      var secTrab = D.clients
        .filter(function (c) { return lastJobDate[c.id]; })
        .sort(function (a, b) { return lastJobDate[a.id] < lastJobDate[b.id] ? 1 : -1; })
        .slice(0, 4);
      if (secTrab.length) {
        html += '<div class="section-label blue">② Últimos trabajos</div>';
        html += secTrab.map(function (c) { return clientRowHtml(c, bal[c.id] || 0); }).join('');
      }
      // ③ último movimiento
      var lastMov = {};
      jx.forEach(function (j) {
        (j.payments || []).forEach(function (p) {
          if (!lastMov[j.clientId] || p.date > lastMov[j.clientId]) lastMov[j.clientId] = p.date;
        });
      });
      var secMov = D.clients
        .filter(function (c) { return lastMov[c.id]; })
        .sort(function (a, b) { return lastMov[a.id] < lastMov[b.id] ? 1 : -1; })
        .slice(0, 4);
      if (secMov.length) {
        html += '<div class="section-label">③ Último movimiento</div>';
        html += secMov.map(function (c) { return clientRowHtml(c, bal[c.id] || 0); }).join('');
      }
      // todos A–Z
      html += '<div class="section-label">Todos (A–Z) · ' + D.clients.length + '</div>';
      html += D.clients.slice()
        .sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); })
        .map(function (c) { return clientRowHtml(c, bal[c.id] || 0); }).join('');
    }

    box.innerHTML = html;
    box.querySelectorAll('[data-client]').forEach(function (el) {
      el.addEventListener('click', function () { goClient(el.getAttribute('data-client')); });
    });
    var emptyNew = box.querySelector('.js-empty-new');
    if (emptyNew) emptyNew.addEventListener('click', function () { openClientModal(null); });
  }

  // ===== Render: ficha de cliente =====
  function dueChipHtml(x, j) {
    var remind = Number(j.remind != null ? j.remind : state.data.settings.remindDays) || 0;
    var diff = daysBetween(todayIso(), x.date);
    var label, bg, fg;
    if (diff < 0) { label = 'Venció ' + ddShort(x.date); bg = '#FBEEEA'; fg = '#C2452D'; }
    else if (diff === 0) { label = 'Cobro hoy'; bg = '#FBF3E4'; fg = '#B87514'; }
    else if (diff <= remind) { label = 'Cobro ' + ddShort(x.date); bg = '#E8EEFB'; fg = '#2B57C8'; }
    else { label = 'Cobro ' + ddShort(x.date); bg = '#EEF1F7'; fg = '#6B7690'; }
    return '<span class="due-chip" style="background:' + bg + ';color:' + fg + ';">' + esc(label) + '</span>';
  }

  function jobCardHtml(j) {
    var paid = jobPaid(j), bal = jobBalance(j);
    var isPaid = j.credit ? bal <= 0 : true;
    var expanded = state.expandedJobId === j.id;
    var pct = (Number(j.price) || 0) > 0 ? Math.min(100, Math.round(paid / Number(j.price) * 100)) : 0;
    var pendDues = (j.dueDates || []).filter(function (x) { return !x.done; });
    var stText = j.credit ? (isPaid ? 'Pagado' : 'Debe ' + mill(bal)) : 'Pagado';
    var dateLabel = dd(j.date) + ((j.photos || []).length ? ' · ' + j.photos.length + (j.photos.length === 1 ? ' foto' : ' fotos') : '');

    var html = '<div class="job-card">' +
      '<div class="job-head" data-toggle-job="' + esc(j.id) + '">' +
      '<div class="job-head-top"><span class="cat-pill">' + esc(j.category || 'Otro') + '</span>' +
      '<span class="job-date">' + esc(dateLabel) + '</span></div>' +
      '<div class="job-desc-row"><div class="job-desc">' + esc(j.desc || '(sin descripción)') + '</div>' +
      '<span class="job-caret">' + (expanded ? '▲ cerrar' : '▼ detalles') + '</span></div>' +
      '<div class="job-mode-row"><span class="job-mode">' + (j.credit ? 'Crédito' : 'Contado') +
      ' · <span class="mono">' + esc(fmtG(j.price)) + '</span></span>' +
      '<span class="st-pill ' + (isPaid ? 'st-paid' : 'st-debt') + '">' + esc(stText) + '</span></div>';

    if (j.credit) {
      html += '<div class="progress"><div style="width:' + pct + '%;"></div></div>' +
        '<div class="job-pay-row">' +
        '<span>Pagado: <span class="mono" style="color:#1F8A5B;">' + esc(fmtG(paid)) + '</span></span>' +
        '<span>Saldo: <span class="mono" style="color:' + (bal > 0 ? '#C2452D' : '#1F8A5B') + ';">' + esc(fmtG(bal)) + '</span></span></div>';
      if (pendDues.length) {
        html += '<div class="due-chips">' + pendDues.map(function (x) { return dueChipHtml(x, j); }).join('') + '</div>';
      }
    }
    html += '</div>'; // /job-head

    if (expanded) {
      html += '<div class="job-detail">';
      // fotos
      html += '<div class="job-detail-label">Fotos del trabajo</div><div class="photo-grid">';
      (j.photos || []).forEach(function (p, i) {
        var src = state.photoCache[p.id] || PIXEL;
        html += '<img class="photo-thumb" alt="Foto del trabajo" src="' + esc(src) + '" data-ph-open="job:' + esc(j.id) + ':' + i + '">';
      });
      html += '<div class="photo-add" data-ph-add="job:' + esc(j.id) + '">' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-2.5h6L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.2"/></svg>' +
        '<span>Agregar</span></div></div>';
      var pays = (j.payments || []).slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
      if (pays.length) {
        html += '<div class="job-detail-label">Historial de pagos</div><div class="pay-list">' +
          pays.map(function (p) {
            var delLbl = state.confirmKey === 'delpay:' + p.id ? '¿?' : '✕';
            return '<div class="pay-row"><span class="pay-row-label">' + esc(dd(p.date) + (p.note ? ' · ' + p.note : '')) + '</span>' +
              '<span class="pay-row-right"><span class="pay-row-amount">+ ' + esc(fmtG(p.amount)) + '</span>' +
              '<button type="button" class="pay-btn pay-edit" data-pay-edit="' + esc(j.id) + ':' + esc(p.id) + '" aria-label="Editar pago">✎</button>' +
              '<button type="button" class="pay-btn pay-del" data-pay-del="' + esc(j.id) + ':' + esc(p.id) + '" aria-label="Borrar pago">' + delLbl + '</button></span></div>';
          }).join('') + '</div>';
      } else if (j.credit) {
        html += '<div class="no-pay">Sin pagos registrados todavía.</div>';
      }
      var jDelLabel = state.confirmKey === 'delj:' + j.id ? '¿Seguro?' : 'Eliminar';
      html += '<div class="job-actions">';
      if (j.credit && bal > 0) {
        html += '<button type="button" class="btn-pay" data-job-pay="' + esc(j.id) + '">+ Registrar pago</button>' +
          '<button type="button" class="btn-ghost" data-job-post="' + esc(j.id) + '">' + (pendDues.length ? 'Posponer' : 'Fijar fecha') + '</button>';
      }
      html += '<button type="button" class="btn-ghost" data-job-edit="' + esc(j.id) + '">Editar</button>' +
        '<button type="button" class="btn-ghost-danger" data-job-del="' + esc(j.id) + '">' + jDelLabel + '</button></div></div>';
    }

    html += '</div>'; // /job-card
    return html;
  }

  function renderCliente() {
    var box = document.getElementById('cliente-detail');
    var c = state.data.clients.find(function (x) { return x.id === state.clientId; });
    if (!c) { go('clientes'); return; }
    loadPhotos(c.photos);
    var bal = clientBalances()[c.id] || 0;
    var js = jobsOf(c.id).sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    var wa = waLink(c.phone);
    var meta = [c.ci || '', c.phone || ''].filter(Boolean).join(' · ') || 'Sin datos de contacto';
    var delLabel = state.confirmKey === 'delc:' + c.id ? '¿Seguro? Tocá otra vez' : 'Eliminar';

    var html = '<div class="detail-header">' +
      '<button type="button" class="btn-white js-back"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>Volver</button>' +
      '<div class="spacer"></div>' +
      '<button type="button" class="btn-white js-edit-client">Editar</button>' +
      '<button type="button" class="btn-danger-outline js-del-client">' + esc(delLabel) + '</button></div>';

    html += '<div class="info-card"><div class="info-card-top">' +
      '<div class="avatar-lg">' + esc(initials(c.name)) + '</div>' +
      '<div class="info-main"><div class="info-name">' + esc(c.name) + '</div>' +
      '<div class="info-address">' + esc(c.address || 'Sin dirección cargada') + '</div>' +
      '<div class="info-meta">' + esc(meta) + '</div></div>' +
      (wa ? '<a class="btn-wa" href="' + esc(wa) + '" target="_blank" rel="noopener">' +
        '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.5 8.5 0 0 1-12.3 7.6L4 20l1-4.5A8.5 8.5 0 1 1 21 11.5"/></svg>WhatsApp</a>' : '') +
      '</div>' +
      ((c.notes || '').trim() ? '<div class="notes-box">' + esc(c.notes) + '</div>' : '') +
      '</div>';

    // Ubicación
    var loc = c.mapsUrl || '';
    html += '<div class="info-card"><div class="job-detail-label">Ubicación</div>';
    if (loc) {
      html += '<a class="btn-map" href="' + esc(loc) + '" target="_blank" rel="noopener">' +
        '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-6-5.2-6-10a6 6 0 1 1 12 0c0 4.8-6 10-6 10z"/><circle cx="12" cy="11" r="2.2"/></svg>Ver en el mapa</a>' +
        '<div class="loc-actions">' +
        '<button type="button" class="loc-btn" data-loc-gps="' + esc(c.id) + '">Actualizar (GPS)</button>' +
        '<button type="button" class="loc-btn" data-loc-paste="' + esc(c.id) + '">Pegar link</button>' +
        '<button type="button" class="loc-btn danger" data-loc-clear="' + esc(c.id) + '">Quitar</button></div>';
    } else {
      html += '<div class="loc-empty">Sin ubicación guardada.</div>' +
        '<div class="loc-actions">' +
        '<button type="button" class="loc-btn primary" data-loc-gps="' + esc(c.id) + '">📍 Marcar mi ubicación</button>' +
        '<button type="button" class="loc-btn" data-loc-paste="' + esc(c.id) + '">Pegar link</button></div>';
    }
    html += '</div>';

    // Mantenimiento periódico
    html += '<div class="info-card"><div class="job-detail-label">Mantenimiento</div>';
    if (c.maint && c.maint.next) {
      var mDiff = daysBetween(todayIso(), c.maint.next);
      var mCls = mDiff < 0 ? 'venc' : mDiff === 0 ? 'hoy' : '';
      html += '<div class="maint-status ' + mCls + '">Cada ' + esc(c.maint.months) +
        (Number(c.maint.months) === 1 ? ' mes' : ' meses') + ' · próximo <b>' + esc(dd(c.maint.next)) + '</b> (' +
        esc(maintDiffLabel(mDiff)) + ')</div>' +
        '<div class="loc-actions">' +
        '<button type="button" class="loc-btn primary" data-maint-done="' + esc(c.id) + '">✓ Hecho</button>' +
        '<button type="button" class="loc-btn" data-maint-post="' + esc(c.id) + '">Posponer</button>' +
        '<button type="button" class="loc-btn danger" data-maint-off="' + esc(c.id) + '">' +
        (state.confirmKey === 'delmaint:' + c.id ? '¿Seguro?' : 'Quitar') + '</button></div>';
    } else {
      html += '<div class="loc-empty">Sin recordatorio. Elegí cada cuánto revisar este pozo o equipo:</div>' +
        '<div class="loc-actions">' +
        '<button type="button" class="loc-btn" data-maint-set="3">Cada 3 meses</button>' +
        '<button type="button" class="loc-btn" data-maint-set="6">Cada 6 meses</button>' +
        '<button type="button" class="loc-btn" data-maint-set="12">Cada 12 meses</button>' +
        '<button type="button" class="loc-btn" data-maint-set="0">Otro…</button></div>';
    }
    html += '</div>';

    // Fotos del lugar (del cliente, independientes de los trabajos)
    html += '<div class="info-card"><div class="job-detail-label">Fotos del lugar</div><div class="photo-grid">';
    (c.photos || []).forEach(function (p, i) {
      var src = state.photoCache[p.id] || PIXEL;
      html += '<img class="photo-thumb" alt="Foto del lugar" src="' + esc(src) + '" data-ph-open="client:' + esc(c.id) + ':' + i + '">';
    });
    html += '<div class="photo-add" data-ph-add="client:' + esc(c.id) + '">' +
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-2.5h6L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.2"/></svg>' +
      '<span>Agregar</span></div></div></div>';

    html += '<div class="saldo-card"><span class="saldo-card-label">Saldo pendiente</span>' +
      '<span class="saldo-card-amount" style="color:' + (bal > 0 ? '#FF9D8A' : '#7BD8A8') + ';">' +
      esc(bal > 0 ? fmtG(bal) : 'Al día ✓') + '</span></div>';

    html += '<button type="button" class="btn-big-primary js-client-new-job">+ Nuevo trabajo para este cliente</button>';
    if (bal > 0) {
      html += '<button type="button" class="btn-big-pay js-client-pay">+ Registrar pago</button>';
      html += '<div class="acct-actions">' +
        (wa ? '<button type="button" class="acct-btn wa js-client-remind">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.5 8.5 0 0 1-12.3 7.6L4 20l1-4.5A8.5 8.5 0 1 1 21 11.5"/></svg>' +
          'Recordar por WhatsApp</button>' : '') +
        '<button type="button" class="acct-btn js-client-statement">📄 Estado de cuenta</button></div>';
    }

    if (js.length) {
      html += js.map(jobCardHtml).join('');
    } else {
      html += '<div class="dashed-card">Este cliente todavía no tiene trabajos cargados.</div>';
    }

    box.innerHTML = html;

    box.querySelector('.js-back').addEventListener('click', function () { go('clientes'); });
    box.querySelector('.js-edit-client').addEventListener('click', function () { openClientModal(c); });
    box.querySelectorAll('[data-loc-gps]').forEach(function (el) {
      el.addEventListener('click', function () { captureLocation(el.getAttribute('data-loc-gps')); });
    });
    box.querySelectorAll('[data-loc-paste]').forEach(function (el) {
      el.addEventListener('click', function () { pasteLocation(el.getAttribute('data-loc-paste')); });
    });
    box.querySelectorAll('[data-loc-clear]').forEach(function (el) {
      el.addEventListener('click', function () { clearLocation(el.getAttribute('data-loc-clear')); });
    });
    box.querySelector('.js-del-client').addEventListener('click', function () {
      confirm2('delc:' + c.id, function () {
        jobsOf(c.id).forEach(function (x) { delOwnerPhotos(x); });
        delOwnerPhotos(c);
        mutate(function (d) {
          d.clients = d.clients.filter(function (x) { return x.id !== c.id; });
          d.jobs = d.jobs.filter(function (x) { return x.clientId !== c.id; });
        });
        go('clientes');
        toast('Cliente eliminado.');
      });
    });
    box.querySelector('.js-client-new-job').addEventListener('click', function () {
      openNewJob(c.id);
    });
    var clientPayBtn = box.querySelector('.js-client-pay');
    if (clientPayBtn) clientPayBtn.addEventListener('click', function () { openPayForClient(c.id); });
    var remindBtn = box.querySelector('.js-client-remind');
    if (remindBtn) remindBtn.addEventListener('click', function () { openWaRemind(c.id); });
    var stmtBtn = box.querySelector('.js-client-statement');
    if (stmtBtn) stmtBtn.addEventListener('click', function () { shareStatement(c.id); });
    box.querySelectorAll('[data-maint-set]').forEach(function (el) {
      el.addEventListener('click', function () {
        var n = Number(el.getAttribute('data-maint-set'));
        if (n) setMaint(c.id, n); else askMaintMonths(c.id);
      });
    });
    box.querySelectorAll('[data-maint-done]').forEach(function (el) {
      el.addEventListener('click', function () { maintDone(el.getAttribute('data-maint-done')); });
    });
    box.querySelectorAll('[data-maint-post]').forEach(function (el) {
      el.addEventListener('click', function () { openPostMaint(el.getAttribute('data-maint-post')); });
    });
    box.querySelectorAll('[data-maint-off]').forEach(function (el) {
      el.addEventListener('click', function () {
        var id = el.getAttribute('data-maint-off');
        confirm2('delmaint:' + id, function () { clearMaint(id); });
      });
    });
    box.querySelectorAll('[data-toggle-job]').forEach(function (el) {
      el.addEventListener('click', function () {
        var id = el.getAttribute('data-toggle-job');
        if (state.expandedJobId !== id) {
          var jj = state.data.jobs.find(function (x) { return x.id === id; });
          if (jj) loadJobPhotos(jj);
        }
        state.expandedJobId = state.expandedJobId === id ? null : id;
        render();
      });
    });
    box.querySelectorAll('[data-ph-add]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.stopPropagation();
        var parts = el.getAttribute('data-ph-add').split(':');
        _photoTarget = { kind: parts[0], id: parts[1] };
        photoInput.click();
      });
    });
    box.querySelectorAll('[data-ph-open]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.stopPropagation();
        var parts = el.getAttribute('data-ph-open').split(':');
        var kind = parts[0], id = parts[1], idx = Number(parts[2]);
        var owner = photoOwner(kind, id);
        if (owner) loadPhotos(owner.photos);
        if (!state.viewer) histPush();
        state.viewer = { kind: kind, id: id, idx: idx };
        render();
      });
    });
    box.querySelectorAll('[data-job-pay]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.stopPropagation();
        openPay(el.getAttribute('data-job-pay'));
      });
    });
    box.querySelectorAll('[data-pay-edit]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.stopPropagation();
        var parts = el.getAttribute('data-pay-edit').split(':');
        openPay(parts[0], parts[1]);
      });
    });
    box.querySelectorAll('[data-pay-del]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.stopPropagation();
        var parts = el.getAttribute('data-pay-del').split(':');
        var jobId = parts[0], payId = parts[1];
        confirm2('delpay:' + payId, function () { delPayment(jobId, payId); });
      });
    });
    box.querySelectorAll('[data-job-post]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.stopPropagation();
        openPost(el.getAttribute('data-job-post'), null);
      });
    });
    box.querySelectorAll('[data-job-edit]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.stopPropagation();
        var j = state.data.jobs.find(function (x) { return x.id === el.getAttribute('data-job-edit'); });
        if (j) openEditJob(j);
      });
    });
    box.querySelectorAll('[data-job-del]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.stopPropagation();
        var id = el.getAttribute('data-job-del');
        confirm2('delj:' + id, function () {
          var jj = state.data.jobs.find(function (x) { return x.id === id; });
          if (jj) delOwnerPhotos(jj);
          mutate(function (d) {
            d.jobs = d.jobs.filter(function (x) { return x.id !== id; });
          });
          toast('Trabajo eliminado.');
        });
      });
    });
  }

  // ===== Render: Inicio =====
  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  function renderInicio() {
    var D = state.data;
    var box = document.getElementById('inicio-content');
    var today = todayIso();
    var bal = clientBalances();
    var cById = {};
    D.clients.forEach(function (c) { cById[c.id] = c; });
    var alerts = buildAlerts();
    var alVenc = alerts.filter(function (a) { return a.group === 'venc'; });
    var alHoy = alerts.filter(function (a) { return a.group === 'hoy'; });
    var sumUnique = function (list) {
      var seen = {}, sum = 0;
      list.forEach(function (a) { if (!seen[a.j.id]) { seen[a.j.id] = true; sum += a.bal; } });
      return sum;
    };
    var vencSum = sumUnique(alVenc), hoySum = sumUnique(alHoy);
    var tot = totalPending();
    var credCount = D.jobs.filter(function (j) { return jobBalance(j) > 0; }).length;
    var debtClients = debtClientsCount();
    var totSub = credCount + (credCount === 1 ? ' trabajo con saldo' : ' trabajos con saldo') +
      ' · ' + debtClients + (debtClients === 1 ? ' cliente' : ' clientes');

    var mes = today.slice(0, 7);
    var mesReal = D.jobs.filter(function (j) { return (j.date || '').slice(0, 7) === mes; })
      .reduce(function (a, j) { return a + (Number(j.price) || 0); }, 0);
    var mesCob = 0;
    D.jobs.forEach(function (j) {
      if (j.credit) {
        (j.payments || []).forEach(function (p) {
          if ((p.date || '').slice(0, 7) === mes) mesCob += Number(p.amount) || 0;
        });
      } else if ((j.date || '').slice(0, 7) === mes) {
        mesCob += Number(j.price) || 0;
      }
    });
    var mesLabel = MESES[Number(today.slice(5, 7)) - 1] + ' ' + today.slice(0, 4);
    mesLabel = mesLabel.charAt(0).toUpperCase() + mesLabel.slice(1);
    var mesPct = mesReal > 0 ? Math.min(100, Math.round(mesCob / mesReal * 100)) : 0;

    var html = '';
    // recordatorio de copia de seguridad
    if (backupDue()) {
      var dsbI = daysSinceBackup();
      var bmsg = dsbI === null
        ? 'Todavía no guardaste una copia de tus datos. Guardala en tu Drive o correo para no perderlos.'
        : 'Hace ' + dsbI + ' días que no guardás copia. Guardala para no perder tus datos si perdés el teléfono.';
      html += '<div class="backup-banner"><span>' + esc(bmsg) + '</span>' +
        '<button type="button" class="js-backup-now">Guardar copia</button></div>';
    }
    // aviso de mantenimientos vencidos o para hoy
    var maintDue = maintAlerts().filter(function (m) { return m.diff <= 0; });
    if (maintDue.length) {
      var mMsg = maintDue.length === 1
        ? 'Mantenimiento pendiente: ' + maintDue[0].c.name + ' (' + maintDiffLabel(maintDue[0].diff) + ').'
        : 'Tenés ' + maintDue.length + ' mantenimientos vencidos o para hoy.';
      html += '<div class="maint-banner"><span>🔧 ' + esc(mMsg) + '</span>' +
        '<button type="button" data-go="cobros">Ver</button></div>';
    }
    html += '<div class="stat-grid">' +
      '<div class="stat-tot"><div class="stat-tot-label">Total por cobrar</div>' +
      '<div class="stat-tot-amount">' + esc(fmtG(tot)) + '</div>' +
      '<div class="stat-tot-sub">' + esc(totSub) + '</div></div>' +
      '<div class="stat-mini venc" data-go="cobros"><div class="stat-mini-label"><span class="dot"></span>Vencidos · ' + alVenc.length + '</div>' +
      '<div class="stat-mini-amount">' + esc(fmtG(vencSum)) + '</div></div>' +
      '<div class="stat-mini hoy" data-go="cobros"><div class="stat-mini-label"><span class="dot"></span>Hoy · ' + alHoy.length + '</div>' +
      '<div class="stat-mini-amount">' + esc(fmtG(hoySum)) + '</div></div>' +
      '<div class="stat-mes"><div class="stat-mes-label">' + esc(mesLabel) + '</div>' +
      '<div class="mes-row"><span>Realizado</span><span class="mono">' + esc(fmtG(mesReal)) + '</span></div>' +
      '<div class="mes-bar"><div class="real"></div></div>' +
      '<div class="mes-row"><span>Cobrado</span><span class="mono blue">' + esc(fmtG(mesCob)) + '</span></div>' +
      '<div class="mes-bar"><div class="cob" style="width:' + mesPct + '%;"></div></div></div>' +
      '</div>';

    // acceso al registro mensual de ingresos
    html += '<button type="button" class="reg-open" data-go="registro">' +
      '<span class="reg-open-main"><span class="reg-open-title">Registro mensual de ingresos</span>' +
      '<span class="reg-open-sub">Facturado y cobrado, mes por mes</span></span>' +
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg></button>';

    // mayores deudores
    var deudores = D.clients
      .map(function (c) { return { c: c, bal: bal[c.id] || 0 }; })
      .filter(function (x) { return x.bal > 0; })
      .sort(function (a, b) { return b.bal - a.bal; })
      .slice(0, 4);
    var deudoresHtml;
    if (deudores.length) {
      deudoresHtml = '<div class="panel-list">' + deudores.map(function (x) {
        return '<div class="panel-row" data-open-client="' + esc(x.c.id) + '">' +
          '<span class="panel-row-name">' + esc(x.c.name) + '</span>' +
          '<span class="panel-row-amount">' + esc(fmtG(x.bal)) + '</span></div>';
      }).join('') + '</div>';
    } else {
      deudoresHtml = '<div class="panel-empty">Nadie te debe en este momento.</div>';
    }

    // últimos trabajos
    var ultimos = D.jobs.slice()
      .sort(function (a, b) { return a.date < b.date ? 1 : -1; })
      .slice(0, 5);
    var ultimosHtml;
    if (ultimos.length) {
      ultimosHtml = '<div class="panel-list">' + ultimos.map(function (j) {
        var jb = jobBalance(j);
        var isPaid = j.credit ? jb <= 0 : true;
        var chip = j.credit ? (isPaid ? 'Pagado' : 'Debe ' + mill(jb)) : 'Contado';
        var chipBg = isPaid ? '#E9F5EF' : '#FBEEEA';
        var chipFg = isPaid ? '#1F8A5B' : '#C2452D';
        var c = cById[j.clientId];
        return '<div class="panel-row" data-open-client="' + esc(j.clientId) + '">' +
          '<div class="panel-row-main"><div class="panel-row-desc">' + esc(j.desc || j.category) + '</div>' +
          '<div class="panel-row-sub">' + esc((c ? c.name : '—') + ' · ' + ddShort(j.date)) + '</div></div>' +
          '<span class="panel-chip" style="background:' + chipBg + ';color:' + chipFg + ';">' + esc(chip) + '</span></div>';
      }).join('') + '</div>';
    } else {
      ultimosHtml = '<div class="panel-empty">Todavía no cargaste trabajos. Usá el botón «+».</div>';
    }

    html += '<div class="two-cols">' +
      '<div class="panel"><div class="panel-label">Mayor deuda</div>' + deudoresHtml + '</div>' +
      '<div class="panel"><div class="panel-label">Últimos trabajos</div>' + ultimosHtml + '</div>' +
      '</div>';

    box.innerHTML = html;
    box.querySelectorAll('[data-go]').forEach(function (el) {
      el.addEventListener('click', function () { go(el.getAttribute('data-go')); });
    });
    box.querySelectorAll('[data-open-client]').forEach(function (el) {
      el.addEventListener('click', function () { goClient(el.getAttribute('data-open-client')); });
    });
    var backupBtn = box.querySelector('.js-backup-now');
    if (backupBtn) backupBtn.addEventListener('click', doCloudBackup);
  }

  // ===== Registro mensual de ingresos =====
  // Se calcula al vuelo desde trabajos y pagos existentes (sin datos nuevos):
  //  - Facturado: precio del trabajo, en el mes de su fecha (contado o crédito).
  //  - Cobrado: contado -> precio en el mes del trabajo; crédito -> cada pago
  //    en el mes de la fecha del pago. Refleja el flujo de caja real por mes.
  function monthName(ym) {
    var s = MESES[Number(ym.slice(5, 7)) - 1] || '';
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  function monthlyStats() {
    var map = {};
    function bkt(ym) { if (!map[ym]) map[ym] = { facturado: 0, cobrado: 0, gastos: 0 }; return map[ym]; }
    (state.data.jobs || []).forEach(function (j) {
      var jm = (j.date || '').slice(0, 7);
      var price = Number(j.price) || 0;
      if (jm) bkt(jm).facturado += price;
      if (j.credit) {
        (j.payments || []).forEach(function (p) {
          var pm = (p.date || '').slice(0, 7);
          if (pm) bkt(pm).cobrado += Number(p.amount) || 0;
        });
      } else if (jm) {
        bkt(jm).cobrado += price;
      }
    });
    (state.data.expenses || []).forEach(function (e) {
      var em = (e.date || '').slice(0, 7);
      if (em) bkt(em).gastos += Number(e.amount) || 0;
    });
    return Object.keys(map).sort().reverse().map(function (ym) {
      var m = map[ym];
      return { ym: ym, mes: monthName(ym), anio: ym.slice(0, 4), facturado: m.facturado, cobrado: m.cobrado, gastos: m.gastos, resultado: m.cobrado - m.gastos };
    });
  }

  function renderRegistro() {
    var box = document.getElementById('registro-content');
    var rows = monthlyStats();
    var html = '<div class="detail-header">' +
      '<button type="button" class="btn-white js-back"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>Volver</button>' +
      '<div class="spacer"></div></div>';

    // acceso al módulo de gastos (y desde ahí, personales)
    html += '<button type="button" class="reg-open js-goto-gastos">' +
      '<span class="reg-open-main"><span class="reg-open-title">Gastos del negocio</span>' +
      '<span class="reg-open-sub">Registrar combustible, viáticos, personal…</span></span>' +
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg></button>';

    if (!rows.length) {
      html += '<div class="panel"><div class="panel-empty">Todavía no hay movimientos. Cuando registres trabajos o gastos, vas a ver acá el resumen mes por mes.</div></div>';
      box.innerHTML = html;
      box.querySelector('.js-back').addEventListener('click', function () { go('inicio'); });
      box.querySelector('.js-goto-gastos').addEventListener('click', function () { go('gastos'); });
      return;
    }

    // totales generales (todo el historial)
    var totF = 0, totC = 0, totG = 0;
    rows.forEach(function (r) { totF += r.facturado; totC += r.cobrado; totG += r.gastos; });
    var totR = totC - totG;
    html += '<div class="reg-total"><div class="reg-total-row"><span>Facturado (total)</span>' +
      '<span class="mono">' + esc(fmtG(totF)) + '</span></div>' +
      '<div class="reg-total-row"><span>Cobrado (total)</span>' +
      '<span class="mono blue">' + esc(fmtG(totC)) + '</span></div>' +
      '<div class="reg-total-row"><span>Gastos (total)</span>' +
      '<span class="mono red">− ' + esc(fmtG(totG)) + '</span></div>' +
      '<div class="reg-total-row result"><span>Resultado (cobrado − gastos)</span>' +
      '<span class="mono ' + (totR >= 0 ? 'green' : 'red') + '">' + esc(fmtG(totR)) + '</span></div></div>';

    html += '<div class="reg-hint">Facturado = trabajos hechos ese mes. Cobrado = plata que entró. Resultado = cobrado − gastos del mes.</div>';

    // meses agrupados por año, con subtotal anual
    var lastYear = null;
    rows.forEach(function (r) {
      if (r.anio !== lastYear) {
        var yC = 0, yG = 0;
        rows.forEach(function (x) { if (x.anio === r.anio) { yC += x.cobrado; yG += x.gastos; } });
        html += '<div class="reg-year"><span class="reg-year-lbl">' + esc(r.anio) + '</span>' +
          '<span class="reg-year-nums">Cob. ' + esc(fmtG(yC)) + ' · Gas. ' + esc(fmtG(yG)) + ' · Res. ' + esc(fmtG(yC - yG)) + '</span></div>';
        lastYear = r.anio;
      }
      html += '<div class="reg-row" data-reg-month="' + esc(r.ym) + '">' +
        '<div class="reg-mes">' + esc(r.mes) +
        '<svg class="reg-chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg></div>' +
        '<div class="reg-nums">' +
          '<div class="reg-num"><span class="reg-cap">Facturado</span><span class="reg-val mono">' + esc(fmtG(r.facturado)) + '</span></div>' +
          '<div class="reg-num"><span class="reg-cap">Cobrado</span><span class="reg-val mono blue">' + esc(fmtG(r.cobrado)) + '</span></div>' +
          '<div class="reg-num"><span class="reg-cap">Gastos</span><span class="reg-val mono red">' + (r.gastos ? '− ' + esc(fmtG(r.gastos)) : esc(fmtG(0))) + '</span></div>' +
          '<div class="reg-num"><span class="reg-cap">Resultado</span><span class="reg-val mono ' + (r.resultado >= 0 ? 'green' : 'red') + '">' + esc(fmtG(r.resultado)) + '</span></div>' +
        '</div></div>';
    });

    box.innerHTML = html;
    box.querySelector('.js-back').addEventListener('click', function () { go('inicio'); });
    box.querySelector('.js-goto-gastos').addEventListener('click', function () { go('gastos'); });
    box.querySelectorAll('[data-reg-month]').forEach(function (el) {
      el.addEventListener('click', function () { goRegMonth(el.getAttribute('data-reg-month')); });
    });
  }

  // ===== Detalle de un mes: facturación y cobros con cliente y fecha =====
  function monthDetail(ym) {
    var D = state.data;
    var cById = {};
    (D.clients || []).forEach(function (c) { cById[c.id] = c; });
    var facturado = [], cobrado = [];
    (D.jobs || []).forEach(function (j) {
      var jm = (j.date || '').slice(0, 7);
      var cname = (cById[j.clientId] || {}).name || 'Cliente eliminado';
      var desc = j.desc || j.category || 'Trabajo';
      var exists = !!cById[j.clientId];
      if (jm === ym) {
        facturado.push({ client: cname, clientId: exists ? j.clientId : '', desc: desc, date: j.date, amount: Number(j.price) || 0, credit: j.credit });
      }
      if (j.credit) {
        (j.payments || []).forEach(function (p) {
          if ((p.date || '').slice(0, 7) === ym) {
            cobrado.push({ client: cname, clientId: exists ? j.clientId : '', concept: (p.note || '').trim() || 'Pago', desc: desc, date: p.date, amount: Number(p.amount) || 0 });
          }
        });
      } else if (jm === ym) {
        cobrado.push({ client: cname, clientId: exists ? j.clientId : '', concept: 'Contado', desc: desc, date: j.date, amount: Number(j.price) || 0 });
      }
    });
    var byDate = function (a, b) { return (a.date || '') < (b.date || '') ? -1 : 1; };
    facturado.sort(byDate); cobrado.sort(byDate);
    return { facturado: facturado, cobrado: cobrado };
  }

  function renderRegMonth() {
    var box = document.getElementById('regmes-content');
    var ym = state.regMonth;
    var det = monthDetail(ym);
    var totF = det.facturado.reduce(function (a, x) { return a + x.amount; }, 0);
    var totC = det.cobrado.reduce(function (a, x) { return a + x.amount; }, 0);
    var gastosMes = (state.data.expenses || []).filter(function (e) { return (e.date || '').slice(0, 7) === ym; })
      .sort(function (a, b) { return (a.date || '') < (b.date || '') ? -1 : 1; });
    var totG = gastosMes.reduce(function (a, x) { return a + (Number(x.amount) || 0); }, 0);
    var totR = totC - totG;

    var html = '<div class="detail-header">' +
      '<button type="button" class="btn-white js-back"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>Volver</button>' +
      '<div class="spacer"></div></div>';

    html += '<div class="regd-head"><div class="regd-title">' + esc(monthName(ym) + ' ' + (ym || '').slice(0, 4)) + '</div>' +
      '<div class="regd-tots">' +
        '<div class="regd-tot"><span class="regd-tot-cap">Facturado</span><span class="regd-tot-val mono">' + esc(fmtG(totF)) + '</span></div>' +
        '<div class="regd-tot"><span class="regd-tot-cap">Cobrado</span><span class="regd-tot-val mono blue">' + esc(fmtG(totC)) + '</span></div>' +
        '<div class="regd-tot"><span class="regd-tot-cap">Gastos</span><span class="regd-tot-val mono red">' + (totG ? '− ' + esc(fmtG(totG)) : esc(fmtG(0))) + '</span></div>' +
        '<div class="regd-tot"><span class="regd-tot-cap">Resultado</span><span class="regd-tot-val mono ' + (totR >= 0 ? 'green' : 'red') + '">' + esc(fmtG(totR)) + '</span></div>' +
      '</div></div>';

    // Facturación del mes (trabajos hechos ese mes)
    html += '<div class="panel"><div class="panel-label">Facturado · ' + det.facturado.length +
      (det.facturado.length === 1 ? ' trabajo' : ' trabajos') + '</div>';
    if (det.facturado.length) {
      html += '<div class="regd-list">' + det.facturado.map(function (x) {
        var chip = x.credit ? 'Crédito' : 'Contado';
        var chipCls = x.credit ? 'cred' : 'cont';
        var tap = x.clientId ? ' tap" data-open-client="' + esc(x.clientId) + '"' : '"';
        return '<div class="regd-row' + tap + '><div class="regd-main">' +
          '<div class="regd-name">' + esc(x.client) + '</div>' +
          '<div class="regd-sub">' + esc(x.desc + ' · ' + ddShort(x.date)) + '</div></div>' +
          '<div class="regd-right"><span class="regd-amt mono">' + esc(fmtG(x.amount)) + '</span>' +
          '<span class="regd-chip ' + chipCls + '">' + chip + '</span></div></div>';
      }).join('') + '</div>';
    } else {
      html += '<div class="panel-empty">No hubo trabajos facturados este mes.</div>';
    }
    html += '</div>';

    // Cobros del mes (plata que entró ese mes)
    html += '<div class="panel"><div class="panel-label">Cobrado · ' + det.cobrado.length +
      (det.cobrado.length === 1 ? ' movimiento' : ' movimientos') + '</div>';
    if (det.cobrado.length) {
      html += '<div class="regd-list">' + det.cobrado.map(function (x) {
        var tap = x.clientId ? ' tap" data-open-client="' + esc(x.clientId) + '"' : '"';
        return '<div class="regd-row' + tap + '><div class="regd-main">' +
          '<div class="regd-name">' + esc(x.client) + '</div>' +
          '<div class="regd-sub">' + esc(x.concept + ' · ' + x.desc + ' · ' + ddShort(x.date)) + '</div></div>' +
          '<span class="regd-amt mono blue">' + esc(fmtG(x.amount)) + '</span></div>';
      }).join('') + '</div>';
    } else {
      html += '<div class="panel-empty">No entró dinero este mes.</div>';
    }
    html += '</div>';

    // Gastos del mes
    html += '<div class="panel"><div class="panel-label">Gastos · ' + gastosMes.length +
      (gastosMes.length === 1 ? ' movimiento' : ' movimientos') + '</div>';
    if (gastosMes.length) {
      html += '<div class="regd-list">' + gastosMes.map(function (e) {
        var st = e.staffId ? staffById(e.staffId) : null;
        var sub = [e.subtype || '', st ? st.name : (e.staffId ? '(personal eliminado)' : ''), e.note || '']
          .filter(Boolean).join(' · ');
        return '<div class="regd-row tap" data-goto-gastos="1"><div class="regd-main">' +
          '<div class="regd-name">' + esc(e.category || 'Gasto') + '</div>' +
          '<div class="regd-sub">' + esc((sub ? sub + ' · ' : '') + ddShort(e.date)) + '</div></div>' +
          '<span class="regd-amt mono red">− ' + esc(fmtG(e.amount)) + '</span></div>';
      }).join('') + '</div>';
    } else {
      html += '<div class="panel-empty">No hubo gastos registrados este mes.</div>';
    }
    html += '</div>';

    box.innerHTML = html;
    box.querySelector('.js-back').addEventListener('click', function () { go('registro'); });
    box.querySelectorAll('[data-open-client]').forEach(function (el) {
      el.addEventListener('click', function () { goClient(el.getAttribute('data-open-client')); });
    });
    box.querySelectorAll('[data-goto-gastos]').forEach(function (el) {
      el.addEventListener('click', function () { go('gastos'); });
    });
  }

  // ===== Render: Gastos =====
  function renderGastos() {
    var box = document.getElementById('gastos-content');
    var exps = (state.data.expenses || []).slice()
      .sort(function (a, b) { return (a.date || '') < (b.date || '') ? 1 : -1; });
    var phEntries = [];
    exps.forEach(function (e) { (e.photos || []).forEach(function (p) { phEntries.push(p); }); });
    loadPhotos(phEntries);

    var html = '<div class="detail-header">' +
      '<button type="button" class="btn-white js-back"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>Volver</button>' +
      '<div class="spacer"></div>' +
      '<button type="button" class="btn-white js-goto-personal">Personales</button></div>';

    html += '<button type="button" class="btn-big-primary js-new-expense">+ Registrar gasto</button>';

    if (!exps.length) {
      html += '<div class="dashed-card">Todavía no registraste gastos. Cargá acá el combustible, los viáticos, los pagos al personal y todo lo que gasta el negocio — así el registro mensual muestra tu resultado real.</div>';
    } else {
      var lastMonth = null;
      exps.forEach(function (e) {
        var em = (e.date || '').slice(0, 7);
        if (em !== lastMonth) {
          var mTot = exps.reduce(function (a, x) { return a + ((x.date || '').slice(0, 7) === em ? (Number(x.amount) || 0) : 0); }, 0);
          html += '<div class="reg-year"><span class="reg-year-lbl">' + esc(monthName(em) + ' ' + em.slice(0, 4)) + '</span>' +
            '<span class="reg-year-nums">− ' + esc(fmtG(mTot)) + '</span></div>';
          lastMonth = em;
        }
        var st = e.staffId ? staffById(e.staffId) : null;
        var job = e.jobId ? (state.data.jobs || []).find(function (j) { return j.id === e.jobId; }) : null;
        var subBits = [
          e.subtype || '',
          st ? st.name : (e.staffId ? '(personal eliminado)' : ''),
          job ? 'por: ' + (job.desc || job.category) : '',
          e.note || ''
        ].filter(Boolean);
        var delLbl = state.confirmKey === 'delexp:' + e.id ? '¿?' : '✕';
        html += '<div class="exp-row">' +
          '<div class="exp-main">' +
          '<div class="exp-top"><span class="exp-chip">' + esc(e.category || 'Gasto') + '</span>' +
          '<span class="exp-date">' + esc(dd(e.date)) + '</span></div>' +
          (subBits.length ? '<div class="exp-note">' + esc(subBits.join(' · ')) + '</div>' : '') +
          ((e.photos || []).length ? '<div class="photo-grid mini">' + (e.photos || []).map(function (p, i) {
            var src = state.photoCache[p.id] || PIXEL;
            return '<img class="photo-thumb sm" alt="Comprobante" src="' + esc(src) + '" data-ph-open="exp:' + esc(e.id) + ':' + i + '">';
          }).join('') + '</div>' : '') +
          '</div>' +
          '<div class="exp-right"><span class="exp-amt mono">− ' + esc(fmtG(e.amount)) + '</span>' +
          '<div class="exp-actions">' +
          '<button type="button" class="pay-btn" data-exp-photo="' + esc(e.id) + '" aria-label="Agregar comprobante">📷</button>' +
          '<button type="button" class="pay-btn pay-edit" data-exp-edit="' + esc(e.id) + '" aria-label="Editar gasto">✎</button>' +
          '<button type="button" class="pay-btn pay-del" data-exp-del="' + esc(e.id) + '" aria-label="Borrar gasto">' + delLbl + '</button>' +
          '</div></div></div>';
      });
    }

    box.innerHTML = html;
    box.querySelector('.js-back').addEventListener('click', function () { go('registro'); });
    box.querySelector('.js-goto-personal').addEventListener('click', function () { go('personal'); });
    box.querySelector('.js-new-expense').addEventListener('click', function () { openExpenseModal(null); });
    box.querySelectorAll('[data-exp-edit]').forEach(function (el) {
      el.addEventListener('click', function () {
        var e = (state.data.expenses || []).find(function (x) { return x.id === el.getAttribute('data-exp-edit'); });
        if (e) openExpenseModal(e);
      });
    });
    box.querySelectorAll('[data-exp-del]').forEach(function (el) {
      el.addEventListener('click', function () {
        var id = el.getAttribute('data-exp-del');
        confirm2('delexp:' + id, function () { delExpense(id); });
      });
    });
    box.querySelectorAll('[data-exp-photo]').forEach(function (el) {
      el.addEventListener('click', function () {
        _photoTarget = { kind: 'exp', id: el.getAttribute('data-exp-photo') };
        photoInput.click();
      });
    });
    box.querySelectorAll('[data-ph-open]').forEach(function (el) {
      el.addEventListener('click', function () {
        var parts = el.getAttribute('data-ph-open').split(':');
        var owner = photoOwner(parts[0], parts[1]);
        if (owner) loadPhotos(owner.photos);
        if (!state.viewer) histPush();
        state.viewer = { kind: parts[0], id: parts[1], idx: Number(parts[2]) };
        render();
      });
    });
  }

  // ===== Render: Personales =====
  function renderPersonal() {
    var box = document.getElementById('personal-content');
    var staff = (state.data.staff || []).slice()
      .sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });
    var paidBy = {};
    (state.data.expenses || []).forEach(function (e) {
      if (e.staffId) paidBy[e.staffId] = (paidBy[e.staffId] || 0) + (Number(e.amount) || 0);
    });

    var html = '<div class="detail-header">' +
      '<button type="button" class="btn-white js-back"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>Volver</button>' +
      '<div class="spacer"></div></div>';

    html += '<button type="button" class="btn-big-primary js-new-staff">+ Agregar personal</button>';

    if (!staff.length) {
      html += '<div class="dashed-card">Todavía no cargaste personales. Agregá a las personas que te ayudan en los trabajos para registrar cuánto le pagás a cada uno.</div>';
    } else {
      html += staff.map(function (s) {
        var meta = [s.phone || '', s.ci || ''].filter(Boolean).join(' · ');
        var delLbl = state.confirmKey === 'delstaff:' + s.id ? '¿Seguro?' : '✕';
        return '<div class="staff-row">' +
          '<div class="avatar">' + esc(initials(s.name)) + '</div>' +
          '<div class="staff-main"><div class="staff-name">' + esc(s.name) + '</div>' +
          '<div class="staff-sub">' + esc(meta || 'Sin datos de contacto') + (s.notes ? ' · ' + esc(s.notes) : '') + '</div>' +
          '<div class="staff-paid">Pagado en total: <span class="mono">' + esc(fmtG(paidBy[s.id] || 0)) + '</span></div></div>' +
          '<div class="exp-actions">' +
          '<button type="button" class="pay-btn pay-edit" data-staff-edit="' + esc(s.id) + '" aria-label="Editar personal">✎</button>' +
          '<button type="button" class="pay-btn pay-del" data-staff-del="' + esc(s.id) + '" aria-label="Borrar personal">' + delLbl + '</button>' +
          '</div></div>';
      }).join('');
    }

    box.innerHTML = html;
    box.querySelector('.js-back').addEventListener('click', function () { go('gastos'); });
    box.querySelector('.js-new-staff').addEventListener('click', function () { openStaffModal(null); });
    box.querySelectorAll('[data-staff-edit]').forEach(function (el) {
      el.addEventListener('click', function () {
        var s = (state.data.staff || []).find(function (x) { return x.id === el.getAttribute('data-staff-edit'); });
        if (s) openStaffModal(s);
      });
    });
    box.querySelectorAll('[data-staff-del]').forEach(function (el) {
      el.addEventListener('click', function () {
        var id = el.getAttribute('data-staff-del');
        confirm2('delstaff:' + id, function () { delStaff(id); });
      });
    });
  }

  // ===== Render: Cobros =====
  function alertDateLabel(a) {
    if (a.group === 'venc') {
      var n = Math.abs(a.diff);
      return 'Venció el ' + dd(a.x.date) + ' · hace ' + n + (n === 1 ? ' día' : ' días');
    }
    if (a.group === 'hoy') return 'Cobro previsto para hoy';
    return dd(a.x.date) + ' · en ' + a.diff + (a.diff === 1 ? ' día' : ' días');
  }
  function renderCobros() {
    var box = document.getElementById('cobros-content');
    var cById = {};
    state.data.clients.forEach(function (c) { cById[c.id] = c; });
    var alerts = buildAlerts();
    var sin = jobsSinFecha();
    var maints = maintAlerts();
    var perm = notifPerm();
    var html = '';

    if (!isNotifOn() && perm !== 'denied' && perm !== 'unsupported') {
      html += '<div class="notif-banner"><span>Activá las notificaciones para que el navegador te avise los cobros aunque no estés mirando la app.</span>' +
        '<button type="button" class="js-notif-on">Activar</button></div>';
    }

    if (!alerts.length && !sin.length && !maints.length) {
      html += '<div class="cobros-empty"><div class="cobros-empty-title">No hay cobros pendientes</div>' +
        '<div class="cobros-empty-text">Cuando cargues trabajos a crédito con fecha de cobro, van a aparecer acá.</div></div>';
    }

    var alertCard = function (a, cls) {
      var c = cById[a.j.clientId];
      return '<div class="alert-card ' + cls + '">' +
        '<div class="alert-top"><span class="alert-date">● ' + esc(alertDateLabel(a)) + '</span>' +
        '<span class="alert-saldo">' + esc(fmtG(a.bal)) + '</span></div>' +
        '<div class="alert-client" data-alert-open="' + esc(a.j.clientId) + '">' + esc(c ? c.name : '(cliente eliminado)') + '</div>' +
        '<div class="alert-desc">' + esc(a.j.desc || a.j.category) + '</div>' +
        '<div class="alert-actions">' +
        '<button type="button" class="btn-pay" data-alert-pay="' + esc(a.j.id) + '">Registrar pago</button>' +
        '<button type="button" class="btn-ghost" data-alert-post="' + esc(a.j.id) + '" data-dd="' + esc(a.x.id) + '">Posponer</button>' +
        (c && c.phone ? '<button type="button" class="btn-wa-sm" data-alert-wa="' + esc(a.j.clientId) + '" aria-label="Recordar por WhatsApp">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.5 8.5 0 0 1-12.3 7.6L4 20l1-4.5A8.5 8.5 0 1 1 21 11.5"/></svg></button>' : '') +
        '</div></div>';
    };

    var groups = [
      { key: 'venc', label: 'Vencidos', cls: 'red', card: 'venc' },
      { key: 'hoy', label: 'Para hoy', cls: 'amber', card: 'hoy' },
      { key: 'prox', label: 'Se acercan', cls: 'blue', card: 'prox' }
    ];
    groups.forEach(function (g) {
      var list = alerts.filter(function (a) { return a.group === g.key; });
      if (!list.length) return;
      html += '<div class="section-label ' + g.cls + '">' + g.label + ' · ' + list.length + '</div>';
      html += list.map(function (a) { return alertCard(a, g.card); }).join('');
    });

    if (maints.length) {
      html += '<div class="section-label teal">Mantenimientos · ' + maints.length + '</div>';
      html += maints.map(function (m) {
        return '<div class="maint-card' + (m.diff < 0 ? ' venc' : '') + '">' +
          '<div class="alert-top"><span class="maint-chip">🔧 Mantenimiento</span>' +
          '<span class="alert-date">' + esc(maintDiffLabel(m.diff)) + ' · ' + esc(ddShort(m.c.maint.next)) + '</span></div>' +
          '<div class="alert-client" data-alert-open="' + esc(m.c.id) + '">' + esc(m.c.name) + '</div>' +
          '<div class="alert-desc">Cada ' + esc(m.c.maint.months) + (Number(m.c.maint.months) === 1 ? ' mes' : ' meses') +
          (m.c.address ? ' · ' + esc(m.c.address) : '') + '</div>' +
          '<div class="alert-actions">' +
          '<button type="button" class="btn-pay" data-maint-done="' + esc(m.c.id) + '">✓ Hecho</button>' +
          '<button type="button" class="btn-ghost" data-maint-post="' + esc(m.c.id) + '">Posponer</button>' +
          '</div></div>';
      }).join('');
    }

    var fut = alerts.filter(function (a) { return a.group === 'fut'; });
    if (fut.length) {
      html += '<div class="section-label gray">Más adelante · ' + fut.length + '</div>';
      html += fut.map(function (a) {
        var c = cById[a.j.clientId];
        return '<div class="fut-card"><div class="fut-main">' +
          '<div class="fut-name" data-alert-open="' + esc(a.j.clientId) + '">' + esc(c ? c.name : '(cliente eliminado)') + '</div>' +
          '<div class="fut-sub">' + esc((a.j.desc || a.j.category) + ' · ' + alertDateLabel(a)) + '</div></div>' +
          '<div class="fut-right"><span class="fut-saldo">' + esc(fmtG(a.bal)) + '</span>' +
          '<button type="button" class="fut-pay" data-alert-pay="' + esc(a.j.id) + '">Cobrar</button></div></div>';
      }).join('');
    }

    if (sin.length) {
      html += '<div class="section-label gray">Con deuda pero sin fecha de cobro · ' + sin.length + '</div>';
      html += sin.map(function (j) {
        var c = cById[j.clientId];
        return '<div class="sinfecha-card"><div class="sinfecha-main">' +
          '<div class="fut-name" data-alert-open="' + esc(j.clientId) + '">' + esc(c ? c.name : '—') + '</div>' +
          '<div class="fut-sub">' + esc((j.desc || j.category) + ' · debe ' + fmtG(jobBalance(j))) + '</div></div>' +
          '<button type="button" class="fut-pay" data-alert-pay="' + esc(j.id) + '">Cobrar</button>' +
          '<button type="button" class="btn-fijar" data-sin-post="' + esc(j.id) + '">Fijar fecha</button></div>';
      }).join('');
    }

    box.innerHTML = html;
    var notifBtn = box.querySelector('.js-notif-on');
    if (notifBtn) notifBtn.addEventListener('click', toggleNotif);
    box.querySelectorAll('[data-alert-open]').forEach(function (el) {
      el.addEventListener('click', function () { goClient(el.getAttribute('data-alert-open')); });
    });
    box.querySelectorAll('[data-alert-pay]').forEach(function (el) {
      el.addEventListener('click', function () { openPay(el.getAttribute('data-alert-pay')); });
    });
    box.querySelectorAll('[data-alert-post]').forEach(function (el) {
      el.addEventListener('click', function () { openPost(el.getAttribute('data-alert-post'), el.getAttribute('data-dd')); });
    });
    box.querySelectorAll('[data-alert-wa]').forEach(function (el) {
      el.addEventListener('click', function () { openWaRemind(el.getAttribute('data-alert-wa')); });
    });
    box.querySelectorAll('[data-sin-post]').forEach(function (el) {
      el.addEventListener('click', function () { openPost(el.getAttribute('data-sin-post'), null); });
    });
    box.querySelectorAll('[data-maint-done]').forEach(function (el) {
      el.addEventListener('click', function () { maintDone(el.getAttribute('data-maint-done')); });
    });
    box.querySelectorAll('[data-maint-post]').forEach(function (el) {
      el.addEventListener('click', function () { openPostMaint(el.getAttribute('data-maint-post')); });
    });
  }

  // ===== Ajustes: respaldo (exportar / importar) =====
  function testNotif() {
    showNotif('JGM SERVICIOS', {
      body: 'Así te voy a avisar cuando haya cobros pendientes.',
      icon: 'assets/icon-192.png', badge: 'assets/icon-192.png', tag: 'jgm-test'
    });
  }
  // Arma el objeto de respaldo completo (datos + fotos) leyendo IndexedDB
  function buildBackupObject() {
    var data = state.data;
    var ids = [];
    (data.jobs || []).forEach(function (j) { (j.photos || []).forEach(function (p) { ids.push(p.id); }); });
    (data.clients || []).forEach(function (c) { (c.photos || []).forEach(function (p) { ids.push(p.id); }); });
    (data.expenses || []).forEach(function (e) { (e.photos || []).forEach(function (p) { ids.push(p.id); }); });
    return Promise.all(ids.map(function (id) { return idbGet(id).catch(function () { return null; }); })).then(function (vals) {
      var photos = {};
      ids.forEach(function (id, i) { if (vals[i]) photos[id] = vals[i]; });
      return Object.assign({}, data, { photos: photos });
    });
  }
  function downloadBlob(blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }
  // Registro de la última copia (para el recordatorio)
  function markBackup() { try { localStorage.setItem('jgm_lastBackup', todayIso()); } catch (e) {} }
  function lastBackupIso() { try { return localStorage.getItem('jgm_lastBackup') || null; } catch (e) { return null; } }
  function daysSinceBackup() { var d = lastBackupIso(); return d ? daysBetween(d, todayIso()) : null; }
  function backupDue() {
    if (state.data.clients.length === 0 && state.data.jobs.length === 0) return false;
    var n = daysSinceBackup();
    return n === null || n >= 7;
  }

  // Copia para la nube: SIN cifrar (se abre sin PIN), enviada por el menú de compartir
  function doCloudBackup() {
    buildBackupObject().then(function (out) {
      var n = Object.keys(out.photos || {}).length;
      var name = 'jgm-servicios-copia-' + todayIso() + '.json';
      var blob = new Blob([JSON.stringify(out)], { type: 'application/json' });
      var okMsg = 'Copia lista' + (n ? ' (incluye ' + n + (n === 1 ? ' foto)' : ' fotos)') : '') + '. Guardala en tu Drive o correo.';
      var done = function () { markBackup(); ajustesMsg = okMsg; render(); };
      var file;
      try { file = new File([blob], name, { type: 'application/json' }); } catch (e) { file = null; }
      if (file && navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
        navigator.share({ files: [file], title: 'Copia de seguridad — JGM SERVICIOS', text: 'Copia de tus clientes y cobros. Guardala en Drive o correo.' })
          .then(done)
          .catch(function (err) {
            if (err && err.name === 'AbortError') return; // el usuario canceló
            downloadBlob(blob, name); done();
          });
      } else {
        downloadBlob(blob, name); done();
      }
    }).catch(function () { ajustesMsg = 'No se pudo preparar la copia.'; render(); });
  }

  // Respaldo cifrado (se abre con el PIN) — descarga a archivo
  function doExport() {
    buildBackupObject().then(function (out) {
      var n = Object.keys(out.photos || {}).length;
      encryptBackup(out).then(function (envelope) {
        downloadBlob(new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json' }), 'jgm-servicios-respaldo-cifrado-' + todayIso() + '.json');
        markBackup();
        ajustesMsg = 'Respaldo cifrado descargado' + (n ? ' (incluye ' + n + (n === 1 ? ' foto).' : ' fotos).') : '.') + ' Se abre con tu PIN.';
        render();
      }).catch(function () { ajustesMsg = 'No se pudo cifrar el respaldo.'; render(); });
    }).catch(function () { ajustesMsg = 'No se pudo exportar.'; render(); });
  }
  function applyImport(d) {
    if (!(d && Array.isArray(d.clients) && Array.isArray(d.jobs) && d.settings)) {
      ajustesMsg = 'El archivo no parece un respaldo válido.';
      render();
      return;
    }
    normalizeData(d); // respaldos viejos (sin gastos/personal) importan sin romper
    var photos = (d.photos && typeof d.photos === 'object' && !Array.isArray(d.photos)) ? d.photos : {};
    delete d.photos;
    var nF = Object.keys(photos).length;
    _pp = {};
    idbClear().then(function () {
      return Promise.all(Object.keys(photos).map(function (id) { return idbPut(id, photos[id]); }));
    }).catch(function () {});
    persist(d);
    state.data = d;
    state.photoCache = photos;
    state.viewer = null;
    ensureDevice();
    ajustesMsg = 'Respaldo importado: ' + d.clients.length + ' clientes, ' + d.jobs.length + ' trabajos, ' +
      d.expenses.length + ' gastos, ' + d.staff.length + ' personales' + (nF ? ' y ' + nF + ' fotos.' : '.');
    render();
  }
  function doImportFile(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var parsed;
      try { parsed = JSON.parse(reader.result); }
      catch (err) { ajustesMsg = 'No se pudo leer el archivo.'; render(); return; }
      if (parsed && parsed.jgm === 'backup' && parsed.data) {
        // respaldo cifrado: se abre con el PIN actual
        decryptBackup(parsed).then(function (plain) { applyImport(plain); })
          .catch(function () { ajustesMsg = 'No se pudo abrir: el respaldo fue cifrado con otro PIN o está dañado.'; render(); });
      } else {
        // respaldo sin cifrar (compatibilidad)
        applyImport(parsed);
      }
    };
    reader.readAsText(file);
  }
  function loadDemo() {
    var d = demoData();
    persist(d);
    idbClear().catch(function () {});
    _pp = {};
    state.data = d;
    state.photoCache = {};
    state.viewer = null;
    ajustesMsg = 'Datos de ejemplo cargados. Cuando quieras empezar de cero, borralos.';
    render();
  }
  function wipeAll() {
    var d = {
      clients: [], jobs: [], expenses: [], staff: [],
      settings: { categories: defaultCats(), expenseCategories: defaultExpenseCats(), remindDays: 3, notifEnabled: state.data.settings.notifEnabled, devices: (state.data.settings.devices || []).slice() },
      demo: false
    };
    persist(d);
    idbClear().catch(function () {});
    _pp = {};
    state.data = d;
    state.photoCache = {};
    state.viewer = null;
    ajustesMsg = 'Se borraron todos los datos.';
    render();
  }

  // ===== Render: Ajustes =====
  function renderAjustes() {
    var S = state.data.settings;
    var box = document.getElementById('ajustes-content');
    var perm = notifPerm();
    var notifGranted = perm === 'granted';
    var notifOn = isNotifOn();
    var notifStatus = perm === 'unsupported' ? 'este navegador no soporta notificaciones'
      : perm === 'denied' ? 'bloqueadas por el navegador (habilitalas en la configuración del sitio)'
      : notifOn ? 'activadas — te aviso una vez al día si hay cobros' : 'desactivadas';
    var isEmpty = state.data.clients.length === 0 && state.data.jobs.length === 0;
    var demoLabel = state.confirmKey === 'demo' ? '¿Seguro? Tocá otra vez' : 'Cargar datos de ejemplo';
    var wipeLabel = state.confirmKey === 'wipe' ? '¿Seguro? Se pierde todo' : 'Borrar todos los datos';

    var html = '';
    // Notificaciones
    html += '<div class="set-card"><div class="set-title">Notificaciones</div>' +
      '<div class="set-desc">Estado: ' + esc(notifStatus) + '</div>' +
      '<div class="set-btn-row"><button type="button" class="set-btn-primary js-notif-toggle">' +
      (notifOn ? 'Desactivar avisos' : 'Activar notificaciones') + '</button>' +
      (notifGranted ? '<button type="button" class="set-btn-ghost js-notif-test">Probar aviso</button>' : '') +
      '</div></div>';

    // Aviso anticipado
    html += '<div class="set-card"><div class="set-title">Aviso anticipado por defecto</div>' +
      '<div class="set-desc tight">Cuántos días antes de cada fecha de cobro querés que aparezca el aviso (se puede cambiar por trabajo).</div>' +
      '<div class="remind-row"><input type="number" id="set-remind" min="0" max="60" value="' + esc(String(S.remindDays)) + '">' +
      '<span>días antes</span></div></div>';

    // Categorías
    html += '<div class="set-card"><div class="set-title">Categorías de servicio</div><div class="cat-list">';
    (S.categories || []).forEach(function (name, i) {
      html += '<span class="cat-tag">' + esc(name) + ' <span class="x" data-cat-rm="' + i + '">✕</span></span>';
    });
    html += '</div><div class="cat-add"><input id="set-cat-new" type="text" autocomplete="off" placeholder="Nueva categoría…">' +
      '<button type="button" class="set-btn-outline js-cat-add">Agregar</button></div></div>';

    // Categorías de gastos
    html += '<div class="set-card"><div class="set-title">Categorías de gastos</div><div class="cat-list">';
    (S.expenseCategories || []).forEach(function (name, i) {
      html += '<span class="cat-tag">' + esc(name) + ' <span class="x" data-ecat-rm="' + i + '">✕</span></span>';
    });
    html += '</div><div class="cat-add"><input id="set-ecat-new" type="text" autocomplete="off" placeholder="Nueva categoría de gasto…">' +
      '<button type="button" class="set-btn-outline js-ecat-add">Agregar</button></div></div>';

    // Respaldo
    var dsb = daysSinceBackup();
    var lastTxt = dsb === null ? 'Todavía no guardaste ninguna copia.'
      : dsb === 0 ? 'Última copia: hoy.'
      : dsb === 1 ? 'Última copia: ayer.'
      : 'Última copia: hace ' + dsb + ' días.';
    var lastCls = (dsb === null || dsb >= 7) ? ' style="color:#C2452D;font-weight:600;"' : '';
    html += '<div class="set-card"><div class="set-title">Respaldo de datos</div>' +
      '<div class="set-desc tight">Guardá una copia cada tanto en tu Google Drive o correo. Si perdés el teléfono, con esa copia recuperás todo en otro.</div>' +
      '<div class="set-desc"' + lastCls + '>' + esc(lastTxt) + '</div>' +
      '<button type="button" class="set-btn-primary set-btn-full js-cloud">☁ Guardar copia en la nube</button>' +
      '<div class="set-btn-row" style="margin-top:8px;">' +
      '<button type="button" class="set-btn-ghost js-import">Importar respaldo</button>' +
      '<button type="button" class="set-btn-ghost js-export">Exportar copia cifrada</button></div>' +
      '<div class="set-hint">La copia en la nube se abre sin PIN (recuperás aunque lo olvides). La cifrada se abre con tu PIN.</div>' +
      (ajustesMsg ? '<div class="set-msg">' + esc(ajustesMsg) + '</div>' : '') + '</div>';

    // Datos de la app
    html += '<div class="set-card"><div class="set-title">Datos de la aplicación</div>' +
      '<div class="set-desc">' + (isEmpty
        ? 'La app está vacía y lista para cargar tus datos. Si querés ver un ejemplo de cómo se usa, podés cargar datos de muestra (después borralos).'
        : 'Cuando quieras vaciar todo y empezar de cero, borrá los datos.') + '</div>' +
      '<div class="set-btn-row">' +
      (isEmpty ? '<button type="button" class="set-btn-ghost js-demo">' + esc(demoLabel) + '</button>' : '') +
      '<button type="button" class="set-btn-danger js-wipe">' + esc(wipeLabel) + '</button></div></div>';

    // Seguridad (PIN + dispositivos)
    if (cryptoOk) {
      var devs = devices();
      var myId = deviceId();
      html += '<div class="set-card"><div class="set-title">Seguridad</div>' +
        '<div class="set-desc">La app se abre con tu PIN (de 6 a 10 números) y se bloquea sola tras unos minutos sin usarla. Tras varios PIN equivocados se bloquea un rato (y cada vez más), para frenar a quien intente adivinarlo. El respaldo se exporta cifrado.</div>' +
        '<div class="set-btn-row" style="margin-bottom:12px;"><button type="button" class="set-btn-primary js-change-pin">Cambiar PIN</button>' +
        '<button type="button" class="set-btn-ghost js-lock-now">Bloquear ahora</button></div>' +
        '<div class="set-desc tight">Dispositivos autorizados · ' + devs.length + ' / 4</div><div class="dev-list">';
      if (devs.length) {
        devs.forEach(function (dv) {
          html += '<div class="dev-item"><div><span class="lock-dev-name">' + esc(dv.name || 'Dispositivo') +
            '</span>' + (dv.id === myId ? '<span class="dev-this">este</span>' : '') +
            '<div class="lock-dev-meta">Agregado ' + esc(dd(dv.added)) + '</div></div>' +
            '<button type="button" class="lock-dev-rm" data-dev-rm="' + esc(dv.id) + '">Quitar</button></div>';
        });
      } else {
        html += '<div class="set-desc" style="margin:0;">Todavía no hay dispositivos registrados.</div>';
      }
      html += '</div></div>';
    }

    // Pie con logo + versión
    html += '<div class="ajustes-footer"><img src="assets/jgm-logo.png" alt="JGM SERVICIOS">' +
      '<span>Gestor de clientes y cobros · v0.1.0</span></div>';

    box.innerHTML = html;

    box.querySelector('.js-notif-toggle').addEventListener('click', toggleNotif);
    var testBtn = box.querySelector('.js-notif-test');
    if (testBtn) testBtn.addEventListener('click', testNotif);
    box.querySelector('#set-remind').addEventListener('change', function (e) {
      var v = Math.max(0, Math.min(60, Number(e.target.value) || 0));
      mutate(function (d) { d.settings.remindDays = v; });
    });
    box.querySelectorAll('[data-cat-rm]').forEach(function (el) {
      el.addEventListener('click', function () {
        var i = Number(el.getAttribute('data-cat-rm'));
        mutate(function (d) { d.settings.categories.splice(i, 1); });
      });
    });
    var addCat = function () {
      var input = box.querySelector('#set-cat-new');
      var v = (input.value || '').trim();
      if (!v) return;
      mutate(function (d) { if (d.settings.categories.indexOf(v) === -1) d.settings.categories.push(v); });
    };
    box.querySelector('.js-cat-add').addEventListener('click', addCat);
    box.querySelector('#set-cat-new').addEventListener('keydown', function (e) { if (e.key === 'Enter') addCat(); });
    box.querySelectorAll('[data-ecat-rm]').forEach(function (el) {
      el.addEventListener('click', function () {
        var i = Number(el.getAttribute('data-ecat-rm'));
        mutate(function (d) { d.settings.expenseCategories.splice(i, 1); });
      });
    });
    var addECat = function () {
      var input = box.querySelector('#set-ecat-new');
      var v = (input.value || '').trim();
      if (!v) return;
      mutate(function (d) { if (d.settings.expenseCategories.indexOf(v) === -1) d.settings.expenseCategories.push(v); });
    };
    box.querySelector('.js-ecat-add').addEventListener('click', addECat);
    box.querySelector('#set-ecat-new').addEventListener('keydown', function (e) { if (e.key === 'Enter') addECat(); });
    box.querySelector('.js-cloud').addEventListener('click', doCloudBackup);
    box.querySelector('.js-export').addEventListener('click', doExport);
    box.querySelector('.js-import').addEventListener('click', function () { document.getElementById('import-input').click(); });
    var demoBtn = box.querySelector('.js-demo');
    if (demoBtn) demoBtn.addEventListener('click', function () { confirm2('demo', loadDemo); });
    box.querySelector('.js-wipe').addEventListener('click', function () { confirm2('wipe', wipeAll); });
    var chg = box.querySelector('.js-change-pin');
    if (chg) chg.addEventListener('click', changePinFlow);
    var lk = box.querySelector('.js-lock-now');
    if (lk) lk.addEventListener('click', lockAppNow);
    box.querySelectorAll('[data-dev-rm]').forEach(function (el) {
      el.addEventListener('click', function () {
        var rid = el.getAttribute('data-dev-rm');
        mutate(function (d) { d.settings.devices = (d.settings.devices || []).filter(function (x) { return x.id !== rid; }); });
        toast('Dispositivo quitado.');
      });
    });
  }

  // ===== Render: visor de fotos =====
  var viewerEl = document.getElementById('photo-viewer');
  function renderViewer() {
    var vs = state.viewer;
    if (!vs) { viewerEl.hidden = true; return; }
    var owner = photoOwner(vs.kind, vs.id);
    var list = owner ? (owner.photos || []) : [];
    if (!list.length) { state.viewer = null; viewerEl.hidden = true; return; }
    var idx = Math.max(0, Math.min(vs.idx, list.length - 1));
    var ph = list[idx];
    var multi = list.length > 1;
    document.getElementById('vw-img').src = state.photoCache[ph.id] || PIXEL;
    document.getElementById('vw-label').textContent =
      'Foto ' + (idx + 1) + ' de ' + list.length + (ph.date ? ' · ' + dd(ph.date) : '');
    document.getElementById('vw-nav').hidden = !multi;
    document.getElementById('vw-counter').textContent = (idx + 1) + ' / ' + list.length;
    document.getElementById('vw-del').textContent =
      state.confirmKey === 'delph:' + ph.id ? '¿Seguro? Tocá otra vez' : 'Eliminar foto';
    viewerEl.hidden = false;
  }

  // ===== Render principal =====
  function render() {
    var view = state.view;
    var t = titles()[view];

    // pantallas (la vista 'cliente' vive en su propia sección)
    document.querySelectorAll('.screen').forEach(function (s) {
      s.classList.toggle('active', s.id === 'screen-' + view);
    });

    // nav activa: Clientes queda resaltado en la ficha; Inicio en el registro
    var navView = view === 'cliente' ? 'clientes'
      : (view === 'registro' || view === 'regmes' || view === 'gastos' || view === 'personal' ? 'inicio' : view);
    document.querySelectorAll('[data-nav]').forEach(function (el) {
      if (el.classList.contains('nav-item') || el.classList.contains('tab-item')) {
        el.classList.toggle('active', el.getAttribute('data-nav') === navView);
      }
    });

    // títulos
    document.querySelector('.js-page-title').textContent = t[0];
    document.querySelector('.js-page-sub').textContent = t[1];

    // header móvil: logo en Inicio, título en el resto
    document.querySelector('.js-mobile-logo').hidden = view !== 'inicio';
    var mTitle = document.querySelector('.js-mobile-title');
    mTitle.hidden = view === 'inicio';
    mTitle.textContent = t[0];

    // botón "+ Cliente" solo en Clientes (escritorio)
    document.querySelector('.js-new-client').hidden = view !== 'clientes';

    // campanita (vencidos + hoy)
    var u = urgentCounts();
    var bell = u.venc + u.hoy;
    document.querySelectorAll('.js-bell-badge').forEach(function (b) {
      b.textContent = bell;
      b.hidden = bell === 0;
    });

    // total por cobrar (sidebar)
    document.querySelector('.js-total').textContent = fmtG(totalPending());

    // contenido dinámico
    if (view === 'inicio') renderInicio();
    if (view === 'clientes') renderClientesList();
    if (view === 'cliente') renderCliente();
    if (view === 'cobros') renderCobros();
    if (view === 'registro') renderRegistro();
    if (view === 'regmes') renderRegMonth();
    if (view === 'gastos') renderGastos();
    if (view === 'personal') renderPersonal();
    if (view === 'ajustes') renderAjustes();

    // visor de fotos (overlay, independiente de la pantalla)
    renderViewer();
  }

  // ===== Eventos globales =====
  document.querySelectorAll('[data-nav]').forEach(function (el) {
    el.addEventListener('click', function () { go(el.getAttribute('data-nav')); });
  });
  document.querySelectorAll('.js-new-job').forEach(function (el) {
    el.addEventListener('click', function () {
      openNewJob(state.view === 'cliente' ? state.clientId : null);
    });
  });
  document.querySelectorAll('.js-new-client').forEach(function (el) {
    el.addEventListener('click', function () { openClientModal(null); });
  });
  document.getElementById('search-input').addEventListener('input', function (e) {
    state.search = e.target.value;
    renderClientesList();
  });

  // modal cliente
  modalEl.addEventListener('click', function (e) { if (e.target === modalEl) closeClientModal(); });
  document.getElementById('cf-cancel').addEventListener('click', closeClientModal);
  document.getElementById('cf-save').addEventListener('click', submitClient);
  document.getElementById('cf-name').addEventListener('keydown', function (e) { if (e.key === 'Enter') submitClient(); });

  // modal trabajo
  jobModalEl.addEventListener('click', function (e) { if (e.target === jobModalEl) closeJobModal(); });
  document.getElementById('jf-cancel').addEventListener('click', closeJobModal);
  document.getElementById('jf-save').addEventListener('click', submitJob);
  document.getElementById('jf-contado').addEventListener('click', function () { jForm.credit = false; renderJobModalDynamic(); });
  document.getElementById('jf-credito').addEventListener('click', function () { jForm.credit = true; renderJobModalDynamic(); });
  document.getElementById('jf-add-due').addEventListener('click', function () {
    var v = document.getElementById('jf-due-new').value;
    if (!v) return;
    jForm.dues.push({ date: v });
    jForm.dues.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    document.getElementById('jf-due-new').value = addDaysIso(v, 30);
    renderJobModalDynamic();
  });
  moneyInput(document.getElementById('jf-price'));
  document.getElementById('jf-price')._onMoney = updateJobPreview;
  moneyInput(document.getElementById('jf-down'));
  document.getElementById('jf-down')._onMoney = updateJobPreview;

  // modal pago
  payModalEl.addEventListener('click', function (e) { if (e.target === payModalEl) closePayModal(); });
  document.getElementById('pf-cancel').addEventListener('click', closePayModal);
  document.getElementById('pf-save').addEventListener('click', submitPay);
  moneyInput(document.getElementById('pf-amount'));
  document.getElementById('pf-amount')._onMoney = updatePayPreview;
  document.getElementById('pf-all').addEventListener('click', function () {
    var j = state.data.jobs.find(function (x) { return x.id === pForm.jobId; });
    if (!j) return;
    document.getElementById('pf-amount').value = dots(jobBalance(j));
    updatePayPreview();
  });
  document.getElementById('pf-half').addEventListener('click', function () {
    var j = state.data.jobs.find(function (x) { return x.id === pForm.jobId; });
    if (!j) return;
    document.getElementById('pf-amount').value = dots(Math.round(jobBalance(j) / 2));
    updatePayPreview();
  });
  // selector de trabajo (pago desde la ficha con varios trabajos con saldo)
  document.getElementById('pf-job').addEventListener('change', function (e) {
    var j = state.data.jobs.find(function (x) { return x.id === e.target.value; });
    if (!j) return;
    pForm.jobId = j.id;
    var c = state.data.clients.find(function (x) { return x.id === j.clientId; });
    document.getElementById('pf-sub').textContent = (c ? c.name : '') + ' — ' + (j.desc || j.category);
    document.getElementById('pf-saldo').textContent = fmtG(jobBalance(j));
    updatePayPreview();
  });

  // limpiar errores apenas se corrige el dato
  function clearErrOnInput(inputIds, errId) {
    inputIds.forEach(function (id) {
      var el = document.getElementById(id);
      var ev = el.tagName === 'SELECT' ? 'change' : 'input';
      el.addEventListener(ev, function () { document.getElementById(errId).hidden = true; });
    });
  }
  clearErrOnInput(['cf-name'], 'cf-err');
  clearErrOnInput(['jf-client', 'jf-price', 'jf-down'], 'jf-err');
  clearErrOnInput(['pf-amount'], 'pf-err');

  // modal gasto
  expModalEl.addEventListener('click', function (e) { if (e.target === expModalEl) closeExpModal(); });
  document.getElementById('ef-cancel').addEventListener('click', closeExpModal);
  document.getElementById('ef-save').addEventListener('click', submitExpense);
  moneyInput(document.getElementById('ef-amount'));
  clearErrOnInput(['ef-amount', 'ef-staff'], 'ef-err');

  // modal personal
  staffModalEl.addEventListener('click', function (e) { if (e.target === staffModalEl) closeStaffModal(); });
  document.getElementById('sf-cancel').addEventListener('click', closeStaffModal);
  document.getElementById('sf-save').addEventListener('click', submitStaff);
  document.getElementById('sf-name').addEventListener('keydown', function (e) { if (e.key === 'Enter') submitStaff(); });
  clearErrOnInput(['sf-name'], 'sf-err');

  // modal posponer / fijar fecha
  postModalEl.addEventListener('click', function (e) { if (e.target === postModalEl) closePostModal(); });
  document.getElementById('pp-cancel').addEventListener('click', closePostModal);
  document.getElementById('pp-save').addEventListener('click', submitPost);
  document.querySelectorAll('[data-pp]').forEach(function (el) {
    el.addEventListener('click', function () {
      document.getElementById('pp-date').value = addDaysIso(todayIso(), Number(el.getAttribute('data-pp')));
      document.getElementById('pp-err').hidden = true;
    });
  });
  document.getElementById('pp-date').addEventListener('input', function () {
    document.getElementById('pp-err').hidden = true;
  });

  // Escape cierra el visor o el modal abierto
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (!viewerEl.hidden) { closeViewer(); return; }
    if (!modalEl.hidden) closeClientModal();
    if (!jobModalEl.hidden) closeJobModal();
    if (!payModalEl.hidden) closePayModal();
    if (!postModalEl.hidden) closePostModal();
    if (!expModalEl.hidden) closeExpModal();
    if (!staffModalEl.hidden) closeStaffModal();
  });
  // flechas del teclado en el visor (escritorio)
  document.addEventListener('keydown', function (e) {
    if (viewerEl.hidden) return;
    if (e.key === 'ArrowLeft') document.getElementById('vw-prev').click();
    if (e.key === 'ArrowRight') document.getElementById('vw-next').click();
  });

  // input de fotos oculto
  var photoInput = document.getElementById('photo-input');
  photoInput.addEventListener('change', function (e) {
    var fs = Array.prototype.slice.call(e.target.files || []);
    e.target.value = '';
    if (_photoTarget) addPhotosTo(_photoTarget.kind, _photoTarget.id, fs);
  });

  // input de importación de respaldo
  document.getElementById('import-input').addEventListener('change', function (e) {
    var file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (file) doImportFile(file);
  });

  // visor de fotos
  function closeViewer() { if (state.viewer) { state.viewer = null; histConsume(); } state.confirmKey = null; render(); }
  viewerEl.addEventListener('click', function (e) { if (e.target === viewerEl) closeViewer(); });
  document.getElementById('vw-close').addEventListener('click', closeViewer);
  document.getElementById('vw-stage').addEventListener('click', function (e) { e.stopPropagation(); });
  document.getElementById('vw-actions').addEventListener('click', function (e) { e.stopPropagation(); });
  document.getElementById('vw-prev').addEventListener('click', function () {
    var vs = state.viewer; if (!vs) return;
    var owner = photoOwner(vs.kind, vs.id);
    var n = owner ? (owner.photos || []).length : 0; if (!n) return;
    state.viewer = { kind: vs.kind, id: vs.id, idx: (vs.idx - 1 + n) % n };
    state.confirmKey = null;
    render();
  });
  document.getElementById('vw-next').addEventListener('click', function () {
    var vs = state.viewer; if (!vs) return;
    var owner = photoOwner(vs.kind, vs.id);
    var n = owner ? (owner.photos || []).length : 0; if (!n) return;
    state.viewer = { kind: vs.kind, id: vs.id, idx: (vs.idx + 1) % n };
    state.confirmKey = null;
    render();
  });
  document.getElementById('vw-del').addEventListener('click', function () {
    var vs = state.viewer; if (!vs) return;
    var owner = photoOwner(vs.kind, vs.id);
    var list = owner ? (owner.photos || []) : [];
    if (!list.length) return;
    var ph = list[Math.max(0, Math.min(vs.idx, list.length - 1))];
    confirm2('delph:' + ph.id, function () { delPhotoFrom(vs.kind, vs.id, ph.id); });
  });

  // =====================================================================
  // ===== Seguridad: PIN de acceso, bloqueo y dispositivos ==============
  // =====================================================================
  var LOCK_KEY = 'jgm_lock_v1';
  var ATT_KEY = 'jgm_lock_att_v1';
  var DEVID_KEY = 'jgm_device_id';
  var PBKDF2_ITER = 150000;
  var cryptoOk = !!(window.crypto && crypto.subtle && crypto.getRandomValues);
  var unlocked = false;
  var sessionPin = null;
  var lockMode = 'unlock';

  // --- (A) control de intentos fallidos: persistente y con espera creciente ---
  // Se guarda en localStorage para que cerrar/reabrir la app NO reinicie el contador.
  function loadAtt() {
    try { return JSON.parse(localStorage.getItem(ATT_KEY)) || { fails: 0, until: 0 }; }
    catch (e) { return { fails: 0, until: 0 }; }
  }
  function saveAtt(a) { try { localStorage.setItem(ATT_KEY, JSON.stringify(a)); } catch (e) {} }
  function clearAtt() { try { localStorage.removeItem(ATT_KEY); } catch (e) {} }
  // segundos de bloqueo según cuántas veces se erró el PIN (escala hacia arriba)
  function lockSecsFor(fails) {
    if (fails < 5) return 0;
    if (fails === 5) return 30;       // 30 s
    if (fails === 6) return 60;       // 1 min
    if (fails === 7) return 5 * 60;   // 5 min
    if (fails === 8) return 15 * 60;  // 15 min
    if (fails === 9) return 30 * 60;  // 30 min
    return 60 * 60;                   // 1 h (10 o más)
  }
  function fmtWait(ms) {
    var s = Math.ceil(ms / 1000);
    if (s < 60) return s + (s === 1 ? ' segundo' : ' segundos');
    var m = Math.ceil(s / 60);
    return m + (m === 1 ? ' minuto' : ' minutos');
  }

  // --- utilidades cripto ---
  function ab2b64(buf) {
    var b = new Uint8Array(buf), s = '';
    for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return btoa(s);
  }
  function b642ab(s) {
    var bin = atob(s), b = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
    return b.buffer;
  }
  function randBytes(n) { return crypto.getRandomValues(new Uint8Array(n)); }
  function deriveBits(pin, saltAb, iter) {
    return crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits'])
      .then(function (k) {
        return crypto.subtle.deriveBits({ name: 'PBKDF2', salt: saltAb, iterations: iter, hash: 'SHA-256' }, k, 256);
      });
  }
  function deriveAesKey(pin, saltAb, iter) {
    return crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveKey'])
      .then(function (k) {
        return crypto.subtle.deriveKey(
          { name: 'PBKDF2', salt: saltAb, iterations: iter, hash: 'SHA-256' },
          k, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      });
  }
  function hasLock() { return !!localStorage.getItem(LOCK_KEY); }
  function setPin(pin) {
    var salt = randBytes(16);
    return deriveBits(pin, salt.buffer, PBKDF2_ITER).then(function (bits) {
      localStorage.setItem(LOCK_KEY, JSON.stringify({ salt: ab2b64(salt.buffer), iter: PBKDF2_ITER, hash: ab2b64(bits) }));
    });
  }
  function verifyPin(pin) {
    var rec;
    try { rec = JSON.parse(localStorage.getItem(LOCK_KEY)); } catch (e) { return Promise.resolve(false); }
    if (!rec) return Promise.resolve(false);
    return deriveBits(pin, b642ab(rec.salt), rec.iter).then(function (bits) { return ab2b64(bits) === rec.hash; });
  }
  function encryptBackup(obj) {
    var salt = randBytes(16), iv = randBytes(12);
    return deriveAesKey(sessionPin, salt.buffer, PBKDF2_ITER).then(function (key) {
      return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, new TextEncoder().encode(JSON.stringify(obj)));
    }).then(function (ct) {
      return { jgm: 'backup', v: 1, alg: 'AES-GCM', kdf: 'PBKDF2-SHA256', iter: PBKDF2_ITER,
        salt: ab2b64(salt.buffer), iv: ab2b64(iv.buffer), data: ab2b64(ct) };
    });
  }
  function decryptBackup(env) {
    return deriveAesKey(sessionPin, b642ab(env.salt), env.iter || PBKDF2_ITER).then(function (key) {
      return crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(b642ab(env.iv)) }, key, b642ab(env.data));
    }).then(function (pt) { return JSON.parse(new TextDecoder().decode(pt)); });
  }

  // --- registro de dispositivos (máx. 4) ---
  function deviceId() {
    var id = localStorage.getItem(DEVID_KEY);
    if (!id) { id = uid() + uid(); localStorage.setItem(DEVID_KEY, id); }
    return id;
  }
  function guessDeviceName() {
    var ua = navigator.userAgent || '';
    if (/iPhone/.test(ua)) return 'iPhone';
    if (/iPad/.test(ua)) return 'iPad';
    if (/Android/.test(ua)) return 'Android';
    if (/Windows/.test(ua)) return 'Windows';
    if (/Mac/.test(ua)) return 'Mac';
    if (/Linux/.test(ua)) return 'Linux';
    return 'Dispositivo';
  }
  function devices() { return (state.data.settings.devices || []); }
  function deviceRegistered() {
    var id = deviceId();
    return devices().some(function (x) { return x.id === id; });
  }
  function registerDeviceIfNeeded() {
    if (deviceRegistered()) return;
    var id = deviceId();
    mutate(function (d) {
      d.settings.devices = d.settings.devices || [];
      d.settings.devices.push({ id: id, name: guessDeviceName(), added: todayIso() });
    });
  }
  function ensureDevice() { /* usado tras importar: no fuerza registro */ }

  // --- DOM de la pantalla de bloqueo ---
  var lockEl = document.getElementById('lock-screen');
  var lkTitle = document.getElementById('lock-title');
  var lkSub = document.getElementById('lock-sub');
  var lkIn1 = document.getElementById('lock-input');
  var lkIn2 = document.getElementById('lock-input2');
  var lkErr = document.getElementById('lock-err');
  var lkGo = document.getElementById('lock-go');
  var lkForgot = document.getElementById('lock-forgot');
  var lkDevices = document.getElementById('lock-devices');
  var appEl = document.querySelector('.app');

  function lockErr(msg) { lkErr.textContent = msg; lkErr.hidden = !msg; }

  // --- (A) cuenta regresiva viva mientras dura el bloqueo por intentos ---
  var cdT = null;
  function stopCountdown() { clearTimeout(cdT); cdT = null; }
  function tickCountdown() {
    var att = loadAtt();
    var rem = att.until - Date.now();
    if (rem <= 0) {
      stopCountdown();
      lkIn1.disabled = false; lkGo.disabled = false;
      lockErr('');
      try { lkIn1.focus(); } catch (e) {}
      return;
    }
    lkIn1.disabled = true; lkGo.disabled = true;
    lockErr('Demasiados intentos. Esperá ' + fmtWait(rem) + ' e intentá de nuevo.');
    cdT = setTimeout(tickCountdown, 500);
  }

  function openLock(mode) {
    lockMode = mode;
    stopCountdown();
    lkIn1.value = ''; lkIn2.value = '';
    lockErr('');
    lkIn1.disabled = false;
    lkDevices.hidden = true; lkDevices.innerHTML = '';
    lkIn1.hidden = false; lkGo.hidden = false; lkGo.disabled = false;
    if (mode === 'create' || mode === 'change') {
      lkTitle.textContent = mode === 'change' ? 'Nuevo PIN' : 'Creá tu PIN';
      lkSub.textContent = 'Elegí un PIN de 6 a 10 números para proteger tus datos.';
      lkIn1.placeholder = 'PIN nuevo'; lkIn2.hidden = false; lkForgot.hidden = true;
      lkGo.textContent = 'Guardar PIN';
    } else if (mode === 'unlock') {
      lkTitle.textContent = 'Ingresá tu PIN';
      lkSub.textContent = 'Desbloqueá para ver tus datos.';
      lkIn1.placeholder = 'PIN'; lkIn2.hidden = true; lkForgot.hidden = false;
      lkGo.textContent = 'Entrar';
    }
    appEl.hidden = true;
    lockEl.hidden = false;
    // si quedó un bloqueo pendiente de intentos previos, retomar la cuenta regresiva
    if (mode === 'unlock') {
      var att = loadAtt();
      if (att.until && att.until > Date.now()) { tickCountdown(); return; }
    }
    setTimeout(function () { lkIn1.focus(); }, 50);
  }
  function showDeviceLimit(pin) {
    lockMode = 'limit';
    lkTitle.textContent = 'Demasiados dispositivos';
    lkSub.textContent = 'Esta app está limitada a 4 dispositivos. Quitá uno para usar este.';
    lkIn1.hidden = true; lkIn2.hidden = true; lkGo.hidden = true; lkForgot.hidden = true;
    lockErr('');
    lkDevices.hidden = false;
    var html = '';
    devices().forEach(function (dv) {
      html += '<div class="lock-dev-row"><div><div class="lock-dev-name">' + esc(dv.name || 'Dispositivo') + '</div>' +
        '<div class="lock-dev-meta">Agregado ' + esc(dd(dv.added)) + '</div></div>' +
        '<button type="button" class="lock-dev-rm" data-rm="' + esc(dv.id) + '">Quitar</button></div>';
    });
    lkDevices.innerHTML = html;
    lkDevices.querySelectorAll('[data-rm]').forEach(function (el) {
      el.addEventListener('click', function () {
        var rid = el.getAttribute('data-rm');
        mutate(function (d) { d.settings.devices = (d.settings.devices || []).filter(function (x) { return x.id !== rid; }); });
        if (devices().length < 4) enterApp(pin); else showDeviceLimit(pin);
      });
    });
    appEl.hidden = true;
    lockEl.hidden = false;
  }
  var autoT = null;
  function startAuto() { clearTimeout(autoT); autoT = setTimeout(function () { if (unlocked) lockNow(); }, 3 * 60 * 1000); }
  function bumpAuto() { if (unlocked) startAuto(); }
  function lockNow() {
    unlocked = false; sessionPin = null;
    clearTimeout(autoT);
    openLock('unlock');
  }
  function enterApp(pin) {
    sessionPin = pin;
    if (!deviceRegistered() && devices().length >= 4) { showDeviceLimit(pin); return; }
    registerDeviceIfNeeded();
    unlocked = true;
    lockEl.hidden = true;
    appEl.hidden = false;
    render();
    startAuto();
  }
  function handleLockGo() {
    var v1 = (lkIn1.value || '').trim();
    if (lockMode === 'create' || lockMode === 'change') {
      var v2 = (lkIn2.value || '').trim();
      if (!/^\d{6,10}$/.test(v1)) { lockErr('El PIN debe tener de 6 a 10 números.'); return; }
      if (v1 !== v2) { lockErr('Los PIN no coinciden.'); return; }
      setPin(v1).then(function () {
        if (lockMode === 'change') {
          sessionPin = v1;
          lockEl.hidden = true; appEl.hidden = false;
          toast('PIN actualizado.');
          render();
          startAuto();
        } else {
          enterApp(v1);
        }
      }).catch(function () { lockErr('No se pudo guardar el PIN.'); });
      return;
    }
    // unlock
    var att = loadAtt();
    if (att.until && att.until > Date.now()) { tickCountdown(); return; }
    if (!v1) { lockErr('Ingresá tu PIN.'); return; }
    lkGo.disabled = true;
    verifyPin(v1).then(function (ok) {
      lkGo.disabled = false;
      if (ok) { clearAtt(); stopCountdown(); vib(30); enterApp(v1); return; }
      // fallo: registra el intento y aplica espera creciente (persistente)
      var a = loadAtt();
      a.fails = (a.fails || 0) + 1;
      var secs = lockSecsFor(a.fails);
      if (secs) a.until = Date.now() + secs * 1000;
      saveAtt(a);
      lkIn1.value = '';
      if (secs) { tickCountdown(); return; }
      var left = 5 - a.fails;
      lockErr('PIN incorrecto.' + (left <= 2 ? ' Te queda' + (left === 1 ? '' : 'n') + ' ' + left + ' intento' + (left === 1 ? '' : 's') + ' antes del bloqueo.' : ''));
    });
  }
  lkGo.addEventListener('click', handleLockGo);
  lkIn1.addEventListener('keydown', function (e) { if (e.key === 'Enter') handleLockGo(); });
  lkIn2.addEventListener('keydown', function (e) { if (e.key === 'Enter') handleLockGo(); });
  lkIn1.addEventListener('input', function () { lockErr(''); });
  lkForgot.addEventListener('click', function () {
    if (lkForgot._armed) {
      // borra todo (PIN + datos + fotos) — recuperable desde un respaldo
      localStorage.removeItem(LOCK_KEY);
      clearAtt();
      var fresh = seedData();
      persist(fresh); state.data = fresh; state.photoCache = {}; _pp = {};
      idbClear().catch(function () {});
      openLock('create');
      return;
    }
    lkForgot._armed = true;
    lkForgot.textContent = 'Se borrarán TODOS los datos. Tocá otra vez para confirmar';
    setTimeout(function () { lkForgot._armed = false; lkForgot.textContent = 'Olvidé mi PIN'; }, 4000);
  });
  document.addEventListener('pointerdown', bumpAuto, true);
  document.addEventListener('keydown', bumpAuto, true);
  // al volver a la app tras estar oculta un rato, re-evaluar (el timer sigue corriendo)
  document.addEventListener('visibilitychange', function () { if (!document.hidden) bumpAuto(); });

  // funciones usadas desde Ajustes (Seguridad)
  function changePinFlow() { openLock('change'); }
  function lockAppNow() { lockNow(); }

  // ===== Botón "atrás" (Android): cierra overlays o retrocede de pantalla =====
  window.addEventListener('popstate', function () {
    if (histIgnore > 0) { histIgnore--; return; }
    if (histDepth > 0) histDepth--;
    // con la app bloqueada no navegamos nada
    if (!lockEl.hidden) return;
    // 1) visor de fotos abierto
    if (!viewerEl.hidden) { state.viewer = null; state.confirmKey = null; render(); return; }
    // 2) algún modal abierto
    if (!modalEl.hidden) { modalEl.hidden = true; return; }
    if (!jobModalEl.hidden) { jobModalEl.hidden = true; return; }
    if (!payModalEl.hidden) { payModalEl.hidden = true; return; }
    if (!postModalEl.hidden) { postModalEl.hidden = true; return; }
    if (!expModalEl.hidden) { expModalEl.hidden = true; return; }
    if (!staffModalEl.hidden) { staffModalEl.hidden = true; return; }
    // 3) retroceso de pantalla: ficha -> clientes -> inicio
    if (state.view === 'cliente') {
      curViewDepth = 1;
      state.view = 'clientes';
      state.confirmKey = null;
      render();
      window.scrollTo(0, 0);
      return;
    }
    // detalle del mes / gastos -> registro
    if (state.view === 'regmes' || state.view === 'gastos') {
      curViewDepth = 1;
      state.view = 'registro';
      state.confirmKey = null;
      render();
      window.scrollTo(0, 0);
      return;
    }
    // personales -> gastos
    if (state.view === 'personal') {
      curViewDepth = 2;
      state.view = 'gastos';
      state.confirmKey = null;
      render();
      window.scrollTo(0, 0);
      return;
    }
    if (state.view !== 'inicio') {
      curViewDepth = 0;
      state.view = 'inicio';
      state.confirmKey = null;
      render();
      window.scrollTo(0, 0);
    }
  });

  // aviso del navegador: al abrir (una vez por día) y cada hora
  setTimeout(maybeNotify, 1800);
  setInterval(maybeNotify, 60 * 60 * 1000);

  // service worker (PWA offline). No falla si el navegador no lo soporta.
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }

  // ===== Arranque: bloqueo antes de mostrar la app =====
  if (!cryptoOk) {
    // Sin WebCrypto (p. ej. abierto como archivo sin https): corre sin bloqueo
    appEl.hidden = false;
    render();
  } else if (!hasLock()) {
    openLock('create');
  } else {
    openLock('unlock');
  }

  // expuesto para fases siguientes
  window.JGM = {
    state: state,
    go: go,
    goClient: goClient,
    mutate: mutate,
    toast: toast,
    seedData: seedData,
    openClientModal: openClientModal,
    openNewJob: openNewJob,
    openEditJob: openEditJob,
    openPay: openPay,
    openPost: openPost,
    toggleNotif: toggleNotif,
    helpers: {
      uid: uid, esc: esc, initials: initials, todayIso: todayIso, dIso: dIso, addDaysIso: addDaysIso,
      daysBetween: daysBetween, dd: dd, ddShort: ddShort, fmtG: fmtG, dots: dots, mill: mill, parseMoney: parseMoney,
      jobPaid: jobPaid, jobBalance: jobBalance, urgentCounts: urgentCounts,
      totalPending: totalPending, clientBalances: clientBalances, waLink: waLink, confirm2: confirm2,
      idbGet: idbGet, idbPut: idbPut, idbClear: idbClear, resetPhotoCache: function () { state.photoCache = {}; _pp = {}; }
    }
  };
})();
