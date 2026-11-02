// ─── 00 Cover ──────────────────────────────────────────────────────────────
function s00Cover() {
  const SCREENS = [
    ["s01", "01", "Sign In"], ["s02", "02", "Dashboard"], ["s03", "03", "GIS Map"], ["s04", "04", "Buildings"],
    ["s05", "05", "Meters"], ["s06", "06", "Add Meter Reading"], ["s07", "07", "Reports"], ["s08", "08", "Analytics"],
    ["s09", "09", "Users"], ["s10", "10", "Profile"], ["s11", "11", "Settings + Accessibility"], ["s12", "12", "Building Profile"],
    ["s13", "13", "Accessibility Panel"], ["s14", "14", "High Contrast + Large Text"],
  ];
  const tile = (s) => link(row({ w: 300, gap: 14, pad: [14, 16], radius: 16, fill: "#FFFFFF", fillOpacity: 0.06, stroke: "#FFFFFF", strokeOpacity: 0.18, align: "CENTER", name: `Tile / ${s[2]}` }, [
    row({ w: 44, h: 44, radius: 12, fill: "#047857", align: "CENTER", justify: "CENTER" }, [T(s[1], { size: 16, w: 700, color: "#BEF264" })]),
    T(s[2], { size: 16, w: 600, color: "#FFFFFF" }),
  ]), s[0]);
  const who = (iconName, title, desc) => fw(col({ gap: 8, pad: 18, radius: 16, fill: "#FFFFFF", fillOpacity: 0.06, stroke: "#FFFFFF", strokeOpacity: 0.18, name: `Who / ${title}` }, [
    row({ gap: 8, align: "CENTER" }, [ic(iconName, 20, "#BEF264"), T(title, { size: 16, w: 700, color: "#FFFFFF" })]),
    T(desc, { size: 13.5, color: "#CBD5E1", lh: 150, fill: true }),
  ]));
  const legend = (c, t, d) => row({ gap: 10, align: "CENTER" }, [row({ pad: [3, 10], radius: 999, fill: c === "Added" ? "#EDE9FE" : "#D1FAE5" }, [T(c, { size: 12.5, w: 700, color: c === "Added" ? NOTE.added : NOTE.existing })]), T(d, { size: 14, color: "#E2E8F0" })]);
  const f = col({ w: 1440, minH: 1024, pad: [64, 80], gap: 36, fill: "#020617", name: "00 Cover" }, [
    row({ gap: 18, align: "CENTER" }, [logoTile(72), col({ gap: 4 }, [T("EnerSight", { size: 34, w: 700, color: "#FFFFFF" }), T("SEE ENERGY CLEARLY, MANAGE BUILDINGS WISELY.", { size: 12.5, w: 700, color: "#BEF264", ls: 14 })])]),
    col({ gap: 12 }, [
      T("Accessible System Prototype", { size: 46, w: 700, color: "#FFFFFF" }),
      T("A high-fidelity Figma prototype of EnerSight, our capstone building energy monitoring system (GIS map, meter-photo OCR, EUI grading, analytics, forecasts and reports). Every screen mirrors the live system, with accessibility improvements added for users with visual, hearing, motor and cognitive difficulties. Purple numbered pins mark each accessibility feature; the notes under each screen explain them. Press ▶ Present to click through.", { size: 17, color: "#CBD5E1", lh: 160, width: 960 }),
      row({ gap: 24, pad: [6, 0, 0, 0] }, [legend("Existing", "already in the EnerSight system"), legend("Added", "proposed in this prototype")]),
    ]),
    fw(row({ gap: 14 }, [
      who("eye", "Low vision", "Text size A/A+/A++, high-contrast theme, read aloud, focus rings."),
      who("contrast", "Colour blindness", "Every status has a shape (✓ ▲ ✕) and a word, not just colour."),
      who("keyboard", "Blind / keyboard users", "Building list beside the map, data tables, labelled icon buttons, shortcuts."),
      who("mic", "Motor difficulties", "Typed or spoken meter readings, large targets, confirmations."),
      who("languages", "Cognitive & language", "Plain-language status, step-by-step OCR, English / Cebuano."),
    ])),
    fw(col({ gap: 14 }, [T("Screens", { size: 20, w: 700, color: "#FFFFFF" }), fw(row({ wrap: true, gap: 16, rowGap: 14 }, SCREENS.map(tile)))])),
  ]);
  return f;
}

