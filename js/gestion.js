// Gestión: datos de Cursos, revisión del registro oficial, talleres repetidos y actividad reciente
import { S, emit, nombreDe } from './store.js';
import { $, $$, esc, toast, fmtNum, fmtFecha, vacio, cargandoHtml, estadoInfo } from './util.js';
import { sesionCursos, entrarCursos, sincronizar, propuesta, vincular, candidatos, nucleo, parecido, normalizar } from './cursos.js';
import { textoHistorial } from './ficha.js';

const abrirTaller = id => { emit('ir', 'mapa'); emit('abrir', { id, volar: true }); };
const fechaHora = f => new Date(f).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });

// ------------------------------------------------------------------
// Datos de Cursos
// ------------------------------------------------------------------
let verSinTaller = false;
export async function renderCursos(box) {
  if (!box) return;
  const sync = S.ajustes.get('cursos_sync')?.valor;
  const demo = S.api.modo === 'demo';
  const email = demo ? null : await sesionCursos();
  const { claros, dudosos, sinTaller } = propuesta();
  const vincs = [...S.vinculos.values()];
  const unidos = vincs.filter(v => v.taller_id), auto = unidos.filter(v => v.metodo === 'auto').length;
  const tecs = [...S.tecnicos.values()].flat();
  const porRenovar = tecs.filter(t => ['caducado', 'vence_pronto'].includes(t.situacion) && !t.sin_avisos && S.vinculos.get(t.centro_id)?.taller_id).length;
  box.innerHTML = `
    <div class="row-between"><h2 class="cap">Datos de Cursos</h2>${sync ? `<span class="note">Última copia: ${fechaHora(sync.fecha)}${sync.demo ? ' (ejemplo)' : ''}</span>` : ''}</div>
    <p class="note">Los talleres y técnicos de la plataforma de adiestramientos se copian aquí para ver en cada ficha quién está formado y cuándo le toca renovar. Sin DNI, teléfono ni correo de los técnicos.</p>
    ${S.centros.size ? `<div class="cifras mini">
      <div class="cifra"><b>${fmtNum(S.centros.size)}</b><span>Talleres en Cursos</span></div>
      <div class="cifra verde"><b>${fmtNum(unidos.length)}</b><span>Unidos al mapa</span><small>${auto} automáticamente</small></div>
      <div class="cifra ${dudosos.length ? 'aviso-c' : ''}"><b>${fmtNum(dudosos.length)}</b><span>Por confirmar</span></div>
      <div class="cifra"><b>${fmtNum(tecs.length)}</b><span>Técnicos</span></div>
      <div class="cifra ${porRenovar ? 'alerta' : ''}"><b>${fmtNum(porRenovar)}</b><span>Por renovar</span><small>en talleres del mapa</small></div>
    </div>` : ''}
    ${demo ? `<p class="aviso info"><span>En la demostración se usan técnicos inventados. Con la aplicación real, aquí se conecta con tu cuenta de Cursos.</span></p>`
      : email ? `<div class="conexion"><span class="sync ok"><i></i></span><span>Conectado con Cursos como <b>${esc(email)}</b>. Se copia sola cada 6 horas al abrir la aplicación.</span><button class="btn primary" id="cuSync">Copiar ahora</button></div>`
      : `<form class="conexion-form" id="cuLogin"><p class="note">Entra con tu cuenta de gestor de Cursos (la misma del panel de adiestramientos). Si ya la tienes abierta en este navegador, se usa sola.</p>
          <div class="grid2"><label class="field"><span>Correo de Cursos</span><input type="email" name="email" required autocomplete="off"></label><label class="field"><span>Contraseña</span><input type="password" name="pass" required autocomplete="off"></label></div>
          <p class="note err" hidden></p><div class="btns"><button class="btn primary" type="submit">Conectar y copiar</button></div></form>`}
    <p class="note" id="cuMsg"></p>
    ${claros.length ? `<div class="aviso info"><span>${claros.length} ${claros.length === 1 ? 'taller coincide' : 'talleres coinciden'} claramente por nombre y provincia.</span><div class="btns"><button class="btn primary" id="cuClaros">Unirlos</button></div></div>` : ''}
    ${dudosos.length ? `<h3 class="ch-t">¿Son el mismo taller?</h3><p class="note">Confirma cada pareja. Si ninguno es el suyo, pulsa «Ninguno».</p>
      <div class="dup-lista">${dudosos.slice(0, 25).map(({ c, cs }) => `<div class="dup cu">
        <div class="lado"><span class="et-mini">En Cursos</span><b>${esc(c.nombre)}</b><span>${esc(c.provincia || 'Sin provincia')} · ${((n) => `${n} ${n === 1 ? 'técnico' : 'técnicos'}`)((S.tecnicos.get(c.id) || []).length)}</span></div>
        <div class="opciones">${cs.map(({ t, p }) => `<button class="opc" data-unir="${esc(c.id)}" data-t="${esc(t.id)}"><b>${esc(t.nombre)}</b><span>${esc(t.poblacion || '')}${t.provincia && t.provincia !== t.poblacion ? ' · ' + esc(t.provincia) : ''} · ${Math.round(p * 100)} % parecido</span></button>`).join('')}
          <button class="opc no" data-unir="${esc(c.id)}" data-t="">Ninguno</button></div></div>`).join('')}</div>${dudosos.length > 25 ? `<p class="note">Y ${dudosos.length - 25} más: aparecerán al confirmar estos.</p>` : ''}` : ''}
    ${sinTaller.length ? `<div class="row-between"><p class="note"><b>${sinTaller.length}</b> talleres de Cursos no se parecen a ninguno del mapa (pueden ser de fuera del registro o tener otro nombre).</p><button class="linklike" id="cuVerSin">${verSinTaller ? 'Ocultar' : 'Ver cuáles'}</button></div>
      ${verSinTaller ? `<div class="tablewrap alto"><table><thead><tr><th>En Cursos</th><th>Provincia</th><th class="n">Técnicos</th></tr></thead><tbody>${sinTaller.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map(c => `<tr><td>${esc(c.nombre)}</td><td>${esc(c.provincia || '—')}</td><td class="n">${(S.tecnicos.get(c.id) || []).length}</td></tr>`).join('')}</tbody></table></div>
        <p class="note">Para unir uno a mano, abre la ficha del taller en el mapa → pestaña Formación → «Unir con un taller de Cursos».</p>` : ''}` : ''}`;
  $('#cuVerSin', box)?.addEventListener('click', () => { verSinTaller = !verSinTaller; renderCursos(box); });
  $('#cuClaros', box)?.addEventListener('click', async e => {
    e.target.disabled = true;
    for (const { c, t } of claros) await vincular(c.id, t.id, 'auto');
    toast(`${claros.length} talleres unidos con Cursos`);
  });
  box.querySelectorAll('[data-unir]').forEach(b => b.addEventListener('click', async () => {
    b.closest('.dup').classList.add('pend');
    await vincular(b.dataset.unir, b.dataset.t || null, 'manual');
    toast(b.dataset.t ? 'Unido' : 'Marcado como «ninguno»', '', { deshacer: async () => { const { desvincular } = await import('./cursos.js'); await desvincular(b.dataset.unir); } });
  }));
  const copiar = async () => {
    const m = $('#cuMsg', box); m.innerHTML = cargandoHtml('Copiando de Cursos…');
    try { const r = await sincronizar(); toast(`Copiados ${fmtNum(r.centros)} talleres y ${fmtNum(r.tecnicos)} técnicos${r.unidos ? ` · ${r.unidos} unidos solos` : ''}`); }
    catch (e) { m.textContent = e.message; m.className = 'note err'; }
  };
  $('#cuSync', box)?.addEventListener('click', copiar);
  $('#cuLogin', box)?.addEventListener('submit', async e => {
    e.preventDefault(); const f = e.target, err = f.querySelector('.err'); err.hidden = true;
    const b = f.querySelector('[type=submit]'); b.disabled = true; b.textContent = 'Conectando…';
    try { await entrarCursos(f.email.value.trim(), f.pass.value); await copiar(); renderCursos(box); }
    catch (x) { err.hidden = false; err.textContent = x.message; b.disabled = false; b.textContent = 'Conectar y copiar'; }
  });
}

