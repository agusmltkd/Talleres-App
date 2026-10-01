// Ruta de visitas: orden optimizado, distancias aproximadas y enlaces a Google Maps
import { S, on, emit, getRuta, setRuta } from './store.js';
import { $, esc, hav, css, toast } from './util.js';
import { ubicacionActual } from './mapa.js';
import { ponerFondo } from './fondo.js';

let mini = null, capa = null, salida = null;
const cp = { tabla: null };

export function iniciarRuta() {
  on('ruta:toggle', id => { const r = getRuta(); const i = r.indexOf(id); if (i >= 0) r.splice(i, 1); else r.push(id); setRuta(r); toast(i >= 0 ? 'Quitado de la ruta' : 'Añadido a la ruta'); });
  on('ruta:cambio', () => { contador(); if (!$('#v-ruta').hidden) render(); });
  on('vista', v => { if (v === 'ruta') render(); });
  on('ubicacion', p => { if (!salida) salida = { ...p, etiqueta: 'Mi ubicación' }; });
  try { const s = JSON.parse(localStorage.getItem('ruta-salida') || 'null'); if (s) salida = s; } catch (e) {}
  $('#v-ruta').addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b) return;
    const r = getRuta();
    if (b.dataset.up) { const i = +b.dataset.up; if (i > 0) { [r[i - 1], r[i]] = [r[i], r[i - 1]]; setRuta(r); } }
    else if (b.dataset.down) { const i = +b.dataset.down; if (i < r.length - 1) { [r[i + 1], r[i]] = [r[i], r[i + 1]]; setRuta(r); } }
    else if (b.dataset.del) { r.splice(+b.dataset.del, 1); setRuta(r); }
    else if (b.dataset.ver) { emit('ir', 'mapa'); emit('abrir', { id: b.dataset.ver, volar: true }); }
    else if (b.id === 'rOpt') optimizar();
    else if (b.id === 'rVaciar') setRuta([]);
    else if (b.id === 'rAqui') {
      const u = ubicacionActual();
      if (u) { fijarSalida({ ...u, etiqueta: 'Mi ubicación' }); return; }
      if (!navigator.geolocation) return toast('Este dispositivo no da la ubicación.', 'error');
      navigator.geolocation.getCurrentPosition(p => fijarSalida({ lat: p.coords.latitude, lon: p.coords.longitude, etiqueta: 'Mi ubicación' }), () => toast('No se pudo obtener tu ubicación.', 'error'));
    }
  });
  $('#v-ruta').addEventListener('change', async e => {
    if (e.target.id === 'rCP') {
      const v = e.target.value.trim(); if (!v) { fijarSalida(null); return; }
      if (!cp.tabla) cp.tabla = await fetch('data/cp.json').then(r => r.json()).catch(() => ({}));
      const p = cp.tabla[v];
      if (!p) return toast('No encuentro ese código postal.', 'error');
      fijarSalida({ lat: p[0], lon: p[1], etiqueta: 'CP ' + v });
    }
    if (e.target.id === 'rVuelta') { try { localStorage.setItem('ruta-vuelta', e.target.checked ? '1' : '0'); } catch (err) {} render(); }
  });
  contador();
}
function fijarSalida(s) { salida = s; try { localStorage.setItem('ruta-salida', JSON.stringify(s)); } catch (e) {} render(); }
const vuelta = () => { try { return localStorage.getItem('ruta-vuelta') !== '0'; } catch (e) { return true; } };
function contador() { const n = getRuta().length; document.querySelectorAll('.badge-ruta').forEach(b => { b.textContent = n || ''; b.hidden = !n; }); }

function paradas() { return getRuta().map(id => S.talleres.get(id)).filter(t => t && t.lat != null); }
function secuencia(ps) { const v = vuelta(); const ini = salida ? [salida] : []; return ini.concat(ps, v && ps.length ? [salida || ps[0]] : []); }
const km = seq => seq.reduce((a, p, i) => i ? a + hav(seq[i - 1], p) : 0, 0);

function optimizar() {
  let ps = paradas(); if (ps.length < 2) return;
  const ini = salida || ps[0];
  let resto = salida ? ps.slice() : ps.slice(1), orden = salida ? [] : [ps[0]], cur = ini;
  while (resto.length) { let bi = 0, bd = Infinity; resto.forEach((p, i) => { const d = hav(cur, p); if (d < bd) { bd = d; bi = i; } }); cur = resto.splice(bi, 1)[0]; orden.push(cur); }
  const fijo = salida ? 0 : 1;
  let mejora = true, n = 0;
  while (mejora && n++ < 60) {
    mejora = false;
    for (let i = fijo; i < orden.length - 1; i++) for (let j = i + 1; j < orden.length; j++) {
      const cand = orden.slice(0, i).concat(orden.slice(i, j + 1).reverse(), orden.slice(j + 1));
      if (km(secuencia(cand)) + 1e-6 < km(secuencia(orden))) { orden = cand; mejora = true; }
    }
  }
  setRuta(orden.map(t => t.id)); toast('Orden optimizado');
}

