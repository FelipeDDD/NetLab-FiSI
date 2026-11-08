import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function reviewFloatingReferences({ page, open, click, key, wait, delay, test, directory, database }) {
  const pin = async index => {
    const selector = `.terminal-reference .reference-operation:nth-of-type(${index + 1}) .reference-pin`;
    await page.evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center'});`);
    await delay(80); await click(selector);
  };
  const first = '.floating-reference';
  const bounds = () => page.evaluate("return [...document.querySelectorAll('.floating-reference')].every(e=>{const r=e.getBoundingClientRect();return r.left>=7&&r.top>=7&&r.right<=innerWidth-7&&r.bottom<=innerHeight-7&&e.scrollWidth<=e.clientWidth+1;});");
  const screenshot = async name => {
    const png = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(path.join(directory, name + '.png'), Buffer.from(png.data, 'base64'));
  };
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false });
  await page.evaluate("theme.getState().setTheme('graphite-dark');window.lang=(await import('/src/i18n/index.ts')).useLanguage;lang.getState().setLanguage('de');store.getState().select('r1');");
  await delay(200);
  await test('pinning opens a background section, keeps help and focus available, and preserves shared content', async () => {
    await open(0);
    await page.evaluate("window.pinBefore={network:JSON.stringify(serial.serializeNetwork(sim.net,{})),transform:document.querySelector('.react-flow__viewport').style.transform,height:document.querySelector('.terminal-dock').getBoundingClientRect().height};");
    await pin(1);
    await wait("document.querySelector('dialog.terminal-reference[open]')&&document.querySelectorAll('.floating-reference').length===1");
    assert(await page.evaluate("return !!document.activeElement.closest('.terminal-reference')&&document.querySelector('.reference-pin-message').textContent.includes('(1/2)');"));
    await key('Escape', 'Escape', 27);
    assert(await bounds());
    assert(await page.evaluate("return document.querySelector('.floating-reference code').textContent==='ip route add <zielnetz/CIDR> via <gateway> [dev <interface>]'&&document.querySelector('.floating-reference').textContent.includes('Next Hop');"));
    await click(first + ' details summary');
    await click(first + ' .reference-example button');
    assert.equal((await page.evaluate('return copied;')).at(-1), 'ip route add 10.72.2.0/27 via 10.72.254.2 dev eth1');
    assert(await page.evaluate("return JSON.stringify(serial.serializeNetwork(sim.net,{}))===pinBefore.network&&document.querySelector('.react-flow__viewport').style.transform===pinBefore.transform&&document.querySelector('.terminal-dock').getBoundingClientRect().height===pinBefore.height&&terminals.getSession(sim.net.devices.get('pc1'))===originalSession;"));
  });
  await test('duplicate and third references stay blocked with localized feedback', async () => {
    await open(0); await pin(1);
    assert(await page.evaluate("return document.querySelector('.reference-pin-message').textContent.includes('bereits')&&document.querySelectorAll('.floating-reference').length===1;"));
    await page.evaluate("document.querySelector('.terminal-reference .reference-operation .reference-pin').focus();");
    await key('Enter', 'Enter', 13);
    await wait("document.querySelectorAll('.floating-reference').length===2&&document.querySelector('.terminal-reference[open]')");
    assert(await page.evaluate("return document.querySelector('.reference-pin-message').textContent.includes('(2/2)');"));
    await screenshot('floating-references-help-stays-open');
    await pin(2);
    for (const [language, text] of [['de', 'Zwei Referenzen'], ['en', 'Two references'], ['pt-BR', 'Duas referências']]) {
      await page.evaluate('lang.getState().setLanguage(' + JSON.stringify(language) + ');'); await delay(50);
      assert(await page.evaluate('return document.querySelector(".reference-pin-message").textContent.includes(' + JSON.stringify(text) + ');'));
    }
    await key('Escape', 'Escape', 27);
    await page.evaluate("lang.getState().setLanguage('de');");
    assert.equal(await page.evaluate("return document.querySelectorAll('.floating-reference').length;"), 2);
  });
  await test('pointer and keyboard drag are bounded without changing the canvas viewport', async () => {
    const start = await page.evaluate("const r=document.querySelector('.floating-reference-heading').getBoundingClientRect();return{x:r.x+30,y:r.y+15};");
    const dx = start.x > 160 ? -100 : 100;
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...start });
    await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...start, button: 'left', buttons: 1, clickCount: 1 });
    await delay(40);
    for (let i = 1; i <= 5; i++) {
      await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: start.x + dx * i / 5, y: start.y + 70 * i / 5, button: 'left', buttons: 1 });
      await delay(30);
    }
    await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: start.x + dx, y: start.y + 70, button: 'left', clickCount: 1 });
    await delay(80);
    const moved = await page.evaluate("return document.querySelector('.floating-reference-heading').getBoundingClientRect().x;");
    assert(Math.abs(moved - (start.x - 30)) > 5, JSON.stringify({ start, moved }));
    await page.evaluate("document.querySelector('.floating-reference-heading').focus();");
    await key('ArrowLeft', 'ArrowLeft', 37);
    assert.equal(await page.evaluate("return document.querySelector('.floating-reference-heading').getBoundingClientRect().x;"), moved - 5);
    assert(await bounds());
    assert(await page.evaluate("return document.querySelector('.react-flow__viewport').style.transform===pinBefore.transform;"));
  });
  await test('small screens and both themes retain reachable headers and scrolling content', async () => {
    for (const width of [1440, 700]) for (const selectedTheme of ['graphite-dark', 'classic-light']) {
      await page.send('Emulation.setDeviceMetricsOverride', { width, height: width === 700 ? 640 : 960, deviceScaleFactor: 1, mobile: false });
      await page.evaluate('theme.getState().setTheme(' + JSON.stringify(selectedTheme) + ');'); await delay(200);
      assert(await bounds());
      assert(await page.evaluate("return document.documentElement.scrollWidth<=innerWidth+1&&[...document.querySelectorAll('.floating-reference')].every(e=>{const h=e.querySelector('.floating-reference-heading').getBoundingClientRect();return h.height>28&&h.bottom<=innerHeight&&e.querySelector('.reference-content').clientHeight>40;});"));
      await screenshot('floating-references-' + selectedTheme + '-' + width);
    }
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }); await delay(200);
  });
  await test('device selection, terminal input and closing the dock preserve pinned references', async () => {
    await page.evaluate("store.getState().select('pc2');document.querySelector('[data-terminal-device=\"pc1\"] .xterm-helper-textarea').focus();");
    await page.send('Input.insertText', { text: '7' }); await delay(80);
    assert(await page.evaluate("return store.getState().selected==='pc2'&&terminals.getSession(sim.net.devices.get('pc1'))===originalSession&&Array.from({length:session.term.buffer.active.length},(_,i)=>session.term.buffer.active.getLine(i)?.translateToString()).join('').includes('ping -c 4 10.72.1.197');"));
    await page.evaluate("for(const id of [...store.getState().terminals])store.getState().closeTerminal(id);");
    await wait("!document.querySelector('.terminal-panel-info')");
    assert.equal(await page.evaluate("return document.querySelectorAll('.floating-reference').length;"), 2);
  });
  await test('a tutorial and its terminal remain usable while references are open', async () => {
    // Actual menu handler starts a separate draft, in the disposable review database only.
    await page.evaluate("[...document.querySelectorAll('.toolbar-menu-trigger,.toolbar-menu-action')].find(e=>e.textContent.includes('Übungen (Beta)')).click();");
    await wait("document.querySelector('[data-guided-menu-toggle]')");
    await click('[data-guided-menu-toggle]');
    await wait("document.querySelector('[data-start-tutorial]:not(:disabled)')");
    await page.evaluate("document.querySelector('[data-start-tutorial]').click();");
    await wait("document.querySelector('[data-guided-step=\"1\"]')");
    await page.evaluate("store.getState().openTerminal('tutorial-01-a');"); await wait("document.querySelector('.terminal-panel-info')");
    assert.equal(await page.evaluate("return document.querySelectorAll('.floating-reference').length;"), 2);
    // Move the references using their keyboard controls to expose the tutorial card.
    await page.evaluate("document.querySelectorAll('.floating-reference-heading')[0].focus();");
    for (let i = 0; i < 38; i++) await key('ArrowRight', 'ArrowRight', 39, 8);
    await page.evaluate("document.querySelectorAll('.floating-reference-heading')[1].focus();");
    for (let i = 0; i < 22; i++) await key('ArrowRight', 'ArrowRight', 39, 8);
    for (let i = 0; i < 22; i++) await key('ArrowDown', 'ArrowDown', 40, 8);
    // The ordinary exercise header remains outside the floating reference hitboxes.
    assert(await page.evaluate("const e=document.querySelector('.exercise-panel header');const r=e.getBoundingClientRect();return !!document.elementFromPoint(r.x+15,r.y+15)?.closest('.exercise-panel');"));
    await click('.exercise-panel header button[aria-expanded]');
    await wait("!document.querySelector('[data-guided-step]')");
    await click('.exercise-panel header button[aria-expanded]');
    await wait("document.querySelector('[data-guided-step=\"1\"]')");
    await screenshot('floating-references-with-tutorial');
    // Close both via their native controls and verify that a slot can be reused.
    await page.evaluate("document.querySelector('.floating-reference-heading button').click();");
    assert.equal(await page.evaluate("return document.querySelectorAll('.floating-reference').length;"), 1);
    await open(0); await pin(2); await wait("document.querySelectorAll('.floating-reference').length===2");
    await key('Escape', 'Escape', 27);
    await page.evaluate("document.querySelectorAll('.floating-reference-heading button').forEach(e=>e.click());");
    assert.equal(await page.evaluate("return document.querySelectorAll('.floating-reference').length;"), 0);
  });
  await test('F5 restores the draft but never pinned windows', async () => {
    await open(0); await pin(0); await wait("document.querySelector('.floating-reference')");
    const before = await page.evaluate("await application.controller.flush();return {draft:application.controller.getState().activeDraftId,document:JSON.stringify(store.getState().captureWorkspaceDocument())};");
    await page.evaluate('application.dispose();');
    await page.send('Page.reload', { ignoreCache: true }); await delay(200);
    await wait("document.readyState==='complete'&&document.getElementById('root')");
    await page.evaluate("await import('/node_modules/@xyflow/react/dist/style.css');await import('/node_modules/@xterm/xterm/css/xterm.css');await import('/src/themes.css');await import('/src/styles.css');await import('/src/buttons.css');window.store=(await import('/src/store.ts')).useStore;const entry=await import('/src/workspace/WorkspaceApplication.tsx');window.application=entry.mountWorkspaceApplication(document.getElementById('root'),{repositoryOptions:{databaseName:" + JSON.stringify(database) + "},legacy:{storage:{getItem:()=>null},origin:'https://terminal-reference.invalid'}});await application.ready;");
    await wait("document.querySelector('.react-flow')");
    assert.equal(await page.evaluate("return document.querySelectorAll('.floating-reference').length;"), 0);
    assert.deepEqual(await page.evaluate("return {draft:application.controller.getState().activeDraftId,document:JSON.stringify(store.getState().captureWorkspaceDocument())};"), before);
  });
}
