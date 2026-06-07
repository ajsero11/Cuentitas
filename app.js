// ── Auth ───────────────────────────────────────────────────────
let usuarioActual = null;

function keyUsuarios() { return 'cuentitas_usuarios'; }
function keySession()  { return 'cuentitas_session'; }
function keyDatos(k)   { return `cuentitas_${usuarioActual.username}_${k}`; }

function cargarUsuarios() {
  try { return JSON.parse(localStorage.getItem(keyUsuarios())) || {}; } catch { return {}; }
}
function guardarUsuarios(u) { localStorage.setItem(keyUsuarios(), JSON.stringify(u)); }

async function hashPass(pass) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pass));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function mostrarError(id, msg) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.classList.remove('hidden');
}
function limpiarError(id) { document.getElementById(id).classList.add('hidden'); }

document.querySelectorAll('.auth-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.auth-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('auth-login').classList.add('hidden');
    document.getElementById('auth-register').classList.add('hidden');
    document.getElementById('auth-' + btn.dataset.auth).classList.remove('hidden');
    limpiarError('login-error');
    limpiarError('reg-error');
  });
});

['login-user','login-pass'].forEach(id => {
  document.getElementById(id).addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('btn-login').click(); });
});
['reg-nombre','reg-user','reg-pass','reg-pass2'].forEach(id => {
  document.getElementById(id).addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('btn-register').click(); });
});

document.getElementById('btn-login').addEventListener('click', async () => {
  limpiarError('login-error');
  const username = document.getElementById('login-user').value.trim().toLowerCase();
  const pass     = document.getElementById('login-pass').value;
  if (!username || !pass) { mostrarError('login-error', 'Completa todos los campos.'); return; }
  const usuarios = cargarUsuarios();
  if (!usuarios[username]) { mostrarError('login-error', 'Usuario no encontrado.'); return; }
  const hash = await hashPass(pass);
  if (usuarios[username].hash !== hash) { mostrarError('login-error', 'Contraseña incorrecta.'); return; }
  iniciarSesion({ username, nombre: usuarios[username].nombre });
});

document.getElementById('btn-register').addEventListener('click', async () => {
  limpiarError('reg-error');
  const nombre   = document.getElementById('reg-nombre').value.trim();
  const username = document.getElementById('reg-user').value.trim().toLowerCase();
  const pass     = document.getElementById('reg-pass').value;
  const pass2    = document.getElementById('reg-pass2').value;
  if (!nombre || !username || !pass || !pass2) { mostrarError('reg-error', 'Completa todos los campos.'); return; }
  if (username.length < 3) { mostrarError('reg-error', 'El usuario debe tener al menos 3 caracteres.'); return; }
  if (!/^[a-z0-9_]+$/.test(username)) { mostrarError('reg-error', 'Solo letras, números y guión bajo.'); return; }
  if (pass.length < 4) { mostrarError('reg-error', 'La contraseña debe tener al menos 4 caracteres.'); return; }
  if (pass !== pass2) { mostrarError('reg-error', 'Las contraseñas no coinciden.'); return; }
  const usuarios = cargarUsuarios();
  if (usuarios[username]) { mostrarError('reg-error', 'Ese nombre de usuario ya existe.'); return; }
  const hash = await hashPass(pass);
  usuarios[username] = { nombre, hash };
  guardarUsuarios(usuarios);
  iniciarSesion({ username, nombre });
});

function iniciarSesion(user) {
  usuarioActual = user;
  localStorage.setItem(keySession(), JSON.stringify(user));
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app-screen').classList.remove('hidden');
  document.getElementById('header-username').textContent = user.nombre;
  arrancarApp();
}

function cerrarSesion() {
  localStorage.removeItem(keySession());
  usuarioActual = null;
  tasas = { usdt: null, bcv: null, fecha: null };
  transacciones = [];
  presupuestos  = [];
  document.getElementById('app-screen').classList.add('hidden');
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('login-user').value = '';
  document.getElementById('login-pass').value = '';
}

