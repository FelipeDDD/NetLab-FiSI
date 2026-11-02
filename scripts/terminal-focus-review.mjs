import assert from 'node:assert/strict';

// Real target activation in disposable Chromium, no user browser/profile or data.
export async function runTerminalFocusReview({ page, url, report }) {
  const database = 'netlab-idb-test-' + crypto.randomUUID();
  const targets = new Set();
  const delay = ms => new Promise(r => setTimeout(r, ms));
  const wait = async expression => {
    for (let i = 0; i < 200; i++) {
      if (await page.evaluate('return !!(' + expression + ');')) return;
      await delay(30);
    }
    throw Error('Terminal focus condition: ' + expression);
  };
  const test = async (name, run) => {
    try { await run(); report.results['terminal page focus: ' + name] = { passed: true }; }
    catch (e) { report.results['terminal page focus: ' + name] = { passed: false, error: e.stack }; throw e; }
  };
  const focus = async id => {
    await page.evaluate("store.getState().setActiveTerminal(" + JSON.stringify(id) + ");window.session=terminals.getSession(sim.net.devices.get(" + JSON.stringify(id) + "));session.term.focus();");
    await wait('document.activeElement===session.term.textarea');
    await delay(60);
  };
  const text = () => page.evaluate("const b=session.term.buffer.active;return Array.from({length:b.length},(_,i)=>b.getLine(i)?.translateToString()).join('\\n');");
  const key = async (key, code, vk, modifiers = 0) => {
    for (const type of ['keyDown', 'keyUp']) await page.send('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode: vk, modifiers });
    await delay(40);
  };
  let main;
  const roundTrip = async newWindow => {
    const { targetId } = await page.send('Target.createTarget', { url: 'about:blank', newWindow, background: false });
    targets.add(targetId);
    try {
      await page.send('Target.activateTarget', { targetId });
      await delay(120);
      const nativeLoss = await page.evaluate('return !document.hasFocus();');
      if (newWindow && !nativeLoss) {
        // Headless windows need not share one OS focus owner. Exercise the
        // visible-page blur/focus sequence explicitly and report this limitation.
        report.terminalFocusWindowLimitation = 'Headless Chromium kept document.hasFocus() true across windows; window blur/focus events were simulated. Browser-tab activation was native.';
        await page.evaluate("window.dispatchEvent(new Event('blur'));");
      } else await wait('!document.hasFocus()');
      if (!newWindow) await wait("document.visibilityState==='hidden'");
      await page.send('Target.activateTarget', { targetId: main });
      await page.send('Page.bringToFront');
      if (newWindow && !nativeLoss) await page.evaluate("window.dispatchEvent(new Event('focus'));");
      await wait("document.hasFocus()&&document.visibilityState==='visible'");
      await delay(100);
    } finally { await page.send('Target.closeTarget', { targetId }); targets.delete(targetId); }
  };
  try {
    await page.send('Page.navigate', { url });
    await wait("document.readyState==='complete'&&document.getElementById('root')");
    await page.evaluate("await import('/node_modules/@xyflow/react/dist/style.css');await import('/node_modules/@xterm/xterm/css/xterm.css');await import('/src/themes.css');await import('/src/styles.css');await import('/src/buttons.css');" +
      "window.store=(await import('/src/store.ts')).useStore;window.sim=(await import('/src/sim.ts')).sim;window.terminals=await import('/src/terminals.ts');" +
      "const fixtures=await import('/src/testing/interfaceAuditFixture.ts');const entry=await import('/src/workspace/WorkspaceApplication.tsx');" +
      "window.application=entry.mountWorkspaceApplication(document.getElementById('root'),{repositoryOptions:{databaseName:" + JSON.stringify(database) + "},legacy:{storage:{getItem:key=>key==='netsim:autosave:v1'?JSON.stringify(fixtures.interfaceAuditDocument()):null},origin:'https://terminal-focus.invalid'}});await application.ready;" +
      "store.getState().setHostOs('pc2','windows');store.getState().openTerminal('pc1');store.getState().openTerminal('pc2');window.focusEvents=[];for(const type of ['focus','blur'])window.addEventListener(type,()=>focusEvents.push({type,hidden:document.hidden}));document.addEventListener('visibilitychange',()=>focusEvents.push({type:'visibility',hidden:document.hidden}));");
    main = (await page.send('Target.getTargetInfo')).targetInfo.targetId;
    await page.send('Page.bringToFront');
    await wait("document.querySelectorAll('.xterm').length===2");
    for (const newWindow of [false, true]) await test(newWindow ? 'another Chromium window preserves session and partial input' : 'another browser tab preserves session and partial input', async () => {
      await focus(newWindow ? 'pc2' : 'pc1');
      await page.send('Input.insertText', { text: newWindow ? 'ping -n 4 192.0.2.100' : 'ping -c 4 192.0.2.100' });
      await delay(80);
      await page.evaluate("window.oldSession=session;window.oldPanels=JSON.stringify(store.getState().terminalPanels);window.oldTransform=document.querySelector('.react-flow__viewport').style.transform;");
      const before = await text();
      await roundTrip(newWindow);
      assert(await page.evaluate("return document.activeElement===document.querySelector('.canvas')&&!store.getState().terminalHasFocus;"));
      assert(await page.evaluate("return session===oldSession&&JSON.stringify(store.getState().terminalPanels)===oldPanels&&document.querySelector('.react-flow__viewport').style.transform===oldTransform;"));
      await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'x', code: 'KeyX', windowsVirtualKeyCode: 88, text: 'x', unmodifiedText: 'x' });
      await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'x', code: 'KeyX', windowsVirtualKeyCode: 88 });
      await delay(50);
      assert.equal(await text(), before);
      // A real click restores the normal xterm input behavior.
      const p = await page.evaluate("const r=session.term.element.getBoundingClientRect();return{x:r.left+20,y:r.top+20};");
      for (const type of ['mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, ...p, button: 'left', clickCount: 1 });
      await wait('document.activeElement===session.term.textarea&&store.getState().terminalHasFocus');
      await page.send('Input.insertText', { text: ' edited' }); await delay(50);
      assert((await text()).includes('192.0.2.100 edited'));
    });
    await test('open terminals without keyboard focus preserve editor focus', async () => {
      await page.evaluate("store.getState().releaseTerminalFocus();document.querySelector('.canvas').focus({preventScroll:true});");
      await roundTrip(false);
      assert(await page.evaluate("return document.activeElement===document.querySelector('.canvas')&&!store.getState().terminalHasFocus;"));
    });
    await test('Inspector field keeps its focus and unapplied text', async () => {
      await page.evaluate("store.getState().select('pc1');");
      await wait("document.querySelector('.inspector-name')");
      await page.evaluate("const e=document.querySelector('.inspector-name');e.focus();e.setSelectionRange(0,0);");
      await page.send('Input.insertText', { text: 'draft-' });
      const before = await page.evaluate("return document.querySelector('.inspector-name').value;");
      await roundTrip(true);
      assert(await page.evaluate("return document.activeElement===document.querySelector('.inspector-name');"));
      assert.equal(await page.evaluate("return document.querySelector('.inspector-name').value;"), before);
    });
    await test('running command remains busy after return', async () => {
      await focus('pc2'); await key('c', 'KeyC', 67, 2);
      await page.send('Input.insertText', { text: 'ping -t 192.168.1.1' }); await key('Enter', 'Enter', 13);
      assert.equal(await page.evaluate("return session.executeCommand('hostname');"), 'busy');
      await roundTrip(false);
      assert.equal(await page.evaluate("return session.executeCommand('hostname');"), 'busy');
      await focus('pc2'); await key('c', 'KeyC', 67, 2);
    });
    await test('renderer-delivered Ctrl+Tab still cycles terminals and prevents default', async () => {
      await focus('pc1');
      await page.evaluate("window.ctrlTabSeen=[];document.addEventListener('keydown',e=>{if(e.ctrlKey&&e.key==='Tab')ctrlTabSeen.push(e);},true);");
      await key('Tab', 'Tab', 9, 2);
      assert.equal(await page.evaluate('return store.getState().activeTerminal;'), 'pc2');
      assert(await page.evaluate('return ctrlTabSeen.at(-1).defaultPrevented;'));
    });
    report.terminalFocusEvents = await page.evaluate('return focusEvents;');
  } finally {
    for (const targetId of targets) await page.send('Target.closeTarget', { targetId });
    await page.evaluate("application?.dispose();await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase(" + JSON.stringify(database) + ");r.onsuccess=resolve;r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Terminal focus database cleanup blocked'));});");
  }
}
