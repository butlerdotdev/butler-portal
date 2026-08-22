import { chromium } from 'playwright'; import fs from 'fs';
const H = process.env.H; const ROLE = process.env.ROLE || 'viewer';
const browser = await chromium.launch(); const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const apiErrors = []; const consoleErrors = [];
page.on('response', r => { if (r.url().includes('/api/') && r.status() >= 400) apiErrors.push(`${r.request().method()} ${r.url().replace('http://localhost:3100','')} -> ${r.status()}`); });
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 160)); });
const text = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');
await page.goto('http://localhost:3100/login', { waitUntil: 'networkidle' });
const reveal = page.getByRole('button', { name: /email/i }); if (await reveal.count()) { await reveal.first().click(); await page.waitForTimeout(500); }
if (ROLE === 'admin') { await page.fill('input[autocomplete="username"]', 'admin'); } else { await page.fill('input[autocomplete="username"]', `e2e-parity-${ROLE}@butlerlabs.dev`); }
await page.fill('input[type="password"]', ROLE === 'admin' ? fs.readFileSync(`${H}/sa-password.txt`, 'utf8').trim() : fs.readFileSync(`${H}/pw-e2e-parity-${ROLE}.txt`, 'utf8').trim());
await page.click('button[type="submit"]'); await page.waitForLoadState('networkidle'); await page.waitForTimeout(1500); console.log('after login url:', page.url());
const base = 'http://localhost:3100';
await page.goto(base + '/t/platform-engineering/clusters', { waitUntil: 'networkidle' }); await page.waitForTimeout(1500); await page.screenshot({ path: `${H}/shots-int/console-${ROLE}-clusters.png`, fullPage: true }); console.log('clusters:', (await text()).slice(0, 200));
await page.goto(base + '/t/platform-engineering/clusters/platform-engineering/e2e-talos', { waitUntil: 'networkidle' }); await page.waitForTimeout(2500); await page.screenshot({ path: `${H}/shots-int/console-${ROLE}-detail.png`, fullPage: true });
const t = await text(); console.log('detail:', t.slice(0, 700));
console.log('buttons:', (await page.getByRole('button').allInnerTexts()).filter(b => b.trim()).join(' | '));
for (const tab of ['control-plane', 'certificates', 'observability']) { await page.goto(base + `/t/platform-engineering/clusters/platform-engineering/e2e-talos?tab=${tab}`, { waitUntil: 'networkidle' }); await page.waitForTimeout(2000); await page.screenshot({ path: `${H}/shots-int/console-${ROLE}-${tab}.png`, fullPage: true }); console.log(tab + ':', (await text()).slice(300, 700)); }
if (ROLE === 'admin') { await page.goto(base + '/admin/settings', { waitUntil: 'networkidle' }); await page.waitForTimeout(2000); await page.screenshot({ path: `${H}/shots-int/console-admin-settings.png`, fullPage: true }); console.log('settings:', (await text()).slice(200, 600)); }
console.log('API_ERRORS', [...new Set(apiErrors)].join(' ; ')); console.log('CONSOLE_ERRORS', consoleErrors.length, consoleErrors.slice(0, 4).join(' ; '));
await browser.close();
