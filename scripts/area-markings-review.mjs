import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { generateReview } from './visual-review.mjs';

export async function runAreaMarkingsReview({ page, url, root, report }) {
  const database = 'netlab-idb-test-' + randomUUID(), results = {}, screenshots = [];
  const directory = path.join(root, '.playwright-mcp/reviews/raw/area-markings-staging');
  await mkdir(directory, { recursive: true });
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const wait = async expression => { for (let i = 0; i < 160; i++) { if (await page.evaluate('return !!(' + expression + ');')) return; await delay(40); } throw Error('Timed out: ' + expression); };
  const point = selector => page.evaluate(`const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing: '+${JSON.stringify(selector)});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};`);
  const click = async selector => {
    const p = await point(selector);
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, ...p, ...(type === 'mouseMoved' ? {} : { button: 'left', clickCount: 1 }) });
    await delay(50);
  };
  const textClick = async (selector, text) => { await page.evaluate(`const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.textContent.trim()===${JSON.stringify(text)});if(!e)throw Error('Missing '+${JSON.stringify(text)});e.click();`); await delay(50); };
  const field = async (selector, text) => { await page.evaluate(`const e=document.querySelector(${JSON.stringify(selector)});e.focus();e.select();`); await page.send('Input.insertText', { text }); await delay(50); };
  const choose = async value => {
    if (!await page.evaluate("return !!document.querySelector('#marking-picker-list');")) await click('[aria-label="Markierung auswählen"]');
    await click(`[role="option"][data-marking-id="${value}"]`); await delay(60);
  };
  const key = async (key, code = key, modifiers = 0) => { for (const type of ['keyDown', 'keyUp']) await page.send('Input.dispatchKeyEvent', { type, key, code, modifiers }); await delay(50); };
  const openMenu = async () => { if (!await page.evaluate("return !!document.querySelector('#area-markings-popover');")) await click('[aria-label=Markierungen]'); await wait("document.querySelector('#area-markings-popover')"); };
  const shot = async (name, theme, width) => {
    await page.evaluate('window.getSelection()?.removeAllRanges();');
    await page.send('Page.bringToFront'); await delay(100);
    const png = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(path.join(directory, name), Buffer.from(png.data, 'base64')); screenshots.push({ name, theme, width, height: 960 });
  };
  const mount = async () => {
    await page.send('Page.navigate', { url }); await wait("document.readyState==='complete'&&location.pathname==='/__workspace_ui_test__'");
    await page.evaluate(`window.entry=await import('/src/workspace/reviewEntry.tsx');window.store=(await import('/src/store.ts')).useStore;window.sim=(await import('/src/sim.ts')).sim;window.theme=(await import('/src/uiTheme.ts')).useUiTheme;window.ws=await entry.mountWorkspaceReview(document.getElementById('root'),{databaseName:${JSON.stringify(database)}});`);
    await wait("document.querySelector('.react-flow')");
    await page.evaluate("window.flow=(await import('/src/workspace/viewportProbe.browser.tsx')).getViewportProbe();"); await delay(120);
  };
  const selected = () => page.evaluate('return store.getState().nodes.filter(n=>n.selected).map(n=>n.id).sort();');
  const marks = () => page.evaluate('return store.getState().areaMarkings;');
  const network = () => page.evaluate("return (await import('/src/engine/serialize.ts')).serializeNetwork(sim.net,{});");
  const selectWithShift = async ids => {
    const bounds = await page.evaluate(`store.getState().select(null);const rects=${JSON.stringify(ids)}.map(id=>document.querySelector('.react-flow__node[data-id="'+id+'"]').getBoundingClientRect());return{left:Math.min(...rects.map(r=>r.left))-10,top:Math.min(...rects.map(r=>r.top))-10,right:Math.max(...rects.map(r=>r.right))+10,bottom:Math.max(...rects.map(r=>r.bottom))+10};`);
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Shift', code: 'ShiftLeft', modifiers: 8, windowsVirtualKeyCode: 16 });
    await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: bounds.left, y: bounds.top, button: 'left', clickCount: 1, modifiers: 8 });
    for (let i = 1; i <= 12; i++) await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: bounds.left + (bounds.right - bounds.left) * i / 12, y: bounds.top + (bounds.bottom - bounds.top) * i / 12, buttons: 1, modifiers: 8 });
    await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: bounds.right, y: bounds.bottom, button: 'left', clickCount: 1, modifiers: 8 });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16 }); await delay(100);
    assert.deepEqual(await selected(), [...ids].sort());
    assert.equal(await page.evaluate('return store.getState().pendingMarkingRect;'),null,'Shift selection must never create an area draft');
    assert.equal(await page.evaluate('return store.getState().drawingMarking;'),false);
  };
  const drag = async (selector, dx, dy) => {
    const p = await point(selector); await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...p, button: 'left', clickCount: 1 });
    for (let i = 1; i <= 12; i++) await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x + dx * i / 12, y: p.y + dy * i / 12, buttons: 1 });
    await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x + dx, y: p.y + dy, button: 'left', clickCount: 1 }); await delay(100);
  };
  const test = async (name, work) => { try { await work(); results[name] = { passed: true }; } catch (e) { results[name] = { passed: false, error: e.stack ?? String(e) }; throw e; } };
  let originalDraft, first, second, membersDocument;
  try {
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }); await mount();
    await page.evaluate(`const {Network}=await import('/src/engine/network.ts'),{createDevice}=await import('/src/engine/factory.ts'),{serializeNetwork}=await import('/src/engine/serialize.ts'),{disposeNetwork}=await import('/src/engine/networkLifecycle.ts');const net=new Network(),positions={pc1:{x:100,y:160},sw1:{x:340,y:160},pc2:{x:100,y:370},r1:{x:650,y:180},srv1:{x:890,y:180},ap1:{x:650,y:370}};for(const [kind,id]of[['host','pc1'],['switch','sw1'],['host','pc2'],['router','r1'],['server','srv1'],['ap','ap1']])createDevice(net,kind,{id,name:id});net.connect('pc1','sw1');net.connect('pc2','sw1');net.connect('sw1','r1');net.connect('r1','srv1');net.connect('r1','ap1');window.fixture=serializeNetwork(net,positions);disposeNetwork(net);const r=await ws.controller.openDocument({schemaVersion:1,topology:fixture});if(!r.ok)throw Error(JSON.stringify(r));theme.getState().setTheme('graphite-dark');`);
    await wait("document.querySelectorAll('.react-flow__node').length===6&&store.getState().nodes.every(n=>n.measured?.width)");
    await page.evaluate('await flow.setViewport({x:20,y:40,zoom:.85});'); await delay(80);
    originalDraft = await page.evaluate('return ws.controller.getState().activeDraftId;');
    await test('markings: native Shift selection, ephemeral preview and creation leave the network untouched', async () => {
      await openMenu(); assert(await page.evaluate("return [...document.querySelectorAll('.markings-actions button')].find(b=>b.textContent==='Bereich markieren').disabled;")); await key('Escape');
      await selectWithShift(['pc1', 'sw1', 'pc2']); const before = await network(); await openMenu();
      await wait('store.getState().markingPreview'); assert.equal(await page.evaluate('return ws.controller.recoveryDocument().topology.ui.areaMarkings;'), undefined);
      await field('[aria-label="Name der Fläche"]', 'Büro');
      await textClick('.markings-actions button', 'Bereich markieren');
      first = (await marks())[0].id;
      assert.deepEqual((await marks())[0].deviceIds.sort(), ['pc1', 'pc2', 'sw1']);
      assert.deepEqual(await network(), before); assert(await page.evaluate("return !!document.querySelector('#area-markings-popover');"));
      await key('Escape'); await wait("!document.querySelector('#area-markings-popover')");
      assert.equal(await page.evaluate('return store.getState().markingPreview;'), null);
    });
    await test('markings: a second area is independent; colors/name/intensity update without closing the popover', async () => {
      await selectWithShift(['r1', 'srv1', 'ap1']); await openMenu(); await choose('');
      await field('[aria-label="Name der Fläche"]', 'Lager / DMZ'); await click('[aria-label=Petrol]');
      await page.evaluate("document.querySelector('[aria-label=\"Intensität der Markierung\"]').focus();"); await key('ArrowRight'); await key('ArrowRight');
      await textClick('.markings-actions button', 'Bereich markieren'); second = (await marks())[1].id;
      assert.equal((await marks())[1].color, 'teal'); assert.equal((await marks())[1].intensity, 20);
      await choose(first); await click('[aria-label=Violett]'); await field('[aria-label="Name der Fläche"]', 'Büro');
      await page.evaluate("document.querySelector('[aria-label=\"Intensität der Markierung\"]').focus();"); await key('End'); assert.equal((await marks())[0].intensity, 50);
      await key('Home'); assert.equal((await marks())[0].intensity, 5);
      for (let i = 0; i < 13; i++) await key('ArrowRight');
      assert.equal((await marks())[0].intensity, 18); assert(await page.evaluate("return !!document.querySelector('#area-markings-popover');"));
      await key('Escape');
      assert.equal(await page.evaluate("return document.querySelectorAll('.area-markings-layer g[data-area-marking]').length;"), 2);
      await page.evaluate("store.getState().onNodesChange(store.getState().nodes.map(n=>({type:'select',id:n.id,selected:false})));store.getState().clearLinkSelection();");
      await shot('01-two-areas-graphite.png', 'graphite-dark', 1440);
    });
    await test('markings: move one device freely, update bounds, rename by ID and preserve viewport', async () => {
      const before = await page.evaluate(`const e=document.querySelector('[data-area-marking="${first}"] rect');return{width:Number(e.getAttribute('width')),nodes:store.getState().nodes.map(n=>({id:n.id,x:n.position.x,y:n.position.y})),viewport:flow.getViewport()};`);
      await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 1300, y: 820, button: 'left', clickCount: 1 }); await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 1300, y: 820, button: 'left', clickCount: 1 }); await delay(50);
      await drag('.react-flow__node[data-id=pc1] .device-artwork', -38, -25);
      const after = await page.evaluate(`return{width:Number(document.querySelector('[data-area-marking="${first}"] rect').getAttribute('width')),nodes:store.getState().nodes.map(n=>({id:n.id,x:n.position.x,y:n.position.y})),viewport:flow.getViewport()};`);
      assert(after.width > before.width); assert.deepEqual(after.viewport, before.viewport);
      assert.deepEqual(after.nodes.filter(n => n.id !== 'pc1'), before.nodes.filter(n => n.id !== 'pc1'));
      await page.evaluate("store.getState().renameDevice('pc1','Büro PC');"); assert((await marks())[0].deviceIds.includes('pc1'));
    });
    await test('markings: removing areas and devices, Undo/Redo and cable reconnection remain independent', async () => {
      await openMenu(); await choose(first); const before = await network(); await textClick('.markings-actions button', 'Bereich entfernen');
      assert.equal((await marks()).length, 1); assert.deepEqual(await network(), before);
      await click('.toolbar-history-button[aria-label=Undo]'); assert.equal((await marks()).length, 2);
      await page.evaluate("store.getState().deleteDevice('pc1');"); assert(!(await marks())[0].deviceIds.includes('pc1'));
      await click('.toolbar-history-button[aria-label=Undo]'); assert((await marks())[0].deviceIds.includes('pc1'));
      await page.evaluate("const link=[...sim.net.links.values()].find(l=>l.a.device.id==='pc2'||l.b.device.id==='pc2');store.getState().onEdgesChange([{type:'remove',id:link.id}]);");
      const source = await point('.react-flow__node[data-id=pc2] .react-flow__handle[data-handleid=r]');
      const target = await point('.react-flow__node[data-id=sw1] .react-flow__handle[data-handleid=b]');
      await page.send('Input.dispatchMouseEvent', { type:'mousePressed', ...source, button:'left', clickCount:1 });
      for(let i=1;i<=15;i++)await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:source.x+(target.x-source.x)*i/15,y:source.y+(target.y-source.y)*i/15,buttons:1});
      await page.send('Input.dispatchMouseEvent',{type:'mouseReleased',...target,button:'left',clickCount:1});
      await wait("sim.net.devices.get('pc2').interfaces[0].link"); assert.equal((await marks()).length,2);
      assert(await page.evaluate("return [...document.querySelectorAll('.area-markings-layer rect')].every(e=>getComputedStyle(e).pointerEvents==='none');"));
    });
    await test('markings: autosave, Save As, JSON roundtrip and switching plans preserve independent metadata', async () => {
      const expected = await marks();
      await page.evaluate('await ws.controller.flush();');
      assert.deepEqual(await page.evaluate(`const r=await ws.repository.workspace.loadDraft(${JSON.stringify(originalDraft)});if(!r.ok)throw Error(JSON.stringify(r));return r.value.document.topology.ui.areaMarkings;`),expected);
      await page.evaluate(`let r=await ws.controller.saveOpenDraft(${JSON.stringify(originalDraft)},'Bereiche Original');if(!r.ok)throw Error(JSON.stringify(r));r=await ws.controller.saveOpenDraft(${JSON.stringify(originalDraft)},'Bereiche Kopie');if(!r.ok)throw Error(JSON.stringify(r));window.exported=JSON.stringify(ws.controller.recoveryDocument());await ws.controller.openDocument({schemaVersion:1,topology:fixture});`);
      assert.deepEqual(await marks(),[]);
      await page.evaluate('await ws.controller.openDocument(JSON.parse(exported));');assert.deepEqual(await marks(),expected);
      await page.evaluate(`await ws.controller.switchDraft(${JSON.stringify(originalDraft)});`);assert.deepEqual(await marks(),expected);
      await page.evaluate('await ws.controller.flush();ws.dispose();');await mount();assert.deepEqual(await marks(),expected);
      await page.evaluate('await flow.setViewport({x:20,y:40,zoom:.85});');
    });
    await test('markings: themes, responsive toolbar and Inspector/terminal preserve canvas geometry', async () => {
      const unchanged = await marks();
      for (const viewport of [{x:90,y:65,zoom:.5},{x:-80,y:-40,zoom:1.25}]) {
        await page.evaluate(`await flow.setViewport(${JSON.stringify(viewport)});`);await delay(80);
        assert.deepEqual(await marks(), unchanged);
        assert(await page.evaluate("const r=document.querySelector('.area-markings-layer rect').getBoundingClientRect();const n=document.querySelector('.react-flow__node[data-id=pc1]').getBoundingClientRect();return r.left<n.left&&r.top<n.top&&r.right>n.right&&r.bottom>n.bottom;"));
      }
      await page.evaluate('await flow.setViewport({x:20,y:40,zoom:.85});');
      for(const width of [700,1024,1101,1200,1440])for(const theme of ['graphite-dark','classic-light']){
        await page.send('Emulation.setDeviceMetricsOverride',{width,height:960,deviceScaleFactor:1,mobile:false});await page.evaluate(`theme.getState().setTheme(${JSON.stringify(theme)});store.getState().select(null);`);await delay(100);
        const before=await page.evaluate('return flow.getViewport();');await openMenu();
        assert(await page.evaluate('return document.documentElement.scrollWidth<=innerWidth+1;'));
        assert(await page.evaluate("const r=document.querySelector('#area-markings-popover').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;"));
        assert.deepEqual(await page.evaluate('return flow.getViewport();'),before);
        if(width===700&&theme==='classic-light')await shot('02-popover-classic-700.png',theme,width);
        await key('Escape');
        if(width===1440&&theme==='classic-light')await shot('03-two-areas-classic.png',theme,width);
      }
      await page.evaluate("theme.getState().setTheme('graphite-dark');");
      const before=await page.evaluate('return flow.getViewport();');await page.evaluate("store.getState().select('r1');store.getState().openTerminal('r1');");
      await wait("document.querySelector('.terminal-dock')&&document.querySelector('.inspector')");await delay(160);await openMenu();await choose(second);
      assert.deepEqual(await page.evaluate('return flow.getViewport();'),before);await shot('04-popover-inspector-terminal.png','graphite-dark',1440);await key('Escape');
      await page.evaluate('await ws.controller.flush();');
    });
    await test('markings: green area accepts pc4 and releases pc2 without changing devices or cables', async () => {
      await page.evaluate(`const {Network}=await import('/src/engine/network.ts'),{createDevice}=await import('/src/engine/factory.ts'),{serializeNetwork}=await import('/src/engine/serialize.ts'),{disposeNetwork}=await import('/src/engine/networkLifecycle.ts');const net=new Network(),positions={pc1:{x:100,y:140},pc2:{x:310,y:140},pc3:{x:100,y:330},pc5:{x:310,y:330},pc4:{x:100,y:540},pc6:{x:730,y:140},sw1:{x:730,y:330},r1:{x:950,y:330}};for(const id of Object.keys(positions))createDevice(net,id==='sw1'?'switch':id==='r1'?'router':'host',{id,name:id});for(const id of ['pc1','pc2','pc3','pc4','pc5','pc6','r1'])net.connect(id,'sw1');window.membersFixture=serializeNetwork(net,positions);disposeNetwork(net);const r=await ws.controller.openDocument({schemaVersion:1,topology:membersFixture});if(!r.ok)throw Error(JSON.stringify(r));theme.getState().setTheme('graphite-dark');`);
      await wait("document.querySelectorAll('.react-flow__node').length===8&&store.getState().nodes.every(n=>n.measured?.width)");
      membersDocument = await page.evaluate('return membersFixture;');
      await page.evaluate('await flow.setViewport({x:20,y:20,zoom:.75});');await delay(100);
      await selectWithShift(['pc1','pc2','pc3','pc5']);await openMenu();await field('[aria-label="Name der Fläche"]','Büro Grün · 東京');await click('[aria-label=Grün]');await textClick('.markings-actions button','Bereich markieren');
      first=(await marks())[0].id;await key('Escape');
      await selectWithShift(['pc6','sw1','r1']);await openMenu();await field('[aria-label="Name der Fläche"]','Lager / DMZ');await click('[aria-label=Petrol]');await textClick('.markings-actions button','Bereich markieren');
      second=(await marks())[1].id;await key('Escape');
      await page.evaluate("store.getState().onNodesChange(store.getState().nodes.map(n=>({type:'select',id:n.id,selected:false})));store.getState().clearLinkSelection();");
      await shot('05-members-before-graphite.png','graphite-dark',1440);
      const engine=await network(),other=(await marks())[1];
      const height=await page.evaluate(`return Number(document.querySelector('[data-area-marking="${first}"] rect').getAttribute('height'));`);
      await selectWithShift(['pc4']);await openMenu();await choose(first);
      assert(await page.evaluate(`return document.querySelector('[data-area-marking="${first}"]').dataset.markingSelected==='true';`));
      await textClick('.marking-members button','Auswahl hinzufügen');
      assert.deepEqual((await marks())[0].deviceIds,['pc1','pc2','pc3','pc5','pc4']);
      assert(await page.evaluate(`return Number(document.querySelector('[data-area-marking="${first}"] rect').getAttribute('height'))>${height};`));
      assert.equal(await page.evaluate("return [...document.querySelectorAll('.marking-members button')].find(b=>b.textContent==='Auswahl hinzufügen').disabled;"),true);
      assert.deepEqual((await marks())[1],other);await key('Escape');
      await selectWithShift(['pc2']);await openMenu();await choose(second);await textClick('.marking-members button','Auswahl hinzufügen');
      assert((await marks())[0].deviceIds.includes('pc2'));assert((await marks())[1].deviceIds.includes('pc2'));
      await choose(first);await textClick('.marking-members button','Auswahl entfernen');
      assert.deepEqual((await marks())[0].deviceIds,['pc1','pc3','pc5','pc4']);assert((await marks())[1].deviceIds.includes('pc2'));
      assert.deepEqual(await network(),engine);assert.equal(await page.evaluate('return sim.net.devices.size;'),8);
      const expected=await marks();await click('.toolbar-history-button[aria-label=Undo]');assert((await marks())[0].deviceIds.includes('pc2'));
      await click('.toolbar-history-button[aria-label=Redo]');assert.deepEqual(await marks(),expected);await key('Escape');
      await page.evaluate("store.getState().onNodesChange(store.getState().nodes.map(n=>({type:'select',id:n.id,selected:false})));store.getState().select(null);store.getState().clearLinkSelection();");
      await shot('06-members-after-graphite.png','graphite-dark',1440);
    });
    await test('markings: title and keyboard identify Unicode areas without consuming node selection', async () => {
      await selectWithShift(['pc4']);const chosen=await selected(),viewport=await page.evaluate('return flow.getViewport();');
      await page.evaluate('store.getState().clearLinkSelection();');
      await click(`[data-area-marking="${first}"] .area-marking-title`);await wait("document.querySelector('#area-markings-popover')");
      assert.equal(await page.evaluate('return store.getState().selectedMarkingId;'),first);assert.deepEqual(await selected(),chosen);assert.deepEqual(await page.evaluate('return flow.getViewport();'),viewport);
      await click('[aria-label="Markierung auswählen"]');
      assert.deepEqual(await page.evaluate("return [...document.querySelectorAll('[role=option][data-marking-id]')].slice(1).map(e=>({text:e.textContent,color:e.querySelector('.marking-sample')?.style.background}));"),[
        {text:'Büro Grün · 東京4 Geräte',color:'rgb(107, 155, 112)'},{text:'Lager / DMZ4 Geräte',color:'rgb(76, 159, 148)'}]);
      await shot('07-area-picker-graphite.png','graphite-dark',1440);
      await key('Home');await key('ArrowDown');await key('ArrowDown');await key('Enter');assert.equal(await page.evaluate('return store.getState().selectedMarkingId;'),second);
      await click('[aria-label="Markierung auswählen"]');await key('Escape');assert(await page.evaluate("return !!document.querySelector('#area-markings-popover')&&!document.querySelector('#marking-picker-list');"));
      await key('Escape');assert.equal(await page.evaluate('return store.getState().selectedMarkingId;'),null);assert.equal(await page.evaluate("return document.querySelectorAll('[data-marking-selected=true]').length;"),0);
      await page.evaluate(`document.querySelector('[data-area-marking="${first}"] .area-marking-title').focus();`);await key('Enter');
      await wait("document.querySelector('#area-markings-popover')");assert.equal(await page.evaluate('return store.getState().selectedMarkingId;'),first);assert.deepEqual(await selected(),chosen);await key('Escape');
      await selectWithShift(['pc1','pc2','pc3','pc4','pc5']);await openMenu();await choose(first);
      assert(await page.evaluate("return [...document.querySelectorAll('.marking-members button')].find(b=>b.textContent==='Auswahl entfernen').disabled&&!!document.querySelector('#marking-empty-hint');"));
      const before=await marks();await page.evaluate(`store.getState().changeMarkingMembers(${JSON.stringify(first)},'remove');`);assert.deepEqual(await marks(),before);await key('Escape');
      await page.evaluate("store.getState().onNodesChange(store.getState().nodes.map(n=>({type:'select',id:n.id,selected:n.id==='pc4'})));theme.getState().setTheme('classic-light');");
      await page.send('Emulation.setDeviceMetricsOverride',{width:700,height:960,deviceScaleFactor:1,mobile:false});await delay(100);await openMenu();await choose(first);
      assert(await page.evaluate("const r=document.querySelector('#area-markings-popover').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight&&document.documentElement.scrollWidth<=innerWidth;"));
      await shot('08-area-members-classic-700.png','classic-light',700);await key('Escape');
      await page.send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});
    });
    await test('markings: edited memberships survive Save/Load, F5, tabs and member deletion with undo', async () => {
      const expected=await marks();
      await page.evaluate("store.getState().deleteDevice('pc4');");assert(!(await marks())[0].deviceIds.includes('pc4'));
      await page.evaluate('store.getState().undoTopology();');assert.deepEqual(await marks(),expected);
      await page.evaluate("const saved=await ws.controller.save('Mitglieder 東京');if(!saved.ok)throw Error(JSON.stringify(saved));window.savedMarkingPlan=saved.value.plan.project.id;window.editedExport=JSON.stringify(ws.controller.recoveryDocument());window.membersDraft=ws.controller.getState().activeDraftId;");
      await page.evaluate('const r=await ws.controller.openDocument({schemaVersion:1,topology:membersFixture});if(!r.ok)throw Error(JSON.stringify(r));');assert.deepEqual(await marks(),[]);
      await page.evaluate('const r=await ws.controller.openPlan(savedMarkingPlan);if(!r.ok)throw Error(JSON.stringify(r));');assert.deepEqual(await marks(),expected);
      await page.evaluate('const r=await ws.controller.openDocument(JSON.parse(editedExport));if(!r.ok)throw Error(JSON.stringify(r));');assert.deepEqual(await marks(),expected);
      await page.evaluate('await ws.controller.switchDraft(membersDraft);await ws.controller.flush();ws.dispose();');await mount();assert.deepEqual(await marks(),expected);
      assert.equal(await page.evaluate('return store.getState().selectedMarkingId;'),null);
    });
    const screen = p => page.evaluate(`return flow.flowToScreenPosition(${JSON.stringify(p)});`);
    const rightClickWorld = async p => {
      const xy=await screen(p);await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',...xy});
      for(const type of ['mousePressed','mouseReleased'])await page.send('Input.dispatchMouseEvent',{type,...xy,button:'right',clickCount:1});await delay(80);
    };
    const drawWorld = async (a,b) => {
      const start=await screen(a),end=await screen(b);
      await page.send('Input.dispatchMouseEvent',{type:'mousePressed',...start,button:'left',clickCount:1});
      for(let i=1;i<=12;i++)await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:start.x+(end.x-start.x)*i/12,y:start.y+(end.y-start.y)*i/12,buttons:1});
      await page.send('Input.dispatchMouseEvent',{type:'mouseReleased',...end,button:'left',clickCount:1});await delay(100);
    };
    let geometryId,automatic,lExtension;
    await test('geometry: pane context hit-testing, cancelled/invalid drafts and a single uniformly filled L outline',async()=>{
      await page.evaluate(`window.membersFixture=${JSON.stringify(membersDocument)};`);
      await page.evaluate("const r=await ws.controller.openDocument({schemaVersion:1,topology:membersFixture});if(!r.ok)throw Error(JSON.stringify(r));theme.getState().setTheme('graphite-dark');");
      await wait("document.querySelectorAll('.react-flow__node').length===8&&store.getState().nodes.every(n=>n.measured?.width)");
      await page.evaluate('await flow.setViewport({x:20,y:20,zoom:.75});');await delay(100);
      await selectWithShift(['pc1','pc2','pc3','pc5']);
      await key('c','KeyC',2);await key('v','KeyV',2);
      assert.deepEqual(await selected(),['pc1','pc2','pc3','pc5']);assert.deepEqual(await marks(),[]);
      assert.equal(await page.evaluate('return store.getState().pendingMarkingRect;'),null);
      report.deviceClipboard={implemented:false,checked:'Ctrl+C/Ctrl+V do not create markings; this source tree has no device-copy/paste handlers.'};
      await openMenu();await field('[aria-label="Name der Fläche"]','Büro Grün · 東京');await click('[aria-label=Grün]');await textClick('.markings-actions button','Bereich markieren');geometryId=(await marks())[0].id;await key('Escape');
      await page.evaluate("store.getState().onNodesChange(store.getState().nodes.map(n=>({type:'select',id:n.id,selected:false})));store.getState().clearLinkSelection();");
      automatic=await page.evaluate(`return (await import('/src/areaMarkings.ts')).markingBounds(store.getState().areaMarkings[0],store.getState().nodes,flow.getViewport().zoom);`);
      await shot('09-rectangle-original.png','graphite-dark',1440);
      const context={x:automatic.x+12,y:automatic.y+automatic.height-12};
      await rightClickWorld(context);await wait("document.querySelector('#marking-context-menu')");
      const engine=await network(),positions=await page.evaluate('return store.getState().nodes.map(n=>({id:n.id,position:n.position}));'),viewport=await page.evaluate('return flow.getViewport();');
      await textClick('#marking-context-menu button','Teilfläche hinzufügen');await wait("document.querySelector('.marking-draw-surface')");
      const cancelStart=await screen(context),cancelEnd=await screen({x:context.x+80,y:context.y+70});
      await page.send('Input.dispatchMouseEvent',{type:'mousePressed',...cancelStart,button:'left',clickCount:1});await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',...cancelEnd,buttons:1});
      await key('Escape');await page.send('Input.dispatchMouseEvent',{type:'mouseReleased',...cancelEnd,button:'left',clickCount:1});
      assert.equal(await page.evaluate('return store.getState().markingGeometry;'),null);assert.equal((await marks())[0].extensions,undefined);assert.equal(await page.evaluate('return store.getState().markingExtensionPreview;'),null);
      await rightClickWorld(context);await textClick('#marking-context-menu button','Teilfläche hinzufügen');
      await drawWorld({x:automatic.x+5,y:automatic.y+automatic.height+40},{x:automatic.x+45,y:automatic.y+automatic.height+80});
      assert.equal((await marks())[0].extensions,undefined);assert(await page.evaluate("return !!document.querySelector('.marking-geometry-status [role=status]');"));
      await drawWorld({x:automatic.x+10,y:automatic.y+automatic.height-15},{x:automatic.x+12,y:automatic.y+automatic.height-13});assert.equal((await marks())[0].extensions,undefined);
      await drawWorld({x:automatic.x,y:automatic.y+automatic.height-18},{x:automatic.x+160,y:automatic.y+automatic.height+210});
      lExtension=(await marks())[0].extensions[0];assert(lExtension.id);assert.equal((await marks()).length,1);
      assert.equal(await page.evaluate(`return document.querySelectorAll('[data-area-marking="${geometryId}"] path').length;`),1);
      assert.equal(await page.evaluate(`return document.querySelectorAll('[data-area-marking="${geometryId}"] rect').length;`),0);
      assert(await page.evaluate(`const p=document.querySelector('[data-area-marking="${geometryId}"] path'),canvas=document.createElement('canvas');canvas.width=1500;canvas.height=1000;const c=canvas.getContext('2d');c.fillStyle=p.getAttribute('fill');c.globalAlpha=Number(p.getAttribute('fill-opacity'));c.fill(new Path2D(p.getAttribute('d')),'evenodd');const b=${JSON.stringify(automatic)},e=store.getState().areaMarkings[0].extensions[0];return c.getImageData(b.x+50,b.y+50,1,1).data[3]===c.getImageData(e.x+50,b.y+b.height-8,1,1).data[3];`));
      assert.deepEqual(await network(),engine);assert.deepEqual(await page.evaluate('return store.getState().nodes.map(n=>({id:n.id,position:n.position}));'),positions);assert.deepEqual(await page.evaluate('return flow.getViewport();'),viewport);
      assert(!(await marks())[0].deviceIds.includes('pc4'));
      await shot('10-l-union.png','graphite-dark',1440);
    });
    await test('geometry: pointer resizing/moving, uniform U/T unions, overlap choices and network context priority',async()=>{
      const bottom={x:lExtension.x+20,y:lExtension.y+lExtension.height-20};await rightClickWorld(bottom);await textClick('#marking-context-menu button','Teilflächen bearbeiten');
      await click('[data-extension-id] .marking-extension-control');await wait("document.querySelector('.marking-resize-handle[data-corner=se]')");
      await drag('.marking-resize-handle[data-corner=se]',25,15);let resized=(await marks())[0].extensions[0];assert(resized.width>lExtension.width);assert(resized.height>lExtension.height);assert.equal(resized.id,lExtension.id);
      await shot('11-extension-editing.png','graphite-dark',1440);
      await drag('[data-extension-id] .marking-extension-control',-15,0);assert((await marks())[0].extensions[0].x<resized.x);
      await key('Escape');assert(!await page.evaluate("return !!document.querySelector('.marking-geometry-controls');"));
      await page.evaluate('store.getState().undoTopology();store.getState().undoTopology();');assert.deepEqual((await marks())[0].extensions,[lExtension]);
      const pathBefore=await page.evaluate(`return document.querySelector('[data-area-marking="${geometryId}"] path').getAttribute('d');`);
      await drag('.react-flow__node[data-id=pc1] .device-artwork',-20,-15);assert.deepEqual((await marks())[0].extensions,[lExtension]);
      assert.notEqual(await page.evaluate(`return document.querySelector('[data-area-marking="${geometryId}"] path').getAttribute('d');`),pathBefore);
      await page.evaluate('store.getState().undoTopology();');
      await rightClickWorld({x:automatic.x+automatic.width-12,y:automatic.y+automatic.height-12});await textClick('#marking-context-menu button','Teilfläche hinzufügen');
      await drawWorld({x:automatic.x+automatic.width-130,y:automatic.y+automatic.height-18},{x:automatic.x+automatic.width,y:automatic.y+automatic.height+210});
      assert.equal((await marks())[0].extensions.length,2);await shot('12-u-union.png','graphite-dark',1440);
      await rightClickWorld({x:automatic.x+automatic.width/2,y:automatic.y+automatic.height+100});assert(!await page.evaluate("return !!document.querySelector('#marking-context-menu');"));
      await key('Escape');await page.evaluate('store.getState().clearLinkSelection();');
      const u=await marks();
      await page.evaluate(`const a=store.getState().areaMarkings[0],base=${JSON.stringify(automatic)};store.getState().setMarkingExtensions(a.id,[{id:a.extensions[0].id,x:base.x+base.width/2-60,y:base.y+base.height-15,width:120,height:210}]);`);
      const t=(await marks())[0];assert.equal(await page.evaluate(`return (await import('/src/markingGeometry.ts')).unionLoops([${JSON.stringify(automatic)},...store.getState().areaMarkings[0].extensions])[0].length;`),8);
      await page.evaluate("theme.getState().setTheme('classic-light');");await shot('13-t-classic.png','classic-light',1440);
      await page.evaluate('store.getState().undoTopology();');assert.deepEqual(await marks(),u);
      await selectWithShift(['pc1','pc2']);await openMenu();await field('[aria-label="Name der Fläche"]','Überlappung');await textClick('.markings-actions button','Bereich markieren');await key('Escape');
      await page.evaluate("store.getState().onNodesChange(store.getState().nodes.map(n=>({type:'select',id:n.id,selected:false})));");
      assert.equal((await marks()).length,2);
      const overlap=await page.evaluate(`const {markingBounds}=await import('/src/areaMarkings.ts');const boxes=store.getState().areaMarkings.map(a=>markingBounds(a,store.getState().nodes,flow.getViewport().zoom));return{x:(Math.max(...boxes.map(r=>r.x))+Math.min(...boxes.map(r=>r.x+r.width)))/2,y:Math.max(...boxes.map(r=>r.y))+8};`);
      await delay(100);await rightClickWorld(overlap);
      try { await wait("document.querySelector('[aria-label=\"Bereich am Klickpunkt\"]')"); } catch(error) {
        throw Error(error.message+' '+JSON.stringify(await page.evaluate(`const p=flow.flowToScreenPosition(${JSON.stringify(overlap)});return{areas:store.getState().areaMarkings,point:${JSON.stringify(overlap)},mode:store.getState().markingGeometry,target:document.elementFromPoint(p.x,p.y)?.outerHTML,menu:document.querySelector('#marking-context-menu')?.outerHTML};`)));
      }
      assert.equal(await page.evaluate("return document.querySelector('[aria-label=\"Bereich am Klickpunkt\"]').options.length;"),2);await key('Escape');
      const node=await point('.react-flow__node[data-id=pc1] .device-artwork');for(const type of ['mousePressed','mouseReleased'])await page.send('Input.dispatchMouseEvent',{type,...node,button:'right',clickCount:1});await delay(50);assert(!await page.evaluate("return !!document.querySelector('#marking-context-menu');"));
      await page.evaluate("store.getState().setMarkingGeometry(store.getState().areaMarkings[0].id,'edit');");await click('[data-extension-id] .marking-extension-control');
      const before=await marks();await textClick('.marking-geometry-status button','Teilfläche entfernen');assert.equal((await marks())[0].extensions.length,1);
      await click('[data-extension-id] .marking-extension-control');await textClick('.marking-geometry-status button','Teilfläche entfernen');assert.equal((await marks())[0].extensions,undefined);
      assert.equal(await page.evaluate(`return document.querySelectorAll('[data-area-marking="${geometryId}"] rect').length;`),1);await key('Escape');
      await page.evaluate('store.getState().undoTopology();store.getState().undoTopology();');assert.deepEqual(await marks(),before);
      // Keep the T as the persisted example; U and L remain in undo/review captures.
      await page.evaluate(`store.getState().setMarkingExtensions(${JSON.stringify(geometryId)},${JSON.stringify(t.extensions)});`);
    });
    await test('geometry: detached extensions stay fixed through device movement, history, JSON, Save As and F5',async()=>{
      const before=await marks();await page.evaluate("store.getState().onNodesChange(store.getState().areaMarkings[0].deviceIds.map((id,i)=>({type:'position',id,position:{x:2000+i*200,y:1200},dragging:false})));");assert.deepEqual((await marks())[0].extensions,before[0].extensions);
      const engine=await network();
      await page.evaluate("const r=await ws.controller.save('Formen 東京');if(!r.ok)throw Error(JSON.stringify(r));const copy=await ws.controller.save('Formen Kopie');if(!copy.ok)throw Error(JSON.stringify(copy));window.geometryExport=JSON.stringify(ws.controller.recoveryDocument());window.geometryDraft=ws.controller.getState().activeDraftId;await ws.controller.openDocument({schemaVersion:1,topology:membersFixture});");assert.deepEqual(await marks(),[]);
      await page.evaluate('await ws.controller.openDocument(JSON.parse(geometryExport));');assert.deepEqual(await marks(),before);assert.deepEqual(await network(),engine);
      await page.evaluate('await ws.controller.switchDraft(geometryDraft);await ws.controller.flush();ws.dispose();');await mount();assert.deepEqual(await marks(),before);assert.equal(await page.evaluate('return store.getState().markingGeometry;'),null);
      await page.evaluate('await flow.setViewport({x:30,y:20,zoom:.5});');const stable=await marks();
      const ext=stable[0].extensions[0],point={x:ext.x+ext.width-10,y:ext.y+ext.height-10};await rightClickWorld(point);await wait("document.querySelector('#marking-context-menu')");await key('Escape');assert.deepEqual(await marks(),stable);
      await page.send('Emulation.setDeviceMetricsOverride',{width:700,height:960,deviceScaleFactor:1,mobile:false});await delay(150);await rightClickWorld(point);await wait("document.querySelector('#marking-context-menu')");
      assert(await page.evaluate("const r=document.querySelector('#marking-context-menu').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;"));await key('Escape');
    });
    await test('geometry: resize the automatic main area with and without extensions, preserving offsets and world geometry', async () => {
      await page.send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});
      await page.evaluate(`window.membersFixture=${JSON.stringify(membersDocument)};`);
      await page.evaluate("await ws.controller.openDocument({schemaVersion:1,topology:membersFixture});theme.getState().setTheme('graphite-dark');");
      await wait('store.getState().nodes.length===8&&store.getState().nodes.every(n=>n.measured?.width)');
      await page.evaluate('await flow.setViewport({x:20,y:20,zoom:.75});');await delay(150);
      await selectWithShift(['pc1','pc2','pc3','pc5']);await openMenu();await field('[aria-label="Name der Fläche"]','Hauptfläche · Büro');
      await textClick('.markings-actions button','Bereich markieren');const id=(await marks())[0].id;await key('Escape');
      await page.evaluate('store.getState().onNodesChange(store.getState().nodes.map(n=>({type:"select",id:n.id,selected:false})));');
      const engine=await network(),positions=await page.evaluate('return store.getState().nodes.map(n=>({id:n.id,position:n.position}));');
      const base=async()=>page.evaluate('return (await import("/src/areaMarkings.ts")).markingBounds(store.getState().areaMarkings[0],store.getState().nodes);');
      const nominal=await base();
      await rightClickWorld({x:nominal.x+8,y:nominal.y+nominal.height-8});await textClick('#marking-context-menu button','Teilflächen bearbeiten');
      await click('.marking-base-control');assert.equal(await page.evaluate('return document.querySelectorAll("[data-base-corner]").length;'),4);
      await page.evaluate('await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(r))));await flow.setViewport({x:20,y:20,zoom:.75});');await delay(100);
      const beforeHistory=await page.evaluate('return store.getState().topologyHistory.past.length;');
      const resizeZoom=await page.evaluate('return flow.getViewport().zoom;');
      await drag('[data-base-corner=se]',45,30);
      // CDP/native pointer events can round fractional screen coordinates by a pixel.
      const pointerTolerance=1/resizeZoom+.01;
      const first=await marks();assert(Math.abs(first[0].baseOffsets.right-45/resizeZoom)<pointerTolerance,JSON.stringify({first,resizeZoom,after:await page.evaluate('return flow.getViewport();')}));assert(Math.abs(first[0].baseOffsets.bottom-30/resizeZoom)<pointerTolerance,JSON.stringify(first));
      assert.equal(await page.evaluate('return store.getState().topologyHistory.past.length;'),beforeHistory+1);
      assert.equal(await page.evaluate('return [...document.querySelectorAll(".marking-geometry-status button")].find(b=>b.textContent==="Teilfläche entfernen").disabled;'),true);
      await page.evaluate('store.getState().undoTopology();');assert.equal((await marks())[0].baseOffsets,undefined);
      await page.evaluate('store.getState().redoTopology();');assert.deepEqual(await marks(),first);
      const expanded=await base();await rightClickWorld({x:expanded.x+8,y:expanded.y+expanded.height-8});await textClick('#marking-context-menu button','Teilfläche hinzufügen');
      await drawWorld({x:expanded.x,y:expanded.y+expanded.height-15},{x:expanded.x+110,y:expanded.y+expanded.height+140});
      const extension=structuredClone((await marks())[0].extensions);
      assert(extension?.length,JSON.stringify(await page.evaluate('return {mode:store.getState().markingGeometry,message:document.querySelector(".marking-geometry-status")?.textContent};')));
      await rightClickWorld({x:expanded.x+expanded.width-8,y:expanded.y+expanded.height-8});await textClick('#marking-context-menu button','Teilflächen bearbeiten');await click('.marking-base-control');
      await page.evaluate('await flow.setViewport({x:80,y:70,zoom:.75});');await delay(100);
      const northwest=await point('[data-base-corner=nw]');
      assert(await page.evaluate(`const p=${JSON.stringify(northwest)};const e=document.elementFromPoint(p.x,p.y);return e?.getAttribute('data-base-corner')==='nw';`),JSON.stringify(await page.evaluate(`const p=${JSON.stringify(northwest)};return {point:p,target:document.elementFromPoint(p.x,p.y)?.outerHTML,viewport:flow.getViewport()};`)));
      const secondZoom=await page.evaluate('return flow.getViewport().zoom;');
      await drag('[data-base-corner=nw]',-15,-15);assert.deepEqual((await marks())[0].extensions,extension);
      const offsets=structuredClone((await marks())[0].baseOffsets);assert(Math.abs(offsets.left-15/secondZoom)<1/secondZoom+.01,JSON.stringify(offsets));assert(Math.abs(offsets.top-15/secondZoom)<1/secondZoom+.01,JSON.stringify(offsets));
      await shot('14-main-resize-graphite.png','graphite-dark',1440);
      await click('[data-extension-id] .marking-extension-control');await drag('[data-corner=se]',15,15);assert.deepEqual((await marks())[0].baseOffsets,offsets);
      await key('Escape');assert.deepEqual(await network(),engine);assert.deepEqual(await page.evaluate('return store.getState().nodes.map(n=>({id:n.id,position:n.position}));'),positions);
      const stable=await marks();let expectedPath;
      for(const theme of ['graphite-dark','classic-light'])for(const zoom of [.5,1,2,.5]){
        await page.evaluate(`theme.getState().setTheme(${JSON.stringify(theme)});await flow.setViewport({x:20,y:20,zoom:${zoom}});`);await delay(80);
        const path=await page.evaluate('return document.querySelector("[data-area-marking] path").getAttribute("d");');expectedPath??=path;assert.equal(path,expectedPath);assert.deepEqual(await marks(),stable);
      }
      await page.evaluate('await flow.setViewport({x:20,y:20,zoom:.75});');await shot('15-main-resize-classic.png','classic-light',1440);
      const beforeMove=await base();await page.evaluate('store.getState().onNodesChange([{type:"position",id:"pc2",position:{x:410,y:140},dragging:false}]);');
      assert((await base()).width>beforeMove.width);assert.deepEqual((await marks())[0].baseOffsets,offsets);assert.deepEqual((await marks())[0].extensions,stable[0].extensions);
      const expected=await marks();
      await page.evaluate('let r=await ws.controller.save("Main offsets");if(!r.ok)throw Error(JSON.stringify(r));r=await ws.controller.save("Main offsets copy");if(!r.ok)throw Error(JSON.stringify(r));window.baseExport=JSON.stringify(ws.controller.recoveryDocument());window.baseDraft=ws.controller.getState().activeDraftId;await ws.controller.flush();await ws.controller.openDocument({schemaVersion:1,topology:membersFixture});');
      assert.deepEqual(await marks(),[]);await page.evaluate('await ws.controller.openDocument(JSON.parse(baseExport));');assert.deepEqual(await marks(),expected);
      await page.evaluate('await ws.controller.switchDraft(baseDraft);await ws.controller.flush();ws.dispose();');await mount();assert.deepEqual(await marks(),expected);
      assert.equal(await page.evaluate('return store.getState().markingExtensionPreview;'),null);
      await page.evaluate('await flow.setViewport({x:20,y:20,zoom:.5});');await delay(80);
      const persistedPath=await page.evaluate('return document.querySelector("[data-area-marking] path").getAttribute("d");');
      await page.evaluate('await flow.setViewport({x:20,y:20,zoom:2});');await delay(80);assert.equal(await page.evaluate('return document.querySelector("[data-area-marking] path").getAttribute("d");'),persistedPath);
    });
    await test('free areas: explicit drawing, empty preview, independent membership, geometry and restoration', async () => {
      await page.send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});
      await page.evaluate('await ws.controller.openDocument({schemaVersion:1,topology:{app:"netsim",version:1,devices:[],links:[]}});theme.getState().setTheme("graphite-dark");');
      await wait('store.getState().nodes.length===0');await page.evaluate('await flow.setViewport({x:30,y:25,zoom:.75});');await delay(150);
      const marquee = async (a,b) => {
        await openMenu();await textClick('.markings-editor button','Neue Fläche zeichnen');
        await wait("document.querySelector('.marking-draw-surface')&&!document.querySelector('#area-markings-popover')");
        assert.equal(await page.evaluate('return getComputedStyle(document.querySelector(".marking-draw-surface")).cursor;'),'crosshair');
        await drawWorld(a,b);await wait('document.querySelector("#area-markings-popover")');
        assert.equal(await page.evaluate('return store.getState().drawingMarking;'),false);
      };
      const rectangle={x:100,y:100,width:330,height:230};
      await marquee({x:rectangle.x,y:rectangle.y},{x:rectangle.x+rectangle.width,y:rectangle.y+rectangle.height});
      await wait('store.getState().pendingMarkingRect&&document.querySelector("[data-marking-preview]")');
      const pending=await page.evaluate('return store.getState().pendingMarkingRect;');
      for(const field of ['x','y','width','height'])assert(Math.abs(pending[field]-rectangle[field])<2);
      assert.deepEqual(await marks(),[]);assert.equal(await page.evaluate('return ws.controller.recoveryDocument().topology.ui?.areaMarkings;'),undefined);
      await openMenu();assert.equal(await page.evaluate('return !!document.querySelector(".marking-picker");'),false);
      await field('[aria-label="Name der Fläche"]','Büro zuerst · 東京');await click('[aria-label=Petrol]');
      await shot('16-free-empty-preview.png','graphite-dark',1440);
      await textClick('.markings-actions button','Bereich speichern');const freeId=(await marks())[0].id;
      assert.equal((await marks())[0].geometry,'free');assert.deepEqual((await marks())[0].deviceIds,[]);assert.equal(await page.evaluate('return store.getState().pendingMarkingRect;'),null);
      await key('Escape');await page.evaluate('store.getState().undoTopology();');assert.deepEqual(await marks(),[]);await page.evaluate('store.getState().redoTopology();');
      const freeBase=structuredClone((await marks())[0].bounds);
      const emptyArea=await marks();
      await page.evaluate('let r=await ws.controller.save("Leerer Raum");if(!r.ok)throw Error(JSON.stringify(r));await ws.controller.flush();ws.dispose();');
      await mount();assert.deepEqual(await marks(),emptyArea);assert.equal(await page.evaluate('return sim.net.devices.size;'),0);
      await page.evaluate('await flow.setViewport({x:30,y:25,zoom:.75});');await delay(100);
      await page.evaluate(`store.getState().addDeviceAt('host',{x:${freeBase.x+35},y:${freeBase.y+35}});store.getState().addDeviceAt('host',{x:${freeBase.x+185},y:${freeBase.y+35}});`);
      await wait('store.getState().nodes.length===2&&store.getState().nodes.every(n=>n.measured?.width)');await delay(120);
      assert.deepEqual((await marks())[0].deviceIds,[]);assert.deepEqual((await marks())[0].bounds,freeBase);
      const ids=await page.evaluate('return store.getState().nodes.map(n=>n.id);');
      await page.evaluate('await flow.setViewport({x:30,y:25,zoom:.75});');await delay(120);
      const selectClients = async () => {
        // Begin outside the area's interactive title, not within its text stroke.
        const a=await screen({x:freeBase.x-20,y:freeBase.y-20}),b=await screen({x:freeBase.x+freeBase.width+60,y:freeBase.y+freeBase.height-15});
        await page.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Shift',code:'ShiftLeft',modifiers:8,windowsVirtualKeyCode:16});
        await page.send('Input.dispatchMouseEvent',{type:'mousePressed',...a,button:'left',clickCount:1,modifiers:8});
        for(let i=1;i<=12;i++)await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:a.x+(b.x-a.x)*i/12,y:a.y+(b.y-a.y)*i/12,buttons:1,modifiers:8});
        await page.send('Input.dispatchMouseEvent',{type:'mouseReleased',...b,button:'left',clickCount:1,modifiers:8});
        await page.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Shift',code:'ShiftLeft',windowsVirtualKeyCode:16});await delay(100);
        assert.deepEqual(await selected(),[...ids].sort());assert.equal(await page.evaluate('return store.getState().pendingMarkingRect;'),null);
      };
      await selectClients();
      await openMenu();await choose(freeId);await textClick('.marking-members button','Auswahl hinzufügen');
      assert.deepEqual((await marks())[0].deviceIds,ids);assert.deepEqual((await marks())[0].bounds,freeBase);
      await textClick('.marking-members button','Auswahl entfernen');assert.deepEqual((await marks())[0].deviceIds,[]);await key('Escape');
      // Drawing another rectangle inside the existing region creates a new draft, not an edit.
      const beforeOverlap=await marks();
      await marquee({x:freeBase.x+20,y:freeBase.y+150},{x:freeBase.x+180,y:freeBase.y+215});
      await wait('store.getState().pendingMarkingRect');assert.deepEqual(await marks(),beforeOverlap);
      await openMenu();await field('[aria-label="Name der Fläche"]','Nebenraum');await click('[aria-label=Violett]');await textClick('.markings-actions button','Bereich speichern');
      assert.equal((await marks()).length,2);assert.deepEqual((await marks())[0],beforeOverlap[0]);await key('Escape');
      const saved=await marks();await marquee({x:600,y:100},{x:780,y:240});await key('Escape');assert.deepEqual(await marks(),saved);assert.equal(await page.evaluate('return store.getState().pendingMarkingRect;'),null);
      await marquee({x:600,y:100},{x:780,y:240});await openMenu();await textClick('.markings-actions button','Abbrechen');assert.deepEqual(await marks(),saved);assert.equal(await page.evaluate('return store.getState().markingPreview;'),null);
      await openMenu();await textClick('.markings-editor button','Neue Fläche zeichnen');await wait('document.querySelector(".marking-draw-surface")');await key('Escape');
      assert.equal(await page.evaluate('return store.getState().drawingMarking;'),false);assert.equal(await page.evaluate('return !!document.querySelector(".marking-draw-surface");'),false);
      await selectClients();
      await page.evaluate('store.getState().onNodesChange(store.getState().nodes.map(n=>({type:"select",id:n.id,selected:false})));store.getState().select(null);store.getState().clearLinkSelection();');
      // Reuse exactly the same extension editor/union as automatic regions.
      await rightClickWorld({x:freeBase.x+freeBase.width-8,y:freeBase.y+freeBase.height-8});await textClick('#marking-context-menu button','Teilfläche hinzufügen');
      await drawWorld({x:freeBase.x,y:freeBase.y+freeBase.height-12},{x:freeBase.x+80,y:freeBase.y+freeBase.height+125});
      assert.equal((await marks())[0].extensions.length,1);
      const extension=structuredClone((await marks())[0].extensions);
      await rightClickWorld({x:freeBase.x+freeBase.width-8,y:freeBase.y+freeBase.height-8});await textClick('#marking-context-menu button','Teilflächen bearbeiten');await click('.marking-base-control');
      await page.evaluate('await flow.setViewport({x:80,y:70,zoom:.75});');await delay(100);
      const zoom=await page.evaluate('return flow.getViewport().zoom;');await drag('[data-base-corner=se]',24,12);
      const resized=await marks();assert(Math.abs(resized[0].bounds.width-freeBase.width-24/zoom)<2);assert(Math.abs(resized[0].bounds.height-freeBase.height-12/zoom)<2);
      assert.deepEqual(resized[0].extensions,extension);assert.equal(resized[0].baseOffsets,undefined);await key('Escape');
      for(const shape of ['L','U','T']){
        await page.evaluate(`const a=store.getState().areaMarkings[0],b=a.bounds,l=${JSON.stringify(extension[0])};store.getState().setMarkingExtensions(a.id,${JSON.stringify(shape)}==='L'?[l]:${JSON.stringify(shape)}==='U'?[l,{...l,id:'free-right',x:b.x+b.width-l.width}]:[{...l,x:b.x+(b.width-l.width)/2}]);`);
        let path;
        for(const z of [.5,1,2]){await page.evaluate(`await flow.setViewport({x:30,y:25,zoom:${z}});`);await delay(70);const current=await page.evaluate('return document.querySelector("[data-area-marking] path").getAttribute("d");');path??=current;assert.equal(current,path);}
      }
      await page.evaluate('await flow.setViewport({x:30,y:25,zoom:.75});');
      await shot('17-free-devices-graphite.png','graphite-dark',1440);
      await page.evaluate('theme.getState().setTheme("classic-light");');await shot('18-free-devices-classic.png','classic-light',1440);
      await page.send('Emulation.setDeviceMetricsOverride',{width:700,height:960,deviceScaleFactor:1,mobile:false});await delay(100);
      await marquee({x:100,y:350},{x:300,y:500});await openMenu();assert(await page.evaluate('const r=document.querySelector("#area-markings-popover").getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&document.documentElement.scrollWidth<=innerWidth;'));
      await shot('19-free-editor-classic-700.png','classic-light',700);await textClick('.markings-actions button','Abbrechen');
      const expected=await marks();
      await page.evaluate('let r=await ws.controller.save("Freie Bereiche");if(!r.ok)throw Error(JSON.stringify(r));r=await ws.controller.save("Freie Bereiche Kopie");if(!r.ok)throw Error(JSON.stringify(r));window.freeExport=JSON.stringify(ws.controller.recoveryDocument());window.freeDraft=ws.controller.getState().activeDraftId;await ws.controller.flush();await ws.controller.openDocument({schemaVersion:1,topology:{app:"netsim",version:1,devices:[],links:[]}});');
      assert.deepEqual(await marks(),[]);await page.evaluate('await ws.controller.openDocument(JSON.parse(freeExport));');assert.deepEqual(await marks(),expected);
      await page.evaluate('await ws.controller.switchDraft(freeDraft);await ws.controller.flush();ws.dispose();');await mount();assert.deepEqual(await marks(),expected);
      assert.equal(await page.evaluate('return store.getState().pendingMarkingRect;'),null);
      await page.evaluate('store.getState().selectMarking(store.getState().areaMarkings[1].id);');await wait('document.querySelector("#area-markings-popover")');await textClick('.markings-actions button','Bereich entfernen');assert.equal((await marks()).length,1);
      await page.evaluate('store.getState().undoTopology();');assert.deepEqual(await marks(),expected);
    });
  } finally {
    try{await page.evaluate('window.ws?.dispose();');}catch{}
    await page.evaluate(`await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase(${JSON.stringify(database)});r.onsuccess=resolve;r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Markings cleanup blocked'));});`);
    Object.assign(report.results,results);await writeFile(path.join(directory,'results.json'),JSON.stringify({results,screenshots},null,2));
    if(Object.keys(results).length===14&&Object.values(results).every(r=>r.passed)){
      const captures=screenshots.map(s=>({source:path.relative(root,path.join(directory,s.name)).split(path.sep).join('/'),scene:s.name.slice(3,-4),variant:s.theme,state:'normal',width:s.width,height:s.height}));
      const manifest=path.join(directory,'manifest.json');await writeFile(manifest,JSON.stringify({id:'area-marking-free-areas',title:'Markierungen · áreas livres e automáticas',variants:[{id:'graphite-dark',label:'Graphite Dark'},{id:'classic-light',label:'Classic Light'}],states:['normal'],captures,share:captures.slice(-4).map(s=>({...s,name:s.scene})),shareContactSheet:false},null,2));
      report.markingsReview=await generateReview(manifest);
    }
  }
}
