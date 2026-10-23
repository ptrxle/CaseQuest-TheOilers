# Field Operations

This version replaces the Arroyo-only interface with all six sites and three distinct role views. Business records are sourced exclusively from CaseQuest2026Dataset.xlsx. The participant PDF is not an input to this version.

## Start

Open Field-Operations.html for the offline presentation version. The hosted version is https://arroyo-critical-parts-casequest-2026.milkystork12.chatgpt.site/. Its display title is Field Operations; the existing URL is retained.

Choose a role in the lower-left corner and a site at the top. All sites are included by default. The source workbook is immutable in this interface: filters, search, record details and permitted CSV exports do not change it.

## Role views

Supervisor: operational dashboard, HSE records, downtime analysis, parts readiness, setup/training and Access & Activity. Operational, downtime, parts and setup exports are available. Workbook cost inputs are visible.

Technician: equipment dashboard, read-only HSE records, parts readiness and training requirements. No Access & Activity tab, downtime-analysis page, financial fields or exports.

HSE Supervisor: safety dashboard, HSE review, setup/training and Access & Activity. HSE export is available. General operational and financial exports are unavailable.

The route guard, search, detail dialogs and export functions use the same permission rules. A role change closes open dialogs and removes restricted content. Application permissions are a proposed interface design, not evidence that these controls existed in the source company.

## Data

Operating period: 2025. HSE status: October 1, 2026. Source workbook SHA-256: b4d32ee1935619eec5a7729428e525eb74c44f2d5cd04a0f7e13fe4cd84533b8.

There are 6 sites, 18 assets, 385 unique events (313 unplanned), 216 monthly production rows, 6,570 daily readings and 36 unique HSE observations. All-site unplanned downtime is 6,598.55 equipment-hours. Equipment-hours can overlap across assets.

Repeated export rows are removed after checking normalized business IDs and duplicate field equality. Four missing event durations and three production potential values are restored using the workbook's own formulas. Explicit Fahrenheit readings are converted to Celsius. Missing readings and pending invoice values stay unavailable. Site-level inputs are counted once per site, not once per asset. Training hours equal technician count multiplied by source hours per person.

The interface includes source sheet/row details for individual records. workbook-provenance.json includes original values, exact cell references, transformations and reconciliation results. No invented inventory, employee, training-completion, transaction, or project-progress records are included. Parts readiness uses site spare-fill rates and recorded parts-wait events. Configuration cost inputs and O6 training costs are workbook option inputs, not approved project budgets.

## Presentation images

The screens folder has 14 PNGs, each 3200 × 1800 (16:9), covering all pages available to each role. supervisor-* has all six main pages; technician-* has four field views; hse-supervisor-* has four safety views. Use the two role dashboards to explain why each user sees different information.

## Code and refresh

source/dist contains editable HTML, CSS and JavaScript. No build or package installation is needed to serve the application. source/scripts contains the workbook extractor and web-data builder. Python 3 with openpyxl is needed only to refresh the data:

    python3 scripts/extract_workbook.py /path/to/CaseQuest2026Dataset.xlsx /path/to/extracted
    python3 scripts/build_webdata.py /path/to/extracted/workbook-data.json dist/data.js
    python3 -m http.server 8765 --directory dist

Run these commands from the source folder. Review the extraction audit and update the saved offline HTML after a data refresh. No live data endpoint is configured.

## Validation and production boundary

Checked all six sites, role navigation, direct restricted URLs, export allowlists, financial fields in dialogs, search filtering, role changes, HSE filters/pagination, source totals, invalid saved-role fallback, keyboard skip navigation and mobile overflow. All 14 image captures fit their slide frame without clipping.

This is a presentation-ready, read-only application. The browser role selector demonstrates access behavior; it is not secure authentication. All downloaded static data can be inspected by a visitor who already has access to the private site. Genuine production deployment needs identities mapped to roles and server-side authorization, a connected data source with refresh/failure handling, and protected audit storage. No equipment controls, supplier integrations or live telemetry are connected. These cannot be verified from an uploaded workbook alone.
