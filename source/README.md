# Lone Mesa Energy · Arroyo-first Spare Parts

**Spare Parts is the landing page. Arroyo is selected on a fresh visit.** The navigation contains only Spare Parts, Dashboard and HSE Actions. This update builds on the attached Lone-Mesa-Spare-Parts-Update version.

## Pages

- **Spare Parts:** an Arroyo-first historical dashboard above the working inventory tracker. Source evidence shows monthly parts waits, asset priorities and compact comparisons with the other five sites. The tracker includes stock status, request progress, inventory, orders and site automation.
- **Dashboard:** a larger Arroyo spotlight explains the priority, compares all six sites, shows monthly waits and equipment groups, and displays potential HSE severity. The O4 card is explicitly a case scenario. Existing oil, production, financial and quality charts are retained under More operational charts.
- **HSE Actions:** the existing source records, simulated completion/verification workflow and site critical hold remain intact. Arroyo links open H019 and H020.

The site selector changes the focus. All sites retains Arroyo as the historical spotlight while the inventory tracker totals all selected-site records; those scopes are labeled separately. Comparison charts always show all six sites. A site card selects that site. Explicit browser view choices are remembered for the session; a new session starts with Arroyo.

## What the evidence supports

2025 deduplicated unplanned records show Arroyo has 644.81 parts-wait equipment-hours, 38 affected events and 1,986.12 total stopped equipment-hours. Its share of company parts wait is 39.97%, displayed as 40.0%. Arroyo’s 42% source local fill is the lowest case planning input; it is not a measured live inventory balance.

The other-five simple mean is 193.702 parts-wait hours per site and 11.4 affected events per site. Average wait per affected event is 16.97 hours at Arroyo versus 16.99 hours across the other sites combined. The latter is combined hours divided by combined affected events, not an average of site averages. The evidence supports prioritizing frequent parts delays; it does not prove which SKU was missing or establish causality from spare fill.

Asset and cause groupings identify where to investigate inventory needs. They are not a parts catalog. No actual SKUs, stock quantities, suppliers, reorder thresholds or purchase orders are supplied by the workbook.

**Sources:** CaseQuest2026Dataset.xlsx, Assets, Events, HSE, Solutions, ReadMe and Dictionary. The independent `arroyo-focus-audit.json` retains source coordinates, deduplication checks, reconstructed durations and calculation inputs. `workbook-provenance.json` preserves the previous source-cleaning evidence. The workbook and `data.js` are unchanged.

## HSE and scenario boundaries

HSE status is the October 1, 2026 source snapshot, separate from 2025 operating history. Potential severity describes a possible consequence, not a forecast of accidents. Dashboard HSE counts remain source counts after demo verification. H019/H020 demo updates stay separate from source status. A site’s demo hold remains active until all its critical open source actions have verified demo closures; it is not an equipment control.

O4’s base case uses Solutions!S5: a 60% reduction in unplanned parts-wait hours. For Arroyo, 644.81 × 60% = 386.886 modeled hours avoided, leaving 257.924 parts-wait hours over a full comparable operating year after implementation. Other downtime stages and protected safety work stay unchanged. This is a scenario, not observed improvement, a guarantee, or a first-year cash-saving claim. The scenario drill-down shows supporting calculations and applicable O4 inputs; O4 option costs alone are not a complete rollout budget.

The secondary gallery’s January–March 2026 historical-baseline projections are separate from the O4 case scenario. They use 2025 records without an intervention benefit. See `analytics-method.md`.

## Tracker and roles

- **Supervisor:** configure parts and thresholds, enable site rules, approve/cancel requests, record issues/counts and receipts.
- **Technician:** view stock, record issues/counts, and receive approved requests.
- **HSE Supervisor:** read-only spare-parts access; the existing HSE demo review remains available.

Unknown values remain unavailable, distinct from zero. No demo inventory is created automatically. Demo roles are browser controls, not production authentication. Records are saved only in the same browser and origin. Hosted and offline copies do not share state.

When a site rule is enabled, stock changes and Check stock evaluate inventory position = on hand + outstanding pending/approved/partially received quantities. At or below the reorder point, a request is created for target stock minus inventory position. At most one open request exists per part. Supervisor approval is required; no supplier purchase is sent. Partial receipts update stock, and unique receipt references prevent duplicate posting.

## Presentation walkthrough

1. Open the landing page to show Arroyo’s historical evidence and the separate tracker.
2. Open Dashboard: 40.0% of company parts wait, lowest source fill, monthly and asset comparisons, potential HSE severity and the labeled O4 scenario.
3. Return to Spare Parts as Supervisor. Try demo defaults to Arroyo and creates one clearly simulated spare: stock 4, reorder point 2, target 8.
4. Issue 3 with a note. One pending request for 7 is created; repeated checks create no duplicates.
5. Approve with a Supervisor note. Switch to Technician and record partial or full receipt with unique references. Receiving all 7 restores stock to 8.
6. In HSE Actions, submit H019 for review, then verify using a supervisor demo role and a verification note. H020 still keeps the critical hold active until it is also verified.
7. Reset spare-parts demo through Automation and HSE demo through its details dialog. Each reset affects only its own simulated records.

## Deliverables

`Lone-Mesa-Energy.html` in the delivery package is the complete offline website. The `source` folder contains editable code. `images` contains seven actual website PNGs: landing page, full Arroyo dashboard, comparison/HSE/scenario detail, inventory tracker, automatic request review, technician receipt, and Arroyo HSE verification. Screenshots with inventory updates are explicitly simulated. The dashboard image is full-page; the comparison/HSE/scenario image is a focused capture for slide readability.

## Local development and verification

Serve `dist` with a static web server, for example `python3 -m http.server 8765 --directory dist`. No build is required. Workbook extraction scripts remain available in `scripts`; validate any replacement workbook and its provenance before refreshing data.

Install the development dependencies and Playwright browser as needed. With the preview server running, `npm test` runs model, analytics and tracker checks. Set `TEST_URL` to another local preview and `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to a local Chromium/Chrome executable. `npm run test:model` needs no browser.

Verification includes 91 new source comparisons, 126 existing analytics/projection comparisons, all six sites, 12 months, equipment groups, chart drill-downs, legacy chart controls, role guards, browser persistence, request/receipt handling, source immutability, the H019/H020 critical hold and mobile layout. Delivery reports record the results.

This remains a presentation prototype. Production use requires authenticated identities, server-side permissions, shared inventory storage and audit records, and an actual supplier integration for procurement. No live inventory or background purchasing process is connected.
