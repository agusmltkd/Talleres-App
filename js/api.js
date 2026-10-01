// Acceso a datos: Supabase en producción, o un modo demostración que guarda en este navegador.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { uid } from './util.js';

export const supabaseConfigurado = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(SUPABASE_URL) && !SUPABASE_ANON_KEY.startsWith('PEGA');

// Protección: si alguien pega por error la clave secreta, la app se niega a arrancar.
export const claveSecreta = (() => {
  const k = String(SUPABASE_ANON_KEY);
  if (k.startsWith('sb_secret_')) return true;
  try { return JSON.parse(atob(k.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role === 'service_role'; } catch { return false; }
})();

export const TABLAS = ['perfiles', 'talleres', 'contactos', 'visitas', 'ventas', 'equipos'];

function mensaje(error) {
  const m = String(error?.message || error || '');
  if (/Invalid login credentials/i.test(m)) return 'Email o contraseña incorrectos.';
  if (/Email not confirmed/i.test(m)) return 'Tienes que confirmar tu email antes de entrar.';
  if (/row-level security|permission denied|PGRST116|0 rows/i.test(m)) return 'No tienes permiso para hacer este cambio.';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Sin conexión. Revisa tu internet e inténtalo de nuevo.';
  if (/rate limit/i.test(m)) return 'Demasiados intentos seguidos. Espera un momento.';
  return m || 'Algo ha fallado.';
}
export class ApiError extends Error { constructor(e) { super(mensaje(e)); this.original = e; } }

// ------------------------------------------------------------------
// Supabase
// ------------------------------------------------------------------
async function supabaseApi() {
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
  const ok = r => { if (r.error) throw new ApiError(r.error); return r.data; };
  const listAll = async (table, apply = q => q) => {
    const page = 1000; let from = 0, out = [];
    for (;;) {
      const rows = ok(await apply(sb.from(table).select('*')).order('id').range(from, from + page - 1));
      out = out.concat(rows); if (rows.length < page) return out; from += page;
    }
  };
  return {
    modo: 'supabase',
    async sesion() { return (await sb.auth.getSession()).data.session; },
    onAuth(cb) { sb.auth.onAuthStateChange((ev, s) => cb(ev, s)); },
    async entrar(email, password) { ok(await sb.auth.signInWithPassword({ email, password })); },
    async salir() { await sb.auth.signOut(); },
    async recordar(email) { ok(await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname })); },
    async cambiarClave(password) { ok(await sb.auth.updateUser({ password })); },
    async yo() {
      const u = (await sb.auth.getUser()).data.user; if (!u) return null;
      return ok(await sb.from('perfiles').select('*').eq('id', u.id).maybeSingle());
    },
    list: (table, filtro = {}) => listAll(table, q => { for (const [k, v] of Object.entries(filtro)) q = q.eq(k, v); return q; }),
    async insert(table, row) { return ok(await sb.from(table).insert(row).select().single()); },
    async update(table, id, patch) {
      const rows = ok(await sb.from(table).update(patch).eq('id', id).select());
      if (!rows.length) throw new ApiError('0 rows'); return rows[0];
    },
    async remove(table, id) { const rows = ok(await sb.from(table).delete().eq('id', id).select('id')); if (!rows.length) throw new ApiError('0 rows'); },
    async upsert(table, rows, { soloNuevos = false } = {}) {
      let n = 0;
      for (let i = 0; i < rows.length; i += 200) {
        const r = ok(await sb.from(table).upsert(rows.slice(i, i + 200), { onConflict: 'id', ignoreDuplicates: soloNuevos }).select('id'));
        n += r.length;
      }
      return n;
    },
    async updateMany(table, ids, patch) {
      let out = [];
      for (let i = 0; i < ids.length; i += 200) out = out.concat(ok(await sb.from(table).update(patch).in('id', ids.slice(i, i + 200)).select()));
      return out;
    },
    suscribir(cb) {
      const ch = sb.channel('cambios');
      for (const t of ['talleres', 'visitas', 'ventas', 'equipos', 'perfiles']) ch.on('postgres_changes', { event: '*', schema: 'public', table: t }, p => cb(t, p.eventType, p.new, p.old));
      ch.subscribe(status => cb('__estado', status));
    }
  };
}

