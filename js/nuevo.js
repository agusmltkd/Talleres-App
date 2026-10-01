// Añadir un taller a mano (cualquier usuario)
import { S, emit, esAdmin, comerciales, crear } from './store.js';
import { $, esc, norm, toast, ESTADOS, REDES } from './util.js';
import { formulario } from './formulario.js';
import { buscarDireccion } from './geocodificar.js';
import { map } from './mapa.js';

let tablaCP = null, provincias = null;
async function datosApoyo() {
  if (!tablaCP) tablaCP = await fetch('data/cp.json').then(r => r.json()).catch(() => ({}));
  if (!provincias) {
    provincias = new Map();
    try {
      const d = await fetch('data/talleres.json').then(r => r.json());
      for (const t of d.talleres) if (t.pais === 'ES' && !provincias.has(t.provc)) provincias.set(t.provc, { provincia: t.provincia, ccaa: t.ccaa });
    } catch (e) { /* sin datos de apoyo: se queda sin provincia */ }
  }
}

export function nuevoTaller() {
  const admin = esAdmin();
  const campos = [
    { k: 'nombre', label: 'Nombre del taller', required: true, full: true },
    { k: 'cif', label: 'CIF / NIF' },
    { k: 'pais', label: 'País', type: 'select', options: [['ES', 'España'], ['PT', 'Portugal']] },
    { k: 'direccion', label: 'Dirección', full: true, placeholder: 'Calle, número, polígono…' },
    { k: 'cp', label: 'Código postal', required: true, placeholder: '41500' },
    { k: 'poblacion', label: 'Población', required: true },
    { k: 'telefono', label: 'Teléfono', type: 'tel' },
    { k: 'email', label: 'Email', type: 'email' },
    { k: 'estado', label: 'Estado', type: 'select', options: ESTADOS.map(e => [e.k, e.label]), def: 'potencial' },
    ...(admin ? [{ k: 'comercial_id', label: 'Comercial', type: 'select', options: [['', 'Sin comercial'], ...comerciales().map(p => [p.id, p.nombre])] }] : []),
    { k: 'notas', label: 'Notas', type: 'textarea' }
  ];
  const extra = `<fieldset class="redes-sel"><legend class="note">Redes de marca</legend>${REDES.map(r => `<label class="chk"><input type="checkbox" name="red" value="${esc(r.k)}"> ${esc(r.label)}</label>`).join('')}</fieldset>
    <p class="note">Se intentará situar en el mapa por su dirección. Si no se encuentra, podrás colocarlo arrastrando una chincheta.</p>`;
  const form = formulario({
    titulo: 'Añadir un taller', campos, extra, textoGuardar: 'Añadir taller',
    alGuardar: async d => {
      await datosApoyo();
      const pais = d.pais || 'ES';
      const cp = pais === 'ES' ? String(d.cp).replace(/\D/g, '').padStart(5, '0') : String(d.cp).trim();
      let pos = null, provc = pais, provincia = null, ccaa = pais === 'PT' ? 'Portugal' : null, precision = 'cp';
      if (pais === 'ES') {
        const p = tablaCP[cp]; if (!p) throw new Error('No encuentro ese código postal español. Revísalo.');
        pos = { lat: p[0], lon: p[1] }; provc = cp.slice(0, 2);
        const pr = provincias.get(provc); provincia = pr?.provincia || null; ccaa = pr?.ccaa || null;
      }
      // ¿Ya existe?
      const nn = norm(d.nombre).replace(/[^a-z0-9]/g, ''), cif = String(d.cif || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      const dup = [...S.talleres.values()].find(t => (cif && String(t.cif || '').toUpperCase().replace(/[^A-Z0-9]/g, '') === cif) || (norm(t.nombre).replace(/[^a-z0-9]/g, '') === nn && t.cp === cp));
      if (dup) throw new Error(`Ya existe: ${dup.nombre} (${dup.poblacion || ''}). Búscalo en la lista.`);
      // Buscar la dirección exacta
      const btn = form.el.querySelector('[type=submit]'); btn.textContent = 'Buscando la dirección…';
      try {
        const r = await buscarDireccion({ nombre: d.nombre, direccion: d.direccion || '', cp, poblacion: d.poblacion, pais, lat: pos?.lat, lon: pos?.lon });
        if (r) { pos = { lat: r.lat, lon: r.lon }; precision = 'exacta'; }
      } catch (e) { /* sin conexión con el buscador: se queda en el código postal */ }
      btn.textContent = 'Guardando…';
      if (!pos) { const c = map.getCenter(); pos = { lat: c.lat, lon: c.lng }; precision = 'loc'; }
      const redes = [...form.el.querySelectorAll('input[name=red]:checked')].map(i => i.value);
      const t = await crear('talleres', {
        id: 'M-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        nombre: d.nombre.trim(), cif: cif || null, direccion: d.direccion || null, cp, poblacion: d.poblacion, provincia: provincia || (pais === 'PT' ? d.poblacion : null),
        provc, ccaa, pais, lat: pos.lat, lon: pos.lon, precision, redes, origen: 'manual', en_registro: false, tarjetas: 0,
        estado: d.estado || '', comercial_id: admin ? (d.comercial_id || null) : S.yo.id,
        telefono: d.telefono || null, email: d.email || null, notas: d.notas || ''
      });
      emit('abrir', { id: t.id, volar: true });
      if (precision === 'exacta') toast('Taller añadido en su dirección');
      else setTimeout(() => $('#manoBtn')?.click(), 450); // la barra de abajo explica qué hacer
    }
  });
}
