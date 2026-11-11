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
const EXTRA = ['cursos_centros', 'cursos_tecnicos', 'vinculos_cursos', 'ajustes', 'duplicados_ignorados', 'historial'];

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
      const orden = { vinculos_cursos: 'centro_id', ajustes: 'clave', duplicados_ignorados: 'a' }[table] || 'id';
      const rows = ok(await apply(sb.from(table).select('*')).order(orden).range(from, from + page - 1));
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
    async rpc(fn, args = {}) { return ok(await sb.rpc(fn, args)); },
    async upsertPor(table, row, clave) { return ok(await sb.from(table).upsert(row, { onConflict: clave }).select().single()); },
    async removePor(table, campo, valor) { const f = typeof campo === 'object' ? campo : { [campo]: valor }; let q = sb.from(table).delete(); for (const [k, v] of Object.entries(f)) q = q.eq(k, v); ok(await q); },
    async historial({ taller_id = null, limite = 60 } = {}) {
      let q = sb.from('historial').select('*').order('fecha', { ascending: false }).limit(limite);
      if (taller_id) q = q.eq('taller_id', taller_id);
      return ok(await q);
    },
    suscribir(cb) {
      const ch = sb.channel('cambios');
      for (const t of ['talleres', 'visitas', 'ventas', 'equipos', 'perfiles', 'vinculos_cursos', 'ajustes']) ch.on('postgres_changes', { event: '*', schema: 'public', table: t }, p => cb(t, p.eventType, p.new, p.old));
      ch.subscribe(status => cb('__estado', status));
    }
  };
}