// ─── Notes (Existing = already in the app, Added = proposed here) ──────────
const NOTES = {
  s01: ["Sign In", [
    [1, "Added", "Accessibility before login.", "Text size, high contrast and language can be set on the sign-in page, so low-vision users are not blocked at the first screen."],
    [2, "Existing", "Visible labels + icons.", "USERNAME and PASSWORD labels stay visible (placeholders never replace them). Added: a 3 px blue focus ring, shown on Username, for keyboard users."],
    [3, "Existing", "Show password.", "The eye button lets users with motor or memory difficulties check what they typed."],
  ]],
  s02: ["Dashboard", [
    ["A", "Added", "Accessibility button on every page.", "Opens the accessibility panel (screen 13): text size, high contrast, read aloud, reduce motion, language."],
    [4, "Added", "Chart ⇄ Table + text summary.", "Screen-reader users get the chart as a table and a one-sentence summary; the trend chip already states the change in words (−9.6% vs Aug 2026)."],
    [5, "Added", "Status shapes.", "Normal ✓ circle, High ▲ triangle, Critical ✕ octagon, No Data dashed. Colour-blind users can tell statuses apart without colour."],
    ["", "Existing", "Plain-language help.", "Each stat card has an (i) hint explaining the figure, and the forecast says how accurate it was in words (“within about 4%”)."],
  ]],
  s03: ["GIS Map", [
    [1, "Existing", "List beside the map.", "Every building on the map is also in a searchable, filterable list with its status in words, the accessible alternative to a visual map."],
    [2, "Added", "Keyboard map control.", "Arrow keys pan, +/− zoom, Tab moves between buildings and Enter opens the profile. The shortcuts are printed on the map."],
    ["", "Existing", "Records table.", "GIS Building Records repeats all map data in a table with headers."],
    ["", "Added", "Shapes on filters and statuses.", "Filter chips and status pills carry ✓ ▲ ✕ shapes as well as colour."],
  ]],
  s04: ["Buildings", [
    [1, "Added", "Labelled icon buttons.", "View / appliances / edit / delete icons get spoken names (“Edit Institute of Computing”) and rows open with Enter."],
    ["", "Existing", "Status in words.", "Active / Inactive is written, with an icon, not just coloured."],
  ]],
  s05: ["Meters", [
    ["", "Existing", "Readable numbers.", "Previous and latest readings are shown with units (kWh) and icons, so the meaning doesn't depend on colour."],
    ["A", "Added", "Accessibility panel available.", "Same toolbar entry as every page."],
  ]],
  s06: ["Add Meter Reading (OCR)", [
    [1, "Added", "Spoken photo result.", "After OCR runs, the detected reading is read aloud and given as text, so low-vision users don't need to read the photo."],
    [2, "Existing", "Manual entry.", "PRESENT READING can be typed, so nobody is forced to use the camera. Added: “Say it” voice input for users who can't type easily."],
    [3, "Existing", "Error prevention.", "Readings are saved as pending review and verified by an Admin or Manager before they count."],
    [4, "Added", "Confidence in words.", "OCR confidence is explained in a sentence and uncertain digits are marked with ▲, not only colour."],
  ]],
  s07: ["Reports", [
    [1, "Added", "Accessible export.", "Tagged PDF for screen readers, an 18 pt large-print version, a data table under every chart, and a grayscale-safe print mode."],
    ["", "Existing", "Report tables.", "The preview is a real table with column headers; Export CSV opens in any spreadsheet or screen reader."],
  ]],
  s08: ["Analytics", [
    [1, "Added", "Chart ⇄ Table.", "Each chart can switch to a data table."],
    [2, "Added", "Shapes in the legend.", "Comparison bars use the same ✓ ▲ ✕ status shapes in the legend."],
    [3, "Existing", "Forecast explained.", "The three methods are compared in a table with MAE, RMSE, MAPE and R², and the leading method is explained in a sentence."],
    [4, "Added", "Announced sorting.", "Sort direction is spoken, not shown only by an arrow."],
  ]],
  s09: ["Users", [
    [1, "Added", "Confirm before approving / rejecting.", "A confirmation names the account, so a slip of the hand is not final (WCAG 3.3.4)."],
    ["", "Existing", "Roles and status as text.", "Roles and statuses are written labels, not colour codes."],
  ]],
  s10: ["Profile", [
    ["", "Existing", "Clear account summary.", "Role, status and permissions are listed in plain words, so users know what they can do."],
    ["A", "Added", "Accessibility settings reachable.", "Open account settings leads to the new Accessibility card (screen 11)."],
  ]],
  s11: ["Settings", [
    [1, "Added", "Accessibility card.", "Text size, high contrast, colour-blind safe status, read aloud, reduce motion and English/Cebuano, saved to the user's account. Switches show On/Off in words."],
    ["", "Existing", "Worked example.", "The electricity rate shows a worked example (100 kWh × ₱12.00 = ₱1,200.00) so the setting is easy to understand."],
  ]],
  s12: ["Building Profile", [
    [1, "Existing", "Tabs.", "Overview, Consumption, Meters, Readings, Appliances and Saved Reports split a long profile into steps. Added: arrow-key navigation between tabs."],
    [2, "Added", "Read aloud.", "Reads the profile, including the energy status explanation."],
    ["", "Existing", "Status explained.", "“How it was worked out” and “Recommendation” explain the EUI grade in plain words."],
  ]],
  s13: ["Accessibility Panel", [
    ["A", "Added", "One place for every option.", "Opened from the Accessibility button on any page. High contrast leads to screen 14."],
  ]],
};

