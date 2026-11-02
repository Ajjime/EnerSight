// EnerSight — accessible high-fidelity prototype builder (Figma plugin).
// Run it once inside a Figma design file (Plugins → Development → EnerSight Prototype Builder).
// It adds a "Components" page (status badge variants, accessibility pin) and an
// "EnerSight Prototype" page with 9 linked screens plus an accessibility-notes frame under each.

// ─── Palettes ──────────────────────────────────────────────────────────────
const LIGHT = {
  name: "Light", bg: "#F8FAFC", card: "#FFFFFF", border: "#CBD5E1", text: "#0F172A", muted: "#475569",
  brand: "#047857", onBrand: "#FFFFFF", brandDark: "#064E3B", brandSoft: "#ECFDF5",
  sidebar: "#022C22", sidebarText: "#D1FAE5", sidebarActive: "#065F46", navLabel: "#A7F3D0", activeText: "#FFFFFF",
  focus: "#1D4ED8", ink: "#FFFFFF", bw: 1, track: "#E2E8F0", selected: "#EFF6FF",
  status: { Normal: ["#047857", "#D1FAE5"], High: ["#92400E", "#FEF3C7"], Critical: ["#B91C1C", "#FEE2E2"], "No data": ["#475569", "#E2E8F0"] },
  stripe: { High: "#B45309", Critical: "#DC2626" },
  warn: ["#92400E", "#FEF3C7", "#F59E0B"], info: ["#1E3A8A", "#EFF6FF", "#93C5FD"], ok: ["#064E3B", "#D1FAE5", "#34D399"],
};
const HC = {
  name: "High contrast", bg: "#000000", card: "#000000", border: "#FFFFFF", text: "#FFFFFF", muted: "#FFFFFF",
  brand: "#FFFF00", onBrand: "#000000", brandDark: "#FFFF00", brandSoft: "#1A1A1A",
  sidebar: "#000000", sidebarText: "#FFFFFF", sidebarActive: "#000000", navLabel: "#FFFF00", activeText: "#FFFF00",
  focus: "#00FFFF", ink: "#000000", bw: 2, track: "#333333", selected: "#000000",
  status: { Normal: ["#7CFC00", "#000000"], High: ["#FFD700", "#000000"], Critical: ["#FF6B6B", "#000000"], "No data": ["#FFFFFF", "#000000"] },
  stripe: { High: "#B45309", Critical: "#DC2626" },
  warn: ["#FFFFFF", "#000000", "#FFFFFF"], info: ["#FFFFFF", "#000000", "#FFFFFF"], ok: ["#FFFFFF", "#000000", "#FFFFFF"],
};
const STATUSES = ["Normal", "High", "Critical", "No data"];
const NOTE = { bg: "#F5F3FF", title: "#4C1D95", text: "#2E1065", pin: "#6D28D9", ring: "#EDE9FE" };

let P = LIGHT; // current palette
let S = 1; // text scale (1.15 = "A+")

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
function solid(h, o) {
  return [{ type: "SOLID", color: rgb(h), opacity: o === undefined ? 1 : o }];
}
function shadow(a) {
  return { type: "DROP_SHADOW", color: { r: 0.06, g: 0.09, b: 0.16, a: a }, offset: { x: 0, y: 2 }, radius: 6, spread: 0, visible: true, blendMode: "NORMAL" };
}

// "Fill container" can only be set once a node sits in an auto-layout parent, and the
// parent's own size must already be settled. So we record the wish by node id and apply
// it top-down after each screen is assembled (see applyFills).
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
  if (o.shadow) f.effects = [shadow(o.shadow === true ? 0.08 : o.shadow)];
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
    if (o.minW) { try { f.minWidth = o.minW; } catch (e) { /* older API */ } }
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
// Place a node at x/y — inside an auto-layout frame it becomes absolutely positioned.
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
  t.fills = solid(o.color || P.text);
  if (o.lh) t.lineHeight = { unit: "PERCENT", value: o.lh };
  if (o.ls) t.letterSpacing = { unit: "PERCENT", value: o.ls };
  if (o.upper) t.textCase = "UPPER";
  if (o.underline) t.textDecoration = "UNDERLINE";
  if (o.align) t.textAlignHorizontal = o.align;
  if (o.width) { t.textAutoResize = "HEIGHT"; t.resize(o.width, t.height); }
  else t.textAutoResize = "WIDTH_AND_HEIGHT";
  t.name = o.name || String(str).slice(0, 40);
  return o.fill ? fw(t) : t;
}
// Rich text: parts are "plain" strings or [text, weight, colour].
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
function svg(inner, size, vb, name) {
  const n = figma.createNodeFromSvg(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${vb} ${vb}">${inner}</svg>`,
  );
  n.fills = [];
  n.name = name || "icon";
  return n;
}
function I(path, size, color, name) {
  return svg(`<g fill="${color || P.text}">${path}</g>`, size || 20, 24, name);
}

// ─── Icons ─────────────────────────────────────────────────────────────────
const ICONS = {
  Dashboard: '<path d="M3 13h8V3H3zm10 8h8V11h-8zM3 21h8v-6H3zm10-18v6h8V3z"/>',
  "GIS Map": '<path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/>',
  Buildings: '<path d="M4 21V5l8-3 8 3v16h-6v-5h-4v5zM8 8h2v2H8zm6 0h2v2h-2zm-6 4h2v2H8zm6 0h2v2h-2z"/>',
  Meters: '<path d="M12 4a9 9 0 0 0-9 9h2a7 7 0 0 1 14 0h2a9 9 0 0 0-9-9zm4.2 4.4-5 4.2a1.6 1.6 0 1 0 2.2 2.2l4.2-5z"/>',
  "Add Meter Reading": '<path d="M9 3 7.2 5H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.2L15 3zm3 14a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z"/>',
  Reports: '<path d="M6 2h9l5 5v15H6zm8 1.5V8h4.5M9 12h8v2H9zm0 4h8v2H9z"/>',
  Analytics: '<path d="M4 20V10h3v10zm6.5 0V4h3v16zM17 20v-7h3v7z"/>',
  Users: '<path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 9c0-3.3 3.1-6 7-6s7 2.7 7 6zm15.5-9a3 3 0 1 0 0-6v6zM18 14c2.4.5 4 2.3 4 6h-4"/>',
  Profile: '<path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm-8 10c0-4 3.6-7 8-7s8 3 8 7z"/>',
  Settings: '<path d="M19.4 13a7.5 7.5 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.6 7.6 0 0 0-1.7-1L15 3h-4l-.4 2.7a7.6 7.6 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.5 7.5 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1c.5.4 1.1.7 1.7 1L11 21h4l.4-2.7c.6-.3 1.2-.6 1.7-1l2.5 1 2-3.5zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  warn: '<path d="M12 2 1 21h22zm-1 7h2v6h-2zm0 8h2v2h-2z"/>',
  info: '<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 15h-2v-6h2zm0-8h-2V7h2z"/>',
  ok: '<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-1.5 14.5-4-4 1.4-1.4 2.6 2.6 5.6-5.6 1.4 1.4z"/>',
  speaker: '<path d="M3 9v6h4l5 5V4L7 9zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4z"/>',
  contrast: '<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 2v16a8 8 0 0 1 0-16z"/>',
  mic: '<path d="M12 15a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v7a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V22h2v-3.1a7 7 0 0 0 6-6.9z"/>',
  keyboard: '<path d="M2 6h20v12H2zm2 2v2h2V8zm3 0v2h2V8zm3 0v2h2V8zm3 0v2h2V8zm3 0v2h2V8zM4 11v2h2v-2zm3 0v2h2v-2zm3 0v2h2v-2zm3 0v2h2v-2zm3 0v2h2v-2zM7 14v2h10v-2z"/>',
  print: '<path d="M6 2h12v5H6zM4 8h16a2 2 0 0 1 2 2v7h-4v5H6v-5H2v-7a2 2 0 0 1 2-2zm4 9v3h8v-3z"/>',
  chevron: '<path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.4"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3"/>',
  close: '<path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2.4"/>',
  eye: '<path d="M12 5C6 5 2 12 2 12s4 7 10 7 10-7 10-7-4-7-10-7zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8z"/>',
  ear: '<path d="M12 2a7 7 0 0 0-7 7h2.5a4.5 4.5 0 0 1 9 0c0 2.6-3.5 3.6-3.5 7a2.5 2.5 0 0 1-5 0H5.5a5 5 0 0 0 10 0c0-2 3.5-3.4 3.5-7a7 7 0 0 0-7-7z"/>',
  hand: '<path d="M8 11V4.5a1.5 1.5 0 0 1 3 0V10h1V3.5a1.5 1.5 0 0 1 3 0V10h1V5.5a1.5 1.5 0 0 1 3 0V15a7 7 0 0 1-12.6 4.2L2.6 15a1.6 1.6 0 0 1 2.5-2z"/>',
  brain: '<path d="M9 3a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 1 5 3 3 0 0 0 4 3h2V3zm6 0a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-1 5 3 3 0 0 1-4 3h-2V3z"/>',
  palette: '<path d="M12 2a10 10 0 0 0 0 20c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.4A5.6 5.6 0 0 0 22 9.8C22 5.5 17.5 2 12 2zM6.5 13a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm3-4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm3 4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/>',
};
function icon(name, size, color) {
  const path = ICONS[name].replace(/currentColor/g, color || P.text);
  return I(path, size, color, `icon/${name}`);
}
// Status shapes (16×16): ✓ circle, ▲ triangle, ✕ octagon, dashed circle.
function statusIcon(st, size, fg, ink) {
  const S16 = {
    Normal: `<circle cx="8" cy="8" r="7" fill="${fg}"/><path d="M4.5 8.2l2.2 2.2 4.8-4.8" stroke="${ink}" stroke-width="2" fill="none"/>`,
    High: `<path d="M8 1 15 14H1z" fill="${fg}"/><path d="M8 6v4M8 11.5v1" stroke="${ink}" stroke-width="1.8"/>`,
    Critical: `<path d="M5 1h6l4 4v6l-4 4H5l-4-4V5z" fill="${fg}"/><path d="M5.5 5.5l5 5m0-5-5 5" stroke="${ink}" stroke-width="1.8"/>`,
    "No data": `<circle cx="8" cy="8" r="6.5" fill="none" stroke="${fg}" stroke-width="1.5" stroke-dasharray="2 2"/><path d="M5 8h6" stroke="${fg}" stroke-width="1.8"/>`,
  };
  return svg(S16[st], size, 16, `status/${st}`);
}

