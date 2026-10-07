// Small DOM helpers: escaping, toasts and a stack of full-screen "layers" (sheets/modals) tied to the back button.
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let toastTimer;
export function toast(msg, { action, onAction, ms = 3200 } = {}) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button type="button">${esc(action)}</button>` : ''}`;
  t.classList.add('show');
  if (action) $('button', t).onclick = () => { t.classList.remove('show'); onAction && onAction(); };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

// ---- layers
const layers = [];

export function pushLayer(html, { cls = '', onClose, onMount } = {}) {
  const el = document.createElement('div');
  el.className = 'layer ' + cls;
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
  el.innerHTML = `<div class="layer-backdrop" data-act="close-layer"></div><div class="layer-panel">${html}</div>`;
  $('#layers').appendChild(el);
  layers.push({ el, onClose });
  history.pushState({ layer: layers.length }, '');
  document.body.classList.add('noscroll');
  requestAnimationFrame(() => el.classList.add('open'));
  onMount && onMount(el);
  const focusable = $('[autofocus], .layer-panel h2', el);
  if (focusable) { focusable.setAttribute('tabindex', '-1'); focusable.focus({ preventScroll: true }); }
  return el;
}

function removeTop() {
  const top = layers.pop();
  if (!top) return;
  top.el.classList.remove('open');
  setTimeout(() => top.el.remove(), 200);
  try { top.onClose && top.onClose(); } catch (e) { console.error(e); }
  if (!layers.length) document.body.classList.remove('noscroll');
}

/** Replace the contents of the top layer without touching history. */
export function swapTop(html, opts = {}) {
  const top = layers[layers.length - 1];
  if (!top) return pushLayer(html, opts);
  try { top.onClose && top.onClose(); } catch (e) { console.error(e); }
  $('.layer-panel', top.el).innerHTML = html;
  top.onClose = opts.onClose;
  top.el.className = 'layer open ' + (opts.cls || '');
  opts.onMount && opts.onMount(top.el);
  return top.el;
}

export const closeTop = () => { if (layers.length) history.back(); };
export const topLayer = () => (layers.length ? layers[layers.length - 1].el : null);
export const layerCount = () => layers.length;
export function closeAllLayers() { while (layers.length) removeTop(); }

window.addEventListener('popstate', () => { if (layers.length) removeTop(); });

export function confirmBox(message, { ok = 'Yes', cancel = 'Cancel' } = {}) {
  return new Promise(resolve => {
    let result = false;
    pushLayer(`<div class="confirm"><h2>${esc(message)}</h2><div class="row end"><button class="btn ghost" data-act="close-layer">${esc(cancel)}</button><button class="btn danger" data-confirm-ok>${esc(ok)}</button></div></div>`, {
      cls: 'small', onClose: () => resolve(result),
      onMount: el => { $('[data-confirm-ok]', el).onclick = () => { result = true; closeTop(); }; },
    });
  });
}
