// EnerSight — accessible high-fidelity prototype builder (Figma plugin source).
// build.mjs prepends ICONS (lucide, the same set the app uses) and ASSETS (logo + real map crops)
// and writes ../code.js. Every screen mirrors the real EnerSight UI (captured Oct 7 2026);
// accessibility additions are marked with purple pins and listed in a notes frame under each screen.

/* global ICONS, ASSETS */

// ─── Palettes (Tailwind values the app uses) ───────────────────────────────
const LIGHT = {
  name: "Light", bg: "#F8FAFC", card: "#FFFFFF", border: "#E2E8F0", text: "#0F172A", strong: "#020617",
  sub: "#64748B", sub2: "#475569", muted: "#94A3B8", soft: "#F8FAFC", soft2: "#F1F5F9",
  sidebar: "#020617", sideText: "#E2E8F0", sideIcon: "#CBD5E1", sideGroup: "#64748B", sideActive: "#047857", sideActiveText: "#FFFFFF", tagline: "#A3E635",
  accent: "#047857", accentSoft: "#ECFDF5", accentBorder: "#A7F3D0", onAccent: "#FFFFFF",
  dark: "#020617", onDark: "#FFFFFF", focus: "#2563EB", bw: 1, ink: "#FFFFFF",
  tone: {
    green: { bg: "#ECFDF5", border: "#D1FAE5", label: "#047857", value: "#065F46", icon: "#047857", iconFg: "#FFFFFF" },
    blue: { bg: "#EFF6FF", border: "#DBEAFE", label: "#1D4ED8", value: "#1E40AF", icon: "#2563EB", iconFg: "#FFFFFF" },
    amber: { bg: "#FFFBEB", border: "#FEF3C7", label: "#B45309", value: "#92400E", icon: "#F59E0B", iconFg: "#FFFFFF" },
    red: { bg: "#FEF2F2", border: "#FEE2E2", label: "#B91C1C", value: "#991B1B", icon: "#EF4444", iconFg: "#FFFFFF" },
    purple: { bg: "#FAF5FF", border: "#F3E8FF", label: "#7E22CE", value: "#6B21A8", icon: "#9333EA", iconFg: "#FFFFFF" },
    dark: { bg: "#FFFFFF", border: "#E2E8F0", label: "#64748B", value: "#020617", icon: "#020617", iconFg: "#BEF264" },
  },
  pill: {
    Critical: ["#FEF2F2", "#DC2626", "#FECACA"], High: ["#FFFBEB", "#B45309", "#FDE68A"], Normal: ["#ECFDF5", "#047857", "#A7F3D0"],
    "No Data": ["#F1F5F9", "#475569", "#E2E8F0"], Active: ["#ECFDF5", "#047857", "#A7F3D0"], Verified: ["#ECFDF5", "#047857", "#A7F3D0"],
    Review: ["#FFFBEB", "#B45309", "#FDE68A"], Pending: ["#FFFBEB", "#B45309", "#FDE68A"], Manual: ["#F8FAFC", "#475569", "#E2E8F0"],
    blue: ["#EFF6FF", "#1D4ED8", "#BFDBFE"], purple: ["#FAF5FF", "#7E22CE", "#E9D5FF"], green: ["#ECFDF5", "#047857", "#A7F3D0"], gray: ["#FFFFFF", "#475569", "#E2E8F0"],
  },
  dot: { Normal: "#10B981", High: "#F59E0B", Critical: "#EF4444", "No Data": "#64748B" },
  bar: { Normal: "#10B981", High: "#F59E0B", Critical: "#EF4444", "No Data": "#94A3B8" },
  line: "#059669", area: "#A7F3D0", colBar: "#6EE7B7", grid: "#E2E8F0", forecast: "#EF4444",
  up: ["#FEF2F2", "#DC2626"], down: ["#ECFDF5", "#047857"],
};
const HC = {
  name: "High contrast", bg: "#000000", card: "#000000", border: "#FFFFFF", text: "#FFFFFF", strong: "#FFFFFF",
  sub: "#FFFFFF", sub2: "#FFFFFF", muted: "#E5E5E5", soft: "#000000", soft2: "#1A1A1A",
  sidebar: "#000000", sideText: "#FFFFFF", sideIcon: "#FFFFFF", sideGroup: "#FFFF00", sideActive: "#000000", sideActiveText: "#FFFF00", tagline: "#FFFF00",
  accent: "#FFFF00", accentSoft: "#000000", accentBorder: "#FFFF00", onAccent: "#000000",
  dark: "#FFFF00", onDark: "#000000", focus: "#00FFFF", bw: 2, ink: "#000000",
  tone: {
    green: { bg: "#000000", border: "#7CFC00", label: "#7CFC00", value: "#FFFFFF", icon: "#7CFC00", iconFg: "#000000" },
    blue: { bg: "#000000", border: "#7DD3FC", label: "#7DD3FC", value: "#FFFFFF", icon: "#7DD3FC", iconFg: "#000000" },
    amber: { bg: "#000000", border: "#FFD700", label: "#FFD700", value: "#FFFFFF", icon: "#FFD700", iconFg: "#000000" },
    red: { bg: "#000000", border: "#FF8A8A", label: "#FF8A8A", value: "#FFFFFF", icon: "#FF8A8A", iconFg: "#000000" },
    purple: { bg: "#000000", border: "#E0B0FF", label: "#E0B0FF", value: "#FFFFFF", icon: "#E0B0FF", iconFg: "#000000" },
    dark: { bg: "#000000", border: "#FFFFFF", label: "#FFFFFF", value: "#FFFFFF", icon: "#FFFF00", iconFg: "#000000" },
  },
  pill: {
    Critical: ["#000000", "#FF8A8A", "#FF8A8A"], High: ["#000000", "#FFD700", "#FFD700"], Normal: ["#000000", "#7CFC00", "#7CFC00"],
    "No Data": ["#000000", "#FFFFFF", "#FFFFFF"], Active: ["#000000", "#7CFC00", "#7CFC00"], Verified: ["#000000", "#7CFC00", "#7CFC00"],
    Review: ["#000000", "#FFD700", "#FFD700"], Pending: ["#000000", "#FFD700", "#FFD700"], Manual: ["#000000", "#FFFFFF", "#FFFFFF"],
    blue: ["#000000", "#7DD3FC", "#7DD3FC"], purple: ["#000000", "#E0B0FF", "#E0B0FF"], green: ["#000000", "#7CFC00", "#7CFC00"], gray: ["#000000", "#FFFFFF", "#FFFFFF"],
  },
  dot: { Normal: "#7CFC00", High: "#FFD700", Critical: "#FF8A8A", "No Data": "#FFFFFF" },
  bar: { Normal: "#7CFC00", High: "#FFD700", Critical: "#FF8A8A", "No Data": "#FFFFFF" },
  line: "#7CFC00", area: "#1F3D00", colBar: "#7CFC00", grid: "#555555", forecast: "#FF8A8A",
  up: ["#000000", "#FF8A8A"], down: ["#000000", "#7CFC00"],
};
const NOTE = { bg: "#F5F3FF", title: "#4C1D95", text: "#2E1065", pin: "#6D28D9", ring: "#EDE9FE", added: "#6D28D9", existing: "#047857" };

