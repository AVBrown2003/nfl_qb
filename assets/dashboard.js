/* Dashboard page: loads every drive (data/dashboard_drives.csv) and recomputes the summary numbers,
   the four charts and the table in the browser each time a filter or switch changes.
   The whole view lives in `state`, which is mirrored in the URL hash so any view can be linked to
   (the report's "Explore this" links use that). */

const $ = (id) => document.getElementById(id);
const DEFAULT_QB = "Sam Darnold";
const MIN_RANK_DRIVES = 100;   // leaderboard: drives a QB needs to be ranked by median or rate
const LEADERS = 15;

const DRIVE_RESULTS = {
  TD: "Touchdown", FG: "Field goal", PUNT: "Punt", TO: "Turnover", DOWNS: "Turnover on downs",
  MISS: "Missed field goal", HALF: "End of half", OPPTD: "Opponent return TD", SAF: "Safety",
};
const ZONES = ["Own 1–19", "Own 20–49", "Opp 21–50", "Red zone"];
const zone = (ytg) => (ytg >= 81 ? 0 : ytg >= 51 ? 1 : ytg >= 21 ? 2 : 3);
const scored = (r) => r.dr === "TD" || r.dr === "FG";

// what the charts measure; kind decides how Rate and Median work (see the method panel)
const METRICS = {
  epa:   { name: "QB EPA", kind: "value", signed: true, dp: 2, get: (r) => r.epa,
           total: "Total QB EPA", median: "Median QB EPA per drive", rate: "QB EPA per drive" },
  yds:   { name: "Drive yards", kind: "value", dp: 1, get: (r) => r.yds,
           total: "Total drive yards", median: "Median yards per drive", rate: "Yards per drive" },
  pyds:  { name: "Passing yards", kind: "value", dp: 1, get: (r) => r.pyds,
           total: "Total QB passing yards", median: "Median QB passing yards per drive", rate: "QB passing yards per drive" },
  score: { name: "Scoring drives", kind: "share", get: (r) => (scored(r) ? 1 : 0),
           total: "Scoring drives", rate: "% of drives that scored" },
  td:    { name: "TD drives", kind: "share", get: (r) => (r.dr === "TD" ? 1 : 0),
           total: "Touchdown drives", rate: "% of drives ending in a TD" },
  to:    { name: "Turnovers", kind: "per100", get: (r) => r.to,
           total: "QB turnovers", rate: "QB turnovers per 100 drives" },
};
const MEASURES = [["count", "Count"], ["total", "Total"], ["median", "Median"], ["rate", "Rate"]];
const hasMedian = (metric) => metric.kind === "value";

let QBS = [], ROWS = [];
const cyLabel = (k) => (k === 1 ? "Rookie" : `Year ${k}`);
const BREAKDOWNS = {
  cy:     { name: "Career year", key: (r) => r.cy, label: cyLabel, tick: (k) => (k === 1 ? "Rk" : k), numeric: true },
  season: { name: "Season", key: (r) => r.season, label: String, tick: (k) => `'${String(k).slice(2)}`, numeric: true },
  cls:    { name: "Rookie class", key: (r) => r.cls, label: String, tick: (k) => `'${String(k).slice(2)}`, numeric: true },
  qtr:    { name: "Quarter", key: (r) => r.qtr, label: (k) => (k === 5 ? "OT" : `Q${k}`), order: [1, 2, 3, 4, 5] },
  zone:   { name: "Field position", key: (r) => zone(r.ytg), label: (k) => ZONES[k], order: [0, 1, 2, 3] },
  ha:     { name: "Home or away", key: (r) => r.home, label: (k) => (k ? "Home" : "Away"), order: [1, 0] },
  res:    { name: "Game result", key: (r) => r.res, label: (k) => ({ W: "Win", L: "Loss", T: "Tie" }[k]), order: ["W", "L", "T"] },
  role:   { name: "QB role", key: (r) => r.start, label: (k) => (k ? "Started" : "Off the bench"), order: [1, 0] },
  gt:     { name: "Game type", key: (r) => r.po, label: (k) => (k ? "Playoffs" : "Regular season"), order: [0, 1] },
  dr:     { name: "How the drive ended", key: (r) => r.dr, label: (k) => DRIVE_RESULTS[k], order: Object.keys(DRIVE_RESULTS) },
  team:   { name: "Team", key: (r) => r.team, label: String },
  opp:    { name: "Opponent", key: (r) => r.opp, label: String },
  qb:     { name: "Quarterback", key: (r) => r.qb, label: (k) => QBS[k].name },
};

