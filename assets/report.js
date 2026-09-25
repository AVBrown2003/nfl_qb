/* Report page: loads the numbers from data/findings.json (built by 03_analysis.py) and the career
   explorer data from data/careers.json (built by 04_site_data.py), then draws everything. */

const C = {
  qb: Charts.css("--c-qb"), team: Charts.css("--c-team"), teamLight: Charts.css("--c-team-light"),
  neutral: Charts.css("--c-neutral"),
};
const pct = (v, d = 0) => `${(v * 100).toFixed(d)}%`;
const signed = (v, d = 3) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(d)}`;
const avg3 = (v) => v.toFixed(3).replace(/^0/, "");
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const yearLabel = (y) => (y === 1 ? "Rookie" : `Year ${y}`);

let F, CAREERS, byName;

Promise.all([fetch("data/findings.json").then((r) => r.json()), fetch("data/careers.json").then((r) => r.json())])
  .then(([findings, careers]) => {
    F = findings;
    CAREERS = careers;
    byName = Object.fromEntries(careers.map((c) => [c.name, c]));
    fillHeadline();
    initExplorer();
    initFindings();
  })
  .catch((err) => {
    document.querySelector("main").insertAdjacentHTML("afterbegin",
      `<p class="card" style="margin-top:24px">Could not load the data files (${err.message}). If you opened this file
       directly, serve the folder instead, e.g. <code>python -m http.server</code>.</p>`);
  });

function fillHeadline() {
  const h = F.headline;
  document.querySelector('[data-h="best"]').textContent = `Year ${h.median_best_season_year}`;
  document.querySelector('[data-h="moved"]').textContent = pct(h.share_teams_done_by_year4);
  document.querySelector('[data-h="bloomers"]').textContent = h.late_bloomers;
}

/* =============================== CAREER EXPLORER =============================== */

const EX = { career: null, i: 0, timer: null };
const QUICK = ["Drew Brees", "Jared Goff", "Ryan Tannehill", "Sam Darnold", "Matthew Stafford", "Patrick Mahomes", "Josh Allen"];

function initExplorer() {
  const sel = document.getElementById("qb-select");
  const classes = [...new Set(CAREERS.map((c) => c.rookie_class))].sort();
  sel.innerHTML = classes.map((y) => `<optgroup label="${y} rookie class">${CAREERS.filter((c) => c.rookie_class === y)
    .sort((a, b) => a.name.localeCompare(b.name)).map((c) => `<option value="${c.id}">${c.name}</option>`).join("")}</optgroup>`).join("");
  sel.addEventListener("change", () => selectQB(CAREERS.find((c) => c.id === sel.value)));

  const quick = document.getElementById("quick");
  QUICK.filter((n) => byName[n]).forEach((n) => {
    const b = document.createElement("button");
    b.className = "chip"; b.type = "button"; b.textContent = n; b.dataset.name = n;
    b.addEventListener("click", () => selectQB(byName[n]));
    quick.appendChild(b);
  });
  document.getElementById("play").addEventListener("click", togglePlay);
  selectQB(byName["Drew Brees"]);
}

const bestIndex = (c) => {
  let best = -1;
  c.seasons.forEach((s, i) => {
    if (s.starts >= 8 && (best < 0 || s.epa_vs_league > c.seasons[best].epa_vs_league)) best = i;
  });
  return best;
};

function selectQB(career, season) {
  stopPlay();
  EX.career = career;
  document.getElementById("qb-select").value = career.id;
  document.querySelectorAll("#quick .chip").forEach((b) => b.setAttribute("aria-pressed", b.dataset.name === career.name));
  const i = season ? career.seasons.findIndex((s) => s.season === season) : bestIndex(career);
  renderSeasonButtons();
  selectSeason(Math.max(0, i));
}

function selectSeason(i) {
  const c = EX.career, s = c.seasons[i];
  EX.i = i;
  Jersey.update(document.getElementById("dial"), c, s);
  const best = bestIndex(c);
  document.getElementById("s-name").textContent = c.name;
  const yr = document.getElementById("s-year");
  yr.textContent = `${yearLabel(s.career_year)} · ${s.season}`;
  yr.className = `yr${s.with_original_team ? "" : " orig-no"}`;
  const tags = [];
  if (i === best) tags.push("<strong>Career-best season</strong>");
  if (s.starts < 8) tags.push("Backup / part-time season (under 8 starts)");
  if (!s.with_original_team) tags.push(`No longer with his original team (${c.original_team})`);
  document.getElementById("s-meta").innerHTML =
    `${s.team_name} · ${s.games} games, ${s.starts} starts · ${c.draft}, ${c.rookie_class}` +
    (tags.length ? `<br>${tags.join(" · ")}` : "");
  const stats = [
    [s.starts ? s.record : "–", "Record as starter"],
    [s.completion_pct === null ? "–" : pct(s.completion_pct, 1), "Completion %"],
    [s.passing_yards.toLocaleString(), "Passing yards"],
    [`${s.pass_tds}–${s.interceptions}`, "TD–INT"],
    [s.yards_per_attempt === null ? "–" : s.yards_per_attempt.toFixed(1), "Yards per pass"],
    [s.rushing_yards.toLocaleString(), "Rushing yards"],
    [s.sacks, "Sacks taken"],
    [signed(s.epa_vs_league, 2), "EPA/play vs league"],
  ];
  document.getElementById("s-stats").innerHTML = stats.map(([v, l]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join("");
  document.querySelectorAll("#seasons .season-btn").forEach((b, j) => b.setAttribute("aria-pressed", j === i));
  drawCareerChart();
  const origYears = c.seasons.filter((x) => x.with_original_team && x.starts >= 8).map((x) => x.career_year);
  const bs = best >= 0 ? c.seasons[best] : null;
  document.getElementById("career-note").textContent =
    (bs ? `Best season: ${bs.season} (${yearLabel(bs.career_year)}) with ${bs.team}, ${signed(bs.epa_vs_league, 2)} per play vs league. ` : "No starting seasons. ") +
    (origYears.length ? `Last starting season for ${c.original_team}: ${yearLabel(Math.max(...origYears))}.` : "");
}

function renderSeasonButtons() {
  const box = document.getElementById("seasons");
  box.innerHTML = "";
  EX.career.seasons.forEach((s, i) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "season-btn";
    b.innerHTML = `<i style="background:${s.jersey.body};${s.jersey.body === "#FFFFFF" ? "box-shadow:inset 0 0 0 1px #cfd4da" : ""}"></i>Y${s.career_year}<small>'${String(s.season).slice(2)} ${s.team}</small>`;
    b.setAttribute("aria-label", `${s.season}, ${yearLabel(s.career_year)}, ${s.team_name}`);
    b.addEventListener("click", () => { stopPlay(); selectSeason(i); });
    box.appendChild(b);
  });
}

