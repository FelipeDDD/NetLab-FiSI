import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function runSelectionOutlineReview({ page, url, root, report }) {
  const database = 'netlab-idb-test-' + crypto.randomUUID();
  const directory = path.join(root, '.playwright-mcp/reviews/raw/selection-outline');
  await mkdir(directory, { recursive: true });
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const wait = async expression => {
    for (let i = 0; i < 200; i++) { if (await page.evaluate('return !!(' + expression + ');')) return; await delay(30); }
    throw Error('Selection outline condition: ' + expression);
  };
  try {
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false });
    await page.send('Page.navigate', { url }); await wait("document.readyState==='complete'&&document.getElementById('root')");
    await page.evaluate("window.entry=await import('/src/workspace/reviewEntry.tsx');window.store=(await import('/src/store.ts')).useStore;window.theme=(await import('/src/uiTheme.ts')).useUiTheme;window.probe=await import('/src/workspace/viewportProbe.browser.tsx');" +
      "const {Network}=await import('/src/engine/network.ts'),{createDevice}=await import('/src/engine/factory.ts'),{parseIp}=await import('/src/engine/ip.ts'),{serializeNetwork}=await import('/src/engine/serialize.ts'),{disposeNetwork}=await import('/src/engine/networkLifecycle.ts');" +
      "const n=new Network(),positions={host:{x:70,y:80},router:{x:350,y:80},server:{x:650,y:80},firewall:{x:950,y:80}};for(const [kind,position] of Object.entries(positions)){const d=createDevice(n,kind,{id:kind,name:kind});d.position=position;d.addIp('eth0',parseIp(kind==='router'?'10.0.0.1':'10.0.0.10'),24);}const router=n.devices.get('router');router.addIp('eth1',parseIp('10.1.0.1'),24);router.addIp('eth2',parseIp('10.2.0.1'),24);" +
      "n.connect('router','host',{aIface:'eth0',bIface:'eth0'});n.connect('router','server',{aIface:'eth1',bIface:'eth0'});n.connect('router','firewall',{aIface:'eth2',bIface:'eth0'});const topology=serializeNetwork(n,positions);disposeNetwork(n);" +
      "window.workspace=await entry.mountWorkspaceReview(document.getElementById('root'),{databaseName:" + JSON.stringify(database) + "});const opened=await workspace.controller.openDocument({schemaVersion:1,topology});if(!opened.ok)throw Error(JSON.stringify(opened));window.flow=probe.getViewportProbe();");
    await page.send('Page.bringToFront'); await wait("document.querySelectorAll('.react-flow__node').length===4");
    await wait("document.querySelectorAll('.react-flow__edge-path').length===3"); await delay(150);
    const ids = ['host', 'router', 'server', 'firewall'];
    const snapshot = "const rect=e=>{const r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height]};return {nodes:[...document.querySelectorAll('.react-flow__node')].map(n=>({id:n.dataset.id,box:rect(n),art:rect(n.querySelector('.dev-icon')),name:rect(n.querySelector('.dev-label')),ips:[...n.querySelectorAll('.node-ip-value')].map(rect),handles:[...n.querySelectorAll('.react-flow__handle')].map(rect)})),edges:[...document.querySelectorAll('.react-flow__edge-path')].map(e=>e.getAttribute('d')),viewport:flow.getViewport()};";
    for (const selectedTheme of ['graphite-dark', 'classic-light']) for (const zoom of [.25, .5, 1, 1.5, 2.5]) {
      const label = 'selection outline: ' + selectedTheme + ' zoom ' + zoom;
      try {
        await page.evaluate("theme.getState().setTheme(" + JSON.stringify(selectedTheme) + ");store.getState().onNodesChange(" + JSON.stringify(ids.map(id => ({ id, type: 'select', selected: false }))) + ");await flow.setViewport({x:" + (100 - 350 * zoom) + ",y:" + (80 - 80 * zoom) + ",zoom:" + zoom + "});");
        await delay(120);
        const before = await page.evaluate(snapshot);
        await page.evaluate("store.getState().onNodesChange(" + JSON.stringify(ids.map(id => ({ id, type: 'select', selected: true }))) + ");");
        await wait("document.querySelectorAll('.device-node.selected').length===4"); await delay(100);
        const after = await page.evaluate(snapshot);
        assert.deepEqual(after, before, 'selection must not change nodes, labels, handles, cables or viewport');
        const gaps = await page.evaluate("return [...document.querySelectorAll('.device-node.selected')].map(n=>{const r=n.getBoundingClientRect(),p=getComputedStyle(n,'::after'),z=flow.getViewport().zoom,ips=[...n.querySelectorAll('.node-ip-value')].map(e=>e.getBoundingClientRect());return {id:n.closest('.react-flow__node').dataset.id,bottom:r.bottom-parseFloat(p.bottom)*z-Math.max(...ips.map(i=>i.bottom)),left:Math.min(...ips.map(i=>i.left))-(r.left+parseFloat(p.left)*z),right:r.right-parseFloat(p.right)*z-Math.max(...ips.map(i=>i.right)),pointer:p.pointerEvents};});");
        for (const item of gaps) { for (const side of ['bottom', 'left', 'right']) assert(item[side] >= 3 * zoom, JSON.stringify(item)); assert.equal(item.pointer, 'none'); }
        assert.equal(await page.evaluate("return document.querySelectorAll('.react-flow__node[data-id=router] .node-ip-value').length;"), 3);
        const image = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        await writeFile(path.join(directory, selectedTheme + '-' + zoom + '.png'), Buffer.from(image.data, 'base64'));
        report.results[label] = { passed: true };
      } catch (e) { report.results[label] = { passed: false, error: e.stack }; throw e; }
    }
    for (const selectedTheme of ['graphite-dark', 'classic-light']) for (const zoom of [.25, .5, 1, 1.5, 2.5]) {
      const label = 'hover outline: ' + selectedTheme + ' zoom ' + zoom;
      try {
        await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 3, y: 3 });
        await page.evaluate("theme.getState().setTheme(" + JSON.stringify(selectedTheme) + ");store.getState().onNodesChange(" + JSON.stringify(ids.map(id => ({ id, type: 'select', selected: false }))) + ");");
        for (const [id, x] of [['host', 70], ['router', 350], ['server', 650], ['firewall', 950]]) {
          await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 3, y: 3 });
          await page.evaluate('await flow.setViewport({x:' + (100 - x * zoom) + ',y:' + (80 - 80 * zoom) + ',zoom:' + zoom + '});');
          await delay(70);
          const before = await page.evaluate(snapshot);
          const position = await page.evaluate('const r=document.querySelector(".react-flow__node[data-id=' + id + '] .dev-icon").getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};');
          await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...position }); await delay(180);
          assert(await page.evaluate('return document.querySelector(".react-flow__node[data-id=' + id + '] .device-node").matches(":hover:not(.selected)");'));
          assert.deepEqual(await page.evaluate(snapshot), before, 'hover must not move labels, nodes, handles, cables or viewport');
          const gap = await page.evaluate('const n=document.querySelector(".react-flow__node[data-id=' + id + '] .device-node"),r=n.getBoundingClientRect(),p=getComputedStyle(n,"::after"),z=flow.getViewport().zoom,ips=[...n.querySelectorAll(".node-ip-value")].map(e=>e.getBoundingClientRect());return {bottom:r.bottom-parseFloat(p.bottom)*z-Math.max(...ips.map(i=>i.bottom)),left:Math.min(...ips.map(i=>i.left))-(r.left+parseFloat(p.left)*z),right:r.right-parseFloat(p.right)*z-Math.max(...ips.map(i=>i.right)),pointer:p.pointerEvents,shadow:p.boxShadow};');
          for (const side of ['bottom', 'left', 'right']) assert(gap[side] >= 3 * zoom, JSON.stringify({ id, gap }));
          assert.equal(gap.pointer, 'none'); assert.equal(gap.shadow, 'none');
          if (id === 'router' && [.5, 1].includes(zoom)) {
            const image = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
            await writeFile(path.join(directory, 'hover-' + selectedTheme + '-' + zoom + '.png'), Buffer.from(image.data, 'base64'));
          }
        }
        await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 3, y: 3 });
        assert(await page.evaluate("return getComputedStyle(document.querySelector('.react-flow__node[data-id=firewall] .device-node'),'::after').content==='none';"));
        report.results[label] = { passed: true };
      } catch (e) { report.results[label] = { passed: false, error: e.stack }; throw e; }
    }
    try {
      await page.evaluate("store.getState().onNodesChange(" + JSON.stringify(ids.map(id => ({ id, type: 'select', selected: false }))) + ");await flow.setViewport({x:60,y:120,zoom:1});window.copied=[];Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>copied.push(value)}});");
      await delay(100);
      const point = selector => page.evaluate('const r=document.querySelector(' + JSON.stringify(selector) + ').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};');
      const click = async p => { for (const type of ['mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, ...p, button: 'left', clickCount: 1 }); };
      await click(await point('.react-flow__node[data-id=host] .dev-icon'));
      await wait("document.querySelector('.react-flow__node[data-id=host] .device-node.selected')");
      await click(await point('.react-flow__node[data-id=host] .copy-ip'));
      await wait('copied.length===1'); assert.deepEqual(await page.evaluate('return copied;'), ['10.0.0.10']);
      await click(await point('.react-flow__node[data-id=router] .node-network-row[data-interface-name=eth2] .copy-ip'));
      await wait('copied.length===2'); assert.deepEqual(await page.evaluate('return copied;'), ['10.0.0.10', '10.2.0.1']);
      await page.evaluate("store.getState().onNodesChange(" + JSON.stringify(ids.map(id => ({ id, type: 'select', selected: true }))) + ");");
      await wait("document.querySelectorAll('.device-node.selected').length===4"); await delay(100);
      const before = await page.evaluate('return {positions:store.getState().nodes.map(n=>({id:n.id,...n.position})),viewport:flow.getViewport()};');
      const p = await point('.react-flow__node[data-id=host] .dev-icon');
      await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...p });
      await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...p, button: 'left', clickCount: 1 });
      for (let i = 1; i <= 6; i++) await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x + i * 5, y: p.y + i * 20 / 6, button: 'left', buttons: 1 });
      await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x + 30, y: p.y + 20, button: 'left', clickCount: 1 });
      await delay(100);
      const after = await page.evaluate('return {positions:store.getState().nodes.map(n=>({id:n.id,...n.position})),viewport:flow.getViewport()};');
      assert.deepEqual(after.viewport, before.viewport);
      const first = before.positions[0], moved = after.positions.find(n => n.id === first.id);
      const dx = moved.x - first.x, dy = moved.y - first.y;
      assert(dx > 0 && dy > 0, JSON.stringify({ before, after }));
      for (const old of before.positions) { const next = after.positions.find(n => n.id === old.id); assert.equal(next.x - old.x, dx); assert.equal(next.y - old.y, dy); }
      report.results['selection outline: click, IP copy and multi-node drag'] = { passed: true };
    } catch (e) { report.results['selection outline: click, IP copy and multi-node drag'] = { passed: false, error: e.stack }; throw e; }
  } finally {
    await page.evaluate("window.workspace?.dispose();await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase(" + JSON.stringify(database) + ");r.onsuccess=resolve;r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Selection review database cleanup blocked'));});");
  }
}