document.getElementById('btn-logout').addEventListener('click', () => {
  if (confirm('¿Cerrar sesión?')) cerrarSesion();
});

(function checkSession() {
  try {
    const saved = JSON.parse(localStorage.getItem(keySession()));
    if (saved?.username) { iniciarSesion(saved); return; }
  } catch {}
})();

// ── Estado global ──────────────────────────────────────────────
let tasas = { usdt: null, bcv: null, fecha: null };
let transacciones = [];
let presupuestos  = [];
let filtroActivo  = 'todos';
let presupuestoModalId = null;
let tipoTx = 'ingreso';

// ── Persistencia ───────────────────────────────────────────────
const load = (key, def) => { try { return JSON.parse(localStorage.getItem(keyDatos(key))) ?? def; } catch { return def; } };
const save = (key, val) => localStorage.setItem(keyDatos(key), JSON.stringify(val));

function cargarDatos() {
  const t = load('tasas', null);
  if (t) tasas = t;
  transacciones = load('transacciones', []);
  presupuestos  = load('presupuestos', []);
}
function guardarTasas()         { save('tasas', tasas); }
function guardarTransacciones() { save('transacciones', transacciones); }
function guardarPresupuestos()  { save('presupuestos', presupuestos); }

// ── Utilidades ─────────────────────────────────────────────────
const fmt    = n => Number(n).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtUSD = n => '$' + fmt(n);
const fmtBs  = n => fmt(n) + ' Bs';
const uid    = () => Date.now().toString(36) + Math.random().toString(36).slice(2);
const hoy    = () => new Date().toISOString().slice(0, 10);

function tasaValor(tipo) { return tipo === 'usdt' ? tasas.usdt : tasas.bcv; }
function calcBs(montoUSD, cambio) {
  const t = tasaValor(cambio);
  return t ? montoUSD * t : null;
}

const CATEGORIA_EMOJI = {
  general: '📦', comida: '🍽️', transporte: '🚗', salud: '💊',
  servicios: '💡', educacion: '📚', entretenimiento: '🎮',
  ropa: '👕', trabajo: '💼', otro: '🔖'
};

// ── Tasas ──────────────────────────────────────────────────────
async function fetchTasas() {
  const btn = document.getElementById('btn-refresh');
  btn.style.animation = 'spin 1s linear infinite';
  document.getElementById('tasas-fecha').textContent = 'Actualizando...';
  try {
    const r = await fetch('/api/tasas');
    if (!r.ok) throw new Error();
    const d = await r.json();
    if (d.usdt && d.bcv) {
      tasas = { usdt: d.usdt, bcv: d.bcv, fecha: d.fecha };
      guardarTasas();
      renderTasas();
      return;
    }
  } catch {}
  if (tasas.usdt && tasas.bcv) {
    document.getElementById('tasas-fecha').textContent = '⚠️ Sin conexión — usando tasa guardada';
  } else {
    document.getElementById('tasas-fecha').textContent = '⚠️ Sin conexión — ingresa manualmente';
  }
  btn.style.animation = '';
}

function renderTasas() {
  document.getElementById('val-usdt').textContent = tasas.usdt ? fmt(tasas.usdt) : '—';
  document.getElementById('val-bcv').textContent  = tasas.bcv  ? fmt(tasas.bcv)  : '—';
  const f = tasas.fecha
    ? new Date(tasas.fecha).toLocaleString('es-VE', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })
    : '';
  document.getElementById('tasas-fecha').textContent = f ? `Actualizado: ${f}` : '';
  document.getElementById('btn-refresh').style.animation = '';
  actualizarPreviewTx();
  actualizarPreviewPres();
  actualizarPreviewItem();
  renderDashboard();
  renderTransacciones();
  renderPresupuestos();
}

// ── Navegación ─────────────────────────────────────────────────
function initTabs() {
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(s => s.classList.add('hidden'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.remove('hidden');
    });
  });
}

