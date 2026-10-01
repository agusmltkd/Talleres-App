// Vista de mapa: capa de talleres, filtros, lista y «cerca de mí»
import { S, on, emit, esAdmin, nombreDe, colorDe, comerciales, getRuta } from './store.js';
import { asignarTalleres } from './asignar.js';
import { $, $$, esc, norm, css, hav, ESTADOS, REDES, TARJETA, estadoInfo, estadoTarjeta, redBadges, fmtFechaCorta, diasDesde, iniciales, debounce, toast } from './util.js';

export let map = null;
const F = { q: '', zona: '', prov: '', com: '', origen: '', estados: new Set(), redes: new Set(), sinVisita: false, tarjeta: false };
let colorModo = 'estado';
let cerca = null; // {lat, lon}
let visibles = [];
let markerLayer, selLayer, nearLayer, provLayer = null;
const markers = new Map();
export let seleccionado = null;

const provKey = t => (t.pais === 'ES' ? t.provc : t.pais + ':' + (t.provincia || ''));

export function filtrar(t) {
  if (F.q) { const h = norm(`${t.nombre} ${t.poblacion} ${t.provincia} ${t.cif} ${t.cp} ${t.telefono || ''}`); if (!F.q.split(/\s+/).every(w => h.includes(w))) return false; }
  if (F.zona && t.ccaa !== F.zona) return false;
  if (F.prov && provKey(t) !== F.prov) return false;
  if (F.com === '__yo' && t.comercial_id !== S.yo.id) return false;
  if (F.com === '__libre' && t.comercial_id) return false;
  if (F.com && F.com[0] !== '_' && t.comercial_id !== F.com) return false;
  if (F.origen && t.origen !== F.origen) return false;
  if (F.estados.size && !F.estados.has(t.estado || '_')) return false;
  if (F.redes.size && !(t.redes || []).some(r => F.redes.has(r)) && !(F.redes.has('_') && !(t.redes || []).length)) return false;
  if (F.sinVisita) { const d = diasDesde(t.ultima_visita); if (d !== null && d < 90) return false; }
  if (F.tarjeta && !['caducada', 'd30', 'd90'].includes(estadoTarjeta(t).k)) return false;
  return true;
}
export const talleresVisibles = () => visibles;

function colorDeTaller(t) {
  if (colorModo === 'red') { const r = (t.redes || [])[0]; return css(r ? (REDES.find(x => x.k === r)?.v || '--r-none') : '--r-none'); }
  if (colorModo === 'comercial') return colorDe(t.comercial_id) || css('--st-none');
  if (colorModo === 'tarjeta') return css(TARJETA.find(x => x.k === estadoTarjeta(t).k).v);
  return css(estadoInfo(t.estado).v);
}
const radio = () => { const z = map.getZoom(); return z <= 6 ? 4.5 : z <= 8 ? 6 : z <= 11 ? 7.5 : 9; };

export function iniciarMapa() {
  map = L.map('map', { preferCanvas: true, minZoom: 4, maxZoom: 18, zoomControl: false });
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(map);
  map.fitBounds([[35.9, -9.4], [43.8, 3.4]]);
  markerLayer = L.layerGroup().addTo(map);
  selLayer = L.layerGroup().addTo(map);
  nearLayer = L.layerGroup().addTo(map);
  map.on('zoomend', () => { const r = radio(); markers.forEach(m => m.setRadius(r)); pintarSeleccion(); });
  construirFiltros();
  on('cambio', tablas => { if (tablas.some(t => ['talleres', 'perfiles'].includes(t))) { rellenarSelects(); refrescar(); } });
  on('seleccion', id => { seleccionado = id; pintarSeleccion(); renderLista(); });
  $$('[data-vista-mapa]').forEach(b => b.addEventListener('click', () => {
    const v = { es: [[35.9, -9.4], [43.8, 3.4]], pt: [[36.9, -9.6], [42.2, -6.1]], ic: [[27.6, -18.2], [29.5, -13.3]], bal: [[38.6, 1.1], [40.1, 4.4]] }[b.dataset.vistaMapa];
    map.fitBounds(v);
  }));
  $('#btnCerca').addEventListener('click', cercaDeMi);
  $('#colorModo').addEventListener('change', e => { colorModo = e.target.value; pintarMarcadores(); leyenda(); });
  $('#capaProv').addEventListener('change', pintarProvincias);
  if (!esAdmin()) {
    // El comercial solo trabaja con sus talleres: fuera las opciones de reparto
    $$('#colorModo option[value="comercial"], #capaProv option[value="libres"]').forEach(o => o.remove());
  }
  $('#asignarLista').addEventListener('click', () => {
    const nombre = F.prov ? $('#fProv').selectedOptions[0]?.textContent : F.zona;
    asignarTalleres(visibles, nombre ? `Asignar ${nombre}` : 'Asignar los talleres de la lista');
  });
  leyenda();
}