const CHARTS = [
  { id: "c1", title: "Over the career", splits: ["cy", "season", "cls"], m: "m1", x: "x1", measures: ["median", "rate"] },
  { id: "c2", title: "By game situation", splits: ["qtr", "zone", "ha", "res", "role", "gt"], m: "m2", x: "x2", measures: ["total", "median", "rate"] },
  { id: "c3", title: "By drive result, team and opponent", splits: ["dr", "team", "opp"], m: "m3", x: "x3" },
  { id: "c4", title: "Leaderboard", splits: ["qb", "cls"], m: "m4", x: "x4" },
];

const TOGGLES = {
  gt:   [["all", "All games"], ["reg", "Regular season"], ["po", "Playoffs"]],
  ha:   [["all", "All"], ["home", "Home"], ["away", "Away"]],
  role: [["all", "All"], ["started", "Started"], ["bench", "Off the bench"]],
  res:  [["all", "All"], ["W", "Wins"], ["L", "Losses"]],
};
const FILTER_KEYS = ["qb", "s0", "s1", "c0", "c1", "y0", "y1", "q", "gt", "ha", "role", "res"];
const NUMERIC_KEYS = ["s0", "s1", "c0", "c1", "y0", "y1"];
let DEFAULTS, state, view;

// cards fade in as they scroll into view and back out once fully off screen, and each chart
// builds in again every time its card comes back (from below scrolling down, from above scrolling up)
let building = null;   // id of the chart card currently being drawn with its build-in animation
function buildIn(el) {
  const render = { c1: renderLine, c2: renderColumns, c3: renderBars, c4: renderLeaders }[el.id];
  if (!render || !view) return;   // not a chart card, or the data hasn't loaded yet
  building = el.id;
  render(CHARTS.find((c) => c.id === el.id));
  building = null;
}
const revealer = new IntersectionObserver((entries) => entries.forEach((e) => {
  const el = e.target;
  if (e.intersectionRatio >= 0.12) {
    if (!el.classList.contains("in")) buildIn(el);
    el.classList.add("in");
  } else if (!e.isIntersecting) {
    el.classList.remove("in");
    el.classList.toggle("above", e.boundingClientRect.top < 0);
  }
}), { threshold: [0, 0.12], rootMargin: "0px 0px -40px 0px" });
document.querySelectorAll(".reveal").forEach((el) => revealer.observe(el));
const TABLES = {};

