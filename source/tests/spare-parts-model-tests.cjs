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
function fixture(storage = memoryStorage()) {
  let role = 'Supervisor', t = 0;
  const store = Model.create({ sites, assets, storage, getRole: () => role, clock: () => new Date(Date.UTC(2026, 0, 1, 0, 0, t++)) });
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

test('role enforcement lives in all mutation handlers', () => {
  const f = fixture(), { store } = f; store.seedDemo('S01'); const p = store.getItems()[0];
  store.issue(p.id, 3, 'Repair'); const o = store.getOrders()[0];
  f.setRole('Technician');
  for (const action of [() => store.addItem({}), () => store.updateItem(p.id, {}), () => store.setAutomation('S01', false), () => store.check(), () => store.approve(o.id, 'ok'), () => store.cancel(o.id, 'no'), () => store.seedDemo('S02'), () => store.reset()]) throws(action, 'role');
  f.setRole('HSE Supervisor');
  for (const action of [() => store.issue(p.id, 1, 'x'), () => store.adjust(p.id, 2, 'x'), () => store.receive(o.id, 1, 'ref'), () => store.addItem({}), () => store.reset(), () => store.check()]) throws(action, 'role');
  f.setRole('unrecognized'); throws(() => store.issue(p.id, 1, 'x'), 'role');
  assert.equal(store.getItems().length, 1); assert.equal(store.getItems()[0].on_hand, 1);
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

console.log('\n' + count + ' spare-parts model tests passed.');