// EPA vs league for every season of the selected career; click a bar to jump to that season
function drawCareerChart() {
  const el = document.getElementById("career-chart"), c = EX.career;
  el.innerHTML = "";
  const W = Math.max(280, el.clientWidth), H = 150, m = { t: 14, r: 8, b: 22, l: 40 };
  const { h, text, scale, niceTicks, barPath } = Charts;
  const svg = h("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "EPA per play vs league by season" }, el);
  const vals = c.seasons.map((s) => s.epa_vs_league);
  const ticks = niceTicks(Math.min(-0.1, ...vals), Math.max(0.1, ...vals), 3);
  const y = scale(ticks[0], ticks[ticks.length - 1], H - m.b, m.t);
  const band = (W - m.l - m.r) / Math.max(c.seasons.length, 8), bw = Math.min(22, band * 0.7);
  ticks.forEach((t) => {
    h("line", { x1: m.l, x2: W - m.r, y1: y(t), y2: y(t), stroke: t === 0 ? "#b9c0c9" : "#e2e5e9" }, svg);
    text(svg, m.l - 6, y(t) + 4, t === 0 ? "avg" : signed(t, 2), "tick-label", { "text-anchor": "end" });
  });
  c.seasons.forEach((s, i) => {
    const x = m.l + band * i + (band - bw) / 2;
    const on = i === EX.i, part = s.starts < 8;
    const color = s.epa_vs_league >= 0 ? C.qb : C.team;
    h("path", { d: barPath(x, y(0), bw, y(s.epa_vs_league)), fill: color, opacity: on ? 1 : part ? 0.3 : 0.55 }, svg);
    if (on) h("rect", { x: x - 3, y: m.t - 4, width: bw + 6, height: H - m.b - m.t + 8, fill: "none", stroke: "#0b1b2e", "stroke-width": 1.5, rx: 5 }, svg);
    text(svg, x + bw / 2, H - 6, `Y${s.career_year}`, "tick-label", { "text-anchor": "middle" });
    const hit = h("rect", { x: m.l + band * i, y: m.t, width: band, height: H - m.b - m.t, class: "hit clickable" }, svg);
    hit.addEventListener("mousemove", (e) => Charts.showTip(
      `<b>${s.season} · ${yearLabel(s.career_year)} · ${s.team}</b><br>EPA vs league: <b>${signed(s.epa_vs_league, 3)}</b> per play<br>` +
      `${s.starts} starts${s.starts ? `, ${s.record}` : ""}${part ? ' <span class="tt-dim">(part-time)</span>' : ""}`, e));
    hit.addEventListener("mouseleave", Charts.hideTip);
    hit.addEventListener("click", () => { stopPlay(); selectSeason(i); });
  });
}

function togglePlay() { EX.timer ? stopPlay() : startPlay(); }
function startPlay() {
  const btn = document.getElementById("play");
  btn.textContent = "❚❚ Pause";
  if (EX.i >= EX.career.seasons.length - 1) selectSeason(0);
  EX.timer = setInterval(() => {
    if (EX.i >= EX.career.seasons.length - 1) return stopPlay();
    selectSeason(EX.i + 1);
  }, 1400);
}
function stopPlay() {
  clearInterval(EX.timer);
  EX.timer = null;
  document.getElementById("play").textContent = "▶ Play career";
}
addEventListener("resize", () => EX.career && drawCareerChart());

function openInExplorer(name, season) {
  const c = byName[name];
  if (!c) return;
  selectQB(c, season);
  document.getElementById("explorer").scrollIntoView({ behavior: "smooth" });
}

/* =============================== FINDINGS =============================== */

function card(id) {
  const el = document.querySelector(`[data-chart="${id}"]`);
  return { el, chart: el.querySelector(".chart"), tbl: el.querySelector(".tbl"), title: el.querySelector("[data-title]") };
}

// wires a card's measure switch and its "Show table" link to a draw(mode) function
function setup(id, draw, table) {
  const c = card(id);
  let mode = c.el.querySelector(".toggle button[aria-pressed='true']")?.dataset.mode;
  const redraw = () => { draw(c, mode); if (!c.tbl.hidden) Charts.table(c.tbl, ...table(mode)); };
  c.el.querySelectorAll(".toggle button").forEach((b) => b.addEventListener("click", () => {
    mode = b.dataset.mode;
    c.el.querySelectorAll(".toggle button").forEach((x) => x.setAttribute("aria-pressed", x === b));
    redraw();
  }));
  const link = c.el.querySelector("[data-table]");
  link.addEventListener("click", () => {
    c.tbl.hidden = !c.tbl.hidden;
    link.textContent = c.tbl.hidden ? "Show table" : "Hide table";
    if (!c.tbl.hidden) Charts.table(c.tbl, ...table(mode));
  });
  redraw();
}

const countsToRows = (obj, xs) => xs.map((x) => ({ x, n: obj[x] || 0 }));

function initFindings() {
  // ---- 01 turnovers ------------------------------------------------------------------------
  const t = F["1_turnovers"];
  setup("f1", (c, mode) => {
    const isInt = mode === "int";
    c.title.textContent = isInt ? "Interception rate by career year" : "Turnovers per 100 drives by career year";
    Charts.lines(c.chart, {
      xs: range(1, 10), xFmt: (x) => (x === 1 ? "Rookie" : `Yr ${x}`), noEndLabels: true, rightPad: 24,
      yFmt: isInt ? (v) => pct(v, 2) : (v) => v.toFixed(1),
      bands: [{ from: 2, to: 5, label: "Years 2–5: flat" }],
      series: [{ name: isInt ? "INT %" : "Turnovers / 100 drives", color: C.qb, points: t.map((r) => ({
        x: r.career_year, y: isInt ? r.int_pct : r.turnovers_per_100_drives, big: r.career_year === 6,
        lo: isInt ? r.int_pct - r.int_pct_ci95 : undefined, hi: isInt ? r.int_pct + r.int_pct_ci95 : undefined,
        extra: r.p_vs_rookie === null ? "" : `p vs rookie = ${r.p_vs_rookie < 0.001 ? "<0.001" : r.p_vs_rookie.toFixed(3)}`,
      })) }],
      notes: [{ x: 6, y: isInt ? t[5].int_pct : t[5].turnovers_per_100_drives, dy: 34,
                text: isInt ? "Year 6: 2.21%" : "Year 6: 9.5" }],
    });
  }, (mode) => [["Career year", "INT %", "95% CI ±", "Turnovers / 100 drives", "p vs rookie (INT)"],
    t.map((r) => [yearLabel(r.career_year), pct(r.int_pct, 2), pct(r.int_pct_ci95, 2), r.turnovers_per_100_drives,
                  r.p_vs_rookie === null ? "–" : r.p_vs_rookie.toFixed(4)])]);

  // ---- 02 best season ----------------------------------------------------------------------
  const f2 = F["2_best_season"], rows2 = countsToRows(f2.by_year, range(1, 16));
  setup("f2", (c) => Charts.columns(c.chart, {
    data: rows2.map((r) => ({ x: r.x, y: r.n, color: r.x >= 5 ? C.qb : C.neutral, xLabel: r.x === 1 ? "R" : r.x,
                             label: r.x === 2 || r.x === 7 ? String(r.n) : null })),
    xTitle: "Career year of best season (R = rookie)", yTitle: "QBs",
    regions: [{ from: 5, label: `Year 5 or later: ${pct(f2.share_year5_plus)}` }],
    tip: (d) => `<b>${yearLabel(d.x)}</b><br>${d.y} QBs had their best season here (${pct(d.y / f2.qbs)})`,
  }), () => [["Career year", "QBs", "Share"], rows2.map((r) => [yearLabel(r.x), r.n, pct(r.n / f2.qbs, 1)])]);

  // ---- 03 first above-average season ---------------------------------------------------------
  const f3 = F["3_first_above_average"], rows3 = countsToRows(f3.by_year, range(1, 16));
  setup("f3", (c) => Charts.columns(c.chart, {
    data: rows3.map((r) => ({ x: r.x, y: r.n, color: r.x >= 4 ? C.qb : C.neutral, xLabel: r.x === 1 ? "R" : r.x,
                             label: r.x === 2 ? String(r.n) : null })),
    xTitle: "Career year of first above-average season (R = rookie)", yTitle: "QBs",
    regions: [{ from: 4, label: `Year 4 or later: ${pct(f3.share_year4_plus)} (${Math.round(f3.share_year4_plus * f3.ever_above_average)} QBs)` }],
    tip: (d) => `<b>${yearLabel(d.x)}</b><br>${d.y} QBs first beat the league average here`,
  }), () => [["Career year", "QBs", "Share of the 63"], rows3.map((r) => [yearLabel(r.x), r.n, pct(r.n / f3.ever_above_average, 1)])]);

  // ---- 04 jump vs peak ----------------------------------------------------------------------
  const f4 = F["4_jump_vs_peak"], lv = f4.level_by_year;
  const M4 = {
    epa: { key: "epa_vs_league", name: "EPA per play vs league average", fmt: (v) => signed(v, 2), zero: true },
    win: { key: "win_pct", name: "Win % in games started", fmt: avg3 },
    int: { key: "int_pct", name: "Interception rate", fmt: (v) => pct(v, 1) },
  };
  setup("f4", (c, mode) => {
    const m = M4[mode];
    c.title.textContent = m.name;
    const peak = lv.reduce((a, b) => (mode === "int" ? (b[m.key] < a[m.key] ? b : a) : (b[m.key] > a[m.key] ? b : a)));
    Charts.lines(c.chart, {
      xs: range(1, 10), xFmt: (x) => (x === 1 ? "Rookie" : `Yr ${x}`), yFmt: m.fmt, zero: m.zero, noEndLabels: true, rightPad: 24,
      series: [{ name: m.name, color: C.qb, points: lv.map((r) => ({ x: r.career_year, y: r[m.key], big: r === peak || r.career_year === 2,
                                                                  extra: `(${r.qbs} QBs)` })) }],
      notes: mode === "epa" ? [{ x: 2, y: lv[1].epa_vs_league, dy: 40, dx: 26, text: `Biggest jump: ${signed(lv[1].epa_vs_league - lv[0].epa_vs_league, 3)}`, anchor: "start" },
                               { x: peak.career_year, y: peak.epa_vs_league, dy: -22, text: `Peak: Year ${peak.career_year}` }]
                            : [{ x: peak.career_year, y: peak[m.key], dy: mode === "int" ? 26 : -22, text: `Best: ${yearLabel(peak.career_year)}` }],
      tipHead: (x) => {
        const j = f4.year_over_year.find((r) => r.to_year === x);
        return j ? `<div class="tt-dim">${pct(j.share_improved)} of QBs improved on the year before</div>` : "";
      },
    });
  }, (mode) => [["Career year", "QBs", "EPA vs league", "Win %", "INT %", "Improved on year before"],
    lv.map((r) => {
      const j = f4.year_over_year.find((q) => q.to_year === r.career_year);
      return [yearLabel(r.career_year), r.qbs, signed(r.epa_vs_league), avg3(r.win_pct), pct(r.int_pct, 2), j ? pct(j.share_improved) : "–"];
    })]);

  // ---- 05 teams move on ----------------------------------------------------------------------
  const f5 = F["5_teams_move_on"], rows5 = countsToRows(f5.by_year, range(1, 20));
  let cum = 0;
  rows5.forEach((r) => { cum += r.n; r.cum = cum / f5.qbs; });
  setup("f5", (c, mode) => {
    const isCum = mode === "cum";
    c.title.textContent = isCum ? "Share of original teams that had moved on, by career year" : "Last season as the original team's starter";
    Charts.columns(c.chart, {
      data: rows5.map((r) => ({ x: r.x, y: isCum ? r.cum : r.n, color: r.x <= 4 ? C.team : C.neutral, xLabel: r.x === 1 ? "R" : r.x,
                               label: isCum ? (r.x === 4 || r.x === 5 ? pct(r.cum) : null) : r.x === 3 ? String(r.n) : null })),
      yMax: isCum ? 1.08 : undefined, yFmt: isCum ? (v) => pct(v) : undefined,
      xTitle: "Career year of last start for the original team (R = rookie)", yTitle: isCum ? "" : "QBs",
      regions: [{ from: 1, to: 4, fill: "rgba(227,73,72,.08)", labelOutside: true, label: isCum ? "" : `Gone by Year 4: ${pct(f5.share_done_by_year4)}` }],
      tip: (d) => {
        const r = rows5[d.x - 1];
        return `<b>${yearLabel(d.x)}</b><br>${r.n} QBs made this their last season as starter<br>${pct(r.cum)} gone by the end of this year`;
      },
    });
  }, () => [["Career year", "QBs whose run ended", "Share gone by then"], rows5.map((r) => [yearLabel(r.x), r.n, pct(r.cum, 1)])]);

  // ---- 06 still starting ---------------------------------------------------------------------
  const f6 = F["6_still_starting"].by_year;
  setup("f6", (c) => Charts.lines(c.chart, {
    xs: range(1, 10), xFmt: (x) => (x === 1 ? "Rookie" : `Yr ${x}`), yFmt: (v) => pct(v), yDomain: [0, 1], rightPad: 104,
    series: [
      { name: "Any team", color: C.qb, points: f6.map((r) => ({ x: r.career_year, y: r.share_starting })), labelDy: -6 },
      { name: "Original team", color: C.team, points: f6.map((r) => ({ x: r.career_year, y: r.share_starting_for_original_team, big: r.career_year === 5 })), labelDy: 8 },
    ],
    notes: [{ x: 5, y: f6[4].share_starting_for_original_team, dy: 36, text: `Year 5: ${pct(f6[4].share_starting_for_original_team)}` }],
  }), () => [["Career year", "Starting for any team", "Starting for original team"],
    f6.map((r) => [yearLabel(r.career_year), pct(r.share_starting, 1), pct(r.share_starting_for_original_team, 1)])]);

  // ---- 07 seasons given ----------------------------------------------------------------------
  const f7 = F["7_seasons_given"], rows7 = countsToRows(f7.by_seasons, range(1, 18));
  setup("f7", (c) => Charts.columns(c.chart, {
    data: rows7.map((r) => ({ x: r.x, y: r.n, color: r.x === 1 ? C.team : r.x <= 3 ? C.teamLight : C.neutral,
                             label: r.x === 1 ? `${r.n} QBs (${pct(f7.share_one_season)})` : null })),
    xTitle: "Starting seasons given by the original team", yTitle: "QBs",
    tip: (d) => `<b>${d.x} starting season${d.x > 1 ? "s" : ""}</b><br>${d.y} QBs (${pct(d.y / f7.qbs)})`,
  }), () => [["Starting seasons", "QBs", "Share"], rows7.map((r) => [r.x, r.n, pct(r.n / f7.qbs, 1)])]);

  // ---- 08 late bloomers ----------------------------------------------------------------------
  const lb = F["8_late_bloomers"].qbs;
  setup("f8", (c) => Charts.dumbbell(c.chart, {
    rows: lb.map((q) => ({ ...q, label: q.qb, sub: `${q.original_team} → ${q.best_team}, ${q.best_season}`, a: q.best_with_original, b: q.best_epa_vs_league })),
    aColor: C.neutral, bColor: C.qb, xFmt: (v) => signed(v, 2), xTitle: "EPA per play vs league average (0 = average)", zeroLabel: "League average",
    tip: (r) => `<b>${r.qb}</b><br>Best with ${r.original_team}: <b>${signed(r.a)}</b><br>Best after: <b>${signed(r.b)}</b> with ${r.best_team} in ${r.best_season} (${yearLabel(r.best_career_year)}, ${r.record})<br><span class="tt-dim">Click to open his career</span>`,
    onClick: (r) => openInExplorer(r.qb, r.best_season),
  }), () => [["QB", "Original team", "Last year there", "Best there", "Best after", "Team", "Season", "Record"],
    lb.map((q) => [q.qb, q.original_team, yearLabel(q.last_year_with_original), signed(q.best_with_original), signed(q.best_epa_vs_league), q.best_team, q.best_season, q.record])]);

  // ---- 09 patience ---------------------------------------------------------------------------
  const p9 = F["9_patience"].qbs.slice().sort((a, b) => b.year_4_plus - a.year_4_plus);
  setup("f9", (c) => Charts.dumbbell(c.chart, {
    rows: p9.map((q) => ({ ...q, label: q.qb, sub: `${q.rookie_class} class`, a: q.years_1_3, b: q.year_4_plus })),
    aColor: C.neutral, bColor: C.qb, xFmt: (v) => signed(v, 2), xTitle: "EPA per play vs league average (0 = average)", zeroLabel: "League average", rowH: 34,
    tip: (r) => `<b>${r.qb}</b><br>Years 1–3: <b>${signed(r.a)}</b><br>Year 4 on: <b>${signed(r.b)}</b><br><span class="tt-dim">Click to open his career</span>`,
    onClick: (r) => openInExplorer(r.qb),
  }), () => [["QB", "Rookie class", "Years 1–3", "Year 4 on"], p9.map((q) => [q.qb, q.rookie_class, signed(q.years_1_3), signed(q.year_4_plus)])]);

  // ---- 10 kept vs let go ---------------------------------------------------------------------
  const f10 = F["10_teams_mostly_right"];
  const G10 = [
    { label: "Kept", sub: `Years 1–3 · ${f10.kept_years_1_3.qbs} QBs`, d: f10.kept_years_1_3, color: C.qb },
    { label: "Let go", sub: `Years 1–3 · ${f10.let_go_years_1_3.qbs} QBs`, d: f10.let_go_years_1_3, color: C.team },
    { label: "Let go, later elsewhere", sub: `after leaving · ${f10.let_go_later_elsewhere.qbs} QBs`, d: f10.let_go_later_elsewhere, color: C.teamLight },
  ];
  const M10 = {
    epa_vs_league: { name: "EPA per play vs league average", fmt: (v) => signed(v, 3) },
    win_pct: { name: "Win % in games started", fmt: avg3, base: 0.5 },
    int_pct: { name: "Interception rate", fmt: (v) => pct(v, 2) },
    turnovers_per_100_drives: { name: "Turnovers per 100 drives", fmt: (v) => v.toFixed(1) },
  };
  setup("f10", (c, mode) => {
    const m = M10[mode];
    c.title.textContent = `Kept vs. let go: ${m.name}`;
    Charts.hbars(c.chart, {
      rows: G10.map((g) => ({ ...g, value: g.d[mode] })), xFmt: m.fmt, base: m.base,
      tip: (r) => `<b>${r.label}</b> (${r.sub})<br>${m.name}: <b>${m.fmt(r.value)}</b>`,
    });
  }, () => [["Group", "QBs", "EPA vs league", "Win %", "INT %", "TO / 100 drives"],
    G10.map((g) => [`${g.label} (${g.sub.split(" · ")[0]})`, g.d.qbs, signed(g.d.epa_vs_league), avg3(g.d.win_pct), pct(g.d.int_pct, 2), g.d.turnovers_per_100_drives])]);
}
