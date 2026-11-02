// ─── 08 Analytics ──────────────────────────────────────────────────────────
function s08Analytics() {
  const cmpNames = ["Institute of Computing", "Administration Building", "Science Laboratory Building", "Student Center", "Learning Resource Center", "Maintenance and Storage", "GBC-JEMAR", "New Academic Building", "KEENLY SHESH"];
  const cmpVals = [937.5, 712.5, 612.8, 404.1, 267.0, 76.5, 0, 0, 0];
  const cmpSt = ["Critical", "High", "Critical", "High", "Normal", "Normal", "No Data", "No Data", "No Data"];
  const comp = columnChart(470, 230, cmpVals, cmpNames.map((n) => n.split(" ")[0]), { max: 1000, every: 3, colors: cmpSt.map((s) => C.bar[s]), name: "Building comparison (kWh)" });
  const legendItem = (st) => row({ gap: 5, align: "CENTER" }, [shape(st, 11, C.dot[st], C.ink), T(st, { size: 12, color: C.sub2 })]);
  const kv = (dot, l, v) => fw(row({ justify: "SPACE_BETWEEN", align: "CENTER" }, [row({ gap: 8, align: "CENTER" }, [R(8, 8, dot, { radius: 4 }), T(l, { size: 13.5, color: C.text })]), T(v, { size: 14, w: 700 })]));
  const rateBar = (lbl, pct, color, val) => fw(col({ gap: 6, pad: [10, 12], radius: 12, fill: C.soft, stroke: C.border, sw: C.bw }, [fw(row({ justify: "SPACE_BETWEEN" }, [label(lbl), T(val, { size: 13, w: 700, color: color })])), progress(250, pct, color)]));
  const methods = [["Moving average", "#3B82F6", "9,710", "11,047", "5%", "-0.21", false], ["Weighted moving average", "#F97316", "7,676", "10,051", "4%", "-0.01", true], ["Simple exponential smoothing", "#6366F1", "12,536", "13,710", "7%", "-0.87", false]];
  const mrows = methods.map((m) => ({ cells: [row({ gap: 8, align: "CENTER" }, [R(8, 8, m[1], { radius: 4 }), T(m[0], { size: 13.5 }), m[6] ? chip("best", "green") : null]), m[2], m[3], m[4], m[5]] }));
  const insight = (b, txt) => fw(col({ gap: 6, pad: 16, radius: 14, fill: C.soft, stroke: C.border, sw: C.bw, name: `Insight / ${b[0]}` }, [
    fw(row({ justify: "SPACE_BETWEEN", align: "CENTER" }, [T(b[0], { size: 14.5, w: 600, color: C.strong }), status(b[6])])),
    T(`EUI ${b[5]} kWh/m²/yr · ${b[4]} kWh · ${b[9]}`, { size: 12, color: C.muted, fill: true }),
    T(txt, { size: 12.5, color: C.sub2, fill: true, lh: 145 }),
  ]));
  const arows = BUILDINGS.slice(0, 5).map((b) => ({ cells: [two(b[0], b[11]), String(b[7]), String(b[8]), T(b[4] + " kWh", { size: 14, w: 500 }), b[10] + " kWh", Number(b[5]).toFixed(1), T(b[9], { size: 14, w: 600, color: C.accent }), chip("93%", "green"), status(b[6])], link: "s12" }));
  return appScreen("08 Analytics", "Analytics", "Analytics", [
    pageHeader({ icon: "chart-column", eyebrow: "Energy analytics", title: "Analytics", sub: "Analyze consumption trends and building performance.", pills: ["126 Records"], time: "1m · 11:44 PM" }),
    card([fw(row({ gap: 12, align: "CENTER" }, [input("All Buildings", { select: true }), input("All Time", { select: true }), input("All Status", { select: true }), hbtn("Clear filters", { icon: "x" })]))], { pad: 16 }),
    stats([
      stat("dark", "Total Energy Used", "3,010,325", "kWh · about 175,449 kWh per month", "zap", { hint: true }),
      stat("green", "Estimated Cost", "₱36,123,906", "About ₱2,105,392 per month · at ₱12.00 / kWh", "wallet", { hint: true, compact: true }),
      stat("red", "Highest Usage Building", "Institute of Computing", "937,453 kWh · EUI 366.2", "trending-up", { compact: true }),
      stat("red", "Low-Confidence Photos", "19", "Photo readings below 90% · 37 manual not counted", "triangle-alert", { hint: true }),
    ]),
    fw(row({ gap: 20 }, [
      card([cardHead("Energy Use Trend", "Monthly consumption based on saved meter readings.", row({ gap: 8, align: "CENTER" }, [pin(1), seg(["Chart", "Table"], 0)])), lineChart(490, 240, TREND, MONTHS, { every: 3 })]),
      card([cardHead("Building Energy Comparison", "Total energy consumption by building.", seg(["kWh", "EUI", "₱"], 0)), comp, row({ gap: 14, align: "CENTER" }, [legendItem("Normal"), legendItem("High"), legendItem("Critical"), legendItem("No Data"), pin(2)])]),
    ])),
    card([
      cardHead("Reading Quality", "Verification progress and OCR accuracy for the selected records. Typed-in readings have no OCR score and are counted separately."),
      fw(row({ gap: 28, align: "CENTER" }, [
        donut(120, 112 / 126, C.bar.Normal, C === HC ? "#333333" : "#F59E0B", "126", "Readings"),
        fw(col({ gap: 10 }, [label("Verification"), kv(C.bar.Normal, "Verified", "112"), kv("#F59E0B", "Needs review", "14"), rateBar("Verified rate", 0.89, C.accent, "89%")])),
        fw(col({ gap: 10 }, [label("OCR accuracy"), kv("#3B82F6", "Photo, 90% and above", "70"), kv("#EF4444", "Photo, below 90%", "19"), kv("#CBD5E1", "Typed in manually", "37"), rateBar("Photo accuracy rate", 0.79, "#2563EB", "79%")])),
      ])),
    ]),
    card([
      fw(row({ justify: "SPACE_BETWEEN", align: "MIN" }, [col({ gap: 8 }, [row({ gap: 6, pad: [4, 10], radius: 999, fill: C.accentSoft, stroke: C.accentBorder, sw: 1, align: "CENTER" }, [ic("trending-down", 13, C.accent), T("Falling vs 6-month average", { size: 11.5, w: 600, color: C.accent })]), T("Energy Forecast", { size: 19, w: 600, color: C.strong }), T("Predicted usage and cost based on saved meter readings.", { size: 14, color: C.sub })]), seg(["3 mo.", "6 mo."], 0)])),
      fw(col({ gap: 6, pad: 16, radius: 14, fill: C.soft, stroke: C.border, sw: C.bw }, [label("Leading estimate"), T("Weighted moving average", { size: 15, w: 600, color: C.strong }), T("Picked because it came closest in a back-test: forecasting the last 5 months from the months before them, it was off by 4% on average.", { size: 13, color: C.sub, fill: true })])),
      fw(row({ gap: 10, align: "CENTER" }, [T("Comparing the three forecasting methods", { size: 14, w: 600 }), pin(3)])),
      table([{ label: "Method", w: 0 }, { label: "MAE kWh", w: 150, num: true }, { label: "RMSE kWh", w: 150, num: true }, { label: "MAPE", w: 120, num: true }, { label: "R²", w: 120, num: true }], mrows, { rowH: 48 }),
      fw(col({ gap: 4, pad: 16, radius: 14, fill: C.accentSoft, stroke: C.accentBorder, sw: C.bw }, [label("Next 3 months · Oct 2026 to Dec 2026"), row({ gap: 10, align: "BASELINE" }, [T("168,488", { size: 24, w: 700, color: C.strong }), T("kWh per month", { size: 12.5, color: C.muted }), T("₱2,021,856 per month", { size: 15, w: 700, color: C.accent })]), T("505,464 kWh over the period · about ₱6,065,568 in total", { size: 12.5, color: C.sub })])),
    ]),
    card([
      row({ gap: 12, align: "CENTER" }, [iconTile("lightbulb", "dark", 40), col({ gap: 2 }, [T("Priority Insights", { size: 17, w: 600, color: C.strong }), T("Buildings to look at first: worst energy status, then highest energy intensity.", { size: 13, color: C.sub })])]),
      fw(row({ gap: 14 }, [
        insight(BUILDINGS[0], "Immediate review recommended. Check equipment usage, schedule, and meter readings."),
        insight(BUILDINGS[1], "Immediate review recommended. Check equipment usage, schedule, and meter readings."),
        insight(BUILDINGS[2], "Monitor this building closely and compare with previous readings."),
      ])),
    ]),
    card([
      cardHead("Building Analytics Table", "Consumption, energy intensity, OCR accuracy, and verification. Click a column to sort, or a building for its full profile.", row({ gap: 10 }, [chip("9 buildings shown", "green", { big: true, icon: "chart-column" }), hbtn("Export CSV", { kind: "dark", icon: "download" })])),
      table([{ label: "Building", w: 0 }, { label: "Meters", w: 70 }, { label: "Readings", w: 85 }, { label: "Total ↓", w: 125 }, { label: "Per month", w: 115 }, { label: "EUI", w: 70 }, { label: "Est. cost", w: 125 }, { label: "OCR avg.", w: 85 }, { label: "Status", w: 105 }], arows, { rowH: 60 }),
      fw(row({ gap: 10, align: "CENTER" }, [pin(4), aiNote("Sort state is announced (“Total, sorted descending”), not shown only by the arrow.")])),
    ]),
  ]);
}

