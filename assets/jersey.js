/* The career explorer's centerpiece: the back of the jersey a QB wore that season (team colors
   for that era, his name and number) under a spotlight, with six stat dials around it. Each dial
   fills to the share of all starting seasons (8+ starts) in the data that this season beat; the
   long tick on each dial marks the 50th percentile, and the percentile is green when it beats at
   least half of them and red when it doesn't. */

const Jersey = (() => {
  const { h, text } = Charts;
  const CX = 320, CY = 300, R = 196, W = 640, H = 600;
  const SEG = 60, GAP = 12, SPAN = SEG - GAP;   // degrees per dial, gap between dials
  const DIALS = [
    { key: "win_pct", label: "Record", value: (s) => (s.starts ? s.record : "No starts"), sub: () => "as starter" },
    { key: "passing_yards", label: "Passing yards", value: (s) => s.passing_yards.toLocaleString(), sub: () => "that season" },
    { key: "pass_tds", label: "TD passes", value: (s) => String(s.pass_tds), sub: () => "that season" },
    { key: "turnovers", label: "Turnovers", value: (s) => String(s.turnovers), sub: () => "lower is better" },
    { key: "td_drive_pct", label: "TD drives", value: (s) => pct(s.td_drive_pct, 0), sub: () => "of his drives" },
    { key: "yards_per_attempt", label: "Yards / pass", value: (s) => (s.yards_per_attempt ?? 0).toFixed(1), sub: () => "per attempt" },
  ];
  const pct = (v, d) => (v === null || v === undefined ? "–" : `${(v * 100).toFixed(d)}%`);
  const ordinal = (n) => {
    const s = ["th", "st", "nd", "rd"], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  function polar(deg, r) {
    const a = (deg * Math.PI) / 180;
    return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
  }
  // an arc from angle a0 to a1 (degrees), drawn in whichever direction that goes
  function arc(a0, a1, r) {
    const [x0, y0] = polar(a0, r), [x1, y1] = polar(a1, r);
    return `M${x0},${y0}A${r},${r} 0 ${Math.abs(a1 - a0) > 180 ? 1 : 0} ${a1 > a0 ? 1 : 0} ${x1},${y1}`;
  }
  function luminance(hex) {
    const n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => {
      v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  const mix = (hex, to, a) => {
    const n = parseInt(hex.slice(1), 16), t = parseInt(to.slice(1), 16);
    const ch = (v, s) => Math.round(((v >> s) & 255) + (((t >> s) & 255) - ((v >> s) & 255)) * a);
    return `#${[16, 8, 0].map((s) => ch(n, s).toString(16).padStart(2, "0")).join("")}`;
  };
  // dial color: the jersey color, unless it is too light to see on white
  const accent = (j) => (luminance(j.body) < 0.6 ? j.body : luminance(j.number) < 0.6 ? j.number : "#013369");
  // stitching shows dark on a light jersey and light on a dark one
  const stitch = (j) => (luminance(j.body) > 0.5 ? "rgba(10,21,38,.28)" : "rgba(255,255,255,.32)");


  // jersey (back view) in a 240 x 262 box
  const SHAPE = "M72,8 Q120,24 168,8 L226,34 Q236,38 238,48 L246,108 L204,118 L200,248 Q120,262 40,248 L36,118 L-6,108 L2,48 Q4,38 14,34 Z";
  const SLEEVE_L = "M72,8 L14,34 Q4,38 2,48 L-6,108 L36,118 L40,44 Q52,22 72,8 Z";
  const SLEEVE_R = "M168,8 L226,34 Q236,38 238,48 L246,108 L204,118 L200,44 Q188,22 168,8 Z";

  function build(el) {
    el.innerHTML = "";
    const svg = h("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Jersey and season stat dials" }, el);
    const defs = h("defs", {}, svg);
    const stops = (g, list) => list.forEach(([o, c, a = 1]) => h("stop", { offset: o, "stop-color": c, "stop-opacity": a }, g));
    // the stage: a navy disc under a spotlight
    stops(h("radialGradient", { id: "jx-stage", cx: 0.5, cy: 0.42, r: 0.62 }, defs), [[0, "#3a6299"], [0.5, "#123060"], [1, "#04122b"]]);
    stops(h("radialGradient", { id: "jx-spot", cx: 0.5, cy: 0, r: 0.75 }, defs), [[0, "#ffffff", 0.42], [0.45, "#ffffff", 0.1], [1, "#ffffff", 0]]);
    const halo = h("radialGradient", { id: "jx-halo", cx: 0.5, cy: 0.5, r: 0.5 }, defs);
    const haloStops = [h("stop", { offset: 0, "stop-opacity": 0.95 }, halo), h("stop", { offset: 0.62, "stop-opacity": 0.5 }, halo), h("stop", { offset: 1, "stop-opacity": 0 }, halo)];
    stops(h("linearGradient", { id: "jx-rim", x1: 0, y1: 0, x2: 0, y2: 1 }, defs), [[0, "#ffffff"], [0.5, "#aab3bf"], [1, "#e7ebf0"]]);
    // fabric: rounded torso, light from above, mesh
    stops(h("linearGradient", { id: "jx-round", x1: 0, y1: 0, x2: 1, y2: 0 }, defs),
      [[0, "#000", 0.32], [0.18, "#000", 0.08], [0.42, "#fff", 0.1], [0.58, "#fff", 0.06], [0.82, "#000", 0.08], [1, "#000", 0.32]]);
    stops(h("linearGradient", { id: "jx-fall", x1: 0, y1: 0, x2: 0, y2: 1 }, defs), [[0, "#fff", 0.22], [0.3, "#fff", 0], [0.8, "#000", 0.06], [1, "#000", 0.22]]);
    const mesh = h("pattern", { id: "jx-mesh", width: 5, height: 5, patternUnits: "userSpaceOnUse" }, defs);
    h("circle", { cx: 2.5, cy: 2.5, r: 0.9, fill: "#000", "fill-opacity": 0.12 }, mesh);
    stops(h("linearGradient", { id: "jx-sweep", x1: 0, y1: 0, x2: 1, y2: 0 }, defs), [[0, "#fff", 0], [0.5, "#fff", 0.55], [1, "#fff", 0]]);
    stops(h("linearGradient", { id: "jx-numfill", x1: 0, y1: 0, x2: 0, y2: 1 }, defs), [[0, "#fff", 0.35], [0.5, "#fff", 0], [1, "#000", 0.15]]);
    const clip = h("clipPath", { id: "jx-clip" }, defs);
    h("path", { d: SHAPE }, clip);
    const discClip = h("clipPath", { id: "jx-disc" }, defs);
    h("circle", { cx: CX, cy: CY, r: R - 24 }, discClip);
    // the glow's box is the whole drawing, so it is never clipped on a thin, curved arc
    const glow = h("filter", { id: "jx-glow", filterUnits: "userSpaceOnUse", x: 0, y: 0, width: W, height: H }, defs);
    h("feGaussianBlur", { in: "SourceGraphic", stdDeviation: 4, result: "b" }, glow);
    const gm = h("feMerge", {}, glow);
    h("feMergeNode", { in: "b" }, gm); h("feMergeNode", { in: "SourceGraphic" }, gm);
    const drop = h("filter", { id: "jx-drop", x: "-20%", y: "-20%", width: "140%", height: "150%" }, defs);
    h("feDropShadow", { dx: 0, dy: 10, stdDeviation: 9, "flood-color": "#000814", "flood-opacity": 0.55 }, drop);
    const numShadow = h("filter", { id: "jx-numshadow", x: "-10%", y: "-10%", width: "120%", height: "130%" }, defs);
    h("feDropShadow", { dx: 0, dy: 3, stdDeviation: 1.5, "flood-color": "#000", "flood-opacity": 0.35 }, numShadow);

    const parts = {};
    // stage
    h("circle", { cx: CX, cy: CY, r: R - 18, fill: "none", stroke: "url(#jx-rim)", "stroke-width": 6 }, svg);
    h("circle", { cx: CX, cy: CY, r: R - 21, fill: "url(#jx-stage)" }, svg);
    const stage = h("g", { "clip-path": "url(#jx-disc)" }, svg);
    for (let i = -3; i <= 3; i++) h("line", { x1: CX + i * 44, x2: CX + i * 44, y1: CY - 180, y2: CY + 180, stroke: "#fff", "stroke-opacity": i ? 0.06 : 0.1, "stroke-width": i ? 1 : 2 }, stage);
    for (let i = -8; i <= 8; i++) {   // hash marks
      h("line", { x1: CX - 26, x2: CX - 18, y1: CY + i * 22, y2: CY + i * 22, stroke: "#fff", "stroke-opacity": 0.07 }, stage);
      h("line", { x1: CX + 18, x2: CX + 26, y1: CY + i * 22, y2: CY + i * 22, stroke: "#fff", "stroke-opacity": 0.07 }, stage);
    }
    parts.halo = h("circle", { cx: CX, cy: CY - 8, r: 172, fill: "url(#jx-halo)" }, stage);
    h("ellipse", { cx: CX, cy: CY - 150, rx: 190, ry: 230, fill: "url(#jx-spot)" }, stage);
    h("ellipse", { cx: CX, cy: CY + 128, rx: 104, ry: 12, fill: "#000814", "fill-opacity": 0.45 }, stage);   // floor shadow

    // jersey
    const g = h("g", { transform: `translate(${CX - 120}, ${CY - 142})` }, svg);
    const jersey = h("g", { class: "jersey", filter: "url(#jx-drop)" }, g);
    parts.body = h("path", { d: SHAPE, class: "jersey-body" }, jersey);
    const fabric = h("g", { "clip-path": "url(#jx-clip)", "pointer-events": "none" }, jersey);
    parts.sleeves = [h("path", { d: SLEEVE_L, class: "jersey-sleeve" }, fabric), h("path", { d: SLEEVE_R, class: "jersey-sleeve" }, fabric)];
    parts.stripes = [
      h("path", { d: "M-6,86 L38,95 L37.5,104 L-7,95 Z", class: "jersey-trim" }, fabric),
      h("path", { d: "M246,86 L202,95 L202.5,104 L247,95 Z", class: "jersey-trim" }, fabric),
    ];
    parts.pinstripes = [
      h("path", { d: "M-7,98 L37.5,107 L37.4,110 L-7.4,101 Z", class: "jersey-pin" }, fabric),
      h("path", { d: "M247,98 L202.5,107 L202.6,110 L247.4,101 Z", class: "jersey-pin" }, fabric),
    ];
    h("rect", { x: -10, y: 0, width: 260, height: 262, fill: "url(#jx-mesh)" }, fabric);
    h("rect", { x: -10, y: 0, width: 260, height: 262, fill: "url(#jx-round)" }, fabric);
    h("rect", { x: -10, y: 0, width: 260, height: 262, fill: "url(#jx-fall)" }, fabric);
    // seams and stitching
    parts.seams = [
      h("path", { d: "M74,10 Q54,52 38,112", class: "jersey-seam" }, fabric),
      h("path", { d: "M166,10 Q186,52 202,112", class: "jersey-seam" }, fabric),
    ];
    parts.stitches = [
      "M44,242 Q120,255 196,242",          // hem
      "M-4,103 L36,112", "M244,103 L204,112",   // cuffs
      "M78,13 Q120,28 162,13",              // collar
    ].map((d) => h("path", { d, class: "jersey-stitch" }, fabric));
    parts.collar = h("path", { d: "M72,8 Q120,24 168,8 Q120,36 72,8 Z", class: "jersey-trim" }, jersey);
    parts.collarPin = h("path", { d: "M80,12 Q120,26 160,12", fill: "none", "stroke-width": 1.6, class: "jersey-collar-pin" }, jersey);
    parts.rim = h("path", { d: SHAPE, fill: "none", "stroke-width": 1.6 }, jersey);   // rim light, stronger on dark jerseys
    // name, arched across the shoulders
    h("path", { id: "jx-name-arc", d: "M40,80 Q120,56 200,80", fill: "none" }, defs);
    parts.name = h("text", { class: "jersey-name", "text-anchor": "middle", style: "font: 700 23px var(--font-label); letter-spacing: .16em" }, jersey);
    parts.namePath = h("textPath", { href: "#jx-name-arc", startOffset: "50%" }, parts.name);
    // number: shadow, outline, fill, and a soft shine on the twill
    const num = h("g", { class: "jersey-num-g", filter: "url(#jx-numshadow)" }, jersey);
    parts.numOutline = text(num, 120, 208, "", "jersey-num-outline", { "text-anchor": "middle", "stroke-width": 9, "stroke-linejoin": "round", style: "font: 700 120px var(--font-label)" });
    parts.num = text(num, 120, 208, "", "jersey-num", { "text-anchor": "middle", style: "font: 700 120px var(--font-label)" });
    parts.numShine = text(num, 120, 208, "", "jersey-num-shine", { "text-anchor": "middle", fill: "url(#jx-numfill)", style: "font: 700 120px var(--font-label)" });
    // a light that sweeps across the jersey when the season changes
    const sweepG = h("g", { "clip-path": "url(#jx-clip)", "pointer-events": "none" }, jersey);
    parts.sweep = h("rect", { x: -120, y: -20, width: 90, height: 320, fill: "url(#jx-sweep)", class: "jersey-sweep", transform: "skewX(-18)" }, sweepG);
    parts.jersey = jersey;
    parts.caption = text(svg, CX, CY + 152, "", "dial-caption", { "text-anchor": "middle" });

    // dials
    parts.dials = DIALS.map((d, i) => {
      const mid = -90 + SEG * i, a0 = mid - SPAN / 2, a1 = mid + SPAN / 2;
      // which end the fill starts from: the dials along the top and bottom fill left to right, the
      // side dials fill bottom to top, like a gauge
      const side = Math.abs(Math.cos((mid * Math.PI) / 180)) > 0.5;
      const [p0, p1] = [polar(a0, R), polar(a1, R)];
      const fromA0 = side ? p0[1] >= p1[1] : p0[0] <= p1[0];
      const start = fromA0 ? a0 : a1, end = fromA0 ? a1 : a0, dir = fromA0 ? 1 : -1;
      const dg = h("g", { class: "dial" }, svg);
      // gauge ticks every 10 percentiles; the long one is the 50th
      for (let k = 0; k <= 10; k++) {
        const a = a0 + (SPAN * k) / 10, [x1, y1] = polar(a, R + 13), [x2, y2] = polar(a, R + (k === 5 ? 23 : 17));
        h("line", { x1, y1, x2, y2, class: k === 5 ? "dial-tick avg" : "dial-tick" }, dg);
      }
      h("path", { d: arc(a0, a1, R), fill: "none", "stroke-width": 18, "stroke-linecap": "round", class: "dial-track" }, dg);
      const [sx, sy] = polar(start, R), [ex, ey] = polar(end, R);
      const grad = h("linearGradient", { id: `jx-arc-${i}`, gradientUnits: "userSpaceOnUse", x1: sx, y1: sy, x2: ex, y2: ey }, defs);
      const gStops = [h("stop", { offset: 0 }, grad), h("stop", { offset: 1 }, grad)];
      // fill and its highlight both measure their length as 1, so a fraction f fills exactly f of each
      const fill = h("path", { d: arc(start, end, R), fill: "none", "stroke-width": 18, "stroke-linecap": "round", stroke: `url(#jx-arc-${i})`,
                               filter: "url(#jx-glow)", class: "dial-fill", pathLength: 1, "stroke-dasharray": 1, "stroke-dashoffset": 1 }, dg);
      h("path", { d: arc(start, end, R - 4), fill: "none", stroke: "rgba(255,255,255,.35)", "stroke-width": 3, "stroke-linecap": "round", "pointer-events": "none",
                  class: "dial-gloss", pathLength: 1, "stroke-dasharray": 1, "stroke-dashoffset": 1 }, dg);
      // the knob that rides to the percentile: drawn at angle 0 and rotated into place
      const knob = h("g", { class: "dial-knob", style: `transform: rotate(${start}deg)` }, dg);
      const knobRing = h("circle", { cx: CX + R, cy: CY, r: 9, fill: "#fff", "stroke-width": 3.5 }, knob);
      // labels outside the ring
      const [lx, ly] = polar(mid, R + 50);
      const anchor = Math.abs(lx - CX) < 30 ? "middle" : lx > CX ? "start" : "end";
      const dy = ly < CY - 100 ? -14 : 0;
      const label = text(dg, lx, ly + dy - 16, d.label, "dial-label", { "text-anchor": anchor });
      const value = text(dg, lx, ly + dy + 5, "", "dial-value", { "text-anchor": anchor });
      const sub = text(dg, lx, ly + dy + 23, "", "dial-pct", { "text-anchor": anchor });
      const hit = h("path", { d: arc(a0, a1, R), fill: "none", stroke: "transparent", "stroke-width": 48 }, dg);
      hit.addEventListener("mouseenter", () => dg.classList.add("lift"));
      hit.addEventListener("mousemove", (e) => {
        const s = el._season; if (!s) return;
        const p = s.pctile[d.key];
        Charts.showTip(`<b>${d.label}: ${d.value(s)}</b> ${d.sub(s)}<br>` +
          (p === null ? "No starts this season" : `Better than <b>${Math.round(p * 100)}%</b> of the 625 starting seasons in the data`) +
          '<br><span class="tt-dim">The long tick marks the 50th percentile.</span>', e);
      });
      hit.addEventListener("mouseleave", () => { Charts.hideTip(); dg.classList.remove("lift"); });
      return { start, dir, fill, gloss: dg.querySelector(".dial-gloss"), gStops, knob, knobRing, label, value, sub };
    });
    parts.haloStops = haloStops;
    el._parts = parts;
  }

  // restart a CSS animation on an element
  const replay = (node, cls) => { node.classList.remove(cls); node.getBBox(); node.classList.add(cls); };

  function update(el, career, s) {
    if (!el._parts) build(el);
    const p = el._parts, j = s.jersey;
    const changed = el._season !== s;
    el._season = s;
    p.body.setAttribute("fill", j.body);
    p.rim.setAttribute("stroke", luminance(j.body) < 0.05 ? "rgba(255,255,255,.6)" : "rgba(255,255,255,.3)");
    p.sleeves.forEach((x) => x.setAttribute("fill", mix(j.body, "#000000", 0.1)));
    [...p.stripes, p.collar].forEach((x) => x.setAttribute("fill", j.trim));
    p.pinstripes.forEach((x) => x.setAttribute("fill", j.number));
    p.collarPin.setAttribute("stroke", j.number);
    p.seams.forEach((x) => x.setAttribute("stroke", luminance(j.body) > 0.5 ? "rgba(10,21,38,.16)" : "rgba(0,0,0,.35)"));
    p.stitches.forEach((x) => x.setAttribute("stroke", stitch(j)));
    p.name.setAttribute("fill", j.number);
    p.num.setAttribute("fill", j.number);
    p.numOutline.setAttribute("fill", j.trim);
    p.numOutline.setAttribute("stroke", j.trim);
    const last = career.name.split(" ").filter((w) => !/^(Jr\.?|Sr\.?|II|III|IV)$/.test(w)).pop();
    p.namePath.textContent = last.toUpperCase();
    [p.num, p.numOutline, p.numShine].forEach((t) => (t.textContent = s.number ?? ""));
    p.caption.textContent = `${s.season} · ${s.team_name}`;
    const color = accent(j);
    // the halo behind the jersey glows in the team's color (its brightest jersey color on a dark jersey)
    const glowColor = luminance(j.body) < 0.05 ? (luminance(j.trim) > 0.08 ? j.trim : j.number) : j.body;
    p.haloStops.forEach((st) => st.setAttribute("stop-color", glowColor));
    DIALS.forEach((d, i) => {
      const v = s.pctile[d.key], dial = p.dials[i], f = v === null ? 0 : Math.max(0.02, v);
      dial.gStops[0].setAttribute("stop-color", mix(color, "#ffffff", 0.45));
      dial.gStops[1].setAttribute("stop-color", color);
      [dial.fill, dial.gloss].forEach((x) => { x.setAttribute("stroke-dashoffset", 1 - f); x.style.opacity = v === null ? 0 : 1; });
      dial.knob.style.transform = `rotate(${dial.start + dial.dir * SPAN * f}deg)`;
      dial.knob.style.opacity = v === null ? 0 : 1;
      dial.knobRing.setAttribute("stroke", color);
      dial.value.textContent = d.value(s);
      dial.sub.textContent = v === null ? d.sub(s) : `${v >= 0.5 ? "▲" : "▼"} ${ordinal(Math.round(v * 100))} percentile`;
      dial.sub.classList.toggle("above", v !== null && v >= 0.5);
      dial.sub.classList.toggle("below", v !== null && v < 0.5);
    });
    if (changed) { replay(p.sweep, "go"); replay(p.jersey, "pop"); }
  }

  return { update, ordinal };
})();
