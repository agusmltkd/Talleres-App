// Kilómetros del mes: cuánto ha recorrido cada comercial según sus visitas hechas.
// Cada día: punto de partida → talleres visitados (por hora, o en el orden más corto) → vuelta.
// La distancia es en línea recta × 1,3 (como en Ruta). El comercial puede anotar los kilómetros reales del día.
import { S, esAdmin, comerciales, nombreDe, colorDe } from './store.js';
import { $, $$, esc, hav, fmtNum, fmtEur, fmtFecha, fmtDia, toast, vacio, cargandoHtml, loadScript } from './util.js';

const FACTOR = 1.3;
const PRECIO_DEF = 0.26; // €/km exento de IRPF en España (Orden HFP/792/2023); se cambia en Gestión
export const precioKm = () => Number(S.ajustes.get('precio_km')?.valor?.euros ?? PRECIO_DEF);
let anotados = null; // desplazamientos del mes cargados

function ordenDelDia(base, paradas) {
  if (paradas.every(p => p.hora)) return paradas.slice().sort((a, b) => a.hora.localeCompare(b.hora));
  const resto = paradas.slice(), orden = []; let cur = base || resto.shift();
  if (!base) orden.push(cur);
  while (resto.length) { let bi = 0, bd = Infinity; resto.forEach((p, i) => { const d = hav(cur, p); if (d < bd) { bd = d; bi = i; } }); cur = resto.splice(bi, 1)[0]; orden.push(cur); }
  return orden;
}

// Días del mes con visitas presenciales hechas, por comercial
export function diasDelMes(mes, quien) {
  const out = new Map(); // comercial -> Map(fecha -> {paradas, km})
  for (const v of S.visitas.values()) {
    if (v.estado !== 'hecha' || v.tipo !== 'visita' || !v.fecha?.startsWith(mes)) continue;
    if (quien && v.comercial_id !== quien) continue;
    const t = S.talleres.get(v.taller_id); if (!t || t.lat == null) continue;
    if (!out.has(v.comercial_id)) out.set(v.comercial_id, new Map());
    const m = out.get(v.comercial_id); if (!m.has(v.fecha)) m.set(v.fecha, []);
    const ps = m.get(v.fecha);
    if (!ps.some(p => p.id === t.id)) ps.push({ id: t.id, nombre: t.nombre, poblacion: t.poblacion, lat: t.lat, lon: t.lon, hora: v.hora || null });
  }
  const res = new Map();
  for (const [com, dias] of out) {
    const base = S.perfiles.get(com)?.base || null;
    const filas = [...dias].sort((a, b) => a[0].localeCompare(b[0])).map(([fecha, ps]) => {
      const orden = ordenDelDia(base, ps);
      const seq = base ? [base, ...orden, base] : orden;
      const km = seq.reduce((a, p, i) => i ? a + hav(seq[i - 1], p) : 0, 0) * FACTOR;
      const real = anotados?.find(d => d.comercial_id === com && d.fecha === fecha);
      return { fecha, paradas: orden, estimado: Math.round(km), real: real ? Number(real.km) : null, nota: real?.nota || '' };
    });
    res.set(com, filas);
  }
  return res;
}