// ---- formatting --------------------------------------------------------------------------------
const int = (v) => Math.round(v).toLocaleString("en-US");
const signed = (v, dp) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(dp)}`;
const trim = (v) => `${+Math.abs(v).toFixed(2)}`;
function fmt(v, metric, m) {
  if (v === null || v === undefined || Number.isNaN(v)) return "–";
  if (m === "count") return int(v);
  if (m === "total") return metric.signed ? signed(v, 1) : int(v);
  if (metric.kind === "share") return `${v.toFixed(1)}%`;
  if (metric.kind === "per100") return v.toFixed(1);
  return metric.signed ? signed(v, metric.dp) : v.toFixed(metric.dp);
}
function tickFmt(metric, m) {
  return (t) => {
    const sign = t < 0 ? "−" : metric.signed && m !== "count" && t > 0 ? "+" : "";
    const a = Math.abs(t);
    const body = a >= 1000 ? `${+(a / 1000).toFixed(1)}k` : trim(a);
    return `${sign}${body}${metric.kind === "share" && m === "rate" ? "%" : ""}`;
  };
}
const measureLabel = (metric, m) => (m === "count" ? "Drives" : metric[m]);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// ---- math ------------------------------------------------------------------------------------------
function group(rows, keyFn, get) {
  const map = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    let g = map.get(k);
    if (!g) map.set(k, (g = { n: 0, sum: 0, vals: [] }));
    const v = get(r);
    g.n += 1; g.sum += v; g.vals.push(v);
  }
  return map;
}
function median(vals) {
  if (!vals.length) return null;
  const s = Float64Array.from(vals).sort(), mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
function measure(g, metric, m) {
  if (!g || !g.n) return null;
  if (m === "count") return g.n;
  if (m === "total") return g.sum;
  if (m === "median") return median(g.vals);
  return metric.kind === "value" ? g.sum / g.n : (100 * g.sum) / g.n;
}
function orderedKeys(b, maps, metric, m) {
  const keys = [...new Set(maps.flatMap((mp) => (mp ? [...mp.keys()] : [])))];
  if (b.order) return b.order.filter((k) => keys.includes(k));
  if (b.numeric) return keys.sort((a, c) => a - c);
  return keys.sort((a, c) => (measure(maps[0].get(c), metric, m) ?? -Infinity) - (measure(maps[0].get(a), metric, m) ?? -Infinity));
}

function makeFilter(S) {
  const q = new Set([...S.q].map(Number));
  return (r) => r.season >= S.s0 && r.season <= S.s1 && r.cls >= S.c0 && r.cls <= S.c1 && r.cy >= S.y0 && r.cy <= S.y1 &&
    q.has(r.qtr) &&
    (S.gt === "all" || (S.gt === "po") === (r.po === 1)) &&
    (S.ha === "all" || (S.ha === "home") === (r.home === 1)) &&
    (S.role === "all" || (S.role === "started") === (r.start === 1)) &&
    (S.res === "all" || r.res === S.res);
}

// ---- URL hash <-> state -----------------------------------------------------------------------------
function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  const S = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS)) {
    if (!p.has(k)) continue;
    const v = p.get(k);
    if (k === "qb") {
      const hit = v === "all" ? "all" : QBS.find((q) => q.name.toLowerCase() === v.toLowerCase());
      if (hit) S.qb = hit === "all" ? "all" : String(hit.qb);
    } else if (NUMERIC_KEYS.includes(k)) {
      if (Number.isFinite(+v)) S[k] = +v;
    } else S[k] = v;
  }
  return normalize(S);
}
function writeHash() {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(state)) {
    if (v === DEFAULTS[k]) continue;
    p.set(k, k === "qb" ? (v === "all" ? "all" : QBS[+v].name) : v);
  }
  const hash = p.toString();
  history.replaceState(null, "", hash ? `#${hash}` : location.pathname);
}
// keep every setting valid (swapped ranges, measures a metric doesn't have, splits a chart doesn't offer)
function normalize(S) {
  for (const [a, b] of [["s0", "s1"], ["c0", "c1"], ["y0", "y1"]]) if (S[a] > S[b]) [S[a], S[b]] = [S[b], S[a]];
  if (!METRICS[S.metric]) S.metric = DEFAULTS.metric;
  if (!/^[1-5]+$/.test(S.q)) S.q = DEFAULTS.q;
  for (const [k, opts] of Object.entries(TOGGLES)) if (!opts.some(([v]) => v === S[k])) S[k] = DEFAULTS[k];
  for (const c of CHARTS) {
    if (!measuresFor(c).some(([v]) => v === S[c.m])) S[c.m] = DEFAULTS[c.m];
    if (S[c.m] === "median" && !hasMedian(METRICS[S.metric])) S[c.m] = "rate";
    if (!c.splits.includes(S[c.x])) S[c.x] = DEFAULTS[c.x];
  }
  if (!["top", "bottom"].includes(S.o4)) S.o4 = "top";
  if (!CHARTS.some((c) => c.id === S.tab)) S.tab = "c1";
  return S;
}
const measuresFor = (c) => MEASURES.filter(([v]) => !c.measures || c.measures.includes(v));
function set(patch) {
  state = normalize({ ...state, ...patch });
  update();
}

// ---- building the controls -------------------------------------------------------------------------
const options = (list, sel) => list.map(([v, t]) => `<option value="${v}"${String(v) === String(sel) ? " selected" : ""}>${esc(t)}</option>`).join("");
const toggleHtml = (list) => list.map(([v, t]) => `<button type="button" data-v="${v}">${esc(t)}</button>`).join("");
function pressToggle(el, v) {
  el.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === String(v))));
}

