# Lone Mesa Energy · v4

A presentation-ready operations workspace for all six CaseQuest sites. Open **Lone-Mesa-Energy.html** for the offline version, or use the [hosted website](https://arroyo-critical-parts-casequest-2026.milkystork12.chatgpt.site/). Select a role at the lower left and a site at the top; **All sites** is the default.

## Dashboard and role views

The dashboard opens as a chart gallery. Select a card to view its chart, switch chart types, inspect source values, or select another chart using the preview tabs.

| Role | Dashboard charts | Other pages and actions |
|---|---|---|
| Supervisor | All eight: lost oil, potential/produced oil, contribution loss, downtime stages, site comparison, HSE, reading quality, parts readiness | HSE, Downtime, Parts, Setup & Training, Access & Activity; operational, downtime, parts and setup exports; workbook cost inputs |
| Technician | HSE, reading quality, parts readiness | Read-only HSE and parts records; training requirements; no financial fields, report exports or Access & Activity |
| HSE Supervisor | HSE and reading quality | HSE review, Setup & Training, Access & Activity; HSE export; no general operational or financial exports |

Route access, search results, dialogs, exports, chart navigation and assistant actions share these permissions. Changing roles closes restricted dialogs and resets the chart view. These are proposed application permissions, not a claim about the source company's existing controls.

## Evidence and projections

**CaseQuest2026Dataset.xlsx is the only business-data input.** The participant PDF is not a data source. Operating records cover 2025; HSE status is the October 1, 2026 snapshot. There are six sites, 18 assets, 385 unique events, 216 production rows, 6,570 daily readings and 36 unique HSE observations. Recorded unplanned downtime is 6,598.55 equipment-hours; concurrent asset outages may overlap in clock time.

Duplicate export rows are checked before removal. Missing event durations and production potential values are restored only where supported by workbook formulas. Explicit Fahrenheit readings are converted to Celsius. Missing readings and pending invoice values remain unavailable. Site inputs are counted once per site. Record dialogs show source sheet/row references; **workbook-provenance.json** preserves cell references, transformations and reconciliation results.

The lost-oil, production, financial and site-comparison views offer **January–March 2026 baseline projections, as of December 31, 2025**. They use 2025 asset-level volume per calendar hour, workbook capacity and fixed historical margins. Projections are derived estimates, not workbook records or current/live data. No growth, intervention benefit or seasonality is assumed. A January–September fit is evaluated against an October–December holdout; only three holdout months are available.

**analytics-method.md** documents formulas, assumptions, source rounding, backtests and verified totals. Produced oil already includes recovered oil. Financial charts show modeled contribution, not revenue or demonstrated cash savings. Cause totals and downtime-stage totals describe the same outages and must not be added together.

No invented inventory balances, employees, completion statuses or project-progress records are included. Parts readiness shows recorded spare-fill inputs and parts-wait exposure. Training and configuration figures are workbook requirements/options, not approved budgets or completion evidence.

## Local workbook guide

The floating guide answers supported workbook questions, compares sites and navigates to permitted pages/charts. It can apply site filters and initiate exports allowed for the selected role. It uses local rules and workbook calculations; it does not call an LLM or network service. Unsupported questions receive a limitation rather than an invented answer. It cannot change source records or operate equipment.

## Presentation images

The **screens** folder contains 26 PNGs at **3200 × 1800** (16:9):

- Dashboard; lost oil, production and financial views in both current and projection modes.
- Downtime chart, site comparison, HSE chart, reading quality, parts chart and workbook guide.
- HSE page, Downtime page, Parts page, Setup & Training and Access & Activity.
- All four Technician pages and all four HSE Supervisor pages.

Screenshot filename stems are `dashboard`, `oil-loss-current`, `oil-loss-projection`, `production-current`, `production-projection`, `financial-current`, `financial-projection`, `downtime-chart`, `site-comparison`, `hse-chart`, `data-quality`, `parts-chart`, `chatbot`, `supervisor-hse`, `downtime-page`, `parts-page`, `setup`, `access`, `technician-dashboard`, `hse-supervisor-dashboard`, `technician-hse`, `technician-parts`, `technician-setup`, `hse-supervisor-hse`, `hse-supervisor-setup` and `hse-supervisor-access`.

## Source and refresh

**source/dist** contains editable HTML, CSS and JavaScript. No build or package installation is required to serve it. The analytics additions are `analytics-model.js` (calculations), `analytics-ui.js` (gallery/charts), `analytics.css` (interface styles) and `site-assistant.js` (local guide).

The retained scripts in **source/scripts** refresh the workbook export. Python 3 with `openpyxl` is needed only for extraction. Run from the source folder:

```sh
python3 scripts/extract_workbook.py /path/to/CaseQuest2026Dataset.xlsx /path/to/extracted
python3 scripts/build_webdata.py /path/to/extracted/workbook-data.json dist/data.js
python3 -m http.server 8765 --directory dist
```

Review the extraction audit, rerun validation, then regenerate the offline HTML and screenshots after refreshing data. No live endpoint or automatic telemetry feed is configured.

**source/tests** contains the expected analytics fixture and browser QA. Numeric checks cover company/site totals, monthly reconciliations, volume/contribution identities and projections. Browser checks cover role restrictions, direct routes, site filtering, chart controls, exports, guide behavior and screenshot layouts. For browser checks, install the development dependency (`npm install`, `npx playwright install chromium`), start the static server, then run `npm test`. Set `TEST_URL` or `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` if needed. Use the supplied fixture as a regression reference; a changed workbook requires an independently reviewed update.

## Deployment boundary

This package is a read-only presentation application. The role selector demonstrates role-specific views; it is **not authentication**. Static workbook data can be inspected by a visitor with access to the site. Operational deployment requires authenticated identities, server-side authorization, a connected data source with refresh/failure handling, and protected audit storage. No equipment controls, supplier integrations or live telemetry are connected.
