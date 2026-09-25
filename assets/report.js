/* Report page: loads the numbers from data/findings.json (built by 03_analysis.py) and the career
   explorer data from data/careers.json (built by 04_site_data.py), then builds the page as the
   reader scrolls: sections fade in, charts draw themselves the first time they come into view. */

const C = {
  qb: Charts.css("--c-qb"), team: Charts.css("--c-team"), teamLight: Charts.css("--c-team-light"),
  neutral: Charts.css("--c-neutral"), compare: Charts.css("--c-compare"),
};
const pct = (v, d = 0) => `${(v * 100).toFixed(d)}%`;
const signed = (v, d = 3) => {
  const r = +v.toFixed(d);   // so -0.001 shows as 0.00, not -0.00
  return `${r > 0 ? "+" : r < 0 ? "−" : ""}${Math.abs(r).toFixed(d)}`;
};
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const yearLabel = (y) => (y === 1 ? "Rookie" : `Year ${y}`);
const yrShort = (x) => (x === 1 ? "Rookie" : `Yr ${x}`);
const list = (names) => (names.length ? names.join(", ") : "");

let F, CAREERS, byName, PER;

/* =============================== page behavior =============================== */

// sections and cards fade up the first time they scroll into view
const revealer = new IntersectionObserver((entries) => entries.forEach((e) => {
  if (e.isIntersecting) { e.target.classList.add("in"); revealer.unobserve(e.target); }
}), { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
document.querySelectorAll(".reveal").forEach((el) => revealer.observe(el));

// reading progress bar in the nav
addEventListener("scroll", () => {
  const max = document.documentElement.scrollHeight - innerHeight;
  document.getElementById("progress").style.width = `${Math.min(100, (scrollY / max) * 100)}%`;
}, { passive: true });

// headline numbers count up once
function countUp() {
  document.querySelectorAll("[data-count]").forEach((el) => {
    const to = +el.dataset.count, pre = el.dataset.prefix || "", suf = el.dataset.suffix || "";
    const start = performance.now(), dur = 1100;
    const step = (t) => {
      const k = Math.min(1, (t - start) / dur), v = Math.round(to * (1 - (1 - k) ** 3));
      el.textContent = `${pre}${Math.max(pre ? 1 : 0, v)}${suf}`;
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

Promise.all([fetch("data/findings.json").then((r) => r.json()), fetch("data/careers.json").then((r) => r.json())])
  .then(([findings, careers]) => {
    F = findings;
    PER = findings.per_qb;
    CAREERS = careers;
    byName = Object.fromEntries(careers.map((c) => [c.name, c]));
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) countUp();
    URL_QB = urlQB();
    initExplorer();
    if (URL_QB) selectQB(CAREERS.find((c) => c.id === URL_QB));
    initFindings();
  })
  .catch((err) => {
    document.querySelector("main").insertAdjacentHTML("afterbegin",
      `<p class="card" style="margin-top:24px">Could not load the data files (${err.message}). If you opened this file
       directly, serve the folder instead, e.g. <code>python -m http.server</code>.</p>`);
    console.error(err);
  });

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
    h("line", { x1: m.l, x2: W - m.r, y1: y(t), y2: y(t), stroke: t === 0 ? "#b9c0c9" : "#e4e6ea" }, svg);
    text(svg, m.l - 6, y(t) + 4, t === 0 ? "avg" : signed(t, 2), "tick-label", { "text-anchor": "end" });
  });
  c.seasons.forEach((s, i) => {
    const x = m.l + band * i + (band - bw) / 2;
    const on = i === EX.i, part = s.starts < 8;
    h("path", { d: barPath(x, y(0), bw, y(s.epa_vs_league)), fill: s.epa_vs_league >= 0 ? C.qb : C.team, opacity: on ? 1 : part ? 0.3 : 0.55 }, svg);
    if (on) h("rect", { x: x - 3, y: m.t - 4, width: bw + 6, height: H - m.b - m.t + 8, fill: "none", stroke: "#0e1a2b", "stroke-width": 1.5, rx: 5 }, svg);
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
  document.getElementById("play").textContent = "❚❚ Pause";
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

/* Wires one finding card:
   - draw(el, qb, animate, mode) draws the chart, highlighting the looked-up QB (a per_qb record) if any
   - table(mode) returns [columns, rows] for the table view
   - readout(qb) returns the sentence shown under the chart for the looked-up QB
   Cards with a switch (.toggle) pass the chosen view as `mode`. The chart is first drawn (animated)
   when the card scrolls into view. */
function setup(id, { draw, table, readout }) {
  const card = document.querySelector(`[data-chart="${id}"]`);
  const chart = card.querySelector(".chart") || card.querySelector(".qb-cards");
  const foot = card.querySelector(".card-foot"), tbl = card.querySelector(".tbl");
  const selId = `lookup-${id}`;
  foot.innerHTML = `<div class="lookup"><label for="${selId}">Look up a QB</label>
      <select id="${selId}"><option value="">Choose a quarterback…</option>${lookupOptions()}</select>
      <p class="readout" aria-live="polite"></p></div>
    <button class="link-btn" type="button" data-table>Show table</button>`;
  const sel = foot.querySelector("select"), out = foot.querySelector(".readout"), link = foot.querySelector("[data-table]");
  let qb = null, drawn = false;
  let mode = card.querySelector(".toggle button[aria-pressed='true']")?.dataset.mode;
  const redraw = (animate) => draw(chart, qb, animate, mode);
  const showTable = () => { if (!tbl.hidden) Charts.table(tbl, ...table(mode)); };
  const pick = () => {
    qb = sel.value ? { id: sel.value, ...PER[sel.value] } : null;
    out.innerHTML = qb ? readout(qb, mode) : "";
  };
  sel.addEventListener("change", () => { pick(); if (drawn) redraw(false); });
  if (URL_QB) { sel.value = URL_QB; pick(); }   // ?qb=Name preselects a quarterback everywhere
  card.querySelectorAll(".toggle button").forEach((b) => b.addEventListener("click", () => {
    mode = b.dataset.mode;
    card.querySelectorAll(".toggle button").forEach((x) => x.setAttribute("aria-pressed", x === b));
    if (qb) out.innerHTML = readout(qb, mode);
    if (drawn) redraw(true);
    showTable();
  }));
  link.addEventListener("click", () => {
    tbl.hidden = !tbl.hidden;
    link.textContent = tbl.hidden ? "Show table" : "Hide table";
    showTable();
  });
  const io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) { drawn = true; redraw(true); io.disconnect(); }
  }, { threshold: 0.25 });
  io.observe(card);
}
// a link like index.html?qb=Sam%20Darnold opens the page with that quarterback looked up everywhere
let URL_QB = null;
function urlQB() {
  const name = new URLSearchParams(location.search).get("qb");
  return name ? (Object.entries(PER).find(([, q]) => q.name.toLowerCase() === name.toLowerCase()) || [null])[0] : null;
}
let _options;
function lookupOptions() {
  if (!_options) {
    const last = (n) => n.split(" ").filter((w) => !/^(Jr\.?|Sr\.?|II|III|IV)$/.test(w)).pop();
    _options = Object.entries(PER).sort((a, b) => last(a[1].name).localeCompare(last(b[1].name)) || a[1].name.localeCompare(b[1].name))
      .map(([id, q]) => `<option value="${id}">${q.name} (${q.rookie_class})</option>`).join("");
  }
  return _options;
}
const who = (q) => `<span class="swatch"></span><b>${q.name}</b>`;
const countsToRows = (obj, xs) => xs.map((x) => ({ x, n: obj[x] || 0 }));
// per_qb season rows: [career_year, season, team, starts, turnovers, drives, epa_vs_league, with_original_team]
const starting = (q) => q.seasons.filter((s) => s[3] >= 8);

function initFindings() {
  // ---- 01 turnovers per 100 drives ----------------------------------------------------------------
  const t = F["1_turnovers"];
  const toRate = (q, y) => {
    const s = q.seasons.filter((r) => r[0] === y), dr = s.reduce((a, r) => a + r[5], 0);
    return dr >= 20 ? { v: (100 * s.reduce((a, r) => a + r[4], 0)) / dr, dr } : null;
  };
  setup("f1", {
    draw: (el, q, animate) => {
      const series = [{ name: "All QBs", color: C.qb, endLabel: !!q, points: t.map((r) => ({
        x: r.career_year, y: r.turnovers_per_100_drives, big: r.career_year === 6,
        lo: r.turnovers_per_100_drives - r.turnovers_ci95, hi: r.turnovers_per_100_drives + r.turnovers_ci95,
        extra: r.p_vs_rookie_turnovers === null ? "" : `p vs rookie = ${r.p_vs_rookie_turnovers < 0.001 ? "<0.001" : r.p_vs_rookie_turnovers.toFixed(3)}`,
      })) }];
      if (q) series.push({ name: q.name, color: C.compare, points: range(1, 10).map((y) => {
        const r = toRate(q, y);
        return { x: y, y: r ? r.v : null, extra: r ? `(${r.dr} drives)` : "" };
      }) });
      Charts.lines(el, {
        animate, xs: range(1, 10), xFmt: yrShort, yFmt: (v) => v.toFixed(1), rightPad: q ? 120 : 24, noEndLabels: !q,
        yDomain: [8.5, 12], bands: [{ from: 2, to: 5, label: "Years 2–5: no real change" }], series,
        notes: q ? [] : [{ x: 6, y: t[5].turnovers_per_100_drives, dy: 34, text: "Year 6: 9.5" }],
      });
    },
    table: () => [["Career year", "Turnovers / 100 drives", "95% CI ±", "p vs rookie"],
      t.map((r) => [yearLabel(r.career_year), r.turnovers_per_100_drives, r.turnovers_ci95, r.p_vs_rookie_turnovers === null ? "–" : r.p_vs_rookie_turnovers.toFixed(4)])],
    readout: (q) => {
      const r1 = toRate(q, 1), r6 = toRate(q, 6);
      const parts = [r1 ? `rookie year ${r1.v.toFixed(1)}` : "too few rookie drives to plot", r6 ? `Year 6 ${r6.v.toFixed(1)}` : "no Year 6 to plot"];
      return `${who(q)}: turnovers per 100 drives, ${parts.join("; ")}. Seasons with fewer than 20 drives are left off.`;
    },
  });

  // ---- 02 best season, split by how each QB looked in Years 1-3 ------------------------------------
  const f2 = F["2_best_season"], det = f2.by_year_detail;
  const PROFILE = [
    { key: "writeoff", name: "Write-offs", color: C.team },
    { key: "understudy", name: "Understudies", color: C.qb },
    { key: "strong", name: "Good early", color: C.neutral },
  ];
  const profileOf = (q) => (q.early === null ? "an understudy (no starting season in Years 1–3)"
    : q.early < 0 ? `a write-off (below average in Years 1–3, ${signed(q.early)})` : `good early (above average in Years 1–3, ${signed(q.early)})`);
  setup("f2", {
    draw: (el, q, animate) => {
      const mine = q && q.long_career && q.full_class && q.best ? q.best.career_year : null;
      Charts.columns(el, {
        animate,
        data: range(1, 16).map((x) => {
          const d = det[x] || { writeoff: [], understudy: [], strong: [] };
          return { x, xLabel: x === 1 ? "R" : x, outline: x === mine, d, stack: PROFILE.map((p) => ({ y: d[p.key].length, color: p.color })) };
        }),
        xTitle: "Career year of his best season (R = rookie)", yTitle: "QBs",
        regions: [{ from: 5, label: `Year 5 or later: ${f2.late_breakouts} QBs, ${f2.late_below_average_early} write-offs + ${f2.late_not_starting_early} understudies` }],
        tip: (d) => {
          const n = PROFILE.reduce((a, p) => a + d.d[p.key].length, 0);
          return `<b>Best season in ${yearLabel(d.x)}: ${n} QB${n === 1 ? "" : "s"}</b>` +
            PROFILE.filter((p) => d.d[p.key].length).map((p) => `<br>${Charts.key(p.color)} ${p.name}: ${list(d.d[p.key])}`).join("");
        },
      });
    },
    table: () => [["Best season", "Write-offs", "Understudies", "Good early", "Names"],
      range(1, 16).filter((x) => det[x]).map((x) => [yearLabel(x), det[x].writeoff.length, det[x].understudy.length, det[x].strong.length,
                                                    list([...det[x].writeoff, ...det[x].understudy, ...det[x].strong])])],
    readout: (q) => {
      if (!q.best) return `${who(q)} never had a starting season (8+ starts), so he has no best season to place.`;
      const b = q.best;
      const note = q.long_career && q.full_class ? "" : " He is not in this chart, which only includes careers of 8+ seasons from the 2000–2018 classes.";
      return `${who(q)}: best season in ${yearLabel(b.career_year)} (${b.season}, ${b.team}), ${signed(b.epa_vs_league)} per play vs league. Early on he was ${profileOf(q)}.${note}`;
    },
  });

  // ---- 03 first above-average season -------------------------------------------------------------
  const f3 = F["3_first_above_average"], rows3 = countsToRows(f3.by_year, range(1, 16));
  setup("f3", {
    draw: (el, q, animate) => {
      const mine = q && q.full_class ? q.first_above : null;
      Charts.columns(el, {
        animate,
        data: rows3.map((r) => ({ x: r.x, y: r.n, color: r.x >= 4 ? C.qb : C.neutral, xLabel: r.x === 1 ? "R" : r.x, outline: r.x === mine,
                                 names: f3.names_by_year[r.x] || [], label: r.x === 2 || r.x === 3 ? String(r.n) : null })),
        xTitle: "Career year of his first above-average season (R = rookie)", yTitle: "QBs",
        regions: [{ from: 4, label: "Late bloomers, Year 4 or later: 22 QBs (35%)" }],
        tip: (d) => `<b>${yearLabel(d.x)}: ${d.y} QB${d.y === 1 ? "" : "s"}</b>${d.names.length ? `<br>${list(d.names)}` : ""}`,
      });
    },
    table: () => [["Career year", "QBs", "Share of the 63", "Names"],
      rows3.map((r) => [yearLabel(r.x), r.n, pct(r.n / f3.ever_above_average, 1), list(f3.names_by_year[r.x] || [])])],
    readout: (q) => {
      const note = q.full_class ? "" : " (His class is after 2018, so he is not in this chart.)";
      if (!starting(q).length) return `${who(q)} never had a starting season.${note}`;
      return q.first_above === null ? `${who(q)} never had an above-average starting season.${note}`
        : `${who(q)}: first above-average season in ${yearLabel(q.first_above)}${q.first_above >= 4 ? ", a late bloomer" : ""}.${note}`;
    },
  });

  // ---- 04 EPA only ---------------------------------------------------------------------------------
  const lv = F["4_jump_vs_peak"].level_by_year, yoy = F["4_jump_vs_peak"].year_over_year;
  setup("f4", {
    draw: (el, q, animate) => {
      const series = [{ name: "Same 58 QBs", color: C.qb, endLabel: !!q, points: lv.map((r) => ({
        x: r.career_year, y: r.epa_vs_league, big: r.career_year === 2 || r.career_year === 8, extra: `(${r.qbs} QBs)` })) }];
      if (q) series.push({ name: q.name, color: C.compare, points: range(1, 10).map((y) => {
        const s = q.seasons.find((r) => r[0] === y && r[3] >= 8);
        return { x: y, y: s ? s[6] : null, extra: s ? `(${s[1]}, ${s[2]})` : "" };
      }) });
      Charts.lines(el, {
        animate, height: 360, xs: range(1, 10), xFmt: yrShort, yFmt: (v) => signed(v, 2), zero: true, zeroLabel: "League average",
        yDomain: [-0.08, 0.08], yTicks: 8, rightPad: q ? 120 : 24, noEndLabels: !q, series,
        notes: q ? [] : [
          { x: 2, y: lv[1].epa_vs_league, dy: 44, dx: 30, text: `Biggest jump: ${signed(lv[1].epa_vs_league - lv[0].epa_vs_league)}`, anchor: "start" },
          { x: 8, y: lv[7].epa_vs_league, dy: -24, text: "Peak: Year 8" }],
        tipHead: (x) => {
          const j = yoy.find((r) => r.to_year === x);
          return j ? `<div class="tt-dim">${pct(j.share_improved)} of QBs improved on the year before</div>` : "";
        },
      });
    },
    table: () => [["Career year", "QBs", "EPA vs league", "Improved on year before"],
      lv.map((r) => {
        const j = yoy.find((q) => q.to_year === r.career_year);
        return [yearLabel(r.career_year), r.qbs, signed(r.epa_vs_league), j ? pct(j.share_improved) : "–"];
      })],
    readout: (q) => {
      const s = starting(q).filter((r) => r[0] <= 10);
      if (!s.length) return `${who(q)} has no starting seasons in Years 1–10. Only seasons with 8+ starts are plotted.`;
      const best = s.reduce((a, b) => (b[6] > a[6] ? b : a));
      return `${who(q)}: ${s.length} starting season${s.length > 1 ? "s" : ""} plotted (8+ starts). His best was ${yearLabel(best[0])} (${best[1]}, ${best[2]}) at ${signed(best[6])} per play vs league.`;
    },
  });

  // ---- 05 teams move on (number of QBs) ----------------------------------------------------------
  const f5 = F["5_teams_move_on"], rows5 = countsToRows(f5.by_year, range(1, 20));
  setup("f5", {
    draw: (el, q, animate) => {
      const mine = q && q.full_class && !q.still_starting_for_original_2025 ? q.last_original_start : null;
      Charts.columns(el, {
        animate,
        data: rows5.map((r) => ({ x: r.x, y: r.n, color: r.x <= 4 ? C.team : C.neutral, xLabel: r.x === 1 ? "R" : r.x, outline: r.x === mine,
                                 label: r.x === 3 ? String(r.n) : null })),
        xTitle: "Career year of his last start for the original team (R = rookie)", yTitle: "QBs",
        regions: [{ from: 1, to: 4, fill: "rgba(227,73,72,.07)", labelOutside: true, label: `Gone by Year 4: ${pct(f5.share_done_by_year4)}` }],
        tip: (d) => `<b>${yearLabel(d.x)}</b><br>${d.y} QBs made this their last season as their original team's starter`,
      });
    },
    table: () => [["Career year", "QBs whose run ended"], rows5.map((r) => [yearLabel(r.x), r.n])],
    readout: (q) => {
      if (q.last_original_start === null) return `${who(q)} never had a starting season for his original team (${q.original_team}).`;
      if (q.still_starting_for_original_2025) return `${who(q)} was still ${q.original_team}'s starter in 2025, so his run has not ended.`;
      return `${who(q)}: last starting season for ${q.original_team} was ${yearLabel(q.last_original_start)}.${q.full_class ? "" : " (His class is after 2018, so he is not in this chart.)"}`;
    },
  });

  // ---- 06 seasons given: donut --------------------------------------------------------------------
  const f6 = F["6_seasons_given"];
  const BUCKETS = [
    { label: "1 season", test: (n) => n === 1, color: C.team },
    { label: "2 seasons", test: (n) => n === 2, color: "#ec7776" },
    { label: "3 seasons", test: (n) => n === 3, color: C.teamLight },
    { label: "4–5 seasons", test: (n) => n >= 4 && n <= 5, color: "#9aa3ae" },
    { label: "6–9 seasons", test: (n) => n >= 6 && n <= 9, color: "#bcc3cc" },
    { label: "10 or more", test: (n) => n >= 10, color: "#dde1e6" },
  ];
  const bucketRows = BUCKETS.map((b) => {
    const ns = Object.keys(f6.by_seasons).map(Number).filter(b.test);
    return { ...b, n: ns.reduce((a, k) => a + f6.by_seasons[k], 0), names: ns.flatMap((k) => (f6.names_by_seasons[k] || []).map((nm) => (ns.length > 1 ? `${nm} (${k})` : nm))) };
  });
  setup("f6", {
    draw: (el, q, animate) => {
      const mine = q && q.full_class && !q.still_starting_for_original_2025 ? q.original_starting_seasons : null;
      Charts.donut(el, {
        animate, legendEl: el.parentElement.querySelector(".pie-legend"), center: [String(f6.qbs), "quarterbacks"],
        slices: bucketRows.map((b) => ({ ...b, on: mine !== null && b.test(mine) })),
      });
    },
    table: () => [["Starting seasons given", "QBs", "Share", "Names"],
      Object.keys(f6.by_seasons).map(Number).sort((a, b) => a - b).map((k) => [k, f6.by_seasons[k], pct(f6.by_seasons[k] / f6.qbs, 1), list(f6.names_by_seasons[k] || [])])],
    readout: (q) => {
      if (!q.original_starting_seasons) return `${who(q)} never had a starting season for his original team (${q.original_team}).`;
      return `${who(q)}: ${q.original_team} gave him ${q.original_starting_seasons} starting season${q.original_starting_seasons > 1 ? "s" : ""}` +
        (q.still_starting_for_original_2025 ? ", and he was still their starter in 2025, so he is not in the chart." : q.full_class ? ". His slice is pulled out." : ". (His class is after 2018, so he is not in the chart.)");
    },
  });

  // ---- 07 money: the clock, the price, who gets paid, which teams ---------------------------------
  const k7 = F["7_contracts"];
  const teamColor = {};
  CAREERS.forEach((c) => c.seasons.forEach((s) => { teamColor[s.team] = s.jersey.body === "#FFFFFF" ? s.jersey.number : s.jersey.body; }));
  const card7 = document.querySelector('[data-chart="f7"]');
  const legend7 = card7.querySelector("[data-legend]"), grid7 = card7.querySelector(".team-grid");
  const TITLES = {
    clock: ["When teams paid their own quarterback", `${k7.second_deals} big second contracts (10%+ of the cap) from a QB's original team, QBs who entered the league 2011–2025`],
    price: ["What a quarterback costs, as a share of the salary cap", "Median rookie deal vs. median big second contract, by the years it was signed"],
    who: ["Who got a big second contract from his original team", "51 QBs who entered the league 2011–2021 and started for their original team in Years 1–3"],
    teams: ["Which teams paid their own quarterback", "Big second contracts to a QB who started his career with that team, QBs who entered the league 2011–2025"],
  };
  const paidParts = (g) => [
    { name: "Got a big second contract", n: g.paid, color: C.qb, names: g.names_paid },
    { name: "Did not", n: g.qbs - g.paid, color: C.neutral, names: g.names_not_paid },
  ];
  setup("f7", {
    draw: (el, q, animate, mode) => {
      const [t, sub] = TITLES[mode];
      card7.querySelector("[data-title]").textContent = t;
      card7.querySelector("[data-sub]").textContent = sub;
      el.hidden = mode === "teams";
      grid7.hidden = mode !== "teams";
      legend7.hidden = mode !== "who";
      const own = q ? q.contracts.find((c) => c[6] && c[1] > 1 && c[5] >= 0.10) : null;
      if (mode === "clock") {
        Charts.columns(el, {
          animate, data: range(1, 8).map((x) => {
            const deals = k7.deals.filter((d) => d.career_year === x);
            return { x, y: deals.length, deals, color: x <= 4 ? C.team : C.teamLight, xLabel: x === 1 ? "R" : x, outline: own && own[1] === x,
                     label: x === 4 ? `${deals.length} of ${k7.second_deals}` : null };
          }),
          xTitle: "Career year the deal was signed (Year 4 = after three seasons)", yTitle: "Deals",
          regions: [{ from: 5, fill: "rgba(42,120,214,.07)", label: "Where the late best seasons in Part 1 happen" }],
          tip: (d) => `<b>Signed in ${yearLabel(d.x)}: ${d.y} deal${d.y === 1 ? "" : "s"}</b>` +
            (d.deals.length ? `<br>${d.deals.map((x) => `${x.qb} (${x.team}, ${x.year_signed}, ${pct(x.cap_pct, 1)} of cap)`).join("<br>")}` : ""),
        });
      } else if (mode === "price") {
        const rows = [{ x: 1, xLabel: "Rookie deal", y: k7.rookie_deal_cap_pct.round_1, color: C.neutral, deals: [], label: pct(k7.rookie_deal_cap_pct.round_1, 1),
                        tip: `<b>First-round rookie deal</b><br>Median ${pct(k7.rookie_deal_cap_pct.round_1, 1)} of the cap per year (round 2: ${pct(k7.rookie_deal_cap_pct.round_2, 1)}, round 3+: ${pct(k7.rookie_deal_cap_pct.round_3_plus, 1)})` }]
          .concat(k7.price_by_window.map((w, i) => {
            const deals = k7.deals.filter((d) => d.year_signed >= w.from && d.year_signed <= w.to);
            return { x: i + 2, xLabel: `${w.from}–${String(w.to).slice(2)}`, y: w.median_cap_pct, color: C.team, label: pct(w.median_cap_pct, 1),
                     tip: `<b>Big second contracts signed ${w.from}–${w.to}</b><br>Median ${pct(w.median_cap_pct, 1)} of the cap (${w.deals} deals)<br>${deals.map((x) => `${x.qb}: ${pct(x.cap_pct, 1)}`).join("<br>")}` };
          }));
        Charts.columns(el, { animate, data: rows, yMax: 0.27, yFmt: (v) => pct(v), yTitle: "Share of cap", xTitle: "First-round rookie deal, then big second contracts by year signed", tip: (d) => d.tip });
      } else if (mode === "who") {
        const w = k7.who_paid;
        legend7.innerHTML = `<span><i style="background:${C.qb}"></i>Got a big second contract</span><span><i style="background:${C.neutral}"></i>Did not</span>`;
        const grp = q && q.rookie_class >= 2011 && q.rookie_class <= 2021 && q.early !== null;
        Charts.stack100(el, {
          animate, rows: [
            { label: "Above average early", sub: `Years 1–3 · ${w.above_average_early.qbs} QBs`, parts: paidParts(w.above_average_early), on: grp && q.early >= 0 },
            { label: "Below average early", sub: `Years 1–3 · ${w.below_average_early.qbs} QBs`, parts: paidParts(w.below_average_early), on: grp && q.early < 0 },
            { label: "First-round picks", sub: `${w.round_1.qbs} QBs`, parts: paidParts(w.round_1) },
            { label: "Later picks / undrafted", sub: `${w.later_rounds.qbs} QBs`, parts: paidParts(w.later_rounds) },
          ],
        });
      } else {
        grid7.innerHTML = Object.entries(k7.teams).map(([t, names]) =>
          `<div class="team-tile${names.length ? "" : " none"}${q && own && q.original_team === t ? " on" : ""}" style="--team:${teamColor[t] || "#cfd4da"}" data-team="${t}">
            <b>${t}</b><span>${names.length ? `${names.length} deal${names.length > 1 ? "s" : ""}` : "none"}</span></div>`).join("");
        grid7.querySelectorAll(".team-tile").forEach((tile) => {
          const names = k7.teams[tile.dataset.team];
          tile.addEventListener("mousemove", (e) => Charts.showTip(`<b>${tile.dataset.team}</b><br>${names.length ? names.join(", ") : "Never gave a big second contract to a QB who started his career there"}`, e));
          tile.addEventListener("mouseleave", Charts.hideTip);
        });
      }
    },
    table: (mode) => mode === "price"
      ? [["Deal", "Median share of cap", "Deals"], [["First-round rookie deal", pct(k7.rookie_deal_cap_pct.round_1, 1), "–"],
          ...k7.price_by_window.map((w) => [`Big second contract, ${w.from}–${w.to}`, pct(w.median_cap_pct, 1), w.deals])]]
      : mode === "who"
        ? [["Group", "QBs", "Got a big 2nd contract", "Names paid"], Object.entries({ "Above average early": "above_average_early", "Below average early": "below_average_early",
            "First-round picks": "round_1", "Later picks / undrafted": "later_rounds" }).map(([l, key]) => [l, k7.who_paid[key].qbs, k7.who_paid[key].paid, list(k7.who_paid[key].names_paid)])]
        : mode === "teams"
          ? [["Team", "Big 2nd contracts to own QB", "Names"], Object.entries(k7.teams).map(([t, n]) => [t, n.length, list(n)])]
          : [["QB", "Team", "Year signed", "Career year", "Years", "Total ($M)", "Share of cap", "Guaranteed ($M)"],
             k7.deals.map((d) => [d.qb, d.team, d.year_signed, yearLabel(d.career_year), d.years, d.value, pct(d.cap_pct, 1), d.guaranteed])],
    readout: (q) => {
      if (!q.contracts.length) return `${who(q)}: no contract records in the data.`;
      const rookie = q.contracts[0], big = q.contracts.filter((c) => c[1] > 1 && c[5] >= 0.10);
      const ownBig = big.find((c) => c[6]);
      const note = q.rookie_class < 2011 ? " (He entered the league before 2011, so he is not in these charts.)" : "";
      return `${who(q)}: first contract ${rookie[0]} with ${rookie[6] ? q.original_team : rookie[2]}, ${pct(rookie[5], 1)} of the cap per year. ` +
        (ownBig ? `Big second contract from his original team in ${yearLabel(ownBig[1])} (${ownBig[0]}), ${pct(ownBig[5], 1)} of the cap.`
          : big.length ? `No big second contract from his original team; his first big deal came with ${big[0][2]} in ${big[0][0]} (${pct(big[0][5], 1)} of the cap).`
            : "He never signed a contract worth 10%+ of the cap.") + note;
    },
  });

  // ---- 08 late bloomers: cards -----------------------------------------------------------------------
  const lb = F["8_late_bloomers"].qbs;
  const cardsEl = document.getElementById("bloomer-cards"), moreBtn = document.getElementById("show-all-bloomers");
  let showAll = false, lastQ8 = null;
  const jerseyOf = (name, team, season) => {
    const c = byName[name];
    const s = c && (c.seasons.find((x) => x.season === season && x.team === team) || c.seasons.find((x) => x.team === team));
    return s ? s.jersey.body : C.neutral;
  };
  const drawCards = (el, q, animate) => {
    const lo = -0.2, hi = 0.3, zero = ((0 - lo) / (hi - lo)) * 100;
    const bar = (v, color) => {
      const x = ((v - lo) / (hi - lo)) * 100;
      return `<span class="fill" style="left:${Math.min(x, zero)}%;width:${Math.abs(x - zero)}%;background:${color}"></span>`;
    };
    const shown = showAll ? lb : lb.slice(0, 9);
    el.innerHTML = shown.map((r, i) => {
      const lastOrig = byName[r.qb]?.seasons.filter((s) => s.team === r.original_team).pop()?.season;
      return `<button class="qb-card${q && q.name === r.qb ? " on" : ""}${animate ? " reveal" : ""}" type="button" data-qb="${r.qb}" data-season="${r.best_season}" style="transition-delay:${animate ? i * 70 : 0}ms">
        <span class="stripe"><span style="background:${jerseyOf(r.qb, r.original_team, lastOrig)}"></span><span style="background:${jerseyOf(r.qb, r.best_team, r.best_season)}"></span></span>
        <h4>${r.qb}</h4>
        <div class="route">${r.original_team} → ${r.best_team} · ${r.rookie_class} class</div>
        <div class="mini" style="--zero:${zero}%"><span>Best with ${r.original_team}</span><span class="track">${bar(r.best_with_original, C.neutral)}</span><b>${signed(r.best_with_original, 2)}</b></div>
        <div class="mini" style="--zero:${zero}%"><span>Best with ${r.best_team}</span><span class="track">${bar(r.best_epa_vs_league, C.qb)}</span><b>${signed(r.best_epa_vs_league, 2)}</b></div>
        <div class="foot">${r.best_season} · ${yearLabel(r.best_career_year)} · ${r.record} · left ${r.original_team} after ${yearLabel(r.last_year_with_original)}</div>
      </button>`;
    }).join("");
    el.querySelectorAll(".qb-card").forEach((b) => {
      b.addEventListener("click", () => openInExplorer(b.dataset.qb, +b.dataset.season));
      if (animate) requestAnimationFrame(() => requestAnimationFrame(() => b.classList.add("in")));
    });
  };
  moreBtn.addEventListener("click", () => {
    showAll = !showAll;
    moreBtn.textContent = showAll ? "Show fewer" : `Show all ${lb.length}`;
    drawCards(cardsEl, lastQ8, false);
  });
  setup("f8", {
    draw: (el, q, animate) => {
      lastQ8 = q;
      if (q && !showAll && lb.findIndex((r) => r.qb === q.name) >= 9) { showAll = true; moreBtn.textContent = "Show fewer"; }
      drawCards(el, q, animate);
    },
    table: () => [["QB", "Original team", "Left after", "Best there", "Best after", "Team", "Season", "Record"],
      lb.map((q) => [q.qb, q.original_team, yearLabel(q.last_year_with_original), signed(q.best_with_original), signed(q.best_epa_vs_league), q.best_team, q.best_season, q.record])],
    readout: (q) => {
      if (q.best_with_original === null) return `${who(q)} never had a starting season for his original team.`;
      if (!q.best_after) return `${who(q)} never had a starting season for a team other than ${q.original_team}.`;
      const later = q.best_after.epa_vs_league > q.best_with_original;
      return `${who(q)}: best with ${q.original_team} ${signed(q.best_with_original)}; best after leaving ${signed(q.best_after.epa_vs_league)} with ${q.best_after.team} in ${q.best_after.season}. ` +
        (later ? "His best season came after he left." : "His best season came with his original team.");
    },
  });

  // ---- 09 box scores: early strugglers who kept starting vs. QBs who were good early ---------------
  const b9 = F["9_box_scores"];
  const M9 = {
    completion_pct: { title: "Completion percentage by career year", fmt: (v) => pct(v, 1), val: (r) => r[2] / r[3] },
    yards_per_game: { title: "Passing yards per game by career year", fmt: (v) => v.toFixed(0), val: (r) => r[4] / r[1] },
    tds_per_game: { title: "Touchdown passes per game by career year", fmt: (v) => v.toFixed(2), val: (r) => r[5] / r[1] },
  };
  setup("f9", {
    draw: (el, q, animate, mode) => {
      const m = M9[mode];
      document.querySelector('[data-chart="f9"] [data-title]').textContent = m.title;
      const series = [
        { name: "Strugglers, kept starting", color: C.qb, endLabel: false, points: b9.strugglers.by_year.map((r) => ({ x: r.career_year, y: r[mode], extra: `(${r.qbs} QBs)` })) },
        { name: "Good early", color: C.neutral, endLabel: false, points: b9.good_early.by_year.map((r) => ({ x: r.career_year, y: r[mode], extra: `(${r.qbs} QBs)` })) },
      ];
      if (q) series.push({ name: q.name, color: C.compare, points: range(1, 8).map((y) => {
        const r = q.box.find((b) => b[0] === y);
        return { x: y, y: r && r[3] ? m.val(r) : null };
      }) });
      Charts.lines(el, { animate, xs: range(1, 8), xFmt: yrShort, yFmt: m.fmt, rightPad: q ? 130 : 24, series });
    },
    table: (mode) => [["Group", "Years", "QBs", "Completion %", "Yards per game", "TD passes per game"],
      [["Strugglers, kept starting", b9.strugglers], ["Good early", b9.good_early]].flatMap(([l, g]) => [
        [l, "Years 1–3", g.years_1_3.qbs, pct(g.years_1_3.completion_pct, 1), g.years_1_3.yards_per_game, g.years_1_3.tds_per_game],
        [l, "Year 4 on", g.year_4_plus.qbs, pct(g.year_4_plus.completion_pct, 1), g.year_4_plus.yards_per_game, g.year_4_plus.tds_per_game]])],
    readout: (q, mode) => {
      if (!q.box.length) return `${who(q)} never had a starting season.`;
      const agg = (rows) => {
        const g = rows.reduce((a, r) => a + r[1], 0), c = rows.reduce((a, r) => a + r[2], 0), at = rows.reduce((a, r) => a + r[3], 0);
        const y = rows.reduce((a, r) => a + r[4], 0), t = rows.reduce((a, r) => a + r[5], 0);
        return rows.length ? `${pct(c / at, 1)}, ${(y / g).toFixed(0)} yards, ${(t / g).toFixed(2)} TDs per game` : "no starting seasons";
      };
      const inGroup = b9.strugglers.names.includes(q.name) ? " He is one of the 25 strugglers who kept starting." : b9.good_early.names.includes(q.name) ? " He is one of the 29 who were good early." : "";
      return `${who(q)}: Years 1–3 ${agg(q.box.filter((r) => r[0] <= 3))}; Year 4 on ${agg(q.box.filter((r) => r[0] >= 4))} (starting seasons only).${inGroup}`;
    },
  });

  // ---- 10 early strugglers, and draft position ------------------------------------------------------
  const f10 = F["10_early_strugglers"], d10 = f10.strugglers_by_draft;
  const parts = (g) => [
    { name: "Later had an above-average season", n: g.above_average_later, color: C.qb, names: g.names_above_later },
    { name: "Started again, never above average", n: g.more_starts_never_above, color: C.neutral },
    { name: "Never started another season", n: g.no_more_starting_seasons, color: C.team, names: g.names_no_more_starts },
  ];
  const draftGroup = (q) => (q.draft_round === null || q.draft_round >= 4 ? 2 : q.draft_round === 1 ? 0 : 1);
  setup("f10", {
    draw: (el, q, animate, mode) => {
      const card = document.querySelector('[data-chart="f10"]');
      const inPool = q && q.full_class && q.early !== null;
      if (mode === "early") {
        card.querySelector("[data-title]").textContent = "What happened after Year 3";
        card.querySelector("[data-sub]").textContent = "85 QBs with a starting season in Years 1–3 (rookie classes 2000–2018)";
        Charts.stack100(el, { animate, rows: [
          { label: "Below average early", sub: `Years 1–3 · ${f10.below_average_early.qbs} QBs`, parts: parts(f10.below_average_early), on: inPool && q.early < 0 },
          { label: "Above average early", sub: `Years 1–3 · ${f10.above_average_early.qbs} QBs`, parts: parts(f10.above_average_early), on: inPool && q.early >= 0 },
        ] });
      } else {
        card.querySelector("[data-title]").textContent = "Early strugglers, by where they were drafted";
        card.querySelector("[data-sub]").textContent = "53 QBs who were below average in Years 1–3 (rookie classes 2000–2018). Hover a segment for the names.";
        const g = inPool && q.early < 0 ? draftGroup(q) : null;
        Charts.stack100(el, { animate, rows: [
          { label: "First round", sub: `${d10.round_1.qbs} QBs`, parts: parts(d10.round_1), on: g === 0 },
          { label: "Rounds 2–3", sub: `${d10.rounds_2_3.qbs} QBs`, parts: parts(d10.rounds_2_3), on: g === 1 },
          { label: "Round 4+ / undrafted", sub: `${d10.round_4_plus.qbs} QBs`, parts: parts(d10.round_4_plus), on: g === 2 },
        ] });
      }
    },
    table: (mode) => {
      const row = (l, g) => [l, g.qbs, g.above_average_later, g.more_starts_never_above, g.no_more_starting_seasons];
      const head = ["Group", "QBs", "Later above average", "Started again, never above", "Never started again"];
      return mode === "early"
        ? [head, [row("Below average in Years 1–3", f10.below_average_early), row("Above average in Years 1–3", f10.above_average_early)]]
        : [head, [row("First round", d10.round_1), row("Rounds 2–3", d10.rounds_2_3), row("Round 4+ / undrafted", d10.round_4_plus)]];
    },
    readout: (q) => {
      const pick = q.draft_round === null ? "undrafted" : `round ${q.draft_round}, pick ${q.draft_pick}`;
      if (q.early === null) return `${who(q)} (${pick}) had no starting season in Years 1–3, so he is not in this chart.`;
      const later = starting(q).some((r) => r[0] >= 4);
      const outcome = q.later_above_average ? "later had an above-average season" : later ? "started again but never had an above-average season" : "never started another season";
      return `${who(q)} (${pick}): ${q.early < 0 ? "below" : "above"} average in Years 1–3 (${signed(q.early)}), and ${outcome}.` +
        (q.full_class ? " His group is outlined." : " (His class is after 2018, so he is not counted in this chart.)");
    },
  });
}
