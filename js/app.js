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

  // ===== Datos de ejemplo (seed) =====
  function seedData() {
    var d = dIso;
    var clients = [
      { id: 'c1', name: 'Ramón Benítez', phone: '0981 456 789', address: 'Luque · Ruta Luque–San Ber km 4', ci: 'CI 1.234.567-8', notes: 'Portón verde, preguntar por la señora.' },
      { id: 'c2', name: 'Tambo Los Laureles', phone: '0982 111 222', address: 'Pirayú · Camino a Cerro Verá', ci: 'RUC 80045678-9', notes: '' },
      { id: 'c3', name: 'Estancia San Rafael', phone: '0983 333 444', address: 'J. Augusto Saldívar · km 26', ci: 'RUC 80012345-6', notes: '' },
      { id: 'c4', name: 'Granja Doña Nilda', phone: '0984 555 666', address: 'Itauguá · Barrio San Blas', ci: 'CI 2.345.678-9', notes: 'Atención: perros sueltos.' },
      { id: 'c5', name: 'Colegio San José', phone: '021 555 123', address: 'Capiatá · km 20 Ruta 1', ci: 'RUC 80099887-7', notes: 'Hablar con el administrador, Sr. Ortiz.' },
      { id: 'c6', name: 'Vivero La Esperanza', phone: '0985 777 888', address: 'Areguá · Av. del Lago 1450', ci: 'CI 3.456.789-0', notes: '' }
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
      settings: { categories: ['Perforación', 'Mantenimiento', 'Motobomba', 'Pesca de equipo', 'Otro'], remindDays: 3, notifEnabled: false },
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
        if (d && Array.isArray(d.clients) && Array.isArray(d.jobs) && d.settings) return d;
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
    data: loadData()
  };
  var confirmTimer = null;

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
  function openPay(jobId) {
    var j = state.data.jobs.find(function (x) { return x.id === jobId; });
    if (!j) return;
    var c = state.data.clients.find(function (x) { return x.id === j.clientId; });
    pForm = { jobId: jobId };
    document.getElementById('pf-sub').textContent = (c ? c.name : '') + ' — ' + (j.desc || j.category);
    document.getElementById('pf-saldo').textContent = fmtG(jobBalance(j));
    document.getElementById('pf-amount').value = '';
    document.getElementById('pf-date').value = todayIso();
    document.getElementById('pf-note').value = '';
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
    var bal = jobBalance(j);
    var amount = parseMoney(document.getElementById('pf-amount').value);
    var txt = fmtG(Math.max(0, bal - amount));
    if (amount > 0 && amount >= bal) txt += ' — ¡queda pagado!';
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
    var paidOff = false;
    mutate(function (d) {
      var j = d.jobs.find(function (x) { return x.id === pForm.jobId; });
      if (!j) return;
      j.payments = j.payments || [];
      j.payments.push({ id: uid(), amount: amount, date: date, note: note });
      var paid = j.payments.reduce(function (a, p) { return a + (Number(p.amount) || 0); }, 0);
      if (paid >= (Number(j.price) || 0)) {
        (j.dueDates || []).forEach(function (x) { x.done = true; });
        paidOff = true;
      }
    });
    closePayModal();
    toast(paidOff ? 'Pago registrado — ¡trabajo saldado!' : 'Pago registrado.');
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
    var q = (state.search || '').trim().toLowerCase();
    var html = '';

    if (D.clients.length === 0) {
      html = '<div class="empty-card">' +
        '<div class="empty-card-title">Todavía no hay clientes</div>' +
        '<div class="empty-card-text">Agregá tu primer cliente para empezar a cargar trabajos.</div>' +
        '<button type="button" class="btn-cta js-empty-new">+ Agregar cliente</button></div>';
    } else if (q) {
      var res = D.clients.filter(function (c) {
        return ((c.name || '') + ' ' + (c.address || '') + ' ' + (c.phone || '') + ' ' + (c.ci || '')).toLowerCase().indexOf(q) !== -1;
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
      var pays = (j.payments || []).slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
      if (pays.length) {
        html += '<div class="job-detail-label">Historial de pagos</div><div class="pay-list">' +
          pays.map(function (p) {
            return '<div class="pay-row"><span class="pay-row-label">' + esc(dd(p.date) + (p.note ? ' · ' + p.note : '')) + '</span>' +
              '<span class="pay-row-amount">+ ' + esc(fmtG(p.amount)) + '</span></div>';
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
        state.expandedJobId = state.expandedJobId === id ? null : id;
        render();
      });
    });
    box.querySelectorAll('[data-job-pay]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.stopPropagation();
        openPay(el.getAttribute('data-job-pay'));
      });
    });
    box.querySelectorAll('[data-job-post]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.stopPropagation();
        toast('Las fechas de cobro se manejan en la Fase 4.');
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
          mutate(function (d) {
            d.jobs = d.jobs.filter(function (x) { return x.id !== id; });
          });
          toast('Trabajo eliminado.');
        });
      });
    });
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
    if (view === 'clientes') renderClientesList();
    if (view === 'cliente') renderCliente();
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

  // Escape cierra el modal abierto
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (!modalEl.hidden) closeClientModal();
    if (!jobModalEl.hidden) closeJobModal();
    if (!payModalEl.hidden) closePayModal();
  });

  render();

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
    helpers: {
      uid: uid, esc: esc, initials: initials, todayIso: todayIso, dIso: dIso, addDaysIso: addDaysIso,
      daysBetween: daysBetween, dd: dd, ddShort: ddShort, fmtG: fmtG, dots: dots, mill: mill, parseMoney: parseMoney,
      jobPaid: jobPaid, jobBalance: jobBalance, urgentCounts: urgentCounts,
      totalPending: totalPending, clientBalances: clientBalances, waLink: waLink, confirm2: confirm2
    }
  };
})();
