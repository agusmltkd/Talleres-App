// Fondo del mapa: mapas vectoriales modernos de OpenFreeMap (gratis, sin claves, uso comercial permitido).
// Si el dispositivo no puede (sin WebGL o sin conexión con el servidor), se usa el mapa clásico de OpenStreetMap.
import { loadScript } from './util.js';

const ML_JS = 'https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.js';
const ML_CSS = 'https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.css';
const PLUGIN = 'https://cdn.jsdelivr.net/npm/@maplibre/maplibre-gl-leaflet@0.1.4/leaflet-maplibre-gl.js';
export const ESTILOS = [
  { k: 'calles', label: 'Calles', url: 'https://tiles.openfreemap.org/styles/liberty' },
  { k: 'claro', label: 'Claro', url: 'https://tiles.openfreemap.org/styles/positron' },
  { k: 'oscuro', label: 'Oscuro', url: 'https://tiles.openfreemap.org/styles/dark' }
];
const oscuroDelSistema = () => matchMedia?.('(prefers-color-scheme: dark)').matches;
export function estiloActual() {
  try { const e = localStorage.getItem('mapa-estilo'); if (ESTILOS.some(x => x.k === e)) return e; } catch (e) {}
  return oscuroDelSistema() ? 'oscuro' : 'calles';
}
export function guardarEstilo(k) { try { localStorage.setItem('mapa-estilo', k); } catch (e) {} }

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
    const e = ESTILOS.find(x => x.k === est) || ESTILOS[0];
    if (capa && capa.getMaplibreMap) { capa.getMaplibreMap().setStyle(e.url); return; }
    if (capa) return; // fondo clásico: no cambia
    try {
      if (!webgl) throw new Error('sin WebGL');
      await cargarMapLibre();
      capa = L.maplibreGL({ style: e.url, interactive: false }).addTo(map);
      map.getContainer().classList.remove('fondo-raster');
      // Si el servidor de mapas no responde, se pasa al mapa clásico
      const gl = capa.getMaplibreMap(); let cargado = false; gl.once('load', () => { cargado = true; });
      setTimeout(() => { if (!cargado && capa?.getMaplibreMap) { map.removeLayer(capa); capa = raster(map); } }, 12000);
    } catch (err) { capa = raster(map); }
  };
  await poner(k);
  return poner;
}
