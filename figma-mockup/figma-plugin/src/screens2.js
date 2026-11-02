// ─── 04 Buildings ──────────────────────────────────────────────────────────
function listHeader(title, sub, filters) {
  return fw(row({ gap: 16, justify: "SPACE_BETWEEN", name: "List header" }, [
    col({ gap: 4, w: 300 }, [T(title, { size: 20, w: 600, color: C.strong }), T(sub, { size: 14, color: C.sub, width: 300, lh: 145 })]),
    row({ gap: 10, align: "CENTER" }, filters),
  ]));
}
function s04Buildings() {
  const campus = (b) => (b[0] === "GBC-JEMAR" ? "San Agustin Avenue, Nicol…" : b[0] === "KEENLY SHESH" ? "San Francisco Barangay H…" : "DNSC Panabo Campus");
  const order = [2, 0, 4, 1, 3, 5, 6, 7, 8];
  const rows = order.map((k, i) => {
    const b = BUILDINGS[k];
    return {
      cells: [
        T("#" + (40 + i), { size: 14.5, w: 500 }),
        two(b[0], campus(b), { w: 600 }),
        chip(b[1], "blue", { icon: "layers" }),
        row({ gap: 6, align: "CENTER" }, [ic("map-pin", 15, C.accent), T(b[2], { size: 14, color: C.text })]),
        T(b[3] + " sqm", { size: 14.5, w: 500 }),
        status("Active"),
        row({ gap: 8 }, [link(iconBtn("eye", "view"), "s12"), iconBtn("plug", "plug"), iconBtn("pencil", "edit"), iconBtn("trash-2", "del")]),
      ],
      link: k === 0 ? "s12" : null,
    };
  });
  return appScreen("04 Buildings", "Buildings", "Buildings", [
    pageHeader({ icon: "building-2", eyebrow: "Building records", title: "Buildings Management", sub: "Manage building records, locations, and monitoring status.", pills: ["9 Buildings"], time: "1m · 11:43 PM",
      actions: [hbtn("Load Samples", { icon: "database" }), hbtn("Remove Samples", { kind: "danger", icon: "trash-2" }), hbtn("Add Building", { kind: "dark", icon: "plus" })] }),
    stats([
      stat("dark", "Total Buildings", "9", "Stored building records", "building-2"),
      stat("green", "Active Buildings", "9", "Included in monitoring", "circle-check"),
      stat("red", "Inactive Buildings", "0", "Excluded from active use", "circle-x"),
      stat("blue", "GIS Mapped", "9", "With valid coordinates", "map-pin"),
    ]),
    card([
      listHeader("Building List", "Search, filter, view, update, or delete building records.", [
        input("Search building, type, status, or coordinates", { icon: "search", placeholder: true, w: 340 }), input("All Types", { select: true, w: 170 }), input("All Status", { select: true, w: 160 }),
      ]),
      table([{ label: "ID", w: 90 }, { label: "Building", w: 170 }, { label: "Type", w: 130 }, { label: "GIS location", w: 0 }, { label: "Floor area", w: 120 }, { label: "Status", w: 120 }, { label: "Actions", w: 180 }], rows),
      fw(row({ gap: 10, align: "CENTER" }, [pin(1), aiNote("Rows open the full building profile with Enter or click; every icon button has a text label for screen readers (e.g. “View Institute of Computing”).")])),
    ]),
  ]);
}

