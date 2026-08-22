import { chromium } from 'playwright';
import { execSync } from 'child_process';
const H = process.env.H;
const browser = await chromium.launch(); const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const frames = [];
page.on('websocket', ws => { if (!ws.url().includes('/api/butler/ws/clusters')) return; frames.push('open'); ws.on('framereceived', f => { try { const m = JSON.parse(f.payload); if (m.type !== 'ping') frames.push(m.type + (m.payload?.cluster?.metadata?.name ? ':' + m.payload.cluster.metadata.name : '')); } catch {} }); ws.on('close', () => frames.push('close')); });
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' }); const g = page.getByRole('button', { name: /enter/i }); if (await g.count()) { await g.first().click(); await page.waitForLoadState('networkidle'); }
await page.goto('http://localhost:3000/butler/t/platform-engineering/clusters/platform-engineering/e2e-talos', { waitUntil: 'networkidle' });
await page.waitForTimeout(4000); console.log('frames before trigger:', frames.join(','));
const before = await page.locator('main').innerText();
execSync(`KUBECONFIG=$HOME/.butler/butler-beta-kubeconfig kubectl annotate tenantcluster e2e-talos -n platform-engineering butler.butlerlabs.dev/e2e-parity-ws=${Date.now()} --overwrite`);
await page.waitForTimeout(6000); console.log('frames after trigger:', frames.join(','));
await page.screenshot({ path: `${H}/shots-int/viewer-realtime-detail.png`, fullPage: true });
// notifications: trigger a phase-independent notification? cluster_update does not create notifications; check bell count unchanged
const bell = page.getByRole('button', { name: /notification/i }); console.log('bell present', await bell.count());
// list page live update: open list, trigger again, verify no reload request was needed (network count for /clusters GET)
let listGets = 0; page.on('request', r => { if (r.url().endsWith('/api/butler/clusters?team=platform-engineering') || r.url().endsWith('/api/butler/clusters')) listGets++; });
await page.goto('http://localhost:3000/butler/t/platform-engineering/clusters', { waitUntil: 'networkidle' }); await page.waitForTimeout(3000); const getsAfterLoad = listGets;
execSync(`KUBECONFIG=$HOME/.butler/butler-beta-kubeconfig kubectl annotate tenantcluster e2e-talos -n platform-engineering butler.butlerlabs.dev/e2e-parity-ws=${Date.now()} --overwrite`);
await page.waitForTimeout(6000); console.log('list GETs after load', getsAfterLoad, 'after trigger', listGets, 'frames:', frames.slice(-4).join(','));
await page.screenshot({ path: `${H}/shots-int/viewer-realtime-list.png`, fullPage: true });
execSync(`KUBECONFIG=$HOME/.butler/butler-beta-kubeconfig kubectl annotate tenantcluster e2e-talos -n platform-engineering butler.butlerlabs.dev/e2e-parity-ws-`);
await browser.close();
