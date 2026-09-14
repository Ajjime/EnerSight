# EnerSight — Documentation of Changes

Kini nga dokumento naglista sa tanan nga na-usab nga wala pa ma-commit (based sa
`git status` / `git diff`). Duha ka dagkong feature ang gidugang:

1. **Cost estimation** — pag-convert sa energy (kWh) ngadto sa estimated bill (₱),
   naka-base sa usa ka global nga electricity rate.
2. **Appliances** — pag-record og mga appliance kada building para maka-estimate og
   consumption ug cost bisan walay metered reading.

Dugang pa, gi-improve ang **appliance form** para mas gamay ang manual input (auto-fill
gikan sa "Quick Pick" preset).

---

## 1. Backend Changes

### Bag-ong files

| File | Description |
|---|---|
| `enersight-backend/app/routes/appliances.py` | Bag-ong router para sa appliances (CRUD). Naay `appliance_kwh_month()` nga mag-compute sa estimated monthly kWh = `watts × quantity × hours/day × days/month ÷ 1000`, ug `serialize_appliance()` nga mag-apil sa `estimated_kwh_month` ug `estimated_cost_month`. |
| `enersight-backend/app/routes/settings.py` | Bag-ong router para sa global settings. Nag-store sa `rate_per_kwh` (default `₱12.0`). Naay `get_rate_per_kwh()` helper nga gigamit sa ubang modules. Endpoints: `GET /settings/rate`, `PUT /settings/rate`. |

### Na-usab nga files

**`enersight-backend/app/models.py`**
- Bag-ong `Appliance` model (`appliances` table): `appliance_id`, `building_id` (FK),
  `name`, `category`, `wattage`, `quantity`, `hours_per_day`, `days_per_month`, `created_at`.
- Bag-ong `Setting` model (`settings` table): `setting_id`, `key` (unique), `value`, `updated_at`.
- `Building` model — gidugangan og `appliances` relationship (`cascade="all, delete-orphan"`).

**`enersight-backend/app/schemas.py`**
- Bag-ong schemas: `ApplianceCreate`, `ApplianceResponse` (naay `estimated_kwh_month`,
  `estimated_cost_month`), `RateUpdate`, `RateResponse`.

**`enersight-backend/app/main.py`**
- Gi-register ang bag-ong routers: `appliances.router` ug `settings.router`.

**`enersight-backend/app/routes/analytics.py`**
- Gigamit na ang `get_rate_per_kwh(db)`.
- `GET /analytics/summary` — gidugangan og `rate_per_kwh` ug `total_cost`.
- `GET /analytics/building-comparison` — kada building naa nay `total_cost`.

---

## 2. Frontend Changes

### Bag-ong file

| File | Description |
|---|---|
| `enersight-frontend/src/utils/currency.js` | Shared helpers: `DEFAULT_RATE_PER_KWH` (12), `formatPeso()` (e.g. `₱3,225.60`), ug `applianceKwhMonth()` para sa client-side estimate. |

### Na-usab nga files

**`enersight-frontend/src/pages/SettingsPage.jsx`** (+137)
- Bag-ong **Electricity Rate** section: pwede i-set ang `Rate per kWh (₱)`.
- Nag-fetch sa `GET /settings/rate` ug nag-save via `PUT /settings/rate`, naay validation
  (dili pwede negatibo o dili numero) ug toast feedback.

**`enersight-frontend/src/pages/Dashboard.jsx`** (+42)
- Nag-fetch sa rate, nag-display na og estimated bill (`formatPeso`) tapad sa kWh figures
  (building ranking + total consumption stat).

**`enersight-frontend/src/pages/Analytics.jsx`** (+65)
- Bag-ong **Estimated Cost** stat card (`total kWh × rate`).
- Gidugangan og **Est. Cost** column sa building comparison table.

**`enersight-frontend/src/pages/Reports.jsx`** (+67)
- Gidugangan og **Est. Cost (₱)** column sa report table ug total.
- Gi-apil ang `Estimated Cost (PHP)` sa CSV/export.

**`enersight-frontend/src/pages/BuildingsList.jsx`** (+602)
- Bag-ong **Appliances** management per building (add/edit/delete, category dropdown,
  "Quick Pick" preset, live kWh + cost estimate).
- **Recent improvement (reduce manual input):**
  - `appliancePresets` — kada preset naa nay `hours_per_day` + `days_per_month`
    (e.g. Aircon 8h, Refrigerator 24h, Desktop 8h × 22 days).
  - `applyPreset()` — nag-auto-fill na sa `hours_per_day` ug `days_per_month`
    (dugang sa name, category, wattage).
  - "Quick Pick" field — gidugangan og helper text; editable gihapon ang tanan.

---

## 3. Config / Misc

**`.claude/settings.json`**
- Gidugangan sa allow-list ang pipila ka git commands (`git rm`, `git add`, `git push`,
  `echo "Exit: $?"`).

**Wala gi-track / generated:**
- `EnerSight_Defense_Notes.pdf`, `enersight-backend/build_defense_pdf.py` — defense notes.
- `*.pyc` sa `__pycache__/` — Python bytecode (auto-generated).

---

## Summary

| | Count |
|---|---|
| Bag-ong backend files | 2 (`appliances.py`, `settings.py`) |
| Bag-ong frontend files | 1 (`currency.js`) |
| Na-usab nga source files | 9 |
| New DB tables | 2 (`appliances`, `settings`) |
| New API endpoints | 5 (`/appliances` CRUD + `/settings/rate` GET/PUT) |
