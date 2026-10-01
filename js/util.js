// Utilidades compartidas
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
export const debounce = (fn, ms = 150) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2));

export function toast(msg, kind = '') {
  const t = document.createElement('div');
  t.className = 'toast ' + kind; t.textContent = msg; t.setAttribute('role', 'status');
  document.body.appendChild(t); setTimeout(() => t.remove(), 3200);
}

export const hoy = () => new Date().toISOString().slice(0, 10);
export const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
export const fmtFecha = iso => { if (!iso) return ''; const [y, m, d] = String(iso).slice(0, 10).split('-'); return `${d}/${m}/${y}`; };
export const fmtFechaCorta = iso => { if (!iso) return ''; const [y, m, d] = String(iso).slice(0, 10).split('-'); return `${d}/${m}/${y.slice(2)}`; };
export const fmtDia = iso => new Date(iso + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
export const fmtEur = n => (Number(n) || 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
export const fmtNum = n => (Number(n) || 0).toLocaleString('es-ES');
export const diasDesde = iso => iso ? Math.floor((Date.now() - new Date(iso + 'T12:00:00').getTime()) / 864e5) : null;
export const iniciales = n => String(n || '?').replace(/\(.*?\)/g, ' ').split(/\s+/).map(w => w.replace(/[^\p{L}\p{N}]/gu, '')).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || '?';

export function hav(a, b) {
  const R = 6371, r = Math.PI / 180;
  const dLa = (b.lat - a.lat) * r, dLo = (b.lon - a.lon) * r;
  const x = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

export const ESTADOS = [
  { k: 'cliente', label: 'Cliente', v: '--st-cliente' },
  { k: 'potencial', label: 'Potencial', v: '--st-potencial' },
  { k: 'competencia', label: 'Competencia', v: '--st-competencia' },
  { k: 'descartado', label: 'Descartado', v: '--st-descartado' },
  { k: '', label: 'Sin clasificar', v: '--st-none' }
];
export const estadoInfo = k => ESTADOS.find(e => e.k === (k || '')) || ESTADOS[4];

export const REDES = [
  { k: 'VDO', label: 'VDO', v: '--r-vdo' },
  { k: 'STONERIDGE', label: 'Stoneridge', v: '--r-stoneridge' },
  { k: 'WORTACH', label: 'Wortach', v: '--r-wortach' },
  { k: 'MAHA', label: 'MAHA', v: '--r-maha' },
  { k: 'TEKSON', label: 'Tekson', v: '--r-tekson' }
];
export const redInfo = k => REDES.find(r => r.k === k) || { k, label: k, v: '--r-none' };
export const redBadges = redes => (redes || []).map(r => { const R = redInfo(r); return `<span class="badge" style="background:var(${R.v})">${esc(R.label)}</span>`; }).join(' ');

export const ORIGEN = {
  reg: 'Registro oficial del Ministerio de Transportes',
  ipq: 'Lista oficial del IPQ (Portugal)',
  kmz: 'Recopilatorio de redes 2025 (no figura en el registro actual)',
  manual: 'Añadido por el equipo',
  import: 'Importado desde Excel'
};
export const PRECISION = {
  exacta: 'Dirección exacta', manual: 'Colocado a mano', cp: 'Centro del código postal',
  zona: 'Zona del código postal', loc: 'Centro de la localidad'
};
export const TIPOS_VISITA = { visita: 'Visita', llamada: 'Llamada', email: 'Email', otro: 'Otro' };
export const TIPOS_EQUIPO = ['Banco de pruebas', 'Equipo de calibración', 'Descargador de datos', 'Software de gestión', 'Tacógrafo', 'Limitador de velocidad', 'Otro'];
export const COLORES = ['#1f7f4a', '#c2410c', '#6d28d9', '#15803d', '#b91c1c', '#1d4ed8', '#a16207', '#be185d', '#0e7490', '#4d7c0f', '#7c2d12', '#334155'];

// Carga perezosa de scripts externos
const loaded = {};
export function loadScript(src) {
  if (!loaded[src]) loaded[src] = new Promise((ok, ko) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => ko(new Error('No se pudo cargar ' + src)); document.head.appendChild(s); });
  return loaded[src];
}

// Ventana modal sencilla
export function modal(html, { wide = false } = {}) {
  const m = $('#modal');
  m.innerHTML = `<div class="modal-card ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">${html}</div>`;
  m.hidden = false;
  const close = () => { m.hidden = true; m.innerHTML = ''; document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  m.onclick = e => { if (e.target === m || e.target.closest('[data-close]')) close(); };
  const first = m.querySelector('input, select, textarea, button');
  if (first) setTimeout(() => first.focus(), 30);
  return { el: m.firstElementChild, close };
}

// Botón que pide confirmación en un segundo toque
export function confirmBtn(btn, action, label = '¿Seguro?') {
  btn.addEventListener('click', async () => {
    if (btn.dataset.armed !== '1') {
      btn.dataset.armed = '1'; const old = btn.textContent; btn.textContent = label;
      setTimeout(() => { btn.dataset.armed = ''; btn.textContent = old; }, 3000);
      return;
    }
    btn.dataset.armed = ''; await action();
  });
}

// Marca de la empresa: símbolo + WORTACH WORKSHOPS (cabecera) o logo completo (entrada)
export const marcaHtml = (grande = false) => grande
  ? `<span class="marca grande"><img class="marca-completo claro" src="icons/logo.png" alt="Wortach, el mundo del tacógrafo"><img class="marca-completo oscuro" src="icons/logo-oscuro.png" alt="Wortach, el mundo del tacógrafo"><span class="marca-workshops">WORKSHOPS</span></span>`
  : `<span class="marca"><img class="marca-logo" src="icons/simbolo.png" alt="" width="27" height="30"><span class="marca-txt"><b>WORTACH</b><span>WORKSHOPS</span></span></span>`;

// Tarjeta de taller (registro oficial): cuántos días le quedan y en qué tramo está
export const diasHasta = iso => iso ? Math.round((new Date(iso + 'T12:00:00').getTime() - new Date(hoy() + 'T12:00:00').getTime()) / 864e5) : null;
export const TARJETA = [
  { k: 'caducada', label: 'Caducada', v: '--bad' },
  { k: 'd30', label: 'Caduca en 30 días', v: '--warn' },
  { k: 'd90', label: 'Caduca en 90 días', v: '--tj-90' },
  { k: 'ok', label: 'En vigor', v: '--st-descartado' },
  { k: '', label: 'Sin dato', v: '--st-none' }
];
export function estadoTarjeta(t) {
  const d = diasHasta(t?.tarjeta_hasta);
  if (d == null) return { k: '', dias: null };
  return { k: d < 0 ? 'caducada' : d <= 30 ? 'd30' : d <= 90 ? 'd90' : 'ok', dias: d };
}
export const textoTarjeta = t => {
  const { k, dias } = estadoTarjeta(t);
  if (!k) return '';
  if (k === 'caducada') return `caducó el ${fmtFecha(t.tarjeta_hasta)} (hace ${-dias} ${-dias === 1 ? 'día' : 'días'})`;
  return `caduca el ${fmtFecha(t.tarjeta_hasta)} (${dias === 0 ? 'hoy' : `en ${dias} ${dias === 1 ? 'día' : 'días'}`})`;
};
