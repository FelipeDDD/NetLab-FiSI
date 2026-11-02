import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { generateReview } from './visual-review.mjs';

export async function runArtworkOffsetReview({ page, url, root, report }) {
  const database = 'netlab-idb-test-' + crypto.randomUUID();
  const directory = path.join(root, '.playwright-mcp/reviews/raw/artwork-offset-staging');
  await mkdir(directory, { recursive: true });
  const captures = [], delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const wait = async expression => {
    for (let i = 0; i < 180; i++) { if (await page.evaluate('return !!(' + expression + ');')) return; await delay(40); }
    throw Error('Artwork condition: ' + expression);
  };
  const shot = async (name, state, zoom) => {
    const png = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(path.join(directory, name + '.png'), Buffer.from(png.data, 'base64'));
    captures.push({ source: path.relative(root, path.join(directory, name + '.png')).split(path.sep).join('/'), scene: name, variant: 'graphite-dark', state, width: 1440, height: 760, zoom });
  };
  try {
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 760, deviceScaleFactor: 1, mobile: false });
    await page.send('Page.navigate', { url }); await wait("document.readyState==='complete'&&document.getElementById('root')");
    await page.evaluate(`window.entry=await import('/src/workspace/reviewEntry.tsx');window.store=(await import('/src/store.ts')).useStore;window.sim=(await import('/src/sim.ts')).sim;window.theme=(await import('/src/uiTheme.ts')).useUiTheme;window.probe=await import('/src/workspace/viewportProbe.browser.tsx');window.art=await import('/src/deviceArtwork.ts');window.align=await import('/src/alignmentGuides.ts');window.cable=await import('/src/cableGeometry.ts');(await import('/src/alignmentPreferences.ts')).useAlignmentPreference.getState().setEnabled(true);
      const {Network}=await import('/src/engine/network.ts'),{createDevice}=await import('/src/engine/factory.ts'),{parseIp}=await import('/src/engine/ip.ts'),{serializeNetwork}=await import('/src/engine/serialize.ts'),{disposeNetwork}=await import('/src/engine/networkLifecycle.ts');
      const net=new Network(),pc=createDevice(net,'host',{id:'pc',name:'PC'}),router=createDevice(net,'router',{id:'router',name:'Router'}),server=createDevice(net,'server',{id:'server',name:'Server'});
      pc.addIp('eth0',parseIp('192.168.1.10'),24);router.addIp('eth0',parseIp('192.168.1.1'),24);router.addIp('eth1',parseIp('192.168.2.1'),24);server.addIp('eth0',parseIp('192.168.2.20'),24);router.forwarding=true;
      pc.addRoute(0,0,parseIp('192.168.1.1'),'eth0');server.addRoute(0,0,parseIp('192.168.2.1'),'eth0');net.connect('pc','router',{aIface:'eth0',bIface:'eth0'});net.connect('router','server',{aIface:'eth1',bIface:'eth0'});
      const topology=serializeNetwork(net,{pc:{x:100,y:100},router:{x:400,y:100},server:{x:700,y:100}});disposeNetwork(net);
      window.workspace=await entry.mountWorkspaceReview(document.getElementById('root'),{databaseName:${JSON.stringify(database)}});
      const opened=await workspace.controller.openDocument({schemaVersion:1,topology});if(!opened.ok)throw Error(JSON.stringify(opened));theme.getState().setTheme('graphite-dark');window.flow=probe.getViewportProbe();`);
    await wait("document.querySelectorAll('.react-flow__node').length===3&&store.getState().nodes.every(n=>n.measured?.height)"); await delay(150);
    await page.evaluate(`store.getState().onNodesChange(store.getState().nodes.map(n=>({type:'position',id:n.id,position:{x:n.position.x,y:250-align.getVisualAlignmentPoint({...n,position:{x:0,y:0}}).y}})));await flow.setViewport({x:60,y:40,zoom:1});`);
    await page.send('Page.bringToFront'); await delay(120);
    // Move the server slightly off the guide, then use the real mouse drag so
    // React Flow and useAlignmentGuides perform the snap just as in the app.
    await page.evaluate(`const n=store.getState().nodes.find(n=>n.id==='server');store.getState().onNodesChange([{id:'server',type:'position',position:{x:n.position.x,y:n.position.y+6}}]);`);
    const point = await page.evaluate(`const r=document.querySelector('[data-id="server"] .device-artwork').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};`);
    await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',...point});
    await page.send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',buttons:1,clickCount:1});
    await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x+10,y:point.y-1,button:'left',buttons:1});
    await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x+16,y:point.y-1,button:'left',buttons:1});
    await wait("document.querySelector('.alignment-guides-layer line')"); await delay(80);
    await shot('router-server-guide', 'selected', 1);
    await page.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x+16,y:point.y-1,button:'left',buttons:0,clickCount:1});
    await wait("!document.querySelector('.alignment-guides-layer line')"); await delay(100);
    const delta = await page.evaluate(`const {nodes,edges}=store.getState(),r=nodes.find(n=>n.id==='router'),s=nodes.find(n=>n.id==='server'),edge=edges.find(e=>(e.source==='router'&&e.target==='server')||(e.source==='server'&&e.target==='router')),path=cable.cableGeometry(art.linkAttachment(r,edge.id,nodes,edges),art.linkAttachment(s,edge.id,nodes,edges),'straight');return path.pointAt(1).y-path.pointAt(0).y;`);
    assert(Math.abs(delta) < 1, 'Router/server cable endpoints are not level: ' + delta);
    // Exercise the same guide from the PC side; both cables must be level at once.
    await page.evaluate(`const n=store.getState().nodes.find(n=>n.id==='pc');store.getState().onNodesChange([{id:'pc',type:'position',position:{x:n.position.x,y:n.position.y+6}}]);`);
    const pcPoint = await page.evaluate(`const r=document.querySelector('[data-id="pc"] .device-artwork').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};`);
    await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',...pcPoint});
    await page.send('Input.dispatchMouseEvent',{type:'mousePressed',...pcPoint,button:'left',buttons:1,clickCount:1});
    await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:pcPoint.x+10,y:pcPoint.y-1,button:'left',buttons:1});
    await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:pcPoint.x+16,y:pcPoint.y-1,button:'left',buttons:1});
    await wait("document.querySelector('.alignment-guides-layer line')"); await delay(80);
    await shot('pc-router-guide', 'selected', 1);
    await page.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:pcPoint.x+16,y:pcPoint.y-1,button:'left',buttons:0,clickCount:1});
    await wait("!document.querySelector('.alignment-guides-layer line')"); await delay(100);
    const cableDeltas = await page.evaluate(`const {nodes,edges}=store.getState();return edges.map(edge=>{const a=nodes.find(n=>n.id===edge.source),b=nodes.find(n=>n.id===edge.target),p=cable.cableGeometry(art.linkAttachment(a,edge.id,nodes,edges),art.linkAttachment(b,edge.id,nodes,edges),'straight');return {id:edge.id,delta:p.pointAt(1).y-p.pointAt(0).y};});`);
    assert(cableDeltas.length === 2 && cableDeltas.every(c => Math.abs(c.delta) < 1), 'Both cables should be level: ' + JSON.stringify(cableDeltas));
    await page.evaluate(`window.originalNodes=store.getState().nodes.map(n=>({id:n.id,position:n.position,measured:n.measured}));`);
    for (const zoom of [1, .5]) {
      await page.evaluate(`await flow.setViewport({x:60,y:40,zoom:${zoom}});`); await delay(100);
      const metrics = await page.evaluate(`return [...document.querySelectorAll('.react-flow__node')].map(n=>{const node=store.getState().nodes.find(d=>d.id===n.dataset.id),sprite=n.querySelector('.device-artwork').getBoundingClientRect(),icon=n.querySelector('.dev-icon').getBoundingClientRect(),name=n.querySelector('.dev-label').getBoundingClientRect();return{id:node.id,dy:(sprite.y-icon.y)/flow.getZoom(),width:sprite.width/flow.getZoom(),height:sprite.height/flow.getZoom(),gap:name.y-sprite.bottom,handles:n.querySelectorAll('.react-flow__handle').length,anchor:align.getVisualAlignmentPoint(node).y};});`);
      for (const m of metrics) {
        assert(Math.abs(m.dy - (m.id === 'router' ? 10 : m.id === 'server' ? -8 : 0)) < .01);
        assert(m.gap >= 0, 'Caption overlaps sprite: ' + m.id); assert.equal(m.handles, 4);
        assert(Math.abs(m.anchor - 250) < .01, 'Existing optical anchor changed');
      }
      assert.deepEqual(await page.evaluate('return store.getState().nodes.map(n=>({id:n.id,position:n.position,measured:n.measured}));'), await page.evaluate('return originalNodes;'));
      await shot(zoom === 1 ? 'aligned-devices-100' : 'aligned-devices-50', 'normal', zoom);
    }
    for (const style of ['straight', 'hybrid']) {
      await page.evaluate(`store.getState().setCableStyle('${style}');await flow.setViewport({x:60,y:40,zoom:1});store.getState().onNodesChange([{id:'router',type:'select',selected:true}]);`); await delay(100);
      assert(await page.evaluate("return [...document.querySelectorAll('.react-flow__edge-path')].every(p=>!/(NaN|Infinity)/.test(p.getAttribute('d')));"));
      await shot('aligned-selected-' + style, 'selected', 1);
    }
    // Additional actual devices and connections, including an AP/client WLAN;
    // no Switch is introduced because it has independent visual port geometry.
    await page.evaluate(`window.extras={};for(const [kind,x] of [['notebook',930],['firewall',1150],['ap',1370],['smartphone',1570]]){store.getState().addDeviceAt(kind,{x,y:200});extras[kind]=store.getState().nodes.at(-1).id;}`);
    await wait('store.getState().nodes.length===7&&store.getState().nodes.every(n=>n.measured?.height)');
    await page.evaluate(`const state=store.getState();state.onNodesChange(state.nodes.filter(n=>Object.values(extras).includes(n.id)).map(n=>({type:'position',id:n.id,position:{x:n.position.x,y:250-align.getVisualAlignmentPoint({...n,position:{x:0,y:0}}).y}})));
      for(const [source,target] of [['router',extras.notebook],['router',extras.firewall],[extras.firewall,extras.ap]])store.getState().onConnect({source,target,sourceHandle:null,targetHandle:null});
      const error=store.getState().associateWireless(extras.smartphone,extras.ap);if(error)throw Error(error);store.getState().setCableStyle('straight');await flow.setViewport({x:35,y:110,zoom:.5});`);
    await wait('store.getState().edges.length===6'); await delay(100);
    for (const kind of ['notebook','firewall','ap','smartphone']) {
      await page.evaluate(`const n=store.getState().nodes.find(n=>n.id===extras[${JSON.stringify(kind)}]);store.getState().onNodesChange([{id:n.id,type:'position',position:{x:n.position.x,y:n.position.y+12}}]);`);
      await delay(30);
      const at = await page.evaluate(`const n=document.querySelector('[data-id="'+extras[${JSON.stringify(kind)}]+'"] .device-artwork'),r=n.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};`);
      await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',...at});
      await page.send('Input.dispatchMouseEvent',{type:'mousePressed',...at,button:'left',buttons:1,clickCount:1});
      await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:at.x+10,y:at.y-1,button:'left',buttons:1});
      await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:at.x+16,y:at.y-1,button:'left',buttons:1});
      await wait("document.querySelector('.alignment-guides-layer line[data-alignment-axis=horizontal]')");
      await page.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:at.x+16,y:at.y-1,button:'left',buttons:0,clickCount:1});
      await wait("!document.querySelector('.alignment-guides-layer line')");
      const difference=await page.evaluate(`const n=store.getState().nodes.find(n=>n.id===extras[${JSON.stringify(kind)}]);return align.getVisualAlignmentPoint(n).y-250;`);
      assert(Math.abs(difference)<.1,kind+' did not snap to the guide: '+difference);
    }
    const allDeltas=await page.evaluate(`const {nodes,edges}=store.getState();return edges.map(edge=>{const a=nodes.find(n=>n.id===edge.source),b=nodes.find(n=>n.id===edge.target),p=cable.cableGeometry(art.linkAttachment(a,edge.id,nodes,edges),art.linkAttachment(b,edge.id,nodes,edges),'straight');return {source:a.data.kind,target:b.data.kind,delta:p.pointAt(1).y-p.pointAt(0).y};});`);
    assert(allDeltas.length===6&&allDeltas.every(c=>Math.abs(c.delta)<1),'All real cable/WLAN paths should be level: '+JSON.stringify(allDeltas));
    await shot('all-devices-aligned-50','normal',.5);
    const manifest = path.join(directory, 'manifest.json');
    await writeFile(manifest, JSON.stringify({ id: 'device-alignment', title: 'Alinhamento dos equipamentos', variants: [{ id: 'graphite-dark', label: 'Graphite Dark' }], states: ['normal','selected'], captures, share: captures.filter(c=>['pc-router-guide','aligned-devices-100','all-devices-aligned-50'].includes(c.scene)).map(c=>({...c,name:c.scene})), shareContactSheet: false }));
    report.artworkOffsetReview = await generateReview(manifest);
    report.results['artwork: local offsets, fixed nodes/handles, stable alignment, captions, Straight/Hybrid and zoom'] = { passed: true };
  } finally {
    await page.evaluate('window.workspace?.dispose();');
    await page.evaluate(`await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase(${JSON.stringify(database)});r.onsuccess=resolve;r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Artwork cleanup blocked'));});`);
  }
}
