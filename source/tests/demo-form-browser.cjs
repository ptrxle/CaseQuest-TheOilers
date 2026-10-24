'use strict';
// Presentation demo: shared views and explicit, non-submitting form prefills.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const BASE = process.env.TEST_URL || process.env.LME_TEST_URL || 'http://127.0.0.1:8765/';
const OUTPUT = process.env.OUTPUT_DIR ? path.resolve(process.env.OUTPUT_DIR) : __dirname;

(async () => {
  const browser = await chromium.launch({ ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}), headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const checks = [], errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const checked = value => { checks.push(value); console.log('PASS ' + value); };
  const snapshot = () => page.evaluate(() => JSON.stringify(PartsStore.snapshot()));
  const fill = () => page.click('[data-sp-action="fill-demo"]');
  const close = () => page.click('[data-sp-action="close"]');
  const open = () => page.click('[data-sp-action="add"]');
  const value = id => page.locator('#sp-' + id).inputValue();
  try {
    await page.goto(BASE);
    await page.waitForSelector('.sp-tracker');
    const source = await page.evaluate(() => JSON.stringify(DATA));
    let index = 0;
    for (const role of ['Supervisor', 'Technician', 'HSE Supervisor']) {
      await page.selectOption('#role', role);
      assert.deepEqual(await page.locator('#nav a span').allTextContents(), ['Overview', 'Dashboard', 'HSE Actions']);
      assert.equal(await page.locator('[data-sp-action="add"]').count(), 1);
      assert.equal(await page.locator('[data-sp-action="demo"]').count(), 1);
      const before = await snapshot();
      await open(); await fill();
      assert.equal(await value('site'), 'S04');
      assert.equal(await value('asset'), await page.evaluate(() => DATA.assets.find(a => a.site_id === 'S04').asset_id));
      assert.equal(await value('sku'), 'DEMO-S04-BEARING-' + String(index + 1).padStart(3, '0'));
      assert.equal(await value('name'), 'DEMO Bearing kit');
      assert.equal(await value('on-hand'), '4');
      assert.equal(await value('reorder'), '2');
      assert.equal(await value('target'), '8');
      assert.equal(await value('supplier'), 'DEMO supplier');
      assert.equal(await value('cost'), '125');
      assert.match(await page.locator('#modal-body').innerText(), /demo|simulated/i);
      assert.equal(await snapshot(), before, role + ' prefill must not save, order, or enable automation');
      await close(); assert.equal(await snapshot(), before, 'Cancel must leave all persisted state unchanged');
      await open(); await fill();
      if (index === 0 && process.env.OUTPUT_DIR) {
        fs.mkdirSync(OUTPUT, { recursive: true });
        await page.locator('#modal').screenshot({ path: path.join(OUTPUT, 'add-part-filled-demo.png') });
      }
      await page.click('[data-sp-action="save-item"]'); index++;
      assert.equal(await page.evaluate(() => PartsStore.getItems('S04').length), index);
      assert.equal(await page.evaluate(() => PartsStore.getOrders().length), 0);
      assert.equal(await page.evaluate(() => PartsStore.snapshot().siteRules.S04.enabled), false);
      const item = await page.evaluate(() => PartsStore.getItems('S04').at(-1));
      assert.equal(item.sku, 'DEMO-S04-BEARING-' + String(index).padStart(3, '0'));
      assert.equal(item.on_hand, 4); assert.equal(item.unit_cost_usd, 125);
      assert.equal(await page.evaluate(() => PartsStore.getActivity().at(-1).actor), 'Demo ' + role);
      await page.click('[data-sp-action="item"]' + '[data-sp-id="' + item.id + '"]');
      assert.equal(await page.locator('[data-sp-action="fill-demo"]').count(), 0, 'Prefill belongs only on Add, not Edit');
      await page.click('#close-modal');
      await page.click('[data-sp-action="tab"][data-sp-id="automation"]');
      assert.equal(await page.locator('[data-sp-rule="S04"]').isDisabled(), false);
      assert.equal(await page.locator('[data-sp-action="reset"]').count(), 1);
      await page.click('[data-sp-action="tab"][data-sp-id="inventory"]');
    }
    checked('All three roles share navigation, Add/Edit, rules and reset; prefill requires explicit submission, preserves cancel, and generates unique SKUs');

    await page.selectOption('#site-scope', 'S02'); await open();
    const mesaAssets = await page.evaluate(() => DATA.assets.filter(a => a.site_id === 'S02').map(a => a.asset_id));
    assert.ok(mesaAssets.length > 1);
    await page.selectOption('#sp-asset', mesaAssets[1]); await fill();
    assert.equal(await value('site'), 'S02'); assert.equal(await value('asset'), mesaAssets[1]);
    assert.equal(await value('sku'), 'DEMO-S02-BEARING-001');
    await page.selectOption('#sp-site', 'S01'); await fill();
    assert.equal(await value('site'), 'S01');
    assert.equal(await value('asset'), await page.evaluate(() => DATA.assets.find(a => a.site_id === 'S01').asset_id));
    assert.equal(await value('sku'), 'DEMO-S01-BEARING-001'); await close();
    await page.selectOption('#site-scope', 'all'); await open(); await fill();
    assert.equal(await value('site'), 'S04'); assert.equal(await value('sku'), 'DEMO-S04-BEARING-004'); await close();
    checked('Prefill respects the form site and selected valid asset; site changes choose a valid asset; All sites falls back to Arroyo');

    await page.setViewportSize({ width: 390, height: 844 }); await open(); await fill();
    assert.equal(await page.locator('#modal').evaluate(el => el.scrollWidth <= el.clientWidth), true);
    assert.equal(await page.locator('[data-sp-action="fill-demo"]').isVisible(), true);
    assert.equal(await page.locator('[data-sp-action="save-item"]').isVisible(), true);
    await close();
    await page.click('[data-sp-action="tab"][data-sp-id="automation"]');
    await page.click('[data-sp-action="reset"]'); await page.click('[data-sp-action="confirm-reset"]');
    assert.equal(await page.evaluate(() => PartsStore.getItems().length), 0);
    assert.equal(await page.evaluate(() => PartsStore.getOrders().length), 0);
    assert.equal(await page.evaluate(() => PartsStore.getActivity().length), 0);
    assert.equal(await page.evaluate(() => HSEActionDetails.gate('S04').unresolved.length), 2);
    assert.equal(await page.evaluate(() => JSON.stringify(DATA)), source);
    assert.deepEqual(errors, []);
    checked('Mobile form works without overflow; reset removes simulated entries while workbook and critical hold remain unchanged');
    fs.mkdirSync(OUTPUT, { recursive: true });
    fs.writeFileSync(path.join(OUTPUT, 'demo-form-verification.json'), JSON.stringify({ status: 'passed', checks, sourceUnchanged: true, errors }, null, 2));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
