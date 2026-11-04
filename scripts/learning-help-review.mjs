import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function runLearningHelpReview({ page, url, root, report }) {
  const database = 'netlab-idb-test-' + crypto.randomUUID();
  const directory = path.join(root, '.playwright-mcp/reviews/raw/learning-help');
  await mkdir(directory, { recursive: true });
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const wait = async expression => {
    for (let i = 0; i < 200; i++) { if (await page.evaluate('return !!(' + expression + ');')) return; await delay(35); }
    throw Error('Learning help condition: ' + expression);
  };
  const click = async (selector, text) => {
    const p = await page.evaluate(`const clean=s=>s.replace(/[›▾]/g,'').trim();const list=[...document.querySelectorAll(${JSON.stringify(selector)})].filter(e=>e.getClientRects().length);const e=${text ? `list.find(e=>clean(e.textContent)===clean(${JSON.stringify(text)}))` : 'list[0]'};if(!e)throw Error('Missing help control '+${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};`);
    for (const type of ['mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, ...p, button: 'left', clickCount: 1 });
    await delay(70);
  };
  const key = async (key, code, vk, modifiers = 0) => {
    for (const type of ['keyDown', 'keyUp']) await page.send('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode: vk, modifiers,
      ...(type === 'keyDown' && key === 'Tab' ? { text: '\t' } : {}) });
    await delay(40);
  };
  const test = async (name, fn) => {
    try { await fn(); report.results['learning help: ' + name] = { passed: true }; }
    catch (e) { report.results['learning help: ' + name] = { passed: false, error: e.stack }; throw e; }
  };
  const snapshot = () => page.evaluate("return {document:JSON.stringify(store.getState().captureWorkspaceDocument()),selected:store.getState().selected,active:ws.controller.getState().activeDraftId,tabs:ws.controller.getState().drafts.map(d=>d.id),viewport:document.querySelector('.react-flow__viewport').style.transform};");
  const opened = async () => {
    await wait("document.querySelector('dialog.learning-help[open]')");
    assert(await page.evaluate("return document.querySelectorAll('dialog.learning-help').length===1&&document.activeElement===document.querySelector('#learning-help-title');"));
  };
  const shot = async name => {
    const png = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(path.join(directory, name + '.png'), Buffer.from(png.data, 'base64'));
  };
  try {
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false });
    await page.send('Page.navigate', { url }); await wait("document.readyState==='complete'&&document.getElementById('root')");
    await page.evaluate(`window.store=(await import('/src/store.ts')).useStore;window.sim=(await import('/src/sim.ts')).sim;window.lang=(await import('/src/i18n/index.ts')).useLanguage;window.theme=(await import('/src/uiTheme.ts')).useUiTheme;lang.getState().setLanguage('de');theme.getState().setTheme('graphite-dark');const entry=await import('/src/workspace/reviewEntry.tsx');window.ws=await entry.mountWorkspaceReview(document.getElementById('root'),{databaseName:${JSON.stringify(database)}});const fixture=(await import('/src/testing/interfaceAuditFixture.ts')).interfaceAuditDocument();const opened=await ws.controller.openDocument({schemaVersion:1,topology:fixture});if(!opened.ok)throw Error(JSON.stringify(opened));`);
    await wait("document.querySelectorAll('.react-flow__node').length===6");
    await wait("document.querySelector('.react-flow__viewport').style.transform!=='translate(0px, 0px) scale(1)'");
    await delay(150);
    await page.evaluate("store.getState().select('pc2');await ws.controller.flush();");
    await test('menu opens one translated page and returns focus without touching the workspace', async () => {
      const before = await snapshot();
      await click('.toolbar-menu-trigger', 'Hilfe');
      await click('#toolbar-help-menu [data-help-page=ipv4]'); await opened();
      assert(await page.evaluate("return document.querySelector('.learning-help').textContent.includes('netsh')&&document.querySelector('.learning-help').textContent.includes('eine IPv4-Adresse pro Schnittstelle');"));
      assert(await page.evaluate("const e=document.querySelector('.learning-help'),g=e.querySelector('.learning-help-config dl'),b=e.querySelector('.learning-help footer button'),r=e.getBoundingClientRect(),br=b.getBoundingClientRect();return e.textContent.includes('192.168.10.10/24 gehört zum Netz 192.168.10.0/24')&&e.textContent.includes('muss im lokalen Netz erreichbar sein')&&g.children.length===3&&getComputedStyle(g).gridTemplateColumns.split(' ').length===3&&!e.querySelector('.learning-help-methods details').open&&br.right>r.left+r.width/2&&br.bottom<r.bottom;"));
      await shot('ipv4-graphite-desktop');
      await click('.learning-help-methods details > summary');
      assert(await page.evaluate("return document.querySelector('.learning-help-methods details').open&&document.querySelector('.learning-help-methods details').textContent.includes('ip address add funktioniert nur');"));
      await click('.learning-help-methods details > summary');
      await page.evaluate("document.querySelector('#learning-help-title').focus();");
      await key('Tab', 'Tab', 9, 8);
      assert(await page.evaluate("return document.activeElement===document.querySelector('.learning-help footer button');"));
      await key('Tab', 'Tab', 9);
      assert(await page.evaluate("return document.activeElement===document.querySelector('.learning-help header button');"));
      await key('Escape', 'Escape', 27); await wait("!document.querySelector('.learning-help')");
      assert(await page.evaluate("return document.activeElement.textContent.trim()==='Hilfe';"));
      assert.deepEqual(await snapshot(), before);
    });
    await test('context link preserves an unfinished IPv4 field and xterm input; commands stay selectable text', async () => {
      await click('.inspector [role=tab]', 'Netzwerk');
      await page.evaluate("store.getState().openTerminal('pc2');window.terminals=await import('/src/terminals.ts');window.session=terminals.getSession(sim.net.devices.get('pc2'));");
      await wait("document.querySelector('.xterm-helper-textarea')");
      await page.evaluate('session.term.focus();'); await page.send('Input.insertText', { text: 'ping 192.168.' }); await delay(70);
      await page.evaluate("window.terminalText=Array.from({length:session.term.buffer.active.length},(_,i)=>session.term.buffer.active.getLine(i)?.translateToString());window.originalSession=session;");
      await click('.inspector input[aria-label="IP-Adresse eth0"]');
      await key('a', 'KeyA', 65, 2); await page.send('Input.insertText', { text: '192.168.' }); await delay(550);
      const before = await snapshot();
      await click('.inspector [data-help-page=ipv4]'); await opened();
      const commands = ['ip address show', 'ip address add 192.0.2.10/24 dev eth0', 'ip route', 'ip route add default via 192.0.2.1 dev eth0', 'ipconfig /all'];
      assert.deepEqual(await page.evaluate("return [...document.querySelectorAll('.learning-help-command code')].map(e=>e.textContent);"), commands);
      assert.equal(await page.evaluate("return document.querySelectorAll('.learning-help-command button').length;"), 0);
      assert(await page.evaluate("return [...document.querySelectorAll('.learning-help-command code')].every(e=>getComputedStyle(e).userSelect==='text');"));
      await click('.learning-help footer button'); await wait("!document.querySelector('.learning-help')");
      assert(await page.evaluate("return document.activeElement.matches('.inspector [data-help-page=ipv4]')&&document.querySelector('.inspector input[aria-label=\"IP-Adresse eth0\"]').value==='192.168.';"));
      assert.deepEqual(await snapshot(), before);
      assert(await page.evaluate("return session===originalSession&&terminals.getSession(sim.net.devices.get('pc2'))===originalSession&&JSON.stringify(Array.from({length:session.term.buffer.active.length},(_,i)=>session.term.buffer.active.getLine(i)?.translateToString()))===JSON.stringify(terminalText);"));
      await click('.inspector input[aria-label="IP-Adresse eth0"]');
      await key('a', 'KeyA', 65, 2); await page.send('Input.insertText', { text: '192.168.1.10/24' });
      await click('.inspector [data-help-page=ipv4]'); await opened();
    });
    await test('DE/EN/PT-BR, compact Classic Light, X and backdrop retain context', async () => {
      for (const [language, title] of [['en', 'Configure IPv4'], ['pt-BR', 'Configurar IPv4'], ['de', 'IPv4 konfigurieren']]) {
        await page.evaluate(`lang.getState().setLanguage(${JSON.stringify(language)});`); await delay(60);
        assert.equal(await page.evaluate("return document.querySelector('#learning-help-title').textContent;"), title);
        assert.equal(await page.evaluate("return document.querySelector('.learning-help').lang;"), language);
      }
      await page.evaluate("theme.getState().setTheme('classic-light');store.getState().setTerminalDockCollapsed(true);");
      await page.send('Emulation.setDeviceMetricsOverride', { width: 500, height: 700, deviceScaleFactor: 1, mobile: false }); await delay(150);
      assert(await page.evaluate("const e=document.querySelector('.learning-help'),r=e.getBoundingClientRect(),body=e.querySelector('.learning-help-body');return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight&&e.scrollWidth<=e.clientWidth&&body.scrollHeight>body.clientHeight&&document.documentElement.scrollWidth<=innerWidth;"));
      assert(await page.evaluate("const e=document.querySelector('.learning-help'),g=e.querySelector('.learning-help-config dl'),b=e.querySelector('footer button'),r=e.getBoundingClientRect(),br=b.getBoundingClientRect();return getComputedStyle(g).gridTemplateColumns.split(' ').length===1&&br.right>r.left+r.width/2&&br.bottom<r.bottom&&!e.querySelector('.learning-help-methods details').open;"));
      await shot('ipv4-classic-500');
      await click('.learning-help header button'); await wait("!document.querySelector('.learning-help')");
      const before = await snapshot();
      await click('.inspector [data-help-page=ipv4]'); await opened();
      for (const type of ['mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, x: 1, y: 1, button: 'left', clickCount: 1 });
      await wait("!document.querySelector('.learning-help')");
      assert(await page.evaluate("return document.activeElement.matches('.inspector [data-help-page=ipv4]');"));
      assert.deepEqual(await snapshot(), before);
      await click('.toolbar-menu-trigger', 'Menü ▾'); await click('.toolbar-menu-action', 'Hilfe');
      await click('#toolbar-help-menu [data-help-page=ipv4]'); await opened();
      await key('Escape', 'Escape', 27); await wait("!document.querySelector('.learning-help')");
      assert(await page.evaluate("return document.activeElement.textContent.trim()==='Menü ▾';"));
    });
    report.learningHelpReview = { directory, captures: ['ipv4-graphite-desktop.png', 'ipv4-classic-500.png'] };
  } finally {
    await page.evaluate('window.ws?.dispose();');
    await page.evaluate(`await new Promise((resolve,reject)=>{const request=indexedDB.deleteDatabase(${JSON.stringify(database)});request.onsuccess=resolve;request.onerror=()=>reject(request.error);request.onblocked=()=>reject(Error('Help cleanup blocked'));});`);
  }
}
