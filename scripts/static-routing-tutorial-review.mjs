import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { generateReview } from './visual-review.mjs';

export async function runStaticRoutingReview({ page, url, root, report }) {
  const database = 'netlab-idb-test-' + crypto.randomUUID(), directory = path.join(root, '.playwright-mcp/reviews/raw/static-routing-staging');
  await mkdir(directory, { recursive: true });
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const wait = async condition => { for (let i = 0; i < 300; i++) { if (await page.evaluate(`return !!(${condition});`)) return; await delay(40); } throw Error('Static routing: ' + condition); };
  const click = async (selector, text) => {
    const point = await page.evaluate(`const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.getClientRects().length&&(${text ? `e.textContent.trim()===${JSON.stringify(text)}` : 'true'}));if(!e)throw Error('Missing '+${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};`);
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, ...point, ...(type === 'mouseMoved' ? {} : { button: 'left', clickCount: 1 }) });
    await delay(100);
  };
  const mount = async (reload = false) => {
    await page.send(reload ? 'Page.reload' : 'Page.navigate', reload ? { ignoreCache: true } : { url }); await wait("document.readyState==='complete'&&document.getElementById('root')");
    await page.evaluate(`window.store=(await import('/src/store.ts')).useStore;window.sim=(await import('/src/sim.ts')).sim;window.lang=(await import('/src/i18n/index.ts')).useLanguage;window.theme=(await import('/src/uiTheme.ts')).useUiTheme;window.chapter=await import('/src/tutorials/staticRoutingChapter.ts');window.records=[];window.releaseObserver=(await import('/src/terminalCommandEvents.ts')).observeTerminalCommands(e=>records.push({type:e.type,deviceId:e.command.deviceId,line:e.command.line,source:e.command.source,text:e.text}));lang.getState().setLanguage('de');window.ws=await(await import('/src/workspace/reviewEntry.tsx')).mountWorkspaceReview(document.getElementById('root'),{databaseName:${JSON.stringify(database)}});`);
    await wait("document.querySelector('.react-flow')"); await delay(200);
  };
  const menu = async () => { if (await page.evaluate('return innerWidth<1100;')) await click('.toolbar-menu-trigger', 'Menü'); await click('.toolbar-menu-trigger,.toolbar-menu-action', 'Übungen (Beta)'); await click('[data-guided-menu-toggle]'); await wait("document.querySelector('[data-static-direct]:not(:disabled)')"); };
  const saved = async () => { await wait("document.querySelector('[data-static-saving=false]')"); await page.evaluate('await ws.controller.flush();'); };
  const receipt = () => page.evaluate("const id=ws.controller.getState().activeDraftId;return {id,document:store.getState().captureWorkspaceDocument(),progress:(await ws.repository.getMeta('guided:static-routing:v1:draft:'+id)).value?.value,tabs:ws.controller.getState().drafts.length};");
  const step = n => wait(`document.querySelector('[data-static-step="${n}"]')`);
  const next = async n => { await wait("document.querySelector('[data-static-next]:not(:disabled)')"); await click('[data-static-next]'); await step(n); await saved(); };
  const passed = () => wait("document.querySelector('[data-static-passed=true]')");
  const command = async (id, line, advance = false) => {
    await page.evaluate(`store.getState().terminals.filter(key=>key!==${JSON.stringify(id)}).forEach(key=>store.getState().closeTerminal(key));store.getState().openTerminal(${JSON.stringify(id)});window.commandStart=records.length;`);
    await wait("document.querySelector('.xterm-helper-textarea')"); await delay(80); await page.evaluate("document.querySelector('.xterm-helper-textarea').focus();"); await page.send('Input.insertText', { text: line });
    for (const type of ['keyDown', 'keyUp']) await page.send('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, ...(type === 'keyDown' ? { text: '\r', unmodifiedText: '\r' } : {}) });
    if (advance) await page.evaluate('store.getState().setPaused(true);sim.net.scheduler.advanceTo(sim.net.now+6000);');
    await delay(150); return page.evaluate("return records.slice(commandStart).filter(e=>e.type==='output').map(e=>e.text).join('');");
  };
  const configure = async (id, name, address, gateway = null) => { await page.evaluate(`const ip=await import('/src/engine/ip.ts'),e=store.getState().setInterfaceIpv4(${JSON.stringify(id)},${JSON.stringify(name)},{mode:'static',ip:ip.parseCidr(${JSON.stringify(address)}),gateway:${gateway ? `ip.parseIp(${JSON.stringify(gateway)})` : 'null'},dns:null});if(e)throw Error(e);`); await delay(150); };
  const screenshot = async (name, state, width = 1440, variant = 'graphite-dark') => {
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 100, y: 20 }); await delay(350);
    const png = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); await writeFile(path.join(directory, name + '.png'), Buffer.from(png.data, 'base64'));
    return { source: path.relative(root, path.join(directory, name + '.png')).split(path.sep).join('/'), scene: name, state, width, height: 1000, variant };
  };
  const reloadAt = async n => { await saved(); const before = await receipt(); await mount(true); await step(n); await saved(); assert.deepEqual(await receipt(), before); };
  const test = async (name, work) => { try { await work(); report.results['static routing: ' + name] = { passed: true }; } catch (e) { report.results['static routing: ' + name] = { passed: false, error: e.stack, visible: await page.evaluate('return document.querySelector(".exercise-panel")?.textContent;') }; throw e; } };
  const A = 'tutorial-04-a', B = 'tutorial-04-b', C = 'tutorial-04-c', R1 = 'tutorial-04-r1', R2 = 'tutorial-04-r2', R3 = 'tutorial-04-r3';
  let personal, original, attempt, initial, expanded, completed, mobile;
  try {
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }); await mount();
    await page.evaluate("theme.getState().setTheme('graphite-dark');store.getState().addDeviceAt('host',{x:300,y:200});await ws.controller.flush();"); personal = await receipt();
    await test('direct start isolates the personal plan and prepares only the seven initial devices', async () => {
      await menu(); await click('[data-static-direct]'); await step(1); await saved(); attempt = (await receipt()).id; assert.notEqual(attempt, personal.id);
      assert.equal(await page.evaluate('return sim.net.devices.size;'), 7); assert.equal(await page.evaluate('return chapter.staticRoutingConditions(sim.net).base;'), true);
      await page.evaluate("store.getState().setTerminalDockCollapsed(true);store.getState().select(null);"); await delay(160); initial = await screenshot('01-initial-topology', 'initial');
    });
    await test('a native terminal ping identifies the first missing route; the router choice uses the real tables', async () => {
      const out = await command(A, 'ping -c 1 192.168.20.20', true); assert.match(out, /From 192\.168\.10\.1.*Destination Net Unreachable/); await passed(); await next(2);
      assert(await page.evaluate("return records.some(e=>e.type==='started'&&e.source==='keyboard'&&e.deviceId==='tutorial-04-a');"));
      await page.evaluate("document.querySelector('[data-static-missing]').value='r3';document.querySelector('[data-static-missing]').dispatchEvent(new Event('change',{bubbles:true}));"); await delay(80); assert(await page.evaluate("return !document.querySelector('[data-static-passed=true]');"));
      await command(R1, 'ip route'); await page.evaluate("document.querySelector('[data-static-missing]').value='r1';document.querySelector('[data-static-missing]').dispatchEvent(new Event('change',{bubbles:true}));"); await passed(); await next(3); await reloadAt(3);
    });
    await test('forward-only routes fail ping; the return routes enable real Echo Replies in both directions', async () => {
      await command(R1, 'ip route add 192.168.20.0/24 via 10.0.12.2'); await command(R2, 'ip route replace 192.168.20.0/24 via 10.0.23.2'); await passed();
      assert.doesNotMatch(await command(A, 'ping -c 1 192.168.20.20', true), /64 bytes from/); await next(4);
      await command(R3, 'ip route add 192.168.10.0/24 via 10.0.23.1'); await command(R2, 'ip route add 192.168.10.0/24 via 10.0.12.1'); await passed(); await next(5);
      assert.match(await command(A, 'ping 192.168.20.20 -c 1', true), /64 bytes from 192.168.20.20/); assert(await page.evaluate("return !document.querySelector('[data-static-passed=true]');"));
      assert.match(await command(B, 'ping -c 1 192.168.10.10', true), /64 bytes from 192.168.10.10/); await passed(); await saved();
      await page.evaluate("store.getState().setTerminalDockCollapsed(true);const n=store.getState().nodes.find(n=>n.id==='tutorial-04-r2');store.getState().onNodesChange([{type:'position',id:n.id,position:{x:n.position.x+25,y:n.position.y}}]);");
      original = (await receipt()).document.topology; await reloadAt(5);
    });
    await test('scenario 2 adds only LAN C, preserves routes and positions, and does not duplicate after Back/F5', async () => {
      await next(6); const after = (await receipt()).document.topology;
      assert.deepEqual(after.devices.filter(d => original.devices.some(old => old.id === d.id)), original.devices); assert.equal(after.devices.length, 9); assert.equal(after.links.length, 8);
      assert.deepEqual(after.links.filter(l => original.links.some(old => old.id === l.id)), original.links);
      await click('.exercise-panel footer button', 'Zurück'); await step(5); await next(6); assert.equal(await page.evaluate('return sim.net.devices.size;'), 9); await reloadAt(6);
      await configure(R2, 'eth2', '192.168.30.254/24'); await configure(C, 'eth0', '192.168.30.50/24', '192.168.30.254'); await passed(); await next(7);
      await command(R1, 'ip route add 192.168.30.0/24 via 10.0.12.2'); await command(R3, 'ip route replace 192.168.30.0/24 via 10.0.23.1'); await passed();
      await page.evaluate('store.getState().setTerminalDockCollapsed(true);'); await click('.react-flow__controls-fitview'); await delay(200);
      await click('[data-exercise=guided-static-routing] header > button[aria-expanded]'); expanded = await screenshot('02-expanded-topology', 'expanded'); await click('[data-exercise=guided-static-routing] header > button[aria-expanded]'); await next(8);
    });
    await test('six native pings complete all eight tasks; languages, resume, F5 and Explore preserve evidence', async () => {
      for (const [from, to] of [[A, '192.168.20.20'], [B, '192.168.10.10'], [A, '192.168.30.50'], [C, '192.168.10.10'], [B, '192.168.30.50'], [C, '192.168.20.20']]) assert.match(await command(from, `ping -c 1 ${to}`, true), /64 bytes from/);
      await passed(); await wait("document.querySelector('[data-exercise=guided-static-routing] [data-chapter-completed=true]')"); await saved();
      for (const [language, title] of [['en', 'Chapter 4'], ['pt-BR', 'Capítulo 4'], ['de', 'Kapitel 4']]) { await page.evaluate(`lang.getState().setLanguage(${JSON.stringify(language)});`); await delay(100); assert(await page.evaluate(`return document.querySelector('.exercise-heading').textContent.includes(${JSON.stringify(title)});`)); }
      await page.evaluate('store.getState().setTerminalDockCollapsed(true);'); await delay(100); completed = await screenshot('03-chapter-completed', 'completed'); const done = await receipt();
      await click('[data-explore-network]'); await wait("!document.querySelector('[data-static-step]')"); assert.deepEqual(await receipt(), done); await menu(); await wait("document.querySelector('[data-chapter-progress=static-routing] [data-chapter-completed=true]')"); await click('[data-static-resume]'); await step(8); assert.deepEqual(await receipt(), done); await reloadAt(8);
      await page.evaluate(`await ws.controller.switchDraft(${JSON.stringify(personal.id)});`); await wait("!document.querySelector('[data-static-step]')"); assert.deepEqual((await receipt()).document, personal.document); await menu(); await click('[data-static-resume]'); await step(8); await passed(); assert.equal((await receipt()).id, attempt);
      await page.send('Emulation.setDeviceMetricsOverride', { width: 700, height: 1000, deviceScaleFactor: 1, mobile: false }); await page.evaluate("theme.getState().setTheme('classic-light');store.getState().setTerminalDockCollapsed(true);"); await delay(180); assert(await page.evaluate('return document.documentElement.scrollWidth<=innerWidth+1;')); mobile = await screenshot('04-completed-light-mobile', 'completed', 700, 'classic-light');
    });
    await test('checkpoint restart and undo/redo atomically restore the chapter without touching the personal plan', async () => {
      await page.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }); await page.evaluate("theme.getState().setTheme('graphite-dark');"); await delay(120);
      const done = await receipt(); await click('[data-chapter-restart=static-routing]'); await wait("document.querySelector('[data-chapter-restart-confirm]:not(:disabled)')"); await click('[data-chapter-restart-confirm]'); await step(1); await saved();
      assert.equal(await page.evaluate('return sim.net.devices.size;'), 7); assert.deepEqual((await receipt()).progress.completed, []); assert.equal((await receipt()).id, attempt);
      await page.evaluate('store.getState().undoTopology();'); await step(8); await saved(); assert.deepEqual(await receipt(), done);
      await page.evaluate('store.getState().redoTopology();'); await step(1); await saved(); assert.equal(await page.evaluate('return sim.net.devices.size;'), 7); await reloadAt(1);
      await menu(); await click('[data-static-direct]'); await step(1); await saved(); assert.notEqual((await receipt()).id, attempt); assert.equal((await receipt()).tabs, done.tabs + 1);
    });
    const captures = [initial, expanded, completed, mobile], manifest = path.join(directory, 'manifest.json');
    await writeFile(manifest, JSON.stringify({ id: 'chapter-4-static-routing', title: 'Chapter 4 · Static routing', variants: [{ id: 'graphite-dark', label: 'Graphite Dark' }, { id: 'classic-light', label: 'Classic Light' }], states: ['initial', 'expanded', 'completed'], captures, share: captures.slice(0, 3).map(c => ({ ...c, name: c.scene.replace(/^\d+-/, '') })), shareContactSheet: false }));
    report.staticRoutingReview = await generateReview(manifest);
  } finally {
    await page.evaluate('window.releaseObserver?.();window.ws?.dispose();'); await page.evaluate(`await new Promise((resolve,reject)=>{const request=indexedDB.deleteDatabase(${JSON.stringify(database)});request.onsuccess=resolve;request.onerror=()=>reject(request.error);request.onblocked=()=>reject(Error('Static chapter cleanup blocked'));});`);
  }
}