// ─── Components (built once on the Components page) ────────────────────────
let BADGES = null;
let PIN = null;
function buildComponents(page) {
  const saved = P;
  const comps = [];
  for (const pal of [LIGHT, HC]) {
    P = pal;
    for (const st of STATUSES) {
      const c = figma.createComponent();
      const fg = pal.status[st][0];
      layout(c, { dir: "HORIZONTAL", gap: 6, pad: [4, 10], fill: pal.status[st][1], radius: 999, stroke: fg, sw: pal.bw, align: "CENTER", name: `Status=${st}, Theme=${pal.name}` }, [
        statusIcon(st, 14, fg, pal.ink),
        T(st, { size: 12.5, w: 600, color: fg, name: "Label" }),
      ]);
      comps.push(c);
    }
  }
  P = saved;
  BADGES = figma.combineAsVariants(comps, page);
  BADGES.name = "Status badge";
  comps.forEach((c, i) => { c.x = 24 + (i % 4) * 200; c.y = 24 + Math.floor(i / 4) * 56; });
  BADGES.resize(24 + 4 * 200, 24 + 2 * 56 + 8);
  BADGES.fills = solid("#FFFFFF");
  BADGES.x = 0; BADGES.y = 0;

  PIN = figma.createComponent();
  layout(PIN, { dir: "HORIZONTAL", w: 26, h: 26, radius: 999, fill: NOTE.pin, align: "CENTER", justify: "CENTER", name: "A11y pin" }, [
    T("1", { size: 12, w: 700, color: "#FFFFFF", name: "Number" }),
  ]);
  PIN.strokes = solid(NOTE.ring);
  PIN.strokeWeight = 3;
  PIN.strokeAlign = "OUTSIDE";
  PIN.description = "Accessibility annotation marker. Explained in the notes frame under each screen.";
  page.appendChild(PIN);
  PIN.x = 0; PIN.y = 180;

  const legend = col({ gap: 6, pad: 0, name: "About these components" }, [
    T("Status badge: every EUI status has a unique shape + word + colour (WCAG 1.4.1).", { size: 14, color: "#0F172A" }),
    T("A11y pin: purple numbered marker for accessibility annotations.", { size: 14, color: "#0F172A" }),
  ]);
  page.appendChild(legend);
  legend.x = 0; legend.y = 230;
}
function badge(st, label) {
  const comp = BADGES.findChild((n) => n.name === `Status=${st}, Theme=${P.name}`);
  const inst = comp.createInstance();
  if (label) inst.findOne((n) => n.type === "TEXT").characters = label;
  return inst;
}
function pin(n) {
  const inst = PIN.createInstance();
  inst.findOne((x) => x.type === "TEXT").characters = String(n);
  return inst;
}

// ─── Prototype links (applied after every screen exists) ───────────────────
const LINKS = [];
function link(node, target) { LINKS.push([node, target]); return node; }
const NAV = [
  ["Monitor", ["Dashboard", "GIS Map", "Buildings", "Meters", "Add Meter Reading"]],
  ["Insights", ["Reports", "Analytics"]],
  ["Account", ["Users", "Profile", "Settings"]],
];
const NAV_TARGET = { Dashboard: "s02", "GIS Map": "s04", Buildings: "s05", "Add Meter Reading": "s03", Reports: "s06", Settings: "s07" };

// ─── Shared UI pieces ──────────────────────────────────────────────────────
function logo(light) {
  return row({ gap: 10, align: "CENTER", name: "Logo" }, [
    row({ w: 36, h: 36, radius: 12, fill: "#10B981", align: "CENTER", justify: "CENTER", name: "Logo mark" }, [icon("bolt", 20, "#022C22")]),
    T("EnerSight", { size: 20, w: 700, color: light ? "#FFFFFF" : P.text }),
  ]);
}
function btn(label, o) {
  o = o || {};
  const primary = o.kind === "primary";
  const fg = primary ? P.onBrand : P.text;
  const b = row({ gap: 8, pad: o.lg ? [14, 24] : [12, 18], radius: 12, fill: primary ? P.brand : P.card, stroke: primary ? P.brand : P.border, sw: P.bw, align: "CENTER", justify: "CENTER", minH: o.lg ? 52 : 44, name: `Button / ${label}` }, [
    o.icon ? icon(o.icon, 18, fg) : null,
    T(label, { size: o.lg ? 16 : 14.5, w: 600, color: fg }),
  ]);
  if (o.focus) focusRing(b);
  return o.fill ? fw(b) : b;
}
function focusRing(n) {
  n.strokes = solid(P.focus);
  n.strokeWeight = 3;
  n.strokeAlign = "OUTSIDE";
  return n;
}
function seg(opts, active, name) {
  return row({ radius: 12, stroke: P.border, sw: P.bw, clip: true, name: name || "Segmented control" },
    opts.map((o, i) => row({ pad: [11, 14], fill: i === active ? P.brand : P.card, align: "CENTER", name: `Option / ${o}` }, [
      T(o, { size: 13.5, w: 600, color: i === active ? P.onBrand : P.text }),
    ])));
}
function titleRow(title, pinNo, size) {
  return row({ gap: 10, align: "CENTER", name: "Title" }, [T(title, { size: size || 18, w: 700 }), pinNo ? pin(pinNo) : null]);
}
function card(title, pinNo, kids, o) {
  o = o || {};
  const head = title ? titleRow(title, pinNo) : null;
  const headRow = o.right ? fw(row({ justify: "SPACE_BETWEEN", align: "CENTER", name: "Card header" }, [head, o.right])) : head;
  const c = col({ gap: o.gap === undefined ? 16 : o.gap, pad: o.pad || [20, 24], fill: P.card, radius: 16, stroke: P.border, sw: P.bw, shadow: true, w: o.w, name: o.name || `Card / ${title}` }, [headRow].concat(kids));
  return o.w ? c : fw(c);
}
function callout(kind, parts, o) {
  o = o || {};
  const c = P[kind];
  return fw(row({ gap: 12, pad: [14, 16], radius: 12, fill: c[1], stroke: c[2], sw: P.bw, name: `Callout / ${kind}` }, [
    o.pin ? pin(o.pin) : null,
    icon(kind, 20, c[0]),
    RT(parts, { size: 14, color: c[0], lh: 150, fill: true }),
  ]));
}
function errorMsg(text) {
  const fg = P.status.Critical[0];
  return row({ gap: 6, align: "CENTER", name: "Error message" }, [statusIcon("Critical", 16, fg, P.ink), T(text, { size: 13.5, w: 600, color: fg })]);
}
function input(value, o) {
  o = o || {};
  const crit = P.status.Critical[0];
  const f = row({ gap: 8, pad: [12, 14], radius: 12, fill: P.card, stroke: o.error ? crit : P.border, sw: o.error ? 2 : P.bw, align: "CENTER", justify: "SPACE_BETWEEN", w: o.w, minH: 48, name: o.name || "Input" }, [
    T(value, { size: o.size || 16, color: P.text }),
    o.select ? icon("chevron", 18, P.text) : null,
    o.suffix || null,
  ]);
  return o.w ? f : fw(f);
}
function field(label, inp, o) {
  o = o || {};
  return fw(col({ gap: 6, name: `Field / ${label}` }, [
    o.labelRow || T(label, { size: 14, w: 600 }),
    o.hint ? T(o.hint, { size: 12.5, color: P.muted }) : null,
    inp,
  ]));
}
function checkbox(label, on) {
  return row({ gap: 10, align: "CENTER", minH: 44, name: `Checkbox / ${label}` }, [
    row({ w: 22, h: 22, radius: 6, fill: on ? P.brand : P.card, stroke: on ? P.brand : P.muted, sw: 2, align: "CENTER", justify: "CENTER" }, [on ? icon("check", 16, P.onBrand) : null]),
    T(label, { size: 14.5 }),
  ]);
}
function kbd(k) {
  return row({ pad: [2, 8], radius: 6, fill: P.bg, stroke: P.border, sw: 1, name: `Key / ${k}` }, [T(k, { size: 12.5, w: 700 })]);
}
// Table: cols = [{label, w (0 = fill), num}], rows = arrays of strings or nodes.
function table(cols, rows, o) {
  o = o || {};
  const mk = (cells, head, bold) => {
    const r = fw(row({ stroke: P.border, sw: 1, align: "CENTER", name: head ? "Header row" : "Row" }, cells.map((c, i) => {
      const cell = row({ pad: [head ? 10 : 12, 12], w: cols[i].w || null, justify: cols[i].num ? "MAX" : "MIN", align: "CENTER", name: `Cell / ${cols[i].label}` }, [
        typeof c === "string"
          ? T(c, head ? { size: 12, w: 600, color: P.muted, upper: true, ls: 8 } : { size: 14.5, w: bold ? 700 : 400 })
          : c,
      ]);
      return cols[i].w ? cell : fw(cell);
    })));
    return sides(r, 0, 0, head ? 2 : 1, 0);
  };
  return fw(col({ name: o.name || "Table" }, [
    o.caption ? row({ pad: [0, 0, 8, 0] }, [T(o.caption, { size: 14.5, w: 600 })]) : null,
    mk(cols.map((c) => c.label), true),
  ].concat(rows.map((r) => mk(r.cells || r, false, r.bold)))));
}

