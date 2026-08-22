import { chromium } from 'playwright';
const H = process.env.H; const ROLE = process.env.ROLE || 'viewer';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const consoleErrors = []; const apiErrors = []; const wsEvents = [];
const ignore = /findDOMNode|defaultProps|Could not parse CSS|act\(\.\.\.\)|React Router Future|componentWillReceiveProps|validateDOMNesting|Each child in a list/;
page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message.slice(0, 200)));
page.on('console', m => { if (m.type() === 'error' && !ignore.test(m.text())) consoleErrors.push(m.text().slice(0, 200)); });
page.on('response', r => { const u = r.url(); if (u.includes('/api/butler') && r.status() >= 400) apiErrors.push(`${r.request().method()} ${u.replace('http://localhost:7007','')} -> ${r.status()}`); });
page.on('websocket', ws => { wsEvents.push('open ' + ws.url().replace('ws://localhost:7007','')); ws.on('framereceived', f => { try { const m = JSON.parse(f.payload); if (m.type !== 'ping') wsEvents.push('recv ' + m.type); } catch {} }); ws.on('close', () => wsEvents.push('close')); });
const shot = async (name) => page.screenshot({ path: `${H}/shots-int/${ROLE}-${name}.png`, fullPage: true });
const text = async () => (await page.locator('main, #root').first().innerText()).replace(/\s+/g, ' ');
const log = (...a) => console.log(...a);
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
const guest = page.getByRole('button', { name: /enter/i }); if (await guest.count()) { await guest.first().click(); await page.waitForLoadState('networkidle'); }
const base = 'http://localhost:3000';
// 1 navigation + overview
await page.goto(base + '/butler', { waitUntil: 'networkidle' }); await page.waitForTimeout(1500); await shot('overview'); log('overview:', (await text()).slice(0, 220));
// 2 cluster list (route ref)
await page.goto(base + '/butler/t/platform-engineering/clusters', { waitUntil: 'networkidle' }); await page.waitForTimeout(1500); await shot('clusters');
const rowLink = page.getByRole('link', { name: 'e2e-talos' }).first(); log('clusters: rows visible', await page.getByRole('row').count(), 'e2e-talos link', await rowLink.count());
// 3 detail via link click (route refs)
await rowLink.click(); await page.waitForLoadState('networkidle'); await page.waitForTimeout(2000); log('detail url:', page.url()); await shot('detail-overview');
const t = await text(); log('detail header:', t.slice(0, 260)); log('phantom rows present:', /Control Plane Ready|Infrastructure Ready/.test(t), 'double-v:', /vv1\./.test(t));
// 4 kubeconfig (expect denial for viewer)
const kc = page.getByRole('button', { name: /kubeconfig/i }); if (await kc.count()) { await kc.first().click(); await page.waitForTimeout(1500); await shot('kubeconfig-click'); log('after kubeconfig click:', (await text()).match(/forbidden|Failed to|denied|kubeconfig/gi)?.slice(0,4)); }
// 5 tabs
for (const [i, name] of [[1,'nodes'],[4,'certificates'],[5,'events'],[3,'gitops'],[6,'terminal']]) { await page.getByRole('tab').nth(i).click(); await page.waitForTimeout(2500); await shot('tab-' + name); log('tab', name, ':', (await text()).slice(0, 180).replace(/^.*?Terminal /, '')); }
// 6 delete dialog (expect 403 for viewer; do NOT confirm as admin)
await page.getByRole('tab').nth(0).click();
const del = page.getByRole('button', { name: /^delete$/i }); if (await del.count() && ROLE === 'viewer') { await del.first().click(); await page.waitForTimeout(800); await shot('delete-dialog'); const confirm = page.getByRole('button', { name: /delete cluster|^delete$/i }).last(); await confirm.click(); await page.waitForTimeout(1500); await shot('delete-result'); log('after delete attempt:', (await text()).match(/forbidden|Failed to delete|permission/gi)?.slice(0,3)); const cancel = page.getByRole('button', { name: /cancel/i }); if (await cancel.count()) await cancel.first().click(); }
// 7 realtime: trigger an annotation from outside, expect a ws cluster_update
log('ws before:', wsEvents.join(',')); await page.evaluate(() => new Promise(r => setTimeout(r, 500)));
await page.waitForTimeout(parseInt(process.env.WAIT_MS || '12000')); log('ws after wait:', wsEvents.slice(-6).join(','));
// 8 admin pages
await page.goto(base + '/butler/admin/settings', { waitUntil: 'networkidle' }); await page.waitForTimeout(1500); await shot('admin-settings'); log('settings:', (await text()).slice(0, 220));
await page.goto(base + '/butler/admin/management', { waitUntil: 'networkidle' }); await page.waitForTimeout(1500); await shot('admin-management'); log('management:', (await text()).slice(0, 200));
// 9 missing resource
await page.goto(base + '/butler/t/platform-engineering/clusters/platform-engineering/does-not-exist', { waitUntil: 'networkidle' }); await page.waitForTimeout(1500); await shot('missing-cluster'); log('missing:', (await text()).slice(0, 200));
// 10 notification bell
await page.goto(base + '/butler/t/platform-engineering/clusters', { waitUntil: 'networkidle' }); const bell = page.getByRole('button', { name: /notification/i }); log('bell buttons:', await bell.count()); if (await bell.count()) { await bell.first().click(); await page.waitForTimeout(600); await shot('notifications'); }
log('CONSOLE_ERRORS', consoleErrors.length); consoleErrors.slice(0, 12).forEach(e => log('  ', e));
log('API_ERRORS', apiErrors.length); [...new Set(apiErrors)].slice(0, 20).forEach(e => log('  ', e));
log('WS', wsEvents.join(','));
await browser.close();
