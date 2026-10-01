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
  online: true
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

// ---- ruta del día (se guarda en este dispositivo, por usuario) ----
export function getRuta() { try { return JSON.parse(localStorage.getItem('ruta:' + S.yo?.id) || '[]'); } catch (e) { return []; } }
export function setRuta(r) { try { localStorage.setItem('ruta:' + S.yo?.id, JSON.stringify(r)); } catch (e) { /* sin almacenamiento */ } emit('ruta:cambio', r); }
