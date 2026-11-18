import {html, safeHref, duration, shortDate} from './dom.js';
import {icon} from './icons.js';
import {store, coverOf, showTitle, inQueue} from '../services/store.js';
import {activeJob, failedJob, jobLabel} from '../services/jobs.js';
import {player, media} from '../services/player.js';

const hue = text => { let h = 0; for (const c of String(text || '?')) h = (h * 31 + c.codePointAt(0)) % 360; return h; };

/** Artwork with a typographic fallback tinted from the title. */
export function cover(src, title, size = 'md') {
  const url = safeHref(src);
  return url
    ? html`<span class="cover cover-${size}"><img src="${url}" alt="" loading="lazy" referrerpolicy="no-referrer" decoding="async"></span>`
    : html`<span class="cover cover-${size} cover-blank" style="--h:${hue(title)}" aria-hidden="true">${String(title || '♪').trim().charAt(0).toUpperCase()}</span>`;
}

export const iconBtn = (name, label, act, data = {}, extra = '') => html`<button type="button" class="icon-btn ${extra}" data-act="${act}" ${Object.entries(data).map(([k, v]) => html` data-${k}="${v}"`)} title="${label}" aria-label="${label}">${icon(name)}</button>`;

export const empty = (name, text, actions = '') => html`<div class="empty">${icon(name)}<p>${text}</p>${actions}</div>`;

export function ring(progress) {
  const p = Number.isFinite(progress) ? Math.max(0, Math.min(100, progress)) : null;
  return html`<span class="ring ${p === null ? 'ring-spin' : ''}" style="--p:${p ?? 25}" role="progressbar" aria-valuemin="0" aria-valuemax="100" ${p === null ? '' : html`aria-valuenow="${p}"`}></span>`;
}

/** Compact state glyphs: saved audio, transcript, translation, failure. */
export function badges(e) {
  const job = activeJob(e.id), failed = !job && failedJob(e.id);
  return html`<span class="badges">
    ${job ? html`<span class="badge badge-busy" title="${jobLabel(job)}">${ring(job.status === 'running' ? job.progress : 0)}${jobLabel(job)}</span>` : ''}
    ${failed ? html`<span class="badge badge-error" title="${failed.error}">${icon('alert')}</span>` : ''}
    ${e.audio ? html`<span class="badge" title="Saved on this device">${icon('saved')}</span>` : ''}
    ${e.doc ? html`<span class="badge" title="Transcript">${icon('transcript')}</span>` : ''}
    ${e.doc?.targetLanguage ? html`<span class="badge badge-tr" title="Translated">${icon('translate')}${e.doc.targetLanguage.toUpperCase()}</span>` : ''}
  </span>`;
}

export function progressBar(e) {
  const total = Number(e.duration) || 0, pos = Number(e.position) || 0;
  if (e.played || !total || pos < 5) return '';
  return html`<span class="mini-bar"><i style="width:${Math.min(100, pos / total * 100).toFixed(1)}%"></i></span>`;
}

export function episodeRow(e, {selecting = false, selected = false, showFeed = true, queueControls = false} = {}) {
  const playing = player.id === e.id && !media.paused;
  const remaining = e.duration && e.position && !e.played ? Math.max(0, e.duration - e.position) : e.duration;
  return html`<article class="ep ${e.played ? 'ep-played' : ''} ${player.id === e.id ? 'ep-current' : ''}" data-key="${e.id}">
    ${selecting
      ? html`<label class="ep-check"><input type="checkbox" data-change="select" data-id="${e.id}" ${selected ? 'checked' : ''} aria-label="Select ${e.title}"></label>`
      : html`<button type="button" class="ep-play" data-act="play" data-id="${e.id}" aria-label="${playing ? 'Pause' : 'Play'} ${e.title}">${cover(coverOf(e), showTitle(e) || e.title, 'sm')}<span class="ep-play-glyph">${icon(playing ? 'pause' : 'play')}</span></button>`}
    <button type="button" class="ep-main" data-act="episode" data-id="${e.id}">
      <span class="ep-kicker">${showFeed ? html`<span>${showTitle(e)}</span>` : ''}<span>${shortDate(e.published || e.createdAt)}</span></span>
      <span class="ep-title">${e.title || 'Untitled'}</span>
      <span class="ep-meta">${remaining ? html`<span>${e.position && !e.played ? `${duration(remaining)} left` : duration(remaining)}</span>` : ''}${e.played ? html`<span class="ep-done">${icon('check')}Played</span>` : ''}${badges(e)}</span>
      ${progressBar(e)}
    </button>
    ${queueControls
      ? html`<span class="ep-tail">${iconBtn('up', 'Move up', 'queue-move', {id: e.id, delta: -1})}${iconBtn('down', 'Move down', 'queue-move', {id: e.id, delta: 1})}${iconBtn('close', 'Remove from queue', 'queue-remove', {id: e.id})}</span>`
      : html`<span class="ep-tail">${iconBtn(inQueue(e.id) ? 'queued' : 'queue', inQueue(e.id) ? 'Remove from queue' : 'Add to queue', 'queue-toggle', {id: e.id}, inQueue(e.id) ? 'on' : '')}</span>`}
  </article>`;
}

export function feedTile(f, {subscribed = true} = {}) {
  const unplayed = subscribed ? store.episodes.filter(e => e.feedId === f.id && !e.played && !e.archived).length : 0;
  return html`<article class="tile" data-key="${f.id || f.url}">
    <button type="button" class="tile-main" data-act="${subscribed ? 'show' : 'preview'}" data-id="${f.id || f.url}">
      ${cover(f.image, f.title, 'lg')}${unplayed ? html`<span class="count" aria-label="${unplayed} new">${unplayed > 99 ? '99+' : unplayed}</span>` : ''}
      <span class="tile-title">${f.titleOverride || f.title || f.url}</span>
      ${f.author ? html`<span class="tile-sub">${f.author}</span>` : ''}
    </button>
    ${subscribed ? '' : store.feedById.has(f.url) ? html`<span class="tile-add on" title="Subscribed">${icon('check')}</span>` : iconBtn('plus', `Subscribe to ${f.title}`, 'subscribe', {url: f.url}, 'tile-add')}
  </article>`;
}

export const segmented = (name, value, options) => html`<div class="segctl" role="radiogroup">${options.map(([v, label, glyph]) => html`<label class="${String(v) === String(value) ? 'on' : ''}"><input type="radio" name="${name}" value="${v}" data-change="${name}" ${String(v) === String(value) ? 'checked' : ''}>${glyph ? icon(glyph) : ''}<span>${label}</span></label>`)}</div>`;

export const toggle = (name, checked, label, hint = '') => html`<label class="switch"><span><span class="switch-label">${label}</span>${hint ? html`<small>${hint}</small>` : ''}</span><input type="checkbox" role="switch" data-change="${name}" ${checked ? 'checked' : ''}><i aria-hidden="true"></i></label>`;

