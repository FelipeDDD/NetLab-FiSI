import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { generateReview } from './visual-review.mjs';

// Invoked after the eight real Chapter 1 steps, in the same disposable draft.
export async function runSubnetTutorialReview({ page, root, report, wait, delay, click, command, advance, mount, tutorialId, personalId }) {
  const directory = path.join(root, '.playwright-mcp/reviews/raw/subnet-tutorial-staging'), captures = [], d = 'tutorial-02-d';
  let chapterOneMeta;
  await mkdir(directory, { recursive: true });
  const test = async (name, fn) => { try { await fn(); report.results['subnet tutorial: ' + name] = { passed: true }; } catch (e) { report.results['subnet tutorial: ' + name] = { passed: false, error: e.stack }; throw e; } };
  const passed = () => page.evaluate("return document.querySelector('[data-subnet-passed]')?.dataset.subnetPassed==='true';");
  const step = n => wait(`document.querySelector('[data-subnet-step="${n}"]')`);
  const text = () => page.evaluate("return document.querySelector('[data-subnet-step]').textContent;");
  const type = async (selector, value) => {
    await click(selector); for (const type of ['keyDown', 'keyUp']) await page.send('Input.dispatchKeyEvent', { type, key: 'a', code: 'KeyA', modifiers: 2, windowsVirtualKeyCode: 65 });
    await page.send('Input.insertText', { text: value }); await delay(100);
  };
  const interrupt = async () => {
    await page.evaluate("const t=document.querySelector('.xterm-helper-textarea');t.focus();");
    for (const type of ['keyDown', 'keyUp']) await page.send('Input.dispatchKeyEvent', { type, key: 'c', code: 'KeyC', modifiers: 2, windowsVirtualKeyCode: 67 });
    await delay(100);
  };
  const shot = async (scene, variant = 'graphite-dark', width = 1440, height = 1000) => {
    await delay(100); const r = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); await writeFile(path.join(directory, scene + '.png'), Buffer.from(r.data, 'base64'));
    captures.push({ source: path.relative(root, path.join(directory, scene + '.png')).split(path.sep).join('/'), scene, variant, state: 'normal', width, height });
  };
  const saved = async () => { await wait("document.querySelector('[data-subnet-saving=false]')"); await page.evaluate('const r=await ws.controller.flush();if(!r.ok)throw Error(JSON.stringify(r));'); };
  const reload = async n => {
    await saved(); const before = await page.evaluate('return {topology:serial.serializeNetwork(sim.net,{}),active:ws.controller.getState().activeDraftId,tabs:ws.controller.getState().drafts.length};');
    await mount(true); await step(n); await delay(120);
    assert.deepEqual(await page.evaluate('return {topology:serial.serializeNetwork(sim.net,{}),active:ws.controller.getState().activeDraftId,tabs:ws.controller.getState().drafts.length};'), before);
    assert.equal(await page.evaluate(`return [...sim.net.devices.values()].filter(d=>d.id===${JSON.stringify(d)}).length;`), 1);
  };
  await test('transition keeps Chapter 1, original devices and positions; PC D has one undo/redo operation', async () => {
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await page.evaluate("theme.getState().setTheme('graphite-dark');store.getState().select(null);store.getState().setTerminalDockCollapsed(true);window.chapterOneDevices=[...sim.net.devices.values()];window.chapterOnePositions=store.getState().nodes.map(n=>({id:n.id,position:n.position}));window.chapterOneHistory=store.getState().topologyHistory.past.length;");
    chapterOneMeta = await page.evaluate("return (await ws.repository.getMeta('guided:v1:draft:'+ws.controller.getState().activeDraftId)).value.value;");
    await click('[data-start-subnet]'); await step(1); await saved();
    assert.equal(await page.evaluate('return ws.controller.getState().activeDraftId;'), tutorialId);
    assert(await page.evaluate(`const d=sim.net.devices.get(${JSON.stringify(d)}),i=d.getInterface('eth0');return d.os==='linux'&&i.ip.addr===(await import('/src/engine/ip.ts')).parseIp('192.168.10.12')&&i.ip.prefix===28&&i.gateway===null&&i.link.operational&&chapterOneDevices.every(old=>sim.net.devices.get(old.id)===old)&&JSON.stringify(store.getState().nodes.filter(n=>n.id!==d.id).map(n=>({id:n.id,position:n.position})))===JSON.stringify(chapterOnePositions);`));
    assert.equal(await page.evaluate('return store.getState().topologyHistory.past.length;'), await page.evaluate('return chapterOneHistory+1;'));
    assert.deepEqual(await page.evaluate("return (await ws.repository.getMeta('guided:v1:draft:'+ws.controller.getState().activeDraftId)).value.value;"), chapterOneMeta);
    await page.evaluate('store.getState().undoTopology();'); assert.equal(await page.evaluate(`return sim.net.devices.has(${JSON.stringify(d)});`), false); await delay(100);
    assert((await text()).includes('fehlt')); await page.evaluate('store.getState().redoTopology();'); await saved();
    assert.equal(await page.evaluate("return document.querySelector('#guided-subnet-mask').value;"), '255.255.'); assert(!(await text()).includes('255.255.255.240')); await shot('01-mask-question');
  });
  await test('keyboard inspection, wrong answers and partially entered mask survive F5', async () => {
    await type('#guided-subnet-mask', '255.255.255.240'); await click('.guided-subnet-answer button'); assert.equal(await passed(), false);
    await click('[data-exercise=guided-subnet-mask] .exercise-body > button'); await wait("document.querySelector('.xterm-helper-textarea')");
    await page.evaluate(`(await import('/src/terminals.ts')).getSession(sim.net.devices.get(${JSON.stringify(d)})).executeCommand('ip addr');`); await delay(100); await click('.guided-subnet-answer button'); assert.equal(await passed(), false);
    await command('ip addr'); await type('#guided-subnet-mask', '255.255.25'); await reload(1);
    assert.equal(await page.evaluate("return document.querySelector('#guided-subnet-mask').value;"), '255.255.25');
    await type('#guided-subnet-mask', '255.255.255.224'); await click('.guided-subnet-answer button'); assert.equal(await passed(), false); assert(await page.evaluate("return document.querySelector('#guided-subnet-mask').getAttribute('aria-invalid')==='true';"));
    await type('#guided-subnet-mask', '255.255.255.240'); await click('.guided-subnet-answer button'); assert.equal(await passed(), true);
    await page.evaluate("window.chapterCommands=[];window.releaseChapterCommands=(await import('/src/terminalCommandEvents.ts')).observeTerminalCommands(e=>chapterCommands.push({type:e.type,source:e.command.source,line:e.command.line,text:e.text}));");
    await click('.exercise-panel footer button', 'Weiter'); await step(2); await wait("chapterCommands.some(e=>e.type==='started'&&e.source==='api')");
    await page.evaluate('store.getState().setPaused(true);'); await advance(900); await wait("document.querySelector('[data-subnet-passed=true]')");
  });
  await test('eight-request demo passes on the first reply and supports early Ctrl+C; F5 never runs it again', async () => {
    assert.equal(await page.evaluate("return chapterCommands.filter(e=>e.type==='started'&&e.source==='api'&&e.line==='ping -c 8 192.168.10.10').length;"), 1);
    assert.equal(await page.evaluate("return chapterCommands.filter(e=>e.type==='output'&&e.text.startsWith('64 bytes from 192.168.10.10:')).length;"), 1);
    assert.equal(await page.evaluate("return chapterCommands.filter(e=>e.type==='finished'&&e.source==='api').length;"), 0);
    assert.equal(await page.evaluate(`return (await import('/src/terminals.ts')).getSession(sim.net.devices.get(${JSON.stringify(d)})).executeCommand('hostname');`), 'busy');
    await interrupt(); assert.equal(await passed(), true);
    await shot('02-real-demonstration'); await reload(2); assert.equal(await passed(), true);
    await page.evaluate("window.afterReloadCommands=[];(await import('/src/terminalCommandEvents.ts')).observeTerminalCommands(e=>afterReloadCommands.push({type:e.type,source:e.command.source,line:e.command.line,text:e.text}));"); await delay(180); assert.equal(await page.evaluate('return afterReloadCommands.length;'), 0);
    for (const language of ['en', 'pt-BR', 'de']) { await page.evaluate(`lang.getState().setLanguage(${JSON.stringify(language)});`); await delay(60); assert.equal(await passed(), true); }
  });
  await test('manual repeat resumes Run only when accepted, respects learner commands and completes eight real requests', async () => {
    await page.evaluate(`store.getState().openTerminal(${JSON.stringify(d)});`); await wait("document.querySelector('.xterm-helper-textarea')");
    await command('ping 192.168.10.10'); await page.evaluate('store.getState().setPaused(true);');
    await click('.exercise-panel button', 'Ping erneut ausführen');
    assert.equal(await page.evaluate('return store.getState().paused;'), true);
    assert.equal(await page.evaluate("return afterReloadCommands.filter(e=>e.type==='started'&&e.source==='api').length;"), 0);
    assert((await text()).includes('beschäftigt')); await interrupt();
    await click('.exercise-panel button', 'Ping erneut ausführen');
    await wait('!store.getState().paused'); await wait("afterReloadCommands.some(e=>e.type==='started'&&e.source==='api')");
    assert.equal(await page.evaluate(`return (await import('/src/terminals.ts')).getSession(sim.net.devices.get(${JSON.stringify(d)})).executeCommand('hostname');`), 'busy');
    await advance(10000); assert.equal(await passed(), true);
    assert.equal(await page.evaluate("const api=afterReloadCommands.filter(e=>e.type==='started'&&e.source==='api');return api.length;"), 1);
    assert.equal(await page.evaluate("return afterReloadCommands.filter(e=>e.type==='output'&&e.source==='api'&&e.text.startsWith('64 bytes from 192.168.10.10:')).length;"), 8);
    await click('.exercise-panel footer button', 'Weiter'); await step(3);
  });
  await test('only the learner no-route result reveals the explanation', async () => {
    assert.equal(await page.evaluate('return !!document.querySelector("[data-subnet-failure-explanation]");'), false);
    await page.evaluate(`store.getState().openTerminal(${JSON.stringify(d)});`); await wait("document.querySelector('.xterm-helper-textarea')");
    await page.evaluate(`(await import('/src/terminals.ts')).getSession(sim.net.devices.get(${JSON.stringify(d)})).executeCommand('ping -c 1 192.168.10.20');`); await delay(100); assert.equal(await passed(), false);
    await command('ping -c 1 192.168.10.13'); await advance(6000); assert.equal(await passed(), false);
    await command('ping -c 3 192.168.10.20'); await wait("document.querySelector('[data-subnet-passed=true]')"); assert(await page.evaluate('return !!document.querySelector("[data-subnet-failure-explanation]");')); await shot('03-no-route-observed');
    await reload(3); assert.equal(await passed(), true); await click('.exercise-panel footer button', 'Weiter'); await step(4);
  });
  await test('Inspector /27 passes; new Echo Replies from B and C are required across F5 and plan switches', async () => {
    assert(!(await text()).includes('255.255.255.0')); assert(!(await text()).includes('ip addr add'));
    await page.evaluate(`store.getState().select(${JSON.stringify(d)});`); await click('.inspector [role=tab]', 'Netzwerk');
    await type('.inspector input[aria-label="Subnetzmaske eth0"]', '/27'); await click('.inspector input[aria-label="DNS-Server eth0"]');
    await wait(`sim.net.devices.get(${JSON.stringify(d)}).getInterface('eth0').ip.prefix===27`); assert.equal(await passed(), true);
    await click('.exercise-panel footer button', 'Weiter'); await step(5); assert.equal(await passed(), false);
    await page.evaluate("store.getState().select(null);store.getState().setTerminalDockCollapsed(true);await flow.fitView({padding:.3,maxZoom:.65});");
    await click(`.react-flow__node[data-id="${d}"] .device-ping`);
    await wait(`store.getState().quickPing?.sourceId===${JSON.stringify(d)}`);
    await click('.react-flow__node[data-id="tutorial-01-b"] .device-node');
    await wait('store.getState().quickPing===null');
    assert.equal(await page.evaluate("return document.querySelector('[data-subnet-reply=b]').dataset.tutorialPassed;"), 'false');
    await advance(6000); await wait("document.querySelector('[data-subnet-reply=b][data-tutorial-passed=true]')"); assert.equal(await passed(), false);
    await reload(5); assert(await page.evaluate("return document.querySelector('[data-subnet-reply=b]').dataset.tutorialPassed==='true';"));
    await page.evaluate(`await ws.controller.switchDraft(${JSON.stringify(personalId)});`); await wait("!document.querySelector('[data-subnet-step]')");
    await page.evaluate(`await ws.controller.switchDraft(${JSON.stringify(tutorialId)});`); await step(5); await delay(120);
    assert(await page.evaluate("return document.querySelector('[data-subnet-reply=b]').dataset.tutorialPassed==='true';"));
    await page.evaluate(`store.getState().openTerminal(${JSON.stringify(d)});`); await wait("document.querySelector('.xterm-helper-textarea')");
    await command('ping -c 1 192.168.10.30'); await advance(6000); await wait("document.querySelector('[data-subnet-finished]')"); assert.equal(await passed(), true); await shot('04-chapter-completed');
  });
  await test('Back keeps topology and Chapter 1 receipts; translated completion fits 700px Light and survives F5', async () => {
    const topology = await page.evaluate('return serial.serializeNetwork(sim.net,{});');
    for (let i = 0; i < 5; i++) await click('.exercise-panel footer button', 'Zurück');
    await wait("document.querySelector('[data-guided-step=\"8\"]')"); assert(await page.evaluate('return !!document.querySelector("[data-tutorial-finished=true]");'));
    assert.deepEqual(await page.evaluate("return (await ws.repository.getMeta('guided:v1:draft:'+ws.controller.getState().activeDraftId)).value.value;"), chapterOneMeta);
    await click('[data-start-subnet]'); await step(1); for (let i = 0; i < 4; i++) await click('.exercise-panel footer button', 'Weiter'); await step(5); assert.deepEqual(await page.evaluate('return serial.serializeNetwork(sim.net,{});'), topology);
    for (const [language, expected] of [['en', 'Chapter completed!'], ['pt-BR', 'Capítulo concluído!'], ['de', 'Kapitel abgeschlossen!']]) { await page.evaluate(`lang.getState().setLanguage(${JSON.stringify(language)});`); await delay(60); assert((await text()).includes(expected)); }
    await page.evaluate("theme.getState().setTheme('classic-light');store.getState().select(null);store.getState().setTerminalDockCollapsed(true);"); await page.send('Emulation.setDeviceMetricsOverride', { width: 700, height: 800, deviceScaleFactor: 1, mobile: false }); await delay(120);
    assert(await page.evaluate("const r=document.querySelector('.exercise-panel').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1&&document.documentElement.scrollWidth<=innerWidth+1;"));
    await shot('05-completed-light-700', 'classic-light', 700, 800); await reload(5); assert.equal(await passed(), true);
  });
  const main = ['01-mask-question', '02-real-demonstration', '05-completed-light-700'], manifest = path.join(directory, 'manifest.json');
  await writeFile(manifest, JSON.stringify({ id: 'guided-subnet-mask', title: 'Kapitel 2 – Subnetzmaske verstehen', variants: [{ id: 'graphite-dark', label: 'Graphite Dark' }, { id: 'classic-light', label: 'Classic Light' }], states: ['normal'], captures, share: captures.filter(c => main.includes(c.scene)).map(c => ({ ...c, name: c.scene })), shareContactSheet: false }));
  report.subnetTutorialReview = await generateReview(manifest);
}
