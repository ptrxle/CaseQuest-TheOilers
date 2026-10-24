# Lone Mesa Energy · Spare Parts

The website has three main pages: **Dashboard**, **Spare Parts**, and **HSE Actions**. Spare Parts is the operational workflow. The attached version’s dashboard calculations, charts, HSE verification flow and shared design are preserved.

## Spare-parts workflow

Select a site or All sites. Inventory, orders and automation are views inside Spare Parts.

- **Supervisor:** add/edit parts and thresholds, enable site rules, approve/cancel requests, record issues/counts and receipts.
- **Technician:** view inventory and orders, record stock issues/counts and receive approved requests.
- **HSE Supervisor:** read-only spare-parts view; existing HSE demo verification remains available.

The browser role selector is a demonstration, not authentication. Data persists in the same browser and origin. The offline file and hosted website have separate browser storage; records are not synchronized across devices.

Automation runs when enabled, when relevant stock changes, and when Check stock is selected. Inventory position = on hand + outstanding quantities in pending, approved and partially received requests. When the position is at or below the reorder point, the request quantity is target stock minus inventory position. Each item has at most one open request. Requests require Supervisor approval; they are not supplier purchase orders. Partial receipts update stock and outstanding quantity. Receipt references prevent duplicate posting. Disabling automation stops new requests and leaves existing ones for review.

Unknown opening stock, thresholds, supplier and unit cost remain unavailable until explicitly entered. Zero is a valid known count. SKU uniqueness is enforced per site. Audit notes record demo roles and timestamps. Reset spare-parts data clears only inventory, requests, site rules and their activity; HSE demo state remains separate.

## Two-minute demonstration

1. Open Spare Parts as Supervisor; select Mesa and choose Try demo.
2. Create the clearly simulated spare: stock 4, reorder point 2, target 8. The site rule becomes enabled.
3. Issue 3 with a simulated usage note. Stock becomes 1 and one request for 7 is created.
4. Open Orders. Repeated Check stock clicks do not create duplicates.
5. Open the request and approve it with a Supervisor note. No purchase is sent.
6. Switch to Technician. Receive all 7, or record partial deliveries using unique references. Stock reaches 8 when all units arrive.
7. Inspect other sites and Automation. Each site has independent rules and stock.
8. Reset through Automation as Supervisor when finished.

For HSE, open Mesa H007, submit a simulated note, then verify using a supervisor demo role and required verification note. H008 must also be verified before the critical hold clears. This is a prototype readiness gate, not an equipment control. Workbook status remains unchanged.

## Evidence boundary

CaseQuest2026Dataset.xlsx is the only historical business-data source. Operations cover 2025; HSE status is the October 1, 2026 snapshot. The workbook supplies site spare-fill inputs and historical parts-wait hours, but no SKUs, stock quantities, reorder thresholds, suppliers, procurement orders or receipts. Inventory starts empty. Try demo creates clearly labeled simulated inputs only after the user chooses it.

Workbook evidence is available beneath each Spare Parts view. Company parts-wait exposure is 1,613.32 equipment-hours across 95 unplanned events; site-level fill rates are counted once per site and are not averaged into an unsupported company fill rate. References: Assets.spare_fill_pct and Events.parts_wait_hours. `spares-workbook-audit.json` documents the audit; `workbook-provenance.json` retains the original cleaning and lineage evidence. Historical parts expenses are not used as unit costs.

Dashboard forecasts remain the attached version’s January–March 2026 historical-baseline estimates from 2025 records. They are not current data or quantified benefits of this spare-parts workflow. `analytics-method.md` gives the formulas and checks. Historical records, demo workflow updates and projections are separate.

The workbook guide explains supported questions and navigates permitted views. It cannot submit supplier purchases, change permissions or operate equipment. Inventory/order export is not offered; workbook report exports contain historical site metrics.

## Files and presentation

Open `Lone-Mesa-Energy.html` in the delivery package for the complete offline application. `source/dist` contains the editable website, which needs no build to serve. `images` contains exactly seven 3200 × 1800 PNGs in presentation order:

1. Dashboard — retained analytical overview.
2. Parts delay by site — historical problem evidence.
3. Site inventory — stock, reorder point and target.
4. Site replenishment rules — separate automation per site.
5. Automatic request review — the generated request and required approval.
6. Receipt completed — technician receipt and request progress.
7. HSE supervisor verification — separate safety workflow and critical hold.

Demo screenshots show an explicitly simulated Mesa spare. No fabricated supplier, price or workbook inventory is presented.

## Local development and validation

Serve the `dist` directory with a static server, for example `python3 -m http.server 8765 --directory dist`. The `scripts` directory retains workbook extraction tools; review source and cleaning audits before replacing data.

Run `npm install` and install Playwright’s Chromium if needed. Start the static server, then run `npm test`. `TEST_URL` overrides the preview address and `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` selects a local browser. `npm run test:model` runs inventory model tests without a browser. The delivery verification reports record the tested environment and results.

## Deployment boundary

This is a presentation prototype with browser-local records. No shared inventory database, production authentication, supplier integration or unattended background process is connected. Production rollout needs those integrations and server-side authorization/audit storage. The historical workbook and HSE source records remain unchanged.
