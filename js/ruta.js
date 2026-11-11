// Ruta de visitas: orden optimizado, distancias aproximadas y enlaces a Google Maps
import { S, on, emit, getRuta, setRuta, esAdmin, comerciales, nombreDe, guardar } from './store.js';
import { $, esc, hav, css, toast, vacio, modal, hoy, addDays, diasDesde, estadoTarjeta, fmtFechaCorta, fmtEur } from './util.js';
import { formacionDe } from './cursos.js';
import { ubicacionActual } from './mapa.js';
import { ponerFondo } from './fondo.js';

let mini = null, capa = null, salida = null;
let motivos = new Map(); // por qué propuso cada parada la ruta inteligente
try { motivos = new Map(JSON.parse(sessionStorage.getItem('ruta-motivos') || '[]')); } catch (e) {}
const cp = { tabla: null };

export function iniciarRuta() {
  on('ruta:toggle', id => { const r = getRuta(); const i = r.indexOf(id); if (i >= 0) r.splice(i, 1); else r.push(id); setRuta(r); toast(i >= 0 ? 'Quitado de la ruta' : 'Añadido a la ruta'); });
  on('ruta:cambio', () => { contador(); if (!$('#v-ruta').hidden) render(); });
  on('vista', v => { if (v === 'ruta') render(); });
  on('ubicacion', p => { if (!salida) salida = { ...p, etiqueta: 'Mi ubicación' }; });
  try { const s = JSON.parse(localStorage.getItem('ruta-salida') || 'null'); if (s) salida = s; } catch (e) {}
  $('#v-ruta').addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b) return;
    const r = getRuta();
    if (b.dataset.up) { const i = +b.dataset.up; if (i > 0) { [r[i - 1], r[i]] = [r[i], r[i - 1]]; setRuta(r); } }
    else if (b.dataset.down) { const i = +b.dataset.down; if (i < r.length - 1) { [r[i + 1], r[i]] = [r[i], r[i + 1]]; setRuta(r); } }
    else if (b.dataset.del) { r.splice(+b.dataset.del, 1); setRuta(r); }
    else if (b.dataset.ver) { emit('ir', 'mapa'); emit('abrir', { id: b.dataset.ver, volar: true }); }
    else if (b.id === 'rOpt') optimizar();
    else if (b.id === 'rVaciar') { const antes = getRuta(); setRuta([]); toast('Ruta vaciada', '', { deshacer: () => setRuta(antes) }); }
    else if (b.id === 'rProponer') proponer();
    else if (b.id === 'rBase') {
      const base = { lat: salida.lat, lon: salida.lon, etiqueta: salida.etiqueta === 'Mi ubicación' ? 'su ubicación guardada' : salida.etiqueta };
      try { await guardar('perfiles', S.yo.id, { base }); S.yo = { ...S.yo, base }; toast('Punto de partida guardado: se usa para calcular tus kilómetros'); render(); } catch (err) { /* el aviso ya sale */ }
    }
    else if (b.id === 'rAqui') {
      const u = ubicacionActual();
      if (u) { fijarSalida({ ...u, etiqueta: 'Mi ubicación' }); return; }
      if (!navigator.geolocation) return toast('Este dispositivo no da la ubicación.', 'error');
      navigator.geolocation.getCurrentPosition(p => fijarSalida({ lat: p.coords.latitude, lon: p.coords.longitude, etiqueta: 'Mi ubicación' }), () => toast('No se pudo obtener tu ubicación.', 'error'));
    }
  });
  $('#v-ruta').addEventListener('change', async e => {
    if (e.target.id === 'rCP') {
      const v = e.target.value.trim(); if (!v) { fijarSalida(null); return; }
      if (!cp.tabla) cp.tabla = await fetch('data/cp.json').then(r => r.json()).catch(() => ({}));
      const p = cp.tabla[v];
      if (!p) return toast('No encuentro ese código postal.', 'error');
      fijarSalida({ lat: p[0], lon: p[1], etiqueta: 'CP ' + v });
    }
    if (e.target.id === 'rVuelta') { try { localStorage.setItem('ruta-vuelta', e.target.checked ? '1' : '0'); } catch (err) {} render(); }
  });
  contador();
}
function fijarSalida(s) { salida = s; try { localStorage.setItem('ruta-salida', JSON.stringify(s)); } catch (e) {} render(); }
const vuelta = () => { try { return localStorage.getItem('ruta-vuelta') !== '0'; } catch (e) { return true; } };
function contador() { const n = getRuta().length; document.querySelectorAll('.badge-ruta').forEach(b => { b.textContent = n || ''; b.hidden = !n; }); }