let mesSel = new Date().toISOString().slice(0, 7), abierto = null;
export async function renderKilometros(box, quien) {
  const admin = esAdmin();
  const q = admin ? (quien || '') : S.yo.id;
  box.innerHTML = cargandoHtml('Calculando kilómetros…');
  try { anotados = (await S.api.list('desplazamientos')).filter(d => d.fecha.startsWith(mesSel)); } catch (e) { anotados = []; }
  const datos = diasDelMes(mesSel, q);
  const precio = precioKm();
  const coms = [...datos.keys()].sort((a, b) => nombreDe(a).localeCompare(nombreDe(b), 'es'));
  const tot = filas => filas.reduce((a, f) => a + (f.real ?? f.estimado), 0);
  const total = coms.reduce((a, c) => a + tot(datos.get(c)), 0);
  const nDias = coms.reduce((a, c) => a + datos.get(c).length, 0);
  const sinBase = coms.filter(c => !S.perfiles.get(c)?.base);
  const meses = []; { const d = new Date(); for (let i = 0; i < 13; i++) { const x = new Date(d.getFullYear(), d.getMonth() - i, 1); meses.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`); } }
  const nombreMes = m => (t => t[0].toUpperCase() + t.slice(1))(new Date(m + '-15').toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }));
  box.innerHTML = `
    <div class="row-between km-cab"><select id="kmMes" aria-label="Mes">${meses.map(m => `<option value="${m}"${m === mesSel ? ' selected' : ''}>${nombreMes(m)}</option>`).join('')}</select>
      <span class="btns"><button class="btn" id="kmExcel" ${coms.length ? '' : 'disabled'}>Excel</button><button class="btn" id="kmImprimir" ${coms.length ? '' : 'disabled'}>Imprimir</button></span></div>
    <div class="cifras">
      <div class="cifra verde"><b>${fmtNum(total)} km</b><span>Recorridos</span><small>${nDias} ${nDias === 1 ? 'día' : 'días'} con visitas</small></div>
      <div class="cifra"><b>${fmtEur(total * precio)}</b><span>A ${String(precio).replace('.', ',')} €/km</span><small>${admin ? 'se cambia en Gestión' : 'según la empresa'}</small></div>
    </div>
    ${sinBase.length ? `<p class="aviso"><span><b>Sin punto de partida:</b> ${sinBase.map(c => esc(nombreDe(c))).join(', ')}. Sin él, cada día se cuenta solo de la primera visita a la última. Se guarda en Ruta → «Guardar como mi punto de partida».</span></p>` : ''}
    ${coms.length ? coms.map(c => {
      const filas = datos.get(c), km = tot(filas), base = S.perfiles.get(c)?.base;
      return `<section class="panel km-com">
        <div class="row-between"><h3 class="ch-t"><span class="dotc" style="background:${esc(colorDe(c) || '#999')}"></span>${esc(nombreDe(c) || 'Sin nombre')}</h3><span class="km-tot"><b>${fmtNum(km)} km</b> · ${fmtEur(km * precio)}</span></div>
        <p class="note">${filas.length} ${filas.length === 1 ? 'día' : 'días'} · salida desde ${base ? esc(base.etiqueta || 'su punto de partida') : 'la primera visita'}</p>
        <div class="tablewrap"><table class="km"><thead><tr><th>Día</th><th>Recorrido</th><th class="n">Estimado</th><th class="n">Real</th></tr></thead><tbody>
        ${filas.map(f => `<tr><td class="nw">${esc((d => d[0].toUpperCase() + d.slice(1))(fmtDia(f.fecha)))}</td><td>${f.paradas.map(p => esc(p.poblacion || p.nombre)).join(' → ')}<div class="note">${f.paradas.length} ${f.paradas.length === 1 ? 'taller' : 'talleres'}${f.nota ? ' · ' + esc(f.nota) : ''}</div></td>
          <td class="n">${fmtNum(f.estimado)} km</td>
          <td class="n">${admin || c === S.yo.id ? `<input class="km-in" type="number" min="0" max="4999" step="1" inputmode="numeric" placeholder="${f.estimado}" value="${f.real ?? ''}" data-com="${esc(c)}" data-fecha="${f.fecha}" aria-label="Kilómetros reales del ${fmtFecha(f.fecha)}">` : f.real != null ? fmtNum(f.real) + ' km' : '—'}</td></tr>`).join('')}
        </tbody></table></div></section>`;
    }).join('') : vacio('Aparecen aquí los días con visitas presenciales marcadas como hechas.', `Sin visitas en ${nombreMes(mesSel).toLowerCase()}`)}
    <p class="note">Estimación: línea recta entre talleres × 1,3, con salida y vuelta al punto de partida. Escribe los kilómetros reales del cuentakilómetros para corregir un día; deja la casilla vacía para usar la estimación.</p>`;
  $('#kmMes', box).addEventListener('change', e => { mesSel = e.target.value; renderKilometros(box, quien); });
  $$('.km-in', box).forEach(inp => inp.addEventListener('change', async () => {
    const v = inp.value.trim(), com = inp.dataset.com, fecha = inp.dataset.fecha;
    try {
      if (v === '') await S.api.removePor('desplazamientos', { comercial_id: com, fecha });
      else await S.api.upsertPor('desplazamientos', { comercial_id: com, fecha, km: Math.round(Number(v)) }, 'comercial_id,fecha');
      toast(v === '' ? 'Se usa la estimación' : 'Kilómetros guardados'); renderKilometros(box, quien);
    } catch (e) { toast(e.message, 'error'); }
  }));
  const filasPlano = () => coms.flatMap(c => datos.get(c).map(f => ({ Comercial: nombreDe(c), Fecha: fmtFecha(f.fecha), Recorrido: f.paradas.map(p => p.poblacion || p.nombre).join(' → '), Talleres: f.paradas.length, 'Km estimados': f.estimado, 'Km reales': f.real ?? '', 'Km usados': f.real ?? f.estimado, Importe: Math.round((f.real ?? f.estimado) * precio * 100) / 100 })));
  $('#kmExcel', box).addEventListener('click', async () => {
    try { await loadScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'); } catch (e) { return toast(e.message, 'error'); }
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filasPlano()), 'Kilómetros');
    XLSX.writeFile(wb, `kilometros-${mesSel}.xlsx`);
  });
  $('#kmImprimir', box).addEventListener('click', () => {
    const w = window.open('', '_blank'); if (!w) return toast('Permite las ventanas emergentes para imprimir.', 'error');
    w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Kilómetros ${esc(nombreMes(mesSel))}</title><style>body{font:13px Arial,sans-serif;margin:28px;color:#16201b}h1{font-size:20px;margin:0}h2{font-size:15px;margin:22px 0 6px}p{color:#5a6660;margin:4px 0 14px}table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #ccc;padding:6px;text-align:left;vertical-align:top}th{background:#e4f1e9;font-size:11px;text-transform:uppercase}.n{text-align:right;white-space:nowrap}tfoot td{font-weight:bold;border-top:2px solid #16201b}</style></head><body>
      <h1>Kilómetros · ${esc(nombreMes(mesSel))}</h1><p>WORTACH · ${String(precio).replace('.', ',')} €/km · estimación en línea recta × 1,3 salvo los días con kilómetros reales anotados</p>
      ${coms.map(c => { const fs = datos.get(c), km = tot(fs); return `<h2>${esc(nombreDe(c))}</h2><table><thead><tr><th>Día</th><th>Recorrido</th><th class="n">Km</th></tr></thead><tbody>${fs.map(f => `<tr><td>${fmtFecha(f.fecha)}</td><td>${f.paradas.map(p => esc(p.poblacion || p.nombre)).join(' → ')}</td><td class="n">${fmtNum(f.real ?? f.estimado)}${f.real != null ? '' : '*'}</td></tr>`).join('')}</tbody><tfoot><tr><td colspan="2">Total · ${fmtEur(km * precio)}</td><td class="n">${fmtNum(km)}</td></tr></tfoot></table>`; }).join('')}
      <p>* estimado</p><script>print()<\/script></body></html>`);
    w.document.close();
  });
}