// ── Manual tasas ───────────────────────────────────────────────
function initManualTasas() {
  document.getElementById('btn-manual-toggle').addEventListener('click', () => {
    document.getElementById('manual-form').classList.toggle('hidden');
  });
  document.getElementById('btn-manual-save').addEventListener('click', () => {
    const u = parseFloat(document.getElementById('manual-usdt').value);
    const b = parseFloat(document.getElementById('manual-bcv').value);
    if (u > 0) tasas.usdt = u;
    if (b > 0) tasas.bcv  = b;
    tasas.fecha = new Date().toISOString();
    guardarTasas();
    renderTasas();
    document.getElementById('manual-form').classList.add('hidden');
    document.getElementById('manual-usdt').value = '';
    document.getElementById('manual-bcv').value  = '';
  });
  document.getElementById('btn-refresh').addEventListener('click', fetchTasas);
}

// ── Tipo ingreso/gasto ─────────────────────────────────────────
function initTipoToggle() {
  document.querySelectorAll('.tipo-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tipo-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      tipoTx = btn.dataset.tipo;
      // Mostrar/ocultar selector de presupuesto solo en gastos
      const sel = document.getElementById('tx-presupuesto');
      if (tipoTx === 'gasto') {
        sel.classList.remove('hidden');
        actualizarSelectorPresupuesto();
      } else {
        sel.classList.add('hidden');
      }
    });
  });
}

function actualizarSelectorPresupuesto() {
  const sel = document.getElementById('tx-presupuesto');
  sel.innerHTML = '<option value="">📋 Sin presupuesto</option>';
  presupuestos.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = `📋 ${p.nombre}`;
    sel.appendChild(opt);
  });
}

// ── Preview tx ─────────────────────────────────────────────────
function actualizarPreviewTx() {
  const monto  = parseFloat(document.getElementById('tx-monto')?.value) || 0;
  const cambio = document.getElementById('tx-cambio')?.value || 'usdt';
  const bs     = calcBs(monto, cambio);
  const el     = document.getElementById('tx-preview');
  if (el) el.textContent = monto > 0 && bs ? `= ${fmtBs(bs)}` : '= — Bs';
}

function initPreviewTx() {
  document.getElementById('tx-monto')?.addEventListener('input',  actualizarPreviewTx);
  document.getElementById('tx-cambio')?.addEventListener('change', actualizarPreviewTx);
}

// ── Preview presupuesto ────────────────────────────────────────
function actualizarPreviewPres() {
  const monto  = parseFloat(document.getElementById('pres-monto')?.value) || 0;
  const cambio = document.getElementById('pres-cambio')?.value || 'usdt';
  const bs     = calcBs(monto, cambio);
  const el     = document.getElementById('pres-preview');
  if (el) el.textContent = monto > 0 && bs ? `= ${fmtBs(bs)}` : '= — Bs';
}

// ── Agregar transacción ────────────────────────────────────────
function initAgregarTx() {
  document.getElementById('btn-agregar-tx').addEventListener('click', () => {
    const desc      = document.getElementById('tx-desc').value.trim();
    const monto     = parseFloat(document.getElementById('tx-monto').value);
    const cambio    = document.getElementById('tx-cambio').value;
    const categoria = document.getElementById('tx-categoria').value;
    const fecha     = document.getElementById('tx-fecha').value || hoy();
    const presId    = tipoTx === 'gasto' ? document.getElementById('tx-presupuesto').value : '';

    if (!desc || !monto || monto <= 0) return;
    const tasa = tasaValor(cambio);
    if (!tasa) { alert('Ingresa las tasas primero'); return; }

    const bs = monto * tasa;
    const pres = presId ? presupuestos.find(p => p.id === presId) : null;

    const tx = {
      id: uid(), tipo: tipoTx, desc, montoUSD: monto, cambio,
      tasaUsada: tasa, bs, categoria, fecha,
      presupuestoId: pres ? pres.id : '',
      presupuestoNombre: pres ? pres.nombre : ''
    };

    transacciones.unshift(tx);
    guardarTransacciones();

    // Si hay presupuesto seleccionado, agregar también al presupuesto
    if (pres) {
      pres.gastos.push({ id: tx.id, desc, montoUSD: monto, cambio, tasaUsada: tasa, bs, fecha });
      guardarPresupuestos();
    }

    document.getElementById('tx-desc').value  = '';
    document.getElementById('tx-monto').value = '';
    document.getElementById('tx-preview').textContent = '= — Bs';
    document.getElementById('tx-presupuesto').value   = '';

    renderTransacciones();
    renderPresupuestos();
    renderDashboard();
  });
}

