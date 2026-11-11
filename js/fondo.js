// Fondo del mapa: mapas vectoriales modernos de OpenFreeMap (gratis, sin claves, uso comercial permitido).
// Si el dispositivo no puede (sin WebGL o sin conexión con el servidor), se usa el mapa clásico de OpenStreetMap.
import { loadScript } from './util.js';

const ML_JS = 'https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.js';
const ML_CSS = 'https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.css';
const PLUGIN = 'https://cdn.jsdelivr.net/npm/@maplibre/maplibre-gl-leaflet@0.1.4/leaflet-maplibre-gl.js';
export const ESTILOS = [
  { k: 'google', label: 'Como Google' },
  { k: 'satelite', label: 'Satélite' },
  { k: 'calles', label: 'Calles', url: 'https://tiles.openfreemap.org/styles/liberty' },
  { k: 'claro', label: 'Claro', url: 'https://tiles.openfreemap.org/styles/positron' },
  { k: 'oscuro', label: 'Oscuro', url: 'https://tiles.openfreemap.org/styles/dark' }
];
const CLAVE = 'mapa-estilo2';
export function estiloActual() {
  try { const e = localStorage.getItem(CLAVE); if (ESTILOS.some(x => x.k === e)) return e; } catch (e) {}
  return 'google';
}
export function guardarEstilo(k) { try { localStorage.setItem(CLAVE, k); } catch (e) {} }

// ------------------------------------------------------------------
// Estilo «Como Google»: el mapa vectorial de OpenFreeMap repintado con la paleta de Google Maps
// (tierra gris claro, carreteras blancas, autovías amarillas, agua azul, parques verdes).
// ------------------------------------------------------------------
const G = {
  tierra: '#f3f3f1', agua: '#aadaff', verde: '#c8e6c4', bosque: '#bfe0b8', arena: '#f6efd9', hospital: '#fbe9e7', escuela: '#f1eee6',
  edificio: '#e9e9ec', edificioBorde: '#dadade', calle: '#ffffff', calleBorde: '#dcdcdc', autovia: '#fcd35f', autoviaBorde: '#e3a531',
  principal: '#fff6cf', principalBorde: '#e2cf87', tren: '#c3c6cb', texto: '#5f6368', textoFuerte: '#3c4043', halo: '#ffffff', limite: '#a0a4a8'
};
let base = null;
async function liberty() {
  if (!base) base = fetch('https://tiles.openfreemap.org/styles/liberty').then(r => { if (!r.ok) throw new Error('estilo'); return r.json(); });
  return JSON.parse(JSON.stringify(await base));
}
const pinta = (l, props) => { l.paint = { ...(l.paint || {}), ...props }; };
function colorCarretera(id) {
  const borde = id.includes('casing');
  if (/motorway/.test(id)) return borde ? G.autoviaBorde : G.autovia;
  if (/trunk_primary/.test(id)) return borde ? G.principalBorde : G.principal;
  if (/rail/.test(id)) return G.tren;
  if (/path_pedestrian/.test(id)) return '#e4e4e4';
  return borde ? G.calleBorde : G.calle;
}
function aGoogle(st) {
  const fuera = new Set(['natural_earth', 'building-3d', 'road_area_pattern', 'poi_r20', 'poi_r7', 'landuse_track', 'landuse_pitch', 'park_outline']);
  st.layers = st.layers.filter(l => !fuera.has(l.id) && !/hatching/.test(l.id));
  for (const l of st.layers) {
    const id = l.id;
    if (id === 'background') pinta(l, { 'background-color': G.tierra });
    else if (l.type === 'fill' && (id === 'water')) pinta(l, { 'fill-color': G.agua, 'fill-opacity': 1 });
    else if (l.type === 'line' && /^waterway/.test(id)) pinta(l, { 'line-color': G.agua });
    else if (l.type === 'fill' && /park|grass/.test(id)) pinta(l, { 'fill-color': G.verde, 'fill-opacity': 1 });
    else if (l.type === 'fill' && /wood|wetland/.test(id)) pinta(l, { 'fill-color': G.bosque, 'fill-opacity': .9 });
    else if (l.type === 'fill' && /sand/.test(id)) pinta(l, { 'fill-color': G.arena });
    else if (l.type === 'fill' && /residential/.test(id)) pinta(l, { 'fill-color': G.tierra, 'fill-opacity': 0 });
    else if (l.type === 'fill' && /hospital/.test(id)) pinta(l, { 'fill-color': G.hospital });
    else if (l.type === 'fill' && /school|cemetery/.test(id)) pinta(l, { 'fill-color': id.includes('cemetery') ? G.verde : G.escuela });
    else if (l.type === 'fill' && /aeroway/.test(id)) pinta(l, { 'fill-color': '#e8eaed' });
    else if (id === 'building') pinta(l, { 'fill-color': G.edificio, 'fill-outline-color': G.edificioBorde, 'fill-opacity': 1 });
    else if (l.type === 'line' && l['source-layer'] === 'transportation') pinta(l, { 'line-color': colorCarretera(id) });
    else if (l.type === 'line' && /^boundary/.test(id)) pinta(l, { 'line-color': G.limite });
    else if (l.type === 'symbol') {
      const fuerte = /label_city|label_country|label_state/.test(id);
      if (l.paint?.['text-color'] !== undefined || l.layout?.['text-field']) pinta(l, { 'text-color': /water/.test(id) ? '#4a7fb5' : fuerte ? G.textoFuerte : G.texto, 'text-halo-color': G.halo, 'text-halo-width': 1.4 });
    }
  }
  return st;
}