// ─── 09 Users ──────────────────────────────────────────────────────────────
function s09Users() {
  const U = [["#4", "Keenly123", "Keenly Passion", "Facilities Staff", "green", "Active"], ["#5", "ManagerTest", "ManagerTest", "Campus Admin", "blue", "Active"], ["#6", "StaffTest", "StaffTest", "Facilities Staff", "green", "Active"], ["#7", "AdminTest", "AdminTest", "System Admin", "purple", "Active"], ["#14", "staff.pending", "Pending Facilities Staff", "Facilities Staff", "green", "Pending"]];
  const rows = U.map((u) => [T(u[0], { size: 14.5, w: 500 }), two(u[1], "Account"), T(u[2], { size: 14.5 }), T(u[2], { size: 14.5 }), chip(u[3], u[4]), status(u[5]), row({ gap: 8 }, [iconBtn("eye", "view"), iconBtn("pencil", "edit"), iconBtn("trash-2", "del")])]);
  return appScreen("09 Users", "Users", "Users", [
    pageHeader({ icon: "user-cog", eyebrow: "Access control", title: "User Management", sub: "Manage user accounts, roles, and pending requests.", pills: ["1 Pending"], time: "1m · 11:44 PM", actions: [hbtn("Add User", { kind: "dark", icon: "plus" })] }),
    stats([
      stat("dark", "Total Users", "5", "Registered accounts", "users-round"),
      stat("amber", "Pending", "1", "Needs admin action", "clock-3"),
      stat("purple", "Admins", "1", "Full system access", "shield-check"),
      stat("blue", "Managers", "1", "Reports access", "lock"),
      stat("green", "Active", "4", "3 staff accounts", "circle-check"),
    ]),
    card([
      cardHead("Pending Account Requests", "Approve or reject new account requests.", chip("1 pending", "Pending", { big: true })),
      table([{ label: "ID", w: 90 }, { label: "Username", w: 170 }, { label: "Full name", w: 0 }, { label: "Email", w: 0 }, { label: "Role", w: 130 }, { label: "Decision", w: 200 }], [[
        T("#14", { size: 14.5, w: 500 }), two("staff.pending", "Awaiting approval", { subColor: C.tone.amber.label }), "Pending Facilities Staff", "Pending Facilities Staff", chip("Facilities Staff", "green"),
        row({ gap: 8 }, [hbtn("Approve", { kind: "green", icon: "user-plus" }), hbtn("Reject", { kind: "danger", icon: "user-x" })]),
      ]]),
      fw(row({ gap: 10, align: "CENTER" }, [pin(1), aiNote("Approve / Reject ask for confirmation and say which account they affect (“Approve staff.pending?”), so a mis-click is never final.")])),
    ]),
    card([
      listHeader("User List", "Search, filter, view, update, or delete user accounts.", [input("Search name, username, role…", { icon: "search", placeholder: true, w: 370 }), input("All Roles", { select: true, w: 150 }), input("All Status", { select: true, w: 160 })]),
      table([{ label: "ID", w: 80 }, { label: "Username", w: 160 }, { label: "Full name", w: 0 }, { label: "Email", w: 0 }, { label: "Role", w: 150 }, { label: "Status", w: 120 }, { label: "Actions", w: 140 }], rows),
    ]),
  ]);
}

