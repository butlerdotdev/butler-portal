import { chromium } from 'playwright';
const H = process.env.H; const browser = await chromium.launch(); const page = await (await browser.newContext({ viewport: { width: 1440, height: 1600 } })).newPage();
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' }); const g = page.getByRole('button', { name: /enter/i }); if (await g.count()) { await g.first().click(); await page.waitForLoadState('networkidle'); }
await page.goto('http://localhost:3000/butler/t/platform-engineering/clusters/platform-engineering/e2e-talos', { waitUntil: 'networkidle' }); await page.waitForTimeout(3500);
const t = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
console.log('VMs ready:', t.match(/\d+\/\d+ VMs ready/)?.[0], '| LB card:', t.match(/Load Balancer Requests.{0,140}/)?.[0], '| machines listed:', (t.match(/e2e-talos-[a-z0-9-]+/g) || []).slice(0,4).join(','));
await page.screenshot({ path: `${H}/shots-int/admin-s1-overview-tall.png`, fullPage: true }); await browser.close();
