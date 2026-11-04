import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function runGuidedTutorialReview({ page, url, root, report }) {
  const database = 'netlab-idb-test-' + crypto.randomUUID(), directory = path.join(root, '.playwright-mcp/reviews/raw/guided-tutorial');
  await mkdir(directory, { recursive: true });
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const wait = async expression => {
    for (let i = 0; i < 220; i++) { if (await page.evaluate('return !!(' + expression + ');')) return; await delay(40); }
    throw Error('Guided tutorial condition: ' + expression);
  };
  const test = async (name, fn) => {
    try { await fn(); report.results['guided tutorial: ' + name] = { passed: true }; }
    catch (e) { report.results['guided tutorial: ' + name] = { passed: false, error: e.stack }; throw e; }
  };
  const point = selector => page.evaluate(`const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.getClientRects().length);if(!e)throw Error('Missing '+${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};`);
  const click = async (selector, text) => {
    const p = text ? await page.evaluate(`const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.getClientRects().length&&e.textContent.replace(/[›▾]/g,'').trim()===${JSON.stringify(text)});if(!e)throw Error('Missing '+${JSON.stringify(text)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};`) : await point(selector);
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, ...p, ...(type === 'mouseMoved' ? {} : { button: 'left', clickCount: 1 }) });
    await delay(80);
  };
  const key = async (key, code, vk, modifiers = 0) => {
    for (const type of ['keyDown', 'keyUp']) await page.send('Input.dispatchKeyEvent', { type, key, code, modifiers, windowsVirtualKeyCode: vk,
      ...(type === 'keyDown' && key === 'Enter' ? { text: '\r', unmodifiedText: '\r' } : {}) });
    await delay(70);
  };
  const type = async (selector, text) => { await click(selector); await key('a', 'KeyA', 65, 2); await page.send('Input.insertText', { text }); await delay(70); };
  const command = async text => {
    await page.evaluate("document.querySelector('.xterm-helper-textarea').focus();"); await page.send('Input.insertText', { text }); await key('Enter', 'Enter', 13); await delay(100);
  };
  const passed = () => page.evaluate("return document.querySelector('[data-tutorial-passed]').dataset.tutorialPassed==='true';");
  const advance = async ms => { await page.evaluate(`store.getState().setPaused(true);sim.net.scheduler.advanceTo(sim.net.now+${ms});`); await delay(100); };
  const screenshot = async name => { const png = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); await writeFile(path.join(directory, name + '.png'), Buffer.from(png.data, 'base64')); };
  const mount = async (reload = false) => {
    await page.send(reload ? 'Page.reload' : 'Page.navigate', reload ? { ignoreCache: true } : { url }); await wait("document.readyState==='complete'&&document.getElementById('root')");
    await page.evaluate(`window.store=(await import('/src/store.ts')).useStore;window.sim=(await import('/src/sim.ts')).sim;window.serial=await import('/src/engine/serialize.ts');window.lang=(await import('/src/i18n/index.ts')).useLanguage;window.theme=(await import('/src/uiTheme.ts')).useUiTheme;lang.getState().setLanguage('de');window.ws=await (await import('/src/workspace/reviewEntry.tsx')).mountWorkspaceReview(document.getElementById('root'),{databaseName:${JSON.stringify(database)}});`);
    await wait("document.querySelector('.react-flow')"); await delay(120);
    await page.evaluate("window.flow=(await import('/src/workspace/viewportProbe.browser.tsx')).getViewportProbe();");
  };
  const reloadAt = async step => {
    await page.evaluate('await ws.controller.flush();');
    await wait("document.querySelector('[data-guided-saving=\"false\"]')");
    const before=await page.evaluate('return {topology:JSON.stringify(serial.serializeNetwork(sim.net,{})),tabs:ws.controller.getState().drafts.length,active:ws.controller.getState().activeDraftId};');
    await mount(true); await wait(`document.querySelector('[data-guided-step="${step}"]')`);
    assert.deepEqual(await page.evaluate('return {topology:JSON.stringify(serial.serializeNetwork(sim.net,{})),tabs:ws.controller.getState().drafts.length,active:ws.controller.getState().activeDraftId};'),before);
    await page.evaluate('window.tutorialNetwork=sim.net;');
  };
  const menu = async () => { if (await page.evaluate('return innerWidth<1100;')) await click('.toolbar-menu-trigger', 'Menü'); await click('.toolbar-menu-trigger,.toolbar-menu-action', 'Übungen (Beta)'); await click('[data-guided-menu-toggle]'); };
  const a = 'tutorial-01-a', sw = 'tutorial-01-switch';
  let tutorialId, personalId, personalDocument, betaBefore;
  try {
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }); await mount();
    await page.evaluate("theme.getState().setTheme('graphite-dark');store.getState().addDeviceAt('host',{x:300,y:300});await ws.controller.flush();window.betaBefore=await ws.repository.getMeta('exercises:beta:v1');");
    personalId = await page.evaluate('return ws.controller.getState().activeDraftId;'); personalDocument = await page.evaluate('return JSON.stringify(store.getState().captureWorkspaceDocument());');
    betaBefore=await page.evaluate('return betaBefore;');
    await test('separate menu entry creates the three-device lab, preserves the personal plan and requires the A-switch cable', async () => {
      await menu(); assert.equal(await page.evaluate("return document.querySelectorAll('.exercise-menu-entry').length;"), 6);
      await click('[data-start-tutorial]'); await wait("document.querySelector('[data-guided-step=" + '"1"' + "]')");
      await wait('flow.getZoom()<=.65'); await delay(150);
      tutorialId = await page.evaluate('return ws.controller.getState().activeDraftId;');
      assert.notEqual(tutorialId, personalId);
      assert(await page.evaluate("return sim.net.devices.size===3&&sim.net.links.size===1&&!sim.net.devices.get('tutorial-01-a').getInterface('eth0').ip&&!document.querySelector('[data-guided-step]').textContent.includes('192.168.10.10');"));
      assert.equal(await passed(), false); await screenshot('01-kabel-verbinden');
      const from = await point('.react-flow__node[data-id=' + a + '] .react-flow__handle[data-handleid=r]');
      const to = await point('.react-flow__node[data-id=' + sw + '] .react-flow__handle[data-handleid=l]');
      await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...from });
      await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...from, button: 'left', clickCount: 1 });
      for (let i = 1; i <= 15; i++) await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from.x + (to.x - from.x) * i / 15, y: from.y + (to.y - from.y) * i / 15, buttons: 1 });
      await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...to, button: 'left', clickCount: 1 });
      await wait("document.querySelector('[data-tutorial-passed]').dataset.tutorialPassed==='true'");
      await page.evaluate('window.tutorialNetwork=sim.net;window.panelViewport=flow.getViewport();');
      const handle = await point('.exercise-heading strong');
      await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...handle, button: 'left', clickCount: 1 });
      for (let i = 1; i <= 8; i++) await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: handle.x + i * 15, y: handle.y + i * 3, buttons: 1 });
      await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: handle.x + 120, y: handle.y + 24, button: 'left', clickCount: 1 });
      assert.deepEqual(await page.evaluate('return flow.getViewport();'), await page.evaluate('return panelViewport;'));
      await click('.exercise-position-reset'); await click('.exercise-panel footer button', 'Weiter');
      await wait("document.querySelector('[data-guided-step=" + '"2"' + "]')");
      await reloadAt(2); assert.equal(await passed(),false);
    });
    await test('Inspector and Linux terminal both satisfy IPv4; wrong values and contextual help preserve the current step', async () => {
      await page.evaluate(`store.getState().select(${JSON.stringify(a)});`); await wait("document.querySelector('.inspector [role=tab]')");
      await click('.inspector [role=tab]', 'Netzwerk');
      await page.evaluate('window.beforeHelp=JSON.stringify(store.getState().captureWorkspaceDocument());window.helpViewport=flow.getViewport();');
      await click('.exercise-panel [data-help-page=ipv4]'); await wait("document.querySelector('.learning-help[open]')");
      await key('Escape', 'Escape', 27); await wait("!document.querySelector('.learning-help')");
      assert.equal(await page.evaluate('return JSON.stringify(store.getState().captureWorkspaceDocument());'), await page.evaluate('return beforeHelp;'));
      assert.deepEqual(await page.evaluate('return flow.getViewport();'), await page.evaluate('return helpViewport;'));
      await type('.inspector input[aria-label="IP-Adresse eth0"]', '192.168.10.11/25'); await click('.inspector input[aria-label="Subnetzmaske eth0"]');
      await wait("sim.net.devices.get('tutorial-01-a').getInterface('eth0').ip?.prefix===25"); assert.equal(await passed(), false);
      await screenshot('02-ipv4-konfigurieren');
      await type('.inspector input[aria-label="IP-Adresse eth0"]', '192.168.10.10/24'); await click('.inspector input[aria-label="Subnetzmaske eth0"]');
      await wait("document.querySelector('[data-tutorial-passed]').dataset.tutorialPassed==='true'");
      await click('.react-flow__node[data-id=' + a + '] .device-terminal'); await wait("document.querySelector('.xterm-helper-textarea')");
      await command('ip address del 192.168.10.10/24 dev eth0'); assert.equal(await passed(), false);
      await command('ip address add 192.168.10.10/24 dev eth0'); await wait("document.querySelector('[data-tutorial-passed]').dataset.tutorialPassed==='true'");
      await click('.exercise-panel footer button', 'Zurück'); await wait("document.querySelector('[data-guided-step=" + '"1"' + "]')");
      await click('.exercise-panel footer button', 'Weiter'); await click('.exercise-panel footer button', 'Weiter');
      await wait("document.querySelector('[data-guided-step=" + '"3"' + "]')");
      assert(await page.evaluate('return sim.net===tutorialNetwork;'));
    });
    await test('wrong target, automatic probes and Quick Ping cannot finish; a native terminal ping completes without a gateway', async () => {
      await command('ping -c 1 192.168.10.99'); await advance(8000); assert.equal(await passed(), false);
      assert(await page.evaluate("return document.querySelector('[data-guided-step]').textContent.includes('Verwenden Sie PC B');"));
      await page.evaluate("const checker=await import('/src/labs/checker.ts');checker.runChecks(sim.net,[{id:'probe',label:'probe',check:{type:'ping',from:'tutorial-01-a',toDevice:'tutorial-01-b',resolveBy:'id',expect:'success'}}],()=>{},()=>{});");
      await advance(6000); assert.equal(await passed(), false);
      await page.evaluate("store.getState().beginQuickPing('tutorial-01-a');store.getState().chooseQuickPingTarget('tutorial-01-b');"); await delay(150); await advance(12000);
      assert.equal(await passed(), false);
      await command('ping -c 1 192.168.10.20'); await advance(6000);
      await wait("document.querySelector('[data-guided-step=\"4\"]')"); assert.equal(await passed(), false);
      await key('c', 'KeyC', 67, 2); assert.equal(await passed(), false);
      await command('Ctrl+C'); assert.equal(await passed(), false);
      await command('ping 192.168.10.20'); await advance(1500);
      await reloadAt(4); assert.equal(await passed(),false);
      assert(await page.evaluate("return !!document.querySelector('[data-guided-repeat]')&&sim.net.scheduler.pending===0;"));
      await screenshot('04-recuperado-repetir-ping');
      await page.evaluate("store.getState().openTerminal('tutorial-01-a');"); await wait("document.querySelector('.xterm-helper-textarea')");
      await command('ping 192.168.10.20'); await advance(1500);
      await page.evaluate("const t=await import('/src/terminals.ts');const b=t.getSession(sim.net.devices.get('tutorial-01-b'));b.executeCommand('ping 192.168.10.10');b.term.input('\\x03',true);");
      assert.equal(await passed(), false);
      await page.send('Input.insertText', { text: 'Ctrl+C' }); assert.equal(await passed(), false);
      await screenshot('04-ping-beenden-pending');
      await key('c', 'KeyC', 67, 2); await screenshot('03-verbindung-bestanden');
      assert.equal(await passed(), true);
      assert(await page.evaluate("return !document.querySelector('[data-guided-step]').textContent.includes('Beenden Sie den laufenden Ping im Terminal von PC A mit:');"));
      assert(await page.evaluate("return !sim.net.devices.get('tutorial-01-a').getInterface('eth0').gateway&&document.querySelector('.exercise-learning').textContent.includes('ohne Gateway');"));
      assert.deepEqual(await page.evaluate("return await ws.repository.getMeta('exercises:beta:v1');"), betaBefore);
      await page.evaluate(`await ws.controller.switchDraft(${JSON.stringify(personalId)});`); await wait("!document.querySelector('[data-guided-step]')");
      assert.equal(await page.evaluate('return JSON.stringify(store.getState().captureWorkspaceDocument());'), personalDocument);
      await menu(); await click('[data-start-tutorial]'); await wait("document.querySelector('[data-guided-step=" + '"4"' + "]')");
      assert.equal(await passed(), true);
    });
    await test('PC C extends the same lab; wrong devices, Inspector-only IPv4 and non-learner pings cannot complete it', async () => {
      await page.evaluate("store.getState().setHostCreationMode('windows');");
      await click('.exercise-panel footer button', 'Weiter'); await wait("document.querySelector('[data-guided-step=\"5\"]')");
      const mode = () => page.evaluate("return document.querySelector('.host-creation-mode select').value;");
      const chooseMode = async value => {
        await page.evaluate(`const e=document.querySelector('.host-creation-mode select');e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}));`); await delay(80);
      };
      const dragHost = async os => {
        const count = await page.evaluate('return store.getState().nodes.length;');
        const drop = await page.evaluate(`const r=document.querySelector('.react-flow').getBoundingClientRect();
          for(let y=r.top+30;y<r.bottom-20;y+=40)for(let x=r.left+30;x<r.right-20;x+=40)
            if(document.elementFromPoint(x,y)?.classList.contains('react-flow__pane'))return {x,y};
          throw Error('No unobstructed canvas drop target');`);
        const data = { items: [{ mimeType: 'application/netsim', data: 'host' }], dragOperationsMask: 16 };
        for (const event of ['dragEnter','dragOver','drop']) await page.send('Input.dispatchDragEvent', { type: event, ...drop, data });
        await delay(120);
        assert.equal(await page.evaluate('return store.getState().nodes.length;'), count + 1);
        assert.equal(await page.evaluate('return sim.net.devices.get(store.getState().nodes.at(-1).id).os;'), os);
      };
      assert.equal(await mode(), 'linux');
      assert.equal(await page.evaluate("return localStorage.getItem('netsim:host-creation:v1');"), 'windows');
      await chooseMode('windows'); await page.evaluate('store.getState().refresh();');
      assert.equal(await mode(), 'windows');
      await reloadAt(5); assert.equal(await mode(), 'linux');
      await page.evaluate(`await ws.controller.switchDraft(${JSON.stringify(personalId)});`);
      await wait("!document.querySelector('[data-guided-step]')"); assert.equal(await mode(), 'windows');
      await page.evaluate(`await ws.controller.switchDraft(${JSON.stringify(tutorialId)});`);
      await wait("document.querySelector('[data-guided-step=\"5\"]')"); assert.equal(await mode(), 'linux');
      await page.evaluate("window.expansionNetwork=sim.net;window.expansionOriginal=[...sim.net.devices.values()];store.getState().setTerminalDockCollapsed(true);store.getState().select(null);");
      await screenshot('05-pc-c-hinzufuegen');
      await chooseMode('windows');
      await click('.palette-item.kind-host'); assert.equal(await passed(), false);
      assert.equal(await page.evaluate("return sim.net.devices.get(store.getState().nodes.at(-1).id).os;"), 'windows');
      await dragHost('windows'); assert.equal(await passed(), false);
      await chooseMode('mixed'); assert.equal(await mode(), 'mixed');
      await click('.palette-item.kind-server'); assert.equal(await passed(), false);
      await chooseMode('linux'); await click('.palette-item.kind-host');
      await wait("document.querySelector('[data-tutorial-passed]').dataset.tutorialPassed==='true'");
      const c = await page.evaluate("return [...sim.net.devices.values()].find(d=>!expansionOriginal.includes(d)&&d.kind==='host'&&d.os==='linux').id;");
      await wait(`sim.net.devices.get(${JSON.stringify(c)}).name==='PC C'`);
      await dragHost('linux');
      await page.evaluate('store.getState().undoTopology();');
      assert.equal(await page.evaluate("return localStorage.getItem('netsim:host-creation:v1');"), 'windows');
      await click('.exercise-panel footer button', 'Weiter');
      assert.equal(await mode(), 'windows');
      await page.evaluate(`store.getState().onConnect({source:${JSON.stringify(c)},target:store.getState().nodes.find(n=>n.data.kind==='server').id});`);
      assert.equal(await passed(), false);
      await page.evaluate(`const l=[...sim.net.links.values()].find(l=>l.a.device.id===${JSON.stringify(c)}||l.b.device.id===${JSON.stringify(c)});store.getState().onEdgesChange([{type:'remove',id:l.id}]);store.getState().onConnect({source:${JSON.stringify(c)},target:'tutorial-01-switch'});`);
      await wait("document.querySelector('[data-tutorial-passed]').dataset.tutorialPassed==='true'"); await screenshot('06-pc-c-kabel');
      await click('.exercise-panel footer button', 'Weiter');
      await page.evaluate(`store.getState().select(${JSON.stringify(c)});`); await wait("document.querySelector('.inspector [role=tab]')");
      await click('.inspector [role=tab]', 'Netzwerk');
      await wait("[...document.querySelectorAll('.inspector input[aria-label=\"IP-Adresse eth0\"]')].some(e=>e.getClientRects().length)");
      assert(await page.evaluate("return !document.querySelector('[data-guided-step]').textContent.includes('entfernen');"));
      await type('.inspector input[aria-label="IP-Adresse eth0"]', '192.168.10.30/24'); await click('.inspector input[aria-label="Subnetzmaske eth0"]');
      await click('.exercise-panel h3');
      await wait(`sim.net.devices.get(${JSON.stringify(c)}).getInterface('eth0').ip?.prefix===24`);
      assert.equal(await passed(), false);
      await wait("document.querySelector('[data-guided-step]').textContent.includes('entfernen')");
      await click('.exercise-panel [data-help-page=ipv4]'); await wait("document.querySelector('.learning-help[open]')"); await key('Escape','Escape',27);
      await page.evaluate(`store.getState().terminals.forEach(id=>store.getState().closeTerminal(id));store.getState().openTerminal(${JSON.stringify(c)});`);
      await wait("document.querySelector('.xterm-helper-textarea')");
      await command('ip address add 192.168.10.30/24 dev eth0'); assert.equal(await passed(), false);
      await command('ip address del 192.168.10.30/24 dev eth0'); await screenshot('07-pc-c-ipv4-terminal');
      await command('ip address add 192.168.10.30/24 dev eth0'); assert.equal(await passed(), true);
      await reloadAt(7); assert.equal(await passed(),true);
      await screenshot('07-recuperado-terminal-ipv4');
      assert.equal(await page.evaluate(`return sim.net.devices.get(${JSON.stringify(c)}).name;`),'PC C');
      await page.evaluate(`window.expansionNetwork=sim.net;window.expansionOriginal=[...sim.net.devices.values()];store.getState().openTerminal(${JSON.stringify(c)});`);
      await wait("document.querySelector('.xterm-helper-textarea')");
      await click('.exercise-panel footer button', 'Weiter');
      assert(await page.evaluate("const text=document.querySelector('[data-guided-step]').textContent;return text.includes('Achten Sie auf ARP!')&&text.includes('gültiger ARP-Cache-Eintrag');"));
      await screenshot('08-arp-hinweis');
      await command('ping -c 1 192.168.10.99'); await advance(8000); assert.equal(await passed(), false);
      await page.evaluate(`store.getState().beginQuickPing(${JSON.stringify(c)});store.getState().chooseQuickPingTarget('tutorial-01-b');`); await delay(150); await advance(12000); assert.equal(await passed(), false);
      assert(await page.evaluate(`return sim.net.devices.get(${JSON.stringify(c)}).arpTable.has((await import('/src/engine/ip.ts')).parseIp('192.168.10.20'));`));
      await command('ping 192.168.10.20'); await advance(1500); assert.equal(await passed(), true);
      assert.equal(await page.evaluate("return !!document.querySelector('[data-tutorial-finished]');"),false);
      await screenshot('08-pc-c-verbindung'); await key('c','KeyC',67,2);
      await wait("document.querySelector('[data-tutorial-finished=true]')");
      assert(await page.evaluate("return document.querySelector('[data-tutorial-finished]').textContent.includes('Tutorial abgeschlossen!');"));
      await screenshot('09-tutorial-abgeschlossen');
      assert(await page.evaluate('return sim.net===expansionNetwork&&expansionOriginal.every(d=>sim.net.devices.get(d.id)===d);'));
      const saved = await page.evaluate('return JSON.stringify(serial.serializeNetwork(sim.net,{}));');
      for(let i=0;i<7;i++) await click('.exercise-panel footer button','Zurück');
      for(let i=0;i<7;i++) { assert.equal(await passed(),true); await click('.exercise-panel footer button','Weiter'); }
      assert.equal(await page.evaluate('return JSON.stringify(serial.serializeNetwork(sim.net,{}));'), saved);
    });
    await test('compact Light, reload, Continue and explicit Restart preserve independent tutorial drafts', async () => {
      for (const language of ['en', 'pt-BR', 'de']) { await page.evaluate(`lang.getState().setLanguage(${JSON.stringify(language)});`); await delay(80); assert(await page.evaluate("return !!document.querySelector('[data-guided-step=" + '"8"' + "]');")); }
      await page.evaluate("store.getState().setTerminalDockCollapsed(true);store.getState().select(null);theme.getState().setTheme('classic-light');");
      await page.send('Emulation.setDeviceMetricsOverride', { width: 700, height: 800, deviceScaleFactor: 1, mobile: false }); await delay(150);
      await click('.react-flow__controls-fitview'); await delay(150);
      assert(await page.evaluate("const r=document.querySelector('.exercise-panel').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight&&document.documentElement.scrollWidth<=innerWidth+1;"));
      await screenshot('04-classic-light-700');
      const before = await page.evaluate('await ws.controller.flush();return {configuration:JSON.stringify(serial.serializeNetwork(sim.net,{})),tabs:ws.controller.getState().drafts.length,active:ws.controller.getState().activeDraftId};');
      await reloadAt(8); assert.equal(await passed(),true);
      assert(await page.evaluate("return !!document.querySelector('[data-tutorial-finished=true]');"));
      assert.deepEqual(await page.evaluate('return {configuration:JSON.stringify(serial.serializeNetwork(sim.net,{})),tabs:ws.controller.getState().drafts.length,active:ws.controller.getState().activeDraftId};'), before);
      assert.equal(before.active, tutorialId);
      const progress=await page.evaluate(`return await ws.repository.getMeta('guided:v1:draft:'+${JSON.stringify(tutorialId)});`);
      assert(progress.ok&&progress.value); assert.equal(progress.value.value.step,8);
      assert.deepEqual(progress.value.value.completed,[1,2,3,4,5,6,7,8]);
      assert.equal(Object.hasOwn(progress.value.value,'topology'),false);
      await screenshot('10-tutorial-recuperado');
      const tabs=before.tabs;
      await menu(); await click('[data-start-tutorial]'); await wait("document.querySelector('[data-guided-step=\"8\"]')");
      assert.equal(await page.evaluate('return ws.controller.getState().drafts.length;'),tabs);
      await menu(); await click('[data-restart-tutorial]'); await wait("document.querySelector('[data-guided-step=\"1\"]')");
      assert.equal(await page.evaluate('return ws.controller.getState().drafts.length;'),tabs+1);
      assert.notEqual(await page.evaluate('return ws.controller.getState().activeDraftId;'),tutorialId);
      await page.evaluate(`await ws.controller.switchDraft(${JSON.stringify(tutorialId)});`); await wait("document.querySelector('[data-guided-step=\"8\"]')");
      assert.equal(await passed(),true);
    });
    if(process.env.NETLAB_CHAPTER_RESTART_REVIEW==='1'){
      const {reviewChapterRestart}=await import('./chapter-restart-review.mjs');
      await reviewChapterRestart({page,root,report,wait,delay,click,mount,chapter:'first-connection'});
    }
    if (process.env.NETLAB_SUBNET_TUTORIAL_REVIEW === '1') {
      const { runSubnetTutorialReview } = await import('./subnet-tutorial-review.mjs');
      await runSubnetTutorialReview({ page, root, report, wait, delay, click, command, advance, mount, tutorialId, personalId });
      if(process.env.NETLAB_CHAPTER_RESTART_REVIEW==='1'){
        const {reviewChapterRestart}=await import('./chapter-restart-review.mjs');
        await reviewChapterRestart({page,root,report,wait,delay,click,mount,chapter:'subnet-mask'});
      }
      if(process.env.NETLAB_ROUTER_TUTORIAL_REVIEW==='1') {
        const {runRouterTutorialReview}=await import('./router-tutorial-review.mjs');
        await runRouterTutorialReview({page,root,report,wait,delay,click,command,advance,mount,menu,tutorialId});
      }
    }
    report.guidedTutorialReview = { directory, captures: ['01-kabel-verbinden.png', '02-ipv4-konfigurieren.png', '03-verbindung-bestanden.png', '04-ping-beenden-pending.png', '05-pc-c-hinzufuegen.png', '06-pc-c-kabel.png', '07-pc-c-ipv4-terminal.png', '08-arp-hinweis.png', '08-pc-c-verbindung.png', '09-tutorial-abgeschlossen.png', '04-classic-light-700.png'] };
  } finally {
    await page.evaluate('window.ws?.dispose();');
    await page.evaluate(`await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase(${JSON.stringify(database)});r.onsuccess=resolve;r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Tutorial cleanup blocked'));});`);
  }
}