function paradas() { return getRuta().map(id => S.talleres.get(id)).filter(t => t && t.lat != null); }
function secuencia(ps) { const v = vuelta(); const ini = salida ? [salida] : []; return ini.concat(ps, v && ps.length ? [salida || ps[0]] : []); }
const km = seq => seq.reduce((a, p, i) => i ? a + hav(seq[i - 1], p) : 0, 0);

function optimizar() {
  let ps = paradas(); if (ps.length < 2) return;
  const ini = salida || ps[0];
  let resto = salida ? ps.slice() : ps.slice(1), orden = salida ? [] : [ps[0]], cur = ini;
  while (resto.length) { let bi = 0, bd = Infinity; resto.forEach((p, i) => { const d = hav(cur, p); if (d < bd) { bd = d; bi = i; } }); cur = resto.splice(bi, 1)[0]; orden.push(cur); }
  const fijo = salida ? 0 : 1;
  let mejora = true, n = 0;
  while (mejora && n++ < 60) {
    mejora = false;
    for (let i = fijo; i < orden.length - 1; i++) for (let j = i + 1; j < orden.length; j++) {
      const cand = orden.slice(0, i).concat(orden.slice(i, j + 1).reverse(), orden.slice(j + 1));
      if (km(secuencia(cand)) + 1e-6 < km(secuencia(orden))) { orden = cand; mejora = true; }
    }
  }
  setRuta(orden.map(t => t.id)); toast('Orden optimizado');
}

