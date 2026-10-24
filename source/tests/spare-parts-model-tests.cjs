'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../dist/spare-parts-model.js'), 'utf8'), context);
const Model = context.window.SparePartsModel;
const freeze = o => { Object.freeze(o); Object.values(o).forEach(v => { if (v && typeof v === 'object') freeze(v); }); return o; };
// These tiny identities are test fixtures, never demo stock or workbook content.
const sites = freeze([{ site_id: 'S01' }, { site_id: 'S02' }]);
const assets = freeze([{ asset_id: 'A01', site_id: 'S01' }, { asset_id: 'A02', site_id: 'S02' }]);
const sourceBefore = JSON.stringify({ sites, assets });
function memoryStorage() {
  const data = new Map();
  return { data, getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: k => data.delete(k) };
}
function fixture(storage = memoryStorage(), options = {}) {
  let role = 'Supervisor', t = 0;
  const store = Model.create({ sites, assets, storage, getRole: () => role, clock: () => new Date(Date.UTC(2026, 0, 1, 0, 0, t++)), ...options });
  return { store, storage, setRole: r => { role = r; } };
}
const json = value => JSON.parse(JSON.stringify(value));
const throws = (fn, message) => assert.throws(fn, new RegExp(message));
let count = 0;
function test(name, fn) { fn(); count++; console.log('PASS ' + name); }

test('empty start; known sites only; cloned getters', () => {
  const { store } = fixture();
  assert.equal(store.getItems().length, 0); assert.equal(store.getOrders().length, 0); assert.equal(store.getActivity().length, 0);
  assert.deepEqual(json(store.snapshot().siteRules), { S01: { enabled: false }, S02: { enabled: false } });
  const snap = store.snapshot(); snap.siteRules.S01.enabled = true;
  assert.equal(store.snapshot().siteRules.S01.enabled, false);
  throws(() => store.getItems('invalid'), 'valid site');
});

test('missing quantities remain null; zero is a known count', () => {
  const { store } = fixture();
  const unknown = store.addItem({ site_id: 'S01', sku: 'UNKNOWN', name: 'Unknown quantity', on_hand: '', reorder_point: null, target_stock: '' });
  assert.equal(unknown.on_hand, null); assert.equal(unknown.reorder_point, null); assert.equal(unknown.target_stock, null); assert.equal(unknown.unit_cost_usd, null);
  assert.equal(unknown.position, null); assert.equal(unknown.stock_state, 'Unconfigured');
  store.setAutomation('S01', true); assert.equal(store.getOrders().length, 0);
  throws(() => store.issue(unknown.id, 1, 'test'), 'on-hand count');
  const zero = store.addItem({ site_id: 'S02', sku: 'ZERO', name: 'Known zero', on_hand: 0, reorder_point: 0, target_stock: 1, unit_cost_usd: 0 });
  assert.equal(zero.position, 0); assert.equal(zero.unit_cost_usd, 0); assert.equal(zero.stock_state, 'Reorder needed');
  store.setAutomation('S02', true); assert.equal(store.getOrders('S02')[0].quantity, 1);
});

test('item constraints, case-insensitive site uniqueness, no injected identity bypass', () => {
  const { store } = fixture();
  const base = { site_id: 'S01', asset_id: 'A01', sku: 'Pump', name: 'Pump spare', on_hand: 5, reorder_point: 2, target_stock: 8 };
  const p = store.addItem(base);
  throws(() => store.addItem({ ...base, sku: ' pump ' }), 'already exists');
  throws(() => store.addItem({ ...base, id: p.id }), 'already exists');
  assert.equal(store.addItem({ ...base, site_id: 'S02', asset_id: 'A02' }).sku, 'Pump');
  throws(() => store.addItem({ ...base, sku: 'X', asset_id: 'A02' }), 'belong');
  throws(() => store.addItem({ ...base, sku: 'X', site_id: 'S03' }), 'valid site');
  for (const invalid of [-1, 0.5, NaN, Infinity, '4']) throws(() => store.addItem({ ...base, sku: 'X', on_hand: invalid }), 'whole');
  throws(() => store.addItem({ ...base, sku: 'X', target_stock: 2 }), 'greater');
  throws(() => store.addItem({ ...base, sku: 'X', unit_cost_usd: -1 }), 'cost');
  throws(() => store.updateItem(p.id, { site_id: 'S02' }), 'cannot move');
  throws(() => store.updateItem(p.id, { on_hand: 2 }), 'note');
  store.updateItem(p.id, { on_hand: 2, notes: 'Count correction', unit_cost_usd: 3.50 });
  assert.equal(store.getItems('S01')[0].on_hand, 2);
  assert.equal(store.getItems('S01')[0].unit_cost_usd, 3.50);
});

