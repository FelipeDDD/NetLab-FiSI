import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { generateReview } from './visual-review.mjs';

export async function runUsabilityReview({ page, url, root, report }) {
  const database = 'netlab-idb-test-' + randomUUID(), results = {}, screenshots = [];
  const directory = path.join(root, '.playwright-mcp/reviews/raw/usability-refinements-staging');
  await mkdir(directory, { recursive: true });
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const wait = async expression => { for (let i = 0; i < 200; i++) { if (await page.evaluate('return !!(' + expression + ');')) return; await delay(40); } throw Error('Timed out: ' + expression); };
  const point = selector => page.evaluate(`const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing '+${JSON.stringify(selector)});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};`);
  const click = async selector => {
    const p = await point(selector);
    for (const type of ['mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, ...p, button: 'left', clickCount: 1 });
    await delay(50);
  };
  const textClick = async (selector, text) => {
    await page.evaluate(`const b=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.textContent.trim()===${JSON.stringify(text)});if(!b)throw Error('Missing button');b.click();`); await delay(50);
  };
  const field = async (selector, value) => {
    await page.evaluate(`const e=document.querySelector(${JSON.stringify(selector)});e.focus();e.select();`);
    await page.send('Input.insertText', { text: value }); await page.evaluate('document.activeElement.blur();'); await delay(80);
  };
  const shot = async (name, theme, width) => {
    await page.send('Page.bringToFront'); await delay(80);
    const png = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(path.join(directory, name), Buffer.from(png.data, 'base64')); screenshots.push({ name, theme, width, height: 960 });
  };
  const output = id => page.evaluate(`const t=terminals.getSession(sim.net.devices.get(${JSON.stringify(id)})).term,b=t.buffer.active;return Array.from({length:b.length},(_,i)=>b.getLine(i)?.translateToString()).join('\\n');`);
  const open = async id => { await page.evaluate(`store.getState().openTerminal(${JSON.stringify(id)});`); await wait(`terminals.getSession(sim.net.devices.get(${JSON.stringify(id)})).opened`); await delay(90); };
  const command = async (id, line) => {
    const status = await page.evaluate(`return terminals.getSession(sim.net.devices.get(${JSON.stringify(id)})).executeCommand(${JSON.stringify(line)});`);
    assert.equal(status, 'accepted'); await delay(90);
  };
  const input = async (id, value) => { await page.evaluate(`terminals.getSession(sim.net.devices.get(${JSON.stringify(id)})).term.input(${JSON.stringify(value)},true);`); await delay(80); };
  const mount = async () => {
    await page.send('Page.navigate', { url }); await wait("document.readyState==='complete'&&location.pathname==='/__workspace_ui_test__'");
    await page.evaluate(`window.entry=await import('/src/workspace/reviewEntry.tsx');window.store=(await import('/src/store.ts')).useStore;window.sim=(await import('/src/sim.ts')).sim;window.terminals=await import('/src/terminals.ts');window.theme=(await import('/src/uiTheme.ts')).useUiTheme;window.ws=await entry.mountWorkspaceReview(document.getElementById('root'),{databaseName:${JSON.stringify(database)}});window.flow=(await import('/src/workspace/viewportProbe.browser.tsx')).getViewportProbe();`);
    await wait("document.querySelector('.react-flow')"); await delay(120);
  };
  const test = async (name, work) => { try { await work(); results[name] = { passed: true }; } catch (e) { results[name] = { passed: false, error: e.stack ?? String(e) }; throw e; } };
  const ip = '[aria-label="IP-Adresse eth0"]', mask = '[aria-label="Subnetzmaske eth0"]';
  try {
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }); await mount();
    await page.evaluate(`const file=structuredClone((await import('/src/exercises/drafts.ts')).EXERCISE_DRAFTS.find(d=>d.category==='routing').review.reference.topology);const map={buero:'pc1',lager:'pc2'};file.devices.forEach(d=>{d.id=map[d.id]??d.id;d.name=d.id;if(d.id==='pc2')d.os='windows';});file.links.forEach(l=>{for(const end of ['a','b'])l[end][0]=map[l[end][0]]??l[end][0];});const r=await ws.controller.openDocument({schemaVersion:1,topology:file});if(!r.ok)throw Error(JSON.stringify(r));theme.getState().setTheme('graphite-dark');`);
    await wait("document.querySelectorAll('.react-flow__node').length===3");
    await page.evaluate('await flow.setViewport({x:25,y:30,zoom:.75});');
    await test('usability: CIDR and mask stay synchronized through editing and Inspector reopening', async () => {
      await page.evaluate("store.getState().select('pc2');"); await textClick('.inspector-tabs button', 'Netzwerk'); await wait(`document.querySelector('${ip}')?.getBoundingClientRect().width>0`);
      const before = await page.evaluate('return JSON.stringify(store.getState().captureWorkspaceDocument());');
      await page.evaluate("store.getState().select(null);"); await delay(50); await page.evaluate("store.getState().select('pc2');"); await textClick('.inspector-tabs button', 'Netzwerk');
      assert.equal(await page.evaluate('return JSON.stringify(store.getState().captureWorkspaceDocument());'), before);
      for (const [prefix, decimal] of [[26, '255.255.255.192'], [27, '255.255.255.224'], [24, '255.255.255.0']]) {
        await field(ip, `10.44.0.70/${prefix}`);
        assert.equal(await page.evaluate(`return document.querySelector('${ip}').value;`), `10.44.0.70/${prefix}`);
        assert.equal(await page.evaluate(`return document.querySelector('${mask}').value;`), decimal);
        assert.equal(await page.evaluate("return sim.net.devices.get('pc2').interfaces[0].ip.prefix;"), prefix);
      }
      await field(mask, '255.255.255.224');
      assert.equal(await page.evaluate(`return document.querySelector('${ip}').value;`), '10.44.0.70/27');
      await shot('01-cidr-graphite.png', 'graphite-dark', 1440);
      await page.evaluate("store.getState().select(null);"); await delay(60); await page.evaluate("store.getState().select('pc2');"); await textClick('.inspector-tabs button', 'Netzwerk'); await wait(`document.querySelector('${ip}')?.getBoundingClientRect().width>0`);
      assert.equal(await page.evaluate(`return document.querySelector('${ip}').value;`), '10.44.0.70/27');
      assert(await page.evaluate("return !document.querySelector('.react-flow__node[data-id=pc2] .node-network-label').textContent.includes('/27');"));
    });
    await test('usability: forwarding checkbox and sysctl share state and routing behavior', async () => {
      await page.evaluate("store.getState().select('r1');"); await textClick('.inspector-tabs button', 'Routing');
      const checkbox = '.inspector-tab-panel:not([hidden]) .svc-toggle input';
      assert.equal(await page.evaluate(`return document.querySelector('${checkbox}').checked;`), true);
      await click(checkbox); assert.equal(await page.evaluate("return sim.net.devices.get('r1').forwarding;"), false);
      await open('r1'); await command('r1', 'sysctl net.ipv4.ip_forward'); assert((await output('r1')).includes('net.ipv4.ip_forward = 0'));
      await command('r1', 'sysctl -w net.ipv4.ip_forward=1'); await wait(`document.querySelector('${checkbox}').checked`);
      await command('r1', 'sysctl -w net.ipv4.ip_forward=0'); await wait(`!document.querySelector('${checkbox}').checked`);
      await shot('02-forwarding-graphite.png', 'graphite-dark', 1440);
      await page.evaluate("store.getState().closeTerminal('r1');store.getState().select(null);");
    });
    await test('usability: Save/Load, F5 and draft recovery preserve CIDR and forwarding without canvas suffixes', async () => {
      await page.evaluate("const r=await ws.controller.saveOpenDraft(ws.controller.getState().activeDraftId,'Usability Test');if(!r.ok)throw Error(JSON.stringify(r));const doc=ws.controller.recoveryDocument();await ws.controller.openDocument(JSON.parse(JSON.stringify(doc)));await ws.controller.flush();ws.dispose();");
      await mount(); assert.equal(await page.evaluate("return sim.net.devices.get('r1').forwarding;"), false);
      await page.evaluate("store.getState().select('pc2');"); await textClick('.inspector-tabs button', 'Netzwerk'); await wait(`document.querySelector('${ip}')?.getBoundingClientRect().width>0`);
      assert.equal(await page.evaluate(`return document.querySelector('${ip}').value;`), '10.44.0.70/27');
      assert.equal(await page.evaluate(`return document.querySelector('${mask}').value;`), '255.255.255.224');
      await page.evaluate("store.getState().select(null);store.getState().setForwarding('r1',true);await flow.setViewport({x:25,y:30,zoom:.75});");
    });
    await test('usability: Free Panels preserve opening order, manual order and xterm sessions across focus', async () => {
      await page.evaluate("store.getState().setTerminalLayoutMode('free');");
      for (const id of ['pc1', 'r1', 'pc2']) await open(id);
      assert.deepEqual(await page.evaluate('return store.getState().terminalPanels.map(p=>p.active);'), ['pc1', 'r1', 'pc2']);
      const view = await page.evaluate('return flow.getViewport();');
      await open('pc1'); await open('r1'); assert.deepEqual(await page.evaluate('return store.getState().terminalPanels.map(p=>p.active);'), ['pc1', 'r1', 'pc2']);
      await shot('03-free-opening-order.png', 'graphite-dark', 1440);
      await page.evaluate("window.oldSessions=['pc1','r1','pc2'].map(id=>terminals.getSession(sim.net.devices.get(id)));const p=store.getState().terminalPanels;store.getState().reorderTerminalPanel(p[2].id,p[0].id);");
      await open('pc1'); assert.deepEqual(await page.evaluate('return store.getState().terminalPanels.map(p=>p.active);'), ['pc2', 'pc1', 'r1']);
      assert(await page.evaluate("return ['pc1','r1','pc2'].every((id,i)=>terminals.getSession(sim.net.devices.get(id))===oldSessions[i]);"));
      assert.deepEqual(await page.evaluate('return flow.getViewport();'), view);
      await page.evaluate("for(const id of [...store.getState().terminals])store.getState().closeTerminal(id);");
    });
    await test('usability: Quick Ping discards partial input, tolerates double Ctrl+C and respects active commands', async () => {
      await open('pc1'); await input('pc1', 'hostname\r'); await input('pc1', 'ping 10.44.0.70\r'); await input('pc1', '\x03\x03'); await input('pc1', 'discarded draft');
      await page.evaluate("store.getState().beginQuickPing('pc1');store.getState().chooseQuickPingTarget('pc2');");
      await wait('!store.getState().quickPing'); await page.evaluate('store.getState().setPaused(true);sim.net.scheduler.advanceTo(sim.net.now+6000);'); await delay(150);
      assert(await page.evaluate("return !document.querySelector('.react-flow').classList.contains('is-quick-ping');"));
      assert((await output('pc1')).includes('ping -c 4 10.44.0.70')); assert((await output('pc1')).includes('4 received'));
      assert(await page.evaluate("const t=terminals.getSession(sim.net.devices.get('pc1')).term,b=t.buffer.active;return !Array.from({length:t.rows},(_,i)=>b.getLine(b.baseY+i)?.translateToString()).join('\\n').includes('discarded draft');"));
      await input('pc1', '\x1b[A\x1b[A\x1b[A\r'); assert((await output('pc1')).includes('hostname'));
      await input('pc1', 'ping 10.44.0.70\r'); await page.evaluate("store.getState().beginQuickPing('pc1');store.getState().chooseQuickPingTarget('pc2');");
      await wait("store.getState().quickPing?.message.includes('Ctrl+C')"); assert(!await page.evaluate('return !!store.getState().quickPing.pending;'));
      await input('pc1', '\x03'); await page.evaluate('store.getState().cancelQuickPing();');
      await open('pc2'); await input('pc2', 'partial windows input'); await page.evaluate("store.getState().beginQuickPing('pc2');store.getState().chooseQuickPingTarget('pc1');");
      await wait('!store.getState().quickPing'); await page.evaluate('sim.net.scheduler.advanceTo(sim.net.now+6000);'); await delay(150);
      assert((await output('pc2')).includes('ping -n 4 10.44.0.10')); assert((await output('pc2')).includes('Received = 4'));
    });
    await test('usability: press feedback, selection, reduced motion and both themes preserve node/cable geometry', async () => {
      await page.evaluate("for(const id of [...store.getState().terminals])store.getState().closeTerminal(id);await flow.setViewport({x:25,y:30,zoom:.75});");
      const selector = '.react-flow__node[data-id=pc1] .device-ping';
      const geometry = () => page.evaluate("return {viewport:flow.getViewport(),nodes:store.getState().nodes.map(n=>({id:n.id,position:n.position})),buttons:[...document.querySelectorAll('.device-action')].map(b=>b.getBoundingClientRect().toJSON())};");
      for (const width of [1440, 700]) for (const theme of ['graphite-dark', 'classic-light']) {
        await page.send('Emulation.setDeviceMetricsOverride', { width, height: 960, deviceScaleFactor: 1, mobile: false }); await page.evaluate(`theme.getState().setTheme(${JSON.stringify(theme)});`); await delay(100);
        const before = await geometry(), p = await point(selector);
        await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...p });
        await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...p, button: 'left', clickCount: 1 }); await delay(120);
        assert.notEqual(await page.evaluate(`return getComputedStyle(document.querySelector('${selector} svg')).transform;`), 'none');
        assert.deepEqual(await geometry(), before);
        await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...p, button: 'left', clickCount: 1 });
        await wait("store.getState().quickPing?.sourceId==='pc1'");
        assert.equal(await page.evaluate(`return document.querySelector('${selector}').getAttribute('aria-pressed');`), 'true');
        assert(await page.evaluate(`return getComputedStyle(document.querySelector('${selector}')).cursor.includes('quick-ping.svg');`));
        assert(await page.evaluate("return getComputedStyle(document.querySelector('.react-flow__pane')).cursor.includes('quick-ping.svg');"));
        const target = '.react-flow__node[data-id=r1] .device-artwork';
        const targetPoint = await point(target);
        await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...targetPoint });
        assert(await page.evaluate(`return getComputedStyle(document.elementFromPoint(${targetPoint.x},${targetPoint.y})).cursor.includes('quick-ping-ready.svg');`));
        // No IPv4 means no green cursor. Use the existing eligibility/classification.
        await page.evaluate("window.savedRouterIPs=sim.net.devices.get('r1').interfaces.map(i=>i.ip);sim.net.devices.get('r1').interfaces.forEach(i=>i.ip=null);store.getState().refresh();");
        assert(await page.evaluate(`return !getComputedStyle(document.elementFromPoint(${targetPoint.x},${targetPoint.y})).cursor.includes('quick-ping-ready.svg');`));
        await page.evaluate("sim.net.devices.get('r1').interfaces.forEach((i,n)=>i.ip=savedRouterIPs[n]);store.getState().refresh();");
        await shot(`04-quick-ping-${theme}-${width}.png`, theme, width);
        await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape' }); await wait('!store.getState().quickPing');
        assert.equal(await page.evaluate(`return document.querySelector('${selector}').getAttribute('aria-pressed');`), 'false');
        assert(await page.evaluate("return !getComputedStyle(document.querySelector('.react-flow__pane')).cursor.includes('/cursors/');"));
        assert(await page.evaluate('return document.documentElement.scrollWidth<=innerWidth+1;'));
      }
      await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
      const p = await point(selector); await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...p, button: 'left', clickCount: 1 });
      assert.equal(await page.evaluate(`return getComputedStyle(document.querySelector('${selector} svg')).transform;`), 'none');
      await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...p, button: 'left', clickCount: 1 });
      await page.evaluate('store.getState().cancelQuickPing();await ws.controller.flush();');
      assert(await page.evaluate("return (await Promise.all(['/assets/cursors/quick-ping.svg','/assets/cursors/quick-ping-ready.svg'].map(src=>new Promise(resolve=>{const image=new Image();image.onload=()=>resolve(image.width===28&&image.height===28);image.onerror=()=>resolve(false);image.src=src;})))).every(Boolean);"));
    });
  } finally {
    try { await page.evaluate('window.ws?.dispose();'); } catch {}
    await page.evaluate(`await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase(${JSON.stringify(database)});r.onsuccess=resolve;r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Cleanup blocked'));});`);
    Object.assign(report.results, results); await writeFile(path.join(directory, 'results.json'), JSON.stringify({ results, screenshots }, null, 2));
    if (Object.keys(results).length === 6 && Object.values(results).every(r => r.passed)) {
      const captures = screenshots.map(s => ({ source: path.relative(root, path.join(directory, s.name)).split(path.sep).join('/'), scene: s.name.slice(3, -4), variant: s.theme, state: 'normal', width: s.width, height: s.height }));
      const manifest = path.join(directory, 'manifest.json');
      await writeFile(manifest, JSON.stringify({ id: 'usability-refinements', title: 'CIDR, Forwarding, Quick Ping e Free Panels', variants: [{ id: 'graphite-dark', label: 'Graphite Dark' }, { id: 'classic-light', label: 'Classic Light' }], states: ['normal'], captures, share: captures.filter((_, i) => [0, 2, 6].includes(i)).map(s => ({ ...s, name: s.scene })), shareContactSheet: false }, null, 2));
      report.usabilityReview = await generateReview(manifest);
    }
  }
}
