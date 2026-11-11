// Arranque: modo, inicio de sesión, navegación
import { crearApi, supabaseConfigurado, claveSecreta, PRACTICA } from './api.js';
import { recargarCursos, sincronizarSiToca } from './cursos.js';
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
  const modo = PRACTICA || params.has('demo') || !supabaseConfigurado ? 'demo' : 'supabase';
  try { S.api = await crearApi(modo); }
  catch (e) { pantallaError('No se pudo conectar con el servidor. Revisa tu conexión y recarga.'); return; }
  if (modo === 'supabase') S.api.onAuth((ev) => {
    if (ev === 'PASSWORD_RECOVERY') pedirNuevaClave(true);
    if (ev === 'SIGNED_OUT') location.reload();
  });
  if (PRACTICA) {
    document.documentElement.classList.add('practica');
    document.body.insertAdjacentHTML('afterbegin', `<div class="banda-practica" role="status"><b>MODO PRÁCTICA</b><span>Puedes probarlo todo: nada de lo que hagas aquí se guarda ni lo ve nadie.</span><a href="${location.pathname}">Volver a la aplicación</a></div>`);
    if (!(await S.api.sesion())) await S.api.entrar(params.get('practica') === 'admin' ? 'demo-admin' : 'demo-com-1');
  }
  const sesion = await S.api.sesion();
  if (!sesion) return pantallaLogin(modo);
  await entrarEnApp();
}

// Pantalla de acceso partida en dos, como la del panel de Adiestramientos
const ladoMarca = () => `<div class="login-marca">
    <img src="icons/logo.png" alt="WORTACH, el mundo del tacógrafo" width="156" height="40">
    <div><h1>Wortach Workshops</h1><p>El mapa comercial de los talleres de tacógrafo: clientes, visitas, ventas y rutas del equipo.</p></div>
    <svg class="marca-agua" aria-hidden="true"><use href="#simbolo"/></svg>
  </div>`;
function mostrarAcceso(html, solo = false) {
  $('#cargando').hidden = true; $('#app').hidden = true;
  const l = $('#login'); l.hidden = false; l.classList.toggle('solo', solo);
  l.innerHTML = solo ? html : `${ladoMarca()}<div class="login-form">${html}</div>`;
}

function pantallaError(msg) { mostrarAcceso(`<div class="login-card"><h2>No se puede entrar</h2><p class="aviso">${esc(msg)}</p><button class="btn big" type="button" onclick="location.reload()">Volver a intentarlo</button></div>`); }