test('exact demo flow, pending inventory position, duplicate request prevention, source isolation', () => {
  const { store, setRole } = fixture();
  store.seedDemo('S02'); const p = store.getItems('S02')[0];
  assert.equal(p.sku, 'DEMO-SPARE-01'); assert.equal(p.asset_id, 'A02'); assert.equal(p.on_hand, 4); assert.equal(p.unit_cost_usd, null);
  assert.equal(store.getItems('S01').length, 0); assert.equal(store.getOrders().length, 0);
  setRole('Technician'); store.issue(p.id, 3, 'Demo repair');
  let current = store.getItems('S02')[0], o = store.getOrders('S02')[0];
  assert.equal(current.on_hand, 1); assert.equal(o.quantity, 7); assert.equal(o.status, 'Pending approval');
  assert.equal(current.pending_qty, 7); assert.equal(current.approved_qty, 0); assert.equal(current.position, 8); assert.equal(current.on_order, 7);
  assert.equal(current.stock_state, 'On order');
  store.adjust(p.id, 0, 'Verified count');
  setRole('Supervisor'); assert.equal(store.check('all').created, 0); store.setAutomation('S02', true);
  assert.equal(store.getOrders().length, 1); assert.equal(store.getOrders('S01').length, 0);
  assert.equal(store.getActivity('S01').length, 0);
  assert.equal(JSON.stringify({ sites, assets }), sourceBefore);
});

test('all recognized demo roles share ordinary parts controls; unknown roles cannot mutate', () => {
  for (const role of ['Supervisor', 'Technician', 'HSE Supervisor']) {
    const f = fixture(), { store } = f; f.setRole(role);
    const p = store.addItem({ site_id: 'S01', asset_id: 'A01', sku: 'SHARED', name: 'Demo part', on_hand: 4, reorder_point: 2, target_stock: 8 });
    store.updateItem(p.id, { name: 'Updated demo part' });
    store.setAutomation('S01', true); store.issue(p.id, 3, 'Demo repair');
    assert.equal(store.check('S01').created, 0);
    const o = store.getOrders()[0]; store.approve(o.id, 'Demo approval');
    store.receive(o.id, 2, 'DEMO-RECEIPT'); store.cancel(o.id, 'Demo cancel remainder');
    store.adjust(p.id, 4, 'Demo count'); store.setAutomation('S01', false);
    store.seedDemo('S02'); assert.equal(store.getItems().length, 2);
    assert.equal(store.getActivity().every(a => a.actor === 'Demo ' + role), true);
    store.reset(); assert.equal(store.getItems().length, 0);
  }
  const f = fixture(), { store } = f; store.seedDemo('S01'); const p = store.getItems()[0];
  store.issue(p.id, 3, 'Demo repair'); const o = store.getOrders()[0];
  f.setRole('unrecognized'); const before = JSON.stringify(store.snapshot());
  for (const action of [() => store.addItem({}), () => store.updateItem(p.id, {}),
    () => store.setAutomation('S01', false), () => store.check(), () => store.approve(o.id, 'ok'),
    () => store.cancel(o.id, 'no'), () => store.seedDemo('S02'), () => store.reset(),
    () => store.issue(p.id, 1, 'x'), () => store.adjust(p.id, 2, 'x'), () => store.receive(o.id, 1, 'ref')]) throws(action, 'role');
  assert.equal(JSON.stringify(store.snapshot()), before);
});

