import { chromium } from 'playwright';
const browser = await chromium.launch(); const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } }); const page = await ctx.newPage();
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
const g = page.getByRole('button', { name: /enter/i }); if (await g.count()) { await g.first().click(); await page.waitForLoadState('networkidle'); }
const r = await page.evaluate(async () => {
  const j = async u => { const x = await fetch(u, { credentials: 'include' }); return [x.status, await x.json().catch(() => ({}))]; };
  const [s1, a] = await j('/api/butler/clusters?team=platform-engineering');
  const [s2, b] = await j('/api/butler/clusters');
  const [s3, c] = await j('/api/butler/teams/platform-engineering/clusters');
  const [s4, d] = await j('/api/butler/_identity');
  return { withTeam: [s1, (a.clusters||[]).length], all: [s2, (b.clusters||[]).length], teamPath: [s3, (c.clusters||[]).length], identity: [s4, d.isPlatformAdmin, d.platformRole] };
});
console.log(JSON.stringify(r)); await browser.close();
