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
  const type=async(selector,text)=>{
    await click(selector);await page.send('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',modifiers:2,windowsVirtualKeyCode:65});await page.send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',modifiers:2,windowsVirtualKeyCode:65});await page.send('Input.insertText',{text});
  };
  const command=async text=>{
    await page.evaluate("document.querySelector('.xterm-helper-textarea').focus();");await page.send('Input.insertText',{text});
    await page.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',text:'\r',unmodifiedText:'\r',windowsVirtualKeyCode:13});
    await page.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});await delay(100);
  };
  const test=async(name,fn)=>{try{await fn();results[name]={passed:true};}catch(e){results[name]={passed:false,error:e.stack};throw e;}};
  const status=()=>page.evaluate("const r=await ws.repository.getMeta('exercises:beta:v1');if(!r.ok)throw Error(JSON.stringify(r));return r.value?.value??null;");
  const mount=async()=>{
    await page.send('Page.navigate',{url});await wait("document.readyState==='complete'&&location.pathname==='/__workspace_ui_test__'");
    await page.evaluate(`window.entry=await import('/src/workspace/reviewEntry.tsx');window.store=(await import('/src/store.ts')).useStore;window.sim=(await import('/src/sim.ts')).sim;window.ws=await entry.mountWorkspaceReview(document.getElementById('root'),{databaseName:${JSON.stringify(database)}});window.lang=(await import('/src/i18n/index.ts')).useLanguage;lang.getState().setLanguage('de');window.theme=(await import('/src/uiTheme.ts')).useUiTheme;window.serial=await import('/src/engine/serialize.ts');window.ip=await import('/src/engine/ip.ts');`);
    await wait("document.querySelector('.react-flow')");await delay(100);
    await page.evaluate("window.flow=(await import('/src/workspace/viewportProbe.browser.tsx')).getViewportProbe();");
  };
  const menu=async()=>{
    if(await page.evaluate("return !!document.querySelector('#toolbar-exercises-menu');"))return;
    if(await page.evaluate('return innerWidth<1100;'))await click('.toolbar-menu-trigger','Menü ▾');
    await click('.toolbar-menu-trigger,.toolbar-menu-action','Übungen (Beta)');await wait("document.querySelector('#toolbar-exercises-menu')");
  };
  const start=async(code,button='Starten')=>{
    await menu();await click(`[data-exercise="pilot-${code}-v1"] button`,button);await wait(`document.querySelector('.exercise-panel[data-exercise="pilot-${code}-v1"]')`);
    await wait('flow.getZoom()<=.65');
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
      assert.equal(await page.evaluate("return document.querySelectorAll('#toolbar-exercises-menu .exercise-menu-group').length;"),4);
      await page.evaluate("document.querySelectorAll('#toolbar-exercises-menu .exercise-menu-group > summary')[1].focus();");
      await page.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
      await page.send('Input.dispatchKeyEvent',{type:'char',text:'\r',unmodifiedText:'\r',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
      await page.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
      assert(await page.evaluate("return !document.querySelectorAll('#toolbar-exercises-menu .exercise-menu-group')[1].open;"));
      await page.send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowDown',code:'ArrowDown',windowsVirtualKeyCode:40});
      assert.equal(await page.evaluate("return document.activeElement.textContent;"),'Routing & Gateway');
      await click('#toolbar-exercises-menu .exercise-menu-group:nth-of-type(2) > summary');
      await start('e06');await check();assert((await status()).completed['pilot-e06-v1']);
      assert(await page.evaluate("return Math.abs(flow.getZoom()-.65)<.001;"));
      assert(await page.evaluate("return document.querySelector('.exercise-panel').textContent.includes('keine Änderung erforderlich');"));
      assert(await page.evaluate("return document.querySelector('.exercise-learning').textContent.includes('192.168.0.0/16')&&!document.querySelector('.exercise-summary').textContent.includes('offen');"));
      await shot('e06-learning-quarter-zoom','graphite-dark',1440,'normal');
      await page.evaluate("await flow.setViewport({x:120,y:80,zoom:.75});window.manualViewport=flow.getViewport();window.initialPositions=store.getState().nodes.map(n=>({id:n.id,position:n.position}));store.getState().setTerminalDockCollapsed(true);");await delay(150);
      assert.deepEqual(await page.evaluate('return flow.getViewport();'),await page.evaluate('return manualViewport;'));
      assert.deepEqual(await page.evaluate('return store.getState().nodes.map(n=>({id:n.id,position:n.position}));'),await page.evaluate('return initialPositions;'));
      await page.evaluate(`await ws.controller.switchDraft(${JSON.stringify(personal)});`);await wait("!document.querySelector('.exercise-panel')");
      assert.equal(await page.evaluate('return JSON.stringify(store.getState().captureWorkspaceDocument());'),personalBefore);
    });
    await test('practical: quarter-speed ping slider changes only presentation and preserves replay/pause',async()=>{
      await start('e06','Erneut starten');
      await page.evaluate("store.getState().setPaused(false);store.getState().beginQuickPing('a');store.getState().chooseQuickPingTarget('b');");
      await wait("document.querySelector('#ping-animation-speed')");
      assert.equal(await page.evaluate('return store.getState().packetAnimationSpeed;'),.25);
      await page.evaluate("store.getState().setPaused(true);sim.net.scheduler.advanceTo(sim.net.now+5000);store.getState().replayGuidedPacket();store.getState().toggleGuidedPlayback();window.pingClock=sim.net.now;window.pingProgress=store.getState().guidedPacket.playback.progress;");
      await click('#ping-animation-speed');
      await page.send('Input.dispatchKeyEvent',{type:'keyDown',key:'End',code:'End',windowsVirtualKeyCode:35});
      assert.equal(await page.evaluate('return store.getState().packetAnimationSpeed;'),2);
      await page.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Home',code:'Home',windowsVirtualKeyCode:36});
      assert.equal(await page.evaluate('return store.getState().packetAnimationSpeed;'),.25);
      assert.equal(await page.evaluate('return sim.net.now;'),await page.evaluate('return pingClock;'));
      assert.equal(await page.evaluate('return store.getState().guidedPacket.playback.progress;'),await page.evaluate('return pingProgress;'));
      assert(await page.evaluate('return store.getState().guidedPacket.playback.hops.length>=4;'));
      await shot('ping-quarter-speed','graphite-dark',1440,'selected');
      await page.evaluate("store.getState().setTerminalDockCollapsed(true);");
    });
    await test('practical: E08 wrong next hop fails; target-route alternative passes; run/cancel does not mutate config',async()=>{
      await start('e08');e08Draft=await page.evaluate('return ws.controller.getState().activeDraftId;');await check();assert(!(await status()).completed['pilot-e08-v1']);
      assert.equal(await page.evaluate('return flow.getZoom();'),.65,'E08 initial zoom');
      await page.evaluate("await flow.setViewport({x:134,y:66,zoom:.7});window.e08View=flow.getViewport();store.getState().select('a');");
      assert(await page.evaluate("return document.querySelector('.host-ipv4-summary').innerHTML.includes('<dt>Gateway</dt><dd>192.168.10.254</dd>')&&!document.querySelector('.host-ipv4-summary').textContent.includes('Explizite Route');"));
      await shot('gateway-overview-compact','graphite-dark',1440,'normal');
      await click('.inspector [role=tab]','Netzwerk');
      assert.equal(await page.evaluate("return document.querySelector('.inspector input[aria-label=\"Standardgateway eth0\"]').value;"),'');
      assert(await page.evaluate("return document.querySelector('.inspector .interface-default-routes').textContent.includes('192.168.10.254')&&document.querySelector('.inspector .interface-default-routes').textContent.includes('Explizite Route');"));
      await shot('gateway-explicit-route','graphite-dark',1440,'normal');
      await page.evaluate("store.getState().openTerminal('a');");await wait("document.querySelector('.xterm-helper-textarea')");
      await command('ip route replace default via 192.168.10.1 dev eth0');
      await wait("sim.net.devices.get('a').staticRoutes.some(r=>r.prefix===0&&r.via===ip.parseIp('192.168.10.1'))");
      assert.equal(await page.evaluate("return document.querySelector('.inspector input[aria-label=\"Standardgateway eth0\"]').value;"),'');
      await wait("document.querySelector('.host-ipv4-summary').innerHTML.includes('<dt>Gateway</dt><dd>192.168.10.1</dd>')");
      await type('.inspector input[aria-label="Standardgateway eth0"]','192.168.10.2');
      await click('.inspector input[aria-label="DNS-Server eth0"]');
      await wait("sim.net.devices.get('a').interfaces[0].gateway===ip.parseIp('192.168.10.2')");
      assert(await page.evaluate("return sim.net.devices.get('a').staticRoutes.some(r=>r.prefix===0&&r.via===ip.parseIp('192.168.10.1'))&&document.querySelector('.host-ipv4-summary').innerHTML.includes('<dt>Gateway</dt><dd>—</dd>');"));
      assert(await page.evaluate("return document.querySelector('.interface-default-routes').textContent.includes('192.168.10.1')&&document.querySelector('.interface-default-routes').textContent.includes('Mehrere Standardwege');"));
      await click('.interface-default-routes > details > summary');assert(await page.evaluate("return !!document.querySelector('.interface-default-routes .diagnostic-table');"));
      await type('.inspector input[aria-label="Standardgateway eth0"]','');await click('.inspector input[aria-label="DNS-Server eth0"]');
      await wait("sim.net.devices.get('a').interfaces[0].gateway===null");
      await command('ip route del default');
      await wait("!sim.net.devices.get('a').staticRoutes.some(r=>r.prefix===0)");
      assert(await page.evaluate("return document.querySelector('.host-ipv4-summary').innerHTML.includes('<dt>Gateway</dt><dd>—</dd>');"));
      await command('ip route add 192.168.11.0/24 via 192.168.10.1 dev eth0');
      await wait("sim.net.devices.get('a').staticRoutes.some(r=>r.prefix===24&&r.via===ip.parseIp('192.168.10.1'))");
      await page.evaluate("store.getState().select(null);store.getState().setTerminalDockCollapsed(true);");
      assert.deepEqual(await page.evaluate('return flow.getViewport();'),await page.evaluate('return e08View;'));
      await shot('gateway-pending','graphite-dark',1440,'normal');
      await page.evaluate('await ws.controller.flush();');
      await click('.exercise-panel button','Lösung prüfen');await click('.exercise-panel button','Prüfung abbrechen');await page.evaluate('sim.net.scheduler.advanceTo(sim.net.scheduler.now+120000);');
      assert(!(await status()).completed['pilot-e08-v1']);await check();assert((await status()).completed['pilot-e08-v1']);
      await shot('gateway-alternative-passed','graphite-dark',1440,'selected');
    });
    await test('practical: E09 Inspector/store edit and Undo/Redo remain usable; correct mask passes and altered structure fails',async()=>{
      await start('e09');e09Draft=await page.evaluate('return ws.controller.getState().activeDraftId;');await check();assert(!(await status()).completed['pilot-e09-v1']);
      assert(await page.evaluate('return Math.abs(flow.getZoom()-.65)<.001;'));
      await page.evaluate('await flow.setViewport({x:88,y:42,zoom:.9});window.e09View=flow.getViewport();');
      await page.evaluate(`await ws.controller.switchDraft(${JSON.stringify(e08Draft)});`);await delay(100);
      assert.deepEqual(await page.evaluate('return flow.getViewport();'),await page.evaluate('return e08View;'));
      await page.evaluate(`await ws.controller.switchDraft(${JSON.stringify(e09Draft)});`);await delay(100);
      assert.deepEqual(await page.evaluate('return flow.getViewport();'),await page.evaluate('return e09View;'));
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
      await wait('flow.getZoom()<=.65');assert(await page.evaluate('return Math.abs(flow.getZoom()-.65)<.001;'));
      await page.evaluate('window.reloadedPositions=store.getState().nodes.map(n=>({id:n.id,position:n.position}));');
      assert.deepEqual(await status(),before);assert.equal(await page.evaluate("return sim.net.devices.get('a').getInterface('eth0').ip.prefix;"),24);
      await page.evaluate("store.getState().openTerminal('a');");await wait("document.querySelector('.xterm-helper-textarea')");
      await page.evaluate(`await ws.controller.switchDraft(${JSON.stringify(personal)});`);await wait("!document.querySelector('.exercise-panel')");
      assert.equal(await page.evaluate('return JSON.stringify(store.getState().captureWorkspaceDocument());'),personalBefore);
      await wait('flow.getZoom()>.5'); // Personal first framing retains its original cap.
      await page.evaluate(`await ws.controller.switchDraft(${JSON.stringify(e08Draft)});`);await wait("document.querySelector('.exercise-panel[data-exercise=pilot-e08-v1]')");await check();
      await wait('flow.getZoom()<=.65');
      await page.evaluate('await flow.setViewport({x:96,y:47,zoom:.65});window.resumedE08View=flow.getViewport();');
      await page.evaluate(`await ws.controller.switchDraft(${JSON.stringify(e09Draft)});`);await wait("document.querySelector('.exercise-panel[data-exercise=pilot-e09-v1]')");await check();
      await page.evaluate('await flow.setViewport({x:78,y:39,zoom:.8});window.resumedE09View=flow.getViewport();');
      await page.evaluate(`await ws.controller.switchDraft(${JSON.stringify(e08Draft)});`);await delay(100);
      assert.deepEqual(await page.evaluate('return flow.getViewport();'),await page.evaluate('return resumedE08View;'));
      await page.evaluate(`await ws.controller.switchDraft(${JSON.stringify(e09Draft)});`);await delay(100);
      assert.deepEqual(await page.evaluate('return flow.getViewport();'),await page.evaluate('return resumedE09View;'));
      assert.deepEqual(await page.evaluate('return store.getState().nodes.map(n=>({id:n.id,position:n.position}));'),await page.evaluate('return reloadedPositions;'));
    });
    await test('practical: saved topology survives close/load; a new draft does not falsely inherit attempt association',async()=>{
      await page.evaluate(`await ws.controller.flush();const s=ws.controller.getState();const d=s.drafts.find(d=>d.id===s.activeDraftId);const r=await ws.controller.closeDraft(d.id,{expectedEditSequence:d.editSequence,discardChanges:true});if(!r.ok)throw Error(JSON.stringify(r));const opened=await ws.controller.openPlan(${JSON.stringify(e09Saved)});if(!opened.ok)throw Error(JSON.stringify(opened));`);
      await wait("!document.querySelector('.exercise-panel')");assert.equal(await page.evaluate("return sim.net.devices.get('a').getInterface('eth0').ip.prefix;"),24);
      assert.equal((await status()).attempts[await page.evaluate('return ws.controller.getState().activeDraftId;')],undefined);
    });
    await test('practical: D02 incomplete return path fails; equivalent defaults pass',async()=>{
      await start('d02');assert(await page.evaluate("return document.querySelector('.exercise-summary').textContent.includes('Noch nicht geprüft');"));
      await check();assert(!(await status()).completed['pilot-d02-v1']);
      assert(await page.evaluate("return document.querySelector('.exercise-summary').textContent.includes('Anforderungen noch nicht erfüllt');"));
      await page.evaluate("sim.net.devices.get('west').addRoute(0,0,ip.parseIp('10.72.254.2'),'eth1');store.getState().refresh();await ws.controller.flush();");await check();assert(!(await status()).completed['pilot-d02-v1']);
      await page.evaluate("sim.net.devices.get('east').addRoute(0,0,ip.parseIp('10.72.254.1'),'eth0');store.getState().refresh();await ws.controller.flush();");await check();assert((await status()).completed['pilot-d02-v1']);
      assert(await page.evaluate("return document.querySelector('.exercise-summary').textContent.includes('✓ Technisch bestanden')&&!document.querySelector('.exercise-summary').textContent.includes('Besprechung offen');"));
      assert(await page.evaluate("const body=document.querySelector('.exercise-body'),heading=document.querySelector('.exercise-panel header'),before=heading.getBoundingClientRect().top;body.scrollTop=body.scrollHeight;return body.scrollTop>0&&heading.getBoundingClientRect().top===before&&heading.contains(document.querySelector('.exercise-summary'));"));
      await shot('routing-return-passed','graphite-dark',1440,'selected');
      await page.evaluate("store.getState().renameDevice('west','West edited');");
      await wait("document.querySelector('.exercise-summary').dataset.outcome==='unverified'");
      assert((await status()).completed['pilot-d02-v1']);
      await page.evaluate("store.getState().renameDevice('west','West');");await check();
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
      assert(await page.evaluate("return document.querySelector('.exercise-summary').textContent.includes('✓ Technisch bestanden');"));
      await shot('routing-light-700','classic-light',700,'normal');await menu();await shot('pilot-menu-light-700','classic-light',700,'normal');
      const n=await page.evaluate('return ws.controller.getState().drafts.length;');await start('d02','Erneut starten');assert.equal(await page.evaluate('return ws.controller.getState().drafts.length;'),n+1);
      await delay(150);
      assert(await page.evaluate('const z=flow.getZoom(),v=flow.getViewport(),b=flow.getNodesBounds(flow.getNodes()),r=document.querySelector(".react-flow").getBoundingClientRect();return z<=.65&&b.x*z+v.x>=-1&&(b.x+b.width)*z+v.x<=r.width+1&&b.y*z+v.y>=-1&&(b.y+b.height)*z+v.y<=r.height+1;'));
      assert.equal(await page.evaluate("return sim.net.devices.get('west').staticRoutes.length;"),0);
      assert((await status()).completed['pilot-d02-v1']);
    });
  } finally {
    await page.evaluate('window.ws?.dispose();');
    await page.evaluate(`await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase(${JSON.stringify(database)});r.onsuccess=resolve;r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Pilot cleanup blocked'));});`);
    Object.assign(report.results,results);await writeFile(path.join(directory,'results.json'),JSON.stringify(results,null,2));
    if(captures.length&&Object.values(results).every(r=>r.passed)) {
      const main=['e06-learning-quarter-zoom','gateway-overview-compact','gateway-explicit-route','pilot-menu-light-700'];
      const manifest=path.join(directory,'manifest.json');await writeFile(manifest,JSON.stringify({id:'practical-beta',title:'Praktische Übungen – Pilot',variants:[{id:'graphite-dark',label:'Graphite Dark'},{id:'classic-light',label:'Classic Light'}],states:['normal','selected'],captures,share:captures.filter(c=>main.includes(c.scene)).map(c=>({...c,name:c.scene})),shareContactSheet:false}));
      report.practicalReview=await generateReview(manifest);
    }
  }
}
