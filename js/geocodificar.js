// Búsqueda de la dirección exacta con Nominatim (OpenStreetMap).
// Norma de uso: como mucho una petición por segundo y sin descargas masivas.
import { hav } from './util.js';

const PAISES = { ES: 'España', PT: 'Portugal', AD: 'Andorra' };
let ultima = 0;
const GENERICOS = new Set(['country', 'state', 'province', 'region', 'county', 'municipality', 'city', 'town', 'village', 'postcode', 'city_district']);
const esperar = ms => new Promise(r => setTimeout(r, ms));

function limpiar(dir) {
  return String(dir || '')
    .replace(/\b(NAVE|NAV|PARCELA|PARC|MANZANA|LOTE|LOCAL|BAJO|SECTOR|SEC)\.?\s*[\w\-/,]*/gi, ' ')
    .replace(/\bCL\b|\bC\//gi, 'Calle ').replace(/\bAVDA?\b\.?/gi, 'Avenida ').replace(/\bCTRA?\b\.?/gi, 'Carretera ')
    .replace(/\bPOL\.?\s*IND\.?|\bP\.\s*I\.?|\bPI\b/gi, 'Polígono Industrial ')
    .replace(/\s+/g, ' ').trim();
}

async function consulta(params) {
  const espera = 1100 - (Date.now() - ultima); if (espera > 0) await esperar(espera);
  ultima = Date.now();
  const url = 'https://nominatim.openstreetmap.org/search?' + new URLSearchParams({ format: 'jsonv2', limit: '1', 'accept-language': 'es', ...params });
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  if (r.status === 429) { await esperar(5000); return []; }
  if (!r.ok) throw new Error('El servicio de direcciones no responde.');
  return r.json();
}

// Devuelve {lat, lon, texto} o null. Solo acepta resultados cerca de la posición aproximada actual.
export async function buscarDireccion(t) {
  const pais = PAISES[t.pais] || 'España';
  const ref = t.lat != null ? { lat: t.lat, lon: t.lon } : null;
  const intentos = [
    { q: `${limpiar(t.direccion)}, ${t.cp || ''} ${t.poblacion || ''}, ${pais}` },
    { street: limpiar(t.direccion).split(',')[0], postalcode: t.cp || '', city: t.poblacion || '', country: pais },
    { q: `${t.nombre}, ${t.poblacion || ''}, ${pais}` }
  ];
  for (const p of intentos) {
    const res = await consulta(p);
    const r = res && res[0];
    if (!r) continue;
    if (GENERICOS.has(r.addresstype)) continue; // solo el pueblo o el código postal: no mejora nada
    const pos = { lat: +r.lat, lon: +r.lon };
    if (ref && hav(ref, pos) > 25) continue;
    return { ...pos, texto: r.display_name };
  }
  return null;
}
