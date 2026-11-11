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
  const test=async(name,run)=>{
    if(process.env.NETLAB_PING_CONTROL_REVIEW==='1'&&!name.startsWith('ping control:'))return;
    if(process.env.NETLAB_QUICK_PING_REVIEW==='1'&&!/^quick ping: (multiple IPs|address popover)/.test(name))return;
    try{await run();results[name]={passed:true};}catch(e){results[name]={passed:false,error:e.stack};throw e;}
  };
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
      assert.equal(await page.evaluate("return store.getState().packetAnimationSpeed===(await import('/src/packetAnimation.ts')).DEFAULT_PING_ANIMATION_SPEED;"),true);
      assert.equal(await page.evaluate("return localStorage.getItem('netlab:packet-animation-speed:v1');"),'4');
      assert.equal(await page.evaluate("return document.querySelectorAll('.ping-animation-control,#packet-settings-speed,.packet-animation-widget').length;"),0);
      await click('.packet-settings-toggle');await wait("document.querySelector('#packet-capture-menu')");
      assert.equal(await page.evaluate("return document.querySelectorAll('#packet-capture-menu input,#packet-capture-menu select').length;"),0);
      assert.equal(await page.evaluate("return /Live|Schrittmodus|Replay|Geschwindigkeit/.test(document.querySelector('#packet-capture-menu').textContent);"),false);
      await shot('packet-capture-menu-1440.png','graphite-dark',1440,'settings');
      for(const [action,status] of [['start','capturing'],['pause','paused'],['resume','capturing'],['stop','stopped']]){
        await click('#packet-capture-menu [data-capture-action="'+action+'"]');
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
    await test('quick ping: multiple IPs always prompt, preserve deduplication and repeat after completion or cancellation',async()=>{
      await setup();
      await page.evaluate("const i=sim.net.devices.get('r1').interfaces;i[2].ip={...i[0].ip};i[3].ip={addr:0x0a0000ff,prefix:24};store.getState().refresh();await flow.setViewport({x:15,y:210,zoom:.75});");
      await delay(120);
      await page.evaluate("store.getState().beginQuickPing('pc1');");await wait("store.getState().quickPing?.sourceId==='pc1'");
      await click('.react-flow__node[data-id=r1] .device-artwork');
      await wait("document.querySelectorAll('#quick-ping-addresses [role=menuitem]').length===3");
      assert.deepEqual(await page.evaluate("return store.getState().quickPing.addresses;"),[
        {address:'10.0.0.1',interfaces:['eth0','eth2']},{address:'10.1.0.1',interfaces:['eth1']}
      ]);
      assert.equal(await page.evaluate("return events.filter(e=>e.type==='started').length;"),0);
      assert(await page.evaluate("return document.querySelector('#quick-ping-addresses button').textContent.includes('eth0, eth2');"));
      await key('ArrowDown');assert(await page.evaluate("return document.activeElement===document.querySelectorAll('#quick-ping-addresses button')[1];"));
      await key('Escape');await wait("!store.getState().quickPing");assert.equal(await page.evaluate("return events.length;"),0);
      // No hidden selection after cancel; choose the second address by keyboard.
      await page.evaluate("store.getState().beginQuickPing('pc1');store.getState().chooseQuickPingTarget('r1');");
      await wait("document.querySelector('#quick-ping-addresses')");await key('ArrowDown');await key('Enter');
      await wait("!store.getState().quickPing");await page.evaluate("store.getState().setPaused(true);sim.net.scheduler.advanceTo(sim.net.now+9000);");
      await wait("events.some(e=>e.type==='finished')");
      const started=await page.evaluate("return events.filter(e=>e.type==='started').length;");
      await page.evaluate("store.getState().beginQuickPing('pc1');store.getState().chooseQuickPingTarget('r1');");
      await wait("document.querySelectorAll('#quick-ping-addresses [role=menuitem]').length===3");
      assert.deepEqual(await page.evaluate("return store.getState().quickPing.addresses.map(a=>a.address);"),['10.0.0.1','10.1.0.1']);
      assert.equal(await page.evaluate("return events.filter(e=>e.type==='started').length;"),started);
      await click('#quick-ping-addresses button:last-child');await wait("!store.getState().quickPing");
      assert.equal(await page.evaluate("return events.filter(e=>e.type==='started').length;"),started);
      // Both addresses outside the source subnet must offer exactly the same list.
      await page.evaluate("sim.net.devices.get('pc1').interfaces[0].ip={addr:0xc000020a,prefix:24};store.getState().beginQuickPing('pc1');store.getState().chooseQuickPingTarget('r1');");
      await wait("document.querySelectorAll('#quick-ping-addresses [role=menuitem]').length===3");
      await key('Escape');
      // Duplicate IPs alone represent a single destination; no address selector.
      await page.evaluate("sim.net.devices.get('r1').interfaces[1].ip=null;store.getState().beginQuickPing('pc1');store.getState().chooseQuickPingTarget('r1');");
      await wait("!store.getState().quickPing");assert.equal(await page.evaluate("return !!document.querySelector('#quick-ping-addresses');"),false);
      // Restore the deliberately invalid/duplicate runtime-only fixture before
      // the next workspace document switch validates and flushes the draft.
      await page.evaluate("const i=sim.net.devices.get('r1').interfaces;i[2].ip=null;i[3].ip=null;store.getState().refresh();");
    });
    await test('quick ping: address popover follows pan/zoom, flips below and fits both themes at 700/1440',async()=>{
      const boxes=()=>page.evaluate("const p=document.querySelector('#quick-ping-addresses').getBoundingClientRect(),n=document.querySelector('.react-flow__node[data-id=r1]').getBoundingClientRect();return {p:p.toJSON(),n:n.toJSON()};");
      for(const [themeName,width] of [['graphite-dark',1440],['classic-light',700]]){
        await page.send('Emulation.setDeviceMetricsOverride',{width,height:960,deviceScaleFactor:1,mobile:false});
        await setup();await page.evaluate("store.getState().select(null);");await page.evaluate("theme.getState().setTheme("+JSON.stringify(themeName)+");await flow.setViewport({x:15,y:210,zoom:.75});store.getState().beginQuickPing('pc1');store.getState().chooseQuickPingTarget('r1');");
        await wait("document.querySelector('#quick-ping-addresses')");await delay(80);
        const above=await boxes();assert(above.p.bottom<=above.n.top-4);assert(above.p.left>=8&&above.p.right<=width-8);
        assert(await page.evaluate("return document.activeElement===document.querySelector('#quick-ping-addresses button');"));
        const old=await page.evaluate("return flow.getViewport();");
        // Panning with the real canvas pointer must not dismiss the selector.
        const pane=await point('.react-flow__pane');
        for(const type of ['mousePressed','mouseMoved','mouseReleased'])await page.send('Input.dispatchMouseEvent',{type,x:pane.x+(type==='mousePressed'?0:25),y:pane.y+(type==='mousePressed'?0:18),button:type==='mouseMoved'?'none':'left',buttons:type==='mouseReleased'?0:1,clickCount:1});
        await delay(100);assert(await page.evaluate("return !!document.querySelector('#quick-ping-addresses');"));
        await page.evaluate("await flow.setViewport({x:45,y:235,zoom:.75});");await delay(80);
        const moved=await boxes();assert(Math.abs((moved.p.top-above.p.top)-(moved.n.top-above.n.top))<2);
        await page.evaluate("await flow.setViewport({x:20,y:180,zoom:.9});");await delay(80);
        const zoomed=await boxes();assert(zoomed.p.bottom<=zoomed.n.top-4);assert(Math.abs(zoomed.p.width-above.p.width)<1);
        assert.notDeepEqual(await page.evaluate("return flow.getViewport();"),old);
        await shot('quick-ping-anchored-'+width+'.png',themeName,width,'address-choice-above');
        await page.evaluate("await flow.setViewport({x:20,y:-45,zoom:.75});");await delay(80);
        const below=await boxes();assert(below.p.top>=below.n.bottom+4);assert(below.p.right<=width-8);
        await shot('quick-ping-flipped-'+width+'.png',themeName,width,'address-choice-below');
        await page.evaluate("document.querySelector('#quick-ping-addresses button').focus({preventScroll:true});");
        await key('End');assert(await page.evaluate("return document.activeElement.textContent==='Abbrechen';"));
        await key('Home');await key('Escape');assert.equal(await page.evaluate("return store.getState().quickPing;"),null);
      }
      await page.send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});
      await page.evaluate("theme.getState().setTheme('graphite-dark');");await setup();await page.evaluate("await flow.setViewport({x:15,y:20,zoom:.75});");
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
    await test('ping control: bounded drag, independent controls, dock resize, themes and reset on reopening',async()=>{
      await setup();await page.evaluate("store.getState().select(null);store.getState().setPaused(false);store.getState().openTerminal('pc1');");
      await page.evaluate("terminals.getSession(sim.net.devices.get('pc1')).term.input('ping 10.0.0.30\\r',true);");
      await wait("document.querySelector('#ping-animation-speed')&&store.getState().guidedPacket.playback.status==='playing'");
      await page.evaluate("store.getState().toggleGuidedPlayback();");
      const {reviewPingControlDrag}=await import('./ping-control-drag-review.mjs');
      await reviewPingControlDrag({page,root,click,key,delay});
      const current=await page.evaluate("const r=document.querySelector('.ping-animation-control').getBoundingClientRect();return {x:r.x,y:r.y};");
      await page.evaluate("document.querySelector('#ping-animation-speed').focus();");await key('Home');await wait('store.getState().packetAnimationSpeed===.25');
      await key('End');await wait('store.getState().packetAnimationSpeed===2');
      assert(await page.evaluate(`const r=document.querySelector('.ping-animation-control').getBoundingClientRect();return r.x===${current.x}&&r.y===${current.y};`));
      await click('.ping-animation-close');await wait("!document.querySelector('.ping-animation-control')");
      assert.equal(await page.evaluate('return store.getState().guidedPacket.observation.sourceFinished;'),false);
      await page.evaluate("terminals.getSession(sim.net.devices.get('pc1')).term.input('\\u0003',true);store.getState().toggleGuidedPlayback();");
      await wait("store.getState().guidedPacket.observation.sourceFinished&&store.getState().guidedPacket.playback.status==='finished'");
      await page.evaluate("terminals.getSession(sim.net.devices.get('pc1')).term.input('ping -c 1 10.0.0.30\\r',true);");
      await wait("document.querySelector('#ping-animation-speed')");
      assert(await page.evaluate("const b=document.querySelector('.ping-animation-control').getBoundingClientRect(),c=document.querySelector('.canvas').getBoundingClientRect();return Math.abs((b.left+b.right)/2-(c.left+c.right)/2)<2&&Math.abs(c.bottom-b.bottom-56)<2;"));
      for(const width of [1440,700])for(const selectedTheme of ['graphite-dark','classic-light']){
        await page.send('Emulation.setDeviceMetricsOverride',{width,height:960,deviceScaleFactor:1,mobile:false});
        await page.evaluate(`theme.getState().setTheme(${JSON.stringify(selectedTheme)});`);await delay(90);
        assert(await page.evaluate("const b=document.querySelector('.ping-animation-control').getBoundingClientRect(),c=document.querySelector('.canvas').getBoundingClientRect();return b.left>=c.left&&b.right<=c.right&&b.top>=c.top&&b.bottom<=c.bottom;"));
      }
      await wait("store.getState().guidedPacket.observation.sourceFinished&&store.getState().guidedPacket.playback.status==='finished'");
      await wait("!document.querySelector('.ping-animation-control')");
    });
    await test('ping control: Quick Ping passive indicator, Escape, languages and immediate drag on normal and quick pings',async()=>{
      const {reviewImmediatePingDrag}=await import('./ping-control-drag-review.mjs');
      const usabilityRefs=path.join(root,'.playwright-mcp/reviews/quick-ping-usability/referencias-chatgpt');await mkdir(usabilityRefs,{recursive:true});
      const usabilityShot=async name=>{const png=await page.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(usabilityRefs,name+'.png'),Buffer.from(png.data,'base64'));};
      await page.send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});
      for(const [language,text] of [['de','Ziel auswählen'],['en','Select target'],['pt-BR','Selecione o destino']]) for(const selectedTheme of ['graphite-dark','classic-light']){
        await setup();await page.evaluate(`(await import('/src/i18n/index.ts')).useLanguage.getState().setLanguage(${JSON.stringify(language)});theme.getState().setTheme(${JSON.stringify(selectedTheme)});store.getState().select('pc1');`);
        await click('.react-flow__node[data-id=pc1] .device-ping');await wait("document.querySelector('.quick-ping-indicator')");
        assert(await page.evaluate(`const e=document.querySelector('.quick-ping-indicator'),r=e.getBoundingClientRect();return e.textContent.includes(${JSON.stringify(text)})&&e.textContent.includes('pc1')&&r.height<40&&!e.querySelector('button')&&!document.querySelector('.quick-ping-panel')&&getComputedStyle(e).pointerEvents==='none'&&!e.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2));`));
        if(language==='de'&&selectedTheme==='graphite-dark')await usabilityShot('01-indicador-discreto-DE');
        if(language==='pt-BR'&&selectedTheme==='classic-light')await usabilityShot('02-indicador-discreto-PT-BR');
        await key('Escape');await wait('!store.getState().quickPing');
      }
      for(const mode of ['normal','quick']) {
        await setup();await page.evaluate("store.getState().setPaused(false);store.getState().setPacketAnimationSpeed(1);store.getState().select('pc1');");
        let start='',trigger;
        if(mode==='normal'){
          await page.evaluate("store.getState().openTerminal('pc1');");await delay(100);
          start="terminals.getSession(sim.net.devices.get('pc1')).term.input('ping -c 1 10.0.0.30\\r',true);";
        }else{
          await click('.react-flow__node[data-id=pc1] .device-ping');await wait("document.querySelector('.quick-ping-indicator')");
          trigger=()=>click('.react-flow__node[data-id=nb1] .device-artwork');
        }
        await reviewImmediatePingDrag({page,wait,start,trigger,mode,report});
        if(mode==='quick')await usabilityShot('03-painel-arrastado-sem-texto-redundante');
        await wait("store.getState().guidedPacket.observation.sourceFinished");
        assert(await page.evaluate("const t=terminals.getSession(sim.net.devices.get('pc1')).term;return Array.from({length:t.buffer.active.length},(_,i)=>t.buffer.active.getLine(i)?.translateToString()).join('\\n').includes('64 bytes from 10.0.0.30');"));
      }
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
    await test('ping control: remember manual speed globally, languages, themes and F5 opt-in and opt-out',async()=>{
      const {reviewPingSpeedPreference}=await import('./ping-speed-preference-review.mjs');
      await reviewPingSpeedPreference({page,root,database,setup,click,key,wait,delay});
    });
    await test('ping control: independent document positions, reload, JSON, dock and opt-out',async()=>{
      const {reviewPingPosition}=await import('./ping-position-review.mjs');
      await reviewPingPosition({page,root,database,setup,click,key,wait,delay});
    });
    if(process.env.NETLAB_PING_CONTROL_REVIEW==='1'){report.deviceActionReview={results};return;}
    const manifest=path.join(directory,'manifest.json');const mapped=captures.map(c=>({source:path.relative(root,path.join(directory,c.filename)).split(path.sep).join('/'),scene:c.filename.replace('.png',''),variant:c.theme,state:c.state,width:c.width,height:c.height}));
    await writeFile(manifest,JSON.stringify({id:'ping-animation-simple',title:'NetLab - Ping-Animation',description:'Chromium real em perfil e IndexedDB descartáveis; sem dados pessoais.',variants:[{id:'graphite-dark',label:'Graphite Dark'},{id:'classic-light',label:'Classic Light'}],states:['selected','selecting','terminal','address-choice','address-choice-above','address-choice-below','settings','ping-bar'],captures:mapped,share:mapped.filter(c=>c.state==='ping-bar'||c.state==='address-choice-above'||c.scene==='quick-ping-result-1440').map(c=>({scene:c.scene,variant:c.variant,state:c.state,width:c.width,height:c.height,name:c.scene})),shareContactSheet:false},null,2));
    const publication=await generateReview(manifest);report.deviceActionReview={captures:captures.length,measurements:measurements.length,...publication};
  } finally {
    try{await page.evaluate('window.stopPingSampling?.();workspace?.dispose();');}catch{}
    await page.evaluate(`await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase(${JSON.stringify(database)});r.onsuccess=resolve;r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Disposable action review cleanup blocked'));});`);
    Object.assign(report.results,results);await writeFile(path.join(directory,'results.json'),JSON.stringify({results,captures,measurements},null,2));
  }
}