// ─── 10 Profile ────────────────────────────────────────────────────────────
function s10Profile() {
  const infoRow = (iconName, l, v) => fw(row({ gap: 14, pad: [14, 16], radius: 16, fill: C.soft, stroke: C.border, sw: C.bw, align: "CENTER" }, [
    row({ w: 40, h: 40, radius: 12, fill: C.card, stroke: C.border, sw: 1, align: "CENTER", justify: "CENTER" }, [ic(iconName, 18, C.accent)]),
    col({ gap: 2 }, [label(l), T(v, { size: 18, w: 500, color: C.strong })]),
  ]));
  const perm = (t) => fw(row({ gap: 12, pad: [14, 16], radius: 14, fill: C.soft, stroke: C.border, sw: C.bw, align: "CENTER", h: 74 }, [row({ w: 34, h: 34, radius: 999, fill: C.accentSoft, align: "CENTER", justify: "CENTER" }, [ic("circle-check", 17, C.accent)]), T(t, { size: 14.5, w: 500, color: C.strong, fill: true })]));
  const openSettings = hbtn("Open account settings", { kind: "dark", icon: "key-round", lg: true, link: "s11" });
  return appScreen("10 Profile", "Profile", "Profile", [
    pageHeader({ icon: "user", eyebrow: "User profile", title: "AdminTest", sub: "View account details, role, and permissions.", pills: ["Status: Active", "Role: Admin"] }),
    stats([
      stat("dark", "Account", "AdminTest", "Signed-in account username", "user", { compact: true }),
      stat("purple", "Role", "System Administrator", "Assigned system access level", "shield-check", { compact: true }),
      stat("green", "Status", "Active", "Current account approval state", "circle-check", { compact: true }),
      stat("blue", "Permissions", "6", "Available role permissions", "circle-check"),
    ]),
    fw(row({ gap: 24 }, [
      card([
        row({ gap: 16, align: "CENTER" }, [row({ w: 64, h: 64, radius: 16, fill: C.accent, align: "CENTER", justify: "CENTER" }, [T("AD", { size: 20, w: 700, color: C.onAccent })]), col({ gap: 2 }, [T("Account Information", { size: 21, w: 500, color: C.strong }), T("Basic profile details stored in the system.", { size: 14.5, color: C.sub })])]),
        infoRow("user", "Full name", "AdminTest"), infoRow("mail", "Username", "AdminTest"), infoRow("id-card", "User ID", "#7"), infoRow("shield-check", "Role", "Admin"),
      ], { pad: 24, gap: 16 }),
      card([
        row({ gap: 16, align: "CENTER" }, [iconTile("shield-check", "purple", 48), col({ gap: 2 }, [T("Role Permissions", { size: 21, w: 500, color: C.strong }), T("Available pages and actions for this account.", { size: 14.5, color: C.sub })])]),
        fw(row({ gap: 8, pad: 16, radius: 16, fill: C.soft, stroke: C.border, sw: C.bw }, [chip("Admin", "purple", { big: true }), chip("Active", "green", { big: true }), chip("6 permissions", "gray", { big: true })])),
        fw(row({ gap: 12 }, [perm("Manage user accounts"), perm("Approve or reject account requests")])),
        fw(row({ gap: 12 }, [perm("Manage buildings and meters"), perm("Add, verify, and delete readings")])),
        fw(row({ gap: 12 }, [perm("View GIS map, reports, and analytics"), perm("Access system settings")])),
      ], { pad: 24, gap: 16 }),
    ])),
    fw(row({ gap: 24 }, [
      card([row({ gap: 14 }, [iconTile("key-round", "dark", 48), col({ gap: 8 }, [T("Account Security", { size: 21, w: 500, color: C.strong }), T("Change your name, username, or password from Settings. You will need your current password to set a new one.", { size: 14.5, color: C.sub, width: 520, lh: 160 }), openSettings])])], { pad: 24 }),
      card([fw(row({ justify: "SPACE_BETWEEN", align: "CENTER" }, [row({ gap: 14, align: "CENTER" }, [row({ w: 48, h: 48, radius: 12, fill: "#DC2626", align: "CENTER", justify: "CENTER" }, [ic("log-out", 22, "#FFFFFF")]), col({ gap: 2 }, [T("Sign Out", { size: 21, w: 500, color: C.strong }), T("End current session.", { size: 14.5, color: C.sub })])]), link(row({ w: 40, h: 40, radius: 999, fill: C.dark, align: "CENTER", justify: "CENTER", name: "Sign out" }, [ic("log-out", 18, C.onDark)]), "s01")]))], { w: 380, pad: 24 }),
    ])),
  ]);
}