// ── Filtros ────────────────────────────────────────────────────
function initFiltros() {
  document.querySelectorAll('.filtro-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filtro-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      filtroActivo = btn.dataset.filtro;
      renderTransacciones();
    });
  });
}

// ── Render transacciones ───────────────────────────────────────
function renderTransacciones() {
  const lista = transacciones.filter(t => filtroActivo === 'todos' || t.tipo === filtroActivo);
  const el    = document.getElementById('lista-transacciones');
  if (!lista.length) {
    el.innerHTML = '<div class="empty-state"><span class="emoji">💸</span>Sin movimientos aún</div>';
    actualizarTotales([]);
    return;
  }
  el.innerHTML = lista.map(txHTML).join('');
  el.querySelectorAll('.tx-delete').forEach(btn => {
    btn.addEventListener('click', () => eliminarTx(btn.dataset.id));
  });
  actualizarTotales(lista);
}

function txHTML(t) {
  const emoji = t.tipo === 'ingreso' ? '⬆️' : '⬇️';
  const cat   = CATEGORIA_EMOJI[t.categoria] || '📦';
  const presBadge = t.presupuestoNombre
    ? `<span class="tx-pres-badge">📋 ${t.presupuestoNombre}</span>`
    : '';
  return `
  <div class="tx-item ${t.tipo}">
    <div class="tx-icon">${cat}</div>
    <div class="tx-body">
      <div class="tx-desc">${t.desc}${presBadge}</div>
      <div class="tx-meta">${t.fecha} · ${t.cambio.toUpperCase()} (${fmt(t.tasaUsada)} Bs/$)</div>
    </div>
    <div class="tx-amounts">
      <div class="tx-usd">${emoji} ${fmtUSD(t.montoUSD)}</div>
      <div class="tx-bs">${fmtBs(t.bs)}</div>
    </div>
    <button class="tx-delete" data-id="${t.id}" title="Eliminar">✕</button>
  </div>`;
}

function eliminarTx(id) {
  const tx = transacciones.find(t => t.id === id);
  // Si estaba vinculada a un presupuesto, también eliminarla de ahí
  if (tx?.presupuestoId) {
    const p = presupuestos.find(p => p.id === tx.presupuestoId);
    if (p) {
      p.gastos = p.gastos.filter(g => g.id !== id);
      guardarPresupuestos();
    }
  }
  transacciones = transacciones.filter(t => t.id !== id);
  guardarTransacciones();
  renderTransacciones();
  renderPresupuestos();
  renderDashboard();
}

function actualizarTotales(lista) {
  const gastos  = lista.filter(t => t.tipo === 'gasto');
  const totalBs = gastos.reduce((s, t) => s + t.bs, 0);
  document.getElementById('total-bs').textContent   = fmtBs(totalBs);
  document.getElementById('total-bcv').textContent  = tasas.bcv  ? fmtUSD(totalBs / tasas.bcv)  : '—';
  document.getElementById('total-usdt').textContent = tasas.usdt ? fmtUSD(totalBs / tasas.usdt) : '—';
}

