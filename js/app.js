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
  // Arranque en blanco: la app empieza vacía para cargar datos reales.
  function seedData() {
    return {
      clients: [],
      jobs: [],
      settings: { categories: ['Perforación', 'Mantenimiento', 'Motobomba', 'Pesca de equipo', 'Otro'], remindDays: 3, notifEnabled: false, devices: [] },
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
    return {
      clients: clients,
      jobs: jobs,
      settings: { categories: ['Perforación', 'Mantenimiento', 'Motobomba', 'Pesca de equipo', 'Otro'], remindDays: 3, notifEnabled: false, devices: [] },
      demo: true
    };
  }

  // ===== Persistencia =====
  function persist(data) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (e) {}
  }
  function loadData() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var d = JSON.parse(raw);
        if (d && Array.isArray(d.clients) && Array.isArray(d.jobs) && d.settings) {
          if (!Array.isArray(d.settings.devices)) d.settings.devices = [];
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
  var _photoTarget = null; // id de trabajo al que se le agregan fotos
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

  function loadJobPhotos(j) {
    var ids = (j.photos || []).map(function (p) { return p.id; })
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
  function addPhotos(jobId, fileList) {
    var files = Array.prototype.slice.call(fileList || []).filter(function (f) {
      return f && f.type && f.type.indexOf('image/') === 0;
    });
    if (!files.length || !jobId) return;
    toast(files.length === 1 ? 'Procesando la foto…' : 'Procesando ' + files.length + ' fotos…');
    var work = files.map(function (f) {
      return fileToDataUrl(f).then(function (url) {
        var id = uid();
        return idbPut(id, url).then(function () { return { id: id, url: url }; });
      }).catch(function () { return null; });
    });
    Promise.all(work).then(function (items) {
      var ok = items.filter(Boolean);
      if (!ok.length) { toast('No se pudieron agregar las fotos.'); return; }
      ok.forEach(function (x) { state.photoCache[x.id] = x.url; });
      var entries = ok.map(function (x) { return { id: x.id, date: todayIso() }; });
      mutate(function (d) {
        var j = d.jobs.find(function (x) { return x.id === jobId; });
        if (j) j.photos = (j.photos || []).concat(entries);
      });
      toast(ok.length === 1 ? 'Foto agregada.' : ok.length + ' fotos agregadas.');
    });
  }
  function delPhoto(jobId, phId) {
    var j = state.data.jobs.find(function (x) { return x.id === jobId; });
    var rest = j ? (j.photos || []).filter(function (p) { return p.id !== phId; }) : [];
    idbDel(phId).catch(function () {});
    var vw = state.viewer;
    if (vw && vw.jobId === jobId) {
      state.viewer = rest.length ? { jobId: jobId, idx: Math.min(vw.idx, rest.length - 1) } : null;
    }
    mutate(function (d) {
      var jj = d.jobs.find(function (x) { return x.id === jobId; });
      if (jj) jj.photos = (jj.photos || []).filter(function (p) { return p.id !== phId; });
    });
  }
  function delJobPhotos(j) {
    ((j && j.photos) || []).forEach(function (p) { idbDel(p.id).catch(function () {}); });
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
      ajustes: ['Ajustes', 'Configuración y respaldo']
    };
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

  // ===== Confirmación de doble toque =====
  function confirm2(key, fn) {
    if (state.confirmKey === key) {
      state.confirmKey = null;
      clearTimeout(confirmTimer);
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
    state.view = view;
    state.confirmKey = null;
    render();
    window.scrollTo(0, 0);
  }
  function goClient(id) {
    state.view = 'cliente';
    state.clientId = id;
    state.expandedJobId = null;
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
    modalEl.hidden = false;
    document.getElementById('cf-name').focus();
  }
  function closeClientModal() { modalEl.hidden = true; }
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
  function closeJobModal() { jobModalEl.hidden = true; }
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
    updatePayPreview();
    payModalEl.hidden = false;
    document.getElementById('pf-amount').focus();
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
  function closePayModal() { payModalEl.hidden = true; }
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
    postModalEl.hidden = false;
  }
  function closePostModal() { postModalEl.hidden = true; }
  function submitPost() {
    var v = document.getElementById('pp-date').value;
    if (!v) {
      var err = document.getElementById('pp-err');
      err.textContent = 'Elegí la nueva fecha.';
      err.hidden = false;
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
      if (u.venc + u.hoy === 0) return;
      var parts = [];
      if (u.venc) parts.push(u.venc + (u.venc === 1 ? ' cobro vencido' : ' cobros vencidos'));
      if (u.hoy) parts.push(u.hoy + ' para hoy');
      showNotif('JGM SERVICIOS — Cobros', {
        body: 'Tenés ' + parts.join(' y ') + '. Abrí la app para ver los detalles.',
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

  // ===== WhatsApp =====
  function waLink(phone) {
    var digits = (phone || '').replace(/\D/g, '');
    if (!digits) return '';
    return 'https://wa.me/' + (digits.indexOf('595') === 0 ? digits : '595' + digits.replace(/^0/, ''));
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
        html += '<img class="photo-thumb" alt="Foto del trabajo" src="' + esc(src) + '" data-ph-open="' + esc(j.id) + ':' + i + '">';
      });
      html += '<div class="photo-add" data-ph-add="' + esc(j.id) + '">' +
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

    html += '<div class="saldo-card"><span class="saldo-card-label">Saldo pendiente</span>' +
      '<span class="saldo-card-amount" style="color:' + (bal > 0 ? '#FF9D8A' : '#7BD8A8') + ';">' +
      esc(bal > 0 ? fmtG(bal) : 'Al día ✓') + '</span></div>';

    html += '<button type="button" class="btn-big-primary js-client-new-job">+ Nuevo trabajo para este cliente</button>';

    if (js.length) {
      html += js.map(jobCardHtml).join('');
    } else {
      html += '<div class="dashed-card">Este cliente todavía no tiene trabajos cargados.</div>';
    }

    box.innerHTML = html;

    box.querySelector('.js-back').addEventListener('click', function () { go('clientes'); });
    box.querySelector('.js-edit-client').addEventListener('click', function () { openClientModal(c); });
    box.querySelector('.js-del-client').addEventListener('click', function () {
      confirm2('delc:' + c.id, function () {
        jobsOf(c.id).forEach(function (x) { delJobPhotos(x); });
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
        _photoTarget = el.getAttribute('data-ph-add');
        photoInput.click();
      });
    });
    box.querySelectorAll('[data-ph-open]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.stopPropagation();
        var parts = el.getAttribute('data-ph-open').split(':');
        var jobId = parts[0], idx = Number(parts[1]);
        var jj = state.data.jobs.find(function (x) { return x.id === jobId; });
        if (jj) loadJobPhotos(jj);
        state.viewer = { jobId: jobId, idx: idx };
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
          if (jj) delJobPhotos(jj);
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

    var html = '<div class="stat-grid">' +
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
    var perm = notifPerm();
    var html = '';

    if (!isNotifOn() && perm !== 'denied' && perm !== 'unsupported') {
      html += '<div class="notif-banner"><span>Activá las notificaciones para que el navegador te avise los cobros aunque no estés mirando la app.</span>' +
        '<button type="button" class="js-notif-on">Activar</button></div>';
    }

    if (!alerts.length && !sin.length) {
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

    var fut = alerts.filter(function (a) { return a.group === 'fut'; });
    if (fut.length) {
      html += '<div class="section-label gray">Más adelante · ' + fut.length + '</div>';
      html += fut.map(function (a) {
        var c = cById[a.j.clientId];
        return '<div class="fut-card"><div class="fut-main">' +
          '<div class="fut-name" data-alert-open="' + esc(a.j.clientId) + '">' + esc(c ? c.name : '(cliente eliminado)') + '</div>' +
          '<div class="fut-sub">' + esc((a.j.desc || a.j.category) + ' · ' + alertDateLabel(a)) + '</div></div>' +
          '<span class="fut-saldo">' + esc(fmtG(a.bal)) + '</span></div>';
      }).join('');
    }

    if (sin.length) {
      html += '<div class="section-label gray">Con deuda pero sin fecha de cobro · ' + sin.length + '</div>';
      html += sin.map(function (j) {
        var c = cById[j.clientId];
        return '<div class="sinfecha-card"><div class="sinfecha-main">' +
          '<div class="fut-name" data-alert-open="' + esc(j.clientId) + '">' + esc(c ? c.name : '—') + '</div>' +
          '<div class="fut-sub">' + esc((j.desc || j.category) + ' · debe ' + fmtG(jobBalance(j))) + '</div></div>' +
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
    box.querySelectorAll('[data-sin-post]').forEach(function (el) {
      el.addEventListener('click', function () { openPost(el.getAttribute('data-sin-post'), null); });
    });
  }

  // ===== Ajustes: respaldo (exportar / importar) =====
  function testNotif() {
    showNotif('JGM SERVICIOS', {
      body: 'Así te voy a avisar cuando haya cobros pendientes.',
      icon: 'assets/icon-192.png', badge: 'assets/icon-192.png', tag: 'jgm-test'
    });
  }
  function doExport() {
    var data = state.data;
    var ids = [];
    (data.jobs || []).forEach(function (j) { (j.photos || []).forEach(function (p) { ids.push(p.id); }); });
    Promise.all(ids.map(function (id) { return idbGet(id).catch(function () { return null; }); })).then(function (vals) {
      var photos = {};
      ids.forEach(function (id, i) { if (vals[i]) photos[id] = vals[i]; });
      var out = Object.assign({}, data, { photos: photos });
      var n = Object.keys(photos).length;
      encryptBackup(out).then(function (envelope) {
        var blob = new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'jgm-servicios-respaldo-' + todayIso() + '.json';
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
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
    if (!Array.isArray(d.settings.devices)) d.settings.devices = [];
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
    ajustesMsg = 'Respaldo importado: ' + d.clients.length + ' clientes, ' + d.jobs.length + ' trabajos' + (nF ? ' y ' + nF + ' fotos.' : '.');
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
      clients: [], jobs: [],
      settings: { categories: ['Perforación', 'Mantenimiento', 'Motobomba', 'Pesca de equipo', 'Otro'], remindDays: 3, notifEnabled: state.data.settings.notifEnabled, devices: (state.data.settings.devices || []).slice() },
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

    // Respaldo
    html += '<div class="set-card"><div class="set-title">Respaldo de datos</div>' +
      '<div class="set-desc">Los datos (incluidas las fotos de los trabajos) se guardan en este dispositivo. Exportá un respaldo cada tanto y guardalo en un lugar seguro.</div>' +
      '<div class="set-btn-row"><button type="button" class="set-btn-primary js-export">Exportar respaldo</button>' +
      '<button type="button" class="set-btn-ghost js-import">Importar respaldo</button></div>' +
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
        '<div class="set-desc">La app se abre con tu PIN y se bloquea sola tras unos minutos sin usarla. El respaldo se exporta cifrado.</div>' +
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
    var j = state.data.jobs.find(function (x) { return x.id === vs.jobId; });
    var list = j ? (j.photos || []) : [];
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

    // nav activa: Clientes queda resaltado también en la ficha
    var navView = view === 'cliente' ? 'clientes' : view;
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
    addPhotos(_photoTarget, fs);
  });

  // input de importación de respaldo
  document.getElementById('import-input').addEventListener('change', function (e) {
    var file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (file) doImportFile(file);
  });

  // visor de fotos
  function closeViewer() { state.viewer = null; state.confirmKey = null; render(); }
  viewerEl.addEventListener('click', function (e) { if (e.target === viewerEl) closeViewer(); });
  document.getElementById('vw-close').addEventListener('click', closeViewer);
  document.getElementById('vw-stage').addEventListener('click', function (e) { e.stopPropagation(); });
  document.getElementById('vw-actions').addEventListener('click', function (e) { e.stopPropagation(); });
  document.getElementById('vw-prev').addEventListener('click', function () {
    var vs = state.viewer; if (!vs) return;
    var j = state.data.jobs.find(function (x) { return x.id === vs.jobId; });
    var n = j ? (j.photos || []).length : 0; if (!n) return;
    state.viewer = { jobId: vs.jobId, idx: (vs.idx - 1 + n) % n };
    state.confirmKey = null;
    render();
  });
  document.getElementById('vw-next').addEventListener('click', function () {
    var vs = state.viewer; if (!vs) return;
    var j = state.data.jobs.find(function (x) { return x.id === vs.jobId; });
    var n = j ? (j.photos || []).length : 0; if (!n) return;
    state.viewer = { jobId: vs.jobId, idx: (vs.idx + 1) % n };
    state.confirmKey = null;
    render();
  });
  document.getElementById('vw-del').addEventListener('click', function () {
    var vs = state.viewer; if (!vs) return;
    var j = state.data.jobs.find(function (x) { return x.id === vs.jobId; });
    var list = j ? (j.photos || []) : [];
    if (!list.length) return;
    var ph = list[Math.max(0, Math.min(vs.idx, list.length - 1))];
    confirm2('delph:' + ph.id, function () { delPhoto(vs.jobId, ph.id); });
  });

  // =====================================================================
  // ===== Seguridad: PIN de acceso, bloqueo y dispositivos ==============
  // =====================================================================
  var LOCK_KEY = 'jgm_lock_v1';
  var DEVID_KEY = 'jgm_device_id';
  var PBKDF2_ITER = 150000;
  var cryptoOk = !!(window.crypto && crypto.subtle && crypto.getRandomValues);
  var unlocked = false;
  var sessionPin = null;
  var lockMode = 'unlock';
  var failCount = 0;
  var blockUntil = 0;

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
  function openLock(mode) {
    lockMode = mode;
    lkIn1.value = ''; lkIn2.value = '';
    lockErr('');
    lkDevices.hidden = true; lkDevices.innerHTML = '';
    lkIn1.hidden = false; lkGo.hidden = false; lkGo.disabled = false;
    if (mode === 'create' || mode === 'change') {
      lkTitle.textContent = mode === 'change' ? 'Nuevo PIN' : 'Creá tu PIN';
      lkSub.textContent = 'Elegí un PIN de 4 a 8 números para proteger tus datos.';
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
      if (!/^\d{4,8}$/.test(v1)) { lockErr('El PIN debe tener de 4 a 8 números.'); return; }
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
    if (Date.now() < blockUntil) { lockErr('Demasiados intentos. Esperá un momento.'); return; }
    if (!v1) { lockErr('Ingresá tu PIN.'); return; }
    lkGo.disabled = true;
    verifyPin(v1).then(function (ok) {
      lkGo.disabled = false;
      if (ok) { failCount = 0; enterApp(v1); }
      else {
        failCount++;
        if (failCount >= 5) { blockUntil = Date.now() + 30000; lockErr('Demasiados intentos. Esperá 30 segundos.'); }
        else lockErr('PIN incorrecto.');
        lkIn1.value = '';
      }
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
      var fresh = { clients: [], jobs: [], settings: { categories: ['Perforación', 'Mantenimiento', 'Motobomba', 'Pesca de equipo', 'Otro'], remindDays: 3, notifEnabled: false, devices: [] }, demo: false };
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
