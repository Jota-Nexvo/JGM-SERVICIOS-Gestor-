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
  // Con signo: para resultados que pueden ser negativos (caja, margen, neto)
  function fmtGS(n) { return (Math.round(Number(n) || 0) < 0 ? '− ' : '') + '₲ ' + dots(n); }
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
  // Ventas de productos (Etapa C3): misma mecánica de saldo que los trabajos
  function saleTotal(s) {
    return (s.items || []).reduce(function (a, it) { return a + (Number(it.qty) || 0) * (Number(it.unitPrice) || 0); }, 0);
  }
  function salePaid(s) {
    if (!s.credit) return saleTotal(s);
    return (s.payments || []).reduce(function (a, p) { return a + (Number(p.amount) || 0); }, 0);
  }
  function saleBalance(s) {
    if (!s.credit) return 0;
    return Math.max(0, saleTotal(s) - salePaid(s));
  }
  // Costo (snapshot) de lo vendido en una venta o en los items de un trabajo
  function itemsCost(items) {
    return (items || []).reduce(function (a, it) { return a + (Number(it.qty) || 0) * (Number(it.unitCost) || 0); }, 0);
  }
  // Garantía de un item vendido: null si no tiene
  function warrantyInfo(dateIso, months) {
    var m = Number(months) || 0;
    if (m <= 0 || !dateIso) return null;
    var until = addMonthsIso(dateIso, m);
    return { until: until, active: until >= todayIso() };
  }

  // ===== Datos =====
  function defaultCats() { return ['Perforación', 'Mantenimiento', 'Motobomba', 'Pesca de equipo', 'Otro']; }
  function defaultExpenseCats() { return ['Movilidad', 'Combustible', 'Viáticos', 'Personal', 'Productos/Materiales', 'Otro']; }
  function defaultProductCats() { return ['Motor', 'Bomba', 'Relé', 'Repuesto', 'Otro']; }
  var VIATICO_SUBS = ['Desayuno', 'Almuerzo', 'Cena', 'Hospedaje'];
  // Arranque en blanco: la app empieza vacía para cargar datos reales.
  function seedData() {
    return {
      clients: [],
      jobs: [],
      expenses: [],
      staff: [],
      products: [],
      purchases: [],
      sales: [],
      settings: { categories: defaultCats(), expenseCategories: defaultExpenseCats(), productCategories: defaultProductCats(), remindDays: 3, notifEnabled: false, devices: [] },
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
    var products = [
      { id: 'pr1', name: 'Motor sumergible 1.5 HP (ejemplo)', category: 'Motor', notes: '', photos: [], cost: 1250000, price: 1900000, stock: 4, minStock: 1, adjusts: [] },
      { id: 'pr2', name: 'Bomba sumergible 1.5 HP (ejemplo)', category: 'Bomba', notes: '', photos: [], cost: 750000, price: 1200000, stock: 3, minStock: 1, adjusts: [{ id: 'aj1', date: d(-10), qty: 1, reason: 'Llegó con el cuerpo rajado' }] },
      { id: 'pr3', name: 'Relé falta de fase (ejemplo)', category: 'Relé', notes: '', photos: [], cost: 125000, price: 220000, stock: 1, minStock: 2, adjusts: [] }
    ];
    var purchases = [
      {
        id: 'cp1', type: 'import', status: 'received', paidDate: d(-45), receivedDate: d(-12),
        note: 'Primer lote de China (ejemplo)', paidAmount: 12000000, totalFinal: 15000000,
        items: [
          { productId: 'pr1', qty: 5, unitBase: 1000000, unitCost: 1250000 },
          { productId: 'pr2', qty: 5, unitBase: 600000, unitCost: 750000 },
          { productId: 'pr3', qty: 20, unitBase: 100000, unitCost: 125000 }
        ]
      },
      {
        id: 'cp2', type: 'import', status: 'paid', paidDate: d(-3), receivedDate: '',
        note: 'Pedido en viaje (ejemplo)', paidAmount: 3000000, totalFinal: 0,
        items: [{ productId: 'pr3', qty: 30, unitBase: 100000 }]
      }
    ];
    var sales = [
      {
        id: 'v1', clientId: 'c6', date: d(-5), credit: false,
        items: [{ productId: 'pr3', qty: 1, unitPrice: 220000, unitCost: 125000, warrantyMonths: 6 }],
        payments: [], dueDates: []
      },
      {
        id: 'v2', clientId: 'c4', date: d(-3), credit: true,
        items: [
          { productId: 'pr1', qty: 1, unitPrice: 1900000, unitCost: 1250000, warrantyMonths: 12 },
          { productId: 'pr2', qty: 1, unitPrice: 1200000, unitCost: 750000, warrantyMonths: 12 }
        ],
        payments: [{ id: 'vp1', amount: 1000000, date: d(-3), note: 'Seña' }],
        dueDates: [{ id: 'vd1', date: d(11), done: false }]
      }
    ];
    return {
      clients: clients,
      jobs: jobs,
      expenses: expenses,
      staff: staff,
      products: products,
      purchases: purchases,
      sales: sales,
      settings: { categories: defaultCats(), expenseCategories: defaultExpenseCats(), productCategories: defaultProductCats(), remindDays: 3, notifEnabled: false, devices: [] },
      demo: true
    };
  }

  // ===== Persistencia =====
  // Migración suave: completa lo que falte en datos guardados por versiones anteriores
  function normalizeData(d) {
    if (!Array.isArray(d.expenses)) d.expenses = [];
    if (!Array.isArray(d.staff)) d.staff = [];
    if (!Array.isArray(d.products)) d.products = [];
    if (!Array.isArray(d.purchases)) d.purchases = [];
    if (!Array.isArray(d.sales)) d.sales = [];
    if (!Array.isArray(d.settings.devices)) d.settings.devices = [];
    if (!Array.isArray(d.settings.categories)) d.settings.categories = defaultCats();
    if (!Array.isArray(d.settings.expenseCategories)) d.settings.expenseCategories = defaultExpenseCats();
    if (!Array.isArray(d.settings.productCategories)) d.settings.productCategories = defaultProductCats();
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
  // Devuelve el objeto (trabajo, cliente, gasto o producto) dueño de las fotos
  function photoOwner(kind, id) {
    if (kind === 'client') return state.data.clients.find(function (x) { return x.id === id; });
    if (kind === 'exp') return (state.data.expenses || []).find(function (x) { return x.id === id; });
    if (kind === 'prod') return (state.data.products || []).find(function (x) { return x.id === id; });
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
          : kind === 'prod' ? (d.products || []).find(function (x) { return x.id === id; })
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
      var o = kind === 'client' ? d.clients.find(function (x) { return x.id === id; })
        : kind === 'exp' ? (d.expenses || []).find(function (x) { return x.id === id; })
        : kind === 'prod' ? (d.products || []).find(function (x) { return x.id === id; })
        : d.jobs.find(function (x) { return x.id === id; });
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
    (state.data.sales || []).forEach(function (s) {
      byClient[s.clientId] = (byClient[s.clientId] || 0) + saleBalance(s);
    });
    return byClient;
  }
  function jobsOf(cid) {
    return (state.data.jobs || []).filter(function (j) { return j.clientId === cid; });
  }
  function salesOf(cid) {
    return (state.data.sales || []).filter(function (s) { return s.clientId === cid; });
  }
  function urgentCounts() {
    var today = todayIso();
    var venc = 0, hoy = 0;
    var scan = function (list, balFn) {
      (list || []).forEach(function (x) {
        if (!x.credit || balFn(x) <= 0) return;
        (x.dueDates || []).forEach(function (dd) {
          if (dd.done) return;
          var diff = daysBetween(today, dd.date);
          if (diff < 0) venc++; else if (diff === 0) hoy++;
        });
      });
    };
    scan(state.data.jobs, jobBalance);
    scan(state.data.sales, saleBalance);
    return { venc: venc, hoy: hoy };
  }
  function totalPending() {
    return (state.data.jobs || []).reduce(function (a, j) { return a + jobBalance(j); }, 0) +
      (state.data.sales || []).reduce(function (a, s) { return a + saleBalance(s); }, 0);
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
      registro: ['Finanzas', 'Caja, resultado y registro mensual'],
      regmes: ['Detalle del mes', state.regMonth ? (monthName(state.regMonth) + ' ' + state.regMonth.slice(0, 4)) : ''],
      gastos: ['Gastos', 'Gastos del negocio'],
      personal: ['Personales', 'Tu equipo de trabajo'],
      stock: ['Stock', 'Productos para la venta'],
      producto: ['Producto', ''],
      compras: ['Compras', 'Pedidos e ingresos de mercadería'],
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
    if (v === 'cliente' || v === 'regmes' || v === 'gastos' || v === 'producto' || v === 'compras') return 2;
    if (v === 'personal') return 3; // se entra desde Gastos
    return 1;
  }
  function syncViewHistory(target) {
    var d = viewDepthOf(target);
    if (d > curViewDepth) { for (var i = curViewDepth; i < d; i++) histPush(); }
    else if (d < curViewDepth) { histConsume(curViewDepth - d); }
    curViewDepth = d;
  }
  // Oculta un modal SIN consumir su entrada del historial: la entrada pasa a
  // contar como un nivel de vista y la navegación siguiente ajusta el resto.
  // Evita la carrera entre el history.go(-1) asíncrono del cierre y el
  // pushState de navegar, que desfasaba el botón "atrás" de Android.
  function absorbOverlay(el) {
    if (!el.hidden) { el.hidden = true; curViewDepth++; }
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
  function goProduct(id) {
    syncViewHistory('producto');
    state.view = 'producto';
    state.productId = id;
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
    if (isNew && newId) {
      absorbOverlay(modalEl);
      goClient(newId);
      toast('Cliente guardado.');
    } else {
      closeClientModal();
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

  // ===== Filas de productos vendidos (compartidas por trabajo y venta) =====
  function soldItemsTotal(items) {
    return (items || []).reduce(function (a, it) { return a + (Number(it.qty) || 0) * (Number(it.unitPrice) || 0); }, 0);
  }
  function productOptionsStock(selId) {
    var prods = (state.data.products || []).slice().sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });
    return '<option value="">Elegir producto…</option>' + prods.map(function (p) {
      return '<option value="' + esc(p.id) + '"' + (selId === p.id ? ' selected' : '') + '>' +
        esc(p.name + ' (quedan ' + (Number(p.stock) || 0) + ')') + '</option>';
    }).join('');
  }
  function renderSoldItemRows(boxId, items, onChange) {
    var box = document.getElementById(boxId);
    if (!(items || []).length) {
      box.innerHTML = '<div class="set-hint">Sin productos del stock en esta carga.</div>';
      return;
    }
    box.innerHTML = items.map(function (it, i) {
      return '<div class="sale-item">' +
        '<div class="sale-item-top"><select data-si-prod="' + i + '">' + productOptionsStock(it.productId) + '</select>' +
        '<button type="button" class="bu-rm" data-si-rm="' + i + '">✕</button></div>' +
        '<div class="sale-item-grid">' +
        '<label>Cant.<input type="number" min="1" max="999" value="' + esc(String(it.qty || 1)) + '" data-si-qty="' + i + '"></label>' +
        '<label>Precio c/u (₲)<input inputmode="numeric" class="mono-input" value="' + (it.unitPrice ? esc(dots(it.unitPrice)) : '') + '" placeholder="0" data-si-price="' + i + '"></label>' +
        '<label>Garantía (meses)<input type="number" min="0" max="120" value="' + esc(String(it.warrantyMonths || 0)) + '" placeholder="0" data-si-war="' + i + '"></label>' +
        '</div></div>';
    }).join('');
    box.querySelectorAll('[data-si-rm]').forEach(function (el) {
      el.addEventListener('click', function () {
        items.splice(Number(el.getAttribute('data-si-rm')), 1);
        renderSoldItemRows(boxId, items, onChange);
        onChange();
      });
    });
    box.querySelectorAll('[data-si-prod]').forEach(function (el) {
      el.addEventListener('change', function () {
        var it = items[Number(el.getAttribute('data-si-prod'))];
        it.productId = el.value;
        var p = productById(el.value);
        // al elegir producto, sugerir su precio de venta del catálogo
        if (p && p.price) {
          it.unitPrice = Number(p.price) || 0;
          renderSoldItemRows(boxId, items, onChange);
        }
        onChange();
      });
    });
    box.querySelectorAll('[data-si-qty]').forEach(function (el) {
      el.addEventListener('input', function () {
        items[Number(el.getAttribute('data-si-qty'))].qty = Number(el.value) || 0;
        onChange();
      });
    });
    box.querySelectorAll('[data-si-price]').forEach(function (el) {
      el.addEventListener('input', function () {
        var n = parseMoney(el.value);
        el.value = n ? dots(n) : '';
        items[Number(el.getAttribute('data-si-price'))].unitPrice = n;
        onChange();
      });
    });
    box.querySelectorAll('[data-si-war]').forEach(function (el) {
      el.addEventListener('input', function () {
        items[Number(el.getAttribute('data-si-war'))].warrantyMonths = Math.max(0, Number(el.value) || 0);
        onChange();
      });
    });
  }
  // Valida filas y controla stock disponible. extraStock: unidades que se
  // devolverían primero (al editar un trabajo, las de sus items originales).
  function validateSoldItems(items, extraStock) {
    if (!(items || []).length) return { items: [] };
    var wanted = {};
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (!it.productId) return { error: 'Elegí el producto en todas las filas.' };
      if (!(Number(it.qty) > 0)) return { error: 'Cargá la cantidad en todas las filas.' };
      if (!(Number(it.unitPrice) > 0)) return { error: 'Cargá el precio de venta en todas las filas.' };
      wanted[it.productId] = (wanted[it.productId] || 0) + Number(it.qty);
    }
    var bad = null;
    Object.keys(wanted).forEach(function (pid) {
      if (bad) return;
      var p = productById(pid);
      var avail = (p ? (Number(p.stock) || 0) : 0) + ((extraStock && extraStock[pid]) || 0);
      if (!p) { bad = 'Uno de los productos ya no existe en el catálogo.'; return; }
      if (wanted[pid] > avail) bad = 'No hay stock suficiente de ' + p.name + ' (disponible: ' + avail + ').';
    });
    if (bad) return { error: bad };
    return {
      items: items.map(function (it) {
        var p = productById(it.productId);
        return {
          productId: it.productId,
          qty: Number(it.qty),
          unitPrice: Number(it.unitPrice),
          // el costo se congela al vender; si la fila viene de una edición, conserva el original
          unitCost: it.unitCost != null ? Number(it.unitCost) : (p ? Number(p.cost) || 0 : 0),
          warrantyMonths: Number(it.warrantyMonths) || 0
        };
      })
    };
  }
  // Aplica al stock los movimientos de items vendidos (sign: -1 vende, +1 devuelve)
  function applySoldItems(d, items, sign) {
    (items || []).forEach(function (it) {
      var p = (d.products || []).find(function (x) { return x.id === it.productId; });
      if (p) p.stock = Math.max(0, (Number(p.stock) || 0) + sign * (Number(it.qty) || 0));
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
      credit: true,
      items: []
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
    var items = (j.items || []).map(function (it) {
      return { productId: it.productId, qty: it.qty, unitPrice: it.unitPrice, unitCost: it.unitCost, warrantyMonths: it.warrantyMonths || 0 };
    });
    var labor = Math.max(0, (Number(j.price) || 0) - soldItemsTotal(items));
    jForm = {
      id: j.id,
      clientId: j.clientId,
      locked: true,
      category: j.category,
      dues: (j.dueDates || []).filter(function (x) { return !x.done; }).map(function (x) { return { id: x.id, date: x.date }; }),
      dueNew: addDaysIso(todayIso(), 30),
      credit: !!j.credit,
      items: items
    };
    document.getElementById('jf-title').textContent = 'Editar trabajo';
    document.getElementById('jf-desc').value = j.desc || '';
    document.getElementById('jf-date').value = j.date || todayIso();
    document.getElementById('jf-price').value = labor ? dots(labor) : '';
    document.getElementById('jf-down').value = '';
    document.getElementById('jf-remind').value = String(j.remind != null ? j.remind : state.data.settings.remindDays);
    document.getElementById('jf-saldo-label').textContent = 'Saldo actual con este total';
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
    // productos vendidos dentro del trabajo
    renderSoldItemRows('jf-items', jForm.items, updateJobPreview);
    updateJobPreview();
  }
  function jobFormTotal() {
    return parseMoney(document.getElementById('jf-price').value) + soldItemsTotal(jForm.items);
  }
  function updateJobPreview() {
    var total = jobFormTotal();
    document.getElementById('jf-total').textContent = fmtG(total);
    document.getElementById('jf-total-box').style.display = (jForm.items || []).length ? '' : 'none';
    var minus;
    if (jForm.id) {
      var j = state.data.jobs.find(function (x) { return x.id === jForm.id; });
      minus = j ? jobPaid(j) : 0;
    } else {
      minus = parseMoney(document.getElementById('jf-down').value);
    }
    document.getElementById('jf-saldo-preview').textContent = fmtG(Math.max(0, total - minus));
  }
  function closeJobModal() { if (!jobModalEl.hidden) { jobModalEl.hidden = true; histConsume(); } }
  function submitJob() {
    var errEl = document.getElementById('jf-err');
    var showErr = function (m) { errEl.textContent = m; errEl.hidden = false; };
    if (!jForm.locked) jForm.clientId = document.getElementById('jf-client').value;
    var labor = parseMoney(document.getElementById('jf-price').value);
    var down = parseMoney(document.getElementById('jf-down').value);
    if (!jForm.clientId) { showErr('Elegí un cliente.'); return; }
    // stock disponible: al editar, primero se "devuelven" los items originales
    var oldJob = jForm.id ? state.data.jobs.find(function (x) { return x.id === jForm.id; }) : null;
    var extraStock = {};
    ((oldJob && oldJob.items) || []).forEach(function (it) {
      extraStock[it.productId] = (extraStock[it.productId] || 0) + (Number(it.qty) || 0);
    });
    var checked = validateSoldItems(jForm.items, extraStock);
    if (checked.error) { showErr(checked.error); return; }
    var items = checked.items;
    var price = labor + soldItemsTotal(items); // el precio del trabajo = mano de obra + productos
    if (price <= 0) { showErr('Cargá la mano de obra o agregá productos.'); return; }
    if (jForm.credit && !jForm.id && down > price) { showErr('La seña no puede superar el total.'); return; }
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
        applySoldItems(d, j.items, +1);   // devolver el stock de los items anteriores
        applySoldItems(d, items, -1);     // descontar el de los nuevos
        j.category = jForm.category; j.desc = desc; j.date = date; j.price = price; j.credit = credit; j.remind = remind;
        j.items = items;
        var done = (j.dueDates || []).filter(function (x) { return x.done; });
        j.dueDates = credit ? done.concat(dues.map(function (x) { return { id: x.id || uid(), date: x.date, done: false }; })) : done;
        recomputeDone(j);
      } else {
        var payments = [];
        if (credit && down > 0) payments.push({ id: uid(), amount: down, date: date, note: 'Seña' });
        applySoldItems(d, items, -1);
        d.jobs.push({
          id: uid(), clientId: cid, category: jForm.category, desc: desc, date: date, price: price,
          credit: credit, remind: remind, payments: payments,
          dueDates: credit ? dues.map(function (x) { return { id: uid(), date: x.date, done: false }; }) : [],
          items: items,
          photos: []
        });
      }
    });
    if (isNew) {
      absorbOverlay(jobModalEl);
      goClient(cid);
      toast('Trabajo guardado.');
    } else {
      closeJobModal();
      toast('Trabajo actualizado.');
    }
  }

  // ===== Modal venta (siempre con cliente, por la garantía) =====
  var saleModalEl = document.getElementById('modal-sale');
  var vForm = {};
  function renderSaleModalDynamic() {
    document.getElementById('vf-contado').classList.toggle('active', !vForm.credit);
    document.getElementById('vf-credito').classList.toggle('active', vForm.credit);
    document.getElementById('vf-credit-block').style.display = vForm.credit ? '' : 'none';
    renderSoldItemRows('vf-items', vForm.items, updateSalePreview);
    updateSalePreview();
  }
  function updateSalePreview() {
    var total = soldItemsTotal(vForm.items);
    document.getElementById('vf-total').textContent = fmtG(total);
    var saldoBox = document.getElementById('vf-saldo-box');
    saldoBox.hidden = !vForm.credit;
    if (vForm.credit) {
      var down = parseMoney(document.getElementById('vf-down').value);
      document.getElementById('vf-saldo').textContent = fmtG(Math.max(0, total - down));
    }
  }
  function openSaleModal(opts) {
    opts = opts || {};
    if (!(state.data.products || []).length) {
      toast('Primero cargá productos en el catálogo de Stock.');
      return;
    }
    if (!(state.data.clients || []).length) {
      toast('Primero cargá al cliente — las ventas siempre van con cliente por la garantía.');
      openClientModal(null);
      return;
    }
    var first = opts.productId ? productById(opts.productId) : null;
    vForm = {
      clientId: opts.clientId || '',
      credit: false,
      items: [{ productId: opts.productId || '', qty: 1, unitPrice: first ? (Number(first.price) || 0) : 0, warrantyMonths: 0 }]
    };
    var sel = document.getElementById('vf-client');
    sel.innerHTML = '<option value="">Elegir cliente…</option>' + state.data.clients.slice()
      .sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); })
      .map(function (c) { return '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>'; }).join('');
    sel.value = vForm.clientId || '';
    document.getElementById('vf-date').value = todayIso();
    document.getElementById('vf-down').value = '';
    document.getElementById('vf-due').value = addDaysIso(todayIso(), 30);
    var err = document.getElementById('vf-err');
    err.hidden = true;
    err.textContent = '';
    renderSaleModalDynamic();
    if (saleModalEl.hidden) histPush();
    saleModalEl.hidden = false;
  }
  function closeSaleModal() { if (!saleModalEl.hidden) { saleModalEl.hidden = true; histConsume(); } }
  function submitSale() {
    var errEl = document.getElementById('vf-err');
    var showErr = function (m) { errEl.textContent = m; errEl.hidden = false; };
    var cid = document.getElementById('vf-client').value;
    if (!cid) { showErr('Elegí el cliente — la fecha de venta queda ligada a él para la garantía.'); return; }
    if (!(vForm.items || []).length) { showErr('Agregá al menos un producto.'); return; }
    var checked = validateSoldItems(vForm.items, null);
    if (checked.error) { showErr(checked.error); return; }
    var items = checked.items;
    var total = soldItemsTotal(items);
    if (total <= 0) { showErr('Cargá el precio de venta.'); return; }
    var date = document.getElementById('vf-date').value || todayIso();
    var credit = vForm.credit;
    var down = credit ? parseMoney(document.getElementById('vf-down').value) : 0;
    if (down > total) { showErr('La seña no puede superar el total.'); return; }
    var due = credit ? document.getElementById('vf-due').value : '';
    var sale = {
      id: uid(), clientId: cid, date: date, credit: credit,
      items: items,
      payments: credit && down > 0 ? [{ id: uid(), amount: down, date: date, note: 'Seña' }] : [],
      dueDates: credit && due && down < total ? [{ id: uid(), date: due, done: false }] : []
    };
    mutate(function (d) {
      applySoldItems(d, items, -1);
      d.sales.push(sale);
      recomputeSaleDone(sale);
    });
    absorbOverlay(saleModalEl);
    goClient(cid);
    vib(30);
    toast(credit ? 'Venta a crédito registrada — la vas a ver en Cobros.' : 'Venta registrada.');
  }
  // Borrar una venta = deshacerla: las unidades vuelven al stock
  function delSale(id) {
    var s = (state.data.sales || []).find(function (x) { return x.id === id; });
    if (!s) return;
    mutate(function (d) {
      var sx = (d.sales || []).find(function (x) { return x.id === id; });
      if (!sx) return;
      applySoldItems(d, sx.items, +1);
      d.sales = d.sales.filter(function (x) { return x.id !== id; });
    });
    toast('Venta eliminada — las unidades volvieron al stock.');
  }

  // ===== Modal pago (sirve para trabajos Y ventas) =====
  var payModalEl = document.getElementById('modal-pay');
  var pForm = {};
  // Marca las fechas de cobro como cumplidas solo si el trabajo/venta está saldado
  function recomputeDone(j) {
    var paid = (j.payments || []).reduce(function (a, p) { return a + (Number(p.amount) || 0); }, 0);
    var paidOff = paid >= (Number(j.price) || 0);
    (j.dueDates || []).forEach(function (x) { x.done = paidOff; });
    return paidOff;
  }
  function recomputeSaleDone(s) {
    var paidOff = salePaid(s) >= saleTotal(s);
    (s.dueDates || []).forEach(function (x) { x.done = paidOff; });
    return paidOff;
  }
  // El "deudor" que se está cobrando: trabajo ('job') o venta ('sale')
  function payDebtor(kind, id, data) {
    var D = data || state.data;
    return kind === 'sale'
      ? (D.sales || []).find(function (x) { return x.id === id; })
      : (D.jobs || []).find(function (x) { return x.id === id; });
  }
  function payDebtorLabel(kind, x) {
    if (kind === 'sale') {
      var names = (x.items || []).map(function (it) {
        var p = productById(it.productId);
        return (p ? p.name : 'producto') + (it.qty > 1 ? ' ×' + it.qty : '');
      }).join(' + ');
      return 'Venta: ' + (names || 'productos');
    }
    return x.desc || x.category;
  }
  function payDebtorTotal(kind, x) { return kind === 'sale' ? saleTotal(x) : (Number(x.price) || 0); }
  function payDebtorBalance(kind, x) { return kind === 'sale' ? saleBalance(x) : jobBalance(x); }
  function openPayKind(kind, id, payId) {
    var x = payDebtor(kind, id);
    if (!x) return;
    var c = state.data.clients.find(function (y) { return y.id === x.clientId; });
    var pay = payId ? (x.payments || []).find(function (y) { return y.id === payId; }) : null;
    if (payId && !pay) return;
    pForm = { kind: kind, id: id, payId: payId || null };
    document.getElementById('pf-title').textContent = pay ? 'Editar pago' : 'Registrar pago';
    document.getElementById('pf-save').textContent = pay ? 'Guardar cambios' : 'Guardar pago';
    document.getElementById('pf-sub').textContent = (c ? c.name : '') + ' — ' + payDebtorLabel(kind, x);
    document.getElementById('pf-saldo').textContent = fmtG(payDebtorBalance(kind, x));
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
  function openPay(jobId, payId) { openPayKind('job', jobId, payId); }
  function openPaySale(saleId, payId) { openPayKind('sale', saleId, payId); }
  // Registrar pago desde la ficha del cliente, sin esperar fechas de cobro:
  // junta trabajos Y ventas con saldo; con varios, muestra un selector.
  function openPayForClient(cid) {
    var withDebt = [];
    jobsOf(cid).forEach(function (j) { if (j.credit && jobBalance(j) > 0) withDebt.push({ kind: 'job', x: j }); });
    salesOf(cid).forEach(function (s) { if (s.credit && saleBalance(s) > 0) withDebt.push({ kind: 'sale', x: s }); });
    if (!withDebt.length) { toast('Este cliente está al día — no tiene saldos pendientes.'); return; }
    var firstPend = function (x) {
      var p = (x.dueDates || []).filter(function (y) { return !y.done; })
        .map(function (y) { return y.date; }).sort();
      return p.length ? p[0] : '9999-12-31';
    };
    withDebt.sort(function (a, b) {
      var fa = firstPend(a.x), fb = firstPend(b.x);
      if (fa !== fb) return fa < fb ? -1 : 1;
      return (a.x.date || '') < (b.x.date || '') ? -1 : 1;
    });
    openPayKind(withDebt[0].kind, withDebt[0].x.id);
    if (withDebt.length > 1) {
      var sel = document.getElementById('pf-job');
      sel.innerHTML = withDebt.map(function (w) {
        return '<option value="' + esc(w.kind + ':' + w.x.id) + '">' +
          esc(payDebtorLabel(w.kind, w.x) + ' · saldo ' + fmtG(payDebtorBalance(w.kind, w.x))) + '</option>';
      }).join('');
      sel.value = withDebt[0].kind + ':' + withDebt[0].x.id;
      document.getElementById('pf-job-wrap').hidden = false;
    }
  }
  function updatePayPreview() {
    var x = payDebtor(pForm.kind, pForm.id);
    if (!x) return;
    var total = payDebtorTotal(pForm.kind, x);
    var otherPaid = (x.payments || []).reduce(function (a, p) {
      return a + (p.id === pForm.payId ? 0 : (Number(p.amount) || 0));
    }, 0);
    var amount = parseMoney(document.getElementById('pf-amount').value);
    var txt = fmtG(Math.max(0, total - otherPaid - amount));
    if (amount > 0 && otherPaid + amount >= total) txt += ' — ¡queda pagado!';
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
      var x = payDebtor(pForm.kind, pForm.id, d);
      if (!x) return;
      x.payments = x.payments || [];
      if (editing) {
        var p = x.payments.find(function (y) { return y.id === pForm.payId; });
        if (p) { p.amount = amount; p.date = date; p.note = note; }
      } else {
        x.payments.push({ id: uid(), amount: amount, date: date, note: note });
      }
      paidOff = pForm.kind === 'sale' ? recomputeSaleDone(x) : recomputeDone(x);
    });
    closePayModal();
    vib(30);
    toast(editing ? 'Pago actualizado.' : (paidOff ? 'Pago registrado — ¡quedó saldado!' : 'Pago registrado.'));
  }
  function delPayment(kind, ownerId, payId) {
    mutate(function (d) {
      var x = payDebtor(kind, ownerId, d);
      if (!x) return;
      x.payments = (x.payments || []).filter(function (p) { return p.id !== payId; });
      if (kind === 'sale') recomputeSaleDone(x); else recomputeDone(x);
    });
    toast('Pago eliminado.');
  }

  // ===== Modal posponer / fijar fecha =====
  var postModalEl = document.getElementById('modal-post');
  var ppForm = {};
  function openPostKind(kind, id, ddId) {
    var j = payDebtor(kind, id);
    if (!j) return;
    var target = ddId;
    if (!target) {
      var pend = (j.dueDates || []).filter(function (x) { return !x.done; })
        .sort(function (a, b) { return a.date < b.date ? -1 : 1; });
      target = pend.length ? pend[0].id : null;
    }
    ppForm = { kind: kind, id: id, ddId: target };
    var c = state.data.clients.find(function (x) { return x.id === j.clientId; });
    document.getElementById('pp-title').textContent = target ? 'Posponer cobro' : 'Fijar fecha de cobro';
    document.getElementById('pp-save').textContent = target ? 'Guardar nueva fecha' : 'Fijar fecha';
    document.getElementById('pp-sub').textContent =
      (c ? c.name : '') + ' — ' + payDebtorLabel(kind, j) + ' · debe ' + fmtG(payDebtorBalance(kind, j));
    document.getElementById('pp-date').value = addDaysIso(todayIso(), 7);
    var err = document.getElementById('pp-err');
    err.hidden = true;
    err.textContent = '';
    if (postModalEl.hidden) histPush();
    postModalEl.hidden = false;
  }
  function openPost(jobId, ddId) { openPostKind('job', jobId, ddId); }
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
      var j = payDebtor(ppForm.kind || 'job', ppForm.id, d);
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

  // ===== Stock: helpers =====
  function productById(id) { return (state.data.products || []).find(function (x) { return x.id === id; }); }
  function lowStockProducts() {
    return (state.data.products || []).filter(function (p) {
      return (Number(p.minStock) || 0) > 0 && (Number(p.stock) || 0) <= (Number(p.minStock) || 0);
    });
  }
  function inventoryValue() {
    return (state.data.products || []).reduce(function (a, p) {
      return a + (Number(p.stock) || 0) * (Number(p.cost) || 0);
    }, 0);
  }
  function pendingPurchases() {
    return (state.data.purchases || []).filter(function (b) { return b.status === 'paid'; });
  }
  // Aplica una compra al stock: promedio ponderado del costo + suma unidades.
  // Cada item ya debe traer su unitCost (real, con prorrateo si es importación).
  function applyPurchaseToStock(d, purchase) {
    (purchase.items || []).forEach(function (it) {
      var p = (d.products || []).find(function (x) { return x.id === it.productId; });
      if (!p) return;
      var oldStock = Number(p.stock) || 0;
      var oldCost = Number(p.cost) || 0;
      var qty = Number(it.qty) || 0;
      var unitCost = Number(it.unitCost) || 0;
      if (qty <= 0) return;
      p.cost = oldStock + qty > 0 ? ((oldStock * oldCost) + (qty * unitCost)) / (oldStock + qty) : unitCost;
      p.stock = oldStock + qty;
    });
  }

  // ===== Modal producto =====
  var prodModalEl = document.getElementById('modal-product');
  var prForm = {};
  function renderProdCats() {
    var box = document.getElementById('prf-cats');
    var cats = state.data.settings.productCategories || defaultProductCats();
    box.innerHTML = cats.map(function (name) {
      return '<span class="cat-chip' + (prForm.category === name ? ' active' : '') + '" data-pcat="' + esc(name) + '">' + esc(name) + '</span>';
    }).join('');
    box.querySelectorAll('[data-pcat]').forEach(function (el) {
      el.addEventListener('click', function () {
        prForm.category = el.getAttribute('data-pcat');
        renderProdCats();
      });
    });
  }
  function openProductModal(p) {
    prForm = { id: p ? p.id : null, category: p ? p.category : (state.data.settings.productCategories || defaultProductCats())[0] };
    document.getElementById('prf-title').textContent = p ? 'Editar producto' : 'Nuevo producto';
    document.getElementById('prf-save').textContent = p ? 'Guardar cambios' : 'Guardar producto';
    document.getElementById('prf-name').value = p ? p.name : '';
    document.getElementById('prf-price').value = p && p.price ? dots(p.price) : '';
    document.getElementById('prf-min').value = p ? String(p.minStock || 0) : '1';
    document.getElementById('prf-notes').value = p ? (p.notes || '') : '';
    var err = document.getElementById('prf-err');
    err.hidden = true;
    err.textContent = '';
    renderProdCats();
    if (prodModalEl.hidden) histPush();
    prodModalEl.hidden = false;
    document.getElementById('prf-name').focus();
  }
  function closeProductModal() { if (!prodModalEl.hidden) { prodModalEl.hidden = true; histConsume(); } }
  function submitProduct() {
    var name = document.getElementById('prf-name').value.trim();
    if (!name) {
      var err = document.getElementById('prf-err');
      err.textContent = 'El nombre es obligatorio.';
      err.hidden = false;
      return;
    }
    var price = parseMoney(document.getElementById('prf-price').value);
    var minStock = Math.max(0, Math.min(999, Number(document.getElementById('prf-min').value) || 0));
    var notes = document.getElementById('prf-notes').value;
    var isNew = !prForm.id;
    var newId = null;
    mutate(function (d) {
      if (prForm.id) {
        var p = d.products.find(function (x) { return x.id === prForm.id; });
        if (p) { p.name = name; p.category = prForm.category; p.price = price; p.minStock = minStock; p.notes = notes; }
      } else {
        newId = uid();
        d.products.push({ id: newId, name: name, category: prForm.category, notes: notes, photos: [], cost: 0, price: price, stock: 0, minStock: minStock, adjusts: [] });
      }
    });
    if (isNew && newId) {
      absorbOverlay(prodModalEl);
      goProduct(newId);
      toast('Producto guardado. El stock entra con las compras.');
    } else {
      closeProductModal();
      toast('Producto actualizado.');
    }
  }
  function delProduct(id) {
    var p = productById(id);
    if (p) delOwnerPhotos(p);
    mutate(function (d) {
      d.products = (d.products || []).filter(function (x) { return x.id !== id; });
    });
    go('stock');
    toast('Producto eliminado. Las compras registradas se conservan.');
  }

  // ===== Modal compra (importación en 2 pasos / compra local) =====
  var purModalEl = document.getElementById('modal-purchase');
  var buForm = {};
  function productOptions(selId) {
    var prods = (state.data.products || []).slice().sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });
    return '<option value="">Elegir producto…</option>' + prods.map(function (p) {
      return '<option value="' + esc(p.id) + '"' + (selId === p.id ? ' selected' : '') + '>' + esc(p.name) + '</option>';
    }).join('');
  }
  function purchaseSum() {
    return (buForm.items || []).reduce(function (a, it) {
      if (it.kind === 'set') return a + (Number(it.qty) || 0) * (Number(it.setPrice) || 0);
      return a + (Number(it.qty) || 0) * (Number(it.unitBase) || 0);
    }, 0);
  }
  function renderPurchaseForm() {
    document.getElementById('buf-import').classList.toggle('active', buForm.type === 'import');
    document.getElementById('buf-local').classList.toggle('active', buForm.type === 'local');
    document.getElementById('buf-date-label').textContent = buForm.type === 'import' ? 'Fecha del pago' : 'Fecha de compra';
    document.getElementById('buf-items-label').textContent = buForm.type === 'import' ? 'Productos del pedido (precio base de China c/u)' : 'Productos comprados (costo c/u)';
    document.getElementById('buf-sum-label').textContent = buForm.type === 'import' ? 'Suma base del pedido' : 'Total de la compra';
    document.getElementById('buf-paid-wrap').style.display = buForm.type === 'import' ? '' : 'none';
    document.getElementById('buf-hint').style.display = buForm.type === 'import' ? '' : 'none';
    document.getElementById('buf-save').textContent = buForm.type === 'import' ? 'Guardar pedido (pagué)' : 'Guardar compra';

    var box = document.getElementById('buf-items');
    var html = '';
    (buForm.items || []).forEach(function (it, i) {
      if (it.kind === 'set') {
        var bombaPart = Math.max(0, (Number(it.setPrice) || 0) - (Number(it.motorPart) || 0));
        html += '<div class="bu-set"><div class="bu-set-head"><span>Conjunto motor + bomba</span>' +
          '<button type="button" class="bu-rm" data-bu-rm="' + i + '">✕</button></div>' +
          '<div class="bu-grid"><select data-bu-set-motor="' + i + '">' + productOptions(it.motorId) + '</select>' +
          '<select data-bu-set-bomba="' + i + '">' + productOptions(it.bombaId) + '</select></div>' +
          '<div class="bu-grid3">' +
          '<label>Conjuntos<input type="number" min="1" max="999" value="' + esc(String(it.qty || 1)) + '" data-bu-set-qty="' + i + '"></label>' +
          '<label>Precio conjunto<input inputmode="numeric" class="mono-input" value="' + (it.setPrice ? esc(dots(it.setPrice)) : '') + '" placeholder="1.600.000" data-bu-set-price="' + i + '"></label>' +
          '<label>Parte del motor<input inputmode="numeric" class="mono-input" value="' + (it.motorPart ? esc(dots(it.motorPart)) : '') + '" placeholder="1.000.000" data-bu-set-motor-part="' + i + '"></label>' +
          '</div>' +
          '<div class="bu-set-foot">Parte de la bomba: <span class="mono">' + esc(fmtG(bombaPart)) + '</span> (se calcula sola)</div></div>';
      } else {
        html += '<div class="bu-item">' +
          '<select data-bu-prod="' + i + '">' + productOptions(it.productId) + '</select>' +
          '<input type="number" min="1" max="999" value="' + esc(String(it.qty || 1)) + '" data-bu-qty="' + i + '" aria-label="Cantidad">' +
          '<input inputmode="numeric" class="mono-input" value="' + (it.unitBase ? esc(dots(it.unitBase)) : '') + '" placeholder="₲ c/u" data-bu-unit="' + i + '" aria-label="Precio unitario">' +
          '<button type="button" class="bu-rm" data-bu-rm="' + i + '">✕</button></div>';
      }
    });
    if (!(buForm.items || []).length) {
      html = '<div class="set-hint">Agregá al menos un producto (o un conjunto motor+bomba).</div>';
    }
    box.innerHTML = html;
    document.getElementById('buf-sum').textContent = fmtG(purchaseSum());

    box.querySelectorAll('[data-bu-rm]').forEach(function (el) {
      el.addEventListener('click', function () {
        buForm.items.splice(Number(el.getAttribute('data-bu-rm')), 1);
        renderPurchaseForm();
      });
    });
    box.querySelectorAll('[data-bu-prod]').forEach(function (el) {
      el.addEventListener('change', function () { buForm.items[Number(el.getAttribute('data-bu-prod'))].productId = el.value; });
    });
    box.querySelectorAll('[data-bu-qty]').forEach(function (el) {
      el.addEventListener('input', function () {
        buForm.items[Number(el.getAttribute('data-bu-qty'))].qty = Number(el.value) || 0;
        document.getElementById('buf-sum').textContent = fmtG(purchaseSum());
      });
    });
    box.querySelectorAll('[data-bu-unit]').forEach(function (el) {
      el.addEventListener('input', function () {
        var n = parseMoney(el.value);
        el.value = n ? dots(n) : '';
        buForm.items[Number(el.getAttribute('data-bu-unit'))].unitBase = n;
        document.getElementById('buf-sum').textContent = fmtG(purchaseSum());
      });
    });
    box.querySelectorAll('[data-bu-set-motor]').forEach(function (el) {
      el.addEventListener('change', function () { buForm.items[Number(el.getAttribute('data-bu-set-motor'))].motorId = el.value; });
    });
    box.querySelectorAll('[data-bu-set-bomba]').forEach(function (el) {
      el.addEventListener('change', function () { buForm.items[Number(el.getAttribute('data-bu-set-bomba'))].bombaId = el.value; });
    });
    box.querySelectorAll('[data-bu-set-qty]').forEach(function (el) {
      el.addEventListener('input', function () {
        buForm.items[Number(el.getAttribute('data-bu-set-qty'))].qty = Number(el.value) || 0;
        document.getElementById('buf-sum').textContent = fmtG(purchaseSum());
      });
    });
    box.querySelectorAll('[data-bu-set-price]').forEach(function (el) {
      el.addEventListener('input', function () {
        var i = Number(el.getAttribute('data-bu-set-price'));
        var n = parseMoney(el.value);
        el.value = n ? dots(n) : '';
        buForm.items[i].setPrice = n;
        document.getElementById('buf-sum').textContent = fmtG(purchaseSum());
        var foot = el.closest('.bu-set').querySelector('.bu-set-foot .mono');
        foot.textContent = fmtG(Math.max(0, n - (Number(buForm.items[i].motorPart) || 0)));
      });
    });
    box.querySelectorAll('[data-bu-set-motor-part]').forEach(function (el) {
      el.addEventListener('input', function () {
        var i = Number(el.getAttribute('data-bu-set-motor-part'));
        var n = parseMoney(el.value);
        el.value = n ? dots(n) : '';
        buForm.items[i].motorPart = n;
        var foot = el.closest('.bu-set').querySelector('.bu-set-foot .mono');
        foot.textContent = fmtG(Math.max(0, (Number(buForm.items[i].setPrice) || 0) - n));
      });
    });
  }
  function openPurchaseModal() {
    if (!(state.data.products || []).length) {
      toast('Primero cargá al menos un producto en el catálogo.');
      openProductModal(null);
      return;
    }
    buForm = { type: 'import', items: [{ kind: 'item', productId: '', qty: 1, unitBase: 0 }] };
    document.getElementById('buf-date').value = todayIso();
    document.getElementById('buf-paid').value = '';
    document.getElementById('buf-note').value = '';
    var err = document.getElementById('buf-err');
    err.hidden = true;
    err.textContent = '';
    renderPurchaseForm();
    if (purModalEl.hidden) histPush();
    purModalEl.hidden = false;
  }
  function closePurchaseModal() { if (!purModalEl.hidden) { purModalEl.hidden = true; histConsume(); } }
  function buErr(msg) {
    var err = document.getElementById('buf-err');
    err.textContent = msg;
    err.hidden = false;
  }
  // Convierte las filas del formulario (items y conjuntos) a items planos {productId, qty, unitBase}
  function flattenPurchaseItems() {
    var out = [];
    var bad = null;
    (buForm.items || []).forEach(function (it) {
      if (bad) return;
      if (it.kind === 'set') {
        var setPrice = Number(it.setPrice) || 0;
        var motorPart = Number(it.motorPart) || 0;
        if (!it.motorId || !it.bombaId) { bad = 'En el conjunto: elegí el producto del motor y el de la bomba.'; return; }
        if (it.motorId === it.bombaId) { bad = 'En el conjunto: el motor y la bomba tienen que ser productos distintos.'; return; }
        if (!(Number(it.qty) > 0)) { bad = 'En el conjunto: cargá cuántos conjuntos trajiste.'; return; }
        if (setPrice <= 0) { bad = 'En el conjunto: cargá el precio del conjunto.'; return; }
        if (motorPart <= 0 || motorPart >= setPrice) { bad = 'En el conjunto: la parte del motor tiene que ser mayor a 0 y menor al precio del conjunto.'; return; }
        out.push({ productId: it.motorId, qty: Number(it.qty), unitBase: motorPart });
        out.push({ productId: it.bombaId, qty: Number(it.qty), unitBase: setPrice - motorPart });
      } else {
        if (!it.productId) { bad = 'Elegí el producto en todas las filas.'; return; }
        if (!(Number(it.qty) > 0)) { bad = 'Cargá la cantidad en todas las filas.'; return; }
        if (!(Number(it.unitBase) > 0)) { bad = 'Cargá el precio unitario en todas las filas.'; return; }
        out.push({ productId: it.productId, qty: Number(it.qty), unitBase: Number(it.unitBase) });
      }
    });
    return bad ? { error: bad } : { items: out };
  }
  function submitPurchase() {
    if (!(buForm.items || []).length) { buErr('Agregá al menos un producto.'); return; }
    var flat = flattenPurchaseItems();
    if (flat.error) { buErr(flat.error); return; }
    var date = document.getElementById('buf-date').value || todayIso();
    var note = document.getElementById('buf-note').value || '';
    var sum = flat.items.reduce(function (a, it) { return a + it.qty * it.unitBase; }, 0);
    var isImport = buForm.type === 'import';
    var paid = isImport ? (parseMoney(document.getElementById('buf-paid').value) || sum) : sum;
    var purchase = {
      id: uid(), type: buForm.type, status: isImport ? 'paid' : 'received',
      paidDate: date, receivedDate: isImport ? '' : date, note: note,
      paidAmount: paid, totalFinal: isImport ? 0 : sum,
      items: flat.items.map(function (it) {
        return isImport ? it : { productId: it.productId, qty: it.qty, unitBase: it.unitBase, unitCost: it.unitBase };
      })
    };
    mutate(function (d) {
      d.purchases.push(purchase);
      if (!isImport) applyPurchaseToStock(d, purchase);
    });
    closePurchaseModal();
    vib(30);
    toast(isImport ? 'Pedido guardado — cuando llegue, tocá «Llegó la mercadería».' : 'Compra guardada y stock actualizado.');
  }
  function delPurchase(id) {
    mutate(function (d) {
      d.purchases = (d.purchases || []).filter(function (b) { return b.id !== id; });
    });
    toast('Pedido eliminado.');
  }

  // ===== Modal llegada de mercadería (paso 2 con prorrateo) =====
  var rcvModalEl = document.getElementById('modal-receive');
  var rcForm = {};
  function renderReceivePreview() {
    var b = (state.data.purchases || []).find(function (x) { return x.id === rcForm.purchaseId; });
    if (!b) return;
    var sumBase = (b.items || []).reduce(function (a, it) { return a + (Number(it.qty) || 0) * (Number(it.unitBase) || 0); }, 0);
    var total = parseMoney(document.getElementById('rcf-total').value) || 0;
    var factor = sumBase > 0 && total > 0 ? total / sumBase : 1;
    document.getElementById('rcf-items').innerHTML = (b.items || []).map(function (it) {
      var p = productById(it.productId);
      var real = Math.round((Number(it.unitBase) || 0) * factor);
      return '<div class="rcf-row"><span class="rcf-name">' + esc(p ? p.name : '(producto eliminado)') + ' × ' + esc(String(it.qty)) + '</span>' +
        '<span class="rcf-cost mono">' + esc(fmtG(it.unitBase)) + ' → <b>' + esc(fmtG(real)) + '</b> c/u</span></div>';
    }).join('') + '<div class="rcf-row total"><span class="rcf-name">Suma base</span><span class="rcf-cost mono">' + esc(fmtG(sumBase)) + '</span></div>';
  }
  function openReceiveModal(purchaseId) {
    var b = (state.data.purchases || []).find(function (x) { return x.id === purchaseId; });
    if (!b || b.status !== 'paid') return;
    rcForm = { purchaseId: purchaseId };
    document.getElementById('rcf-sub').textContent =
      (b.note ? b.note + ' · ' : '') + 'pedido pagado el ' + dd(b.paidDate) + (b.paidAmount ? ' (' + fmtG(b.paidAmount) + ')' : '');
    document.getElementById('rcf-date').value = todayIso();
    document.getElementById('rcf-total').value = b.paidAmount ? dots(b.paidAmount) : '';
    var err = document.getElementById('rcf-err');
    err.hidden = true;
    err.textContent = '';
    renderReceivePreview();
    if (rcvModalEl.hidden) histPush();
    rcvModalEl.hidden = false;
    document.getElementById('rcf-total').focus();
  }
  function closeReceiveModal() { if (!rcvModalEl.hidden) { rcvModalEl.hidden = true; histConsume(); } }
  function submitReceive() {
    var total = parseMoney(document.getElementById('rcf-total').value);
    if (total <= 0) {
      var err = document.getElementById('rcf-err');
      err.textContent = 'Cargá el costo total final del lote.';
      err.hidden = false;
      return;
    }
    var date = document.getElementById('rcf-date').value || todayIso();
    mutate(function (d) {
      var b = (d.purchases || []).find(function (x) { return x.id === rcForm.purchaseId; });
      if (!b || b.status !== 'paid') return;
      var sumBase = (b.items || []).reduce(function (a, it) { return a + (Number(it.qty) || 0) * (Number(it.unitBase) || 0); }, 0);
      var factor = sumBase > 0 ? total / sumBase : 1;
      (b.items || []).forEach(function (it) { it.unitCost = (Number(it.unitBase) || 0) * factor; });
      b.status = 'received';
      b.receivedDate = date;
      b.totalFinal = total;
      applyPurchaseToStock(d, b);
    });
    closeReceiveModal();
    vib(30);
    toast('Mercadería ingresada al stock con su costo real.');
  }

  // ===== Modal ajuste de stock (merma) =====
  var adjModalEl = document.getElementById('modal-adjust');
  var ajForm = {};
  function openAdjustModal(productId) {
    var p = productById(productId);
    if (!p) return;
    if ((Number(p.stock) || 0) <= 0) { toast('Este producto no tiene stock para descontar.'); return; }
    ajForm = { productId: productId };
    document.getElementById('ajf-sub').textContent = p.name + ' — en stock: ' + (Number(p.stock) || 0);
    document.getElementById('ajf-qty').value = '1';
    document.getElementById('ajf-qty').max = String(Number(p.stock) || 1);
    document.getElementById('ajf-date').value = todayIso();
    document.getElementById('ajf-reason').value = '';
    var err = document.getElementById('ajf-err');
    err.hidden = true;
    err.textContent = '';
    if (adjModalEl.hidden) histPush();
    adjModalEl.hidden = false;
  }
  function closeAdjustModal() { if (!adjModalEl.hidden) { adjModalEl.hidden = true; histConsume(); } }
  function submitAdjust() {
    var p = productById(ajForm.productId);
    if (!p) { closeAdjustModal(); return; }
    var qty = Number(document.getElementById('ajf-qty').value) || 0;
    var reason = document.getElementById('ajf-reason').value.trim();
    var err = document.getElementById('ajf-err');
    if (qty < 1 || qty > (Number(p.stock) || 0)) {
      err.textContent = 'La cantidad tiene que estar entre 1 y ' + (Number(p.stock) || 0) + '.';
      err.hidden = false;
      return;
    }
    if (!reason) {
      err.textContent = 'Contá el motivo (queda en el historial).';
      err.hidden = false;
      return;
    }
    var date = document.getElementById('ajf-date').value || todayIso();
    mutate(function (d) {
      var pp = (d.products || []).find(function (x) { return x.id === ajForm.productId; });
      if (!pp) return;
      pp.stock = Math.max(0, (Number(pp.stock) || 0) - qty);
      pp.adjusts = pp.adjusts || [];
      // se guarda el costo vigente para valorizar la merma en el estado de resultados
      pp.adjusts.push({ id: uid(), date: date, qty: qty, reason: reason, cost: Number(pp.cost) || 0 });
    });
    closeAdjustModal();
    vib(30);
    toast('Stock ajustado: −' + qty + '. Quedó registrado como merma.');
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

  // ===== Alertas de cobro (trabajos + ventas) =====
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
        alerts.push({ kind: 'job', j: j, x: x, diff: diff, group: group, bal: bal });
      });
    });
    (state.data.sales || []).forEach(function (s) {
      if (!s.credit) return;
      var bal = saleBalance(s);
      if (bal <= 0) return;
      var remind = Number(S.remindDays) || 0;
      (s.dueDates || []).forEach(function (x) {
        if (x.done) return;
        var diff = daysBetween(today, x.date);
        var group = diff < 0 ? 'venc' : diff === 0 ? 'hoy' : diff <= remind ? 'prox' : 'fut';
        alerts.push({ kind: 'sale', j: s, x: x, diff: diff, group: group, bal: bal });
      });
    });
    alerts.sort(function (a, b) { return a.x.date < b.x.date ? -1 : 1; });
    return alerts;
  }
  function jobsSinFecha() {
    var out = [];
    (state.data.jobs || []).forEach(function (j) {
      if (j.credit && jobBalance(j) > 0 && !(j.dueDates || []).some(function (x) { return !x.done; })) {
        out.push({ kind: 'job', x: j });
      }
    });
    (state.data.sales || []).forEach(function (s) {
      if (s.credit && saleBalance(s) > 0 && !(s.dueDates || []).some(function (x) { return !x.done; })) {
        out.push({ kind: 'sale', x: s });
      }
    });
    return out;
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
    var jobDebts = jobsOf(cid).filter(function (j) { return j.credit && jobBalance(j) > 0; });
    var saleDebts = salesOf(cid).filter(function (s) { return s.credit && saleBalance(s) > 0; });
    if (!jobDebts.length && !saleDebts.length) { toast('Este cliente está al día.'); return; }
    var bal = jobDebts.reduce(function (a, j) { return a + jobBalance(j); }, 0) +
      saleDebts.reduce(function (a, s) { return a + saleBalance(s); }, 0);
    var concept;
    if (jobDebts.length === 1 && !saleDebts.length) concept = jobDebts[0].desc || jobDebts[0].category;
    else if (!jobDebts.length && saleDebts.length === 1) concept = 'la ' + payDebtorLabel('sale', saleDebts[0]).toLowerCase();
    else if (!jobDebts.length) concept = 'las ventas de productos';
    else if (!saleDebts.length) concept = 'los trabajos realizados';
    else concept = 'los trabajos y ventas';
    window.open(waLink(c.phone, waRemindMsg(c.name, bal, concept)), '_blank', 'noopener');
  }

  // ===== Estado de cuenta compartible =====
  function accountStatement(cid) {
    var c = state.data.clients.find(function (x) { return x.id === cid; });
    if (!c) return '';
    var debts = jobsOf(cid).filter(function (j) { return j.credit && jobBalance(j) > 0; })
      .sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    var saleDebts = salesOf(cid).filter(function (s) { return s.credit && saleBalance(s) > 0; })
      .sort(function (a, b) { return (a.date || '') < (b.date || '') ? -1 : 1; });
    var total = 0;
    var lines = [];
    lines.push('JGM SERVICIOS — Estado de cuenta');
    lines.push('Cliente: ' + c.name);
    lines.push('Fecha: ' + dd(todayIso()));
    lines.push('');
    if (debts.length || saleDebts.length) {
      if (debts.length) {
        lines.push('Trabajos con saldo pendiente:');
        debts.forEach(function (j) {
          var paid = jobPaid(j), balj = jobBalance(j);
          total += balj;
          lines.push('• ' + (j.desc || j.category) + ' — ' + dd(j.date));
          lines.push('  Precio: ' + fmtG(j.price) + ' · Pagado: ' + fmtG(paid) + ' · Saldo: ' + fmtG(balj));
        });
      }
      if (saleDebts.length) {
        if (debts.length) lines.push('');
        lines.push('Ventas con saldo pendiente:');
        saleDebts.forEach(function (s) {
          var paid = salePaid(s), bals = saleBalance(s);
          total += bals;
          lines.push('• ' + payDebtorLabel('sale', s) + ' — ' + dd(s.date));
          lines.push('  Precio: ' + fmtG(saleTotal(s)) + ' · Pagado: ' + fmtG(paid) + ' · Saldo: ' + fmtG(bals));
        });
      }
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
      '<span class="job-caret">' + (expanded ? '▲ cerrar' : '▼ detalles') + '</span></div>';
    (j.items || []).forEach(function (it) {
      var p = productById(it.productId);
      var w = warrantyInfo(j.date, it.warrantyMonths);
      html += '<div class="sale-line"><span class="sale-line-name">🛒 ' +
        esc((p ? p.name : '(producto eliminado)') + (it.qty > 1 ? ' × ' + it.qty : '')) + '</span>' +
        '<span class="sale-line-price mono">' + esc(fmtG((Number(it.qty) || 0) * (Number(it.unitPrice) || 0))) + '</span></div>';
      if (w) {
        html += '<div class="warranty-chip ' + (w.active ? 'ok' : 'off') + '">' +
          (w.active ? '🛡 Garantía vigente hasta ' + esc(dd(w.until)) : 'Garantía vencida el ' + esc(dd(w.until))) + '</div>';
      }
    });
    html += '<div class="job-mode-row"><span class="job-mode">' + (j.credit ? 'Crédito' : 'Contado') +
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

  // Tarjeta de una venta en la ficha del cliente: precios de venta completos,
  // SIN costos ni ganancia (eso vive solo en el estado de resultados).
  function saleCardHtml(s) {
    var total = saleTotal(s), paid = salePaid(s), bal = saleBalance(s);
    var isPaid = s.credit ? bal <= 0 : true;
    var pct = total > 0 ? Math.min(100, Math.round(paid / total * 100)) : 0;
    var pendDues = (s.dueDates || []).filter(function (x) { return !x.done; });
    var delLbl = state.confirmKey === 'delsale:' + s.id ? '¿Seguro?' : 'Eliminar';

    var html = '<div class="job-card sale-card">' +
      '<div class="job-head">' +
      '<div class="job-head-top"><span class="cat-pill sale">🛒 Venta</span>' +
      '<span class="job-date">' + esc(dd(s.date)) + '</span></div>';
    (s.items || []).forEach(function (it) {
      var p = productById(it.productId);
      var w = warrantyInfo(s.date, it.warrantyMonths);
      html += '<div class="sale-line"><span class="sale-line-name">' +
        esc((p ? p.name : '(producto eliminado)') + (it.qty > 1 ? ' × ' + it.qty : '')) + '</span>' +
        '<span class="sale-line-price mono">' + esc(fmtG((Number(it.qty) || 0) * (Number(it.unitPrice) || 0))) + '</span></div>';
      if (w) {
        html += '<div class="warranty-chip ' + (w.active ? 'ok' : 'off') + '">' +
          (w.active ? '🛡 Garantía vigente hasta ' + esc(dd(w.until)) : 'Garantía vencida el ' + esc(dd(w.until))) + '</div>';
      }
    });
    html += '<div class="job-mode-row"><span class="job-mode">' + (s.credit ? 'Crédito' : 'Contado') +
      ' · <span class="mono">' + esc(fmtG(total)) + '</span></span>' +
      '<span class="st-pill ' + (isPaid ? 'st-paid' : 'st-debt') + '">' + esc(isPaid ? 'Pagado' : 'Debe ' + mill(bal)) + '</span></div>';
    if (s.credit) {
      html += '<div class="progress"><div style="width:' + pct + '%;"></div></div>' +
        '<div class="job-pay-row">' +
        '<span>Pagado: <span class="mono" style="color:#1F8A5B;">' + esc(fmtG(paid)) + '</span></span>' +
        '<span>Saldo: <span class="mono" style="color:' + (bal > 0 ? '#C2452D' : '#1F8A5B') + ';">' + esc(fmtG(bal)) + '</span></span></div>';
      if (pendDues.length) {
        html += '<div class="due-chips">' + pendDues.map(function (x) {
          return dueChipHtml(x, { remind: null });
        }).join('') + '</div>';
      }
      var pays = (s.payments || []).slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
      if (pays.length) {
        html += '<div class="pay-list" style="margin-top:8px;">' + pays.map(function (p) {
          var delP = state.confirmKey === 'delspay:' + p.id ? '¿?' : '✕';
          return '<div class="pay-row"><span class="pay-row-label">' + esc(dd(p.date) + (p.note ? ' · ' + p.note : '')) + '</span>' +
            '<span class="pay-row-right"><span class="pay-row-amount">+ ' + esc(fmtG(p.amount)) + '</span>' +
            '<button type="button" class="pay-btn pay-edit" data-spay-edit="' + esc(s.id) + ':' + esc(p.id) + '" aria-label="Editar pago">✎</button>' +
            '<button type="button" class="pay-btn pay-del" data-spay-del="' + esc(s.id) + ':' + esc(p.id) + '" aria-label="Borrar pago">' + delP + '</button></span></div>';
        }).join('') + '</div>';
      }
    }
    html += '<div class="job-actions" style="margin-top:10px;">';
    if (s.credit && bal > 0) {
      html += '<button type="button" class="btn-pay" data-sale-pay="' + esc(s.id) + '">+ Registrar pago</button>' +
        '<button type="button" class="btn-ghost" data-sale-post="' + esc(s.id) + '">' + (pendDues.length ? 'Posponer' : 'Fijar fecha') + '</button>';
    }
    html += '<button type="button" class="btn-ghost-danger" data-sale-del="' + esc(s.id) + '">' + delLbl + '</button></div>';
    html += '</div></div>';
    return html;
  }

  function renderCliente() {
    var box = document.getElementById('cliente-detail');
    var c = state.data.clients.find(function (x) { return x.id === state.clientId; });
    if (!c) { go('clientes'); return; }
    loadPhotos(c.photos);
    var bal = clientBalances()[c.id] || 0;
    var js = jobsOf(c.id).sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    var vs = salesOf(c.id).sort(function (a, b) { return (a.date || '') < (b.date || '') ? 1 : -1; });
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
    if ((state.data.products || []).length) {
      html += '<button type="button" class="btn-big-sale js-client-sale">🛒 Vender producto del stock</button>';
    }
    if (bal > 0) {
      html += '<button type="button" class="btn-big-pay js-client-pay">+ Registrar pago</button>';
      html += '<div class="acct-actions">' +
        (wa ? '<button type="button" class="acct-btn wa js-client-remind">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.5 8.5 0 0 1-12.3 7.6L4 20l1-4.5A8.5 8.5 0 1 1 21 11.5"/></svg>' +
          'Recordar por WhatsApp</button>' : '') +
        '<button type="button" class="acct-btn js-client-statement">📄 Estado de cuenta</button></div>';
    }

    // trabajos y ventas mezclados por fecha (los más nuevos arriba)
    var feed = js.map(function (j) { return { t: 'job', d: j.date || '', o: j }; })
      .concat(vs.map(function (s) { return { t: 'sale', d: s.date || '', o: s }; }))
      .sort(function (a, b) { return a.d < b.d ? 1 : -1; });
    if (feed.length) {
      html += feed.map(function (f) { return f.t === 'job' ? jobCardHtml(f.o) : saleCardHtml(f.o); }).join('');
    } else {
      html += '<div class="dashed-card">Este cliente todavía no tiene trabajos ni ventas cargados.</div>';
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
          // se borra el historial; lo vendido salió de verdad, el stock no se toca
          d.sales = (d.sales || []).filter(function (x) { return x.clientId !== c.id; });
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
    var clientSaleBtn = box.querySelector('.js-client-sale');
    if (clientSaleBtn) clientSaleBtn.addEventListener('click', function () { openSaleModal({ clientId: c.id }); });
    box.querySelectorAll('[data-sale-pay]').forEach(function (el) {
      el.addEventListener('click', function () { openPaySale(el.getAttribute('data-sale-pay')); });
    });
    box.querySelectorAll('[data-sale-post]').forEach(function (el) {
      el.addEventListener('click', function () { openPostKind('sale', el.getAttribute('data-sale-post'), null); });
    });
    box.querySelectorAll('[data-sale-del]').forEach(function (el) {
      el.addEventListener('click', function () {
        var id = el.getAttribute('data-sale-del');
        confirm2('delsale:' + id, function () { delSale(id); });
      });
    });
    box.querySelectorAll('[data-spay-edit]').forEach(function (el) {
      el.addEventListener('click', function () {
        var parts = el.getAttribute('data-spay-edit').split(':');
        openPaySale(parts[0], parts[1]);
      });
    });
    box.querySelectorAll('[data-spay-del]').forEach(function (el) {
      el.addEventListener('click', function () {
        var parts = el.getAttribute('data-spay-del').split(':');
        confirm2('delspay:' + parts[1], function () { delPayment('sale', parts[0], parts[1]); });
      });
    });
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
        confirm2('delpay:' + payId, function () { delPayment('job', jobId, payId); });
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
            var dj = d.jobs.find(function (x) { return x.id === id; });
            if (dj) applySoldItems(d, dj.items, +1); // deshacer: sus productos vuelven al stock
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

    // mismos números que la fila del mes en el Registro mensual
    var mes = today.slice(0, 7);
    var mrow = monthlyStats().find(function (r) { return r.ym === mes; });
    var mesReal = mrow ? mrow.facturado : 0;
    var mesCob = mrow ? mrow.cobrado : 0;
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
    // aviso de stock bajo
    var lowP = lowStockProducts();
    if (lowP.length) {
      var lMsg = lowP.length === 1
        ? 'Stock bajo: ' + lowP[0].name + ' (queda' + ((Number(lowP[0].stock) || 0) === 1 ? '' : 'n') + ' ' + (Number(lowP[0].stock) || 0) + ').'
        : 'Tenés ' + lowP.length + ' productos con stock bajo.';
      html += '<div class="lowstock-banner"><span>⚠ ' + esc(lMsg) + '</span>' +
        '<button type="button" data-go="stock">Ver</button></div>';
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

    // accesos: finanzas y stock
    html += '<button type="button" class="reg-open" data-go="registro">' +
      '<span class="reg-open-main"><span class="reg-open-title">Finanzas del negocio</span>' +
      '<span class="reg-open-sub">Caja, resultado, gastos y registro mensual</span></span>' +
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg></button>';
    var nProds = (state.data.products || []).length;
    var nPend = pendingPurchases().length;
    html += '<button type="button" class="reg-open" data-go="stock">' +
      '<span class="reg-open-main"><span class="reg-open-title">Stock y productos' +
      (nPend ? ' · ' + nPend + ' pedido' + (nPend === 1 ? '' : 's') + ' en viaje' : '') + '</span>' +
      '<span class="reg-open-sub">' + (nProds ? nProds + (nProds === 1 ? ' producto' : ' productos') + ' para la venta' : 'Catálogo, compras y mermas') + '</span></span>' +
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
    function bkt(ym) {
      if (!map[ym]) map[ym] = { facturado: 0, cobrado: 0, gastos: 0, compras: 0, cogs: 0, mermas: 0 };
      return map[ym];
    }
    (state.data.jobs || []).forEach(function (j) {
      var jm = (j.date || '').slice(0, 7);
      var price = Number(j.price) || 0;
      if (jm) {
        bkt(jm).facturado += price;
        bkt(jm).cogs += itemsCost(j.items); // costo de los productos vendidos en el trabajo
      }
      if (j.credit) {
        (j.payments || []).forEach(function (p) {
          var pm = (p.date || '').slice(0, 7);
          if (pm) bkt(pm).cobrado += Number(p.amount) || 0;
        });
      } else if (jm) {
        bkt(jm).cobrado += price;
      }
    });
    (state.data.sales || []).forEach(function (s) {
      var sm = (s.date || '').slice(0, 7);
      var total = saleTotal(s);
      if (sm) {
        bkt(sm).facturado += total;
        bkt(sm).cogs += itemsCost(s.items);
      }
      if (s.credit) {
        (s.payments || []).forEach(function (p) {
          var pm = (p.date || '').slice(0, 7);
          if (pm) bkt(pm).cobrado += Number(p.amount) || 0;
        });
      } else if (sm) {
        bkt(sm).cobrado += total;
      }
    });
    (state.data.expenses || []).forEach(function (e) {
      var em = (e.date || '').slice(0, 7);
      if (em) bkt(em).gastos += Number(e.amount) || 0;
    });
    // plata que salió por compras de mercadería (caja, no gasto): lo pagado al
    // pedir, y al recibir la diferencia hasta el costo final (flete/aduana)
    (state.data.purchases || []).forEach(function (b) {
      var pm = (b.paidDate || '').slice(0, 7);
      if (pm) bkt(pm).compras += Number(b.paidAmount) || 0;
      if (b.status === 'received') {
        var rm = (b.receivedDate || '').slice(0, 7);
        var rest = (Number(b.totalFinal) || 0) - (Number(b.paidAmount) || 0);
        if (rm && rest) bkt(rm).compras += rest;
      }
    });
    // mermas valorizadas al costo (las nuevas guardan su costo; las viejas usan el vigente)
    (state.data.products || []).forEach(function (p) {
      (p.adjusts || []).forEach(function (a) {
        var am = (a.date || '').slice(0, 7);
        var unit = a.cost != null ? Number(a.cost) : (Number(p.cost) || 0);
        if (am) bkt(am).mermas += (Number(a.qty) || 0) * unit;
      });
    });
    return Object.keys(map).sort().reverse().map(function (ym) {
      var m = map[ym];
      var salio = m.gastos + m.compras;
      var bruto = m.facturado - m.cogs - m.mermas;
      return {
        ym: ym, mes: monthName(ym), anio: ym.slice(0, 4),
        facturado: m.facturado, cobrado: m.cobrado, gastos: m.gastos,
        compras: m.compras, cogs: m.cogs, mermas: m.mermas,
        salio: salio, caja: m.cobrado - salio,
        bruto: bruto, neto: bruto - m.gastos
      };
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
    var T = { facturado: 0, cobrado: 0, gastos: 0, compras: 0, cogs: 0, mermas: 0 };
    rows.forEach(function (r) {
      T.facturado += r.facturado; T.cobrado += r.cobrado; T.gastos += r.gastos;
      T.compras += r.compras; T.cogs += r.cogs; T.mermas += r.mermas;
    });
    var tSalio = T.gastos + T.compras;
    var tCaja = T.cobrado - tSalio;
    var tBruto = T.facturado - T.cogs - T.mermas;
    var tNeto = tBruto - T.gastos;
    var pct = function (n) { return T.facturado > 0 ? ' (' + Math.round(n / T.facturado * 100) + '%)' : ''; };

    // ① Caja real: la plata que entró y salió de verdad
    html += '<div class="reg-total"><div class="reg-total-title">💰 Caja — plata real</div>' +
      '<div class="reg-total-row"><span>Entró (cobrado)</span>' +
      '<span class="mono blue">' + esc(fmtG(T.cobrado)) + '</span></div>' +
      '<div class="reg-total-row"><span>Salió en gastos</span>' +
      '<span class="mono red">− ' + esc(fmtG(T.gastos)) + '</span></div>' +
      '<div class="reg-total-row"><span>Salió en compras de mercadería</span>' +
      '<span class="mono red">− ' + esc(fmtG(T.compras)) + '</span></div>' +
      '<div class="reg-total-row result"><span>Flujo neto de caja</span>' +
      '<span class="mono ' + (tCaja >= 0 ? 'green' : 'red') + '">' + esc(fmtGS(tCaja)) + '</span></div></div>';

    // ② Resultado económico: la ganancia de verdad (la compra de stock NO es
    //    gasto — el costo entra recién cuando se vende cada unidad)
    html += '<div class="eco-card"><div class="eco-title">📊 Resultado económico</div>' +
      '<div class="eco-row"><span>Ingresos facturados (trabajos + ventas)</span><span class="mono">' + esc(fmtG(T.facturado)) + '</span></div>' +
      '<div class="eco-row"><span>− Costo de los productos vendidos</span><span class="mono red">− ' + esc(fmtG(T.cogs)) + '</span></div>' +
      '<div class="eco-row"><span>− Mermas (roturas / pérdidas)</span><span class="mono red">− ' + esc(fmtG(T.mermas)) + '</span></div>' +
      '<div class="eco-row sub"><span>Margen bruto' + esc(pct(tBruto)) + '</span><span class="mono ' + (tBruto >= 0 ? 'green' : 'red') + '">' + esc(fmtGS(tBruto)) + '</span></div>' +
      '<div class="eco-row"><span>− Gastos operativos</span><span class="mono red">− ' + esc(fmtG(T.gastos)) + '</span></div>' +
      '<div class="eco-row total"><span>Resultado neto' + esc(pct(tNeto)) + '</span><span class="mono ' + (tNeto >= 0 ? 'green' : 'red') + '">' + esc(fmtGS(tNeto)) + '</span></div></div>';

    // ③ tarjetas de estado
    var enViaje = pendingPurchases().reduce(function (a, b) { return a + (Number(b.paidAmount) || 0); }, 0);
    html += '<div class="fin-cards">' +
      '<div class="fin-card"><span class="fin-card-cap">Por cobrar</span><span class="fin-card-val mono">' + esc(fmtG(totalPending())) + '</span></div>' +
      '<div class="fin-card"><span class="fin-card-cap">En stock (al costo)</span><span class="fin-card-val mono">' + esc(fmtG(inventoryValue())) + '</span></div>' +
      '<div class="fin-card"><span class="fin-card-cap">Pedidos en viaje</span><span class="fin-card-val mono">' + esc(fmtG(enViaje)) + '</span></div>' +
      '</div>';

    html += '<div class="reg-hint">Caja = lo que entró menos lo que salió (incluida la mercadería comprada). Resultado económico = tu ganancia real: lo facturado menos lo que costó lo vendido, las mermas y los gastos.</div>';

    // meses agrupados por año, con subtotal anual
    var lastYear = null;
    rows.forEach(function (r) {
      if (r.anio !== lastYear) {
        var yC = 0, yS = 0;
        rows.forEach(function (x) { if (x.anio === r.anio) { yC += x.cobrado; yS += x.salio; } });
        html += '<div class="reg-year"><span class="reg-year-lbl">' + esc(r.anio) + '</span>' +
          '<span class="reg-year-nums">Entró ' + esc(fmtG(yC)) + ' · Salió ' + esc(fmtG(yS)) + ' · Caja ' + esc(fmtGS(yC - yS)) + '</span></div>';
        lastYear = r.anio;
      }
      html += '<div class="reg-row" data-reg-month="' + esc(r.ym) + '">' +
        '<div class="reg-mes">' + esc(r.mes) +
        '<svg class="reg-chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg></div>' +
        '<div class="reg-nums">' +
          '<div class="reg-num"><span class="reg-cap">Facturado</span><span class="reg-val mono">' + esc(fmtG(r.facturado)) + '</span></div>' +
          '<div class="reg-num"><span class="reg-cap">Cobrado</span><span class="reg-val mono blue">' + esc(fmtG(r.cobrado)) + '</span></div>' +
          '<div class="reg-num"><span class="reg-cap">Salió</span><span class="reg-val mono red">' + (r.salio ? '− ' + esc(fmtG(r.salio)) : esc(fmtG(0))) + '</span></div>' +
          '<div class="reg-num"><span class="reg-cap">Caja</span><span class="reg-val mono ' + (r.caja >= 0 ? 'green' : 'red') + '">' + esc(fmtGS(r.caja)) + '</span></div>' +
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
    (D.sales || []).forEach(function (s) {
      var sm = (s.date || '').slice(0, 7);
      var cname = (cById[s.clientId] || {}).name || 'Cliente eliminado';
      var exists = !!cById[s.clientId];
      var desc = payDebtorLabel('sale', s);
      var total = saleTotal(s);
      if (sm === ym) {
        facturado.push({ client: cname, clientId: exists ? s.clientId : '', desc: desc, date: s.date, amount: total, credit: s.credit });
      }
      if (s.credit) {
        (s.payments || []).forEach(function (p) {
          if ((p.date || '').slice(0, 7) === ym) {
            cobrado.push({ client: cname, clientId: exists ? s.clientId : '', concept: (p.note || '').trim() || 'Pago', desc: desc, date: p.date, amount: Number(p.amount) || 0 });
          }
        });
      } else if (sm === ym) {
        cobrado.push({ client: cname, clientId: exists ? s.clientId : '', concept: 'Contado', desc: desc, date: s.date, amount: total });
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
    var mrow = monthlyStats().find(function (r) { return r.ym === ym; }) ||
      { gastos: 0, compras: 0, cogs: 0, mermas: 0, salio: 0, caja: totC, bruto: totF, neto: totF };
    var totG = mrow.gastos;

    var html = '<div class="detail-header">' +
      '<button type="button" class="btn-white js-back"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>Volver</button>' +
      '<div class="spacer"></div></div>';

    html += '<div class="regd-head"><div class="regd-title">' + esc(monthName(ym) + ' ' + (ym || '').slice(0, 4)) + '</div>' +
      '<div class="regd-tots">' +
        '<div class="regd-tot"><span class="regd-tot-cap">Facturado</span><span class="regd-tot-val mono">' + esc(fmtG(totF)) + '</span></div>' +
        '<div class="regd-tot"><span class="regd-tot-cap">Cobrado</span><span class="regd-tot-val mono blue">' + esc(fmtG(totC)) + '</span></div>' +
        '<div class="regd-tot"><span class="regd-tot-cap">Salió (gastos + compras)</span><span class="regd-tot-val mono red">' + (mrow.salio ? '− ' + esc(fmtG(mrow.salio)) : esc(fmtG(0))) + '</span></div>' +
        '<div class="regd-tot"><span class="regd-tot-cap">Caja</span><span class="regd-tot-val mono ' + (mrow.caja >= 0 ? 'green' : 'red') + '">' + esc(fmtGS(mrow.caja)) + '</span></div>' +
      '</div></div>';

    // resultado económico del mes
    html += '<div class="eco-card"><div class="eco-title">📊 Resultado económico del mes</div>' +
      '<div class="eco-row"><span>Ingresos facturados</span><span class="mono">' + esc(fmtG(totF)) + '</span></div>' +
      '<div class="eco-row"><span>− Costo de los productos vendidos</span><span class="mono red">− ' + esc(fmtG(mrow.cogs)) + '</span></div>' +
      '<div class="eco-row"><span>− Mermas</span><span class="mono red">− ' + esc(fmtG(mrow.mermas)) + '</span></div>' +
      '<div class="eco-row sub"><span>Margen bruto</span><span class="mono ' + (mrow.bruto >= 0 ? 'green' : 'red') + '">' + esc(fmtGS(mrow.bruto)) + '</span></div>' +
      '<div class="eco-row"><span>− Gastos operativos</span><span class="mono red">− ' + esc(fmtG(totG)) + '</span></div>' +
      '<div class="eco-row total"><span>Resultado neto</span><span class="mono ' + (mrow.neto >= 0 ? 'green' : 'red') + '">' + esc(fmtGS(mrow.neto)) + '</span></div></div>';

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

    // Compras de mercadería pagadas este mes (caja, no gasto)
    var comprasMes = [];
    (state.data.purchases || []).forEach(function (b) {
      var names = (b.items || []).map(function (it) {
        var p = productById(it.productId);
        return (p ? p.name : '(producto eliminado)') + ' × ' + it.qty;
      }).join(' · ');
      if ((b.paidDate || '').slice(0, 7) === ym && (Number(b.paidAmount) || 0)) {
        comprasMes.push({ date: b.paidDate, names: names, note: b.note, amount: Number(b.paidAmount) || 0, concept: b.type === 'import' ? 'Pago del pedido' : 'Compra local' });
      }
      if (b.status === 'received' && (b.receivedDate || '').slice(0, 7) === ym) {
        var rest = (Number(b.totalFinal) || 0) - (Number(b.paidAmount) || 0);
        if (rest) comprasMes.push({ date: b.receivedDate, names: names, note: b.note, amount: rest, concept: 'Flete / aduana al recibir' });
      }
    });
    comprasMes.sort(function (a, b) { return (a.date || '') < (b.date || '') ? -1 : 1; });
    if (comprasMes.length) {
      html += '<div class="panel"><div class="panel-label">Compras de mercadería · ' + comprasMes.length +
        (comprasMes.length === 1 ? ' pago' : ' pagos') + '</div><div class="regd-list">' +
        comprasMes.map(function (x) {
          return '<div class="regd-row"><div class="regd-main">' +
            '<div class="regd-name">' + esc(x.concept + (x.note ? ' · ' + x.note : '')) + '</div>' +
            '<div class="regd-sub">' + esc(x.names + ' · ' + ddShort(x.date)) + '</div></div>' +
            '<span class="regd-amt mono red">− ' + esc(fmtG(x.amount)) + '</span></div>';
        }).join('') + '</div>' +
        '<div class="set-hint" style="margin-top:8px;">La mercadería comprada no es un gasto: es inversión en stock. Su costo entra al resultado recién cuando se vende cada unidad.</div></div>';
    }

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

  // ===== Render: Stock =====
  function productRowHtml(p) {
    var stock = Number(p.stock) || 0;
    var low = (Number(p.minStock) || 0) > 0 && stock <= (Number(p.minStock) || 0);
    var thumb = (p.photos || []).length ? (state.photoCache[p.photos[0].id] || PIXEL) : '';
    return '<button type="button" class="prod-row" data-product="' + esc(p.id) + '">' +
      (thumb ? '<img class="prod-thumb" alt="" src="' + esc(thumb) + '">' :
        '<div class="prod-thumb ph"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8A97B0" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16v13H4z"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></div>') +
      '<div class="prod-main"><div class="prod-name">' + esc(p.name) + '</div>' +
      '<div class="prod-sub"><span class="prod-cat">' + esc(p.category || 'Otro') + '</span>' +
      (p.price ? ' · venta ' + esc(fmtG(p.price)) : ' · sin precio de venta') + '</div></div>' +
      '<div class="prod-right"><span class="prod-stock' + (low ? ' low' : '') + '">' + stock + '</span>' +
      '<span class="prod-stock-cap">' + (low ? 'stock bajo' : 'en stock') + '</span></div></button>';
  }
  function renderStock() {
    var box = document.getElementById('stock-content');
    var prods = (state.data.products || []).slice()
      .sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });
    prods.forEach(function (p) { if ((p.photos || []).length) loadPhotos([p.photos[0]]); });
    var pend = pendingPurchases();
    var low = lowStockProducts();
    var html = '';

    if (low.length) {
      html += '<div class="lowstock-banner"><span>⚠ Stock bajo: ' +
        esc(low.map(function (p) { return p.name + ' (' + (Number(p.stock) || 0) + ')'; }).join(', ')) +
        '. Pedí a tiempo — la importación demora.</span></div>';
    }

    html += '<button type="button" class="reg-open js-goto-compras">' +
      '<span class="reg-open-main"><span class="reg-open-title">Compras' +
      (pend.length ? ' · ' + pend.length + ' en viaje' : '') + '</span>' +
      '<span class="reg-open-sub">Pedidos a China y compras locales</span></span>' +
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg></button>';

    if (prods.some(function (p) { return (Number(p.stock) || 0) > 0; })) {
      html += '<button type="button" class="btn-big-sale js-sell">🛒 Vender</button>';
    }
    html += '<button type="button" class="btn-big-primary js-new-product">+ Nuevo producto</button>';

    if (!prods.length) {
      html += '<div class="dashed-card">Todavía no hay productos en el catálogo. Cargá los que vas a traer para vender (motor, bomba, relé…) y después registrá la compra para que entre el stock.</div>';
    } else {
      var totVal = inventoryValue();
      html += '<div class="inv-line">Plata en stock (al costo): <span class="mono">' + esc(fmtG(totVal)) + '</span></div>';
      html += prods.map(productRowHtml).join('');
    }

    box.innerHTML = html;
    var comprasBtn = box.querySelector('.js-goto-compras');
    if (comprasBtn) comprasBtn.addEventListener('click', function () { go('compras'); });
    box.querySelector('.js-new-product').addEventListener('click', function () { openProductModal(null); });
    var sellBtn = box.querySelector('.js-sell');
    if (sellBtn) sellBtn.addEventListener('click', function () { openSaleModal({}); });
    box.querySelectorAll('[data-product]').forEach(function (el) {
      el.addEventListener('click', function () { goProduct(el.getAttribute('data-product')); });
    });
  }

  // ===== Render: ficha de producto =====
  function renderProducto() {
    var box = document.getElementById('producto-content');
    var p = productById(state.productId);
    if (!p) { go('stock'); return; }
    loadPhotos(p.photos);
    var stock = Number(p.stock) || 0;
    var low = (Number(p.minStock) || 0) > 0 && stock <= (Number(p.minStock) || 0);
    var delLabel = state.confirmKey === 'delprod:' + p.id ? '¿Seguro? Tocá otra vez' : 'Eliminar';

    var html = '<div class="detail-header">' +
      '<button type="button" class="btn-white js-back"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>Volver</button>' +
      '<div class="spacer"></div>' +
      '<button type="button" class="btn-white js-edit-product">Editar</button>' +
      '<button type="button" class="btn-danger-outline js-del-product">' + esc(delLabel) + '</button></div>';

    html += '<div class="info-card"><div class="info-card-top">' +
      '<div class="info-main"><div class="info-name">' + esc(p.name) + '</div>' +
      '<div class="info-meta"><span class="prod-cat">' + esc(p.category || 'Otro') + '</span></div></div></div>' +
      ((p.notes || '').trim() ? '<div class="notes-box">' + esc(p.notes) + '</div>' : '') + '</div>';

    html += '<div class="prod-stats">' +
      '<div class="prod-stat"><span class="prod-stat-cap">En stock</span><span class="prod-stat-val' + (low ? ' red' : '') + '">' + stock + '</span></div>' +
      '<div class="prod-stat"><span class="prod-stat-cap">Costo c/u</span><span class="prod-stat-val mono">' + esc(fmtG(p.cost)) + '</span></div>' +
      '<div class="prod-stat"><span class="prod-stat-cap">Venta c/u</span><span class="prod-stat-val mono">' + esc(fmtG(p.price)) + '</span></div>' +
      '<div class="prod-stat"><span class="prod-stat-cap">En stock (₲)</span><span class="prod-stat-val mono">' + esc(fmtG(stock * (Number(p.cost) || 0))) + '</span></div>' +
      '</div>';
    if (low) html += '<div class="lowstock-banner"><span>⚠ Stock bajo (avisar cuando queden ≤ ' + esc(String(p.minStock)) + ').</span></div>';

    // fotos del producto
    html += '<div class="info-card"><div class="job-detail-label">Fotos</div><div class="photo-grid">';
    (p.photos || []).forEach(function (ph, i) {
      var src = state.photoCache[ph.id] || PIXEL;
      html += '<img class="photo-thumb" alt="Foto del producto" src="' + esc(src) + '" data-ph-open="prod:' + esc(p.id) + ':' + i + '">';
    });
    html += '<div class="photo-add" data-ph-add="prod:' + esc(p.id) + '">' +
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-2.5h6L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.2"/></svg>' +
      '<span>Agregar</span></div></div></div>';

    if (stock > 0) {
      html += '<button type="button" class="btn-big-sale js-sell-product">🛒 Vender este producto</button>';
    }
    html += '<button type="button" class="btn-ghost-danger btn-full js-adjust">Ajustar stock (rotura / pérdida)</button>';

    // historial: ventas de este producto (ventas directas + dentro de trabajos)
    var sold = [];
    var cName = function (cid) {
      var cc = state.data.clients.find(function (x) { return x.id === cid; });
      return cc ? cc.name : '(cliente eliminado)';
    };
    (state.data.sales || []).forEach(function (s) {
      (s.items || []).forEach(function (it) {
        if (it.productId === p.id) sold.push({ date: s.date, clientId: s.clientId, qty: it.qty, unitPrice: it.unitPrice, warrantyMonths: it.warrantyMonths, via: 'Venta' });
      });
    });
    (state.data.jobs || []).forEach(function (j) {
      (j.items || []).forEach(function (it) {
        if (it.productId === p.id) sold.push({ date: j.date, clientId: j.clientId, qty: it.qty, unitPrice: it.unitPrice, warrantyMonths: it.warrantyMonths, via: 'Trabajo' });
      });
    });
    sold.sort(function (a, b) { return (a.date || '') < (b.date || '') ? 1 : -1; });
    var actives = sold.map(function (x) { return { x: x, w: warrantyInfo(x.date, x.warrantyMonths) }; })
      .filter(function (y) { return y.w && y.w.active; });
    if (actives.length) {
      html += '<div class="panel"><div class="panel-label">🛡 Garantías vigentes · ' + actives.length + '</div><div class="regd-list">' +
        actives.map(function (y) {
          return '<div class="regd-row"><div class="regd-main">' +
            '<div class="regd-name">' + esc(cName(y.x.clientId)) + '</div>' +
            '<div class="regd-sub">' + esc('Vendido ' + dd(y.x.date) + ' · vence ' + dd(y.w.until)) + '</div></div>' +
            '<span class="warranty-chip ok" style="margin:0;">vigente</span></div>';
        }).join('') + '</div></div>';
    }
    if (sold.length) {
      html += '<div class="panel"><div class="panel-label">Ventas de este producto · ' + sold.length + '</div><div class="regd-list">' +
        sold.map(function (x) {
          return '<div class="regd-row"><div class="regd-main">' +
            '<div class="regd-name">' + esc(cName(x.clientId)) + '</div>' +
            '<div class="regd-sub">' + esc(x.via + ' · ' + dd(x.date) + (x.qty > 1 ? ' · ×' + x.qty : '')) + '</div></div>' +
            '<span class="regd-amt mono blue">' + esc(fmtG((Number(x.qty) || 0) * (Number(x.unitPrice) || 0))) + '</span></div>';
        }).join('') + '</div></div>';
    }

    // historial: compras de este producto
    var buys = [];
    (state.data.purchases || []).forEach(function (b) {
      (b.items || []).forEach(function (it) {
        if (it.productId === p.id) buys.push({ b: b, it: it });
      });
    });
    buys.sort(function (x, y) { return (x.b.paidDate || '') < (y.b.paidDate || '') ? 1 : -1; });
    html += '<div class="panel"><div class="panel-label">Compras de este producto · ' + buys.length + '</div>';
    if (buys.length) {
      html += '<div class="regd-list">' + buys.map(function (x) {
        var pending = x.b.status === 'paid';
        var sub = pending
          ? 'En viaje · pedido ' + dd(x.b.paidDate)
          : 'Llegó ' + dd(x.b.receivedDate) + ' · costo real ' + fmtG(x.it.unitCost) + ' c/u';
        return '<div class="regd-row"><div class="regd-main">' +
          '<div class="regd-name">' + esc(String(x.it.qty)) + ' unidades ' + (pending ? '· <span class="pend-chip">en viaje</span>' : '') + '</div>' +
          '<div class="regd-sub">' + esc(sub) + '</div></div>' +
          '<span class="regd-amt mono">' + esc(fmtG((Number(x.it.qty) || 0) * (pending ? (Number(x.it.unitBase) || 0) : (Number(x.it.unitCost) || 0)))) + '</span></div>';
      }).join('') + '</div>';
    } else {
      html += '<div class="panel-empty">Todavía no registraste compras de este producto.</div>';
    }
    html += '</div>';

    // historial: ajustes / mermas
    var adjs = (p.adjusts || []).slice().sort(function (a, b) { return (a.date || '') < (b.date || '') ? 1 : -1; });
    if (adjs.length) {
      html += '<div class="panel"><div class="panel-label">Ajustes / mermas · ' + adjs.length + '</div><div class="regd-list">' +
        adjs.map(function (a) {
          return '<div class="regd-row"><div class="regd-main">' +
            '<div class="regd-name">− ' + esc(String(a.qty)) + (a.qty === 1 ? ' unidad' : ' unidades') + '</div>' +
            '<div class="regd-sub">' + esc((a.reason || '') + ' · ' + dd(a.date)) + '</div></div>' +
            '<span class="regd-amt mono red">− ' + esc(fmtG((Number(a.qty) || 0) * (Number(p.cost) || 0))) + '</span></div>';
        }).join('') + '</div></div>';
    }

    box.innerHTML = html;
    box.querySelector('.js-back').addEventListener('click', function () { go('stock'); });
    box.querySelector('.js-edit-product').addEventListener('click', function () { openProductModal(p); });
    box.querySelector('.js-del-product').addEventListener('click', function () {
      confirm2('delprod:' + p.id, function () { delProduct(p.id); });
    });
    box.querySelector('.js-adjust').addEventListener('click', function () { openAdjustModal(p.id); });
    var sellBtn = box.querySelector('.js-sell-product');
    if (sellBtn) sellBtn.addEventListener('click', function () { openSaleModal({ productId: p.id }); });
    box.querySelectorAll('[data-ph-add]').forEach(function (el) {
      el.addEventListener('click', function () {
        var parts = el.getAttribute('data-ph-add').split(':');
        _photoTarget = { kind: parts[0], id: parts[1] };
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

  // ===== Render: Compras =====
  function renderCompras() {
    var box = document.getElementById('compras-content');
    var all = (state.data.purchases || []).slice()
      .sort(function (a, b) { return (a.paidDate || '') < (b.paidDate || '') ? 1 : -1; });
    var pend = all.filter(function (b) { return b.status === 'paid'; });
    var recv = all.filter(function (b) { return b.status === 'received'; })
      .sort(function (a, b) { return (a.receivedDate || '') < (b.receivedDate || '') ? 1 : -1; });

    var itemsTxt = function (b) {
      return (b.items || []).map(function (it) {
        var p = productById(it.productId);
        return (p ? p.name : '(producto eliminado)') + ' × ' + it.qty;
      }).join(' · ');
    };

    var html = '<div class="detail-header">' +
      '<button type="button" class="btn-white js-back"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>Volver</button>' +
      '<div class="spacer"></div></div>';

    html += '<button type="button" class="btn-big-primary js-new-purchase">+ Nueva compra</button>';

    if (pend.length) {
      html += '<div class="section-label amber">En viaje (pagadas, sin llegar) · ' + pend.length + '</div>';
      html += pend.map(function (b) {
        var delLbl = state.confirmKey === 'delpur:' + b.id ? '¿Seguro?' : '✕';
        return '<div class="pur-card pend">' +
          '<div class="alert-top"><span class="pend-chip">✈ En viaje</span>' +
          '<span class="alert-date">pagado ' + esc(dd(b.paidDate)) + '</span></div>' +
          (b.note ? '<div class="pur-note">' + esc(b.note) + '</div>' : '') +
          '<div class="pur-items">' + esc(itemsTxt(b)) + '</div>' +
          '<div class="pur-paid">Pagado: <span class="mono">' + esc(fmtG(b.paidAmount)) + '</span></div>' +
          '<div class="alert-actions">' +
          '<button type="button" class="btn-pay" data-pur-recv="' + esc(b.id) + '">📦 Llegó la mercadería</button>' +
          '<button type="button" class="btn-ghost-danger" data-pur-del="' + esc(b.id) + '">' + delLbl + '</button>' +
          '</div></div>';
      }).join('');
    }

    html += '<div class="section-label gray">Recibidas · ' + recv.length + '</div>';
    if (recv.length) {
      html += recv.map(function (b) {
        return '<div class="pur-card">' +
          '<div class="alert-top"><span class="recv-chip">' + (b.type === 'import' ? '🚢 Importación' : '🏪 Local') + '</span>' +
          '<span class="alert-date">llegó ' + esc(dd(b.receivedDate)) + '</span></div>' +
          (b.note ? '<div class="pur-note">' + esc(b.note) + '</div>' : '') +
          '<div class="pur-items">' + esc(itemsTxt(b)) + '</div>' +
          '<div class="pur-paid">Costo total final: <span class="mono">' + esc(fmtG(b.totalFinal)) + '</span></div>' +
          '</div>';
      }).join('');
    } else {
      html += '<div class="dashed-card">Todavía no hay compras recibidas.</div>';
    }

    box.innerHTML = html;
    box.querySelector('.js-back').addEventListener('click', function () { go('stock'); });
    box.querySelector('.js-new-purchase').addEventListener('click', openPurchaseModal);
    box.querySelectorAll('[data-pur-recv]').forEach(function (el) {
      el.addEventListener('click', function () { openReceiveModal(el.getAttribute('data-pur-recv')); });
    });
    box.querySelectorAll('[data-pur-del]').forEach(function (el) {
      el.addEventListener('click', function () {
        var id = el.getAttribute('data-pur-del');
        confirm2('delpur:' + id, function () { delPurchase(id); });
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
      var desc = a.kind === 'sale' ? payDebtorLabel('sale', a.j) : (a.j.desc || a.j.category);
      return '<div class="alert-card ' + cls + '">' +
        '<div class="alert-top"><span class="alert-date">● ' + esc(alertDateLabel(a)) + '</span>' +
        '<span class="alert-saldo">' + esc(fmtG(a.bal)) + '</span></div>' +
        '<div class="alert-client" data-alert-open="' + esc(a.j.clientId) + '">' + esc(c ? c.name : '(cliente eliminado)') + '</div>' +
        '<div class="alert-desc">' + esc(desc) + '</div>' +
        '<div class="alert-actions">' +
        '<button type="button" class="btn-pay" data-alert-pay="' + esc(a.kind + ':' + a.j.id) + '">Registrar pago</button>' +
        '<button type="button" class="btn-ghost" data-alert-post="' + esc(a.kind + ':' + a.j.id) + '" data-dd="' + esc(a.x.id) + '">Posponer</button>' +
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
        var desc = a.kind === 'sale' ? payDebtorLabel('sale', a.j) : (a.j.desc || a.j.category);
        return '<div class="fut-card"><div class="fut-main">' +
          '<div class="fut-name" data-alert-open="' + esc(a.j.clientId) + '">' + esc(c ? c.name : '(cliente eliminado)') + '</div>' +
          '<div class="fut-sub">' + esc(desc + ' · ' + alertDateLabel(a)) + '</div></div>' +
          '<div class="fut-right"><span class="fut-saldo">' + esc(fmtG(a.bal)) + '</span>' +
          '<button type="button" class="fut-pay" data-alert-pay="' + esc(a.kind + ':' + a.j.id) + '">Cobrar</button></div></div>';
      }).join('');
    }

    if (sin.length) {
      html += '<div class="section-label gray">Con deuda pero sin fecha de cobro · ' + sin.length + '</div>';
      html += sin.map(function (w) {
        var c = cById[w.x.clientId];
        var desc = w.kind === 'sale' ? payDebtorLabel('sale', w.x) : (w.x.desc || w.x.category);
        return '<div class="sinfecha-card"><div class="sinfecha-main">' +
          '<div class="fut-name" data-alert-open="' + esc(w.x.clientId) + '">' + esc(c ? c.name : '—') + '</div>' +
          '<div class="fut-sub">' + esc(desc + ' · debe ' + fmtG(payDebtorBalance(w.kind, w.x))) + '</div></div>' +
          '<button type="button" class="fut-pay" data-alert-pay="' + esc(w.kind + ':' + w.x.id) + '">Cobrar</button>' +
          '<button type="button" class="btn-fijar" data-sin-post="' + esc(w.kind + ':' + w.x.id) + '">Fijar fecha</button></div>';
      }).join('');
    }

    box.innerHTML = html;
    var notifBtn = box.querySelector('.js-notif-on');
    if (notifBtn) notifBtn.addEventListener('click', toggleNotif);
    box.querySelectorAll('[data-alert-open]').forEach(function (el) {
      el.addEventListener('click', function () { goClient(el.getAttribute('data-alert-open')); });
    });
    var parseKindId = function (v) { var p = String(v || '').split(':'); return { kind: p[0], id: p[1] }; };
    box.querySelectorAll('[data-alert-pay]').forEach(function (el) {
      el.addEventListener('click', function () {
        var w = parseKindId(el.getAttribute('data-alert-pay'));
        openPayKind(w.kind, w.id);
      });
    });
    box.querySelectorAll('[data-alert-post]').forEach(function (el) {
      el.addEventListener('click', function () {
        var w = parseKindId(el.getAttribute('data-alert-post'));
        openPostKind(w.kind, w.id, el.getAttribute('data-dd'));
      });
    });
    box.querySelectorAll('[data-alert-wa]').forEach(function (el) {
      el.addEventListener('click', function () { openWaRemind(el.getAttribute('data-alert-wa')); });
    });
    box.querySelectorAll('[data-sin-post]').forEach(function (el) {
      el.addEventListener('click', function () {
        var w = parseKindId(el.getAttribute('data-sin-post'));
        openPostKind(w.kind, w.id, null);
      });
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
    (data.products || []).forEach(function (pr) { (pr.photos || []).forEach(function (p) { ids.push(p.id); }); });
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
      clients: [], jobs: [], expenses: [], staff: [], products: [], purchases: [], sales: [],
      settings: { categories: defaultCats(), expenseCategories: defaultExpenseCats(), productCategories: defaultProductCats(), remindDays: 3, notifEnabled: state.data.settings.notifEnabled, devices: (state.data.settings.devices || []).slice() },
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
      '<span>Gestor de clientes, cobros y stock · v0.2.0</span></div>';

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

    // nav activa: cada subpantalla resalta su pestaña madre
    var navView = view === 'cliente' ? 'clientes'
      : (view === 'regmes' || view === 'gastos' || view === 'personal') ? 'registro'
      : (view === 'producto' || view === 'compras') ? 'stock'
      : view;
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
    if (view === 'stock') renderStock();
    if (view === 'producto') renderProducto();
    if (view === 'compras') renderCompras();
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
  document.getElementById('jf-add-item').addEventListener('click', function () {
    jForm.items.push({ productId: '', qty: 1, unitPrice: 0, warrantyMonths: 0 });
    renderSoldItemRows('jf-items', jForm.items, updateJobPreview);
    updateJobPreview();
  });

  // modal venta
  saleModalEl.addEventListener('click', function (e) { if (e.target === saleModalEl) closeSaleModal(); });
  document.getElementById('vf-cancel').addEventListener('click', closeSaleModal);
  document.getElementById('vf-save').addEventListener('click', submitSale);
  document.getElementById('vf-contado').addEventListener('click', function () { vForm.credit = false; renderSaleModalDynamic(); });
  document.getElementById('vf-credito').addEventListener('click', function () { vForm.credit = true; renderSaleModalDynamic(); });
  document.getElementById('vf-add-item').addEventListener('click', function () {
    vForm.items.push({ productId: '', qty: 1, unitPrice: 0, warrantyMonths: 0 });
    renderSaleModalDynamic();
  });
  document.getElementById('vf-add-both').addEventListener('click', function () {
    // agrega motor y bomba juntos ("ambas"), cada uno con su precio sugerido
    var byCat = function (cat) {
      return (state.data.products || []).find(function (p) { return p.category === cat && (Number(p.stock) || 0) > 0; }) ||
        (state.data.products || []).find(function (p) { return p.category === cat; });
    };
    var motor = byCat('Motor'), bomba = byCat('Bomba');
    vForm.items.push({ productId: motor ? motor.id : '', qty: 1, unitPrice: motor ? (Number(motor.price) || 0) : 0, warrantyMonths: 0 });
    vForm.items.push({ productId: bomba ? bomba.id : '', qty: 1, unitPrice: bomba ? (Number(bomba.price) || 0) : 0, warrantyMonths: 0 });
    renderSaleModalDynamic();
  });
  moneyInput(document.getElementById('vf-down'));
  document.getElementById('vf-down')._onMoney = updateSalePreview;
  clearErrOnInput(['vf-client'], 'vf-err');

  // modal pago
  payModalEl.addEventListener('click', function (e) { if (e.target === payModalEl) closePayModal(); });
  document.getElementById('pf-cancel').addEventListener('click', closePayModal);
  document.getElementById('pf-save').addEventListener('click', submitPay);
  moneyInput(document.getElementById('pf-amount'));
  document.getElementById('pf-amount')._onMoney = updatePayPreview;
  document.getElementById('pf-all').addEventListener('click', function () {
    var x = payDebtor(pForm.kind, pForm.id);
    if (!x) return;
    document.getElementById('pf-amount').value = dots(payDebtorBalance(pForm.kind, x));
    updatePayPreview();
  });
  document.getElementById('pf-half').addEventListener('click', function () {
    var x = payDebtor(pForm.kind, pForm.id);
    if (!x) return;
    document.getElementById('pf-amount').value = dots(Math.round(payDebtorBalance(pForm.kind, x) / 2));
    updatePayPreview();
  });
  // selector de deuda (pago desde la ficha con varios trabajos/ventas con saldo)
  document.getElementById('pf-job').addEventListener('change', function (e) {
    var parts = String(e.target.value || '').split(':');
    var kind = parts[0], id = parts[1];
    var x = payDebtor(kind, id);
    if (!x) return;
    pForm.kind = kind;
    pForm.id = id;
    var c = state.data.clients.find(function (y) { return y.id === x.clientId; });
    document.getElementById('pf-sub').textContent = (c ? c.name : '') + ' — ' + payDebtorLabel(kind, x);
    document.getElementById('pf-saldo').textContent = fmtG(payDebtorBalance(kind, x));
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

  // modal producto
  prodModalEl.addEventListener('click', function (e) { if (e.target === prodModalEl) closeProductModal(); });
  document.getElementById('prf-cancel').addEventListener('click', closeProductModal);
  document.getElementById('prf-save').addEventListener('click', submitProduct);
  document.getElementById('prf-name').addEventListener('keydown', function (e) { if (e.key === 'Enter') submitProduct(); });
  moneyInput(document.getElementById('prf-price'));
  clearErrOnInput(['prf-name'], 'prf-err');

  // modal compra
  purModalEl.addEventListener('click', function (e) { if (e.target === purModalEl) closePurchaseModal(); });
  document.getElementById('buf-cancel').addEventListener('click', closePurchaseModal);
  document.getElementById('buf-save').addEventListener('click', submitPurchase);
  document.getElementById('buf-import').addEventListener('click', function () { buForm.type = 'import'; renderPurchaseForm(); });
  document.getElementById('buf-local').addEventListener('click', function () { buForm.type = 'local'; renderPurchaseForm(); });
  document.getElementById('buf-add-item').addEventListener('click', function () {
    buForm.items.push({ kind: 'item', productId: '', qty: 1, unitBase: 0 });
    renderPurchaseForm();
  });
  document.getElementById('buf-add-set').addEventListener('click', function () {
    buForm.items.push({ kind: 'set', motorId: '', bombaId: '', qty: 1, setPrice: 0, motorPart: 0 });
    renderPurchaseForm();
  });
  moneyInput(document.getElementById('buf-paid'));

  // modal llegada de mercadería
  rcvModalEl.addEventListener('click', function (e) { if (e.target === rcvModalEl) closeReceiveModal(); });
  document.getElementById('rcf-cancel').addEventListener('click', closeReceiveModal);
  document.getElementById('rcf-save').addEventListener('click', submitReceive);
  moneyInput(document.getElementById('rcf-total'));
  document.getElementById('rcf-total').addEventListener('input', function () {
    document.getElementById('rcf-err').hidden = true;
    renderReceivePreview();
  });

  // modal ajuste de stock
  adjModalEl.addEventListener('click', function (e) { if (e.target === adjModalEl) closeAdjustModal(); });
  document.getElementById('ajf-cancel').addEventListener('click', closeAdjustModal);
  document.getElementById('ajf-save').addEventListener('click', submitAdjust);
  clearErrOnInput(['ajf-qty', 'ajf-reason'], 'ajf-err');

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
    if (!prodModalEl.hidden) closeProductModal();
    if (!purModalEl.hidden) closePurchaseModal();
    if (!rcvModalEl.hidden) closeReceiveModal();
    if (!adjModalEl.hidden) closeAdjustModal();
    if (!saleModalEl.hidden) closeSaleModal();
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
    if (!prodModalEl.hidden) { prodModalEl.hidden = true; return; }
    if (!purModalEl.hidden) { purModalEl.hidden = true; return; }
    if (!rcvModalEl.hidden) { rcvModalEl.hidden = true; return; }
    if (!adjModalEl.hidden) { adjModalEl.hidden = true; return; }
    if (!saleModalEl.hidden) { saleModalEl.hidden = true; return; }
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
    // ficha de producto / compras -> stock
    if (state.view === 'producto' || state.view === 'compras') {
      curViewDepth = 1;
      state.view = 'stock';
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
