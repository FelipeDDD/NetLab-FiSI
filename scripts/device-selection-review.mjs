import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { generateReview } from './visual-review.mjs';

export async function runDeviceSelectionReview({ page, url, root, report }) {
  // Set NETLAB_DEVICE_SELECTION_REVIEW=before before editing for an A/B review.
  // A clean checkout can still run all current-layout/interaction checks.
  const phase = process.env.NETLAB_DEVICE_SELECTION_REVIEW;
  const directory = path.join(root, process.env.NETLAB_DEVICE_SELECTION_NO_PUBLISH
    ? '.playwright-mcp/reviews/raw/device-selection-tuning-verification'
    : '.playwright-mcp/reviews/raw/device-selection-restoration-staging');
  const referenceDirectory = path.join(root, '.playwright-mcp/reviews/raw/device-selection-staging');
  const database = 'netlab-idb-test-' + crypto.randomUUID(), captures = [];
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const wait = async expression => {
    for (let i = 0; i < 200; i++) { if (await page.evaluate('return !!(' + expression + ');')) return; await delay(40); }
    throw Error('Device selection condition: ' + expression);
  };
  const test = async (name, fn) => { await fn(); report.results['device selection: ' + name] = { passed: true }; };
  const baseline = async name => {
    try { return JSON.parse(await readFile(path.join(referenceDirectory,name),'utf8')); }
    catch(error) { if(error.code==='ENOENT')return []; throw error; }
  };
  const click = async selector => {
    const at = await page.evaluate(`const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing '+${JSON.stringify(selector)});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};`);
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, ...at, ...(type === 'mouseMoved' ? {} : { button: 'left', clickCount: 1 }) });
    await delay(90);
  };
  const metrics = () => page.evaluate(`return [...document.querySelectorAll('.react-flow__node')].map(node=>{
    const card=node.querySelector('.device-node'),svg=node.querySelector('.device-artwork'),labels=node.querySelector('.device-label-content'),r=card.getBoundingClientRect(),s=svg.getBoundingClientRect(),l=labels.getBoundingClientRect(),outline=getComputedStyle(card,'::after'),z=flow.getZoom(),matrix=new DOMMatrix(outline.transform);
    const rect=r=>({x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right});
    const extra=outline.boxSizing==='border-box'?0:parseFloat(outline.borderLeftWidth)+parseFloat(outline.borderRightWidth);
    return{id:node.dataset.id,node:rect(r),art:rect(s),labels:rect(l),background:getComputedStyle(card).backgroundColor,fill:outline.backgroundColor,outline:{left:parseFloat(outline.left)+parseFloat(getComputedStyle(card).borderLeftWidth)+matrix.m41,top:parseFloat(outline.top)+parseFloat(getComputedStyle(card).borderTopWidth)+matrix.m42,width:parseFloat(outline.width)+extra,height:parseFloat(outline.height)+extra},handles:[...card.querySelectorAll('.react-flow__handle')].map(h=>{const b=h.getBoundingClientRect(),p=getComputedStyle(h,'::before'),w=parseFloat(p.width)*z,hh=parseFloat(p.height)*z;return{id:h.dataset.handleid,...rect(b),dot:{x:b.x+(b.width-w)/2,y:b.y+(b.height-hh)/2,width:w,height:hh},dotOpacity:p.opacity};}),zoom:z};});`);
  await mkdir(directory, { recursive: true });
  try {
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await page.send('Page.navigate', { url }); await wait("document.readyState==='complete'&&document.getElementById('root')");
    await page.evaluate(`window.store=(await import('/src/store.ts')).useStore;window.sim=(await import('/src/sim.ts')).sim;window.theme=(await import('/src/uiTheme.ts')).useUiTheme;window.art=await import('/src/deviceArtwork.ts');window.cable=await import('/src/cableGeometry.ts');
      const {Network}=await import('/src/engine/network.ts'),{createDevice}=await import('/src/engine/factory.ts'),{serializeNetwork}=await import('/src/engine/serialize.ts'),{disposeNetwork}=await import('/src/engine/networkLifecycle.ts'),{savePalettePreference}=await import('/src/paletteLayout.ts');
      savePalettePreference({collapsed:true,tab:'devices',collapsedCategories:[]});
      (await import('/src/canvasBackground.ts')).useCanvasBackground.getState().update({choice:'bg3',intensity:100,dots:false,animation:'off'});
      const net=new Network(),positions={};
      for(const [i,kind] of ['host','notebook','router','server','switch','firewall','ap','smartphone'].entries()){
        const d=createDevice(net,kind,{id:kind,name:kind==='host'?'PC Linux':kind==='notebook'?'Notebook':kind==='ap'?'Wi-Fi AP':kind[0].toUpperCase()+kind.slice(1),os:'linux',switchPorts:24});
        positions[kind]={x:110+(i%4)*285,y:i<4?125:440};
        if(kind!=='switch'&&kind!=='ap')d.addIp(d.interfaces[0].name,0xc0a80a0a+i,24);
      }
      for(const id of ['host','notebook','router','server','firewall','ap'])net.connect(id,'switch');
      const topology=serializeNetwork(net,positions);disposeNetwork(net);
      window.workspace=await (await import('/src/workspace/reviewEntry.tsx')).mountWorkspaceReview(document.getElementById('root'),{databaseName:${JSON.stringify(database)}});
      const opened=await workspace.controller.openDocument({schemaVersion:1,topology});if(!opened.ok)throw Error(JSON.stringify(opened));
      store.getState().select(null);store.getState().setTerminalDockCollapsed(true);store.getState().setPaused(true);
      window.flow=(await import('/src/workspace/viewportProbe.browser.tsx')).getViewportProbe();`);
    await wait('store.getState().nodes.length===8&&store.getState().nodes.every(n=>n.measured?.height)'); await delay(350);
    await page.evaluate(`window.original=store.getState().nodes.map(n=>({id:n.id,position:n.position,measured:n.measured}));window.paths=()=>Object.fromEntries([...document.querySelectorAll('.react-flow__edge')].map(e=>[e.dataset.id,e.querySelector('.react-flow__edge-path').getAttribute('d')]));window.originalPaths=paths();`);
    const measurements = [];
    for (const theme of ['graphite-dark', 'classic-light']) for (const zoom of [1, .5]) {
      await page.evaluate(`theme.getState().setTheme(${JSON.stringify(theme)});await flow.setViewport({x:35,y:25,zoom:${zoom}});store.getState().onNodesChange(store.getState().nodes.map(n=>({id:n.id,type:'select',selected:true})));`);
      await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1400, y: 950 }); await delay(160);
      const measured = await metrics(); measurements.push({ theme, zoom, nodes: measured });
      assert(Math.abs(await page.evaluate('return flow.getZoom();') - zoom) < .001);
      assert.deepEqual(await page.evaluate('return store.getState().nodes.map(n=>({id:n.id,position:n.position,measured:n.measured}));'), await page.evaluate('return original;'));
      assert.deepEqual(await page.evaluate('return paths();'), await page.evaluate('return originalPaths;'));
      if (phase === 'after') for (const m of measured) {
        assert.equal(m.handles.length, 4);
        assert.equal(m.background, 'rgba(0, 0, 0, 0)', 'Selection fill must be painted only in the existing border: ' + m.id);
        assert(m.fill!=='rgba(0, 0, 0, 0)'&&m.fill.includes('0.12'), 'The entire selection border needs its 12% fill: '+m.id);
        const frame = { x: m.node.x + m.outline.left * zoom, y: m.node.y + m.outline.top * zoom, width: m.outline.width * zoom, height: m.outline.height * zoom };
        assert(frame.y+frame.height>=m.labels.bottom+4*zoom, 'Original border must still surround the complete caption: '+m.id);
        for (const h of m.handles) assert(h.width / zoom >= 18 && h.height / zoom >= 18, 'Handle hit target: ' + m.id);
        const h=m.handles.find(h=>h.id==='b');
        assert(Math.abs(h.x+h.width/2-(frame.x+frame.width/2))<.1,'Bottom handle must be horizontally centered in the original border: '+m.id);
        assert(Math.abs(h.y+h.height/2-(frame.y+frame.height))<.1,'Bottom handle must meet the lower border: '+m.id);
        // The standard 13px dot may extend 1.5px into the caption's line box;
        // the border and label positions remain unchanged.
        assert(h.dot.y+1.5*zoom+.1>=m.labels.bottom&&h.dot.y>=m.art.bottom, 'Bottom dot overlaps artwork or caption: '+m.id);
        assert(Math.abs(h.dot.width/zoom-13)<.05, 'Bottom dot must match the other handles: '+m.id);
        assert(await page.evaluate(`const n=document.querySelector('[data-id="${m.id}"]'),r=n.getBoundingClientRect(),h=n.querySelector('[data-handleid=b]').getBoundingClientRect(),cached=flow.getInternalNode(${JSON.stringify(m.id)}).internals.handleBounds.source.find(h=>h.id==='b');return Math.abs(cached.x-(h.x-r.x)/flow.getZoom())<.2&&Math.abs(cached.y-(h.y-r.y)/flow.getZoom())<.2;`),'React Flow must use the displayed handle bounds: '+m.id);
      }
      const scene = `${theme}-${zoom === 1 ? '100' : '50'}`, name = `${phase}-${scene}`;
      const png = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      await writeFile(path.join(directory, name + '.png'), Buffer.from(png.data, 'base64'));
      captures.push({ source: path.relative(root, path.join(directory, name + '.png')).split(path.sep).join('/'), scene, variant: phase, state: 'selected', width: 1440, height: 1000 });
      if (zoom === 1) for (const id of ['switch', 'router']) {
        const at = await page.evaluate(`const r=document.querySelector('[data-id="${id}"] .device-artwork').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};`);
        await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...at }); await delay(180);
        const r = measured.find(n => n.id === id).art;
        const clip = { x: Math.floor(r.x - 30), y: Math.floor(r.y - 30), width: Math.ceil(r.width + 60), height: Math.ceil(r.height + 100), scale: 2 };
        const scene = `${theme}-${id}-hover-100`, filename = `${phase}-${scene}.png`;
        const png = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, clip });
        await writeFile(path.join(directory, filename), Buffer.from(png.data, 'base64'));
        captures.push({source:path.relative(root,path.join(directory,filename)).split(path.sep).join('/'),scene,variant:phase,state:'hover',width:clip.width*2,height:clip.height*2});
      }
    }
    await writeFile(path.join(directory, phase + '-metrics.json'), JSON.stringify(measurements, null, 2));
    await writeFile(path.join(directory, phase + '-captures.json'), JSON.stringify(captures));
    if (phase === 'after') {
      await test('borders retain their reference geometry with a 4px top margin on Switch; selection fill and handles align', async () => {
        const before = await baseline('before-metrics.json');
        if(!before.length)return;
        for (let i = 0; i < measurements.length; i++) for (const n of measurements[i].nodes) {
          const old = before[i].nodes.find(b => b.id === n.id);
          for (const box of ['node','art','labels']) for (const key of ['x','y','width','height']) assert(Math.abs(n[box][key]-old[box][key]) < .05, `Layout changed: ${n.id}/${box}/${key}`);
          for(const key of ['left','top','width','height']){const delta=(key==='width'||key==='height'?2:0)+(n.id==='switch'&&key==='top'?-4:n.id==='switch'&&key==='height'?4:0);assert(Math.abs(n.outline[key]-old.outline[key]-delta)<.05,`Unexpected border change: ${n.id}/${key}`);}
          for(const id of ['t','l','r']){const h=n.handles.find(h=>h.id===id),previous=old.handles.find(h=>h.id===id);for(const key of ['x','y','width','height']){const delta=n.id==='switch'&&id==='t'&&key==='y'?-4*measurements[i].zoom:0;assert(Math.abs(h[key]-previous[key]-delta)<.05,`Unexpected handle change: ${n.id}/${id}/${key}`);}}
        }
      });
      const point = selector => page.evaluate(`const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};`);
      const drag = async (a, b) => {
        await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',...a});
        await page.send('Input.dispatchMouseEvent',{type:'mousePressed',...a,button:'left',buttons:1,clickCount:1});
        for(let i=1;i<=12;i++)await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:a.x+(b.x-a.x)*i/12,y:a.y+(b.y-a.y)*i/12,buttons:1});
        await page.send('Input.dispatchMouseEvent',{type:'mouseReleased',...b,button:'left',buttons:0,clickCount:1}); await delay(120);
      };
      await test('contextual handles connect by click/drag in all four switch directions, retaining 24 real interfaces and visual slots', async () => {
        await page.evaluate(`theme.getState().setTheme('graphite-dark');store.getState().select(null);store.getState().onNodesChange(store.getState().nodes.map(n=>({id:n.id,type:'select',selected:false})));await flow.setViewport({x:35,y:25,zoom:1});`);
        await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:1400,y:950}); await delay(180);
        assert((await metrics()).every(n=>n.handles.every(h=>Number(h.dotOpacity)===0)), 'Idle handles should remain contextual');
        const current = await point('[data-id="router"] .device-artwork'); await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',...current}); await delay(180);
        assert((await metrics()).find(n=>n.id==='router').handles.every(h=>Number(h.dotOpacity)>0));
        for(const [source,from,to,mode] of [['router','b','t','drag'],['router','l','b','click'],['firewall','r','r','drag'],['ap','l','l','drag']]){
          const old = await page.evaluate('return sim.net.links.size;');
          const a=`[data-id="${source}"] .react-flow__handle[data-handleid="${from}"]`,b=`[data-id="switch"] .react-flow__handle[data-handleid="${to}"]`;
          if(mode==='drag')await drag(await point(a),await point(b));else{await click(a);await click(b);}
          await wait(`sim.net.links.size===${old+1}`);
        }
        assert.equal(await page.evaluate("return sim.net.devices.get('switch').interfaces.length;"),24);
        assert.equal(await page.evaluate("return store.getState().edges.filter(e=>e.source==='switch'||e.target==='switch').length;"),10);
        assert.deepEqual(await page.evaluate('return store.getState().nodes.map(n=>({id:n.id,position:n.position,measured:n.measured}));'),await page.evaluate('return original;'));
        assert(await page.evaluate("const s=store.getState(),sw=s.nodes.find(n=>n.id==='switch'),slots=s.edges.filter(e=>e.source==='switch'||e.target==='switch').map(e=>art.linkAttachment(sw,e.id,s.nodes,s.edges).visualSlot);return new Set(slots).size===10;"));
      });
      await test('cable selection and reconnect preserve link identity/color; cancellation preserves configuration', async () => {
        await page.evaluate("window.selectedLink=store.getState().edges.find(e=>e.source==='router'&&e.target==='switch').id;store.getState().setCableColor(selectedLink,'purple');window.reconnectColor=structuredClone(store.getState().cableColors[selectedLink]);store.getState().onEdgesChange([{id:selectedLink,type:'select',selected:true}]);window.beforeReconnect=store.getState().captureWorkspaceDocument();store.getState().beginCableReconnect(selectedLink,'b');");
        await wait('store.getState().reconnectingCable');
        for(const type of ['keyDown','keyUp'])await page.send('Input.dispatchKeyEvent',{type,key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
        await wait('!store.getState().reconnectingCable');
        assert.deepEqual(await page.evaluate('return store.getState().captureWorkspaceDocument();'),await page.evaluate('return beforeReconnect;'));
        await page.evaluate("store.getState().beginCableReconnect(selectedLink,'b');");await click('[data-id="firewall"] .dev-icon');await wait('!store.getState().reconnectingCable');
        assert(await page.evaluate("const l=sim.net.links.get(selectedLink);return l.a.device.id==='router'&&l.b.device.id==='firewall';"));
        assert.deepEqual(await page.evaluate('return store.getState().cableColors[selectedLink];'),await page.evaluate('return reconnectColor;'));
      });
      await test('sprite selection and group dragging remain usable without panning or resizing the nodes', async () => {
        await page.evaluate("store.getState().select(null);store.getState().onNodesChange(store.getState().nodes.map(n=>({id:n.id,type:'select',selected:false})));store.getState().beginQuickPing('host');");
        assert(await page.evaluate("const n=document.querySelector('[data-id=host] .device-node');return n.matches('.quick-ping-source:not(.selected)')&&getComputedStyle(n).boxShadow!=='none';"));
        await page.evaluate('store.getState().cancelQuickPing();');
        await page.evaluate("store.getState().select(null);store.getState().onEdgesChange(store.getState().edges.map(e=>({id:e.id,type:'select',selected:false})));store.getState().onNodesChange(store.getState().nodes.map(n=>({id:n.id,type:'select',selected:true})));window.beforeDrag=store.getState().nodes.map(n=>({id:n.id,position:n.position,measured:n.measured}));window.beforeViewport=flow.getViewport();");
        const a=await point('[data-id="switch"] .dev-icon');await drag(a,{x:a.x+25,y:a.y+20});
        const before=await page.evaluate('return beforeDrag;'),after=await page.evaluate('return store.getState().nodes.map(n=>({id:n.id,position:n.position,measured:n.measured}));');
        const dx=after[0].position.x-before[0].position.x,dy=after[0].position.y-before[0].position.y;assert(dx>0&&dy>0);
        for(const n of after){const old=before.find(b=>b.id===n.id);assert.equal(n.position.x-old.position.x,dx);assert.equal(n.position.y-old.position.y,dy);assert.deepEqual(n.measured,old.measured);}
        assert.deepEqual(await page.evaluate('return flow.getViewport();'),await page.evaluate('return beforeViewport;'));
      });
      const before = await baseline('before-captures.json');
      // Canvas close-ups are identical across UI themes; keep one comparison
      // instead of duplicating the same PNG under two theme/state records.
      const all = [...before, ...captures].filter(c=>c.state!=='hover'||c.scene.startsWith('graphite-dark-')), manifest = path.join(directory, 'manifest.json');
      await writeFile(manifest, JSON.stringify({id:'device-selection-restored-borders',title:'Original borders, corrected selection fill and lower handles',variants:[{id:'before',label:'Original reference'},{id:'after',label:'Corrected fill/handle'}],states:['selected','hover'],captures:all,share:all.filter(c=>['graphite-dark-100','graphite-dark-switch-hover-100','classic-light-50'].includes(c.scene)).map(c=>({...c,name:`${c.variant}-${c.scene}`})),shareContactSheet:false}));
      if(!process.env.NETLAB_DEVICE_SELECTION_NO_PUBLISH) report.deviceSelectionReview = await generateReview(manifest);
    }
  } finally {
    await page.evaluate(`window.workspace?.dispose();const r=indexedDB.deleteDatabase(${JSON.stringify(database)});await new Promise((resolve,reject)=>{r.onsuccess=resolve;r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Disposable device review database blocked'));});`);
  }
}