let C = LIGHT; // current palette
let S = 1; // text scale

// ─── Fonts ─────────────────────────────────────────────────────────────────
let FAM = "Plus Jakarta Sans";
let STY = { 400: "Regular", 500: "Medium", 600: "SemiBold", 700: "Bold" };
async function loadFonts() {
  await figma.loadFontAsync({ family: "Inter", style: "Regular" });
  try {
    for (const s of Object.values(STY)) await figma.loadFontAsync({ family: FAM, style: s });
  } catch (e) {
    FAM = "Inter";
    STY = { 400: "Regular", 500: "Medium", 600: "Semi Bold", 700: "Bold" };
    for (const s of Object.values(STY)) await figma.loadFontAsync({ family: FAM, style: s });
  }
}

// ─── Primitives ────────────────────────────────────────────────────────────
function rgb(h) {
  h = h.replace("#", "");
  return { r: parseInt(h.slice(0, 2), 16) / 255, g: parseInt(h.slice(2, 4), 16) / 255, b: parseInt(h.slice(4, 6), 16) / 255 };
}
function rgba(h, a) { return Object.assign(rgb(h), { a: a }); }
function solid(h, o) { return [{ type: "SOLID", color: rgb(h), opacity: o === undefined ? 1 : o }]; }
function shadowSm() {
  return [{ type: "DROP_SHADOW", color: { r: 0.06, g: 0.09, b: 0.16, a: 0.06 }, offset: { x: 0, y: 1 }, radius: 3, spread: 0, visible: true, blendMode: "NORMAL" }];
}
function shadowXl() {
  return [{ type: "DROP_SHADOW", color: { r: 0.01, g: 0.02, b: 0.09, a: 0.3 }, offset: { x: 0, y: 20 }, radius: 50, spread: 0, visible: true, blendMode: "NORMAL" }];
}

// Fill-container wishes are recorded by id and applied top-down after a screen is assembled.
const FILL_W = new Set();
const FILL_H = new Set();
function fw(n) { FILL_W.add(n.id); return n; }
function fh(n) { FILL_H.add(n.id); return n; }
function applyFills(n) {
  const p = n.parent;
  if (p && p.type !== "PAGE" && p.layoutMode && p.layoutMode !== "NONE") {
    if (FILL_W.has(n.id)) n.layoutSizingHorizontal = "FILL";
    if (FILL_H.has(n.id)) n.layoutSizingVertical = "FILL";
  }
  if ("children" in n && n.type !== "INSTANCE") for (const c of n.children) applyFills(c);
}

