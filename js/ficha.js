// Ficha de un taller: resumen, contactos, visitas, ventas y equipos
import { S, on, emit, esAdmin, puedeEditar, nombreDe, colorDe, comerciales, guardar, crear, borrar, getRuta, setRuta, guardarConDeshacer, borrarConDeshacer } from './store.js';
import { $, $$, esc, ESTADOS, estadoInfo, redBadges, ORIGEN, PRECISION, TIPOS_VISITA, TIPOS_EQUIPO, fmtFecha, fmtFechaCorta, fmtEur, hoy, addDays, iniciales, toast, confirmBtn, diasDesde, estadoTarjeta, textoTarjeta, vacio, cargandoHtml, modal, RESULTADOS } from './util.js';
import { formacionDe, SITUACION, ENLACE_INSCRIPCION, enlaceEstadoTaller, vincular, desvincular, candidatos, nucleo, parecido, normalizar } from './cursos.js';
import { formulario } from './formulario.js';
import { volarA, colocarAMano } from './mapa.js';
import { buscarDireccion } from './geocodificar.js';

let actual = null, pestana = 'resumen', contactos = [], cargandoContactos = false;
const drawer = () => $('#ficha');

export function iniciarFicha() {
  on('abrir', ({ id, volar, tab }) => abrir(id, volar, tab));
  on('cambio', tablas => {
    if (!actual || drawer().hidden) return;
    if (!S.talleres.has(actual)) { cerrar(); return; }
    const activo = document.activeElement;
    if (activo && drawer().contains(activo) && ['TEXTAREA', 'INPUT'].includes(activo.tagName)) return; // no pisar lo que se está escribiendo
    if (tablas.some(t => ['talleres', 'visitas', 'ventas', 'equipos', 'perfiles', 'cursos'].includes(t))) render();
  });
  on('ruta:cambio', () => { if (actual && !drawer().hidden) render(); });
  drawer().addEventListener('click', e => {
    const tab = e.target.closest('[data-tab]'); if (tab) { pestana = tab.dataset.tab; render(); }
    if (e.target.closest('[data-cerrar]')) cerrar();
  });
}

export function abrir(id, volar, tab) {
  actual = id; pestana = tab || 'resumen'; contactos = []; cargandoContactos = false;
  drawer().hidden = false; document.body.classList.add('ficha-abierta');
  emit('seleccion', id);
  if (volar) volarA(S.talleres.get(id));
  render(); cargarContactos();
}
export function cerrar() { drawer().hidden = true; document.body.classList.remove('ficha-abierta'); actual = null; emit('seleccion', null); }

async function cargarContactos() {
  const id = actual; cargandoContactos = true;
  try { contactos = await S.api.list('contactos', { taller_id: id }); } catch (e) { contactos = []; }
  cargandoContactos = false; if (actual === id && pestana === 'contactos') render();
}

function render() {
  const t = S.talleres.get(actual); if (!t) return;
  const vis = [...S.visitas.values()].filter(v => v.taller_id === t.id);
  const ven = [...S.ventas.values()].filter(v => v.taller_id === t.id);
  const eq = [...S.equipos.values()].filter(v => v.taller_id === t.id);
  const fo = formacionDe(t.id);
  const tabs = [['resumen', 'Resumen'], ['formacion', 'Formación', fo ? fo.tecnicos.length : 0], ['contactos', 'Contactos', contactos.length], ['visitas', 'Visitas', vis.length], ['ventas', 'Ventas', ven.length], ['equipos', 'Equipos', eq.length], ['historial', 'Historial']];
  drawer().innerHTML = `
    <div class="ficha-head" style="--c:var(${estadoInfo(t.estado).v === '--st-none' ? '--linea-2' : estadoInfo(t.estado).v})">
      <div><div class="et"><span class="est-pill${t.estado ? '' : ' sin'}" style="--c:var(${estadoInfo(t.estado).v})"><i></i>${esc(estadoInfo(t.estado).label)}</span>${redBadges(t.redes)}${t.origen === 'kmz' ? ' <span class="badge src">No figura en el registro</span>' : ''}</div><h2 class="titulo">${esc(t.nombre)}</h2><p class="note">${esc(t.direccion || '')}${t.cp ? ' · ' + esc(t.cp) : ''} ${esc(t.poblacion || '')}${t.provincia && t.provincia !== t.poblacion ? ' (' + esc(t.provincia) + ')' : ''}</p></div>
      <button class="icon lg" data-cerrar aria-label="Cerrar ficha">×</button>
    </div>
    <div class="ftabs" role="tablist">${tabs.map(([k, l, n]) => `<button role="tab" data-tab="${k}" aria-selected="${k === pestana}">${l}${n ? `<span class="n">${n}</span>` : ''}</button>`).join('')}</div>
    <div class="ficha-body" id="fichaBody"></div>`;
  const body = $('#fichaBody');
  ({ resumen, formacion: pFormacion, contactos: pContactos, visitas: pVisitas, ventas: pVentas, equipos: pEquipos, historial: pHistorial })[pestana](body, t, { vis, ven, eq, fo });
}