function buildControls(cyMax) {
  const qbList = [["all", `All QBs (${QBS.length})`], ...[...QBS].sort((a, b) => a.name.localeCompare(b.name)).map((q) => [q.qb, `${q.name} (${q.cls})`])];
  $("f-qb").innerHTML = options(qbList);
  QBSearch.enhance($("f-qb"));
  const years = Array.from({ length: 26 }, (_, i) => [2000 + i, 2000 + i]);
  ["f-s0", "f-s1", "f-c0", "f-c1"].forEach((id) => ($(id).innerHTML = options(years)));
  const cys = Array.from({ length: cyMax }, (_, i) => [i + 1, cyLabel(i + 1)]);
  ["f-y0", "f-y1"].forEach((id) => ($(id).innerHTML = options(cys)));

  $("f-qb").addEventListener("change", (e) => set({ qb: e.target.value }));
  [["f-s0", "s0"], ["f-s1", "s1"], ["f-c0", "c0"], ["f-c1", "c1"], ["f-y0", "y0"], ["f-y1", "y1"]]
    .forEach(([id, k]) => $(id).addEventListener("change", (e) => set({ [k]: +e.target.value })));

  $("f-q").innerHTML = [1, 2, 3, 4, 5].map((q) => `<button type="button" class="chip" data-v="${q}">${q === 5 ? "OT" : `Q${q}`}</button>`).join("");
  $("f-q").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    const on = new Set(state.q);
    if (on.has(b.dataset.v)) { if (on.size > 1) on.delete(b.dataset.v); } else on.add(b.dataset.v);
    set({ q: [...on].sort().join("") });
  });
  for (const [k, list] of Object.entries(TOGGLES)) {
    const el = $(`f-${k}`);
    el.innerHTML = toggleHtml(list);
    el.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) set({ [k]: b.dataset.v }); });
  }
  $("reset").addEventListener("click", () => set(Object.fromEntries(FILTER_KEYS.map((k) => [k, DEFAULTS[k]]))));

  $("metric").innerHTML = toggleHtml(Object.entries(METRICS).map(([k, m]) => [k, m.name]));
  $("metric").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) set({ metric: b.dataset.v }); });

  for (const c of CHARTS) {
    const card = $(c.id);
    card.innerHTML = `
      <div class="card-head"><div><h3 class="card-title">${c.title}</h3><p class="card-sub"></p></div></div>
      <div class="chart-controls">
        <div class="ctl"><span class="field-label">Measure</span><div class="toggle" data-role="measure">${toggleHtml(measuresFor(c))}</div></div>
        <div class="ctl"><label class="field-label" for="${c.id}-split">Split by</label>
          <select id="${c.id}-split" data-role="split">${options(c.splits.map((k) => [k, BREAKDOWNS[k].name]))}</select></div>
        ${c.id === "c4" ? `<div class="ctl"><span class="field-label">Show</span><div class="toggle" data-role="order">${toggleHtml([["top", "Highest"], ["bottom", "Lowest"]])}</div></div>` : ""}
      </div>
      <div class="chart"></div>
      <p class="note chart-note"></p>`;
    card.querySelector('[data-role="measure"]').addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (b && !b.disabled) set({ [c.m]: b.dataset.v });
    });
    card.querySelector('[data-role="split"]').addEventListener("change", (e) => set({ [c.x]: e.target.value }));
    const order = card.querySelector('[data-role="order"]');
    if (order) order.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) set({ o4: b.dataset.v }); });
  }

  $("table-pick").innerHTML = toggleHtml(CHARTS.map((c, i) => [c.id, `Chart ${i + 1}`]));
  $("table-pick").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) set({ tab: b.dataset.v }); });
  $("download").addEventListener("click", downloadCsv);
}

function syncControls() {
  const S = state;
  $("f-qb").value = S.qb;
  ["s0", "s1", "c0", "c1", "y0", "y1"].forEach((k) => ($(`f-${k}`).value = S[k]));
  $("f-q").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(S.q.includes(b.dataset.v))));
  for (const k of Object.keys(TOGGLES)) pressToggle($(`f-${k}`), S[k]);
  pressToggle($("metric"), S.metric);
  const noMedian = !hasMedian(METRICS[S.metric]);
  for (const c of CHARTS) {
    const card = $(c.id), mt = card.querySelector('[data-role="measure"]');
    pressToggle(mt, S[c.m]);
    const med = mt.querySelector('[data-v="median"]');
    med.disabled = noMedian;
    med.title = noMedian ? "Median needs a stat that varies drive to drive (QB EPA or yards)" : "";
    card.querySelector('[data-role="split"]').value = S[c.x];
    const order = card.querySelector('[data-role="order"]');
    if (order) pressToggle(order, S.o4);
  }
  pressToggle($("table-pick"), S.tab);
}