// ─── 11 Settings (with the added Accessibility card) ───────────────────────
function switchCtl(on) {
  const t = F({ dir: "NONE", w: 52, h: 30, radius: 15, fill: on ? C.accent : (C === HC ? "#333333" : "#CBD5E1"), name: on ? "Switch / On" : "Switch / Off" });
  const k = figma.createEllipse(); k.resize(24, 24); k.fills = solid(on && C === HC ? "#000000" : "#FFFFFF");
  put(t, k, on ? 25 : 3, 3);
  return row({ gap: 8, align: "CENTER" }, [t, T(on ? "On" : "Off", { size: 12.5, w: 700, color: C.sub, width: 26 })]);
}
function a11yRow(iconName, title, desc, control, linkTo) {
  const r = fw(row({ gap: 14, pad: [12, 14], radius: 14, fill: C.soft, stroke: C.border, sw: C.bw, align: "CENTER", name: `A11y setting / ${title}` }, [
    row({ w: 36, h: 36, radius: 10, fill: C.card, stroke: C.border, sw: 1, align: "CENTER", justify: "CENTER" }, [ic(iconName, 17, C === HC ? "#FFFF00" : NOTE.pin)]),
    fw(col({ gap: 2 }, [T(title, { size: 14.5, w: 600, color: C.strong }), T(desc, { size: 12.5, color: C.sub, fill: true })])),
    control,
  ]));
  if (linkTo) link(r, linkTo);
  return r;
}
function sizeCtl(active) {
  return row({ gap: 6 }, [["A", 13], ["A+", 16], ["A++", 19]].map((s, i) => row({ w: 46, h: 38, radius: 10, fill: i === active ? C.accentSoft : C.card, stroke: i === active ? C.accent : C.border, sw: i === active ? 2 : 1, align: "CENTER", justify: "CENTER", name: `Text size / ${s[0]}` }, [T(s[0], { size: s[1], w: 700, color: C.strong })])));
}
function langCtl() {
  return row({ gap: 2, pad: 3, radius: 10, fill: C.soft2 }, [row({ pad: [6, 10], radius: 8, fill: C.card }, [T("English", { size: 12.5, w: 600 })]), row({ pad: [6, 10] }, [T("Cebuano", { size: 12.5, w: 600, color: C.sub })])]);
}
function s11Settings() {
  const accessCard = card([
    fw(row({ justify: "SPACE_BETWEEN", align: "CENTER" }, [
      row({ gap: 14, align: "CENTER" }, [row({ w: 48, h: 48, radius: 12, fill: NOTE.pin, align: "CENTER", justify: "CENTER" }, [ic("accessibility", 24, "#FFFFFF")]), col({ gap: 2 }, [row({ gap: 10, align: "CENTER" }, [T("Accessibility", { size: 21, w: 500, color: C.strong }), chip("New", "purple"), pin(1)]), T("Make EnerSight easier to see, hear, read and use. Saved to your account.", { size: 14.5, color: C.sub })])]),
      hbtn("Save Accessibility", { kind: "green", icon: "save", lg: true }),
    ])),
    fw(row({ gap: 12 }, [
      fw(col({ gap: 10 }, [
        label("Seeing"),
        a11yRow("a-large-small", "Text size", "Makes all text and buttons bigger.", sizeCtl(0)),
        a11yRow("contrast", "High contrast", "Black background, white text, yellow highlights.", switchCtl(false), "s14"),
        a11yRow("eye", "Colour-blind safe status", "Adds ✓ ▲ ✕ shapes and stripes to every status colour.", switchCtl(true)),
      ])),
      fw(col({ gap: 10 }, [
        label("Hearing, moving & understanding"),
        a11yRow("volume-2", "Read aloud", "Reads the page, chart summaries and OCR results.", switchCtl(false)),
        a11yRow("move", "Reduce motion", "Turns off chart and panel animations.", switchCtl(true)),
        a11yRow("languages", "Language", "Interface language.", langCtl()),
      ])),
    ])),
  ], { pad: 24, gap: 16, name: "Card / Accessibility (added)" });
  accessCard.strokes = solid(NOTE.pin); accessCard.strokeWeight = 2;
  return appScreen("11 Settings", "Settings", "Settings", [
    pageHeader({ icon: "settings", eyebrow: "Account settings", title: "Settings", sub: "Update your account details and password.", pills: ["Role: Admin"], time: "1m · 11:44 PM" }),
    fw(row({ gap: 20 }, [
      stat("dark", "Signed-in User", "AdminTest", "Current local user profile", "user", { compact: true }),
      stat("purple", "Access Role", "Admin", "Determines available system pages", "shield-check", { compact: true }),
      stat("green", "Status", "Active", "Current account state", "circle-check", { compact: true }),
      R(10, 10, null, { name: "spacer" }),
    ])),
    accessCard,
    card([
      row({ gap: 14, align: "CENTER" }, [iconTile("zap", "dark", 48), col({ gap: 2 }, [T("Electricity Rate", { size: 21, w: 500, color: C.strong }), T("Rate used to convert energy (kWh) into estimated cost (₱).", { size: 14.5, color: C.sub })])]),
      fw(row({ gap: 16 }, [
        col({ gap: 8, w: 320 }, [label("Rate per kWh (₱)"), input("₱  12", { right: T("/ kWh", { size: 12.5, color: C.muted }) }), T("Set this to your electric utility's current rate.", { size: 12.5, color: C.sub })]),
        fw(col({ gap: 6, pad: 16, radius: 16, fill: C.accentSoft, stroke: C.accentBorder, sw: C.bw }, [T("EXAMPLE ESTIMATE", { size: 12, w: 600, color: C.accent, ls: 14 }), RT(["100 kWh × ₱12.00 = ", ["₱1,200.00", 700], " per month."], { size: 15, color: C.accent }), T("Currently saved: ₱12.00 / kWh", { size: 12.5, color: C.accent })])),
      ])),
      fw(row({ justify: "MAX" }, [hbtn("Save Rate", { kind: "green", icon: "save", lg: true })])),
    ], { pad: 24, gap: 16 }),
    fw(row({ gap: 24 }, [
      card([
        row({ gap: 14, align: "CENTER" }, [row({ w: 64, h: 64, radius: 16, fill: C.accent, align: "CENTER", justify: "CENTER" }, [T("A", { size: 22, w: 700, color: C.onAccent })]), col({ gap: 2 }, [T("Account Profile", { size: 21, w: 500, color: C.strong }), T("Update local account details.", { size: 14.5, color: C.sub })])]),
        fw(row({ gap: 16 }, [field("Username", input("AdminTest")), field("Full name", input("AdminTest"))])),
        col({ gap: 8, w: 222 }, [label("Role"), input("Admin", { disabled: true })]),
        fw(row({ justify: "MAX" }, [hbtn("Save Profile", { kind: "dark", icon: "save", lg: true })])),
      ], { pad: 24, gap: 16 }),
      card([
        row({ gap: 14, align: "CENTER" }, [iconTile("lock", "dark", 48), col({ gap: 2 }, [T("Password", { size: 21, w: 500, color: C.strong }), T("Prepare account password update.", { size: 14.5, color: C.sub })])]),
        field("Current password", input("Current password", { placeholder: true, right: ic("eye", 18, C.muted) })),
        fw(row({ gap: 16 }, [field("New password", input("New password", { placeholder: true })), field("Confirm password", input("Confirm password", { placeholder: true }))])),
        fw(row({ justify: "MAX" }, [hbtn("Update Password", { kind: "green", icon: "lock", lg: true })])),
      ], { pad: 24, gap: 16 }),
    ])),
  ]);
}