// ── Dashboard ──────────────────────────────────────────────────
function renderDashboard() {
  const mesActual = hoy().slice(0, 7);
  const delMes    = transacciones.filter(t => t.fecha.startsWith(mesActual));
  const ingresos  = delMes.filter(t => t.tipo === 'ingreso');
  const gastos    = delMes.filter(t => t.tipo === 'gasto');

  const totalIngBs  = ingresos.reduce((s, t) => s + t.bs, 0);
  const totalGasBs  = gastos.reduce((s, t) => s + t.bs, 0);
  const totalIngUSD = ingresos.reduce((s, t) => s + t.montoUSD, 0);
  const totalGasUSD = gastos.reduce((s, t) => s + t.montoUSD, 0);
  const balanceBs   = totalIngBs - totalGasBs;

  document.getElementById('dash-ingresos-usd').textContent = fmtUSD(totalIngUSD);
  document.getElementById('dash-ingresos-bs').textContent  = fmtBs(totalIngBs);
  document.getElementById('dash-gastos-usd').textContent   = fmtUSD(totalGasUSD);
  document.getElementById('dash-gastos-bs').textContent    = fmtBs(totalGasBs);
  document.getElementById('dash-balance-bs').textContent   = fmtBs(balanceBs);

  const absBal = Math.abs(balanceBs);
  document.getElementById('dash-balance-bcv').textContent  = tasas.bcv  ? fmtUSD(absBal / tasas.bcv)  : '—';
  document.getElementById('dash-balance-usdt').textContent = tasas.usdt ? fmtUSD(absBal / tasas.usdt) : '—';

  const recientes = transacciones.slice(0, 5);
  const el = document.getElementById('dash-recientes');
  el.innerHTML = recientes.length
    ? recientes.map(txHTML).join('')
    : '<div class="empty-state"><span class="emoji">📊</span>Agrega movimientos para ver el resumen</div>';
  el.querySelectorAll('.tx-delete').forEach(btn => {
    btn.addEventListener('click', () => eliminarTx(btn.dataset.id));
  });
}

// ── Presupuestos ───────────────────────────────────────────────
function initPresupuestos() {
  document.getElementById('pres-monto')?.addEventListener('input',  actualizarPreviewPres);
  document.getElementById('pres-cambio')?.addEventListener('change', actualizarPreviewPres);

  document.getElementById('btn-crear-pres').addEventListener('click', () => {
    const nombre = document.getElementById('pres-nombre').value.trim();
    const monto  = parseFloat(document.getElementById('pres-monto').value);
    const cambio = document.getElementById('pres-cambio').value;
    const inicio = document.getElementById('pres-inicio').value || hoy();
    const fin    = document.getElementById('pres-fin').value || '';

    if (!nombre || !monto || monto <= 0) return;
    const tasa = tasaValor(cambio);
    if (!tasa) { alert('Ingresa las tasas primero'); return; }

    presupuestos.unshift({
      id: uid(), nombre, montoUSD: monto, cambio,
      tasaUsada: tasa, bsTotal: monto * tasa,
      fechaInicio: inicio, fechaFin: fin, gastos: []
    });
    guardarPresupuestos();

    document.getElementById('pres-nombre').value = '';
    document.getElementById('pres-monto').value  = '';
    document.getElementById('pres-preview').textContent = '= — Bs';
    document.getElementById('pres-fin').value    = '';

    actualizarSelectorPresupuesto();
    renderPresupuestos();
  });
}

function renderPresupuestos() {
  const el = document.getElementById('lista-presupuestos');
  if (!presupuestos.length) {
    el.innerHTML = '<div class="empty-state"><span class="emoji">📋</span>Crea tu primer presupuesto</div>';
    return;
  }
  el.innerHTML = presupuestos.map(presHTML).join('');
  el.querySelectorAll('.btn-add-item').forEach(btn => btn.addEventListener('click', () => abrirModal(btn.dataset.id)));
  el.querySelectorAll('.btn-delete-pres').forEach(btn => btn.addEventListener('click', () => eliminarPres(btn.dataset.id)));
  el.querySelectorAll('.btn-del-gasto').forEach(btn => btn.addEventListener('click', () => eliminarGastoPres(btn.dataset.presid, btn.dataset.gastoid)));
}

