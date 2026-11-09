import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { generateReview } from './visual-review.mjs';
import { reviewGuidedVisualHelp } from './guided-visual-help-review.mjs';

export async function runStaticRoutingReview({ page, url, root, report }) {
  const database = 'netlab-idb-test-' + crypto.randomUUID(), directory = path.join(root, '.playwright-mcp/reviews/raw/static-routing-staging');
  await mkdir(directory, { recursive: true });
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const wait = async condition => { for (let i = 0; i < 300; i++) { if (await page.evaluate(`return !!(${condition});`)) return; await delay(40); } throw Error('Static routing: ' + condition); };
  const click = async (selector, text) => {
    const point = await page.evaluate(`const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.getClientRects().length&&(${text ? `e.textContent.trim()===${JSON.stringify(text)}` : 'true'}));if(!e)throw Error('Missing '+${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};`);
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, ...point, ...(type === 'mouseMoved' ? {} : { button: 'left', clickCount: 1 }) });
    await delay(100);
  };
  const mount = async (reload = false) => {
    await page.send(reload ? 'Page.reload' : 'Page.navigate', reload ? { ignoreCache: true } : { url }); await wait("document.readyState==='complete'&&document.getElementById('root')");
    await page.evaluate(`window.store=(await import('/src/store.ts')).useStore;window.sim=(await import('/src/sim.ts')).sim;window.lang=(await import('/src/i18n/index.ts')).useLanguage;window.theme=(await import('/src/uiTheme.ts')).useUiTheme;window.chapter=await import('/src/tutorials/staticRoutingChapter.ts');window.records=[];window.releaseObserver=(await import('/src/terminalCommandEvents.ts')).observeTerminalCommands(e=>records.push({type:e.type,deviceId:e.command.deviceId,line:e.command.line,source:e.command.source,text:e.text}));lang.getState().setLanguage('de');window.ws=await(await import('/src/workspace/reviewEntry.tsx')).mountWorkspaceReview(document.getElementById('root'),{databaseName:${JSON.stringify(database)}});`);
    await wait("document.querySelector('.react-flow')"); await delay(200);
  };
  const menu = async () => { if (await page.evaluate('return innerWidth<1100;')) await click('.toolbar-menu-trigger', 'Menü'); await click('.toolbar-menu-trigger,.toolbar-menu-action', 'Übungen (Beta)'); await click('[data-guided-menu-toggle]'); await wait("document.querySelector('[data-static-direct]:not(:disabled)')"); };
  const saved = async () => { await wait("document.querySelector('[data-static-saving=false]')"); await page.evaluate('await ws.controller.flush();'); };
  const receipt = () => page.evaluate("const id=ws.controller.getState().activeDraftId;return {id,document:store.getState().captureWorkspaceDocument(),progress:(await ws.repository.getMeta('guided:static-routing:v1:draft:'+id)).value?.value,tabs:ws.controller.getState().drafts.length};");
  const step = n => wait(`document.querySelector('[data-static-step="${n}"]')`);
  const next = async n => { await wait("document.querySelector('[data-static-next]:not(:disabled)')"); await click('[data-static-next]'); await step(n); await saved();
    assert(await page.evaluate(`return !document.querySelector('[data-guided-image-dialog]')&&${[2,4].includes(n) ? "!!document.querySelector('[data-guided-image]')" : "!document.querySelector('[data-guided-image]')"};`));
    assert(await page.evaluate("return !document.querySelector('[data-static-help] details')&&!document.querySelector('[data-static-help][open]')&&!document.querySelector('[data-static-condition]');"));
  };
  const passed = () => wait("document.querySelector('[data-static-passed=true]')");
  const command = async (id, line, advance = false) => {
    await page.evaluate(`store.getState().terminals.filter(key=>key!==${JSON.stringify(id)}).forEach(key=>store.getState().closeTerminal(key));store.getState().openTerminal(${JSON.stringify(id)});window.commandStart=records.length;`);
    await wait("document.querySelector('.xterm-helper-textarea')"); await delay(80); await page.evaluate("document.querySelector('.xterm-helper-textarea').focus();"); await page.send('Input.insertText', { text: line });
    for (const type of ['keyDown', 'keyUp']) await page.send('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, ...(type === 'keyDown' ? { text: '\r', unmodifiedText: '\r' } : {}) });
    await wait(`records.slice(commandStart).some(e=>e.type==='started'&&e.deviceId===${JSON.stringify(id)}&&e.line===${JSON.stringify(line)})`);
    if (advance) { await page.evaluate('store.getState().setPaused(true);sim.net.scheduler.advanceTo(sim.net.now+6000);');await wait(`records.slice(commandStart).some(e=>e.type==='finished'&&e.deviceId===${JSON.stringify(id)}&&e.line===${JSON.stringify(line)})`); }
    await delay(150); return page.evaluate("return records.slice(commandStart).filter(e=>e.type==='output').map(e=>e.text).join('');");
  };
  const configure = async (id, name, address, gateway = null) => { await page.evaluate(`const ip=await import('/src/engine/ip.ts'),e=store.getState().setInterfaceIpv4(${JSON.stringify(id)},${JSON.stringify(name)},{mode:'static',ip:ip.parseCidr(${JSON.stringify(address)}),gateway:${gateway ? `ip.parseIp(${JSON.stringify(gateway)})` : 'null'},dns:null});if(e)throw Error(e);`); await delay(150); };
  const screenshot = async (name, state, width = 1440, variant = 'graphite-dark') => {
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 100, y: 20 }); await delay(350);
    const png = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); await writeFile(path.join(directory, name + '.png'), Buffer.from(png.data, 'base64'));
    return { source: path.relative(root, path.join(directory, name + '.png')).split(path.sep).join('/'), scene: name, state, width, height: 1000, variant };
  };
  const reloadAt = async n => { await saved(); const before = await receipt(); await mount(true); await step(n); await saved(); assert.deepEqual(await receipt(), before); };
  const test = async (name, work) => { try { await work(); report.results['static routing: ' + name] = { passed: true }; } catch (e) { report.results['static routing: ' + name] = { passed: false, error: e.stack, visible: await page.evaluate('return document.querySelector(".exercise-panel")?.textContent;') }; throw e; } };
  const fitLayout = async (name, checkPanel = false) => {
    // React Flow's ResizeObserver must commit the new canvas dimensions before
    // invoking the native Fit View control after a viewport change.
    await delay(250);
    await click('.react-flow__controls-fitview'); await delay(450);
    const layout = await page.evaluate("const box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};return {viewport:box(document.querySelector('.react-flow')),panel:box(document.querySelector('[data-exercise=guided-static-routing]')),nodes:[...document.querySelectorAll('.react-flow__node')].map(e=>({id:e.dataset.id,...box(e)})),transform:document.querySelector('.react-flow__viewport').style.transform};");
    const overlaps=(a,b)=>a.x<b.right&&a.right>b.x&&a.y<b.bottom&&a.bottom>b.y;
    (report.staticRoutingLayouts??={})[name]=layout;
    for(const node of layout.nodes) { assert(node.x>=layout.viewport.x-1&&node.right<=layout.viewport.right+1&&node.y>=layout.viewport.y-1&&node.bottom<=layout.viewport.bottom+1,`Fit View clips ${node.id}`); if(checkPanel)assert(!overlaps(node,layout.panel),`Panel overlaps ${node.id}`); }
    for(let i=0;i<layout.nodes.length;i++)for(let j=i+1;j<layout.nodes.length;j++)assert(!overlaps(layout.nodes[i],layout.nodes[j]),`Device overlap: ${layout.nodes[i].id}/${layout.nodes[j].id}`);
  };
  const A = 'tutorial-04-a', B = 'tutorial-04-b', C = 'tutorial-04-c', R1 = 'tutorial-04-r1', R2 = 'tutorial-04-r2', R3 = 'tutorial-04-r3';
  let personal, original, attempt, initial, lesson, expanded, completed, mobile, compact, arpRequest, arpReply, icmpFailure;
  try {
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }); await mount();
    await page.evaluate("theme.getState().setTheme('graphite-dark');store.getState().addDeviceAt('host',{x:300,y:200});await ws.controller.flush();"); personal = await receipt();
    await test('direct start isolates the personal plan and prepares only the seven initial devices', async () => {
      await menu(); assert.equal(await page.evaluate('return document.querySelector("[data-static-direct]").textContent;'), 'Kapitel starten'); await click('[data-static-direct]'); await step(1); await saved(); attempt = (await receipt()).id; assert.notEqual(attempt, personal.id);
      assert.equal(await page.evaluate('return sim.net.devices.size;'), 7); assert.equal(await page.evaluate('return chapter.staticRoutingConditions(sim.net).base;'), true);
      await page.evaluate("store.getState().setTerminalDockCollapsed(true);store.getState().select(null);"); await fitLayout('line-1440',true); initial = await screenshot('01-minimal-instruction', 'initial');
    });
    await test('native first failure, route inspection and optional progressive help on R1', async () => {
      assert(await page.evaluate("return !document.querySelector('[data-static-help]')&&!document.querySelector('[data-static-condition]')&&!document.querySelector('[data-static-passed] [role=status]');"));
      assert(await page.evaluate("return document.querySelector('.exercise-heading').textContent.includes('Schritt 1 von 8')&&!document.querySelector('.exercise-heading').textContent.includes('Aufgaben abgeschlossen');"));
      // Audit the exact first cold-cache ping, collecting the engine order
      // separately from the presentation. No scheduler/protocol is changed.
      await page.evaluate("store.getState().setPaused(true);store.getState().setPacketAnimationSpeed(0.25);window.arpAudit=[];const original=sim.net.onWireTransfer;sim.net.onWireTransfer=(t,c,v)=>{arpAudit.push({id:t.id,from:t.fromDeviceId,to:t.toDeviceId,start:t.start,end:t.end,kind:c.frame.payload.kind==='arp'?c.frame.payload.op:c.frame.payload.l4.kind==='icmp'?c.frame.payload.l4.msg.type:c.frame.payload.l4.kind,trace:v});original(t,c,v);};if([...sim.net.devices.values()].some(d=>d.arpTable?.size))throw Error('ARP cache must start empty');");
      assert.match(await command(A,'ping -c 1 192.168.20.20',true),/From 192\.168\.10\.1.*Destination Net Unreachable/);await passed();
      const audit=await page.evaluate('return arpAudit;'); assert.deepEqual(audit.map(t=>t.kind),['request','request','reply','reply','echo-request','echo-request','dest-unreachable','dest-unreachable']);
      for(let i=1;i<audit.length;i++)assert(audit[i].start>=audit[i-1].end);
      assert.equal(audit[2].trace.arpRequestTransferId,audit[1].id);
      report.staticRoutingArpAudit=audit;
      await page.evaluate('store.getState().replayGuidedPacket();store.getState().tick(1200);store.getState().toggleGuidedPlayback();store.getState().setTerminalDockCollapsed(true);');
      await wait(`document.querySelector('.packet-dot[data-transfer-id="${audit[1].id}"]')`);
      assert.deepEqual(await page.evaluate("return [...document.querySelectorAll('.packet-dot')].map(e=>Number(e.dataset.transferId));"),[audit[1].id]); arpRequest=await screenshot('04-arp-request-before-reply','arp');
      await page.evaluate('store.getState().toggleGuidedPlayback();store.getState().tick(800);store.getState().toggleGuidedPlayback();');
      await wait(`document.querySelector('.packet-dot[data-transfer-id="${audit[2].id}"]')`);
      assert.deepEqual(await page.evaluate("return [...document.querySelectorAll('.packet-dot')].map(e=>Number(e.dataset.transferId));"),[audit[2].id]); arpReply=await screenshot('05-arp-reply-after-delivery','arp');
      await page.evaluate('store.getState().toggleGuidedPlayback();store.getState().tick(3200);store.getState().toggleGuidedPlayback();');
      await wait(`document.querySelector('.packet-dot[data-transfer-id="${audit[6].id}"]')`);
      assert.deepEqual(await page.evaluate("return [...document.querySelectorAll('.packet-dot')].map(e=>Number(e.dataset.transferId));"),[audit[6].id]); icmpFailure=await screenshot('06-icmp-error-after-request','arp');
      await page.evaluate('store.getState().toggleGuidedPlayback();store.getState().tick(3000);'); await next(2);
      await reviewGuidedVisualHelp({ page, root, click, wait, delay });
      await click('[data-static-help] > summary');
      assert(await page.evaluate("const h=document.querySelector('[data-static-help]');return !h.querySelector('details')&&h.textContent.includes('scope link')&&h.textContent.includes('proto kernel')&&h.textContent.includes('Quell-IP-Adresse')&&!document.querySelector('[data-static-address-plan]');"));
      await page.evaluate('store.getState().setTerminalDockCollapsed(true);');lesson=await screenshot('02-route-table-help','help');
      await command(R1,'ip route');await command(R1,'ip route add 192.168.20.0/24 via 10.0.12.2');await passed();await next(3);await reloadAt(3);
    });
    await test('eight line steps: R2 timeout, forward routes and separate return routes',async()=>{
      assert.match(await command(A,'ping -c 1 192.168.20.20',true),/no answer yet/);await command(R2,'ip route');
      await page.evaluate("const e=document.querySelector('[data-static-missing]');e.value='r3';e.dispatchEvent(new Event('change',{bubbles:true}));");assert(await page.evaluate("return !document.querySelector('[data-static-passed=true]');"));
      await page.evaluate("const e=document.querySelector('[data-static-missing]');e.value='r2';e.dispatchEvent(new Event('change',{bubbles:true}));");await passed();await next(4);
      await page.evaluate('store.getState().setTerminalDockCollapsed(true);');
      assert(await page.evaluate("const h=document.querySelector('[data-static-help]');return !h.open&&document.querySelector('[data-guided-image]')?.textContent.includes('Bild ansehen');"));
      const staticButton = await screenshot('11-static-route-button','help');
      await click('[data-guided-image]');
      for (const [language,label,title] of [['de','Bild schließen','Statische Route'],['en','Close image','Static route'],['pt-BR','Fechar imagem','Rota estática']]) {
        await page.evaluate(`lang.getState().setLanguage(${JSON.stringify(language)});`);
        await wait(`document.querySelector('[data-guided-image-dialog] img')?.src.includes('rota-estatica-${language}.png')&&document.querySelector('[data-guided-image-dialog] img')?.naturalWidth>0`);
        assert(await page.evaluate(`const d=document.querySelector('[data-guided-image-dialog]');return document.querySelector('[data-guided-image]').textContent.trim()===${JSON.stringify(label)}&&d.textContent.includes(${JSON.stringify(title)})&&d.querySelector('img').alt.includes('192.168.50.0/24')&&!document.querySelector('[data-static-help]').open;`));
      }
      await page.evaluate("lang.getState().setLanguage('de');"); await wait("document.querySelector('[data-guided-image-dialog] img')?.src.includes('rota-estatica-de.png')");
      const staticImage = await screenshot('12-static-route-image','help');
      await click('[data-guided-image-zoom]');
      assert(await page.evaluate("const i=document.querySelector('[data-guided-image-dialog] img');return Math.abs(i.getBoundingClientRect().width-i.naturalWidth/2)<1;"));
      await click('[data-guided-image]'); await wait("!document.querySelector('[data-guided-image-dialog]')");
      await click('[data-static-help] > summary');
      assert(await page.evaluate("return document.querySelector('[data-static-help]').textContent.includes('Der Next Hop ist die IP-Adresse der R3-Schnittstelle, die direkt mit R2 verbunden ist.');"));
      await click('[data-guided-image]'); await wait("document.querySelector('[data-guided-image-dialog] img')?.naturalWidth>0");
      await click('.exercise-panel footer button','Zurück'); await step(3);
      assert(await page.evaluate("return !document.querySelector('[data-guided-image-dialog]')&&!document.querySelector('[data-guided-image]');"));
      await next(4); await click('[data-guided-image]'); await wait("document.querySelector('[data-guided-image-dialog] img')?.naturalWidth>0");
      const imageRefs=path.join(root,'.playwright-mcp/reviews/static-route-visual-help/referencias-chatgpt');await mkdir(imageRefs,{recursive:true});
      for(const [name,capture] of [['01-botao-rota-estatica',staticButton],['02-imagem-rota-estatica',staticImage]])await writeFile(path.join(imageRefs,name+'.png'),await readFile(path.join(root,capture.source)));
      await command(R2,'ip route add 192.168.20.0/24 via 10.0.23.2');await passed();await next(5);
      assert.match(await command(A,'ping -c 1 192.168.20.20',true),/no answer yet/);await passed();await next(6);
      await command(R3,'ip route add 192.168.10.0/24 via 10.0.23.1');await passed();await next(7);
      await command(R2,'ip route add 192.168.10.0/24 via 10.0.12.1');await passed();await next(8);
      assert.match(await command(A, 'ping 192.168.20.20 -c 1', true), /64 bytes from 192.168.20.20/); assert(await page.evaluate("return !document.querySelector('[data-static-passed=true]');"));
      assert.match(await command(B, 'ping -c 1 192.168.10.10', true), /64 bytes from 192.168.10.10/); await passed(); await saved();
      await page.evaluate("store.getState().setTerminalDockCollapsed(true);const n=store.getState().nodes.find(n=>n.id==='tutorial-04-r2');store.getState().onNodesChange([{type:'position',id:n.id,position:{x:n.position.x+25,y:n.position.y}}]);");
      original = (await receipt()).document.topology; await reloadAt(8);
      await page.evaluate('store.getState().setTerminalDockCollapsed(true);'); await fitLayout('line-completed-1440'); await click('[data-exercise=guided-static-routing] header > button[aria-expanded]');compact=await screenshot('03-compact-line-topology','layout');await click('[data-exercise=guided-static-routing] header > button[aria-expanded]');
    });
    await test('scenario 2 adds only LAN C, preserves routes and positions, and does not duplicate after Back/F5', async () => {
      await next(9); const after = (await receipt()).document.topology;
      const cNode=after.devices.find(d=>d.id===C), sNode=after.devices.find(d=>d.id==='tutorial-04-sc'), rNode=after.devices.find(d=>d.id===R2);
      assert(cNode.y<sNode.y&&sNode.y<rNode.y&&cNode.x===sNode.x&&sNode.x===rNode.x);
      assert.deepEqual(after.devices.filter(d => original.devices.some(old => old.id === d.id)), original.devices); assert.equal(after.devices.length, 9); assert.equal(after.links.length, 8);
      assert.deepEqual(after.links.filter(l => original.links.some(old => old.id === l.id)), original.links);
      await click('.exercise-panel footer button', 'Zurück'); await step(8); await next(9); assert.equal(await page.evaluate('return sim.net.devices.size;'), 9); await reloadAt(9);
      await configure(R2, 'eth2', '192.168.30.254/24'); await configure(C, 'eth0', '192.168.30.50/24', '192.168.30.254'); await passed(); await next(10);
      await command(R1, 'ip route add 192.168.30.0/24 via 10.0.12.2'); await command(R3, 'ip route replace 192.168.30.0/24 via 10.0.23.1'); await passed();
      await page.evaluate('store.getState().setTerminalDockCollapsed(true);'); await fitLayout('expanded-1440');
      await click('[data-exercise=guided-static-routing] header > button[aria-expanded]'); expanded = await screenshot('07-compact-expanded-topology', 'expanded'); await click('[data-exercise=guided-static-routing] header > button[aria-expanded]');
      await page.evaluate("window.autoAudit=[];window.releaseAuto=(await import('/src/networkObservations.ts')).observeNetworkActivity(e=>autoAudit.push({...e,network:undefined,speed:store.getState().packetAnimationSpeed}));const preference=await import('/src/pingAnimationPreference.ts');preference.usePingAnimationPreference.getState().setManualSpeed(0.5);preference.usePingAnimationPreference.getState().setRemember(true);window.savedPingPreference=localStorage.getItem(preference.PING_ANIMATION_PREFERENCE_KEY);store.getState().setPacketAnimationSpeed(0.5);store.getState().setPaused(false);"); await next(11);
    });
    await test('automatic real pings: cancellation, route failure, repeat, 2x visual playback and persistent completion', async () => {
      report.staticVerificationCheckpoint='first-running';
      await wait("document.querySelector('[data-static-verification=running]')");
      assert.equal(await page.evaluate('return store.getState().packetAnimationSpeed;'),2);
      report.staticVerificationCheckpoint='cancel-back'; await click('.exercise-panel footer button','Zurück'); await step(10);
      assert.equal(await page.evaluate('return store.getState().packetAnimationSpeed;'),0.5);
      report.staticVerificationCheckpoint='restart-entry'; await next(11); await wait("document.querySelector('[data-static-verification=running]')");
      // Real configuration changes cancel the old sequence, then the repeat
      // exercises the actual failed route rather than crediting old evidence.
      report.staticVerificationCheckpoint='change-route'; await command(R3,'ip route replace 192.168.30.0/24 via 10.0.23.2');
      await wait("document.querySelector('[data-static-verify]:not(:disabled)')");
      report.staticVerificationCheckpoint='repeat-failure'; await page.evaluate('store.getState().setPaused(false);'); await click('[data-static-verify]');
      await wait("document.querySelector('[data-static-verify]:not(:disabled)')&&!document.querySelector('[data-static-verification=running]')");
      assert(await page.evaluate("return !!document.querySelector('[data-static-verification=failed]')&&!document.querySelector('[data-static-passed=true]');"));
      assert.equal(await page.evaluate('return store.getState().packetAnimationSpeed;'),0.5);
      report.staticVerificationCheckpoint='correct-route'; await command(R3,'ip route replace 192.168.30.0/24 via 10.0.23.1');
      const technical=await receipt();
      report.staticVerificationCheckpoint='repeat-success'; await page.evaluate('autoAudit.length=0;store.getState().setPaused(false);'); await click('[data-static-verify]');
      const runningCapture=await screenshot('10-automatic-verification-running','verification');
      await wait("document.querySelectorAll('[data-static-verification=confirmed]').length===6&&!document.querySelector('[data-static-verification=running]')");
      await wait('store.getState().packetAnimationSpeed===0.5');
      assert(await page.evaluate("return localStorage.getItem('netlab:ping-animation-preference:v1')===savedPingPreference;"));
      const audit=await page.evaluate('return autoAudit;');
      assert.deepEqual(audit.filter(e=>e.kind==='ping'&&e.event.type==='started').map(e=>e.event.deviceId),[A,B,A,C,B,C]);
      let active=0;
      for(const e of audit.filter(e=>e.kind==='ping')) {if(e.event.type==='started')active++;if(e.event.type==='finished')active--;assert(active>=0&&active<=1);assert.equal(e.speed,2);}
      assert.equal(active,0);
      for(const e of audit.filter(e=>e.kind==='ping'&&e.event.type==='started')) {
        const request=audit.find(a=>a.kind==='icmp'&&a.icmpId===e.event.icmpId&&a.from===e.event.deviceId&&a.direction==='request');
        const reply=audit.find(a=>a.kind==='icmp'&&a.icmpId===e.event.icmpId&&a.to===e.event.deviceId&&a.direction==='reply');
        assert(request&&reply);assert.deepEqual([request.source,request.destination,request.seq],[reply.destination,reply.source,reply.seq]);
      }
      assert.deepEqual((await receipt()).document,technical.document);
      const refs=path.join(root,'.playwright-mcp/reviews/chapter4-final-refinements/referencias-chatgpt');await mkdir(refs,{recursive:true});
      for(const [name,capture] of [['01-lan-c-acima-r2',expanded],['02-verificacao-em-execucao',runningCapture]])await writeFile(path.join(refs,name+'.png'),await readFile(path.join(root,capture.source)));
      await passed(); await wait("document.querySelector('[data-exercise=guided-static-routing] [data-chapter-completed=true]')"); await saved();
      for (const [language, title] of [['en', 'Chapter 4'], ['pt-BR', 'Capítulo 4'], ['de', 'Kapitel 4']]) { await page.evaluate(`lang.getState().setLanguage(${JSON.stringify(language)});`); await delay(100); assert(await page.evaluate(`return document.querySelector('.exercise-heading').textContent.includes(${JSON.stringify(title)});`)); }
      await page.evaluate('store.getState().setTerminalDockCollapsed(true);'); await delay(100); completed = await screenshot('08-chapter-completed', 'completed'); const done = await receipt();
      await writeFile(path.join(refs,'03-verificacao-concluida.png'),await readFile(path.join(root,completed.source)));
      await click('[data-explore-network]'); await wait("!document.querySelector('[data-static-step]')"); assert.deepEqual(await receipt(), done); await menu(); await wait("document.querySelector('[data-chapter-progress=static-routing] [data-chapter-completed=true]')"); await click('[data-static-resume]'); await step(11); assert.deepEqual(await receipt(), done); await reloadAt(11);
      assert(await page.evaluate("return store.getState().packetAnimationSpeed===0.5&&JSON.parse(localStorage.getItem('netlab:ping-animation-preference:v1')).speed===0.5;"));
      await page.evaluate(`await ws.controller.switchDraft(${JSON.stringify(personal.id)});`); await wait("!document.querySelector('[data-static-step]')"); assert.deepEqual((await receipt()).document, personal.document); await menu(); await click('[data-static-resume]'); await step(11); await passed(); assert.equal((await receipt()).id, attempt);
      assert(await page.evaluate("return !document.querySelector('[data-static-verification=running]')&&store.getState().packetAnimationSpeed!==2;"));
      await click('[data-exercise=guided-static-routing] header > button[aria-expanded]');
      await page.send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 1000, deviceScaleFactor: 1, mobile: false }); await fitLayout('expanded-1024',true);
      await page.send('Emulation.setDeviceMetricsOverride', { width: 700, height: 1000, deviceScaleFactor: 1, mobile: false }); await page.evaluate("theme.getState().setTheme('classic-light');store.getState().setTerminalDockCollapsed(true);"); await delay(180); await fitLayout('expanded-700',true); assert(await page.evaluate('return document.documentElement.scrollWidth<=innerWidth+1;')); mobile = await screenshot('09-fit-view-light-mobile', 'completed', 700, 'classic-light');
    });
    await test('checkpoint restart and undo/redo atomically restore the chapter without touching the personal plan', async () => {
      await page.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }); await page.evaluate("theme.getState().setTheme('graphite-dark');"); await delay(120);
      await click('[data-exercise=guided-static-routing] header > button[aria-expanded]');
      const done = await receipt(); await click('[data-chapter-restart=static-routing]'); await wait("document.querySelector('[data-chapter-restart-confirm]:not(:disabled)')"); await click('[data-chapter-restart-confirm]'); await step(1); await saved();
      assert.equal(await page.evaluate('return sim.net.devices.size;'), 7); assert.deepEqual((await receipt()).progress.completed, []); assert.equal((await receipt()).id, attempt);
      await page.evaluate('store.getState().undoTopology();'); await step(11); await saved(); assert.deepEqual(await receipt(), done);
      await page.evaluate('store.getState().redoTopology();'); await step(1); await saved(); assert.equal(await page.evaluate('return sim.net.devices.size;'), 7); await reloadAt(1);
      await menu(); await click('[data-static-direct]'); await step(1); await saved(); assert.notEqual((await receipt()).id, attempt); assert.equal((await receipt()).tabs, done.tabs + 1);
    });
    const captures = [initial, lesson, compact, arpRequest, arpReply, icmpFailure, expanded, completed, mobile], manifest = path.join(directory, 'manifest.json');
    await writeFile(manifest, JSON.stringify({ id: 'chapter-4-minimal-learning', title: 'Kapitel 4 · Instruções mínimas e causalidade ARP', variants: [{ id: 'graphite-dark', label: 'Graphite Dark' }, { id: 'classic-light', label: 'Classic Light' }], states: ['initial', 'help', 'layout', 'arp', 'expanded', 'completed'], captures, share: captures.filter(c=>c!==completed).map(c => ({ ...c, name: c.scene.replace(/^\d+-/, '') })), shareContactSheet: false }));
    const refs=path.join(root,'.playwright-mcp/reviews/chapter4-minimal/referencias-chatgpt');await mkdir(refs,{recursive:true});
    for(const [i,c] of captures.filter(c=>c!==completed).entries())await writeFile(path.join(refs,String(i+1).padStart(2,'0')+'-'+c.scene.replace(/^\d+-/,'')+'.png'),await readFile(path.join(root,c.source)));
    report.staticRoutingReview = await generateReview(manifest);
  } finally {
    await page.evaluate('window.releaseObserver?.();window.releaseAuto?.();window.ws?.dispose();'); await page.evaluate(`await new Promise((resolve,reject)=>{const request=indexedDB.deleteDatabase(${JSON.stringify(database)});request.onsuccess=resolve;request.onerror=()=>reject(request.error);request.onblocked=()=>reject(Error('Static chapter cleanup blocked'));});`);
  }
}
