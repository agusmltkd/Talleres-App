// Administración: usuarios, asignaciones, carga de datos, ubicaciones exactas y Excel
import { S, on, emit, esAdmin, comerciales, nombreDe, guardar, guardarVarios } from './store.js';
import { $, $$, esc, norm, toast, loadScript, fmtNum, COLORES, estadoInfo, ORIGEN, PRECISION, TIPOS_VISITA, hoy, uid, confirmBtn } from './util.js';
import { SUPABASE_URL } from './config.js';
import { buscarDireccion } from './geocodificar.js';

const XLSX_URL = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
let geoParar = false, geoEnMarcha = false;

export function iniciarAdmin() {
  on('vista', v => { if (v === 'admin') render(); });
  on('cambio', tablas => { if (!$('#v-admin').hidden && tablas.includes('perfiles')) render(); });
}

function render() {
  if (!esAdmin()) { $('#v-admin').innerHTML = '<p class="note pad">Solo la dirección tiene acceso a esta sección.</p>'; return; }
  const perfiles = [...S.perfiles.values()].sort((a, b) => (b.activo - a.activo) || a.nombre.localeCompare(b.nombre, 'es'));
  const ref = (SUPABASE_URL.match(/https:\/\/([a-z0-9-]+)\.supabase\.co/i) || [])[1];
  const provs = new Map(); for (const t of S.talleres.values()) provs.set(t.pais === 'ES' ? t.provc : t.pais + ':' + t.provincia, t.provincia || t.poblacion);
  const aprox = [...S.talleres.values()].filter(t => ['cp', 'zona', 'loc'].includes(t.precision)).length;
  const oficiales = [...S.talleres.values()].filter(t => t.origen === 'reg').length;
  $('#v-admin').innerHTML = `
    <div class="admin">
      <section class="panel">
        <h2 class="cap">Usuarios</h2>
        <p class="note">Para dar de alta a un empleado, créalo en Supabase (${ref ? `<a href="https://supabase.com/dashboard/project/${esc(ref)}/auth/users" target="_blank" rel="noopener">Authentication → Users → Add user</a>` : 'Authentication → Users → Add user'}) con su email y una contraseña, marcando «Auto Confirm User». Aparecerá aquí como comercial.</p>
        <div class="tablewrap"><table class="users"><thead><tr><th>Nombre</th><th>Email</th><th>Rol</th><th>Color</th><th>Activo</th><th class="n">Talleres</th></tr></thead><tbody>
        ${perfiles.map(p => `<tr data-u="${esc(p.id)}"><td><input class="inl" data-f="nombre" value="${esc(p.nombre)}" maxlength="60" aria-label="Nombre"></td><td class="note">${esc(p.email || '')}</td>
          <td><select data-f="rol" aria-label="Rol" ${p.id === S.yo.id ? 'disabled title="No puedes quitarte el rol a ti mismo"' : ''}><option value="comercial"${p.rol === 'comercial' ? ' selected' : ''}>Comercial</option><option value="admin"${p.rol === 'admin' ? ' selected' : ''}>Dirección</option></select></td>
          <td><input type="color" data-f="color" value="${esc(p.color)}" aria-label="Color"></td>
          <td><input type="checkbox" data-f="activo" ${p.activo ? 'checked' : ''} ${p.id === S.yo.id ? 'disabled' : ''} aria-label="Activo"></td>
          <td class="n">${[...S.talleres.values()].filter(t => t.comercial_id === p.id).length}</td></tr>`).join('')}
        </tbody></table></div>
      </section>

      <section class="panel">
        <h2 class="cap">Asignar talleres por provincia</h2>
        <div class="grid2">
          <label class="field"><span>Provincia</span><select id="asProv">${[...provs].sort((a, b) => String(a[1]).localeCompare(String(b[1]), 'es')).map(([k, n]) => `<option value="${esc(k)}">${esc(n)}</option>`).join('')}</select></label>
          <label class="field"><span>Comercial</span><select id="asCom"><option value="">Quitar comercial</option>${comerciales().map(p => `<option value="${esc(p.id)}">${esc(p.nombre)}</option>`).join('')}</select></label>
        </div>
        <label class="note chk"><input type="checkbox" id="asLibres" checked> Solo los talleres que aún no tienen comercial</label>
        <div class="btns"><button class="btn primary" id="asGo">Asignar</button><span class="note" id="asMsg"></span></div>
      </section>

      <section class="panel">
        <h2 class="cap">Datos</h2>
        <div class="datos">
          <div><h3 class="ch-t">Talleres del registro oficial</h3><p class="note">${fmtNum(S.talleres.size)} talleres en la base de datos, ${fmtNum(oficiales)} del registro del Ministerio. Carga los que falten desde el archivo incluido con la aplicación (no toca estados, notas ni visitas).</p>
            <div class="btns"><button class="btn primary" id="cargarIni">Cargar talleres que falten</button><button class="btn" id="actOficial">Actualizar tarjetas y bajas del registro</button></div><p class="note" id="iniMsg"></p></div>
          <div><h3 class="ch-t">Ubicación exacta</h3><p class="note">${fmtNum(aprox)} talleres están situados en el centro de su código postal. Este proceso busca su dirección real en OpenStreetMap, uno por segundo (unos ${Math.ceil(aprox / 55)} minutos). Puedes pararlo y seguir otro día.</p>
            <div class="btns"><button class="btn primary" id="geoGo" ${aprox ? '' : 'disabled'}>${geoEnMarcha ? 'Buscando…' : 'Buscar direcciones exactas'}</button><button class="btn" id="geoStop" ${geoEnMarcha ? '' : 'hidden'}>Parar</button></div>
            <div class="progress" id="geoBar" hidden><i></i></div><p class="note" id="geoMsg"></p></div>
          <div><h3 class="ch-t">Excel</h3><p class="note">Exporta todo (talleres, visitas, ventas, equipos y contactos) o importa una lista de talleres o clientes. Al importar, se reconocen columnas como Nombre, CIF, Dirección, CP, Población, Teléfono, Email, Estado, Comercial y Notas.</p>
            <div class="btns"><button class="btn primary" id="expTodo">Exportar todo a Excel</button><label class="btn" for="impFile">Importar Excel…</label><input type="file" id="impFile" accept=".xlsx,.xls,.csv" hidden></div><div id="impPrev"></div></div>
        </div>
      </section>
    </div>`;

  // usuarios
  $$('tr[data-u]').forEach(tr => {
    tr.addEventListener('change', async e => {
      const f = e.target.dataset.f; if (!f) return;
      const v = f === 'activo' ? e.target.checked : e.target.value;
      try { await guardar('perfiles', tr.dataset.u, { [f]: v }); toast('Usuario actualizado'); } catch (err) { render(); }
    });
  });
  // asignación
  $('#asGo').addEventListener('click', async () => {
    const pk = $('#asProv').value, com = $('#asCom').value || null, libres = $('#asLibres').checked;
    const ids = [...S.talleres.values()].filter(t => (t.pais === 'ES' ? t.provc : t.pais + ':' + t.provincia) === pk && (!libres || !t.comercial_id)).map(t => t.id);
    if (!ids.length) { $('#asMsg').textContent = 'No hay talleres que cambiar.'; return; }
    $('#asGo').disabled = true;
    try { const n = await guardarVarios('talleres', ids, { comercial_id: com }); $('#asMsg').textContent = `${n} talleres ${com ? 'asignados a ' + nombreDe(com) : 'sin comercial'}.`; }
    catch (e) { toast(e.message, 'error'); }
    $('#asGo').disabled = false;
  });
  // datos iniciales
  $('#cargarIni').addEventListener('click', cargarIniciales);
  confirmBtn($('#actOficial'), actualizarOficiales, 'Pulsa otra vez para actualizar');
  // geocodificación
  $('#geoGo').addEventListener('click', geocodificarLote);
  $('#geoStop').addEventListener('click', () => { geoParar = true; });
  // excel
  $('#expTodo').addEventListener('click', () => exportarExcel([...S.talleres.values()], true));
  $('#impFile').addEventListener('change', e => { const f = e.target.files[0]; if (f) importar(f); e.target.value = ''; });
}

