import {html, bytes} from '../ui/dom.js';
import {icon} from '../ui/icons.js';
import {iconBtn} from '../ui/parts.js';
import {store} from '../services/store.js';
import {computeStatistics} from '../parity.js';

const hours = seconds => { if (seconds > 0 && seconds < 60) return `${Math.round(seconds)} s`; const m = Math.round(seconds / 60); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`; };

/** 30-day measured listening: one series, so one hue and no legend; each bar carries its own tooltip. */
function dailyChart(daily) {
  const byDay = new Map(daily.map(d => [d.day, d.seconds])), days = [];
  for (let i = 29; i >= 0; i--) { const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10); days.push({day: d, seconds: byDay.get(d) || 0}); }
  const max = Math.max(60, ...days.map(d => d.seconds)), W = 900, H = 150, slot = W / days.length, bar = slot - 2;
  const fmt = new Intl.DateTimeFormat(undefined, {day: 'numeric', month: 'short'});
  return html`<figure class="chart">
    <svg viewBox="0 0 ${W} ${H + 22}" role="img" aria-label="Minutes listened per day, last 30 days">
      <line x1="0" x2="${W}" y1="${H}" y2="${H}" class="axis"/>
      ${days.map((d, i) => { const h = d.seconds ? Math.max(3, d.seconds / max * (H - 8)) : 0, x = i * slot + 1; return html`<g class="bar-hit"><rect x="${i * slot}" y="0" width="${slot}" height="${H}" fill="transparent"/>${h ? html`<path d="M${x} ${H}V${H - h + 4}a4 4 0 0 1 4-4h${bar - 8}a4 4 0 0 1 4 4V${H}z" class="bar"/>` : ''}<title>${fmt.format(new Date(d.day))}: ${hours(d.seconds)}</title></g>`; })}
      <text x="0" y="${H + 16}" class="tick-label">${fmt.format(new Date(days[0].day))}</text>
      <text x="${W}" y="${H + 16}" class="tick-label" text-anchor="end">Today</text>
    </svg>
    <figcaption class="sr"><table><tr><th>Day</th><th>Minutes</th></tr>${days.map(d => html`<tr><td>${d.day}</td><td>${Math.round(d.seconds / 60)}</td></tr>`)}</table></figcaption>
  </figure>`;
}

function render() {
  const st = computeStatistics(store.episodes, store.feeds, store.state);
  const shows = st.byShow.filter(g => g.listeningSeconds > 0).slice(0, 12), top = Math.max(1, ...shows.map(g => g.listeningSeconds));
  return html`<div class="page">
    <div class="crumbs">${iconBtn('left', 'Back', 'back')}</div>
    <header class="page-head"><h1>Listening</h1></header>
    <section class="stat-tiles">
      <div class="stat"><span class="stat-value">${hours(st.recordedListeningSeconds)}</span><span class="stat-label">${icon('headphones')}Listened</span></div>
      <div class="stat"><span class="stat-value">${st.completionEvents}</span><span class="stat-label">${icon('played')}Finished</span></div>
      <div class="stat"><span class="stat-value">${hours(st.remainingSeconds)}</span><span class="stat-label">${icon('inbox')}Still to hear</span></div>
      <div class="stat"><span class="stat-value">${bytes(st.savedBytes)}</span><span class="stat-label">${icon('saved')}${st.savedEpisodes} saved</span></div>
    </section>
    <section><h2 class="section-title">${icon('stats')}Last 30 days</h2>${dailyChart(st.daily)}</section>
    ${shows.length ? html`<section><h2 class="section-title">${icon('library')}By show</h2><ul class="hbars">${shows.map(g => html`<li><span class="hbar-label">${g.title}</span><span class="hbar"><i style="width:${(g.listeningSeconds / top * 100).toFixed(1)}%"></i></span><span class="hbar-value">${hours(g.listeningSeconds)}</span></li>`)}</ul></section>` : ''}
    <p class="fineprint">Only time actually played counts. Marking an episode played adds nothing.</p>
  </div>`;
}

export default {render, title: () => 'Listening'};
