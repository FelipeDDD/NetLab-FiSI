import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const device = (id, kind, x, y, ips) => ({ id, kind, name: id, x, y, forwarding: kind === 'router' || kind === 'firewall',
  ifaces: ips.map((ip, index) => ({ name: 'eth' + index, ip, up: true })), routes: [] });
const topology = { app: 'netsim', version: 1, devices: [
  device('pc1', 'host', 80, 80, ['10.0.0.10/24']), device('pc2', 'host', 80, 390, ['10.0.0.20/24']),
  device('sw1', 'switch', 420, 230, Array(8).fill(null)), device('r1', 'router', 740, 90, ['10.0.0.1/24', '10.0.1.1/24', '10.0.2.254/24', null]),
  device('fw1', 'firewall', 750, 390, ['10.0.0.254/24', '10.0.2.1/24', null, null]), device('ap1', 'ap', 450, 540, Array(8).fill(null)),
  device('srv1', 'server', 1050, 90, ['10.0.1.20/24']),
], links: [
  { id: 'pc1-switch', a: ['pc1', 'eth0'], b: ['sw1', 'eth0'] }, { id: 'pc2-switch', a: ['pc2', 'eth0'], b: ['sw1', 'eth1'] },
  { id: 'switch-router', a: ['sw1', 'eth2'], b: ['r1', 'eth0'] }, { id: 'switch-firewall', a: ['sw1', 'eth3'], b: ['fw1', 'eth0'] },
  { id: 'router-server', a: ['r1', 'eth1'], b: ['srv1', 'eth0'] }, { id: 'router-firewall', a: ['r1', 'eth2'], b: ['fw1', 'eth1'] },
  { id: 'switch-ap', a: ['sw1', 'eth4'], b: ['ap1', 'eth0'] },
], ui: { cableColors: { 'pc2-switch': { mode: 'manual', color: '#5b9ee8' }, 'switch-firewall': { mode: 'manual', color: '#e76670' }, 'router-server': { mode: 'auto', color: '#2dd4bf' } } } };

