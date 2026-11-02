// ─── Charts ────────────────────────────────────────────────────────────────
// Which x-axis labels to print: every Nth, always the last, never two crowded together.
function labelIdx(n, every) {
  const set = new Set();
  for (let i = 0; i < n; i += every) set.add(i);
  const lastShown = Math.max(...set);
  if (lastShown !== n - 1) { if (n - 1 - lastShown < every) set.delete(lastShown); set.add(n - 1); }
  return set;
}
function lineChart(w, h, values, labels, o) {
  o = o || {};
  const f = F({ dir: "NONE", w: w, h: h, name: o.name || "Line chart" });
  const padL = 46, padB = 26, padT = 18, padR = 14;
  const max = o.max || 200, iw = w - padL - padR, ih = h - padB - padT;
  for (let i = 0; i <= 4; i++) {
    const y = padT + ih - (ih * i) / 4;
    put(f, R(iw, 1, C.grid), padL, Math.round(y));
    const t = T(i === 0 ? "0" : ((max * i) / 4).toFixed(1) + "K", { size: 11, color: C.muted });
    put(f, t, padL - 8 - t.width, Math.round(y - 8));
  }
  const pts = values.map((v, i) => [(iw * i) / (values.length - 1), ih - (ih * v) / max]);
  const d = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const g = svgNode(
    `<defs><linearGradient id="a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.area}" stop-opacity="0.75"/><stop offset="1" stop-color="${C.area}" stop-opacity="0"/></linearGradient></defs>` +
    `<path d="${d} L${iw} ${ih} L0 ${ih} Z" fill="url(#a)"/><path d="${d}" fill="none" stroke="${C.line}" stroke-width="2.5" stroke-linejoin="round"/>` +
    pts.map((p) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3" fill="${C.line}"/>`).join(""),
    iw, ih, iw, ih, "Line + area");
  put(f, g, padL, padT);
  const show = labelIdx(labels.length, o.every || 2);
  labels.forEach((l, i) => {
    if (!show.has(i)) return;
    const t = T(l, { size: 11, color: C.muted });
    put(f, t, Math.round(padL + pts[i][0] - t.width / 2), h - 18);
  });
  if (o.peak !== undefined) {
    const p = pts[o.peak];
    const t = T("Peak " + values[o.peak] + "K", { size: 11, w: 600, color: C.text });
    put(f, t, Math.round(padL + p[0] - t.width / 2), Math.round(padT + p[1] - 22));
  }
  return f;
}
function columnChart(w, h, values, labels, o) {
  o = o || {};
  const f = F({ dir: "NONE", w: w, h: h, name: o.name || "Column chart" });
  const padL = 40, padB = 26, padT = 10, padR = o.forecastW || 10;
  const max = o.max || 200, iw = w - padL - padR, ih = h - padB - padT;
  for (let i = 0; i <= 4; i++) {
    const y = padT + ih - (ih * i) / 4;
    put(f, R(iw + padR - 10, 1, C.grid), padL, Math.round(y));
    const t = T(i === 0 ? "0" : ((max * i) / 4).toFixed(1) + "K", { size: 10.5, color: C.muted });
    put(f, t, padL - 6 - t.width, Math.round(y - 7));
  }
  const step = iw / values.length, bw = Math.max(8, Math.round(step * 0.62));
  const show = labelIdx(values.length, o.every || 2);
  values.forEach((v, i) => {
    const bh = Math.round((ih * v) / max);
    const col = Array.isArray(o.colors) ? o.colors[i] : C.colBar;
    if (bh >= 1) { // no-data buildings have no bar (Figma rejects zero-height shapes)
      const b = R(bw, bh, col, { radius: Math.min(4, bh / 2), name: `Bar / ${labels[i]}` });
      if (!Array.isArray(o.colors) && C !== HC) {
        b.fills = [{ type: "GRADIENT_LINEAR", gradientTransform: [[0, 1, 0], [-1, 0, 1]], gradientStops: [{ position: 0, color: rgba("#34D399", 1) }, { position: 1, color: rgba("#D1FAE5", 1) }] }];
      }
      put(f, b, Math.round(padL + i * step + (step - bw) / 2), padT + ih - bh);
    }
    if (show.has(i)) {
      const t = T(labels[i], { size: 10.5, color: C.muted });
      put(f, t, Math.round(padL + i * step + step / 2 - t.width / 2), h - 18);
    }
  });
  if (o.forecast) {
    const y = padT + ih - Math.round((ih * o.forecast) / max);
    const line = figma.createLine();
    line.resize(padR - 24, 0);
    line.strokes = solid(C.forecast); line.strokeWeight = 2; line.dashPattern = [6, 5]; line.name = "Forecast (dashed)";
    put(f, line, padL + iw + 6, y);
    const t = T(o.forecastLabel || "Forecast", { size: 10.5, w: 600, color: C.forecast });
    put(f, t, padL + iw + 8, y - 18);
  }
  return f;
}
function donut(size, pct, color, track, top, bottom) {
  const f = F({ dir: "NONE", w: size, h: size, name: `Donut ${Math.round(pct * 100)}%` });
  const a = figma.createEllipse(); a.resize(size, size); a.fills = solid(track);
  a.arcData = { startingAngle: 0, endingAngle: 2 * Math.PI, innerRadius: 0.78 }; a.name = "Track";
  put(f, a, 0, 0);
  const b = figma.createEllipse(); b.resize(size, size); b.fills = solid(color);
  b.arcData = { startingAngle: -Math.PI / 2, endingAngle: -Math.PI / 2 + 2 * Math.PI * pct, innerRadius: 0.78 }; b.name = "Value";
  put(f, b, 0, 0);
  const t1 = T(top, { size: size > 90 ? 22 : 18, w: 700, color: C.strong });
  put(f, t1, Math.round(size / 2 - t1.width / 2), Math.round(size / 2 - (bottom ? 18 : 12)));
  if (bottom) {
    const t2 = T(bottom, { size: 9.5, w: 600, color: C.muted, upper: true, ls: 10 });
    put(f, t2, Math.round(size / 2 - t2.width / 2), Math.round(size / 2 + 6));
  }
  return f;
}
function progress(w, pct, color) {
  const f = F({ dir: "NONE", w: w, h: 8, radius: 4, fill: C === HC ? "#333333" : "#F1F5F9", clip: true, name: "Progress" });
  put(f, R(Math.max(1, Math.round(w * pct)), 8, color, { radius: 4 }), 0, 0);
  return f;
}

// ─── 01 Sign In ────────────────────────────────────────────────────────────
function s01SignIn() {
  const tile = (name, iconName, dot) => fw(col({ gap: 10, pad: [12, 12], radius: 14, fill: "#FFFFFF", fillOpacity: 0.04, stroke: "#FFFFFF", strokeOpacity: 0.12, h: dot ? 92 : 76, name: `Feature / ${name}` }, [
    row({ w: 32, h: 32, radius: 9, fill: "#047857", align: "CENTER", justify: "CENTER" }, [ic(iconName, 17, "#BEF264")]),
    fw(row({ justify: "SPACE_BETWEEN", align: "CENTER" }, [T(name, { size: 13, w: 600, color: "#FFFFFF" }), dot ? R(8, 8, "#A3E635", { radius: 4 }) : null])),
  ]));
  const left = fh(col({ w: 489, pad: [40, 32, 32, 32], fill: "#020617", justify: "SPACE_BETWEEN", name: "Brand panel" }, [
    col({ gap: 28 }, [
      row({ gap: 16, align: "CENTER" }, [logoTile(64), col({ gap: 4 }, [T("EnerSight", { size: 30, w: 700, color: "#FFFFFF" }), T("SEE ENERGY CLEARLY, MANAGE\nBUILDINGS WISELY.", { size: 11.5, w: 700, color: "#BEF264", ls: 14, lh: 170 })])]),
      row({ gap: 8, pad: [7, 14], radius: 999, fill: "#FFFFFF", fillOpacity: 0.06, stroke: "#FFFFFF", strokeOpacity: 0.15, align: "CENTER" }, [ic("sparkles", 14, "#BEF264"), T("SMART ENERGY COMMAND CENTER", { size: 12, w: 700, color: "#BEF264", ls: 14 })]),
      T("Monitor energy with\nclarity.", { size: 36, w: 700, color: "#FFFFFF", lh: 110 }),
      T("A modern GIS and OCR-assisted platform for building energy monitoring, reports, and role-based access.", { size: 14.5, color: "#E2E8F0", width: 410, lh: 165 }),
    ]),
    col({ gap: 12, w: 425 }, [
      fw(row({ gap: 9 }, [tile("GIS Mapping", "map-pin"), tile("OCR Reading", "scan-line"), tile("Energy Reports", "chart-column")])),
      fw(row({ gap: 9 }, [tile("Smart Monitoring", "zap", true), tile("Building Insights", "building-2", true), tile("Secure Access", "shield-check", true)])),
    ]),
  ]));
  const signIn = hbtn("Sign In", { kind: "dark", after: "arrow-right", lg: true, fill: true });
  link(signIn, "s02");
  const form = col({ w: 384, gap: 12, name: "Sign-in form" }, [
    T("ACCOUNT ACCESS", { size: 12.5, w: 600, color: C.accent, ls: 22 }),
    T("Welcome back", { size: 30, w: 700, color: C.strong }),
    T("Sign in to continue to your EnerSight dashboard.", { size: 15, color: C.sub }),
    field("Username", input("Enter username", { icon: "user", placeholder: true, focus: true, right: pin(2) })),
    field("Password", input("Enter password", { icon: "lock", placeholder: true, right: row({ gap: 8, align: "CENTER" }, [pin(3), ic("eye", 18, C.muted)]) })),
    fw(row({ justify: "MAX" }, [row({ gap: 6, align: "CENTER" }, [ic("key-round", 15, C.accent), T("Forgot password?", { size: 14.5, w: 600, color: C.accent })])])),
    signIn,
    hbtn("Create account", { icon: "user-plus", lg: true, fill: true }),
  ]);
  const a11y = row({ gap: 8, pad: [10, 14], radius: 14, fill: "#FFFFFF", stroke: NOTE.pin, sw: 2, align: "CENTER", name: "Accessibility button (added)" }, [ic("accessibility", 18, NOTE.pin), T("Accessibility", { size: 14, w: 600, color: NOTE.pin })]);
  link(a11y, "s13");
  const right = fh(fw(col({ pad: [24, 32], fill: "#FFFFFF", name: "Form panel" }, [
    fw(row({ justify: "MAX", gap: 10, align: "CENTER" }, [pin(1), a11y])),
    fw(row({ justify: "CENTER", pad: [140, 0, 0, 0] }, [form])),
  ])));
  const shell = row({ w: 1150, h: 958, radius: 24, fill: "#FFFFFF", clip: true, shadow: "xl", name: "Auth card" }, [left, right]);
  const root = row({ w: 1440, h: 1000, pad: [21, 145], name: "01 Sign In" }, [shell]);
  root.fills = [{ type: "GRADIENT_LINEAR", gradientTransform: [[1, 0, 0], [0, 1, 0]], gradientStops: [{ position: 0, color: rgba("#ECFDF5", 1) }, { position: 1, color: rgba("#F7FEE7", 1) }] }];
  return root;
}

// ─── 02 Dashboard (also 13 + 14) ───────────────────────────────────────────
function dashboard(name) {
  const trend = card([
    cardHead("Energy Consumption Trend", "Monthly usage from saved meter readings.", hbtn("View Analytics", { after: "arrow-right", link: "s08" })),
    fw(row({ justify: "SPACE_BETWEEN", align: "MAX" }, [
      col({ gap: 4 }, [
        row({ gap: 8, align: "BASELINE" }, [T("160,187", { size: 26, w: 700, color: C.strong }), T("kWh", { size: 13, color: C.muted }), trendChip("-9.6%  vs Aug 2026", false)]),
        T("Sep 2026 · latest month with saved readings", { size: 12, color: C.muted }),
      ]),
      row({ gap: 8, align: "CENTER" }, [pin(4), seg(["Chart", "Table"], 0), seg(["6M", "12M", "All"], 2)]),
    ])),
    RT([["Summary: ", 700], "September used 160,187 kWh, 9.6% less than August. Highest month: April 2026 (192.7K kWh)."], { size: 13.5, color: C.sub2, fill: true }),
    lineChart(616, 250, TREND, MONTHS, { peak: 12, every: 2 }),
    fw(row({ gap: 0, stroke: C.border, sw: 1, pad: [12, 0, 0, 0], name: "Range summary" }, [
      fw(col({ gap: 2 }, [label("Range total"), T("3,010,325 kWh", { size: 14.5, w: 600 }), T("18 months shown", { size: 12, color: C.muted })])),
      fw(col({ gap: 2 }, [label("Avg / month"), T("167.2K kWh", { size: 14.5, w: 600 }), T("Dashed line", { size: 12, color: C.muted })])),
      fw(col({ gap: 2 }, [label("Peak"), T("192.7K kWh", { size: 14.5, w: 600 }), T("Apr 2026", { size: 12, color: C.muted })])),
    ])),
  ], { name: "Card / Energy Consumption Trend" });
  sides(trend.children[trend.children.length - 1], 1, 0, 0, 0);

  const legendItem = (st) => row({ gap: 6, align: "CENTER" }, [shape(st, 12, C.dot[st], C.ink), T(st, { size: 12.5, color: C.sub2 })]);
  const gis = card([
    cardHead("GIS Energy Map", "Building EUI status preview. Click a pin for its full profile.", ic("map-pin", 20, C.accent)),
    fw(row({ gap: 6, wrap: true, rowGap: 6 }, [chip("9 Mapped", "green", { icon: "database" }), chip("2 Critical", "Critical", { icon: "triangle-alert" }), chip("Intensity 144.49", "green", { icon: "activity" })])),
    imageRect("miniMap", 350, 312, 12, "Mini map (OpenStreetMap)"),
    fw(row({ gap: 14, pad: [10, 12], radius: 12, stroke: C.border, sw: C.bw, justify: "CENTER", align: "CENTER", name: "Legend" }, [legendItem("Normal"), legendItem("High"), legendItem("Critical"), legendItem("No Data"), pin(5)])),
    hbtn("Open Building Map", { icon: "map", fill: true, link: "s03" }),
  ], { w: 392 });

  const months = MONTHS.map((m) => m.replace(" '", " 20"));
  const fc = card([
    fw(row({ justify: "SPACE_BETWEEN", align: "MIN" }, [
      col({ gap: 8 }, [row({ gap: 6, pad: [4, 10], radius: 999, fill: C.accentSoft, stroke: C.accentBorder, sw: 1, align: "CENTER" }, [ic("trending-down", 13, C.accent), T("Falling vs 6-month average", { size: 11.5, w: 600, color: C.accent })]), T("Energy Forecast", { size: 19, w: 600, color: C.strong })]),
      hbtn("Compare all 3 methods", { after: "arrow-right", link: "s08" }),
    ])),
    col({ gap: 4 }, [
      label("Next month · Oct 2026"),
      row({ gap: 8, align: "BASELINE" }, [T("168,488", { size: 26, w: 700, color: C.strong }), T("kWh", { size: 13, color: C.muted }), trendChip("+5.2%  vs Sep 2026", true)]),
      RT(["About ", ["₱2,021,856", 700, C.strong], " at ₱12.00 per kWh."], { size: 14, color: C.sub }),
      T("Checked against months that have already happened, this estimate has landed within about 4% of the real figure.", { size: 12.5, color: C.muted }),
    ]),
    columnChart(1040, 150, TREND, months, { every: 2, forecast: 168.5, forecastW: 130, forecastLabel: "Forecast" }),
  ], { name: "Card / Energy Forecast" });

  const rankItem = (n, b, pct, color) => {
    const it = fw(col({ gap: 12, pad: [14, 14], radius: 14, fill: C.soft, stroke: C === HC ? "#FFFFFF" : null, sw: 1, name: `Rank / ${b[0]}` }, [
      fw(row({ gap: 12, align: "CENTER" }, [
        row({ w: 34, h: 34, radius: 999, fill: n === 1 ? C.accent : C.card, stroke: n === 1 ? null : C.border, sw: 1, align: "CENTER", justify: "CENTER" }, [T("#" + n, { size: 12, w: 700, color: n === 1 ? C.onAccent : C.sub })]),
        fw(col({ gap: 2 }, [T(b[0], { size: 14, w: 600, color: C.strong }), T(`${b[5]} kWh/m² · ${b[4]} kWh · ${b[9]}`, { size: 12, color: C.sub, fill: true })])),
        status(b[6]),
      ])),
      progress(372, pct, color),
    ]));
    link(it, "s12");
    return it;
  };
  const rank = card([
    fw(row({ justify: "SPACE_BETWEEN" }, [col({ gap: 8 }, [sectionChip("EUI Ranking", "chart-column"), T("Building EUI Comparison", { size: 19, w: 600, color: C.strong }), T("Highest energy use per square meter.", { size: 14, color: C.sub })]), iconTile("chart-column", "green", 44)])),
    rankItem(1, BUILDINGS[0], 1, C.bar.Critical), rankItem(2, BUILDINGS[1], 0.94, C.bar.Critical),
    rankItem(3, BUILDINGS[2], 0.57, C.bar.High), rankItem(4, BUILDINGS[3], 0.55, C.bar.High),
    hbtn("View analytics", { after: "arrow-right", fill: true, link: "s08" }),
  ], { gap: 12, name: "Card / Building EUI Comparison" });

  const mini = (tone, l, v) => fw(col({ gap: 4, pad: [12, 14], radius: 12, fill: C.tone[tone].bg, stroke: C.tone[tone].border, sw: C.bw }, [T(l, { size: 12, w: 500, color: C.tone[tone].label }), T(v, { size: 22, w: 700, color: C.tone[tone].value })]));
  const ocr = card([
    fw(row({ justify: "SPACE_BETWEEN" }, [col({ gap: 8 }, [sectionChip("OCR Monitor", "scan-line"), T("OCR Reading Status", { size: 19, w: 600, color: C.strong }), T("Accuracy and verification state.", { size: 14, color: C.sub })]), iconTile("scan-line", "green", 44)])),
    fw(row({ gap: 16, pad: 16, radius: 14, fill: C.accentSoft, stroke: C.accentBorder, sw: C.bw, align: "CENTER" }, [donut(78, 0.93, C.accent, C === HC ? "#333333" : "#D1FAE5", "93%", "Accuracy"), col({ gap: 4 }, [T("Needs Review", { size: 14, w: 600, color: C.strong }), T("33 readings require attention.", { size: 12.5, color: C.sub })])])),
    fw(row({ gap: 10 }, [mini("green", "Verified", "112"), mini("amber", "Pending", "14"), mini("red", "Low Acc.", "19")])),
    hbtn("Open OCR Upload", { kind: "green", after: "arrow-right", fill: true, lg: true, link: "s06" }),
  ], { gap: 14, name: "Card / OCR Reading Status" });

  const reading = (b, meter, date, kwh) => {
    const it = fw(row({ pad: [14, 14], radius: 14, fill: C.soft, stroke: C === HC ? "#FFFFFF" : null, sw: 1, justify: "SPACE_BETWEEN", align: "CENTER", name: `Reading / ${b}` }, [
      col({ gap: 2 }, [T(b, { size: 14, w: 600, color: C.strong }), T(`Meter: ${meter} · ${date}`, { size: 12, color: C.sub })]),
      col({ gap: 4, align: "MAX" }, [T(kwh + " kWh", { size: 14, w: 600, color: C.strong }), status("Pending")]),
    ]));
    link(it, "s06");
    return it;
  };
  const latest = card([
    cardHead("Latest Meter Readings", "Recently saved readings.", ic("clock-3", 20, C.accent)),
    fw(row({ gap: 12 }, [reading("Science Laboratory Building", "DNSC-SCI-01", "Sep 6, 2026", "622,379"), reading("Institute of Computing", "DNSC-ICT-02", "Sep 5, 2026", "478,455")])),
    fw(row({ gap: 12 }, [reading("Institute of Computing", "DNSC-ICT-01", "Sep 5, 2026", "476,130"), reading("Student Center", "DNSC-STC-01", "Sep 4, 2026", "411,664")])),
  ], { gap: 12, name: "Card / Latest Meter Readings" });

  return appScreen(name, "Dashboard", "Dashboard", [
    pageHeader({ icon: "gauge", eyebrow: "EnerSight command overview", title: "Energy Monitoring Dashboard", sub: "Monitor buildings, consumption, OCR readings, and reports.", pills: ["Role: System Admin", "Backend: Connected"] }),
    stats([
      stat("green", "Total Buildings", "9", "9 mapped with GIS coordinates", "building-2"),
      stat("green", "Total Energy Used", "3,010,325", "kWh · ≈ ₱36,123,906 estimated bill", "zap", { hint: true }),
      stat("red", "Energy Intensity", "144.49", "kWh/m² · Highest: Institute of Computing", "trending-up", { hint: true }),
      stat("amber", "Readings to Check", "14", "112 verified readings saved", "scan-line", { hint: true }),
    ]),
    fw(row({ gap: 20, name: "Trend + map" }, [trend, gis])),
    fc,
    fw(row({ gap: 20, name: "Ranking + OCR" }, [rank, ocr])),
    latest,
  ]);
}

// ─── 03 GIS Map ────────────────────────────────────────────────────────────
function s03Map() {
  const filt = (t, on, st) => row({ gap: 6, pad: [5, 10], radius: 999, fill: on ? C.dark : C.card, stroke: on ? C.dark : C.border, sw: C.bw, align: "CENTER", name: `Filter / ${t}` }, [
    st ? shape(st, 11, C.dot[st], C.ink) : null,
    T(t, { size: 12.5, w: 600, color: on ? C.onDark : C.sub2 }),
  ]);
  const item = (b, sel) => {
    const tone = { Critical: "red", High: "amber", Normal: "green", "No Data": "dark" }[b[6]];
    const it = fw(row({ gap: 12, pad: [10, 12], radius: 14, fill: sel ? C.accentSoft : null, stroke: sel ? C.accentBorder : null, sw: C.bw, align: "CENTER", name: `List / ${b[0]}` }, [
      row({ w: 36, h: 36, radius: 10, fill: C.tone[tone].bg, stroke: C === HC ? C.tone[tone].border : null, sw: 1, align: "CENTER", justify: "CENTER" }, [ic("building-2", 17, C.tone[tone].icon === "#020617" ? "#64748B" : C.tone[tone].icon)]),
      fw(col({ gap: 2 }, [T(b[0], { size: 14.5, w: 600, color: C.strong, truncate: true }), row({ gap: 5, align: "CENTER" }, [shape(b[6], 10, C.dot[b[6]], C.ink), T(`${b[6]} · ${b[1]}`, { size: 12.5, color: C.sub })])])),
      col({ align: "MAX" }, [T(b[5], { size: 14.5, w: 600, color: C.strong }), T("kWh/m²", { size: 10.5, color: C.muted })]),
    ]));
    link(it, "s12");
    return it;
  };
  const list = fh(col({ w: 320, gap: 12, pad: [24, 16, 16, 16], stroke: C.border, sw: C.bw, name: "Buildings list (accessible alternative to the map)" }, [
    fw(row({ justify: "SPACE_BETWEEN", align: "CENTER" }, [col({ gap: 2 }, [T("Buildings", { size: 15, w: 600, color: C.strong }), T("9 of 9 shown on the map", { size: 12.5, color: C.sub })]), pin(1)])),
    input("Search name, type, EUI…", { icon: "search", placeholder: true }),
    label("EUI status"),
    fw(row({ wrap: true, gap: 6, rowGap: 8 }, [filt("All  9", true), filt("Normal  2", false, "Normal"), filt("High  2", false, "High"), filt("Critical  2", false, "Critical"), filt("No Data  3", false, "No Data")])),
    item(BUILDINGS[0], true), item(BUILDINGS[1]), item(BUILDINGS[2]), item(BUILDINGS[3]), item(BUILDINGS[4]), item(BUILDINGS[5]),
    T("Energy intensity per building: Normal ≤ 150 · High > 150 · Critical > 250 kWh/m² per year", { size: 12, color: C.muted, fill: true, lh: 145 }),
  ]));
  sides(list, 0, C.bw, 0, 0);
  const map = fh(F({ dir: "NONE", w: 760, h: 760, clip: true, fill: "#E5E7EB", name: "Map (OpenStreetMap, real campus area)" }));
  put(map, imageRect("gisMap", 760, 760, 0, "Map tiles"), 0, 0);
  const hint = row({ gap: 6, pad: [8, 12], radius: 12, fill: "#0F172A", fillOpacity: 0.92, align: "CENTER", name: "Keyboard hint (added)" }, [
    pin(2), T("Keyboard:", { size: 12.5, w: 600, color: "#FFFFFF" }),
    T("← ↑ ↓ → pan  ·  + − zoom  ·  Tab next building  ·  Enter open profile", { size: 12.5, color: "#FFFFFF" }),
  ]);
  put(map, hint, 16, 700);
  const mapCard = fw(row({ radius: 16, fill: C.card, stroke: C.border, sw: C.bw, clip: true, shadow: true, name: "Map panel" }, [list, map]));

  const recRows = BUILDINGS.map((b) => ({ cells: [two(b[0], b[11]), `${b[4]} kWh`, `${b[3]} m²`, T(b[5] === "—" ? "0.00 kWh/m²" : `${b[5]} kWh/m²`, { size: 14.5, w: 600, color: C.accent }), String(b[7]), b[2], status(b[6])], link: b[0] === "Institute of Computing" ? "s12" : null }));
  return appScreen("03 GIS Map", "GIS Map", "GIS Map", [
    pageHeader({ icon: "map-pin", eyebrow: "GIS energy map", title: "Building Energy Map", sub: "View building locations and EUI-based energy status.", pills: ["9 Visible"],
      actions: [hbtn("View Selected", { icon: "eye" }), hbtn("9 Mapped", { icon: "send" }), hbtn("Avg intensity 144.49", { kind: "dark", icon: "zap" })] }),
    stats([
      stat("dark", "Mapped Buildings", "9", "Buildings with valid coordinates", "map-pin"),
      stat("green", "Normal", "2", "Within normal EUI range", "circle-check"),
      stat("amber", "High", "2", "Needs monitoring", "flame"),
      stat("red", "Critical", "2", "Needs immediate review", "triangle-alert"),
    ]),
    mapCard,
    card([
      cardHead("GIS Building Records", "Location-based EUI and monitoring summary.", chip("9 buildings shown", "green", { big: true })),
      table([{ label: "Building", w: 210 }, { label: "Total kWh", w: 120 }, { label: "Floor area", w: 110 }, { label: "EUI", w: 150 }, { label: "Meters", w: 80 }, { label: "Coordinates", w: 0 }, { label: "Status", w: 120 }], recRows, { rowH: 66 }),
    ]),
  ]);
}