function sidebar(active) {
  const kids = [row({ pad: [0, 8, 20, 8] }, [logo(true)])];
  for (const g of NAV) {
    kids.push(row({ pad: [16, 12, 6, 12], name: `Group / ${g[0]}` }, [T(g[0], { size: 11.5, w: 600, color: P.navLabel, upper: true, ls: 14 })]));
    for (const n of g[1]) {
      const on = n === active;
      const color = on ? P.activeText : P.sidebarText;
      const it = fw(row({ gap: 12, pad: [11, 12], radius: 12, align: "CENTER", fill: on ? P.sidebarActive : null, minH: 44, name: `Nav / ${n}` }, [
        icon(n, 20, color),
        T(n, { size: 15, w: on ? 600 : 500, color }),
      ]));
      if (on) {
        if (P === HC) { it.strokes = solid("#FFFF00"); it.strokeWeight = 2; it.strokeAlign = "INSIDE"; }
        else { it.strokes = solid("#A3E635"); it.strokeAlign = "INSIDE"; sides(it, 0, 0, 0, 4); }
      }
      if (NAV_TARGET[n]) link(it, NAV_TARGET[n]);
      kids.push(it);
    }
  }
  return fh(col({ w: 256, pad: [24, 16], gap: 4, fill: P.sidebar, name: "Sidebar" }, kids));
}
let lastHcButton = null;
function toolbar(withRead) {
  const tb = (label, on, ic) => row({ gap: 6, pad: [10, 12], radius: 999, fill: on ? P.brand : null, align: "CENTER", minW: 44, minH: 40, justify: "CENTER", name: `Toolbar / ${label}` }, [
    ic ? icon(ic, 16, on ? P.onBrand : P.text) : null,
    T(label, { size: 13.5, w: 600, color: on ? P.onBrand : P.text }),
  ]);
  const sep = () => R(1, 24, P.border, { name: "Separator" });
  const hc = tb("High contrast", P === HC, "contrast");
  lastHcButton = hc;
  return row({ gap: 4, pad: 4, radius: 999, stroke: P.border, sw: P.bw, fill: P.bg, align: "CENTER", name: "Accessibility toolbar" }, [
    pin("A"), tb("A", S === 1), tb("A+", S > 1), tb("A++", false), sep(), hc,
    withRead === false ? null : tb("Read aloud", false, "speaker"),
    sep(), tb("EN", true), tb("CEB", false),
  ]);
}
function topbar(crumb) {
  const bar = fw(row({ h: 72, pad: [0, 32], fill: P.card, stroke: P.border, sw: P.bw, justify: "SPACE_BETWEEN", align: "CENTER", name: "Top bar" }, [
    T(crumb, { size: 16, w: 600 }),
    toolbar(),
    row({ gap: 10, align: "CENTER", name: "User" }, [
      row({ w: 40, h: 40, radius: 999, fill: P.brandSoft, stroke: P.border, sw: 1, align: "CENTER", justify: "CENTER", name: "Avatar" }, [T("JM", { size: 14, w: 700, color: P.brandDark })]),
      T("Juan Mendoza", { size: 14.5, w: 600 }),
      T("· Admin", { size: 13, color: P.muted }),
    ]),
  ]));
  return sides(bar, 0, 0, P.bw, 0);
}
function pageHead(title, sub, right) {
  return fw(row({ justify: "SPACE_BETWEEN", align: "MAX", name: "Page header" }, [
    col({ gap: 4 }, [T(title, { size: 28, w: 700 }), T(sub, { size: 15, color: P.muted })]),
    right || null,
  ]));
}
function appScreen(name, nav, crumb, content) {
  const main = fw(col({ name: "Main" }, [
    topbar(crumb),
    fw(col({ pad: [28, 32, 40, 32], gap: 24, name: "Content" }, content)),
  ]));
  return row({ w: 1440, fill: P.bg, minH: 1024, name }, [sidebar(nav), main]);
}

// Accessibility notes frame (always light, never scaled), placed under each screen.
function notes(title, items, intro) {
  const savedS = S;
  S = 1;
  const f = col({ w: 1440, pad: [28, 40, 36, 40], gap: 16, fill: NOTE.bg, stroke: NOTE.pin, sw: 4, name: `A11y notes / ${title}` }, [
    T(`Accessibility notes — ${title}`, { size: 20, w: 700, color: NOTE.title }),
    intro ? T(intro, { size: 14.5, color: NOTE.text, lh: 150, fill: true }) : null,
    fw(row({ wrap: true, gap: 32, rowGap: 14, name: "Notes" }, items.map((it) => row({ gap: 12, w: 664, name: `Note ${it[0]}` }, [
      pin(it[0]),
      RT([[it[1] + " ", 700, NOTE.title], it[2]], { size: 14.5, color: NOTE.text, lh: 150, fill: true }),
    ])))),
  ]);
  sides(f, 4, 0, 0, 0);
  S = savedS;
  return f;
}

// ─── Data ──────────────────────────────────────────────────────────────────
const RANK = [
  ["Science Laboratory Building", 284, "Critical", "North wing"],
  ["Institute of Computing", 262, "Critical", "North wing"],
  ["Administration Building", 198, "High", "Main gate"],
  ["Learning Resource Center", 171, "High", "East side"],
  ["Student Center", 122, "Normal", "Quadrangle"],
  ["New Academic Building", 96, "Normal", "South wing"],
  ["Maintenance and Storage", null, "No data", "No reading this month"],
];
const MONTHS = [["Jan", 15200], ["Feb", 14800], ["Mar", 16900], ["Apr", 17600], ["May", 18100], ["Jun", 16400], ["Jul", 15900], ["Aug", 17000], ["Sep (now)", 18420]];

function stripes(w, h, base, alt, vertical) {
  let lines = "";
  if (vertical) for (let x = 0; x < w; x += 8) lines += `<rect x="${x}" y="0" width="4" height="${h}" fill="${alt}"/>`;
  else for (let x = -h; x < w + h; x += 9) lines += `<path d="M${x} ${h} L${x + h} 0" stroke="${alt}" stroke-width="3"/>`;
  return figma.createNodeFromSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${base}"/>${lines}</svg>`);
}
function euiBar(eui, st, w) {
  const track = F({ dir: "NONE", w: w, h: 14, radius: 7, fill: P.track, clip: true, name: "EUI bar" });
  if (eui) {
    const bw = Math.round((eui / 300) * w);
    const fg = P.status[st][0];
    const bar = st === "Normal" ? R(bw, 14, fg, { radius: 7 }) : stripes(bw, 14, fg, P.stripe[st], st === "High");
    bar.name = `Bar / ${st}`;
    put(track, bar, 0, 0);
  }
  return track;
}