// ------------------------------------------------------------------
// Revisión del registro oficial: qué cambia antes de aplicarla
// ------------------------------------------------------------------
export async function renderRegistro(box, { aplicar }) {
  if (!box) return;
  let d;
  try { d = await fetch('data/talleres.json', { cache: 'no-cache' }).then(r => r.json()); } catch (e) { box.innerHTML = vacio('No se pudo leer el archivo del registro.', 'Registro oficial'); return; }
  S.fechaRegistro = d.fecha_registro;
  const aplicada = S.ajustes.get('registro_aplicado')?.valor;
  const enJson = new Map(d.talleres.map(t => [t.id, t]));
  const altas = d.talleres.filter(t => !S.talleres.has(t.id));
  const bajas = [...S.talleres.values()].filter(t => t.origen === 'reg' && t.en_registro && !enJson.has(t.id));
  const renovadas = d.talleres.filter(t => { const a = S.talleres.get(t.id); return a && t.tarjeta_hasta && a.tarjeta_hasta && t.tarjeta_hasta > a.tarjeta_hasta; });
  const pendiente = !aplicada || aplicada.fecha !== d.fecha_registro;
  const hay = altas.length || bajas.length || renovadas.length;
  box.innerHTML = `
    <div class="row-between"><h2 class="cap">Registro oficial de talleres</h2><span class="note">Revisión del ${esc(d.fecha_registro)}${aplicada ? ` · aplicada la del ${esc(aplicada.fecha)}` : ''}</span></div>
    ${hay ? `<div class="cifras mini">
      <div class="cifra ${altas.length ? 'verde' : ''}"><b>${fmtNum(altas.length)}</b><span>Altas</span><small>talleres nuevos para captar</small></div>
      <div class="cifra ${bajas.length ? 'alerta' : ''}"><b>${fmtNum(bajas.length)}</b><span>Bajas</span><small>ya no figuran</small></div>
      <div class="cifra"><b>${fmtNum(renovadas.length)}</b><span>Tarjetas renovadas</span></div>
    </div>
    ${altas.length ? `<details class="plegable"><summary>Ver altas</summary><ul class="lista-simple">${altas.slice(0, 80).map(t => `<li>${esc(t.nombre)} <span class="note">${esc(t.poblacion || '')} · ${esc(t.provincia || '')}</span></li>`).join('')}${altas.length > 80 ? `<li class="note">Y ${altas.length - 80} más</li>` : ''}</ul></details>` : ''}
    ${bajas.length ? `<details class="plegable"><summary>Ver bajas</summary><ul class="lista-simple">${bajas.slice(0, 80).map(t => `<li><button class="linklike" data-abrir="${esc(t.id)}">${esc(t.nombre)}</button> <span class="note">${esc(t.poblacion || '')} · ${t.estado ? esc(estadoInfo(t.estado).label) : 'sin clasificar'}</span></li>`).join('')}</ul></details>` : ''}
    <div class="btns"><button class="btn primary" id="regAplicar">Aplicar esta revisión</button></div>
    <p class="note">Las altas se añaden al mapa y las bajas se marcan como «no figura en el registro»; no se borra nada ni se tocan estados, notas ni visitas.</p>`
    : vacio(pendiente ? 'El mapa ya coincide con esta revisión.' : 'El mapa está al día con el registro.', 'Sin cambios', { ok: true, peq: true })}
    <p class="note" id="regMsg"></p>`;
  box.querySelectorAll('[data-abrir]').forEach(b => b.addEventListener('click', () => abrirTaller(b.dataset.abrir)));
  $('#regAplicar', box)?.addEventListener('click', async e => {
    e.target.disabled = true; $('#regMsg', box).innerHTML = cargandoHtml('Aplicando…');
    try {
      await aplicar();
      await S.api.upsertPor('ajustes', { clave: 'registro_aplicado', valor: { fecha: d.fecha_registro, altas: altas.length, bajas: bajas.length, aplicado: new Date().toISOString() } }, 'clave');
      S.ajustes.set('registro_aplicado', { clave: 'registro_aplicado', valor: { fecha: d.fecha_registro } });
      toast(`Registro aplicado: ${altas.length} altas, ${bajas.length} bajas`); renderRegistro(box, { aplicar });
    } catch (x) { $('#regMsg', box).textContent = x.message; e.target.disabled = false; }
  });
}
// Para el aviso en la pestaña Gestión
export function registroPendiente() {
  const ap = S.ajustes.get('registro_aplicado')?.valor?.fecha;
  return !!S.fechaRegistro && ap !== S.fechaRegistro;
}