async function semilla() { const d = await fetch('data/talleres.json').then(r => r.json()); S.fechaRegistro = d.fecha_registro; return d; }

async function cargarIniciales() {
  const b = $('#cargarIni'); b.disabled = true; $('#iniMsg').textContent = 'Cargando…';
  try {
    const d = await semilla();
    const nuevos = d.talleres.filter(t => !S.talleres.has(t.id));
    if (!nuevos.length) { $('#iniMsg').textContent = 'Ya están todos cargados.'; return; }
    const n = await S.api.upsert('talleres', nuevos, { soloNuevos: true });
    const todos = await S.api.list('talleres'); S.talleres = new Map(todos.map(t => [t.id, t])); emit('cambio', ['talleres']);
    $('#iniMsg').textContent = `${fmtNum(n)} talleres añadidos.`; toast('Talleres cargados');
  } catch (e) { $('#iniMsg').textContent = e.message; }
  finally { b.disabled = false; }
}
async function actualizarOficiales() {
  const b = $('#actOficial'); b.disabled = true; $('#iniMsg').textContent = 'Actualizando…';
  try {
    const d = await semilla();
    const ids = new Set(d.talleres.map(t => t.id));
    const filas = d.talleres.filter(t => S.talleres.has(t.id)).map(t => ({ id: t.id, nombre: S.talleres.get(t.id).nombre, tarjetas: t.tarjetas, tarjeta_hasta: t.tarjeta_hasta, en_registro: t.en_registro }));
    const bajas = [...S.talleres.values()].filter(t => t.origen === 'reg' && t.en_registro && !ids.has(t.id)).map(t => t.id);
    await S.api.upsert('talleres', filas);
    if (bajas.length) await guardarVarios('talleres', bajas, { en_registro: false });
    const todos = await S.api.list('talleres'); S.talleres = new Map(todos.map(t => [t.id, t])); emit('cambio', ['talleres']);
    $('#iniMsg').textContent = `Actualizados ${fmtNum(filas.length)} talleres. ${bajas.length ? fmtNum(bajas.length) + ' ya no figuran en el registro.' : ''}`;
  } catch (e) { $('#iniMsg').textContent = e.message; }
  finally { b.disabled = false; }
}