// ─── 05 Meters ─────────────────────────────────────────────────────────────
function s05Meters() {
  const M = [
    ["DNSC-ADM-01", "Administration Building", "679,715.79", "717,017.66"], ["DNSC-LRC-01", "Learning Resource Center", "257,538.09", "271,489.27"],
    ["DNSC-SCI-01", "Science Laboratory Building", "588,307.63", "622,379.46"], ["DNSC-STC-01", "Student Center", "389,734.41", "411,663.68"],
    ["DNSC-MNT-01", "Maintenance and Storage", "78,418.31", "82,231.24"], ["DNSC-ICT-01", "Institute of Computing", "452,084.52", "476,130.07"],
    ["DNSC-ICT-02", "Institute of Computing", "453,380.28", "478,455.10"], ["DNSC-NAB-01", "New Academic Building", "4,509.00", "4,509.00"],
  ];
  const rows = M.map((m, i) => [
    T("#" + (22 + i), { size: 14.5, w: 500 }),
    two(m[0], "Meter record"),
    row({ gap: 8, align: "CENTER" }, [ic("building-2", 15, C.accent), T(m[1], { size: 14.5, color: C.text, width: 170 })]),
    chip("Digital", "blue", { icon: "gauge" }),
    row({ gap: 6, align: "CENTER" }, [ic("rotate-ccw", 14, C.muted), T(m[2], { size: 14.5, w: 500 }), T("kWh", { size: 11.5, color: C.muted })]),
    row({ gap: 6, align: "CENTER" }, [ic("trending-up", 14, C.accent), T(m[3], { size: 14.5, w: 600, color: C.accent }), T("kWh", { size: 11.5, color: C.muted })]),
    status("Active"),
    iconBtn("eye", "view"),
  ]);
  return appScreen("05 Meters", "Meters", "Meters", [
    pageHeader({ icon: "gauge", eyebrow: "Meter records", title: "Meters Management", sub: "Manage assigned meters and operational status.", pills: ["8 Meters"], time: "1m · 11:43 PM",
      actions: [hbtn("Load Samples", { icon: "database" }), hbtn("Remove Samples", { kind: "danger", icon: "trash-2" }), hbtn("Add Meter", { kind: "dark", icon: "plus" })] }),
    stats([
      stat("dark", "Total Meters", "8", "Stored meter records", "gauge"),
      stat("green", "Active Meters", "8", "Available for readings", "circle-check"),
      stat("red", "Inactive Meters", "0", "Not currently used", "circle-x"),
      stat("blue", "Assigned Buildings", "7", "With assigned meters", "building-2"),
    ]),
    card([
      listHeader("Meter List", "Search, filter, view, update, or delete meter records.", [
        input("Search meter, building", { icon: "search", placeholder: true, w: 210 }), input("All Types", { select: true, w: 160 }), input("All Status", { select: true, w: 160 }), input("All Buildings", { select: true, w: 180 }),
      ]),
      table([{ label: "ID", w: 70 }, { label: "Serial no.", w: 150 }, { label: "Building", w: 0 }, { label: "Meter type", w: 120 }, { label: "Previous", w: 150 }, { label: "Latest", w: 150 }, { label: "Status", w: 110 }, { label: "Action", w: 72 }], rows),
    ]),
  ]);
}

