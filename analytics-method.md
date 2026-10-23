# Lone Mesa Energy analytics method

The only input is the cleaned, traced export of `CaseQuest2026Dataset.xlsx`. Historical views cover calendar 2025. Projection views are explicitly fixed to **January–March 2026, as of December 31, 2025**. They are historical-baseline estimates, not current or live forecasts.

## Public API

Load `analytics-model.js` after the workbook data. It reads `window.WORKBOOK_DATA`, with `window.DATA` / lexical `DATA` fallback, and exposes `window.LMEAnalytics`.

- `aggregate('all' | siteId)` returns `totals`, `monthly`, `sites`, `stages`, `causes`, and source-row references. Historical production and monetary totals include **planned and unplanned** events. The object also exposes explicit unplanned and planned downtime/event subtotals.
- `monetary(scope)` returns total contribution loss, monthly/site values, event-type splits, and cause/stage breakdowns.
- `projection(scope)` returns three projected months, totals, asset models, historical variability ranges, and the chronological backtest.
- `backtest(scope)` returns the train/holdout periods, three predictions, three actuals, and metrics.
- `method` contains concise chart labels and formulas.

Every monthly/site projection uses these metric keys: `potential_bbl`, `produced_bbl`, `gross_deferred_bbl`, `recovered_bbl`, `net_lost_bbl`, `contribution_loss_usd`, `potential_contribution_usd`, `produced_contribution_usd`, and `net_contribution_loss_usd`. Historical rows have those keys plus event counts and downtime measures. Values remain unrounded for calculations.

The existing compact app data must retain `Production.calendar_hours`, `price_usd_bbl`, `variable_cost_usd_bbl`, plus `Events.lost_oil_bbl` and `recoverable_fraction`. Missing required inputs raise a specific error; they never become zero.

## Historical volume and monetary calculations

Monthly production uses the supplied Production records, deduplicated by asset and month. Its identity is:

`produced = potential − gross deferred + recovered`

`net lost = gross deferred − recovered`

The sum of event `lost_oil_bbl` reconciles to Production gross deferred oil. Recovered oil in Production is rounded to two decimals at asset-month level. Event net lost oil uses the event recovery fraction, so a single asset-month may differ from Production net loss by at most 0.005 bbl. The export exposes the aggregate rounding difference rather than hiding it.

Historical contribution loss is calculated separately for every event:

`lost_oil_bbl × (1 − recoverable_fraction) × (matching asset-month price_usd_bbl − variable_cost_usd_bbl)`

Then the event results are summed. This is modeled contribution impact, not gross revenue or demonstrated cash savings. Gross deferred oil includes subsequently recovered oil. Never value all gross deferred oil as permanently lost, add monthly production shortfall to event losses, or add cause and downtime-stage breakdowns together.

For financial comparison charts, potential and produced contribution are the respective Production volumes multiplied by **each matching asset-month's** price minus variable cost, then summed. `net_contribution_loss_usd` is their difference using the Production rounded-recovery basis; it is not an additional loss. `contribution_loss_usd` remains the event-method result specified above. The small `contribution_rounding_difference_usd` explains their source rounding difference. Use the Production-based trio together in a potential/produced/lost financial chart; use event contribution for downtime cause/stage attribution.

Stage contribution impact allocates the same event loss across its five stages using `stage hours × modeled asset capacity × (1 − recovery fraction) × margin`. Stages sum back to event impact; they are not additional losses.

## Baseline projection

Fit each asset independently using all twelve 2025 months:

- Gross deferral rate = annual gross deferred bbl / annual calendar-hours.
- Recovery rate = annual recovered bbl / annual calendar-hours.
- Forecast month potential = workbook modeled asset capacity × that month's calendar-hours.
- Forecast gross deferral and recovery = fitted rate × that month's calendar-hours.
- Forecast net loss = gross deferral − recovery.
- Forecast production = potential − net loss.
- Forecast margin = 2025 calendar-hour-weighted average of source monthly price less variable cost.
- Forecast contribution loss = projected net loss × fitted margin for each asset, summed afterward.

This is a constant-rate, calendar-length-adjusted baseline. It is defensible for a short illustrative horizon with only one year available: it makes no unverified seasonality, growth, equipment replacement, intervention, or real-time operational assumptions. It is not claimed to be the most accurate possible model.

## Backtest and variability

One chronological holdout uses January–September 2025 to fit the same model and October–December 2025 to evaluate it. The three holdout months are never used to fit their predictions. The final January–March 2026 baseline is then fitted with all twelve historical months.

Report net-lost-volume **WAPE** as the primary evaluation because a small error relative to total production can obscure a large error in downtime-related losses. MAE and signed aggregate bias are also returned. Monetary WAPE compares the forecast with event-level historical contribution impact. WAPE is `sum(abs(predicted − actual)) / sum(actual) × 100`; a zero actual denominator returns unavailable.

For optional visual context, each projected metric includes the minimum and maximum observed 2025 monthly portfolio rate, multiplied by the forecast month's hours. Label this **“Observed 2025 monthly-rate range”**, never “confidence interval.” Different metrics' endpoints may come from different months, so do not stack their independent ranges. These descriptive ranges do not guarantee future outcomes and may not contain the central monetary estimate, whose fixed-margin assumption differs from observed monthly prices.

There are only twelve historical observations and three holdout months. Major failures, changing oil prices, changing costs and missing operational drivers can invalidate the baseline. No calibrated probability or reliable seasonal inference is supported.

## Chart labeling

- Historical panel: “2025 case data.”
- Projected panel: “Jan–Mar 2026 historical baseline.”
- Financial panel: “Modeled contribution loss.”
- Production loss: “Net lost oil” or “Gross deferred oil,” according to the actual field.
- Variability: “Observed monthly-rate range; not a confidence interval.”

Do not relabel the projection using today's month, imply live telemetry, describe historical ranges as probabilities, or describe baseline results as benefits from the proposed solution.

## Verified results

The module was evaluated against both the complete traced JSON and the compact website dataset. All seven scopes (company and six sites) produced the same values. Monthly/site sums, downtime-stage and cause allocations, volume identities, and contribution identities reconcile. The source object is not mutated.

| Metric | 2025 historical total | Jan–Mar 2026 baseline |
|---|---:|---:|
| Potential oil (bbl) | 3,836,880.00 | 946,080.00 |
| Produced oil (bbl) | 3,695,703.80 | 911,269.43 |
| Gross deferred oil (bbl) | 174,951.97 | 43,138.84 |
| Recovered oil (bbl) | 33,775.77 | 8,328.27 |
| Net lost oil (bbl) | 141,176.20 | 34,810.57 |
| Modeled contribution loss, event method (USD) | 5,906,030.60 | 1,457,204.10 |

Historical totals include both planned and unplanned downtime. Production-based historical net contribution is $5,906,031.23; its $0.63 difference from the event method is solely recovery rounding. Use one basis consistently within a financial comparison.

The company holdout net-loss WAPE is **9.73%** and monetary WAPE is **13.62%**. Site net-loss WAPE varies materially: Cedar 11.36%, Mesa 27.99%, Juniper 24.72%, Arroyo 11.81%, Canyon 25.59%, and Prairie 36.61%. Company-level errors can offset each other; the lower company error must not be presented as equivalent accuracy for every site.