function layout(f, o, kids) {
  o = o || {};
  kids = kids || [];
  if (o.name) f.name = o.name;
  f.fills = o.fill ? solid(o.fill, o.fillOpacity) : [];
  if (o.radius) f.cornerRadius = o.radius;
  if (o.stroke) {
    f.strokes = solid(o.stroke, o.strokeOpacity);
    f.strokeWeight = o.sw || 1;
    f.strokeAlign = "INSIDE";
    if (o.dash) f.dashPattern = o.dash;
  }
  if (o.shadow) f.effects = o.shadow === "xl" ? shadowXl() : shadowSm();
  f.clipsContent = !!o.clip;
  const dir = o.dir || "VERTICAL";
  if (dir === "NONE") {
    f.layoutMode = "NONE";
    f.resize(o.w || 100, o.h || 100);
  } else {
    f.layoutMode = dir;
    f.itemSpacing = o.gap || 0;
    const p = o.pad === undefined ? 0 : o.pad;
    const q = typeof p === "number" ? [p, p, p, p] : p.length === 2 ? [p[0], p[1], p[0], p[1]] : p;
    f.paddingTop = q[0]; f.paddingRight = q[1]; f.paddingBottom = q[2]; f.paddingLeft = q[3];
    f.primaryAxisAlignItems = o.justify || "MIN";
    f.counterAxisAlignItems = o.align || "MIN";
    if (o.w) { f.resize(o.w, f.height); f.layoutSizingHorizontal = "FIXED"; }
    else f.layoutSizingHorizontal = o.wrap ? "FIXED" : "HUG";
    if (o.h) { f.resize(f.width, o.h); f.layoutSizingVertical = "FIXED"; }
    else f.layoutSizingVertical = "HUG";
    if (o.wrap) { f.layoutWrap = "WRAP"; f.counterAxisSpacing = o.rowGap || 0; }
    if (o.minH) { try { f.minHeight = o.minH; } catch (e) { /* older API */ } }
  }
  for (const k of kids) if (k) f.appendChild(k);
  return f;
}
function F(o, kids) { return layout(figma.createFrame(), o, kids); }
function row(o, kids) { return F(Object.assign({ dir: "HORIZONTAL" }, o), kids); }
function col(o, kids) { return F(Object.assign({ dir: "VERTICAL" }, o), kids); }
function sides(f, t, r, b, l) {
  f.strokeTopWeight = t; f.strokeRightWeight = r; f.strokeBottomWeight = b; f.strokeLeftWeight = l;
  return f;
}
function put(parent, node, x, y) {
  parent.appendChild(node);
  if (parent.layoutMode && parent.layoutMode !== "NONE") node.layoutPositioning = "ABSOLUTE";
  node.x = x;
  node.y = y;
  return node;
}

