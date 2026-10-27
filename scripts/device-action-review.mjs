import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { generateReview } from './visual-review.mjs';
const dev=(id,kind,x,y,ips,os)=>({id,kind,name:id,x,y,forwarding:kind==='router',os,ifaces:ips.map((ip,i)=>({name:'eth'+i,ip,up:true})),routes:[]});
const topology={app:'netsim',version:1,devices:[dev('pc1','host',70,290,['10.0.0.10/24'],'linux'),dev('pc2','host',250,290,['10.0.0.20/24'],'windows'),
  dev('nb1','notebook',430,290,['10.0.0.30/24'],'linux'),dev('nb2','notebook',610,290,['10.0.0.40/24'],'windows'),dev('sw1','switch',250,85,Array(8).fill(null)),
  dev('r1','router',520,85,['10.0.0.1/24','10.1.0.1/24',null,null]),dev('srv1','server',780,85,['10.1.0.2/24'])],
  links:[...['pc1','pc2','nb1','nb2'].map((id,i)=>({id:id+'-sw',a:[id,'eth0'],b:['sw1','eth'+i]})),
    {id:'sw-router',a:['sw1','eth4'],b:['r1','eth0']},{id:'router-server',a:['r1','eth1'],b:['srv1','eth0']}]};

export async function runDeviceActionReview({page,url,root,report}) {
  const directory=path.join(root,'.playwright-mcp/reviews/raw/device-actions-staging'); await mkdir(directory,{recursive:true});
  const database='netlab-idb-test-'+crypto.randomUUID(),captures=[],measurements=[],results={};
  const delay=ms=>new Promise(r=>setTimeout(r,ms));
  const wait=async expression=>{for(let i=0;i<220;i++){if(await page.evaluate(`return !!(${expression});`))return;await delay(40);}throw Error('Device actions condition: '+expression);};
  const test=async(name,run)=>{try{await run();results[name]={passed:true};}catch(e){results[name]={passed:false,error:e.stack};throw e;}};
  const mouse=async(x,y)=>page.send('Input.dispatchMouseEvent',{type:'mouseMoved',x,y});
  const point=selector=>page.evaluate(`const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2};`);
  const click=async selector=>{const p=await point(selector);await mouse(p.x,p.y);for(const type of ['mousePressed','mouseReleased'])await page.send('Input.dispatchMouseEvent',{type,...p,button:'left',clickCount:1});await delay(50);};
  const key=async(key,code=key)=>{for(const type of ['keyDown','keyUp'])await page.send('Input.dispatchKeyEvent',{type,key,code,...(key==='Enter'?{windowsVirtualKeyCode:13,text:type==='keyDown'?'\r':undefined}:{})});};
  const shot=async(filename,theme,width,state)=>{await delay(80);const png=await page.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(directory,filename),Buffer.from(png.data,'base64'));captures.push({filename,theme,width,height:960,state});};
  const geometry=()=>page.evaluate(`const rect=e=>e.getBoundingClientRect().toJSON();return{viewport:flow.getViewport(),nodes:[...document.querySelectorAll('.react-flow__node')].map(n=>({id:n.dataset.id,box:rect(n),sprite:rect(n.querySelector('.device-artwork')),handles:[...n.querySelectorAll('.react-flow__handle')].map(rect)})),positions:store.getState().nodes.map(n=>({id:n.id,position:n.position}))};`);
  const noOverlap=()=>page.evaluate(`const rect=e=>e.getBoundingClientRect(),area=(a,b)=>Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));return [...document.querySelectorAll('.react-flow__node')].flatMap(n=>[...n.querySelectorAll('.device-action')].flatMap(b=>[...n.querySelectorAll('.dev-os-badge,.react-flow__handle,.dev-label,.node-network-label')].filter(e=>area(rect(b),rect(e))>1).map(e=>({id:n.dataset.id,button:b.className,other:e.className.baseVal??e.className}))));`);
  const setup=async()=>{await page.evaluate(`const r=await workspace.controller.openDocument({schemaVersion:1,topology:${JSON.stringify(topology)}});if(!r.ok)throw Error(JSON.stringify(r));store.getState().setPaused(true);window.flow=probe.getViewportProbe();window.events=[];const old=sim.net.onPingProgress;sim.net.onPingProgress=e=>{events.push({...e,now:sim.net.now});old?.(e);};window.terminals=await import('/src/terminals.ts');`);await wait("document.querySelectorAll('.react-flow__node').length===7");await delay(160);};
  try {
    await page.send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false}); await page.send('Page.navigate',{url});await wait("document.readyState==='complete'&&location.pathname==='/__workspace_ui_test__'");
    await page.evaluate(`localStorage.setItem('netlab:packet-animation-speed:v1','4');localStorage.setItem('netlab:packet-animation-duration:v1','250');window.entry=await import('/src/workspace/reviewEntry.tsx');window.store=(await import('/src/store.ts')).useStore;window.sim=(await import('/src/sim.ts')).sim;window.theme=(await import('/src/uiTheme.ts')).useUiTheme;window.probe=await import('/src/workspace/viewportProbe.browser.tsx');window.workspace=await entry.mountWorkspaceReview(document.getElementById('root'),{databaseName:${JSON.stringify(database)}});`);
    await wait("document.querySelector('.react-flow')");await setup();await page.send('Page.bringToFront');await delay(350);
    await test('controls: Packets button and dropdown retain capture and inspection without ping playback controls',async()=>{
      assert.equal(await page.evaluate('return store.getState().speed;'),1);
      assert.equal(await page.evaluate('return store.getState().packetAnimationSpeed;'),1);
      assert.equal(await page.evaluate("return localStorage.getItem('netlab:packet-animation-speed:v1');"),'4');
      assert.equal(await page.evaluate("return document.querySelectorAll('.ping-animation-control,#packet-settings-speed,.packet-animation-widget').length;"),0);
      await click('.packet-settings-toggle');await wait("document.querySelector('#packet-capture-menu')");
      assert.equal(await page.evaluate("return document.querySelectorAll('#packet-capture-menu input,#packet-capture-menu select').length;"),0);
      assert.equal(await page.evaluate("return /Live|Schrittmodus|Replay|Geschwindigkeit/.test(document.querySelector('#packet-capture-menu').textContent);"),false);
      await shot('packet-capture-menu-1440.png','graphite-dark',1440,'settings');
      for(const [label,status] of [['Start capture','capturing'],['Pause capture','paused'],['Resume capture','capturing'],['Stop capture','stopped']]){
        await page.evaluate(`[...document.querySelectorAll('#packet-capture-menu button')].find(b=>b.textContent===${JSON.stringify(label)}).click();`);
        assert.equal(await page.evaluate('return store.getState().packetCapture.status;'),status);
        await click('.packet-settings-toggle');await wait("document.querySelector('#packet-capture-menu')");
      }
      await key('Escape');await click('#packets-toggle');await wait("document.querySelector('#packet-inspector')");
      await click('#packets-toggle');await wait("!document.querySelector('#packet-inspector')");
    });
    await test('controls: definitive corners, both OS and device types, keyboard/hover/selection, themes and zooms',async()=>{
      for(const width of [1440,700])for(const theme of ['graphite-dark','classic-light'])for(const zoom of [.5,.75,1]){
        await page.send('Emulation.setDeviceMetricsOverride',{width,height:960,deviceScaleFactor:1,mobile:false});
        await page.evaluate(`theme.getState().setTheme(${JSON.stringify(theme)});store.getState().select(null);await flow.setViewport({x:15,y:20,zoom:${zoom}});`);await delay(60);
        const baseline=await geometry();
        for(const state of ['normal','hover','selected','focus']){
          await mouse(width-5,900);await page.evaluate(`document.activeElement?.blur();store.getState().select(${state==='selected'?"'pc2'":'null'});`);
          if(state==='hover'){const p=await point('.react-flow__node[data-id=pc1] .device-terminal');await mouse(p.x,p.y);}
          if(state==='focus')await page.evaluate("document.querySelector('.react-flow__node[data-id=nb2] .device-ping').focus({preventScroll:true});");
          assert.deepEqual(await noOverlap(),[]);
          if(state==='selected')await wait("[...document.querySelectorAll('.react-flow__node[data-id=pc2] .device-action')].every(b=>getComputedStyle(b).opacity==='1')");
          const g=await geometry();assert.deepEqual(g,baseline,'Controls changed geometry or viewport');
          measurements.push({width,theme,zoom,state,viewport:g.viewport});
        }
        assert(await page.evaluate('return document.documentElement.scrollWidth<=innerWidth+1;'));
        assert(await page.evaluate(`return [...document.querySelectorAll('.device-action')].every(b=>{const r=b.getBoundingClientRect();const n=b.closest('.device-node').getBoundingClientRect();return Math.abs(r.width-28*${zoom})<1&&Math.abs(r.height-r.width)<1&&Math.abs(r.top-n.top-4*${zoom})<2;});`));
        // Only a handful of real captures; all 48 combinations remain measured.
        if(zoom===(width===700?.5:1)){
          await page.evaluate("store.getState().select('pc2');document.querySelector('.react-flow__node[data-id=pc1] .device-terminal').focus({preventScroll:true});");
          await shot(`controls-${theme}-${width}.png`,theme,width,'selected');
        }
      }
      await page.send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});await page.evaluate("store.getState().select(null);theme.getState().setTheme('graphite-dark');await flow.setViewport({x:15,y:20,zoom:.75});");
      const before=await geometry();await page.evaluate("history.replaceState({},'','?deviceActions=b');store.getState().refresh();");assert.deepEqual(await geometry(),before);assert.equal(await page.evaluate("return !!document.querySelector('[data-layout],.device-ping-preview');"),false);
    });
    await test('controls: Terminal pointer/keyboard, focused Esc and drag safety during target selection',async()=>{
      await click('.react-flow__node[data-id=pc1] .device-terminal');
      assert.equal(await page.evaluate('return store.getState().activeTerminal;'),'pc1');
      await wait("terminals.getSession(sim.net.devices.get('pc1')).opened");await delay(80);
      await page.evaluate("store.getState().closeTerminal('pc1');document.querySelector('.react-flow__node[data-id=nb2] .device-terminal').focus({preventScroll:true});");
      await key('Enter');await wait("store.getState().activeTerminal==='nb2'");
      await wait("terminals.getSession(sim.net.devices.get('nb2')).opened");await delay(80);
      await page.evaluate("store.getState().closeTerminal('nb2');");
      await click('.react-flow__node[data-id=pc1] .device-ping');
      const before=await page.evaluate('return store.getState().nodes.map(n=>n.position);');
      const p=await point('.react-flow__node[data-id=nb1] .device-artwork');
      await page.send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1});
      await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x+40,y:p.y+20,buttons:1});
      await page.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x+40,y:p.y+20,button:'left',clickCount:1});
      assert.deepEqual(await page.evaluate('return store.getState().nodes.map(n=>n.position);'),before);
      await page.evaluate("document.querySelector('.react-flow__node[data-id=pc1] .device-ping').focus({preventScroll:true});");
      await key('Escape');assert.equal(await page.evaluate('return store.getState().quickPing;'),null);
      await setup();await page.evaluate('await flow.setViewport({x:15,y:20,zoom:.75});');
    });
    await test('quick ping: Linux to Linux, closed terminal, automatic Run only after activation, four real attempts',async()=>{
      await page.evaluate("store.getState().setPaused(false);store.getState().setPaused(true,'activation');");
      await click('.react-flow__node[data-id=pc1] .device-ping');await wait("document.querySelector('.quick-ping-source')");
      await shot('quick-ping-select-1440.png','graphite-dark',1440,'selecting');
      const before=await geometry();await click('.react-flow__node[data-id=nb1] .device-artwork');
      await wait("!store.getState().quickPing&&store.getState().terminals.length===1");assert.equal(await page.evaluate('return store.getState().paused;'),false);
      const target=await point('.react-flow__node[data-id=nb1] .device-artwork');
      for(const type of ['mousePressed','mouseReleased'])await page.send('Input.dispatchMouseEvent',{type,...target,button:'left',clickCount:2});
      assert.deepEqual(await page.evaluate('return store.getState().terminals;'),['pc1']);
      await wait("events.some(e=>e.type==='finished')");
      assert.equal(await page.evaluate("return events.filter(e=>e.type==='started').length;"),1);
      const attempts=await page.evaluate("return events.filter(e=>e.type==='attempt');");assert.equal(attempts.length,4);assert.deepEqual(attempts.map(e=>e.now-attempts[0].now),[0,1000,2000,3000]);
      assert.deepEqual((await geometry()).viewport,before.viewport);await page.evaluate('store.getState().setPaused(true);');await delay(100);
      assert(await page.evaluate("const t=terminals.getSession(sim.net.devices.get('pc1')).term;return Array.from({length:t.buffer.active.length},(_,i)=>t.buffer.active.getLine(i)?.translateToString()).join('\\n').includes('4 received');"));
      await shot('quick-ping-result-1440.png','graphite-dark',1440,'terminal');
    });
    await test('quick ping: Windows to Linux, existing terminal, Pause manual and no duplicate commands',async()=>{
      await page.evaluate("store.getState().openTerminal('pc2');window.winSession=terminals.getSession(sim.net.devices.get('pc2'));window.events=[];");await delay(120);
      await click('.react-flow__node[data-id=pc2] .device-ping');await click('.react-flow__node[data-id=pc1] .device-artwork');
      assert.equal(await page.evaluate('return store.getState().paused;'),true);
      const now=await page.evaluate('return sim.net.now;');await delay(100);assert.equal(await page.evaluate('return sim.net.now;'),now);
      await page.evaluate("sim.net.scheduler.advanceTo(sim.net.now+6000);");await delay(80);
      assert.equal(await page.evaluate("return events.filter(e=>e.type==='started').length;"),1);
      assert.equal(await page.evaluate("return events.filter(e=>e.type==='attempt').length;"),4);
      assert.equal(await page.evaluate("return terminals.getSession(sim.net.devices.get('pc2'))===winSession;"),true);
      assert(await page.evaluate("return Array.from({length:winSession.term.buffer.active.length},(_,i)=>winSession.term.buffer.active.getLine(i)?.translateToString()).join('\\n').includes('ping -n 4 10.0.0.10');"));
    });
    await test('quick ping: missing address, explicit multiple-address selection, Esc and source toggle, plan change',async()=>{
      await page.evaluate("for(const id of [...store.getState().terminals])store.getState().closeTerminal(id);sim.net.devices.get('nb1').interfaces[0].ip=null;store.getState().refresh();");await delay(100);
      await click('.react-flow__node[data-id=pc1] .device-ping');await click('.react-flow__node[data-id=nb1] .device-artwork');
      await wait("document.querySelector('.quick-ping-panel').textContent.includes('keine nutzbare')");assert.deepEqual(await page.evaluate('return store.getState().terminals;'),[]);
      await key('Escape');assert.equal(await page.evaluate('return store.getState().quickPing;'),null);
      await click('.react-flow__node[data-id=pc1] .device-ping');await click('.react-flow__node[data-id=pc1] .device-ping');assert.equal(await page.evaluate('return store.getState().quickPing;'),null);
      await page.evaluate("const i=sim.net.devices.get('r1').interfaces;i[0].ip={addr:0xc0000201,prefix:24};i[1].ip={addr:0xc6336401,prefix:24};");
      await click('.react-flow__node[data-id=pc1] .device-ping');await click('.react-flow__node[data-id=r1] .device-artwork');
      await wait("document.querySelectorAll('.quick-ping-panel button').length===3");await shot('quick-ping-addresses-1440.png','graphite-dark',1440,'address-choice');
      await click('.quick-ping-panel button');assert.equal(await page.evaluate('return store.getState().quickPing;'),null);
      await page.evaluate("sim.net.scheduler.advanceTo(sim.net.now+7000);");
      await click('.react-flow__node[data-id=pc1] .device-ping');
      await setup();assert.equal(await page.evaluate('return store.getState().quickPing;'),null);assert.equal(await page.evaluate("return document.querySelectorAll('.quick-ping-source,.quick-ping-panel').length;"),0);
    });
    await test('quick ping: VLAN and routing failure remain real failures, never artificial success',async()=>{
      for(const failure of ['vlan','route']){
        await setup();await page.evaluate(`window.events=[];if(${JSON.stringify(failure)}==='vlan')sim.net.devices.get('sw1').vlans.set('eth1',20);else sim.net.devices.get('pc2').interfaces[0].ip={addr:0xc0000202,prefix:24};`);
        await click('.react-flow__node[data-id=pc1] .device-ping');await click('.react-flow__node[data-id=pc2] .device-artwork');
        await page.evaluate("sim.net.scheduler.advanceTo(sim.net.now+11000);");await delay(80);
        assert.equal(await page.evaluate("return events.filter(e=>e.type==='attempt').length;"),failure==='route'?1:4);
        assert(await page.evaluate("const t=terminals.getSession(sim.net.devices.get('pc1')).term;return Array.from({length:t.buffer.active.length},(_,i)=>t.buffer.active.getLine(i)?.translateToString()).join('\\n').includes('0 received');"));
      }
    });
    await test('layout: tab targets, keyboard reorder, viewport and persistent draft remain intact',async()=>{
      const state=await page.evaluate('return workspace.controller.getState();');await page.evaluate('await workspace.controller.flush();');
      const active=state.activeDraftId,viewport=(await geometry()).viewport;
      assert(await page.evaluate("return [...document.querySelectorAll('.workspace-tabs [role=tab]')].every(e=>e.getBoundingClientRect().height>=32);"));
      await page.evaluate(`const r=await workspace.controller.switchDraft(${JSON.stringify(state.session.draftIds[0])});if(!r.ok)throw Error(JSON.stringify(r));`);
      await page.evaluate(`const r=await workspace.controller.switchDraft(${JSON.stringify(active)});if(!r.ok)throw Error(JSON.stringify(r));`);await delay(130);
      assert.equal(await page.evaluate('return workspace.controller.getState().activeDraftId;'),active);
      await page.evaluate("await flow.setViewport({x:31,y:43,zoom:.75});store.getState().select('pc1');");await delay(100);assert.deepEqual((await geometry()).viewport,{x:31,y:43,zoom:.75});
    });
    await test('ping UX: terminal ping, one dot, live speed change, dismissal, finite ping and automatic timeout',async()=>{
      await setup();await page.evaluate("store.getState().setPaused(false);store.getState().setPacketAnimationSpeed(1);store.getState().openTerminal('pc1');store.getState().startPacketCapture();");
      await page.evaluate(`window.pingUXSamples=[];let frame;window.stopPingSampling=()=>cancelAnimationFrame(frame);const sample=()=>{const dots=[...document.querySelectorAll('.packet-dot')];pingUXSamples.push({count:dots.length,seq:dots[0]?.dataset.pingSequence,direction:dots[0]?.dataset.direction});if(pingUXSamples.length<5000)frame=requestAnimationFrame(sample);};sample();terminals.getSession(sim.net.devices.get('pc1')).term.input('ping 10.0.0.30\\r',true);`);
      await wait("document.querySelector('#ping-animation-speed')&&document.querySelector('.packet-dot')");
      assert.equal(await page.evaluate("return document.querySelectorAll('input[aria-valuetext]').length;"),1);
      const viewport=(await geometry()).viewport;
      await page.evaluate(`document.querySelector('#ping-animation-speed').focus();`);
      await key('Home');await wait('store.getState().packetAnimationSpeed===.5');
      await key('ArrowRight');await wait('store.getState().packetAnimationSpeed===1');
      await key('ArrowRight');await wait('store.getState().packetAnimationSpeed===2');
      await page.evaluate(`const before=store.getState().guidedPacket.playback;const now=sim.net.now;store.getState().setPacketAnimationSpeed(.5);const after=store.getState().guidedPacket.playback;if(before.index!==after.index||before.progress!==after.progress||sim.net.now!==now)throw Error('Speed jumped or changed protocol time');`);
      await click('.ping-animation-close');await wait("!document.querySelector('.ping-animation-control')");
      assert.equal(await page.evaluate('return store.getState().guidedPacket.observation.sourceFinished;'),false);
      await delay(180);assert.equal(await page.evaluate("return !!document.querySelector('.ping-animation-control');"),false);
      await page.evaluate("terminals.getSession(sim.net.devices.get('pc1')).term.input('\\u0003',true);store.getState().setPacketAnimationSpeed(2);");
      await wait("store.getState().guidedPacket.observation.sourceFinished");
      await wait("!((store.getState().guidedPacket.playback.index<store.getState().guidedPacket.playback.hops.length-1)||store.getState().guidedPacket.playback.progress<1)");
      await page.evaluate("window.stopPingSampling();window.firstSamples=pingUXSamples;window.pingUXSamples=[];terminals.getSession(sim.net.devices.get('pc1')).term.input('ping -c 2 10.0.0.30\\r',true);");
      await wait("document.querySelector('#ping-animation-speed')");
      await wait("store.getState().guidedPacket.observation.sourceFinished&&store.getState().guidedPacket.playback.status==='finished'");
      assert.equal(await page.evaluate("return document.querySelectorAll('.packet-dot').length;"),0);
      assert(await page.evaluate("return !!document.querySelector('.ping-animation-control');"));
      await delay(200);assert(await page.evaluate("return !!document.querySelector('.ping-animation-control');"));
      await wait("!document.querySelector('.ping-animation-control')");
      assert(await page.evaluate('return firstSamples.length>1&&firstSamples.every(s=>s.count<=1);'));
      assert.deepEqual((await geometry()).viewport,viewport);
      assert.equal(await page.evaluate("return events.filter(e=>e.type==='started').length;"),2);
      assert(await page.evaluate("return store.getState().packetCapture.records.length>0;"));
    });
    await test('ping UX: Windows terminal, both themes and widths, one sequential dot and unchanged capture cadence',async()=>{
      await setup();await page.evaluate("store.getState().setPaused(false);store.getState().setPacketAnimationSpeed(.5);store.getState().openTerminal('pc2');store.getState().startPacketCapture();");
      await page.evaluate(`window.pingUXSamples=[];let frame;window.stopPingSampling=()=>cancelAnimationFrame(frame);const sample=()=>{const dots=[...document.querySelectorAll('.packet-dot')];pingUXSamples.push({count:dots.length,seq:dots[0]?.dataset.pingSequence,direction:dots[0]?.dataset.direction});if(pingUXSamples.length<5000)frame=requestAnimationFrame(sample);};sample();terminals.getSession(sim.net.devices.get('pc2')).term.input('ping -n 3 10.0.0.30\\r',true);`);
      await wait("document.querySelector('#ping-animation-speed')&&store.getState().guidedPacket.playback.status==='playing'&&store.getState().guidedPacket.playback.progress>.05");
      await page.evaluate("store.getState().toggleGuidedPlayback();");
      for(const width of [1440,700])for(const theme of ['graphite-dark','classic-light']){
        await page.send('Emulation.setDeviceMetricsOverride',{width,height:960,deviceScaleFactor:1,mobile:false});
        await page.evaluate(`theme.getState().setTheme(${JSON.stringify(theme)});store.getState().select(null);await flow.setViewport({x:15,y:15,zoom:.5});`);await delay(90);
        const bounds=await page.evaluate(`const bar=document.querySelector('.ping-animation-control').getBoundingClientRect(),canvas=document.querySelector('.canvas').getBoundingClientRect(),dock=document.querySelector('.terminal-dock').getBoundingClientRect();return{bar:bar.toJSON(),canvas:canvas.toJSON(),dock:dock.toJSON(),scroll:document.documentElement.scrollWidth};`);
        assert(bounds.bar.left>=bounds.canvas.left&&bounds.bar.right<=bounds.canvas.right);
        assert(bounds.bar.bottom<=bounds.dock.top&&bounds.bar.top>=bounds.canvas.top+bounds.canvas.height/2);
        assert(bounds.scroll<=width+1);
        assert.equal(await page.evaluate("return document.querySelectorAll('.packet-dot').length;"),1);
        await shot(`ping-bar-${theme}-${width}.png`,theme,width,'ping-bar');
      }
      await page.evaluate("store.getState().toggleGuidedPlayback();store.getState().setPacketAnimationSpeed(2);");
      await wait("store.getState().guidedPacket.observation.sourceFinished&&store.getState().guidedPacket.playback.status==='finished'");
      await page.evaluate('window.stopPingSampling();');
      assert(await page.evaluate('return pingUXSamples.length>2&&pingUXSamples.every(s=>s.count<=1);'));
      const sequence=await page.evaluate("return pingUXSamples.filter(s=>s.seq).map(s=>Number(s.seq));");
      assert(sequence.length>0&&sequence.every((n,i)=>!i||n>=sequence[i-1]),'Ping attempts interleaved visually');
      const attempts=await page.evaluate("return events.filter(e=>e.type==='attempt');");assert.equal(attempts.length,3);assert.deepEqual(attempts.map(e=>e.now-attempts[0].now),[0,1000,2000]);
      assert(await page.evaluate("const t=terminals.getSession(sim.net.devices.get('pc2')).term;return Array.from({length:t.buffer.active.length},(_,i)=>t.buffer.active.getLine(i)?.translateToString()).join('\\n').includes('Sent = 3, Received = 3');"));
      await wait("!document.querySelector('.ping-animation-control')");
    });
    const manifest=path.join(directory,'manifest.json');const mapped=captures.map(c=>({source:path.relative(root,path.join(directory,c.filename)).split(path.sep).join('/'),scene:c.filename.replace('.png',''),variant:c.theme,state:c.state,width:c.width,height:c.height}));
    await writeFile(manifest,JSON.stringify({id:'ping-animation-simple',title:'NetLab - Ping-Animation',description:'Chromium real em perfil e IndexedDB descartáveis; sem dados pessoais.',variants:[{id:'graphite-dark',label:'Graphite Dark'},{id:'classic-light',label:'Classic Light'}],states:['selected','selecting','terminal','address-choice','settings','ping-bar'],captures:mapped,share:mapped.filter(c=>c.state==='ping-bar'||c.scene==='quick-ping-result-1440').map(c=>({scene:c.scene,variant:c.variant,state:c.state,width:c.width,height:c.height,name:c.scene})),shareContactSheet:false},null,2));
    const publication=await generateReview(manifest);report.deviceActionReview={captures:captures.length,measurements:measurements.length,...publication};
  } finally {
    try{await page.evaluate('window.stopPingSampling?.();workspace?.dispose();');}catch{}
    await page.evaluate(`await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase(${JSON.stringify(database)});r.onsuccess=resolve;r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Disposable action review cleanup blocked'));});`);
    Object.assign(report.results,results);await writeFile(path.join(directory,'results.json'),JSON.stringify({results,captures,measurements},null,2));
  }
}
