import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function runCanvasInteractionReview({ page, url, root, report }) {
  const phase = process.env.NETLAB_CANVAS_INTERACTION_PHASE ?? 'after', before = phase === 'before';
  const output = path.join(root, '.playwright-mcp/reviews/' + (process.env.NETLAB_CANVAS_ACTION_MINIMUM_REVIEW === '1' ? 'studio-distance-flip-hover' : 'canvas-studio-persistence')), references = path.join(output, 'referencias-chatgpt'); await mkdir(references, { recursive: true });
  const database = 'netlab-idb-test-' + crypto.randomUUID(), delay = ms => new Promise(r => setTimeout(r, ms));
  const wait = async expression => { for (let n = 0; n < 200; n++) { if (await page.evaluate(`return !!(${expression});`)) return; await delay(40); } throw Error('Canvas review timeout: ' + expression); };
  const move = async (x, y) => page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  const drag = async (source, target) => {
    await move(source.x, source.y); await delay(50); await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...source, button: 'left', buttons: 1, clickCount: 1 });
    for (let i = 1; i <= 6; i++) await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: source.x + (target.x - source.x) * i / 6, y: source.y + (target.y - source.y) * i / 6, buttons: 1 });
    await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...target, button: 'left', buttons: 0, clickCount: 1 }); await delay(90);
  };
  const shot = async name => { const r = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, ...(process.env.NETLAB_CANVAS_ACTION_MINIMUM_REVIEW === '1' && /^0[89]-/.test(name) ? { clip: { x: 310, y: 160, width: 250, height: 190, scale: 3 } } : {}) }); await writeFile(path.join(references, name + '.png'), Buffer.from(r.data, 'base64')); };
  const dev = (id, kind, x, y, count = kind === 'router' ? 4 : kind === 'switch' ? 8 : 1) => ({ id, name: id, kind, x, y, forwarding: kind === 'router', ifaces: Array.from({ length: count }, (_, i) => ({ name: 'eth' + i, up: true, ip: kind === 'switch' ? null : `192.168.${i + 10}.1/24`, ipv4Mode: kind === 'switch' ? 'unconfigured' : 'static' })), routes: [] });
  const setup = async devices => {
    await page.evaluate(`const r=await workspace.controller.openDocument({schemaVersion:1,topology:{app:'netsim',version:1,devices:${JSON.stringify(devices)},links:[]}});if(!r.ok)throw Error(JSON.stringify(r));store.getState().select(null);store.getState().setPaused(true);`);
    await wait(`store.getState().nodes.length===${devices.length}&&store.getState().nodes.every(n=>n.measured?.height)`); await delay(100);
  };
  const viewport = async zoom => { await page.evaluate(`store.getState().select(null);store.getState().onNodesChange(store.getState().nodes.map(n=>({id:n.id,type:'select',selected:false})));document.activeElement?.blur();await flow.setViewport({x:130,y:90,zoom:${zoom}});`); await move(1400, 950); await delay(130); };
  const geometry = () => page.evaluate("const rect=e=>{const r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height]};return [...document.querySelectorAll('.react-flow__node')].map(n=>({id:n.dataset.id,node:rect(n),art:rect(n.querySelector('.device-artwork')),handles:[...n.querySelectorAll('.react-flow__handle')].map(rect),label:rect(n.querySelector('.device-label-content')),buttons:[...n.querySelectorAll('.device-action')].map(rect)}));");
  const hoverResults = [], cableResults = [];
  try {
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }); await page.send('Page.navigate', { url }); await wait("document.readyState==='complete'&&document.getElementById('root')");
    await page.evaluate(`window.store=(await import('/src/store.ts')).useStore;window.sim=(await import('/src/sim.ts')).sim;window.workspace=await(await import('/src/workspace/reviewEntry.tsx')).mountWorkspaceReview(document.getElementById('root'),{databaseName:${JSON.stringify(database)}});(await import('/src/uiTheme.ts')).useUiTheme.getState().setTheme('graphite-dark');window.flow=(await import('/src/workspace/viewportProbe.browser.tsx')).getViewportProbe();`);
    await wait('flow&&document.querySelector(".react-flow")'); await page.send('Page.bringToFront');
    await page.evaluate("window.dropHelper=await import('/src/canvasDropTarget.ts');document.addEventListener('mouseup',e=>{const p={x:e.clientX,y:e.clientY};window.lastCanvasDrop={p,target:dropHelper.canvasDropTarget(document.querySelector('.react-flow'),p),hit:document.elementFromPoint(p.x,p.y)?.className,regions:[...document.querySelectorAll('.react-flow__node')].map(n=>{const r=n.querySelector('.device-interaction-region')?.getBoundingClientRect();return{id:n.dataset.id,x:r?.x,y:r?.y,width:r?.width,height:r?.height};})};},true);");
    const hoverDevices = [dev('r3', 'router', 0, 0, 3), dev('r4', 'router', 450, 0), dev('pc', 'host', 0, 380), dev('sw', 'switch', 450, 380), dev('server', 'server', 650, 180)];
    if (process.env.NETLAB_CANVAS_ACTION_MINIMUM_REVIEW === '1') {
      await setup(hoverDevices); const rows = [];
      for (const zoom of [.25, .5, .65, 1]) {
        await viewport(zoom); await delay(100);
        const original = await geometry();
        const inspect = () => page.evaluate("const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}};return [...document.querySelectorAll('.react-flow__node')].map(n=>({id:n.dataset.id,region:rect(n.querySelector('.device-interaction-region')),buttons:[...n.querySelectorAll('.device-action')].map(rect)}));");
        const after = await inspect();
        await page.evaluate("window.minimumBefore=document.createElement('style');minimumBefore.textContent='.device-actions{--device-action-scale:1!important}';document.head.append(minimumBefore);");
        const before = await inspect();
        await writeFile(path.join(output, 'hover-button-metrics-live.json'), JSON.stringify({ zoom, before, after }, null, 2));
        const hover = await page.evaluate("const r=document.querySelector('.react-flow__node[data-id=r4] .device-artwork').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};"); await move(hover.x, hover.y); await delay(180);
        if (zoom === .25) await shot('08-hover-25-antes');
        await page.evaluate('minimumBefore.remove();'); await delay(80);
        if (zoom === .25) await shot('09-hover-25-botoes-acessiveis');
        const current = await geometry();
        assert.deepEqual(current.map(({ buttons, ...rest }) => rest), original.map(({ buttons, ...rest }) => rest));
        // Exercise IP-copy separately, without writing to the user's clipboard.
        await page.evaluate("window.copiedIPs=[];Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{copiedIPs.push(text)}}});");
        for (const id of ['r4', 'pc']) {
          const ipPoint = await page.evaluate(`const b=document.querySelector('.react-flow__node[data-id=${id}] .copy-ip'),r=b.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;if(document.elementFromPoint(x,y)?.closest('.copy-ip')!==b)throw Error('IP copy target obstructed');return{x,y};`);
          await move(ipPoint.x, ipPoint.y); for (const type of ['mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, ...ipPoint, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 });
          await delay(40);
        }
        assert.deepEqual(await page.evaluate('return copiedIPs;'), ['192.168.10.1', '192.168.10.1']); assert.equal(await page.evaluate('return sim.net.links.size;'), 0);
        for (const n of after) {
          const b = before.find(b => b.id === n.id); assert.deepEqual(n.region, b.region);
          if (n.buttons.length) {
            assert(n.buttons[0].x + n.buttons[0].width <= n.buttons[1].x - 3.9);
            for (const r of n.buttons) { if (zoom < 1) { assert(r.width > b.buttons[0].width + .1, JSON.stringify({ id: n.id, zoom, r, before: b.buttons[0] })); assert(r.width <= 24.1); } assert(r.x >= n.region.x - .1 && r.x + r.width <= n.region.x + n.region.width + .1); }
            if (zoom === 1) assert.deepEqual(n.buttons, b.buttons);
          }
        }
        assert.equal(after.find(n => n.id === 'sw').buttons.length, 0);
        // Click the expanded part that lay outside the former tiny button.
        for (const id of ['r4', 'pc']) {
          const button = after.find(n => n.id === id).buttons[0], p = { x: button.x + button.width / 2, y: button.y + button.height / 2 };
          const art = await page.evaluate(`const r=document.querySelector('.react-flow__node[data-id=${id}] .device-artwork').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};`); await move(art.x, art.y); await delay(80); await move(p.x, p.y); await delay(60);
          for (const type of ['mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, ...p, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 });
          await wait(`store.getState().terminals.includes('${id}')`); await page.evaluate(`store.getState().closeTerminal('${id}');`); await delay(100);
        }
        const ping = after.find(n => n.id === 'r4').buttons[1], p = { x: ping.x + ping.width / 2, y: ping.y + ping.height / 2 }; await move(hover.x, hover.y); await delay(80); await move(p.x, p.y); await delay(60);
        for (const type of ['mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, ...p, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 });
        await wait("store.getState().quickPing?.sourceId==='r4'"); await page.evaluate('store.getState().cancelQuickPing();');
        rows.push({ zoom, before, after });
      }
      await writeFile(path.join(output, 'hover-button-metrics.json'), JSON.stringify(rows, null, 2)); report.results['canvas minimum targets: low zoom, real terminal/ping clicks, fixed node/drop geometry and normal zoom'] = { passed: true, zooms: rows.length }; return;
    }
    if (process.env.NETLAB_CANVAS_HOVER_EVIDENCE_ONLY === '1') {
      // Reproduce the former hitbox without touching source files: the only
      // difference is disabling the new transparent interaction region.
      await setup(hoverDevices); await viewport(.5); const original = await geometry();
      await page.evaluate("window.priorHoverStyle=document.createElement('style');priorHoverStyle.textContent='.device-interaction-region{pointer-events:none!important}';document.head.append(priorHoverStyle);");
      const coords = await page.evaluate("const n=document.querySelector('.react-flow__node[data-id=r4]'),a=n.querySelector('.device-artwork').getBoundingClientRect(),b=n.querySelector('.device-terminal').getBoundingClientRect();return{a:{x:a.x+a.width/2,y:a.y+a.height/2},b:{x:b.x+b.width/2,y:b.y+b.height/2}};");
      const visible = () => page.evaluate("return getComputedStyle(document.querySelector('.react-flow__node[data-id=r4] .device-terminal')).pointerEvents==='auto';");
      await move(coords.a.x, coords.a.y); await delay(160); let gap;
      for (let i = 1; i < 18; i++) { const p = { x: coords.a.x + (coords.b.x - coords.a.x) * i / 18, y: coords.a.y + (coords.b.y - coords.a.y) * i / 18 }; await move(p.x, p.y); await delay(30); if (!await visible()) { gap = p; break; } }
      assert(gap, 'Former selection hitbox has a reproducible gap'); await delay(180); assert(!await visible()); await shot('01-hover-router-antes');
      await page.evaluate('priorHoverStyle.remove();'); await move(1400, 950); await move(coords.a.x, coords.a.y); await delay(160); await move(gap.x, gap.y); await delay(180); assert(await visible()); await shot('02-hover-router-corrigido');
      assert.deepEqual(await geometry(), original);
      const evidence = { passed: true, zoom: .5, point: gap, beforeInteractive: false, afterInteractive: true, identicalGeometry: true, baseline: 'Former hitbox reproduced by disabling only the new transparent region' };
      await writeFile(path.join(output, 'hover-evidence.json'), JSON.stringify(evidence, null, 2)); report.results['canvas interaction: hover before/after at the same gap'] = evidence; return;
    }
    if (process.env.NETLAB_CANVAS_CABLES_ONLY !== '1') {
    await setup(hoverDevices);
    for (const zoom of [.25, .5, .65, 1, 1.25]) {
      await viewport(zoom); const original = await geometry();
      for (const id of ['r3', 'r4', 'pc', 'server']) for (const button of ['device-terminal', 'device-ping']) for (const bend of [0, -10, 10]) {
        await move(1400, 950); await delay(170);
        const coords = await page.evaluate(`const n=document.querySelector('.react-flow__node[data-id="${id}"]'),a=n.querySelector('.device-artwork').getBoundingClientRect(),b=n.querySelector('.${button}').getBoundingClientRect();return{a:{x:a.x+a.width/2,y:a.y+a.height/2},b:{x:b.x+b.width/2,y:b.y+b.height/2}};`);
        await move(coords.a.x, coords.a.y); await delay(160); let failures = 0;
        for (let i = 1; i <= 18; i++) { const t = i / 18; await move(coords.a.x + (coords.b.x - coords.a.x) * t, coords.a.y + (coords.b.y - coords.a.y) * t + Math.sin(t * Math.PI) * bend * zoom); await delay(12); if (!await page.evaluate(`const b=document.querySelector('.react-flow__node[data-id="${id}"] .${button}');return getComputedStyle(b).pointerEvents==='auto';`)) failures++; }
        hoverResults.push({ zoom, id, button, bend, failures });
        if (id === 'r4' && button === 'device-terminal' && zoom === 1 && bend === 0) await shot(before ? '01-hover-router-antes' : '02-hover-router-corrigido');
      }
      assert.deepEqual(await geometry(), original, 'Hover must preserve all node/asset/handle/label/control geometry');
      await move(1400, 950); await delay(180); assert(await page.evaluate("return [...document.querySelectorAll('.device-action')].every(b=>getComputedStyle(b).pointerEvents==='none');"));
    }
    await writeFile(path.join(output, phase + '-hover.json'), JSON.stringify(hoverResults, null, 2));
    } else hoverResults.push(...JSON.parse(await readFile(path.join(output, phase + '-hover.json'), 'utf8')));
    if (!before) assert(hoverResults.every(r => r.failures === 0), 'Continuous paths to controls stay interactive');
    for (const [sourceKind, targetKind] of [['host', 'switch'], ['switch', 'router'], ['router', 'router'], ['host', 'server']]) {
      await setup([dev('source', sourceKind, 0, 0), dev('target', targetKind, 420, 0)]);
      for (const zoom of [.25, .5, .65, 1, 1.25]) for (const drop of ['asset', 'left', 'right', 'caption', 'bottom', 'outside']) {
        // Keep independent targets apart in screen space at low zoom. A
        // deliberate overlap is checked separately and must be rejected.
        await page.evaluate(`store.getState().onNodesChange([{id:'target',type:'position',position:{x:${420 / Math.min(1, zoom)},y:0}}]);`);
        await viewport(zoom);
        const hover = await page.evaluate("const r=document.querySelector('.react-flow__node[data-id=target] .device-artwork').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};"); await move(hover.x, hover.y); await delay(30);
        const points = await page.evaluate(`const n=document.querySelector('.react-flow__node[data-id=target]'),c=n.querySelector('.device-node'),r=c.getBoundingClientRect(),z=flow.getZoom(),s=getComputedStyle(c),outline=getComputedStyle(c,'::after'),p=c.querySelector('.device-artwork').getBoundingClientRect(),label=c.querySelector('.device-label-content').getBoundingClientRect(),h=document.querySelector('.react-flow__node[data-id=source] .react-flow__handle-right').getBoundingClientRect();const frame={left:r.left+(1+parseFloat(s.getPropertyValue('--device-selection-left'))*-1)*z,right:r.right+(parseFloat(s.getPropertyValue('--device-selection-right'))-1)*z,top:r.top+(1+parseFloat(outline.top))*z,bottom:r.bottom+(parseFloat(s.getPropertyValue('--device-selection-bottom'))-1)*z};let target={x:p.x+p.width/2,y:p.y+p.height/2};if('${drop}'==='left')target={x:frame.left+2*z,y:frame.top+(frame.bottom-frame.top)*.5};if('${drop}'==='right')target={x:frame.right-2*z,y:frame.top+(frame.bottom-frame.top)*.5};if('${drop}'==='caption')target={x:label.x+label.width/2,y:label.y+label.height*.7};if('${drop}'==='bottom')target={x:(frame.left+frame.right)/2,y:frame.bottom-2*z};if('${drop}'==='outside')target={x:frame.right+80,y:frame.top-60};return{source:{x:h.x+h.width/2,y:h.y+h.height/2},target,expected:[sim.net.devices.get('source').freeInterface()?.name,sim.net.devices.get('target').freeInterface()?.name]};`);
        await drag(points.source, points.target);
        const links = await page.evaluate("return [...sim.net.links.values()].map(l=>({id:l.id,a:[l.a.device.id,l.a.name],b:[l.b.device.id,l.b.name]}));");
        cableResults.push({ sourceKind, targetKind, zoom, drop, connected: links.length === 1 });
        if (!before) assert.equal(links.length, drop === 'outside' ? 0 : 1, JSON.stringify({ ...cableResults.at(-1), points, diagnostic: await page.evaluate('return lastCanvasDrop;') }));
        if (sourceKind === 'router' && targetKind === 'router' && zoom === 1 && drop === 'asset') await shot(before ? '03-cabo-no-asset-antes' : '04-cabo-no-asset-corrigido');
        if (links.length) { assert.equal(links.length, 1, 'One gesture creates only one connection'); assert.deepEqual([links[0].a[1], links[0].b[1]], points.expected); await page.evaluate(`store.getState().onEdgesChange([{type:'remove',id:${JSON.stringify(links[0].id)}}]);`); }
      }
    }
    await writeFile(path.join(output, phase + '-cables.json'), JSON.stringify(cableResults, null, 2));
    if (!before) {
      const point = selector => page.evaluate(`const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};`);
      const attempt = async (count, target = '.react-flow__node[data-id=target] .device-artwork') => {
        await viewport(1); const oldPorts = await page.evaluate("return [...sim.net.devices.values()].map(d=>[d.id,d.interfaces.map(i=>i.name)]);");
        await drag(await point('.react-flow__node[data-id=source] .react-flow__handle-right'), await point(target));
        assert.equal(await page.evaluate('return sim.net.links.size;'), count); assert.deepEqual(await page.evaluate("return [...sim.net.devices.values()].map(d=>[d.id,d.interfaces.map(i=>i.name)]);"), oldPorts);
      };
      const occupied = [dev('source', 'router', 0, 0), dev('target', 'router', 420, 0), ...Array.from({ length: 4 }, (_, i) => dev('dummy' + i, 'host', i * 250, 700))];
      await setup(occupied); await page.evaluate("for(let i=0;i<3;i++)sim.net.connect('target','dummy'+i);store.getState().refresh();"); await attempt(4);
      assert.equal(await page.evaluate("return [...sim.net.links.values()].find(l=>l.a.device.id==='source').b.name;"), 'eth3');
      await setup(occupied); await page.evaluate("for(let i=0;i<4;i++)sim.net.connect('target','dummy'+i);store.getState().refresh();"); await attempt(4);
      await setup([dev('source', 'host', 0, 0), dev('target', 'router', 420, 0), dev('dummy', 'switch', 0, 700)]); await page.evaluate("sim.net.connect('source','dummy');store.getState().refresh();"); await attempt(1);
      await setup([dev('source', 'router', 0, 0), dev('target', 'router', 420, 0), dev('overlap', 'router', 425, 0)]); await attempt(0);
      await setup([dev('source', 'router', 0, 0), dev('target', 'router', 420, 0)]); await attempt(1, '.react-flow__node[data-id=target] .react-flow__handle-left');
      await setup([dev('source', 'router', 0, 0), dev('target', 'router', 420, 0)]); await viewport(1);
      const target = await point('.react-flow__node[data-id=target] .device-artwork'); await drag(await point('.react-flow__node[data-id=source] .react-flow__handle-right'), { x: target.x, y: target.y - 180 }); assert.equal(await page.evaluate('return sim.net.links.size;'), 0);
      for (const selector of ['.react-flow__node[data-id=source] .react-flow__handle-right', '.react-flow__node[data-id=target] .react-flow__handle-left']) { const p = await point(selector); await move(p.x, p.y); for (const type of ['mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, ...p, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 }); await delay(70); }
      assert.equal(await page.evaluate('return sim.net.links.size;'), 1, 'Click-connect still creates exactly one cable');
      report.results['canvas interaction: capacity, ambiguity, exact handles and click-connect'] = { passed: true };
    }
    report.results['canvas interaction: ' + phase] = { passed: true, hoverPaths: hoverResults.length, hoverFailures: hoverResults.filter(r => r.failures).length, cableAttempts: cableResults.length, validMisses: cableResults.filter(r => r.drop !== 'outside' && !r.connected).length };
  } catch (error) { await shot('failure-' + phase).catch(() => {}); throw error; }
  finally { await page.evaluate('workspace.dispose();'); await page.evaluate(`await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase(${JSON.stringify(database)});r.onsuccess=resolve;r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Canvas cleanup blocked'));});`); }
}
