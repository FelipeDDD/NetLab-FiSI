import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { generateReview } from './visual-review.mjs';

export async function runAlternativePathsReview({ page, url, root, report }) {
  const database = 'netlab-idb-test-' + crypto.randomUUID(), directory = path.join(root, '.playwright-mcp/reviews/raw/alternative-paths-staging');
  await mkdir(directory, { recursive: true });
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const wait = async condition => { for (let i = 0; i < 300; i++) { if (await page.evaluate(`return !!(${condition});`)) return; await delay(40); } throw Error('Alternative paths: ' + condition); };
  const click = async (selector, text) => {
    const p = await page.evaluate(`const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.getClientRects().length&&(${text ? `e.textContent.trim()===${JSON.stringify(text)}` : 'true'}));if(!e)throw Error('Missing '+${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};`);
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, ...p, ...(type === 'mouseMoved' ? {} : { button: 'left', clickCount: 1 }) }); await delay(100);
  };
  const mount = async (reload = false) => {
    await page.send(reload ? 'Page.reload' : 'Page.navigate', reload ? { ignoreCache: true } : { url }); await wait("document.readyState==='complete'&&document.getElementById('root')");
    await page.evaluate(`window.store=(await import('/src/store.ts')).useStore;window.sim=(await import('/src/sim.ts')).sim;window.lang=(await import('/src/i18n/index.ts')).useLanguage;window.theme=(await import('/src/uiTheme.ts')).useUiTheme;window.chapter=await import('/src/tutorials/alternativePathsChapter.ts');window.records=[];window.releaseObserver=(await import('/src/terminalCommandEvents.ts')).observeTerminalCommands(e=>records.push({type:e.type,deviceId:e.command.deviceId,line:e.command.line,source:e.command.source,text:e.text}));lang.getState().setLanguage('de');window.ws=await(await import('/src/workspace/reviewEntry.tsx')).mountWorkspaceReview(document.getElementById('root'),{databaseName:${JSON.stringify(database)}});`);
    await wait("document.querySelector('.react-flow')"); await delay(200);
  };
  const menu = async () => { if (await page.evaluate('return innerWidth<1100;')) await click('.toolbar-menu-trigger', 'Menü'); await click('.toolbar-menu-trigger,.toolbar-menu-action', 'Übungen (Beta)'); await click('[data-guided-menu-toggle]'); await wait("document.querySelector('[data-alternative-direct]:not(:disabled)')"); };
  const saved = async () => { await wait("document.querySelector('[data-alternative-saving=false]')"); await page.evaluate('await ws.controller.flush();'); };
  const receipt = () => page.evaluate("const id=ws.controller.getState().activeDraftId;return {id,document:store.getState().captureWorkspaceDocument(),progress:(await ws.repository.getMeta('guided:alternative-paths:v1:draft:'+id)).value?.value,tabs:ws.controller.getState().drafts.length};");
  const step = n => wait(`document.querySelector('[data-alternative-step="${n}"]')`), passed = () => wait("document.querySelector('[data-alternative-passed=true]')");
  const next = async n => { await wait("document.querySelector('[data-alternative-next]:not(:disabled)')"); await click('[data-alternative-next]'); await step(n); await saved(); };
  const answer = async (kind, value) => { await page.evaluate(`const input=document.querySelector('[data-alternative-answer=${kind}]');input.value=${JSON.stringify(value)};input.dispatchEvent(new Event('change',{bubbles:true}));`); await delay(120); };
  const command = async (id, line, advance = false) => {
    await page.evaluate(`store.getState().terminals.filter(key=>key!==${JSON.stringify(id)}).forEach(key=>store.getState().closeTerminal(key));store.getState().openTerminal(${JSON.stringify(id)});window.commandStart=records.length;`);
    await wait("document.querySelector('.xterm-helper-textarea')"); await delay(80); await page.evaluate("document.querySelector('.xterm-helper-textarea').focus();"); await page.send('Input.insertText', { text: line });
    for (const type of ['keyDown', 'keyUp']) await page.send('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, ...(type === 'keyDown' ? { text: '\r', unmodifiedText: '\r' } : {}) });
    await wait(`records.slice(commandStart).some(e=>e.type==='started'&&e.deviceId===${JSON.stringify(id)}&&e.line===${JSON.stringify(line)})`);
    if (advance) {
      await wait(`records.slice(commandStart).some(e=>e.type==='output'&&e.deviceId===${JSON.stringify(id)}&&e.line===${JSON.stringify(line)})`);
      await page.evaluate('store.getState().setPaused(true);sim.net.scheduler.advanceTo(sim.net.now+6000);');
      await wait(`records.slice(commandStart).some(e=>e.type==='finished'&&e.deviceId===${JSON.stringify(id)}&&e.line===${JSON.stringify(line)})`);
    }
    await delay(160); return page.evaluate("return records.slice(commandStart).filter(e=>e.type==='output').map(e=>e.text).join('');");
  };
  const configureGateway = async (id, gateway) => { await page.evaluate(`const ip=await import('/src/engine/ip.ts'),device=sim.net.devices.get(${JSON.stringify(id)}),iface=device.getInterface('eth0'),error=store.getState().setInterfaceIpv4(device.id,iface.name,{...iface.ipv4,gateway:ip.parseIp(${JSON.stringify(gateway)})});if(error)throw Error(error);`); await delay(140); };
  const shot = async (name, state, width = 1440, variant = 'graphite-dark') => {
    if (await page.evaluate("return !!document.querySelector('.ping-animation-close');")) await click('.ping-animation-close');
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 100, y: 20 }); await delay(320);
    const png = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); await writeFile(path.join(directory, name + '.png'), Buffer.from(png.data, 'base64'));
    return { source: path.relative(root, path.join(directory, name + '.png')).split(path.sep).join('/'), scene: name, state, width, height: 1000, variant };
  };
  const reloadAt = async n => { await saved(); const before = await receipt(); await mount(true); await step(n); await saved(); assert.deepEqual(await receipt(), before); };
  const test = async (name, work) => { try { await work(); report.results['alternative paths: ' + name] = { passed: true }; } catch (e) { report.results['alternative paths: ' + name] = { passed: false, error: e.stack, visible: await page.evaluate('return document.querySelector(".exercise-panel")?.textContent;') }; throw e; } };
  const I = { r1: 'tutorial-05-r1', r2: 'tutorial-05-r2', r3: 'tutorial-05-r3', a: 'tutorial-05-a', b: 'tutorial-05-b' };
  let personal, original, attempt, initial, via, failure, final, details, mobile, finalPanel;
  try {
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }); await mount();
    await page.evaluate("theme.getState().setTheme('graphite-dark');store.getState().addDeviceAt('host',{x:300,y:200});store.getState().openTerminal(store.getState().nodes.find(n=>sim.net.devices.get(n.id).kind==='host').id);store.getState().setTerminalLayoutMode('by-type');store.getState().setTerminalDockCollapsed(true);await ws.controller.flush();"); personal = await receipt();
    await test('independent triangle starts with only three routers, empty IPv4 and inherited terminal preferences', async () => {
      await menu(); await click('[data-alternative-direct]'); await step(1); await saved(); attempt = (await receipt()).id; assert.notEqual(attempt, personal.id);
      assert(await page.evaluate("return sim.net.devices.size===3&&sim.net.links.size===3&&[...sim.net.devices.values()].every(d=>d.kind==='router'&&d.interfaces.every(i=>!i.ip))&&store.getState().terminalDockCollapsed&&store.getState().terminalLayoutMode==='by-type';"));
      initial = await shot('01-initial-triangle', 'initial');
    });
    await test('six native address commands and directly connected pings establish transit reachability without static routing', async () => {
      for (const [id, iface, address] of [[I.r1, 'eth0', '10.0.12.1/30'], [I.r2, 'eth0', '10.0.12.2/30'], [I.r2, 'eth1', '10.0.23.1/30'], [I.r3, 'eth0', '10.0.23.2/30'], [I.r1, 'eth1', '10.0.13.1/30'], [I.r3, 'eth1', '10.0.13.2/30']]) assert.equal(await command(id, `ip address add ${address} dev ${iface}`), '');
      await passed(); await next(2); const pairs = await page.evaluate('return chapter.NEIGHBOR_TESTS;');
      for (const test of pairs.slice(0, 3)) assert.match(await command(test.from, `ping -c 1 ${test.target}`, true), /64 bytes from/); await reloadAt(2);
      for (const test of pairs.slice(3)) assert.match(await command(test.from, `ping ${test.target} -c 1`, true), /64 bytes from/); await passed();
      assert(await page.evaluate('return [...sim.net.devices.values()].every(d=>d.staticRoutes.length===0);')); await next(3);
      assert.match(await command(I.r1, 'ip route'), /10\.0\.12\.0\/30.*proto kernel/);
      assert.match(await command(I.r1, 'ping -c 1 10.0.23.2', true), /Network is unreachable/);
      await answer('remote', '12'); assert(await page.evaluate("return !document.querySelector('[data-alternative-passed=true]');")); await answer('remote', '23'); await passed(); original = (await receipt()).document.topology;
    });
    await test('the PC transition adds two direct links once and preserves all router identities, positions and configuration', async () => {
      await next(4); const now = (await receipt()).document.topology;
      assert.equal(now.devices.length, 5); assert.equal(now.links.length, 5); assert.deepEqual(now.devices.filter(d => original.devices.some(old => old.id === d.id)), original.devices);
      await click('.exercise-panel footer button', 'Zurück'); await step(3); await next(4); await reloadAt(4); assert.equal(await page.evaluate('return sim.net.devices.size;'), 5);
      for (const [id, iface, address] of [[I.r1, 'eth2', '192.168.10.1/24'], [I.r3, 'eth2', '192.168.20.1/24'], [I.a, 'eth0', '192.168.10.10/24'], [I.b, 'eth0', '192.168.20.20/24']]) assert.equal(await command(id, `ip address add ${address} dev ${iface}`), '');
      await configureGateway(I.a, '192.168.10.1'); await configureGateway(I.b, '192.168.20.1'); await passed(); await next(5);
    });
    await test('real request/reply paths through R2 and a matching /24 over /16 validate routing and next-hop understanding', async () => {
      for (const [id, network, hop] of [[I.r1, '192.168.20.0/24', '10.0.12.2'], [I.r2, '192.168.20.0/24', '10.0.23.2'], [I.r3, '192.168.10.0/24', '10.0.23.1'], [I.r2, '192.168.10.0/24', '10.0.12.1'], [I.r1, '192.168.0.0/16', '10.0.13.2']]) assert.equal(await command(id, `ip route replace ${network} via ${hop}`), '');
      assert.match(await command(I.a, 'ping -c 1 192.168.20.20', true), /64 bytes from/); assert.match(await command(I.b, 'ping -c 1 192.168.10.10', true), /64 bytes from/); await passed(); await saved();
      await page.evaluate('store.getState().setTerminalDockCollapsed(true);'); await click('.react-flow__controls-fitview'); await delay(180); await click('[data-exercise=guided-alternative-paths] header > button[aria-expanded]'); via = await shot('02-pcs-via-r2', 'via'); await click('[data-exercise=guided-alternative-paths] header > button[aria-expanded]'); await next(6);
      assert(await page.evaluate("return document.querySelector('[data-alternative-selected-route=true]').textContent.includes('192.168.20.0/24')&&document.querySelector('[data-alternative-selected-route=true]').textContent.includes('10.0.12.2');"));
      await answer('hop', 'r3'); assert(await page.evaluate("return !document.querySelector('[data-alternative-passed=true]');")); await answer('hop', 'r2'); await answer('lpm', 'specific'); await passed(); details = await shot('05-live-route-and-lpm', 'explanation'); await next(7);
    });
    await test('an existing interface DOWN command causes a witnessed failure without automatic failover; F5 preserves it', async () => {
      assert.equal(await command(I.r2, 'ip link set eth1 down'), '');
      const failed = await command(I.a, 'ping -c 1 192.168.20.20', true); assert.doesNotMatch(failed, /64 bytes from/); await passed(); await saved();
      assert(await page.evaluate("return !chapter.alternativeConditions(sim.net).direct&&sim.net.devices.get('tutorial-05-r1').lookupRoute((await import('/src/engine/ip.ts')).parseIp('192.168.20.20')).via===(await import('/src/engine/ip.ts')).parseIp('10.0.12.2');"));
      await click('[data-exercise=guided-alternative-paths] header > button[aria-expanded]'); await click('.react-flow__controls-fitview'); await delay(180); failure = await shot('03-interrupted-path', 'failure');
      await page.evaluate('store.getState().setTerminalDockCollapsed(true);'); await click('[data-exercise=guided-alternative-paths] header > button[aria-expanded]'); await reloadAt(7); await passed(); await next(8);
    });
    await test('manual direct and return routes require fresh bidirectional replies on R1–R3 before completion', async () => {
      assert.equal(await command(I.r1, 'ip route replace 192.168.20.0/24 via 10.0.13.2'), ''); assert.doesNotMatch(await command(I.a, 'ping -c 1 192.168.20.20', true), /64 bytes from/);
      assert.equal(await command(I.r3, 'ip route replace 192.168.10.0/24 via 10.0.13.1'), ''); assert.match(await command(I.a, 'ping -c 1 192.168.20.20', true), /64 bytes from/); assert(await page.evaluate("return !document.querySelector('[data-alternative-passed=true]');"));
      assert.match(await command(I.b, 'ping -c 1 192.168.10.10', true), /64 bytes from/); await passed(); await wait("document.querySelector('[data-exercise=guided-alternative-paths] [data-chapter-completed=true]')"); await saved();
      await page.evaluate('store.getState().setTerminalDockCollapsed(true);'); finalPanel = await shot('07-finished-panel', 'completed'); await click('[data-exercise=guided-alternative-paths] header > button[aria-expanded]'); await click('.react-flow__controls-fitview'); await delay(180); final = await shot('04-direct-path-completed', 'completed'); await click('[data-exercise=guided-alternative-paths] header > button[aria-expanded]'); const before = await receipt();
      await click('[data-explore-network]'); await wait("!document.querySelector('[data-alternative-step]')"); assert.deepEqual(await receipt(), before); await menu(); await wait("document.querySelector('[data-chapter-progress=alternative-paths] [data-chapter-completed=true]')"); await click('[data-alternative-resume]'); await step(8); await reloadAt(8); await passed();
      for (const [language, title] of [['en', 'Chapter 5'], ['pt-BR', 'Capítulo 5'], ['de', 'Kapitel 5']]) { await page.evaluate(`lang.getState().setLanguage(${JSON.stringify(language)});`); await delay(120); assert(await page.evaluate(`return document.querySelector('.exercise-heading').textContent.includes(${JSON.stringify(title)});`)); }
      const intact = await receipt();
      const themes = await page.evaluate("return Object.keys((await import('/src/uiTheme.ts')).UI_THEMES);");
      for (const name of themes) {
        await page.evaluate(`theme.getState().setTheme(${JSON.stringify(name)});`); await delay(120);
        assert(await page.evaluate(`const panel=document.querySelector('[data-exercise=guided-alternative-paths]'),box=panel.getBoundingClientRect(),style=getComputedStyle(panel);return document.documentElement.dataset.uiTheme===${JSON.stringify(name)}&&box.left>=0&&box.right<=innerWidth+1&&style.color!==style.backgroundColor;`));
        assert.deepEqual(await receipt(), intact);
      }
      report.alternativePathsThemes = themes;
      await page.evaluate(`await ws.controller.switchDraft(${JSON.stringify(personal.id)});`); await wait("!document.querySelector('[data-alternative-step]')"); assert.deepEqual((await receipt()).document, personal.document); await menu(); await click('[data-alternative-resume]'); await step(8); await passed(); assert.equal((await receipt()).id, attempt);
      await page.send('Emulation.setDeviceMetricsOverride', { width: 700, height: 1000, deviceScaleFactor: 1, mobile: false }); await page.evaluate("theme.getState().setTheme('classic-light');store.getState().setTerminalDockCollapsed(true);"); await delay(180); assert(await page.evaluate('return document.documentElement.scrollWidth<=innerWidth+1;')); mobile = await shot('06-classic-light-mobile', 'completed', 700, 'classic-light');
    });
    await test('checkpoint restart, undo/redo and new attempts remain independent and preserve the personal project', async () => {
      await page.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }); await page.evaluate("theme.getState().setTheme('graphite-dark');"); await delay(180);
      const before = await receipt(); await click('[data-chapter-restart=alternative-paths]'); await wait("document.querySelector('[data-chapter-restart-confirm]:not(:disabled)')"); await click('[data-chapter-restart-confirm]'); await step(1); await saved();
      assert(await page.evaluate('return sim.net.devices.size===3&&sim.net.links.size===3&&[...sim.net.devices.values()].every(d=>d.interfaces.every(i=>!i.ip)&&d.staticRoutes.length===0);')); assert.deepEqual((await receipt()).progress.completed, []);
      await page.evaluate('store.getState().undoTopology();'); await step(8); await saved(); assert.deepEqual(await receipt(), before); await page.evaluate('store.getState().redoTopology();'); await step(1); await saved(); await reloadAt(1);
      await menu(); await click('[data-alternative-direct]'); await step(1); await saved(); assert.notEqual((await receipt()).id, attempt); assert.equal((await receipt()).tabs, before.tabs + 1);
    });
    const captures = [initial, via, failure, final, details, mobile, finalPanel], manifest = path.join(directory, 'manifest.json');
    await writeFile(manifest, JSON.stringify({ id: 'chapter-5-alternative-paths', title: 'Chapter 5 · Alternative paths', variants: [{ id: 'graphite-dark', label: 'Graphite Dark' }, { id: 'classic-light', label: 'Classic Light' }], states: ['initial', 'via', 'failure', 'completed', 'explanation'], captures, share: captures.slice(0, 4).map(c => ({ ...c, name: c.scene.replace(/^\d+-/, '') })), shareContactSheet: false }));
    report.alternativePathsReview = await generateReview(manifest);
  } finally {
    await page.evaluate('window.releaseObserver?.();window.ws?.dispose();'); await page.evaluate(`await new Promise((resolve,reject)=>{const request=indexedDB.deleteDatabase(${JSON.stringify(database)});request.onsuccess=resolve;request.onerror=()=>reject(request.error);request.onblocked=()=>reject(Error('Alternative chapter cleanup blocked'));});`);
  }
}
