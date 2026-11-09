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
    const previous = crypto.randomUUID(); await page.evaluate(`window.previousReviewDocument=${JSON.stringify(previous)};`);
    await page.send(reload ? 'Page.reload' : 'Page.navigate', reload ? { ignoreCache: true } : { url }); await wait(`window.previousReviewDocument!==${JSON.stringify(previous)}&&document.readyState==='complete'&&document.getElementById('root')`);
    await page.evaluate(`window.store=(await import('/src/store.ts')).useStore;window.sim=(await import('/src/sim.ts')).sim;window.lang=(await import('/src/i18n/index.ts')).useLanguage;window.theme=(await import('/src/uiTheme.ts')).useUiTheme;window.chapter=await import('/src/tutorials/alternativePathsChapter.ts');window.records=[];window.releaseObserver=(await import('/src/terminalCommandEvents.ts')).observeTerminalCommands(e=>records.push({type:e.type,deviceId:e.command.deviceId,line:e.command.line,source:e.command.source,text:e.text}));lang.getState().setLanguage('de');window.ws=await(await import('/src/workspace/reviewEntry.tsx')).mountWorkspaceReview(document.getElementById('root'),{databaseName:${JSON.stringify(database)}});`);
    await wait("document.querySelector('.react-flow')"); await delay(200);
  };
  const menu = async () => { if (await page.evaluate('return innerWidth<1100;')) await click('.toolbar-menu-trigger', 'Menü'); await click('.toolbar-menu-trigger,.toolbar-menu-action', 'Übungen (Beta)'); await click('[data-guided-menu-toggle]'); await wait("document.querySelector('[data-alternative-direct]:not(:disabled)')"); };
  const saved = async () => { await wait("document.querySelector('[data-alternative-saving=false]')"); await page.evaluate('await ws.controller.flush();'); };
  const receipt = () => page.evaluate("const id=ws.controller.getState().activeDraftId;return {id,document:store.getState().captureWorkspaceDocument(),progress:(await ws.repository.getMeta('guided:alternative-paths:v1:draft:'+id)).value?.value,tabs:ws.controller.getState().drafts.length};");
  const step = n => wait(`document.querySelector('[data-alternative-step="${n}"]')`), passed = () => wait("document.querySelector('[data-alternative-passed=true]')");
  // Optional review artifacts only; progression still uses real commands and packets.
  const reviewStage = process.env.NETLAB_DIDACTIC_CAPTURE;
  const capturedSteps = new Set();
  const compareCapture = async n => {
    if (!reviewStage || ![14, 16, 17, 18, 19, 20, 21].includes(n) || capturedSteps.has(n)) return;
    if (n === 14) await wait("sim.net.devices.get('tutorial-05-r3').getInterface('eth3').ip?.prefix===25");
    if (n === 20) await wait("document.querySelector('[data-alternative-storm=down]')");
    await saved();
    await page.evaluate("lang.getState().setLanguage('de');theme.getState().setTheme('graphite-dark');store.getState().setTerminalDockCollapsed(true);document.querySelector('.exercise-body').scrollTop=0;");
    await delay(250);
    const folder = path.join(root, '.playwright-mcp/reviews/chapter5-didactic', reviewStage);
    await mkdir(folder, { recursive: true });
    const clip = await page.evaluate("const r=document.querySelector('.exercise-panel').getBoundingClientRect();return {x:Math.floor(r.x),y:Math.floor(r.y),width:Math.ceil(r.width),height:Math.ceil(r.height),scale:1};");
    const png = await page.send('Page.captureScreenshot', { format: 'png', clip, captureBeyondViewport: false });
    await writeFile(path.join(folder, `step-${n}.png`), Buffer.from(png.data, 'base64'));
    capturedSteps.add(n);
  };
  const checkDidacticCopy = async n => {
    for (const language of ['de', 'en', 'pt-BR']) for (const themeName of ['graphite-dark', 'classic-light']) {
      await page.evaluate(`lang.getState().setLanguage(${JSON.stringify(language)});theme.getState().setTheme(${JSON.stringify(themeName)});`); await delay(50);
      assert(await page.evaluate(`
        const p=document.querySelector('[data-alternative-step]'),help=p.querySelector('[data-alternative-help]'),main=p.querySelector(':scope > p').textContent,visible=[...p.querySelectorAll(':scope > p,:scope > pre')].map(e=>e.textContent).join(' '),n=${n};
        if(help?.open||p.querySelectorAll('details').length>1||p.innerText.includes('guidedAlternative.'))return false;
        if(n===14&&(!main.includes('192.168.30.130/25')||main.includes('192.168.30.129')||!help.textContent.includes('192.168.30.129/25')))return false;
        if(n===15&&(/192\\.168\\.|real|echt/.test(main)||p.querySelector(':scope > pre')))return false;
        if(n>=16&&n<=18&&(/(?:192\\.168\\.|10\\.0\\.)/.test(main)||p.querySelector(':scope > pre')||/10\\.0\\.(?:12|13|23)\\.2/.test(help.textContent)))return false;
        if(n===16&&(!main.includes('ip route add')||!help.textContent.includes('192.168.30.128/25')||!help.querySelector('pre code').textContent.includes('<')))return false;
        if(n===17&&(!main.includes('/24')||!help.textContent.includes('/25')))return false;
        if(n===18&&(!main.includes('/25')||!main.includes('/24')))return false;
        if(n===19&&(!p.querySelector('[data-lpm-before]')||!p.querySelector('[data-lpm-path=request]')||!p.querySelector('[data-lpm-path=reply]')||p.querySelector('[data-alternative-feedback=lpm]')))return false;
        if(n===20&&help)return false;
        if(n===21&&(help||/10\\.0\\.13\\.[12]/.test(visible)||!visible.includes('ip route add')||!visible.includes('ip route replace')||p.querySelectorAll('[data-alternative-recovery]').length!==2))return false;
        return true;
      `));
      report.results[`alternative paths: didactic task ${n}, ${language}, ${themeName}`] = { passed: true };
    }
    await page.evaluate("lang.getState().setLanguage('de');theme.getState().setTheme('graphite-dark');");
  };
  const minimalPanel = async n => {
    assert(await page.evaluate(`const p=document.querySelector('[data-alternative-step]'),h=p.querySelector('[data-alternative-help]');return p.querySelectorAll('details').length<=1&&!p.querySelector('[data-alternative-condition],[data-alternative-more-help],[data-alternative-address-plan]')&&(!h||!h.open)&&([7,11,12,20,21,22].includes(${n})?!h:!!h)&&![...p.querySelectorAll(':scope > p')].some(e=>/Abgeschlossen, wenn|Complete when|Concluído quando/.test(e.textContent));`));
  };
  let roundOneScene = 0;
  const roundOneVariants = async check => {
    const scene = ++roundOneScene;
    for (const language of ['de', 'en', 'pt-BR']) for (const themeName of ['graphite-dark', 'classic-light']) {
      await page.evaluate(`lang.getState().setLanguage(${JSON.stringify(language)});theme.getState().setTheme(${JSON.stringify(themeName)});`); await delay(70);
      await check(language, themeName);
      assert(await page.evaluate('const p=document.querySelector("[data-alternative-step]"),step=Number(p.dataset.alternativeStep),instruction=p.querySelector(":scope > p").textContent;return step<16||step>18||!/(?:192\\.168\\.|10\\.0\\.)/.test(instruction)&&!p.querySelector(":scope > pre");'));
      report.results[`alternative paths: round 1 scene ${scene}, ${language}, ${themeName}`] = { passed: true };
    }
    await page.evaluate("lang.getState().setLanguage('de');theme.getState().setTheme('graphite-dark');"); await delay(70);
  };
  const roundOneCapture = async name => {
    const folder = path.join(root, '.playwright-mcp/reviews/tutorial-polish/referencias-chatgpt');
    await mkdir(folder, { recursive: true });
    const png = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(path.join(folder, name + '.png'), Buffer.from(png.data, 'base64'));
  };
  const next = async n => { await wait("document.querySelector('[data-alternative-next]:not(:disabled)')"); await click('[data-alternative-next]'); await step(n); await saved(); await minimalPanel(n); if(n>=14&&n<=21)await checkDidacticCopy(n); await compareCapture(n); };
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
  const observeLpm = () => page.evaluate("window.releaseLpm?.();window.lpmWires=[];window.releaseLpm=(await import('/src/networkObservations.ts')).observeNetworkActivity(e=>{if(e.kind==='icmp')lpmWires.push({from:e.from,to:e.to,direction:e.direction,source:e.source,destination:e.destination});});");
  let commandSample = '';
  const checkCommandColors = async () => assert(await page.evaluate(`
    const host=document.createElement('div');host.className='exercise-panel';host.style.display='none';host.innerHTML=${JSON.stringify(commandSample)};
    const neutral=document.createElement('span'),amber=document.createElement('span');neutral.style.color='var(--ui-text)';amber.style.color='var(--ui-warning)';host.append(neutral,amber);document.body.append(host);
    const code=host.querySelector('code'),spans=[...host.querySelectorAll('.guided-command-syntax')];
    const good=!!code&&getComputedStyle(code).color===getComputedStyle(neutral).color&&spans.length===4&&spans.map(e=>e.textContent).join(' ')==='ip route add via'&&spans.every(e=>getComputedStyle(e).color===getComputedStyle(amber).color)&&/^ip route add <[^>]+> via <[^>]+>$/.test(code.textContent);host.remove();return good;
  `));
  const shot = async (name, state, width = 1440, variant = 'graphite-dark') => {
    if (await page.evaluate("return !!document.querySelector('.ping-animation-close');")) await click('.ping-animation-close');
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 100, y: 20 }); await delay(320);
    const png = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); await writeFile(path.join(directory, name + '.png'), Buffer.from(png.data, 'base64'));
    return { source: path.relative(root, path.join(directory, name + '.png')).split(path.sep).join('/'), scene: name, state, width, height: 1000, variant };
  };
  const reloadAt = async n => { await saved(); const before = await receipt(); await mount(true); await step(n); await saved(); assert.deepEqual(await receipt(), before); };
  const test = async (name, work) => { try { await work(); report.results['alternative paths: ' + name] = { passed: true }; } catch (e) { report.results['alternative paths: ' + name] = { passed: false, error: e.stack, visible: await page.evaluate('return document.querySelector(".exercise-panel")?.textContent;'), conditions: await page.evaluate('return typeof chapter!=="undefined"&&typeof sim!=="undefined"?chapter.alternativeConditions(sim.net):null;') }; throw e; } };
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
      await configureGateway(I.a, '192.168.10.1'); await passed();
      await click('[data-alternative-help] > summary');
      assert(await page.evaluate('return document.querySelector("[data-alternative-help]").open;'));
      await next(6);
      await roundOneVariants(async () => {
        assert(await page.evaluate('const h=document.querySelector("[data-alternative-help]");return !!h&&!h.open;'));
        await click('[data-alternative-help] > summary');
        assert(await page.evaluate('const h=document.querySelector("[data-alternative-help]");return h.open&&h.textContent.includes("/24")&&h.textContent.includes("R3")&&h.textContent.includes("ip route add default via <gateway>");'));
        await click('[data-alternative-help] > summary');
      });
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
      await roundOneVariants(async () => {
        assert(await page.evaluate('return !document.querySelector("[data-alternative-investigation]")&&!document.querySelector("[data-alternative-help]").open;'));
        await click('[data-alternative-help] > summary');
        assert(await page.evaluate('return !/lacks|fehlt|faltar|falta de rota|no route/.test(document.querySelector("[data-alternative-step]").textContent);'));
        await click('[data-alternative-help] > summary');
      });
      assert.doesNotMatch(await command(I.a,'ping -c 1 192.168.20.20',true),/64 bytes from/); await passed();
      await roundOneVariants(async () => {
        assert(await page.evaluate('const p=document.querySelector("[data-alternative-investigation=missing-return]");return !!p&&p.textContent.includes("PC B")&&p.textContent.includes("192.168.10.0/24")&&!document.querySelector("[data-alternative-help]").open;'));
      });
      await roundOneCapture('01-return-after-real-ping');
      await reloadAt(10);
      assert(await page.evaluate('return !document.querySelector("[data-alternative-investigation]");'));
      await capturePanel('04-return-investigation','diagnosis'); await next(11);
      assert.equal(await command(I.r3,'ip route add 192.168.10.0/24 via 10.0.23.1'),''); await passed(); await next(12);
      assert.equal(await command(I.r2,'ip route add 192.168.10.0/24 via 10.0.12.1'),'');
      assert(await page.evaluate("return document.querySelector('[data-alternative-proven-path]').dataset.alternativeProvenPath==='expected';"));
      assert.match(await command(I.a,'ping -c 1 192.168.20.20',true),/64 bytes from/); assert(await page.evaluate("return !document.querySelector('[data-alternative-passed=true]');"));
      assert.match(await command(I.b,'ping -c 1 192.168.10.10',true),/64 bytes from/); await passed();
      assert(await page.evaluate("return document.querySelector('[data-alternative-proven-path]').dataset.alternativeProvenPath==='verified';"));
      await roundOneVariants(async () => {
        assert(await page.evaluate('const p=document.querySelector("[data-alternative-observed-path]"),tasks=document.querySelector("[data-alternative-reply]");return !!p&&!!tasks&&!!(p.compareDocumentPosition(tasks)&Node.DOCUMENT_POSITION_FOLLOWING)&&p.getBoundingClientRect().top<tasks.getBoundingClientRect().top;'));
      });
      await roundOneCapture('02-observed-path-above-checks'); await next(13);
      assert(await page.evaluate("return !document.querySelector('[data-alternative-feedback]');"));
      await answer('hop','r3'); assert(await page.evaluate("return !document.querySelector('[data-alternative-passed=true]');")); await answer('hop','r2'); await passed(); await next(14);
    });
    await test('automatic PC C naming preserves custom names, collisions, identity, Undo and F5',async()=>{
      await wait('sim.net.devices.get("tutorial-05-r3").getInterface("eth3").ip?.prefix===25&&!document.querySelector("[data-alternative-saving=true]")');await saved();
      const original=await receipt();
      const restore=async()=>{
        await saved();const current=await receipt();
        await page.evaluate(`const key='guided:alternative-paths:v1:draft:'+ws.controller.getState().activeDraftId,entry=(await ws.repository.getMeta(key)).value;const result=await ws.controller.commitDocument({draftId:${JSON.stringify(original.id)},expected:${JSON.stringify(current.document)},document:${JSON.stringify(original.document)},control:[{key,expectedRevision:entry.revision,value:${JSON.stringify(original.progress)}}],guards:[]});if(!result.ok)throw Error(result.error.code);`);
        await mount(true);await step(14);await saved();
      };
      for(const kind of ['generated','custom','collision']){
        const created=await page.evaluate(`store.getState().setHostCreationMode('linux');let other=null;if(${JSON.stringify(kind)}==='collision'){store.getState().addDeviceAt('host',{x:1900,y:100});other=store.getState().nodes.at(-1).id;store.getState().renameDevice(other,'PC C');}store.getState().addDeviceAt('host',{x:1800,y:750});const id=store.getState().nodes.at(-1).id;if(${JSON.stringify(kind)}==='custom')store.getState().renameDevice(id,'Cliente especial');const d=sim.net.devices.get(id),before={id,name:d.name,mac:d.getInterface('eth0').mac,other};store.getState().onConnect({source:id,target:'tutorial-05-r3',sourceHandle:'eth0',targetHandle:'eth3'});return before;`);
        await wait('(document.querySelector("[data-alternative-saving=false]"))');await saved();
        const expected=kind==='generated'?'PC C':created.name;
        assert.equal(await page.evaluate(`return sim.net.devices.get(${JSON.stringify(created.id)}).name;`),expected);
        assert(await page.evaluate(`const d=sim.net.devices.get(${JSON.stringify(created.id)});return !d.getInterface('eth0').ip&&!d.getInterface('eth0').gateway&&!document.querySelector('[data-alternative-passed=true]');`));
        assert(await page.evaluate(`const d=sim.net.devices.get(${JSON.stringify(created.id)});return d.getInterface('eth0').mac===${JSON.stringify(created.mac)}&&d.getInterface('eth0').link===sim.net.devices.get('tutorial-05-r3').getInterface('eth3').link&&document.querySelector('[data-id="'+d.id+'"]').textContent.includes(${JSON.stringify(expected)});`));
        assert.equal((await receipt()).progress.lpm.pc.nameChecked,true);
        if(kind==='generated'){
          await roundOneCapture('10-auto-named-pc-c');
          await page.evaluate('store.getState().undoTopology();');await delay(100);assert.equal(await page.evaluate(`return sim.net.devices.get(${JSON.stringify(created.id)}).name;`),created.name);
          await page.evaluate('store.getState().redoTopology();');await delay(100);assert.equal(await page.evaluate(`return sim.net.devices.get(${JSON.stringify(created.id)}).name;`),'PC C');
          await page.evaluate('store.getState().undoTopology();');await delay(100);
        }
        await reloadAt(14);
        assert.equal(await page.evaluate(`return sim.net.devices.get(${JSON.stringify(created.id)}).name;`),kind==='generated'?created.name:expected);
        if(created.other)assert.equal(await page.evaluate(`return sim.net.devices.get(${JSON.stringify(created.other)}).name;`),'PC C');
        await restore();
      }
    });
    await test('old step 14 migrates without replacing the network; PC C is created by dragging and survives F5', async()=>{
      await wait("sim.net.devices.get('tutorial-05-r3').getInterface('eth3').ip?.prefix===25&&!document.querySelector('[data-alternative-saving=true]')");
      const before=await receipt();
      await page.evaluate("const id=ws.controller.getState().activeDraftId,key='guided:alternative-paths:v1:draft:'+id,entry=(await ws.repository.getMeta(key)).value,p=structuredClone(entry.value);p.chapterVersion=2;p.step=14;p.completed=Array.from({length:13},(_,i)=>i+1);p.lpmUnderstood=false;p.viaBaseline=null;delete p.lpm;const result=await ws.repository.setMeta({key,expectedRevision:entry.revision,value:p});if(!result.ok)throw Error(result.error.code);");
      await mount(true);await step(14);await saved();
      assert.deepEqual((await receipt()).document,before.document);assert.equal((await receipt()).progress.chapterVersion,4);
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
      await roundOneVariants(async () => {
        assert.equal(await page.evaluate('return document.querySelector("[data-alternative-host]").textContent;'), 'PC C');
      });
      await roundOneCapture('03-pc-c-recognised');
      assert.equal(await command(pcC,'ip address add 192.168.30.130/24 dev eth0'),'');await configureGateway(pcC,'192.168.30.129');
      assert(await page.evaluate('return !document.querySelector("[data-alternative-passed=true]");'));
      await command(pcC,'ip address del 192.168.30.130/24 dev eth0');await command(pcC,'ip address add 192.168.30.130/25 dev eth0');await configureGateway(pcC,'192.168.30.129');await passed();
      await reloadAt(14);await capturePanel('05a-lan-c','question');await next(15);
      await command(I.b,'ping -c 1 192.168.30.129',true);assert(await page.evaluate('return !document.querySelector("[data-alternative-passed=true]");'));
      assert.match(await command(pcC,'ping -c 1 192.168.30.129',true),/64 bytes from/);await passed();await reloadAt(15);await next(16);
    });
    await test('R2 route and its own real ping have independent checkpoints',async()=>{
      for(const operation of ['add','replace']) {
        assert.equal(await command(I.r2,`ip route ${operation} 192.168.30.130/25 via 10.0.23.2`),'Error: Invalid prefix for given prefix length.\n');
        assert(await page.evaluate('return !sim.net.devices.get("tutorial-05-r2").staticRoutes.some(r=>r.prefix===25);'));
      }
      assert.equal(await command(I.r2,'ip route add 192.168.30.128/25 via 10.0.23.2'),'');
      commandSample=await page.evaluate('return document.querySelector("[data-alternative-help] pre code.guided-command").outerHTML;');
      await checkCommandColors();
      assert(await page.evaluate('return document.querySelector("[data-lpm-check=route]").dataset.tutorialPassed==="true"&&document.querySelector("[data-lpm-check=ping]").dataset.tutorialPassed==="false";'));
      await observeLpm();
      assert.match(await command(I.r2,'ping -c 1 192.168.30.130',true),/64 bytes from/);await passed();
      assert.deepEqual(await page.evaluate('return lpmWires.filter(e=>e.direction==="request").map(e=>[e.from,e.to]);'),[[I.r2,I.r3],[I.r3,pcC]]);
      await roundOneVariants(async()=>{assert(await page.evaluate('return document.querySelector("[data-lpm-check=ping]").dataset.tutorialPassed==="true"&&!document.querySelector("[data-alternative-help]").open;'));});
      await roundOneCapture('04-r2-reaches-pc-c');await reloadAt(16);await next(17);
    });
    await test('early /25 is preserved and recovery is manual before the real /24 experiment',async()=>{
      await observeLpm();
      assert.equal(await command(I.r1,'ip route add 192.168.30.0/24 via 10.0.12.2'),'');
      assert.equal(await command(I.r1,'ip route add 192.168.30.128/25 via 10.0.13.2'),'');
      await wait('document.querySelector("[data-lpm-recovery]")');
      const before=(await receipt()).document;
      assert.match(await command(I.a,'ping -c 1 192.168.30.130',true),/64 bytes from/);
      assert(await page.evaluate('return !document.querySelector("[data-alternative-passed=true]");'));
      assert.deepEqual((await receipt()).document,before);
      await roundOneVariants(async()=>{assert(await page.evaluate('return document.querySelector("[data-lpm-recovery]").textContent.includes("ip route del 192.168.30.128/25");'));});
      await command(I.r1,'ip route del 192.168.30.128/25');await page.evaluate('lpmWires=[];');
      assert.match(await command(I.a,'ping -c 1 192.168.30.130',true),/64 bytes from/);
      assert.deepEqual(await page.evaluate('return lpmWires.filter(e=>e.direction==="request").map(e=>[e.from,e.to]);'),[[I.a,I.r1],[I.r1,I.r2],[I.r2,I.r3],[I.r3,pcC]]);
      await passed();
      await roundOneVariants(async()=>{assert(await page.evaluate('return !!document.querySelector("[data-lpm-covered]")&&document.querySelector("[data-lpm-path=request]").textContent.includes("R2")&&!document.querySelector("[data-alternative-answer=lpm]");'));});
      await roundOneCapture('05-broad-route-through-r2');await reloadAt(17);await next(18);
    });
    await test('a fresh /25 ping changes the request path and preserves /24 and R2 receipts',async()=>{
      await observeLpm();
      const previous=(await receipt()).progress.lpm.experiment;
      assert.equal(await command(I.r1,'ip route add 192.168.30.128/25 via 10.0.13.2'),'');
      assert.deepEqual((await receipt()).progress.lpm.experiment,previous);
      assert(await page.evaluate('return document.querySelector("[data-lpm-check=route]").dataset.tutorialPassed==="true"&&document.querySelector("[data-lpm-check=ping]").dataset.tutorialPassed==="false";'));
      assert(await page.evaluate('return !document.querySelector("[data-alternative-answer=lpm]");'));
      await command(I.b,'ping -c 1 192.168.30.130',true);assert(await page.evaluate('return !document.querySelector("[data-alternative-answer=lpm]");'));
      await page.evaluate('lpmWires=[];');assert.match(await command(I.a,'ping -c 1 192.168.30.130',true),/64 bytes from/);
      const expectedRequest=[[I.a,I.r1],[I.r1,I.r3],[I.r3,pcC]],expectedReply=[[pcC,I.r3],[I.r3,I.r2],[I.r2,I.r1],[I.r1,I.a]];
      assert.deepEqual(await page.evaluate('return lpmWires.filter(e=>e.direction==="request").map(e=>[e.from,e.to]);'),expectedRequest);
      assert.deepEqual(await page.evaluate('return lpmWires.filter(e=>e.direction==="reply").map(e=>[e.from,e.to]);'),expectedReply);
      await passed();
      assert.deepEqual((await receipt()).progress.lpm.experiment.broad,previous.broad);
      assert.deepEqual((await receipt()).progress.lpm.experiment.r2,previous.r2);
      assert(await page.evaluate('const {ipToString}=await import("/src/engine/ip.ts");return sim.net.devices.get("tutorial-05-r1").staticRoutes.filter(r=>["192.168.30.0/24","192.168.30.128/25"].includes(ipToString(r.dest)+"/"+r.prefix)).length===2;'));
      await roundOneVariants(async()=>{assert(await page.evaluate('return document.querySelector("[data-lpm-path=reply]").textContent.includes("R2")&&document.querySelector("[data-lpm-check=ping]").dataset.tutorialPassed==="true";'));});
      await roundOneCapture('06-specific-route-through-r3');await reloadAt(18);await next(19);
    });
    await test('LPM compares only matching prefixes after both actual paths have been observed',async()=>{
      await wait('document.querySelector("[data-alternative-answer=lpm]")');
      await roundOneVariants(async () => {
        assert(await page.evaluate('const p=document.querySelector("[data-lpm-path=request]"),question=document.querySelector("[data-alternative-answer=lpm]");return !!(p.compareDocumentPosition(question)&Node.DOCUMENT_POSITION_FOLLOWING)&&p.textContent.endsWith("PC C")&&!document.querySelector("[data-lpm-path=reply]").textContent.includes("PC C (");'));
      });
      assert((await receipt()).progress.viaReplies.ab);assert.equal((await receipt()).progress.lpm.pc.id,pcC);
      await answer('lpm','cables');assert(await page.evaluate('return !document.querySelector("[data-alternative-passed=true]");'));await answer('lpm','specific');await passed();
      await reloadAt(19);
      for(const language of ['en','pt-BR','de']){await page.evaluate('lang.getState().setLanguage('+JSON.stringify(language)+');');await delay(100);assert(await page.evaluate('return document.querySelector("[data-alternative-feedback=lpm]").textContent.includes("/25")&&document.querySelector("[data-lpm-path=reply]").textContent.includes("R2");'));}
      await click('[data-alternative-help] > summary');assert(await page.evaluate('return document.querySelector("[data-alternative-selected-route=true]").textContent.includes("192.168.30.128/25");'));
      await capturePanel('05-lpm-live-table','explanation');
      await page.send('Emulation.setDeviceMetricsOverride',{width:700,height:1000,deviceScaleFactor:1,mobile:false});await page.evaluate("theme.getState().setTheme('classic-light');");await delay(180);
      assert(await page.evaluate('return document.documentElement.scrollWidth<=innerWidth+1;'));await capturePanel('05c-lpm-light-mobile','explanation',700,'classic-light');
      await page.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await page.evaluate("theme.getState().setTheme('graphite-dark');");await delay(180);
      await page.evaluate('window.releaseLpm?.();window.beforeStorm=store.getState().captureWorkspaceDocument();');await next(20);
    });
    await test('one storm disables R2–R3, keeps all configurations and survives navigation, Undo/Redo and F5',async()=>{
      await wait('document.querySelector("[data-alternative-storm=down]")&&!document.querySelector("[data-alternative-saving=true]")');await saved();
      assert.equal((await receipt()).progress.storm,'applied');
      assert(await page.evaluate('const expected=structuredClone(beforeStorm.topology);expected.devices.find(d=>d.id==="tutorial-05-r2").ifaces.find(i=>i.name==="eth1").up=false;return JSON.stringify(expected)===JSON.stringify(store.getState().captureWorkspaceDocument().topology);'));
      assert(await page.evaluate('return !sim.net.links.get("tutorial-05-23").operational&&sim.net.links.get("tutorial-05-13").operational&&!!document.querySelector("[data-id=tutorial-05-23] .cable-unavailable");'));
      const lpm=(await receipt()).progress.lpm;
      await roundOneVariants(async()=>{assert(await page.evaluate('return !!document.querySelector("[data-alternative-storm=down]")&&!document.querySelector("[data-alternative-failure-explanation]")&&!document.querySelector("[data-alternative-step]").textContent.includes("ip route replace");'));});
      await roundOneCapture('07-storm-before-observation');
      await page.evaluate('store.getState().undoTopology();');await wait('document.querySelector("[data-alternative-storm=restored]")');
      await click('.exercise-panel footer button','Zurück');await step(19);await passed();
      assert.deepEqual((await receipt()).progress.lpm,lpm);await next(20);
      assert(await page.evaluate('return sim.net.links.get("tutorial-05-23").operational;'));
      await page.evaluate('store.getState().redoTopology();');await wait('document.querySelector("[data-alternative-storm=down]")');
      await reloadAt(20);assert.equal((await receipt()).progress.storm,'applied');
      assert(await page.evaluate('return !sim.net.links.get("tutorial-05-23").operational&&!document.querySelector("[data-alternative-failure-explanation]");'));
    });
    await test('failure is witnessed before explanations, without automatic failover or recovery spoilers', async () => {
      assert(await page.evaluate("return !document.querySelector('[data-alternative-failure-mismatch]');"));
      assert.equal(await command(I.r2,'ip route add 203.0.113.0/24 via 10.0.12.1'),'');
      await wait("document.querySelector('[data-alternative-failure-mismatch]')");
      assert.equal(await command(I.r2,'ip route del 203.0.113.0/24'),'');
      await observeLpm();
      assert.doesNotMatch(await command(I.a,'ping -c 1 192.168.20.20',true),/64 bytes from/); await passed();
      assert.deepEqual(await page.evaluate('return lpmWires.filter(e=>e.direction==="request").map(e=>[e.from,e.to]);'),[[I.a,I.r1],[I.r1,I.r2]]);
      await roundOneVariants(async()=>{assert(await page.evaluate('return !!document.querySelector("[data-alternative-failure-explanation]")&&!document.querySelector("[data-alternative-step]").textContent.includes("ip route replace");'));});
      await roundOneCapture('08-storm-after-real-failure');await reloadAt(20);
      await capturePanel('06-link-failure','failure'); await next(21);
    });
    await test('manual direct routes and fresh bidirectional proof complete all twenty-two tasks', async () => {
      const cRoutes=await page.evaluate('return sim.net.devices.get("tutorial-05-r1").staticRoutes.filter(r=>r.dest===3232243200||r.dest===3232243328);');
      assert(await page.evaluate('return [...document.querySelectorAll("[data-alternative-recovery]")].every(e=>e.dataset.tutorialPassed==="false");'));
      assert.equal(await command(I.r1,'ip route add 192.168.20.0/24 via 10.0.13.2'),'RTNETLINK answers: File exists\n');
      assert.equal(await command(I.r1,'ip route replace 192.168.20.0/24 via 10.0.13.2'),'');
      assert(await page.evaluate('return document.querySelector("[data-alternative-recovery=r1]").dataset.tutorialPassed==="true"&&document.querySelector("[data-alternative-recovery=r3]").dataset.tutorialPassed==="false";'));
      await roundOneVariants(async()=>{assert(await page.evaluate('return document.querySelector("[data-alternative-recovery=r1]").dataset.tutorialPassed==="true"&&document.querySelector("[data-alternative-recovery=r3]").dataset.tutorialPassed==="false"&&!document.querySelector("[data-alternative-help]")&&!/10\\.0\\.13\\.[12]/.test(document.querySelector("[data-alternative-step]").textContent)&&document.querySelectorAll("[data-alternative-recovery]").length===2;'));});
      await roundOneCapture('09-route-recovery-checkpoints');
      assert.doesNotMatch(await command(I.a,'ping -c 1 192.168.20.20',true),/64 bytes from/);
      assert.equal(await command(I.r3,'ip route replace 192.168.10.0/24 via 10.0.13.1'),''); await passed(); await next(22);
      assert.deepEqual(await page.evaluate('return sim.net.devices.get("tutorial-05-r1").staticRoutes.filter(r=>r.dest===3232243200||r.dest===3232243328);'),cRoutes);
      assert.match(await command(I.a,'ping -c 1 192.168.20.20',true),/64 bytes from/); assert(await page.evaluate("return !document.querySelector('[data-alternative-passed=true]');"));
      assert.match(await command(I.b,'ping -c 1 192.168.10.10',true),/64 bytes from/); await passed(); await saved();
      assert.deepEqual((await receipt()).progress.completed,Array.from({length:22},(_,i)=>i+1));
      assert(await page.evaluate('return !!document.querySelector("[data-alternative-recovered]");'));
      await capturePanel('07-alternative-completed','completed');
      const before = await receipt(); await click('[data-explore-network]'); await wait("!document.querySelector('[data-alternative-step]')"); assert.deepEqual(await receipt(),before);
      await menu(); await click('[data-alternative-resume]'); await step(22); await reloadAt(22); await passed();
    });
    await test('a completed v4 attempt without a storm marker is preserved without retroactive damage',async()=>{
      const before=await receipt();
      await page.evaluate('const id=ws.controller.getState().activeDraftId,key="guided:alternative-paths:v1:draft:"+id,entry=(await ws.repository.getMeta(key)).value,p=structuredClone(entry.value);delete p.storm;const written=await ws.repository.setMeta({key,expectedRevision:entry.revision,value:p});if(!written.ok)throw Error(written.error.code);');
      await mount(true);await step(22);await passed();
      assert.deepEqual((await receipt()).document,before.document);
      await click('.exercise-panel footer button','Zurück');await step(21);await passed();await next(22);await passed();
      assert.equal((await receipt()).progress.storm,'legacy');assert.deepEqual((await receipt()).document,before.document);
      assert.deepEqual((await receipt()).progress.lpm,before.progress.lpm);
    });
    await test('DE/EN/PT-BR, themes, three viewports and plan switches preserve the learning document', async () => {
      const intact = await receipt();
      for (const [language,title] of [['en','Chapter 5'],['pt-BR','Capítulo 5'],['de','Kapitel 5']]) {
        await page.evaluate(`lang.getState().setLanguage(${JSON.stringify(language)});`); await delay(120);
        assert(await page.evaluate(`return document.querySelector('.exercise-heading').textContent.includes(${JSON.stringify(title)})&&!document.querySelector('[data-alternative-step]').innerText.includes('guidedAlternative.');`));
      }
      const themes=await page.evaluate("return Object.keys((await import('/src/uiTheme.ts')).UI_THEMES);");
      for (const name of themes) { await page.evaluate(`theme.getState().setTheme(${JSON.stringify(name)});`); await delay(120); assert(await page.evaluate(`return document.documentElement.dataset.uiTheme===${JSON.stringify(name)};`)); await checkCommandColors(); report.results['alternative paths: syntax/parameter colors in '+name]={passed:true}; }
      report.alternativePathsThemes=themes;
      await page.evaluate(`await ws.controller.switchDraft(${JSON.stringify(personal.id)});`); await wait("!document.querySelector('[data-alternative-step]')"); assert.deepEqual((await receipt()).document,personal.document);
      await menu(); await click('[data-alternative-resume]'); await step(22); await passed(); assert.equal((await receipt()).id,attempt);
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
      await page.evaluate('store.getState().undoTopology();'); await step(22); await saved(); assert.deepEqual(await receipt(),before);
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
  if (reviewStage === 'depois') {
    const folder = path.join(root, '.playwright-mcp/reviews/chapter5-didactic'), references = path.join(folder, 'referencias-chatgpt');
    await mkdir(references, { recursive: true });
    const titles = ['Parte 3 · 1/6 — Adicionar LAN C', 'Parte 3 · 3/6 — R2 alcança PC C', 'Parte 3 · 4/6 — Rota /24 por R2', 'Parte 3 · 5/6 — Rota /25 por R3', 'Parte 3 · 6/6 — Antes e depois', 'Parte 4 · 1/3 — Tempestade', 'Parte 4 · 2/3 — Recuperar rotas'];
    let index = 0;
    for (const n of [14,16,17,18,19,20,21]) {
      const before = await readFile(path.join(folder, 'antes', `step-${n}.png`)), after = await readFile(path.join(folder, 'depois', `step-${n}.png`));
      const width = before.readUInt32BE(16) + after.readUInt32BE(16) + 48, height = Math.max(before.readUInt32BE(20), after.readUInt32BE(20)) + 110;
      await page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      const html = `<style>body{margin:0;padding:16px;background:#101619;color:#e4e9ec;font:15px Arial}h1{font-size:18px;margin:0 0 18px}main{display:flex;gap:16px;align-items:flex-start}p{margin:0 0 10px;font-weight:bold}img{display:block}</style><h1>${titles[index]} · DE / Graphite Dark</h1><main><section><p>ANTES</p><img src="data:image/png;base64,${before.toString('base64')}"></section><section><p>DEPOIS</p><img src="data:image/png;base64,${after.toString('base64')}"></section></main>`;
      await page.evaluate(`document.open();document.write(${JSON.stringify(html)});document.close();await Promise.all([...document.images].map(img=>img.decode()));`);
      const png = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      await writeFile(path.join(references, `${String(++index).padStart(2,'0')}-etapa-${n}-antes-depois.png`), Buffer.from(png.data, 'base64'));
    }
    await writeFile(path.join(folder, 'index.html'), '<!doctype html><meta charset="utf-8"><title>Capítulo 5 — antes e depois</title><style>body{margin:24px;background:#101619;color:#e4e9ec;font:16px Arial}img{max-width:100%;display:block;margin:24px 0}</style><h1>Capítulo 5 — antes e depois</h1><p>Capturas reais: DE · Graphite Dark · painel original em 1440×1000. As sete comparações PNG estão na pasta referencias-chatgpt.</p>' + [14,16,17,18,19,20,21].map((n,i)=>`<img alt="${titles[i]}: antes e depois" src="referencias-chatgpt/${String(i+1).padStart(2,'0')}-etapa-${n}-antes-depois.png">`).join(''));
    report.alternativePathsComparisons = { directory: references, count: index, language: 'de', theme: 'graphite-dark', sourceViewport: '1440x1000', syntheticImages: false };
  }
}
