import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { generateReview } from './visual-review.mjs';

export async function runAlternativePathsReview({ page, url, root, report }) {
  const database = 'netlab-idb-test-' + crypto.randomUUID(), directory = path.join(root, '.playwright-mcp/reviews/raw/alternative-paths-staging');
  await mkdir(directory, { recursive: true });
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const wait = async condition => { for (let i = 0; i < 300; i++) { if (await page.evaluate(`return !!(${condition});`)) return; await delay(40); } throw Error('Alternative paths: ' + condition); };
  const click = async (selector, text) => {
    const p = await page.evaluate(`const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.getClientRects().length&&(${text ? `e.textContent.trim()===${JSON.stringify(text)}` : 'true'}));if(!e)throw Error('Missing '+${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};`);
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, ...p, ...(type === 'mouseMoved' ? {} : { button: 'left', clickCount: 1 }) }); await delay(100);
  };
  const mount = async (reload = false) => {
    await page.send(reload ? 'Page.reload' : 'Page.navigate', reload ? { ignoreCache: true } : { url }); await wait("document.readyState==='complete'&&document.getElementById('root')");
    await page.evaluate(`window.store=(await import('/src/store.ts')).useStore;window.sim=(await import('/src/sim.ts')).sim;window.lang=(await import('/src/i18n/index.ts')).useLanguage;window.theme=(await import('/src/uiTheme.ts')).useUiTheme;window.chapter=await import('/src/tutorials/alternativePathsChapter.ts');window.records=[];window.releaseObserver=(await import('/src/terminalCommandEvents.ts')).observeTerminalCommands(e=>records.push({type:e.type,deviceId:e.command.deviceId,line:e.command.line,source:e.command.source,text:e.text}));lang.getState().setLanguage('de');window.ws=await(await import('/src/workspace/reviewEntry.tsx')).mountWorkspaceReview(document.getElementById('root'),{databaseName:${JSON.stringify(database)}});`);
    await wait("document.querySelector('.react-flow')"); await delay(200);
  };
  const menu = async () => { if (await page.evaluate('return innerWidth<1100;')) await click('.toolbar-menu-trigger', 'Menü'); await click('.toolbar-menu-trigger,.toolbar-menu-action', 'Übungen (Beta)'); await click('[data-guided-menu-toggle]'); await wait("document.querySelector('[data-alternative-direct]:not(:disabled)')"); };
  const saved = async () => { await wait("document.querySelector('[data-alternative-saving=false]')"); await page.evaluate('await ws.controller.flush();'); };
  const receipt = () => page.evaluate("const id=ws.controller.getState().activeDraftId;return {id,document:store.getState().captureWorkspaceDocument(),progress:(await ws.repository.getMeta('guided:alternative-paths:v1:draft:'+id)).value?.value,tabs:ws.controller.getState().drafts.length};");
  const step = n => wait(`document.querySelector('[data-alternative-step="${n}"]')`), passed = () => wait("document.querySelector('[data-alternative-passed=true]')");
  const minimalPanel = async n => {
    assert(await page.evaluate(`const p=document.querySelector('[data-alternative-step]'),h=p.querySelector('[data-alternative-help]');return p.querySelectorAll('details').length<=1&&!p.querySelector('[data-alternative-condition],[data-alternative-more-help],[data-alternative-address-plan]')&&(!h||!h.open)&&([6,7,11,12,20].includes(${n})?!h:!!h)&&![...p.querySelectorAll(':scope > p')].some(e=>/Abgeschlossen, wenn|Complete when|Concluído quando/.test(e.textContent));`));
  };
  const next = async n => { await wait("document.querySelector('[data-alternative-next]:not(:disabled)')"); await click('[data-alternative-next]'); await step(n); await saved(); await minimalPanel(n); };
  const answer = async (kind, value) => { await page.evaluate(`const input=document.querySelector('[data-alternative-answer=${kind}]');input.value=${JSON.stringify(value)};input.dispatchEvent(new Event('change',{bubbles:true}));`); await delay(120); };
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
  const shot = async (name, state, width = 1440, variant = 'graphite-dark') => {
    if (await page.evaluate("return !!document.querySelector('.ping-animation-close');")) await click('.ping-animation-close');
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 100, y: 20 }); await delay(320);
    const png = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); await writeFile(path.join(directory, name + '.png'), Buffer.from(png.data, 'base64'));
    return { source: path.relative(root, path.join(directory, name + '.png')).split(path.sep).join('/'), scene: name, state, width, height: 1000, variant };
  };
  const reloadAt = async n => { await saved(); const before = await receipt(); await mount(true); await step(n); await saved(); assert.deepEqual(await receipt(), before); };
  const test = async (name, work) => { try { await work(); report.results['alternative paths: ' + name] = { passed: true }; } catch (e) { report.results['alternative paths: ' + name] = { passed: false, error: e.stack, visible: await page.evaluate('return document.querySelector(".exercise-panel")?.textContent;') }; throw e; } };
  const I = { r1: 'tutorial-05-r1', r2: 'tutorial-05-r2', r3: 'tutorial-05-r3', a: 'tutorial-05-a', b: 'tutorial-05-b' };
  let personal, original, attempt, legacyNeighborHash, pcC;
  const captures = [];
  const capturePanel = async (name, state, width = 1440, variant = 'graphite-dark') => {
    await page.evaluate('store.getState().setTerminalDockCollapsed(true);'); await delay(180);
    captures.push(await shot(name, state, width, variant));
  };
  try {
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }); await mount();
    await page.evaluate("theme.getState().setTheme('graphite-dark');store.getState().addDeviceAt('host',{x:300,y:200});store.getState().setTerminalLayoutMode('by-type');store.getState().setTerminalDockCollapsed(true);await ws.controller.flush();"); personal = await receipt();
    await test('independent unconfigured triangle, one scenario counter and collapsed contextual help', async () => {
      await menu(); assert.equal(await page.evaluate('return document.querySelector("[data-alternative-direct]").textContent;'), 'Kapitel starten'); await click('[data-alternative-direct]'); await step(1); await saved(); attempt = (await receipt()).id; assert.notEqual(attempt, personal.id);
      assert(await page.evaluate("return sim.net.devices.size===3&&sim.net.links.size===3&&[...sim.net.devices.values()].every(d=>d.kind==='router'&&d.interfaces.every(i=>!i.ip))&&store.getState().terminalLayoutMode==='by-type';"));
      assert(await page.evaluate("return document.querySelector('.guided-scenario').textContent.includes('Nachbarn verbinden')&&document.querySelector('.guided-step-progress').textContent.includes('Schritt 1 von 4')&&!document.querySelector('[data-alternative-help]').open;"));
      await minimalPanel(1);
      assert(await page.evaluate("const p=document.querySelector('[data-alternative-step]');return p.innerText.includes('R1 eth0 (10.0.12.1/30)')&&p.innerText.includes('R2 eth0 (10.0.12.2/30)')&&!p.querySelector('[data-alternative-passed] [role=status]');"));
      await capturePanel('01-neighbours-initial', 'initial');
      await click('[data-alternative-help] > summary');
      assert(await page.evaluate("const h=document.querySelector('[data-alternative-help]');return !h.querySelector('details')&&h.innerText.includes('ip address add')&&h.innerText.includes('/30')&&!h.innerText.includes('ip route add');"));
      await capturePanel('02-first-link-help', 'help');
    });
    await test('three progressive links preserve earlier real bidirectional proofs across addressing and F5', async () => {
      for (let index = 0; index < 3; index++) {
        const rows = await page.evaluate(`return chapter.TRANSIT_PLAN.slice(${index * 2},${index * 2 + 2});`);
        for (const row of rows) assert.equal(await command(row.device, `ip address add ${row.address} dev ${row.iface}`), '');
        assert(await page.evaluate("return !document.querySelector('[data-alternative-passed=true]');"));
        const tests = await page.evaluate(`return chapter.NEIGHBOR_TESTS.slice(${index * 2},${index * 2 + 2});`);
        assert.match(await command(tests[0].from, `ping -c 1 ${tests[0].target}`, true), /64 bytes from/);
        if (index === 0) await reloadAt(1);
        assert.match(await command(tests[1].from, `ping ${tests[1].target} -c 1`, true), /64 bytes from/); await passed(); await next(index + 2);
        await minimalPanel(index+2);
      }
      assert(await page.evaluate('return [...sim.net.devices.values()].every(d=>d.staticRoutes.length===0);'));
      assert.match(await command(I.r1, 'ip route'), /10\.0\.12\.0\/30.*proto kernel/);
      assert.match(await command(I.r1, 'ping -c 1 10.0.23.2', true), /Network is unreachable/);
      assert(await page.evaluate("return !document.querySelector('[data-alternative-feedback]');"));
      await click('[data-alternative-help] > summary');
      assert(await page.evaluate("const h=document.querySelector('[data-alternative-help]');return h.querySelectorAll('table').length===1&&!h.querySelector('details')&&h.innerText.includes('proto kernel scope link')&&h.innerText.includes('10.0.12.0/30');"));
      await capturePanel('03-connected-question', 'question');
      await answer('remote', '12'); assert(await page.evaluate("return !document.querySelector('[data-alternative-passed=true]');")); await answer('remote', '23'); await passed(); original = (await receipt()).document.topology;
      assert(await page.evaluate("return !!document.querySelector('[data-alternative-feedback=remote]');"));
      legacyNeighborHash = await page.evaluate("return (await import('/src/tutorials/tutorialProgress.ts')).tutorialFingerprint(chapter.neighborSignature(sim.net));");
    });
    await test('LANs configure separately while identities, router positions and prior settings survive', async () => {
      await page.evaluate(`store.getState().onNodesChange([{id:${JSON.stringify(I.r2)},type:'position',position:{x:930,y:100},dragging:false}]);`); await saved(); original = (await receipt()).document.topology;
      await next(5); const now = (await receipt()).document.topology;
      assert.equal(now.devices.length, 5); assert.equal(now.links.length, 5); assert.deepEqual(now.devices.filter(d => original.devices.some(old => old.id === d.id)), original.devices);
      await click('.exercise-panel footer button', 'Zurück'); await step(4); await next(5); await reloadAt(5); assert.equal(await page.evaluate('return sim.net.devices.size;'), 5);
      for (const [id, address] of [[I.r1,'192.168.10.1/24'],[I.a,'192.168.10.10/24']]) assert.equal(await command(id, `ip address add ${address} dev ${id === I.a ? 'eth0' : 'eth2'}`), '');
      await configureGateway(I.a, '192.168.10.1'); await passed(); await next(6);
      assert(await page.evaluate("return !document.querySelector('[data-alternative-passed=true]');"));
      for (const [id, address] of [[I.r3,'192.168.20.1/24'],[I.b,'192.168.20.20/24']]) assert.equal(await command(id, `ip address add ${address} dev ${id === I.b ? 'eth0' : 'eth2'}`), '');
      await configureGateway(I.b, '192.168.20.1'); await passed(); await next(7);
    });
    await test('forward routes, new diagnostic pings, return routes and actual bidirectional paths progress independently', async () => {
      assert.doesNotMatch(await command(I.a,'ping -c 1 192.168.20.20',true),/64 bytes from/); await passed();
      assert(await page.evaluate('return document.querySelector("[data-alternative-investigation=missing-route]")?.textContent.includes("192.168.20.0/24");'));
      for(const language of ['en','pt-BR','de']){
        await page.evaluate('(await import("/src/i18n/index.ts")).useLanguage.getState().setLanguage('+JSON.stringify(language)+');');await delay(50);
        assert(await page.evaluate('return document.querySelector("[data-alternative-investigation=missing-route]").textContent.includes("192.168.20.0/24");'));
      }
      await next(8);
      assert.equal(await command(I.r1,'ip route add 192.168.20.0/24 via 10.0.12.2'),''); await passed(); await next(9);
      assert.equal(await command(I.r2,'ip route add 192.168.20.0/24 via 10.0.23.2'),''); await passed(); await next(10);
      assert(await page.evaluate("return !document.querySelector('[data-alternative-passed=true]');"));
      assert.doesNotMatch(await command(I.a,'ping -c 1 192.168.20.20',true),/64 bytes from/); await passed(); await reloadAt(10); await capturePanel('04-return-investigation','diagnosis'); await next(11);
      assert.equal(await command(I.r3,'ip route add 192.168.10.0/24 via 10.0.23.1'),''); await passed(); await next(12);
      assert.equal(await command(I.r2,'ip route add 192.168.10.0/24 via 10.0.12.1'),'');
      assert(await page.evaluate("return document.querySelector('[data-alternative-proven-path]').dataset.alternativeProvenPath==='expected';"));
      assert.match(await command(I.a,'ping -c 1 192.168.20.20',true),/64 bytes from/); assert(await page.evaluate("return !document.querySelector('[data-alternative-passed=true]');"));
      assert.match(await command(I.b,'ping -c 1 192.168.10.10',true),/64 bytes from/); await passed();
      assert(await page.evaluate("return document.querySelector('[data-alternative-proven-path]').dataset.alternativeProvenPath==='verified';")); await next(13);
      assert(await page.evaluate("return !document.querySelector('[data-alternative-feedback]');"));
      await answer('hop','r3'); assert(await page.evaluate("return !document.querySelector('[data-alternative-passed=true]');")); await answer('hop','r2'); await passed(); await next(14);
    });
    await test('old step 14 migrates without replacing the network; PC C is created by dragging and survives F5', async()=>{
      await wait("sim.net.devices.get('tutorial-05-r3').getInterface('eth3').ip?.prefix===25&&!document.querySelector('[data-alternative-saving=true]')");
      const before=await receipt();
      await page.evaluate("const id=ws.controller.getState().activeDraftId,key='guided:alternative-paths:v1:draft:'+id,entry=(await ws.repository.getMeta(key)).value,p=structuredClone(entry.value);p.chapterVersion=2;p.step=14;p.completed=Array.from({length:13},(_,i)=>i+1);p.lpmUnderstood=false;p.viaBaseline=null;delete p.lpm;const result=await ws.repository.setMeta({key,expectedRevision:entry.revision,value:p});if(!result.ok)throw Error(result.error.code);");
      await mount(true);await step(14);await saved();
      assert.deepEqual((await receipt()).document,before.document);assert.equal((await receipt()).progress.chapterVersion,3);
      assert.equal((await receipt()).progress.lpm.pc,null);assert.equal((await receipt()).document.topology.devices.length,5);
      await page.evaluate("store.getState().setHostCreationMode('linux');store.getState().setTerminalDockCollapsed(true);store.getState().select(null);");
      const drop=await page.evaluate("const r=document.querySelector('.react-flow').getBoundingClientRect();for(let y=r.bottom-130;y>r.top+20;y-=40)for(let x=r.right-180;x>r.left+20;x-=40)if(document.elementFromPoint(x,y)?.classList.contains('react-flow__pane'))return{x,y};throw Error('No canvas drop target');");
      for(const type of ['dragEnter','dragOver','drop'])await page.send('Input.dispatchDragEvent',{type,...drop,data:{items:[{mimeType:'application/netsim',data:'host'}],dragOperationsMask:16}});
      await wait('sim.net.devices.size===6');
      pcC=await page.evaluate('return store.getState().nodes.at(-1).id;');
      assert.equal((await receipt()).progress.lpm.pc,null);await reloadAt(14);
      await page.evaluate('store.getState().onConnect({source:'+JSON.stringify(pcC)+',target:"tutorial-05-r3",targetHandle:"eth3"});');
      await wait('(document.querySelector("[data-alternative-saving=false]")&&sim.net.devices.get("tutorial-05-r3").getInterface("eth3").link)');await saved();
      assert.equal((await receipt()).progress.lpm.pc.id,pcC);
      assert.equal(await command(pcC,'ip address add 192.168.30.130/24 dev eth0'),'');await configureGateway(pcC,'192.168.30.129');
      assert(await page.evaluate('return !document.querySelector("[data-alternative-passed=true]");'));
      await command(pcC,'ip address del 192.168.30.130/24 dev eth0');await command(pcC,'ip address add 192.168.30.130/25 dev eth0');await configureGateway(pcC,'192.168.30.129');await passed();
      await reloadAt(14);await capturePanel('05a-lan-c','question');await next(15);
      await command(I.b,'ping -c 1 192.168.30.129',true);assert(await page.evaluate('return !document.querySelector("[data-alternative-passed=true]");'));
      assert.match(await command(pcC,'ping -c 1 192.168.30.129',true),/64 bytes from/);await passed();await reloadAt(15);await next(16);
    });
    await test('both routes to LAN C are real and LPM chooses /25 with a different return path',async()=>{
      await command(I.r2,'ip route add 192.168.30.128/25 via 10.0.23.2');await command(I.r1,'ip route add 192.168.30.0/24 via 10.0.12.2');
      await page.evaluate("window.lpmWires=[];window.releaseLpm=(await import('/src/networkObservations.ts')).observeNetworkActivity(e=>{if(e.kind==='icmp')lpmWires.push({from:e.from,to:e.to,direction:e.direction,source:e.source,destination:e.destination});});");
      assert.match(await command(I.a,'ping -c 1 192.168.30.130',true),/64 bytes from/);
      assert.deepEqual(await page.evaluate('return lpmWires.filter(e=>e.direction==="request").map(e=>[e.from,e.to]);'),[[I.a,I.r1],[I.r1,I.r2],[I.r2,I.r3],[I.r3,pcC]]);
      assert(await page.evaluate('return !document.querySelector("[data-alternative-passed=true]");'));
      await command(I.r1,'ip route add 192.168.30.128/25 via 10.0.13.2');await passed();await capturePanel('05b-two-routes','help');await next(17);
      assert(await page.evaluate('return !document.querySelector("[data-alternative-answer=lpm]");'));
      await command(I.b,'ping -c 1 192.168.30.130',true);assert(await page.evaluate('return !document.querySelector("[data-alternative-answer=lpm]");'));
      await page.evaluate('lpmWires=[];');assert.match(await command(I.a,'ping -c 1 192.168.30.130',true),/64 bytes from/);
      const expectedRequest=[[I.a,I.r1],[I.r1,I.r3],[I.r3,pcC]],expectedReply=[[pcC,I.r3],[I.r3,I.r2],[I.r2,I.r1],[I.r1,I.a]];
      assert.deepEqual(await page.evaluate('return lpmWires.filter(e=>e.direction==="request").map(e=>[e.from,e.to]);'),expectedRequest);
      assert.deepEqual(await page.evaluate('return lpmWires.filter(e=>e.direction==="reply").map(e=>[e.from,e.to]);'),expectedReply);
      await wait('document.querySelector("[data-alternative-answer=lpm]")');
      assert((await receipt()).progress.viaReplies.ab);assert.equal((await receipt()).progress.lpm.pc.id,pcC);
      await answer('lpm','cables');assert(await page.evaluate('return !document.querySelector("[data-alternative-passed=true]");'));await answer('lpm','specific');await passed();
      await reloadAt(17);
      for(const language of ['en','pt-BR','de']){await page.evaluate('lang.getState().setLanguage('+JSON.stringify(language)+');');await delay(100);assert(await page.evaluate('return document.querySelector("[data-alternative-feedback=lpm]").textContent.includes("/25")&&document.querySelector("[data-lpm-path=reply]").textContent.includes("R2");'));}
      await click('[data-alternative-help] > summary');assert(await page.evaluate('return document.querySelector("[data-alternative-selected-route=true]").textContent.includes("192.168.30.128/25");'));
      await capturePanel('05-lpm-live-table','explanation');
      await page.send('Emulation.setDeviceMetricsOverride',{width:700,height:1000,deviceScaleFactor:1,mobile:false});await page.evaluate("theme.getState().setTheme('classic-light');");await delay(180);
      assert(await page.evaluate('return document.documentElement.scrollWidth<=innerWidth+1;'));await capturePanel('05c-lpm-light-mobile','explanation',700,'classic-light');
      await page.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await page.evaluate("theme.getState().setTheme('graphite-dark');");await delay(180);
      await page.evaluate('window.releaseLpm?.();');await next(18);
    });
    await test('failure is witnessed without automatic failover and preservation warning appears only after a mismatch', async () => {
      assert(await page.evaluate("return !document.querySelector('[data-alternative-failure-mismatch]');"));
      assert.equal(await command(I.r2,'ip link set eth1 down'),'');
      assert.equal(await command(I.r2,'ip route add 203.0.113.0/24 via 10.0.12.1'),'');
      await wait("document.querySelector('[data-alternative-failure-mismatch]')");
      assert.equal(await command(I.r2,'ip route del 203.0.113.0/24'),'');
      assert.doesNotMatch(await command(I.a,'ping -c 1 192.168.20.20',true),/64 bytes from/); await passed(); await reloadAt(18);
      await capturePanel('06-link-failure','failure'); await next(19);
    });
    await test('manual direct routes and fresh bidirectional proof complete all twenty tasks', async () => {
      assert.equal(await command(I.r1,'ip route replace 192.168.20.0/24 via 10.0.13.2'),''); assert.doesNotMatch(await command(I.a,'ping -c 1 192.168.20.20',true),/64 bytes from/);
      assert.equal(await command(I.r3,'ip route replace 192.168.10.0/24 via 10.0.13.1'),''); await passed(); await next(20);
      assert.match(await command(I.a,'ping -c 1 192.168.20.20',true),/64 bytes from/); assert(await page.evaluate("return !document.querySelector('[data-alternative-passed=true]');"));
      assert.match(await command(I.b,'ping -c 1 192.168.10.10',true),/64 bytes from/); await passed(); await saved();
      assert.deepEqual((await receipt()).progress.completed,Array.from({length:20},(_,i)=>i+1));
      await capturePanel('07-alternative-completed','completed');
      const before = await receipt(); await click('[data-explore-network]'); await wait("!document.querySelector('[data-alternative-step]')"); assert.deepEqual(await receipt(),before);
      await menu(); await click('[data-alternative-resume]'); await step(20); await reloadAt(20); await passed();
    });
    await test('DE/EN/PT-BR, themes, three viewports and plan switches preserve the learning document', async () => {
      const intact = await receipt();
      for (const [language,title] of [['en','Chapter 5'],['pt-BR','Capítulo 5'],['de','Kapitel 5']]) {
        await page.evaluate(`lang.getState().setLanguage(${JSON.stringify(language)});`); await delay(120);
        assert(await page.evaluate(`return document.querySelector('.exercise-heading').textContent.includes(${JSON.stringify(title)})&&!document.querySelector('[data-alternative-step]').innerText.includes('guidedAlternative.');`));
      }
      const themes=await page.evaluate("return Object.keys((await import('/src/uiTheme.ts')).UI_THEMES);");
      for (const name of themes) { await page.evaluate(`theme.getState().setTheme(${JSON.stringify(name)});`); await delay(120); assert(await page.evaluate(`return document.documentElement.dataset.uiTheme===${JSON.stringify(name)};`)); }
      report.alternativePathsThemes=themes;
      await page.evaluate(`await ws.controller.switchDraft(${JSON.stringify(personal.id)});`); await wait("!document.querySelector('[data-alternative-step]')"); assert.deepEqual((await receipt()).document,personal.document);
      await menu(); await click('[data-alternative-resume]'); await step(20); await passed(); assert.equal((await receipt()).id,attempt);
      assert.deepEqual((await receipt()).document,intact.document);
      for (const [width,variant] of [[1024,'graphite-dark'],[700,'classic-light']]) {
        await page.send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false}); await page.evaluate(`theme.getState().setTheme(${JSON.stringify(variant)});`); await delay(180);
        assert(await page.evaluate('return document.documentElement.scrollWidth<=innerWidth+1;'));
        await capturePanel(width===700?'09-light-mobile':'08-dark-tablet','completed',width,variant);
      }
    });
    await test('checkpoint restart, undo/redo and new attempts preserve the personal project', async () => {
      await page.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false}); await page.evaluate("theme.getState().setTheme('graphite-dark');"); await delay(180);
      const before=await receipt(); await click('[data-chapter-restart=alternative-paths]'); await wait("document.querySelector('[data-chapter-restart-confirm]:not(:disabled)')"); await click('[data-chapter-restart-confirm]'); await step(1); await saved();
      assert(await page.evaluate('return sim.net.devices.size===3&&sim.net.links.size===3&&[...sim.net.devices.values()].every(d=>d.interfaces.every(i=>!i.ip)&&d.staticRoutes.length===0);')); assert.deepEqual((await receipt()).progress.completed,[]);
      await page.evaluate('store.getState().undoTopology();'); await step(20); await saved(); assert.deepEqual(await receipt(),before);
      await page.evaluate('store.getState().redoTopology();'); await step(1); await saved(); await reloadAt(1);
      await menu(); assert.equal(await page.evaluate('return document.querySelector("[data-alternative-direct]").textContent;'), 'Neuen Versuch starten'); await click('[data-alternative-direct]'); await step(1); await saved(); assert.notEqual((await receipt()).id,attempt); assert.equal((await receipt()).tabs,before.tabs+1);
    });
    const manifest=path.join(directory,'manifest.json');
    await writeFile(manifest,JSON.stringify({id:'chapter-5-minimal-instructions',title:'Kapitel 5 · Instruções e ajuda simplificadas',variants:[{id:'graphite-dark',label:'Graphite Dark'},{id:'classic-light',label:'Classic Light'}],states:['initial','help','question','diagnosis','explanation','failure','completed'],captures,share:captures.filter(c=>c.scene!=='08-dark-tablet').map(c=>({...c,name:c.scene.replace(/^\d+-/, '')})),shareContactSheet:false}));
    const references=path.join(root,'.playwright-mcp/reviews/chapter5-minimal/referencias-chatgpt'); await mkdir(references,{recursive:true});
    for (const [i,c] of captures.filter(c=>c.scene!=='08-dark-tablet').entries()) await writeFile(path.join(references,String(i+1).padStart(2,'0')+'-'+c.scene.replace(/^\d+-/, '')+'.png'),await readFile(path.join(root,c.source)));
    report.alternativePathsReview=await generateReview(manifest);
  } finally {
    await page.evaluate('window.releaseLpm?.();window.releaseObserver?.();window.ws?.dispose();'); await page.evaluate(`await new Promise((resolve,reject)=>{const request=indexedDB.deleteDatabase(${JSON.stringify(database)});request.onsuccess=resolve;request.onerror=()=>reject(request.error);request.onblocked=()=>reject(Error('Alternative chapter cleanup blocked'));});`);
  }
}
