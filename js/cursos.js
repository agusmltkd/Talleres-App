// Puente con la plataforma de Cursos de adiestramiento.
// Las dos aplicaciones viven en el mismo sitio (agusmltkd.github.io), así que si la dirección ya tiene
// abierta la sesión de Cursos en este navegador, Workshops la reutiliza sin pedir contraseña.
// La copia la hace la persona con sus propios permisos de Cursos: no hay claves compartidas entre proyectos.
import { S, emit } from './store.js';

const CURSOS_URL = 'https://ylnwqtgyfeqihggjneba.supabase.co';
const CURSOS_KEY = 'sb_publishable_31lO8B4X7GEZm2oHh0WLBQ_EOR4r-XD';
export const ENLACE_INSCRIPCION = 'https://www.wortach.com/curso-adiestramiento';
export const enlaceEstadoTaller = token => `https://agusmltkd.github.io/Cursos/taller.html?t=${encodeURIComponent(token)}`;
const CADA = 6 * 3600e3; // sincronización automática como mucho cada 6 horas

let cliente = null;
async function cursos() {
  if (!cliente) {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    // misma clave de almacenamiento que usa el panel de Cursos: comparten la sesión
    cliente = createClient(CURSOS_URL, CURSOS_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
  }
  return cliente;
}

// ¿Hay sesión de Cursos en este navegador? Devuelve el correo o null.
export async function sesionCursos() {
  if (S.api?.modo !== 'supabase') return null;
  try { const s = (await (await cursos()).auth.getSession()).data.session; return s?.user?.email || null; } catch (e) { return null; }
}
export async function entrarCursos(email, password) {
  const { error } = await (await cursos()).auth.signInWithPassword({ email, password });
  if (error) throw new Error(/Invalid login/i.test(error.message) ? 'Correo o contraseña de Cursos incorrectos.' : error.message);
}

// Trae los datos de Cursos y los guarda en Workshops. Después une los talleres que coinciden claramente.
export async function sincronizar() {
  const sb = await cursos();
  const { data, error } = await sb.rpc('exportar_para_talleres');
  if (error) throw new Error(/todas las sedes|permission|denied/i.test(error.message) ? 'Tu cuenta de Cursos no puede enviar estos datos: hace falta un gestor con acceso a todas las sedes.' : error.message);
  const r = await S.api.rpc('cargar_cursos', { p: data });
  await recargarCursos();
  const n = await unirAutomaticos();
  return { ...r, unidos: n };
}

// Al abrir la app, la dirección sincroniza sola si hace más de 6 horas y hay sesión de Cursos.
export async function sincronizarSiToca() {
  if (S.api?.modo !== 'supabase' || S.yo?.rol !== 'admin') return;
  const ult = S.ajustes.get('cursos_sync')?.valor?.fecha;
  if (ult && Date.now() - new Date(ult).getTime() < CADA) return;
  if (!(await sesionCursos())) return;
  try { const r = await sincronizar(); emit('cursos:sync', r); } catch (e) { console.warn('Cursos:', e.message); }
}

export async function recargarCursos() {
  const [centros, tecnicos, vinculos, ajustes, dup] = await Promise.all(['cursos_centros', 'cursos_tecnicos', 'vinculos_cursos', 'ajustes', 'duplicados_ignorados'].map(t => S.api.list(t).catch(() => [])));
  S.dupIgnorados = dup;
  S.centros = new Map(centros.map(c => [c.id, c]));
  S.tecnicos = new Map();
  for (const t of tecnicos) { if (!S.tecnicos.has(t.centro_id)) S.tecnicos.set(t.centro_id, []); S.tecnicos.get(t.centro_id).push(t); }
  S.vinculos = new Map(vinculos.map(v => [v.centro_id, v]));
  S.ajustes = new Map(ajustes.map(a => [a.clave, a]));
  emit('cambio', ['cursos']);
}

// ------------------------------------------------------------------
// Unir centros de Cursos con talleres del mapa
// Misma normalización que usa Cursos para detectar talleres repetidos.
// ------------------------------------------------------------------
export const normalizar = t => String(t || '').trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[.,\-'"]/g, '').replace(/\s+/g, ' ');
export const nucleo = t => (' ' + normalizar(t) + ' ').replace(/\s(talleres|taller|tallers|tallres|sl|slu|sll|sa|sau|sc|sca|scl|sclv|cb|ltda|lda)(?=\s)/g, ' ').replace(/\s+/g, ' ').trim();
const trigramas = s => { const p = `  ${s} `, o = new Set(); for (let i = 0; i < p.length - 2; i++) o.add(p.slice(i, i + 3)); return o; };
export function parecido(a, b) {
  if (!a || !b) return 0; if (a === b) return 1;
  const A = trigramas(a), B = trigramas(b); let c = 0; for (const x of A) if (B.has(x)) c++;
  return c / (A.size + B.size - c);
}
const mismaProv = (a, b) => !a || !b || normalizar(a) === normalizar(b);

// Candidatos de taller para un centro de Cursos, del más parecido al menos.
export function candidatos(centro, lim = 4) {
  const n = nucleo(centro.nombre);
  return [...S.talleres.values()]
    .filter(t => mismaProv(centro.provincia, t.provincia))
    .map(t => ({ t, p: parecido(n, nucleo(t.nombre)) }))
    .filter(x => x.p >= 0.35)
    .sort((a, b) => b.p - a.p).slice(0, lim);
}

// Propuesta de uniones: claras (mismo nombre y provincia, una sola opción) y dudosas.
export function propuesta() {
  const usados = new Set([...S.vinculos.values()].map(v => v.taller_id).filter(Boolean));
  const claros = [], dudosos = [], sinTaller = [];
  for (const c of S.centros.values()) {
    if (S.vinculos.has(c.id)) continue;
    const cs = candidatos(c).filter(x => !usados.has(x.t.id));
    const exactos = cs.filter(x => x.p === 1);
    if (exactos.length === 1 && (cs.length === 1 || cs[1].p < 0.8)) claros.push({ c, t: exactos[0].t });
    else if (cs.length) dudosos.push({ c, cs });
    else sinTaller.push(c);
  }
  return { claros, dudosos, sinTaller };
}

export async function unirAutomaticos() {
  const { claros } = propuesta();
  for (const { c, t } of claros) await vincular(c.id, t.id, 'auto');
  return claros.length;
}

export async function vincular(centroId, tallerId, metodo = 'manual') {
  const fila = { centro_id: centroId, taller_id: tallerId || null, metodo: tallerId ? metodo : 'descartado' };
  await S.api.upsertPor('vinculos_cursos', fila, 'centro_id');
  S.vinculos.set(centroId, fila); emit('cambio', ['cursos']);
}
export async function desvincular(centroId) {
  await S.api.removePor('vinculos_cursos', { centro_id: centroId });
  S.vinculos.delete(centroId); emit('cambio', ['cursos']);
}

// ------------------------------------------------------------------
// Formación de un taller (para la ficha, el mapa y las rutas)
// ------------------------------------------------------------------
export const SITUACION = {
  caducado: { label: 'Caducado', cls: 'bad', orden: 0 },
  vence_pronto: { label: 'Vence pronto', cls: 'warn', orden: 1 },
  sin_formacion: { label: 'Sin formación', cls: 'gris', orden: 2 },
  inscrito: { label: 'Inscrito', cls: 'azul', orden: 3 },
  al_dia: { label: 'Al día', cls: 'ok', orden: 4 }
};
export function centrosDe(tallerId) { return [...S.vinculos.values()].filter(v => v.taller_id === tallerId).map(v => S.centros.get(v.centro_id)).filter(Boolean); }
export function formacionDe(tallerId) {
  const centros = centrosDe(tallerId);
  if (!centros.length) return null;
  const tecnicos = centros.flatMap(c => S.tecnicos.get(c.id) || []).sort((a, b) => SITUACION[a.situacion].orden - SITUACION[b.situacion].orden || a.nombre.localeCompare(b.nombre, 'es'));
  const n = k => tecnicos.filter(t => t.situacion === k && !t.sin_avisos).length;
  const r = { caducado: n('caducado'), vence_pronto: n('vence_pronto'), al_dia: n('al_dia'), inscrito: n('inscrito'), sin_formacion: n('sin_formacion') };
  const estado = r.caducado ? 'caducado' : r.vence_pronto ? 'vence_pronto' : r.inscrito ? 'inscrito' : r.al_dia ? 'al_dia' : 'sin_formacion';
  return { centros, tecnicos, r, estado, porRenovar: r.caducado + r.vence_pronto };
}
