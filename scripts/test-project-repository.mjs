import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createServer as createPortProbe } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const binary = process.env.NETLAB_CHROMIUM_PATH ?? [
  'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome', '/opt/google/chrome/chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find(existsSync);
const report = { results: {}, browserErrors: [], downloads: [], downloadPolicies: [], fatal: null };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let server, browser, scratch, pageOne, pageTwo;
let downloadOperation = 'repository checks', browserGeneration = 0;

async function drainDownloads() {
  for (let i = 0; i < 200 && report.downloads.some(d => d.state === 'inProgress'); i++) await delay(25);
  for (const entry of report.downloads) {
    assert.equal(entry.state, 'completed', `Download did not complete: ${entry.suggestedFilename}`);
    if (entry.verified) continue;
    assert(/^[a-f\d-]+$/i.test(entry.guid), 'Unexpected download GUID');
    // allowAndName saves by GUID, never by an untrusted suggested filename.
    const bytes = await readFile(path.join(scratch, 'downloads', entry.guid));
    entry.bytes = bytes.length; entry.sha256 = createHash('sha256').update(bytes).digest('hex'); entry.verified = true;
  }
}

async function connect(endpoint) {
  const socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let sequence = 0; const requests = new Map(), subscribers = new Map();
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    for (const handler of subscribers.get(message.method) ?? []) handler(message.params);
    if (message.id) {
      const call = requests.get(message.id);
      if (call) { clearTimeout(call.timer); requests.delete(message.id); message.error ? call.reject(Error(JSON.stringify(message.error))) : call.resolve(message.result); }
    }
    if (message.method === 'Runtime.exceptionThrown') report.browserErrors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
    if (message.method === 'Browser.downloadWillBegin' && !report.downloads.some(d => d.guid === message.params.guid)) {
      report.downloads.push({ guid: message.params.guid, suggestedFilename: message.params.suggestedFilename,
        operation: downloadOperation, browserGeneration, state: 'inProgress' });
    }
    if (message.method === 'Browser.downloadProgress') {
      const entry = report.downloads.find(d => d.guid === message.params.guid);
      if (entry) entry.state = message.params.state;
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { requests.delete(id); reject(Error('CDP timeout: ' + method)); }, 20000);
    requests.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async source => {
    const result = await send('Runtime.evaluate', { expression: `(async () => { ${source} })()`, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  };
  const close = () => { subscribers.clear(); for (const call of requests.values()) clearTimeout(call.timer); socket.close(); };
  await send('Runtime.enable'); await send('Page.enable');
  const onEvent = (method, handler) => { const set = subscribers.get(method) ?? new Set(); set.add(handler); subscribers.set(method, set); return () => { set.delete(handler); if (!set.size) subscribers.delete(method); }; };
  return { send, evaluate, close, onEvent, labelDownloads: name => { downloadOperation = name; }, drainDownloads };
}

async function launchBrowser() {
  // A restart must wait for this process's new endpoint, not reconnect to the
  // previous port if another disposable Chromium has already reused it.
  await rm(path.join(scratch, 'DevToolsActivePort'), { force: true });
  browser = spawn(binary, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
    '--remote-debugging-port=0', '--user-data-dir=' + scratch, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let launchError, diagnostics = '';
  browser.on('error', error => { launchError = error; });
  browser.stderr.on('data', data => { diagnostics = (diagnostics + data).slice(-4096); });
  for (let i = 0; i < 100; i++) {
    if (launchError || browser.exitCode !== null) throw Error('Disposable Chromium failed to start: ' + String(launchError ?? diagnostics));
    try {
      const debug = 'http://127.0.0.1:' + (await readFile(path.join(scratch, 'DevToolsActivePort'), 'utf8')).split('\n')[0];
      const pages = await (await fetch(debug + '/json/list')).json();
      const page = await connect(pages.find(p => p.type === 'page').webSocketDebuggerUrl);
      await mkdir(path.join(scratch, 'downloads'), { recursive: true });
      // Browser policy is process-scoped: reapply before any application navigation,
      // including every restart. A temporary profile alone still uses Windows Downloads.
      await page.send('Browser.setDownloadBehavior', { behavior: 'allowAndName', downloadPath: path.join(scratch, 'downloads'), eventsEnabled: true });
      browserGeneration++;
      report.downloadPolicies.push({ browserGeneration, destination: 'disposable-profile/downloads', configuredBeforeNavigation: true });
      return { debug, page };
    } catch { await delay(100); }
  }
  throw Error('Disposable browser did not start.');
}

try {
  if (!binary) throw Error('Chromium was not found. Set NETLAB_CHROMIUM_PATH; no dependency or browser is installed automatically.');
  scratch = await mkdtemp(path.join(tmpdir(), 'netlab-idb-tests-'));
  // Vite 5 interprets port:0 as its default port. Reserve an OS-selected port
  // first so tests never compete with the user's development server on 5173.
  const probe = createPortProbe();
  await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(0, '127.0.0.1', resolve); });
  const testPort = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  server = await createServer({ root, configFile: path.join(root, 'vite.config.ts'),
    cacheDir: path.join(scratch, 'vite-cache'),
    plugins: [...(process.env.NETLAB_VIEWPORT_REVIEW === '1' || process.env.NETLAB_LEGIBILITY_REVIEW || process.env.NETLAB_DEVICE_ACTION_REVIEW === '1' || process.env.NETLAB_PANEL_STACKING === '1' || process.env.NETLAB_USABILITY_REVIEW === '1' || process.env.NETLAB_MARKINGS_REVIEW === '1' || process.env.NETLAB_DEVICE_EDIT_REVIEW === '1' ? [{
      name: 'isolated-viewport-probe', enforce: 'pre',
      transform(code, id) {
        if (!id.replaceAll('\\', '/').endsWith('/src/App.tsx')) return;
        return "import {WorkspaceViewportProbe} from '/src/workspace/viewportProbe.browser.tsx';\n"
          + code.replace('<ReactFlowProvider>', '<ReactFlowProvider><WorkspaceViewportProbe />');
      },
    }] : []), { name: 'isolated-repository-tests', configureServer(vite) {
      vite.middlewares.use((req, res, next) => {
        if (!['/__project_repository_test__', '/__workspace_ui_test__', '/__application_boot_test__'].includes(req.url?.split('?')[0])) return next();
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        // Include Vite/React's normal development preamble for existing form
        // components, with no app entry, boot or persistence listeners.
        void vite.transformIndexHtml(req.url, '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Disposable NetLab tests</title></head><body><div id="root"></div></body></html>').then(html => res.end(html)).catch(next);
      });
    } }],
    server: { host: '127.0.0.1', port: testPort, strictPort: true, watch: { ignored: ['**/.playwright-mcp/**'] } },
  });
  await server.listen();
  const address = server.httpServer.address();
  const url = `http://127.0.0.1:${address.port}/__project_repository_test__`;
  const launched = await launchBrowser(), debug = launched.debug;
  pageOne = launched.page;
  const prepare = async page => {
    await page.send('Page.navigate', { url });
    for (let i = 0; i < 100; i++) {
      try { if (await page.evaluate(`return location.href === ${JSON.stringify(url)} && document.readyState === 'complete';`)) break; } catch {}
      await delay(50);
    }
    await page.evaluate('window.repositoryModule = await import("/src/projects/index.ts"); window.caseModule = await import("/src/projects/repository.browser.ts");');
  };
  await prepare(pageOne);
  await pageOne.evaluate('localStorage.setItem("netsim:autosave:v1", "isolated legacy sentinel; never migrate");');
  const names = await pageOne.evaluate('return Object.keys(caseModule.browserCases);');
  for (const name of names) {
    try { await pageOne.evaluate(`await caseModule.browserCases[${JSON.stringify(name)}]();`); report.results[name] = { passed: true }; }
    catch (error) { report.results[name] = { passed: false, error: error.message }; }
  }

  const crossName = 'real two-tab concurrency and deletion';
  try {
    const target = await (await fetch(debug + '/json/new?' + encodeURIComponent(url), { method: 'PUT' })).json();
    pageTwo = await connect(target.webSocketDebuggerUrl); await prepare(pageTwo);
    const name = 'netlab-idb-test-' + crypto.randomUUID();
    for (const page of [pageOne, pageTwo]) await page.evaluate(`window.crossResult = await repositoryModule.openProjectRepository({ databaseName: ${JSON.stringify(name)} }); if(!crossResult.ok) throw Error(JSON.stringify(crossResult)); window.crossRepo = crossResult.value;`);
    const created = await pageOne.evaluate('return await crossRepo.createProject({name:"Two tabs",document:caseModule.crossTabDocument()});');
    assert(created.ok); const id = created.value.project.id;
    const writes = await Promise.all([pageOne, pageTwo].map((page, i) => page.evaluate(`const doc=caseModule.crossTabDocument(); doc.topology.devices[0].name=${JSON.stringify('tab-' + i)}; return await crossRepo.updateProject(${JSON.stringify(id)},1,doc);`)));
    assert.equal(writes.filter(r => r.ok).length, 1); assert.equal(writes.filter(r => !r.ok && r.error.code === 'conflict').length, 1);
    const removed = await pageOne.evaluate(`return await crossRepo.deleteProject(${JSON.stringify(id)},2);`); assert(removed.ok);
    const stale = await pageTwo.evaluate(`return await crossRepo.updateProject(${JSON.stringify(id)},1,caseModule.crossTabDocument());`);
    assert.equal(stale.error.code, 'deleted');
    const recreate = await pageTwo.evaluate(`return await crossRepo.createProject({id:${JSON.stringify(id)},name:"Stale recreation",document:caseModule.crossTabDocument()});`);
    assert.equal(recreate.error.code, 'already-exists');
    for (const page of [pageOne, pageTwo]) await page.evaluate('crossRepo.close();');
    await pageOne.evaluate(`await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase(${JSON.stringify(name)});r.onsuccess=resolve;r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Cross-tab cleanup blocked'));});`);
    report.results[crossName] = { passed: true };
  } catch (error) { report.results[crossName] = { passed: false, error: error.message }; }

  const migrationCrossName = 'migration: real two-tab migration and post-commit reload';
  const migrationDatabase = 'netlab-idb-test-' + crypto.randomUUID();
  let originalLegacy;
  try {
    assert(pageTwo, 'Second test tab is required.');
    originalLegacy = await pageOne.evaluate('return localStorage.getItem("netsim:autosave:v1");');
    await pageOne.evaluate('localStorage.setItem("netsim:autosave:v1",JSON.stringify(caseModule.crossTabDocument().topology));');
    const connectMigration = async page => page.evaluate(`const opened=await repositoryModule.openProjectRepository({databaseName:${JSON.stringify(migrationDatabase)}}); if(!opened.ok)throw Error(JSON.stringify(opened)); window.migrationRepo=opened.value;`);
    for (const page of [pageOne, pageTwo]) await connectMigration(page);
    const migrate = page => page.evaluate('const r=await repositoryModule.migrateLegacyAutosave({repository:migrationRepo,storage:{getItem:k=>localStorage.getItem(k)},origin:location.origin}); if(r.status!=="migrated"&&r.status!=="already-migrated")throw Error(JSON.stringify(r)); return {status:r.status,id:r.project.project.id,deleted:r.deleted};');
    const first = await Promise.all([migrate(pageOne), migrate(pageTwo)]);
    assert.deepEqual(first.map(r => r.status).sort(), ['already-migrated', 'migrated']); assert.equal(first[0].id, first[1].id);
    // Reload destroys one realm/connection. The other tab stays open; no app
    // boot or migration hook is installed on this dedicated test page.
    await pageOne.send('Page.reload'); await delay(100); await prepare(pageOne); await connectMigration(pageOne);
    const recovered = await migrate(pageOne); assert.equal(recovered.status, 'already-migrated'); assert.equal(recovered.id, first[0].id);
    const deleted = await pageTwo.evaluate(`return await migrationRepo.deleteProject(${JSON.stringify(recovered.id)},2);`); assert(deleted.ok);
    const noResurrection = await migrate(pageOne); assert.equal(noResurrection.deleted, true); assert.equal(noResurrection.id, recovered.id);
    const count = await pageOne.evaluate('return await migrationRepo.listProjects({includeDeleted:true});'); assert.equal(count.value.length, 1);
    await pageOne.evaluate('const d=caseModule.crossTabDocument().topology;d.devices[0].name="Changed legacy in another tab";localStorage.setItem("netsim:autosave:v1",JSON.stringify(d));');
    const changed = await migrate(pageTwo); assert.equal(changed.status, 'migrated'); assert.notEqual(changed.id, recovered.id);
    report.results[migrationCrossName] = { passed: true };
  } catch (error) { report.results[migrationCrossName] = { passed: false, error: error.message }; }
  finally {
    for (const page of [pageOne, pageTwo]) if (page) {
      try { await page.evaluate('window.migrationRepo?.close();'); } catch { /* Lost test realm. */ }
    }
    if (pageOne) {
      try {
        if (originalLegacy !== undefined) await pageOne.evaluate(`const original=${JSON.stringify(originalLegacy)};if(original===null)localStorage.removeItem("netsim:autosave:v1");else localStorage.setItem("netsim:autosave:v1",original);`);
        await pageOne.evaluate(`await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase(${JSON.stringify(migrationDatabase)});r.onsuccess=resolve;r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Migration cleanup blocked'));});`);
      } catch (error) { report.fatal = 'Disposable migration cleanup failed: ' + error.message; }
    }
  }

  const workspaceCrossName = 'workspace: real two-tab conflict and full browser restart';
  const controllerRestartName = 'controller: F5 and full browser restart restore only the active simulation';
  const workspaceDatabase = 'netlab-idb-test-' + crypto.randomUUID();
  try {
    const connectWorkspace = async page => page.evaluate(`const opened=await repositoryModule.openProjectRepository({databaseName:${JSON.stringify(workspaceDatabase)}});if(!opened.ok)throw Error(JSON.stringify(opened));window.workspaceRepo=opened.value;`);
    for (const page of [pageOne, pageTwo]) await connectWorkspace(page);
    const created = await pageOne.evaluate(`const p=await workspaceRepo.createProject({name:'Manual before drafts',document:caseModule.crossTabDocument()});if(!p.ok)throw Error(JSON.stringify(p));const s=await workspaceRepo.workspace.createSession({initialTab:{kind:'plan',planId:p.value.project.id}});if(!s.ok)throw Error(JSON.stringify(s));return {plan:p.value,session:s.value};`);
    const sessionId = created.session.session.id, draftId = created.session.drafts[0].id;
    const restoredOtherTab = await pageTwo.evaluate(`return await workspaceRepo.workspace.restoreSession(${JSON.stringify(sessionId)});`);
    assert(restoredOtherTab.ok); assert.equal(restoredOtherTab.value.drafts[0].id, draftId);
    const writes = await Promise.all([pageOne, pageTwo].map((page, i) => page.evaluate(`const d=caseModule.crossTabDocument();d.topology.devices[0].name=${JSON.stringify('workspace-tab-' + i)};return await workspaceRepo.workspace.updateDraft(${JSON.stringify(draftId)},{expectedRevision:1,editSequence:1,document:d});`)));
    assert.equal(writes.filter(r => r.ok).length, 1); assert.equal(writes.filter(r => !r.ok && r.error.code === 'draft-conflict').length, 1);
    const manual = await pageTwo.evaluate(`return await workspaceRepo.loadProject(${JSON.stringify(created.plan.project.id)});`);
    assert.deepEqual(manual.value, created.plan);
    const second = await pageOne.evaluate(`const b=await workspaceRepo.workspace.createDraft(${JSON.stringify(sessionId)},1,{document:caseModule.crossTabDocument()});if(!b.ok)throw Error(JSON.stringify(b));return b.value;`);
    const ordered = await pageTwo.evaluate(`return await workspaceRepo.workspace.setSessionLayout(${JSON.stringify(sessionId)},2,{draftIds:[${JSON.stringify(second.draft.id)},${JSON.stringify(draftId)}],activeDraftId:${JSON.stringify(draftId)}});`);
    assert(ordered.ok);
    const startController = async page => page.evaluate(`const module=await import('/src/persistence/sessionController.ts');const cases=await import('/src/persistence/sessionController.browser.ts');window.controllerRuntime=cases.memoryRuntime(caseModule.crossTabDocument());window.sessionController=new module.SessionController(workspaceRepo,controllerRuntime.api);const r=await sessionController.start({sessionId:${JSON.stringify(sessionId)}});if(!r.ok)throw Error(JSON.stringify(r));return {state:sessionController.getState(),activations:controllerRuntime.activations};`);
    const startedController = await startController(pageOne); assert.equal(startedController.activations, 1);
    await pageOne.evaluate(`controllerRuntime.edit('controller unsaved before F5');const r=await sessionController.flush();if(!r.ok)throw Error(JSON.stringify(r));`);
    const before = await pageOne.evaluate(`return await workspaceRepo.workspace.restoreSession(${JSON.stringify(sessionId)});`); assert(before.ok);
    await pageOne.send('Page.reload'); await delay(100); await prepare(pageOne); await connectWorkspace(pageOne);
    const reloadedController = await startController(pageOne);
    assert.equal(reloadedController.activations, 1); assert.equal(reloadedController.state.activeDraftId, draftId);
    assert.deepEqual(reloadedController.state.session.draftIds, [second.draft.id, draftId]);
    assert.equal(await pageOne.evaluate('return controllerRuntime.api.capture().topology.devices[0].name;'), 'controller unsaved before F5');
    // Shut down the actual Chromium process, then reopen the same disposable
    // profile. Recovery cannot depend on a surviving realm or sessionStorage.
    const stopped = new Promise(resolve => browser.once('exit', resolve));
    await pageOne.send('Browser.close'); pageOne.close(); pageTwo.close(); pageOne = undefined; pageTwo = undefined;
    await stopped;
    const restarted = await launchBrowser(); pageOne = restarted.page; await prepare(pageOne); await connectWorkspace(pageOne);
    const restartedController = await startController(pageOne); assert.equal(restartedController.activations, 1);
    assert.equal(restartedController.state.activeDraftId, draftId);
    const after = await pageOne.evaluate(`return await workspaceRepo.workspace.restoreSession(${JSON.stringify(sessionId)});`);
    assert.deepEqual(after, before); assert.equal(after.value.drafts[1].dirty, true);
    await pageOne.evaluate('sessionController.dispose();controllerRuntime.dispose();');
    const persistedDraft = after.value.drafts.find(d => d.id === draftId);
    const closed = await pageOne.evaluate(`return await workspaceRepo.workspace.discardDraft(${JSON.stringify(sessionId)},3,${JSON.stringify(draftId)},{revision:${persistedDraft.revision},editSequence:${persistedDraft.editSequence}});`); assert(closed.ok);
    const delayed = await pageOne.evaluate(`return await workspaceRepo.workspace.updateDraft(${JSON.stringify(draftId)},{expectedRevision:1,editSequence:2,document:caseModule.crossTabDocument()});`);
    assert.equal(delayed.error.code, 'draft-closed');
    report.results[workspaceCrossName] = { passed: true };
    report.results[controllerRestartName] = { passed: true };
  } catch (error) { report.results[workspaceCrossName] = { passed: false, error: error.message }; report.results[controllerRestartName] = { passed: false, error: error.message }; }
  finally {
    for (const page of [pageOne, pageTwo]) if (page) {
      try { await page.evaluate('window.sessionController?.dispose();window.controllerRuntime?.dispose();window.workspaceRepo?.close();'); } catch { /* Realm closed during the restart. */ }
    }
    if (pageOne) {
      try { await pageOne.evaluate(`await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase(${JSON.stringify(workspaceDatabase)});r.onsuccess=resolve;r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Workspace cleanup blocked'));});`); }
      catch (error) { report.fatal = 'Disposable workspace cleanup failed: ' + error.message; }
    }
  }

  if (process.env.NETLAB_DEVICE_ACTION_REVIEW === '1') {
    const { runDeviceActionReview } = await import('./device-action-review.mjs');
    await runDeviceActionReview({ page: pageOne, url: new URL('/__workspace_ui_test__', url).href, root, report });
    await prepare(pageOne);
  }
  if (process.env.NETLAB_INTERFACE_AUDIT === '1') {
    const { runInterfaceAudit } = await import('./interface-audit.mjs');
    await runInterfaceAudit({ page: pageOne, url: new URL('/__application_boot_test__', url).href, root, report });
    await prepare(pageOne);
  }
  if (process.env.NETLAB_TERMINAL_EDITING === '1') {
    const { runTerminalEditing } = await import('./terminal-editing.mjs');
    await runTerminalEditing({ page: pageOne, url: new URL('/__application_boot_test__', url).href, root, report });
    await prepare(pageOne);
  }
  if (process.env.NETLAB_ARP_CACHE_REVIEW === '1') {
    const { runArpCacheReview } = await import('./arp-cache-review.mjs');
    await runArpCacheReview({ page: pageOne, url: new URL('/__application_boot_test__', url).href, root, report });
    await prepare(pageOne);
  }
  if (process.env.NETLAB_PING_BACKPRESSURE === '1') {
    const { runPingBackpressure } = await import('./ping-backpressure-review.mjs');
    await runPingBackpressure({ page: pageOne, url: new URL('/__application_boot_test__', url).href, root, report });
    await prepare(pageOne);
  }
  if (process.env.NETLAB_PANEL_STACKING === '1') {
    const { runPanelStacking } = await import('./panel-stacking-review.mjs');
    await runPanelStacking({ page: pageOne, url: new URL('/__application_boot_test__', url).href, root, report });
    await prepare(pageOne);
  }
  if (process.env.NETLAB_LEGIBILITY_REVIEW) {
    const { runLegibilityReview } = await import('./legibility-review.mjs');
    const currentDebug = 'http://127.0.0.1:' + (await readFile(path.join(scratch, 'DevToolsActivePort'), 'utf8')).split('\n')[0];
    await runLegibilityReview({ page: pageOne, url: new URL('/__workspace_ui_test__', url).href, root, report,
      phase: process.env.NETLAB_LEGIBILITY_REVIEW,
      openPage: async () => { const target = await (await fetch(currentDebug + '/json/new?about:blank', { method: 'PUT' })).json(); return connect(target.webSocketDebuggerUrl); },
    });
    await prepare(pageOne);
  }
  if (process.env.NETLAB_VIEWPORT_REVIEW === '1') {
    const { runViewportReview } = await import('./viewport-review.mjs');
    const currentDebug = 'http://127.0.0.1:' + (await readFile(path.join(scratch, 'DevToolsActivePort'), 'utf8')).split('\n')[0];
    await runViewportReview({ page: pageOne, url: new URL('/__workspace_ui_test__', url).href, root, report,
      openPage: async () => { const target = await (await fetch(currentDebug + '/json/new?about:blank', { method: 'PUT' })).json(); return connect(target.webSocketDebuggerUrl); },
    });
    await prepare(pageOne);
  }
  if (process.env.NETLAB_MARKINGS_REVIEW === '1') {
    const { runAreaMarkingsReview } = await import('./area-markings-review.mjs');
    await runAreaMarkingsReview({ page: pageOne, url: new URL('/__workspace_ui_test__', url).href, root, report });
    await prepare(pageOne);
  }
  if (process.env.NETLAB_DEVICE_EDIT_REVIEW === '1') {
    const { runDeviceEditingReview } = await import('./device-editing-review.mjs');
    await runDeviceEditingReview({ page: pageOne, url: new URL('/__workspace_ui_test__', url).href, root, report });
    await prepare(pageOne);
  }
  if (process.env.NETLAB_DEFAULTS_REVIEW === '1') {
    const { runDefaultsReview } = await import('./defaults-review.mjs');
    await runDefaultsReview({ page: pageOne, url: new URL('/__workspace_ui_test__', url).href, report });
    await prepare(pageOne);
  }
  if (process.env.NETLAB_HOMEPAGE_REVIEW === '1') {
    const { runHomepageReview } = await import('./homepage-review.mjs');
    await runHomepageReview({ page: pageOne, url, root, report });
    await prepare(pageOne);
  }
  if (process.env.NETLAB_JOURNEY_REVIEW === '1') {
    const { runJourneyReview } = await import('./journey-review.mjs');
    await runJourneyReview({ page: pageOne, url, root, report });
    await prepare(pageOne);
  }
  if (process.env.NETLAB_USABILITY_REVIEW === '1') {
    const { runUsabilityReview } = await import('./usability-refinements-review.mjs');
    await runUsabilityReview({ page: pageOne, url: new URL('/__workspace_ui_test__', url).href, root, report });
    await prepare(pageOne);
  }
  if (process.env.NETLAB_EXERCISE_REVIEW === '1') {
    const { runExerciseReview } = await import('./exercise-beta-review.mjs');
    await runExerciseReview({ page: pageOne, url: new URL('/__workspace_ui_test__', url).href, root, report,
      restart: async () => {
        const stopped = new Promise(resolve => browser.once('exit', resolve));
        await pageOne.send('Browser.close'); pageOne.close(); await stopped;
        const restarted = await launchBrowser(); pageOne = restarted.page; return pageOne;
      },
    });
    await prepare(pageOne);
  }
  if (process.env.NETLAB_APPLICATION_BOOT_REVIEW === '1') {
    const { runApplicationBootReview } = await import('./application-boot-review.mjs');
    await runApplicationBootReview({ page: pageOne, url: new URL('/__application_boot_test__', url).href, root, report,
      restart: async () => {
        const stopped = new Promise(resolve => browser.once('exit', resolve));
        await pageOne.send('Browser.close'); pageOne.close(); await stopped;
        const restarted = await launchBrowser(); pageOne = restarted.page; return pageOne;
      },
    });
    await prepare(pageOne);
  }
  if (process.env.NETLAB_WORKSPACE_UI_REVIEW === '1') {
    const { runWorkspaceUIReview } = await import('./workspace-ui-review.mjs');
    const currentDebug = 'http://127.0.0.1:' + (await readFile(path.join(scratch, 'DevToolsActivePort'), 'utf8')).split('\n')[0];
    await runWorkspaceUIReview({ page: pageOne, url: new URL('/__workspace_ui_test__', url).href, root, report,
      openPage: async () => { const target = await (await fetch(currentDebug + '/json/new?about:blank', { method: 'PUT' })).json(); return connect(target.webSocketDebuggerUrl); },
    });
    await prepare(pageOne);
  }
  const state = await pageOne.evaluate('return {autosave:localStorage.getItem("netsim:autosave:v1"),databases:await indexedDB.databases()};');
  await drainDownloads();
  assert.equal(state.autosave, 'isolated legacy sentinel; never migrate');
  assert(!state.databases.some(db => db.name === 'netlab-projects' || db.name.startsWith('netlab-idb-test-')), 'A test database leaked or the default production database was opened.');
  assert.deepEqual(report.browserErrors, []);
} catch (error) { report.fatal = error.stack ?? String(error); }
finally {
  try { await pageOne?.send('Browser.close'); } catch { /* Already closed after a failure. */ }
  pageOne?.close(); pageTwo?.close(); browser?.kill();
  await server?.close();
  if (scratch) {
    // Only remove the exact fresh profile created above, within the OS temp root.
    const actual = await realpath(scratch), temporary = await realpath(tmpdir());
    if (path.dirname(actual).toLowerCase() !== temporary.toLowerCase() || !path.basename(actual).startsWith('netlab-idb-tests-')) throw Error('Refusing unsafe temporary-profile cleanup.');
    await rm(actual, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}
console.log('NETLAB_PROJECT_TEST_RESULTS=' + JSON.stringify(report));
if (report.fatal || report.browserErrors.length || Object.values(report.results).some(r => !r.passed)) process.exitCode = 1;