function pantallaLogin(modo) {
  if (modo === 'demo') {
    mostrarAcceso(`<div class="login-card">
      <h2>Entrar</h2><p class="sub">Elige con quién quieres probarla.</p>
      <p class="aviso info">${supabaseConfigurado ? 'Modo demostración.' : 'Todavía no está conectada a Supabase, así que funciona en modo demostración.'} Los cambios se guardan solo en este navegador.</p>
      <div class="demo-users">${S.api.usuariosDemo.map(u => `<button class="btn ${u.rol === 'admin' ? 'primary' : ''}" data-u="${esc(u.id)}"><span class="avatar" style="background:${esc(u.color)}">${esc(iniciales(u.nombre))}</span>${esc(u.nombre)}<small>${u.rol === 'admin' ? 'Dirección: ve y asigna todo' : 'Comercial'}</small></button>`).join('')}</div>
    </div>`);
    $$('[data-u]', $('#login')).forEach(b => b.addEventListener('click', async () => { await S.api.entrar(b.dataset.u); entrarEnApp(); }));
    return;
  }
  mostrarAcceso(`<form class="login-card" id="loginForm">
      <h2>Entrar</h2><p class="sub">Con el correo y la contraseña que te ha dado la empresa.</p>
      <label class="field"><span>Correo</span><input type="email" name="email" autocomplete="username" required></label>
      <label class="field"><span>Contraseña</span><input type="password" name="password" autocomplete="current-password" required></label>
      <p class="note err" hidden></p>
      <button class="btn primary big" type="submit">Entrar</button>
      <button class="linklike" type="button" id="olvido">¿Has olvidado la contraseña?</button>
    </form>`);
  const f = $('#loginForm'), err = f.querySelector('.err');
  f.addEventListener('submit', async e => {
    e.preventDefault(); err.hidden = true; const b = f.querySelector('[type=submit]'); b.disabled = true; b.textContent = 'Entrando…';
    try { await S.api.entrar(f.email.value.trim(), f.password.value); await entrarEnApp(); }
    catch (x) { err.hidden = false; err.textContent = x.message; b.disabled = false; b.textContent = 'Entrar'; }
  });
  $('#olvido').addEventListener('click', async () => {
    const email = f.email.value.trim();
    if (!email) { err.hidden = false; err.textContent = 'Escribe primero tu correo.'; return; }
    try { await S.api.recordar(email); err.hidden = false; err.textContent = 'Te hemos enviado un correo para crear una contraseña nueva.'; }
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
    await recargarCursos();
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
  sincronizarSiToca();
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
  $('#yo').innerHTML = `<span class="avatar" style="background:${esc(y.color)}">${esc(iniciales(y.nombre))}</span><span class="yo-n"><span>${esc(y.nombre)}</span><small>${esc(y.rol === 'admin' ? 'Dirección' : 'Comercial')}${S.api.modo === 'demo' ? ' · demo' : ''}</small></span><svg class="flecha" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
$('#yo').addEventListener('click', () => {
  const demo = S.api.modo === 'demo';
  const { el, close } = modal(`<div class="modal-head"><h3>${esc(S.yo.nombre)}</h3><button class="icon" data-close aria-label="Cerrar">×</button></div>
    <p class="note">${esc(S.yo.email || '')}</p>
    <label class="field"><span>Tu nombre en la aplicación</span><input id="miNombre" value="${esc(S.yo.nombre)}" maxlength="60"></label>
    <div class="btns"><button class="btn" id="guardaNombre">Guardar nombre</button>${demo ? '' : '<button class="btn" id="cambiaClave">Cambiar contraseña</button>'}</div>
    ${S.api.practica ? '' : `<div class="aviso info"><span><b>Modo práctica.</b> Una copia de la aplicación para aprender o enseñarla a alguien nuevo, con talleres y técnicos de ejemplo. Nada de lo que hagas allí toca los datos reales.</span><div class="btns"><a class="btn" href="${location.pathname}?practica=${S.yo.rol === 'admin' ? 'admin' : 'comercial'}" target="_blank" rel="noopener">Abrir modo práctica</a></div></div>`}
    <div class="btns">${demo ? '<button class="btn" id="otroUsuario">Entrar con otro usuario</button><button class="btn danger" id="reiniciaDemo">Borrar los datos de la demo</button>' : '<button class="btn danger" id="salir">Cerrar sesión</button>'}</div>`);
  el.querySelector('#guardaNombre').onclick = async () => { const n = el.querySelector('#miNombre').value.trim(); if (!n) return; await S.api.update('perfiles', S.yo.id, { nombre: n }); S.yo.nombre = n; S.perfiles.set(S.yo.id, { ...S.perfiles.get(S.yo.id), nombre: n }); pintarUsuario(); toast('Nombre guardado'); close(); };
  el.querySelector('#cambiaClave')?.addEventListener('click', () => { close(); pedirNuevaClave(false); });
  el.querySelector('#salir')?.addEventListener('click', async () => { await S.api.salir(); location.reload(); });
  el.querySelector('#otroUsuario')?.addEventListener('click', async () => { await S.api.salir(); location.reload(); });
  el.querySelector('#reiniciaDemo')?.addEventListener('click', async () => { S.api.reiniciarDemo(); await S.api.salir(); location.reload(); });
});
$$('[data-ir]').forEach(b => b.addEventListener('click', () => { location.hash = b.dataset.ir; }));

arrancar();
