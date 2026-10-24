'use strict';
// Integration checks for smart note sorting and the site-specific critical HSE gate.
// All stock, notes, and closures in this test are explicitly simulated.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const BASE = process.env.TEST_URL || process.env.LME_TEST_URL || 'http://127.0.0.1:8765/';
const OUTPUT = process.env.OUTPUT_DIR ? path.resolve(process.env.OUTPUT_DIR) : null;
const RESULT = path.join(OUTPUT || __dirname, 'parts-features-verification.json');

(async () => {
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}),
    headless: true
  });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1050 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const checks = [], errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const checked = name => { checks.push(name); console.log('PASS ' + name); };
  const role = value => page.selectOption('#role', value);
  const site = value => page.selectOption('#site-scope', value);
  const tab = value => page.click(`[data-sp-action="tab"][data-sp-id="${value}"]`);
  const close = () => page.click('#close-modal');
  const gate = siteId => page.evaluate(id => {
    const g = HSEActionDetails.gate(id);
    return { held: g.held, clear: g.clear, critical: g.critical.map(a => a.hse_id), unresolved: g.unresolved.map(a => a.hse_id) };
  }, siteId);
  const orders = siteId => page.evaluate(id => PartsStore.getOrders(id), siteId);
  const sourceSnapshot = () => page.evaluate(() => JSON.stringify(DATA));
  const storeSnapshot = () => page.evaluate(() => JSON.stringify(PartsStore.snapshot()));
  async function lockedButton(selector) {
    const button = page.locator(selector);
    assert.equal((await button.count()) === 0 || await button.first().isDisabled(), true, selector + ' must be absent or disabled');
  }
  async function screenshot(name, selector) {
    if (!OUTPUT) return;
    fs.mkdirSync(OUTPUT, { recursive: true });
    if (selector) await page.locator(selector).screenshot({ path: path.join(OUTPUT, name) });
    else await page.screenshot({ path: path.join(OUTPUT, name), fullPage: true });
  }
  async function openAction(id) {
    await page.click(`[data-sp-action="hse-action"][data-sp-id="${id}"]`);
    await page.waitForSelector('#hse-detail-action');
    assert.equal(await page.locator('#hse-detail-action').inputValue(), id);
  }
  async function submitAction(id) {
    await page.selectOption('#hse-detail-role', 'Technician');
    await page.fill('#hse-detail-notes', 'SIMULATED: corrective work completed for ' + id + '.');
    await page.fill('#hse-detail-evidence', 'DEMO-EVIDENCE-' + id);
    await page.click('[data-hse-command="submit"]');
    assert.match(await page.locator('.hse-detail-section-head').innerText(), /Awaiting verification/);
  }
  async function verifyAction(id) {
    await page.selectOption('#hse-detail-role', 'HSE Supervisor');
    await page.fill('#hse-detail-verification', 'SIMULATED: HSE supervisor reviewed evidence for ' + id + '.');
    await page.click('[data-hse-command="verify"]');
    assert.match(await page.locator('.hse-detail-section-head').innerText(), /Verified closed/);
  }
  async function openRequest(siteId) {
    await site(siteId);
    await tab('orders');
    const [order] = await orders(siteId);
    assert.ok(order, 'Expected a simulated request at ' + siteId);
    await page.click(`[data-sp-action="order"][data-sp-id="${order.id}"]`);
    return order;
  }
  async function expectBlockedApproval(siteId) {
    const order = await openRequest(siteId);
    await lockedButton('[data-sp-action="approve"]');
    assert.match(await page.locator('#modal-body').innerText(), /HOLD|locked|critical safety/i);
    const result = await page.evaluate(id => {
      try { PartsStore.approve(id, 'SIMULATED: direct call must still respect the hold.'); return 'UNEXPECTED APPROVAL'; }
      catch (error) { return error.message; }
    }, order.id);
    assert.match(result, /hold|safety|critical|locked/i);
    assert.equal((await orders(siteId))[0].status, 'Pending approval');
    await close();
  }
  try {
    await page.goto(BASE);
    await page.waitForSelector('#sp-smart-note');
    assert.equal(await page.locator('#page-title').innerText(), 'Overview');
    assert.deepEqual(await page.locator('#nav a span').allTextContents(), ['Overview', 'Dashboard', 'HSE Actions']);
    const sourceBefore = await sourceSnapshot();
    assert.equal(await page.evaluate(() => PartsStore.getItems().length), 0);
    const initialStore = await storeSnapshot();
    await role('Technician');
    const mappings = [
      ['Noise and vibration increased', 'Bearing kit'],
      ['Visible leak reported', 'Seal kit'],
      ['Protective trip; electrical panel', 'Electrical kit'],
      ['Feed conditions changed', 'No part, restart check'],
      ['Cause not confirmed', 'Inspect first']
    ];
    for (const [note, expected] of mappings) {
      await page.fill('#sp-smart-note', note);
      assert.ok((await page.locator('#sp-note-result').innerText()).includes(expected), note + ' should suggest ' + expected);
      const option = await page.locator('#sp-note-preset option').evaluateAll((options, phrase) => {
        const match = options.find(option => option.textContent.includes(phrase));
        return match ? match.value : null;
      }, note);
      assert.notEqual(option, null, 'Preset available: ' + note);
      await page.selectOption('#sp-note-preset', option);
      assert.ok((await page.locator('#sp-note-result').innerText()).includes(expected), 'Preset should suggest ' + expected);
    }
    for (const note of ['A new observation with no recognized cause.', 'Noise and vibration increased. Visible leak reported.']) {
      await page.fill('#sp-smart-note', note);
      assert.match(await page.locator('#sp-note-result').innerText(), /Inspect first/);
    }
    await page.fill('#sp-smart-note', 'NOISE AND VIBRATION INCREASED');
    assert.match(await page.locator('#sp-note-result').innerText(), /Bearing kit/);
    assert.equal(await storeSnapshot(), initialStore, 'Kit suggestions must not create inventory, requests or movements');
    checked('All five typed/preset note mappings; case normalization; unknown or mixed notes inspect first; no stock side effects');

    await site('all');
    assert.equal(await page.locator('.sp-gate-card[data-site-id]').count(), 6);
    const siteNames = await page.evaluate(() => Object.fromEntries(DATA.sites.map(s => [s.site_name, s.site_id])));
    const heldSites = ['Mesa', 'Arroyo', 'Prairie'];
    for (const [name, id] of Object.entries(siteNames)) {
      const g = await gate(id);
      const held = heldSites.includes(name);
      assert.equal(g.held, held, name + ' initial hold');
      assert.equal(g.clear, !held, name + ' initial clear');
      assert.equal(g.unresolved.length, held ? 2 : 0, name + ' unresolved critical count');
      assert.equal(await page.evaluate(sid => PartsStore.getSafetyGate(sid).held, id), held);
      assert.match(await page.locator(`.sp-gate-card[data-site-id="${id}"]`).innerText(), held ? /HOLD/ : /CLEAR/);
    }
    await screenshot('01-smart-notes-and-site-gates.png', '.sp-workflow-tools');
    checked('All six gate cards: Mesa, Arroyo and Prairie HOLD with two critical actions each; three other sites CLEAR');

    await page.click('#nav a[href="#hse"]');
    await page.waitForSelector('#hse-severity');
    await page.selectOption('#hse-severity', '1');
    await page.selectOption('#hse-status', 'Closed');
    for (const name of heldSites) assert.equal((await gate(siteNames[name])).unresolved.length, 2);
    await page.click('#nav a[href="#parts"]');
    await page.waitForSelector('.sp-gate-card[data-site-id]');
    assert.equal(await page.locator('.sp-gate-card[data-site-id]').count(), 6);
    checked('HSE severity/status table filters do not exclude critical actions from the site gate');

    await role('Supervisor');
    await page.evaluate(() => {
      for (const siteId of ['S04', 'S02', 'S01']) {
        PartsStore.seedDemo(siteId);
        PartsStore.issue(PartsStore.getItems(siteId)[0].id, 3, 'SIMULATED: issue for gate integration test.');
      }
      render();
    });
    for (const id of ['S04', 'S02']) {
      const order = (await orders(id))[0];
      assert.equal(order.status, 'Pending approval');
      assert.equal(order.safety_hold, true);
      await expectBlockedApproval(id);
    }
    const cedar = await openRequest('S01');
    assert.equal(cedar.safety_hold, false);
    await page.fill('#sp-approval', 'SIMULATED: Cedar is clear and independently eligible.');
    await page.click('[data-sp-action="approve"]');
    assert.equal((await orders('S01'))[0].status, 'Approved');
    await close();
    checked('Held sites may queue requests but cannot approve them, including direct model calls; Cedar approval is unaffected');

    await site('S04');
    await openAction('H019');
    await submitAction('H019');
    assert.equal((await gate('S04')).unresolved.length, 2);
    for (const unauthorizedRole of ['Technician', 'Supervisor']) {
      await page.selectOption('#hse-detail-role', unauthorizedRole);
      assert.equal(await page.locator('[data-hse-command="verify"]').isDisabled(), true);
      // Removing the presentation-layer disable must not bypass the action handler.
      await page.evaluate(() => {
        const note = document.querySelector('#hse-detail-verification');
        note.disabled = false;
        note.value = 'SIMULATED: unauthorized verification attempt must be rejected.';
        note.dispatchEvent(new Event('input', { bubbles: true }));
        const button = document.querySelector('[data-hse-command="verify"]');
        button.disabled = false;
        button.click();
      });
      assert.equal((await gate('S04')).unresolved.length, 2, unauthorizedRole + ' cannot clear critical actions');
      assert.match(await page.locator('.hse-detail-section-head').innerText(), /Awaiting verification/);
    }
    await page.selectOption('#hse-detail-role', 'HSE Supervisor');
    await page.fill('#hse-detail-verification', '');
    await page.click('[data-hse-command="verify"]');
    assert.match(await page.locator('#hse-detail-message').innerText(), /verification note.*required|note.*required/i);
    assert.equal((await gate('S04')).unresolved.length, 2);
    await screenshot('02-hse-supervisor-verification-required.png');
    await verifyAction('H019');
    assert.deepEqual((await gate('S04')).unresolved, ['H020']);
    assert.equal((await orders('S04'))[0].safety_hold, true);
    await close();
    await role('Supervisor');
    await expectBlockedApproval('S04');
    checked('Awaiting verification remains held; Technician and Supervisor cannot verify critical actions; HSE note required; one closure still held');

    await openAction('H020');
    await submitAction('H020');
    assert.equal((await gate('S04')).held, true);
    await verifyAction('H020');
    assert.equal((await gate('S04')).held, false);
    assert.equal((await gate('S04')).clear, true);
    assert.equal((await orders('S04'))[0].safety_hold, false);
    assert.equal((await gate('S02')).held, true, 'Arroyo verification must not release Mesa');
    assert.equal((await gate(siteNames.Prairie)).held, true, 'Arroyo verification must not release Prairie');
    await close();
    assert.match(await page.locator('.sp-gate-card[data-site-id="S04"]').innerText(), /CLEAR/);
    await role('Supervisor');
    await openRequest('S04');
    assert.equal(await page.locator('[data-sp-action="approve"]').isDisabled(), false);
    await page.fill('#sp-approval', 'SIMULATED: both Arroyo critical actions verified by HSE.');
    await page.click('[data-sp-action="approve"]');
    assert.equal((await orders('S04'))[0].status, 'Approved');
    await close();
    await screenshot('03-arroyo-clear-request-approved.png');
    checked('Only both HSE-verified Arroyo actions clear Arroyo; request approval unlocks there while Mesa and Prairie remain held');

    await page.reload();
    await page.waitForSelector('#sp-smart-note');
    assert.equal((await gate('S04')).clear, true);
    assert.equal((await orders('S04'))[0].status, 'Approved');
    assert.equal((await orders('S04'))[0].safety_hold, false);
    assert.equal((await gate('S02')).held, true);
    const validHSEState = await page.evaluate(() => localStorage.getItem('lme-hse-action-demo-v1'));
    checked('Verified closures, request status and independent site holds persist after reload');

    await site('S04');
    await openAction('H019');
    await page.click('[data-hse-command="reset"]');
    assert.equal((await gate('S04')).unresolved.length, 2);
    assert.equal((await gate('S02')).unresolved.length, 2);
    await close();
    await role('Technician');
    const relockedOrder = await openRequest('S04');
    assert.equal(relockedOrder.status, 'Approved', 'Safety reset does not rewrite inventory request history');
    assert.equal(relockedOrder.safety_hold, true);
    await lockedButton('[data-sp-action="receive"]');
    const receiptResult = await page.evaluate(id => {
      try { PartsStore.receive(id, 1, 'DEMO-BLOCKED-RECEIPT'); return 'UNEXPECTED RECEIPT'; }
      catch (error) { return error.message; }
    }, relockedOrder.id);
    assert.match(receiptResult, /hold|safety|critical|locked/i);
    assert.equal((await orders('S04'))[0].received_quantity, 0);
    await close();
    assert.equal(await sourceSnapshot(), sourceBefore);
    checked('HSE reset relocks existing approved requests and blocks receipts; stock/order history and workbook source stay unchanged');

    // A safety update in another same-origin tab must refresh an already-open request.
    await openRequest('S04');
    const secondTab = await page.context().newPage();
    try {
      await secondTab.goto(BASE);
      await secondTab.waitForSelector('#sp-smart-note');
      await secondTab.evaluate(value => localStorage.setItem('lme-hse-action-demo-v1', value), validHSEState);
      await page.waitForFunction(() => HSEActionDetails.gate('S04').clear);
      assert.equal(await page.locator('[data-sp-action="receive"]').isDisabled(), false);
      assert.equal((await orders('S04'))[0].safety_hold, false);
      await secondTab.evaluate(() => localStorage.removeItem('lme-hse-action-demo-v1'));
      await page.waitForFunction(() => HSEActionDetails.gate('S04').held);
      await lockedButton('[data-sp-action="receive"]');
      assert.equal((await orders('S04'))[0].safety_hold, true);
    } finally { await secondTab.close(); }
    await close();
    checked('Cross-tab HSE verification and reset immediately refresh the gate and an open receipt dialog');

    // A closure stored by the older Supervisor-only workflow is no longer sufficient.
    // Preserve its notes/evidence and require a fresh HSE Supervisor review on reload.
    const legacy = JSON.parse(validHSEState);
    legacy.actions.H019.history.at(-1).actor = 'Supervisor';
    const preserved = { note: legacy.actions.H019.note, evidence: legacy.actions.H019.evidence };
    await page.evaluate(value => localStorage.setItem('lme-hse-action-demo-v1', value), JSON.stringify(legacy));
    await page.reload();
    await page.waitForSelector('#sp-smart-note');
    const migrated = await page.evaluate(() => HSEActionDetails.progress('H019'));
    assert.equal(migrated.status, 'Awaiting verification');
    assert.equal(migrated.note, preserved.note);
    assert.equal(migrated.evidence, preserved.evidence);
    assert.equal(migrated.history.at(-1).action, 'Verification required');
    assert.equal(await page.evaluate(() => HSEActionDetails.status('H020')), 'Verified closed');
    assert.deepEqual((await gate('S04')).unresolved, ['H019']);
    assert.equal((await orders('S04'))[0].safety_hold, true);
    assert.equal(await sourceSnapshot(), sourceBefore);
    await page.reload();
    await page.waitForSelector('#sp-smart-note');
    assert.equal(await page.evaluate(() => HSEActionDetails.progress('H019').history.length), migrated.history.length, 'Migration must not repeat on every reload');
    checked('Legacy Supervisor critical closure migrates to awaiting HSE review, preserves evidence and valid HSE closure, and persists once');

    await page.setViewportSize({ width: 390, height: 844 });
    await site('all');
    await page.fill('#sp-smart-note', 'Visible leak reported');
    assert.match(await page.locator('#sp-note-result').innerText(), /Seal kit/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(errors, []);
    checked('Smart note and gate UI works at 390px without page overflow or JavaScript errors');
    fs.mkdirSync(path.dirname(RESULT), { recursive: true });
    fs.writeFileSync(RESULT, JSON.stringify({ status: 'passed', baseURL: BASE, checks, sourceUnchanged: true, errors }, null, 2));
    console.log(JSON.stringify({ status: 'passed', checks: checks.length, result: RESULT }));
  } catch (error) {
    fs.mkdirSync(path.dirname(RESULT), { recursive: true });
    fs.writeFileSync(RESULT, JSON.stringify({ status: 'failed', checks, error: error.stack, errors }, null, 2));
    if (OUTPUT) { try { await screenshot('failure.png'); } catch (_) {} }
    throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