// ─── 06 Add Meter Reading (OCR) ────────────────────────────────────────────
function s06Ocr() {
  const resBox = (lbl, kids) => fw(col({ gap: 8, pad: [14, 16], radius: 14, fill: C.soft, stroke: C === HC ? "#FFFFFF" : null, sw: 1, name: `Result / ${lbl}` }, [label(lbl)].concat(kids)));
  const mic = row({ gap: 6, pad: [6, 10], radius: 10, fill: C.card, stroke: NOTE.pin, sw: 2, align: "CENTER", name: "Say the reading (added)" }, [ic("mic", 15, C === HC ? "#FFFF00" : NOTE.pin), T("Say it", { size: 12.5, w: 600, color: C === HC ? "#FFFF00" : NOTE.pin })]);
  const capture = card([
    fw(row({ justify: "SPACE_BETWEEN", align: "MIN" }, [col({ gap: 4 }, [T("Meter Photo Capture", { size: 19, w: 600, color: C.strong }), T("Upload a meter photo and run OCR to detect the reading.", { size: 14, color: C.sub })]), chip("Waiting for photo", "gray")])),
    fw(row({ gap: 16 }, [
      col({ w: 280, gap: 12, pad: 12, radius: 16, stroke: C.border, sw: C.bw, name: "Photo column" }, [
        fw(col({ h: 320, radius: 14, stroke: C.border, sw: 1.5, dash: [6, 5], align: "CENTER", justify: "CENTER", gap: 10, name: "Drop zone" }, [
          ic("image-plus", 44, C.muted),
          T("No meter photo selected", { size: 14, w: 600, color: C.sub2 }),
          T("Upload or capture a clear meter image.", { size: 12.5, color: C.muted }),
          row({ gap: 8, align: "CENTER" }, [pin(1), T("Photo needs a description? It's read aloud after OCR.", { size: 11.5, w: 600, color: C === HC ? "#FFFF00" : NOTE.pin, width: 170, lh: 140 })]),
        ])),
        hbtn("Upload Photo", { icon: "image-plus", fill: true }),
        fw(row({ gap: 8 }, [hbtn("Run OCR", { kind: "disabled", icon: "scan-line", fill: true }), hbtn("Reset", { icon: "rotate-ccw", fill: true })])),
      ]),
      fw(col({ gap: 14 }, [
        field("Assigned meter", input("DNSC-ADM-01 • Administration", { select: true })),
        field("Previous reading (auto-filled)", input("717017.66", { disabled: true }), "Taken from the last recorded reading for this meter."),
        fw(col({ gap: 8 }, [row({ gap: 8, align: "CENTER" }, [label("Present reading"), pin(2)]), input("Example: 82353", { placeholder: true, right: mic })])),
        field("Reading date", input("10/07/2026 11:43 PM", { right: ic("calendar", 16, C.sub2) })),
        fw(col({ gap: 4, pad: [12, 14], radius: 14, fill: C.soft, stroke: C.border, sw: C.bw }, [T("Saved as pending review", { size: 14, w: 600, color: C.strong }), T("An Admin or Manager verifies readings from the table below.", { size: 13, color: C.sub, fill: true })])),
        fw(col({ gap: 4, pad: [12, 14], radius: 14, fill: C.accentSoft, stroke: C.accentBorder, sw: C.bw }, [T("Selected Meter Context", { size: 14, w: 600, color: C.accent }), T("DNSC-ADM-01 • Administration Building", { size: 13.5, color: C.accent })])),
        fw(row({ gap: 10, align: "CENTER" }, [hbtn("Save Reading", { kind: "dark", icon: "save", lg: true, fill: true }), pin(3)])),
      ])),
    ])),
  ], { name: "Card / Meter Photo Capture" });
  const result = card([
    row({ gap: 12, align: "CENTER" }, [iconTile("info", "green", 40), col({ gap: 2 }, [T("OCR Result", { size: 17, w: 600, color: C.strong }), T("Review before saving.", { size: 13, color: C.muted })])]),
    resBox("Detected reading", [T("—", { size: 22, w: 700, color: C.strong })]),
    resBox("Scan status", [chip("Waiting for photo", "gray")]),
    resBox("Previous reading", [T("717,017.66 kWh", { size: 18, w: 600, color: C.strong }), T("Last recorded reading", { size: 12, color: C.muted })]),
    resBox("Consumption this period", [T("— kWh", { size: 18, w: 600, color: C.muted })]),
    resBox("Assigned meter", [T("DNSC-ADM-01", { size: 14.5, w: 600, color: C.strong }), T("Administration Building", { size: 12, color: C.muted })]),
    fw(col({ gap: 6, pad: [12, 14], radius: 14, stroke: NOTE.pin, sw: 2, dash: [6, 4], name: "Confidence explained (added)" }, [
      row({ gap: 8, align: "CENTER" }, [pin(4), T("After a scan:", { size: 13, w: 700, color: C === HC ? "#FFFF00" : NOTE.pin })]),
      T("“OCR is 96% sure. Please check the last digit: it could be a 4 or a 9.” Uncertain digits are outlined with ▲, not only coloured.", { size: 12.5, color: C.sub2, fill: true, lh: 150 }),
    ])),
  ], { w: 420, gap: 12, name: "Card / OCR Result" });
  const R6 = [["#575", "82,231 kWh", "9/3/2026, 1:02:00 PM", "Review"], ["#574", "78,418 kWh", "8/6/2026, 9:05:00 AM", "Review"], ["#573", "73,813 kWh", "7/5/2026, 12:34:00 PM", "Verified"], ["#572", "69,101 kWh", "6/4/2026, 8:47:00 AM", "Verified"], ["#571", "64,387 kWh", "5/4/2026, 9:01:00 AM", "Verified"], ["#570", "59,733 kWh", "4/4/2026, 2:05:00 PM", "Verified"]];
  const rows = R6.map((r) => [T(r[0], { size: 14.5, w: 500 }), two("DNSC-MNT-01", "Maintenance and Storage"), T(r[1], { size: 14.5, w: 600 }), T(r[2], { size: 14, color: C.sub2 }), status(r[3]),
    row({ gap: 8 }, [iconBtn("eye", "view"), r[3] === "Review" ? iconBtn("circle-check", "ok") : iconBtn("triangle-alert", "warn"), iconBtn("trash-2", "del")])]);
  return appScreen("06 Add Meter Reading", "Add Meter Reading", "Add Meter Reading", [
    pageHeader({ icon: "scan-line", eyebrow: "Smart meter scanner", title: "Meter Reading OCR", sub: "Upload, verify, and save meter readings.", pills: ["126 Readings"] }),
    fw(row({ gap: 20 }, [
      stat("dark", "Total Readings", "126", "Stored consumption records", "gauge"),
      stat("green", "Verified", "112", "Ready for reports", "circle-check"),
      stat("amber", "Needs Review", "14", "Pending manual check", "triangle-alert"),
    ])),
    fw(row({ gap: 20, name: "Capture + result" }, [capture, result])),
    card([
      listHeader("Latest Readings", "Review saved OCR and manual readings.", [input("Search readings, meters, buildings…", { icon: "search", placeholder: true, w: 300 }), input("All Status", { select: true, w: 150 })]),
      table([{ label: "ID", w: 90 }, { label: "Meter / building", w: 0 }, { label: "Reading", w: 160 }, { label: "Date", w: 220 }, { label: "Status", w: 120 }, { label: "Actions", w: 140 }], rows, { rowH: 64 }),
      fw(row({ justify: "SPACE_BETWEEN", align: "CENTER" }, [T("Showing 1-20 of 126 readings", { size: 12.5, color: C.muted }), row({ gap: 6, align: "CENTER" }, [hbtn("Previous"), row({ pad: [8, 12], radius: 10, fill: C.dark }, [T("1 / 7", { size: 12.5, w: 600, color: C.onDark })]), hbtn("Next")])])),
    ]),
  ]);
}

