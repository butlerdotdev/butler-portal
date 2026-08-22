import { chromium } from 'playwright'; import { execSync } from 'child_process';
const H = process.env.H; const browser = await chromium.launch(); const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const ws = []; const errs = [];
page.on('websocket', s => { if (!s.url().includes('/ws/clusters')) return; ws.push('open@' + Math.round(performance.now()/1000)); s.on('close', () => ws.push('close@' + Math.round(performance.now()/1000))); });
page.on('pageerror', e => errs.push(e.message.slice(0, 160)));
const text = async () => (await page.locator('main').innerText()).replace(/\s+/g, ' ');
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' }); const g = page.getByRole('button', { name: /enter/i }); if (await g.count()) { await g.first().click(); await page.waitForLoadState('networkidle'); }
await page.goto('http://localhost:3000/butler/t/platform-engineering/clusters/platform-engineering/e2e-talos', { waitUntil: 'networkidle' }); await page.waitForTimeout(3000);
console.log('loaded; ws', ws.join(','));
execSync(`pkill -f ${H}/butler-server`); console.log('server stopped');
await page.waitForTimeout(9000); // a poll or refresh fails
await page.getByRole('button', { name: /refresh/i }).first().click(); await page.waitForTimeout(2500);
console.log('during outage:', (await text()).match(/Failed to refresh[^.]*|Butler API error[^.]*|502[^ ]*/g)?.slice(0, 3), '| page still shows cluster name:', (await text()).includes('e2e-talos'));
await page.screenshot({ path: `${H}/shots-int/viewer-server-outage.png`, fullPage: true });
await page.goto('http://localhost:3000/butler/t/platform-engineering/clusters', { waitUntil: 'networkidle' }); await page.waitForTimeout(2500);
console.log('list during outage:', (await text()).slice(0, 260)); await page.screenshot({ path: `${H}/shots-int/viewer-list-outage.png`, fullPage: true });
execSync(`nohup ${H}/run-server.sh > ${H}/server.log 2>&1 &`, { shell: '/bin/zsh' }); console.log('server restarting');
await page.waitForTimeout(8000); await page.goto('http://localhost:3000/butler/t/platform-engineering/clusters/platform-engineering/e2e-talos', { waitUntil: 'networkidle' }); await page.waitForTimeout(20000);
console.log('after restart text has cluster:', (await text()).includes('Ready'), '| ws timeline', ws.join(','), '| pageerrors', errs.length);
await browser.close();