function mismaBase() { const b = S.yo?.base; return !!b && !!salida && Math.abs(b.lat - salida.lat) < 1e-5 && Math.abs(b.lon - salida.lon) < 1e-5; }
function render() {
  if (!salida && S.yo?.base) salida = { ...S.yo.base };
  const ps = paradas(), seq = secuencia(ps);
  const dist = km(seq) * 1.3, horas = dist / 70 + ps.length * 0.75;
  const addr = t => t.precision === 'exacta' || t.precision === 'manual' ? `${t.lat},${t.lon}` : `${t.nombre}, ${t.direccion || ''}, ${t.cp || ''} ${t.poblacion || ''}`;
  const links = [];
  if (ps.length) {
    const origen = salida ? `${salida.lat},${salida.lon}` : addr(ps[0]);
    const lista = (salida ? ps : ps.slice(1)).map(addr);
    let o = origen;
    for (let i = 0; i < lista.length; i += 9) {
      const tramo = lista.slice(i, i + 9); const ultimo = i + 9 >= lista.length;
      const dest = ultimo && vuelta() ? origen : tramo[tramo.length - 1];
      const way = ultimo && vuelta() ? tramo : tramo.slice(0, -1);
      let url = `https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=${encodeURIComponent(o)}&destination=${encodeURIComponent(dest)}`;
      if (way.length) url += `&waypoints=${encodeURIComponent(way.join('|'))}`;
      links.push(`<a class="btn primary" href="${url}" target="_blank" rel="noopener">Abrir ${lista.length > 9 ? 'tramo ' + (links.length + 1) : 'la ruta'} en Google Maps</a>`);
      o = tramo[tramo.length - 1];
    }
  }
  const h = Math.floor(horas), mnt = Math.round((horas - h) * 60);
  $('#v-ruta').innerHTML = `
    <div class="cab-vista"><div><h1>Ruta</h1><p>${ps.length ? `${ps.length} ${ps.length === 1 ? 'parada' : 'paradas'} · unos ${Math.round(dist)} km` : 'Prepara el recorrido del día y ábrelo en Google Maps.'}</p></div></div>
    <div class="ruta">
      <section class="panel">
        <h2 class="cap">Ruta de visitas</h2>
        <p class="note">Añade talleres con el botón + de la lista o desde su ficha. Las distancias son aproximadas; Google Maps calcula la ruta real.</p>
        <div class="grid2">
          <label class="field"><span>Salida (código postal)</span><input id="rCP" inputmode="numeric" maxlength="5" placeholder="Ej. 41500" value="${salida?.etiqueta?.startsWith('CP ') ? esc(salida.etiqueta.slice(3)) : ''}"></label>
          <div class="field"><span>Punto de salida</span><div class="btns"><button class="btn" id="rAqui">Usar mi ubicación</button></div></div>
        </div>
        <p class="note">${salida ? 'Salida: ' + esc(salida.etiqueta) : 'Sin punto de salida: se empieza en el primer taller.'}${salida && !mismaBase() ? ' · <button class="linklike" id="rBase">Guardar como mi punto de partida</button>' : salida ? ' · tu punto de partida habitual' : ''}</p>
        <label class="note chk"><input type="checkbox" id="rVuelta" ${vuelta() ? 'checked' : ''}> Volver al punto de salida</label>
        <div class="kpis3"><div><span>Paradas</span><b>${ps.length}</b></div><div><span>Kilómetros aprox.</span><b>${Math.round(dist)}</b></div><div><span>Jornada aprox.</span><b>${ps.length ? `${h} h ${String(mnt).padStart(2, '0')}` : '—'}</b><small>con 45 min por visita</small></div></div>
        <div class="stops">${ps.map((t, i) => `<div class="stop"><span class="num">${i + 1}</span><div class="grow"><button class="linklike" data-ver="${esc(t.id)}">${esc(t.nombre)}</button><div class="note">${esc(t.poblacion || '')} · ${esc(t.provincia || '')}</div>${motivos.get(t.id) ? `<div class="motivos">${motivos.get(t.id).map(m => `<span>${esc(m)}</span>`).join('')}</div>` : ''}</div>
          <div class="btns sm nowrap"><button class="icon" data-up="${i}" aria-label="Subir">↑</button><button class="icon" data-down="${i}" aria-label="Bajar">↓</button><button class="icon" data-del="${i}" aria-label="Quitar">×</button></div></div>`).join('') || vacio('Añade talleres con el botón + de la lista o desde su ficha.', 'La ruta está vacía')}</div>
        <div class="propon"><div><b>¿No sabes a quién ir?</b><span>La app te propone los talleres que más conviene visitar en una zona: citas del día, presupuestos abiertos, técnicos que deben renovar, tarjetas que caducan y clientes olvidados.</span></div><button class="btn primary" id="rProponer">Proponer ruta</button></div>
        <div class="btns"><button class="btn" id="rOpt" ${ps.length < 2 ? 'disabled' : ''}>Optimizar orden</button><button class="btn" id="rVaciar" ${ps.length ? '' : 'disabled'}>Vaciar</button></div>
        <div class="btns">${links.join('')}</div>
      </section>
      <section class="panel mapruta"><div id="miniMapa"></div></section>
    </div>`;
  if (mini) { mini.remove(); mini = null; }
  mini = L.map('miniMapa', { zoomControl: true });
  ponerFondo(mini);
  capa = L.layerGroup().addTo(mini);
  if (seq.length > 1) L.polyline(seq.map(p => [p.lat, p.lon]), { color: css('--accent'), weight: 4, opacity: 0.85, dashArray: '8 8' }).addTo(capa);
  ps.forEach((t, i) => L.marker([t.lat, t.lon], { icon: L.divIcon({ className: 'stoplabel', html: String(i + 1), iconSize: [26, 26] }) }).addTo(capa).bindTooltip(esc(t.nombre)));
  if (salida) L.circleMarker([salida.lat, salida.lon], { radius: 8, color: '#fff', weight: 3, fillColor: '#1a73e8', fillOpacity: 1 }).addTo(capa).bindTooltip(esc(salida.etiqueta));
  const pts = seq.map(p => [p.lat, p.lon]);
  if (pts.length) mini.fitBounds(pts, { padding: [30, 30], maxZoom: 13 }); else mini.fitBounds([[35.9, -9.4], [43.8, 3.4]]);
}


