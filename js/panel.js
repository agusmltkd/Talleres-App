// Panel de resultados
import { S, on, esAdmin, comerciales } from './store.js';
import { $, esc, hoy, addDays, fmtEur, fmtNum, diasDesde, ESTADOS, estadoTarjeta, vacio } from './util.js';
import { renderKilometros } from './kilometros.js';

let periodo = 'mes', quien = null, sub = 'resumen';

export function iniciarPanel() {
  on('vista', v => { if (v === 'panel') render(); });
  on('cambio', () => { if (!$('#v-panel').hidden) render(); });
  $('#v-panel').addEventListener('change', e => {
    if (e.target.id === 'pPeriodo') { periodo = e.target.value; render(); }
    if (e.target.id === 'pQuien') { quien = e.target.value; render(); }
  });
  $('#v-panel').addEventListener('click', e => { const b = e.target.closest('[data-sub]'); if (b) { sub = b.dataset.sub; render(); } });
}

function rango() {
  const h = hoy();
  if (periodo === 'mes') return [h.slice(0, 7) + '-01', h];
  if (periodo === '30') return [addDays(h, -29), h];
  if (periodo === 'trimestre') { const [y, m] = h.split('-').map(Number); const q = Math.floor((m - 1) / 3) * 3 + 1; return [`${y}-${String(q).padStart(2, '0')}-01`, h]; }
  if (periodo === 'ano') return [h.slice(0, 4) + '-01-01', h];
  return ['2000-01-01', h];
}

