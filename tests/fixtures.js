// Deterministic network fixtures for UI tests: no real directory, feed, media or provider is contacted.
export const FEED = 'https://feeds.example.org/cafe.xml';
export const SECOND_FEED = 'https://feeds.example.org/science.xml';
const MEDIA = 'https://media.example.org/';
const art = (hue, letter) => `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="hsl(${hue} 55% 45%)"/><circle cx="210" cy="90" r="60" fill="hsl(${hue} 70% 70%)"/><text x="40" y="250" font-size="120" font-family="Georgia" fill="#fff">${letter}</text></svg>`;

export function wav(seconds = 6, rate = 16000) {
  const n = seconds * rate, buffer = Buffer.alloc(44 + n * 2);
  buffer.write('RIFF', 0); buffer.writeUInt32LE(36 + n * 2, 4); buffer.write('WAVEfmt ', 8); buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22); buffer.writeUInt32LE(rate, 24); buffer.writeUInt32LE(rate * 2, 28);
  buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34); buffer.write('data', 36); buffer.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buffer.writeInt16LE(Math.round(Math.sin(i / rate * 2 * Math.PI * 220) * (i % rate < rate / 2 ? 6000 : 0)), 44 + i * 2);
  return buffer;
}

const lines = [
  [0, 2.2, 'Bonjour et bienvenue au Café des langues.', 'Hello and welcome to the Language Café.'],
  [2.2, 4.1, 'Aujourd’hui, on parle du marché du dimanche.', 'Today we talk about the Sunday market.'],
  [4.1, 6, 'Les fraises sont arrivées, enfin !', 'The strawberries have arrived, finally!'],
];
export const transcriptJSON = JSON.stringify({language: 'fr', segments: lines.map(([start, end, text]) => ({start, end, text, speaker: 'Léa'}))});

function rss(url, title, hue, count) {
  const items = Array.from({length: count}, (_, i) => `<item><title>${i === 0 ? 'Le marché du dimanche' : `Épisode ${count - i} : petites histoires`}</title><guid>${url}#${i}</guid><pubDate>${new Date(Date.UTC(2026, 10, 17 - i * 3)).toUTCString()}</pubDate><itunes:duration>${6 + i}:30</itunes:duration><description>Une conversation lente et claire pour apprendre le français au quotidien.</description><enclosure url="${MEDIA}${encodeURIComponent(title)}-${i}.wav" type="audio/wav" length="192044"/>${i === 0 ? `<podcast:transcript url="${MEDIA}transcript-${i}.json" type="application/json" language="fr"/>` : ''}</item>`).join('');
  return `<?xml version="1.0"?><rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:podcast="https://podcastindex.org/namespace/1.0"><channel><title>${title}</title><link>https://example.org/</link><language>fr</language><itunes:author>Radio Exemple</itunes:author><description>Des épisodes courts en français facile.</description><itunes:image href="https://img.example.org/${hue}.svg"/>${items}</channel></rss>`;
}

const directory = [[FEED, 'Café des langues', 'Radio Exemple', 175], [SECOND_FEED, 'Science en bref', 'Labo Ouvert', 210], ['https://feeds.example.org/histoire.xml', 'Histoire pour tous', 'Les Archives', 25], ['https://feeds.example.org/cuisine.xml', 'Cuisine du coin', 'Table Ronde', 120], ['https://feeds.example.org/sport.xml', 'Le Sport Lent', 'Stade FM', 280], ['https://feeds.example.org/jazz.xml', 'Nuits Jazz', 'Club 9', 330]];

/** Installs all routes on a Playwright page or context. */
export async function mockNetwork(target) {
  const cors = {'access-control-allow-origin': '*'};
  await target.route('https://itunes.apple.com/**', route => {
    const results = directory.map(([feedUrl, collectionName, artistName, hue]) => ({feedUrl, collectionName, artistName, artworkUrl600: `https://img.example.org/${hue}.svg`}));
    const url = route.request().url();
    if (url.includes('toppodcasts')) return route.fulfill({headers: cors, json: {feed: {entry: directory.map(([, name, artist], i) => ({id: {attributes: {'im:id': String(i)}}, 'im:name': {label: name}, 'im:artist': {label: artist}}))}}});
    if (url.includes('/lookup')) return route.fulfill({headers: cors, json: {results: [results[Number(new URL(url).searchParams.get('id'))]]}});
    return route.fulfill({headers: cors, json: {results}});
  });
  await target.route('https://img.example.org/**', route => {
    const hue = Number(route.request().url().match(/(\d+)\.svg/)?.[1] || 0);
    const entry = directory.find(d => d[3] === hue);
    return route.fulfill({headers: {...cors, 'content-type': 'image/svg+xml'}, body: art(hue, entry?.[1][0] || 'P')});
  });
  await target.route('https://feeds.example.org/**', route => {
    const entry = directory.find(d => d[0] === route.request().url());
    if (!entry) return route.fulfill({status: 404, headers: cors, body: ''});
    return route.fulfill({headers: {...cors, 'content-type': 'application/rss+xml'}, body: rss(entry[0], entry[1], entry[3], entry[0] === FEED ? 8 : 4)});
  });
  await target.route(`${MEDIA}**`, route => route.request().url().includes('transcript')
    ? route.fulfill({headers: {...cors, 'content-type': 'application/json'}, body: transcriptJSON})
    : route.fulfill({headers: {...cors, 'content-type': 'audio/wav', 'accept-ranges': 'bytes'}, body: wav()}));
  await target.route('https://libretranslate.com/translate', async route => {
    const {q} = route.request().postDataJSON();
    const map = Object.fromEntries(lines.map(([, , fr, en]) => [fr, en]));
    return route.fulfill({headers: cors, json: {translatedText: q.map(text => map[text] || `[en] ${text}`)}});
  });
}
