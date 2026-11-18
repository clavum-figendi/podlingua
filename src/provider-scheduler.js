// Only origin + deadlines are shared across tabs. No keys, texts or provider
// response bodies enter storage. Web Locks serialize tabs where supported.
const PREFIX = 'podlingua-provider-pacing-v1:';
const read = key => { try { return typeof window === 'undefined' ? null : JSON.parse(localStorage.getItem(PREFIX + key) || 'null'); } catch { return null; } };
const write = (key, value) => { try { if(typeof window !== 'undefined') localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch {} };
function sleep(ms, signal) {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const done = () => { signal?.removeEventListener('abort', abort); resolve(); };
    const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(signal.reason); };
    const timer = setTimeout(done, ms); signal?.addEventListener('abort', abort, {once: true});
  });
}
function abortable(promise, signal) {
  if(!signal) return promise;
  signal.throwIfAborted();
  let abort;
  return Promise.race([promise, new Promise((_, reject) => { abort = () => reject(signal.reason); signal.addEventListener('abort', abort, {once: true}); })]).finally(() => signal.removeEventListener('abort', abort));
}
export function createProviderScheduler(options = {}) {
  const clock = options.now || Date.now, delay = options.sleep || sleep;
  const load = options.read || read, save = options.write || write, states = new Map();
  const lock = options.lock || ((key, fn, signal) => globalThis.navigator?.locks ? navigator.locks.request(PREFIX + key, {mode: 'exclusive', signal}, fn) : fn());
  return {
    run(url, work, {signal, intervalMs = 1500, onWait} = {}) {
      const key = new URL(url).origin;
      if(!Number.isFinite(intervalMs) || intervalMs < 0 || intervalMs > 60000) return Promise.reject(Error('Provider request interval must be 0–60000 ms.'));
      let state = states.get(key);
      if(!state) { state = {tail: Promise.resolve(), nextAt: 0, cooldownAt: 0}; states.set(key, state); }
      const task = state.tail.then(() => lock(key, async () => {
        signal?.throwIfAborted();
        const stored = load(key);
        for(const field of ['nextAt', 'cooldownAt']) if(Number.isFinite(stored?.[field]) && stored[field] <= clock() + 7 * 86400000) state[field] = Math.max(state[field], stored[field]);
        if(state.cooldownAt > clock()) {
          const seconds = Math.ceil((state.cooldownAt - clock()) / 1000);
          throw Object.assign(Error(`Provider cooldown: wait at least ${seconds} seconds, then explicitly resume. No request was sent. Choose on-device translation if the API allowance is exhausted.`), {code: 'PROVIDER_COOLDOWN', retryAfterSeconds: seconds});
        }
        const wait = Math.max(0, state.nextAt - clock());
        if(wait) { onWait?.({status: 'waiting for provider pacing', progress: null}); await delay(wait, signal); }
        signal?.throwIfAborted();
        state.nextAt = clock() + intervalMs; save(key, {nextAt: state.nextAt, cooldownAt: state.cooldownAt});
        try { return await work(); }
        catch(error) {
          if(error.status === 429) {
            state.cooldownAt = clock() + Math.max(1000, (error.retryAfterSeconds ?? 60) * 1000);
            save(key, {nextAt: state.nextAt, cooldownAt: state.cooldownAt});
          }
          throw error;
        }
      }, signal));
      state.tail = task.catch(() => {});
      return abortable(task, signal);
    },
  };
}
export const translationScheduler = createProviderScheduler();