// ------------------------------------------------------------------
// Demostración: datos en localStorage, tres usuarios de ejemplo
// ------------------------------------------------------------------
const DEMO_KEY = 'tacografo-demo-v1';
const DEMO_USERS = [
  { id: 'demo-admin', email: 'direccion@ejemplo.com', nombre: 'Dirección (demo)', rol: 'admin', color: '#1f7f4a', activo: true },
  { id: 'demo-com-1', email: 'comercial.sur@ejemplo.com', nombre: 'Comercial Sur (demo)', rol: 'comercial', color: '#c2410c', activo: true },
  { id: 'demo-com-2', email: 'comercial.norte@ejemplo.com', nombre: 'Comercial Norte (demo)', rol: 'comercial', color: '#6d28d9', activo: true }
];
async function demoApi() {
  let db;
  const save = () => { try { localStorage.setItem(DEMO_KEY, JSON.stringify(db)); } catch (e) { /* sin almacenamiento: la demo vive en memoria */ } };
  try { db = JSON.parse(localStorage.getItem(DEMO_KEY) || 'null'); } catch (e) { db = null; }
  if (!db) {
    db = { perfiles: DEMO_USERS.map(u => ({ ...u })), talleres: [], contactos: [], visitas: [], ventas: [], equipos: [] };
    const seed = await fetch('data/talleres.json').then(r => r.json());
    db.talleres = seed.talleres.map(t => ({ ...t, estado: '', comercial_id: null, telefono: null, email: null, web: null, notas: '', ultima_visita: null, creado: new Date().toISOString(), actualizado: new Date().toISOString(), actualizado_por: null }));
    save();
  }
  let sesionId = null;
  try { sesionId = sessionStorage.getItem('tacografo-demo-user'); } catch (e) {}
  const listeners = [];
  const emit = (t, ev, nw, old) => listeners.forEach(cb => cb(t, ev, nw, old));
  const recalcUltima = tid => {
    const t = db.talleres.find(x => x.id === tid); if (!t) return;
    const f = db.visitas.filter(v => v.taller_id === tid && v.estado === 'hecha').map(v => v.fecha).sort().pop() || null;
    if (t.ultima_visita !== f) { t.ultima_visita = f; emit('talleres', 'UPDATE', { ...t }, {}); }
  };
  return {
    modo: 'demo',
    usuariosDemo: DEMO_USERS,
    async sesion() { return sesionId ? { user: { id: sesionId } } : null; },
    onAuth() {},
    async entrar(id) { sesionId = id; try { sessionStorage.setItem('tacografo-demo-user', id); } catch (e) {} },
    async salir() { sesionId = null; try { sessionStorage.removeItem('tacografo-demo-user'); } catch (e) {} },
    async recordar() {}, async cambiarClave() {},
    async yo() { return db.perfiles.find(p => p.id === sesionId) || null; },
    async list(table, filtro = {}) { return db[table].filter(r => Object.entries(filtro).every(([k, v]) => r[k] === v)).map(r => ({ ...r })); },
    async insert(table, row) {
      const r = { id: uid(), creado: new Date().toISOString(), ...row };
      if (['visitas', 'ventas', 'equipos'].includes(table)) r.creado_por = sesionId;
      if (table === 'talleres') { r.actualizado = r.creado; r.actualizado_por = sesionId; }
      db[table].push(r); save(); emit(table, 'INSERT', { ...r }, {});
      if (table === 'visitas') recalcUltima(r.taller_id);
      return { ...r };
    },
    async update(table, id, patch) {
      const r = db[table].find(x => x.id === id); if (!r) throw new ApiError('0 rows');
      const old = { ...r }; Object.assign(r, patch);
      if (table === 'talleres') { r.actualizado = new Date().toISOString(); r.actualizado_por = sesionId; }
      save(); emit(table, 'UPDATE', { ...r }, old);
      if (table === 'visitas') recalcUltima(r.taller_id);
      return { ...r };
    },
    async remove(table, id) {
      const i = db[table].findIndex(x => x.id === id); if (i < 0) return;
      const [old] = db[table].splice(i, 1); save(); emit(table, 'DELETE', {}, old);
      if (table === 'visitas') recalcUltima(old.taller_id);
      if (table === 'talleres') for (const t of ['contactos', 'visitas', 'ventas', 'equipos']) db[t] = db[t].filter(x => x.taller_id !== id);
    },
    async upsert(table, rows, { soloNuevos = false } = {}) {
      let n = 0;
      for (const row of rows) {
        const r = db[table].find(x => x.id === row.id);
        if (r) { if (!soloNuevos) { Object.assign(r, row); n++; emit(table, 'UPDATE', { ...r }, {}); } }
        else { db[table].push({ ...row }); n++; emit(table, 'INSERT', { ...row }, {}); }
      }
      save(); return n;
    },
    async updateMany(table, ids, patch) {
      const out = [];
      for (const id of ids) { const r = db[table].find(x => x.id === id); if (r) { Object.assign(r, patch); if (table === 'talleres') { r.actualizado = new Date().toISOString(); r.actualizado_por = sesionId; } out.push({ ...r }); emit(table, 'UPDATE', { ...r }, {}); } }
      save(); return out;
    },
    suscribir(cb) { listeners.push(cb); cb('__estado', 'SUBSCRIBED'); },
    reiniciarDemo() { try { localStorage.removeItem(DEMO_KEY); } catch (e) {} }
  };
}

export async function crearApi(modo) { return modo === 'demo' ? demoApi() : supabaseApi(); }