test('notes required; approved partial receipts, idempotency, bounds, and a new shortage', () => {
  const { store, setRole } = fixture(); store.seedDemo('S01'); const p = store.getItems()[0];
  throws(() => store.issue(p.id, 1, ''), 'note'); throws(() => store.adjust(p.id, 2, '   '), 'note');
  throws(() => store.issue(p.id, 5, 'too many'), 'exceeds'); throws(() => store.issue(p.id, 0, 'zero'), 'greater');
  store.issue(p.id, 3, 'Repair'); const o = store.getOrders()[0];
  throws(() => store.receive(o.id, 1, 'R1'), 'approved'); throws(() => store.approve(o.id, ' '), 'note');
  store.approve(o.id, 'Restock demo');
  setRole('Technician'); throws(() => store.receive(o.id, 3, ''), 'reference');
  let receipt = store.receive(o.id, 3, 'R1');
  assert.equal(receipt.status, 'Partially received'); assert.equal(receipt.remaining_quantity, 4);
  assert.equal(store.getItems()[0].on_hand, 4); assert.equal(store.getItems()[0].position, 8);
  const activityBefore = store.getActivity().length;
  store.receive(o.id, 3, 'r1'); assert.equal(store.getItems()[0].on_hand, 4); assert.equal(store.getActivity().length, activityBefore);
  throws(() => store.receive(o.id, 4, 'R1'), 'different quantity'); throws(() => store.receive(o.id, 5, 'R2'), 'remaining');
  receipt = store.receive(o.id, 4, 'R2'); assert.equal(receipt.status, 'Received'); assert.equal(receipt.remaining_quantity, 0);
  assert.equal(store.getItems()[0].on_hand, 8); assert.equal(store.getItems()[0].on_order, 0);
  store.receive(o.id, 4, 'R2'); assert.equal(store.getItems()[0].on_hand, 8);
  throws(() => store.receive(o.id, 1, 'R3'), 'approved');
  store.issue(p.id, 7, 'Next repair'); assert.equal(store.getOrders().length, 2); assert.equal(store.getOrders()[1].quantity, 7);
});

test('automation off suppresses requests; cancel preserves received stock and permits later check', () => {
  const { store } = fixture(); store.seedDemo('S01'); const p = store.getItems()[0];
  store.setAutomation('S01', false); store.adjust(p.id, 0, 'Empty'); assert.equal(store.check().created, 0);
  store.setAutomation('S01', true); let o = store.getOrders()[0]; assert.equal(o.quantity, 8);
  store.approve(o.id, 'Approved'); store.receive(o.id, 2, 'DEL1');
  throws(() => store.cancel(o.id, ''), 'note'); store.cancel(o.id, 'Cancel remaining balance');
  assert.equal(store.getOrders()[0].status, 'Cancelled'); assert.equal(store.getItems()[0].on_hand, 2); assert.equal(store.getItems()[0].on_order, 0);
  assert.equal(store.getOrders().length, 1); assert.equal(store.check('S01').created, 1); assert.equal(store.getOrders()[1].quantity, 6);
});

test('request cost snapshot survives part edits; reload matches; receipt data validated', () => {
  const { store, storage } = fixture();
  const p = store.addItem({ site_id: 'S01', sku: 'P', name: 'Part', on_hand: 0, reorder_point: 2, target_stock: 8, unit_cost_usd: 5, supplier: 'Demo supplier' });
  store.setAutomation('S01', true); const o = store.getOrders()[0];
  store.updateItem(p.id, { unit_cost_usd: 9, supplier: null }); assert.equal(store.getOrders()[0].unit_cost_usd, 5); assert.equal(store.getOrders()[0].supplier, 'Demo supplier');
  store.approve(o.id, 'Reviewed'); store.receive(o.id, 2, 'DOC1');
  const loaded = fixture(storage).store; assert.deepEqual(json(loaded.snapshot()), json(store.snapshot()));
  loaded.receive(o.id, 2, 'DOC1'); assert.equal(loaded.getItems()[0].on_hand, 2);
  const copy = loaded.getItems(); copy[0].on_hand = 100; assert.equal(loaded.getItems()[0].on_hand, 2);
  const bad = JSON.parse(storage.getItem(Model.storageKey)); bad.orders[0].received_quantity = 3; storage.setItem(Model.storageKey, JSON.stringify(bad));
  const invalid = fixture(storage).store; assert.equal(invalid.getItems().length, 0); assert.equal(invalid.storageStatus().invalidData, true);
});

test('corrupt and cross-site persistence fails empty; unavailable storage remains usable', () => {
  const s = memoryStorage(); s.setItem(Model.storageKey, 'not json');
  let f = fixture(s); assert.equal(f.store.getItems().length, 0); assert.equal(f.store.storageStatus().invalidData, true);
  f.store.seedDemo('S01'); let raw = JSON.parse(s.getItem(Model.storageKey)); raw.items[0].asset_id = 'A02'; s.setItem(Model.storageKey, JSON.stringify(raw));
  assert.equal(fixture(s).store.getItems().length, 0);
  const unavailable = { getItem() { throw Error('Denied'); }, setItem() { throw Error('Denied'); }, removeItem() { throw Error('Denied'); } };
  f = fixture(unavailable); assert.equal(f.store.storageStatus().mode, 'memory'); assert.equal(f.store.storageStatus().invalidData, false);
  f.store.seedDemo('S01'); assert.equal(f.store.getItems().length, 1); assert.equal(f.store.storageStatus().mode, 'memory');
  f = fixture(null); f.store.seedDemo('S02'); assert.equal(f.store.getItems().length, 1); assert.equal(f.store.storageStatus().available, false);
});

