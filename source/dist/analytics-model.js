/* Lone Mesa Energy: source calculations and a fixed historical-baseline projection.
 * Pure calculations; no DOM, network, storage, source mutation, or current-date inputs.
 * Load after data.js. Uses window.WORKBOOK_DATA (or window.DATA / lexical DATA).
 */
(function (root) {
  'use strict';
  const data = root.WORKBOOK_DATA || root.DATA || (typeof DATA !== 'undefined' ? DATA : null);
  if (!data) throw new Error('LMEAnalytics requires WORKBOOK_DATA.');
  const stageFields = ['detect_hours', 'dispatch_hours', 'parts_wait_hours', 'repair_hours', 'restart_hours'];
  const stageLabels = ['Detection', 'Dispatch', 'Parts wait', 'Repair', 'Restart'];
  const months2025 = Array.from({length: 12}, (_, i) => `2025-${String(i + 1).padStart(2, '0')}-01`);
  const forecastMonths = ['2026-01-01', '2026-02-01', '2026-03-01'];
  const holdoutMonths = ['2025-10-01', '2025-11-01', '2025-12-01'];
  const assetMap = new Map(data.assets.map(a => [a.asset_id, a]));
  const sourceProduction = data.production.filter(p => p.month.startsWith('2025-'));
  const productionMap = new Map(sourceProduction.map(p => [`${p.asset_id}|${p.month}`, p]));
  const sourceEvents = data.events.filter(e => e.start_utc.startsWith('2025-'));
  const sum = (rows, field) => rows.reduce((a, r) => a + r[field], 0);
  const sumFn = (rows, fn) => rows.reduce((a, r) => a + fn(r), 0);
  const shortMonth = month => new Date(month + 'T12:00:00Z').toLocaleDateString('en-US', {month: 'short', year: 'numeric', timeZone: 'UTC'});
  const hoursInMonth = month => { const [y, m] = month.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate() * 24; };
  const ref = (record, field) => record.source?.cells?.[field] ? `${record.source.sheet}!${record.source.cells[field]}` : `${record.source?.sheet || 'Workbook'} row ${record.source?.row || '?'} (${field})`;
  function requireNumber(record, field, kind) {
    if (typeof record[field] !== 'number' || !Number.isFinite(record[field])) {
      throw new Error(`LMEAnalytics missing numeric ${kind}.${field} for ${record.asset_id || record.event_id || '?'} (${ref(record, field)}).`);
    }
    return record[field];
  }
  sourceProduction.forEach(p => ['calendar_hours', 'potential_oil_bbl', 'produced_oil_bbl', 'gross_deferred_bbl', 'recovered_oil_bbl', 'price_usd_bbl', 'variable_cost_usd_bbl'].forEach(f => requireNumber(p, f, 'Production')));
  sourceEvents.forEach(e => ['lost_oil_bbl', 'recoverable_fraction', 'stopped_hours', ...stageFields].forEach(f => requireNumber(e, f, 'Events')));
  data.assets.forEach(a => requireNumber(a, 'modeled_capacity_bbl_hr', 'Assets'));
  const events = sourceEvents.map(e => {
    const month = e.start_utc.slice(0, 7) + '-01';
    const p = productionMap.get(`${e.asset_id}|${month}`);
    if (!p) throw new Error(`Missing matching asset-month Production row for ${e.event_id}.`);
    const capacity = assetMap.get(e.asset_id)?.modeled_capacity_bbl_hr;
    if (!Number.isFinite(capacity)) throw new Error(`Missing capacity for ${e.asset_id}.`);
    const margin = p.price_usd_bbl - p.variable_cost_usd_bbl;
    const net = e.lost_oil_bbl * (1 - e.recoverable_fraction);
    return {...e, month, net_lost_bbl: net, contribution_loss_usd: net * margin,
      contribution_loss_per_stopped_hour_usd: capacity * (1 - e.recoverable_fraction) * margin};
  });
  function scopeInfo(scope = 'all') {
    if (scope === 'all' || scope == null) return {scope: 'all', label: 'All sites', sites: data.sites, assets: data.assets};
    const site = data.sites.find(s => s.site_id === scope);
    if (!site) throw new Error(`Unknown site scope: ${scope}`);
    return {scope, label: site.site_name, sites: [site], assets: data.assets.filter(a => a.site_id === scope)};
  }
  const metricKeys = ['potential_bbl', 'produced_bbl', 'gross_deferred_bbl', 'recovered_bbl', 'net_lost_bbl', 'contribution_loss_usd',
    'potential_contribution_usd', 'produced_contribution_usd', 'net_contribution_loss_usd'];
  function historicalMetrics(productionRows, eventRows) {
    const potential = sum(productionRows, 'potential_oil_bbl');
    const produced = sum(productionRows, 'produced_oil_bbl');
    const gross = sum(productionRows, 'gross_deferred_bbl');
    const recovered = sum(productionRows, 'recovered_oil_bbl');
    const net = gross - recovered;
    const eventGross = sum(eventRows, 'lost_oil_bbl');
    const eventNet = sum(eventRows, 'net_lost_bbl');
    const potentialContribution = sumFn(productionRows, p => p.potential_oil_bbl * (p.price_usd_bbl - p.variable_cost_usd_bbl));
    const producedContribution = sumFn(productionRows, p => p.produced_oil_bbl * (p.price_usd_bbl - p.variable_cost_usd_bbl));
    const netContribution = sumFn(productionRows, p => (p.gross_deferred_bbl - p.recovered_oil_bbl) * (p.price_usd_bbl - p.variable_cost_usd_bbl));
    const eventContribution = sum(eventRows, 'contribution_loss_usd');
    if (Math.abs(eventGross - gross) > 1e-6) throw new Error('Event gross loss does not reconcile to Production gross deferred oil.');
    if (Math.abs(potential - gross + recovered - produced) > 0.011 * productionRows.length) throw new Error('Production identity does not reconcile.');
    const planned = eventRows.filter(e => e.event_type === 'Planned');
    const unplanned = eventRows.filter(e => e.event_type === 'Unplanned');
    return {potential_bbl: potential, produced_bbl: produced, gross_deferred_bbl: gross,
      recovered_bbl: recovered, net_lost_bbl: net, event_net_lost_bbl: eventNet,
      source_rounding_difference_bbl: net - eventNet,
      contribution_loss_usd: eventContribution, potential_contribution_usd: potentialContribution,
      produced_contribution_usd: producedContribution, net_contribution_loss_usd: netContribution,
      contribution_rounding_difference_usd: netContribution - eventContribution,
      event_count: eventRows.length, unplanned_event_count: unplanned.length, planned_event_count: planned.length,
      unplanned_downtime_hours: sum(unplanned, 'stopped_hours'), planned_downtime_hours: sum(planned, 'stopped_hours'),
      total_downtime_hours: sum(eventRows, 'stopped_hours'), parts_wait_hours: sum(eventRows, 'parts_wait_hours'),
      produced_share_of_potential_pct: potential ? produced / potential * 100 : null};
  }
  function aggregate(scope = 'all') {
    const info = scopeInfo(scope), selected = new Set(info.assets.map(a => a.asset_id));
    const ps = sourceProduction.filter(p => selected.has(p.asset_id));
    const es = events.filter(e => selected.has(e.asset_id));
    return {scope: info.scope, label: info.label, period: '2025', kind: 'historical_case', asset_count: selected.size,
      totals: historicalMetrics(ps, es),
      monthly: months2025.map(month => ({month, label: shortMonth(month), kind: 'historical_case',
        ...historicalMetrics(ps.filter(p => p.month === month), es.filter(e => e.month === month))})),
      sites: info.sites.map(s => ({site_id: s.site_id, site_name: s.site_name,
        ...historicalMetrics(ps.filter(p => p.site_id === s.site_id), es.filter(e => e.site_id === s.site_id))})),
      stages: stageFields.map((field, i) => ({stage: field, label: stageLabels[i], hours: sum(es, field),
        unplanned_hours: sum(es.filter(e => e.event_type === 'Unplanned'), field),
        planned_hours: sum(es.filter(e => e.event_type === 'Planned'), field),
        contribution_loss_usd: sumFn(es, e => e[field] * e.contribution_loss_per_stopped_hour_usd)})),
      causes: [...new Set(es.map(e => e.cause))].map(cause => {
        const rows = es.filter(e => e.cause === cause);
        return {cause, event_count: rows.length, downtime_hours: sum(rows, 'stopped_hours'),
          gross_deferred_bbl: sum(rows, 'lost_oil_bbl'), net_lost_bbl: sum(rows, 'net_lost_bbl'),
          contribution_loss_usd: sum(rows, 'contribution_loss_usd')};
      }).sort((a, b) => b.downtime_hours - a.downtime_hours),
      source: {file: data.meta?.source || data.meta?.file || 'CaseQuest2026Dataset.xlsx',
        production_rows: ps.map(p => p.source?.row), event_rows: es.map(e => e.source?.row),
        period: '2025-01-01 through 2025-12-31',
        population: 'All planned and unplanned events; unplanned subtotals are separately labeled.'}};
  }
  function monetary(scope = 'all') {
    const a = aggregate(scope), info = scopeInfo(scope), ids = new Set(info.assets.map(x => x.asset_id));
    const es = events.filter(e => ids.has(e.asset_id));
    return {scope: a.scope, label: a.label, period: '2025', kind: 'modeled_historical_contribution_loss',
      total_contribution_loss_usd: a.totals.contribution_loss_usd,
      potential_contribution_usd: a.totals.potential_contribution_usd,
      produced_contribution_usd: a.totals.produced_contribution_usd,
      net_contribution_loss_usd: a.totals.net_contribution_loss_usd,
      contribution_rounding_difference_usd: a.totals.contribution_rounding_difference_usd,
      monthly: a.monthly.map(r => ({month: r.month, label: r.label, contribution_loss_usd: r.contribution_loss_usd,
        net_lost_bbl: r.net_lost_bbl, event_net_lost_bbl: r.event_net_lost_bbl,
        potential_contribution_usd:r.potential_contribution_usd, produced_contribution_usd:r.produced_contribution_usd,
        net_contribution_loss_usd:r.net_contribution_loss_usd})),
      sites: a.sites.map(r => ({site_id: r.site_id, site_name: r.site_name, contribution_loss_usd: r.contribution_loss_usd,
        potential_contribution_usd:r.potential_contribution_usd, produced_contribution_usd:r.produced_contribution_usd,
        net_contribution_loss_usd:r.net_contribution_loss_usd})),
      by_event_type: ['Unplanned', 'Planned'].map(event_type => ({event_type,
        contribution_loss_usd: sum(es.filter(e => e.event_type === event_type), 'contribution_loss_usd')})),
      by_cause: a.causes.map(r => ({cause: r.cause, contribution_loss_usd: r.contribution_loss_usd})),
      by_stage: a.stages.map(r => ({stage: r.stage, label: r.label, contribution_loss_usd: r.contribution_loss_usd})),
      formula: 'Sum(event lost_oil_bbl × (1 − recoverable_fraction) × matching asset-month (price_usd_bbl − variable_cost_usd_bbl))',
      limitation: 'Modeled contribution impact, not gross revenue, cash savings, or complete maintenance expense. Do not add monthly production shortfall again.'};
  }
  function fit(assetIds, trainMonths) {
    return [...assetIds].map(id => {
      const rows = sourceProduction.filter(p => p.asset_id === id && trainMonths.includes(p.month));
      if (rows.length !== trainMonths.length) throw new Error(`Incomplete training window for ${id}.`);
      const hours = sum(rows, 'calendar_hours');
      return {asset_id: id, site_id: assetMap.get(id).site_id, capacity_bbl_hr: assetMap.get(id).modeled_capacity_bbl_hr,
        gross_deferred_bbl_per_calendar_hour: sum(rows, 'gross_deferred_bbl') / hours,
        recovered_bbl_per_calendar_hour: sum(rows, 'recovered_oil_bbl') / hours,
        margin_usd_bbl: sumFn(rows, p => (p.price_usd_bbl - p.variable_cost_usd_bbl) * p.calendar_hours) / hours,
        source_rows: rows.map(p => p.source?.row), training_calendar_hours: hours};
    });
  }
  function predict(models, month) {
    const hours = hoursInMonth(month);
    const rows = models.map(m => {
      const gross = m.gross_deferred_bbl_per_calendar_hour * hours;
      const recovered = m.recovered_bbl_per_calendar_hour * hours;
      const net = gross - recovered;
      const potential = m.capacity_bbl_hr * hours;
      if (recovered < 0 || net < 0 || net > potential) throw new Error('Historical rate model violates a volume identity.');
      return {asset_id: m.asset_id, site_id: m.site_id, potential_bbl: potential, produced_bbl: potential - net,
        gross_deferred_bbl: gross, recovered_bbl: recovered, net_lost_bbl: net, contribution_loss_usd: net * m.margin_usd_bbl,
        potential_contribution_usd: potential * m.margin_usd_bbl,
        produced_contribution_usd: (potential - net) * m.margin_usd_bbl,
        net_contribution_loss_usd: net * m.margin_usd_bbl};
    });
    return {month, label: shortMonth(month), kind: 'historical_baseline_projection', calendar_hours: hours,
      ...Object.fromEntries(metricKeys.map(k => [k, sum(rows, k)])), assets: rows};
  }
  function score(predictions, actuals, metric) {
    const pairs = predictions.map(p => ({month: p.month, predicted: p[metric], actual: actuals.find(a => a.month === p.month)[metric]}));
    const denominator = sum(pairs, 'actual');
    return {metric, mae: sumFn(pairs, r => Math.abs(r.predicted - r.actual)) / pairs.length,
      wape_pct: denominator ? sumFn(pairs, r => Math.abs(r.predicted - r.actual)) / Math.abs(denominator) * 100 : null,
      total_actual: denominator, total_predicted: sum(pairs, 'predicted'),
      signed_bias_pct: denominator ? (sum(pairs, 'predicted') - denominator) / Math.abs(denominator) * 100 : null};
  }
  function backtest(scope = 'all') {
    const info = scopeInfo(scope), a = aggregate(scope);
    const trainMonths = months2025.slice(0, 9);
    const models = fit(new Set(info.assets.map(x => x.asset_id)), trainMonths);
    const predictions = holdoutMonths.map(m => predict(models, m));
    const actuals = a.monthly.filter(m => holdoutMonths.includes(m.month));
    return {scope: info.scope, training_period: 'January–September 2025', holdout_period: 'October–December 2025',
      observations: 3, primary_metric: 'net_lost_bbl', predictions, actuals,
      metrics: ['net_lost_bbl', 'gross_deferred_bbl', 'produced_bbl', 'contribution_loss_usd'].map(k => score(predictions, actuals, k)),
      limitation: 'One chronological three-month holdout. Small sample; no claimed predictive accuracy or calibrated confidence interval. Actual monetary impact uses event-level source recoverability.'};
  }
  function projection(scope = 'all') {
    const info = scopeInfo(scope), a = aggregate(scope);
    const models = fit(new Set(info.assets.map(x => x.asset_id)), months2025);
    const monthly = forecastMonths.map(m => {
      const row = predict(models, m);
      // Empirical portfolio month-to-month range, scaled only for calendar length.
      // Each metric's endpoints can come from different historical months.
      row.historical_variability = Object.fromEntries(metricKeys.map(k => {
        const rates = a.monthly.map(h => h[k] / hoursInMonth(h.month));
        return [k, {min: Math.min(...rates) * row.calendar_hours, max: Math.max(...rates) * row.calendar_hours}];
      }));
      return row;
    });
    return {scope: info.scope, label: info.label, kind: 'historical_baseline_projection',
      period: 'January–March 2026', fit_period: 'January–December 2025',
      as_of: '2025-12-31', monthly, totals: Object.fromEntries(metricKeys.map(k => [k, sum(monthly, k)])),
      asset_models: models, backtest: backtest(scope),
      variability_label: 'Observed 2025 monthly-rate range; not a confidence interval',
      assumptions: ['Same eighteen source assets (or selected site assets) and modeled capacity.',
        'No growth, intervention, outage trend, or seasonality adjustment.',
        'Gross deferral and recovery per calendar-hour stay at their 2025 asset averages.',
        'Asset margins stay at their 2025 calendar-hour-weighted source averages.'],
      limitations: ['Historical-baseline estimate for fixed Jan–Mar 2026, not a current or live forecast.',
        'One year of data does not establish a seasonal pattern. Large equipment failures and changing oil prices can invalidate the baseline.',
        'Historical ranges are descriptive extrema, not prediction limits; endpoints are independent and must not be stacked.',
        'No operational improvement or avoided downtime is assumed.']};
  }
  const method = Object.freeze({
    source: 'CaseQuest2026Dataset.xlsx only', historical_period: '2025', projection_period: 'Jan–Mar 2026',
    projection_as_of: '2025-12-31',
    volume_identity: 'Produced = potential − gross deferred + recovered; net lost = gross deferred − recovered.',
    contribution_formula: 'Event lost oil × (1 − recoverable fraction) × asset-month (price − variable cost).',
    projection_formula: 'Per asset: 2025 volume ÷ 2025 calendar-hours × projected month calendar-hours.',
    backtest: 'Fit Jan–Sep 2025; evaluate Oct–Dec 2025. Primary metric: net-lost-volume WAPE.',
    boundary: 'Historical source-derived evidence and explicit historical-baseline projections are distinct. No current-date data, intervention effects, or invented records.'
  });
  root.LMEAnalytics = Object.freeze({aggregate, monetary, projection, backtest, method});
})(typeof window !== 'undefined' ? window : globalThis);