// ─── 12 Building Profile (modal) ───────────────────────────────────────────
function s12Profile() {
  const tab = (t, n, on) => {
    const r = row({ gap: 8, pad: [12, 12], align: "CENTER", stroke: on ? C.accent : null, sw: 2, name: `Tab / ${t}` }, [
      ic({ Overview: "building-2", Consumption: "chart-column", Meters: "gauge", Readings: "activity", Appliances: "plug", "Saved Reports": "file-text" }[t], 16, on ? C.accent : C.sub2),
      T(t, { size: 14.5, w: on ? 600 : 500, color: on ? C.accent : C.sub2 }),
      n !== undefined ? row({ pad: [1, 7], radius: 999, fill: C.soft2 }, [T(String(n), { size: 11, w: 600, color: C.sub })]) : null,
    ]);
    if (on) sides(r, 0, 0, 2, 0);
    return r;
  };
  const tileF = (iconName, l, v, wide) => {
    const t = row({ gap: 10, pad: [14, 14], radius: 12, fill: C.soft, stroke: C === HC ? "#FFFFFF" : null, sw: 1, name: `Detail / ${l}` }, [ic(iconName, 16, C.accent), col({ gap: 4 }, [label(l), T(v, { size: 14.5, w: 500, color: C.strong })])]);
    return fw(t);
  };
  const close = row({ w: 40, h: 40, radius: 12, fill: C.card, stroke: C.border, sw: C.bw, align: "CENTER", justify: "CENTER", name: "Close" }, [ic("x", 18, C.sub2)]);
  link(close, "s04");
  const readAloud = row({ gap: 6, pad: [9, 12], radius: 12, fill: C.card, stroke: NOTE.pin, sw: 2, align: "CENTER", name: "Read aloud (added)" }, [ic("volume-2", 16, C === HC ? "#FFFF00" : NOTE.pin), T("Read aloud", { size: 13, w: 600, color: C === HC ? "#FFFF00" : NOTE.pin })]);
  const modal = col({ w: 1152, radius: 24, fill: C.bg, clip: true, shadow: "xl", name: "Building Profile dialog" }, [
    fw(col({ gap: 0, fill: C.card, name: "Dialog header" }, [
      fw(row({ pad: [20, 24, 12, 24], justify: "SPACE_BETWEEN" }, [
        row({ gap: 16 }, [iconTile("building-2", "red", 48), col({ gap: 4 }, [
          T("BUILDING PROFILE · #41", { size: 12.5, w: 600, color: C.accent, ls: 18 }),
          T("Institute of Computing", { size: 25, w: 600, color: C.strong }),
          row({ gap: 8, align: "CENTER" }, [status("Critical"), chip("Laboratory", "blue"), chip("Active", "green"), T("DNSC Panabo Campus", { size: 12.5, color: C.sub })]),
        ])]),
        row({ gap: 8, align: "CENTER" }, [pin(2), readAloud, row({ w: 40, h: 40, radius: 12, fill: C.card, stroke: C.border, sw: C.bw, align: "CENTER", justify: "CENTER" }, [ic("refresh-cw", 17, C.sub2)]), close]),
      ])),
      fw(row({ gap: 8, pad: [0, 20], align: "CENTER", name: "Tabs" }, [tab("Overview", undefined, true), tab("Consumption"), tab("Meters", 2), tab("Readings", 36), tab("Appliances", 7), tab("Saved Reports", 0), pin(1)])),
    ])),
    fw(col({ gap: 20, pad: 24, name: "Dialog body" }, [
      stats([
        stat("green", "Total consumption", "937,453 kWh", "Measured from 36 meter readings.", "zap", { compact: true }),
        stat("blue", "Electricity cost", "₱11,249,438", "At ₱12.00 per kWh.", "wallet", { compact: true, hint: true }),
        stat("red", "Energy intensity", "366.2", "kWh/m²/yr · Critical", "gauge", { hint: true }),
        stat("purple", "Latest reading", "478,455 kWh", "Sep 5, 2026 · DNSC-ICT-02", "calendar", { compact: true }),
      ]),
      fw(row({ gap: 20 }, [
        card([cardHead("Building details", "The saved building record."),
          fw(row({ gap: 10 }, [tileF("layers", "Building type", "Laboratory"), tileF("activity", "Operational status", "Active")])),
          fw(row({ gap: 10 }, [tileF("ruler", "Floor area", "1,800 m²"), tileF("gauge", "Meters", "2 installed")])),
          tileF("map-pin", "Address", "DNSC Panabo Campus"), tileF("map-pin", "Coordinates", "7.31425, 125.67185"),
          fw(row({ gap: 10 }, [tileF("calendar", "Monitored since", "Apr 4, 2025"), tileF("hourglass", "Period covered", "519 days")])),
        ], { gap: 10 }),
        card([cardHead("Location", "Pin colour shows the energy status."), imageRect("profileMap", 440, 352, 12, "Location map (OpenStreetMap)")], { w: 482 }),
      ])),
      card([
        cardHead("Energy status", "Normal up to 150, High above 150, Critical above 250 kWh/m²/yr.", status("Critical")),
        fw(row({ gap: 16 }, [
          fw(col({ gap: 6, pad: 16, radius: 14, fill: C.soft, stroke: C.border, sw: C.bw }, [label("How it was worked out"), T("937,453 kWh ÷ 1,800 m² = 520.8 kWh/m² over 519 days → 366.2 kWh/m² per year", { size: 14, color: C.text, fill: true, lh: 150 })])),
          fw(col({ gap: 6, pad: 16, radius: 14, fill: C.accentSoft, stroke: C.accentBorder, sw: C.bw }, [label("Recommendation"), T("Immediate review recommended. Check equipment usage, schedules, and meter readings.", { size: 14, color: C.accent, fill: true, lh: 150 })])),
        ])),
      ]),
    ])),
  ]);
  const root = F({ dir: "NONE", w: 1440, h: 1180, fill: "#0F172A", name: "12 Building Profile" });
  put(root, modal, 144, 40);
  return root;
}

