// Arranque: modo, inicio de sesión, navegación
import { crearApi, supabaseConfigurado, claveSecreta } from './api.js';
import { S, on, emit, cargarTodo, suscribir, esAdmin } from './store.js';
import { $, $$, esc, toast, modal, iniciales, marcaHtml } from './util.js';
import { NOMBRE_APP } from './config.js';
import { iniciarMapa, refrescar, rellenarSelects, map, talleresVisibles } from './mapa.js';
import { iniciarFicha } from './ficha.js';
import { iniciarAgenda, badge } from './agenda.js';
import { iniciarRuta } from './ruta.js';
import { iniciarPanel } from './panel.js';
import { iniciarAdmin, exportarExcel } from './admin.js';
import { nuevoTaller } from './nuevo.js';

const VISTAS = ['mapa', 'agenda', 'ruta', 'panel', 'admin'];
document.title = NOMBRE_APP;
$$('.brand').forEach(e => { e.innerHTML = marcaHtml(); });

if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});

async function arrancar() {
  const params = new URLSearchParams(location.search);
  if (claveSecreta && !params.has('demo')) return pantallaError('En js/config.js se ha pegado la clave SECRETA de Supabase. Cámbiala por la clave pública (publishable/anon) antes de publicar: la secreta da acceso total a los datos.');
  const modo = params.has('demo') || !supabaseConfigurado ? 'demo' : 'supabase';
  try { S.api = await crearApi(modo); }
  catch (e) { pantallaError('No se pudo conectar con el servidor. Revisa tu conexión y recarga.'); return; }
  if (modo === 'supabase') S.api.onAuth((ev) => {
    if (ev === 'PASSWORD_RECOVERY') pedirNuevaClave(true);
    if (ev === 'SIGNED_OUT') location.reload();
  });
  const sesion = await S.api.sesion();
  if (!sesion) return pantallaLogin(modo);
  await entrarEnApp();
}

function pantallaError(msg) { $('#cargando').hidden = true; $('#login').hidden = false; $('#login').innerHTML = `<div class="login-card"><h1>${marcaHtml(true)}</h1><p class="aviso">${esc(msg)}</p></div>`; }

function pantallaLogin(modo) {
  $('#cargando').hidden = true; $('#app').hidden = true; $('#login').hidden = false;
  if (modo === 'demo') {
    $('#login').innerHTML = `<div class="login-card">
      <h1>${marcaHtml(true)}</h1><p class="login-sub">Talleres de tacógrafo · acceso del equipo</p>
      <p class="aviso">${supabaseConfigurado ? 'Modo demostración.' : 'Todavía no está conectada a Supabase, así que funciona en modo demostración.'} Los cambios se guardan solo en este navegador.</p>
      <p class="note">Entra como:</p>
      <div class="demo-users">${S.api.usuariosDemo.map(u => `<button class="btn ${u.rol === 'admin' ? 'primary' : ''}" data-u="${esc(u.id)}"><span class="avatar" style="background:${esc(u.color)}">${esc(iniciales(u.nombre))}</span>${esc(u.nombre)}<small>${u.rol === 'admin' ? 'Dirección: ve y asigna todo' : 'Comercial'}</small></button>`).join('')}</div>
    </div>`;
    $$('[data-u]', $('#login')).forEach(b => b.addEventListener('click', async () => { await S.api.entrar(b.dataset.u); entrarEnApp(); }));
    return;
  }
  $('#login').innerHTML = `<form class="login-card" id="loginForm">
      <h1>${marcaHtml(true)}</h1><p class="login-sub">Talleres de tacógrafo · acceso del equipo</p>
      <p class="note">Entra con el email y la contraseña que te ha dado la empresa.</p>
      <label class="field"><span>Email</span><input type="email" name="email" autocomplete="username" required></label>
      <label class="field"><span>Contraseña</span><input type="password" name="password" autocomplete="current-password" required></label>
      <p class="note err" hidden></p>
      <button class="btn primary big" type="submit">Entrar</button>
      <button class="linklike" type="button" id="olvido">He olvidado mi contraseña</button>
    </form>`;
  const f = $('#loginForm'), err = f.querySelector('.err');
  f.addEventListener('submit', async e => {
    e.preventDefault(); err.hidden = true; const b = f.querySelector('[type=submit]'); b.disabled = true; b.textContent = 'Entrando…';
    try { await S.api.entrar(f.email.value.trim(), f.password.value); await entrarEnApp(); }
    catch (x) { err.hidden = false; err.textContent = x.message; b.disabled = false; b.textContent = 'Entrar'; }
  });
  $('#olvido').addEventListener('click', async () => {
    const email = f.email.value.trim();
    if (!email) { err.hidden = false; err.textContent = 'Escribe primero tu email.'; return; }
    try { await S.api.recordar(email); err.hidden = false; err.textContent = 'Te hemos enviado un email para crear una contraseña nueva.'; }
    catch (x) { err.hidden = false; err.textContent = x.message; }
  });
}

