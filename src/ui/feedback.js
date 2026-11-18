import {html, esc, patch, guard} from './dom.js';
import {icon} from './icons.js';

const toasts = document.createElement('div');
toasts.className = 'toasts'; toasts.setAttribute('aria-live', 'polite');
document.body.append(toasts);

export function toast(message, {error = false, action, timeout = error ? 9000 : 4000} = {}) {
  const el = document.createElement('div');
  el.className = 'toast' + (error ? ' toast-error' : '');
  el.setAttribute('role', error ? 'alert' : 'status');
  el.innerHTML = `${icon(error ? 'alert' : 'check')}<span>${esc(message)}</span>`;
  if (action) {
    const b = Object.assign(document.createElement('button'), {type: 'button', textContent: action.label});
    b.onclick = guard(async () => { el.remove(); await action.run(); });
    el.append(b);
  }
  const close = Object.assign(document.createElement('button'), {type: 'button', className: 'icon-btn', title: 'Dismiss'});
  close.innerHTML = String(icon('close', 'Dismiss')); close.onclick = () => el.remove();
  el.append(close);
  toasts.append(el);
  setTimeout(() => el.remove(), timeout);
}

function makeDialog(id) {
  const d = document.createElement('dialog');
  d.id = id; d.className = 'sheet';
  d.innerHTML = '<div class="sheet-body"></div>';
  d.addEventListener('click', e => { if (e.target === d) d.close(); });
  document.body.append(d);
  return d;
}

const sheet = makeDialog('sheet');
let active = null;
sheet.addEventListener('close', () => { const a = active; active = null; a?.onClose?.(); });

/** Opens the shared bottom sheet; `render` is re-run by refreshSheet() when data changes. */
export function openSheet(render, {onClose, wide = false} = {}) {
  const previous = active;
  active = {render, onClose};
  if (previous && previous.render !== render) previous.onClose?.();
  sheet.classList.toggle('sheet-wide', wide);
  refreshSheet();
  if (!sheet.open) sheet.showModal();
  sheet.querySelector('.sheet-body').scrollTop = 0;
}
export const refreshSheet = () => { if (active) patch(sheet.firstElementChild, String(active.render())); };
export const closeSheet = () => sheet.open && sheet.close();
export const sheetOpen = () => sheet.open;

const confirmDialog = makeDialog('confirm');
confirmDialog.classList.add('sheet-confirm');
/** Promise-based confirmation. Resolves true only on the explicit confirm button. */
export function ask(title, {detail = '', confirm = 'Continue', danger = false, cancel = 'Cancel'} = {}) {
  return new Promise(resolve => {
    confirmDialog.firstElementChild.innerHTML = String(html`
      <h2>${title}</h2>${detail ? html`<p class="muted">${detail}</p>` : ''}
      <div class="row-end"><button type="button" class="btn ghost" value="no">${cancel}</button><button type="button" class="btn ${danger ? 'danger' : 'primary'}" value="yes">${confirm}</button></div>`);
    let answer = false;
    confirmDialog.querySelectorAll('button[value]').forEach(b => { b.onclick = () => { answer = b.value === 'yes'; confirmDialog.close(); }; });
    confirmDialog.addEventListener('close', () => resolve(answer), {once: true});
    confirmDialog.showModal();
    confirmDialog.querySelector('button[value="yes"]').focus();
  });
}
