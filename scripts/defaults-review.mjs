import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export async function runDefaultsReview({page,url,report}) {
  const database='netlab-idb-test-'+randomUUID();
  const delay=ms=>new Promise(r=>setTimeout(r,ms));
  const wait=async expression=>{for(let i=0;i<160;i++){if(await page.evaluate(`return !!(${expression});`))return;await delay(40);}throw Error('Timed out: '+expression);};
  const test=async(name,run)=>{page.labelDownloads(name);try{await run();report.results[name]={passed:true};}catch(e){report.results[name]={passed:false,error:e.stack};throw e;}};
  const mount=async()=>{
    await page.send('Page.navigate',{url});await wait("document.readyState==='complete'&&location.pathname==='/__workspace_ui_test__'");
    await page.evaluate(`window.entry=await import('/src/workspace/reviewEntry.tsx');window.store=(await import('/src/store.ts')).useStore;window.sim=(await import('/src/sim.ts')).sim;window.bg=await import('/src/canvasBackground.ts');window.fonts=await import('/src/terminalAppearance.ts');window.theme=(await import('/src/uiTheme.ts')).useUiTheme;window.ws=await entry.mountWorkspaceReview(document.getElementById('root'),{databaseName:${JSON.stringify(database)}});`);
    await wait('document.querySelector(".react-flow")');await delay(100);
  };
  try {
    await mount();
    await test('defaults: new profile uses Blue Circuit and free panels without changing fonts, theme or sessions',async()=>{
      const s=await page.evaluate('return {bg:bg.useCanvasBackground.getState().preference,image:getComputedStyle(document.querySelector(".react-flow")).backgroundImage,mode:store.getState().terminalLayoutMode,font:store.getState().terminalAppearance,defaults:fonts.DEFAULT_TERMINAL_APPEARANCE,legacy:fonts.LEGACY_TERMINAL_FONT_SIZE,theme:theme.getState().theme,sessions:store.getState().terminals};');
      assert.equal(s.bg.choice,'bg2');assert.equal(s.mode,'free');assert(s.image.includes('background-blue-circuit.png'));
      assert.equal(s.theme,'original');assert.deepEqual(s.defaults,{style:'diagonal',intensity:80,fontSize:14,fontFamily:'system'});assert.equal(s.legacy,13);assert.equal(s.font.fontFamily,'system');assert.deepEqual(s.sessions,[]);
      assert.equal(await page.evaluate('return localStorage.getItem(bg.BACKGROUND_KEY);'),null,'Reading a default must not write a preference');
    });
    await test('defaults: every background remains selectable; default restoration is consistent',async()=>{
      const available=await page.evaluate('return Object.keys(bg.CANVAS_BACKGROUNDS);');
      for(const choice of available){await page.evaluate(`bg.useCanvasBackground.getState().update({choice:${JSON.stringify(choice)}});`);assert.equal(await page.evaluate('return bg.readBackground().choice;'),choice);}
      await page.evaluate('bg.useCanvasBackground.getState().update(bg.DEFAULT_BACKGROUND);');assert.equal(await page.evaluate('return bg.readBackground().choice;'),'bg2');
    });
    let expected;
    await test('defaults: saved presentation and terminal organization override defaults through Save, plans and F5',async()=>{
      await page.evaluate(`bg.useCanvasBackground.getState().update({choice:'verde2',intensity:43,dots:false,animation:'off'});theme.getState().setTheme('classic-light');store.getState().addDeviceAt('host',{x:100,y:100});store.getState().addDeviceAt('router',{x:400,y:100});store.getState().setTerminalAppearance({style:'aurora-lines',intensity:47,fontFamily:'courier',fontSize:16});store.getState().setTerminalLayoutMode('by-type');store.getState().setTerminalColor(store.getState().nodes[0].id,'#aabbcc');for(const n of store.getState().nodes)store.getState().openTerminal(n.id);`);
      await wait('document.querySelectorAll(".xterm").length===2');
      expected=await page.evaluate('return ws.controller.recoveryDocument();');
      await page.evaluate('let r=await ws.controller.save("Defaults review");if(!r.ok)throw Error(JSON.stringify(r));const plan=r.value.plan.project.id;await ws.controller.openDocument({schemaVersion:1,topology:{app:"netsim",version:1,devices:[],links:[]}});r=await ws.controller.openPlan(plan);if(!r.ok)throw Error(JSON.stringify(r));await ws.controller.flush();ws.dispose();');
      await mount();assert.deepEqual(await page.evaluate('return ws.controller.recoveryDocument();'),expected);
      const s=await page.evaluate('return {bg:bg.useCanvasBackground.getState().preference,theme:theme.getState().theme,mode:store.getState().terminalLayoutMode,font:store.getState().terminalAppearance};');
      assert.deepEqual(s.bg,{choice:'verde2',intensity:43,dots:false,animation:'off'});assert.equal(s.theme,'classic-light');assert.equal(s.mode,'by-type');assert.equal(s.font.fontSize,16);assert.equal(s.font.fontFamily,'courier');
    });
    await test('defaults: free-panel sessions, manual locks and widths remain user controlled',async()=>{
      await page.evaluate('store.getState().setTerminalLayoutMode("free");for(const n of store.getState().nodes)store.getState().openTerminal(n.id);');await wait('document.querySelectorAll(".xterm").length===2');
      const before=await page.evaluate('const s=store.getState(),p=s.terminalPanels[0];s.toggleTerminalPanelLock(p.id,{[p.id]:300});return store.getState().terminalPanels;');
      assert.equal(before[0].lockedWidth,300);
      await page.evaluate('store.getState().addDeviceAt("server",{x:600,y:100});store.getState().openTerminal(store.getState().nodes.at(-1).id);');
      assert.equal(await page.evaluate('return store.getState().terminalPanels[0].lockedWidth;'),300);assert.equal(await page.evaluate('return store.getState().terminals.length;'),3);
    });
  } finally {
    await page.evaluate('window.ws?.dispose();');
    await page.evaluate(`await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase(${JSON.stringify(database)});r.onsuccess=resolve;r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Defaults cleanup blocked'));});`);
  }
}