async function geocodificarLote() {
  if (geoEnMarcha) return;
  const lista = [...S.talleres.values()].filter(t => ['cp', 'zona', 'loc'].includes(t.precision));
  geoEnMarcha = true; geoParar = false; $('#geoGo').disabled = true; $('#geoGo').textContent = 'Buscando…'; $('#geoStop').hidden = false; $('#geoBar').hidden = false;
  let ok = 0, no = 0;
  for (let i = 0; i < lista.length && !geoParar; i++) {
    const t = lista[i];
    $('#geoMsg').textContent = `${i + 1} de ${lista.length}: ${t.nombre} · ${ok} encontrados, ${no} sin encontrar`;
    $('#geoBar i').style.width = `${100 * (i + 1) / lista.length}%`;
    try {
      const r = await buscarDireccion(t);
      if (r) { await S.api.update('talleres', t.id, { lat: r.lat, lon: r.lon, precision: 'exacta' }); S.talleres.set(t.id, { ...t, lat: r.lat, lon: r.lon, precision: 'exacta' }); ok++; }
      else no++;
    } catch (e) { no++; if (/conexión|responde/.test(e.message)) { $('#geoMsg').textContent = e.message; break; } }
    if (i % 20 === 0) emit('cambio', ['talleres']);
  }
  emit('cambio', ['talleres']);
  geoEnMarcha = false;
  if (!$('#v-admin').hidden && $('#geoGo')) { $('#geoGo').disabled = false; $('#geoGo').textContent = 'Buscar direcciones exactas'; $('#geoStop').hidden = true; $('#geoMsg').textContent = `${geoParar ? 'Parado. ' : 'Terminado. '}${ok} ubicados con su dirección, ${no} sin encontrar (quedan en su código postal; se pueden colocar a mano desde su ficha).`; }
  toast(`Ubicación exacta: ${ok} talleres actualizados`);
}