test('reset removes only this module and leaves source and separate demo state intact', () => {
  const { store, storage } = fixture(); storage.setItem('lme-hse-action-demo-v1', 'untouched');
  store.seedDemo('S02'); store.issue(store.getItems()[0].id, 3, 'Demo'); store.reset();
  assert.equal(store.getItems().length, 0); assert.equal(store.getOrders().length, 0); assert.equal(store.getActivity().length, 0);
  assert.equal(store.snapshot().siteRules.S02.enabled, false); assert.equal(storage.getItem(Model.storageKey), null);
  assert.equal(storage.getItem('lme-hse-action-demo-v1'), 'untouched'); assert.equal(JSON.stringify({ sites, assets }), sourceBefore);
});

test('critical safety gate keeps draft requests locked until every site action is verified', () => {
  let unresolved = 2;
  const { store, setRole } = fixture(undefined, { getSafetyGate: siteId => ({ held: siteId === 'S01' && unresolved > 0, critical: siteId === 'S01' ? 2 : 0, unresolved: siteId === 'S01' ? unresolved : 0 }) });
  for (const siteId of ['S01', 'S02']) {
    store.seedDemo(siteId);
    store.issue(store.getItems(siteId)[0].id, 3, 'Simulated repair');
  }
  const heldOrder = store.getOrders('S01')[0], clearOrder = store.getOrders('S02')[0];
  assert.equal(heldOrder.status, 'Pending approval'); assert.equal(heldOrder.safety_hold, true); assert.equal(heldOrder.unresolved_critical, 2);
  const original = JSON.stringify(store.snapshot());
  for (const role of ['Supervisor', 'Technician', 'HSE Supervisor']) {
    setRole(role); throws(() => store.approve(heldOrder.id, 'Reviewed'), 'Critical HSE hold');
  }
  assert.equal(JSON.stringify(store.snapshot()), original);
  store.approve(clearOrder.id, 'Reviewed for other site'); assert.equal(store.getOrders('S02')[0].status, 'Approved');
  assert.equal(store.check('all').created, 0); assert.equal(store.getOrders('all').find(o => o.id === heldOrder.id).safety_hold, true);
  unresolved = 1;
  assert.equal(store.getSafetyGate('S01').unresolved, 1);
  throws(() => store.approve(heldOrder.id, 'First closure only'), 'Critical HSE hold');
  unresolved = 0;
  assert.equal(store.getOrders('S01')[0].safety_hold, false); store.approve(heldOrder.id, 'All critical actions verified');
  assert.equal(store.getOrders('S01')[0].status, 'Approved');
  assert.equal(store.snapshot().orders[0].safety_hold, undefined, 'Derived hold is not persisted as workflow status');
});

test('receipt gate is live after approval, partial receipt, reset or reload; blocked attempts never mutate stock', () => {
  let held = false;
  const provider = () => ({ held, critical: [{ hse_id: 'H1' }, { hse_id: 'H2' }], unresolved: held ? [{ hse_id: 'H1' }, { hse_id: 'H2' }] : [], clear: !held, validSite: true });
  const { store, storage } = fixture(undefined, { getSafetyGate: provider });
  store.seedDemo('S01'); const part = store.getItems()[0]; store.issue(part.id, 3, 'Simulated repair');
  const request = store.getOrders()[0]; store.approve(request.id, 'Reviewed');
  store.receive(request.id, 2, 'RECEIPT-1');
  held = true;
  const original = JSON.stringify(store.snapshot());
  throws(() => store.receive(request.id, 1, 'RECEIPT-2'), 'Critical HSE hold');
  throws(() => store.receive(request.id, 2, 'RECEIPT-1'), 'Critical HSE hold');
  assert.equal(JSON.stringify(store.snapshot()), original); assert.equal(store.getOrders()[0].status, 'Partially received');
  const reload = fixture(storage, { getSafetyGate: provider }).store;
  assert.equal(reload.getOrders()[0].safety_hold, true); throws(() => reload.receive(request.id, 1, 'RECEIPT-2'), 'Critical HSE hold');
  held = false;
  const before = store.getActivity().length;
  store.receive(request.id, 2, 'receipt-1'); assert.equal(store.getActivity().length, before, 'Cleared repeated receipt remains idempotent');
  store.receive(request.id, 5, 'RECEIPT-2'); assert.equal(store.getItems()[0].on_hand, 8);
  held = true; store.reset(); assert.equal(store.getSafetyGate('S01').held, true, 'Inventory reset cannot clear external HSE state');
});

