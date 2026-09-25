/* The career explorer's centerpiece: the back of the jersey a QB wore that season (team colors
   for that era, his name and number), with five stat dials around it. Each dial fills to the
   share of all starting seasons (8+ starts) in the data that this season beat. */

const Jersey = (() => {
  const { h, text } = Charts;
  const CX = 320, CY = 300, R = 196, W = 640, H = 600;
  const SEG = 72, GAP = 12, SPAN = SEG - GAP;   // degrees per dial, gap between dials
  const DIALS = [
    { key: "win_pct", label: "Win %", value: (s) => (s.starts ? `${s.record}` : "No starts"),
      sub: (s) => (s.starts ? fmtPct3(s.win_pct) : "") },
    { key: "epa_vs_league", label: "EPA vs league", value: (s) => signed(s.epa_vs_league, 2), sub: () => "per play" },
    { key: "td_drive_pct", label: "TD drives", value: (s) => pct(s.td_drive_pct, 0), sub: () => "of his drives" },
    { key: "yards_per_attempt", label: "Yards / pass", value: (s) => (s.yards_per_attempt ?? 0).toFixed(1), sub: () => "per attempt" },
    { key: "int_pct", label: "INT rate", value: (s) => pct(s.int_pct, 1), sub: () => "lower is better" },
  ];
  const pct = (v, d) => (v === null || v === undefined ? "–" : `${(v * 100).toFixed(d)}%`);
  const signed = (v, d) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(d)}`;
  const fmtPct3 = (v) => (v === null ? "" : v.toFixed(3).replace(/^0/, ""));
  const ordinal = (n) => {
    const s = ["th", "st", "nd", "rd"], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  function polar(deg, r) {
    const a = (deg * Math.PI) / 180;
    return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
  }
  function arc(a0, a1, r) {
    const [x0, y0] = polar(a0, r), [x1, y1] = polar(a1, r);
    return `M${x0},${y0}A${r},${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1},${y1}`;
  }
  function luminance(hex) {
    const n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => {
      v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  // dial color: the jersey color, unless it is too light to see on white
  const accent = (j) => (luminance(j.body) < 0.6 ? j.body : luminance(j.number) < 0.6 ? j.number : "#013369");

  const ARC_LEN = (2 * Math.PI * R * SPAN) / 360;

  function build(el) {
    el.innerHTML = "";
    const svg = h("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Jersey and season stat dials" }, el);
    h("circle", { cx: CX, cy: CY, r: R - 22, fill: "#f4f5f1" }, svg);
    // yard-line hash marks inside the circle
    for (let i = -3; i <= 3; i++) h("line", { x1: CX + i * 44, x2: CX + i * 44, y1: CY - 150, y2: CY + 150, stroke: "#e6e8e3", "stroke-width": 1 }, svg);
    h("circle", { cx: CX, cy: CY, r: R - 22, fill: "none", stroke: "#e2e5e9" }, svg);

    const parts = {};
    // jersey (back view), drawn in a 240 x 262 box
    const g = h("g", { transform: `translate(${CX - 120}, ${CY - 138})` }, svg);
    const shape = "M72,8 Q120,24 168,8 L226,34 Q236,38 238,48 L246,108 L204,118 L200,248 Q120,262 40,248 L36,118 L-6,108 L2,48 Q4,38 14,34 Z";
    h("path", { d: shape, transform: "translate(0,4)", fill: "rgba(11,27,46,.10)" }, g); // soft shadow
    parts.body = h("path", { d: shape, class: "jersey-body", stroke: "rgba(11,27,46,.25)", "stroke-width": 1.5 }, g);
    parts.sleeveL = h("path", { d: "M-2,92 L38,100 L37,110 L-4,102 Z", class: "jersey-trim" }, g);
    parts.sleeveR = h("path", { d: "M242,92 L202,100 L203,110 L244,102 Z", class: "jersey-trim" }, g);
    parts.collar = h("path", { d: "M72,8 Q120,24 168,8 Q120,34 72,8 Z", class: "jersey-trim" }, g);
    parts.name = text(g, 120, 66, "", "jersey-name", { "text-anchor": "middle", style: "font: 700 22px var(--font-label); letter-spacing: .14em" });
    parts.numOutline = text(g, 120, 200, "", "jersey-num-outline", { "text-anchor": "middle", "stroke-width": 7, "stroke-linejoin": "round", style: "font: 700 118px var(--font-label)" });
    parts.num = text(g, 120, 200, "", "jersey-num", { "text-anchor": "middle", style: "font: 700 118px var(--font-label)" });
    parts.caption = text(svg, CX, CY + 162, "", "dial-label", { "text-anchor": "middle" });

    // dials
    parts.dials = DIALS.map((d, i) => {
      const mid = -90 + SEG * i, a0 = mid - SPAN / 2, a1 = mid + SPAN / 2;
      const dg = h("g", {}, svg);
      h("path", { d: arc(a0, a1, R), fill: "none", stroke: "#e6e8ec", "stroke-width": 16, "stroke-linecap": "round" }, dg);
      const fill = h("path", { d: arc(a0, a1, R), fill: "none", "stroke-width": 16, "stroke-linecap": "round",
                               class: "dial-fill", "stroke-dasharray": ARC_LEN, "stroke-dashoffset": ARC_LEN }, dg);
      // labels outside the ring
      const [lx, ly] = polar(mid, R + 44);
      const anchor = Math.abs(lx - CX) < 30 ? "middle" : lx > CX ? "start" : "end";
      const dy = ly < CY - 100 ? -14 : 0;
      const label = text(dg, lx, ly + dy - 16, d.label, "dial-label", { "text-anchor": anchor });
      const value = text(dg, lx, ly + dy + 4, "", "dial-value", { "text-anchor": anchor });
      const sub = text(dg, lx, ly + dy + 21, "", "dial-pct", { "text-anchor": anchor });
      const hit = h("path", { d: arc(a0, a1, R), fill: "none", stroke: "transparent", "stroke-width": 44 }, dg);
      hit.addEventListener("mousemove", (e) => {
        const s = el._season; if (!s) return;
        const p = s.pctile[d.key];
        Charts.showTip(`<b>${d.label}: ${d.value(s)}</b> ${d.sub(s)}<br>` +
          (p === null ? "No starts this season" : `Better than <b>${Math.round(p * 100)}%</b> of the 625 starting seasons in the data`), e);
      });
      hit.addEventListener("mouseleave", Charts.hideTip);
      return { fill, label, value, sub };
    });
    el._parts = parts;
  }

  function update(el, career, s) {
    if (!el._parts) build(el);
    const p = el._parts, j = s.jersey;
    el._season = s;
    p.body.setAttribute("fill", j.body);
    [p.sleeveL, p.sleeveR, p.collar].forEach((x) => x.setAttribute("fill", j.trim));
    p.name.setAttribute("fill", j.number);
    p.num.setAttribute("fill", j.number);
    p.numOutline.setAttribute("fill", j.trim);
    p.numOutline.setAttribute("stroke", j.trim);
    const last = career.name.split(" ").filter((w) => !/^(Jr\.?|Sr\.?|II|III|IV)$/.test(w)).pop();
    p.name.textContent = last.toUpperCase();
    p.num.textContent = s.number ?? "";
    p.numOutline.textContent = s.number ?? "";
    p.caption.textContent = `${s.season} · ${s.team_name}`;
    const color = accent(j);
    DIALS.forEach((d, i) => {
      const v = s.pctile[d.key], dial = p.dials[i];
      dial.fill.setAttribute("stroke", color);
      dial.fill.setAttribute("stroke-dashoffset", v === null ? ARC_LEN : ARC_LEN * (1 - Math.max(0.02, v)));
      dial.value.textContent = d.value(s);
      dial.sub.textContent = v === null ? d.sub(s) : `${ordinal(Math.round(v * 100))} percentile`;
    });
  }

  return { update, ordinal };
})();
