const MAX_TEXT = 10 * 1024 * 1024;
const optionalText = (value, limit = MAX_TEXT) => {
  if (value == null) return undefined;
  if (typeof value !== 'string' || value.length > limit) throw new Error('Invalid or oversized transcript text');
  return value;
};
const time = value => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error('Invalid transcript timestamp');
  return value;
};
export function normalizeDocument(input) {
  if (!input || !Array.isArray(input.segments) || input.segments.length > 100000) throw new Error('Expected a bounded transcript segments array');
  let previous = -1;
  const segments = input.segments.map(s => {
    const start = time(s.start ?? s.startTime ?? (s.startMs == null ? undefined : s.startMs / 1000));
    const end = time(s.end ?? s.endTime ?? (s.endMs == null ? undefined : s.endMs / 1000));
    if (end < start || start < previous) throw new Error('Transcript segments must be chronological; overlaps are allowed');
    previous = start;
    const result = {start, end, text: optionalText(s.text ?? s.body) ?? ''};
    for (const field of ['speaker', 'translation']) {
      const v = optionalText(s[field], field === 'speaker' ? 128 : MAX_TEXT);
      if (v != null) result[field] = v;
    }
    if (s.words != null) {
      if (!Array.isArray(s.words) || s.words.length > 10000) throw new Error('Too many transcript words');
      let lastWord = -1;
      result.words = s.words.map(w => {
        const a = time(w.start ?? (w.startMs == null ? undefined : w.startMs / 1000));
        const b = time(w.end ?? (w.endMs == null ? undefined : w.endMs / 1000));
        if (b < a || a < lastWord) throw new Error('Invalid word timestamp order');
        lastWord = a;
        return {start:a,end:b,text:optionalText(w.text) ?? ''};
      });
    }
    return result;
  });
  const result = {language:optionalText(input.language,64) ?? 'auto',provider:optionalText(input.provider,128) ?? 'import',segments};
  for (const field of ['targetLanguage','translationProvider','model','translationModel','title','id']) {
    const value = optionalText(input[field],field === 'title' ? 1024 : 128);
    if (value != null) result[field] = value;
  }
  return result;
}
const subtitleTime = raw => {
  const parts = raw.replace(',', '.').split(':');
  if (parts.length < 2 || parts.length > 3 || !parts.every(p => /^\d+(?:\.\d+)?$/.test(p))) throw new Error('Invalid subtitle timestamp');
  const nums = parts.map(Number);
  if (nums.at(-1) >= 60 || (parts.length === 3 && nums[1] >= 60)) throw new Error('Invalid subtitle timestamp');
  return nums.reduce((acc,n) => acc * 60 + n,0);
};
export function parseTranscript(text, filename = '') {
  if (typeof text !== 'string' || text.length > 50 * 1024 * 1024) throw new Error('Transcript exceeds 50 MB text limit');
  const clean = text.replace(/^\uFEFF/, '').replace(/\r\n?/g,'\n').trim();
  if (/\.json$/i.test(filename) || clean.startsWith('{')) return normalizeDocument(JSON.parse(clean));
  const isVtt = clean.startsWith('WEBVTT');
  const blocks = clean.split(/\n\s*\n/);
  const segments = [];
  for (const block of blocks) {
    if (/^(WEBVTT|NOTE(?:\s|$)|STYLE(?:\s|$)|REGION(?:\s|$))/.test(block)) continue;
    const lines = block.split('\n');
    const index = lines.findIndex(line=>line.includes('-->'));
    if (index < 0) throw new Error('Expected SRT or WebVTT timed cues');
    const match = lines[index].match(/^\s*(\d[\d:.,]*)\s+-->\s+(\d[\d:.,]*)(?:\s+.*)?$/);
    if (!match) throw new Error('Invalid subtitle cue');
    let body = lines.slice(index + 1).join('\n');
    let speaker;
    if (isVtt) {
      const voice = body.match(/^<v(?:\.[^ >]+)?\s+([^>]+)>/);
      if (voice) speaker = voice[1];
      body = body.replace(/<[^>]*>/g,'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&');
    }
    segments.push({start:subtitleTime(match[1]),end:subtitleTime(match[2]),text:body,...(speaker ? {speaker} : {})});
  }
  if (!segments.length) throw new Error('No timed transcript segments found');
  return normalizeDocument({language:'auto',provider:'import',segments});
}
const stamp = (seconds, separator) => {
  const ms = Math.round(seconds * 1000);
  const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
  return [h,m,s].map(n=>String(n).padStart(2,'0')).join(':') + separator + String(ms % 1000).padStart(3,'0');
};
export function exportTranscript(input, format = 'json') {
  const doc = normalizeDocument(input);
  if (format === 'json') return JSON.stringify(doc,null,2);
  if (format === 'text' || format === 'txt') return doc.segments.map(s=>`[${stamp(s.start,'.')}] ${s.speaker ? s.speaker+': ' : ''}${s.text}${s.translation ? '\n'+s.translation : ''}`).join('\n\n');
  if (!['srt','vtt'].includes(format)) throw new Error('Unsupported export format');
  const cues = doc.segments.map((s,i)=>`${i+1}\n${stamp(s.start,format === 'srt' ? ',' : '.')} --> ${stamp(s.end,format === 'srt' ? ',' : '.')}\n${s.speaker ? s.speaker+': ' : ''}${s.text.replace(/\n\s*\n/g,'\n')}${s.translation ? '\n'+s.translation.replace(/\n\s*\n/g,'\n') : ''}`).join('\n\n');
  return (format === 'vtt' ? 'WEBVTT\n\n' : '') + cues + '\n';
}
export function activeSegments(doc, position) {
  if (!Number.isFinite(position) || position < 0) return [];
  const active = [];
  for (let i=0; i < doc.segments.length; i++) {
    const s = doc.segments[i];
    if (s.start > position) break;
    if (position < s.end) active.push(i);
  }
  return active;
}
export function tokenize(text, language = 'auto') {
  let locale;
  try { locale = language === 'auto' ? undefined : Intl.getCanonicalLocales(language)[0]; } catch { locale = undefined; }
  return [...new Intl.Segmenter(locale,{granularity:'word'}).segment(text)].map(s=>({text:s.segment,isWord:s.isWordLike,index:s.index}));
}
