// Opt-in application-shell caching and installation. Models and media are never precached here.
const base = import.meta.env.BASE_URL;
let installPrompt = null;
const listeners = new Set();
export const onOffline = fn => (listeners.add(fn), () => listeners.delete(fn));
export const offline = {ready: false, busy: false, installable: false, message: ''};
const emit = patch => { Object.assign(offline, patch); for (const fn of listeners) fn(offline); };

// The native install banner is not suppressed; this only enables an explicit in-app button too.
window.addEventListener('beforeinstallprompt', event => { installPrompt = event; emit({installable: true}); });
window.addEventListener('appinstalled', () => { installPrompt = null; emit({installable: false}); });

export async function install() {
  const event = installPrompt;
  installPrompt = null; emit({installable: false});
  if (!event) throw new Error('Use your browser menu to install this app.');
  await event.prompt();
}

export async function check() {
  try {
    const registration = await navigator.serviceWorker?.getRegistration(base);
    if (!registration?.active) { emit({ready: false}); return false; }
    const manifest = await (await fetch(new URL('offline-manifest.json', location.href), {cache: 'no-store'})).json();
    const cache = await caches.open(manifest.cacheName);
    const ready = (await Promise.all(manifest.files.map(path => cache.match(path)))).every(Boolean);
    emit({ready, message: ready ? '' : 'Offline copy incomplete. Enable again to repair.'});
    return ready;
  } catch { emit({ready: false, message: 'Offline copy could not be verified.'}); return false; }
}

export async function enable() {
  if (!('serviceWorker' in navigator)) throw new Error('This browser cannot keep an offline copy.');
  emit({busy: true, message: ''});
  try {
    const registration = await navigator.serviceWorker.register(`${base}sw.js?repair=${Date.now()}`, {scope: base, updateViaCache: 'none'});
    const worker = registration.installing || registration.waiting;
    if (worker) await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Offline setup timed out. Try again on a stable connection.')), 90000);
      const changed = () => {
        if (worker.state === 'activated') { clearTimeout(timer); resolve(); }
        else if (worker.state === 'redundant') { clearTimeout(timer); reject(new Error('Offline setup failed.')); }
      };
      worker.addEventListener('statechange', changed); changed();
    });
    await navigator.serviceWorker.ready;
    if (!await check()) throw new Error('Some app files were not cached. Try again.');
    navigator.storage?.persist?.().catch(() => {});
  } finally { emit({busy: false}); }
}

if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistration(base).then(r => r && check()).catch(() => {});