// ------------------------------------------------------------------
// Talleres repetidos
// ------------------------------------------------------------------
export function buscarDuplicados() {
  const ign = new Set((S.dupIgnorados || []).map(x => [x.a, x.b].sort().join('|')));
  const ts = [...S.talleres.values()];
  const cif = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const pares = new Map();
  const anadir = (a, b, motivo) => { const k = [a.id, b.id].sort().join('|'); if (a.id === b.id || ign.has(k) || pares.has(k)) return; pares.set(k, { a, b, motivo }); };
  const porCif = new Map();
  for (const t of ts) { const c = cif(t.cif); if (c.length >= 8) { if (!porCif.has(c)) porCif.set(c, []); porCif.get(c).push(t); } }
  for (const g of porCif.values()) for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) if (g[i].cp === g[j].cp || !g[i].cp || !g[j].cp) anadir(g[i], g[j], 'Mismo CIF y código postal');
  const porCp = new Map();
  for (const t of ts) { const k = t.cp || normalizar(t.poblacion); if (!k) continue; if (!porCp.has(k)) porCp.set(k, []); porCp.get(k).push(t); }
  for (const g of porCp.values()) {
    if (g.length < 2) continue;
    const n = g.map(t => nucleo(t.nombre));
    for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) {
      const p = parecido(n[i], n[j]);
      if (p >= 0.72 && !(cif(g[i].cif) && cif(g[j].cif) && cif(g[i].cif) !== cif(g[j].cif))) anadir(g[i], g[j], p === 1 ? 'Mismo nombre y código postal' : `Nombre muy parecido (${Math.round(p * 100)} %) en el mismo código postal`);
    }
  }
  return [...pares.values()];
}
const peso = t => [...S.visitas.values()].filter(v => v.taller_id === t.id).length * 3 + [...S.ventas.values()].filter(v => v.taller_id === t.id).length * 3
  + (t.origen === 'reg' ? 4 : 0) + (t.estado ? 2 : 0) + (t.comercial_id ? 1 : 0) + (['exacta', 'manual'].includes(t.precision) ? 1 : 0);
