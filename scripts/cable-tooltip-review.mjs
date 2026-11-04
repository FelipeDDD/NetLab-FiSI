import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { generateReview } from './visual-review.mjs';

export async function runCableTooltipReview({ page, url, root, report }) {
  const phase=process.env.NETLAB_CABLE_TOOLTIP_REVIEW, database='netlab-idb-test-'+crypto.randomUUID();
  const directory=path.join(root,'.playwright-mcp/reviews/raw/cable-tooltip-staging'),captures=[];
  const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const wait=async expression=>{for(let i=0;i<200;i++){if(await page.evaluate('return !!('+expression+');'))return;await delay(40);}throw Error('Cable tooltip condition: '+expression);};
  const test=async(name,fn)=>{await fn();report.results['cable tooltip: '+name]={passed:true};};
  const click=async(selector,text)=>{const p=await page.evaluate(`const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.getClientRects().length&&(${text?`e.textContent.trim()===${JSON.stringify(text)}`:'true'}));if(!e)throw Error('Missing '+${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};`);for(const type of ['mouseMoved','mousePressed','mouseReleased'])await page.send('Input.dispatchMouseEvent',{type,...p,...(type==='mouseMoved'?{}:{button:'left',clickCount:1})});await delay(90);};
  const hover=async id=>{await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:20,y:80});const point=await page.evaluate(`const p=document.querySelector('[data-id="${id}"] .react-flow__edge-path');if(!p)throw Error('Missing cable');return new DOMPoint(...Object.values((({x,y})=>({x,y}))(p.getPointAtLength(p.getTotalLength()/2)))).matrixTransform(p.getScreenCTM()).toJSON();`);await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x,y:point.y});await wait("document.querySelector('.cable-tooltip[role=tooltip]')");return point;};
  await mkdir(directory,{recursive:true});
  try{
    await page.send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});await page.send('Page.navigate',{url});await wait("document.readyState==='complete'&&document.getElementById('root')");
    await page.evaluate(`window.store=(await import('/src/store.ts')).useStore;window.sim=(await import('/src/sim.ts')).sim;window.theme=(await import('/src/uiTheme.ts')).useUiTheme;window.lang=(await import('/src/i18n/index.ts')).useLanguage;lang.getState().setLanguage('de');
      (await import('/src/paletteLayout.ts')).savePalettePreference({collapsed:true,tab:'devices',collapsedCategories:[]});(await import('/src/canvasBackground.ts')).useCanvasBackground.getState().update({choice:'bg3',intensity:100,dots:false,animation:'off'});
      const {Network}=await import('/src/engine/network.ts'),{createDevice}=await import('/src/engine/factory.ts'),{serializeNetwork}=await import('/src/engine/serialize.ts'),{disposeNetwork}=await import('/src/engine/networkLifecycle.ts');
      const net=new Network();createDevice(net,'switch',{id:'sw',name:'Switch A',switchPorts:24});createDevice(net,'router',{id:'r1',name:'Router A'});createDevice(net,'router',{id:'r2',name:'Router B'});
      net.connect('r1','sw',{id:'mixed',aIface:'eth1',bIface:'eth4'});net.connect('r2','r1',{id:'same',aIface:'eth2',bIface:'eth3'});
      const topology=serializeNetwork(net,{sw:{x:80,y:160},r1:{x:420,y:160},r2:{x:760,y:160}});disposeNetwork(net);
      window.workspace=await(await import('/src/workspace/reviewEntry.tsx')).mountWorkspaceReview(document.getElementById('root'),{databaseName:${JSON.stringify(database)}});const result=await workspace.controller.openDocument({schemaVersion:1,topology});if(!result.ok)throw Error(JSON.stringify(result));store.getState().setPaused(true);window.flow=(await import('/src/workspace/viewportProbe.browser.tsx')).getViewportProbe();`);
    await wait('store.getState().nodes.length===3&&store.getState().nodes.every(n=>n.measured?.height)');await delay(350);
    const scenes=[
      {id:'horizontal-dark-100',theme:'graphite-dark',zoom:1,link:'mixed',sw:{x:80,y:160},r1:{x:420,y:160},expected:'Switch A / eth4 ↔ Router A / eth1'},
      {id:'vertical-light-50',theme:'classic-light',zoom:.5,link:'mixed',sw:{x:220,y:80},r1:{x:220,y:500},expected:'Switch A / eth4 ↔ Router A / eth1'},
      {id:'diagonal-dark-50',theme:'graphite-dark',zoom:.5,link:'mixed',sw:{x:100,y:80},r1:{x:420,y:360},expected:'Router A / eth1 ↔ Switch A / eth4'},
      {id:'routers-light-100',theme:'classic-light',zoom:1,link:'same',sw:{x:80,y:160},r1:{x:420,y:160},expected:'Router A / eth3 ↔ Router B / eth2'},
    ];
    for(const scene of scenes){
      await page.evaluate(`theme.getState().setTheme(${JSON.stringify(scene.theme)});store.getState().onNodesChange([{id:'sw',type:'position',position:${JSON.stringify(scene.sw)}},{id:'r1',type:'position',position:${JSON.stringify(scene.r1)}},{id:'r2',type:'position',position:{x:760,y:160}}]);await flow.setViewport({x:80,y:80,zoom:${scene.zoom}});`);await delay(140);
      const point=await hover(scene.link);await delay(180);
      const text=await page.evaluate("return document.querySelector('.cable-tooltip').textContent.replace(/\\s+/g,' ').trim();");
      if(phase==='after'){
        assert.equal(text,scene.expected);
        const endpoints=await page.evaluate("return [...document.querySelectorAll('.cable-tooltip-endpoint')].map(e=>({text:e.textContent.trim(),color:getComputedStyle(e).color}));");
        assert.equal(endpoints.length,2);assert.notEqual(endpoints[0].text,endpoints[1].text);
        assert.equal(endpoints[0].color===endpoints[1].color,scene.link==='same');
        const contrasts=await page.evaluate(`const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d'),tip=document.querySelector('.cable-tooltip');canvas.width=canvas.height=1;
          const pixel=()=>[...ctx.getImageData(0,0,1,1).data].slice(0,3),lum=c=>c.map(v=>v/255).map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4).reduce((n,v,i)=>n+v*[0.2126,0.7152,0.0722][i],0);
          return [...tip.querySelectorAll('.cable-tooltip-endpoint')].map(e=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=getComputedStyle(tip).backgroundColor;ctx.fillRect(0,0,1,1);ctx.fillStyle=getComputedStyle(e).backgroundColor;ctx.fillRect(0,0,1,1);const bg=lum(pixel());ctx.clearRect(0,0,1,1);ctx.fillStyle=getComputedStyle(e).color;ctx.fillRect(0,0,1,1);const fg=lum(pixel());return (Math.max(bg,fg)+0.05)/(Math.min(bg,fg)+0.05);});`);
        assert(contrasts.every(c=>c>=4.5),`Insufficient tooltip contrast: ${contrasts}`);
      }
      const tooltip=await page.evaluate("const r=document.querySelector('.cable-tooltip').getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};");
      assert(tooltip.x>=0&&tooltip.y>=0&&tooltip.x+tooltip.width<=1440&&tooltip.y+tooltip.height<=900);
      const clip={x:Math.max(0,Math.floor(point.x-150)),y:Math.max(0,Math.floor(point.y-70)),width:520,height:200,scale:1};
      clip.width=Math.min(clip.width,1440-clip.x);clip.height=Math.min(clip.height,900-clip.y);
      const image=await page.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,clip});const filename=`${phase}-${scene.id}.png`;await writeFile(path.join(directory,filename),Buffer.from(image.data,'base64'));
      captures.push({source:path.relative(root,path.join(directory,filename)).split(path.sep).join('/'),scene:scene.id,variant:phase,state:'hover',width:clip.width,height:clip.height});
    }
    await writeFile(path.join(directory,`${phase}-captures.json`),JSON.stringify(captures));
    if(phase==='after'){
      await test('real interfaces, ordering and equal-color endpoints in Dark/Light at 50%/100%',async()=>{});
      await click('.toolbar-menu-trigger,.toolbar-menu-action','Übungen (Beta)');await wait("document.querySelector('#toolbar-exercises-menu')");await click('[data-guided-menu-toggle]');await click('[data-router-direct]');await wait("document.querySelector('[data-router-step=\"1\"]')");
      await wait("document.querySelector('.exercise-panel footer .btn--primary:not(:disabled)')");await click('.exercise-panel footer .btn--primary');await wait("document.querySelector('[data-router-step=\"2\"]')");
      await page.evaluate("store.getState().onConnect({source:'tutorial-03-router',target:'tutorial-01-switch'});store.getState().onConnect({source:'tutorial-03-router',target:'tutorial-03-switch'});");await wait("document.querySelector('[data-router-passed=true]')");await click('.exercise-panel footer .btn--primary');await wait("document.querySelector('[data-router-step=\"3\"]')");
      await test('Chapter 3 help is closed by default and translates without changing the task',async()=>{
        for(const [language,title,excerpt] of [['de','Wie finde ich die richtige Schnittstelle?','Wählen Sie den Router aus'],['en','How do I find the right interface?','Select the router'],['pt-BR','Como encontro a interface correta?','Selecione o roteador']]){
          await page.evaluate(`lang.getState().setLanguage(${JSON.stringify(language)});`);await delay(100);
          assert(await page.evaluate(`const e=document.querySelector('[data-router-interface-help]');return e&&!e.open&&e.querySelector('summary').textContent===${JSON.stringify(title)};`));
          await click('[data-router-interface-help] summary');assert(await page.evaluate(`return document.querySelector('[data-router-interface-help]').textContent.includes(${JSON.stringify(excerpt)});`));
          if(language==='de'){const image=await page.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});const filename='after-tutorial-help.png';await writeFile(path.join(directory,filename),Buffer.from(image.data,'base64'));captures.push({source:path.relative(root,path.join(directory,filename)).split(path.sep).join('/'),scene:'tutorial-help',variant:'after',state:'expanded',width:1440,height:900});}
          await click('[data-router-interface-help] summary');
        }
      });
      let before=[];try{before=JSON.parse(await readFile(path.join(directory,'before-captures.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
      const all=[...before,...captures],manifest=path.join(directory,'manifest.json');
      await writeFile(manifest,JSON.stringify({id:'cable-tooltip-interfaces',title:'Cable tooltip and router interface help',variants:[{id:'before',label:'Before'},{id:'after',label:'After'}],states:['hover','expanded'],captures:all,share:all.filter(c=>['horizontal-dark-100','vertical-light-50','routers-light-100','tutorial-help'].includes(c.scene)).map(c=>({...c,name:`${c.variant}-${c.scene}`})),shareContactSheet:false}));
      report.cableTooltipReview=await generateReview(manifest);
    }
  }finally{await page.evaluate(`window.workspace?.dispose();await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase(${JSON.stringify(database)});r.onsuccess=resolve;r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Cable tooltip database cleanup blocked'));});`);}
}