function T(str, o) {
  o = o || {};
  const t = figma.createText();
  t.fontName = { family: FAM, style: STY[o.w || 400] };
  t.characters = String(str);
  t.fontSize = Math.round((o.size || 14) * S * 10) / 10;
  t.fills = solid(o.color || C.text);
  if (o.lh) t.lineHeight = { unit: "PERCENT", value: o.lh };
  if (o.ls) t.letterSpacing = { unit: "PERCENT", value: o.ls };
  if (o.upper) t.textCase = "UPPER";
  if (o.underline) t.textDecoration = "UNDERLINE";
  if (o.align) t.textAlignHorizontal = o.align;
  if (o.width) { t.textAutoResize = "HEIGHT"; t.resize(o.width, t.height); }
  else t.textAutoResize = "WIDTH_AND_HEIGHT";
  t.name = o.name || String(str).slice(0, 40);
  if (o.truncate) { t.textTruncation = "ENDING"; t.maxLines = 1; }
  return o.fill || o.truncate ? fw(t) : t;
}
function RT(parts, o) {
  o = o || {};
  const base = o.w || 400;
  const segs = parts.map((p) => (typeof p === "string" ? [p, base, null] : [p[0], p[1] || 700, p[2] || null]));
  const t = T(segs.map((s) => s[0]).join(""), o);
  let i = 0;
  for (const s of segs) {
    if (s[0].length) {
      if (s[1] !== base) t.setRangeFontName(i, i + s[0].length, { family: FAM, style: STY[s[1]] });
      if (s[2]) t.setRangeFills(i, i + s[0].length, solid(s[2]));
    }
    i += s[0].length;
  }
  return t;
}
function R(w, h, fill, o) {
  o = o || {};
  const r = figma.createRectangle();
  r.resize(w, h);
  r.fills = fill ? solid(fill, o.opacity) : [];
  if (o.radius) r.cornerRadius = o.radius;
  if (o.stroke) { r.strokes = solid(o.stroke); r.strokeWeight = o.sw || 1; if (o.dash) r.dashPattern = o.dash; }
  if (o.name) r.name = o.name;
  return r;
}
function svgNode(inner, w, h, vbw, vbh, name) {
  const n = figma.createNodeFromSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${vbw} ${vbh}">${inner}</svg>`);
  n.fills = [];
  n.name = name || "graphic";
  return n;
}
// Lucide icon (stroke icons, 24 grid) in a given colour.
function ic(name, size, color) {
  const inner = ICONS[name] || ICONS.info;
  return svgNode(`<g fill="none" stroke="${color || C.text}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</g>`, size || 18, size || 18, 24, 24, `icon/${name}`);
}
// Accessibility addition: a distinct shape per EUI status (✓ circle, ▲ triangle, ✕ octagon, dashed circle).
function shape(st, size, fg, ink) {
  const S16 = {
    Normal: `<circle cx="8" cy="8" r="7" fill="${fg}"/><path d="M4.5 8.2l2.2 2.2 4.8-4.8" stroke="${ink}" stroke-width="2" fill="none"/>`,
    High: `<path d="M8 1 15 14H1z" fill="${fg}"/><path d="M8 6v4M8 11.5v1" stroke="${ink}" stroke-width="1.8"/>`,
    Critical: `<path d="M5 1h6l4 4v6l-4 4H5l-4-4V5z" fill="${fg}"/><path d="M5.5 5.5l5 5m0-5-5 5" stroke="${ink}" stroke-width="1.8"/>`,
    "No Data": `<circle cx="8" cy="8" r="6.5" fill="none" stroke="${fg}" stroke-width="1.5" stroke-dasharray="2 2"/><path d="M5 8h6" stroke="${fg}" stroke-width="1.8"/>`,
  };
  return svgNode(S16[st], size, size, 16, 16, `shape/${st}`);
}
function imageFill(key) {
  const img = figma.createImage(figma.base64Decode(ASSETS[key]));
  return [{ type: "IMAGE", imageHash: img.hash, scaleMode: "FILL" }];
}
function imageRect(key, w, h, radius, name) {
  const r = figma.createRectangle();
  r.resize(w, h);
  r.fills = imageFill(key);
  if (radius) r.cornerRadius = radius;
  r.name = name || key;
  return r;
}

// ─── A11y pin component ────────────────────────────────────────────────────
let PIN = null;
function buildPin(page) {
  PIN = figma.createComponent();
  layout(PIN, { dir: "HORIZONTAL", w: 24, h: 24, radius: 999, fill: NOTE.pin, align: "CENTER", justify: "CENTER", name: "A11y pin" }, [
    T("1", { size: 11.5, w: 700, color: "#FFFFFF", name: "Number" }),
  ]);
  PIN.strokes = solid(NOTE.ring);
  PIN.strokeWeight = 3;
  PIN.strokeAlign = "OUTSIDE";
  PIN.description = "Accessibility annotation. Explained in the notes frame under each screen.";
  page.appendChild(PIN);
}
function pin(n) {
  const savedS = S;
  const inst = PIN.createInstance();
  inst.findOne((x) => x.type === "TEXT").characters = String(n);
  S = savedS;
  return inst;
}

// ─── Prototype links ───────────────────────────────────────────────────────
const LINKS = [];
function link(node, target, overlay) { LINKS.push([node, target, !!overlay]); return node; }

