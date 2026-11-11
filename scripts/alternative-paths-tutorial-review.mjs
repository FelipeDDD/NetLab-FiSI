import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function runAlternativePathsReview({ page, url, root, report }) {
  const database = 'netlab-idb-test-' + crypto.randomUUID(), directory = path.join(root, '.playwright-mcp/reviews/chapter-menu-help/referencias-chatgpt');
  await mkdir(directory, { recursive: true });
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const wait = async condition => { for (let i = 0; i < 300; i++) {
    try { if (await page.evaluate(`return !!(${condition});`)) return; }
    catch(error){if(!/Inspected target navigated or closed|Execution context was destroyed|Cannot find context with specified id/.test(String(error)))throw error;}
    await delay(40);
  } throw Error('Alternative paths: ' + condition); };
  const click = async (selector, text) => {
    const p = await page.evaluate(`const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.getClientRects().length&&(${text ? `e.textContent.trim().replace(/\\s*[▾›]$/,'')===${JSON.stringify(text)}` : 'true'}));if(!e)throw Error('Missing '+${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};`);
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, ...p, ...(type === 'mouseMoved' ? {} : { button: 'left', clickCount: 1 }) }); await delay(100);
    // Existing scenarios still start normally, now through the public submenu.
  };
  const mount = async (reload = false) => {
    const previous = crypto.randomUUID(); await page.evaluate(`window.previousReviewDocument=${JSON.stringify(previous)};`);
    await page.send(reload ? 'Page.reload' : 'Page.navigate', reload ? { ignoreCache: true } : { url }); await wait(`window.previousReviewDocument!==${JSON.stringify(previous)}&&document.readyState==='complete'&&document.getElementById('root')`);
    await page.evaluate(`window.store=(await import('/src/store.ts')).useStore;window.sim=(await import('/src/sim.ts')).sim;window.lang=(await import('/src/i18n/index.ts')).useLanguage;window.theme=(await import('/src/uiTheme.ts')).useUiTheme;window.chapter=await import('/src/tutorials/alternativePathsChapter.ts');window.records=[];window.releaseObserver=(await import('/src/terminalCommandEvents.ts')).observeTerminalCommands(e=>records.push({type:e.type,deviceId:e.command.deviceId,line:e.command.line,source:e.command.source,text:e.text}));lang.getState().setLanguage('de');window.ws=await(await import('/src/workspace/reviewEntry.tsx')).mountWorkspaceReview(document.getElementById('root'),{databaseName:${JSON.stringify(database)}});`);
    await wait("document.querySelector('.react-flow')"); await delay(200);
  };
  const menu = async () => { if (await page.evaluate('return innerWidth<1100;')) await click('.toolbar-menu-trigger', 'Menü'); await click('.toolbar-menu-trigger,.toolbar-menu-action', 'Übungen (Beta)'); await click('[data-guided-menu-toggle]'); await wait("document.querySelector('[data-alternative-direct]:not(:disabled)')"); };
  const saved = async () => { await wait("document.querySelector('[data-alternative-saving=false]')"); await page.evaluate('await ws.controller.flush();'); };
  const receipt = () => page.evaluate("const id=ws.controller.getState().activeDraftId;return {id,document:store.getState().captureWorkspaceDocument(),progress:(await ws.repository.getMeta('guided:alternative-paths:v5:draft:'+id)).value?.value,tabs:ws.controller.getState().drafts.length};");
  const step = n => wait(`document.querySelector('[data-alternative-step="${n}"]')`), passed = () => wait("document.querySelector('[data-alternative-passed=true]')");
  const command = async (id, line, advance = false) => {
    await page.evaluate(`store.getState().terminals.filter(key=>key!==${JSON.stringify(id)}).forEach(key=>store.getState().closeTerminal(key));store.getState().openTerminal(${JSON.stringify(id)});window.commandStart=records.length;`);
    await wait("document.querySelector('.xterm-helper-textarea')"); await delay(80); await page.evaluate("document.querySelector('.xterm-helper-textarea').focus();"); await page.send('Input.insertText', { text: line });
    for (const type of ['keyDown', 'keyUp']) await page.send('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, ...(type === 'keyDown' ? { text: '\r', unmodifiedText: '\r' } : {}) });
    await wait(`records.slice(commandStart).some(e=>e.type==='started'&&e.deviceId===${JSON.stringify(id)}&&e.line===${JSON.stringify(line)})`);
    if (advance) {
      await wait(`records.slice(commandStart).some(e=>e.type==='output'&&e.deviceId===${JSON.stringify(id)}&&e.line===${JSON.stringify(line)})`);
      await page.evaluate('store.getState().setPaused(true);sim.net.scheduler.advanceTo(sim.net.now+6000);');
      await wait(`records.slice(commandStart).some(e=>e.type==='finished'&&e.deviceId===${JSON.stringify(id)}&&e.line===${JSON.stringify(line)})`);
    }
    await delay(160); return page.evaluate("return records.slice(commandStart).filter(e=>e.type==='output').map(e=>e.text).join('');");
  };
  const configureGateway = async (id, gateway) => { await page.evaluate(`const ip=await import('/src/engine/ip.ts'),device=sim.net.devices.get(${JSON.stringify(id)}),iface=device.getInterface('eth0'),error=store.getState().setInterfaceIpv4(device.id,iface.name,{...iface.ipv4,gateway:ip.parseIp(${JSON.stringify(gateway)})});if(error)throw Error(error);`); await delay(140); };

  const I={r1:'tutorial-05-r1',r2:'tutorial-05-r2',r3:'tutorial-05-r3',a:'tutorial-05-a',b:'tutorial-05-b'};
  const key=async name=>{for(const type of ['keyDown','keyUp'])await page.send('Input.dispatchKeyEvent',{type,key:name,code:name,windowsVirtualKeyCode:{Escape:27,ArrowRight:39,ArrowLeft:37,ArrowDown:40,ArrowUp:38,Enter:13}[name]});await delay(100);};
  const next=async n=>{await wait('document.querySelector("[data-alternative-next]:not(:disabled)")');await click('[data-alternative-next]');await step(n);await saved();};
  const answer=async(kind,value)=>{await page.evaluate('const e=document.querySelector("[data-alternative-answer='+kind+']");e.value='+JSON.stringify(value)+';e.dispatchEvent(new Event("change",{bubbles:true}));');await delay(100);};
  const test=async(name,fn)=>{try{await fn();report.results['chapter5 v5: '+name]={passed:true};}catch(e){report.results['chapter5 v5: '+name]={passed:false,error:e.stack,visible:await page.evaluate('return document.querySelector(".exercise-panel")?.innerText;')};throw e;}};
  const shot=async name=>{await page.evaluate('store.getState().setTerminalDockCollapsed(true);const body=document.querySelector(".exercise-body");if(body)body.scrollTop=0;');await delay(180);await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:100,y:20});const png=await page.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(directory,name+'.png'),Buffer.from(png.data,'base64'));};
  const reloadAt=async n=>{await saved();const before=await receipt();await mount(true);await step(n);await saved();assert.deepEqual(await receipt(),before);};
  const variants=async n=>{for(const language of ['de','en','pt-BR'])for(const name of ['graphite-dark','classic-light']){
    await page.evaluate('lang.getState().setLanguage('+JSON.stringify(language)+');theme.getState().setTheme('+JSON.stringify(name)+');');await delay(75);
    assert(await page.evaluate('const p=document.querySelector("[data-alternative-step]"),h=p.querySelector("details");return p.dataset.alternativeStep==='+JSON.stringify(String(n))+'&&!p.innerText.includes("guidedAlternative.")&&!/Teil 4|Part 4|Parte 4/.test(p.innerText)&&!/PC C|LAN C|Longest Prefix Match/.test(p.innerText)&&p.querySelectorAll("details").length<=1&&(!h||!h.open)&&(![14,15,16].includes('+n+')||!h)&&document.documentElement.scrollWidth<=innerWidth+1;'));
    report.results['chapter5 v5: task '+n+' '+language+' '+name]={passed:true};
  }await page.evaluate('lang.getState().setLanguage("de");theme.getState().setTheme("graphite-dark");');};
  const open=async point=>{await menu();await click('[data-alternative-direct]');assert.deepEqual(await page.evaluate('return [...document.querySelectorAll("[data-alternative-entry-choice]")].filter(e=>e.getClientRects().length).map(e=>e.dataset.alternativeEntryChoice);'),['beginning','part-2','part-3']);await click('[data-alternative-entry-choice="'+point+'"]');await step(point==='beginning'?1:point==='part-2'?7:14);await saved();};
  const visualHelp=async n=>{
    for(const language of ['de','en','pt-BR'])for(const themeName of ['graphite-dark','classic-light']){
      await page.evaluate(`lang.getState().setLanguage(${JSON.stringify(language)});theme.getState().setTheme(${JSON.stringify(themeName)});`);await delay(80);
      assert(await page.evaluate(`const p=document.querySelector('[data-alternative-step]'),button=p.querySelector('[data-guided-image]'),help=p.querySelector('[data-alternative-help]');return !help.open&&!!button&&(${n}===11?button.closest('details')===help&&!button.checkVisibility():!button.closest('details')&&button.checkVisibility())&&!p.querySelector('[data-alternative-entry]');`));
      const nodes=await page.evaluate('return store.getState().nodes.map(n=>({id:n.id,position:n.position}));');
      if(n===11)await click('[data-alternative-help] > summary');
      await click('[data-guided-image]');await wait('document.querySelector("[data-guided-image-dialog] img")?.naturalWidth===1672');
      assert(await page.evaluate(`return document.querySelector('[data-guided-image-dialog] img').src.includes(${JSON.stringify('rota-estatica-'+language+'.png')});`));
      if(language==='de'&&themeName==='graphite-dark')await shot('visual-etapa-'+n+'-aberta');
      await click('[data-guided-image-zoom]');assert(await page.evaluate('return document.querySelector("[data-guided-image-zoom]").getAttribute("aria-pressed")==="true";'));
      await key('Escape');await wait('!document.querySelector("[data-guided-image-dialog]")');assert(await page.evaluate('return document.activeElement===document.querySelector("[data-guided-image]");'));
      assert.deepEqual(await page.evaluate('return store.getState().nodes.map(n=>({id:n.id,position:n.position}));'),nodes);
      if(n===11)await click('[data-alternative-help] > summary');
      report.results['chapter5 visual help: '+n+' '+language+' '+themeName]={passed:true};
    }
    await page.evaluate('lang.getState().setLanguage("de");theme.getState().setTheme("graphite-dark");');
    await shot('visual-etapa-'+n+'-recolhida');
  };
  const routes=async()=>{
    assert.doesNotMatch(await command(I.a,'ping -c 1 192.168.20.20',true),/64 bytes from/);assert(await page.evaluate('return !!document.querySelector("[data-alternative-investigation=missing-route]");'));await next(8);
    await visualHelp(8);await command(I.r1,'ip route add 192.168.20.0/24 via 10.0.12.2');await click('[data-guided-image]');await next(9);assert(await page.evaluate('return !document.querySelector("[data-guided-image-dialog]");'));await visualHelp(9);await command(I.r2,'ip route add 192.168.20.0/24 via 10.0.23.2');await next(10);
    assert(await page.evaluate('return !document.querySelector("[data-alternative-investigation]");'));assert.doesNotMatch(await command(I.a,'ping -c 1 192.168.20.20',true),/64 bytes from/);assert(await page.evaluate('return !!document.querySelector("[data-alternative-investigation=missing-return]");'));await next(11);
    await visualHelp(11);await command(I.r3,'ip route add 192.168.10.0/24 via 10.0.23.1');await next(12);await command(I.r2,'ip route add 192.168.10.0/24 via 10.0.12.1');
    assert.match(await command(I.a,'ping -c 1 192.168.20.20',true),/64 bytes from/);assert.match(await command(I.b,'ping -c 1 192.168.10.10',true),/64 bytes from/);await next(13);await answer('hop','r2');await passed();
    assert(await page.evaluate('return !sim.net.devices.get("tutorial-05-r3").getInterface("eth3").ip&&sim.net.devices.size===5&&sim.net.links.get("tutorial-05-23").operational;'));await reloadAt(13);await next(14);
  };
  const recover=async(method,capture=false)=>{
    await wait('document.querySelector("[data-alternative-storm=down]")');await saved();const initial=await receipt();assert.equal(initial.progress.storm,'applied');assert.equal(initial.document.topology.devices.length,5);assert(!initial.progress.failure);assert.equal(initial.document.topology.devices.find(d=>d.id===I.r2).ifaces.find(i=>i.name==='eth1').up,false);
    await variants(14);if(capture)await shot('02-parte3-tempestade');await reloadAt(14);assert(await page.evaluate('return !document.querySelector("[data-alternative-failure-explanation]");'));
    assert.doesNotMatch(await command(I.a,'ping -c 1 192.168.20.20',true),/64 bytes from/);await passed();assert(await page.evaluate('return !!document.querySelector("[data-alternative-failure-explanation]");'));await next(15);await variants(15);
    assert(await page.evaluate('return document.querySelectorAll("[data-alternative-recovery]").length===2&&!/10\.0\.13\.[12]/.test(document.querySelector("[data-alternative-step]").innerText);'));
    await command(I.r1,'ip route add 192.168.20.20/32 via 10.0.13.2');await command(I.r3,'ip route replace 192.168.10.0/24 via 10.0.13.1');assert.match(await command(I.a,'ping -c 1 192.168.20.20',true),/64 bytes from/);assert(await page.evaluate('return document.querySelector("[data-alternative-next]").disabled;'));await command(I.r1,'ip route del 192.168.20.20/32');
    if(method==='del-add'){await command(I.r1,'ip route del 192.168.20.0/24');await command(I.r1,'ip route add 192.168.20.0/24 via 10.0.13.2');}else await command(I.r1,'ip route replace 192.168.20.0/24 via 10.0.13.2');
    if(capture)await shot('03-recuperacao-dois-checkpoints');await passed();await next(16);await variants(16);
    await page.evaluate('window.wires=[];window.releaseWire?.();window.releaseWire=(await import("/src/networkObservations.ts")).observeNetworkActivity(e=>{if(e.kind==="icmp")wires.push({direction:e.direction,from:e.from,to:e.to});});');
    assert.match(await command(I.a,'ping -c 1 192.168.20.20',true),/64 bytes from/);assert(await page.evaluate('return !document.querySelector("[data-alternative-passed=true]");'));
    assert.match(await command(I.b,'ping -c 1 192.168.10.10',true),/64 bytes from/);await passed();await saved();
    assert(await page.evaluate('return wires.some(e=>e.from==="tutorial-05-r1"&&e.to==="tutorial-05-r3")&&wires.some(e=>e.from==="tutorial-05-r3"&&e.to==="tutorial-05-r1")&&!wires.some(e=>e.from==="tutorial-05-r2"||e.to==="tutorial-05-r2");'));
    const complete=await receipt();assert.deepEqual(complete.progress.completed,Array.from({length:17-(complete.progress.entry?.firstTask??1)},(_,i)=>i+(complete.progress.entry?.firstTask??1)));await reloadAt(16);return complete;
  };
  try{
    await page.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await mount();await page.evaluate('theme.getState().setTheme("graphite-dark");store.getState().setTerminalDockCollapsed(true);');
    let oldSnapshot;
    await test('old drafts/history/pointers are preserved as independent networks, without menu errors or automation',async()=>{
      oldSnapshot=await page.evaluate('const id=ws.controller.getState().activeDraftId,keys=["guided:alternative-paths:v1:draft:"+id,"guided:chapter-completion:v1:alternative-paths","guided:current-attempt:v1:alternative-paths"];for(const key of keys){const r=await ws.repository.setMeta({key,expectedRevision:null,value:{chapterVersion:4,chapterId:"alternative-paths",step:20,storm:"pending"}});if(!r.ok)throw Error(r.error.code);}await ws.controller.flush();return {id,document:store.getState().captureWorkspaceDocument(),keys};');await mount(true);await delay(200);assert(await page.evaluate('return !document.querySelector("[data-alternative-step]");'));assert.deepEqual((await receipt()).document,oldSnapshot.document);
      await menu();assert(await page.evaluate('return !!document.querySelector("[data-alternative-indicator=not-started]")&&!document.querySelector(".guided-tutorial-menu [role=alert]");'));await click('[data-alternative-direct]');await shot('01-menu-tres-entradas');await key('Escape');await key('Escape');
    });
    await test('complete real 16-task sequence and historic review without recapturing the baseline',async()=>{
      await open('beginning');
      for(let index=0;index<3;index++){const rows=await page.evaluate('return chapter.TRANSIT_PLAN.slice('+index*2+','+(index*2+2)+');');for(const r of rows)assert.equal(await command(r.device,'ip address add '+r.address+' dev '+r.iface),'');const tests=await page.evaluate('return chapter.NEIGHBOR_TESTS.slice('+index*2+','+(index*2+2)+');');for(const t of tests)assert.match(await command(t.from,'ping -c 1 '+t.target,true),/64 bytes from/);await next(index+2);}
      await answer('remote','23');await next(5);for(const [id,address]of [[I.r1,'192.168.10.1/24'],[I.a,'192.168.10.10/24']])await command(id,'ip address add '+address+' dev '+(id===I.a?'eth0':'eth2'));await configureGateway(I.a,'192.168.10.1');await next(6);await variants(6);
      for(const [id,address]of [[I.r3,'192.168.20.1/24'],[I.b,'192.168.20.20/24']])await command(id,'ip address add '+address+' dev '+(id===I.b?'eth0':'eth2'));await configureGateway(I.b,'192.168.20.1');await next(7);await routes();const baseline=(await receipt()).progress.viaBaseline;
      const done=await recover('replace',true);await shot('05-conclusao-integral-16');assert(await page.evaluate('return !!document.querySelector("[data-chapter-finished]");'));
      for(let i=0;i<4;i++)await click('.exercise-panel footer button','Zurück');await step(12);assert(await page.evaluate('return !!document.querySelector("[data-alternative-history]");'));await next(13);await next(14);assert.equal((await receipt()).progress.viaBaseline,baseline);assert.equal((await receipt()).progress.storm,'applied');assert.deepEqual((await receipt()).progress.directReplies,done.progress.directReplies);await next(15);await next(16);
      await menu();assert(await page.evaluate('return !!document.querySelector("[data-alternative-indicator=complete]")&&document.querySelector("[data-alternative-practice-progress]").innerText.includes("16/16");'));await shot('07-conclusao-integral-contador-16');await key('Escape');
    });
    for(const point of ['part-2','part-3'])await test(point+' practice, exact restart, F5 and Undo/Redo without false integral credit',async()=>{
      await open(point);const initial=await receipt();assert.deepEqual(initial.progress.completed,[]);if(point==='part-2')await routes();const done=await recover('del-add');
      assert(await page.evaluate('return !document.querySelector("[data-chapter-finished]")&&document.querySelector("[data-alternative-practice-finished]").innerText.includes('+JSON.stringify(point==='part-2'?'10/10':'3/3')+');'));if(point==='part-3')await shot('04-conclusao-parcial-3');
      await click('[data-chapter-restart=alternative-paths]');await wait('document.querySelector("[data-chapter-restart-confirm]:not(:disabled)")');await click('[data-chapter-restart-confirm]');await step(point==='part-2'?7:14);if(point==='part-3')await wait('document.querySelector("[data-alternative-storm=down]")');await saved();assert.deepEqual((await receipt()).progress.completed,[]);
      for(let i=0;i<(point==='part-3'?2:1);i++){await page.evaluate('store.getState().undoTopology();');await delay(180);}await step(16);await saved();assert.deepEqual((await receipt()).progress,done.progress);
      await page.evaluate('store.getState().redoTopology();');await step(point==='part-2'?7:14);await saved();if(point==='part-3'){assert(await page.evaluate('return sim.net.devices.get("tutorial-05-r2").getInterface("eth1").up;'));await page.evaluate('store.getState().redoTopology();');await wait('document.querySelector("[data-alternative-storm=down]")');await reloadAt(14);await command(I.r2,'ip link set eth1 up');await reloadAt(14);assert(await page.evaluate('return sim.net.devices.get("tutorial-05-r2").getInterface("eth1").up;'));}
    });
    await test('compact keyboard menu, languages/themes, original metadata and personal topology remain intact',async()=>{
      await page.send('Emulation.setDeviceMetricsOverride',{width:700,height:1000,deviceScaleFactor:1,mobile:false});await delay(250);await menu();await click('[data-alternative-direct]');assert.equal(await page.evaluate('return document.querySelectorAll("[data-alternative-entry-choice]").length;'),3);await shot('06-menu-compacto');await key('Escape');assert(await page.evaluate('return !document.querySelector("[data-alternative-entry-compact]");'));await key('Escape');
      await page.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
      for(const language of ['de','en','pt-BR']){await page.evaluate('lang.getState().setLanguage('+JSON.stringify(language)+');');await delay(80);assert(await page.evaluate('return !document.querySelector(".exercise-panel").innerText.includes("guidedAlternative.");'));}
      await page.evaluate('const result=await ws.controller.switchDraft('+JSON.stringify(oldSnapshot.id)+');if(!result.ok)throw Error(result.error.code);');await delay(200);assert.deepEqual((await receipt()).document,oldSnapshot.document);assert(await page.evaluate('return !document.querySelector("[data-alternative-step]");'));
      for(const key of oldSnapshot.keys)assert.deepEqual(await page.evaluate('return (await ws.repository.getMeta('+JSON.stringify(key)+')).value.value;'),{chapterVersion:4,chapterId:'alternative-paths',step:20,storm:'pending'});
    });
    report.alternativePathsReview={folder:directory,edition:5,tasks:16};
  }finally{await page.evaluate('window.releaseWire?.();window.releaseObserver?.();window.ws?.dispose();');await page.evaluate('await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase('+JSON.stringify(database)+');r.onsuccess=resolve;r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error("Database blocked"));});');}
}
