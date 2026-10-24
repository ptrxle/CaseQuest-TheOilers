'use strict';
// Add/delete HSE records are browser-local simulations; workbook evidence stays immutable.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const BASE = process.env.TEST_URL || process.env.LME_TEST_URL || 'http://127.0.0.1:8765/';
const OUTPUT = process.env.OUTPUT_DIR ? path.resolve(process.env.OUTPUT_DIR) : __dirname;

(async () => {
  const browser = await chromium.launch({ ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}), headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1050 } });
  page.setDefaultTimeout(10000);
  const checks = [], errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const checked = text => { checks.push(text); console.log('PASS ' + text); };
  const records = () => page.evaluate(() => HSEActionDetails.demoRecords());
  const snapshot = () => page.evaluate(() => JSON.stringify(HSEActionDetails.demoRecords()));
  const gate = sid => page.evaluate(id => { const g = HSEActionDetails.gate(id); return { held: g.held, unresolved: g.unresolved.map(x => x.hse_id) }; }, sid);
  const open = () => page.click('[data-hse-form="add"]');
  const fill = () => page.click('[data-hse-form="fill"]');
  const cancel = () => page.click('[data-hse-form="cancel"]');
  const submit = () => page.click('[data-hse-form="save"]');
  const value = id => page.locator('#hse-new-' + id).inputValue();
  const row = id => page.locator('tr[data-hse-demo-id="' + id + '"]');
  async function remove(id) {
    await row(id).locator('[data-hse-form="delete"]').click();
    await page.click('[data-hse-form="confirm-delete"]');
    assert.equal(await row(id).count(), 0);
  }
  async function createFilled() {
    await open(); await fill(); await submit();
    const all = await records(); return all.at(-1);
  }
  async function view(id) {
    await row(id).locator('[data-kind="hse"]').click();
    await page.waitForSelector('#hse-detail-action');
    assert.equal(await page.locator('#hse-detail-action').inputValue(), id);
  }
  const close = () => page.click('#close-modal');
  const valid = {
    site_id: 'S04', asset_id: 'A010', hazard: 'DEMO validation action', potential_severity: 3,
    likelihood_band: 2, action_owner: 'DEMO technician', due_date: '2030-10-31',
    control_gap: 'DEMO corrective work needed', action_setup_usd: null, action_annual_usd: null, action_person_hours: null
  };
  async function modelReject(input) {
    const before = await snapshot();
    const error = await page.evaluate(data => { try { HSEActionDetails.create(data); return ''; } catch (e) { return e.message; } }, input);
    assert.ok(error, 'Invalid input should be rejected: ' + JSON.stringify(input));
    assert.equal(await snapshot(), before, 'Rejected input must not save');
  }
  async function screenshot(name, selector) {
    if (!process.env.OUTPUT_DIR) return;
    fs.mkdirSync(OUTPUT, { recursive: true });
    if (selector) await page.locator(selector).screenshot({ path: path.join(OUTPUT, name) });
    else await page.screenshot({ path: path.join(OUTPUT, name), fullPage: true });
  }
  try {
    await page.goto(BASE);
    await page.waitForSelector('#nav a[href="#hse"]');
    await page.click('#nav a[href="#hse"]');
    await page.waitForSelector('[data-hse-form="add"]');
    const source = await page.evaluate(() => JSON.stringify(DATA));
    const originalStats = await page.locator('#main .stats').innerText();
    assert.equal((await records()).length, 0);
    let deletedId;
    for (const role of ['Supervisor', 'Technician', 'HSE Supervisor']) {
      await page.selectOption('#role', role);
      const before = await snapshot();
      await open(); await fill();
      assert.equal(await value('site'), 'S04');
      assert.equal(await value('hazard'), 'DEMO · Walkway trip hazard');
      assert.equal(await value('severity'), '3');
      assert.ok(await value('owner')); assert.ok(await value('due')); assert.ok(await value('gap'));
      assert.equal(await snapshot(), before, 'Prefill must not submit');
      await cancel(); assert.equal(await snapshot(), before, 'Cancel must not submit');
      await open(); await fill();
      if (role === 'Supervisor') await screenshot('add-hse-prefilled.png', '#modal');
      await submit();
      const created = (await records()).at(-1);
      assert.ok(created && /^DEMO-HSE-\d+$/.test(created.hse_id));
      assert.equal(created.action_status, 'Open');
      assert.equal(await row(created.hse_id).count(), 1);
      assert.equal(await page.evaluate(id => HSEActionDetails.isDemo(id), created.hse_id), true);
      assert.equal(await page.locator('#main .stats').innerText(), originalStats, 'Source KPI cards must exclude simulations');
      if (deletedId) assert.notEqual(created.hse_id, deletedId, 'Deleted IDs must not be reused');
      if (role === 'Supervisor') await screenshot('hse-created-action.png');
      await row(created.hse_id).locator('[data-hse-form="delete"]').click();
      await close();
      assert.equal(await row(created.hse_id).count(), 1, 'Cancel delete preserves record');
      await remove(created.hse_id); deletedId = created.hse_id;
    }
    checked('All three roles can prefill, explicitly create and delete; cancel is harmless, deleted IDs stay unique, source cards stay unchanged');

    await page.selectOption('#site-scope', 'S02'); await open();
    const mesaAssets = await page.evaluate(() => DATA.assets.filter(x => x.site_id === 'S02').map(x => x.asset_id));
    await page.selectOption('#hse-new-asset', mesaAssets[1]); await fill();
    assert.equal(await value('site'), 'S02'); assert.equal(await value('asset'), mesaAssets[1]);
    await page.selectOption('#hse-new-site', 'S01'); await fill();
    assert.equal(await value('site'), 'S01');
    assert.ok((await page.evaluate(() => DATA.assets.filter(x => x.site_id === 'S01').map(x => x.asset_id))).includes(await value('asset')));
    await cancel();
    await page.selectOption('#site-scope', 'all'); await open(); await fill();
    assert.equal(await value('site'), 'S04'); await cancel();
    await page.selectOption('#site-scope', 'S04');
    await page.selectOption('#hse-status', 'Closed'); await page.selectOption('#hse-severity', '1');
    const visible = await createFilled();
    assert.equal(await row(visible.hse_id).count(), 1, 'Successful creation resets filters that would hide it');
    await page.fill('#search', visible.hse_id);
    await page.click('#search-results [data-id="' + visible.hse_id + '"]');
    assert.equal(await page.locator('#hse-detail-action').inputValue(), visible.hse_id); await close();
    await page.selectOption('#hse-severity', '5'); assert.equal(await row(visible.hse_id).count(), 0);
    await page.selectOption('#hse-severity', 'all'); assert.equal(await row(visible.hse_id).count(), 1);
    await page.selectOption('#site-scope', 'S01'); assert.equal(await row(visible.hse_id).count(), 0);
    await page.selectOption('#site-scope', 'S04');
    checked('Prefill respects site and asset; creations remain visible; site/severity filters and search support demo records');

    for (const field of ['hazard', 'owner', 'gap']) {
      await open(); await fill(); await page.fill('#hse-new-' + field, '');
      const count = (await records()).length; await submit();
      assert.equal((await records()).length, count, field + ' is required'); await cancel();
    }
    await open(); await fill(); await page.fill('#hse-new-setup', '-1');
    const countBeforeInvalid = (await records()).length; await submit();
    assert.equal((await records()).length, countBeforeInvalid); await cancel();
    for (const patch of [{ site_id:'missing' }, { asset_id:'A001' }, { hazard:'' }, { action_owner:'' }, { control_gap:'' }, { due_date:'2030-02-30' }, { due_date:'invalid' }, { potential_severity:6 }, { likelihood_band:0 }, { action_setup_usd:-1 }, { action_annual_usd:'bad' }, { action_person_hours:-1 }]) await modelReject({ ...valid, ...patch });
    await open(); await fill();
    for (const key of ['setup','annual','hours']) await page.fill('#hse-new-' + key, '');
    await submit(); const missing = (await records()).at(-1);
    for (const key of ['action_setup_usd','action_annual_usd','action_person_hours']) assert.equal(missing[key], null);
    await open(); await fill();
    for (const key of ['setup','annual','hours']) await page.fill('#hse-new-' + key, '0');
    await submit(); const zero = (await records()).at(-1);
    for (const key of ['action_setup_usd','action_annual_usd','action_person_hours']) assert.equal(zero[key], 0);
    const rejectedSourceDelete = await page.evaluate(() => { try { HSEActionDetails.remove('H019'); return ''; } catch (e) { return e.message; } });
    assert.ok(rejectedSourceDelete); assert.equal(await page.locator('[data-hse-form="delete"][data-id="H019"]').count(), 0);
    checked('Required fields, real dates, site/asset pairing and nonnegative amounts are validated; omitted amounts remain null; workbook deletion rejected');

    await page.selectOption('#site-scope', 'S01');
    await open(); await fill(); await page.selectOption('#hse-new-severity', '5'); await submit();
    const critical = (await records()).at(-1);
    assert.equal((await gate('S01')).held, true);
    await page.selectOption('#hse-severity', '1'); await page.selectOption('#hse-status', 'Closed');
    assert.ok((await gate('S01')).unresolved.includes(critical.hse_id), 'Hidden critical still holds its site');
    await page.selectOption('#hse-severity', 'all'); await page.selectOption('#hse-status', 'Open');
    await view(critical.hse_id);
    await page.selectOption('#hse-detail-role', 'Technician');
    await page.fill('#hse-detail-notes', 'SIMULATED: corrective work completed and evidence supplied.');
    await page.fill('#hse-detail-evidence', 'DEMO-HSE-CREATE-TEST');
    await page.click('[data-hse-command="submit"]');
    assert.equal(await page.evaluate(id => HSEActionDetails.status(id), critical.hse_id), 'Awaiting verification');
    assert.equal((await gate('S01')).held, true);
    for (const r of ['Technician','Supervisor']) {
      await page.selectOption('#hse-detail-role', r);
      assert.equal(await page.locator('[data-hse-command="verify"]').isDisabled(), true);
    }
    await page.selectOption('#hse-detail-role', 'HSE Supervisor');
    await page.click('[data-hse-command="verify"]');
    assert.equal((await gate('S01')).held, true, 'Verification note is required');
    await page.fill('#hse-detail-verification', 'SIMULATED: HSE supervisor verified evidence and closure.');
    await page.click('[data-hse-command="verify"]');
    assert.equal((await gate('S01')).held, false); await close();
    await page.selectOption('#hse-status', 'Closed'); assert.equal(await row(critical.hse_id).count(), 1);
    await page.selectOption('#hse-status', 'Open'); assert.equal(await row(critical.hse_id).count(), 0);
    await page.selectOption('#hse-status', 'all');
    await page.reload(); await page.waitForSelector('[data-hse-form="add"]');
    assert.equal(await page.evaluate(id => HSEActionDetails.status(id), critical.hse_id), 'Verified closed');
    assert.equal((await gate('S01')).held, false);
    await page.selectOption('#site-scope', 'S04');
    await open(); await fill(); await page.selectOption('#hse-new-severity', '5'); await submit();
    const arroyoCritical = (await records()).at(-1);
    assert.equal((await gate('S04')).unresolved.length, 3);
    await remove(arroyoCritical.hse_id);
    assert.deepEqual((await gate('S04')).unresolved, ['H019','H020']);
    checked('Created critical actions participate in complete site gates and HSE-only review; verified progress persists; deletion never releases workbook holds');

    await open(); await fill();
    const hostile = '<img src=x onerror="window.__hseInjection=true">';
    await page.fill('#hse-new-hazard', hostile); await page.fill('#hse-new-gap', hostile); await submit();
    const escaped = (await records()).at(-1);
    assert.ok((await row(escaped.hse_id).innerText()).includes(hostile));
    assert.equal(await row(escaped.hse_id).locator('img').count(), 0);
    await view(escaped.hse_id);
    assert.equal(await page.locator('#modal-body img').count(), 0);
    assert.equal(await page.evaluate(() => !!window.__hseInjection), false); await close();
    await page.setViewportSize({ width:390, height:844 });
    await open(); await fill();
    assert.equal(await page.locator('#modal').evaluate(el => el.scrollWidth <= el.clientWidth), true);
    assert.equal(await page.locator('[data-hse-form="fill"]').isVisible(), true);
    assert.equal(await page.locator('[data-hse-form="save"]').isVisible(), true); await cancel();
    await page.setViewportSize({ width:1600, height:1050 });
    await page.evaluate(() => HSEActionDetails.open('H019'));
    await page.click('[data-hse-command="reset"]');
    assert.equal((await records()).length, 0);
    assert.equal(await page.evaluate(() => HSEActionDetails.status('H019')), 'Open');
    assert.deepEqual((await gate('S04')).unresolved, ['H019','H020']);
    assert.equal((await gate('S01')).held, false);
    await close();
    assert.equal(await page.locator('#main .stats').innerText(), originalStats);
    assert.equal(await page.evaluate(() => JSON.stringify(DATA)), source);
    await page.reload(); await page.waitForSelector('[data-hse-form="add"]');
    assert.equal((await records()).length, 0);
    assert.deepEqual(errors, []);
    checked('User text is escaped; mobile form fits; reset removes created records and progress, persists reset, and preserves all workbook evidence');
    fs.mkdirSync(OUTPUT, { recursive:true });
    fs.writeFileSync(path.join(OUTPUT, 'hse-create-verification.json'), JSON.stringify({status:'passed',checks,sourceUnchanged:true,errors},null,2));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