// ------------------------------ Excel ------------------------------
export async function exportarExcel(talleres, completo = false) {
  try { await loadScript(XLSX_URL); } catch (e) { return toast(e.message, 'error'); }
  const X = window.XLSX, wb = X.utils.book_new();
  const ids = new Set(talleres.map(t => t.id));
  const hojaT = talleres.map(t => ({
    'Nombre': t.nombre, 'CIF': t.cif || '', 'Dirección': t.direccion || '', 'CP': t.cp || '', 'Población': t.poblacion || '', 'Provincia': t.provincia || '', 'Comunidad / país': t.ccaa || '',
    'Redes': (t.redes || []).join(', '), 'Estado': estadoInfo(t.estado).label, 'Comercial': nombreDe(t.comercial_id), 'Teléfono': t.telefono || '', 'Email': t.email || '', 'Web': t.web || '',
    'Última visita': t.ultima_visita || '', 'Notas': t.notas || '', 'Origen': ORIGEN[t.origen] || t.origen, 'En registro oficial': t.en_registro ? 'Sí' : 'No', 'Ubicación': PRECISION[t.precision] || '', 'Latitud': t.lat, 'Longitud': t.lon, 'ID': t.id
  }));
  X.utils.book_append_sheet(wb, X.utils.json_to_sheet(hojaT), 'Talleres');
  const nom = id => S.talleres.get(id)?.nombre || '';
  const vis = [...S.visitas.values()].filter(v => ids.has(v.taller_id)).sort((a, b) => b.fecha.localeCompare(a.fecha));
  X.utils.book_append_sheet(wb, X.utils.json_to_sheet(vis.map(v => ({ 'Fecha': v.fecha, 'Hora': v.hora || '', 'Taller': nom(v.taller_id), 'Tipo': TIPOS_VISITA[v.tipo] || v.tipo, 'Estado': v.estado, 'Comercial': nombreDe(v.comercial_id), 'Resumen': v.resumen, 'Próximo paso': v.proximo_paso }))), 'Visitas');
  const ven = [...S.ventas.values()].filter(v => ids.has(v.taller_id));
  X.utils.book_append_sheet(wb, X.utils.json_to_sheet(ven.map(v => ({ 'Fecha': v.fecha, 'Taller': nom(v.taller_id), 'Tipo': v.tipo, 'Concepto': v.concepto, 'Importe (€)': Number(v.importe), 'Estado': v.estado, 'Comercial': nombreDe(v.comercial_id), 'Notas': v.notas || '' }))), 'Ventas');
  const eq = [...S.equipos.values()].filter(v => ids.has(v.taller_id));
  X.utils.book_append_sheet(wb, X.utils.json_to_sheet(eq.map(e => ({ 'Taller': nom(e.taller_id), 'Tipo': e.tipo, 'Marca': e.marca || '', 'Modelo': e.modelo || '', 'Nº serie': e.n_serie || '', 'Fecha venta': e.fecha_venta || '', 'Próxima revisión': e.proxima_revision || '', 'Notas': e.notas || '' }))), 'Equipos');
  if (completo) {
    try {
      const cs = (await S.api.list('contactos')).filter(c => ids.has(c.taller_id));
      X.utils.book_append_sheet(wb, X.utils.json_to_sheet(cs.map(c => ({ 'Taller': nom(c.taller_id), 'Nombre': c.nombre, 'Cargo': c.cargo || '', 'Teléfono': c.telefono || '', 'Email': c.email || '', 'Notas': c.notas || '' }))), 'Contactos');
    } catch (e) { /* sin contactos */ }
  }
  X.writeFile(wb, `talleres-tacografo-${hoy()}.xlsx`);
}

const COLS = {
  nombre: ['nombre', 'taller', 'empresa', 'razon social', 'cliente', 'denominacion'], cif: ['cif', 'nif', 'cif/nif'],
  direccion: ['direccion', 'domicilio', 'calle'], cp: ['cp', 'codigo postal', 'c.postal', 'c postal', 'postal'],
  poblacion: ['poblacion', 'localidad', 'municipio', 'ciudad'], provincia: ['provincia'], telefono: ['telefono', 'tlf', 'tel', 'movil'],
  email: ['email', 'correo', 'e-mail', 'mail'], estado: ['estado', 'situacion'], comercial: ['comercial', 'vendedor', 'asignado'],
  notas: ['notas', 'observaciones', 'comentarios'], redes: ['redes', 'red', 'marca', 'marcas']
};
const ESTADO_TXT = { cliente: 'cliente', potencial: 'potencial', competencia: 'competencia', descartado: 'descartado', 'sin clasificar': '' };