// ---- rendering ---------------------------------------------------------------------------------------
function update() {
  syncControls();
  writeHash();
  const field = ROWS.filter(makeFilter(state));
  const one = state.qb !== "all";
  const qb = one ? +state.qb : null;
  view = { field, one, qb, name: one ? QBS[qb].name : "All QBs", sel: one ? field.filter((r) => r.qb === qb) : field };
  renderShowing();
  renderKpis();
  renderLine(CHARTS[0]);
  renderColumns(CHARTS[1]);
  renderBars(CHARTS[2]);
  renderLeaders(CHARTS[3]);
  renderTable();
}

function renderShowing() {
  const qbs = new Set(view.sel.map((r) => r.qb)).size;
  const seasons = new Set(view.sel.map((r) => r.season)).size;
  $("showing").innerHTML = view.sel.length
    ? `Showing <b>${int(view.sel.length)}</b> of ${int(ROWS.length)} drives · ${view.one ? esc(view.name) : `${qbs} QBs`} · ${seasons} season${seasons === 1 ? "" : "s"}`
    : "<b>No drives match these filters.</b> Loosen one, or reset.";
}

const KPIS = [
  { label: "Drives", get: (rows) => rows.length, fmt: int },
  { label: "QB EPA per drive", get: (rows) => mean(rows, (r) => r.epa), fmt: (v) => signed(v, 2), better: 1 },
  { label: "Scoring drives", get: (rows) => 100 * mean(rows, (r) => (scored(r) ? 1 : 0)), fmt: (v) => `${v.toFixed(1)}%`, better: 1 },
  { label: "Touchdown drives", get: (rows) => 100 * mean(rows, (r) => (r.dr === "TD" ? 1 : 0)), fmt: (v) => `${v.toFixed(1)}%`, better: 1 },
  { label: "QB turnovers per 100 drives", get: (rows) => 100 * mean(rows, (r) => r.to), fmt: (v) => v.toFixed(1), better: -1 },
  { label: "Yards per drive", get: (rows) => mean(rows, (r) => r.yds), fmt: (v) => v.toFixed(1), better: 1 },
];
function mean(rows, get) {
  if (!rows.length) return null;
  let s = 0;
  for (const r of rows) s += get(r);
  return s / rows.length;
}
function renderKpis() {
  $("kpis").innerHTML = KPIS.map((k) => {
    const v = k.get(view.sel), f = view.one ? k.get(view.field) : null;
    let cmp = "";
    if (view.one && k.better && v !== null && f !== null) {
      const good = (v - f) * k.better > 0;
      cmp = `<span class="cmp ${good ? "good" : "bad"}">${good ? "▲ better" : "▼ worse"}</span>`;
    }
    return `<div class="kpi">
      <div class="kpi-value">${v === null ? "–" : k.fmt(v)}</div>
      <div class="kpi-label">${k.label}</div>
      ${view.one ? `<div class="kpi-sub">All QBs: <b>${f === null ? "–" : k.fmt(f)}</b> ${cmp}</div>` : ""}
    </div>`;
  }).join("");
}

function emptyChart(el, msg = "No drives match these filters.") {
  el.innerHTML = `<p class="empty">${msg}</p>`;
}
const tipRow = (color, name, val, n) => `<div class="tt-row">${Charts.key(color)}${esc(name)}: <b>${val}</b> <span class="tt-dim">${int(n)} drives</span></div>`;

// chart 1: the selected QB's line against all QBs under the same filters
function renderLine(c) {
  const card = $(c.id), el = card.querySelector(".chart"), metric = METRICS[state.metric], m = state[c.m], b = BREAKDOWNS[state[c.x]];
  const label = measureLabel(metric, m);
  card.querySelector(".card-sub").textContent = `${label} by ${b.name.toLowerCase()}${view.one ? ` · ${view.name} vs. all QBs` : ""}`;
  card.querySelector(".chart-note").textContent = state[c.x] === "cy"
    ? "Later career years only include quarterbacks who lasted that long, and the 2022–25 classes haven't reached them yet."
    : "Hover a point to see how many drives it is based on.";
  const gSel = group(view.sel, b.key, metric.get), gField = view.one ? group(view.field, b.key, metric.get) : null;
  // one QB: keep the x-axis to the years he played, so a short career isn't squeezed into a corner
  const xs = orderedKeys(b, [gSel, view.one ? null : gField], metric, m);
  TABLES[c.id] = tableFor(c, b, xs, gSel, gField, metric, m);
  if (!view.sel.length) return emptyChart(el);
  const pts = (g) => xs.map((x) => ({ x, y: measure(g.get(x), metric, m), extra: g.get(x) ? `${int(g.get(x).n)} drives` : "" }));
  const series = [];
  if (gField) series.push({ name: "All QBs", color: Charts.css("--c-qb"), points: pts(gField) });
  series.push({ name: view.one ? view.name.split(" ").slice(-1)[0] : "All QBs", color: Charts.css(view.one ? "--c-compare" : "--c-qb"), width: 2.5, points: pts(gSel) });
  // nudge the two end labels apart when the lines finish close together
  if (series.length === 2) {
    const last = (sr) => [...sr.points].reverse().find((p) => p.y !== null)?.y ?? 0;
    const up = last(series[1]) >= last(series[0]);
    series[1].labelDy = up ? -8 : 8; series[0].labelDy = up ? 8 : -8;
  }
  Charts.lines(el, {
    animate: building === c.id,
    xs, series, height: 300, rightPad: 84, zero: metric.signed && m !== "count",
    yFmt: tickFmt(metric, m), valFmt: (v) => fmt(v, metric, m), xFmt: b.tick, tipX: b.label, xTitle: b.name,
    aria: `${label} by ${b.name}`,
  });
}

