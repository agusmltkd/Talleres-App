// Asignar muchos talleres de golpe (una provincia, una comunidad o la lista filtrada)
import { comerciales, nombreDe, guardarVarios } from './store.js';
import { esc, modal, toast, fmtNum } from './util.js';

export function asignarTalleres(talleres, titulo) {
  if (!talleres.length) { toast('No hay talleres que asignar.'); return; }
  const libres = talleres.filter(t => !t.comercial_id).length;
  const { el, close } = modal(`
    <form class="form">
      <div class="modal-head"><h3>${esc(titulo)}</h3><button type="button" class="icon" data-close aria-label="Cerrar">×</button></div>
      <p class="note">${fmtNum(talleres.length)} talleres: ${fmtNum(libres)} sin comercial y ${fmtNum(talleres.length - libres)} ya asignados.</p>
      <label class="field"><span>Asignar a</span><select name="com">${comerciales().map(p => `<option value="${esc(p.id)}">${esc(p.nombre)}</option>`).join('')}<option value="">Nadie (quitar comercial)</option></select></label>
      <div class="radios">
        <label class="chk"><input type="radio" name="cuales" value="todos" checked> Todos los talleres (también los que ya tienen otro comercial)</label>
        <label class="chk"><input type="radio" name="cuales" value="libres"> Solo los que aún no tienen comercial</label>
      </div>
      <p class="aviso" id="asResumen"></p>
      <div class="btns end"><button type="button" class="btn" data-close>Cancelar</button><button type="submit" class="btn primary">Asignar</button></div>
    </form>`);
  const f = el.querySelector('form');
  const elegidos = () => {
    const com = f.com.value || null, soloLibres = f.cuales.value === 'libres';
    return talleres.filter(t => (soloLibres ? !t.comercial_id : true) && t.comercial_id !== com);
  };
  const resumen = () => {
    const com = f.com.value || null, ids = elegidos();
    const quita = ids.filter(t => t.comercial_id).length;
    $r.textContent = !ids.length ? 'No hay nada que cambiar.'
      : `Se ${ids.length === 1 ? 'cambiará 1 taller' : `cambiarán ${fmtNum(ids.length)} talleres`} a ${com ? nombreDe(com) : 'sin comercial'}${quita ? ` (${fmtNum(quita)} se quitan a otro comercial)` : ''}.`;
    f.querySelector('[type=submit]').disabled = !ids.length;
  };
  const $r = el.querySelector('#asResumen');
  f.addEventListener('change', resumen); resumen();
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const com = f.com.value || null, ids = elegidos().map(t => t.id);
    const b = f.querySelector('[type=submit]'); b.disabled = true; b.textContent = 'Asignando…';
    try {
      const n = await guardarVarios('talleres', ids, { comercial_id: com });
      toast(`${fmtNum(n)} talleres ${com ? 'asignados a ' + nombreDe(com) : 'sin comercial'}`); close();
    } catch (err) { toast(err.message, 'error'); b.disabled = false; b.textContent = 'Asignar'; }
  });
}
