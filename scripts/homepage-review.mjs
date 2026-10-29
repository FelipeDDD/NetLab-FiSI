import assert from 'node:assert/strict';
import LZString from 'lz-string';

/** Real entrypoints, only in the shared harness's disposable Chromium profile
 * and ephemeral localhost origin. Never attach to the user's dev server/profile. */
export async function runHomepageReview({ page, url, report }) {
  const origin = new URL(url).origin;
  const delay = ms => new Promise(r => setTimeout(r, ms));
  const wait = async condition => { for (let i = 0; i < 240; i++) { if (await page.evaluate(`return !!(${condition});`)) return; await delay(40); } throw Error('Timed out: ' + condition); };
  const test = async (name, run) => { page.labelDownloads(name); try { await run(); report.results[name] = { passed: true }; } catch (e) { report.results[name] = { passed: false, error: e.stack }; throw e; } };
  const navigate = async route => { await page.send('Page.navigate', { url: origin + route }); await wait(`location.pathname === ${JSON.stringify(route.split('?')[0])} && document.readyState === 'complete'`); };
  const home = async () => { await navigate('/'); await wait('document.querySelector(".journey-page")'); };
  const editor = async () => { await wait('document.querySelector(".react-flow")'); await page.evaluate('window.store=(await import("/src/store.ts")).useStore;'); await delay(120); };
  const click = async selector => { await page.evaluate(`document.querySelector(${JSON.stringify(selector)}).click();`); };
  const select = async (selector, value) => { await page.evaluate(`const el=document.querySelector(${JSON.stringify(selector)});el.value=${JSON.stringify(value)};el.dispatchEvent(new Event('change',{bubbles:true}));`); await delay(60); };
  const archive = () => page.evaluate('const r=await (await import("/src/projects/recoveryArchive.ts")).readRecoveryArchive();if(!r.ok)throw Error(JSON.stringify(r));return r.value;');
  const savedLegacy = await page.evaluate('return localStorage.getItem("netsim:autosave:v1");');
  try {
    await page.evaluate('localStorage.removeItem("netsim:autosave:v1");');
    await test('home: fresh visit creates no database, preference, session or engine', async () => {
      await home();
      assert.equal(await page.evaluate('return document.documentElement.lang;'), 'de');
      assert.equal(await page.evaluate('return localStorage.getItem("netlab:language:v1");'), null);
      assert(!(await page.evaluate('return await indexedDB.databases();')).some(d => d.name === 'netlab-projects'));
      assert(!await page.evaluate('return performance.getEntriesByType("resource").some(r=>["/src/store.ts","/src/sim.ts","/src/engine/","WorkspaceApplication","xterm"].some(s=>r.name.includes(s)));'));
      assert(await page.evaluate('return !!document.querySelector(".journey-scenes");'));
    });
    await test('home: language selection and F5 persist without changing themes or plans', async () => {
      const titles = { en: 'Build. Connect. Understand.', 'pt-BR': 'Construa. Conecte. Entenda.', de: 'Bauen. Verbinden. Verstehen.' };
      for (const [language, title] of Object.entries(titles)) {
        await select('.language-selector select', language);
        assert.equal(await page.evaluate('return document.querySelector("h1").textContent;'), title);
        await page.send('Page.reload'); await wait('document.querySelector(".journey-page")');
        assert.equal(await page.evaluate('return document.documentElement.lang;'), language);
        assert.equal(await page.evaluate('return document.querySelector("h1").textContent;'), title);
        assert.equal(await page.evaluate('return document.documentElement.dataset.uiTheme;'), 'graphite-dark');
      }
    });
    await test('home: saved projects remain intact during homepage visits', async () => {
      await page.evaluate(`const m=await import('/src/projects/repository.ts');const r=await m.openProjectRepository();if(!r.ok)throw Error(JSON.stringify(r));const repo=r.value;
        window.planIds=[];for(const name of ['Büro · VLAN 10','Campus / IPv4','Laboratório <eth0>']){const p=await repo.createProject({name,document:{schemaVersion:1,topology:{app:'netsim',version:1,devices:[],links:[]}}});if(!p.ok)throw Error(JSON.stringify(p));planIds.push(p.value.project.id);}
        const d=await repo.createProject({name:'Deleted fixture',document:{schemaVersion:1,topology:{app:'netsim',version:1,devices:[],links:[]}}});await repo.deleteProject(d.value.project.id,1);repo.close();`);
      const before = await archive(); await home();
      assert.deepEqual(await archive(), before);
    });
    let preserved;
    await test('home: new topology uses normal paused boot; F5 does not create another draft', async () => {
      await page.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
      await navigate('/'); await wait('document.querySelector(".journey-page")');
      await click('.home-button-primary'); await editor();
      assert.equal(await page.evaluate('return store.getState().paused;'), true);
      assert.equal(await page.evaluate('return new URL(location.href).searchParams.has("home");'), false);
      await page.evaluate('store.getState().addDeviceAt("host",{x:140,y:100});store.getState().renameDevice(store.getState().nodes[0].id,"pc-home-check");');
      await delay(1000);
      preserved = await page.evaluate('return store.getState().captureWorkspaceDocument();');
      const tabs = await page.evaluate('return document.querySelectorAll(".workspace-tab-wrap").length;');
      await page.send('Page.reload'); await editor();
      assert.equal(await page.evaluate('return document.querySelectorAll(".workspace-tab-wrap").length;'), tabs);
      assert.deepEqual(await page.evaluate('return store.getState().captureWorkspaceDocument();'), preserved);
    });
    await test('home: live language change preserves device IDs, active xterm, running simulation and document', async () => {
      await page.evaluate('store.getState().openTerminal(store.getState().nodes[0].id);store.getState().setPaused(false);window.termBefore=store.getState().terminals[0];window.generationBefore=store.getState().topologyGeneration;');
      await wait('document.querySelector(".xterm")');
      await page.evaluate('document.querySelectorAll(".toolbar-menu-trigger")[3].click();');
      await wait('document.querySelector("#inspector-layout-settings .language-selector select")');
      const before = await page.evaluate('return store.getState().captureWorkspaceDocument();');
      for (const language of ['en', 'pt-BR', 'de']) {
        await select('#inspector-layout-settings .language-selector select', language);
        assert.deepEqual(await page.evaluate('return store.getState().captureWorkspaceDocument();'), before);
        assert(await page.evaluate('return store.getState().terminals[0]===termBefore && store.getState().topologyGeneration===generationBefore && !store.getState().paused;'));
      }
      await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', windowsVirtualKeyCode: 27 });
      await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', windowsVirtualKeyCode: 27 });
      await page.evaluate('store.getState().setPaused(true);'); await delay(800);
      preserved = await page.evaluate('return store.getState().captureWorkspaceDocument();');
    });
    await test('home: returning home does not mutate the session; Continue restores the existing draft', async () => {
      await click('.home-link'); await wait('document.querySelector(".journey-page")');
      const before = await archive(); await page.send('Page.reload'); await wait('document.querySelector(".journey-page")');
      assert.deepEqual(await archive(), before);
      await click('.home-actions a[href="./app.html"]'); await editor();
      assert.deepEqual(await page.evaluate('return store.getState().captureWorkspaceDocument();'), preserved);
      assert(await page.evaluate('return store.getState().paused;'));
    });
    await test('home: Open lists saved plans safely and preserves other drafts', async () => {
      await navigate('/'); await wait('document.querySelector(".journey-page")'); await select('.language-selector select', 'pt-BR'); await click('.journey-entry-links a[href*="load"]'); await editor();
      await wait('document.querySelector(".workspace-plan-list")');
      assert.equal(await page.evaluate('return document.querySelector(".workspace-dialog h2").textContent;'), 'Planos salvos');
      assert.deepEqual(await page.evaluate('return store.getState().captureWorkspaceDocument();'), preserved);
      assert.equal(await page.evaluate('return document.querySelectorAll("eth0").length;'),0);
      const names=await page.evaluate('return [...document.querySelectorAll(".workspace-plan-open strong")].map(e=>e.textContent);');
      assert(names.includes('Laboratório <eth0>')); assert(!names.includes('Deleted fixture'));
      const chosen=names[0];
      await click('.workspace-plan-open');
      await wait(`document.querySelector('.workspace-tab-wrap[data-active=true] .workspace-tab-name')?.textContent===${JSON.stringify(chosen)}`);
      assert.equal(await page.evaluate('return store.getState().captureWorkspaceDocument().topology.devices.length;'),0);
      const raw = await archive(); assert(JSON.stringify(raw).includes('pc-home-check'));
    });
    await test('home: Labs and published exercises open the existing menus and retain pedagogical text', async () => {
      await navigate('/'); await wait('document.querySelector(".journey-page")'); await click('.journey-entry-links a[href*="exercises"]'); await editor(); await wait('document.querySelector(".exercise-menu-entry button:not(:disabled)")');
      const catalog = await page.evaluate('return (await import("/src/exercises/beta.ts")).BETA_EXERCISES.map(e=>e.student.title);');
      assert.deepEqual(await page.evaluate('return [...document.querySelectorAll(".exercise-menu-entry strong")].map(e=>e.textContent);'), catalog);
      assert(await page.evaluate('return document.querySelector(".exercise-note").textContent.includes("Exercícios experimentais");'));
      await click('.exercise-menu-entry button:not(:disabled)'); await wait('document.querySelector(".exercise-panel")'); await delay(700);
      const exercise = await page.evaluate('return {ids:store.getState().nodes.map(n=>n.id),id:document.querySelector(".exercise-panel").dataset.exercise};');
      const beforeLanguage = await archive();
      await page.evaluate('(await import("/src/i18n/index.ts")).useLanguage.getState().setLanguage("en");'); await delay(80);
      assert.deepEqual(await archive(), beforeLanguage);
      await page.evaluate('(await import("/src/i18n/index.ts")).useLanguage.getState().setLanguage("pt-BR");');
      await home(); await click('.home-labs a'); await editor(); await wait('document.querySelector("#toolbar-labs-menu")');
      assert.deepEqual(await page.evaluate('return {ids:store.getState().nodes.map(n=>n.id),id:document.querySelector(".exercise-panel").dataset.exercise};'), exercise);
    });
    await test('home: compact editor menus preserve language and fit 700px', async () => {
      await page.send('Emulation.setDeviceMetricsOverride', { width:700,height:1000,deviceScaleFactor:1,mobile:false });
      await wait('document.querySelectorAll(".toolbar-menu-trigger").length===1');
      await click('.toolbar-menu-trigger'); await wait('document.querySelector("#toolbar-compact-menu")');
      const labels = await page.evaluate('return [...document.querySelectorAll("#toolbar-compact-menu .toolbar-menu-action")].map(e=>e.textContent.trim());');
      assert(labels.some(s=>s.includes('Arquivo'))&&labels.some(s=>s.includes('Configurações')));
      assert(await page.evaluate('return document.documentElement.scrollWidth<=innerWidth;'));
      await click('#toolbar-compact-menu .toolbar-menu-action'); await wait('document.querySelector("#toolbar-file-menu")');
      const geometry=await page.evaluate('const r=document.querySelector("#toolbar-file-menu").getBoundingClientRect();return {left:r.left,right:r.right,width:innerWidth};');
      assert(geometry.left>=0&&geometry.right<=geometry.width);
    });
    await test('home: existing Share Links take precedence over a creation intent', async () => {
      const tabs = await page.evaluate('return document.querySelectorAll(".workspace-tab-wrap").length;');
      const before = await page.evaluate('return store.getState().captureWorkspaceDocument();');
      const hash = LZString.compressToEncodedURIComponent(JSON.stringify(before.topology));
      await navigate('/app.html?home=new#t=' + hash); await editor(); await wait('document.querySelector(".workspace-share")');
      assert.equal(await page.evaluate('return document.querySelectorAll(".workspace-tab-wrap").length;'),tabs);
      assert.deepEqual(await page.evaluate('return store.getState().captureWorkspaceDocument();'),before);
      await click('.workspace-share button:last-child');
    });
    await test('home: incompatible metadata remains intact and offers a recovery route', async () => {
      await home();
      await page.evaluate(`await new Promise((resolve,reject)=>{const r=indexedDB.open('netlab-projects');r.onsuccess=()=>{const db=r.result,tx=db.transaction('meta','readwrite');const g=tx.objectStore('meta').get('repository:schema');g.onsuccess=()=>{const v=g.result;v.value.projectDocumentVersion=99;tx.objectStore('meta').put(v);};tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>reject(tx.error);};});`);
      const before = await archive(); await home();
      assert(await page.evaluate('return !!document.querySelector(".journey-page");'));
      await click('.home-actions a[href="./app.html"]');
      await wait('document.querySelector(".workspace-start [data-error-code]")');
      assert(await page.evaluate('return document.querySelector(".workspace-start").textContent.includes("Speicher-Backup exportieren");'));
      assert.deepEqual(await archive(), before);
    });
  } finally {
    await navigate('/__project_repository_test__');
    await page.evaluate(`await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase('netlab-projects');r.onsuccess=resolve;r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Disposable homepage database cleanup blocked'));});`);
    await page.evaluate(`if(${JSON.stringify(savedLegacy)}===null)localStorage.removeItem('netsim:autosave:v1');else localStorage.setItem('netsim:autosave:v1',${JSON.stringify(savedLegacy)});localStorage.removeItem('netlab:language:v1');`);
  }

}