// ─── 13 Accessibility panel (dashboard with drawer open) ───────────────────
function s13Panel() {
  const d = dashboard("13 Accessibility Panel");
  const h = Math.max(1024, Math.round(d.height));
  const shade = R(1440, h, "#020617", { opacity: 0.45, name: "Backdrop" });
  put(d, shade, 0, 0);
  const close = row({ w: 40, h: 40, radius: 12, stroke: "#E2E8F0", sw: 1, align: "CENTER", justify: "CENTER", name: "Close" }, [ic("x", 18, "#475569")]);
  link(close, "s02");
  const apply = hbtn("Apply", { kind: "green", icon: "check", lg: true, fill: true });
  link(apply, "s02");
  const drawer = col({ w: 460, gap: 14, pad: 24, fill: "#FFFFFF", shadow: "xl", name: "Accessibility drawer" }, [
    fw(row({ justify: "SPACE_BETWEEN", align: "CENTER" }, [
      row({ gap: 12, align: "CENTER" }, [row({ w: 44, h: 44, radius: 12, fill: NOTE.pin, align: "CENTER", justify: "CENTER" }, [ic("accessibility", 22, "#FFFFFF")]), col({ gap: 2 }, [T("Accessibility", { size: 20, w: 700, color: "#020617" }), T("Changes apply right away on this device.", { size: 13, color: "#64748B" })])]),
      close,
    ])),
    label("Seeing"),
    a11yRow("a-large-small", "Text size", "A+ makes text 15% larger.", sizeCtl(0)),
    a11yRow("contrast", "High contrast", "Black background, white text, yellow highlights.", switchCtl(false), "s14"),
    a11yRow("eye", "Colour-blind safe status", "Shapes ✓ ▲ ✕ next to every status colour.", switchCtl(true)),
    label("Hearing & understanding"),
    a11yRow("volume-2", "Read aloud", "Reads pages, chart summaries and OCR results.", switchCtl(false)),
    a11yRow("languages", "Language", "English or Cebuano.", langCtl()),
    label("Moving"),
    a11yRow("move", "Reduce motion", "Turns off animations.", switchCtl(true)),
    a11yRow("keyboard", "Keyboard shortcuts", "Alt+D Dashboard · Alt+M Map · Alt+N New reading · ? all keys", ic("chevron-down", 16, "#475569")),
    apply,
  ]);
  put(d, drawer, 1440 - 460, 0);
  drawer.resize(460, h);
  drawer.layoutSizingVertical = "FIXED";
  return d;
}