function presHTML(p) {
  const totalGastadoBs  = p.gastos.reduce((s, g) => s + g.bs, 0);
  const totalGastadoUSD = p.gastos.reduce((s, g) => s + g.montoUSD, 0);
  const diferenciaBs    = p.bsTotal - totalGastadoBs;
  const diferenciaUSD   = p.montoUSD - totalGastadoUSD;
  const pct = p.bsTotal > 0 ? Math.min((totalGastadoBs / p.bsTotal) * 100, 100) : 0;

  const barClass = pct >= 100 ? 'over' : pct >= 80 ? 'warn' : '';

  let resultadoHTML = '';
  if (p.gastos.length === 0) {
    resultadoHTML = `<div class="pres-resultado neutro">Sin gastos registrados aún</div>`;
  } else if (diferenciaBs >= 0) {
    resultadoHTML = `<div class="pres-resultado sobro">
      💚 Te sobró ${fmtUSD(diferenciaUSD)}
      <span class="pres-resultado-bs">(${fmtBs(diferenciaBs)})</span>
    </div>`;
  } else {
    resultadoHTML = `<div class="pres-resultado pase">
      ❤️ Te pasaste ${fmtUSD(Math.abs(diferenciaUSD))}
      <span class="pres-resultado-bs">(${fmtBs(Math.abs(diferenciaBs))})</span>
    </div>`;
  }

  const periodo = p.fechaFin
    ? `${p.fechaInicio} → ${p.fechaFin}`
    : `Desde ${p.fechaInicio}`;

  const gastosHTML = p.gastos.length
    ? p.gastos.map(g => `
      <div class="pres-gasto-item">
        <span class="pres-gasto-desc">${g.desc}</span>
        <span class="pres-gasto-fecha">${g.fecha}</span>
        <span class="pres-gasto-cambio ${g.cambio}">${g.cambio.toUpperCase()}</span>
        <span class="pres-gasto-usd">-${fmtUSD(g.montoUSD)}</span>
        <button class="btn-del-gasto" data-presid="${p.id}" data-gastoid="${g.id}">✕</button>
      </div>`).join('')
    : '<div class="pres-empty">Agrega gastos con el botón "+ Gasto"</div>';

  return `
  <div class="pres-card">
    <div class="pres-header">
      <div>
        <div class="pres-nombre">📋 ${p.nombre}</div>
        <div class="pres-periodo">${periodo} · Presupuesto: ${fmtUSD(p.montoUSD)} ${p.cambio.toUpperCase()}</div>
      </div>
      <div class="pres-actions">
        <button class="btn-add-item" data-id="${p.id}">+ Gasto</button>
        <button class="btn-delete-pres" data-id="${p.id}">🗑</button>
      </div>
    </div>
    <div class="pres-progreso">
      <div class="pres-progreso-labels">
        <span class="pres-progreso-gastado">Gastado: ${fmtUSD(totalGastadoUSD)} (${fmt(pct)}%)</span>
        <span class="pres-progreso-total">Total: ${fmtUSD(p.montoUSD)}</span>
      </div>
      <div class="pres-bar-track">
        <div class="pres-bar-fill ${barClass}" style="width:${pct}%"></div>
      </div>
    </div>
    ${resultadoHTML}
    <div class="pres-gastos">${gastosHTML}</div>
  </div>`;
}

function eliminarPres(id) {
  if (!confirm('¿Eliminar este presupuesto?')) return;
  presupuestos = presupuestos.filter(p => p.id !== id);
  guardarPresupuestos();
  actualizarSelectorPresupuesto();
  renderPresupuestos();
}