function construirFiltros() {
  $('#fEstados').innerHTML = ESTADOS.map(e => `<button class="tog" data-k="${e.k || '_'}" aria-pressed="false"><i style="background:var(${e.v})"></i>${e.label}</button>`).join('');
  $('#fRedes').innerHTML = REDES.map(r => `<button class="tog" data-k="${r.k}" aria-pressed="false"><i style="background:var(${r.v})"></i>${r.label}</button>`).join('') + `<button class="tog" data-k="_" aria-pressed="false"><i style="background:var(--r-none)"></i>Sin red</button>`;
  for (const [box, set] of [['#fEstados', F.estados], ['#fRedes', F.redes]]) $(box).addEventListener('click', e => {
    const b = e.target.closest('.tog'); if (!b) return;
    const k = b.dataset.k; set.has(k) ? set.delete(k) : set.add(k);
    b.setAttribute('aria-pressed', String(set.has(k))); refrescar();
  });
  $('#togFiltros').addEventListener('click', () => { const on = document.body.classList.toggle('filtros-abiertos'); $('#togFiltros').setAttribute('aria-expanded', String(on)); });
  $('#fQ').addEventListener('input', debounce(e => { F.q = norm(e.target.value).trim(); refrescar(); }, 150));
  $('#fZona').addEventListener('change', e => { F.zona = e.target.value; F.prov = ''; rellenarSelects(); refrescar(); });
  $('#fProv').addEventListener('change', e => { F.prov = e.target.value; refrescar(); });
  $('#fCom').addEventListener('change', e => { F.com = e.target.value; refrescar(); });
  $('#fOrigen').addEventListener('change', e => { F.origen = e.target.value; refrescar(); });
  $('#fSinVisita').addEventListener('change', e => { F.sinVisita = e.target.checked; refrescar(); });
  $('#fTarjeta').addEventListener('change', e => { F.tarjeta = e.target.checked; if (F.tarjeta && colorModo === 'estado') { colorModo = 'tarjeta'; $('#colorModo').value = 'tarjeta'; leyenda(); } refrescar(); });
  $('#fLimpiar').addEventListener('click', () => {
    Object.assign(F, { q: '', zona: '', prov: '', com: '', origen: '', sinVisita: false, tarjeta: false }); F.estados.clear(); F.redes.clear(); $('#fTarjeta').checked = false;
    $('#fQ').value = ''; $('#fSinVisita').checked = false; $$('.tog', $('#filtros')).forEach(b => b.setAttribute('aria-pressed', 'false'));
    rellenarSelects(); refrescar();
  });
  $('#lista').addEventListener('click', e => {
    const add = e.target.closest('[data-ruta]'); if (add) { e.stopPropagation(); emit('ruta:toggle', add.dataset.ruta); return; }
    const it = e.target.closest('[data-id]'); if (it) emit('abrir', { id: it.dataset.id, volar: true });
  });
  $('#lista').addEventListener('keydown', e => { if (e.key === 'Enter') { const it = e.target.closest('[data-id]'); if (it) emit('abrir', { id: it.dataset.id, volar: true }); } });
  on('ruta:cambio', () => renderLista());
}