// ─── Shell: sidebar + top bar ──────────────────────────────────────────────
const NAV = [
  ["Overview", [["Dashboard", "layout-dashboard", "s02"], ["GIS Map", "map", "s03"]]],
  ["Records", [["Buildings", "building-2", "s04"], ["Meters", "gauge", "s05"], ["Add Meter Reading", "upload", "s06"]]],
  ["Insights", [["Reports", "file-text", "s07"], ["Analytics", "chart-column", "s08"]]],
  ["Administration", [["Users", "user-cog", "s09"]]],
  ["Account", [["Profile", "user", "s10"], ["Settings", "settings", "s11"]]],
];
function logoTile(size) {
  return row({ w: size, h: size, radius: Math.round(size / 4), fill: "#FFFFFF", align: "CENTER", justify: "CENTER", clip: true, name: "Logo" }, [imageRect("logo", size - 8, size - 8, 6, "EnerSight logo")]);
}
function sidebar(active) {
  const top = fw(row({ gap: 12, pad: [0, 8, 0, 8], align: "CENTER", name: "Brand" }, [
    logoTile(56),
    fw(col({ gap: 2 }, [
      T("EnerSight", { size: 21, w: 700, color: "#FFFFFF" }),
      T("SEE ENERGY CLEARLY, …", { size: 11, w: 700, color: C.tagline, ls: 8 }),
    ])),
    ic("panel-left-close", 18, C.muted),
  ]));
  const kids = [top, R(10, 10, null, { name: "spacer" })];
  for (const g of NAV) {
    kids.push(row({ pad: [14, 16, 6, 16], name: `Group / ${g[0]}` }, [T(g[0], { size: 11, w: 600, color: C.sideGroup, upper: true, ls: 16 })]));
    for (const it of g[1]) {
      const on = it[0] === active;
      const color = on ? C.sideActiveText : C.sideText;
      const n = fw(row({ gap: 12, pad: [10, 16], radius: 12, align: "CENTER", fill: on ? C.sideActive : null, minH: 40, name: `Nav / ${it[0]}` }, [
        ic(it[1], 19, on ? C.sideActiveText : C.sideIcon),
        T(it[0], { size: 15, w: on ? 600 : 500, color }),
      ]));
      if (on && C === HC) { n.strokes = solid("#FFFF00"); n.strokeWeight = 2; n.strokeAlign = "INSIDE"; }
      link(n, it[2]);
      kids.push(n);
    }
  }
  const out = row({ gap: 10, pad: [10, 16], align: "CENTER", name: "Sign out" }, [ic("log-out", 15, C.muted), T("Sign out", { size: 13, color: C.muted })]);
  link(out, "s01");
  const sb = fh(col({ w: 296, pad: [20, 16, 24, 16], gap: 2, fill: C.sidebar, justify: "SPACE_BETWEEN", name: "Sidebar" }, [
    fw(col({ gap: 2 }, kids)),
    out,
  ]));
  if (C === HC) { sb.strokes = solid("#FFFFFF"); sb.strokeAlign = "INSIDE"; sides(sb, 0, 2, 0, 0); }
  return sb;
}
let A11Y_BTN_PIN = true;
function topbar(crumb) {
  const a11y = row({ gap: 8, pad: [10, 14], radius: 14, fill: C.card, stroke: NOTE.pin, sw: 2, align: "CENTER", name: "Accessibility button (added)" }, [
    ic("accessibility", 18, C === HC ? "#FFFF00" : NOTE.pin),
    T("Accessibility", { size: 14, w: 600, color: C === HC ? "#FFFF00" : NOTE.pin }),
  ]);
  link(a11y, "s13");
  const bar = fw(row({ h: 88, pad: [0, 32], fill: C.card, stroke: C.border, sw: C.bw, justify: "SPACE_BETWEEN", align: "CENTER", name: "Top bar" }, [
    T(crumb, { size: 15, w: 500, color: C.sub2 }),
    row({ gap: 10, pad: [12, 16], w: 448, radius: 14, fill: C.soft, stroke: C.border, sw: C.bw, align: "CENTER", name: "Search pages" }, [
      ic("search", 18, C.muted), T("Search pages…", { size: 15, color: C.muted }),
    ]),
    row({ gap: 12, align: "CENTER" }, [
      A11Y_BTN_PIN ? pin("A") : null,
      a11y,
      row({ gap: 10, pad: [8, 16, 8, 10], radius: 16, fill: C.card, stroke: C.border, sw: C.bw, align: "CENTER", shadow: true, name: "User chip" }, [
        row({ w: 36, h: 36, radius: 999, fill: C === HC ? "#000000" : "#D1FAE5", stroke: C === HC ? "#FFFFFF" : null, sw: 1, align: "CENTER", justify: "CENTER" }, [T("AD", { size: 13.5, w: 700, color: C.accent })]),
        col({ gap: 0 }, [T("AdminTest", { size: 14.5, w: 600, color: C.text }), T("Admin", { size: 12, w: 600, color: C.accent })]),
      ]),
    ]),
  ]));
  return sides(bar, 0, 0, C.bw, 0);
}
function appScreen(name, nav, crumb, content) {
  const main = fw(col({ name: "Main" }, [
    topbar(crumb),
    fw(col({ pad: [28, 32, 40, 32], gap: 24, name: "Content" }, content)),
  ]));
  return row({ w: 1440, fill: C.bg, minH: 1024, name }, [sidebar(nav), main]);
}