async function importar(file) {
  try { await loadScript(XLSX_URL); } catch (e) { return toast(e.message, 'error'); }
  const X = window.XLSX;
  const wb = X.read(await file.arrayBuffer(), { type: 'array' });
  const filas = X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false });
  if (!filas.length) return toast('La hoja está vacía.', 'error');
  const cabeceras = Object.keys(filas[0]);
  const mapa = {};
  for (const [k, alias] of Object.entries(COLS)) { const h = cabeceras.find(c => alias.includes(norm(c).trim())); if (h) mapa[k] = h; }
  if (!mapa.nombre) return toast('No encuentro una columna «Nombre» en la primera hoja.', 'error');
  const cps = await fetch('data/cp.json').then(r => r.json()).catch(() => ({}));
  const porCif = new Map(), porNombre = new Map();
  for (const t of S.talleres.values()) { if (t.cif) porCif.set(t.cif.toUpperCase().replace(/[^A-Z0-9]/g, '') + '|' + (t.cp || ''), t); porNombre.set(norm(t.nombre).replace(/[^a-z0-9]/g, '') + '|' + (t.cp || ''), t); }
  const coms = comerciales();
  const plan = { nuevos: [], cambios: [], sinUbicar: 0 };
  for (const f of filas) {
    const g = k => (mapa[k] ? String(f[mapa[k]]).trim() : '');
    const nombre = g('nombre'); if (!nombre) continue;
    const cp = g('cp').replace(/\D/g, '').padStart(5, '0').slice(0, 5);
    const cif = g('cif').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const existente = (cif && porCif.get(cif + '|' + cp)) || porNombre.get(norm(nombre).replace(/[^a-z0-9]/g, '') + '|' + cp);
    const est = ESTADO_TXT[norm(g('estado'))];
    const comTxt = norm(g('comercial'));
    const com = comTxt ? coms.find(p => norm(p.email) === comTxt || norm(p.nombre) === comTxt) : null;
    const patch = {};
    if (g('telefono')) patch.telefono = g('telefono');
    if (g('email')) patch.email = g('email');
    if (est !== undefined && g('estado')) patch.estado = est;
    if (com) patch.comercial_id = com.id;
    if (g('notas')) patch.notas = g('notas');
    if (existente) { if (Object.keys(patch).length) plan.cambios.push({ t: existente, patch }); }
    else {
      const p = cps[cp];
      if (!p) { plan.sinUbicar++; continue; }
      plan.nuevos.push({ id: 'IMP-' + uid().slice(0, 12), nombre, cif: cif || null, direccion: g('direccion') || null, cp, poblacion: g('poblacion') || null, provincia: g('provincia') || null, provc: cp.slice(0, 2), ccaa: [...S.talleres.values()].find(t => t.provc === cp.slice(0, 2))?.ccaa || null, pais: 'ES', lat: p[0], lon: p[1], precision: 'cp', redes: g('redes') ? g('redes').toUpperCase().split(/[,;/ ]+/).filter(Boolean) : [], origen: 'import', en_registro: false, tarjetas: 0, estado: patch.estado || '', comercial_id: patch.comercial_id || null, telefono: patch.telefono || null, email: patch.email || null, notas: patch.notas || '' });
    }
  }
  $('#impPrev').innerHTML = `<div class="aviso">
    <p><b>${file.name}</b>: ${filas.length} filas. Columnas reconocidas: ${Object.keys(mapa).join(', ')}.</p>
    <p>${plan.cambios.length} talleres ya existentes se actualizarán, ${plan.nuevos.length} se añadirán como nuevos${plan.sinUbicar ? ` y ${plan.sinUbicar} se saltarán por no tener un código postal español válido` : ''}.</p>
    <div class="btns"><button class="btn primary" id="impOk">Importar</button><button class="btn" id="impNo">Cancelar</button></div><p class="note" id="impMsg"></p></div>`;
  $('#impNo').onclick = () => { $('#impPrev').innerHTML = ''; };
  $('#impOk').onclick = async () => {
    $('#impOk').disabled = true;
    try {
      if (plan.nuevos.length) await S.api.upsert('talleres', plan.nuevos);
      let i = 0;
      for (const c of plan.cambios) { await S.api.update('talleres', c.t.id, c.patch); if (++i % 10 === 0) $('#impMsg').textContent = `Actualizando ${i} de ${plan.cambios.length}…`; }
      const todos = await S.api.list('talleres'); S.talleres = new Map(todos.map(t => [t.id, t])); emit('cambio', ['talleres']);
      $('#impPrev').innerHTML = `<p class="note">Importación terminada: ${plan.nuevos.length} nuevos, ${plan.cambios.length} actualizados.</p>`;
      toast('Excel importado');
    } catch (e) { $('#impMsg').textContent = e.message; $('#impOk').disabled = false; }
  };
}
