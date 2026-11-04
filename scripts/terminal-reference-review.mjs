import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function runTerminalReferenceReview({ page, url, root, report }) {
  const database = 'netlab-idb-test-' + crypto.randomUUID();
  const directory = path.join(root, '.playwright-mcp/reviews/raw/terminal-reference');
  await mkdir(directory, { recursive: true });
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const wait = async expression => {
    for (let i = 0; i < 200; i++) { if (await page.evaluate('return !!(' + expression + ');')) return; await delay(30); }
    throw Error('Terminal reference condition: ' + expression);
  };
  const test = async (name, fn) => {
    try { await fn(); report.results['terminal reference: ' + name] = { passed: true }; }
    catch (e) { report.results['terminal reference: ' + name] = { passed: false, error: e.stack }; throw e; }
  };
  const click = async selector => {
    const p = await page.evaluate('const e=document.querySelector(' + JSON.stringify(selector) + ');if(!e)throw Error("Missing button");const r=e.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2};');
    for (const type of ['mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, ...p, button: 'left', clickCount: 1 });
    await delay(60);
  };
  const key = async (key, code, vk, modifiers = 0) => {
    for (const type of ['keyDown', 'keyUp']) await page.send('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode: vk, modifiers,
      ...(type === 'keyDown' && (key === 'Tab' || key === 'Enter') ? { text: key === 'Tab' ? '\t' : '\r' } : {}) });
    await delay(35);
  };
  const search = async value => {
    await page.evaluate("const e=document.querySelector('.reference-filters input');e.focus();e.select();");
    if (value) await page.send('Input.insertText', { text: value }); else await key('Backspace', 'Backspace', 8);
    await delay(60);
  };
  const open = async index => {
    await page.evaluate('window.referenceTrigger=document.querySelectorAll(".terminal-panel-info")[' + index + '];');
    await click('[data-terminal-pane]:nth-of-type(' + (index + 1) + ') .terminal-panel-info');
    await wait("document.querySelector('dialog.terminal-reference[open]')");
    assert(await page.evaluate("return document.querySelectorAll('dialog.terminal-reference').length===1&&document.activeElement===document.querySelector('.reference-filters input');"));
  };
  const closed = async () => {
    await wait("!document.querySelector('.terminal-reference')");
    assert(await page.evaluate('return document.activeElement===referenceTrigger;'));
  };
  try {
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false });
    await page.send('Page.navigate', { url }); await wait("document.readyState==='complete'&&document.getElementById('root')");
    await page.evaluate("await import('/node_modules/@xyflow/react/dist/style.css');await import('/node_modules/@xterm/xterm/css/xterm.css');await import('/src/themes.css');await import('/src/styles.css');await import('/src/buttons.css');" +
      "window.store=(await import('/src/store.ts')).useStore;window.sim=(await import('/src/sim.ts')).sim;window.terminals=await import('/src/terminals.ts');window.serial=await import('/src/engine/serialize.ts');window.theme=(await import('/src/uiTheme.ts')).useUiTheme;" +
      "const fixture=(await import('/src/testing/interfaceAuditFixture.ts')).interfaceAuditDocument();const extra=structuredClone(fixture.devices.find(d=>d.id==='pc2'));extra.id='pc4';extra.name='pc4';extra.x=850;extra.ifaces.forEach(i=>delete i.mac);fixture.devices.push(extra);" +
      "const entry=await import('/src/workspace/WorkspaceApplication.tsx');window.application=entry.mountWorkspaceApplication(document.getElementById('root'),{repositoryOptions:{databaseName:" + JSON.stringify(database) + "},legacy:{storage:{getItem:key=>key==='netsim:autosave:v1'?JSON.stringify(fixture):null},origin:'https://terminal-reference.invalid'}});await application.ready;" +
      "store.getState().openTerminal('pc1');store.getState().openTerminal('pc2');");
    await page.send('Page.bringToFront'); await wait("document.querySelectorAll('.terminal-panel-info').length===2");
    await wait("document.querySelectorAll('.react-flow__node').length===7");
    // Document activation fits once after node measurement. Wait for that fit,
    // rather than comparing the uninitialized identity viewport with its result.
    await wait("document.querySelector('.react-flow__viewport').style.transform!=='translate(0px, 0px) scale(1)'");
    await delay(100);
    await page.evaluate("window.session=terminals.getSession(sim.net.devices.get('pc1'));store.getState().setActiveTerminal('pc1');session.term.focus();");
    await wait("document.activeElement===session.term.textarea");
    await page.send('Input.insertText', { text: 'ping -c 4 10.72.1.1' }); await delay(80);
    await page.evaluate("window.originalSession=session;window.originalNetwork=JSON.stringify(serial.serializeNetwork(sim.net,{}));window.originalPanels=JSON.stringify(store.getState().terminalPanels);window.originalTransform=document.querySelector('.react-flow__viewport').style.transform;window.originalHeight=document.querySelector('.terminal-dock').getBoundingClientRect().height;window.originalText=Array.from({length:session.term.buffer.active.length},(_,i)=>session.term.buffer.active.getLine(i)?.translateToString()).join('\\n');window.copied=[];Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>copied.push(text)}});");
    await test('every panel opens one shared modal and close restores the trigger', async () => {
      for (let i = 0; i < 2; i++) { await open(i); await key('Escape', 'Escape', 27); await closed(); }
      // A native keyboard activation uses the same shared instance.
      await page.evaluate('referenceTrigger.focus();');
      assert(await page.evaluate('return document.activeElement===referenceTrigger;'));
      await key('Enter', 'Enter', 13);
      await wait("document.querySelector('dialog.terminal-reference[open]')");
      await key('Escape', 'Escape', 27); await closed();
    });
    await test('route search, categories, parameters, expandable examples and copy', async () => {
      await open(0); await search('10.72.254.2');
      assert.equal(await page.evaluate("return document.querySelectorAll('.reference-command-list button').length;"), 1);
      assert.equal(await page.evaluate("return document.querySelector('.reference-content h3').textContent;"), 'ip route');
      assert(await page.evaluate("const op=document.querySelector('.reference-operation');return op.querySelector('.reference-syntax code').textContent==='ip route show'&&!op.querySelector('details');"));
      await click('.reference-operation .reference-syntax .reference-copy button');
      assert.deepEqual(await page.evaluate('return copied;'), ['ip route show']);
      assert(await page.evaluate("const op=document.querySelector('.reference-operation:nth-of-type(2)');return op.querySelector('.reference-syntax code').textContent==='ip route add <zielnetz/CIDR> via <gateway> [dev <interface>]'&&[...op.querySelectorAll('.syntax-value')].map(e=>e.textContent).join(',')==='<zielnetz/CIDR>,<gateway>,<interface>'&&[...op.querySelectorAll('.syntax-optional')].map(e=>e.textContent).join('')==='[]';"));
      await click('.reference-operation:nth-of-type(2) summary');
      assert(await page.evaluate("const t=document.querySelector('details[open]').textContent;return t.includes('Next Hop')&&t.includes('eth1 gehört zu West')&&t.includes('10.72.254.1')&&t.includes('10.72.254.2');"));
      await click('details[open] .reference-example button');
      assert.deepEqual(await page.evaluate('return copied;'), ['ip route show', 'ip route add 10.72.2.0/27 via 10.72.254.2 dev eth1']);
      assert(await page.evaluate("return document.querySelector('details[open] [role=status]').textContent==='Kopiert';"));
      await search('sysctl');
      assert(await page.evaluate("const s=[...document.querySelectorAll('.reference-operation')].find(e=>e.textContent.includes('Forwarding setzen'));return s.querySelector('.syntax-value').textContent==='0|1'&&s.querySelector('code').textContent==='sysctl -w net.ipv4.ip_forward=0|1';"));
      await click('.reference-operation:nth-of-type(2) summary');
      assert(await page.evaluate("const t=document.querySelector('details[open]').textContent;return t.includes('0 = Weiterleitung deaktivieren')&&t.includes('1 = Weiterleitung aktivieren');"));
      await click('details[open] .reference-example button');
      assert.equal((await page.evaluate('return copied;')).at(-1),'sysctl -w net.ipv4.ip_forward=1');
      await search('not-a-command'); assert(await page.evaluate("return document.querySelector('.reference-content').textContent.includes('Keine passenden');"));
      await search(''); await page.evaluate("Array.from(document.querySelectorAll('.reference-categories button')).find(b=>b.textContent==='ARP').click();");
      assert.equal(await page.evaluate("return document.querySelectorAll('.reference-command-list button').length;"), 2);
      await click('.reference-categories button'); await search('ip route');
    });
    await test('Linux and Windows remain separate and copy errors stay recoverable', async () => {
      await search('');
      await page.evaluate("const e=document.querySelector('.reference-filters select');e.value='windows';e.dispatchEvent(new Event('change',{bubbles:true}));");
      await delay(60);
      assert.equal(await page.evaluate("return document.querySelector('.reference-content h3').textContent;"), 'route');
      assert(await page.evaluate("return [...document.querySelectorAll('.reference-content code')].every(e=>!e.textContent.includes('route add'));"));
      await click('.reference-notes summary');
      assert(await page.evaluate("return document.querySelector('.reference-notes').textContent.includes('kein route add/delete');"));
      await page.evaluate("navigator.clipboard.writeText=async()=>{throw Error('Synthetic clipboard denial');};");
      await click('.reference-operation .reference-syntax .reference-copy button');
      assert(await page.evaluate("return document.querySelector('.reference-syntax [role=status]').textContent.includes('Text markieren');"));
      await page.evaluate("navigator.clipboard.writeText=async text=>copied.push(text);");
      await click('.reference-heading button'); await closed();
    });
    await test('modal keyboard focus is contained, backdrop closes, sessions and input stay intact', async () => {
      await open(0);
      for (let i = 0; i < 16; i++) await key('Tab', 'Tab', 9);
      assert(await page.evaluate("return !!document.activeElement.closest('.terminal-reference');"));
      // Check both ends of the native dialog's keyboard cycle as well.
      await page.evaluate("window.referenceFocusables=[...document.querySelector('.terminal-reference').querySelectorAll('button,input,select,summary')].filter(e=>e.getClientRects().length);referenceFocusables.at(-1).focus();");
      await key('Tab', 'Tab', 9);
      assert(await page.evaluate('return document.activeElement===referenceFocusables[0];'), JSON.stringify(await page.evaluate("return {active:document.activeElement.outerHTML.slice(0,500),first:referenceFocusables[0].outerHTML,last:referenceFocusables.at(-1).outerHTML};")));
      await key('Tab', 'Tab', 9, 8);
      assert(await page.evaluate('return document.activeElement===referenceFocusables.at(-1);'));
      for (const type of ['mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, x: 3, y: 3, button: 'left', clickCount: 1 });
      await closed();
      const preserved=await page.evaluate("return {session:terminals.getSession(sim.net.devices.get('pc1'))===originalSession,network:JSON.stringify(serial.serializeNetwork(sim.net,{}))===originalNetwork,panels:JSON.stringify(store.getState().terminalPanels)===originalPanels,viewport:document.querySelector('.react-flow__viewport').style.transform===originalTransform,height:document.querySelector('.terminal-dock').getBoundingClientRect().height===originalHeight};");
      assert(Object.values(preserved).every(Boolean),JSON.stringify({preserved,view:await page.evaluate("return {before:originalTransform,after:document.querySelector('.react-flow__viewport').style.transform};")}));
      assert(await page.evaluate("return Array.from({length:session.term.buffer.active.length},(_,i)=>session.term.buffer.active.getLine(i)?.translateToString()).join('\\n')===originalText;"));
      await click('[data-terminal-device="pc1"] .xterm');
      await wait('document.activeElement===session.term.textarea');
      await page.send('Input.insertText', { text: '9' });
      await wait("Array.from({length:session.term.buffer.active.length},(_,i)=>session.term.buffer.active.getLine(i)?.translateToString()).join('').includes('ping -c 4 10.72.1.19')");
    });
    await test('five columns keep lock, move and info buttons accessible; responsive themes', async () => {
      await page.evaluate("for(const id of ['r1','pc3','pc4'])store.getState().openTerminal(id);");
      await wait("document.querySelectorAll('.terminal-panel-info').length===5");
      for (const width of [1440, 700]) for (const selectedTheme of ['graphite-dark', 'classic-light']) {
        await page.send('Emulation.setDeviceMetricsOverride', { width, height: 960, deviceScaleFactor: 1, mobile: false });
        await page.evaluate("theme.getState().setTheme(" + JSON.stringify(selectedTheme) + ");document.querySelector('.terminal-panels').scrollLeft=0;"); await delay(80);
        assert(await page.evaluate("return [...document.querySelectorAll('.terminal-panel-header')].every(h=>{const a=h.querySelector('.terminal-panel-lock').getBoundingClientRect(),b=h.querySelector('.terminal-panel-info').getBoundingClientRect();return a.width>=28&&b.width>=28&&a.right<=b.left;});"));
        await open(0);
        assert(await page.evaluate("return document.querySelector('.reference-legend').textContent.includes('selbst wählen')&&document.querySelector('.reference-legend').textContent.includes('optional');"));
        assert(await page.evaluate("const d=document.querySelector('.terminal-reference'),r=d.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight&&d.scrollWidth<=d.clientWidth+1&&document.documentElement.scrollWidth<=innerWidth+1;"));
        assert.equal(await page.evaluate("return getComputedStyle(document.querySelector('.reference-layout')).display;"), width === 700 ? 'flex' : 'grid');
        const image = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        await writeFile(path.join(directory, 'terminal-reference-' + selectedTheme + '-' + width + '.png'), Buffer.from(image.data, 'base64'));
        await key('Escape', 'Escape', 27); await closed();
      }
    });
    const { reviewFloatingReferences } = await import('./floating-reference-review.mjs');
    await reviewFloatingReferences({ page, open, click, key, wait, delay, test, directory, database });
  } finally {
    await page.evaluate("application?.dispose();await new Promise(resolve=>setTimeout(resolve,120));await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Terminal reference database cleanup blocked')),5000);const r=indexedDB.deleteDatabase(" + JSON.stringify(database) + ");r.onsuccess=()=>{clearTimeout(timer);resolve();};r.onerror=()=>{clearTimeout(timer);reject(r.error);};});");
  }
}