// ─── 07 Reports ────────────────────────────────────────────────────────────
function s07Reports() {
  const type = (name, desc, iconName, sel) => fw(col({ gap: 10, pad: 16, radius: 16, fill: sel ? C.accentSoft : C.card, stroke: sel ? C.accentBorder : C.border, sw: C.bw, h: 150, name: `Report type / ${name}` }, [
    fw(row({ justify: "SPACE_BETWEEN", align: "MIN" }, [iconTile(iconName, "dark", 36), chip(sel ? "Selected" : "Ready", sel ? "green" : "gray")])),
    T(name, { size: 14.5, w: 600, color: C.strong }),
    T(desc, { size: 12.5, color: C.sub, fill: true, lh: 145 }),
  ]));
  const rows = BUILDINGS.map((b) => [
    two(b[0], b[11]), String(b[7]), String(b[8]), T(b[4] + " kWh", { size: 14, w: 500 }),
    T(b[9], { size: 14, w: 600, color: C.accent }), T(b[10] === "—" ? "—" : b[10] + " kWh", { size: 14, color: C.sub2 }),
    T(b[5] === "—" ? "—" : Number(b[5]).toFixed(1), { size: 14, w: 600 }),
    b[8] ? chip(b[0] === "Administration Building" ? "94%" : "93%", "green") : chip("Manual", "Manual"),
  ]);
  return appScreen("07 Reports", "Reports", "Reports", [
    pageHeader({ icon: "file-text", eyebrow: "Energy reports", title: "Reports & Audit Support", sub: "Generate and review energy consumption reports.", pills: ["126 Records"], time: "1m · 11:43 PM",
      actions: [hbtn("Export CSV", { icon: "download" }), hbtn("Print", { icon: "printer" }), hbtn("Save to records", { icon: "save" }), hbtn("Preview", { kind: "dark", icon: "eye" })] }),
    card([fw(row({ gap: 12, align: "CENTER" }, [input("Monthly Building Report", { select: true, w: 250 }), input("All Buildings", { select: true, w: 250 }), input("All Time", { select: true, w: 220 }), input("Search report data…", { icon: "search", placeholder: true })]))], { pad: 16 }),
    stats([
      stat("dark", "Total Energy Used", "3,010,325", "kWh · ≈ ₱36,123,906 estimated bill", "file-text", { hint: true }),
      stat("blue", "Average per Month", "175,449", "kWh in an average month", "file-text", { hint: true }),
      stat("red", "Largest Single Reading", "48,485", "Peak reading in selected data", "trending-up"),
      stat("amber", "Needs Review", "14", "112 verified, 19 low accuracy", "triangle-alert", { hint: true }),
    ]),
    card([fw(row({ justify: "SPACE_BETWEEN", align: "CENTER" }, [
      row({ gap: 12, align: "CENTER" }, [iconTile("clipboard-list", "dark", 40), col({ gap: 2 }, [T("Report Scope", { size: 17, w: 600, color: C.strong }), T("Reports are built from the saved readings, buildings, and meter assignments below.", { size: 13, color: C.sub })])]),
      row({ gap: 24, pad: [10, 18], radius: 14, fill: C.soft, stroke: C.border, sw: C.bw }, [["Readings", "126"], ["Buildings", "9"], ["Meters", "8"]].map((x) => col({ gap: 2, align: "CENTER" }, [label(x[0]), T(x[1], { size: 18, w: 700 })]))),
    ]))]),
    fw(row({ gap: 16 }, [
      type("Monthly Building Report", "Summarizes total, monthly, and highest building energy use.", "file-text", true),
      type("High Energy Use Report", "Highlights buildings with high or critical consumption.", "trending-up"),
      type("Meter Photo Check Report", "Reviews OCR accuracy, verified readings, and pending checks.", "gauge"),
      type("Audit Support Report", "Provides records that support energy monitoring documentation.", "shield-check"),
    ])),
    card([
      fw(row({ gap: 12, align: "CENTER" }, [pin(1), T("Accessible export (added)", { size: 15, w: 700, color: C === HC ? "#FFFF00" : NOTE.pin }),
        chip("Tagged PDF for screen readers", "purple", { icon: "check", big: true }), chip("Large print 18 pt", "purple", { big: true }), chip("Data table under every chart", "purple", { icon: "check", big: true }), chip("Grayscale-safe", "purple", { big: true })])),
    ], { pad: [14, 20] }),
    card([
      cardHead("Generated Report Preview", "Monthly Building Report • All Buildings • All Time", col({ gap: 4, align: "MAX" }, [chip("Generated: 10/7/2026, 11:43:58 PM", "green", { big: true }), T("All buildings sorted by total consumption", { size: 11.5, color: C.muted })])),
      table([{ label: "Building", w: 0 }, { label: "Meters", w: 80 }, { label: "Readings", w: 90 }, { label: "Total", w: 130 }, { label: "Est. cost", w: 130 }, { label: "Per month", w: 120 }, { label: "EUI", w: 80 }, { label: "OCR avg.", w: 100 }], rows, { rowH: 60 }),
    ]),
  ]);
}