export async function runViewportReview({ page, url, root, report, openPage }) {
  const directory = path.join(root, '.playwright-mcp/reviews/raw/viewport-staging'); await mkdir(directory, { recursive: true });
  const database = 'netlab-idb-test-' + crypto.randomUUID(), results = {}, measurements = [], screenshots = [];
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const wait = async expression => { for (let i = 0; i < 150; i++) { try { if (await page.evaluate(`return !!(${expression});`)) return; } catch {} await delay(40); } throw Error('Viewport condition timed out: ' + expression); };
  const test = async (name, work) => { try { await work(); results[name] = { passed: true }; } catch (error) { results[name] = { passed: false, error: error.stack }; throw error; } };
  const key = async (selector, key) => {
    await page.evaluate(`document.querySelector(${JSON.stringify(selector)}).focus();`);
    for (const type of ['keyDown', 'keyUp']) await page.send('Input.dispatchKeyEvent', { type, key });
  };
  const viewport = () => page.evaluate('return window.flow.getViewport();');
  const closeTo = (a, b) => ['x', 'y', 'zoom'].every(k => Math.abs(a[k] - b[k]) < .00001);
  const stable = async (label, work) => {
    const before = await viewport(), positions = await page.evaluate('return store.getState().nodes.map(n=>({id:n.id,position:n.position}));');
    await work(); await delay(140); const after = await viewport();
    measurements.push({ label, before, after }); assert(closeTo(before, after), label + ': ' + JSON.stringify({ before, after }));
    assert.deepEqual(await page.evaluate('return store.getState().nodes.map(n=>({id:n.id,position:n.position}));'), positions, 'Panel action changed node coordinates');
  };
  const setViewport = async zoom => { await page.evaluate(`await flow.setViewport({x:20,y:20,zoom:${zoom}});`); await delay(50); };
  const setSize = async width => { await page.send('Emulation.setDeviceMetricsOverride', { width, height: 960, deviceScaleFactor: 1, mobile: false }); await delay(100); };
  const mount = async (first = false) => {
    await page.send('Page.navigate', { url }); await wait(`location.pathname==='/__workspace_ui_test__'&&document.readyState==='complete'`);
    await page.evaluate(`window.entry=await import('/src/workspace/reviewEntry.tsx');window.store=(await import('/src/store.ts')).useStore;window.sim=(await import('/src/sim.ts')).sim;window.theme=(await import('/src/uiTheme.ts')).useUiTheme;window.probeModule=await import('/src/workspace/viewportProbe.browser.tsx');window.workspace=await entry.mountWorkspaceReview(document.getElementById('root'),{databaseName:${JSON.stringify(database)}});`);
    if (first) await page.evaluate(`const c=workspace.controller;const r=await c.openDocument({schemaVersion:1,topology:${JSON.stringify(topology)}});if(!r.ok)throw Error(JSON.stringify(r));const original=c.getState().drafts.find(d=>d.id!==r.value);if(original)await c.closeDraft(original.id,{expectedEditSequence:original.editSequence,discardChanges:true});const saved=await c.save('Viewport-Test');if(!saved.ok)throw Error(JSON.stringify(saved));`);
    await wait(`document.querySelectorAll('.react-flow__node').length>=7`);
    await page.evaluate('window.flow=probeModule.getViewportProbe();store.getState().setPaused(true);'); await delay(200);
  };
  let zoomPage;
  const zoom = async factor => {
    const changed = await zoomPage.evaluate(`return await new Promise(resolve=>chrome.settingsPrivate.setDefaultZoom(${factor},resolve));`);
    assert(changed, 'Native Chromium zoom could not be set'); await page.send('Page.bringToFront'); await delay(160);
    const actual = await page.evaluate('return devicePixelRatio;'); assert(Math.abs(actual - factor) < .01, 'Browser zoom was not applied');
  };
  const capture = async (filename, extra = {}) => {
    await page.send('Page.bringToFront'); await delay(60);
    const snapshot = await page.evaluate(`const node=document.querySelector('.react-flow__node[data-id="pc1"]'), label=node.querySelector('.dev-label'), ip=node.querySelector('.node-network-label');const edge=document.querySelector('.react-flow__edge[data-id="switch-router"] .react-flow__edge-path');return {viewport:flow.getViewport(),dpr:devicePixelRatio,width:innerWidth,height:innerHeight,label:label.getBoundingClientRect().toJSON(),ip:ip?.getBoundingClientRect().toJSON(),color:edge&&getComputedStyle(edge).stroke,document:[document.documentElement.scrollWidth,document.documentElement.scrollHeight]};`);
    assert(snapshot.document[0] <= snapshot.width + 1); assert(snapshot.document[1] <= snapshot.height + 1);
    const image = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(path.join(directory, filename), Buffer.from(image.data, 'base64')); screenshots.push({ filename, ...extra, ...snapshot }); return snapshot;
  };
  try {
    await setSize(1440); await mount(true);
    zoomPage = await openPage(); await zoomPage.send('Page.navigate', { url: 'chrome://settings/' });
    for (let i = 0; i < 60; i++) { try { if (await zoomPage.evaluate('return !!chrome.settingsPrivate?.setDefaultZoom;')) break; } catch {} await delay(40); }
    await zoom(1);
    await test('viewport: panels preserve exact x/y/zoom at 700/1440 px in both themes and three Flow zoom levels', async () => {
      for (const width of [1440, 700]) for (const theme of ['graphite-dark', 'classic-light']) for (const level of [.75, 1, 1.5]) {
        await setSize(width); await page.evaluate(`window.theme.getState().setTheme(${JSON.stringify(theme)});`); await setViewport(level);
        const tag = width + '/' + theme + '/' + level;
        for (let round = 0; round < 2; round++) {
          await stable(tag + '/inspector open', () => page.evaluate("store.getState().select('fw1');"));
          if (!round) await stable(tag + '/inspector resize', () => key('.inspector-resizer', 'ArrowLeft'));
          await stable(tag + '/inspector switch', () => page.evaluate("store.getState().select('r1');"));
          await stable(tag + '/inspector close', () => page.evaluate('store.getState().select(null);'));
        }
        await stable(tag + '/catalog toggle', () => page.evaluate("document.querySelector('.palette-toggle').click();"));
        await stable(tag + '/catalog restore', () => page.evaluate("document.querySelector('.palette-toggle').click();"));
        await stable(tag + '/terminal open', () => page.evaluate("store.getState().openTerminal('pc1');"));
        await stable(tag + '/terminal resize', () => key('.terminal-resizer', 'ArrowUp'));
        await stable(tag + '/terminal collapse', () => page.evaluate('store.getState().setTerminalDockCollapsed(true);'));
        await stable(tag + '/terminal expand', () => page.evaluate('store.getState().setTerminalDockCollapsed(false);'));
        await stable(tag + '/terminal close', () => page.evaluate("store.getState().closeTerminal('pc1');"));
        await stable(tag + '/window resize', () => setSize(width - 20));
        await stable(tag + '/window restore', () => setSize(width));
      }
    });
    await test('viewport: real browser zoom improves physical text size without changing Flow zoom', async () => {
      for (const width of [1440, 700]) for (const theme of ['graphite-dark', 'classic-light']) {
        await zoom(1); await setSize(width); await page.evaluate(`window.theme.getState().setTheme(${JSON.stringify(theme)});store.getState().select('fw1');`); await setViewport(1);
        const baseline = await capture(`text-${width}-${theme}-100.png`, { theme, browserZoom: 1 });
        for (const factor of [1.25, 1.5]) {
          await stable(width + '/' + theme + '/browser ' + factor, () => zoom(factor));
          const current = await capture(`text-${width}-${theme}-${factor * 100}.png`, { theme, browserZoom: factor });
          assert(current.label.height * current.dpr > baseline.label.height * factor * .95);
          assert(current.ip.height * current.dpr > baseline.ip.height * factor * .95);
        }
      }
      await zoom(1); await setSize(1440); await page.evaluate("theme.getState().setTheme('graphite-dark');store.getState().select(null);"); await setViewport(1);
      await capture('after-inspector-closed.png'); await stable('capture/inspector', () => page.evaluate("store.getState().select('fw1');")); await capture('after-inspector-open.png');
      await zoom(1.5); await capture('after-browser-150.png'); await zoom(1);
    });
    await test('viewport: manual Fit View works and adding/moving nodes never auto-fits', async () => {
      await page.evaluate('store.getState().select(null);'); await setViewport(1);
      const before = await viewport();
      const added = await page.evaluate(`const canvas=document.querySelector('.canvas').getBoundingClientRect();const point={x:canvas.left+180,y:canvas.top+160};const world=flow.screenToFlowPosition(point);const transfer=new DataTransfer();transfer.setData('application/netsim','host');document.querySelector('.react-flow').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,clientX:point.x,clientY:point.y,dataTransfer:transfer}));return {world,id:store.getState().nodes.at(-1).id};`);
      await delay(200); assert(closeTo(before, await viewport()));
      const position = await page.evaluate(`return store.getState().nodes.find(n=>n.id===${JSON.stringify(added.id)}).position;`);
      assert(Math.abs(position.x - (added.world.x - 48)) < .01); assert(Math.abs(position.y - (added.world.y - 39)) < .01);
      await page.evaluate('store.getState().undoTopology();'); await delay(100); assert(closeTo(before, await viewport()));
      const center = await page.evaluate(`const r=document.querySelector('.react-flow__node[data-id="pc1"] .dev-icon').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};`);
      const original = await page.evaluate("return store.getState().nodes.find(n=>n.id==='pc1').position;");
      await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: center.x, y: center.y });
      await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: center.x, y: center.y, button: 'left', clickCount: 1, modifiers: 1 });
      for (let i = 1; i <= 5; i++) await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: center.x + i * 12, y: center.y + i * 4, button: 'left', buttons: 1, modifiers: 1 });
      await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: center.x + 60, y: center.y + 20, button: 'left', clickCount: 1, modifiers: 1 });
      await delay(100); const moved = await page.evaluate("return store.getState().nodes.find(n=>n.id==='pc1').position;");
      assert(Math.abs(moved.x - original.x) > 1); assert(closeTo(before, await viewport()));
      await page.evaluate("document.querySelector('.react-flow__controls-fitview').click();"); await delay(200);
      const fitted = await viewport(); assert(!closeTo(before, fitted));
      await stable('manual fit remains stable on selection', () => page.evaluate("store.getState().select('fw1');"));
    });
    await test('viewport/colors: legacy auto rendering, manual priority, reconnection and Save/Load remain consistent', async () => {
      const color = id => page.evaluate(`const p=document.querySelector('.react-flow__edge[data-id=${JSON.stringify(id)}] .react-flow__edge-path');return p&&getComputedStyle(p).stroke;`);
      assert.equal(await color('switch-router'), 'rgb(167, 139, 250)');
      assert.equal(await page.evaluate("return store.getState().cableColors['switch-router']??null;"), null, 'Rendering must not rewrite legacy appearance');
      assert.equal(await color('switch-firewall'), 'rgb(231, 102, 112)');
      await page.evaluate("store.getState().setCableColor('switch-router','gray');const s=await workspace.controller.save();if(!s.ok)throw Error(JSON.stringify(s));"); await delay(60);
      assert.equal(await color('switch-router'), 'rgb(74, 95, 133)');
      const a = await page.evaluate('return workspace.controller.getState().activeDraftId;');
      await page.evaluate(`window.savedViewportDraft=${JSON.stringify(a)};const d=store.getState().captureWorkspaceDocument();d.topology.devices.forEach(n=>{n.x+=70;n.y+=20});const r=await workspace.controller.openDocument(d);if(!r.ok)throw Error(JSON.stringify(r));`); await delay(200);
      await setViewport(1.5); await page.evaluate(`const r=await workspace.controller.switchDraft(${JSON.stringify(a)});if(!r.ok)throw Error(JSON.stringify(r));`); await delay(200);
      assert(!closeTo({ x: 20, y: 20, zoom: 1.5 }, await viewport()), 'New activation must retain its one initial fit');
      assert.equal(await color('switch-router'), 'rgb(74, 95, 133)');
      await setViewport(.75); await stable('restored plan selection', () => page.evaluate("store.getState().select('fw1');"));
      await page.evaluate("store.getState().resetCableColor('switch-router');const s=await workspace.controller.save();if(!s.ok)throw Error(JSON.stringify(s));"); await delay(70);
      const auto = await color('switch-router'); assert.equal(auto, 'rgb(167, 139, 250)');
      await page.evaluate("store.getState().beginCableReconnect('switch-router','b');store.getState().reconnectCable('r1');");
      assert.equal(await color('switch-router'), auto);
      const realm = await page.evaluate('return performance.timeOrigin;'); await page.send('Page.reload'); await wait(`performance.timeOrigin!==${realm}&&document.readyState==='complete'`); await mount();
      assert.equal(await page.evaluate('return workspace.controller.getState().activeDraftId;'), a);
      assert.equal(await color('switch-router'), auto); assert.equal(await color('switch-firewall'), 'rgb(231, 102, 112)');
      await setViewport(1); await stable('F5 session selection', () => page.evaluate("store.getState().select('fw1');"));
    });
    await test('viewport: an empty plan never auto-fits when its first device is added', async () => {
      await page.evaluate("const r=await workspace.controller.openDocument({schemaVersion:1,topology:{app:'netsim',version:1,devices:[],links:[]}});if(!r.ok)throw Error(JSON.stringify(r));");
      await wait("store.getState().nodes.length===0"); await delay(160); await setViewport(.75);
      const before = await viewport();
      await page.evaluate("store.getState().addDeviceAt('host',{x:400,y:300});"); await wait("document.querySelectorAll('.react-flow__node').length===1"); await delay(200);
      assert(closeTo(before, await viewport()), 'First device triggered an automatic fit');
    });
  } finally {
    if (zoomPage) { try { await zoomPage.evaluate('return new Promise(resolve=>chrome.settingsPrivate.setDefaultZoom(1,resolve));'); } catch {} try { await zoomPage.send('Page.close'); } catch {} zoomPage.close(); }
    try { await page.evaluate('window.workspace?.dispose();'); } catch {}
    await page.evaluate(`await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase(${JSON.stringify(database)});r.onsuccess=resolve;r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Viewport cleanup blocked'));});`);
    Object.assign(report.results, results); report.viewportReview = { checks: measurements.length, screenshots: screenshots.length, directory };
    await writeFile(path.join(directory, 'results.json'), JSON.stringify({ results, measurements, screenshots }, null, 2));
  }
}