// ─── Shared components (mirroring PageHeader, StatCard, pills, tables) ─────
function pillBox(text, o) {
  o = o || {};
  return row({ pad: [5, 10], radius: 999, fill: C.card, stroke: C.border, sw: C.bw, name: `Pill / ${text}` }, [T(text, { size: 12, w: 500, color: C.sub2 })]);
}
function timePill(t) {
  return row({ gap: 6, pad: [8, 12], radius: 12, fill: C.card, stroke: C.border, sw: C.bw, align: "CENTER", name: "Auto-refresh" }, [ic("clock-3", 14, C.muted), T(t, { size: 13, w: 500, color: C.sub })]);
}
function hbtn(label, o) {
  o = o || {};
  const kind = o.kind || "outline";
  const s = {
    outline: [C.card, C.border, C.sub2],
    dark: [C.dark, C.dark, C.onDark],
    danger: [C.card, C === HC ? "#FF8A8A" : "#FECACA", C === HC ? "#FF8A8A" : "#DC2626"],
    green: [C.accent, C.accent, C.onAccent],
    disabled: [C === HC ? "#333333" : "#64748B", C === HC ? "#333333" : "#64748B", "#FFFFFF"],
  }[kind];
  const b = row({ gap: 8, pad: o.lg ? [13, 20] : [9, 14], radius: 12, fill: s[0], stroke: s[1], sw: C.bw, align: "CENTER", justify: "CENTER", name: `Button / ${label}` }, [
    o.icon ? ic(o.icon, o.lg ? 18 : 16, s[2]) : null,
    T(label, { size: o.lg ? 15 : 13.5, w: 600, color: s[2] }),
    o.after ? ic(o.after, 16, s[2]) : null,
  ]);
  if (o.link) link(b, o.link);
  return o.fill ? fw(b) : b;
}
function pageHeader(o) {
  const left = row({ gap: 12, name: "Heading" }, [
    row({ w: 40, h: 40, radius: 12, fill: C.accentSoft, stroke: C === HC ? "#FFFFFF" : null, sw: 1, align: "CENTER", justify: "CENTER" }, [ic(o.icon, 19, C.accent)]),
    col({ gap: 4 }, [
      T(o.eyebrow, { size: 11, w: 600, color: C.accent, upper: true, ls: 14 }),
      T(o.title, { size: 26, w: 700, color: C.strong }),
      T(o.sub, { size: 15, color: C.sub }),
      o.pills && o.pills.length ? row({ gap: 8, pad: [6, 0, 0, 0] }, o.pills.map((p) => pillBox(p))) : null,
    ]),
  ]);
  const h = fw(row({ justify: "SPACE_BETWEEN", pad: [0, 0, 20, 0], stroke: C.border, sw: C.bw, name: "Page header" }, [
    left,
    row({ gap: 10, align: "CENTER" }, [timePill(o.time || "30s · 11:43 PM")].concat(o.actions || [])),
  ]));
  return sides(h, 0, 0, C.bw, 0);
}
function stat(tone, label, value, caption, iconName, o) {
  o = o || {};
  const t = C.tone[tone];
  return fw(row({ gap: 12, pad: 20, radius: 16, fill: t.bg, stroke: t.border, sw: C.bw, shadow: true, justify: "SPACE_BETWEEN", name: `Stat / ${label}` }, [
    fw(col({ gap: 6 }, [
      fw(row({ gap: 6, align: "CENTER" }, [T(label, { size: 14.5, w: 500, color: t.label, truncate: true }), o.hint ? ic("info", 14, C.muted) : null])),
      T(value, { size: o.compact ? 24 : 30, w: 700, color: t.value, fill: !!o.compact }),
      T(caption, { size: 12.5, color: t.label, fill: true, lh: 140 }),
    ])),
    row({ w: 48, h: 48, radius: 12, fill: t.icon, align: "CENTER", justify: "CENTER", name: "Icon tile" }, [ic(iconName, 22, t.iconFg)]),
  ]));
}
function stats(cards) { return fw(row({ gap: 20, name: "Stat cards" }, cards)); }
function card(kids, o) {
  o = o || {};
  const c = col({ gap: o.gap === undefined ? 16 : o.gap, pad: o.pad === undefined ? [20, 20] : o.pad, radius: 16, fill: C.card, stroke: C.border, sw: C.bw, shadow: true, w: o.w, clip: !!o.clip, name: o.name || "Card" }, kids);
  return o.w ? c : fw(c);
}
function cardHead(title, sub, right, pinNo) {
  return fw(row({ justify: "SPACE_BETWEEN", align: "MIN", gap: 16, name: "Card header" }, [
    fw(col({ gap: 4 }, [
      row({ gap: 10, align: "CENTER" }, [T(title, { size: 19, w: 600, color: C.strong }), pinNo ? pin(pinNo) : null]),
      sub ? T(sub, { size: 14, color: C.sub, fill: true, lh: 145 }) : null,
    ])),
    right || null,
  ]));
}
function chip(text, kind, o) {
  o = o || {};
  const p = C.pill[kind] || C.pill.gray;
  return row({ gap: 6, pad: o.big ? [6, 12] : [4, 9], radius: 999, fill: p[0], stroke: p[2], sw: C.bw, align: "CENTER", name: `Chip / ${text}` }, [
    o.icon ? ic(o.icon, 13, p[1]) : null,
    T(text, { size: o.big ? 13 : 11.5, w: 600, color: p[1] }),
  ]);
}
// EUI status pill. The shape icon is an accessibility addition (the app shows colour + word).
function status(st, label) {
  const p = C.pill[st];
  const kids = [];
  if (C.dot[st]) kids.push(shape(st, 12, p[1], C.ink));
  else if (st === "Active" || st === "Verified") kids.push(ic("circle-check", 13, p[1]));
  kids.push(T(label || st, { size: 11.5, w: 600, color: p[1] }));
  return row({ gap: 5, pad: [4, 9], radius: 999, fill: p[0], stroke: p[2], sw: C.bw, align: "CENTER", name: `Status / ${label || st}` }, kids);
}
function iconBtn(name, kind) {
  const m = { view: ["#F1F5F9", "#475569"], plug: ["#F7FEE7", "#65A30D"], edit: ["#ECFDF5", "#047857"], del: ["#FEF2F2", "#DC2626"], warn: ["#FFFBEB", "#D97706"], ok: ["#ECFDF5", "#047857"], dark: ["#020617", "#FFFFFF"] }[kind || "view"];
  const bg = C === HC ? "#000000" : m[0];
  const fg = C === HC ? "#FFFFFF" : m[1];
  return row({ w: 32, h: 32, radius: 10, fill: bg, stroke: C === HC ? "#FFFFFF" : null, sw: 1, align: "CENTER", justify: "CENTER", name: `Icon button / ${name}` }, [ic(name, 15, fg)]);
}
function input(text, o) {
  o = o || {};
  const f = row({ gap: 10, pad: [12, 14], radius: 14, fill: o.disabled ? C.soft2 : C.soft, stroke: o.focus ? C.focus : C.border, sw: o.focus ? 2 : C.bw, align: "CENTER", justify: "SPACE_BETWEEN", w: o.w, name: o.name || `Input / ${text}` }, [
    row({ gap: 10, align: "CENTER" }, [o.icon ? ic(o.icon, 17, C.accent) : null, T(text, { size: 15, color: o.placeholder ? C.muted : C.text })]),
    o.right || (o.select ? ic("chevron-down", 16, C.sub2) : null),
  ]);
  if (o.focus) {
    f.effects = [{ type: "DROP_SHADOW", color: rgba(C.focus, 0.35), offset: { x: 0, y: 0 }, radius: 0, spread: 4, visible: true, blendMode: "NORMAL" }];
  }
  return o.w ? f : fw(f);
}
function label(t) { return T(t, { size: 12, w: 600, color: C.sub, upper: true, ls: 14 }); }
function field(lbl, inp, hint) {
  return fw(col({ gap: 8, name: `Field / ${lbl}` }, [label(lbl), inp, hint ? T(hint, { size: 12.5, color: C.sub, fill: true }) : null]));
}
// Table in a bordered rounded box with a slate-50 header row, like the app's tables.
function table(cols, rows, o) {
  o = o || {};
  const cell = (c, i, head, rh) => {
    const node = typeof c === "string" || typeof c === "number"
      ? T(String(c), head ? { size: 12, w: 600, color: C.sub, upper: true, ls: 12 } : { size: 14.5, w: 500, color: C.text })
      : c;
    const f = row({ pad: [0, 16], h: rh, w: cols[i].w || null, align: "CENTER", justify: cols[i].num ? "MAX" : "MIN", name: `Cell / ${cols[i].label}` }, [node]);
    return cols[i].w ? f : fw(f);
  };
  const head = fw(row({ fill: C.soft, name: "Header row" }, cols.map((c, i) => cell(c.label, i, true, 44))));
  const body = rows.map((r, ri) => {
    const cells = r.cells || r;
    const rr = fw(row({ stroke: C.border, sw: 1, name: r.name || `Row ${ri + 1}` }, cells.map((c, i) => cell(c, i, false, o.rowH || 72))));
    if (r.link) link(rr, r.link);
    return sides(rr, 1, 0, 0, 0);
  });
  return fw(col({ radius: 16, stroke: C.border, sw: C.bw, clip: true, name: o.name || "Table" }, [head].concat(body)));
}
// Two-line cell: bold name + small sub line.
function two(a, b, o) {
  o = o || {};
  return col({ gap: 2 }, [T(a, { size: 14.5, w: o.w || 600, color: C.strong }), b ? T(b, { size: 12.5, color: o.subColor || C.muted }) : null]);
}
function sectionChip(text, iconName) {
  return row({ gap: 6, pad: [4, 10], radius: 999, fill: C.accentSoft, stroke: C.accentBorder, sw: C.bw, align: "CENTER", name: `Section chip / ${text}` }, [
    ic(iconName, 13, C.accent), T(text, { size: 11.5, w: 700, color: C.accent, upper: true, ls: 10 }),
  ]);
}
function trendChip(text, up) {
  const p = up ? C.up : C.down;
  return row({ gap: 4, pad: [3, 8], radius: 999, fill: p[0], stroke: C === HC ? p[1] : null, sw: 1, align: "CENTER" }, [ic(up ? "trending-up" : "trending-down", 13, p[1]), T(text, { size: 12, w: 600, color: p[1] })]);
}
function seg(opts, active) {
  return row({ gap: 2, pad: 3, radius: 12, fill: C.soft2, stroke: C === HC ? "#FFFFFF" : null, sw: 1, align: "CENTER", name: "Segmented control" }, opts.map((o, i) =>
    row({ pad: [6, 12], radius: 9, fill: i === active ? C.card : null, stroke: i === active && C === HC ? "#FFFF00" : null, sw: 2, effects: null, align: "CENTER", name: `Option / ${o}` }, [
      T(o, { size: 12.5, w: 600, color: i === active ? C.strong : C.sub }),
    ])));
}
function iconTile(name, kind, size) {
  const t = C.tone[kind || "dark"];
  return row({ w: size || 40, h: size || 40, radius: 12, fill: t.icon, align: "CENTER", justify: "CENTER", name: "Icon tile" }, [ic(name, Math.round((size || 40) * 0.48), t.iconFg)]);
}
function aiNote(text) { // inline accessibility addition text (purple, never in HC)
  return T(text, { size: 12.5, w: 600, color: C === HC ? "#FFFF00" : NOTE.pin, fill: true });
}

