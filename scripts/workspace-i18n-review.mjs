import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Production Workspace UI, disposable profile/database only. No user storage. */
export async function runWorkspaceI18nReview({ page, url, root, report }) {
  const directory = path.join(root, '.playwright-mcp/reviews/workspace-2a');
  const images = path.join(directory, 'referencias-chatgpt');
  await mkdir(images, { recursive: true });
  const databases = [], captures = [], results = {};
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const wait = async expression => {
    for (let i = 0; i < 160; i++) {
      try { if (await page.evaluate(`return !!(${expression});`)) return; } catch {}
      await delay(40);
    }
    throw Error('Workspace i18n timeout: ' + expression);
  };
  const check = async (name, work) => {
    try { await work(); results['workspace-i18n: ' + name] = { passed: true }; }
    catch (error) { results['workspace-i18n: ' + name] = { passed: false, error: error.stack }; throw error; }
  };
  const click = async selector => {
    await wait(`document.querySelector(${JSON.stringify(selector)})`);
    await page.evaluate(`const el=document.querySelector(${JSON.stringify(selector)});if(el.disabled||el.closest('[inert]'))throw Error('Inert target');el.click();`);
  };
  const text = async (key, scope = 'body') => {
    const expression = `[...document.querySelectorAll(${JSON.stringify(scope + ' button')})].find(e=>{const copy=e.cloneNode(true);copy.querySelectorAll('[aria-hidden]').forEach(n=>n.remove());return copy.textContent.trim()===tr(${JSON.stringify(key)})})`;
    await wait(`(${expression})&&!(${expression}).disabled&&!(${expression}).closest('[inert]')`);
    await page.evaluate(`const el=${expression};if(el.disabled||el.closest('[inert]'))throw Error('Inert button');el.click();`);
  };
  const menu = async key => {
    if (!await page.evaluate(`return !!document.querySelector('[role=menubar]');`)) {
      await click('.toolbar-navigation > .toolbar-menu-trigger'); await text('navigation.file', '.toolbar-command-menu');
    } else await text('navigation.file', '.toolbar');
    await text(key, '.toolbar-command-menu');
  };
  const idle = () => wait(`document.querySelector('.app')&&!document.querySelector('.app').inert`);
  const persisted = () => wait(`application.controller&&!application.controller.hasPendingOperations()&&!application.controller.getState().drafts.some(d=>d.pendingPersistence||d.saving)`);
  const tabs = count => wait(`document.querySelectorAll('.workspace-tabs [role=tab]').length===${count}&&!document.querySelector('.app').inert`);
  const status = async key => assert.equal(await page.evaluate(`return document.querySelector('.autosave-state').textContent;`), await page.evaluate(`return tr(${JSON.stringify(key)});`));
  const snapshot = () => page.evaluate(`return {state:application.controller.getState(),document:store.getState().captureWorkspaceDocument()};`);
  const dispose = () => page.evaluate(`window.application?.dispose();`);
  const navigate = async (databaseName, language, theme, extra = '') => {
    await page.send('Page.navigate', { url }); await wait(`document.readyState==='complete'&&location.pathname==='/__application_boot_test__'`);
    await page.evaluate(`
      await import('/node_modules/@xyflow/react/dist/style.css');await import('/node_modules/@xterm/xterm/css/xterm.css');
      await import('/src/themes.css');await import('/src/styles.css');await import('/src/buttons.css');
      window.i18n=await import('/src/i18n/index.ts');window.tr=key=>i18n.translate(i18n.useLanguage.getState().language,key);
      i18n.useLanguage.getState().setLanguage(${JSON.stringify(language)});
      window.store=(await import('/src/store.ts')).useStore;window.theme=(await import('/src/uiTheme.ts')).useUiTheme;theme.getState().setTheme(${JSON.stringify(theme)});
      window.fixtures=await import('/src/projects/browserFixtures.ts');window.entry=await import('/src/workspace/WorkspaceApplication.tsx');
      window.application=entry.mountWorkspaceApplication(document.getElementById('root'),{repositoryOptions:{databaseName:${JSON.stringify(databaseName)}${extra}},legacy:{storage:{getItem:()=>null},origin:location.origin}});
      await application.ready;
    `);
  };
  const capture = async (filename, language, theme, width) => {
    await delay(150);
    await page.evaluate(`await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));`);
    const layout = await page.evaluate(`const brand=document.querySelector('.brand-name');return {width:innerWidth,scroll:document.documentElement.scrollWidth,brand:brand?.getBoundingClientRect().toJSON()};`);
    assert(layout.scroll <= width + 1, 'Page overflow');
    if (layout.brand) assert(layout.brand.width > 0 && layout.brand.top >= 0 && layout.brand.bottom < 53, 'Software identification must stay visible');
    const image = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(path.join(images, filename), Buffer.from(image.data, 'base64'));
    captures.push({ filename, language, theme, width });
  };
  const importFile = async contents => {
    await page.evaluate(`const transfer=new DataTransfer();transfer.items.add(new File([${JSON.stringify(contents)}],'Unicode-topologia.json',{type:'application/json'}));const el=document.querySelector('input[type=file]');el.files=transfer.files;el.dispatchEvent(new Event('change',{bubbles:true}));`);
  };
  try {
    for (const language of ['de', 'en', 'pt-BR']) for (const [theme, width] of [['graphite-dark', 1440], ['classic-light', 700]]) {
      const prefix = language + '-' + theme, name = 'netlab-idb-test-' + crypto.randomUUID(); databases.push(name);
      await page.send('Emulation.setDeviceMetricsOverride', { width, height: 960, deviceScaleFactor: 1, mobile: false });
      await navigate(name, language, theme); await tabs(1); await persisted();
      await check(prefix + ': unnamed tab, accessible names and local draft status', async () => {
        assert.equal(await page.evaluate(`return document.querySelector('.workspace-tab-name').textContent;`), await page.evaluate(`return tr('workspace.untitled');`));
        assert.equal(await page.evaluate(`return document.querySelector('.workspace-tabs').getAttribute('aria-label');`), await page.evaluate(`return tr('workspace.openPlans');`));
        assert.equal(await page.evaluate(`return document.querySelector('.workspace-add').getAttribute('aria-label');`), await page.evaluate(`return tr('workspace.new');`));
        await status('workspace.statusDraft');
        await capture(prefix + '-01-rascunho-abas.png', language, theme, width);
      });
      const customName = 'Unbenannt'; // A real saved name must never be translated.
      await check(prefix + ': explicit Save keeps names that resemble application defaults', async () => {
        await page.evaluate(`store.getState().addDeviceAt('host',{x:200,y:180});`); await persisted();
        await menu('navigation.save'); await wait(`document.querySelector('.workspace-name-label input')`);
        await page.evaluate(`document.querySelector('.workspace-name-label input').focus();`);
        await page.send('Input.insertText', { text: customName }); await text('navigation.save', 'dialog[open]'); await idle(); await persisted();
        await status('workspace.statusSaved');
        assert.equal(await page.evaluate(`return document.querySelector('.workspace-tab-name').textContent;`), customName);
        await page.evaluate(`i18n.useLanguage.getState().setLanguage('en');`); await delay(30);
        assert.equal(await page.evaluate(`return document.querySelector('.workspace-tab-name').textContent;`), customName);
        await page.evaluate(`i18n.useLanguage.getState().setLanguage(${JSON.stringify(language)});`);
      });
      await check(prefix + ': real pending and saving states never claim success', async () => {
        await page.evaluate(`window.originalUpdate=application.repository.workspace.updateDraft.bind(application.repository.workspace);window.writeGate=new Promise(r=>window.releaseWrite=r);application.repository.workspace.updateDraft=async(...a)=>{await writeGate;return originalUpdate(...a)};store.getState().renameDevice([...store.getState().nodes][0].id,'PC Unicode – São Paulo 東京');`);
        await wait(`document.querySelector('.autosave-state').textContent===tr('workspace.statusPending')`);
        await wait(`application.controller.getState().drafts.some(d=>d.saving)`); await status('workspace.statusSaving');
        await capture(prefix + '-02-salvando.png', language, theme, width);
        await page.evaluate(`releaseWrite();application.repository.workspace.updateDraft=originalUpdate;`); await persisted(); await status('workspace.statusDraftChanged');
      });
      await check(prefix + ': Cancel on close and Save As preserve topology and exact names', async () => {
        const before = await snapshot(); await click('.workspace-tab-wrap[data-active=true] .workspace-tab-close');
        await wait(`document.querySelector('dialog[open]')`);
        assert.equal(await page.evaluate(`return document.querySelector('dialog h2').textContent;`), await page.evaluate(`return tr('workspace.closeTitle');`));
        assert((await page.evaluate(`return document.querySelector('dialog').textContent;`)).includes(customName));
        await capture(prefix + '-03-confirmacao.png', language, theme, width);
        await text('common.cancel', 'dialog[open]'); assert.deepEqual(await snapshot(), before);
        await menu('navigation.saveAs'); await wait(`document.querySelector('.workspace-name-label input')`);
        await page.evaluate(`const input=document.querySelector('.workspace-name-label input');input.focus();input.select();`);
        await page.send('Input.insertText', { text: 'Plano – São Paulo 東京 🌐' }); await text('common.cancel', 'dialog[open]');
        assert.deepEqual(await snapshot(), before);
      });
      await check(prefix + ': F5 restores draft, selected tab, Unicode and language without renaming saved data', async () => {
        await persisted();
        const before = await snapshot();
        assert.equal(await page.evaluate(`const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);return event.defaultPrevented;`), false);
        const realm = await page.evaluate(`return performance.timeOrigin;`);
        await page.send('Page.reload'); await wait(`performance.timeOrigin!==${realm}&&document.readyState==='complete'`);
        await navigate(name, language, theme); await tabs(1); await persisted();
        const after = await snapshot();
        assert.deepEqual(after.document, before.document); assert.equal(after.state.activeDraftId, before.state.activeDraftId);
        assert.equal(after.state.drafts[0].base.planName, customName); await status('workspace.statusDraftChanged');
        await menu('navigation.save'); await idle(); await persisted(); await status('workspace.statusSaved');
        await capture(prefix + '-04-plano-salvo.png', language, theme, width);
      });
      await check(prefix + ': create, switch, close and unapplied-input confirmation remain guarded', async () => {
        await click('.workspace-add'); await tabs(2);
        await page.evaluate(`window.forms=(await import('/src/persistence/pendingForms.ts'));window.formPending=true;window.unregister=forms.registerPendingForm(()=>formPending);`);
        await click('.workspace-tabs [role=tab][aria-selected=false]'); await wait(`document.querySelector('dialog[open]')`);
        assert.equal(await page.evaluate(`return document.querySelector('dialog h2').textContent;`), await page.evaluate(`return tr('workspace.formsTitle');`));
        const active = (await snapshot()).state.activeDraftId; await text('common.cancel', 'dialog[open]');
        assert.equal((await snapshot()).state.activeDraftId, active);
        await click('.workspace-tabs [role=tab][aria-selected=false]'); await wait(`document.querySelector('dialog[open]')`);
        await page.evaluate(`window.formPending=false;`); await text('workspace.discardContinue', 'dialog[open]'); await idle();
        assert.notEqual((await snapshot()).state.activeDraftId, active); await page.evaluate(`unregister();`);
        await click('.workspace-tabs [role=tab][aria-selected=false]'); await idle();
        await click('.workspace-tab-wrap[data-active=true] .workspace-tab-close'); await tabs(1);
      });
      await check(prefix + ': invalid/valid file imports preserve existing data and saved-plan list', async () => {
        const before = await snapshot(); await importFile('{invalid');
        await wait(`document.querySelector('.workspace-recovery[data-error-code="invalid-document"]')`);
        assert.equal(await page.evaluate(`return document.querySelector('.workspace-recovery p').textContent;`), await page.evaluate(`return tr('workspace.errorDocument');`));
        assert.deepEqual((await snapshot()).document, before.document); await text('common.cancel', '.workspace-recovery');
        const document = await page.evaluate(`const d=fixtures.changed('Import – München São Paulo 東京');delete d.topology.lab;delete d.topology.labProgress;return JSON.stringify(d.topology);`);
        await importFile(document); await tabs(2); await persisted();
        assert.equal((await snapshot()).document.topology.devices[0].name, 'Import – München São Paulo 東京');
        await menu('navigation.save'); await wait(`document.querySelector('.workspace-name-label input')`);
        await page.evaluate(`document.querySelector('.workspace-name-label input').focus();`);
        await page.send('Input.insertText', { text: 'Plano – São Paulo 東京 🌐' }); await text('navigation.save', 'dialog[open]'); await idle(); await persisted();
        await click('.workspace-tab-wrap[data-active=true] .workspace-tab-close'); await tabs(1);
        await menu('navigation.plans'); await wait(`document.querySelector('.workspace-plan-row')`);
        const names = await page.evaluate(`return [...document.querySelectorAll('.workspace-plan-open strong')].map(e=>e.textContent);`);
        assert(names.includes(customName)); assert(names.includes('Plano – São Paulo 東京 🌐'));
        await page.evaluate(`const button=[...document.querySelectorAll('.workspace-plan-open')].find(e=>e.querySelector('strong').textContent==='Plano – São Paulo 東京 🌐');button.click();`); await tabs(2);
        const opened = await snapshot();
        assert.equal(opened.state.drafts.find(d=>d.id===opened.state.activeDraftId)?.base?.planName, 'Plano – São Paulo 東京 🌐');
        await click('.workspace-tab-wrap[data-active=true] .workspace-tab-close'); await tabs(1);
        await page.evaluate(`application.controller.openDocument(fixtures.changed('Discard this imported draft'));`); await tabs(2); await persisted();
        await click('.workspace-tab-wrap[data-active=true] .workspace-tab-close'); await wait(`document.querySelector('dialog[open]')`);
        await text('workspace.discard', 'dialog[open]'); await tabs(1);
      });
      await check(prefix + ': quota failure is localized and retry cannot fake saved status', async () => {
        await page.evaluate(`window.originalSave=application.repository.workspace.saveDraft.bind(application.repository.workspace);application.repository.workspace.saveDraft=async()=>({ok:false,error:{code:'quota-exceeded',message:'German raw diagnostic must not leak'}});store.getState().renameDevice(store.getState().nodes[0].id,'Recover – São Paulo 東京');`);
        await persisted(); await menu('navigation.save');
        await wait(`document.querySelector('.workspace-recovery[data-error-code="quota-exceeded"]')`); await status('workspace.statusError');
        assert.equal(await page.evaluate(`return document.querySelector('.workspace-recovery p').textContent;`), await page.evaluate(`return tr('workspace.errorQuota');`));
        assert(!(await page.evaluate(`return document.body.textContent;`)).includes('German raw diagnostic'));
        await capture(prefix + '-05-recuperacao.png', language, theme, width);
        await page.evaluate(`application.repository.workspace.saveDraft=originalSave;`); await text('workspace.retry', '.workspace-recovery');
        await wait(`!document.querySelector('.workspace-recovery')`); await persisted(); await status('workspace.statusSaved');
      });
      await check(prefix + ': accepting and cancelling shared content never replaces the current plan', async () => {
        const before = await snapshot(); await page.evaluate(`application.controller.offerShare(fixtures.changed('Share – 東京'));`);
        await wait(`document.querySelector('.workspace-share')`); await text('common.cancel', '.workspace-share');
        assert.deepEqual((await snapshot()).document, before.document); await tabs(1);
        await page.evaluate(`application.controller.offerShare(fixtures.changed('Share – 東京'));`); await wait(`document.querySelector('.workspace-share')`);
        await text('workspace.openNewTab', '.workspace-share'); await tabs(2);
        assert.equal((await snapshot()).document.topology.devices[0].name, 'Share – 東京');
        await click('.workspace-tabs [role=tab][aria-selected=false]'); await idle(); assert.deepEqual((await snapshot()).document, before.document);
      });
      await dispose();
    }
    for (const language of ['de', 'en', 'pt-BR']) {
      const name = 'netlab-idb-test-' + crypto.randomUUID(); databases.push(name);
      await page.send('Emulation.setDeviceMetricsOverride', { width: 1000, height: 960, deviceScaleFactor: 1, mobile: false });
      await check(language + ': production startup recovery responds to language changes and Cancel', async () => {
        await navigate(name, language, 'graphite-dark', ',factory:null'); await wait(`document.querySelector('.workspace-start [data-error-code="unavailable"]')`);
        assert.equal(await page.evaluate(`return document.querySelector('.workspace-start h1').textContent;`), await page.evaluate(`return tr('workspace.startupFailed');`));
        await capture(language + '-startup-recuperacao.png', language, 'graphite-dark', 1000);
        await page.evaluate(`i18n.useLanguage.getState().setLanguage('pt-BR');`); await delay(50);
        assert.equal(await page.evaluate(`return document.querySelector('.workspace-start h1').textContent;`), await page.evaluate(`return tr('workspace.startupFailed');`));
        await text('common.cancel', '.workspace-start'); await wait(`document.querySelector('.workspace-start h1')?.textContent===tr('workspace.startupCancelled')`);
        await dispose();
      });
    }
  } finally {
    await dispose().catch(() => {});
    for (const name of databases) {
      assert(/^netlab-idb-test-[\da-f-]{36}$/.test(name));
      await page.evaluate(`await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase(${JSON.stringify(name)});r.onsuccess=resolve;r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Disposable cleanup blocked'));});`);
    }
    Object.assign(report.results, results);
    report.workspaceI18n = { captures, directory, checks: Object.keys(results).length };
    await writeFile(path.join(directory, 'validation.json'), JSON.stringify(report.workspaceI18n, null, 2));
    await writeFile(path.join(directory, 'index.html'), '<!doctype html><meta charset="utf-8"><title>Workspace i18n 2A</title><style>body{background:#151a21;color:#eee;font-family:system-ui}img{width:100%;max-width:1100px}figure{margin:24px}</style>' + captures.map(c => `<figure><figcaption>${c.filename}</figcaption><a href="referencias-chatgpt/${c.filename}"><img src="referencias-chatgpt/${c.filename}" alt="${c.filename}"></a></figure>`).join(''));
  }
}