// ─── Main ──────────────────────────────────────────────────────────────────
async function main() {
  await loadFonts();
  const page = figma.createPage();
  page.name = "EnerSight Prototype";
  await figma.setCurrentPageAsync(page);
  buildPin(page);
  PIN.x = -200; PIN.y = 0;

  const screens = {};
  const order = [];
  const make = (key, build, palette, scale, after) => {
    C = palette || LIGHT;
    S = scale || 1;
    const f = build();
    page.appendChild(f);
    applyFills(f);
    if (after) after(f); // sizes that depend on the settled auto-layout
    screens[key] = f;
    order.push(key);
    C = LIGHT;
    S = 1;
    return f;
  };
  make("s00", s00Cover);
  make("s01", s01SignIn);
  make("s02", () => {
    const d = dashboard("02 Dashboard");
    const skip = row({ gap: 8, pad: [8, 14], radius: 12, fill: "#2563EB", align: "CENTER", name: "Skip to main content (shown on first Tab)" }, [T("Skip to main content", { size: 13.5, w: 600, color: "#FFFFFF" }), pin("S")]);
    put(d, skip, 320, 22);
    return d;
  });
  make("s03", s03Map);
  make("s04", s04Buildings);
  make("s05", s05Meters);
  make("s06", s06Ocr);
  make("s07", s07Reports);
  make("s08", s08Analytics);
  make("s09", s09Users);
  make("s10", s10Profile);
  make("s11", s11Settings);
  make("s12", s12Profile, null, null, (f) => {
    const m = f.findOne((n) => n.name === "Building Profile dialog");
    f.resize(1440, Math.round(m.height + 80));
  });
  make("s13", s13Panel, null, null, (f) => {
    const h = Math.round(f.height);
    f.findOne((n) => n.name === "Backdrop").resize(1440, h);
    f.findOne((n) => n.name === "Accessibility drawer").resize(460, h);
  });
  make("s14", () => dashboard("14 Dashboard — High Contrast + Large Text"), HC, 1.15);

  // Lay out in two rows (8 + 7), each screen with its notes frame underneath.
  const GAP = 200;
  let x = 0, y = 0, rowMax = 0;
  order.forEach((key, i) => {
    if (i === 8) { x = 0; y += rowMax + 400; rowMax = 0; }
    const f = screens[key];
    f.x = x; f.y = y;
    let h = f.height;
    let n = null;
    if (NOTES[key]) {
      const items = NOTES[key][1].map((it, j) => [it[0] === "" ? "•" : it[0], it[1], it[2], it[3], j]);
      if (key === "s02") items.unshift(["S", "Added", "Skip to main content.", "Appears on the first Tab press so keyboard users skip the 11-item sidebar."]);
      n = notes(NOTES[key][0], items);
    }
    if (key === "s14") n = notes("High Contrast + Large Text", [["A", "Added", "Theme applied.", "Same dashboard with High contrast and A+ on: black background, white text, yellow highlights, 2 px borders, 15% larger text. Text contrast exceeds WCAG AAA (7:1)."]]);
    if (n) { page.appendChild(n); applyFills(n); n.x = x; n.y = y + h + 60; h += 60 + n.height; }
    rowMax = Math.max(rowMax, h);
    x += 1440 + GAP;
  });

  let linked = 0;
  for (const l of LINKS) {
    const dest = screens[l[1]];
    if (!dest) continue;
    await l[0].setReactionsAsync([{
      trigger: { type: "ON_CLICK" },
      actions: [{ type: "NODE", destinationId: dest.id, navigation: "NAVIGATE", transition: null, preserveScrollPosition: false }],
    }]);
    linked++;
  }
  page.flowStartingPoints = [
    { nodeId: screens.s01.id, name: "EnerSight — start at Sign In" },
    { nodeId: screens.s00.id, name: "EnerSight — cover" },
  ];
  figma.viewport.scrollAndZoomIntoView([screens.s00, screens.s01, screens.s02]);
  return `EnerSight: built ${order.length} screens and ${linked} prototype links. Open the "EnerSight Prototype" page and press Present.`;
}

main().then(
  (msg) => figma.closePlugin(msg),
  (err) => { console.error(err); figma.closePlugin("EnerSight builder failed: " + (err && err.message ? err.message : err)); },
);
