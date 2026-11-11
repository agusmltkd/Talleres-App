// Estado de la aplicación y sincronización en tiempo real
import { debounce, toast } from './util.js';

export const S = {
  api: null,
  yo: null,
  perfiles: new Map(),
  talleres: new Map(),
  visitas: new Map(),
  ventas: new Map(),
  equipos: new Map(),
  fechaRegistro: '',
  online: true,
  // copia de Cursos
  centros: new Map(),      // centro de Cursos por id
  tecnicos: new Map(),     // lista de técnicos por centro de Cursos
  vinculos: new Map(),     // unión centro de Cursos → taller, por centro
  ajustes: new Map()
};

// ---- eventos internos ----
const subs = new Map();
export function on(ev, fn) { if (!subs.has(ev)) subs.set(ev, []); subs.get(ev).push(fn); }
export function emit(ev, data) { (subs.get(ev) || []).forEach(fn => { try { fn(data); } catch (e) { console.error(e); } }); }
const cambiado = debounce(tabla => emit('cambio', tabla), 120);
const pendientes = new Set();
const avisar = tabla => { pendientes.add(tabla); flush(); };
const flush = debounce(() => { const t = [...pendientes]; pendientes.clear(); emit('cambio', t); }, 120);

// ---- permisos (la base de datos los comprueba igualmente) ----
export const esAdmin = () => S.yo?.rol === 'admin';
export const puedeEditar = t => !!t && (esAdmin() || t.comercial_id === S.yo?.id);
// Un comercial solo ve sus talleres (la base de datos también lo aplica).
export const visiblePara = t => !!t && (esAdmin() || t.comercial_id === S.yo?.id);
export const nombreDe = id => S.perfiles.get(id)?.nombre || '';
export const colorDe = id => S.perfiles.get(id)?.color || '';
export const comerciales = () => [...S.perfiles.values()].filter(p => p.activo).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

export async function cargarTodo() {
  const [perfiles, talleres, visitas, ventas, equipos] = await Promise.all(
    ['perfiles', 'talleres', 'visitas', 'ventas', 'equipos'].map(t => S.api.list(t)));
  S.perfiles = new Map(perfiles.map(r => [r.id, r]));
  S.talleres = new Map(talleres.filter(visiblePara).map(r => [r.id, r]));
  const deMisTalleres = r => esAdmin() || S.talleres.has(r.taller_id) || r.comercial_id === S.yo?.id;
  S.visitas = new Map(visitas.filter(deMisTalleres).map(r => [r.id, r]));
  S.ventas = new Map(ventas.filter(deMisTalleres).map(r => [r.id, r]));
  S.equipos = new Map(equipos.filter(deMisTalleres).map(r => [r.id, r]));
  ultimaCarga = Date.now();
  emit('cambio', ['perfiles', 'talleres', 'visitas', 'ventas', 'equipos']);
}
let ultimaCarga = 0;
// Al volver a la app tras un rato, se recarga todo (por si la dirección ha reasignado talleres).
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && S.yo && Date.now() - ultimaCarga > 60000) cargarTodo().catch(() => {});
});

export function suscribir() {
  S.api.suscribir((tabla, ev, nuevo, viejo) => {
    if (tabla === '__estado') {
      S.online = ev === 'SUBSCRIBED'; emit('conexion', S.online);
      return;
    }
    if (tabla === 'vinculos_cursos') {
      if (ev === 'DELETE') S.vinculos.delete(viejo?.centro_id); else if (nuevo?.centro_id) S.vinculos.set(nuevo.centro_id, nuevo);
      avisar('cursos'); return;
    }
    if (tabla === 'ajustes') { if (nuevo?.clave) S.ajustes.set(nuevo.clave, nuevo); avisar('cursos'); return; }
    const m = S[tabla]; if (!m) return;
    if (ev === 'DELETE') m.delete(viejo?.id);
    else if (nuevo?.id) {
      const r = { ...(m.get(nuevo.id) || {}), ...nuevo };
      const fuera = tabla === 'talleres' ? !visiblePara(r)
        : ['visitas', 'ventas', 'equipos'].includes(tabla) && !esAdmin() && !S.talleres.has(r.taller_id) && r.comercial_id !== S.yo?.id;
      if (fuera) m.delete(r.id); else m.set(r.id, r);
    }
    if (tabla === 'perfiles' && nuevo?.id === S.yo?.id) S.yo = { ...S.yo, ...nuevo };
    avisar(tabla);
  });
}