// ------------------------------------------------------------------
// Ruta inteligente: propone a quién visitar en una zona y un día
// ------------------------------------------------------------------
const PESOS = {
  cita: [100, 'Visita planificada ese día'],
  presupuesto: [30, 'Presupuesto abierto'],
  caducado: [26, 'Técnicos con la formación caducada'],
  vence: [16, 'Técnicos que deben renovar pronto'],
  tarjeta: [18, 'Tarjeta de taller que caduca'],
  olvidado: [12, 'Cliente sin visitar'],
  nuevo: [8, 'Potencial sin visitar nunca'],
  revision: [14, 'Revisión de equipo próxima']
};
function puntuar(t, dia, criterios) {
  let p = 0; const m = [];
  const suma = (k, extra = 0, txt = null) => { if (!criterios.has(k)) return; p += PESOS[k][0] + extra; m.push(txt || PESOS[k][1]); };
  if (t.estado === 'descartado') return { p: 0, m };
  const citas = [...S.visitas.values()].filter(v => v.taller_id === t.id && v.estado === 'planificada' && v.fecha === dia);
  if (citas.length) { p += PESOS.cita[0]; m.push(PESOS.cita[1]); }
  const abiertos = [...S.ventas.values()].filter(v => v.taller_id === t.id && v.estado === 'abierto');
  if (abiertos.length) suma('presupuesto', 0, `Presupuesto abierto (${fmtEur(abiertos.reduce((a, v) => a + Number(v.importe || 0), 0))})`);
  const f = formacionDe(t.id);
  if (f?.r.caducado) suma('caducado', 4 * Math.min(f.r.caducado, 3), `${f.r.caducado} ${f.r.caducado === 1 ? 'técnico caducado' : 'técnicos caducados'}`);
  else if (f?.r.vence_pronto) suma('vence', 0, `${f.r.vence_pronto} ${f.r.vence_pronto === 1 ? 'técnico renueva' : 'técnicos renuevan'} pronto`);
  const tj = estadoTarjeta(t);
  if (['caducada', 'd30', 'd90'].includes(tj.k)) suma('tarjeta', tj.k === 'caducada' ? 6 : tj.k === 'd30' ? 4 : 0, tj.k === 'caducada' ? 'Tarjeta de taller caducada' : `Tarjeta caduca en ${tj.dias} días`);
  const d = diasDesde(t.ultima_visita);
  if (t.estado === 'cliente' && (d == null || d > 60)) suma('olvidado', Math.min(20, Math.floor((d ?? 365) / 15)), d == null ? 'Cliente nunca visitado' : `Cliente sin visitar desde hace ${d} días`);
  if (t.estado === 'potencial' && d == null) suma('nuevo');
  const rev = [...S.equipos.values()].filter(e => e.taller_id === t.id && e.proxima_revision && e.proxima_revision <= addDays(dia, 45));
  if (rev.length) suma('revision', 0, `Revisión de ${rev[0].tipo.toLowerCase()} el ${fmtFechaCorta(rev[0].proxima_revision)}`);
  if (!citas.length && d != null && d < 14) p *= 0.3; // visitado hace nada: mejor otro
  return { p, m };
}