// ------------------------------------------------------------------
// Demostración: datos en localStorage, tres usuarios de ejemplo
// ------------------------------------------------------------------
const DEMO_KEY = 'tacografo-demo-v1';
// Modo práctica: copia limpia que vive solo en esta pestaña y se borra al salir.
export const PRACTICA = typeof location !== 'undefined' && new URLSearchParams(location.search).has('practica');
const DEMO_USERS = [
  { id: 'demo-admin', email: 'direccion@ejemplo.com', nombre: 'Dirección (demo)', rol: 'admin', color: '#1f7f4a', activo: true },
  { id: 'demo-com-1', email: 'comercial.sur@ejemplo.com', nombre: 'Comercial Sur (demo)', rol: 'comercial', color: '#c2410c', activo: true },
  { id: 'demo-com-2', email: 'comercial.norte@ejemplo.com', nombre: 'Comercial Norte (demo)', rol: 'comercial', color: '#6d28d9', activo: true }
];
async function demoApi() {
  let db;
  const almacen = PRACTICA ? sessionStorage : localStorage, clave = PRACTICA ? 'tacografo-practica-v1' : DEMO_KEY;
  const save = () => { try { almacen.setItem(clave, JSON.stringify(db)); } catch (e) { /* sin almacenamiento: vive en memoria */ } };
  try { db = JSON.parse(almacen.getItem(clave) || 'null'); } catch (e) { db = null; }
  if (!db) {
    db = { perfiles: DEMO_USERS.map(u => ({ ...u })), talleres: [], contactos: [], visitas: [], ventas: [], equipos: [] };
    const seed = await fetch('data/talleres.json').then(r => r.json());
    db.talleres = seed.talleres.map(t => ({ ...t, estado: '', comercial_id: null, telefono: null, email: null, web: null, notas: '', ultima_visita: null, creado: new Date().toISOString(), actualizado: new Date().toISOString(), actualizado_por: null }));
    Object.assign(db, cursosDeEjemplo(db.talleres));
    if (PRACTICA) practicaDeEjemplo(db);
    save();
  }
  for (const t of EXTRA) db[t] ||= [];
  if (!db.cursos_centros.length) { Object.assign(db, cursosDeEjemplo(db.talleres)); save(); }
  let nHist = db.historial.reduce((m, h) => Math.max(m, h.id), 0);
  const RUIDO = ['actualizado', 'actualizado_por', 'ultima_visita', 'creado', 'creado_por'];
  const anotar = (tabla, accion, antes, despues) => {
    if (!['talleres', 'visitas', 'ventas', 'equipos', 'contactos'].includes(tabla)) return;
    let a = antes, d = despues;
    if (accion === 'cambio') {
      a = {}; d = {};
      for (const k of Object.keys(despues)) if (!RUIDO.includes(k) && JSON.stringify(antes[k] ?? null) !== JSON.stringify(despues[k] ?? null)) { a[k] = antes[k] ?? null; d[k] = despues[k] ?? null; }
      if (!Object.keys(d).length) return;
    }
    const r = antes || despues;
    db.historial.unshift({ id: ++nHist, fecha: new Date().toISOString(), usuario: sesionId, tabla, registro: r.id, taller_id: tabla === 'talleres' ? r.id : r.taller_id, accion, antes: a, despues: d });
    if (db.historial.length > 3000) db.historial.length = 3000;
  };
  let sesionId = null;
  try { sesionId = sessionStorage.getItem(PRACTICA ? 'tacografo-practica-user' : 'tacografo-demo-user'); } catch (e) {}
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
    practica: PRACTICA,
    async entrar(id) { sesionId = id; try { sessionStorage.setItem(PRACTICA ? 'tacografo-practica-user' : 'tacografo-demo-user', id); } catch (e) {} },
    async salir() { sesionId = null; try { sessionStorage.removeItem(PRACTICA ? 'tacografo-practica-user' : 'tacografo-demo-user'); } catch (e) {} },
    async recordar() {}, async cambiarClave() {},
    async yo() { return db.perfiles.find(p => p.id === sesionId) || null; },
    async list(table, filtro = {}) { return (db[table] || []).filter(r => Object.entries(filtro).every(([k, v]) => r[k] === v)).map(r => ({ ...r })); },
    async insert(table, row) {
      const r = { id: uid(), creado: new Date().toISOString(), ...row };
      if (['visitas', 'ventas', 'equipos'].includes(table)) r.creado_por = sesionId;
      if (table === 'talleres') { r.actualizado = r.creado; r.actualizado_por = sesionId; }
      db[table].push(r); anotar(table, 'alta', null, { ...r }); save(); emit(table, 'INSERT', { ...r }, {});
      if (table === 'visitas') recalcUltima(r.taller_id);
      return { ...r };
    },
    async update(table, id, patch) {
      const r = db[table].find(x => x.id === id); if (!r) throw new ApiError('0 rows');
      const old = { ...r }; Object.assign(r, patch);
      if (table === 'talleres') { r.actualizado = new Date().toISOString(); r.actualizado_por = sesionId; }
      anotar(table, 'cambio', old, { ...r }); save(); emit(table, 'UPDATE', { ...r }, old);
      if (table === 'visitas') recalcUltima(r.taller_id);
      return { ...r };
    },
    async remove(table, id) {
      const i = db[table].findIndex(x => x.id === id); if (i < 0) return;
      const [old] = db[table].splice(i, 1); anotar(table, 'baja', old, null); save(); emit(table, 'DELETE', {}, old);
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
      for (const id of ids) { const r = db[table].find(x => x.id === id); if (r) { const old = { ...r }; Object.assign(r, patch); anotar(table, 'cambio', old, { ...r }); if (table === 'talleres') { r.actualizado = new Date().toISOString(); r.actualizado_por = sesionId; } out.push({ ...r }); emit(table, 'UPDATE', { ...r }, {}); } }
      save(); return out;
    },
    async upsertPor(table, row, clave) {
      const ks = clave.split(','); const r = db[table].find(x => ks.every(k => x[k] === row[k]));
      if (r) Object.assign(r, row); else db[table].push({ creado: new Date().toISOString(), creado_por: sesionId, ...row });
      save(); emit(table, r ? 'UPDATE' : 'INSERT', { ...row }, {}); return { ...row };
    },
    async removePor(table, campo, valor) { const f = typeof campo === 'object' ? campo : { [campo]: valor }; db[table] = db[table].filter(x => !Object.entries(f).every(([k, v]) => x[k] === v)); save(); },
    async historial({ taller_id = null, limite = 60 } = {}) { return db.historial.filter(h => !taller_id || h.taller_id === taller_id).slice(0, limite).map(h => ({ ...h })); },
    async rpc(fn, args = {}) {
      if (fn === 'cargar_cursos') return { centros: db.cursos_centros.length, tecnicos: db.cursos_tecnicos.length };
      if (fn === 'unir_talleres') {
        const { p_origen: o, p_destino: d } = args;
        const O = db.talleres.find(x => x.id === o), D = db.talleres.find(x => x.id === d);
        if (!O || !D) throw new ApiError('No encuentro uno de los dos talleres');
        for (const t of ['visitas', 'ventas', 'equipos', 'contactos', 'vinculos_cursos']) for (const r of db[t]) if (r.taller_id === o) { r.taller_id = d; emit(t, 'UPDATE', { ...r }, {}); }
        const antes = { ...D };
        for (const k of ['telefono', 'email', 'web', 'cif']) if (!D[k] && O[k]) D[k] = O[k];
        D.notas = [D.notas, O.notas].filter(Boolean).join('\n'); if (!D.estado) D.estado = O.estado || ''; if (!D.comercial_id) D.comercial_id = O.comercial_id;
        D.redes = [...new Set([...(D.redes || []), ...(O.redes || [])])];
        if (!['exacta', 'manual'].includes(D.precision) && ['exacta', 'manual'].includes(O.precision)) Object.assign(D, { lat: O.lat, lon: O.lon, precision: O.precision });
        anotar('talleres', 'cambio', antes, { ...D }); emit('talleres', 'UPDATE', { ...D }, antes);
        await this.remove('talleres', o); recalcUltima(d); save(); return null;
      }
      throw new ApiError('Función no disponible en la demostración');
    },
    suscribir(cb) { listeners.push(cb); cb('__estado', 'SUBSCRIBED'); },
    reiniciarDemo() { try { almacen.removeItem(clave); } catch (e) {} }
  };
}

