import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { generateReview } from './visual-review.mjs';

export async function runDeviceEditingReview({page,url,root,report}) {
  const database='netlab-idb-test-'+randomUUID(), directory=path.join(root,'.playwright-mcp/reviews/raw/device-editing-staging'), captures=[];
  await mkdir(directory,{recursive:true});
  const delay=ms=>new Promise(r=>setTimeout(r,ms));
  const wait=async expression=>{for(let i=0;i<160;i++){if(await page.evaluate(`return !!(${expression});`))return;await delay(40);}throw Error('Timed out: '+expression);};
  const click=async selector=>{
    const p=await page.evaluate(`const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};`);
    for(const type of ['mouseMoved','mousePressed','mouseReleased'])await page.send('Input.dispatchMouseEvent',{type,...p,...(type==='mouseMoved'?{}:{button:'left',clickCount:1})});await delay(60);
  };
  const key=async(key,modifiers=2)=>{for(const type of ['keyDown','keyUp'])await page.send('Input.dispatchKeyEvent',{type,key,code:key.length===1?'Key'+key.toUpperCase():key,...(key.length===1?{windowsVirtualKeyCode:key.toUpperCase().charCodeAt(0)}:{}),modifiers});await delay(70);};
  const test=async(name,run)=>{page.labelDownloads(name);try{await run();report.results[name]={passed:true};}catch(e){report.results[name]={passed:false,error:e.stack};throw e;}};
  const shot=async(name,variant,width)=>{await delay(90);const png=await page.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(directory,name),Buffer.from(png.data,'base64'));captures.push({source:path.relative(root,path.join(directory,name)).split(path.sep).join('/'),scene:name.slice(3,-4),variant,state:'normal',width,height:960});};
  const mount=async()=>{
    await page.send('Page.navigate',{url});await wait("document.readyState==='complete'&&location.pathname==='/__workspace_ui_test__'");
    await page.evaluate(`window.entry=await import('/src/workspace/reviewEntry.tsx');window.store=(await import('/src/store.ts')).useStore;window.sim=(await import('/src/sim.ts')).sim;window.terminals=await import('/src/terminals.ts');window.ws=await entry.mountWorkspaceReview(document.getElementById('root'),{databaseName:${JSON.stringify(database)}});window.theme=(await import('/src/uiTheme.ts')).useUiTheme;`);
    await wait('document.querySelector(".react-flow")');await delay(120);
    await page.evaluate('window.flow=(await import("/src/workspace/viewportProbe.browser.tsx")).getViewportProbe();');
  };
  const blank=async()=>{await page.evaluate('const r=await ws.controller.openDocument({schemaVersion:1,topology:{app:"netsim",version:1,devices:[],links:[]}});if(!r.ok)throw Error(JSON.stringify(r));await flow.setViewport({x:0,y:0,zoom:1});');await delay(120);};
  const focus=()=>page.evaluate('document.querySelector(".react-flow").focus();');
  const select=ids=>page.evaluate(`store.getState().onNodesChange(store.getState().nodes.map(n=>({type:'select',id:n.id,selected:${JSON.stringify(ids)}.includes(n.id)})));document.querySelector('.react-flow').focus();`);
  try {
    await page.send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});await mount();
    await page.evaluate('theme.getState().setTheme("graphite-dark");');await blank();
    await test('device editor: real catalogue clicks create ten nonoverlapping PCs using the visible viewport',async()=>{
      await page.evaluate('await flow.setViewport({x:-1200,y:-600,zoom:1});');
      for(let i=0;i<10;i++)await click('.palette-item.kind-host');
      const state=await page.evaluate(`const p=await import('/src/devicePlacement.ts'),nodes=store.getState().nodes;return{count:nodes.length,positions:nodes.map(n=>n.position),overlap:nodes.some((a,i)=>nodes.slice(i+1).some(b=>p.boxesOverlap(p.placementBox(a),p.placementBox(b))))};`);
      assert.equal(state.count,10);assert.equal(state.overlap,false);assert(state.positions.every(p=>p.x>1000&&p.y>500));
      await shot('01-ten-pcs-placement.png','graphite-dark',1440);
      await click('.react-flow__node .device-artwork');
      const before=await page.evaluate('return store.getState().nodes[0].position;');await click('.palette-item.kind-server');
      const added=await page.evaluate('return store.getState().nodes.at(-1).position;');assert(Math.abs(added.x-before.x)<1100&&Math.abs(added.y-before.y)<600);
    });
    await test('device editor: one PC and four-PC native Shift selection copy/paste exact spacing with one undo',async()=>{
      await blank();await page.evaluate(`for(const p of [{x:50,y:90},{x:300,y:90},{x:50,y:320},{x:300,y:320}])store.getState().addDeviceAt('host',p);await flow.setViewport({x:20,y:20,zoom:1});`);await delay(100);
      const original=await page.evaluate('return store.getState().nodes.map(n=>({id:n.id,position:n.position}));');
      await select([original[0].id]);await key('c');await key('v');assert.equal(await page.evaluate('return store.getState().nodes.length;'),5);await key('z');assert.equal(await page.evaluate('return store.getState().nodes.length;'),4);
      const rect=await page.evaluate('const r=document.querySelector(".react-flow").getBoundingClientRect(),a=flow.flowToScreenPosition({x:25,y:60}),b=flow.flowToScreenPosition({x:490,y:530});return{a,b};');
      await page.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Shift',code:'ShiftLeft',modifiers:8,windowsVirtualKeyCode:16});
      await page.send('Input.dispatchMouseEvent',{type:'mousePressed',...rect.a,button:'left',clickCount:1,modifiers:8});
      for(let i=1;i<=12;i++)await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:rect.a.x+(rect.b.x-rect.a.x)*i/12,y:rect.a.y+(rect.b.y-rect.a.y)*i/12,buttons:1,modifiers:8});
      await page.send('Input.dispatchMouseEvent',{type:'mouseReleased',...rect.b,button:'left',clickCount:1,modifiers:8});await page.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Shift',code:'ShiftLeft',windowsVirtualKeyCode:16});await delay(100);
      assert.equal(await page.evaluate('return store.getState().nodes.filter(n=>n.selected).length;'),4);
      await key('c');await key('v');
      const copies=await page.evaluate('return store.getState().nodes.filter(n=>n.selected).map(n=>({id:n.id,position:n.position}));');assert.equal(copies.length,4);assert.equal(await page.evaluate('return store.getState().nodes.length;'),8);
      const dx=copies[0].position.x-original[0].position.x,dy=copies[0].position.y-original[0].position.y;
      copies.forEach((n,i)=>assert.deepEqual(n.position,{x:original[i].position.x+dx,y:original[i].position.y+dy}));
      assert.equal(await page.evaluate('return store.getState().areaMarkings.length;'),0);assert.equal(await page.evaluate('return store.getState().pendingMarkingRect;'),null);
      await shot('02-four-pcs-pasted.png','graphite-dark',1440);await key('v');assert.equal(await page.evaluate('return sim.net.devices.size;'),12);await key('z');await key('z');assert.equal(await page.evaluate('return sim.net.devices.size;'),4);await key('z',10);assert.equal(await page.evaluate('return sim.net.devices.size;'),8);
    });
    await test('device editor: internal cables, external exclusion, fresh IDs and MACs survive real F5 and plans',async()=>{
      await blank();await page.evaluate(`store.getState().addDeviceAt('host',{x:100,y:100});store.getState().addDeviceAt('switch',{x:350,y:100});store.getState().addDeviceAt('router',{x:600,y:100});const [a,b,c]=store.getState().nodes;store.getState().onConnect({source:a.id,target:b.id});store.getState().onConnect({source:b.id,target:c.id});store.getState().setCableColor(store.getState().edges[0].id,'purple');`);
      const ids=await page.evaluate('return store.getState().nodes.slice(0,2).map(n=>n.id);');await select(ids);await key('c');await key('v');
      assert.equal(await page.evaluate('return sim.net.links.size;'),3);
      assert(await page.evaluate('const macs=[...sim.net.devices.values()].flatMap(d=>d.interfaces.map(i=>i.mac));return new Set(macs).size===macs.length;'));
      await shot('03-internal-cables-graphite.png','graphite-dark',1440);
      await page.evaluate('theme.getState().setTheme("classic-light");');await shot('04-internal-cables-classic.png','classic-light',1440);
      const expected=await page.evaluate('return ws.controller.recoveryDocument();');
      await page.evaluate('let r=await ws.controller.save("Clipboard review");if(!r.ok)throw Error(JSON.stringify(r));const projectId=r.value.plan.project.id;window.originalDraft=ws.controller.getState().activeDraftId;await ws.controller.openDocument({schemaVersion:1,topology:{app:"netsim",version:1,devices:[],links:[]}});r=await ws.controller.openPlan(projectId);if(!r.ok)throw Error(JSON.stringify(r));await ws.controller.flush();ws.dispose();');await mount();
      assert.deepEqual(await page.evaluate('return ws.controller.recoveryDocument();'),expected);
      await page.evaluate(`const r=await ws.controller.openDocument(JSON.parse(${JSON.stringify(JSON.stringify(expected))}));if(!r.ok)throw Error(JSON.stringify(r));`);
      assert.deepEqual(await page.evaluate('return ws.controller.recoveryDocument();'),expected);
    });
    await test('device editor: input and xterm retain native clipboard and interrupt behavior',async()=>{
      const id=await page.evaluate('return store.getState().nodes.find(n=>n.data.kind==="host").id;');await select([id]);await key('c');
      await click('.react-flow__node .device-artwork');await wait('document.querySelector(".inspector input")');
      const count=await page.evaluate('return store.getState().nodes.length;');
      await click('.inspector input');await key('c');await key('v');assert.equal(await page.evaluate('return store.getState().nodes.length;'),count);
      await page.evaluate(`store.getState().openTerminal(${JSON.stringify(id)});`);await wait('document.querySelector(".xterm-helper-textarea")');await click('.xterm-screen');
      await key('c');await key('v');assert.equal(await page.evaluate('return store.getState().nodes.length;'),count);
      const guards=await page.evaluate(`const f=document.querySelector('.react-flow');let prevented=[];for(const el of [document.querySelector('.inspector input'),document.querySelector('.xterm-helper-textarea')]){el.focus();for(const key of ['c','v']){const e=new KeyboardEvent('keydown',{key,ctrlKey:true,bubbles:true,cancelable:true});el.dispatchEvent(e);prevented.push(e.defaultPrevented);}}return prevented;`);
      assert(guards.every(p=>!p));
      await page.evaluate(`const d=sim.net.devices.get(${JSON.stringify(id)}),s=terminals.getSession(d);d.interfaces[0].configureIpv4({mode:'static',ip:(await import('/src/engine/ip.ts')).parseCidr('192.0.2.2/24'),gateway:null,dns:null});s.term.input('\x03',true);window.clipboardTerminal=s;`);
      assert.equal(await page.evaluate('return clipboardTerminal.executeCommand("ping -c 50 192.0.2.1");'),'accepted');
      assert.equal(await page.evaluate('return clipboardTerminal.executeCommand("help");'),'busy');
      await page.evaluate('clipboardTerminal.term.focus();');await key('c');
      assert.equal(await page.evaluate('return clipboardTerminal.executeCommand("help");'),'accepted','Ctrl+C still interrupts the real xterm command');
      await page.evaluate('clipboardTerminal.term.input("\u001b[200~clipboard-guard\u001b[201~",true);');
      assert.equal(await page.evaluate('return clipboardTerminal.executeCommand("help");'),'unapplied-input','Terminal text paste remains input, not topology duplication');
      await page.evaluate('clipboardTerminal.term.input("\u0003",true);');
      await page.evaluate('const name=document.querySelector(".inspector-name");name?.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}));store.getState().terminals.forEach(id=>store.getState().closeTerminal(id));store.getState().select(null);');
      await wait('!document.querySelector(".inspector")');await delay(100);
    });
    await test('device editor: Labs and real exercise attempts keep original identities, checks and progress',async()=>{
      await page.evaluate('const topology=structuredClone((await import("/src/labs/library.ts")).LABS[0]);const r=await ws.controller.openDocument({schemaVersion:1,topology});if(!r.ok)throw Error(JSON.stringify(r));');await delay(100);
      const original=await page.evaluate('return {ids:store.getState().nodes.map(n=>n.id),lab:store.getState().lab};');
      await select(original.ids.slice(0,2));await key('c');await key('v');
      assert.equal(await page.evaluate('return store.getState().nodes.length;'),original.ids.length+2);assert.deepEqual(await page.evaluate('return store.getState().lab;'),original.lab);
      await page.evaluate('const e=[...document.querySelectorAll(".toolbar-menu-trigger,.toolbar-menu-action")].find(b=>b.textContent.includes("Übungen (Beta)"));e.click();');
      await wait('document.querySelector(".exercise-menu-entry button:not(:disabled)")');
      await page.evaluate('document.querySelector(".exercise-menu-entry button:not(:disabled)").click();');await wait('document.querySelector(".exercise-panel")');await delay(100);
      const before=await page.evaluate('const r=await ws.repository.getMeta("exercises:beta:v1");return {progress:r.value.value,ids:store.getState().nodes.map(n=>n.id)};');
      await select(before.ids);await key('c');await key('v');
      const after=await page.evaluate('const r=await ws.repository.getMeta("exercises:beta:v1");return {progress:r.value.value,ids:store.getState().nodes.filter(n=>n.selected).map(n=>n.id)};');
      assert.deepEqual(after.progress,before.progress);assert(after.ids.every(id=>!before.ids.includes(id)));assert.equal(after.ids.length,before.ids.length);
    });
    await test('device editor: catalogue drag uses real zoom/pan conversion at .5, 1 and 2',async()=>{
      await blank();
      for(const zoom of [.5,1,2]){
        await page.evaluate(`await flow.setViewport({x:-80,y:55,zoom:${zoom}});`);await delay(60);
        await page.evaluate('window.dragMime=null;const e=document.querySelector(".palette-item.kind-host"),d=new DataTransfer();e.dispatchEvent(new DragEvent("dragstart",{bubbles:true,dataTransfer:d}));window.dragMime=d.getData("application/netsim");');
        assert.equal(await page.evaluate('return dragMime;'),'host');
        const added=await page.evaluate(`const r=document.querySelector('.react-flow').getBoundingClientRect(),p={x:r.left+180,y:r.top+200},world=flow.screenToFlowPosition(p),data=new DataTransfer();data.setData('application/netsim',dragMime);document.querySelector('.react-flow').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,clientX:p.x,clientY:p.y,dataTransfer:data}));return{world,position:store.getState().nodes.at(-1).position};`);
        assert(Math.abs(added.position.x-added.world.x+48)<.01&&Math.abs(added.position.y-added.world.y+39)<.01);
      }
      await page.send('Emulation.setDeviceMetricsOverride',{width:700,height:960,deviceScaleFactor:1,mobile:false});await page.evaluate('await flow.setViewport({x:0,y:0,zoom:.5});');await focus();await select(await page.evaluate('return store.getState().nodes.map(n=>n.id);'));await key('c');await key('v');
      assert.equal(await page.evaluate('return store.getState().nodes.length;'),6);assert(await page.evaluate('return document.documentElement.scrollWidth<=innerWidth;'));await shot('05-paste-classic-700.png','classic-light',700);
    });
  } finally {
    await page.evaluate('window.ws?.dispose();');
    await page.evaluate(`await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase(${JSON.stringify(database)});r.onsuccess=resolve;r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Device review cleanup blocked'));});`);
  }
  const manifest=path.join(directory,'manifest.json');await writeFile(manifest,JSON.stringify({id:'device-clipboard-placement',title:'Clipboard de equipamentos e posicionamento',variants:[{id:'graphite-dark',label:'Graphite Dark'},{id:'classic-light',label:'Classic Light'}],states:['normal'],captures,share:captures.filter(c=>c.scene!=='four-pcs-pasted').map(c=>({...c,name:c.scene})),shareContactSheet:false},null,2));
  report.deviceEditingReview=await generateReview(manifest);
}
