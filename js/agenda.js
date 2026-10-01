// Agenda: calendario de visitas y revisiones de equipos
import { S, on, emit, esAdmin, nombreDe, colorDe, comerciales, getRuta, setRuta } from './store.js';
import { $, $$, esc, hoy, addDays, fmtDia, fmtFechaCorta, TIPOS_VISITA, norm, modal, estadoTarjeta, diasHasta } from './util.js';
import { formVisita } from './ficha.js';

let mes = hoy().slice(0, 7), dia = hoy(), quien = null;

export function iniciarAgenda() {
  on('cambio', tablas => { if (tablas.some(t => ['visitas', 'equipos', 'talleres', 'perfiles'].includes(t))) { badge(); if (!$('#v-agenda').hidden) render(); } });
  on('vista', v => { if (v === 'agenda') render(); });
  $('#v-agenda').addEventListener('click', e => {
    const d = e.target.closest('[data-dia]'); if (d) { dia = d.dataset.dia; render(); return; }
    const m = e.target.closest('[data-mes]'); if (m) { const [y, mm] = mes.split('-').map(Number); const dt = new Date(y, mm - 1 + Number(m.dataset.mes), 1); mes = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`; render(); return; }
    if (e.target.closest('[data-hoy]')) { mes = hoy().slice(0, 7); dia = hoy(); render(); return; }
    const t = e.target.closest('[data-taller]'); if (t) { emit('ir', 'mapa'); emit('abrir', { id: t.dataset.taller, volar: true, tab: t.dataset.tab || 'visitas' }); return; }
    const hecha = e.target.closest('[data-hecha]'); if (hecha) { const v = S.visitas.get(hecha.dataset.hecha); formVisita(S.talleres.get(v.taller_id), v, { estado: 'hecha', fecha: hoy() }); return; }
    if (e.target.closest('#nuevaCita')) nuevaCita();
    if (e.target.closest('#rutaDia')) rutaDelDia();
  });
  $('#v-agenda').addEventListener('change', e => { if (e.target.id === 'agQuien') { quien = e.target.value; render(); } });
}

const miVista = () => quien ?? (esAdmin() ? '' : S.yo.id);
function visitasFiltradas() {
  const q = miVista();
  return [...S.visitas.values()].filter(v => v.estado !== 'cancelada' && (!q || v.comercial_id === q));
}
function revisiones() {
  const q = miVista();
  return [...S.equipos.values()].filter(e => e.proxima_revision && (!q || S.talleres.get(e.taller_id)?.comercial_id === q));
}

export function badge() {
  if (!S.yo) return;
  const h = hoy();
  const n = [...S.visitas.values()].filter(v => v.estado === 'planificada' && v.fecha <= h && v.comercial_id === S.yo.id).length;
  $$('.badge-agenda').forEach(b => { b.textContent = n || ''; b.hidden = !n; });
}

function render() {
  const h = hoy();
  const vis = visitasFiltradas(), rev = revisiones();
  const porDia = new Map();
  for (const v of vis) { if (!porDia.has(v.fecha)) porDia.set(v.fecha, { v: 0, p: 0, r: 0 }); const o = porDia.get(v.fecha); v.estado === 'planificada' ? o.p++ : o.v++; }
  for (const e of rev) { if (!porDia.has(e.proxima_revision)) porDia.set(e.proxima_revision, { v: 0, p: 0, r: 0 }); porDia.get(e.proxima_revision).r++; }
  const [y, m] = mes.split('-').map(Number);
  const primero = new Date(y, m - 1, 1), dias = new Date(y, m, 0).getDate();
  const offset = (primero.getDay() + 6) % 7;
  const celdas = [];
  for (let i = 0; i < offset; i++) celdas.push('<div class="cal-d vacio"></div>');
  for (let d = 1; d <= dias; d++) {
    const iso = `${mes}-${String(d).padStart(2, '0')}`; const o = porDia.get(iso);
    celdas.push(`<button class="cal-d${iso === h ? ' hoy' : ''}${iso === dia ? ' sel' : ''}" data-dia="${iso}" aria-label="${fmtDia(iso)}"><span>${d}</span>
      <span class="marks">${o?.p ? `<i class="m-p" title="${o.p} planificadas">${o.p}</i>` : ''}${o?.v ? `<i class="m-v" title="${o.v} hechas">${o.v}</i>` : ''}${o?.r ? `<i class="m-r" title="${o.r} revisiones">${o.r}</i>` : ''}</span></button>`);
  }
  const delDia = vis.filter(v => v.fecha === dia).sort((a, b) => String(a.hora || '99').localeCompare(String(b.hora || '99')));
  const revDia = rev.filter(e => e.proxima_revision === dia);
  const atrasadas = vis.filter(v => v.estado === 'planificada' && v.fecha < h).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const proximas = vis.filter(v => v.estado === 'planificada' && v.fecha >= h && v.fecha <= addDays(h, 14)).sort((a, b) => (a.fecha + (a.hora || '')).localeCompare(b.fecha + (b.hora || '')));
  const q = miVista();
  const tarjetas = [...S.talleres.values()].filter(t => (!q || t.comercial_id === q) && ['caducada', 'd30', 'd90'].includes(estadoTarjeta(t).k))
    .sort((a, b) => a.tarjeta_hasta.localeCompare(b.tarjeta_hasta));
  const revProx = rev.filter(e => e.proxima_revision <= addDays(h, 60)).sort((a, b) => a.proxima_revision.localeCompare(b.proxima_revision));
  const opciones = `<option value="">Todo el equipo</option>` + comerciales().map(p => `<option value="${esc(p.id)}"${p.id === miVista() ? ' selected' : ''}>${esc(p.id === S.yo.id ? 'Solo las mías' : p.nombre)}</option>`).join('');
  $('#v-agenda').innerHTML = `
    <div class="agenda">
      <section class="panel cal">
        <div class="cal-head">
          <button class="icon" data-mes="-1" aria-label="Mes anterior">‹</button>
          <h2 class="mes">${(t => t[0].toUpperCase() + t.slice(1))(new Date(y, m - 1, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }))}</h2>
          <button class="icon" data-mes="1" aria-label="Mes siguiente">›</button>
          <button class="btn sm" data-hoy>Hoy</button>
          <select id="agQuien" aria-label="De quién">${opciones}</select>
        </div>
        <div class="cal-grid">${['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(d => `<div class="cal-w">${d}</div>`).join('')}${celdas.join('')}</div>
        <div class="cal-leg"><span><i class="m-p"></i>Planificadas</span><span><i class="m-v"></i>Hechas</span><span><i class="m-r"></i>Revisiones de equipos</span></div>
      </section>
      <section class="panel">
        <div class="row-between"><h2 class="cap">${esc(fmtDia(dia))}</h2><div class="btns"><button class="btn primary" id="nuevaCita">Planificar visita</button>${dia === h ? '<button class="btn" id="rutaDia">Hacer la ruta de hoy</button>' : ''}</div></div>
        <div class="agenda-list">${delDia.map(item).join('') + revDia.map(itemRev).join('') || '<p class="note">Nada este día.</p>'}</div>
      </section>
      <section class="panel">
        ${atrasadas.length ? `<h2 class="cap warn">Visitas planificadas sin cerrar (${atrasadas.length})</h2><div class="agenda-list">${atrasadas.map(item).join('')}</div>` : ''}
        <h2 class="cap">Próximas dos semanas</h2><div class="agenda-list">${proximas.map(item).join('') || '<p class="note">No hay visitas planificadas.</p>'}</div>
        <h2 class="cap">Tarjetas de taller que caducan (próximos 90 días)</h2><div class="agenda-list">${tarjetas.slice(0, 40).map(itemTarjeta).join('') || '<p class="note">Ningún taller caduca pronto.</p>'}${tarjetas.length > 40 ? `<p class="note">Y ${tarjetas.length - 40} más: filtra el mapa por «Tarjeta caduca en 90 días».</p>` : ''}</div>
        <h2 class="cap">Revisiones de equipos (próximos 60 días)</h2><div class="agenda-list">${revProx.map(itemRev).join('') || '<p class="note">Sin revisiones próximas.</p>'}</div>
      </section>
    </div>`;
}
function item(v) {
  const t = S.talleres.get(v.taller_id); if (!t) return '';
  const puede = esAdmin() || v.comercial_id === S.yo.id;
  return `<div class="ag-item ${v.estado}">
    <div><b>${v.hora ? v.hora.slice(0, 5) + ' · ' : ''}${fmtFechaCorta(v.fecha)}</b> <span class="pill ${v.estado}">${v.estado === 'planificada' ? 'Planificada' : 'Hecha'}</span></div>
    <button class="linklike" data-taller="${esc(t.id)}">${esc(t.nombre)}</button>
    <div class="note">${esc(TIPOS_VISITA[v.tipo] || '')} · ${esc(t.poblacion || '')} · <span class="dotc" style="background:${esc(colorDe(v.comercial_id) || '#999')}"></span>${esc(nombreDe(v.comercial_id) || 'Sin comercial')}</div>
    ${v.resumen ? `<div class="note">${esc(v.resumen)}</div>` : ''}
    ${v.estado === 'planificada' && puede ? `<div class="btns sm"><button class="btn primary" data-hecha="${esc(v.id)}">Marcar como hecha</button></div>` : ''}
  </div>`;
}
function itemRev(e) {
  const t = S.talleres.get(e.taller_id); if (!t) return '';
  const venc = e.proxima_revision < hoy();
  return `<div class="ag-item rev"><div><b>${fmtFechaCorta(e.proxima_revision)}</b> <span class="pill ${venc ? 'perdido' : 'planificada'}">${venc ? 'Revisión vencida' : 'Revisión'}</span></div>
    <button class="linklike" data-taller="${esc(t.id)}" data-tab="equipos">${esc(t.nombre)}</button>
    <div class="note">${esc(e.tipo)}${e.marca ? ' · ' + esc(e.marca) : ''} · ${esc(t.poblacion || '')}</div></div>`;
}

function itemTarjeta(t) {
  const { k } = estadoTarjeta(t), d = diasHasta(t.tarjeta_hasta);
  return `<div class="ag-item"><div><b>${fmtFechaCorta(t.tarjeta_hasta)}</b> <span class="pill tj ${k}">${k === 'caducada' ? 'Caducada' : d === 0 ? 'Caduca hoy' : `En ${d} días`}</span></div>
    <button class="linklike" data-taller="${esc(t.id)}" data-tab="resumen">${esc(t.nombre)}</button>
    <div class="note">${esc(t.poblacion || '')}${t.provincia && t.provincia !== t.poblacion ? ' · ' + esc(t.provincia) : ''}${t.estado ? ' · ' + esc({ cliente: 'Cliente', potencial: 'Potencial', competencia: 'Competencia', descartado: 'Descartado' }[t.estado] || '') : ''}</div></div>`;
}
function nuevaCita() {
  const opciones = [...S.talleres.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const { el, close } = modal(`<div class="modal-head"><h3>Planificar visita</h3><button class="icon" data-close aria-label="Cerrar">×</button></div>
    <label class="field" for="buscaT"><span>Busca el taller</span><input id="buscaT" placeholder="Nombre o población" autocomplete="off"></label>
    <div class="pick" id="pickT"></div>`);
  const pintar = q => {
    const w = norm(q).split(/\s+/).filter(Boolean);
    const r = opciones.filter(t => { const h = norm(t.nombre + ' ' + t.poblacion); return w.every(x => h.includes(x)); })
      .sort((a, b) => (b.comercial_id === S.yo.id) - (a.comercial_id === S.yo.id)).slice(0, 30);
    el.querySelector('#pickT').innerHTML = r.map(t => `<button class="pick-i" data-id="${esc(t.id)}"><b>${esc(t.nombre)}</b><span class="note">${esc(t.poblacion || '')} · ${esc(t.provincia || '')}</span></button>`).join('') || '<p class="note">Sin resultados.</p>';
  };
  el.querySelector('#buscaT').addEventListener('input', e => pintar(e.target.value));
  el.querySelector('#pickT').addEventListener('click', e => { const b = e.target.closest('[data-id]'); if (!b) return; close(); formVisita(S.talleres.get(b.dataset.id), null, { estado: 'planificada', fecha: dia < hoy() ? hoy() : dia }); });
  pintar('');
}
function rutaDelDia() {
  const ids = visitasFiltradas().filter(v => v.fecha === hoy() && v.estado === 'planificada' && (v.comercial_id === S.yo.id || esAdmin()))
    .sort((a, b) => String(a.hora || '99').localeCompare(String(b.hora || '99'))).map(v => v.taller_id);
  if (!ids.length) return;
  setRuta([...new Set(ids)]); emit('ir', 'ruta');
}
