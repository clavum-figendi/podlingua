import morphdom from 'morphdom';

// Every interpolated value is escaped unless it is an explicit `raw()`/`html` fragment.
const ESCAPES = {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'};
export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ESCAPES[c]);
class Raw { constructor(value) { this.value = value; } toString() { return this.value; } }
export const raw = value => new Raw(String(value));
const part = value => value == null || value === false ? '' : value instanceof Raw ? value.value : Array.isArray(value) ? value.map(part).join('') : esc(value);
export const html = (strings, ...values) => new Raw(strings.reduce((out, s, i) => out + s + (i < values.length ? part(values[i]) : ''), ''));

export const go = path => { location.hash = '#/' + path; };
export const $ = (selector, root = document) => root.querySelector(selector);

/** Patch children in place so focus, scroll and media elements survive re-renders. */
export function patch(element, markup) {
  morphdom(element, `<div>${markup}</div>`, {
    childrenOnly: true,
    getNodeKey: node => node.id || node.dataset?.key,
    onBeforeElUpdated(from, to) {
      if (from.isEqualNode(to)) return false;
      // Large, expensive subtrees (transcripts) opt out when their signature is unchanged.
      if (from.dataset.sig && from.dataset.sig === to.dataset.sig) return false;
      if (from === document.activeElement && from.matches('input,textarea,select')) return false;
      if (from.tagName === 'DETAILS' && !to.hasAttribute('data-force')) to.open = from.open;
      if (from.tagName === 'DIALOG') return false;
      return true;
    },
  });
}

const handlers = {click: {}, change: {}, input: {}, submit: {}};
let onError = error => console.error(error);
export const setErrorHandler = fn => { onError = fn; };
export const guard = fn => (...args) => Promise.resolve().then(() => fn(...args)).catch(error => onError(error));
/** Register delegated handlers: data-act (click), data-change, data-input, data-submit. */
export function on(type, map) { Object.assign(handlers[type], map); }
const attribute = {click: 'act', change: 'change', input: 'input', submit: 'submit'};
for (const type of Object.keys(handlers)) {
  document.addEventListener(type, event => {
    const key = attribute[type], el = event.target.closest?.(`[data-${key}]`);
    if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return;
    const fn = handlers[type][el.dataset[key]];
    if (!fn) return;
    if (type === 'click' || type === 'submit') event.preventDefault();
    if (type === 'click') event.stopPropagation();
    guard(fn)(el, event);
  });
}

export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export function pickFiles({accept = '', multiple = false, directory = false} = {}) {
  return new Promise(resolve => {
    const input = Object.assign(document.createElement('input'), {type: 'file', accept, multiple});
    if (directory) input.webkitdirectory = true;
    input.addEventListener('change', () => resolve([...input.files]), {once: true});
    input.addEventListener('cancel', () => resolve([]), {once: true});
    input.click();
  });
}

export const clock = seconds => {
  const s = Math.max(0, Math.floor(Number(seconds) || 0)), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, r = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`;
};
export const duration = seconds => {
  const m = Math.round((Number(seconds) || 0) / 60);
  return !m ? '' : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60 ? (m % 60) + ' min' : ''}`.trim();
};
const dateFormat = new Intl.DateTimeFormat(undefined, {day: 'numeric', month: 'short'});
const yearFormat = new Intl.DateTimeFormat(undefined, {day: 'numeric', month: 'short', year: 'numeric'});
export const shortDate = value => {
  const d = new Date(value);
  if (!value || !Number.isFinite(d.getTime())) return '';
  return (d.getFullYear() === new Date().getFullYear() ? dateFormat : yearFormat).format(d);
};
export const bytes = n => {
  const value = Number(n) || 0, units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(Math.max(1, value)) / Math.log(1024)));
  return `${(value / 1024 ** i).toFixed(i > 1 ? 1 : 0)} ${units[i]}`;
};
/** Show notes are reduced to inert text. */
export const plainText = value => new DOMParser().parseFromString(String(value ?? ''), 'text/html').body.textContent?.trim() || '';
export const safeHref = value => { try { const u = new URL(value); return /^https?:$/.test(u.protocol) && !u.username && !u.password ? u.href : ''; } catch { return ''; } };
