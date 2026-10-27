import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const device=(id,kind,x,y,ips,os)=>({id,kind,name:id,x,y,forwarding:kind==='router',os,ifaces:ips.map((ip,i)=>({name:'eth'+i,ip,up:true})),routes:[]});
const topology={app:'netsim',version:1,devices:[device('pc1','host',160,300,['10.0.0.10/24'],'linux'),device('pc2','host',460,300,['10.0.0.20/24'],'windows'),
  device('nb1','notebook',750,300,['10.0.0.30/24'],'linux'),device('sw1','switch',460,90,Array(8).fill(null)),
  device('r1','router',750,90,['10.0.0.1/24','10.1.0.1/24',null,null]),device('srv1','server',1070,200,['10.1.0.2/24'])],
  links:[{id:'pc1-sw',a:['pc1','eth0'],b:['sw1','eth0']},{id:'pc2-sw',a:['pc2','eth0'],b:['sw1','eth1']},{id:'nb-sw',a:['nb1','eth0'],b:['sw1','eth2']},
    {id:'sw-router',a:['sw1','eth3'],b:['r1','eth0']},{id:'router-server',a:['r1','eth1'],b:['srv1','eth0']}]};

export async function runDeviceActionReview({page,url,root,report}){
  const directory=path.join(root,'.playwright-mcp/reviews/raw/device-actions-staging');await mkdir(directory,{recursive:true});
  const database='netlab-idb-test-'+crypto.randomUUID(),captures=[],measurements=[],results={};
  const delay=ms=>new Promise(r=>setTimeout(r,ms));
  const wait=async expression=>{for(let i=0;i<180;i++){try{if(await page.evaluate(`return !!(${expression});`))return;}catch{}await delay(40);}throw Error('Device actions condition: '+expression);};
  const test=async(name,run)=>{try{await run();results[name]={passed:true};}catch(e){results[name]={passed:false,error:e.stack};throw e;}};
  const mouse=async(x,y)=>page.send('Input.dispatchMouseEvent',{type:'mouseMoved',x,y});
  const point=selector=>page.evaluate(`const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2};`);
  const click=async selector=>{const p=await point(selector);await mouse(p.x,p.y);for(const type of ['mousePressed','mouseReleased'])await page.send('Input.dispatchMouseEvent',{type,...p,button:'left',clickCount:1});await delay(70);};
  const shot=async(filename,metadata)=>{await delay(75);const png=await page.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(directory,filename),Buffer.from(png.data,'base64'));captures.push({filename,...metadata});};
  const geometry=()=>page.evaluate(`const rect=e=>e.getBoundingClientRect().toJSON();return{viewport:flow.getViewport(),nodes:[...document.querySelectorAll('.react-flow__node')].map(n=>({id:n.dataset.id,box:rect(n),sprite:rect(n.querySelector('.device-artwork')),handles:[...n.querySelectorAll('.react-flow__handle')].map(rect)})),positions:store.getState().nodes.map(n=>({id:n.id,position:n.position}))};`);
  const layout=async variant=>{await page.evaluate(`history.replaceState({},'',${JSON.stringify('?deviceActions=')}+${JSON.stringify(variant)});store.getState().refresh();store.getState().select(null);`);await delay(70);};
  const noOverlap=()=>page.evaluate(`const rect=e=>e.getBoundingClientRect(),overlap=(a,b)=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1;return [...document.querySelectorAll('.react-flow__node')].flatMap(n=>[...n.querySelectorAll('.device-action')].flatMap(b=>[...n.querySelectorAll('.dev-os-badge,.react-flow__handle,.dev-label,.node-network-label,.device-artwork')].filter(e=>overlap(rect(b),rect(e))).map(e=>({id:n.dataset.id,button:b.className,other:e.className.baseVal??e.className}))));`);
  try{
    await page.send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});await page.send('Page.navigate',{url});await wait("document.readyState==='complete'&&location.pathname==='/__workspace_ui_test__'");
    await page.evaluate(`localStorage.setItem('netlab:packet-animation-speed:v1','4');window.entry=await import('/src/workspace/reviewEntry.tsx');window.store=(await import('/src/store.ts')).useStore;window.sim=(await import('/src/sim.ts')).sim;window.theme=(await import('/src/uiTheme.ts')).useUiTheme;window.probe=await import('/src/workspace/viewportProbe.browser.tsx');window.workspace=await entry.mountWorkspaceReview(document.getElementById('root'),{databaseName:${JSON.stringify(database)}});`);
    await wait("document.querySelector('.react-flow')");await page.evaluate(`const r=await workspace.controller.openDocument({schemaVersion:1,topology:${JSON.stringify(topology)}});if(!r.ok)throw Error(JSON.stringify(r));store.getState().setPaused(true);window.flow=probe.getViewportProbe();`);
    await wait("document.querySelectorAll('.react-flow__node').length===6");await delay(200);await page.send('Page.bringToFront');
    await test('presentation: normal clock and fixed mode durations ignore but preserve old visual speed preference',async()=>{
      assert.equal(await page.evaluate('return store.getState().speed;'),1);assert.equal(await page.evaluate('return store.getState().packetAnimationSpeed;'),1);
      assert.equal(await page.evaluate("return localStorage.getItem('netlab:packet-animation-speed:v1');"),'4');
      assert.equal(await page.evaluate("return document.querySelectorAll('.toolbar-quick-speed,#packet-animation-speed,#packet-settings-speed').length;"),0);
    });
    await test('actions: current/A/B compare actual Linux/Windows sprites at both zooms/themes/states without changing geometry',async()=>{
      for(const theme of ['graphite-dark','classic-light'])for(const zoom of [.75,1]){
        await page.evaluate(`theme.getState().setTheme(${JSON.stringify(theme)});await flow.setViewport({x:20,y:20,zoom:${zoom}});`);
        await layout('current');const baseline=await geometry();
        for(const variant of ['current','a','b']){
          await layout(variant);assert.deepEqual(await geometry(),baseline,'Actions changed sprite/Handles/node/viewport');
          if(variant!=='current')assert.deepEqual(await noOverlap(),[]);
          for(const state of ['normal','hover','selected']){
            await page.evaluate(`store.getState().select(${state==='selected'?"'pc2'":'null'});`);await mouse(1000,850);
            if(state==='hover'){const p=await point('.react-flow__node[data-id=pc1] .device-terminal');await mouse(p.x,p.y);}
            const current=await geometry();assert.deepEqual(current.viewport,baseline.viewport);assert.deepEqual(current.nodes,baseline.nodes);
            measurements.push({variant,theme,zoom,state,...current});
            await shot(`${variant}-${theme}-${zoom}-${state}.png`,{variant,theme,zoom,state});
          }
        }
      }
    });
    await test('actions: Ping is only an accessible preview; Terminal works, plus focus, narrow layout and low zoom',async()=>{
      for(const variant of ['a','b']){
        await layout(variant);await page.evaluate('await flow.setViewport({x:20,y:20,zoom:.75});');
        const before=await page.evaluate('return {clock:sim.net.now,pending:sim.net.scheduler.pending,document:store.getState().captureWorkspaceDocument()};');
        await click('.react-flow__node[data-id=pc1] .device-ping-preview');
        assert.deepEqual(await page.evaluate('return {clock:sim.net.now,pending:sim.net.scheduler.pending,document:store.getState().captureWorkspaceDocument()};'),before);
        assert.equal(await page.evaluate("return document.querySelector('.device-ping-preview').getAttribute('aria-disabled');"),'true');
        await click('.react-flow__node[data-id=pc1] .device-terminal');assert.equal(await page.evaluate('return store.getState().activeTerminal;'),'pc1');await delay(200);
        await page.evaluate("store.getState().closeTerminal('pc1');");await delay(120);
        await page.evaluate("document.querySelector('.react-flow__node[data-id=pc2] .device-terminal').focus();");
        assert.equal(await page.evaluate("return document.activeElement.matches('.device-terminal');"),true);
        await page.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'});await page.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
        await wait("store.getState().activeTerminal==='pc2'");await delay(200);await page.evaluate("store.getState().closeTerminal('pc2');");await delay(120);
        await page.send('Emulation.setDeviceMetricsOverride',{width:700,height:960,deviceScaleFactor:1,mobile:false});await page.evaluate('await flow.setViewport({x:20,y:20,zoom:.5});');await delay(80);
        assert.deepEqual(await noOverlap(),[]);assert(await page.evaluate('return document.documentElement.scrollWidth<=innerWidth+1;'));
        await shot(`${variant}-700-half-zoom.png`,{variant,theme:'classic-light',zoom:.5,state:'normal',width:700});
        await page.send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});
      }
    });
    await test('presentation: Schrittmodus preserves actual ping cadence, Step/Replay and draggable widget',async()=>{
      await layout('a');await page.evaluate("theme.getState().setTheme('graphite-dark');await flow.setViewport({x:20,y:20,zoom:.75});document.querySelector('.packet-settings-toggle').click();");
      await wait("document.querySelector('#packet-visualization-settings')");
      assert.equal(await page.evaluate("return document.querySelectorAll('#packet-visualization-settings input').length;"),0);
      await page.evaluate("[...document.querySelectorAll('#packet-visualization-settings button')].find(b=>b.textContent==='Schrittmodus').click();");
      assert.equal(await page.evaluate('return store.getState().packetVisualizationMode;'),'guided');await shot('schrittmodus-settings.png',{variant:'a',theme:'graphite-dark',zoom:.75,state:'selected'});
      await page.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape'});await delay(60);
      await page.evaluate("window.events=[];const old=sim.net.onPingProgress;sim.net.onPingProgress=e=>{events.push({type:e.type,seq:e.seq,now:sim.net.now});old?.(e);};store.getState().openTerminal('pc1');const {getSession}=await import('/src/terminals.ts');getSession(sim.net.devices.get('pc1')).term.input('ping -c 2 10.0.0.20\\r',true);store.getState().setPaused(false);");
      await wait("events.some(e=>e.type==='finished')");
      const attempts=await page.evaluate("return events.filter(e=>e.type==='attempt');");assert.equal(attempts.length,2);assert.equal(attempts[1].now-attempts[0].now,1000);
      await page.evaluate("store.getState().setPaused(true);document.querySelector('.packet-settings-toggle').click();");await wait("document.querySelector('#packet-visualization-settings')");
      await page.evaluate("[...document.querySelectorAll('.guided-playback-actions button')].find(b=>b.textContent==='Step').click();[...document.querySelectorAll('.guided-playback-actions button')].find(b=>b.textContent==='Replay').click();");assert.equal(await page.evaluate('return store.getState().guidedPacket.playback.kind;'),'replay');assert.equal(await page.evaluate('return store.getState().paused;'),true);
      await page.evaluate("[...document.querySelectorAll('#packet-visualization-settings button')].find(b=>b.textContent==='Schwebende Steuerung anzeigen').click();");await wait("document.querySelector('.packet-animation-widget.is-floating')");
      await page.evaluate("document.querySelector('.packet-animation-handle').focus();");await page.send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowLeft'});await page.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Home'});await wait("!document.querySelector('.packet-animation-widget.is-floating')");
    });
    report.deviceActionReview={captures:captures.length,measurements:measurements.length,directory};
  }finally{
    try{await page.evaluate('workspace?.dispose();');}catch{}
    await page.evaluate(`await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase(${JSON.stringify(database)});r.onsuccess=resolve;r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Disposable action review cleanup blocked'));});`);
    Object.assign(report.results,results);await writeFile(path.join(directory,'results.json'),JSON.stringify({results,captures,measurements},null,2));
  }
}
