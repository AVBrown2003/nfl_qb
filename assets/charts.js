/* Small SVG chart helpers shared by the report and the dashboard.
   Every chart redraws to its container's width, has a hover tooltip, and can show its numbers
   as a table. Marks follow one spec: bars <= 24px with 4px rounded ends, 2px lines, 8px dots
   with a 2px white ring, hairline grid. */

const Charts = (() => {
  const NS = "http://www.w3.org/2000/svg";

  function h(tag, attrs = {}, parent) {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) el.setAttribute(k, v);
    if (parent) parent.appendChild(el);
    return el;
  }
  function text(parent, x, y, str, cls, attrs = {}) {
    const t = h("text", { x, y, class: cls, ...attrs }, parent);
    t.textContent = str;
    return t;
  }
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  // ---- tooltip -------------------------------------------------------------------------------
  let tip;
  function showTip(html, evt) {
    if (!tip) {
      tip = document.createElement("div");
      tip.className = "tooltip";
      tip.setAttribute("role", "status");
      document.body.appendChild(tip);
    }
    tip.innerHTML = html;
    tip.classList.add("show");
    const pad = 14, r = tip.getBoundingClientRect();
    let x = evt.clientX + pad, y = evt.clientY + pad;
    if (x + r.width > innerWidth - 8) x = evt.clientX - r.width - pad;
    if (y + r.height > innerHeight - 8) y = evt.clientY - r.height - pad;
    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
  }
  function hideTip() { if (tip) tip.classList.remove("show"); }
  const key = (color) => `<span class="tt-key" style="background:${color}"></span>`;

  // ---- scales and ticks ------------------------------------------------------------------------
  const scale = (d0, d1, r0, r1) => (v) => r0 + ((v - d0) / (d1 - d0 || 1)) * (r1 - r0);
  function niceTicks(min, max, count = 5) {
    const span = max - min || 1;
    const step0 = span / count, mag = 10 ** Math.floor(Math.log10(step0));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) || 10 * mag;
    const out = [];
    const lo = Math.floor(min / step + 1e-9) * step, hi = Math.ceil(max / step - 1e-9) * step;
    for (let v = lo; v <= hi + step / 2; v += step) out.push(+v.toFixed(10));
    return out;
  }
  // a bar with a 4px rounded data end and a square base
  function barPath(x, y0, w, y1, r = 4) {
    const up = y1 < y0, hgt = Math.abs(y1 - y0);
    r = Math.min(r, hgt, w / 2);
    if (hgt === 0) return "";
    if (up) return `M${x},${y0}V${y1 + r}Q${x},${y1} ${x + r},${y1}H${x + w - r}Q${x + w},${y1} ${x + w},${y1 + r}V${y0}Z`;
    return `M${x},${y0}V${y1 - r}Q${x},${y1} ${x + r},${y1}H${x + w - r}Q${x + w},${y1} ${x + w},${y1 - r}V${y0}Z`;
  }
  function hbarPath(x0, y, x1, hgt, r = 4) {
    const right = x1 > x0, w = Math.abs(x1 - x0);
    r = Math.min(r, w, hgt / 2);
    if (w === 0) return "";
    if (right) return `M${x0},${y}H${x1 - r}Q${x1},${y} ${x1},${y + r}V${y + hgt - r}Q${x1},${y + hgt} ${x1 - r},${y + hgt}H${x0}Z`;
    return `M${x0},${y}H${x1 + r}Q${x1},${y} ${x1},${y + r}V${y + hgt - r}Q${x1},${y + hgt} ${x1 + r},${y + hgt}H${x0}Z`;
  }

  // ---- responsive mount --------------------------------------------------------------------------
  function mount(el, draw, spec) {
    el._spec = spec;
    el._draw = draw;
    const render = () => {
      el.innerHTML = "";
      const w = Math.max(280, el.clientWidth);
      el._draw(el, el._spec, w);
    };
    render();
    if (!el._ro) {
      let last = el.clientWidth;
      el._ro = new ResizeObserver(() => {
        if (Math.abs(el.clientWidth - last) > 2) { last = el.clientWidth; render(); }
      });
      el._ro.observe(el);
    }
  }

  // ---- columns: one bar per x (optionally highlighted) --------------------------------------------
  function drawColumns(el, s, W) {
    const H = s.height || 270, m = { t: 26, r: 12, b: 42, l: 44 };
    const svg = h("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": s.aria || "" }, el);
    const xs = s.data.map((d) => d.x);
    const yMax = s.yMax ?? Math.max(...s.data.map((d) => d.y)) * 1.12;
    const ticks = niceTicks(0, yMax, 4);
    const y = scale(0, ticks[ticks.length - 1], H - m.b, m.t);
    const band = (W - m.l - m.r) / xs.length;
    const bw = Math.min(24, band * 0.7);
    const bx = (i) => m.l + band * i + (band - bw) / 2;

    const grid = h("g", { class: "grid" }, svg);
    ticks.forEach((t) => {
      h("line", { x1: m.l, x2: W - m.r, y1: y(t), y2: y(t) }, grid);
      text(svg, m.l - 8, y(t) + 4, s.yFmt ? s.yFmt(t) : t, "tick-label", { "text-anchor": "end" });
    });
    if (s.yTitle) text(svg, m.l - 36, m.t - 12, s.yTitle, "axis-title");
    const labelEvery = Math.ceil(xs.length / Math.floor((W - m.l - m.r) / 26));
    s.data.forEach((d, i) => {
      if (i % labelEvery === 0 || d.label)
        text(svg, bx(i) + bw / 2, H - m.b + 16, d.xLabel ?? d.x, "tick-label", { "text-anchor": "middle" });
    });
    if (s.xTitle) text(svg, (W + m.l - m.r) / 2, H - 6, s.xTitle, "axis-title", { "text-anchor": "middle" });

    // shaded region (e.g. "Year 5 or later")
    (s.regions || []).forEach((r) => {
      const i0 = xs.indexOf(r.from), i1 = r.to === undefined ? xs.length - 1 : xs.indexOf(r.to);
      if (i0 < 0) return;
      h("rect", { x: m.l + band * i0, y: m.t - 6, width: band * (i1 - i0 + 1), height: H - m.b - m.t + 6,
                  fill: r.fill || css("--c-qb-wash"), rx: 6 }, svg);
      if (r.label && r.labelOutside) text(svg, m.l + band * (i1 + 1) + 10, m.t + 8, r.label, "annot");
      else if (r.label) text(svg, m.l + band * i0 + 8, m.t + 8, r.label, "annot");
    });

    s.data.forEach((d, i) => {
      const color = d.color || s.color || css("--c-qb");
      if (d.y > 0) h("path", { d: barPath(bx(i), y(0), bw, y(d.y)), fill: color }, svg);
      if (d.label) text(svg, bx(i) + bw / 2, y(d.y) - 7, d.label, "direct-label", { "text-anchor": "middle" });
      const hit = h("rect", { x: m.l + band * i, y: m.t, width: band, height: H - m.b - m.t, class: "hit" }, svg);
      hit.addEventListener("mousemove", (e) => showTip(s.tip(d), e));
      hit.addEventListener("mouseleave", hideTip);
    });
    h("line", { x1: m.l, x2: W - m.r, y1: y(0), y2: y(0), class: "baseline" }, svg);
  }

  // ---- lines: several series over the same x, crosshair tooltip ------------------------------------
  function drawLines(el, s, W) {
    const H = s.height || 280, m = { t: 22, r: s.rightPad ?? 96, b: 42, l: 48 };
    const svg = h("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": s.aria || "" }, el);
    const xs = s.xs;
    const all = s.series.flatMap((sr) => sr.points.flatMap((p) => [p.y, p.lo ?? p.y, p.hi ?? p.y]));
    let [y0, y1] = s.yDomain || [Math.min(...all), Math.max(...all)];
    const ticks = niceTicks(y0, y1, 4);
    y0 = Math.min(y0, ticks[0]); y1 = Math.max(y1, ticks[ticks.length - 1]);
    const x = scale(xs[0], xs[xs.length - 1], m.l + 10, W - m.r);
    const y = scale(y0, y1, H - m.b, m.t);

    (s.bands || []).forEach((b) => {
      h("rect", { x: x(b.from) - 10, y: m.t - 4, width: x(b.to) - x(b.from) + 20, height: H - m.b - m.t + 4,
                  fill: b.fill || "rgba(122,133,148,.10)", rx: 6 }, svg);
      if (b.label) text(svg, (x(b.from) + x(b.to)) / 2, m.t + 10, b.label, "annot-muted", { "text-anchor": "middle" });
    });
    const grid = h("g", { class: "grid" }, svg);
    ticks.forEach((t) => {
      h("line", { x1: m.l, x2: W - m.r + 10, y1: y(t), y2: y(t) }, grid);
      text(svg, m.l - 8, y(t) + 4, s.yFmt(t), "tick-label", { "text-anchor": "end" });
    });
    if (s.zero && y0 < 0 && y1 > 0) h("line", { x1: m.l, x2: W - m.r + 10, y1: y(0), y2: y(0), stroke: css("--line-2"), "stroke-width": 1.5 }, svg);
    xs.forEach((v) => text(svg, x(v), H - m.b + 18, s.xFmt ? s.xFmt(v) : v, "tick-label", { "text-anchor": "middle" }));
    if (s.xTitle) text(svg, (W + m.l - m.r) / 2, H - 6, s.xTitle, "axis-title", { "text-anchor": "middle" });

    s.series.forEach((sr) => {
      const pts = sr.points.filter((p) => p.y !== null && p.y !== undefined);
      if (pts[0] && pts[0].lo !== undefined) {
        const up = pts.map((p) => `${x(p.x)},${y(p.hi)}`), dn = pts.slice().reverse().map((p) => `${x(p.x)},${y(p.lo)}`);
        h("polygon", { points: [...up, ...dn].join(" "), fill: sr.color, opacity: 0.12 }, svg);
      }
      h("polyline", { points: pts.map((p) => `${x(p.x)},${y(p.y)}`).join(" "), fill: "none", stroke: sr.color,
                      "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round",
                      "stroke-dasharray": sr.dash || null }, svg);
      pts.forEach((p) => h("circle", { cx: x(p.x), cy: y(p.y), r: p.big ? 6 : 4, fill: sr.color, stroke: "#fff", "stroke-width": 2 }, svg));
      const last = pts[pts.length - 1];
      if (!s.noEndLabels) text(svg, x(last.x) + 12, y(last.y) + (sr.labelDy || 0) + 4, sr.name, "direct-label");
    });
    (s.notes || []).forEach((n) => {
      const nx = x(n.x), ny = y(n.y);
      h("line", { x1: nx, x2: nx + (n.dx || 0), y1: ny + (n.dy > 0 ? 8 : -8), y2: ny + n.dy, stroke: css("--ink-2"), "stroke-width": 1 }, svg);
      text(svg, nx + (n.dx || 0), ny + n.dy + (n.dy > 0 ? 14 : -5), n.text, "annot", { "text-anchor": n.anchor || "middle" });
    });

    // crosshair
    const cross = h("line", { y1: m.t, y2: H - m.b, stroke: css("--ink-2"), "stroke-width": 1, opacity: 0 }, svg);
    const hit = h("rect", { x: m.l, y: m.t, width: W - m.l - m.r + 10, height: H - m.b - m.t, class: "hit" }, svg);
    hit.addEventListener("mousemove", (e) => {
      const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
      const loc = pt.matrixTransform(svg.getScreenCTM().inverse());
      const xv = xs.reduce((a, b) => (Math.abs(x(b) - loc.x) < Math.abs(x(a) - loc.x) ? b : a));
      cross.setAttribute("x1", x(xv)); cross.setAttribute("x2", x(xv)); cross.setAttribute("opacity", 0.35);
      const rows = s.series.map((sr) => {
        const p = sr.points.find((q) => q.x === xv);
        return p && p.y !== null ? `<div class="tt-row">${key(sr.color)}${sr.name}: <b>${s.yFmt(p.y)}</b>${p.extra ? ` <span class="tt-dim">${p.extra}</span>` : ""}</div>` : "";
      }).join("");
      showTip(`<b>${s.xFmt ? s.xFmt(xv) : xv}</b>${s.tipHead ? s.tipHead(xv) : ""}${rows}`, e);
    });
    hit.addEventListener("mouseleave", () => { hideTip(); cross.setAttribute("opacity", 0); });
  }

  // ---- dumbbell: two values per row (before -> after), rows are clickable --------------------------
  function drawDumbbell(el, s, W) {
    const rowH = s.rowH || 30, m = { t: 30, r: 16, b: 34, l: Math.min(190, W * 0.36) };
    const H = m.t + m.b + rowH * s.rows.length;
    const svg = h("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": s.aria || "" }, el);
    const vals = s.rows.flatMap((r) => [r.a, r.b]);
    const ticks = niceTicks(Math.min(0, ...vals), Math.max(...vals), 5);
    const x = scale(ticks[0], ticks[ticks.length - 1], m.l, W - m.r);
    const grid = h("g", { class: "grid" }, svg);
    ticks.forEach((t) => {
      h("line", { x1: x(t), x2: x(t), y1: m.t - 6, y2: H - m.b }, grid);
      text(svg, x(t), H - m.b + 16, s.xFmt(t), "tick-label", { "text-anchor": "middle" });
    });
    if (ticks[0] < 0) h("line", { x1: x(0), x2: x(0), y1: m.t - 6, y2: H - m.b, stroke: css("--ink-2"), "stroke-width": 1.2 }, svg);
    if (s.xTitle) text(svg, (W + m.l - m.r) / 2, H - 4, s.xTitle, "axis-title", { "text-anchor": "middle" });
    if (s.zeroLabel && ticks[0] < 0) text(svg, x(0) + 5, m.t - 12, s.zeroLabel, "annot-muted");

    s.rows.forEach((r, i) => {
      const cy = m.t + rowH * i + rowH / 2;
      const g = h("g", { class: `row${s.onClick ? " clickable" : ""}` }, svg);
      h("rect", { x: 0, y: cy - rowH / 2, width: W, height: rowH, rx: 6, class: "row-hover" }, g);
      text(g, m.l - 12, cy + 1, r.label, "row-label", { "text-anchor": "end" });
      if (r.sub) text(g, m.l - 12, cy + 13, r.sub, "row-sub", { "text-anchor": "end" });
      h("line", { x1: x(r.a), x2: x(r.b), y1: cy, y2: cy, stroke: css("--line-2"), "stroke-width": 2 }, g);
      h("circle", { cx: x(r.a), cy, r: 5, fill: s.aColor, stroke: "#fff", "stroke-width": 2 }, g);
      h("circle", { cx: x(r.b), cy, r: 6, fill: s.bColor, stroke: "#fff", "stroke-width": 2 }, g);
      g.addEventListener("mousemove", (e) => showTip(s.tip(r), e));
      g.addEventListener("mouseleave", hideTip);
      if (s.onClick) g.addEventListener("click", () => { hideTip(); s.onClick(r); });
    });
  }

  // ---- horizontal bars around zero -------------------------------------------------------------
  function drawHBars(el, s, W) {
    const rowH = 54, m = { t: 14, r: 64, b: 34, l: Math.min(210, W * 0.4) };
    const H = m.t + m.b + rowH * s.rows.length;
    const svg = h("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": s.aria || "" }, el);
    const vals = s.rows.map((r) => r.value);
    const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
    const ticks = niceTicks(lo, hi, 4);
    const x = scale(ticks[0], ticks[ticks.length - 1], m.l, W - m.r);
    const grid = h("g", { class: "grid" }, svg);
    ticks.forEach((t) => {
      h("line", { x1: x(t), x2: x(t), y1: m.t, y2: H - m.b }, grid);
      text(svg, x(t), H - m.b + 16, s.xFmt(t), "tick-label", { "text-anchor": "middle" });
    });
    h("line", { x1: x(s.base ?? 0), x2: x(s.base ?? 0), y1: m.t, y2: H - m.b, stroke: css("--ink-2"), "stroke-width": 1.2 }, svg);
    s.rows.forEach((r, i) => {
      const top = m.t + rowH * i + (rowH - 22) / 2;
      const g = h("g", {}, svg);
      h("rect", { x: 0, y: m.t + rowH * i + 4, width: W, height: rowH - 8, rx: 6, class: "row-hover" }, g);
      g.setAttribute("class", "row");
      text(g, m.l - 12, top + 10, r.label, "row-label", { "text-anchor": "end" });
      if (r.sub) text(g, m.l - 12, top + 24, r.sub, "row-sub", { "text-anchor": "end" });
      h("path", { d: hbarPath(x(s.base ?? 0), top, x(r.value), 22), fill: r.color }, g);
      const right = r.value >= (s.base ?? 0);
      text(g, x(r.value) + (right ? 8 : -8), top + 15, s.xFmt(r.value), "direct-label", { "text-anchor": right ? "start" : "end" });
      g.addEventListener("mousemove", (e) => showTip(s.tip(r), e));
      g.addEventListener("mouseleave", hideTip);
    });
    if (s.xTitle) text(svg, (W + m.l - m.r) / 2, H - 4, s.xTitle, "axis-title", { "text-anchor": "middle" });
  }

  // ---- table view -----------------------------------------------------------------------------
  function table(el, cols, rows) {
    const esc = (v) => String(v ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
    el.innerHTML = `<div class="table-wrap"><table class="data"><thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead>
      <tbody>${rows.map((r) => `<tr>${r.map((v) => `<td>${esc(v)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }

  return {
    h, text, css, showTip, hideTip, key, scale, niceTicks, barPath, table,
    columns: (el, s) => mount(el, drawColumns, s),
    lines: (el, s) => mount(el, drawLines, s),
    dumbbell: (el, s) => mount(el, drawDumbbell, s),
    hbars: (el, s) => mount(el, drawHBars, s),
  };
})();
