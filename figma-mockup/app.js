// Shared sidebar, top bar and accessibility toolbar for every mock-up screen.
// Each page sets <body data-page="Dashboard" data-title="..."> and has <div id="sidebar"> + <div id="topbar">.

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
};
const NAV = [
  ["Monitor", ["Dashboard", "GIS Map", "Buildings", "Meters", "Add Meter Reading"]],
  ["Insights", ["Reports", "Analytics"]],
  ["Account", ["Users", "Profile", "Settings"]],
];
const LINKS = {
  Dashboard: "02-dashboard.html", "GIS Map": "04-gis-map.html", Buildings: "05-building-profile.html",
  "Add Meter Reading": "03-add-reading.html", Reports: "06-reports.html", Settings: "07-accessibility-settings.html",
};

function icon(name) {
  return `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;
}

const page = document.body.dataset.page;
const sb = document.getElementById("sidebar");
if (sb) {
  sb.outerHTML = `
  <nav class="sidebar" aria-label="Main navigation">
    <div class="logo"><span class="logo-mark" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="#022c22"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg></span>EnerSight</div>
    ${NAV.map(([group, items]) => `
      <div class="nav-label" id="nav-${group}">${group}</div>
      <div class="nav" role="list" aria-labelledby="nav-${group}">
        ${items.map((n) => `<a role="listitem" href="${LINKS[n] || "#"}" ${n === page ? 'aria-current="page"' : ""}>${icon(n)}${n}</a>`).join("")}
      </div>`).join("")}
  </nav>`;
}

const tb = document.getElementById("topbar");
if (tb) {
  tb.outerHTML = `
  <header class="topbar">
    <div class="crumb">${page}</div>
    <div class="a11y-toolbar" role="toolbar" aria-label="Accessibility options">
      <span class="pin" aria-hidden="true">A</span>
      <button class="tb" data-size="" aria-pressed="true" aria-label="Normal text size">A</button>
      <button class="tb" data-size="large" aria-pressed="false" aria-label="Large text">A+</button>
      <button class="tb" data-size="xlarge" aria-pressed="false" aria-label="Extra large text">A++</button>
      <span class="sep" aria-hidden="true"></span>
      <button class="tb" data-hc aria-pressed="false">
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/></svg>
        High contrast</button>
      <button class="tb" aria-pressed="false">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 9v6h4l5 5V4L7 9zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4z"/></svg>
        Read aloud</button>
      <span class="sep" aria-hidden="true"></span>
      <button class="tb" aria-pressed="true" lang="en">EN</button>
      <button class="tb" aria-pressed="false" lang="ceb">CEB</button>
    </div>
    <div class="user-chip"><span class="avatar" aria-hidden="true">JM</span>Juan Mendoza<span class="muted small">· Admin</span></div>
  </header>`;
}

// Working toggles, so each state can be captured into Figma as its own frame.
document.querySelectorAll("[data-size]").forEach((b) =>
  b.addEventListener("click", () => {
    document.body.classList.remove("large", "xlarge");
    if (b.dataset.size) document.body.classList.add(b.dataset.size);
    document.querySelectorAll("[data-size]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  }),
);
document.querySelectorAll("[data-hc]").forEach((b) => {
  b.setAttribute("aria-pressed", String(document.body.classList.contains("hc")));
  b.addEventListener("click", () => {
    const on = document.body.classList.toggle("hc");
    b.setAttribute("aria-pressed", String(on));
  });
});

// Reflect a pre-set size class (e.g. screen 08) in the toolbar's pressed state.
const preset = ["xlarge", "large"].find((c) => document.body.classList.contains(c)) || "";
document.querySelectorAll("[data-size]").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.size === preset)));