// ─── Screens ───────────────────────────────────────────────────────────────
function s00Cover() {
  const tile = (key, num, name, desc) => link(col({ w: 305, radius: 16, fill: "#FFFFFF", clip: true, shadow: 0.25, name: `Tile / ${name}` }, [
    fw(row({ h: 120, fill: "#ECFDF5", align: "CENTER", justify: "CENTER" }, [T(num, { size: 44, w: 700, color: "#047857" })])),
    fw(col({ pad: [14, 16], gap: 4 }, [T(name, { size: 16, w: 700, color: "#0F172A" }), T(desc, { size: 13.5, color: "#475569", fill: true })])),
  ]), key);
  const who = (ic, title, desc) => {
    const box = fw(col({ gap: 6, pad: 16, radius: 16, fill: "#FFFFFF", fillOpacity: 0.08, stroke: "#FFFFFF", strokeOpacity: 0.3, name: `Who / ${title}` }, [
      row({ gap: 8, align: "CENTER" }, [icon(ic, 20, "#A3E635"), T(title, { size: 16, w: 700, color: "#FFFFFF" })]),
      T(desc, { size: 14, color: "#D1FAE5", lh: 150, fill: true }),
    ]));
    return box;
  };
  const f = col({ w: 1440, minH: 1024, pad: [64, 80], gap: 40, name: "00 Cover" }, [
    logo(true),
    col({ gap: 12 }, [
      T("Accessible System Mock-up", { size: 48, w: 700, color: "#FFFFFF" }),
      T("EnerSight is a campus building energy monitoring system with meter-photo OCR, EUI status grading, a GIS map, analytics, forecasts and printable reports. This prototype shows how each screen supports users with accessibility needs. Purple numbered pins mark each accessibility feature; they are explained in the notes under every screen. Press ▶ Present to click through.", { size: 18, color: "#D1FAE5", lh: 155, width: 860 }),
    ]),
    fw(col({ gap: 14 }, [
      T("Who this design supports", { size: 20, w: 700, color: "#FFFFFF" }),
      fw(row({ gap: 14 }, [
        who("eye", "Low vision", "Text size A/A+/A++, high contrast, read aloud, large-print reports"),
        who("palette", "Colour blindness", "Every status has a shape + word, striped bars, colour-blind palette"),
        who("keyboard", "Blind / keyboard", "Skip link, focus ring, map list view, data tables, alt text"),
        who("hand", "Motor disabilities", "44px+ targets, voice input, manual entry, longer timeouts"),
        who("brain", "Cognitive & language", "Plain-language summaries, step indicator, Cebuano, error prevention"),
      ])),
    ])),
    fw(col({ gap: 14 }, [
      T("Screens", { size: 20, w: 700, color: "#FFFFFF" }),
      fw(row({ wrap: true, gap: 20, rowGap: 20 }, [
        tile("s01", "01", "Sign In", "Toolbar before login, clear errors"),
        tile("s02", "02", "Dashboard", "Shape-coded status, chart summary"),
        tile("s03", "03", "Add Meter Reading", "OCR with voice + manual entry"),
        tile("s04", "04", "GIS Map", "Map + accessible list view"),
        tile("s05", "05", "Building Profile", "Plain-language EUI, data tables"),
        tile("s06", "06", "Reports", "Tagged PDF, large print"),
        tile("s07", "07", "Accessibility Settings", "See · hear · move · understand"),
        tile("s08", "08", "High Contrast + Large", "Dashboard with settings applied"),
      ])),
    ])),
  ]);
  f.fills = [{ type: "GRADIENT_LINEAR", gradientTransform: [[0.6, 0.6, -0.1], [-0.6, 0.6, 0.5]], gradientStops: [
    { position: 0, color: Object.assign(rgb("#022C22"), { a: 1 }) },
    { position: 0.55, color: Object.assign(rgb("#065F46"), { a: 1 }) },
    { position: 1, color: Object.assign(rgb("#047857"), { a: 1 }) },
  ] }];
  return f;
}

function s01SignIn() {
  const left = fh(fw(col({ pad: [56, 64], justify: "SPACE_BETWEEN", name: "Brand panel" }, [
    logo(true),
    col({ gap: 28 }, [
      T("Campus energy monitoring everyone can use.", { size: 40, w: 700, color: "#FFFFFF", width: 500, lh: 120 }),
      col({ gap: 14 }, [
        "Snap a meter photo — OCR reads the value for you",
        "See which buildings use too much energy, in plain words",
        "Works with keyboard, screen readers and large text",
      ].map((s) => row({ gap: 12, align: "CENTER" }, [
        row({ w: 28, h: 28, radius: 999, fill: "#A3E635", fillOpacity: 0.2, align: "CENTER", justify: "CENTER" }, [icon("check", 16, "#A3E635")]),
        T(s, { size: 16, color: "#ECFDF5" }),
      ]))),
    ]),
    T("Capstone Project · Building Energy Monitoring System", { size: 13.5, color: "#A7F3D0" }),
  ])));
  left.fills = [{ type: "GRADIENT_LINEAR", gradientTransform: [[0.6, 0.6, -0.1], [-0.6, 0.6, 0.5]], gradientStops: [
    { position: 0, color: Object.assign(rgb("#022C22"), { a: 1 }) },
    { position: 0.6, color: Object.assign(rgb("#065F46"), { a: 1 }) },
    { position: 1, color: Object.assign(rgb("#047857"), { a: 1 }) },
  ] }];

  const pwLabel = fw(row({ justify: "SPACE_BETWEEN", align: "CENTER" }, [T("Password", { size: 14, w: 600 }), pin(3)]));
  const pw = input("••••••••••", { error: true, suffix: row({ pad: [8, 12], radius: 10, fill: P.card, stroke: P.border, sw: 1, name: "Button / Show" }, [T("Show", { size: 14, w: 600 })]) });
  const signIn = btn("Sign in", { kind: "primary", lg: true, fill: true, focus: true });
  signIn.insertChild(0, pin(4));
  link(signIn, "s02");

  const form = col({ w: 460, gap: 20, name: "Sign-in form" }, [
    col({ gap: 4 }, [T("Sign in", { size: 30, w: 700 }), T("Use your campus account to continue.", { size: 15, color: P.muted })]),
    callout("warn", [["We couldn't sign you in. ", 700], "The password is incorrect. Check that Caps Lock is off and try again."], { pin: 2 }),
    field("Username", input("jmendoza")),
    field("Password", pw, { labelRow: pwLabel }),
    errorMsg("Incorrect password. Caps Lock is ON."),
    checkbox("Keep me signed in on this device", false),
    signIn,
    RT(["No account yet? ", ["Request access", 600, P.brandDark], " · ", ["Forgot password?", 600, P.brandDark]], { size: 13.5, color: P.muted }),
  ]);
  const tbRow = fw(row({ justify: "MAX" }, [toolbar(false)]));
  tbRow.children[0].insertChild(0, pin(1));
  const right = fh(fw(col({ pad: [40, 96], gap: 150, fill: P.card, name: "Form panel" }, [tbRow, form])));
  return row({ w: 1440, h: 1024, name: "01 Sign In" }, [left, right]);
}

function dashboard(name) {
  const rank = RANK.map((r) => {
    const nm = T(r[0], { size: 14.5, w: 600, width: 200 });
    const line = fw(row({ gap: 12, align: "CENTER", minH: 44, name: `Rank / ${r[0]}` }, [
      nm, euiBar(r[1], r[2], 220), T(r[1] ? String(r[1]) : "—", { size: 15, w: 700, width: 44 }), badge(r[2]),
    ]));
    if (r[0] === "Science Laboratory Building") link(line, "s05");
    return line;
  });
  const attn = [
    ["Critical", "Critical", [["Science Laboratory Building", 700], " uses almost ", ["twice", 700], " the normal energy for its size. Check air-conditioners and lab equipment left on overnight."], null],
    ["High", "Review", [["2 meter readings", 700], " were read by OCR with low confidence. Please confirm the numbers. ", ["Review now", 600, P.brandDark]], "s03"],
    ["No data", "No data", [["Maintenance and Storage", 700], " has no reading yet this month."], null],
  ].map((a) => {
    const it = fw(row({ gap: 12, pad: 14, radius: 12, stroke: P.border, sw: P.bw, name: `Attention / ${a[1]}` }, [badge(a[0], a[1]), RT(a[2], { size: 14.5, lh: 150, fill: true })]));
    if (a[3]) link(it, a[3]);
    return it;
  });

  const chart = F({ dir: "NONE", w: 1060, h: 250, name: "Bar chart · monthly kWh" });
  put(chart, R(1000, 1, P.muted), 40, 210);
  MONTHS.forEach((m, i) => {
    const x = 70 + i * 110;
    const h = Math.round(m[1] / 100);
    const cur = i === MONTHS.length - 1;
    const bar = cur ? stripes(70, h, "#047857", "#064E3B", false) : R(70, h, "#6EE7B7", { radius: 6 });
    bar.name = `Bar / ${m[0]}`;
    if (cur) { bar.strokes = solid(P === HC ? "#FFFFFF" : "#064E3B"); bar.strokeWeight = 2; }
    put(chart, bar, x, 210 - h);
    const v = T((m[1] / 1000).toFixed(1) + "k", { size: 12, w: 600 });
    put(chart, v, x + 35 - v.width / 2, 210 - h - 22);
    const lb = T(m[0], { size: 12, w: cur ? 600 : 400, color: cur ? P.text : P.muted });
    put(chart, lb, x + 35 - lb.width / 2, 220);
  });

  const stat = (label, value, unit, sub) => fw(col({ gap: 6, pad: [20, 24], fill: P.card, radius: 16, stroke: P.border, sw: P.bw, shadow: true, name: `Stat / ${label}` }, [
    T(label, { size: 12.5, w: 600, color: P.muted, upper: true, ls: 8 }),
    row({ gap: 6, align: "BASELINE" }, [T(value, { size: 30, w: 700 }), unit ? T(unit, { size: 15, w: 500, color: P.muted }) : null]),
    T(sub, { size: 13.5, color: P.muted, fill: true }),
  ]));

  const root = appScreen(name, "Dashboard", "Dashboard", [
    pageHead("Energy Monitoring Dashboard", "Monitor buildings, consumption, OCR readings, and reports.", seg(["This month", "Last month", "This year"], 0, "Period")),
    fw(row({ gap: 20, name: "Stats" }, [
      stat("Buildings", "7", null, "6 mapped with GIS coordinates"),
      stat("Consumption", "18,420", "kWh", "≈ ₱221,040 estimated bill"),
      stat("Highest EUI", "284", "kWh/m²/yr", "Science Laboratory Building"),
      stat("Readings", "42", null, "40 verified · 2 need review"),
    ])),
    fw(row({ gap: 20, name: "Ranking + attention" }, [
      card("Building EUI ranking", 2, [col({ gap: 10 }, rank)], { right: T("High > 150 · Critical > 250 kWh/m²/yr", { size: 13, color: P.muted }) }),
      card("Needs your attention", 3, attn, { w: 440, gap: 12 }),
    ])),
    card("Monthly consumption, 2026", 4, [
      RT([["Summary: ", 700], "September used 18,420 kWh, ", ["up 8%", 700], " from August (17,000 kWh) and the highest month this year."], { size: 15, fill: true }),
      chart,
      row({ gap: 18, align: "CENTER", name: "Legend" }, [
        row({ gap: 6, align: "CENTER" }, [R(14, 14, "#6EE7B7", { radius: 4 }), T("Past months", { size: 13.5, color: P.muted })]),
        row({ gap: 6, align: "CENTER" }, [stripes(14, 14, "#047857", "#064E3B", false), T("Current month (striped)", { size: 13.5, color: P.muted })]),
      ]),
    ], { right: seg(["Chart", "Data table"], 0, "Show as") }),
  ]);
  link(lastHcButton, name.indexOf("08") === 0 ? "s02" : "s08");
  return root;
}