function render() {
  const admin = esAdmin();
  const sel = admin ? (quien ?? '') : S.yo.id;
  const [ini, fin] = rango();
  const enRango = f => f >= ini && f <= fin;
  const talleres = [...S.talleres.values()].filter(t => !sel || t.comercial_id === sel);
  const visitas = [...S.visitas.values()].filter(v => v.estado === 'hecha' && enRango(v.fecha) && (!sel || v.comercial_id === sel));
  const ventas = [...S.ventas.values()].filter(v => !sel || v.comercial_id === sel);
  const ganadas = ventas.filter(v => v.estado === 'ganado' && enRango(v.fecha));
  const perdidas = ventas.filter(v => v.estado === 'perdido' && enRango(v.fecha));
  const abiertas = ventas.filter(v => v.estado === 'abierto');
  const suma = a => a.reduce((s, v) => s + Number(v.importe || 0), 0);
  const conv = ganadas.length + perdidas.length ? Math.round(100 * ganadas.length / (ganadas.length + perdidas.length)) : null;
  const clientes = talleres.filter(t => t.estado === 'cliente');
  const olvidados = clientes.filter(t => { const d = diasDesde(t.ultima_visita); return d == null || d > 90; });
  const coms = comerciales();
  const tjPronto = talleres.filter(t => ['caducada', 'd30', 'd90'].includes(estadoTarjeta(t).k));

  // visitas por comercial en el periodo
  const porCom = coms.map(p => ({ p, n: [...S.visitas.values()].filter(v => v.estado === 'hecha' && enRango(v.fecha) && v.comercial_id === p.id).length }));
  // ventas ganadas por mes, últimos 12 meses
  const meses = []; { const d = new Date(); d.setDate(1); for (let i = 11; i >= 0; i--) { const x = new Date(d.getFullYear(), d.getMonth() - i, 1); meses.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`); } }
  const porMes = meses.map(m => ({ m, v: suma(ventas.filter(v => v.estado === 'ganado' && v.fecha.startsWith(m))) }));
  // cartera por comercial
  const cartera = coms.map(p => { const ts = [...S.talleres.values()].filter(t => t.comercial_id === p.id); return { p, total: ts.length, por: ESTADOS.map(e => ts.filter(t => (t.estado || '') === e.k).length) }; }).filter(r => r.total);

  const nombrePeriodo = { mes: 'este mes', '30': 'los últimos 30 días', trimestre: 'este trimestre', ano: 'este año', todo: 'desde el principio' }[periodo];
  const quienTxt = sel ? (sel === S.yo.id ? 'Tus resultados' : 'Resultados de ' + (S.perfiles.get(sel)?.nombre || '')) : 'Resultados de todo el equipo';
  const pctCli = talleres.length ? Math.round(100 * clientes.length / talleres.length) : 0;
  const subTabs = `<div class="seg sub-tabs" role="tablist">${[['resumen', 'Resumen'], ['km', 'Kilómetros']].map(([k, l]) => `<button type="button" role="tab" data-sub="${k}" aria-checked="${sub === k}" aria-selected="${sub === k}">${l}</button>`).join('')}</div>`;
  if (sub === 'km') {
    $('#v-panel').innerHTML = `<div class="cab-vista"><div><h1>Resultados</h1><p>${admin ? (sel ? 'Kilómetros de ' + esc(S.perfiles.get(sel)?.nombre || '') : 'Kilómetros de todo el equipo') : 'Tus kilómetros'} por mes.</p></div><span class="esp"></span>${subTabs}
      ${admin ? `<select id="pQuien" aria-label="Comercial"><option value="">Todo el equipo</option>${coms.map(p => `<option value="${esc(p.id)}"${p.id === sel ? ' selected' : ''}>${esc(p.nombre)}</option>`).join('')}</select>` : ''}</div>
      <div class="km-vista" id="kmBox"></div>`;
    renderKilometros($('#kmBox'), sel);
    return;
  }
  $('#v-panel').innerHTML = `
    <div class="cab-vista">
      <div><h1>Resultados</h1><p>${esc(quienTxt)}, ${esc(nombrePeriodo)}.</p></div><span class="esp"></span>${subTabs}
      <select id="pPeriodo" aria-label="Periodo">${[['mes', 'Este mes'], ['30', 'Últimos 30 días'], ['trimestre', 'Este trimestre'], ['ano', 'Este año'], ['todo', 'Desde el principio']].map(([k, l]) => `<option value="${k}"${k === periodo ? ' selected' : ''}>${l}</option>`).join('')}</select>
      ${admin ? `<select id="pQuien" aria-label="Comercial"><option value="">Todo el equipo</option>${coms.map(p => `<option value="${esc(p.id)}"${p.id === sel ? ' selected' : ''}>${esc(p.nombre)}</option>`).join('')}</select>` : ''}
    </div>
    <div class="cifras">
      <div class="cifra verde"><b>${fmtEur(suma(ganadas))}</b><span>Vendido</span><small>${ganadas.length} ${ganadas.length === 1 ? 'venta ganada' : 'ventas ganadas'}</small></div>
      <div class="cifra"><b>${fmtEur(suma(abiertas))}</b><span>En negociación</span><small>${abiertas.length} ${abiertas.length === 1 ? 'presupuesto abierto' : 'presupuestos abiertos'}</small></div>
      <div class="cifra"><b>${fmtNum(visitas.length)}</b><span>Visitas hechas</span><small>en el periodo</small></div>
      <div class="cifra"><b>${conv == null ? '—' : conv + ' %'}</b><span>Conversión</span><small>ganados sobre cerrados</small></div>
      <div class="cifra"><b>${fmtNum(clientes.length)}</b><span>Clientes</span><small>de ${fmtNum(talleres.length)} talleres${sel ? ' asignados' : ''}</small><span class="bar-mini"><i style="width:${pctCli}%"></i></span></div>
      <div class="cifra ${olvidados.length ? 'aviso-c' : ''}"><b>${fmtNum(olvidados.length)}</b><span>Clientes sin visitar</span><small>hace más de 90 días</small></div>
      <div class="cifra ${tjPronto.length ? 'alerta' : ''}"><b>${fmtNum(tjPronto.length)}</b><span>Tarjetas que caducan</span><small>en 90 días · ${fmtNum(tjPronto.filter(t => estadoTarjeta(t).k === 'd30').length)} en 30</small></div>
    </div>
    <div class="charts">
      <section class="panel"><h3 class="ch-t">Ventas ganadas por mes</h3><p class="note">Últimos 12 meses${sel ? '' : ', todo el equipo'}</p>${barrasV(porMes.map(x => ({ l: new Date(x.m + '-15').toLocaleDateString('es-ES', { month: 'short' }), v: x.v, t: `${new Date(x.m + '-15').toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}: ${fmtEur(x.v)}` })), fmtEur)}</section>
      ${admin && !sel ? `<section class="panel"><h3 class="ch-t">Visitas hechas por comercial</h3><p class="note">En el periodo elegido</p>${barrasH(porCom.map(x => ({ l: x.p.nombre, v: x.n })), fmtNum)}</section>` : ''}
      <section class="panel"><h3 class="ch-t">Cartera por comercial</h3><p class="note">Talleres asignados según su estado</p>${cartera.length ? apiladas(cartera) : vacio('Cuando se asignen talleres a los comerciales, aquí verás su cartera por estado.', 'Todavía no hay talleres asignados')}</section>
      ${olvidados.length ? `<section class="panel"><h3 class="ch-t">Clientes a los que toca volver</h3><p class="note">Sin visita en más de 90 días</p><div class="agenda-list">${olvidados.sort((a, b) => String(a.ultima_visita || '').localeCompare(String(b.ultima_visita || ''))).slice(0, 12).map(t => `<div class="ag-item"><button class="linklike" data-open="${esc(t.id)}">${esc(t.nombre)}</button><div class="note">${esc(t.poblacion || '')} · ${t.ultima_visita ? 'última visita hace ' + diasDesde(t.ultima_visita) + ' días' : 'nunca visitado'}</div></div>`).join('')}</div></section>` : ''}
    </div>
    ${admin ? tablaComerciales(coms, enRango, suma) : ''}`;
  $('#v-panel').querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => { import('./store.js').then(m => { m.emit('ir', 'mapa'); m.emit('abrir', { id: b.dataset.open, volar: true }); }); }));
}

function tablaComerciales(coms, enRango, suma) {
  const rows = coms.map(p => {
    const ts = [...S.talleres.values()].filter(t => t.comercial_id === p.id);
    const vs = [...S.visitas.values()].filter(v => v.comercial_id === p.id && v.estado === 'hecha' && enRango(v.fecha));
    const ve = [...S.ventas.values()].filter(v => v.comercial_id === p.id);
    const g = ve.filter(v => v.estado === 'ganado' && enRango(v.fecha)), pe = ve.filter(v => v.estado === 'perdido' && enRango(v.fecha));
    return `<tr><td><span class="dotc" style="background:${esc(p.color)}"></span>${esc(p.nombre)}</td><td class="n">${ts.length}</td><td class="n">${ts.filter(t => t.estado === 'cliente').length}</td><td class="n">${vs.length}</td>
      <td class="n">${fmtEur(suma(ve.filter(v => v.estado === 'abierto')))}</td><td class="n">${fmtEur(suma(g))}</td><td class="n">${g.length + pe.length ? Math.round(100 * g.length / (g.length + pe.length)) + ' %' : '—'}</td></tr>`;
  }).join('');
  return `<section class="panel"><h3 class="ch-t">Por comercial</h3><div class="tablewrap"><table><thead><tr><th>Comercial</th><th class="n">Talleres</th><th class="n">Clientes</th><th class="n">Visitas</th><th class="n">Abierto</th><th class="n">Ganado</th><th class="n">Conversión</th></tr></thead><tbody>${rows || `<tr><td colspan="7">${vacio('Da de alta a los comerciales en Gestión.', 'Todavía no hay comerciales')}</td></tr>`}</tbody></table></div></section>`;
}

// ---- gráficos SVG sencillos ----
function barrasV(datos, fmt) {
  if (!datos.some(d => d.v > 0)) return vacio('Aparecerán aquí cuando se marque un presupuesto o pedido como ganado.', 'Todavía no hay ventas ganadas');
  const W = 560, H = 200, pl = 8, pr = 8, pt = 22, pb = 26;
  const max = Math.max(1, ...datos.map(d => d.v));
  const bw = (W - pl - pr) / datos.length;
  const y = v => H - pb - (H - pt - pb) * v / max;
  const lastIdx = datos.length - 1;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Gráfico de barras">
    <line x1="${pl}" x2="${W - pr}" y1="${H - pb + 0.5}" y2="${H - pb + 0.5}" class="axis"/>
    ${datos.map((d, i) => { const x = pl + i * bw + bw * 0.18, w = bw * 0.64, yy = y(d.v), h = H - pb - yy;
      return `<g class="bar${i === lastIdx ? ' ult' : ''}" style="--i:${i}"><rect x="${pl + i * bw}" y="${pt}" width="${bw}" height="${H - pt - pb}" class="hit"><title>${esc(d.t || d.l + ': ' + fmt(d.v))}</title></rect>
        ${d.v ? `<path d="M${x},${H - pb} V${yy + Math.min(4, h)} Q${x},${yy} ${x + Math.min(4, w / 2)},${yy} H${x + w - Math.min(4, w / 2)} Q${x + w},${yy} ${x + w},${yy + Math.min(4, h)} V${H - pb} Z" class="fill"/>` : ''}
        <text x="${x + w / 2}" y="${H - 8}" class="lbl" text-anchor="middle">${esc(d.l)}</text>
        ${i === lastIdx || d.v === max ? `<text x="${x + w / 2}" y="${yy - 6}" class="val" text-anchor="middle">${esc(fmt(d.v))}</text>` : ''}</g>`; }).join('')}
  </svg>`;
}
function barrasH(datos, fmt) {
  if (!datos.length) return vacio('Sin datos en este periodo.', '', { peq: true });
  const max = Math.max(1, ...datos.map(d => d.v));
  return `<div class="hbars">${datos.sort((a, b) => b.v - a.v).map(d => `<div class="hb" title="${esc(d.l)}: ${esc(fmt(d.v))}"><span class="hb-l">${esc(d.l)}</span><span class="hb-t"><i style="width:${100 * d.v / max}%"></i></span><span class="hb-v">${esc(fmt(d.v))}</span></div>`).join('')}</div>`;
}
function apiladas(rows) {
  const max = Math.max(...rows.map(r => r.total));
  return `<div class="legend-row">${ESTADOS.map(e => `<span><i style="background:var(${e.v})"></i>${e.label}</span>`).join('')}</div>
    <div class="hbars">${rows.map(r => `<div class="hb"><span class="hb-l">${esc(r.p.nombre)}</span><span class="hb-t stack" style="width:${100 * r.total / max}%">${r.por.map((n, i) => n ? `<i style="flex:${n};background:var(${ESTADOS[i].v})" title="${esc(ESTADOS[i].label)}: ${n}"></i>` : '').join('')}</span><span class="hb-v">${r.total}</span></div>`).join('')}</div>`;
}