function render() {
  const ps = paradas(), seq = secuencia(ps);
  const dist = km(seq) * 1.3, horas = dist / 70 + ps.length * 0.75;
  const addr = t => t.precision === 'exacta' || t.precision === 'manual' ? `${t.lat},${t.lon}` : `${t.nombre}, ${t.direccion || ''}, ${t.cp || ''} ${t.poblacion || ''}`;
  const links = [];
  if (ps.length) {
    const origen = salida ? `${salida.lat},${salida.lon}` : addr(ps[0]);
    const lista = (salida ? ps : ps.slice(1)).map(addr);
    let o = origen;
    for (let i = 0; i < lista.length; i += 9) {
      const tramo = lista.slice(i, i + 9); const ultimo = i + 9 >= lista.length;
      const dest = ultimo && vuelta() ? origen : tramo[tramo.length - 1];
      const way = ultimo && vuelta() ? tramo : tramo.slice(0, -1);
      let url = `https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=${encodeURIComponent(o)}&destination=${encodeURIComponent(dest)}`;
      if (way.length) url += `&waypoints=${encodeURIComponent(way.join('|'))}`;
      links.push(`<a class="btn primary" href="${url}" target="_blank" rel="noopener">Abrir ${lista.length > 9 ? 'tramo ' + (links.length + 1) : 'la ruta'} en Google Maps</a>`);
      o = tramo[tramo.length - 1];
    }
  }
  const h = Math.floor(horas), mnt = Math.round((horas - h) * 60);
  $('#v-ruta').innerHTML = `
    <div class="ruta">
      <section class="panel">
        <h2 class="cap">Ruta de visitas</h2>
        <p class="note">Añade talleres con el botón + de la lista o desde su ficha. Las distancias son aproximadas; Google Maps calcula la ruta real.</p>
        <div class="grid2">
          <label class="field"><span>Salida (código postal)</span><input id="rCP" inputmode="numeric" maxlength="5" placeholder="Ej. 41500" value="${salida?.etiqueta?.startsWith('CP ') ? esc(salida.etiqueta.slice(3)) : ''}"></label>
          <div class="field"><span>Punto de salida</span><div class="btns"><button class="btn" id="rAqui">Usar mi ubicación</button></div></div>
        </div>
        <p class="note">${salida ? 'Salida: ' + esc(salida.etiqueta) : 'Sin punto de salida: se empieza en el primer taller.'}</p>
        <label class="note chk"><input type="checkbox" id="rVuelta" ${vuelta() ? 'checked' : ''}> Volver al punto de salida</label>
        <div class="kpis3"><div><span>Paradas</span><b>${ps.length}</b></div><div><span>Kilómetros aprox.</span><b>${Math.round(dist)}</b></div><div><span>Jornada aprox.</span><b>${ps.length ? `${h} h ${String(mnt).padStart(2, '0')}` : '—'}</b><small>con 45 min por visita</small></div></div>
        <div class="stops">${ps.map((t, i) => `<div class="stop"><span class="num">${i + 1}</span><div class="grow"><button class="linklike" data-ver="${esc(t.id)}">${esc(t.nombre)}</button><div class="note">${esc(t.poblacion || '')} · ${esc(t.provincia || '')}</div></div>
          <div class="btns sm nowrap"><button class="icon" data-up="${i}" aria-label="Subir">↑</button><button class="icon" data-down="${i}" aria-label="Bajar">↓</button><button class="icon" data-del="${i}" aria-label="Quitar">×</button></div></div>`).join('') || '<p class="note">La ruta está vacía.</p>'}</div>
        <div class="btns"><button class="btn" id="rOpt" ${ps.length < 2 ? 'disabled' : ''}>Optimizar orden</button><button class="btn" id="rVaciar" ${ps.length ? '' : 'disabled'}>Vaciar</button></div>
        <div class="btns">${links.join('')}</div>
      </section>
      <section class="panel mapruta"><div id="miniMapa"></div></section>
    </div>`;
  if (mini) { mini.remove(); mini = null; }
  mini = L.map('miniMapa', { zoomControl: true });
  ponerFondo(mini);
  capa = L.layerGroup().addTo(mini);
  if (seq.length > 1) L.polyline(seq.map(p => [p.lat, p.lon]), { color: css('--accent'), weight: 4, opacity: 0.85, dashArray: '8 8' }).addTo(capa);
  ps.forEach((t, i) => L.marker([t.lat, t.lon], { icon: L.divIcon({ className: 'stoplabel', html: String(i + 1), iconSize: [26, 26] }) }).addTo(capa).bindTooltip(esc(t.nombre)));
  if (salida) L.circleMarker([salida.lat, salida.lon], { radius: 8, color: '#fff', weight: 3, fillColor: '#1a73e8', fillOpacity: 1 }).addTo(capa).bindTooltip(esc(salida.etiqueta));
  const pts = seq.map(p => [p.lat, p.lon]);
  if (pts.length) mini.fitBounds(pts, { padding: [30, 30], maxZoom: 13 }); else mini.fitBounds([[35.9, -9.4], [43.8, 3.4]]);
}