export function renderDuplicados(box) {
  if (!box) return;
  const pares = buscarDuplicados();
  const lado = (t, der) => `<div class="lado${der ? ' der' : ''}"><b><button class="linklike" data-abrir="${esc(t.id)}">${esc(t.nombre)}</button></b><span>${esc(t.direccion || '')}${t.cp ? ' · ' + esc(t.cp) : ''} ${esc(t.poblacion || '')}</span><span>${t.cif ? 'CIF ' + esc(t.cif) + ' · ' : ''}${{ reg: 'Registro', ipq: 'Registro PT', kmz: 'Recopilatorio', manual: 'Añadido', import: 'Excel' }[t.origen] || ''}${t.estado ? ' · ' + esc(estadoInfo(t.estado).label) : ''}${t.comercial_id ? ' · ' + esc(nombreDe(t.comercial_id)) : ''}</span></div>`;
  box.innerHTML = `<div class="row-between"><h2 class="cap">Talleres repetidos</h2>${pares.length ? `<span class="note">${pares.length} posibles</span>` : ''}</div>
    ${pares.length ? `<p class="note">Al unir, las visitas, ventas, equipos, contactos y la unión con Cursos pasan al taller que se queda, y se rellenan los datos que le falten.</p>
    <div class="dup-lista">${pares.slice(0, 30).map(({ a, b, motivo }) => { const [x, y] = peso(a) >= peso(b) ? [a, b] : [b, a]; return `<div class="dup">
      ${lado(x)}<div class="medio">${esc(motivo)}</div>${lado(y, true)}
      <div class="acc-d"><button class="btn sm primary" data-unir="${esc(y.id)}" data-en="${esc(x.id)}">← Quedarse con el de la izquierda</button><button class="btn sm" data-unir="${esc(x.id)}" data-en="${esc(y.id)}">Quedarse con el de la derecha →</button><button class="btn sm" data-ign="${esc(x.id)}|${esc(y.id)}">No son el mismo</button></div></div>`; }).join('')}</div>`
    : vacio('No hay talleres con el mismo CIF o con el mismo nombre en el mismo código postal.', 'Ningún repetido', { ok: true, peq: true })}`;
  box.querySelectorAll('[data-abrir]').forEach(b => b.addEventListener('click', () => abrirTaller(b.dataset.abrir)));
  box.querySelectorAll('[data-ign]').forEach(b => b.addEventListener('click', async () => {
    const [a, c] = b.dataset.ign.split('|').sort();
    await S.api.upsertPor('duplicados_ignorados', { a, b: c }, 'a,b');
    S.dupIgnorados = [...(S.dupIgnorados || []), { a, b: c }]; renderDuplicados(box);
    toast('Marcados como distintos', '', { deshacer: async () => { await S.api.removePor('duplicados_ignorados', { a, b: c }); S.dupIgnorados = S.dupIgnorados.filter(x => !(x.a === a && x.b === c)); renderDuplicados(box); } });
  }));
  box.querySelectorAll('[data-unir]').forEach(b => b.addEventListener('click', async () => {
    if (b.dataset.armed !== '1') { b.dataset.armed = '1'; const o = b.textContent; b.textContent = 'Pulsa otra vez para unir'; setTimeout(() => { if (b.isConnected) { b.dataset.armed = ''; b.textContent = o; } }, 3000); return; }
    b.closest('.dup').classList.add('pend');
    try {
      await S.api.rpc('unir_talleres', { p_origen: b.dataset.unir, p_destino: b.dataset.en });
      const { cargarTodo } = await import('./store.js'); const { recargarCursos } = await import('./cursos.js');
      await cargarTodo(); await recargarCursos(); toast('Talleres unidos'); renderDuplicados(box);
    } catch (e) { toast(e.message, 'error'); b.closest('.dup').classList.remove('pend'); }
  }));
}

