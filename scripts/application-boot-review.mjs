import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import LZString from 'lz-string';
import { generateReview } from './visual-review.mjs';

/** Exercises the production mount in the existing disposable Chromium profile.
 * Repository names and injected failures exist only in this test harness. */
export async function runApplicationBootReview({ page, url, root, report, restart }) {
  const directory = path.join(root, '.playwright-mcp/reviews/raw/application-boot-staging');
  await mkdir(directory, { recursive: true });
  const databases = [], screenshots = [], results = {};
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const wait = async expression => {
    for (let i = 0; i < 160; i++) { try { if (await page.evaluate(`return !!(${expression});`)) return; } catch {} await delay(50); }
    throw Error('Boot condition timed out: ' + expression);
  };
  const test = async (name, run) => {
    const before = report.downloads.length;
    page.labelDownloads(name);
    try {
      await run(); await delay(100); await page.drainDownloads();
      const expected = name.includes('quota errors') || name.includes('unavailable IndexedDB') || name.includes('manual topology export') ? 1
        : name.includes('rejected legacy and incompatible drafts') ? 3 : 0;
      assert.equal(report.downloads.length - before, expected, `Unexpected downloads during ${name}`);
      results[name] = { passed: true, downloads: expected };
    } catch (error) { results[name] = { passed: false, error: error.stack }; throw error; }
  };
  const database = () => { const name = 'netlab-idb-test-' + crypto.randomUUID(); databases.push(name); return name; };
  const navigate = async () => {
    await page.send('Page.navigate', { url }); await wait(`location.pathname==='/__application_boot_test__'&&document.readyState==='complete'`);
    await page.evaluate(`
      await import('/node_modules/@xyflow/react/dist/style.css');await import('/node_modules/@xterm/xterm/css/xterm.css');
      await import('/src/themes.css');await import('/src/styles.css');await import('/src/buttons.css');
      window.entry=await import('/src/workspace/WorkspaceApplication.tsx');window.store=(await import('/src/store.ts')).useStore;
      window.sim=(await import('/src/sim.ts')).sim;window.projects=await import('/src/projects/index.ts');
      window.fixtures=await import('/src/projects/browserFixtures.ts');window.theme=(await import('/src/uiTheme.ts')).useUiTheme;
      window.backups=[];const create=URL.createObjectURL.bind(URL);URL.createObjectURL=blob=>{backups.push(blob);return create(blob);};
    `);
  };
  const mount = async (name, extra = '') => {
    await page.evaluate(`window.application=entry.mountWorkspaceApplication(document.getElementById('root'),{repositoryOptions:{databaseName:${JSON.stringify(name)}${extra}}});await application.ready;`);
  };
  const ready = async () => wait(`application.controller?.getState().phase==='ready'&&document.querySelector('.workspace-tabs')`);
  const dispose = async () => page.evaluate(`window.application?.dispose();`);
  const textButton = async (text, scope = 'body') => {
    const selector = `[...document.querySelectorAll(${JSON.stringify(scope + ' button')})].find(b=>b.textContent.trim()===${JSON.stringify(text)})`;
    await wait(selector); await page.evaluate(`const b=${selector};if(b.disabled)throw Error('Disabled button');b.click();`);
  };
  const menu = async text => { await textButton('Datei', '.toolbar'); await textButton(text, '.toolbar-command-menu'); };
  const idle = async () => wait(`!document.querySelector('.app')?.inert&&!document.querySelector('dialog[open]')`);
  const persisted = async () => wait(`application.controller&&!application.controller.hasPendingOperations()&&!application.controller.getState().drafts.some(d=>d.pendingPersistence||d.saving)`);
  const snapshot = () => page.evaluate(`return {state:application.controller.getState(),document:store.getState().captureWorkspaceDocument(),generation:store.getState().topologyGeneration,paused:store.getState().paused,clock:store.getState().clock,terminals:store.getState().terminals,packets:store.getState().packets.length};`);
  const guard = () => page.evaluate(`const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);return event.defaultPrevented;`);
  const capture = async (name, width, theme) => {
    await page.send('Emulation.setDeviceMetricsOverride', { width, height: 960, deviceScaleFactor: 1, mobile: false });
    await page.evaluate(`theme.getState().setTheme(${JSON.stringify(theme)});`); await delay(400);
    const layout = await page.evaluate(`return {viewport:[innerWidth,innerHeight],document:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],nodes:document.querySelectorAll('.react-flow__node').length};`);
    assert(layout.document[0] <= width + 1, 'External horizontal overflow'); assert(layout.document[1] <= 961, 'External vertical overflow');
    const image = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(path.join(directory, name), Buffer.from(image.data, 'base64'));
    screenshots.push({ name, width, height: 960, theme, layout });
  };
  const initialLegacy = await page.evaluate(`return localStorage.getItem('netsim:autosave:v1');`);
  let original, mainDatabase, beforeRestart;
  try {
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false });
    await test('boot-ui: first migration preserves exact legacy bytes and starts one paused simulation', async () => {
      await navigate(); mainDatabase = database();
      original = await page.evaluate(`const d=fixtures.document();delete d.topology.lab;delete d.topology.labProgress;d.topology.devices[0].name='Desktop-Legacy';const raw='  '+JSON.stringify(d.topology)+'\\n';localStorage.setItem('netsim:autosave:v1',raw);return raw;`);
      await mount(mainDatabase); await ready(); const current = await snapshot();
      assert.equal(current.document.topology.devices[0].name, 'Desktop-Legacy'); assert.equal(current.paused, true); assert.equal(current.generation, 1); assert.equal(current.clock, 0);
      assert.equal(await page.evaluate(`return localStorage.getItem('netsim:autosave:v1');`), original);
      assert.equal(await page.evaluate(`return (await application.repository.listProjects()).value.length;`), 1);
      await persisted(); assert.equal(await guard(), false, 'A durable draft must not require manual Save');
    });
    await test('boot-ui: subsequent boot does not duplicate migration and old retry actions cannot write the legacy key', async () => {
      await dispose(); await navigate(); await mount(mainDatabase); await ready();
      assert.equal(await page.evaluate(`return (await application.repository.listProjects()).value.length;`), 1);
      await page.evaluate(`store.getState().retryAutosave();store.getState().saveTemporaryTopology();store.getState().boot();store.getState().flushAutosave();`);
      await persisted(); assert.equal(await page.evaluate(`return localStorage.getItem('netsim:autosave:v1');`), original);
    });
    await test('boot-ui: Save As, Save, JSON, Demo, Labs and examples create independent drafts', async () => {
      await menu('Speichern unter…'); await wait(`document.querySelector('.workspace-name-label input')`);
      await page.evaluate(`document.querySelector('.workspace-name-label input').focus();`); await page.send('Input.insertText', { text: 'Desktop-Kopie' });
      await textButton('Speichern', 'dialog[open]'); await idle(); await persisted();
      await page.evaluate(`store.getState().renameDevice(store.getState().nodes[0].id,'Manual-Save');`);
      await menu('Speichern'); await idle(); await persisted();
      assert.equal(await page.evaluate(`return application.controller.getState().drafts[0].manualSavePending;`), false);
      // Real input/change path, not a controller-only surrogate.
      await page.evaluate(`const d=fixtures.changed('JSON-Entwurf');delete d.topology.lab;delete d.topology.labProgress;const transfer=new DataTransfer();transfer.items.add(new File([JSON.stringify(d.topology)],'input.json',{type:'application/json'}));const input=document.querySelector('input[type=file]');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));`);
      await wait(`application.controller.getState().drafts.length===2&&!document.querySelector('.app').inert`);
      await page.evaluate(`store.getState().renameDevice(store.getState().nodes[0].id,'JSON geändert');`); await persisted();
      const count = await page.evaluate(`return application.controller.getState().drafts.length;`);
      await textButton('Labs', '.toolbar'); await textButton('Demo', '.toolbar-command-menu');
      await wait(`application.controller.getState().drafts.length===${count + 1}&&!document.querySelector('.app').inert`);
      await page.evaluate(`store.getState().renameDevice(store.getState().nodes[0].id,'Dritter Entwurf');const c=application.controller;const ids=c.getState().session.draftIds;const r=await c.reorderTabs([ids[2],ids[0],ids[1]]);if(!r.ok)throw Error(JSON.stringify(r));`);
      await persisted(); await page.evaluate(`store.getState().select(store.getState().nodes[0].id);store.getState().openTerminal(store.getState().nodes[0].id);`);
      await capture('01-three-plans-terminal-graphite-1440.png', 1440, 'graphite-dark');
      await capture('02-three-plans-terminal-classic-700.png', 700, 'classic-light');
      beforeRestart = await snapshot(); assert.equal(beforeRestart.state.drafts.length, 3);
    });
    await test('boot-ui: three drafts, order, focus and edits survive closing Chromium and reopening its profile', async () => {
      // Flush ahead of shutdown. Browser.close is not treated as a guarantee
      // that a last-second asynchronous write can finish.
      await page.evaluate(`await application.controller.flush();store.getState().setPaused(false);`); await delay(150);
      page = await restart(); await navigate(); await mount(mainDatabase); await ready(); await persisted();
      const after = await snapshot(); assert.deepEqual(after.state.session.draftIds, beforeRestart.state.session.draftIds);
      assert.equal(after.state.activeDraftId, beforeRestart.state.activeDraftId); assert.deepEqual(after.document, beforeRestart.document);
      assert.equal(after.paused, true); assert.equal(after.clock, 0); assert.equal(after.generation, 1); assert.equal(after.packets, 0); assert.deepEqual(after.terminals, []);
      assert.equal(await page.evaluate(`return localStorage.getItem('netsim:autosave:v1');`), original);
      for (const id of after.state.session.draftIds) {
        const loaded = await page.evaluate(`const r=await application.controller.switchDraft(${JSON.stringify(id)});if(!r.ok)throw Error(JSON.stringify(r));return store.getState().captureWorkspaceDocument().topology.devices[0].name;`);
        assert(['Dritter Entwurf', 'Manual-Save', 'JSON geändert'].includes(loaded));
      }
      await capture('03-restored-classic-1440.png', 1440, 'classic-light');
    });
    await test('boot-ui: pending writes and unapplied forms warn, durable unsaved drafts do not', async () => {
      await page.evaluate(`window.writeOriginal=application.repository.workspace.updateDraft.bind(application.repository.workspace);let release;window.writeGate=new Promise(r=>release=r);window.releaseWrite=release;application.repository.workspace.updateDraft=async(...args)=>{await writeGate;return writeOriginal(...args)};store.getState().renameDevice(store.getState().nodes[0].id,'Pending write');`);
      assert.equal(await guard(), true); await page.evaluate(`releaseWrite();`); await persisted(); assert.equal(await guard(), false);
      await page.evaluate(`window.releaseForm=(await import('/src/persistence/pendingForms.ts')).registerPendingForm(()=>true);`);
      assert.equal(await guard(), true); await page.evaluate(`releaseForm();application.repository.workspace.updateDraft=writeOriginal;`); assert.equal(await guard(), false);
    });
    await test('boot-ui: quota errors preserve the local draft, permit export and recover through explicit retry', async () => {
      const before = report.downloads.length;
      await page.evaluate(`window.updateOriginal=application.repository.workspace.updateDraft.bind(application.repository.workspace);application.repository.workspace.updateDraft=async()=>({ok:false,error:{code:'quota-exceeded',message:'Injected disposable failure'}});store.getState().renameDevice(store.getState().nodes[0].id,'Recover this local draft');await application.controller.flush();`);
      await wait(`document.querySelector('.workspace-recovery')`); await capture('04-write-error-graphite-1440.png', 1440, 'graphite-dark');
      assert.equal(report.downloads.length, before, 'Showing recovery must not export automatically');
      await textButton('Backup exportieren', '.workspace-recovery');
      assert.equal(await page.evaluate(`return JSON.parse(await backups.at(-1).text()).devices[0].name;`), 'Recover this local draft');
      assert.equal(await guard(), true);
      await page.evaluate(`application.repository.workspace.updateDraft=updateOriginal;const r=await application.controller.flush();if(!r.ok)throw Error(JSON.stringify(r));`); await persisted();
    });
    await test('boot-ui: Share Link acceptance is explicit and creates an independent draft', async () => {
      const before = (await snapshot()).state.drafts.length;
      const json = await page.evaluate(`const d=fixtures.changed('Share-Entwurf');delete d.topology.lab;delete d.topology.labProgress;return JSON.stringify(d.topology);`);
      await page.evaluate(`location.hash=${JSON.stringify('t=' + LZString.compressToEncodedURIComponent(json))};`);
      await wait(`application.controller.getState().pendingShare`); assert.equal((await snapshot()).state.drafts.length, before);
      await textButton('In neuer Registerkarte öffnen', '.workspace-share');
      await wait(`application.controller.getState().drafts.length===${before + 1}&&!document.querySelector('.app').inert`);
      assert.equal((await snapshot()).document.topology.devices[0].name, 'Share-Entwurf'); await persisted();
      await capture('05-share-draft-graphite-700.png', 700, 'graphite-dark');
    });
    await test('boot-ui: unavailable IndexedDB fails closed and offers exact original export without a demo', async () => {
      await dispose(); await navigate(); const name = database(); await mount(name, ',factory:null');
      await wait(`document.querySelector('[data-error-code="unavailable"]')`);
      assert.equal(await page.evaluate(`return store.getState().nodes.length;`), 0);
      await textButton('Original exportieren', '.workspace-start'); assert.equal(await page.evaluate(`return backups.at(-1).text();`), original);
      assert.equal(await page.evaluate(`return (await indexedDB.databases()).some(d=>d.name===${JSON.stringify(name)});`), false);
      await capture('06-unavailable-classic-700.png', 700, 'classic-light');
    });
    await test('boot-ui: cancelling a blocked open and retrying cannot activate a stale attempt or duplicate the session', async () => {
      await dispose(); await navigate(); const name = database();
      await page.evaluate(`const r=indexedDB.open(${JSON.stringify(name)});window.blocker=await new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});blocker.onversionchange=()=>{};const remove=indexedDB.deleteDatabase(${JSON.stringify(name)});window.deleteBlocked=false;remove.onblocked=()=>{window.deleteBlocked=true};window.blockedDeletion=new Promise((resolve,reject)=>{remove.onsuccess=resolve;remove.onerror=()=>reject(remove.error)});`);
      await wait(`deleteBlocked`);
      await page.evaluate(`window.application=entry.mountWorkspaceApplication(document.getElementById('root'),{repositoryOptions:{databaseName:${JSON.stringify(name)}}});`);
      await textButton('Abbrechen', '.workspace-start'); await textButton('Erneut versuchen', '.workspace-start');
      await page.evaluate(`blocker.close();await blockedDeletion;`); await ready(); await delay(100);
      assert.equal((await snapshot()).generation, 1);
      assert.equal(await page.evaluate(`return (await application.repository.listProjects()).value.length;`), 1);
    });
    await test('boot-ui: rejected legacy and incompatible drafts remain exportable and never become a demo', async () => {
      await dispose(); await navigate(); const name = database();
      await page.evaluate(`localStorage.setItem('netsim:autosave:v1','  {unsupported original');`); await mount(name);
      await wait(`document.querySelector('[data-error-code="legacy-recovery-required"]')`);
      assert.equal(await page.evaluate(`return store.getState().nodes.length;`), 0);
      await textButton('Original exportieren', '.workspace-start'); assert.equal(await page.evaluate(`return backups.at(-1).text();`), '  {unsupported original');
      await textButton('Speicher-Backup exportieren', '.workspace-start'); await wait(`backups.length===2`);
      assert.equal(await page.evaluate(`return JSON.parse(await backups.at(-1).text()).format;`), 'netlab-storage-recovery');
      await dispose(); await navigate();
      await page.evaluate(`localStorage.setItem('netsim:autosave:v1',${JSON.stringify(original)});const r=indexedDB.open(${JSON.stringify(mainDatabase)});const db=await new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});const tx=db.transaction('meta','readwrite');const meta=tx.objectStore('meta'),all=meta.getAll();all.onsuccess=()=>{const draft=all.result.find(r=>r.key.startsWith('workspace:v1:draft:')&&r.value.state==='open');draft.value.document.schemaVersion=99;meta.put(draft)};await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error)});db.close();`);
      await mount(mainDatabase); await wait(`document.querySelector('[data-error-code="incompatible-document"]')`);
      assert.equal(await page.evaluate(`return store.getState().nodes.length;`), 0);
      await textButton('Speicher-Backup exportieren', '.workspace-start'); await wait(`backups.length===1`);
      assert.equal(await page.evaluate(`const a=JSON.parse(await backups[0].text());return a.stores.meta.some(r=>r.value?.document?.schemaVersion===99);`), true);
    });
    await test('boot-ui: first start without legacy creates an empty draft and F5 restores it without seeding a demo', async () => {
      await dispose(); await navigate(); const name = database(); await page.evaluate(`localStorage.removeItem('netsim:autosave:v1');`);
      await mount(name); await ready(); assert.equal((await snapshot()).document.topology.devices.length, 0);
      const before = await snapshot(); await dispose(); await navigate(); await mount(name); await ready();
      assert.equal((await snapshot()).state.activeDraftId, before.state.activeDraftId);
      assert.equal(await page.evaluate(`return localStorage.getItem('netsim:autosave:v1');`), null);
    });
    await test('boot-ui: manual topology export downloads only by request', async () => {
      await page.send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});await delay(100);
      await textButton('Datei','.toolbar');
      await page.evaluate('[...document.querySelectorAll(".toolbar-command-menu button")].find(b=>b.querySelector("span")?.textContent==="Export").click();');
      await wait('document.querySelector("#toolbar-export-menu")');
      await page.evaluate('[...document.querySelectorAll("#toolbar-export-menu button")].find(b=>b.textContent.includes("Topology (.json)")).click();');
    });
    await test('boot-ui: real app.html owns normal boot and restores its draft through F5 without legacy listeners', async () => {
      await dispose(); await navigate(); const name = database();
      await page.evaluate(`localStorage.setItem('netsim:autosave:v1',${JSON.stringify(original)});`);
      // Redirect only the production database name, in this disposable realm.
      // No production URL switch or alternate normal-boot implementation.
      const injection = await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `const open=IDBFactory.prototype.open;IDBFactory.prototype.open=function(name,...args){return open.call(this,name==='netlab-projects'?${JSON.stringify(name)}:name,...args)};` });
      try {
        await page.send('Page.navigate', { url: new URL('/app.html', url).href }); await wait(`document.querySelector('.workspace-tabs [role=tab]')`);
        assert.equal(await page.evaluate(`const s=(await import('/src/store.ts')).useStore.getState();return s.paused&&s.topologyGeneration===1&&s.workspaceIdentity!==null;`), true);
        await page.evaluate(`const s=(await import('/src/store.ts')).useStore.getState();s.renameDevice(s.nodes[0].id,'Normal boot saved draft');`);
        await wait(`document.querySelector('.autosave-state')?.textContent==='Entwurf gesichert · nicht gespeichert'`);
        const realm = await page.evaluate(`return performance.timeOrigin;`);
        await page.send('Page.reload'); await wait(`performance.timeOrigin!==${realm}&&document.querySelector('.workspace-tabs [role=tab]')`);
        assert.equal(await page.evaluate(`const s=(await import('/src/store.ts')).useStore.getState();return s.captureWorkspaceDocument().topology.devices[0].name;`), 'Normal boot saved draft');
        assert.equal(await page.evaluate(`return localStorage.getItem('netsim:autosave:v1');`), original);
      } finally { await page.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: injection.identifier }); await navigate(); }
    });
  } finally {
    try { await dispose(); } catch {}
    for (const name of databases) await page.evaluate(`await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase(${JSON.stringify(name)});r.onsuccess=resolve;r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Boot cleanup blocked'));});`);
    await page.evaluate(`const raw=${JSON.stringify(initialLegacy)};if(raw===null)localStorage.removeItem('netsim:autosave:v1');else localStorage.setItem('netsim:autosave:v1',raw);`);
    Object.assign(report.results, results); await writeFile(path.join(directory, 'results.json'), JSON.stringify({ results, screenshots }, null, 2));
    if (process.env.NETLAB_BOOT_PUBLISH !== '0' && Object.keys(results).length >= 12 && Object.values(results).every(r => r.passed)) {
      const captures = screenshots.map(s => ({ source: path.relative(root, path.join(directory, s.name)).split(path.sep).join('/'), scene: s.name.slice(3, -4), variant: s.theme, state: 'normal', width: s.width, height: s.height }));
      const manifest = path.join(directory, 'manifest.json');
      await writeFile(manifest, JSON.stringify({ id: 'workspace-save-load-fase-5b2-b', title: 'NetLab — Save/Load · Fase 5B2-B',
        description: 'Boot normal em perfil descartável. Migração, reinício completo e recuperação de erros.',
        variants: [{ id: 'graphite-dark', label: 'Graphite Dark' }, { id: 'classic-light', label: 'Classic Light' }], states: ['normal'], captures,
        share: captures.filter((_, i) => [0, 1, 3, 5].includes(i)).map(s => ({ scene: s.scene, variant: s.variant, state: s.state, width: s.width, height: s.height, name: s.scene })), shareContactSheet: false,
      }, null, 2));
      report.bootReview = await generateReview(manifest);
      await writeFile(path.join(report.bootReview.raw, 'test-results.json'), JSON.stringify({ results, screenshots }, null, 2));
    }
  }
}