// ---- escrituras: actualizan el estado local al momento ----
export async function guardar(tabla, id, patch) {
  const m = S[tabla]; const antes = m.get(id);
  if (antes) { m.set(id, { ...antes, ...patch }); avisar(tabla); }
  try {
    const r = await S.api.update(tabla, id, patch);
    m.set(id, r); avisar(tabla); return r;
  } catch (e) {
    if (antes) { m.set(id, antes); avisar(tabla); }
    toast(e.message, 'error'); throw e;
  }
}
export async function crear(tabla, row) {
  try { const r = await S.api.insert(tabla, row); if (S[tabla]) { S[tabla].set(r.id, r); avisar(tabla); } return r; }
  catch (e) { toast(e.message, 'error'); throw e; }
}
export async function borrar(tabla, id) {
  const m = S[tabla]; const antes = m?.get(id);
  if (m) { m.delete(id); avisar(tabla); }
  try { await S.api.remove(tabla, id); }
  catch (e) { if (antes) { m.set(id, antes); avisar(tabla); } toast(e.message, 'error'); throw e; }
}
export async function guardarVarios(tabla, ids, patch) {
  const rows = await S.api.updateMany(tabla, ids, patch);
  for (const r of rows) S[tabla].set(r.id, r);
  avisar(tabla); return rows.length;
}
export { cambiado };

// ---- deshacer: el aviso trae un botón que devuelve las cosas a como estaban ----
export async function guardarConDeshacer(tabla, id, patch, msg) {
  const fila = S[tabla]?.get(id); const antes = {};
  for (const k of Object.keys(patch)) antes[k] = fila ? fila[k] ?? null : null;
  const r = await guardar(tabla, id, patch);
  if (fila && Object.keys(patch).some(k => JSON.stringify(antes[k]) !== JSON.stringify(patch[k] ?? null)))
    toast(msg, '', { deshacer: () => guardar(tabla, id, antes) });
  return r;
}
export async function borrarConDeshacer(tabla, id, msg, fila = S[tabla]?.get(id)) {
  if (S[tabla]) await borrar(tabla, id); else await S.api.remove(tabla, id);
  if (fila) toast(msg, '', { deshacer: async () => { const { ultima_visita, ...copia } = fila; return crear(tabla, copia); } });
}
// Cambios en bloque (asignaciones): se deshacen devolviendo a cada taller su valor anterior
export async function guardarVariosConDeshacer(tabla, ids, patch, msg) {
  const previos = new Map();
  for (const id of ids) { const f = S[tabla].get(id); const k = JSON.stringify(Object.fromEntries(Object.keys(patch).map(c => [c, f?.[c] ?? null]))); if (!previos.has(k)) previos.set(k, []); previos.get(k).push(id); }
  const n = await guardarVarios(tabla, ids, patch);
  toast(msg, '', { deshacer: async () => { for (const [k, grupo] of previos) await guardarVarios(tabla, grupo, JSON.parse(k)); } });
  return n;
}

// ---- ruta del día (se guarda en este dispositivo, por usuario) ----
export function getRuta() { try { return JSON.parse(localStorage.getItem('ruta:' + S.yo?.id) || '[]'); } catch (e) { return []; } }
export function setRuta(r) { try { localStorage.setItem('ruta:' + S.yo?.id, JSON.stringify(r)); } catch (e) { /* sin almacenamiento */ } emit('ruta:cambio', r); }
