# How to put the EnerSight mock-up into Figma

## Best option: run the builder plugin (about 1 minute, already clickable)

The `figma-plugin/` folder has a small Figma plugin that builds the whole high-fidelity prototype inside
your own Figma file: 15 screens that copy the real EnerSight app (real logo, icons, map and data), purple
accessibility pins, a notes frame under every screen, and all the click-through links already wired.

1. Install and open the **Figma desktop app** (figma.com/downloads). Development plugins only run in the
   desktop app, not in the browser.
2. Create a new **Design file**.
3. Menu (Figma logo, top-left) → **Plugins → Development → Import plugin from manifest…** → choose
   `C:\capstone\EnerSight\figma-mockup\figma-plugin\manifest.json`.
4. Menu → **Plugins → Development → EnerSight Prototype Builder**. Wait a few seconds until it says
   "built 15 screens and 228 prototype links." (Screens copy the real EnerSight UI; edit src/ and run `node build.mjs` to rebuild.)
5. Open the **EnerSight Prototype** page and press **▶ Present** (top-right). It starts at Sign In.
   Click "Sign in", the sidebar, "Review now", "Full profile →", "High contrast", and so on.
6. Share: **Share → Anyone with the link can view**, then copy the prototype link from Present mode.

If the plugin shows an error, copy the message and send it to Claude.

The options below are the manual fallback.

---

There are 9 screens in this folder (`index.html` cover + `01`–`08`). Each is 1440 px wide.

## Option A — Editable Figma layers

1. In **Google Chrome**, install the **html.to.design** extension from the Chrome Web Store.
2. In **Figma**, open a new design file. Go to **Plugins → search "html.to.design" → Run** once so it's linked.
   (The free plan has a monthly import limit. 9 screens should fit. Check the plugin if it says otherwise.)
3. Open each screen in Chrome by double-clicking the file, e.g. `C:\capstone\EnerSight\figma-mockup\01-sign-in.html`.
4. Click the **html.to.design** extension icon → **Import this page** (desktop, 1440). It downloads a `.h2d` file.
5. In Figma, run the **html.to.design** plugin → **Import** tab → drop the `.h2d` file in. The screen appears as a frame
   with real text, shapes and auto-layout.
6. Repeat for every screen. Rename each frame `00 Cover`, `01 Sign In`, … `08 Dashboard High Contrast`.

> **Tip:** before importing `02-dashboard.html` you can click **High contrast** or **A+** in the toolbar. The
> extension captures what's on screen, so you can import extra variants.

## Option B — Images only (fast fallback)

Drag the PNGs from the `png/` folder into Figma. They look the same but are flat pictures. You can still
draw prototype hotspots over them (step below). Use this only if Option A doesn't work.

## Make it a clickable prototype

In Figma, click the **Prototype** tab (right panel). Select an element, drag the blue **+** circle to the target
frame, set **On click → Navigate to**, animation **Instant** (keeps it motion-safe):

| From screen | Click this | Go to |
|---|---|---|
| 00 Cover | each screen tile | that screen |
| 01 Sign In | **Sign in** button | 02 Dashboard |
| 02 Dashboard | "Science Laboratory Building" in EUI ranking | 05 Building Profile |
| 02 Dashboard | **Review now** link | 03 Add Meter Reading |
| 02 Dashboard | **High contrast** in the toolbar | 08 Dashboard High Contrast |
| 08 Dashboard High Contrast | **High contrast** in the toolbar | 02 Dashboard |
| Any screen | sidebar: Dashboard / GIS Map / Buildings / Add Meter Reading / Reports / Settings | 02 / 04 / 05 / 03 / 06 / 07 |
| 04 GIS Map | **Full profile →** | 05 Building Profile |
| 03 Add Meter Reading | **Confirm & save reading** | 02 Dashboard |

Set **01 Sign In** as the flow's starting frame (right-click the frame → *Add starting point*). Press **▶ Present**
to test it.

## Show the accessibility work inside Figma (graders notice this)

- Keep the **purple "Accessibility notes"** strip under each frame. It explains every numbered pin.
- Optional: run a contrast-checker plugin (e.g. **Stark** or **Contrast**) on a frame and screenshot the passing result.
- Optional: in **Dev Mode**, use Figma's **Annotations** to add notes like "aria-label: Zoom in" on icon buttons.
- Share: **Share → Anyone with the link → can view**, and submit the prototype link (**Present → Share prototype**).