export function rellenarSelects() {
  const todos = [...S.talleres.values()];
  const zonas = [...new Set(todos.map(t => t.ccaa).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  $('#fZona').innerHTML = '<option value="">España y Portugal</option>' + zonas.map(z => `<option${z === F.zona ? ' selected' : ''}>${esc(z)}</option>`).join('');
  const provs = new Map(); for (const t of todos) if (!F.zona || t.ccaa === F.zona) provs.set(provKey(t), t.provincia || t.poblacion);
  $('#fProv').innerHTML = '<option value="">Todas las provincias</option>' + [...provs].sort((a, b) => String(a[1]).localeCompare(String(b[1]), 'es')).map(([k, n]) => `<option value="${esc(k)}"${k === F.prov ? ' selected' : ''}>${esc(n)}</option>`).join('');
  const coms = comerciales();
  $('#fCom').innerHTML = `<option value="">Todos los comerciales</option><option value="__yo">Mis talleres</option><option value="__libre">Sin comercial</option>` +
    coms.map(p => `<option value="${esc(p.id)}">${esc(p.nombre)}</option>`).join('');
  $('#fCom').value = F.com;
}

let encuadrado = false;
export function refrescar() {
  if (!map) return;
  visibles = [...S.talleres.values()].filter(t => t.lat != null && filtrar(t));
  // El comercial empieza viendo su zona, no toda la península
  if (!encuadrado && !esAdmin() && visibles.length) { encuadrado = true; map.fitBounds(L.latLngBounds(visibles.map(t => [t.lat, t.lon])).pad(0.15), { maxZoom: 11 }); }
  pintarMarcadores(); renderLista(); pintarProvincias();
  $('#nVisibles').textContent = visibles.length.toLocaleString('es-ES');
  const n = [F.zona, F.prov, F.com, F.origen, F.sinVisita, F.tarjeta].filter(Boolean).length + F.estados.size + F.redes.size;
  $('#togFiltros').textContent = n ? `Filtros (${n})` : 'Filtros';
  emit('filtros', visibles);
}

function pintarMarcadores() {
  markerLayer.clearLayers(); markers.clear();
  const r = radio(), borde = css('--fg');
  for (const t of visibles) {
    const m = L.circleMarker([t.lat, t.lon], { radius: r, weight: 1.2, color: borde, opacity: 0.55, fillColor: colorDeTaller(t), fillOpacity: 0.95 });
    m.bindTooltip(() => `<b>${esc(t.nombre)}</b><br>${esc(t.poblacion || '')}${t.comercial_id ? ' · ' + esc(nombreDe(t.comercial_id)) : ''}`, { direction: 'top', offset: [0, -4] });
    m.on('click', () => emit('abrir', { id: t.id }));
    m.addTo(markerLayer); markers.set(t.id, m);
  }
  pintarSeleccion();
}
function pintarSeleccion() {
  selLayer.clearLayers();
  const t = S.talleres.get(seleccionado); if (!t || t.lat == null) return;
  L.circleMarker([t.lat, t.lon], { radius: radio() + 7, weight: 3, color: css('--accent'), fill: false, interactive: false }).addTo(selLayer);
}
export function volarA(t, zoom = 13) { if (t?.lat != null) map.setView([t.lat, t.lon], Math.max(map.getZoom(), zoom)); }

function renderLista() {
  const MAX = 300;
  let rows = visibles.slice();
  if (cerca) rows.sort((a, b) => hav(cerca, a) - hav(cerca, b));
  else rows.sort((a, b) => String(a.provincia).localeCompare(String(b.provincia), 'es') || String(a.poblacion).localeCompare(String(b.poblacion), 'es') || a.nombre.localeCompare(b.nombre, 'es'));
  const ruta = new Set(getRuta());
  $('#nLista').textContent = rows.length > MAX ? `Se muestran los ${MAX} primeros de ${rows.length.toLocaleString('es-ES')}` : `${rows.length.toLocaleString('es-ES')} talleres`;
  $('#lista').innerHTML = rows.slice(0, MAX).map(t => {
    const e = estadoInfo(t.estado); const d = cerca ? hav(cerca, t) : null;
    const com = t.comercial_id ? `<span class="avatar" title="${esc(nombreDe(t.comercial_id))}" style="background:${esc(colorDe(t.comercial_id))}">${esc(iniciales(nombreDe(t.comercial_id)))}</span>` : '';
    const enRuta = ruta.has(t.id);
    return `<div class="item${t.id === seleccionado ? ' sel' : ''}" role="button" tabindex="0" data-id="${esc(t.id)}">
      <span class="dot" style="background:var(${e.v})"></span>
      <span class="nm">${esc(t.nombre)}</span>
      <span class="rt">${com}<button class="icon" data-ruta="${esc(t.id)}" aria-label="${enRuta ? 'Quitar de la ruta' : 'Añadir a la ruta'}" title="${enRuta ? 'Quitar de la ruta' : 'Añadir a la ruta'}">${enRuta ? '✓' : '+'}</button></span>
      <span class="sub">${d != null ? `<b>${d < 10 ? d.toFixed(1) : Math.round(d)} km</b> · ` : ''}${esc(t.poblacion || '')}${t.provincia && t.provincia !== t.poblacion ? ' · ' + esc(t.provincia) : ''}${t.ultima_visita ? ' · visitado ' + fmtFechaCorta(t.ultima_visita) : ''} ${redBadges(t.redes)}${t.origen === 'kmz' ? ' <span class="badge src">No figura en el registro</span>' : ''}${tjBadge(t)}</span>
    </div>`;
  }).join('') || (S.talleres.size ? '<p class="note pad">Ningún taller cumple estos filtros.</p>'
    : `<p class="note pad">${esAdmin() ? 'Todavía no hay talleres cargados.' : 'Todavía no tienes talleres asignados. Cuando la dirección te asigne una zona, aparecerán aquí y en el mapa. Mientras, puedes añadir talleres tú mismo.'}</p>`);
}

function tjBadge(t) {
  const { k, dias } = estadoTarjeta(t);
  if (k === 'caducada') return ' <span class="badge tjb caducada">Tarjeta caducada</span>';
  if (k === 'd30' || k === 'd90') return ` <span class="badge tjb">Tarjeta: ${dias} días</span>`;
  return '';
}
function cercaDeMi() {
  if (cerca) { cerca = null; nearLayer.clearLayers(); $('#btnCerca').setAttribute('aria-pressed', 'false'); renderLista(); return; }
  if (!navigator.geolocation) return toast('Este dispositivo no da la ubicación.', 'error');
  $('#btnCerca').textContent = 'Buscando…';
  navigator.geolocation.getCurrentPosition(p => {
    cerca = { lat: p.coords.latitude, lon: p.coords.longitude };
    $('#btnCerca').textContent = 'Cerca de mí'; $('#btnCerca').setAttribute('aria-pressed', 'true');
    nearLayer.clearLayers();
    L.circleMarker([cerca.lat, cerca.lon], { radius: 8, color: '#fff', weight: 3, fillColor: '#1a73e8', fillOpacity: 1 }).addTo(nearLayer);
    L.circle([cerca.lat, cerca.lon], { radius: 50000, color: '#1a73e8', weight: 1, fillOpacity: 0.05, interactive: false }).addTo(nearLayer);
    map.setView([cerca.lat, cerca.lon], 9);
    emit('ubicacion', cerca); renderLista();
  }, () => { $('#btnCerca').textContent = 'Cerca de mí'; toast('No se pudo obtener tu ubicación. Revisa los permisos del navegador.', 'error'); }, { enableHighAccuracy: true, timeout: 12000 });
}
export const ubicacionActual = () => cerca;

async function pintarProvincias() {
  const modo = $('#capaProv').value;
  if (!modo) { if (provLayer) { provLayer.remove(); provLayer = null; } leyenda(); return; }
  if (!provLayer) {
    const geo = await fetch('data/provincias.json').then(r => r.json());
    provLayer = L.geoJSON(geo, { style: { weight: 1, color: css('--line-strong'), fillOpacity: 0 } }).addTo(map);
    provLayer.eachLayer(l => {
      l.bindTooltip(() => tooltipProv(l.feature.properties) + (esAdmin() ? '<br><i>Pulsa para asignar la provincia</i>' : ''), { sticky: true });
      l.on('click', () => { if (!esAdmin()) return; const p = l.feature.properties; asignarTalleres([...S.talleres.values()].filter(t => t.pais === 'ES' && t.provc === p.c), 'Asignar ' + p.n); });
    });
    provLayer.bringToBack();
  }
  const cuenta = contarProv(modo);
  const max = Math.max(1, ...cuenta.values());
  provLayer.eachLayer(l => {
    const v = cuenta.get(l.feature.properties.c) || 0;
    l.setStyle({ fillColor: css('--accent'), fillOpacity: v ? 0.08 + 0.55 * (v / max) : 0, weight: 1, color: css('--line-strong') });
  });
  leyenda(max);
}
function contarProv(modo) {
  const c = new Map();
  for (const t of visibles) {
    if (t.pais !== 'ES') continue;
    const ok = modo === 'total' || (modo === 'cliente' && t.estado === 'cliente') || (modo === 'competencia' && t.estado === 'competencia') || (modo === 'libres' && !t.comercial_id);
    if (ok) c.set(t.provc, (c.get(t.provc) || 0) + 1);
  }
  if (modo === 'hueco') { const cl = contarProv('cliente'); const tot = contarProv('total'); const h = new Map(); for (const [k, v] of tot) if (!cl.get(k)) h.set(k, v); return h; }
  return c;
}
function tooltipProv(p) {
  const o = { total: 0, cliente: 0, competencia: 0, libres: 0 };
  for (const t of visibles) if (t.provc === p.c) { o.total++; if (t.estado === 'cliente') o.cliente++; if (t.estado === 'competencia') o.competencia++; if (!t.comercial_id) o.libres++; }
  return `<b>${esc(p.n)}</b><br>${o.total} talleres · ${o.cliente} clientes<br>${o.competencia} competencia · ${o.libres} sin comercial`;
}
function leyenda(max) {
  let h = '';
  if (colorModo === 'estado') h = ESTADOS.map(e => `<div class="row"><span class="sw" style="background:var(${e.v})"></span>${e.label}</div>`).join('');
  else if (colorModo === 'red') h = REDES.map(r => `<div class="row"><span class="sw" style="background:var(${r.v})"></span>${r.label}</div>`).join('') + '<div class="row"><span class="sw" style="background:var(--r-none)"></span>Sin red conocida</div>';
  else if (colorModo === 'tarjeta') h = TARJETA.map(x => `<div class="row"><span class="sw" style="background:var(${x.v})"></span>${x.label}</div>`).join('');
  else h = comerciales().map(p => `<div class="row"><span class="sw" style="background:${esc(p.color)}"></span>${esc(p.nombre)}</div>`).join('') + '<div class="row"><span class="sw" style="background:var(--st-none)"></span>Sin comercial</div>';
  const modo = $('#capaProv').value;
  if (modo && max) h += `<div class="row" style="margin-top:6px"><span class="grad"></span><span>0 – ${max} por provincia</span></div>`;
  $('#leyenda').innerHTML = h;
}

// Colocar un taller a mano arrastrando una chincheta
export function colocarAMano(t, alGuardar) {
  const start = t.lat != null ? [t.lat, t.lon] : map.getCenter();
  map.setView(start, Math.max(map.getZoom(), 16));
  const pin = L.marker(start, { draggable: true, autoPan: true }).addTo(selLayer);
  const bar = $('#barraColocar'); bar.hidden = false;
  $('#colocarTxt').textContent = `Arrastra la chincheta hasta la entrada de ${t.nombre}.`;
  const fin = () => { bar.hidden = true; pin.remove(); pintarSeleccion(); };
  $('#colocarOk').onclick = async () => { const p = pin.getLatLng(); fin(); await alGuardar(p.lat, p.lng); };
  $('#colocarNo').onclick = fin;
}
