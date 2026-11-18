import {html, on, clock} from '../ui/dom.js';
import {icon} from '../ui/icons.js';
import {cover, episodeRow, progressBar, badges} from '../ui/parts.js';
import {store, coverOf, showTitle, visible} from '../services/store.js';
import {prefs, savePrefs} from '../services/prefs.js';
import {player, media} from '../services/player.js';
import {languageSelect} from './sheets.js';

const languagePair = () => html`<div class="lang-pair hero-pair">
  <label class="lang">${icon('wave')}<span class="sr">Language you listen to</span>${languageSelect('home-source', prefs.source, true, 'Language you listen to')}</label>
  <span class="pair-link on" aria-hidden="true">${icon('right')}</span>
  <label class="lang">${icon('translate')}<span class="sr">Translate into</span>${languageSelect('home-target', prefs.target, false, 'Translate into')}</label>
</div>`;

/** First run: the empty library demonstrates the read-along idea instead of explaining it. */
function welcome() {
  return html`<section class="welcome">
    <div class="demo" aria-hidden="true">
      <p class="demo-line"><span>On</span> <span>écoute</span> <span>et</span> <span>on</span> <span>lit.</span></p>
      <p class="demo-tr">We listen and we read.</p>
    </div>
    <h1>Listen in one language.<br>Read along in two.</h1>
    ${languagePair()}
    <div class="action-row center">
      <a class="btn primary big" href="#/discover">${icon('search')}Find a podcast</a>
      <button type="button" class="btn big" data-act="import-audio">${icon('upload')}Add audio</button>
    </div>
    <p class="fineprint center">Everything stays in this browser unless you choose an online service.</p>
  </section>`;
}

function continueCard(e) {
  const playing = player.id === e.id && !media.paused;
  return html`<section class="hero-card">
    <button type="button" class="hero-cover" data-act="read" data-id="${e.id}" aria-label="Open read-along">${cover(coverOf(e), showTitle(e) || e.title, 'xl')}</button>
    <div class="hero-body">
      <span class="kicker">${showTitle(e)}</span>
      <h2><button type="button" class="link" data-act="episode" data-id="${e.id}">${e.title}</button></h2>
      ${progressBar(e)}${badges(e)}
      <div class="action-row">
        <button type="button" class="btn primary" data-act="play" data-id="${e.id}">${icon(playing ? 'pause' : 'play')}${playing ? 'Pause' : e.position > 5 && !e.played ? `Resume · ${clock(e.position)}` : 'Play'}</button>
        <button type="button" class="btn" data-act="read" data-id="${e.id}">${icon('transcript')}Read along</button>
      </div>
    </div>
  </section>`;
}

function render() {
  if (!store.ready) return html`<div class="loading" aria-busy="true"></div>`;
  if (!store.episodes.length && !store.feeds.length) return welcome();
  const last = store.byId.get(player.id || store.state.lastEpisodeId);
  const queue = store.state.queue.map(id => store.byId.get(id)).filter(e => e && e.id !== last?.id).slice(0, 12);
  const fresh = store.episodes.filter(e => e.feedId && !e.played && !e.archived && visible(e) && e.id !== last?.id).sort((a, b) => (b.published || 0) - (a.published || 0)).slice(0, 8);
  const files = store.episodes.filter(e => !e.feedId && e.id !== last?.id).slice(0, 4);
  return html`<div class="page">
    <header class="page-head"><h1>Listen</h1>
      <div class="head-tools">${languagePair()}<button type="button" class="icon-btn" data-act="import-audio" title="Add audio" aria-label="Add audio">${icon('upload')}</button></div>
    </header>
    ${last ? continueCard(last) : ''}
    ${queue.length ? html`<section><div class="section-head"><h2>${icon('queue')}Up next</h2><a class="icon-link" href="#/library/queue" aria-label="Open queue">${icon('right')}</a></div>
      <div class="shelf">${queue.map(e => html`<button type="button" class="shelf-item" data-act="play" data-id="${e.id}" data-key="${e.id}">${cover(coverOf(e), showTitle(e) || e.title, 'lg')}<span class="tile-title">${e.title}</span><span class="tile-sub">${showTitle(e)}</span></button>`)}</div></section>` : ''}
    ${fresh.length ? html`<section><div class="section-head"><h2>${icon('inbox')}New</h2><a class="icon-link" href="#/library/new" aria-label="All new episodes">${icon('right')}</a></div><div class="list-eps">${fresh.map(e => episodeRow(e))}</div></section>` : ''}
    ${files.length ? html`<section><div class="section-head"><h2>${icon('folder')}My files</h2><a class="icon-link" href="#/library/files" aria-label="All files">${icon('right')}</a></div><div class="list-eps">${files.map(e => episodeRow(e, {showFeed: false}))}</div></section>` : ''}
    ${store.feeds.length ? html`<section><div class="section-head"><h2>${icon('library')}Shows</h2><a class="icon-link" href="#/library/shows" aria-label="All shows">${icon('right')}</a></div>
      <div class="shelf">${[...store.feedById.values()].map(f => html`<button type="button" class="shelf-item small" data-act="show" data-id="${f.id}" data-key="${f.id}" title="${f.title}">${cover(f.image, f.title, 'md')}</button>`)}</div></section>` : html`<a class="callout link-card" href="#/discover">${icon('discover')}<span><strong>Find shows to follow</strong><small>Search millions of podcasts.</small></span>${icon('right')}</a>`}
  </div>`;
}

on('change', {
  'home-source': el => savePrefs({source: el.value}),
  'home-target': el => savePrefs({target: el.value}),
});

export default {render, title: () => 'Listen'};
