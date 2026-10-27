import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { generateReview } from './visual-review.mjs';

export async function runWorkspaceUIReview({ page, url, root, report, openPage }) {
  const directory = path.join(root, '.playwright-mcp', 'reviews', 'raw', 'workspace-ui-staging');
  await mkdir(directory, { recursive: true });
  const screenshots = [], databases = [], pages = [page], results = {};
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const wait = async (expression, target = page) => {
    for (let i = 0; i < 140; i++) { if (await target.evaluate(`return !!(${expression});`)) return; await delay(50); }
    throw Error('UI condition timed out: ' + expression);
  };
  const click = async (selector, target = page) => {
    await wait(`document.querySelector(${JSON.stringify(selector)})`, target);
    await target.evaluate(`const el=document.querySelector(${JSON.stringify(selector)});if(el.disabled||el.closest('[inert]'))throw Error('Disabled/inert target');el.click();`);
  };
  const textButton = async (text, scope = 'body', target = page) => {
    const expression = `[...document.querySelectorAll(${JSON.stringify(scope + ' button')})].find(b=>b.textContent.trim()===${JSON.stringify(text)})`;
    await wait(expression, target); await target.evaluate(`const b=${expression};if(b.disabled)throw Error('Disabled button: '+b.textContent);b.click();`);
  };
  const input = async (selector, text, target = page) => {
    await wait(`document.querySelector(${JSON.stringify(selector)})`, target);
    await target.evaluate(`const e=document.querySelector(${JSON.stringify(selector)});e.focus();e.select();`);
    await target.send('Input.insertText', { text });
  };
  const key = async (key, modifiers = 0, target = page) => {
    await target.send('Input.dispatchKeyEvent', { type: 'keyDown', key, modifiers });
    await target.send('Input.dispatchKeyEvent', { type: 'keyUp', key, modifiers });
  };
  const idle = async (target = page) => wait(`document.querySelector('.app')&&!document.querySelector('.app').inert`, target);
  const tabs = async count => wait(`document.querySelectorAll('.workspace-tabs [role=tab]').length===${count}&&!document.querySelector('.app').inert`);
  const menu = async label => {
    if (!await page.evaluate(`return !!document.querySelector('[role=menubar]');`)) { await textButton('Menü', '.toolbar'); await textButton('Datei', '.toolbar-command-menu'); }
    else await textButton('Datei', '.toolbar');
    await textButton(label, '.toolbar-command-menu');
  };
  const database = () => { const name = 'netlab-idb-test-' + crypto.randomUUID(); databases.push(name); return name; };
  const prepare = async (target, name, extra = '') => {
    await target.send('Page.navigate', { url }); await wait(`document.readyState==='complete'&&location.pathname==='/__workspace_ui_test__'`, target);
    await target.evaluate(`window.entry=await import('/src/workspace/reviewEntry.tsx');window.store=(await import('/src/store.ts')).useStore;window.projects=await import('/src/projects/index.ts');window.theme=(await import('/src/uiTheme.ts')).useUiTheme;window.__backups=[];const original=URL.createObjectURL.bind(URL);URL.createObjectURL=b=>{window.__backups.push(b);return original(b);};window.workspaceReview=await entry.mountWorkspaceReview(document.getElementById('root'),{databaseName:${JSON.stringify(name)}${extra}});`);
  };
  const capture = async (filename, width = 1440, theme = 'graphite-dark', target = page) => {
    await target.send('Page.bringToFront');
    await target.send('Emulation.setDeviceMetricsOverride', { width, height: 960, deviceScaleFactor: 1, mobile: false });
    await target.evaluate(`window.theme.getState().setTheme(${JSON.stringify(theme)});`); await delay(350);
    // Review framing is an explicit user action. Panel/window resizes no longer
    // auto-fit; the dedicated viewport suite checks that those keep x/y/zoom.
    await target.evaluate(`document.querySelector('.react-flow__controls-fitview')?.click();`); await delay(100);
    await wait(`(()=>{const canvas=document.querySelector('.canvas')?.getBoundingClientRect();return [...document.querySelectorAll('.react-flow__node')].every(e=>{const r=e.getBoundingClientRect();return canvas&&r.left>=canvas.left-2&&r.right<=canvas.right+2&&r.top>=canvas.top-2&&r.bottom<=canvas.bottom+2;});})()`, target);
    const layout = await target.evaluate(`const canvas=document.querySelector('.canvas')?.getBoundingClientRect();return {width:innerWidth,scroll:document.documentElement.scrollWidth,canvas:canvas?.toJSON(),nodes:[...document.querySelectorAll('.react-flow__node')].map(e=>({id:e.getAttribute('data-id'),...e.getBoundingClientRect().toJSON()})),tabs:[...document.querySelectorAll('.workspace-tab-wrap')].map(e=>{const r=e.getBoundingClientRect();return {width:r.width,height:r.height};})};`);
    const image = await target.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
    await writeFile(path.join(directory, filename), Buffer.from(image.data, 'base64')); screenshots.push({ filename, width, height: 960, theme, layout });
    assert(layout.scroll <= layout.width + 1, 'Horizontal page overflow at ' + width);
    if (layout.canvas !== undefined) assert(layout.canvas.width > 100, 'Canvas was obscured.');
    assert(layout.tabs.every(t => t.height >= 32), 'Tab controls too small.');
    if (width === 700 && await target.evaluate(`return !!document.querySelector('.inspector-shell:not([hidden])');`)) {
      assert(layout.canvas.width <= 410, 'Inspector must reserve space rather than cover the narrow canvas.');
    }
  };
  const test = async (name, work) => { try { await work(); results[name] = { passed: true }; } catch (error) { results[name] = { passed: false, error: error.stack }; throw error; } };
  let mainDatabase;
  try {
    await page.send('Browser.setDownloadBehavior', { behavior: 'deny' });
    mainDatabase = database();
    await test('ui: one plan and existing canvas mount in the isolated entry', async () => {
      await page.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false });
      await page.send('Page.navigate', { url }); await wait(`document.readyState==='complete'&&location.pathname==='/__workspace_ui_test__'`);
      await page.evaluate(`const m=await import('/src/projects/index.ts');const fixtures=await import('/src/projects/browserFixtures.ts');const opened=await m.openProjectRepository({databaseName:${JSON.stringify(mainDatabase)}});if(!opened.ok)throw Error(JSON.stringify(opened));const repo=opened.value;const doc=fixtures.document();delete doc.topology.lab;delete doc.topology.labProgress;const p=await repo.createProject({name:'Büro-Netz',document:doc});if(!p.ok)throw Error(JSON.stringify(p));await repo.workspace.createSession({initialTab:{kind:'plan',planId:p.value.project.id}});window.originalPlanId=p.value.project.id;repo.close();`);
      await prepare(page, mainDatabase); await tabs(1); await wait(`document.querySelectorAll('.react-flow__node').length===3`);
      assert.equal(await page.evaluate(`return document.querySelector('.autosave-state').textContent;`), 'Gespeichert');
      await capture('01-one-plan-graphite-1440.png');
    });
    await test('ui: manual Save and Save As use the current draft', async () => {
      await page.evaluate(`store.getState().select('pc1');store.getState().renameDevice('pc1','Büro-PC');`);
      await wait(`workspaceReview.controller.getState().drafts[0].manualSavePending`); await wait(`!workspaceReview.controller.getState().drafts[0].pendingPersistence`);
      await capture('02-unsaved-draft-graphite-1440.png');
      await menu('Speichern'); await idle(); await wait(`!workspaceReview.controller.getState().drafts[0].manualSavePending`);
      const original = await page.evaluate(`return (await workspaceReview.repository.listProjects()).value.find(p=>p.name==='Büro-Netz').id;`);
      await menu('Speichern unter…'); await input('.workspace-name-label input', 'Büro-Netz – Variante'); await capture('16-save-as-graphite-1440.png'); await textButton('Speichern', 'dialog[open]');
      await wait(`!document.querySelector('dialog[open]')&&!document.querySelector('.app').inert`);
      assert.notEqual(await page.evaluate(`return workspaceReview.controller.getState().drafts[0].base.planId;`), original);
      assert.equal(await page.evaluate(`const p=await workspaceReview.repository.loadProject(${JSON.stringify(original)});return p.value.document.topology.devices[0].name;`), 'Büro-PC');
    });
    await test('ui: Load opens another tab and focuses an already open draft', async () => {
      await menu('Öffnen…'); await wait(`document.querySelector('.workspace-plan-row')`);
      await page.evaluate(`[...document.querySelectorAll('.workspace-plan-open')].find(e=>e.querySelector('strong').textContent==='Büro-Netz').click();`); await tabs(2);
      await capture('03-two-plans-graphite-1440.png');
      await menu('Gespeicherte Pläne…'); await wait(`document.querySelector('.workspace-plan-row')`);
      await capture('17-saved-plans-graphite-1440.png');
      await page.evaluate(`[...document.querySelectorAll('.workspace-plan-open')].find(e=>e.querySelector('strong').textContent==='Büro-Netz').click();`); await tabs(2);
      await menu('Neu'); await tabs(3); await capture('04-three-plans-graphite-1440.png');
    });
    await test('ui: a pristine unnamed draft closes immediately, including from an inactive tab', async () => {
      await click('.workspace-tab-wrap[data-active="true"] .workspace-tab-close'); await tabs(2);
      assert.equal(await page.evaluate(`return !!document.querySelector('dialog[open]');`), false);
      await menu('Neu'); await tabs(3);
      const emptyId = await page.evaluate(`return workspaceReview.controller.getState().activeDraftId;`);
      await page.evaluate(`const c=workspaceReview.controller;const other=c.getState().session.draftIds.find(id=>id!==c.getState().activeDraftId);const r=await c.switchDraft(other);if(!r.ok)throw Error(JSON.stringify(r));`);
      await idle(); const active = await page.evaluate(`return workspaceReview.controller.getState().activeDraftId;`);
      await page.evaluate(`const index=workspaceReview.controller.getState().session.draftIds.indexOf(${JSON.stringify(emptyId)});document.querySelectorAll('.workspace-tab-close')[index].click();`); await tabs(2);
      assert.equal(await page.evaluate(`return workspaceReview.controller.getState().activeDraftId;`), active);
      assert.equal(await page.evaluate(`return !!document.querySelector('dialog[open]');`), false);
      await menu('Neu'); await tabs(3);
    });
    await test('ui: close Cancel, Discard and Save choices preserve their contracts', async () => {
      await page.evaluate(`store.getState().addDeviceAt('host',{x:0,y:0});`);
      await click('.workspace-tab-wrap[data-active="true"] .workspace-tab-close'); await capture('18-close-unsaved-graphite-1440.png'); await textButton('Abbrechen', 'dialog[open]'); await tabs(3);
      await click('.workspace-tab-wrap[data-active="true"] .workspace-tab-close'); await textButton('Verwerfen', 'dialog[open]'); await tabs(2);
      await menu('Neu'); await tabs(3); await page.evaluate(`store.getState().addDeviceAt('host',{x:0,y:0});`); await click('.workspace-tab-wrap[data-active="true"] .workspace-tab-close'); await textButton('Speichern', 'dialog[open]');
      await input('.workspace-name-label input', 'Versuch'); await textButton('Speichern', 'dialog[open]'); await tabs(2);
      await menu('Öffnen…'); await wait(`document.querySelector('.workspace-plan-row')`);
      await page.evaluate(`[...document.querySelectorAll('.workspace-plan-open')].find(e=>e.querySelector('strong').textContent==='Versuch').click();`); await tabs(3);
    });
    await test('ui: order, focus and unsaved edits survive F5', async () => {
      await page.evaluate(`document.querySelector('.workspace-tabs [aria-selected=true]').focus();`); await key('ArrowLeft', 1); await idle();
      await page.evaluate(`[...document.querySelectorAll('.workspace-tabs [role=tab]')].find(e=>e.textContent.includes('Büro-Netz – Variante')).click();`); await idle();
      await page.evaluate(`store.getState().renameDevice('pc1','Sitzungsentwurf');`); await wait(`!workspaceReview.controller.getState().drafts.some(d=>d.pendingPersistence)`);
      const before = await page.evaluate(`return workspaceReview.controller.getState();`);
      await page.send('Page.reload'); await wait(`document.readyState==='complete'`); await prepare(page, mainDatabase); await tabs(3);
      const after = await page.evaluate(`return workspaceReview.controller.getState();`);
      assert.deepEqual(after.session.draftIds, before.session.draftIds); assert.equal(after.activeDraftId, before.activeDraftId);
      assert.equal(await page.evaluate(`return store.getState().captureWorkspaceDocument().topology.devices[0].name;`), 'Sitzungsentwurf');
      await capture('05-restored-three-plans-graphite-1440.png');
    });
    await test('ui: unapplied IPv4 form warns before changing tabs and Cancel keeps its text', async () => {
      await page.evaluate(`store.getState().select('pc1');`);
      await textButton('Netzwerk', '.inspector'); await input('input[aria-label="IP-Adresse eth0"]', '192.0.2.');
      await page.evaluate(`document.querySelector('.workspace-tabs [role=tab][aria-selected=false]').click();`);
      await wait(`document.querySelector('dialog[open]')?.textContent.includes('Nicht übernommene Eingaben')`);
      await capture('06-unapplied-form-graphite-1440.png'); await textButton('Abbrechen', 'dialog[open]');
      assert.equal(await page.evaluate(`return document.querySelector('input[aria-label="IP-Adresse eth0"]').value;`), '192.0.2.');
      await click('.workspace-tab-wrap[data-active="true"] .workspace-tab-close');
      await wait(`document.querySelector('dialog[open] .workspace-dialog-warning')`);
      await textButton('Abbrechen', 'dialog[open]');
      assert.equal(await page.evaluate(`return document.querySelector('input[aria-label="IP-Adresse eth0"]').value;`), '192.0.2.');
      await page.evaluate(`document.querySelector('.workspace-tabs [role=tab][aria-selected=false]').click();`); await textButton('Verwerfen und fortfahren', 'dialog[open]'); await idle();
    });
    await test('ui: responsive tabs, Inspector and real terminals in both themes', async () => {
      await page.evaluate(`[...document.querySelectorAll('.workspace-tabs [role=tab]')].find(e=>e.textContent.includes('Büro-Netz – Variante')).click();`); await idle();
      await page.evaluate(`store.getState().select('pc1');store.getState().openTerminal('pc1');`);
      await wait(`document.querySelector('.xterm')&&document.querySelector('.inspector')`);
      await capture('07-three-plans-inspector-terminal-graphite-1440.png');
      await capture('08-three-plans-inspector-terminal-classic-1440.png', 1440, 'classic-light');
      await capture('09-three-plans-inspector-terminal-graphite-700.png', 700, 'graphite-dark');
      await capture('10-three-plans-inspector-terminal-classic-700.png', 700, 'classic-light');
      await page.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false });
      await page.evaluate(`store.getState().select(null);store.getState().closeTerminal('pc1');`);
    });
    await test('ui: failed Save offers recovery and retry keeps the topology', async () => {
      await page.evaluate(`window.originalSave=workspaceReview.repository.workspace.saveDraft.bind(workspaceReview.repository.workspace);workspaceReview.repository.workspace.saveDraft=async()=>({ok:false,error:{code:'quota-exceeded',message:'Synthetic quota'}});store.getState().renameDevice('pc1','Lokales Backup');`);
      await wait(`!workspaceReview.controller.getState().drafts.some(d=>d.pendingPersistence)`); await menu('Speichern'); await wait(`document.querySelector('.workspace-recovery[data-error-code="quota-exceeded"]')`);
      await capture('11-save-error-classic-1440.png', 1440, 'classic-light'); await textButton('Backup exportieren', '.workspace-recovery');
      assert.equal(await page.evaluate(`return JSON.parse(await window.__backups.at(-1).text()).devices[0].name;`), 'Lokales Backup');
      await page.evaluate(`workspaceReview.repository.workspace.saveDraft=window.originalSave;`); await textButton('Erneut versuchen', '.workspace-recovery');
      await wait(`!document.querySelector('.workspace-recovery')&&!workspaceReview.controller.getState().drafts.find(d=>d.id===workspaceReview.controller.getState().activeDraftId).manualSavePending`);
    });
    await test('ui: two browser tabs show conflicts and export the losing local copy', async () => {
      const other = await openPage(); pages.push(other); await prepare(other, mainDatabase); await idle(other);
      await page.evaluate(`store.getState().renameDevice('pc1','Gewinner');await workspaceReview.controller.flush();`);
      await other.evaluate(`store.getState().renameDevice('pc1','Lokale Konfliktkopie');await workspaceReview.controller.flush();`);
      await wait(`document.querySelector('.workspace-recovery[data-error-code="draft-conflict"]')`, other);
      await capture('12-conflict-classic-700.png', 700, 'classic-light', other);
      await textButton('Backup exportieren', '.workspace-recovery', other);
      assert.equal(await other.evaluate(`return JSON.parse(await window.__backups.at(-1).text()).devices[0].name;`), 'Lokale Konfliktkopie');
      await other.evaluate(`workspaceReview.dispose();`); await other.send('Page.close'); other.close(); pages.splice(pages.indexOf(other), 1);
    });
    await test('ui: failed Save while closing an inactive tab exports that tab rather than the active plan', async () => {
      await page.evaluate(`[...document.querySelectorAll('.workspace-tabs [role=tab]')].find(e=>e.querySelector('.workspace-tab-name').textContent==='Büro-Netz').click();`); await idle();
      await page.evaluate(`store.getState().renameDevice('pc1','Hintergrundkopie');`);
      await page.evaluate(`[...document.querySelectorAll('.workspace-tabs [role=tab]')].find(e=>e.querySelector('.workspace-tab-name').textContent==='Büro-Netz – Variante').click();`); await idle();
      const active = await page.evaluate(`return workspaceReview.controller.getState().activeDraftId;`);
      await page.evaluate(`window.originalSave=workspaceReview.repository.workspace.saveDraft.bind(workspaceReview.repository.workspace);workspaceReview.repository.workspace.saveDraft=async()=>({ok:false,error:{code:'quota-exceeded',message:'Inactive Save failure'}});[...document.querySelectorAll('.workspace-tab-close')].find(e=>e.getAttribute('aria-label')==='Büro-Netz schließen').click();`);
      await textButton('Speichern', 'dialog[open]'); await wait(`document.querySelector('dialog[open] .workspace-dialog-error')`);
      await textButton('Backup exportieren', 'dialog[open]');
      assert.equal(await page.evaluate(`return JSON.parse(await window.__backups.at(-1).text()).devices[0].name;`), 'Hintergrundkopie');
      assert.equal(await page.evaluate(`return workspaceReview.controller.getState().activeDraftId;`), active);
      await textButton('Abbrechen', 'dialog[open]'); await page.evaluate(`workspaceReview.repository.workspace.saveDraft=window.originalSave;`);
      await textButton('Erneut versuchen', '.workspace-recovery'); await wait(`!document.querySelector('.workspace-recovery')`);
    });
    await test('ui: Delete preserves an open draft and explicit Discard closes it without recreating the saved plan', async () => {
      await menu('Gespeicherte Pläne…'); await wait(`document.querySelector('.workspace-plan-row')`);
      const id = await page.evaluate(`return (await workspaceReview.repository.listProjects()).value.find(p=>p.name==='Versuch').id;`);
      await click('button[aria-label="Versuch löschen"]'); await textButton('Abbrechen', 'dialog[open]');
      await wait(`document.querySelector('button[aria-label="Versuch löschen"]')`);
      await click('button[aria-label="Versuch löschen"]'); await textButton('Löschen', 'dialog[open]');
      await wait(`document.querySelector('dialog[open]')?.textContent.includes('Gespeicherte Pläne')&&!document.querySelector('button[aria-label="Versuch löschen"]')`);
      await textButton('Abbrechen', 'dialog[open]');
      assert.equal(await page.evaluate(`return workspaceReview.controller.getState().drafts.some(d=>d.base?.planId===${JSON.stringify(id)});`), true);
      await click('button[aria-label="Versuch schließen"]'); await wait(`document.querySelector('dialog[open]')?.textContent.includes('Plan schließen')`);
      await textButton('Verwerfen', 'dialog[open]'); await tabs(2);
      assert.equal(await page.evaluate(`return (await workspaceReview.repository.loadProject(${JSON.stringify(id)},{includeDeleted:true})).value.project.deletedAt!==null;`), true);
    });
    await test('ui: invalid JSON does not replay a previously failed Save or Delete', async () => {
      await menu('JSON importieren…');
      await page.evaluate(`const transfer=new DataTransfer();transfer.items.add(new File(['{invalid'],'invalid.json',{type:'application/json'}));const input=document.querySelector('input[type=file]');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));`);
      await wait(`document.querySelector('.workspace-recovery[data-error-code="invalid-document"]')`);
      assert.equal(await page.evaluate(`return [...document.querySelectorAll('.workspace-recovery button')].some(b=>b.textContent==='Erneut versuchen');`), false);
      await textButton('Abbrechen', '.workspace-recovery');
    });
    await test('ui: JSON import and Share Links open independent drafts', async () => {
      const count = await page.evaluate(`return workspaceReview.controller.getState().drafts.length;`);
      await menu('JSON importieren…');
      // A real File/change event exercises the existing hidden file input.
      await page.evaluate(`const fixture=(await import('/src/projects/browserFixtures.ts')).changed('JSON import');delete fixture.topology.lab;delete fixture.topology.labProgress;const transfer=new DataTransfer();transfer.items.add(new File([JSON.stringify(fixture.topology)],'review.json',{type:'application/json'}));const input=document.querySelector('input[type=file]');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));`); await tabs(count + 1);
      await page.evaluate(`store.getState().renameDevice('pc1','Share Link copy');`); await menu('Share link');
      await page.evaluate(`location.hash=new URL(store.getState().shareLink).hash;`);
      await wait(`document.querySelector('.workspace-share')`); await textButton('In neuer Registerkarte öffnen', '.workspace-share'); await tabs(count + 2);
      assert.equal(await page.evaluate(`return store.getState().captureWorkspaceDocument().topology.devices[0].name;`), 'Share Link copy');
      await page.evaluate(`await workspaceReview.controller.flush();`);
    });
    await test('ui: closing the final tab shows a safe empty session and allows creating another plan', async () => {
      let count = await page.evaluate(`return workspaceReview.controller.getState().drafts.length;`);
      while (count > 0) {
        await click('.workspace-tab-wrap[data-active="true"] .workspace-tab-close');
        await wait(`document.querySelector('dialog[open]')||document.querySelectorAll('.workspace-tab-wrap').length===${count - 1}`);
        if (await page.evaluate(`return !!document.querySelector('dialog[open]');`)) await textButton('Verwerfen', 'dialog[open]');
        await tabs(--count);
      }
      await wait(`document.querySelector('.workspace-empty-state')&&document.querySelector('.main').inert`);
      await capture('19-empty-session-classic-700.png', 700, 'classic-light');
      const sessionId = await page.evaluate(`return workspaceReview.controller.getState().session.id;`);
      await page.send('Page.reload'); await wait(`document.readyState==='complete'`); await prepare(page, mainDatabase); await tabs(0);
      assert.equal(await page.evaluate(`return workspaceReview.controller.getState().session.id;`), sessionId);
      await click('.workspace-empty-state .btn--primary'); await tabs(1);
      await page.evaluate(`await workspaceReview.controller.flush();workspaceReview.dispose();`);
    });
    await test('ui: unavailable IndexedDB offers the exact original and cancellation', async () => {
      await prepare(page, database(), `,factory:null,legacy:{migrate:false,storage:{getItem:()=>'{broken original'},origin:location.origin}`);
      await wait(`document.querySelector('.workspace-start [data-error-code="unavailable"]')`); await capture('13-storage-unavailable-graphite-1440.png');
      await textButton('Original exportieren', '.workspace-start'); assert.equal(await page.evaluate(`return window.__backups.at(-1).text();`), '{broken original');
      await textButton('Abbrechen', '.workspace-start'); await wait(`document.body.textContent.includes('Wiederherstellung abgebrochen')`); await page.evaluate(`workspaceReview.dispose();`);
    });
    await test('ui: rejected legacy migration never starts a substitute session', async () => {
      await prepare(page, database(), `,legacy:{migrate:true,storage:{getItem:()=>'{rejected original'},origin:location.origin}`);
      await wait(`document.querySelector('[data-error-code="legacy-recovery-required"]')`); await capture('14-legacy-rejected-classic-700.png', 700, 'classic-light');
      await textButton('Original exportieren', '.workspace-start'); assert.equal(await page.evaluate(`return window.__backups.at(-1).text();`), '{rejected original');
      await page.evaluate(`workspaceReview.dispose();`);
    });
    await test('ui: incompatible session restoration preserves all existing records', async () => {
      await page.send('Page.navigate', { url }); await wait(`document.readyState==='complete'`);
      await page.evaluate(`const r=indexedDB.open(${JSON.stringify(mainDatabase)});const db=await new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});const tx=db.transaction('meta','readwrite');const store=tx.objectStore('meta'),request=store.getAll();request.onsuccess=()=>{const draft=request.result.find(r=>r.key.startsWith('workspace:v1:draft:')&&r.value.state==='open');draft.value.document.schemaVersion=2;store.put(draft);};await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error)});db.close();`);
      await prepare(page, mainDatabase); await wait(`document.querySelector('[data-error-code="incompatible-document"]')`); await capture('15-incompatible-session-classic-1440.png', 1440, 'classic-light'); await page.evaluate(`workspaceReview.dispose();`);
    });
    await test('ui: ordinary boot fails closed with recovery when IndexedDB is unavailable', async () => {
      const ordinary = await openPage(); pages.push(ordinary);
      await ordinary.send('Page.addScriptToEvaluateOnNewDocument', { source: `Object.defineProperty(window,'indexedDB',{value:undefined,configurable:true});` });
      await ordinary.send('Page.navigate', { url: new URL('/app.html', url).href }); await wait(`document.querySelector('[data-error-code="unavailable"]')`, ordinary);
      assert.equal(await ordinary.evaluate(`return !!document.querySelector('.workspace-tabs');`), false);
      assert.equal(await ordinary.evaluate(`return [...document.querySelectorAll('.workspace-start button')].some(b=>b.textContent==='Original exportieren');`), true);
      await ordinary.send('Page.close'); ordinary.close(); pages.splice(pages.indexOf(ordinary), 1);
    });
  } finally {
    for (const target of pages) { try { await target.evaluate(`window.workspaceReview?.dispose();`); } catch {} }
    for (const name of databases) await page.evaluate(`await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase(${JSON.stringify(name)});r.onsuccess=resolve;r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('UI cleanup blocked'));});`);
    for (const target of pages.filter(p => p !== page)) { try { await target.send('Page.close'); } catch {} target.close(); }
    Object.assign(report.results, results);
    await writeFile(path.join(directory, 'results.json'), JSON.stringify({ results, screenshots }, null, 2));
    await writeFile(path.join(directory, 'README.md'), '# Fase 5B2-A — revisão Chromium\n\nPerfil e bancos descartáveis. Nenhum dado real foi usado.\n\n' + screenshots.map(s => `- [${s.filename}](${s.filename}) — ${s.theme}, ${s.width} × ${s.height}`).join('\n') + '\n');
    if (Object.keys(results).length >= 18 && Object.values(results).every(r => r.passed)) {
      const captures = screenshots.map(s => ({
        source: path.relative(root, path.join(directory, s.filename)).split(path.sep).join('/'),
        scene: s.filename.replace(/^\d+-/, '').replace(/-(graphite|classic)-\d+\.png$/, ''),
        variant: s.theme, state: 'normal', width: s.width, height: s.height,
      }));
      const selected = ['07-', '08-', '09-', '10-', '17-', '18-'].map(prefix => {
        const index = screenshots.findIndex(s => s.filename.startsWith(prefix)), capture = captures[index];
        assert(capture, 'Missing curated UI capture.');
        return { scene: capture.scene, variant: capture.variant, state: capture.state, width: capture.width, height: capture.height,
          name: `${capture.scene}-${capture.variant}-${capture.width}` };
      });
      const manifest = path.join(directory, 'manifest.json');
      await writeFile(manifest, JSON.stringify({ id: 'workspace-plans-fase-5b2-a', title: 'NetLab — Planos e sessões · Fase 5B2-A',
        description: 'Chromium isolado. Save/Load, recuperação, formulários, Inspector e terminais; sem ativação do boot normal.',
        variants: [{ id: 'graphite-dark', label: 'Graphite Dark' }, { id: 'classic-light', label: 'Classic Light' }], states: ['normal'],
        share: selected, shareContactSheet: false, captures,
      }, null, 2));
      const publication = await generateReview(manifest);
      await writeFile(path.join(publication.raw, 'test-results.json'), JSON.stringify({ results, screenshots }, null, 2));
      await writeFile(path.join(directory, 'publication.json'), JSON.stringify(publication, null, 2));
      report.uiReview = publication;
    }
  }
}