// ------------------------------------------------------------------
// Actividad reciente de todo el equipo
// ------------------------------------------------------------------
export async function renderActividad(box) {
  if (!box) return;
  box.innerHTML = `<h2 class="cap">Actividad reciente</h2>${cargandoHtml()}`;
  try {
    const filas = (await S.api.historial({ limite: 40 })).filter(h => !(h.tabla === 'talleres' && h.accion === 'alta' && !h.usuario));
    box.innerHTML = `<h2 class="cap">Actividad reciente</h2>${filas.length ? `<div class="timeline hist">${filas.map(h => { const t = S.talleres.get(h.taller_id); return `<div class="tl-i h-${h.accion}"><div class="tl-h"><b>${fechaHora(h.fecha)}</b>${t ? `<button class="linklike" data-abrir="${esc(t.id)}">${esc(t.nombre)}</button>` : ''}</div><p>${esc(textoHistorial(h))}</p></div>`; }).join('')}</div>`
      : vacio('Aquí verás quién cambia qué: estados, asignaciones, visitas, ventas…', 'Sin actividad todavía', { peq: true })}`;
    box.querySelectorAll('[data-abrir]').forEach(b => b.addEventListener('click', () => abrirTaller(b.dataset.abrir)));
  } catch (e) { box.innerHTML = `<h2 class="cap">Actividad reciente</h2>${vacio(e.message, 'No se pudo cargar')}`; }
}