function eliminarGastoPres(presId, gastoId) {
  const p = presupuestos.find(p => p.id === presId);
  if (!p) return;
  p.gastos = p.gastos.filter(g => g.id !== gastoId);
  // También eliminar la transacción vinculada si existe
  transacciones = transacciones.filter(t => t.id !== gastoId);
  guardarPresupuestos();
  guardarTransacciones();
  renderPresupuestos();
  renderTransacciones();
  renderDashboard();
}

// ── Modal gasto en presupuesto ─────────────────────────────────
function abrirModal(presId) {
  presupuestoModalId = presId;
  const p = presupuestos.find(p => p.id === presId);
  document.getElementById('modal-titulo').textContent = `+ Gasto: ${p?.nombre}`;
  document.getElementById('item-desc').value  = '';
  document.getElementById('item-monto').value = '';
  document.getElementById('item-fecha').value = hoy();
  document.getElementById('item-preview').textContent = '= — Bs';
  document.getElementById('modal-overlay').classList.remove('hidden');
}

function initModal() {
  document.getElementById('modal-close').addEventListener('click', () => {
    document.getElementById('modal-overlay').classList.add('hidden');
  });
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-overlay'))
      document.getElementById('modal-overlay').classList.add('hidden');
  });
  document.getElementById('item-monto')?.addEventListener('input',  actualizarPreviewItem);
  document.getElementById('item-cambio')?.addEventListener('change', actualizarPreviewItem);

  document.getElementById('btn-agregar-item').addEventListener('click', () => {
    const desc   = document.getElementById('item-desc').value.trim();
    const monto  = parseFloat(document.getElementById('item-monto').value);
    const cambio = document.getElementById('item-cambio').value;
    const fecha  = document.getElementById('item-fecha').value || hoy();
    if (!desc || !monto || monto <= 0) return;
    const tasa = tasaValor(cambio);
    if (!tasa) { alert('Ingresa las tasas primero'); return; }

    const p = presupuestos.find(p => p.id === presupuestoModalId);
    if (!p) return;

    const gastoId = uid();
    const bs = monto * tasa;

    // Agregar gasto al presupuesto
    p.gastos.push({ id: gastoId, desc, montoUSD: monto, cambio, tasaUsada: tasa, bs, fecha });
    guardarPresupuestos();

    // Crear también una transacción vinculada
    transacciones.unshift({
      id: gastoId, tipo: 'gasto', desc, montoUSD: monto, cambio,
      tasaUsada: tasa, bs, categoria: 'general', fecha,
      presupuestoId: p.id, presupuestoNombre: p.nombre
    });
    guardarTransacciones();

    document.getElementById('modal-overlay').classList.add('hidden');
    renderPresupuestos();
    renderTransacciones();
    renderDashboard();
  });
}

function actualizarPreviewItem() {
  const monto  = parseFloat(document.getElementById('item-monto')?.value) || 0;
  const cambio = document.getElementById('item-cambio')?.value || 'usdt';
  const bs     = calcBs(monto, cambio);
  const el     = document.getElementById('item-preview');
  if (el) el.textContent = monto > 0 && bs ? `= ${fmtBs(bs)}` : '= — Bs';
}

// ── Arrancar app ───────────────────────────────────────────────
function arrancarApp() {
  cargarDatos();
  document.querySelectorAll('.tab').forEach((b, i) => b.classList.toggle('active', i === 0));
  document.querySelectorAll('.tab-content').forEach((s, i) => s.classList.toggle('hidden', i !== 0));
  filtroActivo = 'todos';
  tipoTx = 'ingreso';
  document.getElementById('tx-fecha').value   = hoy();
  document.getElementById('pres-inicio').value = hoy();

  initTabs();
  initManualTasas();
  initTipoToggle();
  initPreviewTx();
  initAgregarTx();
  initFiltros();
  initPresupuestos();
  initModal();
  actualizarSelectorPresupuesto();

  renderTasas();
  renderDashboard();
  renderTransacciones();
  renderPresupuestos();
  fetchTasas();
}
