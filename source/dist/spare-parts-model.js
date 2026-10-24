(function (root) {
  'use strict';
  const KEY = 'lme-spare-parts-demo-v1';
  const OPEN = ['Pending approval', 'Approved', 'Partially received'];
  const STATUSES = OPEN.concat(['Received', 'Cancelled']);
  const ROLES = ['Supervisor', 'Technician', 'HSE Supervisor'];
  const clone = value => JSON.parse(JSON.stringify(value));
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const plain = value => value && typeof value === 'object' && !Array.isArray(value);
  const fail = message => { throw new Error(message); };
  const text = (value, label, required = false) => {
    if (value == null) value = '';
    if (typeof value !== 'string') fail(label + ' must be text.');
    value = value.trim();
    if (required && !value) fail(label + ' is required.');
    if (value.length > 2000) fail(label + ' is too long.');
    return value;
  };
  const count = (value, label, nullable = true) => {
    if (nullable && (value == null || value === '')) return null;
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) fail(label + ' must be a whole, nonnegative number.');
    return value;
  };
  const positive = (value, label) => {
    value = count(value, label, false);
    if (value === 0) fail(label + ' must be greater than zero.');
    return value;
  };
  const cost = value => {
    if (value == null || value === '') return null;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) fail('Unit cost must be a nonnegative number or blank.');
    return value;
  };
  const date = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
  const noteRules = Object.freeze([
    { id: 'bearing', note: 'Noise and vibration increased', kit: 'Bearing kit' },
    { id: 'seal', note: 'Visible leak reported', kit: 'Seal kit' },
    { id: 'electrical', note: 'Protective trip; electrical panel', kit: 'Electrical kit' },
    { id: 'restart', note: 'Feed conditions changed', kit: 'No part, restart check' },
    { id: 'inspect', note: 'Cause not confirmed', kit: 'Inspect first' }
  ].map(rule => Object.freeze(rule)));
  const normalizeNote = value => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  function suggestKit(value) {
    const note = text(value, 'Technician note'), normalized = normalizeNote(note);
    const result = (kit, match, rule = null) => ({ note, kit, match, matched: match === 'exact' || match === 'keyword', unmatched: match === 'unmatched', rule_id: rule ? rule.id : null });
    if (!normalized) return result(null, 'empty');
    const exact = noteRules.find(rule => normalizeNote(rule.note) === normalized);
    if (exact) return result(exact.kit, 'exact', exact);
    // Conservative phrase matching is advisory; conflicting observations require inspection.
    const patterns = [
      /\bnoise\b/.test(normalized) && /\bvibration\b/.test(normalized),
      /\bleak(?:ing)?\b/.test(normalized) && /\b(visible|reported|seal)\b/.test(normalized),
      /\belectrical panel\b/.test(normalized) && /\b(trip|tripped)\b/.test(normalized),
      /\bfeed conditions?\b/.test(normalized) && /\b(change|changed)\b/.test(normalized),
      /\bcause\b/.test(normalized) && /\b(not confirmed|unconfirmed|unknown)\b/.test(normalized)
    ];
    const matches = noteRules.filter((rule, index) => patterns[index]);
    if (matches.length > 1) return result('Inspect first', 'ambiguous');
    // Do not treat a negated observation as a confirmed symptom.
    const negated = /\b(no|without)\s+(?:\w+\s+){0,2}(noise|vibration|leak|leaking|trip)\b/.test(normalized);
    if (matches.length === 1 && !negated) return result(matches[0].kit, 'keyword', matches[0]);
    return result('Inspect first', 'unmatched');
  }

  function create(options) {
    options = options || {};
    const sites = new Map((options.sites || []).map(s => [s.site_id, { site_id: s.site_id }]));
    const assets = new Map((options.assets || []).map(a => [a.asset_id, { asset_id: a.asset_id, site_id: a.site_id }]));
    const getRole = typeof options.getRole === 'function' ? options.getRole : () => '';
    const hasGateProvider = own(options, 'getSafetyGate');
    let storage = null;
    let status = { available: false, mode: 'memory', error: '', invalidData: false };
    try {
      storage = own(options, 'storage') ? options.storage : root.localStorage;
      if (storage && typeof storage.getItem === 'function' && typeof storage.setItem === 'function' && typeof storage.removeItem === 'function') {
        status.available = true; status.mode = 'local';
      } else { storage = null; status.error = 'Browser storage is unavailable; changes last for this page session.'; }
    } catch (_) { status.error = 'Browser storage is unavailable; changes last for this page session.'; }
    let sequence = 0;
    const fresh = () => ({ items: [], orders: [], siteRules: Object.fromEntries([...sites.keys()].map(id => [id, { enabled: false }])), activity: [] });
    let state = fresh();
    function site(id) { if (!sites.has(id)) fail('Choose a valid site.'); return id; }
    function scope(id) { if (id !== 'all') site(id); return id; }
    function safetyGate(siteId) {
      site(siteId);
      const unavailable = { site_id: siteId, held: true, critical: null, unresolved: null, available: false };
      // Isolated models can omit the provider. The website supplies the HSE gate.
      if (!hasGateProvider) return { site_id: siteId, held: false, critical: 0, unresolved: 0, available: true };
      try {
        if (typeof options.getSafetyGate !== 'function') return unavailable;
        const gate = options.getSafetyGate(siteId);
        if (!plain(gate) || typeof gate.held !== 'boolean' || gate.validSite === false || gate.available === false || gate.trusted === false || gate.valid === false) return unavailable;
        const critical = Array.isArray(gate.critical) ? gate.critical.length : gate.critical;
        const unresolved = Array.isArray(gate.unresolved) ? gate.unresolved.length : gate.unresolved;
        if (!Number.isSafeInteger(critical) || critical < 0 || !Number.isSafeInteger(unresolved) || unresolved < 0 || unresolved > critical || gate.held !== (unresolved > 0)) return unavailable;
        if (own(gate, 'clear') && (typeof gate.clear !== 'boolean' || gate.clear === gate.held)) return unavailable;
        return { site_id: siteId, held: gate.held, critical, unresolved, available: true };
      } catch (_) { return unavailable; }
    }
    function requireSafetyClear(siteId) {
      const gate = safetyGate(siteId);
      if (gate.held) fail(gate.available ? 'Critical HSE hold: requests remain locked until the HSE supervisor verifies every critical action.' : 'Safety status is unavailable. Requests remain locked until the critical HSE gate can be checked.');
    }
    function role(permissions) {
      const current = getRole();
      if (!ROLES.includes(current) || !permissions.includes(current)) fail('This action is not available for your role.');
      return current;
    }
    const supervisor = () => role(['Supervisor']);
    const movement = () => role(['Supervisor', 'Technician']);
    function now() {
      const value = options.clock ? options.clock() : new Date();
      const d = new Date(value);
      if (!Number.isFinite(d.getTime())) fail('The demo clock returned an invalid date.');
      return d.toISOString();
    }
    function next(prefix) { sequence += 1; return prefix + String(sequence).padStart(6, '0'); }
    function item(id) { return state.items.find(i => i.id === id) || fail('Spare part was not found.'); }
    function order(id) { return state.orders.find(o => o.id === id) || fail('Replenishment request was not found.'); }
    function normalizedItem(input, old) {
      if (!plain(input)) fail('Part details are required.');
      const result = Object.assign({}, old || {}, input);
      site(result.site_id);
      if (old && result.site_id !== old.site_id) fail('A part cannot move between sites. Add a separate part at the other site.');
      result.asset_id = result.asset_id == null || result.asset_id === '' ? null : result.asset_id;
      if (result.asset_id !== null && (!assets.has(result.asset_id) || assets.get(result.asset_id).site_id !== result.site_id)) fail('The equipment must belong to the selected site.');
      result.sku = text(result.sku, 'SKU', true);
      result.name = text(result.name, 'Part name', true);
      result.on_hand = count(result.on_hand, 'On-hand quantity');
      result.reorder_point = count(result.reorder_point, 'Reorder point');
      result.target_stock = count(result.target_stock, 'Target stock');
      if (result.reorder_point !== null && result.target_stock !== null && result.target_stock <= result.reorder_point) fail('Target stock must be greater than the reorder point.');
      result.unit_cost_usd = cost(result.unit_cost_usd);
      result.supplier = text(result.supplier, 'Supplier') || null;
      return {
        id: old ? old.id : result.id,
        site_id: result.site_id, asset_id: result.asset_id, sku: result.sku, name: result.name,
        on_hand: result.on_hand, reorder_point: result.reorder_point, target_stock: result.target_stock,
        unit_cost_usd: result.unit_cost_usd, supplier: result.supplier,
        created_at: old ? old.created_at : result.created_at
      };
    }
    function uniqueSKU(candidate, list = state.items) {
      if (list.some(i => i.id !== candidate.id && i.site_id === candidate.site_id && i.sku.toLocaleLowerCase() === candidate.sku.toLocaleLowerCase())) fail('This SKU already exists at the selected site.');
    }
    function enrich(i) {
      const requests = state.orders.filter(o => o.item_id === i.id && OPEN.includes(o.status));
      const pending = requests.filter(o => o.status === 'Pending approval').reduce((n, o) => n + o.quantity - o.received_quantity, 0);
      const approved = requests.filter(o => o.status !== 'Pending approval').reduce((n, o) => n + o.quantity - o.received_quantity, 0);
      const onOrder = pending + approved;
      const position = i.on_hand === null ? null : i.on_hand + onOrder;
      const configured = i.on_hand !== null && i.reorder_point !== null && i.target_stock !== null;
      return Object.assign({}, i, { on_order: onOrder, pending_qty: pending, approved_qty: approved, position,
        stock_state: !configured ? 'Unconfigured' : onOrder > 0 ? 'On order' : position <= i.reorder_point ? 'Reorder needed' : 'In stock' });
    }
    function enrichOrder(o) {
      const gate = safetyGate(o.site_id);
      return Object.assign({}, o, { remaining_quantity: o.quantity - o.received_quantity, safety_hold: gate.held, unresolved_critical: gate.unresolved, safety_available: gate.available });
    }
    function log(action, fields, actorRole, at) {
      state.activity.push(Object.assign({ id: next('SPA-'), site_id: null, action, actor: 'Demo ' + actorRole, role: actorRole, at, notes: '' }, fields));
    }
    function persist() {
      if (!storage) return;
      try { storage.setItem(KEY, JSON.stringify(Object.assign({ version: 1, sequence }, state))); status.available = true; status.mode = 'local'; status.error = ''; }
      catch (_) { status.available = false; status.mode = 'memory'; status.error = 'Browser storage could not save these changes; they last for this page session.'; }
    }
    function replenish(siteId, actorRole, at, reason) {
      const created = [];
      for (const i of state.items) {
        if ((siteId !== 'all' && i.site_id !== siteId) || !state.siteRules[i.site_id].enabled) continue;
        const v = enrich(i);
        if (v.stock_state === 'Unconfigured' || v.on_order > 0 || v.position > i.reorder_point) continue;
        const quantity = i.target_stock - v.position;
        if (!Number.isSafeInteger(quantity) || quantity <= 0) continue;
        const o = { id: next('SPO-'), item_id: i.id, site_id: i.site_id, quantity, received_quantity: 0,
          status: 'Pending approval', created_at: at, unit_cost_usd: i.unit_cost_usd, supplier: i.supplier,
          reason, receipts: [] };
        state.orders.push(o); created.push(o);
        log('Replenishment requested', { site_id: i.site_id, item_id: i.id, order_id: o.id, quantity, notes: reason }, actorRole, at);
      }
      return created;
    }
    function validateSaved(saved) {
      if (!plain(saved) || saved.version !== 1 || !Array.isArray(saved.items) || !Array.isArray(saved.orders) || !plain(saved.siteRules) || !Array.isArray(saved.activity)) fail('Saved demo data has an invalid format.');
      const clean = fresh();
      const ids = new Set();
      function id(value) { if (typeof value !== 'string' || !value || ids.has(value)) fail('Saved demo data contains an invalid or duplicate ID.'); ids.add(value); return value; }
      for (const raw of saved.items) {
        const v = normalizedItem(raw); id(v.id);
        if (!date(v.created_at)) fail('Saved part has an invalid date.');
        uniqueSKU(v, clean.items); clean.items.push(v);
      }
      const openItems = new Set();
      for (const raw of saved.orders) {
        if (!plain(raw)) fail('Saved request is invalid.');
        id(raw.id); site(raw.site_id);
        const sourceItem = clean.items.find(i => i.id === raw.item_id);
        if (!sourceItem || sourceItem.site_id !== raw.site_id) fail('Saved request refers to an invalid part.');
        const quantity = positive(raw.quantity, 'Request quantity');
        const received = count(raw.received_quantity, 'Received quantity', false);
        if (received > quantity || !STATUSES.includes(raw.status) || !date(raw.created_at)) fail('Saved request is invalid.');
        if ((raw.status === 'Pending approval' || raw.status === 'Approved') && received !== 0) fail('Saved request status conflicts with receipts.');
        if (raw.status === 'Partially received' && (received === 0 || received === quantity)) fail('Saved partial request is invalid.');
        if (raw.status === 'Received' && received !== quantity) fail('Saved completed request is invalid.');
        if (raw.status === 'Cancelled' && received === quantity) fail('Saved cancelled request is invalid.');
        if (OPEN.includes(raw.status)) { if (openItems.has(raw.item_id)) fail('Saved data contains duplicate open requests.'); openItems.add(raw.item_id); }
        if (!Array.isArray(raw.receipts)) fail('Saved receipts are invalid.');
        const refs = new Set(); let totalReceived = 0;
        const receipts = raw.receipts.map(r => {
          if (!plain(r)) fail('Saved receipt is invalid.');
          const reference = text(r.reference, 'Receipt reference', true);
          if (refs.has(reference.toLocaleLowerCase()) || !date(r.at) || !ROLES.includes(r.role)) fail('Saved receipt is invalid.');
          refs.add(reference.toLocaleLowerCase());
          const q = positive(r.quantity, 'Receipt quantity'); totalReceived += q;
          return { quantity: q, reference, at: r.at, actor: 'Demo ' + r.role, role: r.role };
        });
        if (totalReceived !== received) fail('Saved receipt quantities do not match the request.');
        clean.orders.push({ id: raw.id, item_id: raw.item_id, site_id: raw.site_id, quantity, received_quantity: received,
          status: raw.status, created_at: raw.created_at, unit_cost_usd: cost(raw.unit_cost_usd), supplier: text(raw.supplier, 'Supplier') || null,
          reason: text(raw.reason, 'Request reason', true), receipts });
      }
      for (const [siteId, rule] of Object.entries(saved.siteRules)) {
        site(siteId); if (!plain(rule) || typeof rule.enabled !== 'boolean') fail('Saved automation rules are invalid.');
        clean.siteRules[siteId] = { enabled: rule.enabled };
      }
      for (const raw of saved.activity) {
        if (!plain(raw)) fail('Saved activity is invalid.');
        id(raw.id); if (raw.site_id !== null) site(raw.site_id);
        if (!date(raw.at) || !ROLES.includes(raw.role)) fail('Saved activity is invalid.');
        if (raw.item_id && !clean.items.some(i => i.id === raw.item_id)) fail('Saved activity refers to an invalid part.');
        if (raw.order_id && !clean.orders.some(o => o.id === raw.order_id)) fail('Saved activity refers to an invalid request.');
        const record = { id: raw.id, site_id: raw.site_id, action: text(raw.action, 'Activity', true), actor: 'Demo ' + raw.role, role: raw.role, at: raw.at, notes: text(raw.notes, 'Activity note') };
        if (raw.item_id) record.item_id = raw.item_id;
        if (raw.order_id) record.order_id = raw.order_id;
        if (own(raw, 'quantity')) record.quantity = count(raw.quantity, 'Activity quantity', false);
        clean.activity.push(record);
      }
      const largestId = [...ids].reduce((n, v) => Math.max(n, Number((v.match(/-(\d+)$/) || [0, 0])[1])), 0);
      sequence = Math.max(Number.isSafeInteger(saved.sequence) && saved.sequence >= 0 ? saved.sequence : 0, largestId);
      return clean;
    }
    if (storage) {
      let raw = null;
      try { raw = storage.getItem(KEY); }
      catch (_) { status.available = false; status.mode = 'memory'; status.error = 'Browser storage could not be read; an empty demo has been opened.'; }
      if (raw) {
        try { state = validateSaved(JSON.parse(raw)); }
        catch (_) { state = fresh(); sequence = 0; status.invalidData = true; status.error = 'Saved demo data could not be loaded. An empty demo has been opened.'; }
      }
    }

    const api = {
      snapshot: () => clone(state),
      getItems(siteId = 'all') { scope(siteId); return clone(state.items.filter(i => siteId === 'all' || i.site_id === siteId).map(enrich)); },
      getOrders(siteId = 'all') { scope(siteId); return clone(state.orders.filter(o => siteId === 'all' || o.site_id === siteId).map(enrichOrder)); },
      getActivity(siteId = 'all') { scope(siteId); return clone(state.activity.filter(a => siteId === 'all' || a.site_id === siteId)); },
      getSafetyGate(siteId) { return clone(safetyGate(siteId)); },
      storageStatus: () => clone(status),
      addItem(input) {
        const r = supervisor(), at = now();
        const i = normalizedItem(input); i.id = undefined; uniqueSKU(i); i.id = next('SPI-'); i.created_at = at;
        state.items.push(i); log('Part added', { site_id: i.site_id, item_id: i.id, notes: 'Browser-local demo record.' }, r, at);
        replenish(i.site_id, r, at, 'Inventory is at or below the reorder point.'); persist(); return clone(enrich(i));
      },
      updateItem(id, patch) {
        const r = supervisor(), old = item(id), v = normalizedItem(patch, old); uniqueSKU(v);
        const changedCount = v.on_hand !== old.on_hand;
        const note = changedCount ? text(patch.notes || patch.note, 'Count change note', true) : text(patch.notes || patch.note, 'Change note');
        const at = now(); Object.assign(old, v);
        log('Part updated', { site_id: old.site_id, item_id: id, notes: note || 'Part settings updated.' }, r, at);
        replenish(old.site_id, r, at, 'Inventory is at or below the reorder point.'); persist(); return clone(enrich(old));
      },
      issue(id, quantity, note) {
        const r = movement(), i = item(id), q = positive(quantity, 'Issue quantity'), notes = text(note, 'Issue note', true);
        if (i.on_hand === null) fail('Record an on-hand count before issuing parts.');
        if (q > i.on_hand) fail('Issue quantity exceeds the on-hand count.');
        const at = now(); i.on_hand -= q; log('Parts issued', { site_id: i.site_id, item_id: id, quantity: q, notes }, r, at);
        replenish(i.site_id, r, at, 'Stock fell to or below the reorder point.'); persist(); return clone(enrich(i));
      },
      adjust(id, onHand, note) {
        const r = movement(), i = item(id), q = count(onHand, 'On-hand count', false), notes = text(note, 'Count note', true), at = now();
        const before = i.on_hand; i.on_hand = q;
        log('Stock count recorded', { site_id: i.site_id, item_id: id, quantity: q, notes: notes + ' Previous count: ' + (before === null ? 'not supplied' : before) + '.' }, r, at);
        replenish(i.site_id, r, at, 'Recorded stock is at or below the reorder point.'); persist(); return clone(enrich(i));
      },
      setAutomation(siteId, enabled) {
        const r = supervisor(); site(siteId); if (typeof enabled !== 'boolean') fail('Automation must be enabled or disabled.');
        const at = now(); state.siteRules[siteId].enabled = enabled;
        log(enabled ? 'Automation enabled' : 'Automation disabled', { site_id: siteId, notes: 'Demo requests require supervisor approval; no supplier is contacted.' }, r, at);
        if (enabled) replenish(siteId, r, at, 'Automation check: stock is at or below the reorder point.');
        persist(); return clone(state.siteRules[siteId]);
      },
      check(siteId = 'all') {
        const r = supervisor(); scope(siteId); const at = now();
        const created = replenish(siteId, r, at, 'Manual check: stock is at or below the reorder point.');
        persist(); return { created: created.length, orders: clone(created.map(enrichOrder)) };
      },
      approve(id, note) {
        const r = supervisor(), o = order(id), notes = text(note, 'Approval note', true);
        if (o.status !== 'Pending approval') fail('Only pending requests can be approved.');
        requireSafetyClear(o.site_id);
        const at = now(); o.status = 'Approved'; log('Request approved', { site_id: o.site_id, item_id: o.item_id, order_id: id, notes }, r, at);
        persist(); return clone(enrichOrder(o));
      },
      cancel(id, note) {
        const r = supervisor(), o = order(id), notes = text(note, 'Cancellation note', true);
        if (!OPEN.includes(o.status)) fail('Only open requests can be cancelled.');
        const at = now(); o.status = 'Cancelled'; log('Request cancelled', { site_id: o.site_id, item_id: o.item_id, order_id: id, notes }, r, at);
        persist(); return clone(enrichOrder(o));
      },
      receive(id, quantity, reference) {
        const r = movement(), o = order(id), q = positive(quantity, 'Receipt quantity'), ref = text(reference, 'Receipt reference', true);
        requireSafetyClear(o.site_id);
        const repeated = o.receipts.find(receipt => receipt.reference.toLocaleLowerCase() === ref.toLocaleLowerCase());
        if (repeated) { if (repeated.quantity !== q) fail('This receipt reference already has a different quantity.'); return clone(enrichOrder(o)); }
        if (o.status !== 'Approved' && o.status !== 'Partially received') fail('Only approved requests can receive stock.');
        if (q > o.quantity - o.received_quantity) fail('Receipt quantity exceeds the remaining request quantity.');
        const i = item(o.item_id); if (i.on_hand === null) fail('Record an on-hand count before receiving parts.');
        if (!Number.isSafeInteger(i.on_hand + q)) fail('The resulting stock count is too large.');
        const at = now(); i.on_hand += q; o.received_quantity += q;
        o.status = o.received_quantity === o.quantity ? 'Received' : 'Partially received';
        o.receipts.push({ quantity: q, reference: ref, at, actor: 'Demo ' + r, role: r });
        log('Stock received', { site_id: o.site_id, item_id: o.item_id, order_id: id, quantity: q, notes: ref }, r, at);
        replenish(o.site_id, r, at, 'Receipt check: stock is at or below the reorder point.'); persist(); return clone(enrichOrder(o));
      },
      seedDemo(siteId) {
        const r = supervisor(); site(siteId);
        const at = now();
        let i = state.items.find(v => v.site_id === siteId && v.sku.toLocaleLowerCase() === 'demo-spare-01');
        if (!i) {
          i = { id: next('SPI-'), site_id: siteId, asset_id: [...assets.values()].find(a => a.site_id === siteId)?.asset_id || null,
            sku: 'DEMO-SPARE-01', name: 'DEMO spare kit', on_hand: 4, reorder_point: 2, target_stock: 8, unit_cost_usd: null, supplier: null, created_at: at };
          state.items.push(i); log('Demo kit added', { site_id: siteId, item_id: i.id, notes: 'Illustrative stock only; this is not a workbook record.' }, r, at);
        }
        state.siteRules[siteId].enabled = true;
        log('Automation enabled', { site_id: siteId, notes: 'Demo setup. No supplier is contacted.' }, r, at);
        replenish(siteId, r, at, 'Demo setup check: stock is at or below the reorder point.'); persist(); return clone(state);
      },
      reset() {
        supervisor(); state = fresh(); sequence = 0; status.invalidData = false;
        if (storage) {
          try { storage.removeItem(KEY); status.available = true; status.mode = 'local'; status.error = ''; }
          catch (_) { status.available = false; status.mode = 'memory'; status.error = 'Browser storage could not be cleared. This session is reset; saved demo data may return after reload.'; }
        }
        return clone(state);
      }
    };
    return Object.freeze(api);
  }
  root.SparePartsModel = Object.freeze({ create, storageKey: KEY, suggestKit, noteRules });
})(typeof window !== 'undefined' ? window : globalThis);
