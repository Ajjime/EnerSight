# EnerSight: Accessible System Mock-up

**Project:** EnerSight, a campus building energy monitoring system
**Prototype tool:** Figma
**Standard followed:** WCAG 2.1 Level AA (Web Content Accessibility Guidelines)

## 1. Overview

EnerSight helps campus staff monitor electricity use per building. Users photograph a meter, the system reads the value
with OCR, grades each building's Energy Use Intensity (EUI) as Normal, High or Critical, and shows the results on a
dashboard, a GIS campus map and printable reports.

The people who will use EnerSight include maintenance staff, facility managers and administrators. Some of them may
have low vision, colour blindness, hearing loss, limited hand movement, or difficulty with technical terms, and some
are more comfortable in Cebuano than in English. The mock-up was designed so these users can complete every main task:
sign in, record a meter reading, find buildings that use too much energy, and produce a report.

## 2. Screens in the prototype

| # | Screen | Main task |
|---|---|---|
| 01 | Sign In | Log in, with accessibility options available before login |
| 02 | Dashboard | See campus totals and which buildings need attention |
| 03 | Add Meter Reading (OCR) | Photograph a meter, check the OCR result, save |
| 04 | GIS Map | Find buildings by location, with a list alternative |
| 05 | Building Profile | Understand one building's energy use and forecast |
| 06 | Reports | Generate accessible PDF/CSV/print reports |
| 07 | Accessibility Settings | Personalise display, audio, input and language |
| 08 | Dashboard (High contrast + Large text) | Shows the settings applied |

## 3. Accessibility features by user group

### 3.1 Users with low vision
- **Text size control (A / A+ / A++)** on every screen, including before login.
- **High-contrast theme:** black background, white text, yellow highlights, 2 px borders (Screen 08).
- **Read aloud (text-to-speech)** for any page.
- **Large-print (18 pt) reports.**
- All text meets a **4.5:1 contrast ratio** or higher (WCAG 1.4.3). The high-contrast theme exceeds 7:1.

### 3.2 Users with colour blindness
- **Status never relies on colour alone** (WCAG 1.4.1). Each EUI status has its own **shape, word and number**:
  ✓ circle = Normal, ▲ triangle = High, ✕ octagon = Critical, dashed circle = No data.
- Map pins use the same shapes. Chart bars for High and Critical are **striped**.
- An optional **blue/orange colour-blind palette** in Settings.

### 3.3 Blind and keyboard-only users
- **"Skip to main content"** link on the first Tab press (WCAG 2.4.1).
- A **3 px blue focus ring** on every control (WCAG 2.4.7).
- The GIS map has a **list view** with the same information. Blind users can choose "List only".
- **Keyboard map control** (arrow keys, +/−, Tab between buildings) and **keyboard shortcuts** (Alt + D, M, N, R).
- **Every chart has a text summary and a data-table view** (WCAG 1.1.1). Tables have captions and headers.
- Meter photos have **alt text** stating the reading. Icon-only buttons have labels such as "Zoom in".

### 3.4 Users with motor disabilities
- Buttons and links are **at least 44 × 44 px** (WCAG 2.5.5), with an extra-large option in Settings.
- Recording a reading **does not require the camera**. Users can **type it manually** or **say it with voice input**.
- A large drag-and-drop area for photo upload.
- **Longer session timeout** with a warning and an "I need more time" button (WCAG 2.2.1).
- **Reduce motion** setting. Prototype transitions are instant.

### 3.5 Deaf or hard-of-hearing users
- No information is given by sound only. **Visual alerts** (banner and screen-border flash) replace sound alerts.

### 3.6 Users with cognitive or language difficulties
- **Plain-language explanations** next to technical numbers, e.g. "This building uses almost twice the normal energy
  for its size", with a "What does this mean?" panel.
- **Step indicator** ("Step 3 of 3") when recording a reading.
- **Error prevention** (WCAG 3.3.4): before saving, the user sees the used kWh, the cost and a "looks reasonable" check,
  and can go back or save as "needs review". Uncertain OCR digits are highlighted.
- **Helpful error messages** (WCAG 3.3.1, 3.3.3) say what is wrong and how to fix it.
- **English / Cebuano** language switch, and a dyslexia-friendly font option.

## 4. WCAG 2.1 checklist used

| Guideline | How the mock-up meets it |
|---|---|
| 1.1.1 Non-text content | Alt text on photos, labels on icon buttons, data tables for charts |
| 1.3.1 Info and relationships | Real headings, labelled form fields, table headers |
| 1.4.1 Use of colour | Shape + word + number for every status |
| 1.4.3 Contrast (minimum) | 4.5:1 for text, 7:1+ in high contrast |
| 1.4.4 Resize text | A / A+ / A++ up to 130% without breaking layout |
| 2.1.1 Keyboard | All functions, including the map, work by keyboard |
| 2.2.1 Timing adjustable | Session timeout warning and extension |
| 2.4.1 Bypass blocks | Skip to main content |
| 2.4.7 Focus visible | 3 px focus ring |
| 2.5.5 Target size | 44 px minimum |
| 3.1.1 Language of page | English / Cebuano switch |
| 3.3.1 / 3.3.3 Error identification and suggestion | Errors explain the problem and the fix |
| 3.3.4 Error prevention | Review step before saving a reading |

## 5. Conclusion

The EnerSight mock-up shows that a technical energy monitoring system can stay usable for people with different
abilities. Every key task can be completed without relying on colour, sight, a mouse, a steady hand, hearing or
technical knowledge, and users can adjust the system to their needs in Accessibility Settings.
