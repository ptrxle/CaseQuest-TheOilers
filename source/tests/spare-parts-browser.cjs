'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const BASE = process.env.TEST_URL || process.env.LME_TEST_URL || 'http://127.0.0.1:8765/';
const OUT = path.join(__dirname,'tracker-verification.json');

(async () => {
  const browser = await chromium.launch({ ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{}), headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
  const errors = [], checks = [];
  page.on('pageerror', error => errors.push(error.message));
  const checked = name => { checks.push(name); console.log('PASS ' + name); };
  const tab = async name => { await page.click(`[data-sp-action="tab"][data-sp-id="${name}"]`); };
  const close = async () => { await page.click('#close-modal'); };
  const data = expression => page.evaluate(expression);
  try {
    await page.goto(BASE);
    await page.waitForSelector('.sp-tracker');
    await page.waitForFunction(() => current === 'parts' && state.site === 'S04');
    assert.equal(await page.locator('#page-title').innerText(), 'Spare Parts');
    assert.equal(await page.locator('#site-scope').inputValue(), 'S04');
    assert.deepEqual(await page.locator('#nav a span').allTextContents(), ['Spare Parts', 'Dashboard', 'HSE Actions']);
    const source = await data(() => JSON.stringify(DATA));
    assert.equal(await data(() => PartsStore.getItems().length), 0);
    assert.match(await page.locator('.sp-tracker-heading').innerText(), /Inventory tracker[\s\S]*Browser-local demo[\s\S]*separate from workbook history/);
    assert.match(await page.locator('.sp-tracker-empty').innerText(), /No demo inventory yet[\s\S]*stock quantities are not supplied/);
    const summary = await page.locator('.sp-workspace').evaluate(el => ({ text: el.firstElementChild.textContent, tracker: el.firstElementChild.matches('.sp-tracker') }));
    assert.equal(summary.tracker, false);
    assert.match(summary.text, /Arroyo/);
    assert.match(summary.text, /2025|historical/i);
    assert.equal(await page.locator('.sp-tracker-kpis .stat').count(), 4);
    assert.match(await page.locator('.sp-stock-summary').innerText(), /No demo stock records/);
    checked('Spare Parts landing, Arroyo default, distinct historical and demo sections, honest empty tracker');

    for (const old of ['setup', 'access', 'downtime']) {
      await page.goto(BASE + '#' + old);
      await page.waitForFunction(() => current === 'parts');
      assert.equal(await page.locator('#page-title').innerText(), 'Spare Parts');
    }
    await page.click('#nav a[href="#dashboard"]');
    await page.waitForSelector('.af-dashboard');
    assert.equal(await page.locator('.chart-tile').count(), 8);
    await page.click('#nav a[href="#parts"]');
    await page.waitForSelector('.sp-tracker');
    for (const id of ['inventory', 'orders', 'automation']) {
      await tab(id);
      assert.equal(await page.locator('.sp-tab[aria-selected="true"]').getAttribute('data-sp-id'), id);
    }
    await tab('inventory');
    checked('Three-page navigation, removed-route fallback, and all tracker tabs');

    // All sites defaults to Arroyo for new demo entries; explicitly selected sites remain selected.
    await page.selectOption('#site-scope', 'all');
    assert.equal(await page.locator('.sp-workspace > .sp-source tbody tr').count(), 6);
    await page.click('[data-sp-action="add"]');
    assert.equal(await page.locator('#sp-site').inputValue(), 'S04');
    await close();
    await page.selectOption('#site-scope', 'S02');
    await page.click('[data-sp-action="add"]');
    assert.equal(await page.locator('#sp-site').inputValue(), 'S02');
    await close();
    await page.click('[data-sp-action="demo"]');
    assert.equal(await page.locator('#sp-demo-site').inputValue(), 'S02');
    await close();
    await page.selectOption('#site-scope', 'all');
    await page.click('[data-sp-action="demo"]');
    assert.equal(await page.locator('#sp-demo-site').inputValue(), 'S04');
    await page.click('[data-sp-action="seed"]');
    assert.equal(await page.locator('#site-scope').inputValue(), 'S04');
    assert.equal(await data(() => PartsStore.getItems('S04')[0].on_hand), 4);
    assert.equal(await data(() => PartsStore.getItems('S04')[0].unit_cost_usd), null);
    assert.equal(await data(() => PartsStore.getItems('S02').length), 0);
    checked('Arroyo Add/Try demo defaults, explicit other-site selection, and no default seeding');

    // Trigger replenishment with an actual technician stock movement.
    await page.selectOption('#role', 'Technician');
    assert.equal(await page.locator('[data-sp-action="add"]').count(), 0);
    assert.equal(await page.locator('[data-sp-action="demo"]').count(), 0);
    await page.click('[data-sp-action="issue"]');
    await page.click('[data-sp-action="save-movement"]');
    assert.notEqual((await page.locator('#sp-error').innerText()).trim(), '');
    await page.fill('#sp-quantity', '3');
    await page.fill('#sp-note', 'SIMULATED: issued three Arroyo spares for a maintenance job.');
    await page.click('[data-sp-action="save-movement"]');
    assert.equal(await data(() => PartsStore.getItems('S04')[0].on_hand), 1);
    assert.equal(await data(() => PartsStore.getOrders('S04')[0].quantity), 7);
    assert.equal(await data(() => PartsStore.getItems('S04')[0].position), 8);
    assert.match(await page.locator('.sp-stock-meter').getAttribute('aria-label'), /Request open: 1/);
    assert.equal(await page.locator('.sp-request-counts > div').first().locator('strong').innerText(), '1');
    await tab('orders');
    assert.equal(await page.locator('[data-sp-action="check"]').count(), 0);
    await page.click('[data-sp-action="order"]');
    assert.equal(await page.locator('[data-sp-action="approve"]').count(), 0);
    assert.doesNotMatch(await page.locator('#modal-body').innerText(), /Unit cost|Request value/);
    await close();
    assert.match(await data(() => { try { PartsStore.approve(PartsStore.getOrders('S04')[0].id, 'Forbidden technician approval'); return 'FAILED'; } catch (e) { return e.message; } }), /role/);
    checked('Technician issue 3 creates request 7; tracker updates; configuration and approval guarded');

    await page.selectOption('#role', 'Supervisor');
    await page.click('[data-sp-action="check"]');
    await page.click('[data-sp-action="check"]');
    assert.equal(await data(() => PartsStore.getOrders().length), 1);
    await page.click('[data-sp-action="order"]');
    await page.click('[data-sp-action="approve"]');
    assert.match(await page.locator('#sp-error').innerText(), /note/i);
    await page.fill('#sp-approval', 'SIMULATED: replenish Arroyo stock to target.');
    await page.click('[data-sp-action="approve"]');
    assert.match(await page.locator('#modal-title').innerText(), /Approved/);
    await close();
    await page.selectOption('#role', 'Technician');
    await page.click('[data-sp-action="order"]');
    await page.fill('#sp-receipt-quantity', '3');
    await page.fill('#sp-receipt-reference', 'ARROYO-DEMO-DELIVERY-1');
    await page.click('[data-sp-action="receive"]');
    assert.match(await page.locator('#modal-title').innerText(), /Partially received/);
    assert.equal(await data(() => PartsStore.getItems('S04')[0].on_hand), 4);
    assert.equal(await data(() => PartsStore.getOrders('S04')[0].remaining_quantity), 4);
    await page.fill('#sp-receipt-quantity', '5');
    await page.fill('#sp-receipt-reference', 'ARROYO-DEMO-OVERRECEIPT');
    await page.click('[data-sp-action="receive"]');
    assert.match(await page.locator('#sp-error').innerText(), /remaining/i);
    assert.equal(await data(() => PartsStore.getItems('S04')[0].on_hand), 4);
    await page.fill('#sp-receipt-quantity', '4');
    await page.fill('#sp-receipt-reference', 'ARROYO-DEMO-DELIVERY-2');
    await page.click('[data-sp-action="receive"]');
    assert.match(await page.locator('#modal-title').innerText(), /Received/);
    assert.equal(await data(() => PartsStore.getItems('S04')[0].on_hand), 8);
    assert.equal(await data(() => PartsStore.getItems('S04')[0].on_order), 0);
    assert.equal(await page.locator('[data-sp-action="receive"]').count(), 0);
    await close();
    assert.equal(await page.locator('.sp-request-counts > div').last().locator('strong').innerText(), '1');
    checked('No duplicate requests; approval note required; partial/full receipts and over-receipt protection');

    await page.reload();
    await page.waitForSelector('.sp-tracker');
    assert.equal(await data(() => PartsStore.getItems('S04')[0].on_hand), 8);
    assert.equal(await data(() => PartsStore.getOrders('S04')[0].status), 'Received');
    await page.selectOption('#role', 'HSE Supervisor');
    await tab('inventory');
    assert.equal(await page.locator('[data-sp-action="issue"]').count(), 0);
    assert.equal(await page.locator('[data-sp-action="count"]').count(), 0);
    assert.equal(await page.locator('[data-sp-action="add"]').count(), 0);
    await page.click('[data-sp-action="item"]');
    assert.equal(await page.locator('[data-sp-action="save-item"]').count(), 0);
    await close();
    await tab('automation');
    assert.equal(await page.locator('[data-sp-rule="S04"]').isDisabled(), true);
    assert.equal(await page.locator('[data-sp-action="reset"]').count(), 0);
    assert.match(await data(() => { try { PartsStore.issue(PartsStore.getItems('S04')[0].id, 1, 'Forbidden HSE movement'); return 'FAILED'; } catch (e) { return e.message; } }), /role/);
    await page.selectOption('#site-scope', 'S01');
    assert.equal(await data(() => SpareParts.openItem(PartsStore.getItems('S04')[0].id)), false);
    assert.equal(await data(() => SpareParts.openOrder(PartsStore.getOrders('S04')[0].id)), false);
    assert.equal(await page.locator('.sp-tracker-kpis .stat .value').first().innerText(), '0');
    await page.selectOption('#role', 'Supervisor');
    await tab('inventory');
    await page.click('[data-sp-action="add"]');
    await page.fill('#sp-sku', 'CEDAR-TEST');
    await page.fill('#sp-name', 'SIMULATED: unknown stock count');
    await page.click('[data-sp-action="save-item"]');
    assert.equal(await data(() => PartsStore.getItems('S01')[0].on_hand), null);
    assert.equal(await page.locator('.sp-tracker .sp-table tbody tr td').nth(2).innerText(), '—');
    assert.match(await page.locator('.sp-tracker-kpis').innerText(), /1 stock count missing/);
    assert.match(await page.locator('.sp-stock-meter').getAttribute('aria-label'), /Unconfigured: 1/);
    assert.equal(await data(() => PartsStore.getItems('S04')[0].on_hand), 8);
    checked('Reload persistence, HSE read-only, cross-site modal isolation, unknown count distinct from zero');

    // HSE workflow remains independent. Both critical Arroyo actions must be verified.
    const sparesBefore = await data(() => JSON.stringify(PartsStore.snapshot()));
    await page.selectOption('#site-scope', 'S04');
    await page.click('#nav a[href="#hse"]');
    await page.selectOption('#hse-severity', '5');
    await page.click('[data-kind="hse"][data-id="H019"]');
    assert.match(await page.locator('.hse-detail-hold').innerText(), /2 actions/);
    assert.match(await page.locator('.hse-detail-hold').innerText(), /H019[\s\S]*H020/);
    await page.selectOption('#hse-detail-role', 'Technician');
    await page.fill('#hse-detail-notes', 'SIMULATED: Arroyo H2S readiness checked.');
    await page.fill('#hse-detail-evidence', 'ARROYO-DEMO-H019');
    await page.click('[data-hse-command="submit"]');
    assert.match(await page.locator('.hse-detail-hold').innerText(), /2 actions/);
    assert.equal(await page.locator('[data-hse-command="verify"]').isDisabled(), true);
    await page.selectOption('#hse-detail-role', 'HSE Supervisor');
    assert.equal(await page.locator('#hse-detail-notes').inputValue(), 'SIMULATED: Arroyo H2S readiness checked.');
    await page.click('[data-hse-command="verify"]');
    assert.match(await page.locator('#hse-detail-message').innerText(), /verification note is required/);
    await page.fill('#hse-detail-verification', 'SIMULATED: evidence reviewed.');
    await page.click('[data-hse-command="verify"]');
    assert.match(await page.locator('.hse-detail-hold').innerText(), /1 action/);
    await page.selectOption('#hse-detail-action', 'H020');
    await page.selectOption('#hse-detail-role', 'Technician');
    await page.fill('#hse-detail-notes', 'SIMULATED: Arroyo isolation review completed.');
    await page.click('[data-hse-command="submit"]');
    await page.selectOption('#hse-detail-role', 'Supervisor');
    await page.fill('#hse-detail-verification', 'SIMULATED: stored-energy controls verified.');
    await page.click('[data-hse-command="verify"]');
    assert.match(await page.locator('.hse-detail-hold').innerText(), /Critical HSE hold cleared/);
    assert.equal(await data(() => JSON.stringify(PartsStore.snapshot())), sparesBefore);
    await close();
    const hseBefore = await data(() => localStorage.getItem('lme-hse-action-demo-v1'));
    await page.click('#nav a[href="#parts"]');
    await tab('automation');
    await page.click('[data-sp-action="reset"]');
    await page.click('[data-sp-action="confirm-reset"]');
    assert.equal(await data(() => PartsStore.getItems().length), 0);
    assert.equal(await data(() => PartsStore.getOrders().length), 0);
    assert.equal(await data(() => localStorage.getItem('lme-hse-action-demo-v1')), hseBefore);
    assert.equal(await data(() => JSON.stringify(DATA)), source);
    checked('Arroyo H019/H020 two-action gate, supervisor notes, separate reset, workbook immutable');

    const guide = await data(() => SiteAssistant.ask('Show Arroyo orders'));
    assert.equal(guide.actions.some(a => a.kind === 'parts-tab' && a.id === 'orders'), true);
    await page.waitForFunction(() => location.hash === '#parts');
    assert.equal(await page.locator('.sp-tab[aria-selected="true"]').getAttribute('data-sp-id'), 'orders');
    await page.setViewportSize({ width: 390, height: 844 });
    for (const id of ['inventory', 'orders', 'automation']) {
      await tab(id);
      assert.equal(await data(() => document.documentElement.scrollWidth <= innerWidth), true, 'Mobile horizontal overflow: ' + id);
    }
    assert.deepEqual(errors, []);
    checked('Guide navigation and 390px mobile tabs without document overflow');
    const result = { status: 'passed', baseURL: BASE, viewport: { desktop: '1600×1000', mobile: '390×844' }, checks,
      landing: 'Spare Parts', defaultSite: 'Arroyo (S04)', navigation: ['Spare Parts', 'Dashboard', 'HSE Actions'],
      sourceUnchanged: true, resetSeparation: true, noDefaultInventory: true, pageErrors: errors };
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  } catch (error) {
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify({ status: 'failed', checks, error: error.stack, pageErrors: errors }, null, 2));
    throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