// Accessibility notes frame (always light, never scaled).
function notes(title, items, intro) {
  const savedS = S, savedC = C;
  S = 1; C = LIGHT;
  const tag = (kind) => row({ pad: [2, 8], radius: 999, fill: kind === "Added" ? "#EDE9FE" : "#D1FAE5", align: "CENTER" }, [T(kind, { size: 11.5, w: 700, color: kind === "Added" ? NOTE.added : NOTE.existing })]);
  const f = col({ w: 1440, pad: [28, 40, 36, 40], gap: 16, fill: NOTE.bg, stroke: NOTE.pin, sw: 4, name: `A11y notes / ${title}` }, [
    T(`Accessibility notes — ${title}`, { size: 20, w: 700, color: NOTE.title }),
    intro ? T(intro, { size: 14.5, color: NOTE.text, lh: 150, fill: true }) : null,
    fw(row({ wrap: true, gap: 32, rowGap: 14, name: "Notes" }, items.map((it) => row({ gap: 10, w: 664, name: `Note ${it[0]}` }, [
      pin(it[0]),
      tag(it[1]),
      RT([[it[2] + " ", 700, NOTE.title], it[3]], { size: 14.5, color: NOTE.text, lh: 150, fill: true }),
    ])))),
  ]);
  sides(f, 4, 0, 0, 0);
  S = savedS; C = savedC;
  return f;
}