function s03AddReading() {
  const step = (n, label, state) => {
    const done = state === "done";
    const c = done ? P.brandDark : state === "now" ? P.text : P.muted;
    const s = fw(row({ gap: 10, pad: [12, 16], align: "CENTER", stroke: done ? P.brand : state === "now" ? P.focus : P.border, sw: 1, name: `Step ${n}` }, [
      row({ w: 30, h: 30, radius: 999, fill: done ? P.brand : null, stroke: done ? P.brand : P.focus, sw: 2, align: "CENTER", justify: "CENTER" }, [
        done ? icon("check", 16, P.onBrand) : T(String(n), { size: 14, w: 700, color: P.focus }),
      ]),
      T(`${n}. ${label}`, { size: 14.5, w: 600, color: c }),
    ]));
    return sides(s, 0, 0, 4, 0);
  };

  const photo = F({ dir: "NONE", w: 372, h: 200, fill: "#334155", name: "Meter photo (alt: meter SLB-01 reads 087654)" });
  put(photo, R(290, 140, "#E2E8F0", { radius: 18 }), 41, 30);
  put(photo, R(230, 56, "#0F172A", { radius: 6 }), 71, 70);
  "087654".split("").forEach((d, i) => {
    const t = T(d, { size: 34, w: 700, color: i === 5 ? "#FCA5A5" : "#F8FAFC" });
    put(photo, t, 84 + i * 37 + 9 - t.width / 2 + 4, 76);
  });
  put(photo, T("kWh", { size: 13, color: "#334155" }), 172, 138);
  put(photo, R(238, 64, null, { radius: 8, stroke: "#22C55E", sw: 3, name: "OCR area" }), 67, 66);

  const left = card("Meter photo", 2, [
    field("Meter", input("Science Laboratory Building — SLB-01", { select: true, size: 15 })),
    col({ radius: 12, stroke: P.border, sw: 1, clip: true, name: "Figure" }, [
      photo,
      fw(row({ pad: [8, 12] }, [T("Green box = the area the OCR read. Photo taken Oct 7, 2026, 9:14 AM.", { size: 12.5, color: P.muted, fill: true })])),
    ]),
    fw(col({ gap: 14, pad: 24, radius: 16, fill: P.brandSoft, stroke: P.brand, sw: 3, dash: [10, 6], align: "CENTER", name: "Drop zone" }, [
      T("Retake or replace photo", { size: 15, w: 700 }),
      row({ gap: 10 }, [btn("Take photo", { kind: "primary", icon: "Add Meter Reading" }), btn("Choose file")]),
      T("or drag a JPG/PNG here · max 10 MB", { size: 13, color: P.muted }),
    ])),
    fw(row({ gap: 12, align: "CENTER", name: "Or" }, [fw(R(10, 1, P.border)), T("OR", { size: 13, w: 600, color: P.muted }), fw(R(10, 1, P.border))])),
    fw(row({ gap: 10, align: "CENTER" }, [btn("Type it", { icon: "keyboard", fill: true }), btn("Say the reading", { icon: "mic", fill: true }), pin(3)])),
  ], { w: 420 });

  const digit = (d, unsure) => {
    const box = row({ w: 58, h: 72, radius: 12, fill: unsure ? P.status.High[1] : P.card, stroke: unsure ? P.status.High[0] : P.border, sw: unsure ? 3 : P.bw, align: "CENTER", justify: "CENTER", name: unsure ? "Digit 6 (uncertain, 71%)" : "Digit" }, [T(d, { size: 32, w: 700 })]);
    if (unsure) { box.effects = [{ type: "DROP_SHADOW", color: Object.assign(rgb(P.focus), { a: 1 }), offset: { x: 0, y: 0 }, radius: 0, spread: 4, visible: true, blendMode: "NORMAL" }]; }
    return box;
  };
  const kv = (k, v, accent) => fw(row({ justify: "SPACE_BETWEEN", align: "CENTER" }, [T(k, { size: 14.5, color: P.muted }), T(v, { size: 14.5, w: 700, color: accent || P.text })]));
  const save = btn("Confirm & save reading", { kind: "primary", lg: true });
  link(save, "s02");

  const right = card("Check the reading", 4, [
    callout("warn", [["Please check the last digit. ", 700], "The OCR is 96% sure overall, but only 71% sure the last digit is a ", ["4", 700], " (it could be a ", ["9", 700], "). The uncertain box is outlined in orange with a ▲ mark."]),
    col({ gap: 8 }, [
      RT([["Reading in kWh", 600], "  — edit any box if it's wrong"], { size: 14, color: P.text }),
      row({ gap: 6, align: "CENTER" }, ["0", "8", "7", "6", "5"].map((d) => digit(d, false)).concat([digit("4", true), T("  ▲ check", { size: 15, w: 700, color: P.status.High[0] })])),
    ]),
    fw(row({ gap: 20 }, [
      fw(col({ gap: 8, pad: [16, 20], radius: 16, stroke: P.border, sw: P.bw, name: "Summary" }, [
        kv("Previous reading (Sep 7)", "087,120"), kv("This reading", "087,654"),
        kv("Used this period", "534 kWh", P.brandDark), kv("Estimated cost (₱12/kWh)", "₱6,408"),
      ])),
      callout("ok", [["Looks reasonable. ", 700], "534 kWh is close to this meter's usual 480–560 kWh per month."]),
    ])),
    field("Note (optional)", input("Reading taken during class hours")),
    fw(row({ gap: 12, justify: "MAX", align: "CENTER" }, [pin(5), btn("Back", { lg: true }), btn("Save as “needs review”", { lg: true }), save])),
  ]);

  return appScreen("03 Add Meter Reading", "Add Meter Reading", "Add Meter Reading", [
    pageHead("Meter Reading OCR", "Upload, verify, and save meter readings."),
    fw(row({ gap: 12, align: "CENTER" }, [pin(1), fw(row({ name: "Progress: step 3 of 3" }, [step(1, "Choose meter", "done"), step(2, "Add photo", "done"), step(3, "Check & save", "now")]))])),
    fw(row({ gap: 20, name: "Columns" }, [left, right])),
  ]);
}

