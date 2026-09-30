// Formularios en ventana modal a partir de una lista de campos
import { esc, modal } from './util.js';

// campos: [{ k, label, type: 'text'|'email'|'tel'|'url'|'date'|'time'|'number'|'textarea'|'select', options: [[valor, texto]], required, placeholder, full }]
export function formulario({ titulo, campos, valores = {}, textoGuardar = 'Guardar', alGuardar, extra = '' }) {
  const campo = c => {
    const v = valores[c.k] ?? c.def ?? '';
    const id = 'f_' + c.k;
    let input;
    if (c.type === 'textarea') input = `<textarea id="${id}" name="${c.k}" ${c.required ? 'required' : ''} placeholder="${esc(c.placeholder || '')}" maxlength="2000">${esc(v)}</textarea>`;
    else if (c.type === 'select') input = `<select id="${id}" name="${c.k}" ${c.required ? 'required' : ''}>${c.options.map(([ov, ol]) => `<option value="${esc(ov)}"${String(ov) === String(v ?? '') ? ' selected' : ''}>${esc(ol)}</option>`).join('')}</select>`;
    else input = `<input id="${id}" name="${c.k}" type="${c.type || 'text'}" value="${esc(v)}" ${c.required ? 'required' : ''} ${c.type === 'number' ? 'step="0.01" inputmode="decimal"' : ''} placeholder="${esc(c.placeholder || '')}" maxlength="300">`;
    return `<label class="field ${c.full || c.type === 'textarea' ? 'full' : ''}" for="${id}"><span>${esc(c.label)}${c.required ? ' *' : ''}</span>${input}</label>`;
  };
  const { el, close } = modal(`
    <form class="form">
      <div class="modal-head"><h3>${esc(titulo)}</h3><button type="button" class="icon" data-close aria-label="Cerrar">×</button></div>
      <div class="grid2">${campos.map(campo).join('')}</div>
      ${extra}
      <p class="note err" hidden></p>
      <div class="btns end"><button type="button" class="btn" data-close>Cancelar</button><button type="submit" class="btn primary">${esc(textoGuardar)}</button></div>
    </form>`);
  const form = el.querySelector('form');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const datos = {};
    for (const c of campos) {
      let v = form.elements[c.k].value.trim();
      if (c.type === 'number') v = v === '' ? 0 : Number(v.replace(',', '.'));
      else if (v === '' && ['date', 'time', 'email', 'tel', 'url'].includes(c.type)) v = null;
      datos[c.k] = v;
    }
    const btn = form.querySelector('[type=submit]'); btn.disabled = true;
    try { await alGuardar(datos); close(); }
    catch (err) { const p = form.querySelector('.err'); p.hidden = false; p.textContent = err.message || 'No se pudo guardar.'; btn.disabled = false; }
  });
  return { el, close };
}
