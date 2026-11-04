import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { generateReview } from './visual-review.mjs';

export async function runHandleTuningReview({ page, url, root, report }) {
  const phase=process.env.NETLAB_HANDLE_TUNING_REVIEW, database='netlab-idb-test-'+crypto.randomUUID();
  const directory=path.join(root,'.playwright-mcp/reviews/raw/switch-handle-tuning-staging'),captures=[],results=[];
  const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const wait=async expression=>{for(let i=0;i<200;i++){if(await page.evaluate('return !!('+expression+');'))return;await delay(40);}throw Error('Handle tuning: '+expression);};
  const optionalBaseline=async name=>{try{return JSON.parse(await readFile(path.join(directory,name),'utf8'));}catch(error){if(error.code==='ENOENT')return null;throw error;}};
  const measure=()=>page.evaluate(`return [...document.querySelectorAll('.react-flow__node')].map(node=>{const card=node.querySelector('.device-node'),art=node.querySelector('.device-artwork'),label=node.querySelector('.device-label-content'),r=card.getBoundingClientRect(),p=getComputedStyle(card,'::after'),z=flow.getZoom(),m=new DOMMatrix(p.transform),border=getComputedStyle(card),extra=p.boxSizing==='border-box'?0:parseFloat(p.borderLeftWidth)+parseFloat(p.borderRightWidth);const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}};return{id:node.dataset.id,node:rect(card),art:rect(art),label:rect(label),frame:{x:r.x+(parseFloat(p.left)+parseFloat(border.borderLeftWidth)+m.m41)*z,y:r.y+(parseFloat(p.top)+parseFloat(border.borderTopWidth)+m.m42)*z,width:(parseFloat(p.width)+extra)*z,height:(parseFloat(p.height)+extra)*z},fill:p.backgroundColor,handles:[...card.querySelectorAll('.react-flow__handle')].map(h=>({id:h.dataset.handleid,...rect(h),dot:parseFloat(getComputedStyle(h,'::before').width)}))};});`);
  const point=selector=>page.evaluate(`const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};`);
  await mkdir(directory,{recursive:true});
  try {
    await page.send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
    await page.send('Page.navigate',{url});await wait("document.readyState==='complete'&&document.getElementById('root')");
    await page.evaluate(`window.store=(await import('/src/store.ts')).useStore;window.sim=(await import('/src/sim.ts')).sim;window.theme=(await import('/src/uiTheme.ts')).useUiTheme;
      (await import('/src/paletteLayout.ts')).savePalettePreference({collapsed:true,tab:'devices',collapsedCategories:[]});
      (await import('/src/canvasBackground.ts')).useCanvasBackground.getState().update({choice:'bg3',intensity:100,dots:false,animation:'off'});
      const {Network}=await import('/src/engine/network.ts'),{createDevice}=await import('/src/engine/factory.ts'),{serializeNetwork}=await import('/src/engine/serialize.ts'),{disposeNetwork}=await import('/src/engine/networkLifecycle.ts');
      const net=new Network(),positions={switch:{x:400,y:280},router:{x:850,y:200},host:{x:100,y:200},server:{x:650,y:540}};
      for(const kind of Object.keys(positions)){const d=createDevice(net,kind,{id:kind,name:kind==='switch'?'Switch':kind,switchPorts:24});if(kind!=='switch')d.addIp('eth0',0xc0a80a10+Object.keys(positions).indexOf(kind),24);}
      for(const id of ['host','router','server'])net.connect(id,'switch');
      const topology=serializeNetwork(net,positions);disposeNetwork(net);window.workspace=await(await import('/src/workspace/reviewEntry.tsx')).mountWorkspaceReview(document.getElementById('root'),{databaseName:${JSON.stringify(database)}});
      const opened=await workspace.controller.openDocument({schemaVersion:1,topology});if(!opened.ok)throw Error(JSON.stringify(opened));store.getState().select(null);store.getState().setPaused(true);window.flow=(await import('/src/workspace/viewportProbe.browser.tsx')).getViewportProbe();`);
    await wait('store.getState().nodes.length===4&&store.getState().nodes.every(n=>n.measured?.height)');await delay(350);
    await page.evaluate(`window.originalNodes=store.getState().nodes.map(n=>({id:n.id,position:n.position,measured:n.measured}));window.originalPaths=Object.fromEntries([...document.querySelectorAll('.react-flow__edge')].map(e=>[e.dataset.id,e.querySelector('.react-flow__edge-path').getAttribute('d')]));`);
    for(const theme of ['graphite-dark','classic-light'])for(const zoom of [1,.5]){
      await page.evaluate(`theme.getState().setTheme(${JSON.stringify(theme)});await flow.setViewport({x:${200-400*zoom},y:${220-280*zoom},zoom:${zoom}});store.getState().onNodesChange(store.getState().nodes.map(n=>({id:n.id,type:'select',selected:true})));`);
      await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',...await point('[data-id=switch] .dev-icon')});await delay(200);
      assert(Math.abs(await page.evaluate('return flow.getZoom();')-zoom)<.001);
      assert.deepEqual(await page.evaluate('return store.getState().nodes.map(n=>({id:n.id,position:n.position,measured:n.measured}));'),await page.evaluate('return originalNodes;'));
      assert.deepEqual(await page.evaluate("return Object.fromEntries([...document.querySelectorAll('.react-flow__edge')].map(e=>[e.dataset.id,e.querySelector('.react-flow__edge-path').getAttribute('d')]));"),await page.evaluate('return originalPaths;'));
      results.push({theme,zoom,nodes:await measure()});
      const scene=`${theme}-${zoom===1?'100':'50'}`,name=`${phase}-${scene}.png`;
      const image=await page.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,clip:{x:0,y:0,width:520,height:500,scale:1}});await writeFile(path.join(directory,name),Buffer.from(image.data,'base64'));
      captures.push({source:path.relative(root,path.join(directory,name)).split(path.sep).join('/'),scene,variant:phase,state:'hover',width:520,height:500});
    }
    await writeFile(path.join(directory,`${phase}-metrics.json`),JSON.stringify(results,null,2));
    await writeFile(path.join(directory,`${phase}-captures.json`),JSON.stringify(captures));
    if(phase==='after'){
      const before=await optionalBaseline('before-metrics.json');
      for(let i=0;i<results.length;i++)for(const n of results[i].nodes){
        const old=before?.[i]?.nodes.find(x=>x.id===n.id),z=results[i].zoom;
        if(old){for(const field of ['node','art','label'])for(const key of ['x','y','width','height'])assert(Math.abs(n[field][key]-old[field][key])<.05,`Changed ${n.id} ${field} ${key}`);
          for(const key of ['x','width'])assert(Math.abs(n.frame[key]-old.frame[key])<.05,`Changed ${n.id} frame ${key}`);
          assert(Math.abs(n.frame.y-old.frame.y+(n.id==='switch'?4*z:0))<.05,`Unexpected frame top ${n.id}`);
          assert(Math.abs(n.frame.height-old.frame.height-(n.id==='switch'?4*z:0))<.05,`Unexpected frame height ${n.id}`);}
        assert(n.fill.includes('0.12'),`Selection fill ${n.id}`);
        for(const h of n.handles){const previous=old?.handles.find(x=>x.id===h.id);assert.equal(h.dot,13);assert(Math.abs(h.width/z-18)<.05&&Math.abs(h.height/z-18)<.05);
          if(previous){assert(Math.abs(h.x-previous.x)<.05,`Changed handle x ${n.id}/${h.id}`);assert(Math.abs(h.y-previous.y+(n.id==='switch'&&h.id==='t'?4*z:0))<.05,`Changed handle y ${n.id}/${h.id}`);}}
        if(n.id==='switch'){const top=n.handles.find(h=>h.id==='t'),bottom=n.handles.find(h=>h.id==='b');assert(Math.abs(top.y+top.height/2-n.frame.y)<.1);assert(Math.abs(bottom.y+bottom.height/2-(n.frame.y+n.frame.height))<.1);}
      }
      report.results['handle tuning: both themes and zooms preserve geometry, fill and all handle targets']={passed:true};
      await page.evaluate("theme.getState().setTheme('graphite-dark');await flow.setViewport({x:-200,y:-60,zoom:1});");
      await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',...await point('[data-id=router] .dev-icon')});await delay(180);
      const router=await page.evaluate("const r=document.querySelector('[data-id=router] .device-node').getBoundingClientRect();return{x:Math.floor(r.x-25),y:Math.floor(r.y-35),width:Math.ceil(r.width+50),height:Math.ceil(r.height+100),scale:2};");
      const routerImage=await page.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,clip:router});await writeFile(path.join(directory,'after-router-inspection.png'),Buffer.from(routerImage.data,'base64'));
      await page.evaluate('await flow.setViewport({x:-200,y:-60,zoom:1});');
      const from=await point('[data-id=router] .react-flow__handle[data-handleid=r]'),to=await point('[data-id=switch] .react-flow__handle[data-handleid=t]');
      await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',...from});await page.send('Input.dispatchMouseEvent',{type:'mousePressed',...from,button:'left',buttons:1,clickCount:1});
      for(let i=1;i<=12;i++)await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:from.x+(to.x-from.x)*i/12,y:from.y+(to.y-from.y)*i/12,buttons:1});
      await page.send('Input.dispatchMouseEvent',{type:'mouseReleased',...to,button:'left',buttons:0,clickCount:1});await wait('sim.net.links.size===4');
      report.results['handle tuning: top handle still connects by drag']={passed:true};
      const originals=await optionalBaseline('before-captures.json')??[],all=[...originals,...captures],manifest=path.join(directory,'manifest.json');
      await writeFile(manifest,JSON.stringify({id:'switch-handle-tuning',title:'Switch and handles: before and after',variants:[{id:'before',label:'Before'},{id:'after',label:'After'}],states:['hover'],captures:all,share:all.map(c=>({...c,name:`${c.variant}-${c.scene}`})),shareContactSheet:false}));
      report.handleTuningReview=await generateReview(manifest);
    }
  } finally {
    await page.evaluate(`window.workspace?.dispose();await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase(${JSON.stringify(database)});r.onsuccess=resolve;r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Handle tuning database cleanup blocked'));});`);
  }
}