// chart 2: columns for the selected QB (all QBs in the tooltip)
function renderColumns(c) {
  const card = $(c.id), el = card.querySelector(".chart"), metric = METRICS[state.metric], m = state[c.m], b = BREAKDOWNS[state[c.x]];
  const label = measureLabel(metric, m);
  card.querySelector(".card-sub").textContent = `${label} by ${b.name.toLowerCase()} · ${view.name}`;
  card.querySelector(".chart-note").textContent = view.one ? "Hover a bar to compare with all QBs under the same filters." : "";
  const gSel = group(view.sel, b.key, metric.get), gField = view.one ? group(view.field, b.key, metric.get) : null;
  const keys = orderedKeys(b, [gSel], metric, m);
  TABLES[c.id] = tableFor(c, b, keys, gSel, gField, metric, m);
  if (!view.sel.length) return emptyChart(el);
  const color = Charts.css(view.one ? "--c-compare" : "--c-qb");
  Charts.columns(el, {
    animate: building === c.id,
    height: 300, color, yFmt: tickFmt(metric, m), aria: `${label} by ${b.name}`,
    data: keys.map((k) => {
      const v = measure(gSel.get(k), metric, m);
      return { x: k, xLabel: b.label(k), y: v ?? 0, label: fmt(v, metric, m), k };
    }),
    tip: (d) => `<b>${esc(b.label(d.k))}</b><div class="tt-dim">${label}</div>` +
      tipRow(color, view.name, fmt(measure(gSel.get(d.k), metric, m), metric, m), gSel.get(d.k).n) +
      (gField && gField.get(d.k) ? tipRow(Charts.css("--c-qb"), "All QBs", fmt(measure(gField.get(d.k), metric, m), metric, m), gField.get(d.k).n) : ""),
  });
}

// chart 3: horizontal bars for the selected QB
function renderBars(c) {
  const card = $(c.id), el = card.querySelector(".chart"), metric = METRICS[state.metric], m = state[c.m], b = BREAKDOWNS[state[c.x]];
  const label = measureLabel(metric, m);
  card.querySelector(".card-sub").textContent = `${label} by ${b.name.toLowerCase()} · ${view.name}`;
  card.querySelector(".chart-note").textContent = b.order ? "" : "Sorted from highest to lowest.";
  const gSel = group(view.sel, b.key, metric.get), gField = view.one ? group(view.field, b.key, metric.get) : null;
  const keys = orderedKeys(b, [gSel], metric, m);
  TABLES[c.id] = tableFor(c, b, keys, gSel, gField, metric, m);
  if (!view.sel.length) return emptyChart(el);
  const color = Charts.css(view.one ? "--c-compare" : "--c-qb");
  Charts.hbars(el, {
    animate: building === c.id,
    color, labelW: 150, xFmt: tickFmt(metric, m), aria: `${label} by ${b.name}`,
    rows: keys.map((k) => ({ k, label: b.label(k), value: measure(gSel.get(k), metric, m) ?? 0 })),
    tip: (r) => `<b>${esc(r.label)}</b><div class="tt-dim">${label}</div>` +
      tipRow(color, view.name, fmt(r.value, metric, m), gSel.get(r.k).n) +
      (gField && gField.get(r.k) ? tipRow(Charts.css("--c-qb"), "All QBs", fmt(measure(gField.get(r.k), metric, m), metric, m), gField.get(r.k).n) : ""),
  });
  // hbars prints the value next to each bar with the tick format; swap in the full format
  el.querySelectorAll("g.row .row-sub").forEach((t, i) => (t.textContent = fmt(measure(gSel.get(keys[i]), metric, m), metric, m)));
}