function s04Map() {
  const W = 760, H = 640;
  const map = F({ dir: "NONE", w: W, h: H, radius: 16, fill: "#EEF2EF", stroke: P.border, sw: P.bw, clip: true, name: "Campus map (keyboard: arrows pan, +/− zoom, Tab = next building)" });
  put(map, R(230, 200, "#D9EAD3"), 0, 0);
  put(map, R(220, 210, "#D9EAD3"), 540, 430);
  put(map, R(W, 22, "#FFFFFF"), 0, 289);
  put(map, R(22, H, "#FFFFFF"), 379, 0);
  put(map, R(W, 22, "#FFFFFF"), 0, 489);
  const B = [
    ["Administration", 80, 210, 120, 70, "High"], ["Computing", 250, 120, 110, 80, "Critical"], ["Science Lab", 430, 110, 140, 90, "Critical"],
    ["LRC", 610, 190, 120, 80, "High"], ["Student Center", 110, 350, 140, 90, "Normal"], ["New Academic", 440, 340, 120, 90, "Normal"], ["Maintenance", 620, 340, 110, 70, "No data"],
  ];
  for (const b of B) {
    put(map, R(b[3], b[4], "#CBD5E1", { radius: 4, stroke: "#94A3B8", name: `Building / ${b[0]}` }), b[1], b[2]);
    const cx = b[1] + b[3] / 2, cy = b[2] + b[4] / 2;
    const pinNode = statusIcon(b[5], 36, LIGHT.status[b[5]][0], "#FFFFFF");
    pinNode.name = `Pin / ${b[0]} (${b[5]})`;
    put(map, pinNode, cx - 18, cy - 30);
    const chip = row({ pad: [2, 8], radius: 999, fill: "#FFFFFF", stroke: "#94A3B8", sw: 1, name: `Label / ${b[0]}` }, [T(b[0], { size: 12.5, w: 700, color: "#0F172A" })]);
    put(map, chip, cx - chip.width / 2, cy + 10);
    if (b[0] === "Science Lab") {
      const ring = figma.createEllipse();
      ring.resize(60, 60); ring.fills = []; ring.strokes = solid(P.focus); ring.strokeWeight = 4; ring.dashPattern = [6, 4]; ring.name = "Selected ring";
      put(map, ring, cx - 30, cy - 42);
    }
  }
  const hint = row({ gap: 6, pad: [8, 12], radius: 12, fill: "#0F172A", fillOpacity: 0.9, align: "CENTER", name: "Keyboard hint" }, [
    pin(2), T("Keyboard:", { size: 13, w: 600, color: "#FFFFFF" }), kbd("← ↑ ↓ →"), T("pan ·", { size: 13, color: "#FFFFFF" }),
    kbd("+"), kbd("−"), T("zoom ·", { size: 13, color: "#FFFFFF" }), kbd("Tab"), T("next building", { size: 13, color: "#FFFFFF" }),
  ]);
  put(map, hint, 14, 14);
  const zbtn = (s, nm) => row({ w: 48, h: 48, radius: 12, fill: "#FFFFFF", stroke: "#CBD5E1", sw: 1, align: "CENTER", justify: "CENTER", shadow: 0.15, name: `Map button / ${nm}` }, [T(s, { size: 22, w: 600, color: "#0F172A" })]);
  put(map, col({ gap: 8, name: "Zoom controls" }, [zbtn("+", "Zoom in"), zbtn("−", "Zoom out"), zbtn("◎", "Centre on campus")]), W - 62, 14);

  const full = btn("Full profile →", { kind: "primary", fill: true });
  link(full, "s05");
  const pop = col({ w: 300, gap: 10, pad: 16, radius: 16, fill: P.card, stroke: P.border, sw: P.bw, shadow: 0.25, name: "Popup / Science Laboratory Building" }, [
    fw(row({ justify: "SPACE_BETWEEN", align: "CENTER" }, [T("Science Laboratory Building", { size: 15.5, w: 700 }), row({ w: 36, h: 36, radius: 10, stroke: P.border, sw: 1, align: "CENTER", justify: "CENTER", name: "Close" }, [icon("close", 16, P.text)])])),
    badge("Critical", "Critical · 284 kWh/m²/yr"),
    T("Uses almost twice the normal energy for its size. 4,210 kWh this month (≈ ₱50,520).", { size: 13.5, lh: 150, fill: true }),
    full,
  ]);
  put(map, pop, 340, 110);
  const legend = col({ gap: 8, pad: [12, 14], radius: 12, fill: "#FFFFFF", stroke: "#CBD5E1", sw: 1, name: "Legend" }, [
    row({ gap: 8, align: "CENTER" }, [T("Legend", { size: 14, w: 700, color: "#0F172A" }), pin(3)]),
  ].concat([["Normal", "circle · ≤ 150"], ["High", "triangle · 151–250"], ["Critical", "octagon · > 250"], ["No data", "dashed circle"]].map((l) => {
    const saved = P; P = LIGHT;
    const r = row({ gap: 8, align: "CENTER" }, [badge(l[0]), T(l[1], { size: 13, color: "#0F172A" })]);
    P = saved;
    return r;
  })));
  put(map, legend, 14, H - 196);

  const list = card("Buildings (7)", 4, [
    T("Same information as the map, as a list. Sorted by energy use, highest first.", { size: 13.5, color: P.muted, fill: true }),
    fw(col({ gap: 8 }, RANK.map((r, i) => {
      const sel = i === 0;
      const it = fw(row({ gap: 10, pad: [12, 14], radius: 12, align: "CENTER", fill: sel ? P.selected : P.card, stroke: sel ? P.focus : P.border, sw: sel ? 2 : P.bw, minH: 56, name: `List item / ${r[0]}` }, [
        fw(col({ gap: 2 }, [T(r[0], { size: 14.5, w: 600, fill: true }), T(r[1] ? `${r[1]} kWh/m²/yr · ${r[3]}` : r[3], { size: 12.5, color: P.muted, fill: true })])),
        badge(r[2]),
      ]));
      if (sel) link(it, "s05");
      return it;
    }))),
  ], { w: 340, gap: 12 });

  return appScreen("04 GIS Map", "GIS Map", "GIS Map", [
    pageHead("Campus GIS Map", "Building energy status by location. Select a building on the map or in the list.",
      row({ gap: 10, align: "CENTER" }, [pin(1), seg(["Map only", "Map + list", "List only"], 1, "View")])),
    fw(row({ gap: 20 }, [map, list])),
  ]);
}

function s05Profile() {
  const fact = (k, v) => col({ gap: 2 }, [T(k, { size: 14, color: P.muted }), T(v, { size: 18, w: 700 })]);
  const hero = fw(row({ justify: "SPACE_BETWEEN", pad: [24, 24], radius: 16, fill: P.card, stroke: P.border, sw: P.bw, shadow: true, name: "Hero" }, [
    col({ gap: 14 }, [
      row({ gap: 12, align: "CENTER" }, [T("Science Laboratory Building", { size: 28, w: 700 }), badge("Critical")]),
      row({ gap: 28 }, [fact("Floor area", "1,850 m²"), fact("Meters", "2"), fact("This month", "4,210 kWh"), fact("Estimated cost", "₱50,520"), fact("Last reading", "Oct 7, 2026")]),
    ]),
    row({ gap: 10, align: "CENTER" }, [pin(5), btn("Print (large print)", { icon: "print" }), btn("Download CSV")]),
  ]));

  const MW = 500;
  const meter = F({ dir: "NONE", w: MW, h: 70, name: "EUI meter (284, Critical)" });
  put(meter, R(250, 22, P === HC ? "#003300" : "#D1FAE5", { radius: 0 }), 0, 12);
  put(meter, R(167, 22, P === HC ? "#333300" : "#FEF3C7"), 250, 12);
  put(meter, R(83, 22, P === HC ? "#330000" : "#FEE2E2"), 417, 12);
  put(meter, R(2, 34, P.text), 249, 6);
  put(meter, R(2, 34, P.text), 416, 6);
  put(meter, R(6, 46, P.status.Critical[0], { radius: 3, name: "This building: 284" }), Math.round(MW * 284 / 300) - 3, 0);
  [["Normal ✓", 125], ["150", 250], ["High ▲", 333], ["250", 417], ["Critical ✕", 462]].forEach((l) => {
    const t = T(l[0], { size: 12.5, color: P.muted });
    put(meter, t, Math.min(MW - t.width, l[1] - t.width / 2), 50);
  });

  const eui = card("Energy use intensity (EUI)", 1, [
    row({ gap: 8, align: "BASELINE" }, [T("284", { size: 28, w: 700 }), RT(["kWh per m² per year — ", ["134 above", 700, P.status.Critical[0]], " the High limit (150)."], { size: 15.5 })]),
    meter,
    fw(col({ pad: [0, 16, 14, 16], radius: 12, stroke: P.border, sw: P.bw, name: "Details: What does this mean?" }, [
      row({ gap: 10, align: "CENTER", minH: 48 }, [icon("chevron", 18, P.text), T("What does this mean?", { size: 15, w: 600 }), pin(2)]),
      RT(["EUI compares a building's yearly energy use with its size, so big and small buildings can be compared fairly. This building uses almost ", ["twice", 700], " what is considered normal. Common causes: air-conditioners running after class hours, old lab equipment, lights left on."], { size: 14.5, lh: 155, fill: true }),
    ])),
  ]);
  const appl = card("Measured vs. listed appliances", 3, [
    T("Measured = meter readings. Estimated = sum of listed appliances (watts × qty × hours × days).", { size: 13, color: P.muted, fill: true }),
    table([{ label: "Source", w: 0 }, { label: "kWh / month", w: 130, num: true }, { label: "Cost", w: 110, num: true }], [
      { cells: [T("Measured (meters)", { size: 14.5, w: 600 }), "4,210", "₱50,520"] },
      { cells: [T("Estimated (appliances)", { size: 14.5, w: 600 }), "3,020", "₱36,240"] },
    ]),
    callout("warn", [["Meters show 39% more than the appliance list. ", 700], "Some equipment may be missing from the list, or something is running longer than expected."]),
  ]);
  const hist = card("Monthly consumption & forecast", 4, [
    table([{ label: "Month", w: 0 }, { label: "kWh", w: 160, num: true }, { label: "Change", w: 160, num: true }, { label: "Type", w: 340 }], [
      ["July 2026", "3,880", "—", "Measured"],
      ["August 2026", "3,960", "▲ 2.1%", "Measured"],
      ["September 2026", "4,210", "▲ 6.3%", "Measured"],
      ["October 2026", "≈ 4,050", "—", "Forecast (± 6% typical error)"],
    ], { caption: "Science Laboratory Building — kWh per month. Forecast uses simple exponential smoothing (lowest error on past data)." }),
  ], { right: seg(["Chart", "Data table"], 1, "Show as") });

  return appScreen("05 Building Profile", "Buildings", "Buildings", [
    RT([["Buildings", 600, P.brandDark], "  ›  Science Laboratory Building"], { size: 13.5 }),
    hero,
    fw(row({ gap: 20 }, [eui, appl])),
    hist,
  ]);
}