function proponer() {
  const admin = esAdmin();
  const provs = [...new Set([...S.talleres.values()].map(t => t.provincia).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  const tengoTalleres = [...S.talleres.values()].some(t => t.comercial_id === S.yo.id);
  const provMia = (() => { const c = new Map(); for (const t of S.talleres.values()) if (!tengoTalleres || t.comercial_id === S.yo.id) c.set(t.provincia, (c.get(t.provincia) || 0) + 1); return [...c].sort((a, b) => b[1] - a[1])[0]?.[0]; })();
  const { el, close } = modal(`<form class="form">
    <div class="modal-head"><h3>Proponer ruta</h3><button type="button" class="icon" data-close aria-label="Cerrar">×</button></div>
    <div class="grid2">
      <label class="field"><span>Día</span><input type="date" name="dia" value="${hoy()}" required></label>
      <label class="field"><span>Paradas</span><select name="n">${[3, 4, 5, 6, 7, 8, 10].map(n => `<option${n === 6 ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
      <label class="field full"><span>Zona</span><select name="zona">
        ${salida ? `<optgroup label="Alrededor de la salida (${esc(salida.etiqueta)})">${[30, 60, 100, 150].map(k => `<option value="r${k}"${k === 60 ? ' selected' : ''}>A menos de ${k} km</option>`).join('')}</optgroup>` : ''}
        <optgroup label="Provincia">${provs.map(p => `<option value="p:${esc(p)}"${!salida && p === provMia ? ' selected' : ''}>${esc(p)}</option>`).join('')}</optgroup>
      </select></label>
      ${admin ? `<label class="field full"><span>Talleres de</span><select name="quien"><option value="">Todo el equipo</option>${comerciales().map(p => `<option value="${esc(p.id)}"${p.id === S.yo.id && tengoTalleres ? ' selected' : ''}>${esc(p.nombre)}</option>`).join('')}<option value="__libre">Sin comercial</option></select></label>` : ''}
    </div>
    ${salida ? '' : '<p class="note">Consejo: pon un punto de salida (código postal o tu ubicación) para que la ruta empiece y acabe cerca de ti.</p>'}
    <fieldset class="redes-sel"><legend>Qué tener en cuenta</legend>
      ${Object.entries(PESOS).filter(([k]) => k !== 'cita').map(([k, [, l]]) => `<label class="chk"><input type="checkbox" name="c" value="${k}" checked> ${esc(l)}</label>`).join('')}
    </fieldset>
    <div id="prop"></div>
    <div class="btns end"><button type="button" class="btn" data-close>Cancelar</button><button type="submit" class="btn primary" id="propOk" disabled>Usar esta ruta</button></div>
  </form>`, { wide: true });
  const f = el.querySelector('form'); let elegidos = [];
  const calcular = () => {
    const dia = f.dia.value || hoy(), n = +f.n.value, zona = f.zona.value, quien = admin ? f.quien.value : S.yo.id;
    const criterios = new Set([...f.querySelectorAll('[name=c]:checked')].map(x => x.value));
    let cands = [...S.talleres.values()].filter(t => t.lat != null && (!quien ? true : quien === '__libre' ? !t.comercial_id : t.comercial_id === quien));
    if (zona.startsWith('r') && salida) cands = cands.filter(t => hav(salida, t) <= +zona.slice(1));
    else if (zona.startsWith('p:')) cands = cands.filter(t => t.provincia === zona.slice(2));
    const pts = cands.map(t => ({ t, ...puntuar(t, dia, criterios) })).filter(x => x.p > 0);
    // Elección: primero lo más importante, pero sin dispersarse por la zona
    elegidos = [];
    const resto = pts.slice().sort((a, b) => b.p - a.p);
    while (elegidos.length < n && resto.length) {
      let bi = 0, bv = -1;
      resto.forEach((x, i) => {
        const cerca = elegidos.length ? Math.min(...elegidos.map(e => hav(e.t, x.t))) : (salida ? hav(salida, x.t) : 0);
        const v = x.p >= 100 ? 1e6 : x.p / (1 + cerca / 25);
        if (v > bv) { bv = v; bi = i; }
      });
      elegidos.push(resto.splice(bi, 1)[0]);
    }
    el.querySelector('#prop').innerHTML = elegidos.length ? `<h3 class="ch-t">Propuesta · ${elegidos.length} paradas</h3><div class="stops">${elegidos.map((x, i) => `<div class="stop"><span class="num">${i + 1}</span><div class="grow"><b>${esc(x.t.nombre)}</b><div class="note">${esc(x.t.poblacion || '')}${x.t.comercial_id && admin ? ' · ' + esc(nombreDe(x.t.comercial_id)) : ''}</div><div class="motivos">${x.m.map(m => `<span>${esc(m)}</span>`).join('')}</div></div></div>`).join('')}</div>`
      : vacio('No hay talleres con motivos para visitarlos en esa zona. Prueba con otra zona o con más criterios.', 'Nada que proponer', { peq: true });
    el.querySelector('#propOk').disabled = !elegidos.length;
  };
  f.addEventListener('change', calcular); calcular();
  f.addEventListener('submit', e => {
    e.preventDefault();
    const antes = getRuta(), antesM = new Map(motivos);
    motivos = new Map(elegidos.map(x => [x.t.id, x.m]));
    try { sessionStorage.setItem('ruta-motivos', JSON.stringify([...motivos])); } catch (err) {}
    setRuta(elegidos.map(x => x.t.id)); close();
    if (elegidos.length > 1) optimizar();
    toast(`Ruta de ${elegidos.length} paradas preparada`, '', { deshacer: () => { motivos = antesM; setRuta(antes); } });
  });
}