// chart 4: every QB (or rookie class) ranked under the current filters; the selected QB is highlighted
function renderLeaders(c) {
  const card = $(c.id), el = card.querySelector(".chart"), metric = METRICS[state.metric], m = state[c.m], split = state[c.x], b = BREAKDOWNS[split];
  const label = measureLabel(metric, m);
  const needMin = split === "qb" && (m === "rate" || m === "median");
  card.querySelector(".card-sub").textContent = `${state.o4 === "top" ? "Highest" : "Lowest"} ${(/^[A-Z][a-z]/.test(label) ? label.charAt(0).toLowerCase() + label.slice(1) : label)} by ${b.name.toLowerCase()}`;
  card.querySelector(".chart-note").textContent =
    `Ranks every quarterback under the current filters (the quarterback filter is ignored here)${view.one ? `, with ${view.name} highlighted` : ""}.` +
    (needMin ? ` QBs need ${MIN_RANK_DRIVES}+ drives to be ranked.` : "");
  const g = group(view.field, b.key, metric.get);
  let ranked = [...g.entries()].filter(([, v]) => !needMin || v.n >= MIN_RANK_DRIVES)
    .map(([k, v]) => ({ k, n: v.n, value: measure(v, metric, m) }))
    .sort((a, z) => (state.o4 === "top" ? z.value - a.value : a.value - z.value));
  ranked.forEach((r, i) => (r.rank = i + 1));
  const mine = (r) => view.one && (split === "qb" ? r.k === view.qb : r.k === QBS[view.qb].cls);
  let shown = split === "qb" ? ranked.slice(0, LEADERS) : ranked;
  const me = ranked.find(mine);
  if (me && !shown.includes(me)) shown = [...shown, me];
  TABLES[c.id] = {
    sub: `Chart 4 · ${label} by ${b.name.toLowerCase()}, all ranked rows`,
    cols: ["Rank", b.name, "Drives", label],
    rows: ranked.map((r) => [r.rank, b.label(r.k), r.n, fmt(r.value, metric, m)]),
  };
  if (!ranked.length) return emptyChart(el, needMin ? `No quarterback has ${MIN_RANK_DRIVES}+ drives under these filters.` : undefined);
  Charts.hbars(el, {
    animate: building === c.id,
    labelW: 170, color: Charts.css("--c-qb"), xFmt: tickFmt(metric, m), aria: `${label} leaderboard`,
    rows: shown.map((r) => ({ ...r, label: `${r.rank}. ${b.label(r.k)}`, on: mine(r) })),
    tip: (r) => `<b>${esc(b.label(r.k))}</b> · rank ${r.rank} of ${ranked.length}<div class="tt-row">${label}: <b>${fmt(r.value, metric, m)}</b></div><span class="tt-dim">${int(r.n)} drives</span>`,
  });
  el.querySelectorAll("g.row .row-sub").forEach((t, i) => (t.textContent = fmt(shown[i].value, metric, m)));
}