function s06Reports() {
  const crit = P.status.Critical[0];
  const settings = card("Report settings", 1, [
    fw(row({ gap: 16, align: "MAX", name: "Filters" }, [
      field("Period", input("Custom range", { select: true })),
      field("From", input("07/01/2026"), { hint: "MM/DD/YYYY" }),
      field("To", input("06/30/2026", { error: true }), { hint: "MM/DD/YYYY" }),
      field("Buildings", input("All buildings (7)", { select: true })),
      btn("Generate report", { kind: "primary", lg: true }),
    ])),
    errorMsg("“To” date (Jun 30) is before “From” date (Jul 1). Choose a date on or after July 1, 2026."),
    col({ gap: 6 }, [
      row({ gap: 10, align: "CENTER" }, [T("Accessible output options", { size: 14.5, w: 600 }), pin(2)]),
      fw(row({ wrap: true, gap: 24, rowGap: 0 }, [
        checkbox("Tagged, screen-reader-friendly PDF", true), checkbox("Large print (18 pt)", false),
        checkbox("Include data tables under every chart", true), checkbox("Plain-language summary at the top", true),
        checkbox("Black & white / grayscale safe", false),
      ])),
    ]),
  ]);
  void crit;
  const rows = [
    ["Science Laboratory Building", "12,050", "144,600", "284", "Critical"],
    ["Institute of Computing", "10,480", "125,760", "262", "Critical"],
    ["Administration Building", "9,210", "110,520", "198", "High"],
    ["Learning Resource Center", "8,140", "97,680", "171", "High"],
    ["Student Center", "6,330", "75,960", "122", "Normal"],
    ["New Academic Building", "5,110", "61,320", "96", "Normal"],
    ["Maintenance and Storage", "—", "—", "—", "No data"],
  ].map((r) => r.slice(0, 4).concat([badge(r[4])]));
  rows.push({ cells: ["Total", "51,320", "615,840", "", ""], bold: true });
  const doc = fw(col({ gap: 14, pad: [28, 32], radius: 12, fill: P.card, stroke: P.border, sw: P.bw, name: "Report document" }, [
    T("Campus Energy Report — Jul 1 to Sep 30, 2026", { size: 21, w: 700 }),
    T("Generated Oct 7, 2026 by Juan Mendoza · Rate ₱12.00 per kWh", { size: 13, color: P.muted }),
    callout("info", [["In short: ", 700], "The campus used 51,320 kWh (≈ ₱615,840) in three months. 2 buildings are Critical and 2 are High. The Science Laboratory Building alone used 24% of all energy."]),
    table([{ label: "Building", w: 0 }, { label: "kWh", w: 140, num: true }, { label: "Cost (₱)", w: 140, num: true }, { label: "EUI", w: 90, num: true }, { label: "Status", w: 150 }], rows, { caption: "Energy use by building, Jul–Sep 2026" }),
  ]));
  return appScreen("06 Reports", "Reports", "Reports", [
    pageHead("Reports", "Build a printable energy report for any period."),
    settings,
    fw(row({ justify: "SPACE_BETWEEN", align: "CENTER" }, [titleRow("Preview", 3), row({ gap: 10 }, [btn("Download CSV"), btn("Download PDF"), btn("Print", { kind: "primary" })])])),
    doc,
  ]);
}

function s07Settings() {
  const sw = (on) => {
    const track = F({ dir: "NONE", w: 60, h: 34, radius: 17, fill: on ? P.brand : P.track, stroke: on ? P.brand : P.muted, sw: 2, name: on ? "Switch / On" : "Switch / Off" });
    const knob = figma.createEllipse();
    knob.resize(24, 24); knob.fills = solid("#FFFFFF"); knob.strokes = solid(on ? P.brand : P.muted); knob.strokeWeight = 2;
    put(track, knob, on ? 31 : 5, 5);
    return row({ gap: 10, align: "CENTER" }, [track, T(on ? "ON" : "OFF", { size: 12.5, w: 700, color: P.muted, width: 28 })]);
  };
  const set = (title, desc, control) => {
    const r = fw(row({ gap: 24, pad: [14, 0], align: "CENTER", stroke: P.border, sw: 1, name: `Setting / ${title}` }, [
      fw(col({ gap: 2 }, [T(title, { size: 15, w: 600, fill: true }), T(desc, { size: 13, color: P.muted, fill: true, lh: 145 })])),
      control,
    ]));
    return sides(r, 0, 0, 1, 0);
  };
  const sizeBtn = (l, px, on) => row({ w: 60, h: 56, radius: 12, fill: on ? P.brandSoft : P.card, stroke: on ? P.brand : P.border, sw: 2, align: "CENTER", justify: "CENTER", name: `Text size / ${l}` }, [T(l, { size: px, w: 700 })]);
  const head = (ic, t, n) => row({ gap: 10, align: "CENTER" }, [icon(ic, 22, P.brand), T(t, { size: 18, w: 700 }), pin(n)]);
  const sCard = (ic, t, n, kids) => fw(col({ gap: 4, pad: [20, 24], radius: 16, fill: P.card, stroke: P.border, sw: P.bw, shadow: true, name: `Card / ${t}` }, [head(ic, t, n)].concat(kids)));
  const select = (v) => input(v, { select: true, w: 170, size: 15 });

  const col1 = fw(col({ gap: 20 }, [
    sCard("eye", "Seeing", 1, [
      set("Text size", "Makes all text and buttons bigger.", row({ gap: 8 }, [sizeBtn("A", 14, false), sizeBtn("A+", 18, true), sizeBtn("A++", 22, false)])),
      set("High contrast", "Black background, white text, yellow highlights.", sw(false)),
      set("Dark mode", "Easier on the eyes at night.", sw(false)),
      set("Colour-blind friendly palette", "Uses blue / orange instead of green / red.", sw(true)),
      set("Underline all links", "Links stand out without relying on colour.", sw(true)),
    ]),
    sCard("ear", "Hearing & listening", 2, [
      set("Read aloud (text-to-speech)", "Reads the selected text or the whole page.", sw(true)),
      set("Reading speed", "How fast the voice reads.", select("Normal (1×)")),
      set("Visual alerts", "Flash the screen border and show a banner instead of only a sound.", sw(true)),
    ]),
  ]));
  const col2 = fw(col({ gap: 20 }, [
    sCard("hand", "Moving & typing", 3, [
      set("Reduce motion", "Turns off animations and sliding panels.", sw(true)),
      set("Extra-large click targets", "Buttons at least 56 px, more space between them.", sw(false)),
      set("Voice input for readings", "Say the meter number instead of typing it.", sw(true)),
      set("More time before sign-out", "Warns you 2 minutes before, with a one-click “I need more time”.", select("60 minutes")),
    ]),
    sCard("brain", "Reading & understanding", 4, [
      set("Language", "Interface language.", select("English")),
      set("Simple explanations", "Show “What does this mean?” under every number.", sw(true)),
      set("Dyslexia-friendly font", "Wider letters and line spacing.", sw(false)),
    ]),
  ]));
  const cbBadge = row({ gap: 6, pad: [4, 10], radius: 999, fill: "#FFEDD5", stroke: "#9A3412", sw: 1, align: "CENTER", name: "Badge / Critical (colour-blind palette)" }, [statusIcon("Critical", 14, "#9A3412", "#FFFFFF"), T("Critical", { size: 12.5, w: 600, color: "#9A3412" })]);
  const col3 = col({ w: 380, gap: 20 }, [
    card("Live preview", null, [
      fw(col({ gap: 10, pad: 20, radius: 16, stroke: P.border, sw: 2, dash: [8, 6], name: "Preview" }, [
        cbBadge,
        T("Science Laboratory Building", { size: 18, w: 700 }),
        T("284 kWh/m²/yr", { size: 18 }),
        T("Uses almost twice the normal energy for its size.", { size: 13.5, color: P.muted, fill: true }),
        T("Open profile", { size: 15, w: 600, color: "#1D4ED8", underline: true }),
      ])),
      T("Colour-blind palette on: Critical shows in orange, Normal in blue.", { size: 13, color: P.muted, fill: true }),
    ]),
    card("Keyboard shortcuts", 5, [
      table([{ label: "Keys", w: 150 }, { label: "Action", w: 0 }], [
        [row({ gap: 4, align: "CENTER" }, [kbd("Alt"), kbd("D")]), "Dashboard"],
        [row({ gap: 4, align: "CENTER" }, [kbd("Alt"), kbd("M")]), "GIS Map"],
        [row({ gap: 4, align: "CENTER" }, [kbd("Alt"), kbd("N")]), "Add meter reading"],
        [row({ gap: 4, align: "CENTER" }, [kbd("Alt"), kbd("R")]), "Reports"],
        [row({ gap: 4, align: "CENTER" }, [kbd("Alt"), kbd("+"), kbd("−")]), "Text size"],
        [kbd("?"), "Show all shortcuts"],
      ]),
    ]),
    btn("Save settings", { kind: "primary", lg: true, fill: true }),
  ]);
  return appScreen("07 Accessibility Settings", "Settings", "Settings", [
    pageHead("Accessibility settings", "Make EnerSight easier to see, hear, read and use. Saved to your account and applied on every device.", btn("Reset to default")),
    fw(row({ gap: 20 }, [col1, col2, col3])),
  ]);
}

