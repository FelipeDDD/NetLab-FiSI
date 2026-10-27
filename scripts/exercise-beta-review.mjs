import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { generateReview } from './visual-review.mjs';

export async function runExerciseReview({ page, url, root, report, restart }) {
  const database = 'netlab-idb-test-' + randomUUID();
  const directory = path.join(root, '.playwright-mcp/reviews/raw/exercise-beta-staging');
  await mkdir(directory, { recursive: true });
  const results = {}, screenshots = [];
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const wait = async expression => { for (let i = 0; i < 160; i++) { if (await page.evaluate('return !!(' + expression + ');')) return; await delay(50); } throw Error('Timed out: ' + expression); };
  const clickText = async (selector, text) => {
    const p = await page.evaluate(`const clean=s=>s.replace(/[›▾]/g,'').trim();const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>clean(e.textContent)===clean(${JSON.stringify(text)}));if(!e)throw Error('Missing button: '+${JSON.stringify(text)});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};`);
    await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...p, button: 'left', clickCount: 1 });
    await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...p, button: 'left', clickCount: 1 }); await delay(60);
  };
  const menu = async () => {
    if (await page.evaluate("return !!document.querySelector('#toolbar-exercises-menu');")) return;
    if (await page.evaluate('return innerWidth<=1100;')) await clickText('.toolbar-menu-trigger', 'Menü ▾');
    await clickText('.toolbar-menu-trigger,.toolbar-menu-action', 'Übungen (Beta)'); await wait("document.querySelector('#toolbar-exercises-menu')");
  };
  const status = () => page.evaluate(`const r=await ws.repository.getMeta('exercises:beta:v1');if(!r.ok)throw Error(JSON.stringify(r));return r.value?.value??null;`);
  const shot = async (name, theme, width) => {
    await page.send('Page.bringToFront'); await delay(100);
    const png = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(path.join(directory, name), Buffer.from(png.data, 'base64')); screenshots.push({ name, theme, width, height: 960 });
  };
  const mount = async () => {
    await page.send('Page.navigate', { url }); await wait("document.readyState==='complete'&&location.pathname==='/__workspace_ui_test__'");
    await page.evaluate(`window.entry=await import('/src/workspace/reviewEntry.tsx');window.store=(await import('/src/store.ts')).useStore;window.sim=(await import('/src/sim.ts')).sim;window.ws=await entry.mountWorkspaceReview(document.getElementById('root'),{databaseName:${JSON.stringify(database)}});window.drafts=(await import('/src/exercises/drafts.ts')).EXERCISE_DRAFTS;window.theme=(await import('/src/uiTheme.ts')).useUiTheme;`);
    await wait("document.querySelector('.react-flow')"); await delay(100);
  };
  const test = async (name, work) => { try { await work(); results[name] = { passed: true }; } catch (e) { results[name] = { passed: false, error: e.stack ?? String(e) }; throw e; } };
  const start = async (id, repeat = false) => { await menu(); await clickText(`[data-exercise="${id}"] button`, repeat ? 'Erneut starten' : 'Starten'); await wait(`document.querySelector('.exercise-panel[data-exercise="${id}"]')`); await delay(100); };
  const check = async () => {
    await clickText('.exercise-panel button', 'Überprüfen');
    await wait("document.querySelector('.exercise-panel').textContent.includes('Prüfung läuft')");
    await page.evaluate('store.getState().setPaused(true);sim.net.scheduler.advanceTo(sim.net.scheduler.now+120000);');
    await wait("!document.querySelector('.exercise-panel').textContent.includes('Prüfung läuft')"); await delay(80);
  };
  const solve = async id => {
    await page.evaluate(`const file=drafts.find(d=>d.id===${JSON.stringify(id)}).review.reference.topology;const ip=await import('/src/engine/ip.ts');for(const saved of file.devices){const d=sim.net.devices.get(saved.id);if('staticRoutes' in d){d.forwarding=saved.forwarding;d.staticRoutes.length=0;for(const r of saved.routes){const c=ip.parseCidr(r.dest);d.addRoute(c.addr,c.prefix,r.via?ip.parseIp(r.via):null,r.dev);}if(saved.dnsServer)d.dnsServer={enabled:saved.dnsServer.enabled,records:new Map(saved.dnsServer.records.map(([n,a])=>[n,ip.parseIp(a)]))};if(saved.httpServer)d.httpServer={...saved.httpServer};}}store.getState().refresh();const r=await ws.controller.flush();if(!r.ok)throw Error(JSON.stringify(r));`);
  };
  const routing = 'fisi-office-warehouse-routing', portal = 'fisi-service-portal';
  try {
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }); await mount();
    await page.evaluate("theme.getState().setTheme('graphite-dark');");
    await test('exercises: menu exposes only two drafts; solved JSON import creates no achievement', async () => {
      await menu(); assert.equal(await page.evaluate("return document.querySelectorAll('.exercise-menu-entry').length;"), 2);
      assert.equal(await page.evaluate("return document.querySelector('#toolbar-exercises-menu').textContent.includes('Noch nicht begonnen');"), true);
      await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape' });
      await page.evaluate(`await ws.controller.openDocument({schemaVersion:1,topology:drafts.find(d=>d.id===${JSON.stringify(routing)}).review.reference.topology});`);
      assert.equal(await page.evaluate("return !!document.querySelector('.exercise-panel');"), false); assert.equal(await status(), null);
    });
    for (const id of [routing, portal]) await test(`exercises: ${id} opens independently, fails, solves and saves`, async () => {
      const before = await page.evaluate('return ws.controller.getState().drafts.length;');
      await start(id); assert.equal(await page.evaluate('return ws.controller.getState().drafts.length;'), before + 1);
      await check(); assert.equal(Object.keys((await status()).completed).includes(id), false);
      assert(await page.evaluate("return !!document.querySelector('.exercise-panel [data-result=fail]');"));
      if (id === routing) await shot('01-routing-before.png', 'graphite-dark', 1440);
      await solve(id);
      if (id === routing) {
        await page.evaluate("window.writeNormally=ws.repository.setMeta.bind(ws.repository);ws.repository.setMeta=async()=>({ok:false,error:{code:'quota-exceeded',message:'test completion write failure'}});");
        await check(); assert.equal((await status()).completed[id], undefined);
        assert(await page.evaluate("return document.querySelector('.exercise-panel').textContent.includes('quota-exceeded');"));
        await page.evaluate('ws.repository.setMeta=writeNormally;');
      }
      await check(); assert((await status()).completed[id]);
      assert.equal(await page.evaluate("return !!document.querySelector('.exercise-panel [data-result=fail],.exercise-panel [data-result=pending]');"), false);
      await shot(id === routing ? '02-routing-complete.png' : '03-portal-complete.png', 'graphite-dark', 1440);
    });
    const completed = (await status()).completed;
    await test('exercises: Unicode renames preserve IDs; homonyms and deleted devices cannot impersonate them', async () => {
      for (const exerciseId of [routing, portal]) {
        const attempt = Object.values((await status()).attempts).find(a => a.exerciseId === exerciseId);
        await page.evaluate(`const r=await ws.controller.switchDraft(${JSON.stringify(attempt.draftId)});if(!r.ok)throw Error(JSON.stringify(r));`);
        await wait(`document.querySelector('.exercise-panel[data-exercise="${exerciseId}"]')`);
        const sourceId = exerciseId === routing ? 'buero' : 'servicepc';
        const ids = await page.evaluate('return [...sim.net.devices.keys()];');
        if (exerciseId === routing) {
          await page.evaluate("store.getState().select('buero');"); await wait("document.querySelector('.inspector-name')");
          await page.evaluate("const input=document.querySelector('.inspector-name');input.focus();input.select();");
          await page.send('Input.insertText', { text: 'büro' });
          await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', windowsVirtualKeyCode: 13 });
          await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', windowsVirtualKeyCode: 13 });
          await wait("sim.net.devices.get('buero').name==='büro'"); await page.evaluate('store.getState().select(null);');
          await check(); assert(await page.evaluate("return !document.querySelector('.exercise-panel [data-result=fail],.exercise-panel [data-result=pending]');"));
        }
        await page.evaluate(`for(const [i,d] of [...sim.net.devices.values()].entries())store.getState().renameDevice(d.id,['Office-PC / Escritório 🖥','Büro – 東京','Servidor João','Rede de testes'][i]);`);
        assert.deepEqual(await page.evaluate('return [...sim.net.devices.keys()];'), ids);
        await page.evaluate(`const {createDevice}=await import('/src/engine/factory.ts');createDevice(sim.net,'host',{id:'unrelated-display-name',name:${JSON.stringify(sourceId)}});store.getState().refresh();`);
        await check(); assert(await page.evaluate("return !document.querySelector('.exercise-panel [data-result=fail],.exercise-panel [data-result=pending]');"));
        await page.evaluate(`store.getState().deleteDevice(${JSON.stringify(sourceId)});`);
        await check(); assert(await page.evaluate("return !!document.querySelector('.exercise-panel [data-result=fail]');"));
        assert.deepEqual((await status()).completed, completed);
        await page.evaluate('store.getState().undoTopology();'); await check();
        assert(await page.evaluate("return !document.querySelector('.exercise-panel [data-result=fail],.exercise-panel [data-result=pending]');"));
        await page.evaluate("store.getState().deleteDevice('unrelated-display-name');await ws.controller.flush();");
      }
    });
    await test('exercises: F5, resumed attempt, and full Chromium restart preserve confirmations', async () => {
      await page.evaluate('await ws.controller.flush();ws.dispose();'); await page.send('Page.reload'); await delay(150); await mount();
      assert.deepEqual((await status()).completed, completed);
      await wait(`document.querySelector('.exercise-panel[data-exercise="${portal}"]')`);
      assert.equal(await page.evaluate("return sim.net.devices.get('servicepc').name;"), 'Office-PC / Escritório 🖥');
      await check(); assert(await page.evaluate("return !document.querySelector('.exercise-panel [data-result=fail],.exercise-panel [data-result=pending]');"));
      await page.evaluate('await ws.controller.flush();ws.dispose();'); page = await restart();
      await page.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }); await mount();
      assert.deepEqual((await status()).completed, completed); await menu();
      assert.equal(await page.evaluate("return document.querySelectorAll('.exercise-menu-entry .exercise-completed').length;"), 2);
      await shot('04-completed-menu.png', 'graphite-dark', 1440);
      await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape' });
      assert.equal(await page.evaluate("return sim.net.devices.get('servicepc').name;"), 'Office-PC / Escritório 🖥');
      await check(); assert(await page.evaluate("return !document.querySelector('.exercise-panel [data-result=fail],.exercise-panel [data-result=pending]');"));
    });
    await test('exercises: repeat retains earlier completion; edits and tab changes invalidate checks', async () => {
      await start(routing, true); await solve(routing);
      await clickText('.exercise-panel button', 'Überprüfen'); await wait("document.querySelector('.exercise-panel').textContent.includes('Prüfung läuft')");
      await page.evaluate("store.getState().setPaused(true);sim.net.devices.get('r1').forwarding=false;store.getState().refresh();await ws.controller.flush();sim.net.scheduler.advanceTo(sim.net.scheduler.now+120000);");
      await wait("document.querySelector('.exercise-panel').textContent.includes('erneut überprüfen')");
      assert.equal(await page.evaluate("return document.querySelectorAll('.exercise-panel [data-result=pass]').length;"), 0);
      assert.deepEqual((await status()).completed, completed);
      const id = await page.evaluate('return ws.controller.getState().activeDraftId;');
      await solve(routing); await clickText('.exercise-panel button', 'Überprüfen');
      await wait("document.querySelector('.exercise-panel').textContent.includes('Prüfung läuft')");
      await page.evaluate("await ws.controller.openDocument({schemaVersion:1,topology:{app:'netsim',version:1,devices:[],links:[]}});");
      await wait("!document.querySelector('.exercise-panel')"); await menu(); await clickText(`[data-exercise="${routing}"] button`, 'Fortsetzen');
      assert.equal(await page.evaluate('return ws.controller.getState().activeDraftId;'), id);
      assert.equal(await page.evaluate("return document.querySelectorAll('.exercise-panel [data-result=pass]').length;"), 0);
      assert.deepEqual((await status()).completed, completed);
    });
    await test('exercises: narrow Classic Light layout, Labs, and metadata-write recovery', async () => {
      await page.send('Emulation.setDeviceMetricsOverride', { width: 700, height: 960, deviceScaleFactor: 1, mobile: false });
      await page.evaluate("theme.getState().setTheme('classic-light');"); await delay(100); await menu();
      assert(await page.evaluate('return document.documentElement.scrollWidth<=innerWidth+1;')); await shot('05-classic-light-700.png', 'classic-light', 700);
      await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape' });
      await clickText('.toolbar-menu-trigger', 'Menü ▾'); await clickText('.toolbar-menu-action', 'Labs');
      assert(await page.evaluate("return document.querySelector('#toolbar-labs-menu').textContent.includes('Lab');"));
      await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape' });
      // Inject failure only in this disposable repository. Preserve the draft and retry its association.
      await page.evaluate("window.originalSetMeta=ws.repository.setMeta.bind(ws.repository);ws.repository.setMeta=async()=>({ok:false,error:{code:'quota-exceeded',message:'test'}});");
      await menu(); await clickText(`[data-exercise="${portal}"] button`, 'Erneut starten');
      await wait("document.querySelector('.exercise-error')?.textContent.includes('quota-exceeded')");
      await page.evaluate('ws.repository.setMeta=originalSetMeta;'); await clickText('.exercise-error button', 'Erneut versuchen');
      await wait(`document.querySelector('.exercise-panel[data-exercise="${portal}"]')`);
      assert.deepEqual((await status()).completed, completed);
    });
  } finally {
    try { await page.evaluate('window.ws?.dispose();'); } catch {}
    await page.evaluate(`await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase(${JSON.stringify(database)});r.onsuccess=resolve;r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Exercise cleanup blocked'));});`);
    Object.assign(report.results, results); await writeFile(path.join(directory, 'results.json'), JSON.stringify({ results, screenshots }, null, 2));
    if (Object.keys(results).length >= 6 && Object.values(results).every(r => r.passed)) {
      const captures = screenshots.map(s => ({ source: path.relative(root, path.join(directory, s.name)).split(path.sep).join('/'), scene: s.name.slice(3, -4), variant: s.theme, state: 'normal', width: s.width, height: s.height }));
      const manifest = path.join(directory, 'manifest.json');
      await writeFile(manifest, JSON.stringify({ id: 'exercises-beta', title: 'Übungen (Beta)', variants: [{ id: 'graphite-dark', label: 'Graphite Dark' }, { id: 'classic-light', label: 'Classic Light' }], states: ['normal'], captures, share: captures.filter((_, i) => [1, 3, 4].includes(i)).map(s => ({ ...s, name: s.scene })), shareContactSheet: false }, null, 2));
      report.exerciseReview = await generateReview(manifest);
    }
  }
}
