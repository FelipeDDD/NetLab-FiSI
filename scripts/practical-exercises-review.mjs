import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {generateReview} from './visual-review.mjs';

export async function runPracticalReview({page,url,root,report}) {
  const database='netlab-idb-test-'+randomUUID(),directory=path.join(root,'.playwright-mcp/reviews/raw/practical-beta-staging');
  await mkdir(directory,{recursive:true});
  const results={},captures=[],delay=ms=>new Promise(r=>setTimeout(r,ms));
  const wait=async expression=>{for(let i=0;i<200;i++){if(await page.evaluate('return !!('+expression+');'))return;await delay(40);}throw Error('Timed out: '+expression);};
  const click=async(selector,text)=>{
    const p=await page.evaluate(`const clean=s=>s.replace(/[›▾]/g,'').trim();const list=[...document.querySelectorAll(${JSON.stringify(selector)})];const e=${text?`list.find(e=>clean(e.textContent)===clean(${JSON.stringify(text)}))`:'list[0]'};if(!e)throw Error('Missing control: '+${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};`);
    await page.send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1});await page.send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1});await delay(80);
  };
  const test=async(name,fn)=>{try{await fn();results[name]={passed:true};}catch(e){results[name]={passed:false,error:e.stack};throw e;}};
  const status=()=>page.evaluate("const r=await ws.repository.getMeta('exercises:beta:v1');if(!r.ok)throw Error(JSON.stringify(r));return r.value?.value??null;");
  const mount=async()=>{
    await page.send('Page.navigate',{url});await wait("document.readyState==='complete'&&location.pathname==='/__workspace_ui_test__'");
    await page.evaluate(`window.entry=await import('/src/workspace/reviewEntry.tsx');window.store=(await import('/src/store.ts')).useStore;window.sim=(await import('/src/sim.ts')).sim;window.ws=await entry.mountWorkspaceReview(document.getElementById('root'),{databaseName:${JSON.stringify(database)}});window.lang=(await import('/src/i18n/index.ts')).useLanguage;lang.getState().setLanguage('de');window.theme=(await import('/src/uiTheme.ts')).useUiTheme;window.serial=await import('/src/engine/serialize.ts');window.ip=await import('/src/engine/ip.ts');`);
    await wait("document.querySelector('.react-flow')");await delay(100);
  };
  const menu=async()=>{
    if(await page.evaluate("return !!document.querySelector('#toolbar-exercises-menu');"))return;
    if(await page.evaluate('return innerWidth<1100;'))await click('.toolbar-menu-trigger','Menü ▾');
    await click('.toolbar-menu-trigger,.toolbar-menu-action','Übungen (Beta)');await wait("document.querySelector('#toolbar-exercises-menu')");
  };
  const start=async(code,button='Starten')=>{
    await menu();await click(`[data-exercise="pilot-${code}-v1"] button`,button);await wait(`document.querySelector('.exercise-panel[data-exercise="pilot-${code}-v1"]')`);
  };
  const check=async()=>{
    const before=await page.evaluate('return JSON.stringify(serial.serializeNetwork(sim.net,{}));');
    await click('.exercise-panel button','Lösung prüfen');await wait("document.querySelector('.exercise-panel').textContent.includes('Prüfung läuft')");
    await page.evaluate('store.getState().setPaused(true);sim.net.scheduler.advanceTo(sim.net.scheduler.now+120000);');
    await wait("!document.querySelector('.exercise-panel').textContent.includes('Prüfung läuft')");await delay(80);
    assert.equal(await page.evaluate('return JSON.stringify(serial.serializeNetwork(sim.net,{}));'),before,'checker must not modify configuration');
  };
  const shot=async(name,variant,width,state)=>{
    await delay(100);const png=await page.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(directory,name+'.png'),Buffer.from(png.data,'base64'));
    captures.push({source:path.relative(root,path.join(directory,name+'.png')).split(path.sep).join('/'),scene:name,variant,state,width,height:960});
  };
  let personal,personalBefore,e08Draft,e09Draft,e09Saved;
  try {
    await page.send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});await mount();
    await page.evaluate("theme.getState().setTheme('graphite-dark');store.getState().addDeviceAt('host',{x:500,y:350});store.getState().renameDevice([...sim.net.devices.keys()][0],'Privat – 保持');await ws.controller.flush();");
    personal=await page.evaluate('return ws.controller.getState().activeDraftId;');personalBefore=await page.evaluate('return JSON.stringify(store.getState().captureWorkspaceDocument());');
    await test('practical: only four pilot entries; E06 healthy with no configuration changes; personal draft preserved',async()=>{
      await menu();assert.equal(await page.evaluate("return document.querySelectorAll('.exercise-menu-entry[data-exercise^=pilot-]').length;"),4);
      await start('e06');await check();assert((await status()).completed['pilot-e06-v1']);
      assert(await page.evaluate("return document.querySelector('.exercise-panel').textContent.includes('keine Änderung erforderlich');"));
      await page.evaluate(`await ws.controller.switchDraft(${JSON.stringify(personal)});`);await wait("!document.querySelector('.exercise-panel')");
      assert.equal(await page.evaluate('return JSON.stringify(store.getState().captureWorkspaceDocument());'),personalBefore);
    });
    await test('practical: E08 wrong next hop fails; target-route alternative passes; run/cancel does not mutate config',async()=>{
      await start('e08');e08Draft=await page.evaluate('return ws.controller.getState().activeDraftId;');await check();assert(!(await status()).completed['pilot-e08-v1']);
      await shot('gateway-pending','graphite-dark',1440,'normal');
      // Test-only terminal-like route edits in the disposable topology, never a fabricated checker result.
      await page.evaluate("const d=sim.net.devices.get('a');d.staticRoutes=[];d.addRoute(ip.parseIp('192.168.11.0'),24,ip.parseIp('192.168.10.1'),'eth0');store.getState().refresh();await ws.controller.flush();");
      await click('.exercise-panel button','Lösung prüfen');await click('.exercise-panel button','Prüfung abbrechen');await page.evaluate('sim.net.scheduler.advanceTo(sim.net.scheduler.now+120000);');
      assert(!(await status()).completed['pilot-e08-v1']);await check();assert((await status()).completed['pilot-e08-v1']);
      await shot('gateway-alternative-passed','graphite-dark',1440,'selected');
    });
    await test('practical: E09 Inspector/store edit and Undo/Redo remain usable; correct mask passes and altered structure fails',async()=>{
      await start('e09');e09Draft=await page.evaluate('return ws.controller.getState().activeDraftId;');await check();assert(!(await status()).completed['pilot-e09-v1']);
      await page.evaluate("store.getState().select('a');store.getState().setIfaceIp('a','eth0','192.168.10.50/24');");
      assert.equal(await page.evaluate("return sim.net.devices.get('a').getInterface('eth0').ip.prefix;"),24);
      await page.evaluate('store.getState().undoTopology();');assert.equal(await page.evaluate("return sim.net.devices.get('a').getInterface('eth0').ip.prefix;"),16);
      await page.evaluate('store.getState().redoTopology();');await check();assert((await status()).completed['pilot-e09-v1']);
      await page.evaluate("store.getState().addDeviceAt('host',{x:500,y:350});");await check();assert(await page.evaluate("return document.querySelector('[data-check=preserve-structure]').textContent.includes('geschützte Einstellungen wurden verändert');"));
      await page.evaluate('store.getState().undoTopology();store.getState().select(null);');await check();
      e09Saved=await page.evaluate("const r=await ws.controller.save('Praxis E09 – geprüft');if(!r.ok)throw Error(JSON.stringify(r));return r.value.plan.project.id;");
    });
    await test('practical: F5 restores attempt, edited configuration and completion; previous plan and terminal survive tab switching',async()=>{
      const before=await status();await page.evaluate('await ws.controller.flush();ws.dispose();');await page.send('Page.reload');await mount();
      await wait("document.querySelector('.exercise-panel[data-exercise=pilot-e09-v1]')");
      assert.deepEqual(await status(),before);assert.equal(await page.evaluate("return sim.net.devices.get('a').getInterface('eth0').ip.prefix;"),24);
      await page.evaluate("store.getState().openTerminal('a');");await wait("document.querySelector('.xterm-helper-textarea')");
      await page.evaluate(`await ws.controller.switchDraft(${JSON.stringify(personal)});`);await wait("!document.querySelector('.exercise-panel')");
      assert.equal(await page.evaluate('return JSON.stringify(store.getState().captureWorkspaceDocument());'),personalBefore);
      await page.evaluate(`await ws.controller.switchDraft(${JSON.stringify(e08Draft)});`);await wait("document.querySelector('.exercise-panel[data-exercise=pilot-e08-v1]')");await check();
      await page.evaluate(`await ws.controller.switchDraft(${JSON.stringify(e09Draft)});`);await wait("document.querySelector('.exercise-panel[data-exercise=pilot-e09-v1]')");await check();
    });
    await test('practical: saved topology survives close/load; a new draft does not falsely inherit attempt association',async()=>{
      await page.evaluate(`await ws.controller.flush();const s=ws.controller.getState();const d=s.drafts.find(d=>d.id===s.activeDraftId);const r=await ws.controller.closeDraft(d.id,{expectedEditSequence:d.editSequence,discardChanges:true});if(!r.ok)throw Error(JSON.stringify(r));const opened=await ws.controller.openPlan(${JSON.stringify(e09Saved)});if(!opened.ok)throw Error(JSON.stringify(opened));`);
      await wait("!document.querySelector('.exercise-panel')");assert.equal(await page.evaluate("return sim.net.devices.get('a').getInterface('eth0').ip.prefix;"),24);
      assert.equal((await status()).attempts[await page.evaluate('return ws.controller.getState().activeDraftId;')],undefined);
    });
    await test('practical: D02 incomplete return path fails; equivalent defaults pass',async()=>{
      await start('d02');await check();assert(!(await status()).completed['pilot-d02-v1']);
      await page.evaluate("sim.net.devices.get('west').addRoute(0,0,ip.parseIp('10.72.254.2'),'eth1');store.getState().refresh();await ws.controller.flush();");await check();assert(!(await status()).completed['pilot-d02-v1']);
      await page.evaluate("sim.net.devices.get('east').addRoute(0,0,ip.parseIp('10.72.254.1'),'eth0');store.getState().refresh();await ws.controller.flush();");await check();assert((await status()).completed['pilot-d02-v1']);
      await shot('routing-return-passed','graphite-dark',1440,'selected');
    });
    await test('practical: DE/EN/PT-BR navigation, German pedagogy, 700px Classic Light scrolling; restart creates separate draft',async()=>{
      await page.send('Emulation.setDeviceMetricsOverride',{width:700,height:960,deviceScaleFactor:1,mobile:false});await page.evaluate("theme.getState().setTheme('classic-light');store.getState().setTerminalDockCollapsed(true);");
      for(const [language,label] of [['en','Check solution'],['pt-BR','Verificar solução'],['de','Lösung prüfen']]){
        await page.evaluate(`lang.getState().setLanguage(${JSON.stringify(language)});`);await delay(100);
        assert(await page.evaluate(`return [...document.querySelectorAll('.exercise-panel button')].some(b=>b.textContent===${JSON.stringify(label)});`));
        assert(await page.evaluate("return document.querySelector('.exercise-body').textContent.includes('Transitnetz');"));
      }
      assert(await page.evaluate('return document.documentElement.scrollWidth<=innerWidth+1;'));
      assert(await page.evaluate("const p=document.querySelector('.exercise-panel');return p.scrollWidth<=p.clientWidth+1&&p.getBoundingClientRect().bottom<=innerHeight;"));
      await shot('routing-light-700','classic-light',700,'normal');await menu();await shot('pilot-menu-light-700','classic-light',700,'normal');
      const n=await page.evaluate('return ws.controller.getState().drafts.length;');await start('d02','Erneut starten');assert.equal(await page.evaluate('return ws.controller.getState().drafts.length;'),n+1);
      assert.equal(await page.evaluate("return sim.net.devices.get('west').staticRoutes.length;"),0);
      assert((await status()).completed['pilot-d02-v1']);
    });
  } finally {
    await page.evaluate('window.ws?.dispose();');
    await page.evaluate(`await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase(${JSON.stringify(database)});r.onsuccess=resolve;r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Pilot cleanup blocked'));});`);
    Object.assign(report.results,results);await writeFile(path.join(directory,'results.json'),JSON.stringify(results,null,2));
    if(captures.length&&Object.values(results).every(r=>r.passed)) {
      const manifest=path.join(directory,'manifest.json');await writeFile(manifest,JSON.stringify({id:'practical-beta',title:'Praktische Übungen – Pilot',variants:[{id:'graphite-dark',label:'Graphite Dark'},{id:'classic-light',label:'Classic Light'}],states:['normal','selected'],captures,share:captures.filter((_,i)=>[1,2,4].includes(i)).map(c=>({...c,name:c.scene})),shareContactSheet:false}));
      report.practicalReview=await generateReview(manifest);
    }
  }
}
