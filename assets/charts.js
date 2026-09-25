/* Small SVG chart helpers shared by the report and the dashboard.
   Every chart redraws to its container's width, has a hover tooltip, and can show its numbers
   as a table. Marks follow one spec: bars <= 24px with 4px rounded ends, 2px lines, 8px dots
   with a 2px white ring, hairline grid. Passing `animate: true` builds the chart in
   (bars grow, lines draw) the first time it scrolls into view. */

const Charts = (() => {
  const NS = "http://www.w3.org/2000/svg";

  function h(tag, attrs = {}, parent) {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null && v !== false) el.setAttribute(k, v);
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
    if (hgt < 0.5) return "";
    if (up) return `M${x},${y0}V${y1 + r}Q${x},${y1} ${x + r},${y1}H${x + w - r}Q${x + w},${y1} ${x + w},${y1 + r}V${y0}Z`;
    return `M${x},${y0}V${y1 - r}Q${x},${y1} ${x + r},${y1}H${x + w - r}Q${x + w},${y1} ${x + w},${y1 - r}V${y0}Z`;
  }
  function hbarPath(x0, y, x1, hgt, r = 4) {
    const right = x1 > x0, w = Math.abs(x1 - x0);
    r = Math.min(r, w, hgt / 2);
    if (w < 0.5) return "";
    if (right) return `M${x0},${y}H${x1 - r}Q${x1},${y} ${x1},${y + r}V${y + hgt - r}Q${x1},${y + hgt} ${x1 - r},${y + hgt}H${x0}Z`;
    return `M${x0},${y}H${x1 + r}Q${x1},${y} ${x1},${y + r}V${y + hgt - r}Q${x1},${y + hgt} ${x1 + r},${y + hgt}H${x0}Z`;
  }
  const luminance = (hex) => {
    const n = parseInt(hex.replace("#", ""), 16);
    return [n >> 16, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; })
      .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
  };

  // ---- responsive mount ------------------------------------------------------------------------
  function mount(el, draw, spec) {
    el._spec = spec;
    el._draw = draw;
    const render = (animate) => {
      el.innerHTML = "";
      const w = Math.max(280, el.clientWidth);
      const svg = el._draw(el, { ...el._spec, animate }, w);
      if (svg && animate) svg.classList.add("anim");
    };
    render(!!spec.animate);
    if (!el._ro) {
      let last = el.clientWidth;
      el._ro = new ResizeObserver(() => {
        if (Math.abs(el.clientWidth - last) > 2) { last = el.clientWidth; render(false); }
      });
      el._ro.observe(el);
    }
  }

  // ---- columns: one bar (or a stack) per x; `outline` marks a looked-up value ------------------
  function drawColumns(el, s, W) {
    const H = s.height || 280, m = { t: 30, r: 12, b: 44, l: 44 };
    const svg = h("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": s.aria || "" }, el);
    const total = (d) => (d.stack ? d.stack.reduce((a, p) => a + p.y, 0) : d.y);
    const xs = s.data.map((d) => d.x);
    const yMax = s.yMax ?? Math.max(...s.data.map(total)) * 1.12;
    const ticks = niceTicks(0, yMax, 4);
    const y = scale(0, ticks[ticks.length - 1], H - m.b, m.t);
    const band = (W - m.l - m.r) / xs.length;
    const bw = Math.min(24, band * 0.7);
    const bx = (i) => m.l + band * i + (band - bw) / 2;

    (s.regions || []).forEach((r) => {
      const i0 = xs.indexOf(r.from), i1 = r.to === undefined ? xs.length - 1 : xs.indexOf(r.to);
      if (i0 < 0) return;
      h("rect", { x: m.l + band * i0, y: m.t - 14, width: band * (i1 - i0 + 1), height: H - m.b - m.t + 14,
                  fill: r.fill || css("--c-qb-wash"), rx: 6, class: "band" }, svg);
      const lx = r.labelOutside ? m.l + band * (i1 + 1) + 10 : m.l + band * i0 + 8;
      if (r.label) text(svg, lx, m.t, r.label, "annot late");
    });
    const grid = h("g", { class: "grid" }, svg);
    ticks.forEach((t) => {
      h("line", { x1: m.l, x2: W - m.r, y1: y(t), y2: y(t) }, grid);
      text(svg, m.l - 8, y(t) + 4, s.yFmt ? s.yFmt(t) : t, "tick-label", { "text-anchor": "end" });
    });
    if (s.yTitle) text(svg, m.l - 36, m.t - 18, s.yTitle, "axis-title");
    const labelEvery = Math.ceil(xs.length / Math.max(1, Math.floor((W - m.l - m.r) / 26)));
    s.data.forEach((d, i) => {
      if (i % labelEvery === 0 || d.label || d.outline)
        text(svg, bx(i) + bw / 2, H - m.b + 16, d.xLabel ?? d.x, "tick-label", { "text-anchor": "middle" });
    });
    if (s.xTitle) text(svg, (W + m.l - m.r) / 2, H - 6, s.xTitle, "axis-title", { "text-anchor": "middle" });

    s.data.forEach((d, i) => {
      const parts = d.stack || [{ y: d.y, color: d.color || s.color || css("--c-qb") }];
      let base = 0;
      const top = parts.map((p) => p.y > 0).lastIndexOf(true);
      parts.forEach((p, k) => {
        if (p.y <= 0) return;
        const y0 = y(base) - (base > 0 ? 2 : 0), y1 = y(base + p.y);   // 2px surface gap between segments
        const path = k === top ? barPath(bx(i), y0, bw, y1) : `M${bx(i)},${y0}V${y1}H${bx(i) + bw}V${y0}Z`;
        h("path", { d: path, fill: p.color, class: "bar", style: `--i:${i}` }, svg);
        base += p.y;
      });
      if (d.outline) {
        h("rect", { x: bx(i) - 4, y: Math.min(y(total(d)), y(0)) - 4, width: bw + 8, height: Math.abs(y(0) - y(total(d))) + 8,
                    fill: "none", stroke: css("--c-compare"), "stroke-width": 2, rx: 6 }, svg);
      }
      if (d.label) text(svg, bx(i) + bw / 2, y(total(d)) - (d.outline ? 12 : 7), d.label, "direct-label late", { "text-anchor": "middle" });
      const hit = h("rect", { x: m.l + band * i, y: m.t, width: band, height: H - m.b - m.t, class: "hit" }, svg);
      hit.addEventListener("mousemove", (e) => showTip(s.tip(d), e));
      hit.addEventListener("mouseleave", hideTip);
    });
    h("line", { x1: m.l, x2: W - m.r, y1: y(0), y2: y(0), class: "baseline" }, svg);
    return svg;
  }

  // ---- lines: several series over the same x, crosshair tooltip ------------------------------------
  function drawLines(el, s, W) {
    const H = s.height || 290, m = { t: 24, r: s.rightPad ?? 96, b: 44, l: 52 };
    const svg = h("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": s.aria || "" }, el);
    const xs = s.xs;
    const all = s.series.flatMap((sr) => sr.points.filter((p) => p.y !== null).flatMap((p) => [p.y, p.lo ?? p.y, p.hi ?? p.y]));
    let [y0, y1] = s.yDomain || [Math.min(...all), Math.max(...all)];
    y0 = Math.min(y0, ...all); y1 = Math.max(y1, ...all);
    const ticks = niceTicks(y0, y1, s.yTicks || 4);
    y0 = ticks[0]; y1 = ticks[ticks.length - 1];
    const x = scale(xs[0], xs[xs.length - 1], m.l + 12, W - m.r);
    const y = scale(y0, y1, H - m.b, m.t);

    (s.bands || []).forEach((b) => {
      h("rect", { x: x(b.from) - 12, y: m.t - 6, width: x(b.to) - x(b.from) + 24, height: H - m.b - m.t + 6,
                  fill: b.fill || "rgba(122,133,148,.09)", rx: 6, class: "band" }, svg);
      if (b.label) text(svg, (x(b.from) + x(b.to)) / 2, m.t + 10, b.label, "annot-muted late", { "text-anchor": "middle" });
    });
    const grid = h("g", { class: "grid" }, svg);
    ticks.forEach((t) => {
      h("line", { x1: m.l, x2: W - m.r + 12, y1: y(t), y2: y(t) }, grid);
      text(svg, m.l - 8, y(t) + 4, s.yFmt(t), "tick-label", { "text-anchor": "end" });
    });
    if (s.zero && y0 < 0 && y1 > 0) {
      h("line", { x1: m.l, x2: W - m.r + 12, y1: y(0), y2: y(0), stroke: css("--ink-2"), "stroke-width": 1 }, svg);
      if (s.zeroLabel) text(svg, W - m.r + 12, y(0) - 6, s.zeroLabel, "annot-muted", { "text-anchor": "end" });
    }
    xs.forEach((v) => text(svg, x(v), H - m.b + 18, s.xFmt ? s.xFmt(v) : v, "tick-label", { "text-anchor": "middle" }));
    if (s.xTitle) text(svg, (W + m.l - m.r) / 2, H - 6, s.xTitle, "axis-title", { "text-anchor": "middle" });

    s.series.forEach((sr) => {
      const pts = sr.points.filter((p) => p.y !== null && p.y !== undefined);
      if (!pts.length) return;
      if (pts[0].lo !== undefined) {
        const up = pts.map((p) => `${x(p.x)},${y(p.hi)}`), dn = pts.slice().reverse().map((p) => `${x(p.x)},${y(p.lo)}`);
        h("polygon", { points: [...up, ...dn].join(" "), fill: sr.color, opacity: 0.12, class: "band" }, svg);
      }
      h("polyline", { points: pts.map((p) => `${x(p.x)},${y(p.y)}`).join(" "), fill: "none", stroke: sr.color,
                      "stroke-width": sr.width || 2, "stroke-linejoin": "round", "stroke-linecap": "round",
                      pathLength: 1, class: "line" }, svg);
      pts.forEach((p) => h("circle", { cx: x(p.x), cy: y(p.y), r: p.big ? 6 : 4, fill: p.hollow ? "#fff" : sr.color,
                                       stroke: p.hollow ? sr.color : "#fff", "stroke-width": 2, class: "dot" }, svg));
      const last = pts[pts.length - 1];
      if (sr.endLabel !== false && !s.noEndLabels) text(svg, x(last.x) + 12, y(last.y) + (sr.labelDy || 0) + 4, sr.name, "direct-label late");
    });
    (s.notes || []).forEach((n) => {
      const nx = x(n.x), ny = y(n.y);
      const g = h("g", { class: "late" }, svg);
      h("line", { x1: nx, x2: nx + (n.dx || 0), y1: ny + (n.dy > 0 ? 8 : -8), y2: ny + n.dy, stroke: css("--ink-2"), "stroke-width": 1 }, g);
      text(g, nx + (n.dx || 0), ny + n.dy + (n.dy > 0 ? 14 : -5), n.text, "annot", { "text-anchor": n.anchor || "middle" });
    });

    const cross = h("line", { y1: m.t, y2: H - m.b, stroke: css("--ink-2"), "stroke-width": 1, opacity: 0 }, svg);
    const hit = h("rect", { x: m.l, y: m.t, width: W - m.l - m.r + 12, height: H - m.b - m.t, class: "hit" }, svg);
    hit.addEventListener("mousemove", (e) => {
      const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
      const loc = pt.matrixTransform(svg.getScreenCTM().inverse());
      const xv = xs.reduce((a, b) => (Math.abs(x(b) - loc.x) < Math.abs(x(a) - loc.x) ? b : a));
      cross.setAttribute("x1", x(xv)); cross.setAttribute("x2", x(xv)); cross.setAttribute("opacity", 0.35);
      const rows = s.series.map((sr) => {
        const p = sr.points.find((q) => q.x === xv);
        return p && p.y !== null && p.y !== undefined
          ? `<div class="tt-row">${key(sr.color)}${sr.name}: <b>${s.yFmt(p.y)}</b>${p.extra ? ` <span class="tt-dim">${p.extra}</span>` : ""}</div>` : "";
      }).join("");
      showTip(`<b>${s.xFmt ? s.xFmt(xv) : xv}</b>${s.tipHead ? s.tipHead(xv) : ""}${rows}`, e);
    });
    hit.addEventListener("mouseleave", () => { hideTip(); cross.setAttribute("opacity", 0); });
    return svg;
  }

  // ---- paired bars: two values per row (e.g. before / after) around zero; rows clickable ----------
  function drawPairedBars(el, s, W) {
    const rowH = 44, bh = 11, m = { t: 26, r: 60, b: 38, l: Math.min(170, W * 0.32) };
    const H = m.t + m.b + rowH * s.rows.length;
    const svg = h("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": s.aria || "" }, el);
    const vals = s.rows.flatMap((r) => [r.a, r.b]);
    const ticks = niceTicks(Math.min(0, ...vals), Math.max(0, ...vals), 5);
    const x = scale(ticks[0], ticks[ticks.length - 1], m.l, W - m.r);
    const grid = h("g", { class: "grid" }, svg);
    ticks.forEach((t) => {
      h("line", { x1: x(t), x2: x(t), y1: m.t - 8, y2: H - m.b }, grid);
      text(svg, x(t), H - m.b + 16, s.xFmt(t), "tick-label", { "text-anchor": "middle" });
    });
    h("line", { x1: x(0), x2: x(0), y1: m.t - 8, y2: H - m.b, stroke: css("--ink-2"), "stroke-width": 1.2 }, svg);
    if (s.zeroLabel) text(svg, x(0) + 6, m.t - 12, s.zeroLabel, "annot-muted");
    if (s.xTitle) text(svg, (W + m.l - m.r) / 2, H - 4, s.xTitle, "axis-title", { "text-anchor": "middle" });
    s.rows.forEach((r, i) => {
      const top = m.t + rowH * i;
      const g = h("g", { class: `row${s.onClick ? " clickable" : ""}${r.on ? " on" : ""}` }, svg);
      h("rect", { x: 0, y: top + 2, width: W, height: rowH - 4, rx: 6, class: "row-hover" }, g);
      text(g, m.l - 12, top + rowH / 2 + 1, r.label, "row-label", { "text-anchor": "end" });
      if (r.sub) text(g, m.l - 12, top + rowH / 2 + 14, r.sub, "row-sub", { "text-anchor": "end" });
      [[r.a, s.aColor, top + rowH / 2 - bh - 1], [r.b, s.bColor, top + rowH / 2 + 1]].forEach(([v, c, yy]) => {
        h("path", { d: hbarPath(x(0), yy, x(v), bh, 3), fill: c, class: `hbar${v < 0 ? " left" : ""}`, style: `--i:${i}` }, g);
        text(g, x(v) + (v >= 0 ? 6 : -6), yy + bh - 1, s.xFmt(v), "row-sub late", { "text-anchor": v >= 0 ? "start" : "end" });
      });
      g.addEventListener("mousemove", (e) => showTip(s.tip(r), e));
      g.addEventListener("mouseleave", hideTip);
      if (s.onClick) g.addEventListener("click", () => { hideTip(); s.onClick(r); });
    });
    return svg;
  }

  // ---- 100% stacked horizontal bars ------------------------------------------------------------
  function drawStack100(el, s, W) {
    const rowH = 70, bh = 30, m = { t: 8, r: 12, b: 26, l: Math.min(200, W * 0.34) };
    const H = m.t + m.b + rowH * s.rows.length;
    const svg = h("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": s.aria || "" }, el);
    const x = scale(0, 1, m.l, W - m.r);
    [0, 0.25, 0.5, 0.75, 1].forEach((t) => text(svg, x(t), H - 6, `${t * 100}%`, "tick-label", { "text-anchor": "middle" }));
    s.rows.forEach((r, i) => {
      const top = m.t + rowH * i + (rowH - bh) / 2;
      text(svg, m.l - 14, top + 13, r.label, "row-label", { "text-anchor": "end" });
      if (r.sub) text(svg, m.l - 14, top + 28, r.sub, "row-sub", { "text-anchor": "end" });
      const total = r.parts.reduce((a, p) => a + p.n, 0);
      let acc = 0;
      r.parts.forEach((p, k) => {
        if (!p.n) return;
        const x0 = x(acc / total) + (k ? 1 : 0), x1 = x((acc + p.n) / total) - (k < r.parts.length - 1 ? 1 : 0);
        const first = k === 0, last = k === r.parts.length - 1;
        const rr = 4, w = x1 - x0;
        const d = `M${x0 + (first ? rr : 0)},${top}H${x1 - (last ? rr : 0)}${last ? `Q${x1},${top} ${x1},${top + rr}V${top + bh - rr}Q${x1},${top + bh} ${x1 - rr},${top + bh}` : `V${top + bh}`}H${x0 + (first ? rr : 0)}${first ? `Q${x0},${top + bh} ${x0},${top + bh - rr}V${top + rr}Q${x0},${top} ${x0 + rr},${top}` : `V${top}`}Z`;
        const seg = h("path", { d, fill: p.color, class: "hbar", style: `--i:${i * 3 + k}` }, svg);
        const label = `${p.n} (${Math.round((p.n / total) * 100)}%)`;
        if (w > label.length * 7 + 12)
          text(svg, x0 + w / 2, top + bh / 2 + 4, label, "seg-label late", { "text-anchor": "middle", fill: luminance(p.color) > 0.4 ? css("--ink") : "#fff" });
        seg.addEventListener("mousemove", (e) => showTip(`<b>${r.label}</b><br>${key(p.color)} ${p.name}: <b>${p.n}</b> of ${total} (${Math.round((p.n / total) * 100)}%)` +
          (p.names && p.names.length ? `<br><span class="tt-dim">${p.names.join(", ")}</span>` : ""), e));
        seg.addEventListener("mouseleave", hideTip);
        acc += p.n;
      });
      if (r.on) h("rect", { x: m.l - 4, y: top - 4, width: W - m.r - m.l + 8, height: bh + 8, rx: 7, fill: "none", stroke: css("--c-compare"), "stroke-width": 2 }, svg);
    });
    return svg;
  }

  // ---- donut: slices of a whole, with a legend that doubles as a hover target ---------------------
  // s.slices = [{label, n, color, names, on}], s.center = [big text, small text], s.legendEl = element for the legend
  function drawDonut(el, s, W) {
    const size = Math.min(W, 340), R = size / 2 - 8, r0 = R * 0.58, cx = size / 2, cy = size / 2;
    const svg = h("svg", { viewBox: `0 0 ${size} ${size}`, role: "img", "aria-label": s.aria || "", style: `max-width:${size}px;margin:0 auto` }, el);
    const total = s.slices.reduce((a, p) => a + p.n, 0);
    let a0 = -Math.PI / 2;
    const tip = (p) => `<b>${p.label}: ${p.n} QB${p.n === 1 ? "" : "s"}</b> (${Math.round((p.n / total) * 100)}%)` +
      (p.names && p.names.length ? `<br><span class="tt-dim">${p.names.join(", ")}</span>` : "");
    const paths = s.slices.map((p, i) => {
      const a1 = a0 + (p.n / total) * Math.PI * 2, gap = 0.012, large = a1 - a0 > Math.PI ? 1 : 0;
      const pt = (a, rr) => `${cx + rr * Math.cos(a)},${cy + rr * Math.sin(a)}`;
      const d = `M${pt(a0 + gap, R)}A${R},${R} 0 ${large} 1 ${pt(a1 - gap, R)}L${pt(a1 - gap, r0)}A${r0},${r0} 0 ${large} 0 ${pt(a0 + gap, r0)}Z`;
      const mid = (a0 + a1) / 2;
      const path = h("path", { d, fill: p.color, class: "slice dot",
                               stroke: p.on ? css("--c-compare") : "none", "stroke-width": p.on ? 3 : 0 }, svg);
      if (p.on) path.style.transform = `translate(${Math.cos(mid) * 6}px, ${Math.sin(mid) * 6}px)`;
      if (p.n / total > 0.07) {
        const [lx, ly] = [cx + ((R + r0) / 2) * Math.cos(mid), cy + ((R + r0) / 2) * Math.sin(mid)];
        text(svg, lx, ly + 4, `${Math.round((p.n / total) * 100)}%`, "seg-label late", { "text-anchor": "middle", fill: luminance(p.color) > 0.4 ? css("--ink") : "#fff" });
      }
      path.addEventListener("mousemove", (e) => showTip(tip(p), e));
      path.addEventListener("mouseleave", hideTip);
      a0 = a1;
      return path;
    });
    if (s.center) {
      text(svg, cx, cy + 2, s.center[0], "dial-value", { "text-anchor": "middle", style: "font-size:30px" });
      text(svg, cx, cy + 22, s.center[1], "dial-pct", { "text-anchor": "middle" });
    }
    if (s.legendEl) {
      s.legendEl.innerHTML = s.slices.map((p) => `<div class="${p.on ? "on" : ""}"><i style="background:${p.color}"></i><span>${p.label}</span><b>${p.n}</b></div>`).join("");
      [...s.legendEl.children].forEach((row, i) => {
        row.addEventListener("mousemove", (e) => { showTip(tip(s.slices[i]), e); paths[i].style.opacity = 0.8; });
        row.addEventListener("mouseleave", () => { hideTip(); paths[i].style.opacity = 1; });
      });
    }
    return svg;
  }

  // ---- table view -----------------------------------------------------------------------------
  function table(el, cols, rows) {
    const esc = (v) => String(v ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
    el.innerHTML = `<div class="table-wrap"><table class="data"><thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead>
      <tbody>${rows.map((r) => `<tr>${r.map((v) => `<td>${esc(v)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }

  return {
    h, text, css, showTip, hideTip, key, scale, niceTicks, barPath, table, luminance,
    columns: (el, s) => mount(el, drawColumns, s),
    lines: (el, s) => mount(el, drawLines, s),
    pairedBars: (el, s) => mount(el, drawPairedBars, s),
    stack100: (el, s) => mount(el, drawStack100, s),
    donut: (el, s) => mount(el, drawDonut, s),
  };
})();