// Modo práctica: los comerciales de ejemplo ya tienen zona, clientes y alguna cita, para practicar con algo real
function practicaDeEjemplo(db) {
  const SUR = ['Andalucía', 'Extremadura', 'Región de Murcia', 'Murcia'], NORTE = ['Galicia', 'Principado de Asturias', 'Asturias', 'Cantabria', 'País Vasco', 'Castilla y León'];
  const hoy = new Date().toISOString().slice(0, 10); const dia = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  let i = 0;
  for (const t of db.talleres) {
    const com = SUR.includes(t.ccaa) ? 'demo-com-1' : NORTE.includes(t.ccaa) ? 'demo-com-2' : null; if (!com) continue;
    t.comercial_id = com; i++;
    t.estado = ['cliente', 'potencial', 'potencial', 'cliente', '', 'competencia', '', 'cliente'][i % 8];
    if (t.estado === 'cliente' && i % 3) {
      db.visitas.push({ id: uid(), taller_id: t.id, comercial_id: com, fecha: dia(-20 - (i % 150)), hora: null, tipo: 'visita', estado: 'hecha', resultado: 'interesado', resumen: 'Visita de ejemplo', proximo_paso: '', creado: new Date().toISOString(), creado_por: com });
      t.ultima_visita = dia(-20 - (i % 150));
    }
    if (i % 23 === 0) db.visitas.push({ id: uid(), taller_id: t.id, comercial_id: com, fecha: i % 2 ? hoy : dia(2), hora: '10:00', tipo: 'visita', estado: 'planificada', resultado: '', resumen: 'Cita de ejemplo', proximo_paso: '', creado: new Date().toISOString(), creado_por: com });
    if (i % 17 === 0) db.ventas.push({ id: uid(), taller_id: t.id, comercial_id: com, fecha: dia(-10), tipo: 'presupuesto', estado: 'abierto', concepto: 'Banco de pruebas (ejemplo)', importe: 4800, notas: null, creado: new Date().toISOString(), creado_por: com });
  }
}

// Datos de ejemplo de Cursos para la demostración: técnicos inventados en algunos talleres reales del registro.
function cursosDeEjemplo(talleres) {
  const NOM = ['Antonio', 'José', 'Manuel', 'Francisco', 'David', 'Juan', 'Javier', 'Daniel', 'Carlos', 'Miguel', 'Rafael', 'Pedro', 'Alberto', 'Sergio', 'Pablo', 'Luis', 'Raúl', 'Rubén'];
  const APE = ['García', 'Romero', 'Martín', 'Navarro', 'Ruiz', 'Moreno', 'Castro', 'Ortega', 'Delgado', 'Vargas', 'Molina', 'Rubio', 'Serrano', 'Ramos'];
  const elegidos = talleres.filter((t, i) => i % 9 === 0 && t.pais === 'ES').slice(0, 70);
  const hoy = new Date(); const d = n => { const x = new Date(hoy); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
  let k = 0; const al = () => { k = (k * 9301 + 49297) % 233280; return k / 233280; };
  const cursos_centros = [], cursos_tecnicos = [];
  for (const t of elegidos) {
    const id = uid();
    cursos_centros.push({ id, nombre: t.nombre, provincia: t.provincia, contacto: null, telefono: null, email: null, token: uid(), creado: d(-400) });
    const n = 1 + Math.floor(al() * 3);
    for (let i = 0; i < n; i++) {
      const r = al(), ult = r < .3 ? -420 - Math.floor(al() * 200) : r < .4 ? -330 : -Math.floor(al() * 300) - 10;
      const sit = r < .3 ? 'caducado' : r < .4 ? 'vence_pronto' : r < .5 ? 'inscrito' : 'al_dia';
      cursos_tecnicos.push({ id: uid(), centro_id: id, nombre: `${NOM[Math.floor(al() * NOM.length)]} ${APE[Math.floor(al() * APE.length)]} ${APE[Math.floor(al() * APE.length)]}`.toUpperCase(),
        ultimo_tipo: al() < .25 ? 'iniciacion' : 'actualizacion', ultima_fecha: d(ult), renovar_antes: d(ult + 365), proximo_curso: sit === 'inscrito' ? d(20 + Math.floor(al() * 40)) : null,
        situacion: sit, tiene_iniciacion: true, sin_avisos: false, n_cursos: 1 + Math.floor(al() * 4) });
    }
  }
  return { cursos_centros, cursos_tecnicos, vinculos_cursos: [], ajustes: [{ clave: 'cursos_sync', valor: { fecha: new Date().toISOString(), centros: cursos_centros.length, tecnicos: cursos_tecnicos.length, demo: true } }], duplicados_ignorados: [], historial: [] };
}

export async function crearApi(modo) { return modo === 'demo' ? demoApi() : supabaseApi(); }