function pedirNuevaClave(recuperando) {
  const { el, close } = modal(`<form class="form"><div class="modal-head"><h3>${recuperando ? 'Crea tu contraseña nueva' : 'Cambiar contraseña'}</h3>${recuperando ? '' : '<button type="button" class="icon" data-close aria-label="Cerrar">×</button>'}</div>
    <label class="field"><span>Contraseña nueva (mínimo 8 caracteres)</span><input type="password" name="p" minlength="8" required autocomplete="new-password"></label>
    <p class="note err" hidden></p><div class="btns end"><button class="btn primary" type="submit">Guardar</button></div></form>`);
  el.querySelector('form').addEventListener('submit', async e => {
    e.preventDefault();
    try { await S.api.cambiarClave(e.target.p.value); close(); toast('Contraseña cambiada'); }
    catch (x) { const p = el.querySelector('.err'); p.hidden = false; p.textContent = x.message; }
  });
}

async function entrarEnApp() {
  $('#login').hidden = true; $('#cargando').hidden = false;
  try {
    S.yo = await S.api.yo();
    if (!S.yo) { pantallaError('Tu usuario no tiene perfil en la aplicación. Pide a la dirección que revise el alta.'); return; }
    if (!S.yo.activo) { pantallaError('Tu usuario está desactivado. Habla con la dirección de la empresa.'); return; }
    try { S.fechaRegistro = (await fetch('data/talleres.json').then(r => r.json())).fecha_registro; } catch (e) {}
    await cargarTodo();
  } catch (e) { pantallaError(e.message); return; }
  $('#cargando').hidden = true; $('#app').hidden = false;
  document.body.classList.toggle('es-admin', esAdmin());
  pintarUsuario();
  iniciarMapa(); iniciarFicha(); iniciarAgenda(); iniciarRuta(); iniciarPanel(); iniciarAdmin();
  rellenarSelects(); refrescar(); badge();
  on('ir', v => { location.hash = v; });
  on('conexion', ok => { $('#sync').className = 'sync ' + (ok ? 'ok' : 'off'); $('#sync').title = ok ? 'Conectado: los cambios del equipo llegan al momento' : 'Sin conexión en tiempo real'; });
  suscribir();
  on('cambio', t => { if (t.includes('perfiles')) pintarUsuario(); });
  window.addEventListener('hashchange', irA);
  irA();
  $('#exportLista').addEventListener('click', () => exportarExcel(talleresVisibles()));
  $('#nuevoTaller').addEventListener('click', nuevoTaller);
  $('#btnNuevo').addEventListener('click', nuevoTaller);
}

function irA() {
  let v = location.hash.slice(1); if (!VISTAS.includes(v) || (v === 'admin' && !esAdmin())) v = 'mapa';
  for (const x of VISTAS) $('#v-' + x).hidden = x !== v;
  $$('[data-ir]').forEach(b => b.setAttribute('aria-current', b.dataset.ir === v ? 'page' : 'false'));
  document.body.dataset.vista = v;
  if (v === 'mapa' && map) setTimeout(() => map.invalidateSize(), 50);
  emit('vista', v);
}

function pintarUsuario() {
  const y = S.yo;
  $('#yo').innerHTML = `<span class="avatar" style="background:${esc(y.color)}">${esc(iniciales(y.nombre))}</span><span class="yo-n">${esc(y.nombre)}<small>${esc(y.rol === 'admin' ? 'Dirección' : 'Comercial')}${S.api.modo === 'demo' ? ' · demo' : ''}</small></span>`;
}
$('#yo').addEventListener('click', () => {
  const demo = S.api.modo === 'demo';
  const { el, close } = modal(`<div class="modal-head"><h3>${esc(S.yo.nombre)}</h3><button class="icon" data-close aria-label="Cerrar">×</button></div>
    <p class="note">${esc(S.yo.email || '')}</p>
    <label class="field"><span>Tu nombre en la aplicación</span><input id="miNombre" value="${esc(S.yo.nombre)}" maxlength="60"></label>
    <div class="btns"><button class="btn" id="guardaNombre">Guardar nombre</button>${demo ? '' : '<button class="btn" id="cambiaClave">Cambiar contraseña</button>'}</div>
    <div class="btns">${demo ? '<button class="btn" id="otroUsuario">Entrar con otro usuario</button><button class="btn danger" id="reiniciaDemo">Borrar los datos de la demo</button>' : '<button class="btn danger" id="salir">Cerrar sesión</button>'}</div>`);
  el.querySelector('#guardaNombre').onclick = async () => { const n = el.querySelector('#miNombre').value.trim(); if (!n) return; await S.api.update('perfiles', S.yo.id, { nombre: n }); S.yo.nombre = n; S.perfiles.set(S.yo.id, { ...S.perfiles.get(S.yo.id), nombre: n }); pintarUsuario(); toast('Nombre guardado'); close(); };
  el.querySelector('#cambiaClave')?.addEventListener('click', () => { close(); pedirNuevaClave(false); });
  el.querySelector('#salir')?.addEventListener('click', async () => { await S.api.salir(); location.reload(); });
  el.querySelector('#otroUsuario')?.addEventListener('click', async () => { await S.api.salir(); location.reload(); });
  el.querySelector('#reiniciaDemo')?.addEventListener('click', async () => { S.api.reiniciarDemo(); await S.api.salir(); location.reload(); });
});
$$('[data-ir]').forEach(b => b.addEventListener('click', () => { location.hash = b.dataset.ir; }));

arrancar();
