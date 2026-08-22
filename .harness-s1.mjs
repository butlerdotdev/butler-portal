import { chromium } from 'playwright';
const H = process.env.H; const browser = await chromium.launch(); const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const api = []; page.on('response', r => { if (r.url().includes('/api/butler/clusters/platform-engineering/e2e-talos/')) api.push(`${r.url().split('/e2e-talos/')[1]} ${r.status()}`); });
const dl = []; page.on('download', d => dl.push(d.suggestedFilename()));
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' }); const g = page.getByRole('button', { name: /enter/i }); if (await g.count()) { await g.first().click(); await page.waitForLoadState('networkidle'); }
await page.goto('http://localhost:3000/butler/t/platform-engineering/clusters/platform-engineering/e2e-talos', { waitUntil: 'networkidle' }); await page.waitForTimeout(3000);
const text = async () => (await page.locator('main').innerText()).replace(/\s+/g, ' ');
let t = await text(); console.log('overview cards:', t.match(/Provisioning[^|]{0,160}/)?.[0], '||', t.match(/Load Balancer Requests[^|]{0,120}/)?.[0]);
await page.screenshot({ path: `${H}/shots-int/admin-s1-overview.png`, fullPage: true });
await page.getByRole('tab', { name: /control plane/i }).click(); await page.waitForTimeout(2500); t = await text(); console.log('control plane tab:', t.slice(t.indexOf('Control Plane'), t.indexOf('Control Plane') + 420));
await page.screenshot({ path: `${H}/shots-int/admin-s1-controlplane.png`, fullPage: true });
const ex = page.getByRole('button', { name: /export yaml/i }); console.log('export button', await ex.count()); if (await ex.count()) { await ex.first().click(); await page.waitForTimeout(2500); console.log('downloads:', dl.join(',')); }
console.log('api:', api.join(' | '));
await browser.close();
