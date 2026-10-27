import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function runPanelStacking({page,url,root,report}) {
  const database='netlab-idb-test-'+crypto.randomUUID();
  const directory=path.join(root,'.playwright-mcp/reviews/raw/panel-stacking');
  await mkdir(directory,{recursive:true});const evidence=[];
  const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const wait=async expression=>{for(let i=0;i<220;i++){if(await page.evaluate(`return !!(${expression});`))return;await delay(30);}throw Error('Panel stacking condition: '+expression);};
  const test=async(name,work)=>{try{await work();report.results['Panel stacking: '+name]={passed:true};}catch(error){report.results['Panel stacking: '+name]={passed:false,error:error.stack};throw error;}};
  const click=async({x,y})=>{for(const type of ['mousePressed','mouseReleased'])await page.send('Input.dispatchMouseEvent',{type,x,y,button:'left',clickCount:1});await delay(50);};
  const point=selector=>page.evaluate(`const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2};`);
  const key=async(name,modifiers=0)=>{
    const code={Tab:9,ArrowLeft:37,ArrowRight:39,ArrowUp:38,ArrowDown:40,Home:36,End:35,Enter:13,Backspace:8,c:67,a:65,Escape:27}[name];
    for(const type of ['keyDown','keyUp'])await page.send('Input.dispatchKeyEvent',{type,key:name,code:name.length===1?'Key'+name.toUpperCase():name,windowsVirtualKeyCode:code,modifiers,...(name==='Enter'&&type==='keyDown'?{text:'\r'}:{}),...(name==='Tab'&&type==='keyDown'?{text:'\t',unmodifiedText:'\t'}:{})});await delay(45);
  };
  const geometry=()=>page.evaluate(`const rect=selector=>{const r=document.querySelector(selector)?.getBoundingClientRect();return r&&{x:r.x,y:r.y,width:r.width,height:r.height};};const s=store.getState();return {viewport:flow.getViewport(),nodes:s.nodes.map(n=>({id:n.id,position:n.position})),edges:s.edges,selected:s.selected,canvas:rect('.canvas'),dock:rect('.terminal-dock'),inspector:rect('.inspector-shell'),scroll:document.querySelector('.inspector')?.scrollTop,documentWidth:document.documentElement.scrollWidth,windowWidth:innerWidth};`);
  const inspector=async()=>{await click(await page.evaluate("const r=document.querySelector('.inspector-shell').getBoundingClientRect();return{x:r.right-18,y:r.top+20};"));await wait("document.querySelector('.app').dataset.panelPriority==='inspector'");};
  const terminal=async()=>{await click(await page.evaluate("const r=document.querySelector('.terminal-resizer').getBoundingClientRect();return{x:r.left+200,y:r.top+r.height/2};"));await wait("document.querySelector('.app').dataset.panelPriority==='terminal'");};
  const overlapOwner=()=>page.evaluate(`const i=document.querySelector('.inspector-shell').getBoundingClientRect(),d=document.querySelector('.terminal-dock').getBoundingClientRect();const element=document.elementFromPoint(i.left+i.width/2,d.top+Math.min(90,d.height/2));window.lastStack={inspector:getComputedStyle(document.querySelector('.inspector-shell')).zIndex,dock:getComputedStyle(document.querySelector('.terminal-dock')).zIndex,main:getComputedStyle(document.querySelector('.main')).zIndex,priority:document.querySelector('.app').dataset.panelPriority,element:element?.outerHTML.slice(0,180)};return element?.closest('.inspector-shell')?'inspector':element?.closest('.terminal-dock')?'terminal':element?.className;`);
  const stable=async(label,work)=>{
    const before=await geometry();await work();await delay(70);const after=await geometry();
    assert.deepEqual(after.viewport,before.viewport,label+'/viewport');assert.deepEqual(after.nodes,before.nodes,label+'/nodes');assert.deepEqual(after.edges,before.edges,label+'/edges');assert.equal(after.selected,before.selected,label+'/selection');
    assert.deepEqual(after.canvas,before.canvas,label+'/canvas');assert.deepEqual(after.dock,before.dock,label+'/dock');assert.deepEqual(after.inspector,before.inspector,label+'/Inspector');assert.equal(after.scroll,before.scroll,label+'/scroll');
    assert(after.documentWidth<=after.windowWidth+1,label+'/page overflow');evidence.push({label,before,after});
  };
  const screenshot=async name=>{await delay(80);const result=await page.send('Page.captureScreenshot',{format:'png'});await writeFile(path.join(directory,name),Buffer.from(result.data,'base64'));};
  const mount=async()=>{
    await page.send('Page.navigate',{url});await wait("document.readyState==='complete'&&document.getElementById('root')");
    await page.evaluate(`await import('/node_modules/@xyflow/react/dist/style.css');await import('/node_modules/@xterm/xterm/css/xterm.css');await import('/src/themes.css');await import('/src/styles.css');await import('/src/buttons.css');window.store=(await import('/src/store.ts')).useStore;window.sim=(await import('/src/sim.ts')).sim;window.terminals=await import('/src/terminals.ts');
      const fixture=(await import('/src/testing/pingPlaybackFixture.ts')).pingPlaybackFixture();const {createDevice}=await import('/src/engine/factory.ts');for(const [kind,id] of [['firewall','fw'],['host','extra1'],['host','extra2']]){const d=createDevice(fixture.net,kind,{id,name:id});d.position={x:100,y:500};}const {serializeNetwork}=await import('/src/engine/serialize.ts');window.source=serializeNetwork(fixture.net,Object.fromEntries([...fixture.net.devices].map(([id,d])=>[id,d.position])));
      const entry=await import('/src/workspace/WorkspaceApplication.tsx');window.application=entry.mountWorkspaceApplication(document.getElementById('root'),{repositoryOptions:{databaseName:${JSON.stringify(database)}},legacy:{storage:{getItem:key=>key==='netsim:autosave:v1'?JSON.stringify(source):null},origin:'https://panel-stacking.invalid'}});await application.ready;
      window.flow=(await import('/src/workspace/viewportProbe.browser.tsx')).getViewportProbe();`);
    await wait("application.controller?.getState().phase==='ready'");await page.send('Page.bringToFront');await delay(250);
  };
  const openCount=async count=>{
    await page.evaluate(`const ids=['pc1','pc2','pc3','pc4','pc5','router','fw','extra1','extra2'];for(const id of [...store.getState().terminals])if(!ids.slice(0,${count}).includes(id))store.getState().closeTerminal(id);for(const id of ids.slice(0,${count}))store.getState().openTerminal(id);store.getState().select('router');`);
    await wait('document.querySelector(".inspector-shell")&&document.querySelector(".terminal-resizer")');await delay(120);
  };
  const resize=async(size)=>{
    await page.evaluate('document.querySelector(".terminal-resizer").focus({preventScroll:true});');
    await key(size==='small'?'Home':size==='large'?'End':'Home');
    if(size==='medium')for(let i=0;i<3;i++)await key('ArrowUp',8); // CDP Shift modifier: 50 px.
    await delay(90);
  };
  try{
    await page.send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});await mount();
    await test('one terminal: Inspector extends over the dock without resizing the canvas or changing priority on hover',async()=>{
      await openCount(1);await resize('large');await page.evaluate('await flow.setViewport({x:31,y:-23,zoom:.8});');
      const g=await geometry();assert(Math.abs(g.inspector.y+g.inspector.height-960)<2);assert(g.inspector.height>g.canvas.height+300);
      await stable('Inspector click',inspector);assert.equal(await overlapOwner(),'inspector');
      const p=await point('.terminal-pane .terminal-tabs [role=tab]');await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',...p});await delay(80);assert.equal(await overlapOwner(),'inspector');
      await stable('Terminal click',terminal);assert.equal(await overlapOwner(),'terminal',JSON.stringify(await page.evaluate('return lastStack;')));
      const i=await page.evaluate("const r=document.querySelector('.inspector-shell').getBoundingClientRect();return{x:r.right-18,y:r.top+20};");await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',...i});await delay(80);assert.equal(await overlapOwner(),'terminal');
    });
    await test('native Shift+Tab/Tab and a direct click inside xterm raise panels while keeping their actual keyboard target',async()=>{
      await openCount(1);await resize('large');await inspector();
      await stable('native terminal click',async()=>{
        const p=await page.evaluate("const r=document.querySelector('.term-host .xterm-screen').getBoundingClientRect();return{x:r.left+35,y:r.top+25};");
        await click(p);await wait("document.activeElement===terminals.getSession(sim.net.devices.get('pc1')).term.textarea");
        assert.equal(await overlapOwner(),'terminal');
      });
      const before=await page.evaluate('return flow.getViewport();');
      await page.evaluate("document.querySelector('.terminal-resizer').focus({preventScroll:true});");await delay(100);await key('Tab',8);
      assert(await page.evaluate('return !!document.activeElement.closest(".inspector-shell");'));assert.equal(await overlapOwner(),'inspector');
      await key('Tab');assert(await page.evaluate('return document.activeElement===document.querySelector(".terminal-resizer");'));assert.equal(await overlapOwner(),'terminal');
      assert.deepEqual(await page.evaluate('return flow.getViewport();'),before);
    });
    for(const width of [1440,700])for(const theme of ['graphite-dark','classic-light'])for(const count of [1,2,7]){
      await test(`${width}px ${theme}, ${count} sessions: five-column limit, tab preservation and small/medium/large dock stacking`,async()=>{
        await page.send('Emulation.setDeviceMetricsOverride',{width,height:960,deviceScaleFactor:1,mobile:false});await page.evaluate(`(await import('/src/uiTheme.ts')).useUiTheme.getState().setTheme(${JSON.stringify(theme)});`);await openCount(count);
        if(count===7){assert.equal(await page.evaluate('return store.getState().terminalPanels.length;'),5);assert.equal(await page.evaluate('return store.getState().terminalPanels.at(-1).tabs.length;'),3);}
        await page.evaluate('window.existingSessions=new Map(store.getState().terminals.map(id=>[id,terminals.getSession(sim.net.devices.get(id))]));');
        for(const size of ['small','medium','large']){
          await resize(size);await page.evaluate('await flow.setViewport({x:31,y:-23,zoom:.8});');
          const h=await page.evaluate('return document.querySelector(".terminal-dock").getBoundingClientRect().height;');assert.equal(h,size==='small'?160:size==='medium'?310:590);
          for(let round=0;round<3;round++){
            await stable(`${width}/${theme}/${count}/${size}/${round}/Inspector`,inspector);assert.equal(await overlapOwner(),'inspector');
            if(count===7&&size==='large'&&round===0)await screenshot(`${theme}-${width}-inspector-front.png`);
            await stable(`${width}/${theme}/${count}/${size}/${round}/Terminal`,terminal);assert.equal(await overlapOwner(),'terminal');
            if(count===7&&size==='large'&&round===0)await screenshot(`${theme}-${width}-terminal-front.png`);
          }
        }
        assert(await page.evaluate('return [...existingSessions].every(([id,s])=>s===terminals.getSession(sim.net.devices.get(id)));'));
      });
    }
    await test('Router/Firewall and terminal wheel scroll without changing priority; keyboard focus still raises its panel',async()=>{
      await page.send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});await openCount(2);await resize('large');
      for(const id of ['router','fw']){
        await page.evaluate(`store.getState().select(${JSON.stringify(id)});`);await delay(70);
        await inspector();
        await page.evaluate("[...document.querySelectorAll('.inspector [role=tab]')].find(b=>b.textContent==='Dienste').click();for(const d of document.querySelectorAll('.inspector details'))d.open=true;document.querySelector('.inspector').scrollTop=0;");await delay(70);
        await terminal();const p=await page.evaluate("const r=document.querySelector('.inspector-shell').getBoundingClientRect();return{x:r.right-22,y:r.top+90};");
        await page.send('Input.dispatchMouseEvent',{type:'mouseWheel',...p,deltaY:200,deltaX:0});await delay(100);
        assert.equal(await overlapOwner(),'terminal');assert(await page.evaluate('return document.querySelector(".inspector").scrollTop>0;'));
        await stable(id+'/scroll retained on Terminal',terminal);await stable(id+'/scroll retained on Inspector',inspector);
        // Focus alone is a supported accessibility path. Do not dispatch click.
        await terminal();await page.evaluate("window.field=[...document.querySelectorAll('.inspector input,.inspector textarea,.inspector select')].find(e=>e.getClientRects().length&&!e.disabled);field.focus({preventScroll:true});");
        assert(await page.evaluate('return document.activeElement===field;'));assert.equal(await overlapOwner(),'inspector');
        await page.evaluate("store.getState().setActiveTerminal('pc1');");await wait("document.activeElement===terminals.getSession(sim.net.devices.get('pc1')).term.textarea");assert.equal(await overlapOwner(),'terminal');
      }
      await page.evaluate("window.scrollTerm=terminals.getSession(sim.net.devices.get('pc1')).term;await new Promise(resolve=>scrollTerm.write('\\r\\n'+('scroll evidence\\r\\n').repeat(60)+'PC1:~$ ',resolve));scrollTerm.scrollToBottom();");
      await inspector();const before=await page.evaluate('return {row:scrollTerm.buffer.active.viewportY,viewport:flow.getViewport()};');
      const p=await page.evaluate("const r=document.querySelector('.terminal-dock').getBoundingClientRect();return{x:r.left+80,y:r.top+100};");
      await page.send('Input.dispatchMouseEvent',{type:'mouseWheel',...p,deltaY:-240,deltaX:0});
      await wait('scrollTerm.buffer.active.viewportY<'+before.row);
      assert.equal(await overlapOwner(),'inspector');assert.deepEqual(await page.evaluate('return flow.getViewport();'),before.viewport);
    });
    await test('xterm typing, selection/native copy and partial line survive panel focus changes',async()=>{
      await page.evaluate("window.session=terminals.getSession(sim.net.devices.get('pc1'));store.getState().setActiveTerminal('pc1');");await wait('document.activeElement===session.term.textarea');
      await page.send('Input.insertText',{text:'hostme'});await key('ArrowLeft');await key('ArrowLeft');
      await stable('partial input / Inspector',inspector);await stable('partial input / Terminal',terminal);
      await page.evaluate("store.getState().setActiveTerminal('pc1');");await wait('document.activeElement===session.term.textarea');
      await page.send('Input.insertText',{text:'na'});await key('Enter');await delay(80);
      assert(await page.evaluate('const b=session.term.buffer.active;return Array.from({length:b.length},(_,i)=>b.getLine(i)?.translateToString(true)).join(" ").includes("hostname");'));
      await page.send('Input.insertText',{text:'hostname'});await key('a',2);assert.equal(await page.evaluate('return session.term.getSelection();'),'hostname');
      await page.evaluate('window.copied=null;document.addEventListener("copy",event=>{window.copied={text:event.clipboardData.getData("text/plain"),selection:session.term.getSelection()};},{once:true});');await key('c',2);
      assert.deepEqual(await page.evaluate('return copied;'),{text:'hostname',selection:'hostname'});
      await inspector();await terminal();await page.evaluate("store.getState().setActiveTerminal('pc1');");await wait('document.activeElement===session.term.textarea');assert.equal(await page.evaluate('return session.term.getSelection();'),'hostname');
      await key('End');await key('Enter');await delay(80);assert.equal(await page.evaluate('return session===terminals.getSession(sim.net.devices.get("pc1"));'),true);
    });
    await test('resize, collapse/expand, open/close and Packets fallback preserve viewport and access without page overflow',async()=>{
      const v=await page.evaluate('return flow.getViewport();');await inspector();await resize('small');await resize('large');
      assert.deepEqual(await page.evaluate('return flow.getViewport();'),v);
      await terminal();await page.evaluate('document.querySelector(".terminal-dock-toggle").click();');await delay(90);
      assert(await page.evaluate('return store.getState().terminalDockCollapsed;'));
      assert.equal(await page.evaluate('return document.querySelector(".app").style.getPropertyValue("--terminal-overlap-height");'),'0px');
      await page.evaluate('document.querySelector(".terminal-dock-toggle").click();');await delay(100);
      await page.evaluate('store.getState().select(null);');await delay(80);await page.evaluate('store.getState().select("router");');await delay(80);await inspector();
      assert.deepEqual(await page.evaluate('return flow.getViewport();'),v);
      for(const width of [1440,700]){
        await page.send('Emulation.setDeviceMetricsOverride',{width,height:960,deviceScaleFactor:1,mobile:false});await page.evaluate('store.getState().setPacketInspectorOpen(true);');await delay(180);
        assert(await page.evaluate('return document.querySelector("#packet-inspector")&&document.documentElement.scrollWidth<=innerWidth+1;'));
        assert.deepEqual(await page.evaluate('return flow.getViewport();'),v);
        await page.evaluate('store.getState().setPacketInspectorOpen(false);');await delay(120);await inspector();await terminal();
      }
      await page.evaluate('for(const id of [...store.getState().terminals])store.getState().closeTerminal(id);');await delay(100);
      assert.equal(await page.evaluate('return !!document.querySelector(".terminal-dock");'),false);assert.deepEqual(await page.evaluate('return flow.getViewport();'),v);
    });
    await test('plan switch and F5 keep documents intact and do not persist visual priority',async()=>{
      const a=await page.evaluate("const r=await application.controller.save('Panel focus review');if(!r.ok)throw Error(JSON.stringify(r));return application.controller.getState().activeDraftId;");
      const d=await page.evaluate('return store.getState().captureWorkspaceDocument();');await openCount(1);await inspector();
      await page.evaluate('const r=await application.controller.openDocument({schemaVersion:1,topology:source});if(!r.ok)throw Error(JSON.stringify(r));');
      await page.evaluate(`const r=await application.controller.switchDraft(${JSON.stringify(a)});if(!r.ok)throw Error(JSON.stringify(r));`);
      assert.deepEqual(await page.evaluate('return store.getState().captureWorkspaceDocument();'),d);
      await openCount(1);await inspector();await page.evaluate('await application.controller.flush();');await mount();
      assert.equal(await page.evaluate('return document.querySelector(".app").dataset.panelPriority;'),'terminal');
      assert.deepEqual(await page.evaluate('return store.getState().captureWorkspaceDocument();'),d);
      assert.equal(await page.evaluate('return store.getState().terminals.length;'),0);await openCount(1);await inspector();await terminal();
    });
    await writeFile(path.join(directory,'evidence.json'),JSON.stringify(evidence,null,2));
  }finally{
    await page.evaluate(`application?.dispose();await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase(${JSON.stringify(database)});r.onsuccess=resolve;r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('panel review DB blocked'));});`);
  }
}
