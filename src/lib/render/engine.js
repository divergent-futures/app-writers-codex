// @ts-nocheck
/* Writer's Codex — render engine.
 *
 * The proven view-rendering logic from the story-workbench prototype, ported as PURE functions
 * (data -> HTML string). No global `const P`, no DOM side effects, no event binding: the Svelte
 * layer sets the data via setData(), renders these strings with {@html}, and owns all interaction
 * and re-rendering. That keeps ~all of the prototype's behaviour while making it reactive and
 * editable. DOM-writer functions from the prototype (renderMatrixBody, renderCockpit, refRender…)
 * are converted here to return strings instead of writing to element ids.
 */

let P = {
  books: [], threads: [], characters: [], worlds: [], tracks: [], timeline: [],
  chapters: [], notes: [], research: [], themes: [], pantheon: [], reading: [], religions: [],
  series: { title: '' },
};

/** Set the active project data the engine renders from. */
export function setData(data) { P = data || P; }
export function data() { return P; }

/* ---------------- helpers ---------------- */
export const esc = (s) => (s == null ? '' : String(s)).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const byId = (arr, id) => (arr || []).find((x) => x.id === id);
const threadById = (id) => byId(P.threads, id);
const bookById = (id) => byId(P.books, id);
const charById = (id) => byId(P.characters, id);
const worldById = (id) => byId(P.worlds, id);
const CIRCLE = [['you', 'You'], ['need', 'Need'], ['go', 'Go'], ['search', 'Search'], ['find', 'Find'], ['take', 'Take'], ['return', 'Return'], ['change', 'Change']];
function scoreColor(n) { if (n == null || n === '') return 'var(--muted)'; n = +n; if (n >= 8) return 'var(--good)'; if (n >= 5.5) return 'var(--warn)'; return 'var(--bad)'; }
function circleColor(steps) { return scoreColor(((steps || []).length / 8) * 10); }
function dlink(type, id, label) { return '<span class="link" data-detail="' + type + ':' + id + '">' + esc(label) + '</span>'; }
function threadChip(id) { const t = threadById(id); if (!t) return ''; return '<span class="chip clik" data-detail="thread:' + id + '"><span class="dot" style="background:' + esc(t.color || '#888') + '"></span>' + esc(t.name) + '</span>'; }
function bookChip(id) { const b = bookById(id); return b ? '<span class="book-chip">' + esc(b.title) + '</span>' : ''; }
function pill(label, val) { return '<span class="sc" style="--c:' + scoreColor(val) + '">' + label + ' ' + (val == null || val === '' ? '—' : esc(val)) + '</span>'; }
function gallery(media) { if (!(media || []).length) return ''; return '<div class="gallery">' + media.map((m) => (m.type === 'video') ? '<video controls src="' + esc(m.file) + '"></video>' : '<img src="' + esc(m.file) + '" alt="' + esc(m.caption || '') + '">').join('') + '</div>'; }
function scoreStrip(a) {
  const sc = (a && a.scores) ? a.scores : {}, steps = (a && a.circle) ? a.circle : [];
  let s = '<div class="scorebar">' + pill('P', sc.proactivity) + pill('R', sc.relatability) + pill('C', sc.capability) + '<span class="cdots" title="Story Circle">';
  CIRCLE.forEach((c) => { s += '<span class="cdot' + (steps.includes(c[0]) ? ' on' : '') + '" title="' + c[1] + '"></span>'; });
  return s + '<span class="cnum" style="color:' + circleColor(steps) + '">' + steps.length + '/8</span></span></div>' + ((a && a.rationale) ? '<div class="srat">' + esc(a.rationale) + '</div>' : '');
}
function appearsList(cid) { return (P.chapters || []).filter((ch) => ch.pov === cid || (ch.scenes || []).some((s) => (s.characters || []).includes(cid))); }
export function imgSlot(type, id, size, fallback) { const por = (type === 'character' || type === 'pantheon') ? ' portrait' : ''; return '<div class="imgslot is-' + (size || 'card') + por + '" data-imgslot="' + type + ':' + id + '"' + (fallback ? ' data-imgfb="' + esc(fallback) + '"' : '') + ' title="Click to add or change photo"><span class="imgph">+ photo</span></div>'; }
function imgRO(k, fb) { return '<div class="roimg" data-imgro="' + k + '"' + (fb ? ' data-imgfb="' + esc(fb) + '"' : '') + '></div>'; }
export function mdLite(t) {
  if (!t) return '';
  const inl = (s) => esc(s).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\*([^*]+)\*/g, '<i>$1</i>').replace(/`([^`]+)`/g, '<code>$1</code>');
  const lines = String(t).split(/\r?\n/); let out = [], inList = false;
  for (let i = 0; i < lines.length; i++) {
    const q = lines[i].trim();
    if (!q) { if (inList) { out.push('</ul>'); inList = false; } continue; }
    const hm = q.match(/^(#{1,4})\s+(.*)/);
    if (hm) { if (inList) { out.push('</ul>'); inList = false; } out.push('<div class="wbh wbh' + hm[1].length + '">' + inl(hm[2]) + '</div>'); continue; }
    if (/^[-*]\s+/.test(q)) { if (!inList) { out.push('<ul class="wbul">'); inList = true; } out.push('<li>' + inl(q.replace(/^[-*]\s+/, '')) + '</li>'); continue; }
    if (inList) { out.push('</ul>'); inList = false; }
    out.push('<p>' + inl(q) + '</p>');
  }
  if (inList) out.push('</ul>');
  return out.join('');
}

/* ---------------- Dashboard ---------------- */
export function vDashboard(rt) {
  rt = rt || {};
  const scenes = (P.chapters || []).reduce((n, c) => n + ((c.scenes || []).length), 0);
  const stats = [['Books', (P.books || []).length], ['Characters', (P.characters || []).length], ['Threads', (P.threads || []).length],
  ['Worlds', (P.worlds || []).length], ['Timeline beats', (P.timeline || []).length], ['Chapters', (P.chapters || []).length], ['Scenes', scenes], ['Notes', (P.notes || []).length]];
  let h = '<h2>Overview</h2>';
  const _lc = rt.lastChapter ? byId(P.chapters, rt.lastChapter) : null;
  const _drafting = (P.chapters || []).filter((c) => (c.status === 'drafting') || c.next);
  if (_lc || _drafting.length) {
    h += '<div class="resume"><div class="rh">Pick up where you left off</div>';
    if (_lc) {
      const _pk = rt.lastPark || '';
      h += '<div class="rt">' + esc(_lc.title || _lc.id) + '</div><div class="muted" style="font-size:12px">' + esc((bookById(_lc.book) || {}).title || '') + '</div>';
      if (_lc.next) h += '<div class="rp"><b>Next:</b> ' + esc(_lc.next) + '</div>';
      if (_pk) h += '<div class="rp">' + esc(_pk) + '</div>';
      h += '<span class="btn" data-resume="' + _lc.id + '">Resume writing</span>';
    } else { h += '<div class="muted" style="font-size:13px">Open a chapter in Write to start a thread you can pick back up.</div>'; }
    if (_drafting.length) { h += '<div style="margin-top:14px"><div class="rh">In progress</div>' + _drafting.map((c) => '<div class="inprog" data-resume="' + c.id + '">' + esc(c.title || c.id) + (c.next ? ' &mdash; <span class="muted">' + esc(c.next) + '</span>' : '') + '<div class="ipn">' + esc((bookById(c.book) || {}).title || '') + ' &middot; ' + esc(c.status || '') + '</div></div>').join('') + '</div>'; }
    h += '</div>';
  }
  if (P.series && P.series.logline) h += '<p style="font-size:15px;max-width:760px">' + esc(P.series.logline) + '</p>';
  const _goto = { 'Books': 'books', 'Characters': 'characters', 'Threads': 'threads', 'Worlds': 'worlds', 'Timeline beats': 'timeline', 'Chapters': 'outline', 'Scenes': 'outline', 'Notes': 'notes' };
  h += '<div class="stats">' + stats.map((s) => { const g = _goto[s[0]]; return '<div class="stat' + (g ? ' clik' : '') + '"' + (g ? ' data-goto="' + g + '"' : '') + '><div class="n">' + s[1] + '</div><div class="l">' + s[0] + '</div></div>'; }).join('') + '</div>';
  if ((P.books || []).length) {
    h += '<h2 style="margin-top:8px">Progress</h2><div class="prog">';
    (P.books || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0)).forEach((bk) => {
      const chs = (P.chapters || []).filter((c) => c.book === bk.id);
      const written = chs.filter((c) => ((c._words || c.wordcount || 0) > 0) || c.status === 'revised' || c.status === 'done').length;
      const wds = chs.reduce((n, c) => n + (c._words || c.wordcount || 0), 0);
      const tgt = bk.wordTarget || 0;
      const pct = tgt ? Math.min(100, Math.round(wds / tgt * 100)) : (chs.length ? Math.round(written / chs.length * 100) : 0);
      h += '<div class="progrow"><div class="progtop"><span>' + esc(bk.title) + '</span><span class="muted">' + written + '/' + chs.length + ' ch · ' + wds.toLocaleString() + (tgt ? ' / ' + tgt.toLocaleString() : '') + ' words</span></div><div class="progbar"><div class="progfill" style="width:' + pct + '%"></div></div></div>';
    });
    h += '</div>';
  }
  const todo = [];
  (P.characters || []).forEach((c) => { if (!c.oneLine || !(c.arcs && c.arcs.length)) todo.push('Define ' + c.name + "'s arc & scores"); });
  (P.timeline || []).forEach((e) => { if (!e.summary) todo.push('Write the beat for "' + e.label + '"'); });
  if (!(P.chapters || []).length) todo.push('Add your first chapters and scenes');
  if (todo.length) h += '<div class="callout"><b>Next:</b> ' + todo.length + ' open slots &middot; e.g. ' + todo.slice(0, 3).map(esc).join(' &middot; ') + (todo.length > 3 ? ' &hellip;' : '') + '</div>';
  if ((P.worlds || []).length) h += '<h2 style="margin-top:8px">Worlds &amp; species</h2><div class="worlds">' +
    P.worlds.map((w) => '<div class="world" data-detail="world:' + w.id + '"><div class="wn">' + esc(w.name) + '</div>' + (w.note ? '<div class="wnote">' + esc(w.note) + '</div>' : '') + '</div>').join('') + '</div>';
  return h;
}

/* ---------------- Timeline ---------------- */
export function tlList() {
  const items = (P.timeline || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  if (!items.length) return '<p class="empty">No beats yet.</p>';
  let h = '<div class="tl">';
  items.forEach((e) => {
    h += '<div class="tl-item clik" data-detail="beat:' + e.id + '">';
    if (e.era) h += '<div class="tl-era">' + esc(e.era) + '</div>';
    h += '<div class="tl-label">' + esc(e.label) + '</div>';
    let chips = (e.threads || []).map(threadChip).join('') + (e.book ? bookChip(e.book) : '');
    if (chips) h += '<div style="margin:3px 0 4px">' + chips + '</div>';
    h += '<div class="tl-sum' + (e.summary ? '' : ' empty') + '">' + (e.summary ? esc(e.summary) : '— beat not written yet') + '</div></div>';
  });
  return h + '</div>';
}
export function tlSpread(filter) {
  let items = (P.timeline || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  const onT = (e, tk) => e.track === tk || (e.alsoTracks || []).includes(tk);
  const arr = Array.isArray(filter) ? filter : null; const isAll = (filter === 'all' || filter == null);
  if (arr) { if (!arr.length) return '<p class="empty">No tracks selected. Pick one or more, or All tracks.</p>'; items = items.filter((e) => arr.some((tk) => onT(e, tk))); }
  if (!items.length) return '<p class="empty">No beats in this selection yet.</p>';
  const COLW = 150; const col = {}; items.forEach((e, i) => { col[e.id] = i; }); const W = items.length * COLW;
  let bands = '';
  (P.books || []).forEach((b) => {
    const cs = items.filter((e) => e.book === b.id).map((e) => col[e.id]); if (!cs.length) return;
    const l = Math.min.apply(null, cs) * COLW, r = (Math.max.apply(null, cs) + 1) * COLW;
    bands += '<div class="band" style="left:' + l + 'px;width:' + (r - l) + 'px"><span class="bandlab">' + esc((b.title || '').split(' — ')[0]) + '</span></div>';
  });
  let laneTracks;
  if (arr) {
    laneTracks = (P.tracks || []).filter((t) => arr.indexOf(t.id) >= 0 && items.some((e) => onT(e, t.id)));
    const spine = (P.tracks || []).find((t) => t.kind === 'spine');
    if (spine && arr.indexOf(spine.id) < 0 && items.some((e) => onT(e, spine.id))) laneTracks = laneTracks.concat([spine]);
  } else {
    laneTracks = (P.tracks || []).filter((t) => items.some((e) => onT(e, t.id)));
  }
  const lane = (t) => {
    const c = esc(t.color || '#888');
    let lab = '<div class="swimlabel' + (t.world ? ' clik' : '') + '"' + (t.world ? ' data-detail="world:' + t.world + '"' : '') + '><span class="dot" style="background:' + c + '"></span>' + esc(t.name) + '</div>';
    let r = '<div class="swimrow">' + lab + '<div class="swimtrack wide" style="width:' + W + 'px">';
    items.filter((e) => onT(e, t.id)).forEach((e) => {
      const x = col[e.id] * COLW + COLW / 2; const cross = e.track !== t.id;
      r += '<div class="bmark wide' + (cross ? ' cross' : '') + '" style="left:' + x + 'px;--c:' + c + '" data-detail="beat:' + e.id + '" title="' + esc(e.label) + (cross ? ' — crosses in here' : '') + (e.summary ? ' — ' + esc(e.summary) : '') + '"><span class="bdot"></span><span class="blab">' + esc(e.label) + '</span></div>';
    });
    return r + '</div></div>';
  };
  let h = '<div class="swim"><div class="swimhead"><div class="swimlabel"></div><div class="swimtrack wide bandtrack" style="width:' + W + 'px">' + bands + '</div></div>';
  laneTracks.forEach((t) => { h += lane(t); });
  const un = items.filter((e) => !e.track);
  if (un.length && isAll) {
    let r = '<div class="swimrow"><div class="swimlabel muted">(untracked)</div><div class="swimtrack wide" style="width:' + W + 'px">';
    un.forEach((e) => { const x = col[e.id] * COLW + COLW / 2; r += '<div class="bmark wide" style="left:' + x + 'px;--c:#6b7280" data-detail="beat:' + e.id + '" title="' + esc(e.label) + '"><span class="bdot"></span><span class="blab">' + esc(e.label) + '</span></div>'; });
    h += r + '</div></div>';
  }
  return h + '</div>';
}

/* ---------------- Characters ---------------- */
export function vCharacters(filter) {
  if (!(P.characters || []).length) return '<p class="empty">No characters yet.</p>';
  const q = (filter || '').trim().toLowerCase();
  let h = '<div class="grid">';
  P.characters.forEach((c) => {
    const _sr = ((c.name || '') + ' ' + (c.role || '') + ' ' + (c.oneLine || '')).toLowerCase();
    if (q && _sr.indexOf(q) < 0) return;
    h += '<div class="ccard">' + imgSlot('character', c.id, 'card', c.image) + '<div class="cname link" data-detail="character:' + c.id + '">' + esc(c.name) + '</div>';
    if (c.role) h += '<div class="crole">' + esc(c.role) + '</div>';
    h += '<div class="cone' + (c.oneLine ? '' : ' empty') + '">' + (c.oneLine ? esc(c.oneLine) : 'One-line not set') + '</div><div class="arc">';
    const arced = (P.books || []).filter((b) => (c.arcs || []).some((x) => x.book === b.id));
    if (!arced.length) { h += '<div class="arc-row"><span class="badge none">No arc yet</span></div>'; }
    arced.forEach((b) => {
      const a = (c.arcs || []).find((x) => x.book === b.id);
      const st = a.status === 'closed' ? 'closed' : 'open';
      h += '<div class="arc-row"><span class="book-chip">' + esc(b.title) + '</span><span class="badge ' + (st === 'closed' ? 'good' : 'warn') + '">' + (st === 'closed' ? 'Arc closed' : 'Arc open') + '</span></div>';
      if (a.want) h += '<div><span class="lab">Want</span>' + esc(a.want) + '</div>'; if (a.need) h += '<div><span class="lab">Need</span>' + esc(a.need) + '</div>'; if (a.wound) h += '<div><span class="lab">Wound</span>' + esc(a.wound) + '</div>';
      h += scoreStrip(a);
    });
    h += '</div><div class="appears">Appears in ' + appearsList(c.id).length + ' chapter' + (appearsList(c.id).length === 1 ? '' : 's') + '</div>';
    if ((c.relationships || []).length) h += '<div class="appears">' + c.relationships.length + ' relationship' + (c.relationships.length === 1 ? '' : 's') + '</div>';
    if ((c.links || []).length) h += '<div class="appears">' + c.links.length + ' connection' + (c.links.length === 1 ? '' : 's') + '</div>';
    if (c.source) h += '<div class="src"><b>Canon:</b> ' + esc(c.source) + '</div>';
    h += '</div>';
  });
  return h + '</div>';
}

/* ---------------- Matrix ---------------- */
function mcell(val) { return '<span class="mcell" style="--c:' + scoreColor(val) + '">' + (val == null || val === '' ? '—' : esc(val)) + '</span>'; }
export function matrixBody(bookIds) {
  const set = (bookIds && bookIds.length) ? bookIds : [];
  if (!set.length) return '<p class="empty">No books selected. Pick one or more above, or All.</p>';
  const multi = set.length > 1; const bt = {}, ord = {};
  (P.books || []).forEach((b, i) => { bt[b.id] = (b.title || '').split(' — ')[0]; ord[b.id] = (b.order != null ? b.order : i); });
  const rows = [];
  (P.characters || []).forEach((c) => { (c.arcs || []).forEach((a) => { if (set.indexOf(a.book) >= 0) rows.push({ c: c, book: a.book, a: a }); }); });
  if (!rows.length) return '<p class="empty">No characters scored in the selected book(s) yet.</p>';
  rows.sort((x, y) => (ord[x.book] - ord[y.book]) || (x.c.name < y.c.name ? -1 : 1));
  let h = '<table class="mtable"><thead><tr><th>Character</th>' + (multi ? '<th>Book</th>' : '') + '<th>Proactivity</th><th>Relatability</th><th>Capability</th><th>Story Circle</th></tr></thead><tbody>';
  rows.forEach((r) => {
    const sc = r.a.scores || {}, steps = r.a.circle || [];
    const circ = '<span class="mcell" style="--c:' + circleColor(steps) + '">' + (r.a.circle ? (steps.length + '/8') : '—') + '</span>';
    h += '<tr><td data-detail="character:' + r.c.id + '">' + esc(r.c.name) + '</td>' + (multi ? '<td class="bkc">' + esc(bt[r.book]) + '</td>' : '') + '<td>' + mcell(sc.proactivity) + '</td><td>' + mcell(sc.relatability) + '</td><td>' + mcell(sc.capability) + '</td><td>' + circ + '</td></tr>';
  });
  return h + '</tbody></table>';
}
function trajSVG(c) {
  const books = (P.books || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0)); const n = books.length;
  const pts = books.map((b) => { const a = (c.arcs || []).find((x) => x.book === b.id); return (a && a.scores) ? a.scores : null; });
  if (!pts.some((p) => p)) return '';
  const W = 340, H = 132, padL = 22, padR = 10, padT = 10, padB = 24;
  const x = (i) => padL + (n <= 1 ? (W - padL - padR) / 2 : (i / (n - 1)) * (W - padL - padR));
  const y = (v) => padT + (1 - (v / 10)) * (H - padT - padB);
  let g = '';
  [0, 5, 10].forEach((v) => { g += '<line x1="' + padL + '" y1="' + y(v) + '" x2="' + (W - padR) + '" y2="' + y(v) + '" stroke="var(--line)" stroke-width="1"/><text x="2" y="' + (y(v) + 3) + '" fill="var(--muted)" font-size="9">' + v + '</text>'; });
  [['proactivity', 'var(--accent)'], ['relatability', 'var(--accent2)'], ['capability', 'var(--good)']].forEach((m) => {
    let d = '', started = false;
    pts.forEach((p, i) => { if (p && p[m[0]] != null) { d += (started ? 'L' : 'M') + x(i) + ' ' + y(+p[m[0]]) + ' '; started = true; } });
    if (d) g += '<path d="' + d + '" fill="none" stroke="' + m[1] + '" stroke-width="2"/>';
    pts.forEach((p, i) => { if (p && p[m[0]] != null) g += '<circle cx="' + x(i) + '" cy="' + y(+p[m[0]]) + '" r="3" fill="' + m[1] + '"/>'; });
  });
  books.forEach((b, i) => { g += '<text x="' + x(i) + '" y="' + (H - 7) + '" fill="var(--muted)" font-size="9" text-anchor="middle">' + esc((b.title || '').replace(/^Book\s+/, '').split(' — ')[0]) + '</text>'; });
  return '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" style="max-width:380px;margin-top:6px">' + g + '</svg>';
}
export function trajectoryBody() {
  let h = '<div class="legend">Score across books &mdash; <span class="sw" style="background:var(--accent)"></span>Proactivity <span class="sw" style="background:var(--accent2)"></span>Relatability <span class="sw" style="background:var(--good)"></span>Capability.</div><div class="grid">';
  let any = false;
  (P.characters || []).forEach((c) => { const sv = trajSVG(c); if (!sv) return; any = true; h += '<div class="ccard"><div class="cname link" data-detail="character:' + c.id + '">' + esc(c.name) + '</div>' + sv + '</div>'; });
  return any ? h + '</div>' : '<p class="empty">No scored arcs yet.</p>';
}

/* ---------------- Threads / Worlds / Books / Outline / Notes ---------------- */
export function vThreads() {
  if (!(P.threads || []).length) return '<p class="empty">No threads yet.</p>';
  let h = '';
  P.threads.forEach((t) => {
    const beats = (P.timeline || []).filter((e) => (e.threads || []).includes(t.id));
    const books = [...new Set(beats.map((e) => e.book).filter(Boolean))].map(bookChip).join(' ');
    h += '<div class="row-card clik" data-detail="thread:' + t.id + '"><span class="dot" style="width:14px;height:14px;background:' + esc(t.color || '#888') + '"></span><div><div class="name">' + esc(t.name) + '</div><div class="muted" style="font-size:12.5px">' + beats.length + ' beat' + (beats.length === 1 ? '' : 's') + (books ? ' &middot; ' + books : '') + '</div></div></div>';
  });
  return h;
}
function worldCard(w) {
  let h = '<div class="wcard" data-detail="world:' + w.id + '">';
  h += imgSlot('world', w.id, 'card', w.image);
  h += '<div class="wbody"><div class="wtype">' + esc(w.type || 'world') + '</div><div class="nm">' + esc(w.name) + '</div>';
  if (w.note) h += '<div class="muted" style="font-size:12px">' + esc(w.note) + '</div>';
  return h + '</div></div>';
}
export function vWorlds() {
  const ws = P.worlds || []; if (!ws.length) return '<p class="empty">None yet.</p>';
  const order = ['galaxy', 'system', 'world', 'region', 'realm', 'species', 'other'];
  const groups = {}; ws.forEach((w) => { const t = (w.type || 'other').toLowerCase(); (groups[t] = groups[t] || []).push(w); });
  let h = '';
  order.concat(Object.keys(groups).filter((t) => !order.includes(t))).forEach((t) => {
    if (!groups[t]) return;
    h += '<div class="wtype" style="margin:16px 0 8px;font-size:11px">' + esc(t) + 's</div><div class="wgrid">' + groups[t].map(worldCard).join('') + '</div>';
  });
  return h;
}
export function vBooks() {
  const books = (P.books || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  if (!books.length) return '<p class="empty">No books yet.</p>';
  const saga = books.filter((b) => !b.branch), side = books.filter((b) => b.branch);
  const card = (b) => {
    const chs = (P.chapters || []).filter((c) => c.book === b.id);
    const scored = (P.characters || []).filter((c) => (c.arcs || []).some((a) => a.book === b.id)).length;
    const wds = chs.reduce((n, c) => n + (c._words || c.wordcount || 0), 0);
    const parts = (b.title || '').split(' — ');
    return '<div class="bookcard" data-detail="book:' + b.id + '">' + imgSlot('book', b.id, 'card', b.image) + '<div class="bcname">' + esc(parts[0]) + '</div>' + (parts[1] ? '<div class="bcsub">' + esc(parts[1]) + '</div>' : '') + '<div class="bcmeta"><span class="bstat">' + esc(b.status || 'planned') + '</span> ' + esc(b.type || 'book') + ' &middot; ' + chs.length + ' ch &middot; ' + scored + ' scored &middot; ' + wds.toLocaleString() + ' words</div></div>';
  };
  let h = '<div class="legend">The saga is the main line; side stories are branch worlds that live on their own until they cross in.</div>';
  h += '<h3 class="bookgrp">The saga</h3><div class="bookgrid">' + saga.map(card).join('') + '</div>';
  h += '<h3 class="bookgrp">Side stories</h3>' + (side.length ? '<div class="bookgrid">' + side.map(card).join('') + '</div>' : '<p class="empty">No side-story books yet.</p>');
  const promo = (P.tracks || []).filter((t) => t.kind !== 'spine');
  if (promo.length) h += '<div class="callout" style="margin-top:14px"><b>Potential side stories</b> &mdash; timeline tracks that can be promoted to their own book: ' + promo.map((t) => esc(t.name)).join(' &middot; ') + '</div>';
  return h;
}
export function vOutline() {
  let h = '';
  (P.books || []).forEach((b) => {
    const chs = (P.chapters || []).filter((c) => c.book === b.id).sort((a, b) => (a.order || 0) - (b.order || 0));
    const wc = chs.reduce((n, c) => n + (c._words || c.wordcount || 0), 0);
    h += '<div class="book-section"><div class="book-head"><span class="t">' + esc(b.title) + '</span><span class="muted" style="font-size:12px">' + esc(b.status || '') + (wc ? ' · ' + wc.toLocaleString() + ' words' : '') + '</span></div>';
    const povc = {}; chs.forEach((c) => { if (c.pov) povc[c.pov] = (povc[c.pov] || 0) + 1; });
    const povk = Object.keys(povc); if (povk.length) h += '<div class="muted" style="font-size:12px;margin:-2px 0 8px">POV balance: ' + povk.sort((x, y) => povc[y] - povc[x]).map((k) => esc((charById(k) || {}).name || k) + ' &times;' + povc[k]).join(' &middot; ') + '</div>';
    if (!chs.length) { h += '<p class="empty">No chapters yet.</p>'; }
    else chs.forEach((c) => {
      const pov = charById(c.pov);
      h += '<div class="chap clik" data-detail="chapter:' + c.id + '"><b>' + esc(c.title || ('Chapter ' + (c.order || ''))) + '</b>' + (c.status ? ' <span class="book-chip">' + esc(c.status) + '</span>' : '') + (pov ? ' <span class="chip">POV: ' + esc(pov.name) + '</span>' : '') + (c.thread ? ' ' + threadChip(c.thread) : '') + ((c._words || c.wordcount) ? '<div class="muted" style="font-size:12px;margin-top:3px">' + (c._words || c.wordcount || 0).toLocaleString() + ' words</div>' : '') + '</div>';
    });
    h += '</div>';
  });
  return h || '<p class="empty">No books yet.</p>';
}
export function vNotes() {
  const notes = (P.notes || []).slice().reverse();
  let h = '';
  if (!notes.length) h += '<p class="empty">No saved notes yet.</p>';
  else notes.forEach((n) => { h += '<div class="note"><div class="ndate">' + esc(n.date || '') + (n.tags && n.tags.length ? ' · ' + n.tags.map(esc).join(', ') : '') + '</div><div class="ntext">' + esc(n.text || '') + '</div></div>'; });
  return h;
}

/* ---------------- Lessons / Themes / Faiths / Research / Loops ---------------- */
export function vLessons() {
  const cast = (P.characters || []).filter((c) => (c.lessons || []).length);
  if (!cast.length) return '<p class="empty">No lessons tracked yet.</p>';
  let h = '<div class="legend">Each lesson restructures the person who comes after it. <span class="lstat learned">learned</span> &middot; <span class="lstat partial">partial</span> &middot; <span class="lstat resisted">resisted</span>.</div>';
  cast.forEach((c) => {
    const ls = (c.lessons || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    h += '<div class="lspine"><h3 class="link" data-detail="character:' + c.id + '">' + esc(c.name) + '</h3><div class="tl">';
    ls.forEach((l) => {
      const bk = l.book ? ((bookById(l.book) || {}).title || '') : '';
      h += '<div class="tl-item"><div class="tl-era">' + esc(bk) + '</div>';
      h += '<div class="llesson">' + esc(l.lesson || '(lesson)') + (l.status ? ' <span class="lstat ' + esc(l.status) + '">' + esc(l.status) + '</span>' : '') + '</div>';
      if (l.trigger) h += '<div class="ltrig">' + esc(l.trigger) + '</div>';
      if (l.becomes) h += '<div class="lbecome"><span class="mlabel">Becomes</span>' + esc(l.becomes) + '</div>';
      h += '</div>';
    });
    h += '</div></div>';
  });
  return h;
}
export function vThemes() {
  const ts = P.themes || [];
  if (!ts.length) return '<p class="empty">No themes yet.</p>';
  let h = '<div class="legend">What the saga is about, and where each idea is carried.</div>';
  ts.forEach((t) => {
    h += '<div class="ccard"><div class="cname link" data-detail="theme:' + t.id + '">' + esc(t.name) + '</div>';
    if (t.statement) h += '<div class="cone">' + esc(t.statement) + '</div>';
    if ((t.books || []).length) h += '<div style="margin:4px 0">' + t.books.map(bookChip).join(' ') + '</div>';
    if ((t.characters || []).length) h += '<div class="appears"><span class="mlabel">Carried by</span> ' + t.characters.map((cid) => dlink('character', cid, (charById(cid) || {}).name || cid)).join(', ') + '</div>';
    if ((t.beats || []).length) h += '<div class="appears"><span class="mlabel">Beats</span> ' + t.beats.map((eid) => dlink('beat', eid, (byId(P.timeline, eid) || {}).label || eid)).join(', ') + '</div>';
    h += '</div>';
  });
  return h;
}
function truthBadge(t) { return t ? '<span class="tbadge t-' + esc(t) + '">' + esc(t) + '</span>' : ''; }
export function vFaiths() {
  const rs = P.religions || [];
  if (!rs.length) return '<p class="empty">No faiths yet.</p>';
  let h = '<div class="legend">Religions as translations of what actually happened &mdash; the <b>truth</b> tag rates how faithfully each reads the real events.</div>';
  const byW = {}; rs.forEach((r) => { const k = r.world || '—'; (byW[k] = byW[k] || []).push(r); });
  Object.keys(byW).forEach((k) => {
    h += '<h3 class="faithgrp">' + esc((byId(P.worlds, k) || {}).name || 'Unassigned') + '</h3>';
    byW[k].forEach((r) => {
      h += '<div class="ccard"><div class="cname link" data-detail="religion:' + r.id + '">' + esc(r.name) + '</div>' + truthBadge(r.truth) + (r.status ? '<span class="tbadge st">' + esc(r.status) + '</span>' : '');
      if (r.creed) h += '<div class="cone">&ldquo;' + esc(r.creed) + '&rdquo;</div>';
      if (r.mythologizes) h += '<div class="appears"><span class="mlabel">Reads</span> ' + esc(r.mythologizes) + '</div>';
      if ((r.figures || []).length) h += '<div class="appears"><span class="mlabel">Figures</span> ' + r.figures.map((f) => dlink('character', f.to, (charById(f.to) || {}).name || f.to) + (f.role ? ' (' + esc(f.role) + ')' : '')).join(', ') + '</div>';
      h += '</div>';
    });
  });
  return h;
}
export function vResearch() {
  const rs = P.research || [];
  if (!rs.length) return '<p class="empty">No research dossiers yet.</p>';
  let h = '<div class="legend"><span class="rstat open">open</span> &middot; <span class="rstat grounded">grounded</span> &middot; <span class="rstat locked">locked</span></div>';
  rs.forEach((r) => {
    const chips = (r.threads || []).map(threadChip).join('') + (r.books || []).map(bookChip).join(' ');
    h += '<div class="rcard" data-detail="research:' + r.id + '"><div style="display:flex;justify-content:space-between;gap:10px;align-items:center"><div class="name" style="font-size:16px;font-weight:650">' + esc(r.title) + '</div><span class="rstat ' + esc(r.status || 'open') + '">' + esc(r.status || 'open') + '</span></div>';
    if (r.question) h += '<div class="muted" style="font-size:13px;margin-top:4px">' + esc(r.question) + '</div>';
    if (chips) h += '<div style="margin-top:8px">' + chips + '</div>';
    h += '<div class="muted" style="font-size:12px;margin-top:6px">' + ((r.findings || []).length) + ' findings &middot; ' + ((r.sources || []).length) + ' sources' + ((r.forks || []).length ? ' &middot; ' + (r.forks || []).length + ' open forks' : '') + '</div></div>';
  });
  return h;
}
export function vLoops() {
  const loops = [];
  (P.timeline || []).forEach((e) => { if (!e.summary) loops.push({ cat: 'Unwritten beat', txt: e.label, type: 'beat', id: e.id }); });
  (P.characters || []).forEach((c) => (c.arcs || []).forEach((a) => { if (a.status === 'open') { const bt = (bookById(a.book) || {}).title || a.book; loops.push({ cat: 'Open character arc', txt: c.name + ' — ' + bt, type: 'character', id: c.id }); } }));
  (P.research || []).forEach((r) => { if ((r.status || 'open') !== 'locked') loops.push({ cat: 'Research ' + (r.status || 'open'), txt: r.title, type: 'research', id: r.id }); (r.forks || []).forEach((f) => loops.push({ cat: 'Open research fork', txt: f, type: 'research', id: r.id })); });
  const RX = /\b(TBD|TODO)\b|\[CONFIRM\]|\[HOLD\]|not locked|to develop|to resolve|still open|open (question|thread|fork)/i;
  (P.notes || []).forEach((n) => { if (RX.test(n.text || '')) loops.push({ cat: 'Flag in note', txt: (n.text || '').slice(0, 100), type: 'note', id: n.id }); });
  (P.timeline || []).forEach((e) => { if (e.summary && RX.test(e.summary)) loops.push({ cat: 'Flag in beat', txt: e.label, type: 'beat', id: e.id }); });
  (P.characters || []).forEach((c) => { if (!c.oneLine || !(c.arcs && c.arcs.length)) loops.push({ cat: 'Character incomplete', txt: c.name, type: 'character', id: c.id }); });
  (P.worlds || []).forEach((w) => { if (!w.note) loops.push({ cat: 'World undescribed', txt: w.name, type: 'world', id: w.id }); });
  (P.chapters || []).forEach((c) => { if (c.status === 'drafting' || c.next) loops.push({ cat: 'In progress', txt: (c.title || c.id) + (c.next ? ' — ' + c.next : ''), type: 'chapter', id: c.id }); });
  if (!loops.length) return '<p class="empty">Nothing unresolved flagged.</p>';
  const groups = {}; loops.forEach((l) => { (groups[l.cat] = groups[l.cat] || []).push(l); });
  let h = '<div class="callout"><b>' + loops.length + '</b> unresolved item' + (loops.length === 1 ? '' : 's') + ' &mdash; everything still waiting on a decision or a draft.</div>';
  const QW = new Set(['World undescribed', 'Unwritten beat', 'Character incomplete']);
  const wins = loops.filter((l) => QW.has(l.cat)).slice(0, 6);
  if (wins.length) h += '<div class="qwins"><div class="wh">Quick wins</div>' + wins.map((l) => '<div class="loop clik" data-detail="' + l.type + ':' + l.id + '"><span class="qwtag">' + esc(l.cat) + '</span> ' + esc(l.txt) + '</div>').join('') + '</div>';
  Object.keys(groups).forEach((cat) => {
    h += '<div class="loopcat">' + esc(cat) + ' <span class="muted">(' + groups[cat].length + ')</span></div>';
    groups[cat].forEach((l) => { h += '<div class="loop clik" data-detail="' + l.type + ':' + l.id + '">' + esc(l.txt) + '</div>'; });
  });
  return h;
}

/* ---------------- Pantheon / Reading ---------------- */
export function vPantheon() {
  const ps = P.pantheon || [];
  if (!ps.length) return '<p class="empty">Not modelled yet.</p>';
  let h = '';
  const cats = [['personal-stage', 'Personal-stage selves (lived)'], ['ancestral-collective', 'Ancestral / collective (inherited)'], ['external', 'From outside']];
  cats.forEach((cat) => {
    const grp = ps.filter((p) => p.category === cat[0]).sort((a, b) => (a.order || 0) - (b.order || 0)); if (!grp.length) return;
    h += '<div class="wtype" style="margin:18px 0 8px;font-size:11px">' + esc(cat[1]) + '</div><div class="grid">';
    grp.forEach((p) => {
      h += '<div class="ccard">' + imgSlot('pantheon', p.id, 'card', p.image) + '<div class="cname link" data-detail="pantheon:' + p.id + '">' + esc(p.name) + '</div><div class="crole">' + esc(p.age || '') + (p.role ? ' &middot; ' + esc(p.role) : '') + '</div>';
      if (p.function) h += '<div class="cone">' + esc(p.function) + '</div>';
      if (p.voice) h += '<div class="appears"><span class="mlabel">Voice</span> ' + esc(p.voice) + '</div>';
      if (p.tie) h += '<div class="appears"><span class="mlabel">In the arc</span> ' + esc(p.tie) + '</div>';
      h += '</div>';
    });
    h += '</div>';
  });
  return h;
}
export function vReading() {
  const rs = P.reading || [];
  if (!rs.length) return '<p class="empty">No books yet.</p>';
  let h = '<div class="legend">Books chosen for what they teach the craft.</div>';
  [['reading', 'Currently reading'], ['read', 'Read'], ['toread', 'On the shelf']].forEach((g) => {
    const grp = rs.filter((b) => (b.status || 'toread') === g[0]); if (!grp.length) return;
    h += '<div class="wtype" style="margin:16px 0 8px;font-size:11px">' + esc(g[1]) + '</div><div class="grid">';
    grp.forEach((b) => {
      h += '<div class="ccard"><div class="rcardhead"><div><div class="cname link" data-detail="reading:' + b.id + '">' + esc(b.title) + '</div><div class="crole">' + esc(b.author || '') + '</div></div>' + imgSlot('reading', b.id, 'thumb', b.image) + '</div>';
      if (b.gives) h += '<div class="cone">' + esc(b.gives) + '</div>';
      if ((b.tags || []).length) h += '<div style="margin:2px 0 5px">' + b.tags.map((t) => '<span class="chip">' + esc(t) + '</span>').join('') + '</div>';
      if (b.correlation) h += '<div class="appears"><span class="mlabel">For my book</span> ' + esc(b.correlation) + '</div>';
      h += '<div class="appears"><span class="mlabel">Takeaways</span> ' + ((b.takeaways || []).length || 'none yet') + '</div>';
      h += '</div>';
    });
    h += '</div>';
  });
  return h;
}

/* ---------------- Web (cast graph) ---------------- */
export function vWeb() {
  const cs = (P.characters || []); if (cs.length < 2) return '<p class="empty">Not enough characters yet.</p>';
  const n = cs.length, cx = 450, cy = 450, R = 336;
  const deg = {}; cs.forEach((c) => { deg[c.id] = deg[c.id] || 0; (c.relationships || []).forEach((r) => { deg[c.id] = (deg[c.id] || 0) + 1; deg[r.to] = (deg[r.to] || 0) + 1; }); });
  const pos = {}; cs.forEach((c, i) => { const a = (-90 + i * 360 / n) * Math.PI / 180; pos[c.id] = { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a), a: a }; });
  let edges = '', seen = {};
  cs.forEach((c) => { (c.relationships || []).forEach((r) => { if (!pos[r.to]) return; const key = [c.id, r.to].sort().join('|'); if (seen[key]) return; seen[key] = 1; const p1 = pos[c.id], p2 = pos[r.to]; edges += '<line class="gedge" data-a="' + c.id + '" data-b="' + r.to + '" x1="' + p1.x.toFixed(1) + '" y1="' + p1.y.toFixed(1) + '" x2="' + p2.x.toFixed(1) + '" y2="' + p2.y.toFixed(1) + '"/>'; }); });
  let nodes = '';
  cs.forEach((c) => {
    const p = pos[c.id]; const rad = 7 + Math.min(deg[c.id] || 0, 8) * 1.4; const out = Math.cos(p.a) >= 0; const lx = p.x + (out ? 1 : -1) * (rad + 6); const anc = out ? 'start' : 'end'; const cid = 'np-' + c.id;
    nodes += '<g class="gnode" data-node="' + c.id + '" data-detail="character:' + c.id + '" data-cx="' + p.x.toFixed(1) + '" data-cy="' + p.y.toFixed(1) + '" data-r="' + rad.toFixed(1) + '"><g class="gvis">'
      + '<clipPath id="' + cid + '"><circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="' + rad.toFixed(1) + '"/></clipPath>'
      + '<circle class="gfill" cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="' + rad.toFixed(1) + '" fill="var(--accent)"/>'
      + '<image class="gimg" data-imgnode="character:' + c.id + '"' + (c.image ? ' data-imgfb="' + esc(c.image) + '"' : '') + ' x="' + (p.x - rad).toFixed(1) + '" y="' + (p.y - rad).toFixed(1) + '" width="' + (rad * 2).toFixed(1) + '" height="' + (rad * 2).toFixed(1) + '" clip-path="url(#' + cid + ')" preserveAspectRatio="xMidYMid slice"></image>'
      + '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="' + rad.toFixed(1) + '" fill="none" stroke="var(--panel)" stroke-width="1.5"/></g>'
      + '<text x="' + lx.toFixed(1) + '" y="' + (p.y + 4).toFixed(1) + '" text-anchor="' + anc + '" fill="var(--ink)" font-size="12">' + esc(c.name) + '</text></g>';
  });
  return '<svg id="webg" viewBox="0 0 900 900" width="100%" style="max-width:900px;display:block;margin:0 auto">' + edges + nodes + '</svg>';
}

/* ---------------- Write cockpit ---------------- */
export function writeRail(bookId) {
  const bc = (P.chapters || []).filter((c) => c.book === bookId).sort((x, y) => (x.order || 0) - (y.order || 0));
  return bc.length ? bc.map((c) => '<div class="wch" data-wch="' + c.id + '"><div>' + esc(c.title || ('Chapter ' + (c.order || ''))) + '</div><div class="wcs">' + esc(c.status || '') + '</div></div>').join('') : '<div class="muted" style="font-size:12.5px;padding:8px 2px">No chapters in this book yet.</div>';
}
function lessonsByNow(c, bookOrder) {
  return (c.lessons || []).filter((l) => ((bookById(l.book) || {}).order || 0) <= bookOrder).sort((a, b) => (a.order || 0) - (b.order || 0));
}
export function cockpit(id) {
  const c = byId(P.chapters, id); if (!c) return '';
  const b = bookById(c.book) || {}; const bo = b.order || 0; const pov = charById(c.pov);
  const present = []; if (pov) present.push(pov);
  const sum = (c.summary || '');
  (P.characters || []).forEach((ch) => {
    if (ch.id === c.pov) return; const toks = [ch.name].concat(ch.aliases || []).filter(Boolean);
    if (toks.some((t) => new RegExp('\\b' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(sum))) present.push(ch);
  });
  (c.characters || []).forEach((cid) => { const ch = charById(cid); if (ch && present.indexOf(ch) < 0) present.push(ch); });
  const words = c._words || c.wordcount || 0;
  let L = '<div class="wprose"><div class="msub">' + esc(b.title || '') + '</div><div class="mtitle" style="margin-bottom:4px">' + esc(c.title || ('Chapter ' + (c.order || ''))) + '</div>';
  L += '<div style="margin-bottom:10px"><span class="badge ' + (c.status === 'done' ? 'good' : (c.status === 'planned' ? 'none' : 'warn')) + '">' + esc(c.status || '-') + '</span> <span class="muted" style="font-size:12px">' + words.toLocaleString() + ' words</span></div>';
  L += imgSlot('chapter', c.id, 'detail', c.image);
  if (c.next) L += '<div class="nextbar"><b>Next:</b> ' + esc(c.next) + '</div>';
  const prose = (c._prose || '').trim();
  if (prose) { L += '<div class="prosebody">' + prose.split(/\n{2,}/).map((p) => '<p>' + esc(p).replace(/\n/g, '<br>') + '</p>').join('') + '</div>'; }
  else { L += '<p class="empty">No prose yet. Use the editor below to draft &mdash; the beat and cast are on the right.</p>'; }
  L += '</div>';
  let R = '<div class="wref">';
  if (c.summary) R += '<div class="wsec"><div class="wh">What happens (beat)</div><p class="mblock">' + esc(c.summary) + '</p></div>';
  R += '<div class="wsec"><div class="wh">Who is in play</div>';
  if (!present.length) R += '<p class="empty">No characters detected.</p>';
  present.forEach((ch) => {
    const a = (ch.arcs || []).find((x) => x.book === c.book);
    R += '<div class="wperson"><div class="wpn">' + dlink('character', ch.id, ch.name) + (ch.id === c.pov ? ' <span class="chip">POV</span>' : '') + '</div>';
    if (a) { if (a.want) R += '<div style="font-size:12px"><span class="mlabel">Want</span>' + esc(a.want) + '</div>'; if (a.need) R += '<div style="font-size:12px"><span class="mlabel">Need</span>' + esc(a.need) + '</div>'; R += scoreStrip(a); }
    else R += '<div class="muted" style="font-size:12px">No arc in this book.</div>';
    const ln = lessonsByNow(ch, bo);
    if (ln.length) R += '<div style="font-size:11.5px;margin-top:4px"><span class="mlabel">Learned by now</span>' + ln.map((l) => esc(l.lesson)).join(' &middot; ') + '</div>';
    R += '</div>';
  });
  R += '</div>';
  const beats = (P.timeline || []).filter((e) => e.book === c.book).sort((a, b) => (a.order || 0) - (b.order || 0));
  if (beats.length) R += '<div class="wsec"><div class="wh">Beats in this book</div>' + beats.map((e) => '<span class="chip clik" data-detail="beat:' + e.id + '"' + ((c.thread && (e.threads || []).includes(c.thread)) ? ' style="border-color:var(--accent);color:var(--ink)"' : '') + '>' + esc(e.label) + '</span>').join('') + '</div>';
  const th = (P.themes || []).filter((t) => (t.books || []).includes(c.book));
  if (th.length) R += '<div class="wsec"><div class="wh">Themes</div>' + th.map((t) => '<span class="chip clik" data-detail="theme:' + t.id + '">' + esc(t.name) + '</span>').join('') + '</div>';
  if ((c.scenes || []).length) R += '<div class="wsec"><div class="wh">Scenes</div>' + c.scenes.map((s, si) => '<div class="wperson">' + imgSlot('scene', s.id || (c.id + '-s' + si), 'card', s.image) + '<div class="wpn">' + esc(s.title || 'Scene') + '</div>' + (s.summary ? '<div class="muted" style="font-size:12px">' + esc(s.summary) + '</div>' : '') + '</div>').join('') + '</div>';
  R += '<div class="src"><b>Manuscript:</b> ' + esc(c.bodyFile || '') + '</div>';
  R += '</div>';
  return '<div class="wsplit">' + L + R + '</div>';
}

/* ---------------- Reference ---------------- */
function refBadge(e) { return '<span class="refbadge" style="background:' + esc(e._bg || '#2b3550') + ';color:' + esc(e._fg || '#aebfff') + '">' + esc(e._badge || '') + '</span>'; }
function refDetail(e) {
  const k = e.kind;
  if (k === 'author') return (e.meta ? '<div class="refmeta">' + esc(e.meta) + '</div>' : '') + (e.knownFor ? '<p><span class="reflab">Known for</span>' + esc(e.knownFor) + '</p>' : '') + (e.signature ? '<p><span class="reflab">Signature</span>' + esc(e.signature) + '</p>' : '') + ((e.works || []).length ? '<p><span class="reflab">Works</span></p><ul class="refworks">' + e.works.map((w) => '<li><b>' + esc(w.title || '') + '</b>' + (w.year ? ' (' + esc(w.year) + ')' : '') + (w.note ? ' — ' + esc(w.note) : '') + '</li>').join('') + '</ul>' : '');
  if (k === 'book') return '<div class="refmeta">' + esc(e.author || '') + (e.year ? ' · ' + esc(e.year) : '') + (e.awards ? ' · ' + esc(e.awards) : '') + '</div>' + (e.text ? '<p>' + esc(e.text) + '</p>' : '');
  if (k === 'checklist') return '<ul class="refchk">' + (e.items || []).map((it) => '<li><label><input type="checkbox"> ' + esc(it) + '</label></li>').join('') + '</ul>';
  if ((e.examples || []).length) return e.examples.map((x) => '<div class="refex ' + (x.quality === 'weak' ? 'weak' : 'strong') + '"><div class="refexh">' + esc(x.work || '') + (x.medium ? ' <span class="refmed">' + esc(x.medium) + (x.year ? ', ' + esc(x.year) : '') + '</span>' : '') + ' <span class="refq">' + (x.quality === 'weak' ? 'weak' : 'strong') + '</span></div><div class="refext">' + esc(x.text || '') + '</div></div>').join('');
  return (e.principle ? '<p><span class="reflab">Principle</span>' + esc(e.principle) + '</p>' : '') + (e.example ? '<p><span class="reflab">Example</span>' + esc(e.example) + '</p>' : '') + (e.application ? '<p><span class="reflab">Application</span>' + esc(e.application) + '</p>' : '');
}
function refCard(e, open) { return '<details class="refcard"' + (open ? ' open' : '') + '><summary><span class="refname">' + esc(e.name) + '</span>' + refBadge(e) + (e.category ? '<span class="refcat">' + esc(e.category) + '</span>' : '') + (e.description ? '<div class="refdesc">' + esc(e.description) + '</div>' : '') + '</summary><div class="refbody">' + refDetail(e) + '</div></details>'; }
function REFENT() { return (P._reference && P._reference.entries) || []; }
export function refCollections() { return (P._reference && P._reference.collections) || []; }
export function refHasData() { return REFENT().length > 0; }
export function refCatsOptions(kind) {
  let items = REFENT(); if (kind && kind !== 'all') items = items.filter((e) => e.kind === kind);
  const cats = []; items.forEach((e) => { if (e.category && cats.indexOf(e.category) < 0) cats.push(e.category); });
  cats.sort();
  return '<option value="">All categories</option>' + cats.map((c) => '<option value="' + esc(c) + '">' + esc(c) + '</option>').join('');
}
export function refCount(kind) { const ents = REFENT(); return (!kind || kind === 'all') ? ents.length : ents.filter((e) => e.kind === kind).length; }
export function refBody(kind, q, cat) {
  q = (q || '').trim().toLowerCase();
  let items = REFENT(); if (kind && kind !== 'all') items = items.filter((e) => e.kind === kind); if (cat) items = items.filter((e) => e.category === cat);
  if (q) items = items.filter((e) => ((e.name || '') + ' ' + (e.category || '') + ' ' + (e.description || '') + ' ' + (e.principle || '') + ' ' + (e.knownFor || '') + ' ' + (e.signature || '') + ' ' + (e.text || '') + ' ' + JSON.stringify(e.examples || '')).toLowerCase().indexOf(q) >= 0);
  if (!items.length) return '<p class="empty">No matches.</p>';
  const openAll = !!(q || cat);
  return '<div class="refcount2">' + items.length + ' entr' + (items.length === 1 ? 'y' : 'ies') + '</div>' + items.map((e) => refCard(e, openAll)).join('');
}

/* ---------------- Detail drawer ---------------- */
export function detailHTML(type, id) {
  if (type === 'character') {
    const c = charById(id); if (!c) return ''; let h = '<div class="mtitle">' + esc(c.name) + '</div><div class="msub">' + esc(c.role || 'Character') + '</div>';
    h += imgSlot('character', c.id, 'detail', c.image);
    if (c.oneLine) h += '<p class="mblock">' + esc(c.oneLine) + '</p>';
    (P.books || []).forEach((b) => {
      const a = (c.arcs || []).find((x) => x.book === b.id);
      h += '<div class="arc"><div class="arc-row"><span class="book-chip">' + esc(b.title) + '</span><span class="badge ' + (a ? (a.status === 'closed' ? 'good' : 'warn') : 'none') + '">' + (a ? (a.status === 'closed' ? 'Arc closed' : 'Arc open') : 'No arc') + '</span></div>';
      if (a) { if (a.want) h += '<div><span class="mlabel">Want</span>' + esc(a.want) + '</div>'; if (a.need) h += '<div><span class="mlabel">Need</span>' + esc(a.need) + '</div>'; if (a.wound) h += '<div><span class="mlabel">Wound</span>' + esc(a.wound) + '</div>'; }
      h += scoreStrip(a) + '</div>';
    });
    h += gallery(c.media);
    const les = (c.lessons || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    if (les.length) { h += '<div class="rels"><div class="mlabel" style="display:block;margin-bottom:5px">Lessons</div>' + les.map((l) => '<div class="rel"><b>' + esc(l.lesson || '') + '</b>' + (l.status ? ' <span class="lstat ' + esc(l.status) + '">' + esc(l.status) + '</span>' : '') + (l.becomes ? '<div class="relnote">Becomes: ' + esc(l.becomes) + '</div>' : '') + '</div>').join('') + '</div>'; }
    const rels = c.relationships || [];
    if (rels.length) { h += '<div class="rels"><div class="mlabel" style="display:block;margin-bottom:5px">Relationships</div>' + rels.map((r) => { const t = charById(r.to); return '<div class="rel">' + dlink('character', r.to, t ? t.name : r.to) + '<span class="reltype">' + esc(r.type || '') + '</span>' + (r.note ? '<div class="relnote">' + esc(r.note) + '</div>' : '') + '</div>'; }).join('') + '</div>'; }
    const inc = (P.characters || []).filter((x) => x.id !== c.id && (x.relationships || []).some((r) => r.to === c.id));
    if (inc.length) { h += '<div class="rels"><div class="mlabel" style="display:block;margin-bottom:5px">Also linked from</div>' + inc.map((x) => { const r = (x.relationships || []).find((r) => r.to === c.id) || {}; return '<div class="rel">' + dlink('character', x.id, x.name) + '<span class="reltype">' + esc(r.type || '') + '</span></div>'; }).join('') + '</div>'; }
    const lnk = c.links || [];
    if (lnk.length) { h += '<div class="rels"><div class="mlabel" style="display:block;margin-bottom:5px">Connections</div>' + lnk.map((l) => { const t = l.kind === 'thread' ? threadById(l.to) : worldById(l.to); const nm = t ? (t.name || t.title || l.to) : l.to; return '<div class="rel">' + dlink(l.kind, l.to, nm) + '<span class="reltype">' + esc(l.type || l.kind) + '</span>' + (l.note ? '<div class="relnote">' + esc(l.note) + '</div>' : '') + '</div>'; }).join('') + '</div>'; }
    const ap = appearsList(c.id);
    h += '<p class="mblock" style="margin-top:10px"><span class="mlabel">Appears in</span>' + (ap.length ? ap.map((ch) => dlink('chapter', ch.id, ch.title || ('Chapter ' + (ch.order || '')))).join(', ') : '<span class="muted">no chapters yet</span>') + '</p>';
    if (c.source) h += '<div class="src"><b>Canon:</b> ' + esc(c.source) + '</div>';
    return h;
  }
  if (type === 'world') {
    const w = worldById(id); if (!w) return ''; let h = '<div class="mtitle">' + esc(w.name) + '</div><div class="msub">' + esc(w.type || 'World / species') + '</div>';
    h += imgSlot('world', w.id, 'detail', w.image);
    h += w.note ? '<p class="mblock">' + esc(w.note) + '</p>' : '<p class="mblock muted">No description yet.</p>';
    if (w.parent) { const pp = worldById(w.parent); if (pp) h += '<p class="mblock"><span class="mlabel">Part of</span>' + dlink('world', pp.id, pp.name) + '</p>'; }
    const kids = (P.worlds || []).filter((x) => x.parent === w.id);
    if (kids.length) h += '<p class="mblock"><span class="mlabel">Contains</span>' + kids.map((k) => dlink('world', k.id, k.name)).join(', ') + '</p>';
    h += gallery(w.media);
    const wlc = (P.characters || []).filter((x) => (x.links || []).some((l) => l.to === w.id));
    if (wlc.length) h += '<p class="mblock"><span class="mlabel">Linked characters</span>' + wlc.map((x) => dlink('character', x.id, x.name)).join(', ') + '</p>';
    if (w._worldbuilding) h += '<details class="bkfold" open><summary>Full worldbuilding <span class="muted">(' + (w._wbwords || 0).toLocaleString() + ' words)</span></summary><div class="wbdoc">' + mdLite(w._worldbuilding) + '</div></details>';
    if (w.source) h += '<div class="src"><b>Canon:</b> ' + esc(w.source) + (w._worldbuilding ? ' <span class="muted">(embedded above)</span>' : '') + '</div>';
    return h;
  }
  if (type === 'thread') {
    const t = threadById(id); if (!t) return ''; let h = '<div class="mtitle"><span class="dot" style="display:inline-block;width:13px;height:13px;background:' + esc(t.color || '#888') + ';vertical-align:middle;margin-right:8px"></span>' + esc(t.name) + '</div><div class="msub">Plot thread</div>';
    const beats = (P.timeline || []).filter((e) => (e.threads || []).includes(t.id));
    h += '<p class="mblock"><span class="mlabel">Beats</span>' + (beats.length ? beats.map((e) => dlink('beat', e.id, e.label)).join(', ') : '<span class="muted">none yet</span>') + '</p>';
    const tlc = (P.characters || []).filter((x) => (x.links || []).some((l) => l.to === t.id));
    if (tlc.length) h += '<p class="mblock"><span class="mlabel">Linked characters</span>' + tlc.map((x) => dlink('character', x.id, x.name)).join(', ') + '</p>';
    if (t.source) h += '<div class="src"><b>Canon:</b> ' + esc(t.source) + '</div>';
    return h;
  }
  if (type === 'beat') {
    const e = byId(P.timeline, id); if (!e) return ''; let h = '<div class="mtitle">' + esc(e.label) + '</div><div class="msub">' + esc(e.era || 'Timeline beat') + (e.book ? ' · ' + esc((bookById(e.book) || {}).title || '') : '') + '</div>';
    h += '<p class="mblock">' + (e.summary ? esc(e.summary) : '<span class="muted">Beat not written yet.</span>') + '</p>';
    h += '<div class="mlabel" style="display:block;margin:4px 0 4px">Concept art</div>' + imgSlot('beat', e.id, 'card', e.image);
    if ((e.threads || []).length) h += '<p class="mblock"><span class="mlabel">Threads</span>' + e.threads.map((tid) => dlink('thread', tid, (threadById(tid) || {}).name || tid)).join(', ') + '</p>';
    if ((e.characters || []).length) h += '<p class="mblock"><span class="mlabel">Characters</span>' + e.characters.map((cid) => dlink('character', cid, (charById(cid) || {}).name || cid)).join(', ') + '</p>';
    return h;
  }
  if (type === 'book') {
    const b = bookById(id); if (!b) return '';
    let h = '<div class="mtitle">' + esc(b.title) + '</div><div class="msub">' + esc(b.status || 'Book') + (b.branch ? ' &middot; side story' : '') + ' &middot; ' + esc(b.type || 'book') + '</div>';
    const chs = (P.chapters || []).filter((c) => c.book === b.id), beats = (P.timeline || []).filter((e) => e.book === b.id);
    const inb = {};
    (P.characters || []).forEach((c) => { if ((c.arcs || []).some((a) => a.book === b.id)) inb[c.id] = 1; });
    chs.forEach((c) => { if (c.pov) inb[c.pov] = 1; (c.characters || []).forEach((x) => inb[x] = 1); });
    beats.forEach((e) => { (e.characters || []).forEach((x) => inb[x] = 1); });
    const cast = Object.keys(inb).map((cid) => charById(cid)).filter(Boolean);
    if (cast.length) { h += '<details class="bkfold" open><summary>Characters <span class="muted">(' + cast.length + ')</span></summary><div class="bkcast">' + cast.map((c) => '<div class="bkc clik" data-detail="character:' + c.id + '">' + imgRO('character:' + c.id, c.image) + '<div class="bkcn">' + esc(c.name) + '</div></div>').join('') + '</div></details>'; }
    const wbw = {}; (b.worlds || []).forEach((wid) => wbw[wid] = 1); cast.forEach((c) => { (c.links || []).forEach((l) => { if (l.kind === 'world') wbw[l.to] = 1; }); });
    (P.tracks || []).forEach((t) => { if (t.world && beats.some((e) => e.track === t.id || ((e.alsoTracks || []).indexOf(t.id) >= 0))) wbw[t.world] = 1; });
    const wl = Object.keys(wbw).map((wid) => byId(P.worlds, wid)).filter(Boolean);
    const thr2 = {}; beats.forEach((e) => (e.threads || []).forEach((t) => thr2[t] = 1));
    const tl2 = Object.keys(thr2).map((t) => threadById(t)).filter(Boolean);
    if (b._worldbuilding || wl.length || tl2.length) {
      h += '<details class="bkfold" open><summary>Worldbuilding <span class="muted">(established so far)</span></summary>';
      if (b._worldbuilding) h += '<details class="bkfold"><summary>Story spine / novella <span class="muted">(' + (b._wbwords || 0).toLocaleString() + ' words)</span></summary><div class="wbdoc">' + mdLite(b._worldbuilding) + '</div></details>';
      if (tl2.length) h += '<p class="mblock"><span class="mlabel">Threads</span>' + tl2.map((t) => dlink('thread', t.id, t.name)).join(', ') + '</p>';
      wl.forEach((w) => { h += '<div class="wbworld"><div class="wbwn clik" data-detail="world:' + w.id + '">' + esc(w.name) + ' <span class="wtype">' + esc(w.type || '') + '</span></div>' + (w.note ? '<div class="wbwnote">' + esc(w.note) + '</div>' : '') + (w._worldbuilding ? '<div class="wbmore clik" data-detail="world:' + w.id + '">Open full worldbuilding &mdash; ' + (w._wbwords || 0).toLocaleString() + ' words &rarr;</div>' : '') + '</div>'; });
      h += '</details>';
    }
    h += '<p class="mblock"><span class="mlabel">Chapters</span>' + (chs.length ? chs.map((c) => dlink('chapter', c.id, c.title || ('Chapter ' + (c.order || '')))).join(', ') : '<span class="muted">none yet</span>') + '</p>';
    h += '<p class="mblock"><span class="mlabel">Beats</span>' + (beats.length ? beats.map((e) => dlink('beat', e.id, e.label)).join(', ') : '<span class="muted">none yet</span>') + '</p>';
    return h;
  }
  if (type === 'chapter') {
    const c = byId(P.chapters, id); if (!c) return ''; const pov = charById(c.pov);
    let h = '<div class="mtitle">' + esc(c.title || ('Chapter ' + (c.order || ''))) + '</div><div class="msub">' + esc((bookById(c.book) || {}).title || 'Chapter') + (c.status ? ' · ' + esc(c.status) : '') + ((c._words || c.wordcount) ? ' · ' + (c._words || c.wordcount || 0).toLocaleString() + ' words' : '') + '</div>';
    h += imgSlot('chapter', c.id, 'detail', c.image);
    if (pov) h += '<p class="mblock"><span class="mlabel">POV</span>' + dlink('character', pov.id, pov.name) + '</p>';
    if (c.thread) h += '<p class="mblock"><span class="mlabel">Thread</span>' + dlink('thread', c.thread, (threadById(c.thread) || {}).name || c.thread) + '</p>';
    if (c.summary) h += '<p class="mblock">' + esc(c.summary) + '</p>';
    h += gallery(c.media);
    if (c.bodyFile) h += '<div class="src"><b>Manuscript:</b> ' + esc(c.bodyFile) + '</div>';
    (c.scenes || []).forEach((s, si) => { h += '<div class="mblock"><b>' + esc(s.title || 'Scene') + '</b>' + (s.summary ? '<br>' + esc(s.summary) : '') + imgSlot('scene', s.id || (c.id + '-s' + si), 'card', s.image) + '</div>'; });
    return h;
  }
  if (type === 'reading') {
    const b = byId(P.reading, id); if (!b) return '';
    let h = '<div class="mtitle">' + esc(b.title) + '</div><div class="msub">' + esc(b.author || '') + (b.status ? ' · ' + esc(b.status) : '') + '</div>';
    if (b.gives) h += '<p class="mblock"><b>' + esc(b.gives) + '</b></p>';
    if ((b.tags || []).length) h += '<p class="mblock">' + b.tags.map((t) => '<span class="chip">' + esc(t) + '</span>').join('') + '</p>';
    if (b.correlation) h += '<p class="mblock"><span class="mlabel">For my book</span>' + esc(b.correlation) + '</p>';
    if ((b.takeaways || []).length) { h += '<div class="rels"><div class="mlabel" style="display:block;margin-bottom:5px">My takeaways</div>' + b.takeaways.map((t) => '<p class="mblock">&bull; ' + esc(t) + '</p>').join('') + '</div>'; }
    else h += '<p class="mblock muted">No takeaways yet.</p>';
    return h;
  }
  if (type === 'pantheon') {
    const p = byId(P.pantheon, id); if (!p) return '';
    let h = '<div class="mtitle">' + esc(p.name) + '</div><div class="msub">' + esc(p.age || '') + (p.category ? ' · ' + esc(p.category) : '') + '</div>';
    if (p.role) h += '<p class="mblock"><b>' + esc(p.role) + '</b></p>';
    if (p.function) h += '<p class="mblock">' + esc(p.function) + '</p>';
    if (p.voice) h += '<p class="mblock"><span class="mlabel">Voice</span>' + esc(p.voice) + '</p>';
    if (p.tie) h += '<p class="mblock"><span class="mlabel">In the arc</span>' + esc(p.tie) + '</p>';
    return h;
  }
  if (type === 'ref') {
    const e = byId(REFENT(), id); if (!e) return '';
    let h = '<div class="mtitle">' + esc(e.name) + '</div><div class="msub">' + esc(e._label || 'Reference') + (e.category ? ' &middot; ' + esc(e.category) : '') + '</div>';
    if (e.description) h += '<p class="mblock">' + esc(e.description) + '</p>';
    h += '<div class="refbody">' + refDetail(e) + '</div>';
    return h;
  }
  if (type === 'religion') {
    const r = byId(P.religions, id); if (!r) return '';
    let h = '<div class="mtitle">' + esc(r.name) + '</div><div class="msub">Faith' + (r.world ? ' &middot; ' + esc((byId(P.worlds, r.world) || {}).name || '') : '') + '</div>' + (r.truth ? '<div style="margin:-8px 0 10px">' + truthBadge(r.truth) + (r.status ? '<span class="tbadge st">' + esc(r.status) + '</span>' : '') + '</div>' : '');
    if (r.creed) h += '<p class="mblock"><span class="mlabel">Creed</span>&ldquo;' + esc(r.creed) + '&rdquo;</p>';
    if (r.mythologizes) h += '<p class="mblock"><span class="mlabel">Reads (real order)</span>' + esc(r.mythologizes) + '</p>';
    if (r.afterlife) h += '<p class="mblock"><span class="mlabel">Afterlife</span>' + esc(r.afterlife) + '</p>';
    if ((r.tenets || []).length) h += '<p class="mblock"><span class="mlabel">Tenets</span></p><ul class="mlist">' + r.tenets.map((t) => '<li>' + esc(t) + '</li>').join('') + '</ul>';
    if ((r.figures || []).length) h += '<p class="mblock"><span class="mlabel">Figures</span>' + r.figures.map((f) => dlink('character', f.to, (charById(f.to) || {}).name || f.to) + (f.role ? ' (' + esc(f.role) + ')' : '')).join(', ') + '</p>';
    if ((r.beats || []).length) h += '<p class="mblock"><span class="mlabel">Beats</span>' + r.beats.map((eid) => dlink('beat', eid, (byId(P.timeline, eid) || {}).label || eid)).join(', ') + '</p>';
    if ((r.relationships || []).length) h += '<p class="mblock"><span class="mlabel">Related faiths</span>' + r.relationships.map((rr) => dlink('religion', rr.to, (byId(P.religions, rr.to) || {}).name || rr.to) + (rr.type ? ' (' + esc(rr.type) + ')' : '')).join(', ') + '</p>';
    return h;
  }
  if (type === 'theme') {
    const t = byId(P.themes, id); if (!t) return '';
    let h = '<div class="mtitle">' + esc(t.name) + '</div><div class="msub">Theme</div>';
    if (t.statement) h += '<p class="mblock">' + esc(t.statement) + '</p>';
    if ((t.books || []).length) h += '<p class="mblock">' + t.books.map((bid) => dlink('book', bid, (bookById(bid) || {}).title || bid)).join(' ') + '</p>';
    if ((t.characters || []).length) h += '<p class="mblock"><span class="mlabel">Carried by</span> ' + t.characters.map((cid) => dlink('character', cid, (charById(cid) || {}).name || cid)).join(', ') + '</p>';
    if ((t.beats || []).length) h += '<p class="mblock"><span class="mlabel">Beats</span> ' + t.beats.map((eid) => dlink('beat', eid, (byId(P.timeline, eid) || {}).label || eid)).join(', ') + '</p>';
    return h;
  }
  if (type === 'research') {
    const r = byId(P.research, id); if (!r) return '';
    let h = '<div class="mtitle">' + esc(r.title) + '</div><div class="msub">Research dossier &middot; <span class="rstat ' + esc(r.status || 'open') + '">' + esc(r.status || 'open') + '</span></div>';
    if (r.question) h += '<p class="mblock"><span class="mlabel">Question</span>' + esc(r.question) + '</p>';
    if ((r.threads || []).length || (r.books || []).length) h += '<p class="mblock">' + (r.threads || []).map((tid) => dlink('thread', tid, (threadById(tid) || {}).name || tid)).join(' ') + ' ' + (r.books || []).map((bid) => dlink('book', bid, (bookById(bid) || {}).title || bid)).join(' ') + '</p>';
    if ((r.findings || []).length) { h += '<div class="rels"><div class="mlabel" style="display:block;margin-bottom:5px">Findings</div>' + r.findings.map((f) => '<p class="mblock">&bull; ' + esc(f) + '</p>').join('') + '</div>'; }
    if ((r.forks || []).length) { h += '<div class="rels"><div class="mlabel" style="display:block;margin-bottom:5px">Open forks</div>' + r.forks.map((f) => '<p class="mblock">Fork &middot; ' + esc(f) + '</p>').join('') + '</div>'; }
    if ((r.sources || []).length) { h += '<div class="rels"><div class="mlabel" style="display:block;margin-bottom:5px">Sources</div>' + r.sources.map((s) => '<div class="rsrc">' + (s.url ? '<a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.title || s.url) + '</a>' : esc(s.title || '')) + (s.note ? '<div class="relnote">' + esc(s.note) + '</div>' : '') + '</div>').join('') + '</div>'; }
    return h;
  }
  if (type === 'note') { const n = byId(P.notes, id); if (!n) return ''; return '<div class="msub">' + esc(n.date || 'Note') + '</div><p class="mblock" style="white-space:pre-wrap">' + esc(n.text || '') + '</p>'; }
  return '';
}

/* ---------------- search index ---------------- */
export function buildSearchIndex() {
  const IDX = [];
  (P.characters || []).forEach((c) => IDX.push({ type: 'character', id: c.id, name: c.name, sub: c.role || 'Character' }));
  (P.worlds || []).forEach((w) => IDX.push({ type: 'world', id: w.id, name: w.name, sub: (w.type || 'World') }));
  (P.threads || []).forEach((t) => IDX.push({ type: 'thread', id: t.id, name: t.name, sub: 'Thread' }));
  (P.books || []).forEach((b) => IDX.push({ type: 'book', id: b.id, name: b.title, sub: 'Book' }));
  (P.timeline || []).forEach((e) => IDX.push({ type: 'beat', id: e.id, name: e.label, sub: 'Timeline · ' + (e.era || '') }));
  (P.chapters || []).forEach((c) => IDX.push({ type: 'chapter', id: c.id, name: c.title || ('Chapter ' + (c.order || '')), sub: 'Chapter' }));
  (P.notes || []).forEach((n) => IDX.push({ type: 'note', id: n.id, name: (n.text || '').slice(0, 60), sub: 'Note' }));
  (P.research || []).forEach((r) => IDX.push({ type: 'research', id: r.id, name: r.title, sub: 'Research' }));
  (P.themes || []).forEach((t) => IDX.push({ type: 'theme', id: t.id, name: t.name, sub: 'Theme' }));
  (P.religions || []).forEach((r) => IDX.push({ type: 'religion', id: r.id, name: r.name, sub: 'Faith' }));
  (P.pantheon || []).forEach((p) => IDX.push({ type: 'pantheon', id: p.id, name: p.name, sub: 'Pantheon' }));
  (P.reading || []).forEach((b) => IDX.push({ type: 'reading', id: b.id, name: b.title, sub: 'Reading' }));
  ((P._reference && P._reference.entries) || []).forEach((e) => IDX.push({ type: 'ref', id: e.id, name: e.name, sub: e._label, blob: ((e.description || '') + ' ' + (e.category || '')).toLowerCase() }));
  return IDX;
}
export function searchResults(idx, q) {
  q = (q || '').trim().toLowerCase();
  if (!q) return '';
  const m = idx.filter((x) => (x.name + ' ' + x.sub + ' ' + (x.blob || '')).toLowerCase().includes(q)).slice(0, 40);
  let html = m.map((x) => '<div class="res" data-detail="' + x.type + ':' + x.id + '"><span class="rn">' + esc(x.name) + '</span><span class="rt">' + esc(x.sub) + '</span></div>').join('');
  if (q.length >= 2) {
    const pr = [];
    (P.chapters || []).forEach((c) => { const t = (c._prose || ''); const i = t.toLowerCase().indexOf(q); if (i >= 0) { const st = Math.max(0, i - 32); const snip = (st > 0 ? '…' : '') + t.slice(st, i + q.length + 48).replace(/\s+/g, ' ').trim() + '…'; pr.push({ id: c.id, name: c.title || ('Chapter ' + (c.order || '')), snip: snip }); } });
    if (pr.length) html += '<div class="reshdr">In prose</div>' + pr.slice(0, 20).map((x) => '<div class="res res-prose" data-resume="' + x.id + '"><span class="rn">' + esc(x.name) + '</span><span class="rt rsnip">' + esc(x.snip) + '</span></div>').join('');
  }
  return html || '<div class="res"><span class="rn muted">No matches</span></div>';
}