test('HSE hold permits stock counts, issues, draft preparation and cancellation without unlock', () => {
  const { store } = fixture(undefined, { getSafetyGate: () => ({ held: true, critical: 2, unresolved: 2 }) });
  store.seedDemo('S01'); const part = store.getItems()[0]; store.adjust(part.id, 0, 'Verified demo count');
  const order = store.getOrders()[0]; assert.equal(order.safety_hold, true); store.cancel(order.id, 'Superseded request');
  store.adjust(part.id, 4, 'Count corrected'); store.issue(part.id, 3, 'Already approved maintenance task');
  assert.equal(store.getItems()[0].on_hand, 1); assert.equal(store.getOrders().length, 2);
  assert.equal(store.getOrders()[1].safety_hold, true); assert.equal(store.getSafetyGate('S01').unresolved, 2);
});

test('missing, contradictory, failed and untrusted gate providers fail closed', () => {
  const invalidProviders = [undefined, null, () => undefined, () => { throw Error('Unavailable'); },
    () => ({ held: false }), () => ({ held: false, critical: 2, unresolved: 1 }),
    () => ({ held: false, critical: 0, unresolved: 0, validSite: false }),
    () => ({ held: false, critical: 0, unresolved: 0, trusted: false }),
    () => ({ held: false, critical: 0, unresolved: 0, available: false }),
    () => ({ held: false, critical: 0, unresolved: 0, clear: false }),
    () => ({ held: true, critical: 1, unresolved: 2 }), () => ({ held: false, critical: -1, unresolved: 0 })];
  for (const getSafetyGate of invalidProviders) {
    const { store } = fixture(undefined, { getSafetyGate });
    store.seedDemo('S01'); store.issue(store.getItems()[0].id, 3, 'Demo');
    assert.equal(store.getSafetyGate('S01').held, true); assert.equal(store.getSafetyGate('S01').available, false);
    assert.equal(store.getOrders()[0].unresolved_critical, null);
    throws(() => store.approve(store.getOrders()[0].id, 'Reviewed'), 'Safety status is unavailable');
  }
  const { store } = fixture(); assert.equal(store.getSafetyGate('S01').held, false);
  throws(() => store.getSafetyGate('unknown'), 'valid site');
});

test('note sorting maps all supplied examples; punctuation and case do not change the result', () => {
  const expectations = [
    ['Noise and vibration increased', 'Bearing kit'], ['Visible leak reported', 'Seal kit'],
    ['Protective trip; electrical panel', 'Electrical kit'], ['Feed conditions changed', 'No part, restart check'],
    ['Cause not confirmed', 'Inspect first']
  ];
  assert.equal(Model.noteRules.length, 5);
  for (const [note, kit] of expectations) {
    const result = Model.suggestKit(note);
    assert.equal(result.kit, kit); assert.equal(result.match, 'exact'); assert.equal(result.matched, true); assert.equal(result.unmatched, false);
    assert.equal(Model.suggestKit('  ' + note.toUpperCase().replace(/ /g, '   ') + '!!! ').kit, kit);
  }
  assert.equal(Model.suggestKit('There is increased noise and vibration on the pump').kit, 'Bearing kit');
  assert.equal(Model.suggestKit('A seal leak was reported').kit, 'Seal kit');
  assert.equal(Model.suggestKit('Electrical panel tripped').kit, 'Electrical kit');
  assert.equal(Model.suggestKit('Feed condition changed today').kit, 'No part, restart check');
  assert.equal(Model.suggestKit('Unknown cause, inspect').kit, 'Inspect first');
});

test('ambiguous and unmatched notes require inspection; lookup cannot create inventory or orders', () => {
  const { store } = fixture(), original = JSON.stringify(store.snapshot());
  for (const note of ['', null, undefined, '  ...  ']) assert.equal(Model.suggestKit(note).kit, null);
  const unknown = Model.suggestKit('Motor is warm'); assert.equal(unknown.kit, 'Inspect first'); assert.equal(unknown.unmatched, true); assert.equal(unknown.matched, false);
  const conflict = Model.suggestKit('Noise and vibration increased; visible leak reported');
  assert.equal(conflict.kit, 'Inspect first'); assert.equal(conflict.match, 'ambiguous'); assert.equal(conflict.matched, false);
  assert.equal(Model.suggestKit('Cause not confirmed, noise and vibration increased').match, 'ambiguous');
  assert.equal(Model.suggestKit('No noise and vibration noted').match, 'unmatched');
  assert.equal(JSON.stringify(store.snapshot()), original);
});

console.log('\n' + count + ' spare-parts model tests passed.');