// ------------------------------------------------------------------
// Satélite: ortofotos del PNOA (Instituto Geográfico Nacional, CC BY 4.0) con nombres y carreteras encima.
// Cubre España; fuera de España se ve el mapa normal debajo.
// ------------------------------------------------------------------
const PNOA = 'https://www.ign.es/wmts/pnoa-ma?request=GetTile&service=WMTS&version=1.0.0&layer=OI.OrthoimageCoverage&style=default&format=image/jpeg&tilematrixset=GoogleMapsCompatible&tilematrix={z}&tilerow={y}&tilecol={x}';
function aSatelite(st) {
  const g = aGoogle(JSON.parse(JSON.stringify(st)));
  const debajo = g.layers.filter(l => ['background', 'water', 'landcover_wood', 'landcover_grass', 'park'].includes(l.id));
  const vias = g.layers.filter(l => l.type === 'line' && l['source-layer'] === 'transportation' && /motorway|trunk_primary|secondary_tertiary/.test(l.id) && !/casing|tunnel|rail/.test(l.id))
    .map(l => ({ ...l, paint: { ...l.paint, 'line-color': /motorway/.test(l.id) ? '#ffd34d' : '#ffffff', 'line-opacity': .55 } }));
  const nombres = g.layers.filter(l => l.type === 'symbol' && !/poi|shield|arrow|one_way/.test(l.id))
    .map(l => ({ ...l, paint: { ...l.paint, 'text-color': '#ffffff', 'text-halo-color': 'rgba(0,0,0,.75)', 'text-halo-width': 1.6 } }));
  g.sources.pnoa = { type: 'raster', tiles: [PNOA], tileSize: 256, maxzoom: 19, attribution: 'Ortofotos <a href="https://pnoa.ign.es" target="_blank">PNOA</a> cedidas por © Instituto Geográfico Nacional' };
  g.layers = [...debajo, { id: 'pnoa', type: 'raster', source: 'pnoa' }, ...vias, ...nombres];
  return g;
}

async function estiloDe(k) {
  const e = ESTILOS.find(x => x.k === k) || ESTILOS[0];
  if (e.url) return e.url;
  const st = await liberty();
  return e.k === 'satelite' ? aSatelite(st) : aGoogle(st);
}

const webgl = (() => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; } })();
let carga = null;
function cargarMapLibre() {
  if (!carga) carga = (async () => {
    if (!document.querySelector(`link[href="${ML_CSS}"]`)) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = ML_CSS; document.head.appendChild(l); }
    await loadScript(ML_JS); await loadScript(PLUGIN);
    if (!L.maplibreGL) throw new Error('sin plugin');
  })();
  return carga;
}

function raster(map) {
  map.getContainer().classList.add('fondo-raster');
  return L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(map);
}

// Pone el fondo en un mapa de Leaflet y devuelve una función para cambiar de estilo.
export async function ponerFondo(map, k = estiloActual()) {
  let capa = null;
  const poner = async est => {
    const atrib = est === 'satelite' ? 'Ortofotos PNOA © IGN (CC BY 4.0) · © OpenStreetMap' : '© OpenFreeMap · © OpenStreetMap';
    if (capa && capa.getMaplibreMap) {
      try {
        capa.getMaplibreMap().setStyle(await estiloDe(est));
        const ac = map.attributionControl; if (ac) { ac.removeAttribution(capa._atrib); ac.addAttribution(atrib); } capa._atrib = atrib;
      } catch (err) { /* sin conexión: se queda el que había */ }
      return;
    }
    if (capa) return; // fondo clásico: no cambia
    const vivo = () => !!map._container?._leaflet_id && !!map._mapPane; // el mapa pudo quitarse mientras cargaba
    try {
      if (!webgl) throw new Error('sin WebGL');
      await cargarMapLibre();
      if (!vivo()) return;
      const style = await estiloDe(est);
      if (!vivo()) return;
      capa = L.maplibreGL({ style, interactive: false, attribution: atrib }).addTo(map); capa._atrib = atrib;
      map.getContainer().classList.remove('fondo-raster');
      // Si el servidor de mapas no responde, se pasa al mapa clásico
      const gl = capa.getMaplibreMap(); let cargado = false; gl.once('load', () => { cargado = true; });
      setTimeout(() => { if (!cargado && capa?.getMaplibreMap) { map.removeLayer(capa); capa = raster(map); } }, 12000);
    } catch (err) { if (vivo()) capa = raster(map); }
  };
  await poner(k);
  return poner;
}