// ─── Notes text ────────────────────────────────────────────────────────────
const NOTES = {
  s01: ["Sign In", [
    [1, "Accessibility toolbar before login.", "Text size (A / A+ / A++), high contrast and English/Cebuano can be set before signing in, so low-vision users are not blocked at the first screen."],
    [2, "Errors use text + icon, not only red.", "The message explains what went wrong and how to fix it, and is announced by screen readers (role=\"alert\")."],
    [3, "Visible labels + show password.", "Labels never disappear like placeholders. “Show” helps users with motor or memory difficulties check what they typed. The error is linked to the field."],
    [4, "Large target + visible focus ring.", "Buttons are at least 44 px tall. The blue 3 px ring shows keyboard users where they are (shown on “Sign in”)."],
  ]],
  s02: ["Dashboard", [
    [1, "“Skip to main content” link", "appears on the first Tab press, so keyboard and screen-reader users don't have to tab through 10 menu items on every page."],
    [2, "Status never relies on colour alone.", "Every EUI status has a unique shape (✓ circle, ▲ triangle, ✕ octagon, dashed circle), a word, and the exact number. Critical/High bars also use stripes."],
    [3, "Plain-language explanations.", "Instead of only “EUI 284”, users read what it means and what to do. This helps non-technical staff and users with cognitive disabilities."],
    [4, "Charts have a text summary and a data-table view.", "Screen readers read the summary. Every bar has its value written on it, and the current month is striped, not only a different colour."],
    ["A", "Accessibility toolbar on every page:", "text size, high contrast, read-aloud (text-to-speech) and English/Cebuano."],
  ]],
  s03: ["Add Meter Reading (OCR)", [
    [1, "Step indicator with words and numbers.", "“Step 3 of 3” is written out and announced, so users always know where they are (cognitive accessibility)."],
    [2, "Photo has alt text and a caption.", "Screen-reader users hear the reading the photo shows. The large drop zone and “Take photo” button are easy to hit for users with tremors."],
    [3, "No one is forced to use the camera.", "Users who can't hold a phone steady can type the reading, or say it with voice input."],
    [4, "Uncertain digits are flagged with shape + word + colour,", "and each digit box has its own label (e.g. “Digit 6 of 6, uncertain”). The confidence is explained in plain words."],
    [5, "Prevents mistakes before saving.", "Used kWh, cost and a “looks reasonable” check are shown first, with Back and “needs review” options (WCAG 3.3.4)."],
  ]],
  s04: ["GIS Map", [
    [1, "Map, list, or both.", "A map can't be “seen” by a screen reader, so the same information is always available as a list. Blind users can choose “List only”."],
    [2, "Full keyboard control.", "Arrow keys pan, +/− zoom, and Tab jumps between buildings. The shortcuts are shown on the map. Zoom buttons are 48 × 48 px."],
    [3, "Pin shape = status.", "Circle, triangle, octagon, dashed circle. Colour-blind users can tell Critical from Normal by shape alone. Labels sit on white chips."],
    [4, "Linked selection.", "Selecting a building in the list highlights its pin (blue dashed ring) and opens the same popup."],
  ]],
  s05: ["Building Profile", [
    [1, "The number comes first, then the scale.", "The meter bar has zone labels with symbols (✓ ▲ ✕) and a full text value for screen readers."],
    [2, "“What does this mean?”", "is an expandable explanation in everyday words that works with keyboard and screen readers."],
    [3, "Proper data tables.", "Captions, column and row headers and right-aligned numbers let screen readers announce each value with its heading."],
    [4, "Data-table view shown.", "Every chart can switch to a table. Change is written with ▲/▼ and a percentage. Forecast rows say “Forecast” in words."],
    [5, "Large-print report and CSV.", "Users with low vision can print at a bigger size; screen-reader users can open the CSV in a spreadsheet they know."],
  ]],
  s06: ["Reports", [
    [1, "Helpful form errors.", "Each field has a visible label and a format hint. The error says what is wrong and how to fix it (WCAG 3.3.1 / 3.3.3)."],
    [2, "Accessible output options.", "Tagged PDF for screen readers, 18 pt large print, tables under every chart, and a grayscale-safe mode."],
    [3, "Plain-language summary first,", "then a real table with a caption and headers. Status keeps its icon + word even when printed in black and white."],
  ]],
  s07: ["Accessibility Settings", [
    [1, "Seeing (low vision, colour blindness):", "text size, high contrast, dark mode, a blue/orange colour-blind palette, and underlined links."],
    [2, "Hearing & listening:", "text-to-speech for users with low vision or reading difficulty, and visual alerts for Deaf or hard-of-hearing users."],
    [3, "Moving & typing (motor disabilities):", "reduced motion, bigger targets, voice input for readings, and a longer session timeout with a warning (WCAG 2.2.1)."],
    [4, "Reading & understanding:", "English/Cebuano, simple explanations, and a dyslexia-friendly font. Switches show ON/OFF in words, not only by colour."],
    [5, "Keyboard shortcuts", "are listed on screen and open anytime with “?”. The live preview shows each setting before saving."],
  ]],
};

// ─── Main ──────────────────────────────────────────────────────────────────
async function main() {
  await loadFonts();

  const compPage = figma.createPage();
  compPage.name = "Components";
  const page = figma.createPage();
  page.name = "EnerSight Prototype";
  await figma.setCurrentPageAsync(compPage);
  buildComponents(compPage);
  await figma.setCurrentPageAsync(page);

  const screens = {};
  const order = [];
  const make = (key, build, palette, scale) => {
    P = palette || LIGHT;
    S = scale || 1;
    const f = build();
    page.appendChild(f);
    applyFills(f);
    screens[key] = f;
    order.push(key);
    P = LIGHT;
    S = 1;
    return f;
  };
  make("s00", s00Cover);
  make("s01", s01SignIn);
  make("s02", () => {
    const d = dashboard("02 Dashboard");
    const skip = row({ gap: 8, pad: [8, 14], radius: 12, fill: LIGHT.focus, align: "CENTER", name: "Skip to main content (visible on focus)" }, [
      T("Skip to main content", { size: 13.5, w: 600, color: "#FFFFFF" }), pin(1),
    ]);
    put(d, skip, 272, 16);
    return d;
  });
  make("s03", s03AddReading);
  make("s04", s04Map);
  make("s05", s05Profile);
  make("s06", s06Reports);
  make("s07", s07Settings);
  make("s08", () => dashboard("08 Dashboard — High contrast + Large text"), HC, 1.15);

  // Lay screens out left to right, notes frame under each.
  let x = 0;
  for (const key of order) {
    const f = screens[key];
    f.x = x;
    f.y = 0;
    let n = null;
    if (NOTES[key]) n = notes(NOTES[key][0], NOTES[key][1]);
    if (key === "s08") {
      n = notes("Dashboard in High contrast + Large text", NOTES.s02[1].slice(1),
        "Same screen as 02 with High contrast and A+ turned on from the toolbar: black background, white text, yellow highlights, 2 px borders, text 15% larger. Text contrast exceeds WCAG AAA (7:1).");
    }
    if (n) {
      page.appendChild(n);
      applyFills(n);
      n.x = x;
      n.y = f.height + 80;
    }
    x += 1440 + 160;
  }

  for (const l of LINKS) {
    const dest = screens[l[1]];
    if (!dest) continue;
    await l[0].setReactionsAsync([{
      trigger: { type: "ON_CLICK" },
      actions: [{ type: "NODE", destinationId: dest.id, navigation: "NAVIGATE", transition: null, preserveScrollPosition: false }],
    }]);
  }
  page.flowStartingPoints = [
    { nodeId: screens.s01.id, name: "EnerSight — sign in flow" },
    { nodeId: screens.s00.id, name: "EnerSight — cover" },
  ];
  figma.viewport.scrollAndZoomIntoView(order.map((k) => screens[k]));
  return `Built ${order.length} screens and ${LINKS.length} prototype links.`;
}

main().then(
  (msg) => figma.closePlugin(msg),
  (err) => { console.error(err); figma.closePlugin("EnerSight builder failed: " + (err && err.message ? err.message : err)); },
);
