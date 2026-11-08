import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';

export async function runStabilizationCanvasReview({page,url,root,report}){
  const out=path.join(root,'.playwright-mcp/reviews/studio-stabilization');await mkdir(out,{recursive:true});const database='netlab-idb-test-'+crypto.randomUUID(),delay=ms=>new Promise(r=>setTimeout(r,ms));
  const wait=async expr=>{for(let n=0;n<200;n++){if(await page.evaluate(`return !!(${expr});`))return;await delay(40);}throw Error('Stability canvas timeout: '+expr);};
  const point=selector=>page.evaluate(`const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};`);
  const move=p=>page.send('Input.dispatchMouseEvent',{type:'mouseMoved',...p});
  const click=async p=>{await move(p);for(const type of ['mousePressed','mouseReleased'])await page.send('Input.dispatchMouseEvent',{type,...p,button:'left',buttons:type==='mousePressed'?1:0,clickCount:1});await delay(80);};
  const drag=async(a,b)=>{await move(a);await page.send('Input.dispatchMouseEvent',{type:'mousePressed',...a,button:'left',buttons:1,clickCount:1});for(let n=1;n<=6;n++)await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:a.x+(b.x-a.x)*n/6,y:a.y+(b.y-a.y)*n/6,buttons:1});await page.send('Input.dispatchMouseEvent',{type:'mouseReleased',...b,button:'left',buttons:0,clickCount:1});await delay(100);};
  const test=async(name,run)=>{try{await run();report.results['stabilization canvas: '+name]={passed:true};}catch(e){report.results['stabilization canvas: '+name]={passed:false,error:e.stack};throw e;}};
  try{
    await page.send('Emulation.setDeviceMetricsOverride',{width:1600,height:1100,deviceScaleFactor:1,mobile:false});await page.send('Page.navigate',{url});await wait("document.readyState==='complete'&&document.getElementById('root')");
    await page.evaluate(`window.store=(await import('/src/store.ts')).useStore;window.sim=(await import('/src/sim.ts')).sim;window.ws=await(await import('/src/workspace/reviewEntry.tsx')).mountWorkspaceReview(document.getElementById('root'),{databaseName:${JSON.stringify(database)}});window.terminals=await import('/src/terminals.ts');`);await wait("document.querySelector('.react-flow')");await page.evaluate("window.flow=(await import('/src/workspace/viewportProbe.browser.tsx')).getViewportProbe();");await wait('flow');
    const rows=[];
    await test('approved hover, terminal, Quick Ping, IP copy and two parallel cable drops at 25/50/65/100%',async()=>{
      for(const zoom of [.25,.5,.65,1]){
        const devices=[{id:'R',kind:'router',name:'Router / quatro IPv4',x:0,y:0,forwarding:true,ifaces:Array.from({length:4},(_,i)=>({name:'eth'+i,ip:`192.168.${10+i}.1/24`,ipv4Mode:'static',up:true})),routes:[]},{id:'S',kind:'switch',name:'Switch',x:450/zoom,y:0,forwarding:false,ifaces:Array.from({length:8},(_,i)=>({name:'eth'+i,ip:null,up:true})),routes:[]}];
        await page.evaluate(`const r=await ws.controller.openDocument({schemaVersion:1,topology:{app:'netsim',version:1,devices:${JSON.stringify(devices)},links:[]}});if(!r.ok)throw Error(JSON.stringify(r));store.getState().setPaused(true);store.getState().select(null);`);await wait("store.getState().nodes.every(n=>n.measured?.height)");await delay(140);await page.evaluate(`await flow.setViewport({x:150,y:130,zoom:${zoom}});`);await delay(140);assert.equal(await page.evaluate('return flow.getZoom();'),zoom);
        const geometry=()=>page.evaluate("const rect=e=>{const r=e.getBoundingClientRect();return[r.x,r.y,r.width,r.height]};return[...document.querySelectorAll('.react-flow__node')].map(n=>({id:n.dataset.id,node:rect(n),asset:rect(n.querySelector('.device-artwork')),region:rect(n.querySelector('.device-interaction-region')),labels:rect(n.querySelector('.device-label-content')),handles:[...n.querySelectorAll('.react-flow__handle')].map(rect),buttons:[...n.querySelectorAll('.device-action')].map(rect)}));");
        const original=await geometry(),art=await point('.react-flow__node[data-id=R] .device-artwork');
        for(const cls of ['device-terminal','device-ping']){
          const b=await point('.react-flow__node[data-id=R] .'+cls);await move({x:1500,y:1000});await move(art);await delay(100);
          for(let n=1;n<=14;n++){await move({x:art.x+(b.x-art.x)*n/14,y:art.y+(b.y-art.y)*n/14+Math.sin(n/14*Math.PI)*5});await delay(12);assert(await page.evaluate(`return getComputedStyle(document.querySelector('.react-flow__node[data-id=R] .${cls}')).pointerEvents==='auto';`));}
          await click(b);if(cls==='device-terminal'){await wait("store.getState().terminals.includes('R')");await page.evaluate("store.getState().closeTerminal('R');");}else{assert.equal(await page.evaluate('return store.getState().quickPing?.sourceId;'),'R');await page.evaluate('store.getState().cancelQuickPing();');}
        }
        await page.evaluate("window.ipCopies=[];Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async t=>ipCopies.push(t)}});");await click(await point('.react-flow__node[data-id=R] .copy-ip'));assert.deepEqual(await page.evaluate('return ipCopies;'),['192.168.10.1']);
        assert.deepEqual((await geometry()).map(({buttons,...r})=>r),original.map(({buttons,...r})=>r));
        for(let n=0;n<2;n++)await drag(await point('.react-flow__node[data-id=R] .react-flow__handle-right'),await point('.react-flow__node[data-id=S] .device-artwork'));
        const links=await page.evaluate("return[...sim.net.links.values()].map(l=>({id:l.id,a:[l.a.device.id,l.a.name],b:[l.b.device.id,l.b.name]}));");assert.equal(links.length,2);assert.deepEqual(links.map(l=>[l.a[1],l.b[1]]),[['eth0','eth0'],['eth1','eth1']]);
        rows.push({zoom,geometry:original,links});
        await page.evaluate("const {createDevice}=await import('/src/engine/factory.ts');for(let i=2;i<4;i++){const d=createDevice(sim.net,'host');sim.net.connect('R',d.id);}store.getState().refresh();");const count=await page.evaluate('return sim.net.links.size;');await drag(await point('.react-flow__node[data-id=R] .react-flow__handle-right'),await point('.react-flow__node[data-id=S] .device-artwork'));assert.equal(await page.evaluate('return sim.net.links.size;'),count);
      }
      await writeFile(path.join(out,'canvas-regressions.json'),JSON.stringify(rows,null,2));
    });
    await test('short ping audit: both parallel ports, multiple routers and actual visible dots on each observed link',async()=>{
      await page.evaluate("const r=await ws.controller.openDocument((await import('/src/export/studio/stabilization.fixture.ts')).stabilizationFixture());if(!r.ok)throw Error(JSON.stringify(r));store.getState().setPaused(true);store.getState().setPacketAnimationSpeed(2);window.auditEvents=[];const old=sim.net.onPingProgress;sim.net.onPingProgress=e=>{auditEvents.push({...e});old?.(e);};");
      const audits=[];
      for(const[source,target,required]of [['A','192.168.10.10',['SW-A-A']],['A','192.168.40.10',['parallel-A-40']],['A','10.0.3.1',['A-D','C-D']],['PC-A2','192.168.30.20',['parallel-A-40','A-D','C-D']]]){
        await page.evaluate(`auditEvents=[];store.getState().openTerminal(${JSON.stringify(source)});window.auditSession=terminals.getSession(sim.net.devices.get(${JSON.stringify(source)}));window.auditAccepted=auditSession.executeCommand('ping -c 1 ${target}');`);await wait("auditEvents.some(e=>e.type==='started')");await page.evaluate('sim.net.scheduler.advanceTo(sim.net.now+8000);');await wait("auditEvents.some(e=>e.type==='finished')");
        const observed=await page.evaluate("return{hops:store.getState().guidedPacket.observation.observed.filter(h=>h.kind==='icmp'),attempts:store.getState().guidedPacket.observation.attempts,text:Array.from({length:auditSession.term.buffer.active.length},(_,i)=>auditSession.term.buffer.active.getLine(i)?.translateToString()).join('\\n')};");assert(observed.attempts.some(a=>a.replied));assert(/1 received/.test(observed.text),observed.text);for(const id of required)assert(observed.hops.some(h=>h.linkId===id),JSON.stringify({source,target,id,hops:observed.hops}));
        await page.evaluate(`store.getState().closeTerminal(${JSON.stringify(source)});store.getState().select(null);await flow.fitView({padding:.2,maxZoom:.65});store.getState().replayGuidedPacket();if(store.getState().guidedPacket.playback.status==='playing')store.getState().toggleGuidedPlayback();`);await delay(80);const total=await page.evaluate('return store.getState().guidedPacket.playback.hops.length;'),seen=new Set();
        for(let n=0;n<total;n++){
          await page.evaluate("if(store.getState().guidedPacket.playback.status==='paused'){store.getState().toggleGuidedPlayback();store.getState().tick(50);if(store.getState().guidedPacket.playback.status==='playing')store.getState().toggleGuidedPlayback();}");await delay(20);
          const frame=await page.evaluate("const state=store.getState().guidedPacket;return [...document.querySelectorAll('.packet-dot')].map(dot=>{const id=+dot.dataset.transferId,hop=state.playback.hops.find(h=>h.id===id),p=document.querySelector('.react-flow__edge[data-id=\"'+dot.dataset.linkId+'\"] .react-flow__edge-path'),x=+dot.getAttribute('cx'),y=+dot.getAttribute('cy');let distance=Infinity;if(p){const length=p.getTotalLength();for(let i=0;i<=250;i++){const q=p.getPointAtLength(length*i/250);distance=Math.min(distance,Math.hypot(x-q.x,y-q.y));}}return{id,link:dot.dataset.linkId,kind:hop?.kind,expected:hop?.linkId,distance,visible:!!dot.getClientRects().length};});");
          for(const dot of frame){assert(dot.visible&&dot.link===dot.expected&&Number.isFinite(dot.distance)&&dot.distance<5,JSON.stringify(dot));if(dot.kind==='icmp')seen.add(dot.link);}
          await page.evaluate('store.getState().nextGuidedHop();');
        }
        for(const id of required)assert(seen.has(id),JSON.stringify({source,target,id,seen:[...seen]}));audits.push({source,target,links:[...new Set(observed.hops.map(h=>h.linkId))],animatedLinks:[...seen],received:1});
      }
      await writeFile(path.join(out,'ping-audit.json'),JSON.stringify(audits,null,2));
    });
  }finally{await page.evaluate('ws.dispose();');await page.evaluate(`await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase(${JSON.stringify(database)});r.onsuccess=resolve;r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Audit cleanup blocked'));});`);}
}