// ------------------------------ Resumen ------------------------------
function resumen(body, t) {
  const edit = puedeEditar(t), admin = esAdmin();
  const q = encodeURIComponent(`${t.nombre}, ${t.direccion || ''}, ${t.cp || ''} ${t.poblacion || ''}`);
  const enRuta = getRuta().includes(t.id);
  const coms = comerciales();
  let comercialHtml;
  if (admin) comercialHtml = `<select id="fCom2"><option value="">Sin comercial</option>${coms.map(p => `<option value="${esc(p.id)}"${p.id === t.comercial_id ? ' selected' : ''}>${esc(p.nombre)}</option>`).join('')}</select>`;
  else if (t.comercial_id === S.yo.id) comercialHtml = `<span class="chip-p"><span class="avatar" style="background:${esc(colorDe(t.comercial_id))}">${esc(iniciales(nombreDe(t.comercial_id)))}</span>Tú</span>`;
  else comercialHtml = `<span class="chip-p"><span class="avatar" style="background:${esc(colorDe(t.comercial_id))}">${esc(iniciales(nombreDe(t.comercial_id)))}</span>${esc(nombreDe(t.comercial_id))}</span>`;
  const proxVisita = [...S.visitas.values()].filter(v => v.taller_id === t.id && v.estado === 'planificada' && v.fecha >= hoy()).sort((a, b) => a.fecha.localeCompare(b.fecha))[0];
  const dias = diasDesde(t.ultima_visita);
  body.innerHTML = `
    ${(() => { const k = estadoTarjeta(t).k; if (!['caducada', 'd30', 'd90'].includes(k)) return '';
      return `<p class="aviso ${k === 'caducada' ? 'tj-caducada' : ''}"><span><b>Tarjeta de taller:</b> según el registro oficial, ${esc(textoTarjeta(t))}. ${k === 'caducada' ? 'Comprueba si la ha renovado.' : 'Buen momento para contactar.'}</span></p>`; })()}
    ${(() => { const f = formacionDe(t.id); if (!f || !f.porRenovar) return '';
      return `<p class="aviso ${f.r.caducado ? 'tj-caducada' : ''}"><span><b>Formación:</b> ${f.porRenovar === 1 ? '1 técnico tiene' : f.porRenovar + ' técnicos tienen'} que renovar el adiestramiento${f.r.caducado ? ` (${f.r.caducado} ya ${f.r.caducado === 1 ? 'caducado' : 'caducados'})` : ''}. <button class="linklike" data-tab="formacion">Ver técnicos</button></span></p>`; })()}
    ${!edit ? `<p class="aviso info">Este taller es de ${esc(nombreDe(t.comercial_id) || 'otro comercial')}. Puedes consultarlo, pero solo lo edita su comercial o la dirección.</p>` : ''}
    <div class="kpis3">
      <div><span>Última visita</span><b>${t.ultima_visita ? fmtFechaCorta(t.ultima_visita) : '—'}</b>${dias != null ? `<small>hace ${dias} días</small>` : '<small>nunca</small>'}</div>
      <div><span>Próxima visita</span><b>${proxVisita ? fmtFechaCorta(proxVisita.fecha) : '—'}</b><small>${proxVisita ? esc(TIPOS_VISITA[proxVisita.tipo]) : 'sin planificar'}</small></div>
      <div><span>Ventas ganadas</span><b>${fmtEur([...S.ventas.values()].filter(v => v.taller_id === t.id && v.estado === 'ganado').reduce((a, v) => a + Number(v.importe || 0), 0))}</b><small>en total</small></div>
    </div>
    <div class="field"><span>Estado</span><div class="estados">${ESTADOS.map(e => `<button data-estado="${e.k}" aria-pressed="${(t.estado || '') === e.k}" style="--c:var(${e.v})" ${edit ? '' : 'disabled'}>${e.label}</button>`).join('')}</div></div>
    <div class="field"><span>Comercial</span>${comercialHtml}</div>
    <form id="datosForm" class="grid2">
      <label class="field"><span>Teléfono</span><input name="telefono" type="tel" value="${esc(t.telefono || '')}" ${edit ? '' : 'disabled'}></label>
      <label class="field"><span>Email</span><input name="email" type="email" value="${esc(t.email || '')}" ${edit ? '' : 'disabled'}></label>
      <label class="field full"><span>Web</span><input name="web" type="url" value="${esc(t.web || '')}" placeholder="https://" ${edit ? '' : 'disabled'}></label>
      <label class="field full"><span>Notas</span><textarea name="notas" placeholder="Equipos que usan, condiciones, cómo tratarles…" ${edit ? '' : 'disabled'}>${esc(t.notas || '')}</textarea></label>
      ${edit ? '<div class="btns full"><button class="btn" type="submit">Guardar datos</button></div>' : ''}
    </form>
    <div class="btns">
      <button class="btn primary" id="nuevaVisita" ${edit ? '' : 'disabled'}>Registrar visita</button>
      <button class="btn" id="rutaBtn">${enRuta ? 'Quitar de la ruta' : 'Añadir a la ruta'}</button>
      <a class="btn" href="https://www.google.com/maps/search/?api=1&query=${q}" target="_blank" rel="noopener">Ver en Google Maps</a>
      <a class="btn" href="https://www.google.com/maps/dir/?api=1&destination=${t.precision === 'exacta' || t.precision === 'manual' ? t.lat + ',' + t.lon : q}" target="_blank" rel="noopener">Cómo llegar</a>
      ${t.telefono ? `<a class="btn" href="tel:${esc(t.telefono.replace(/\s/g, ''))}">Llamar</a>` : ''}
      ${t.email ? `<a class="btn" href="mailto:${esc(t.email)}">Escribir</a>` : ''}
    </div>
    <div class="field"><span>Ubicación en el mapa</span>
      <p class="note">${esc(PRECISION[t.precision] || '')}${t.precision === 'cp' || t.precision === 'zona' || t.precision === 'loc' ? '. Puede estar a unos kilómetros de la dirección real.' : '.'}</p>
      ${edit ? `<div class="btns"><button class="btn" id="geoBtn">Buscar dirección exacta</button><button class="btn" id="manoBtn">Colocar a mano</button></div>` : ''}
    </div>
    <dl class="kv">
      ${t.cif ? `<dt>CIF/NIF</dt><dd>${esc(t.cif)}</dd>` : ''}
      <dt>Origen</dt><dd>${esc(ORIGEN[t.origen] || t.origen)}${t.origen === 'reg' && S.fechaRegistro ? ` a ${esc(S.fechaRegistro)}` : ''}</dd>
      ${t.tarjetas || t.tarjeta_hasta || admin ? `<dt>Tarjetas de taller</dt><dd>${t.tarjetas ? t.tarjetas + (t.tarjeta_hasta ? ', la última válida hasta el ' : '') : (t.tarjeta_hasta ? 'Válida hasta el ' : 'Sin dato')}${t.tarjeta_hasta ? fmtFecha(t.tarjeta_hasta) : ''}${admin ? ' <button class="linklike" id="tjEdit">Cambiar fecha</button>' : ''}</dd>` : ''}
      ${t.actualizado ? `<dt>Último cambio</dt><dd>${new Date(t.actualizado).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}${t.actualizado_por && nombreDe(t.actualizado_por) ? ' por ' + esc(nombreDe(t.actualizado_por)) : ''}</dd>` : ''}
    </dl>
    ${admin ? '<div class="btns"><button class="btn danger" id="borrarTaller">Eliminar taller</button></div>' : ''}`;

  $$('[data-estado]', body).forEach(b => b.addEventListener('click', () => guardarConDeshacer('talleres', t.id, { estado: b.dataset.estado }, `Estado: ${estadoInfo(b.dataset.estado).label}`)));
  $('#tjEdit', body)?.addEventListener('click', () => formulario({
    titulo: 'Fecha de la tarjeta de taller', textoGuardar: 'Guardar',
    campos: [{ k: 'tarjeta_hasta', label: 'Válida hasta', type: 'date' }], valores: { tarjeta_hasta: t.tarjeta_hasta || '' },
    extra: '<p class="note">Útil si el taller te dice que ya la ha renovado. Al cargar un registro oficial nuevo se volverá a tomar la fecha del registro.</p>',
    alGuardar: async d => { await guardar('talleres', t.id, { tarjeta_hasta: d.tarjeta_hasta || null }); toast('Fecha guardada'); }
  }));
  $('#fCom2', body)?.addEventListener('change', e => guardarConDeshacer('talleres', t.id, { comercial_id: e.target.value || null }, e.target.value ? `Asignado a ${nombreDe(e.target.value)}` : 'Taller sin comercial'));
  $('#datosForm', body).addEventListener('submit', async e => {
    e.preventDefault(); const f = e.target;
    await guardarConDeshacer('talleres', t.id, { telefono: f.telefono.value.trim() || null, email: f.email.value.trim() || null, web: f.web.value.trim() || null, notas: f.notas.value.trim() }, 'Datos guardados');
  });
  $('#nuevaVisita', body).addEventListener('click', () => formVisita(t));
  $('#rutaBtn', body).addEventListener('click', () => { const r = getRuta(); const i = r.indexOf(t.id); if (i >= 0) r.splice(i, 1); else r.push(t.id); setRuta(r); });
  $('#geoBtn', body)?.addEventListener('click', async e => {
    const b = e.target; b.disabled = true; b.textContent = 'Buscando…';
    try {
      const r = await buscarDireccion(t);
      if (!r) { toast('No encuentro esa dirección cerca. Prueba a colocarlo a mano.'); return; }
      await guardar('talleres', t.id, { lat: r.lat, lon: r.lon, precision: 'exacta' });
      volarA({ lat: r.lat, lon: r.lon }, 16); toast('Ubicación actualizada');
    } catch (err) { toast(err.message, 'error'); }
    finally { b.disabled = false; b.textContent = 'Buscar dirección exacta'; }
  });
  $('#manoBtn', body)?.addEventListener('click', () => {
    document.body.classList.add('colocando');
    colocarAMano(t, async (lat, lon) => { document.body.classList.remove('colocando'); await guardar('talleres', t.id, { lat, lon, precision: 'manual' }); toast('Ubicación guardada'); });
    $('#colocarNo').addEventListener('click', () => document.body.classList.remove('colocando'), { once: true });
  });
  const bt = $('#borrarTaller', body); if (bt) confirmBtn(bt, async () => { await borrar('talleres', t.id); toast('Taller eliminado'); cerrar(); }, 'Pulsa otra vez para eliminarlo');
}

