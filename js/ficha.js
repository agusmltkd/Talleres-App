// Ficha de un taller: resumen, contactos, visitas, ventas y equipos
import { S, on, emit, esAdmin, puedeEditar, nombreDe, colorDe, comerciales, guardar, crear, borrar, getRuta, setRuta } from './store.js';
import { $, $$, esc, ESTADOS, estadoInfo, redBadges, ORIGEN, PRECISION, TIPOS_VISITA, TIPOS_EQUIPO, fmtFecha, fmtFechaCorta, fmtEur, hoy, addDays, iniciales, toast, confirmBtn, diasDesde, estadoTarjeta, textoTarjeta } from './util.js';
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
    if (tablas.some(t => ['talleres', 'visitas', 'ventas', 'equipos', 'perfiles'].includes(t))) render();
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
  const tabs = [['resumen', 'Resumen'], ['contactos', 'Contactos', contactos.length], ['visitas', 'Visitas', vis.length], ['ventas', 'Ventas', ven.length], ['equipos', 'Equipos', eq.length]];
  drawer().innerHTML = `
    <div class="ficha-head">
      <div><h2 class="titulo">${esc(t.nombre)}</h2><p class="note">${esc(t.direccion || '')}${t.cp ? ' · ' + esc(t.cp) : ''} ${esc(t.poblacion || '')}${t.provincia && t.provincia !== t.poblacion ? ' (' + esc(t.provincia) + ')' : ''}</p></div>
      <button class="icon lg" data-cerrar aria-label="Cerrar ficha">×</button>
    </div>
    <div class="ftabs" role="tablist">${tabs.map(([k, l, n]) => `<button role="tab" data-tab="${k}" aria-selected="${k === pestana}">${l}${n ? `<span class="n">${n}</span>` : ''}</button>`).join('')}</div>
    <div class="ficha-body" id="fichaBody"></div>`;
  const body = $('#fichaBody');
  ({ resumen, contactos: pContactos, visitas: pVisitas, ventas: pVentas, equipos: pEquipos })[pestana](body, t, { vis, ven, eq });
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
    <div class="chips">${redBadges(t.redes) || '<span class="note">Sin red de marca conocida</span>'}${t.origen === 'kmz' ? ' <span class="badge src">No figura en el registro</span>' : ''}</div>
    ${(() => { const k = estadoTarjeta(t).k; if (!['caducada', 'd30', 'd90'].includes(k)) return '';
      return `<p class="aviso ${k === 'caducada' ? 'tj-caducada' : ''}"><span><b>Tarjeta de taller:</b> según el registro oficial, ${esc(textoTarjeta(t))}. ${k === 'caducada' ? 'Comprueba si la ha renovado.' : 'Buen momento para contactar.'}</span></p>`; })()}
    ${!edit ? `<p class="aviso">Este taller es de ${esc(nombreDe(t.comercial_id) || 'otro comercial')}. Puedes consultarlo, pero solo lo edita su comercial o la dirección.</p>` : ''}
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

  $$('[data-estado]', body).forEach(b => b.addEventListener('click', () => guardar('talleres', t.id, { estado: b.dataset.estado })));
  $('#tjEdit', body)?.addEventListener('click', () => formulario({
    titulo: 'Fecha de la tarjeta de taller', textoGuardar: 'Guardar',
    campos: [{ k: 'tarjeta_hasta', label: 'Válida hasta', type: 'date' }], valores: { tarjeta_hasta: t.tarjeta_hasta || '' },
    extra: '<p class="note">Útil si el taller te dice que ya la ha renovado. Al cargar un registro oficial nuevo se volverá a tomar la fecha del registro.</p>',
    alGuardar: async d => { await guardar('talleres', t.id, { tarjeta_hasta: d.tarjeta_hasta || null }); toast('Fecha guardada'); }
  }));
  $('#fCom2', body)?.addEventListener('change', e => guardar('talleres', t.id, { comercial_id: e.target.value || null }).then(() => toast('Comercial asignado')));
  $('#datosForm', body).addEventListener('submit', async e => {
    e.preventDefault(); const f = e.target;
    await guardar('talleres', t.id, { telefono: f.telefono.value.trim() || null, email: f.email.value.trim() || null, web: f.web.value.trim() || null, notas: f.notas.value.trim() });
    toast('Datos guardados');
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
    <div class="cards">${cargandoContactos ? '<p class="note">Cargando…</p>' : contactos.map(c => `
      <div class="card"><div class="card-h"><b>${esc(c.nombre)}</b>${c.cargo ? `<span class="note">${esc(c.cargo)}</span>` : ''}</div>
        <div class="btns sm">${c.telefono ? `<a class="btn" href="tel:${esc(c.telefono.replace(/\s/g, ''))}">${esc(c.telefono)}</a>` : ''}${c.email ? `<a class="btn" href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : ''}</div>
        ${c.notas ? `<p class="note">${esc(c.notas)}</p>` : ''}
        ${edit ? `<div class="btns sm"><button class="btn" data-editc="${esc(c.id)}">Editar</button><button class="btn danger" data-delc="${esc(c.id)}">Eliminar</button></div>` : ''}
      </div>`).join('') || '<p class="note">Aún no hay contactos. Añade al jefe de taller o a quien decide las compras.</p>'}</div>`;
  const campos = [{ k: 'nombre', label: 'Nombre', required: true }, { k: 'cargo', label: 'Cargo' }, { k: 'telefono', label: 'Teléfono', type: 'tel' }, { k: 'email', label: 'Email', type: 'email' }, { k: 'notas', label: 'Notas', type: 'textarea' }];
  $('#addC', body)?.addEventListener('click', () => formulario({ titulo: 'Nuevo contacto', campos, alGuardar: async d => { const r = await S.api.insert('contactos', { ...d, taller_id: t.id }); contactos.push(r); render(); } }));
  $$('[data-editc]', body).forEach(b => b.addEventListener('click', () => {
    const c = contactos.find(x => x.id === b.dataset.editc);
    formulario({ titulo: 'Editar contacto', campos, valores: c, alGuardar: async d => { const r = await S.api.update('contactos', c.id, d); Object.assign(c, r); render(); } });
  }));
  $$('[data-delc]', body).forEach(b => confirmBtn(b, async () => { try { await S.api.remove('contactos', b.dataset.delc); contactos = contactos.filter(x => x.id !== b.dataset.delc); render(); } catch (e) { toast(e.message, 'error'); } }));
}

// ------------------------------ Visitas ------------------------------
export function formVisita(t, v = null, preset = {}) {
  const admin = esAdmin();
  const campos = [
    { k: 'fecha', label: 'Fecha', type: 'date', required: true, def: hoy() },
    { k: 'hora', label: 'Hora', type: 'time' },
    { k: 'tipo', label: 'Tipo', type: 'select', options: Object.entries(TIPOS_VISITA), def: 'visita' },
    { k: 'estado', label: 'Estado', type: 'select', options: [['hecha', 'Hecha'], ['planificada', 'Planificada'], ['cancelada', 'Cancelada']], def: 'hecha' },
    ...(admin ? [{ k: 'comercial_id', label: 'Comercial', type: 'select', options: comerciales().map(p => [p.id, p.nombre]), def: t.comercial_id || S.yo.id }] : []),
    { k: 'resumen', label: 'Qué se habló', type: 'textarea', placeholder: 'Resumen de la visita o motivo de la cita' },
    { k: 'proximo_paso', label: 'Próximo paso', full: true, placeholder: 'Ej. enviar presupuesto del banco de pruebas' }
  ];
  const extra = v ? '' : `<label class="note chk"><input type="checkbox" id="planSig"> Planificar también la siguiente visita dentro de <input type="number" id="planDias" value="30" min="1" max="365" style="width:64px"> días</label>`;
  formulario({
    titulo: v ? 'Editar visita' : `Visita a ${t.nombre}`, campos, valores: { ...preset, ...(v || {}) }, extra,
    textoGuardar: v ? 'Guardar' : 'Registrar',
    alGuardar: async d => {
      if (!admin) d.comercial_id = v?.comercial_id || S.yo.id;
      if (v) await guardar('visitas', v.id, d);
      else {
        await crear('visitas', { ...d, taller_id: t.id });
        if ($('#planSig')?.checked) {
          const dias = Math.max(1, +$('#planDias').value || 30);
          await crear('visitas', { taller_id: t.id, comercial_id: d.comercial_id, fecha: addDays(d.fecha, dias), tipo: 'visita', estado: 'planificada', resumen: d.proximo_paso || 'Visita de seguimiento', proximo_paso: '' });
        }
        toast(d.estado === 'planificada' ? 'Visita planificada' : 'Visita registrada');
      }
    }
  });
}
function pVisitas(body, t, { vis }) {
  const edit = puedeEditar(t);
  const orden = vis.slice().sort((a, b) => (a.estado === 'planificada' ? 0 : 1) - (b.estado === 'planificada' ? 0 : 1) || (a.estado === 'planificada' ? a.fecha.localeCompare(b.fecha) : b.fecha.localeCompare(a.fecha)));
  body.innerHTML = `${edit ? '<div class="btns"><button class="btn primary" id="addV">Registrar visita</button><button class="btn" id="planV">Planificar visita</button></div>' : ''}
    <div class="timeline">${orden.map(v => {
      const mia = esAdmin() || v.comercial_id === S.yo.id || v.creado_por === S.yo.id;
      return `<div class="tl-i ${v.estado}">
        <div class="tl-h"><b>${fmtFecha(v.fecha)}${v.hora ? ' · ' + v.hora.slice(0, 5) : ''}</b><span class="pill ${v.estado}">${v.estado === 'planificada' ? 'Planificada' : v.estado === 'hecha' ? 'Hecha' : 'Cancelada'}</span><span class="note">${esc(TIPOS_VISITA[v.tipo] || '')} · ${esc(nombreDe(v.comercial_id) || 'Sin comercial')}</span></div>
        ${v.resumen ? `<p>${esc(v.resumen)}</p>` : ''}${v.proximo_paso ? `<p class="note">Próximo paso: ${esc(v.proximo_paso)}</p>` : ''}
        ${mia ? `<div class="btns sm">${v.estado === 'planificada' ? `<button class="btn primary" data-hecha="${esc(v.id)}">Marcar como hecha</button>` : ''}<button class="btn" data-editv="${esc(v.id)}">Editar</button><button class="btn danger" data-delv="${esc(v.id)}">Eliminar</button></div>` : ''}
      </div>`;
    }).join('') || '<p class="note">Todavía no hay visitas.</p>'}</div>`;
  $('#addV', body)?.addEventListener('click', () => formVisita(t));
  $('#planV', body)?.addEventListener('click', () => formVisita(t, null, { estado: 'planificada', fecha: addDays(hoy(), 7) }));
  $$('[data-editv]', body).forEach(b => b.addEventListener('click', () => formVisita(t, S.visitas.get(b.dataset.editv))));
  $$('[data-hecha]', body).forEach(b => b.addEventListener('click', () => formVisita(t, S.visitas.get(b.dataset.hecha), { estado: 'hecha', fecha: hoy() })));
  $$('[data-delv]', body).forEach(b => confirmBtn(b, () => borrar('visitas', b.dataset.delv)));
}

// ------------------------------ Ventas ------------------------------
function pVentas(body, t, { ven }) {
  const edit = puedeEditar(t);
  const tot = e => ven.filter(v => v.estado === e).reduce((a, v) => a + Number(v.importe || 0), 0);
  const campos = [
    { k: 'fecha', label: 'Fecha', type: 'date', required: true, def: hoy() },
    { k: 'tipo', label: 'Tipo', type: 'select', options: [['presupuesto', 'Presupuesto'], ['pedido', 'Pedido']] },
    { k: 'concepto', label: 'Concepto', required: true, full: true, placeholder: 'Ej. Banco de pruebas de tacógrafos' },
    { k: 'importe', label: 'Importe (€, sin IVA)', type: 'number' },
    { k: 'estado', label: 'Estado', type: 'select', options: [['abierto', 'Abierto'], ['ganado', 'Ganado'], ['perdido', 'Perdido']] },
    { k: 'notas', label: 'Notas', type: 'textarea' }
  ];
  body.innerHTML = `
    <div class="kpis3"><div><span>Abierto</span><b>${fmtEur(tot('abierto'))}</b></div><div><span>Ganado</span><b>${fmtEur(tot('ganado'))}</b></div><div><span>Perdido</span><b>${fmtEur(tot('perdido'))}</b></div></div>
    ${edit ? '<div class="btns"><button class="btn primary" id="addS">Nuevo presupuesto o pedido</button></div>' : ''}
    <div class="tablewrap"><table><thead><tr><th>Fecha</th><th>Concepto</th><th class="n">Importe</th><th>Estado</th><th></th></tr></thead><tbody>
    ${ven.sort((a, b) => b.fecha.localeCompare(a.fecha)).map(v => `<tr><td>${fmtFechaCorta(v.fecha)}</td><td>${esc(v.concepto)}<div class="note">${v.tipo === 'pedido' ? 'Pedido' : 'Presupuesto'} · ${esc(nombreDe(v.comercial_id) || '')}</div></td><td class="n">${fmtEur(v.importe)}</td><td><span class="pill ${v.estado}">${v.estado === 'abierto' ? 'Abierto' : v.estado === 'ganado' ? 'Ganado' : 'Perdido'}</span></td>
      <td>${edit ? `<button class="icon" data-edits="${esc(v.id)}" aria-label="Editar">✎</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="5" class="note">Sin presupuestos ni pedidos.</td></tr>'}
    </tbody></table></div>`;
  $('#addS', body)?.addEventListener('click', () => formulario({ titulo: 'Nuevo presupuesto o pedido', campos, alGuardar: async d => { await crear('ventas', { ...d, taller_id: t.id, comercial_id: t.comercial_id || S.yo.id }); toast('Guardado'); } }));
  $$('[data-edits]', body).forEach(b => b.addEventListener('click', () => {
    const v = S.ventas.get(b.dataset.edits);
    const { el } = formulario({ titulo: 'Editar', campos, valores: v, alGuardar: d => guardar('ventas', v.id, d), extra: '<div class="btns"><button type="button" class="btn danger" id="delS">Eliminar</button></div>' });
    confirmBtn(el.querySelector('#delS'), async () => { await borrar('ventas', v.id); el.parentElement.hidden = true; el.parentElement.innerHTML = ''; });
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
    }).join('') || '<p class="note">No hay equipos registrados. Anota los que le habéis vendido para que la agenda os avise de sus revisiones.</p>'}</div>`;
  $('#addE', body)?.addEventListener('click', () => formulario({ titulo: 'Nuevo equipo', campos, alGuardar: async d => { await crear('equipos', { ...d, taller_id: t.id }); toast('Equipo añadido'); } }));
  $$('[data-edite]', body).forEach(b => b.addEventListener('click', () => { const e = S.equipos.get(b.dataset.edite); formulario({ titulo: 'Editar equipo', campos, valores: e, alGuardar: d => guardar('equipos', e.id, d) }); }));
  $$('[data-dele]', body).forEach(b => confirmBtn(b, () => borrar('equipos', b.dataset.dele)));
}
