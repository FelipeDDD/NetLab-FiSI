import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function runLpmReview({ page, url, root, report }) {
  const database = 'netlab-idb-test-' + crypto.randomUUID(), directory = path.join(root, '.playwright-mcp/reviews/chapter6-lpm-refinement');
  await mkdir(directory, { recursive: true });
  const delay = ms => new Promise(r => setTimeout(r, ms));
  const wait = async expression => { for (let n = 0; n < 250; n++) { if (await page.evaluate(`return !!(${expression});`)) return; await delay(50); } throw Error('LPM wait: ' + expression); };
  const click = async selector => {
    const p = await page.evaluate(`const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.getClientRects().length);if(!e)throw Error('Missing '+${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};`);
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, ...p, ...(type === 'mouseMoved' ? {} : { button: 'left', clickCount: 1 }) }); await delay(120);
  };
  const shot = async name => { const image = await page.send('Page.captureScreenshot', { format: 'png' }); await writeFile(path.join(directory, name + '.png'), Buffer.from(image.data, 'base64')); };
  const mount = async reload => {
    await page.send(reload ? 'Page.reload' : 'Page.navigate', reload ? { ignoreCache: true } : { url }); await delay(400);
    await page.evaluate(`window.store=(await import('/src/store.ts')).useStore;window.sim=(await import('/src/sim.ts')).sim;window.lang=(await import('/src/i18n/index.ts')).useLanguage;window.theme=(await import('/src/uiTheme.ts')).useUiTheme;window.ws=await(await import('/src/workspace/reviewEntry.tsx')).mountWorkspaceReview(document.getElementById('root'),{databaseName:${JSON.stringify(database)}});window.events=[];window.release=(await import('/src/terminalCommandEvents.ts')).observeTerminalCommands(e=>events.push({type:e.type,deviceId:e.command.deviceId,line:e.command.line,text:e.text,source:e.command.source}));`);
    await wait('document.querySelector(".react-flow")'); await delay(250);
  };
  const test = async (name, run) => { try { await run(); report.results['chapter6: ' + name] = { passed: true }; } catch (error) { report.results['chapter6: ' + name] = { passed: false, error: String(error) }; throw error; } };
  const step = n => wait(`document.querySelector('[data-lpm-step="${n}"]')`);
  const saved = async () => { await wait('document.querySelector("[data-lpm-saving=false]")'); await page.evaluate('await ws.controller.flush();'); await delay(80); };
  const progress = () => page.evaluate('return (await ws.repository.getMeta("guided:lpm:v1:draft:"+ws.controller.getState().activeDraftId)).value.value;');
  const next = async n => { await wait('document.querySelector("[data-lpm-next]:not(:disabled)")'); await click('[data-lpm-next]'); await step(n); await saved(); };
  const answer = async value => { await page.evaluate(`const e=document.querySelector('[data-lpm-answer]');e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}));`); await saved(); };
  const command = async (id, line, ping = false) => {
    await page.evaluate(`store.getState().terminals.filter(k=>k!==${JSON.stringify(id)}).forEach(k=>store.getState().closeTerminal(k));store.getState().openTerminal(${JSON.stringify(id)});window.start=events.length;`);
    await wait('document.querySelector(".xterm-helper-textarea")'); await delay(100); await page.evaluate('document.querySelector(".xterm-helper-textarea").focus();'); await page.send('Input.insertText', { text: line });
    for (const type of ['keyDown', 'keyUp']) await page.send('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, ...(type === 'keyDown' ? { text: '\r', unmodifiedText: '\r' } : {}) });
    await wait(`events.slice(start).some(e=>e.type==='started'&&e.deviceId===${JSON.stringify(id)}&&e.line===${JSON.stringify(line)})`);
    if (ping) { await wait('events.slice(start).some(e=>e.type==="output")'); await page.evaluate('store.getState().setPaused(true);sim.net.scheduler.advanceTo(sim.net.now+6000);'); }
    await wait('events.slice(start).some(e=>e.type==="finished")'); await saved();
    return page.evaluate('return events.slice(start).filter(e=>e.type==="output").map(e=>e.text).join("");');
  };
  const ping = () => command('tutorial-06-a', 'ping -c 1 192.168.80.130', true);
  const openMenu = async () => {
    if (await page.evaluate('return innerWidth<1100;')) await click('.toolbar-menu-trigger');
    await page.evaluate(`const e=[...document.querySelectorAll('.toolbar-menu-trigger,.toolbar-menu-action')].find(e=>e.getClientRects().length&&e.textContent.includes('Übungen'));if(!e)throw Error('Exercises menu');e.click();`);
    await click('[data-guided-menu-toggle]'); await wait('document.querySelector("[data-lpm-start]:not(:disabled)")');
  };
  const variants = async n => {
    for (const [language, theme, width] of [['de', 'graphite-dark', 1440], ['en', 'classic-light', 1440], ['pt-BR', 'classic-light', 700]]) {
      await page.send('Emulation.setDeviceMetricsOverride', { width, height: 950, deviceScaleFactor: 1, mobile: false });
      await page.evaluate(`lang.getState().setLanguage(${JSON.stringify(language)});theme.getState().setTheme(${JSON.stringify(theme)});store.getState().setTerminalDockCollapsed(true);`); await delay(200);
      assert(await page.evaluate('const p=document.querySelector(".exercise-panel"),r=p.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1&&p.scrollWidth<=p.clientWidth+1;'));
      await shot(`step-${n}-${language}-${width}`);
    }
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false }); await page.evaluate('lang.getState().setLanguage("de");theme.getState().setTheme("graphite-dark");');
  };
  try {
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false }); await mount(false); await page.evaluate('lang.getState().setLanguage("de");');
    await test('public menu creates isolated attempt and F5 keeps its exact identity without evidence', async () => {
      await openMenu(); await click('[data-lpm-start]'); await step(1); await saved();
      const before = await progress(); assert.deepEqual(before.completed, []); await mount(true); await step(1); assert.deepEqual(await progress(), before);
      assert(await page.evaluate('return !document.querySelector("[data-lpm-surprise]")&&!document.querySelector("[data-lpm-step] details");')); await variants(1);
      assert(await page.evaluate('return document.querySelector("[data-lpm-prediction-confirm]").disabled;'));
      await page.evaluate('const e=document.querySelector("[data-lpm-prediction-choice]");e.value="short";e.dispatchEvent(new Event("change",{bubbles:true}));');
      assert(await page.evaluate('return !document.querySelector("[data-lpm-test]")&&!document.querySelector("[data-lpm-surprise]");'));
      await click('[data-lpm-prediction-confirm]');assert(await page.evaluate('return !!document.querySelector("[data-lpm-test]")&&!document.querySelector("[data-lpm-surprise]");'));assert.deepEqual(await progress(),before);await shot('00-prediction-confirmed');
    });
    await test('real keyboard ping observes long request and asymmetric short reply', async () => {
      assert.match(await ping(), /64 bytes from/); const p = await progress(); assert.deepEqual(p.completed, [1]); assert.deepEqual(p.initial.request, ['a', 'r1', 'r2', 'r3', 'r4', 'r5', 'b'].map(k => 'tutorial-06-' + k)); assert.deepEqual(p.initial.reply, ['b', 'r5', 'r1', 'a'].map(k => 'tutorial-06-' + k));
      assert(await page.evaluate('return !!document.querySelector("[data-lpm-surprise]")&&!document.querySelector("[data-lpm-step] pre");'));
      assert(await page.evaluate('return document.querySelector("[data-lpm-surprise]").textContent.includes((await import("/src/i18n/index.ts")).translate("de","guidedLpm.predictionDifferent"));')); await shot('01-long-path-observed'); await next(2);
    });
    await test('route investigation and answer correction, then matching-prefix rule', async () => {
      assert(await page.evaluate('return !!document.querySelector("[data-lpm-answer]")&&!document.querySelector("[data-lpm-step] table")&&!document.querySelector("[data-lpm-help]").open&&!!document.querySelector("[data-lpm-table]").closest("details");'));
      await command('tutorial-06-r2','ip route');assert.equal((await progress()).inspected,false);
      await command('tutorial-06-r1','ip route');assert.equal((await progress()).inspected,true);
      await click('[data-lpm-help] > summary'); const viewport=await page.evaluate('return {nodes:store.getState().nodes.map(n=>({id:n.id,position:n.position})),transform:getComputedStyle(document.querySelector(".react-flow__viewport")).transform};');
      await click('[data-lpm-table]');await wait(`document.querySelector('[role="tab"][id$="-tab-routing"][aria-selected="true"]')`);
      assert(await page.evaluate(`return !!document.querySelector('[role="tabpanel"][id$="-panel-routing"]:not([hidden]) table')&&!document.querySelector("[data-lpm-step] table");`));
      assert.deepEqual(await page.evaluate('return {nodes:store.getState().nodes.map(n=>({id:n.id,position:n.position})),transform:getComputedStyle(document.querySelector(".react-flow__viewport")).transform};'),viewport); await answer('only24'); assert.deepEqual((await progress()).completed, [1]); await answer('both'); await variants(2);
      const persisted=await progress();await mount(true);await step(2);assert.deepEqual(await progress(),persisted);assert(await page.evaluate('return !document.querySelector("[data-lpm-help]").open&&!document.querySelector("[data-lpm-step] table");'));
      await next(3); await answer('24'); assert.deepEqual((await progress()).completed, [1, 2]); await answer('25'); await variants(3); await next(4);
    });
    await test('removal needs a new ping and real direct request; route Undo/Redo preserves history', async () => {
      assert(await page.evaluate('return !document.querySelector("[data-lpm-step] pre")&&!document.querySelector("[data-lpm-step] details");'));
      await command('tutorial-06-r1', 'ip route del 192.168.80.128/25'); assert.deepEqual((await progress()).completed, [1, 2, 3]);
      await page.evaluate('store.getState().undoTopology();store.getState().redoTopology();'); assert(await page.evaluate('return (await import("/src/tutorials/lpmChapter.ts")).lpmConditions(sim.net).removed;')); // Existing terminal mutations invalidate incompatible Undo history, rather than rewriting routes.
      assert.match(await ping(), /64 bytes from/); assert.deepEqual((await progress()).short.request, ['a', 'r1', 'r5', 'b'].map(k => 'tutorial-06-' + k)); await variants(4); await next(5);
    });
    await test('independent /32 solution, old-ping rejection and preserved /24', async () => {
      assert(await page.evaluate('return !document.querySelector("[data-lpm-step] pre");'));await shot('05-independent-task-pending');
      await command('tutorial-06-r1', 'ip route add 192.168.80.130/32 via 10.6.12.2 dev eth2'); assert.deepEqual((await progress()).completed, [1, 2, 3, 4]); assert.match(await ping(), /64 bytes from/); assert.deepEqual((await progress()).completed, [1, 2, 3, 4, 5]); await variants(5); assert(await page.evaluate('return !!document.querySelector("[data-lpm-finished]");'));
      await page.evaluate('document.querySelector("[data-lpm-finished]").scrollIntoView({block:"nearest"});'); await shot('06-part1-complete');
    });
    await test('historic backward/forward navigation, F5 and restart with Undo/Redo', async () => {
      for (let n = 4; n >= 1; n--) { await click('.exercise-panel footer button:first-child'); await step(n); await saved(); }
      await mount(true); await step(1); for (let n = 2; n <= 5; n++) await next(n);
      await click('[data-chapter-restart=longest-prefix-match]'); await wait('document.querySelector("[data-chapter-restart-confirm]:not(:disabled)")'); await click('[data-chapter-restart-confirm]'); await step(1); await saved(); assert.deepEqual((await progress()).completed, []);
      await page.evaluate('store.getState().undoTopology();'); await step(5); await saved(); assert.deepEqual((await progress()).completed, [1, 2, 3, 4, 5]);
      await page.evaluate('store.getState().redoTopology();'); await step(1); await saved(); assert.deepEqual((await progress()).completed, []); await mount(true); await step(1); assert.deepEqual((await progress()).completed, []);
    });
    await test('new attempt leaves previous draft intact; resume works after opening a personal plan', async () => {
      const previous = await page.evaluate('return ws.controller.getState().activeDraftId;'); await openMenu(); await click('[data-lpm-start]'); await step(1); await saved(); const nextId = await page.evaluate('return ws.controller.getState().activeDraftId;'); assert.notEqual(nextId, previous);
      await page.evaluate('await ws.controller.openDocument({schemaVersion:1,topology:{app:"netsim",version:1,devices:[],links:[]}});'); await delay(250); await openMenu(); await click('[data-lpm-resume]'); await step(1); assert.equal(await page.evaluate('return ws.controller.getState().activeDraftId;'), nextId);
    });
    await test('a fresh table consultation through the normal Inspector satisfies only the existing inspection flag',async()=>{
      await page.evaluate('const e=document.querySelector("[data-lpm-prediction-choice]");e.value="long";e.dispatchEvent(new Event("change",{bubbles:true}));');await click('[data-lpm-prediction-confirm]');
      assert(await page.evaluate('return !document.querySelector("[data-lpm-surprise]");'));
      await ping();assert(await page.evaluate('return document.querySelector("[data-lpm-surprise]").textContent.includes((await import("/src/i18n/index.ts")).translate("de","guidedLpm.predictionMatched"));'));
      await next(2);assert.equal((await progress()).inspected,false);
      await click('.react-flow__node[data-id="tutorial-06-r1"]');await click('[role="tab"][id$="-tab-routing"]');await saved();
      assert.equal((await progress()).inspected,true);assert.deepEqual((await progress()).completed,[1]);
      assert(await page.evaluate('return !document.querySelector("[data-lpm-help]").open&&!document.querySelector("[data-lpm-step] table");'));
    });
  } finally {
    await page.evaluate('window.release?.();window.ws?.dispose();');
    await page.evaluate(`await new Promise((resolve,reject)=>{const request=indexedDB.deleteDatabase(${JSON.stringify(database)});request.onsuccess=resolve;request.onerror=()=>reject(request.error);request.onblocked=()=>reject(Error('Disposable database blocked'));});`);
  }
}