// ─── Data (from the live app, Oct 7 2026) ──────────────────────────────────
const MONTHS = ["Apr '25", "May '25", "Jun '25", "Jul '25", "Aug '25", "Sep '25", "Oct '25", "Nov '25", "Dec '25", "Jan '26", "Feb '26", "Mar '26", "Apr '26", "May '26", "Jun '26", "Jul '26", "Aug '26", "Sep '26"];
const TREND = [158, 156, 162, 151, 143, 140, 133, 130, 129, 143, 150, 140, 192.7, 178, 186, 170, 177.1, 160.2];
const BUILDINGS = [
  // name, campus/sub, type, coords, area, kWh, eui, status, meters, readings, cost, perMonth, verified
  ["Institute of Computing", "Laboratory", "7.31425, 125.67185", "1,800", "937,453", "366.19", "Critical", 2, 36, "₱11,249,438", "54,928", "32 verified / 4 review"],
  ["Science Laboratory Building", "Office", "7.31461, 125.67102", "1,250", "612,780", "344.09", "Critical", 1, 18, "₱7,353,366", "35,843", "16 verified / 2 review"],
  ["Administration Building", "Office", "7.31389, 125.67127", "2,400", "712,509", "209.20", "High", 1, 18, "₱8,550,104", "41,840", "16 verified / 2 review"],
  ["Student Center", "Support", "7.31318, 125.67214", "1,400", "404,131", "203.41", "High", 1, 18, "₱4,849,568", "23,731", "16 verified / 2 review"],
  ["Learning Resource Center", "Support", "7.31352, 125.67068", "1,600", "266,980", "117.56", "Normal", 1, 18, "₱3,203,763", "15,675", "16 verified / 2 review"],
  ["Maintenance and Storage", "Warehouse", "7.31278, 125.67035", "900", "76,472", "59.97", "Normal", 1, 18, "₱917,667", "4,497", "16 verified / 2 review"],
  ["GBC-JEMAR", "Warehouse", "7.300496, 125.67505", "1,200", "0", "—", "No Data", 0, 0, "₱0", "—", "0 verified / 0 review"],
  ["New Academic Building", "Office", "7.31497, 125.6715", "1,500", "0", "—", "No Data", 1, 0, "₱0", "—", "0 verified / 0 review"],
  ["KEENLY SHESH", "Commercial", "7.307812, 125.682789", "1,200", "0", "—", "No Data", 0, 0, "₱0", "—", "0 verified / 0 review"],
];
