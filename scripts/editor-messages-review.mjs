import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Existing production UI in a disposable profile and explicitly named test DBs. */
export async function runEditorMessagesReview({ page, url, root, report }) {
  const directory = path.join(root, '.playwright-mcp/reviews/editor-2b');
  const images = path.join(directory, 'referencias-chatgpt');
  await mkdir(images, { recursive: true });
  const results = {}, captures = [], databases = [];
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const wait = async expression => {
    for (let i = 0; i < 180; i++) { try { if (await page.evaluate(`return !!(${expression});`)) return; } catch {} await delay(40); }
    throw Error('Editor presentation timeout: ' + expression);
  };
  const check = async (name, action) => {
    try { await action(); results['editor-i18n: ' + name] = { passed: true }; }
    catch (error) { results['editor-i18n: ' + name] = { passed: false, error: error.stack }; throw error; }
  };
  const click = async selector => {
    await wait(`document.querySelector(${JSON.stringify(selector)})&&!document.querySelector(${JSON.stringify(selector)}).disabled`);
    await page.evaluate(`document.querySelector(${JSON.stringify(selector)}).click();`);
  };
  // Restoring deleted devices already changes Map insertion order; compare all
  // saved values by stable IDs, not that unrelated runtime enumeration order.
  const snapshot = () => page.evaluate(`const d=store.getState().captureWorkspaceDocument();d.topology.devices.sort((a,b)=>a.id.localeCompare(b.id));d.topology.links.sort((a,b)=>a.id.localeCompare(b.id));return d;`);
  const flush = async () => { assert.equal(await page.evaluate(`return (await application.controller.flush()).ok;`), true); };
  const language = async value => { await page.evaluate(`i18n.useLanguage.getState().setLanguage(${JSON.stringify(value)});`); await delay(25); };
  const navigate = async (name, theme) => {
    await page.send('Page.navigate', { url }); await wait(`document.readyState==='complete'&&location.pathname==='/__application_boot_test__'`);
    await page.evaluate(`await import('/node_modules/@xyflow/react/dist/style.css');await import('/node_modules/@xterm/xterm/css/xterm.css');await import('/src/themes.css');await import('/src/styles.css');await import('/src/buttons.css');
      window.i18n=await import('/src/i18n/index.ts');window.messages=await import('/src/editorMessages.ts');window.store=(await import('/src/store.ts')).useStore;
      window.tr=(key,values)=>i18n.translate(i18n.useLanguage.getState().language,key,values);window.theme=(await import('/src/uiTheme.ts')).useUiTheme;theme.getState().setTheme(${JSON.stringify(theme)});i18n.useLanguage.getState().setLanguage('de');
      window.entry=await import('/src/workspace/WorkspaceApplication.tsx');window.application=entry.mountWorkspaceApplication(document.getElementById('root'),{repositoryOptions:{databaseName:${JSON.stringify(name)}},legacy:{storage:{getItem:()=>null},origin:location.origin}});await application.ready;`);
    await wait(`document.querySelector('.workspace-tabs')`);
  };
  const capture = async (filename, lang, theme, width) => {
    const tooltip = await page.evaluate(`const button=document.querySelector('[data-history-action=undo]');button.focus();return {text:button.title,rect:button.getBoundingClientRect().toJSON()};`);
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: tooltip.rect.x + tooltip.rect.width / 2, y: tooltip.rect.y + tooltip.rect.height / 2 });
    await delay(250); // Record the native title separately; do not fake tooltips in the app.
    const notice = await page.evaluate(`return document.querySelector('.toolbar-notice')?.textContent??'';`);
    const image = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(path.join(images, filename), Buffer.from(image.data, 'base64'));
    captures.push({ filename, language: lang, theme, width, tooltip: tooltip.text, notice });
    assert.equal(await page.evaluate(`return document.documentElement.scrollWidth<=innerWidth+1;`), true);
  };
  const steps = [
    ['create-device', `store.getState().addDeviceAt('host',{x:220,y:160});window.H=store.getState().nodes.at(-1).id;`],
    ['rename-device', `store.getState().renameDevice(H,'Router – São Paulo 東京');`],
    ['create-device', `store.getState().addDeviceAt('host',{x:440,y:160});window.P=store.getState().nodes.at(-1).id;`],
    ['enable-wireless', `store.getState().enableWireless(H);`],
    ['create-device', `store.getState().addDeviceAt('ap',{x:300,y:350});window.A=store.getState().nodes.at(-1).id;`],
    ['set-wifi-range', `store.getState().setWifiRange(A,500);`],
    ['add-links', `const result=store.getState().associateWireless(H,A);if(result)throw Error(result);`],
    ['remove-links', `const result=store.getState().associateWireless(H,null);if(result)throw Error(result);`],
    ['add-links', `store.getState().onConnect({source:H,target:P});`],
    ['remove-links', `store.getState().deleteTopologyElements([],store.getState().edges.map(e=>e.id));`],
    ['set-iface-state', `store.getState().toggleIface(H,'eth0');`],
    ['set-area-markings', `store.getState().onNodesChange(store.getState().nodes.map(n=>({type:'select',id:n.id,selected:n.id===H||n.id===P})));window.M=store.getState().createMarking({name:'Área – München 東京',color:'blue',intensity:18});if(!M)throw Error('Missing marking');`],
    ['set-area-markings', `store.getState().updateMarking(M,{name:'Área – São Paulo 東京',color:'teal',intensity:25});`],
    ['delete-devices', `store.getState().deleteDevice(H);`],
  ];
  try {
    for (const theme of ['graphite-dark', 'classic-light']) for (const width of [1440, 700]) {
      const prefix = theme + '-' + width, name = 'netlab-idb-test-' + crypto.randomUUID(); databases.push(name);
      await page.send('Emulation.setDeviceMetricsOverride', { width, height: 960, deviceScaleFactor: 1, mobile: false });
      await navigate(name, theme);
      await page.evaluate(`Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{}}});`);
      let index = 0;
      for (const [type, action] of steps) {
        await language('de'); await flush(); const before = await snapshot(); await page.evaluate(action); await flush();
        const after = await snapshot(), history = await page.evaluate(`return store.getState().topologyHistory;`);
        assert.equal(history.past.at(-1).type, type);
        for (const lang of ['de', 'en', 'pt-BR']) await check(prefix + '-' + (++index) + ': ' + type + ' / ' + lang, async () => {
          await language(lang);
          const title = await page.evaluate(`return document.querySelector('[data-history-action=undo]').title;`);
          const expected = await page.evaluate(`const operation=store.getState().topologyHistory.past.at(-1);return tr('navigation.undoAction',{action:messages.historyOperationLabel(operation,tr)});`);
          assert(title.startsWith(expected)); assert.deepEqual(await snapshot(), after);
          assert.deepEqual(await page.evaluate(`return store.getState().topologyHistory;`), history);
          await click('[data-history-action=undo]'); await flush(); assert.deepEqual(await snapshot(), before);
          const redo = await page.evaluate(`return document.querySelector('[data-history-action=redo]').title;`);
          assert(redo.startsWith(await page.evaluate(`return tr('navigation.redoAction',{action:messages.historyOperationLabel(store.getState().topologyHistory.future.at(-1),tr)});`)));
          await click('[data-history-action=redo]'); await flush(); assert.deepEqual(await snapshot(), after);
          if (type === 'rename-device') {
            await page.evaluate(`store.getState().copyDeviceConfig(H);`); await wait(`store.getState().notice?.key==='navigation.configCopied'`);
            await wait(`document.querySelector('.toolbar-notice')?.textContent===messages.editorMessageText(store.getState().notice,tr)`);
            await capture(lang + '-' + prefix + '-undo-notificacao.png', lang, theme, width);
          }
        });
      }
      // Use an actual clipboard operation and keep its four-second lifetime intact.
      await page.evaluate(`Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{}}});`);
      for (const lang of ['de', 'en', 'pt-BR']) await check(prefix + ': notification follows language / ' + lang, async () => {
        await language('de'); await page.evaluate(`store.getState().shareUrl();`);
        await wait(`store.getState().notice?.key==='navigation.shareCopied'`); const pending = await page.evaluate(`return store.getState().notice;`);
        await language(lang); await wait(`document.querySelector('.toolbar-notice')?.textContent===tr('navigation.shareCopied')`);
        assert.deepEqual(await page.evaluate(`return store.getState().notice;`), pending);
      });
      await check(prefix + ': conditional connection, clipboard, import and export errors', async () => {
        for (const lang of ['de', 'en', 'pt-BR']) {
          await language(lang); const before = await snapshot();
          await page.evaluate(`store.getState().onConnect({source:'missing-device',target:P});`);
          await wait(`document.querySelector('.toolbar-notice')?.textContent===tr('navigation.connectionFailed')`);
          assert.deepEqual(await snapshot(), before);
          await page.evaluate(`Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw Error('Untranslated diagnostic')}}});store.getState().shareUrl();`);
          await wait(`document.querySelector('.toolbar-notice')?.textContent===tr('navigation.shareCopyFailed')`);
          assert.deepEqual(await snapshot(), before);
          const error = await page.evaluate(`return store.getState().importJson('{broken Unicode original');`);
          assert(error); assert.deepEqual(await snapshot(), before);
          assert.equal(await page.evaluate(`return store.getState().rejectedDocument.text;`), '{broken Unicode original');
          assert.equal(await page.evaluate(`return messages.editorMessageText(store.getState().rejectedDocument.presentation,tr);`), await page.evaluate(`return tr('navigation.importFailed');`));
          await page.evaluate(`const Original=window.Image;window.Image=class {set src(_value){queueMicrotask(()=>this.onerror?.())}};store.getState().exportPng();window.Image=Original;`);
          await wait(`document.querySelector('.toolbar-notice')?.textContent===tr('navigation.pngFailed')`);
          assert.deepEqual(await snapshot(), before);
        }
      });
      await check(prefix + ': old structured labels and untouched free-text remain compatible', async () => {
        const old = await page.evaluate(`const history=store.getState().topologyHistory;history.past.at(-1).label='Custom old text – 東京';store.getState().installChapterHistory(JSON.parse(JSON.stringify(history)));return history;`);
        for (const lang of ['de', 'en', 'pt-BR']) { await language(lang); assert.deepEqual(await page.evaluate(`return store.getState().topologyHistory;`), old); }
        await page.evaluate(`store.getState().installChapterHistory({past:[{type:'chapter-restore',label:'Mein eigener Text – São Paulo 東京',id:'old'}],future:[]});`);
        for (const lang of ['de', 'en', 'pt-BR']) {
          await language(lang); assert((await page.evaluate(`return document.querySelector('[data-history-action=undo]').title;`)).includes('Mein eigener Text – São Paulo 東京'));
        }
      });
      await check(prefix + ': F5 keeps the document and existing volatile-history policy', async () => {
        await flush(); const before = await snapshot(), realm = await page.evaluate(`return performance.timeOrigin;`);
        await page.send('Page.reload'); await wait(`performance.timeOrigin!==${realm}&&document.readyState==='complete'`);
        await navigate(name, theme); assert.deepEqual(await snapshot(), before);
        assert.deepEqual(await page.evaluate(`return store.getState().topologyHistory;`), { past: [], future: [] });
        assert.equal(await page.evaluate(`return document.querySelector('[data-history-action=undo]').disabled;`), true);
        await page.evaluate(`store.getState().addDeviceAt('host',{x:200,y:100});`); await flush();
        await click('[data-history-action=undo]'); await flush(); assert.deepEqual(await snapshot(), before);
        await click('[data-history-action=redo]'); await flush();
      });
      await page.evaluate(`application.dispose();`);
    }
    // The legacy recovery bar is a separate consumer from WorkspaceProvider.
    // Only inject volatile presentation state here; real storage failures are
    // already covered by persistenceSafety and the production boot suite.
    await page.evaluate(`window.legacyRoot=(await import('/src/editorMessages.browser.tsx')).mountLegacyMessageReview(document.getElementById('root'));store.setState({autosaveError:messages.editorMessage('navigation.autosaveFailed'),rejectedDocument:{text:'original Unicode 東京',error:'Raw deep diagnostic',presentation:messages.editorMessage('navigation.importFailed')}});`);
    for (const lang of ['de', 'en', 'pt-BR']) await check('legacy recovery and raw-message compatibility / ' + lang, async () => {
      await language(lang);
      await wait(`[...document.querySelectorAll('.persistence-status [role=alert]')].some(e=>e.textContent===tr('navigation.autosaveFailed'))`);
      assert.equal(await page.evaluate(`return [...document.querySelectorAll('.persistence-status [role=alert]')].some(e=>e.textContent==='Raw deep diagnostic');`), false);
      assert.equal(await page.evaluate(`return store.getState().rejectedDocument.text;`), 'original Unicode 東京');
    });
    await page.evaluate(`store.setState({autosaveError:'Custom diagnostic – São Paulo 東京',rejectedDocument:null});`);
    await wait(`document.querySelector('.persistence-status [role=alert]')?.textContent==='Custom diagnostic – São Paulo 東京'`);
    await language('en'); await wait(`document.querySelector('.persistence-status [role=alert]')?.textContent==='Custom diagnostic – São Paulo 東京'`);
    await page.evaluate(`legacyRoot.unmount();`);
  } finally {
    await page.evaluate(`window.application?.dispose();`).catch(() => {});
    for (const name of databases) {
      assert(/^netlab-idb-test-[\da-f-]{36}$/.test(name));
      await page.evaluate(`await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase(${JSON.stringify(name)});r.onsuccess=resolve;r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Disposable cleanup blocked'));});`);
    }
    Object.assign(report.results, results); report.editorMessages = { checks: Object.keys(results).length, captures };
    await writeFile(path.join(directory, 'validation.json'), JSON.stringify(report.editorMessages, null, 2));
    const esc = text => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    await writeFile(path.join(directory, 'index.html'), '<!doctype html><meta charset="utf-8"><title>Editor i18n 2B</title><style>body{background:#151a21;color:#eee;font-family:system-ui}img{width:100%;max-width:1100px}figure{margin:24px}pre{white-space:pre-wrap}</style><p>Capturas reais. O title nativo de Undo está registrado na legenda; nenhum tooltip foi inserido artificialmente no aplicativo.</p>' + captures.map(c => `<figure><figcaption><pre>${esc(c.filename + '\n' + c.tooltip + '\n' + c.notice)}</pre></figcaption><a href="referencias-chatgpt/${c.filename}"><img src="referencias-chatgpt/${c.filename}" alt="${c.filename}"></a></figure>`).join(''));
  }
}