// ---- the table behind the view ---------------------------------------------------------------------
function tableFor(c, b, keys, gSel, gField, metric, m) {
  const label = measureLabel(metric, m), idx = CHARTS.indexOf(c) + 1;
  const cols = [b.name, `${view.name}: drives`, `${view.name}: ${label}`];
  if (gField) cols.push("All QBs: drives", `All QBs: ${label}`);
  const rows = keys.map((k) => {
    const s = gSel.get(k), row = [b.label(k), s ? s.n : 0, fmt(measure(s, metric, m), metric, m)];
    if (gField) { const f = gField.get(k); row.push(f ? f.n : 0, fmt(measure(f, metric, m), metric, m)); }
    return row;
  });
  return { sub: `Chart ${idx} · ${label} by ${b.name.toLowerCase()}`, cols, rows };
}
function renderTable() {
  const t = TABLES[state.tab];
  $("table-sub").textContent = `${t.sub} · updates with every filter and switch`;
  if (!t.rows.length) return emptyChart($("table"), "No rows under these filters.");
  Charts.table($("table"), t.cols, t.rows.map((r) => r.map((v) => (typeof v === "number" ? int(v) : v))));
}
function downloadCsv() {
  const t = TABLES[state.tab];
  const cell = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v);
  const csv = [t.cols, ...t.rows].map((r) => r.map(cell).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = `qb-dashboard-${state.tab}-${view.name.toLowerCase().replace(/\W+/g, "-")}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---- load ----------------------------------------------------------------------------------------------
function parseCsv(text) {
  return text.trim().split(/\r?\n/).slice(1).map((line) => line.split(","));   // no field contains a comma
}
// ---- loading screen: the ring fills as the drive file downloads, and the football rides its edge ----
const LOADER = document.getElementById("loader");
// size of data/dashboard_drives.csv in bytes, so the ring can show progress (the server sends the
// file compressed, so the download doesn't report its real size). Update it if the file is rebuilt.
const DRIVES_BYTES = 5488007;
function loaderProgress(f, label) {
  document.getElementById("ring-fill").style.strokeDashoffset = 1 - f;
  document.getElementById("ring-ball").style.transform = `rotate(${-90 + 360 * f}deg)`;
  const turn = f * 40, facing = Math.cos(turn);   // the same spiral as the report's progress football
  const laces = document.getElementById("ring-laces");
  laces.setAttribute("transform", `translate(0, ${11 - 7.5 * Math.sin(turn)}) scale(1, ${Math.max(0.15, Math.abs(facing))})`);
  laces.setAttribute("opacity", Math.max(0, Math.min(1, facing * 2.5)));
  document.getElementById("loader-text").textContent = label || `Loading 105,862 drives… ${Math.round(f * 100)}%`;
}
async function fetchWithProgress(url) {
  const res = await fetch(url, { cache: "no-cache" });   // no-cache: always check for a newer data file
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  if (!res.body) return res.text();
  const reader = res.body.getReader(), chunks = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    loaderProgress(Math.min(0.97, got / DRIVES_BYTES));
  }
  return new Blob(chunks).text();
}
const loaderShown = performance.now();
loaderProgress(0);

Promise.all([fetchWithProgress("data/dashboard_drives.csv"), fetch("data/dashboard_qbs.csv", { cache: "no-cache" }).then((r) => r.text())])
  .then(([drives, qbs]) => {
    loaderProgress(1, "Building the dashboard…");
    return new Promise((done) => requestAnimationFrame(() => setTimeout(() => done([drives, qbs]), 30)));   // let the full ring paint
  })
  .then(([drives, qbs]) => {
    QBS = parseCsv(qbs).map(([qb, name, cls]) => ({ qb: +qb, name, cls: +cls }));
    const TEXT = new Set(["team", "opp", "res", "dr"]);
    const head = drives.slice(0, drives.indexOf("\n")).trim().split(",");
    ROWS = parseCsv(drives).map((f) => {
      const r = {};
      head.forEach((h, i) => (r[h] = TEXT.has(h) ? f[i] : +f[i]));
      r.cls = QBS[r.qb].cls;
      return r;
    });
    const cyMax = ROWS.reduce((a, r) => Math.max(a, r.cy), 1);
    const darnold = QBS.find((q) => q.name === DEFAULT_QB);
    DEFAULTS = {
      qb: darnold ? String(darnold.qb) : "all", s0: 2000, s1: 2025, c0: 2000, c1: 2025, y0: 1, y1: cyMax, q: "12345",
      gt: "reg", ha: "all", role: "all", res: "all",
      metric: "epa", m1: "rate", x1: "cy", m2: "rate", x2: "qtr", m3: "count", x3: "dr", m4: "rate", x4: "qb", o4: "top", tab: "c1",
    };
    buildControls(cyMax);
    state = readHash();
    update();
    document.querySelectorAll(".dash-grid .card.in").forEach(buildIn);   // charts already on screen at load
    // hold the loading screen at least briefly so it never just flickers, then fade it out
    setTimeout(() => LOADER.classList.add("done"), Math.max(0, 700 - (performance.now() - loaderShown)));
    document.getElementById("share").addEventListener("click", (e) => Charts.copyLink(e.currentTarget, location.href));
    addEventListener("hashchange", () => { state = readHash(); update(); });
  })
  .catch((err) => {
    LOADER.classList.add("done");
    $("showing").textContent = "Could not load the drive data. If you opened this file directly, run a local server (see the README).";
    console.error(err);
  });