// ------------------------------ Contactos ------------------------------
function pContactos(body, t) {
  const edit = puedeEditar(t);
  body.innerHTML = `${edit ? '<div class="btns"><button class="btn primary" id="addC">Añadir contacto</button></div>' : ''}
    <div class="cards">${cargandoContactos ? cargandoHtml('Cargando contactos…') : contactos.map(c => `
      <div class="card"><div class="card-h"><b>${esc(c.nombre)}</b>${c.cargo ? `<span class="note">${esc(c.cargo)}</span>` : ''}</div>
        <div class="btns sm">${c.telefono ? `<a class="btn" href="tel:${esc(c.telefono.replace(/\s/g, ''))}">${esc(c.telefono)}</a>` : ''}${c.email ? `<a class="btn" href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : ''}</div>
        ${c.notas ? `<p class="note">${esc(c.notas)}</p>` : ''}
        ${edit ? `<div class="btns sm"><button class="btn" data-editc="${esc(c.id)}">Editar</button><button class="btn danger" data-delc="${esc(c.id)}">Eliminar</button></div>` : ''}
      </div>`).join('') || vacio('Añade al jefe de taller o a quien decide las compras.', 'Aún no hay contactos')}</div>`;
  const campos = [{ k: 'nombre', label: 'Nombre', required: true }, { k: 'cargo', label: 'Cargo' }, { k: 'telefono', label: 'Teléfono', type: 'tel' }, { k: 'email', label: 'Email', type: 'email' }, { k: 'notas', label: 'Notas', type: 'textarea' }];
  $('#addC', body)?.addEventListener('click', () => formulario({ titulo: 'Nuevo contacto', campos, alGuardar: async d => { const r = await S.api.insert('contactos', { ...d, taller_id: t.id }); contactos.push(r); render(); } }));
  $$('[data-editc]', body).forEach(b => b.addEventListener('click', () => {
    const c = contactos.find(x => x.id === b.dataset.editc);
    formulario({ titulo: 'Editar contacto', campos, valores: c, alGuardar: async d => { const r = await S.api.update('contactos', c.id, d); Object.assign(c, r); render(); } });
  }));
  $$('[data-delc]', body).forEach(b => confirmBtn(b, async () => {
    const c = contactos.find(x => x.id === b.dataset.delc);
    try { await S.api.remove('contactos', c.id); contactos = contactos.filter(x => x.id !== c.id); render();
      toast('Contacto eliminado', '', { deshacer: async () => { const r = await S.api.insert('contactos', c); contactos.push(r); if (actual === t.id) render(); } });
    } catch (e) { toast(e.message, 'error'); } }));
}

// ------------------------------ Visitas ------------------------------
// Informe de visita rápido: se rellena con toques, pensado para el móvil al salir del taller.
const SEGUIMIENTO = [['', 'No'], ['7', '1 semana'], ['14', '2 semanas'], ['30', '1 mes'], ['90', '3 meses']];
export function formVisita(t, v = null, preset = {}) {
  const admin = esAdmin();
  const d0 = { fecha: hoy(), hora: '', tipo: 'visita', estado: 'hecha', resultado: '', resumen: '', proximo_paso: '', comercial_id: t.comercial_id || S.yo.id, ...preset, ...(v || {}), ...(v ? preset : {}) };
  const seg = (nombre, opciones, valor) => `<div class="seg" role="radiogroup" data-seg="${nombre}">${opciones.map(([k, l]) => `<button type="button" role="radio" data-v="${esc(k)}" aria-checked="${String(k) === String(valor ?? '')}">${esc(l)}</button>`).join('')}</div>`;
  const { el, close } = modal(`<form class="form visita-rapida">
    <div class="modal-head"><div><h3>${v ? 'Editar visita' : esc(t.nombre)}</h3>${v ? '' : `<p class="note">${esc(t.poblacion || '')}${t.provincia && t.provincia !== t.poblacion ? ' · ' + esc(t.provincia) : ''}</p>`}</div><button type="button" class="icon" data-close aria-label="Cerrar">×</button></div>
    ${seg('estado', v ? [['hecha', 'Hecha'], ['planificada', 'Planificada'], ['cancelada', 'Cancelada']] : [['hecha', 'Ya la he hecho'], ['planificada', 'La planifico']], d0.estado)}
    ${seg('tipo', Object.entries(TIPOS_VISITA), d0.tipo)}
    <div class="grid2"><label class="field"><span>Fecha</span><input type="date" name="fecha" value="${esc(d0.fecha)}" required></label><label class="field"><span>Hora</span><input type="time" name="hora" value="${esc((d0.hora || '').slice(0, 5))}"></label></div>
    <div class="solo-hecha"><div class="field"><span>¿Cómo ha ido?</span>${seg('resultado', Object.entries(RESULTADOS), d0.resultado)}</div></div>
    <label class="field"><span class="solo-hecha">Qué se habló</span><span class="solo-plan">Motivo de la cita</span><textarea name="resumen" maxlength="2000" placeholder="Lo importante en dos líneas">${esc(d0.resumen)}</textarea></label>
    <label class="field solo-hecha"><span>Próximo paso</span><input name="proximo_paso" maxlength="300" value="${esc(d0.proximo_paso)}" placeholder="Ej. enviar presupuesto del banco de pruebas"></label>
    ${v ? '' : `<div class="field solo-hecha"><span>Volver a contactar en</span>${seg('seguimiento', SEGUIMIENTO, '30')}</div>`}
    ${admin ? `<label class="field"><span>Comercial</span><select name="comercial_id">${comerciales().map(p => `<option value="${esc(p.id)}"${p.id === d0.comercial_id ? ' selected' : ''}>${esc(p.nombre)}</option>`).join('')}</select></label>` : ''}
    <label class="note chk solo-venta" hidden><input type="checkbox" name="conVenta" checked> Anotar también el presupuesto o pedido al guardar</label>
    <p class="note err" hidden></p>
    <div class="btns end"><button type="button" class="btn" data-close>Cancelar</button><button type="submit" class="btn primary">${v ? 'Guardar' : 'Registrar'}</button></div>
  </form>`);
  const f = el.querySelector('form'); const val = n => f.querySelector(`[data-seg="${n}"] [aria-checked="true"]`)?.dataset.v ?? '';
  const pintar = () => {
    const hecha = val('estado') === 'hecha';
    f.querySelectorAll('.solo-hecha').forEach(x => { x.hidden = !hecha; });
    f.querySelectorAll('.solo-plan').forEach(x => { x.hidden = hecha; });
    const r = val('resultado'); f.querySelector('.solo-venta').hidden = v || !hecha || !['presupuesto', 'pedido'].includes(r);
  };
  f.addEventListener('click', e => {
    const b = e.target.closest('.seg [role=radio]'); if (!b) return;
    const g = b.parentElement, ya = b.getAttribute('aria-checked') === 'true';
    g.querySelectorAll('[role=radio]').forEach(x => x.setAttribute('aria-checked', 'false'));
    if (!(ya && g.dataset.seg === 'resultado')) b.setAttribute('aria-checked', 'true');
    if (g.dataset.seg === 'estado' && b.dataset.v === 'planificada' && f.fecha.value <= hoy() && !v) f.fecha.value = addDays(hoy(), 7);
    if (g.dataset.seg === 'estado' && b.dataset.v === 'hecha' && f.fecha.value > hoy()) f.fecha.value = hoy();
    pintar();
  });
  pintar();
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const estado = val('estado') || 'hecha', hecha = estado === 'hecha';
    const d = { fecha: f.fecha.value, hora: f.hora.value || null, tipo: val('tipo') || 'visita', estado,
      resultado: hecha ? val('resultado') : '', resumen: f.resumen.value.trim(), proximo_paso: hecha ? f.proximo_paso.value.trim() : '',
      comercial_id: admin ? f.comercial_id.value : (v?.comercial_id || S.yo.id) };
    const btn = f.querySelector('[type=submit]'); btn.disabled = true;
    try {
      if (v) { await guardarConDeshacer('visitas', v.id, d, 'Visita guardada'); close(); return; }
      await crear('visitas', { ...d, taller_id: t.id });
      const dias = hecha ? val('seguimiento') : '';
      if (dias) await crear('visitas', { taller_id: t.id, comercial_id: d.comercial_id, fecha: addDays(d.fecha, +dias), tipo: 'visita', estado: 'planificada', resumen: d.proximo_paso || 'Seguimiento', proximo_paso: '', resultado: '' });
      const venta = !f.querySelector('.solo-venta').hidden && f.conVenta.checked ? d.resultado : null;
      close();
      toast(hecha ? `Visita registrada${dias ? ` · seguimiento el ${fmtFechaCorta(addDays(d.fecha, +dias))}` : ''}` : `Visita planificada para el ${fmtFechaCorta(d.fecha)}`);
      if (venta) formVenta(t, { tipo: venta, estado: venta === 'pedido' ? 'ganado' : 'abierto', concepto: d.proximo_paso || '' });
    } catch (err) { const p = f.querySelector('.err'); p.hidden = false; p.textContent = err.message; btn.disabled = false; }
  });
}
function pVisitas(body, t, { vis }) {
  const edit = puedeEditar(t);
  const orden = vis.slice().sort((a, b) => (a.estado === 'planificada' ? 0 : 1) - (b.estado === 'planificada' ? 0 : 1) || (a.estado === 'planificada' ? a.fecha.localeCompare(b.fecha) : b.fecha.localeCompare(a.fecha)));
  body.innerHTML = `${edit ? '<div class="btns"><button class="btn primary" id="addV">Registrar visita</button><button class="btn" id="planV">Planificar visita</button></div>' : ''}
    <div class="timeline">${orden.map(v => {
      const mia = esAdmin() || v.comercial_id === S.yo.id || v.creado_por === S.yo.id;
      return `<div class="tl-i ${v.estado}">
        <div class="tl-h"><b>${fmtFecha(v.fecha)}${v.hora ? ' · ' + v.hora.slice(0, 5) : ''}</b><span class="pill ${v.estado}">${v.estado === 'planificada' ? 'Planificada' : v.estado === 'hecha' ? 'Hecha' : 'Cancelada'}</span>${v.resultado ? `<span class="pill res-${esc(v.resultado)}">${esc(RESULTADOS[v.resultado] || '')}</span>` : ''}<span class="note">${esc(TIPOS_VISITA[v.tipo] || '')} · ${esc(nombreDe(v.comercial_id) || 'Sin comercial')}</span></div>
        ${v.resumen ? `<p>${esc(v.resumen)}</p>` : ''}${v.proximo_paso ? `<p class="note">Próximo paso: ${esc(v.proximo_paso)}</p>` : ''}
        ${mia ? `<div class="btns sm">${v.estado === 'planificada' ? `<button class="btn primary" data-hecha="${esc(v.id)}">Marcar como hecha</button>` : ''}<button class="btn" data-editv="${esc(v.id)}">Editar</button><button class="btn danger" data-delv="${esc(v.id)}">Eliminar</button></div>` : ''}
      </div>`;
    }).join('') || vacio('Registra la primera visita o llamada para empezar su historial.', 'Todavía no hay visitas')}</div>`;
  $('#addV', body)?.addEventListener('click', () => formVisita(t));
  $('#planV', body)?.addEventListener('click', () => formVisita(t, null, { estado: 'planificada', fecha: addDays(hoy(), 7) }));
  $$('[data-editv]', body).forEach(b => b.addEventListener('click', () => formVisita(t, S.visitas.get(b.dataset.editv))));
  $$('[data-hecha]', body).forEach(b => b.addEventListener('click', () => formVisita(t, S.visitas.get(b.dataset.hecha), { estado: 'hecha', fecha: hoy() })));
  $$('[data-delv]', body).forEach(b => confirmBtn(b, () => borrarConDeshacer('visitas', b.dataset.delv, 'Visita eliminada')));
}

// ------------------------------ Ventas ------------------------------
const camposVenta = () => [
    { k: 'fecha', label: 'Fecha', type: 'date', required: true, def: hoy() },
    { k: 'tipo', label: 'Tipo', type: 'select', options: [['presupuesto', 'Presupuesto'], ['pedido', 'Pedido']] },
    { k: 'concepto', label: 'Concepto', required: true, full: true, placeholder: 'Ej. Banco de pruebas de tacógrafos' },
    { k: 'importe', label: 'Importe (€, sin IVA)', type: 'number' },
    { k: 'estado', label: 'Estado', type: 'select', options: [['abierto', 'Abierto'], ['ganado', 'Ganado'], ['perdido', 'Perdido']] },
    { k: 'notas', label: 'Notas', type: 'textarea' }
  ];
export function formVenta(t, valores = {}) {
  formulario({ titulo: 'Nuevo presupuesto o pedido', campos: camposVenta(), valores, alGuardar: async d => { await crear('ventas', { ...d, taller_id: t.id, comercial_id: t.comercial_id || S.yo.id }); toast('Guardado'); } });
}
function pVentas(body, t, { ven }) {
  const edit = puedeEditar(t);
  const tot = e => ven.filter(v => v.estado === e).reduce((a, v) => a + Number(v.importe || 0), 0);
  const campos = camposVenta();

  body.innerHTML = `
    <div class="kpis3"><div><span>Abierto</span><b>${fmtEur(tot('abierto'))}</b></div><div><span>Ganado</span><b>${fmtEur(tot('ganado'))}</b></div><div><span>Perdido</span><b>${fmtEur(tot('perdido'))}</b></div></div>
    ${edit ? '<div class="btns"><button class="btn primary" id="addS">Nuevo presupuesto o pedido</button></div>' : ''}
    <div class="tablewrap"><table><thead><tr><th>Fecha</th><th>Concepto</th><th class="n">Importe</th><th>Estado</th><th></th></tr></thead><tbody>
    ${ven.sort((a, b) => b.fecha.localeCompare(a.fecha)).map(v => `<tr><td>${fmtFechaCorta(v.fecha)}</td><td>${esc(v.concepto)}<div class="note">${v.tipo === 'pedido' ? 'Pedido' : 'Presupuesto'} · ${esc(nombreDe(v.comercial_id) || '')}</div></td><td class="n">${fmtEur(v.importe)}</td><td><span class="pill ${v.estado}">${v.estado === 'abierto' ? 'Abierto' : v.estado === 'ganado' ? 'Ganado' : 'Perdido'}</span></td>
      <td>${edit ? `<button class="icon" data-edits="${esc(v.id)}" aria-label="Editar">✎</button>` : ''}</td></tr>`).join('') || `<tr><td colspan="5">${vacio('Anota aquí los presupuestos y pedidos de este taller.', 'Sin presupuestos ni pedidos')}</td></tr>`}
    </tbody></table></div>`;
  $('#addS', body)?.addEventListener('click', () => formVenta(t));
  $$('[data-edits]', body).forEach(b => b.addEventListener('click', () => {
    const v = S.ventas.get(b.dataset.edits);
    const { el } = formulario({ titulo: 'Editar', campos, valores: v, alGuardar: d => guardar('ventas', v.id, d), extra: '<div class="btns"><button type="button" class="btn danger" id="delS">Eliminar</button></div>' });
    confirmBtn(el.querySelector('#delS'), async () => { el.parentElement.hidden = true; el.parentElement.innerHTML = ''; await borrarConDeshacer('ventas', v.id, 'Presupuesto eliminado'); });
  }));
}

// ------------------------------ Equipos ------------------------------
function pEquipos(body, t, { eq }) {
  const edit = puedeEditar(t);
  const campos = [
    { k: 'tipo', label: 'Tipo de equipo', type: 'select', options: TIPOS_EQUIPO.map(x => [x, x]), required: true },
    { k: 'marca', label: 'Marca' }, { k: 'modelo', label: 'Modelo' }, { k: 'n_serie', label: 'Nº de serie' },
    { k: 'fecha_venta', label: 'Fecha de venta o instalación', type: 'date' },
    { k: 'proxima_revision', label: 'Próxima revisión o calibración', type: 'date' },
    { k: 'notas', label: 'Notas', type: 'textarea' }
  ];
  const h = hoy(), lim = addDays(h, 60);
  body.innerHTML = `${edit ? '<div class="btns"><button class="btn primary" id="addE">Añadir equipo</button></div>' : ''}
    <div class="cards">${eq.sort((a, b) => String(a.proxima_revision || '9').localeCompare(String(b.proxima_revision || '9'))).map(e => {
      const venc = e.proxima_revision && e.proxima_revision < h, pronto = e.proxima_revision && !venc && e.proxima_revision <= lim;
      return `<div class="card"><div class="card-h"><b>${esc(e.tipo)}</b><span class="note">${esc([e.marca, e.modelo].filter(Boolean).join(' '))}</span></div>
        <div class="note">${e.n_serie ? 'Nº ' + esc(e.n_serie) + ' · ' : ''}${e.fecha_venta ? 'Desde ' + fmtFechaCorta(e.fecha_venta) : ''}</div>
        ${e.proxima_revision ? `<div><span class="pill ${venc ? 'perdido' : pronto ? 'planificada' : 'hecha'}">${venc ? 'Revisión vencida' : pronto ? 'Revisión pronto' : 'Revisión'}: ${fmtFecha(e.proxima_revision)}</span></div>` : ''}
        ${e.notas ? `<p class="note">${esc(e.notas)}</p>` : ''}
        ${edit ? `<div class="btns sm"><button class="btn" data-edite="${esc(e.id)}">Editar</button><button class="btn danger" data-dele="${esc(e.id)}">Eliminar</button></div>` : ''}</div>`;
    }).join('') || vacio('Anota los que le habéis vendido para que la agenda os avise de sus revisiones.', 'No hay equipos registrados')}</div>`;
  $('#addE', body)?.addEventListener('click', () => formulario({ titulo: 'Nuevo equipo', campos, alGuardar: async d => { await crear('equipos', { ...d, taller_id: t.id }); toast('Equipo añadido'); } }));
  $$('[data-edite]', body).forEach(b => b.addEventListener('click', () => { const e = S.equipos.get(b.dataset.edite); formulario({ titulo: 'Editar equipo', campos, valores: e, alGuardar: d => guardar('equipos', e.id, d) }); }));
  $$('[data-dele]', body).forEach(b => confirmBtn(b, () => borrarConDeshacer('equipos', b.dataset.dele, 'Equipo eliminado')));
}

// ------------------------------ Formación (datos de Cursos) ------------------------------
function pFormacion(body, t, { fo }) {
  const admin = esAdmin();
  if (!fo) {
    const sync = S.ajustes.get('cursos_sync');
    body.innerHTML = vacio(sync ? 'Ningún técnico de este taller se ha inscrito en los cursos de adiestramiento, o todavía no se ha unido con su ficha de Cursos.' : 'Todavía no se han traído los datos de Cursos. La dirección puede hacerlo desde Gestión.', 'Sin datos de formación')
      + (admin && S.centros.size ? `<div class="btns" style="justify-content:center"><button class="btn primary" id="unirCentro">Unir con un taller de Cursos</button></div>` : '')
      + `<div class="btns" style="justify-content:center"><a class="btn" href="${ENLACE_INSCRIPCION}" target="_blank" rel="noopener">Formulario de inscripción</a><button class="btn" id="copiaInsc">Copiar enlace de inscripción</button></div>`;
    $('#unirCentro', body)?.addEventListener('click', () => elegirCentro(t));
    $('#copiaInsc', body)?.addEventListener('click', () => copiar(ENLACE_INSCRIPCION, 'Enlace de inscripción copiado'));
    return;
  }
  const { r, tecnicos, centros } = fo;
  const c0 = centros[0];
  const fila = x => {
    const sit = SITUACION[x.situacion];
    const det = x.situacion === 'inscrito' ? `Próximo curso el ${fmtFecha(x.proximo_curso)}`
      : x.situacion === 'sin_formacion' ? 'Inscrito alguna vez, sin curso terminado'
      : `${x.ultimo_tipo === 'iniciacion' ? 'Iniciación' : 'Actualización'} el ${fmtFecha(x.ultima_fecha)} · ${x.situacion === 'caducado' ? 'caducó' : 'renovar antes del'} ${fmtFecha(x.renovar_antes)}`;
    return `<div class="tec"><span class="tec-av ${sit.cls}">${esc(iniciales(x.nombre))}</span><div class="grow"><b>${esc(x.nombre)}</b><div class="note">${esc(det)}${x.sin_avisos ? ' · sin avisos' : ''}</div></div><span class="pill sit-${sit.cls}">${sit.label}</span></div>`;
  };
  const datosCursos = centros.filter(c => c.contacto || c.telefono || c.email);
  body.innerHTML = `
    <div class="kpis3 kpis4">
      <div class="${r.caducado ? 'mal' : ''}"><span>Caducados</span><b>${r.caducado}</b></div>
      <div class="${r.vence_pronto ? 'aviso-k' : ''}"><span>Vencen pronto</span><b>${r.vence_pronto}</b></div>
      <div><span>Inscritos</span><b>${r.inscrito}</b></div>
      <div class="bien"><span>Al día</span><b>${r.al_dia}</b></div>
    </div>
    <div class="btns">
      ${c0?.token ? `<a class="btn primary" href="${esc(enlaceEstadoTaller(c0.token))}" target="_blank" rel="noopener">Estado de sus técnicos</a><button class="btn" id="copiaEstado">Copiar enlace para el taller</button>` : ''}
      <a class="btn" href="${ENLACE_INSCRIPCION}" target="_blank" rel="noopener">Formulario de inscripción</a>
    </div>
    <div class="tecs">${tecnicos.map(fila).join('') || vacio('Su ficha de Cursos no tiene técnicos.', '', { peq: true })}</div>
    ${datosCursos.length ? `<div class="card"><div class="card-h"><b>Datos que dejó en Cursos</b></div>${datosCursos.map(c => `
      <dl class="kv sin-linea">${c.contacto ? `<dt>Contacto</dt><dd>${esc(c.contacto)}</dd>` : ''}${c.telefono ? `<dt>Teléfono</dt><dd><a href="tel:${esc(c.telefono.replace(/\s/g, ''))}">${esc(c.telefono)}</a></dd>` : ''}${c.email ? `<dt>Correo</dt><dd><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></dd>` : ''}</dl>
      ${puedeEditar(t) && ((c.telefono && !t.telefono) || (c.email && !t.email) || c.contacto) ? `<div class="btns sm"><button class="btn" data-pasar="${esc(c.id)}">Pasar a la ficha del taller</button></div>` : ''}`).join('')}</div>` : ''}
    <p class="note">Datos de la plataforma de Cursos${(v => v ? `, copiados el ${new Date(v.fecha).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}` : '')(S.ajustes.get('cursos_sync')?.valor)}. Unido con «${esc(centros.map(c => c.nombre).join('», «'))}»${(() => { const m = centros.map(c => S.vinculos.get(c.id)?.metodo); return m.includes('auto') ? ' automáticamente' : ''; })()}.
      ${admin ? ` <button class="linklike" id="otroCentro">Unir otro</button> · <button class="linklike" id="quitarUnion">No es este taller</button>` : ''}</p>`;
  $('#copiaEstado', body)?.addEventListener('click', () => copiar(enlaceEstadoTaller(c0.token), 'Enlace copiado: el taller ve sus técnicos y cuándo renovar'));
  $('#otroCentro', body)?.addEventListener('click', () => elegirCentro(t));
  $('#quitarUnion', body)?.addEventListener('click', async () => {
    for (const c of centros) await vincular(c.id, null);
    toast('Unión quitada', '', { deshacer: async () => { for (const c of centros) await vincular(c.id, t.id, 'manual'); } });
  });
  $$('[data-pasar]', body).forEach(b => b.addEventListener('click', async () => {
    const c = S.centros.get(b.dataset.pasar); const patch = {};
    if (c.telefono && !t.telefono) patch.telefono = c.telefono;
    if (c.email && !t.email) patch.email = c.email;
    if (Object.keys(patch).length) await guardarConDeshacer('talleres', t.id, patch, 'Datos de Cursos pasados a la ficha');
    if (c.contacto && !contactos.some(x => normalizar(x.nombre) === normalizar(c.contacto))) {
      try { const r = await S.api.insert('contactos', { taller_id: t.id, nombre: c.contacto, telefono: c.telefono || null, email: c.email || null, notas: 'Contacto que figura en Cursos' }); contactos.push(r); } catch (e) { toast(e.message, 'error'); }
    }
    render();
  }));
}

async function copiar(texto, msg) {
  try { await navigator.clipboard.writeText(texto); toast(msg); } catch (e) { prompt('Copia este enlace:', texto); }
}

// La dirección elige a mano qué ficha de Cursos es este taller
function elegirCentro(t) {
  const libres = [...S.centros.values()].filter(c => { const v = S.vinculos.get(c.id); return !v || v.metodo === 'descartado'; });
  const n = nucleo(t.nombre);
  const puntua = c => parecido(n, nucleo(c.nombre)) + (normalizar(c.provincia) === normalizar(t.provincia) ? .25 : 0);
  const { el, close } = modal(`<div class="modal-head"><h3>¿Cuál es en Cursos?</h3><button class="icon" data-close aria-label="Cerrar">×</button></div>
    <p class="note">Elige la ficha de Cursos de <b>${esc(t.nombre)}</b>. Sus técnicos aparecerán en la pestaña Formación.</p>
    <input class="search" id="qCentro" placeholder="Buscar en Cursos" value="">
    <div class="pick" id="pickC"></div>`);
  const pintar = () => {
    const q = normalizar(el.querySelector('#qCentro').value);
    const lista = libres.filter(c => !q || normalizar(c.nombre).includes(q)).map(c => ({ c, p: puntua(c) })).sort((a, b) => b.p - a.p).slice(0, 30);
    el.querySelector('#pickC').innerHTML = lista.map(({ c }) => `<button class="pick-i" data-c="${esc(c.id)}"><b>${esc(c.nombre)}</b><span class="note">${esc(c.provincia || 'Sin provincia')} · ${(S.tecnicos.get(c.id) || []).length} técnicos</span></button>`).join('') || vacio('No queda ninguna ficha de Cursos sin unir que se parezca.', '', { peq: true });
  };
  el.querySelector('#qCentro').addEventListener('input', pintar); pintar();
  el.addEventListener('click', async e => {
    const b = e.target.closest('[data-c]'); if (!b) return;
    await vincular(b.dataset.c, t.id, 'manual'); close(); toast('Unido con su ficha de Cursos');
  });
}

// ------------------------------ Historial ------------------------------
const CAMPOS = { estado: 'estado', comercial_id: 'comercial', telefono: 'teléfono', email: 'correo', web: 'web', notas: 'notas', nombre: 'nombre', direccion: 'dirección', lat: 'ubicación', lon: null, precision: null,
  tarjeta_hasta: 'tarjeta de taller', tarjetas: null, en_registro: 'registro oficial', redes: 'redes', cif: 'CIF', fecha: 'fecha', hora: 'hora', tipo: 'tipo', resumen: 'resumen', proximo_paso: 'próximo paso',
  resultado: 'resultado', importe: 'importe', concepto: 'concepto', marca: 'marca', modelo: 'modelo', n_serie: 'nº de serie', proxima_revision: 'próxima revisión', cargo: 'cargo', taller_id: 'taller' };
const QUE = { talleres: 'el taller', visitas: 'una visita', ventas: 'un presupuesto o pedido', equipos: 'un equipo', contactos: 'un contacto' };
function valorTxt(k, v) {
  if (k === 'estado' && (v == null || v === '')) return 'Sin clasificar';
  if (k === 'comercial_id' && !v) return 'sin comercial';
  if (v == null || v === '') return '—';
  if (k === 'estado' && typeof v === 'string' && estadoInfo(v).k === v) return estadoInfo(v).label;
  if (k === 'comercial_id') return nombreDe(v) || 'otro usuario';
  if (k === 'resultado') return RESULTADOS[v] || v;
  if (k === 'importe') return fmtEur(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(v))) return fmtFecha(v);
  if (Array.isArray(v)) return v.join(', ') || '—';
  const t = String(v); return t.length > 60 ? t.slice(0, 57) + '…' : t;
}
export function textoHistorial(h) {
  const tu = h.usuario === S.yo.id;
  const quien = h.usuario ? (tu ? 'Tú' : nombreDe(h.usuario) || 'Otro usuario') : 'El sistema';
  const v = (el, tu2) => tu ? tu2 : el;
  if (h.accion === 'alta') return `${quien} ${h.tabla === 'talleres' ? v('dio', 'diste') + ' de alta el taller' : `${v('añadió', 'añadiste')} ${QUE[h.tabla]}`}${h.tabla === 'visitas' && h.despues ? ` (${(h.despues.estado === 'planificada' ? 'planificada' : 'hecha')} el ${fmtFecha(h.despues.fecha)})` : h.despues?.concepto ? ` (${h.despues.concepto})` : h.despues?.nombre && h.tabla !== 'talleres' ? ` (${h.despues.nombre})` : ''}`;
  if (h.accion === 'baja') return `${quien} ${v('eliminó', 'eliminaste')} ${QUE[h.tabla]}${h.antes?.concepto ? ` (${h.antes.concepto})` : h.antes?.nombre ? ` (${h.antes.nombre})` : h.antes?.fecha ? ` del ${fmtFecha(h.antes.fecha)}` : ''}`;
  const cambios = Object.keys(h.despues || {}).filter(k => CAMPOS[k] !== null);
  const det = cambios.map(k => k === 'lat' ? 'la ubicación en el mapa' : k === 'notas' || k === 'resumen' ? `${CAMPOS[k] || k}` : `${CAMPOS[k] || k}: ${valorTxt(k, h.antes?.[k])} → ${valorTxt(k, h.despues[k])}`);
  return `${quien} ${v('cambió', 'cambiaste')} ${h.tabla === 'talleres' ? '' : QUE[h.tabla] + ' · '}${det.join(' · ') || 'datos internos'}`;
}
function pHistorial(body, t) {
  body.innerHTML = cargandoHtml('Cargando historial…');
  S.api.historial({ taller_id: t.id, limite: 100 }).then(filas => {
    if (actual !== t.id || pestana !== 'historial') return;
    body.innerHTML = filas.length ? `<div class="timeline hist">${filas.map(h => `<div class="tl-i h-${h.accion}"><div class="tl-h"><b>${new Date(h.fecha).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })}</b></div><p>${esc(textoHistorial(h))}</p></div>`).join('')}</div>`
      : vacio('Aquí quedará anotado quién cambia qué en este taller.', 'Sin cambios todavía');
  }).catch(e => { body.innerHTML = vacio(e.message, 'No se pudo cargar el historial'); });
}
