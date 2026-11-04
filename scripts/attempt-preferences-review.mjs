import assert from 'node:assert/strict';

export async function runAttemptPreferencesReview({ page, url, report }) {
  const database = 'netlab-idb-test-' + crypto.randomUUID(), delay = ms => new Promise(r => setTimeout(r, ms));
  const a = { style:'dual-glow', intensity:37, fontFamily:'courier', fontSize:18 };
  const b = { style:'diagonal', intensity:63, fontFamily:'consolas', fontSize:15 };
  const wait = async expression => { for(let i=0;i<200;i++){if(await page.evaluate('return !!('+expression+');'))return;await delay(40);}throw Error('Attempt preference condition: '+expression); };
  const test = async (name, fn) => { await fn(); report.results['attempt preferences: '+name]={passed:true}; };
  const click = async (selector, text) => {
    const at=await page.evaluate(`const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.getClientRects().length&&(${text?`e.textContent.trim()===${JSON.stringify(text)}`:'true'}));if(!e)throw Error('Missing '+${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};`);
    for(const type of ['mouseMoved','mousePressed','mouseReleased'])await page.send('Input.dispatchMouseEvent',{type,...at,...(type==='mouseMoved'?{}:{button:'left',clickCount:1})});await delay(90);
  };
  const mount = async () => {
    await page.send('Page.navigate',{url});await wait("document.readyState==='complete'&&document.getElementById('root')");
    await page.evaluate(`window.store=(await import('/src/store.ts')).useStore;window.sim=(await import('/src/sim.ts')).sim;window.ws=await(await import('/src/workspace/reviewEntry.tsx')).mountWorkspaceReview(document.getElementById('root'),{databaseName:${JSON.stringify(database)}});(await import('/src/i18n/index.ts')).useLanguage.getState().setLanguage('de');`);
    await wait("document.querySelector('.react-flow')");await delay(180);
  };
  const menu = async () => { await click('.toolbar-menu-trigger,.toolbar-menu-action','Übungen (Beta)');await wait("document.querySelector('#toolbar-exercises-menu')");await click('[data-guided-menu-toggle]'); };
  const state = () => page.evaluate('const s=store.getState();return {appearance:s.terminalAppearance,layout:s.terminalLayoutMode,collapsed:s.terminalDockCollapsed,terminals:s.terminals,panels:s.terminalPanels,draft:s.workspaceIdentity.draftId};');
  const configure = async appearance => {
    await page.evaluate(`const s=store.getState(),id=s.nodes.find(n=>sim.net.devices.get(n.id).kind==='host').id;s.openTerminal(id);s.setTerminalAppearance(${JSON.stringify(appearance)});s.setTerminalLayoutMode('by-type');s.setTerminalDockCollapsed(true);`);await delay(120);
  };
  const expectAttempt = async appearance => { const s=await state();assert.deepEqual(s.appearance,appearance);assert.equal(s.layout,'by-type');assert.equal(s.collapsed,true);assert.deepEqual(s.terminals,[]);assert.deepEqual(s.panels,[]); };
  let first, second, tutorial, direct, savedPlan;
  try {
    await page.send('Emulation.setDeviceMetricsOverride',{width:1440,height:950,deviceScaleFactor:1,mobile:false});await mount();
    await page.evaluate("store.getState().addDeviceAt('host',{x:200,y:200});localStorage.setItem('netlab:terminal-dock-height:v1','310');");await configure(a);
    const unrelated=await page.evaluate("return {height:localStorage.getItem('netlab:terminal-dock-height:v1'),widths:localStorage.getItem('netlab:terminal-panel-layout:v1'),background:(await import('/src/canvasBackground.ts')).useCanvasBackground.getState().preference};");
    await test('new Beta attempt inherits custom appearance/by-type/collapsed without previous sessions or sizing/background changes',async()=>{
      const before=await state();await menu();await click('[data-exercise="pilot-e08-v1"] .exercise-menu-actions button:last-child');
      await wait("document.querySelector('.exercise-panel[data-exercise=pilot-e08-v1]')");await expectAttempt(a);first=(await state()).draft;assert.notEqual(first,before.draft);
      assert.deepEqual(await page.evaluate("return {height:localStorage.getItem('netlab:terminal-dock-height:v1'),widths:localStorage.getItem('netlab:terminal-panel-layout:v1'),background:(await import('/src/canvasBackground.ts')).useCanvasBackground.getState().preference};"),unrelated);
      await page.evaluate("store.getState().openTerminal('a');");assert.equal((await state()).collapsed,false);assert.equal((await state()).terminals.length,1);
    });
    await test('another Beta attempt uses current preferences and F5 restores its own appearance/layout without sessions',async()=>{
      await configure(b);await menu();await click('[data-exercise="pilot-e08-v1"] .exercise-menu-actions button:last-child');await wait(`store.getState().workspaceIdentity.draftId!==${JSON.stringify(first)}`);await expectAttempt(b);second=(await state()).draft;
      assert.equal((await page.evaluate('const r=await ws.controller.flush();return r.ok;')),true);await mount();await wait("document.querySelector('.exercise-panel[data-exercise=pilot-e08-v1]')");
      const s=await state();assert.equal(s.draft,second);assert.deepEqual(s.appearance,b);assert.equal(s.layout,'by-type');assert.deepEqual(s.terminals,[]);assert.deepEqual(s.panels,[]);
    });
    await test('Tutorial 01 and its new-attempt restart inherit preferences without carrying old panels',async()=>{
      await configure(a);await menu();await click('[data-start-tutorial]');await wait("document.querySelector('[data-guided-step=\"1\"]')");await expectAttempt(a);tutorial=(await state()).draft;
      await configure(b);await menu();await click('[data-restart-tutorial]');await wait(`store.getState().workspaceIdentity.draftId!==${JSON.stringify(tutorial)}`);await expectAttempt(b);
    });
    await test('Direkt starten creates another tutorial draft with the same terminal preferences and keeps normal dock opening',async()=>{
      await configure(a);await menu();await click('[data-router-direct]');await wait("document.querySelector('[data-router-step]')");await expectAttempt(a);direct=(await state()).draft;
      const host=await page.evaluate("return store.getState().nodes.find(n=>sim.net.devices.get(n.id).kind==='host').id;");await page.evaluate(`store.getState().openTerminal(${JSON.stringify(host)});`);assert.equal((await state()).collapsed,false);
    });
    await test('saved/imported projects keep their own appearance and existing attempts keep theirs when resumed',async()=>{
      savedPlan=await page.evaluate(`const document=store.getState().captureWorkspaceDocument();document.topology.ui={terminalAppearance:${JSON.stringify(b)},terminalLayoutMode:'free'};const r=await ws.repository.createProject({name:'Own terminal appearance',document});if(!r.ok)throw Error(JSON.stringify(r));return r.value.project.id;`);
      await page.evaluate(`const r=await ws.controller.openPlan(${JSON.stringify(savedPlan)});if(!r.ok)throw Error(JSON.stringify(r));`);let s=await state();assert.deepEqual(s.appearance,b);assert.equal(s.layout,'free');
      await page.evaluate(`const document=store.getState().captureWorkspaceDocument();document.topology.ui={terminalAppearance:${JSON.stringify(a)},terminalLayoutMode:'free'};const r=await ws.controller.openDocument(JSON.parse(JSON.stringify(document)));if(!r.ok)throw Error(JSON.stringify(r));`);s=await state();assert.deepEqual(s.appearance,a);assert.equal(s.layout,'free');
      await page.evaluate(`const r=await ws.controller.switchDraft(${JSON.stringify(first)});if(!r.ok)throw Error(JSON.stringify(r));`);s=await state();assert.deepEqual(s.appearance,b);assert.equal(s.layout,'by-type');
      // Configuring A before starting Tutorial 01 deliberately edited attempt 2.
      await page.evaluate(`const r=await ws.controller.switchDraft(${JSON.stringify(second)});if(!r.ok)throw Error(JSON.stringify(r));`);s=await state();assert.deepEqual(s.appearance,a);assert.equal(s.layout,'by-type');
      await page.evaluate(`await ws.controller.switchDraft(${JSON.stringify(direct)});`);s=await state();assert.deepEqual(s.appearance,a);assert.equal(s.layout,'by-type');
      await page.evaluate(`await ws.controller.openPlan(${JSON.stringify(savedPlan)});`);s=await state();assert.deepEqual(s.appearance,b);assert.equal(s.layout,'free');
    });
  } finally {
    await page.evaluate(`window.ws?.dispose();await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase(${JSON.stringify(database)});r.onsuccess=resolve;r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Attempt preferences cleanup blocked'));});`);
  }
}
