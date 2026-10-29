import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import LZString from 'lz-string';
import { generateReview } from './visual-review.mjs';

/** Real entrypoints, only in the shared harness's disposable Chromium profile
 * and ephemeral localhost origin. Never attach to the user's dev server/profile. */
export async function runHomepageReview({ page, url, root, report }) {
  const origin = new URL(url).origin;
  const directory = path.join(root, '.playwright-mcp', 'home-review-' + Date.now());
  await mkdir(directory, { recursive: true });
  const captures = [];
  const delay = ms => new Promise(r => setTimeout(r, ms));
  const wait = async condition => { for (let i = 0; i < 240; i++) { if (await page.evaluate(`return !!(${condition});`)) return; await delay(40); } throw Error('Timed out: ' + condition); };
  const test = async (name, run) => { page.labelDownloads(name); try { await run(); report.results[name] = { passed: true }; } catch (e) { report.results[name] = { passed: false, error: e.stack }; throw e; } };
  const navigate = async route => { await page.send('Page.navigate', { url: origin + route }); await wait(`location.pathname === ${JSON.stringify(route.split('?')[0])} && document.readyState === 'complete'`); };
  const home = async () => { await navigate('/'); await wait('document.querySelector(".home-empty,.home-plan")'); };
  const editor = async () => { await wait('document.querySelector(".react-flow")'); await page.evaluate('window.store=(await import("/src/store.ts")).useStore;'); await delay(120); };
  const click = async selector => { await page.evaluate(`document.querySelector(${JSON.stringify(selector)}).click();`); };
  const select = async (selector, value) => { await page.evaluate(`const el=document.querySelector(${JSON.stringify(selector)});el.value=${JSON.stringify(value)};el.dispatchEvent(new Event('change',{bubbles:true}));`); await delay(60); };
  const archive = () => page.evaluate('const r=await (await import("/src/projects/recoveryArchive.ts")).readRecoveryArchive();if(!r.ok)throw Error(JSON.stringify(r));return r.value;');
  const shot = async (scene, variant, width, share = true) => {
    await page.send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false });
    await page.evaluate('scrollTo(0,0);await document.fonts.ready;'); await delay(100);
    const height = await page.evaluate('return document.documentElement.scrollHeight;');
    assert(await page.evaluate('return document.documentElement.scrollWidth <= innerWidth;'), 'Horizontal overflow');
    const file = path.join(directory, `${scene}-${width}.png`);
    const image = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height, scale: 1 } });
    await writeFile(file, Buffer.from(image.data, 'base64'));
    captures.push({ source: path.relative(root, file).replaceAll('\\', '/'), scene, variant, state: 'normal', width, height, share });
  };
  const savedLegacy = await page.evaluate('return localStorage.getItem("netsim:autosave:v1");');
  try {
    await page.evaluate('localStorage.removeItem("netsim:autosave:v1");');
    await test('home: fresh visit creates no database, preference, session or engine', async () => {
      await home();
      assert.equal(await page.evaluate('return document.documentElement.lang;'), 'de');
      assert.equal(await page.evaluate('return localStorage.getItem("netlab:language:v1");'), null);
      assert(!(await page.evaluate('return await indexedDB.databases();')).some(d => d.name === 'netlab-projects'));
      assert(!await page.evaluate('return performance.getEntriesByType("resource").some(r=>["/src/store.ts","/src/sim.ts","/src/engine/","WorkspaceApplication","xterm"].some(s=>r.name.includes(s)));'));
      assert(await page.evaluate('return !!document.querySelector(".home-empty strong");'));
    });
    await test('home: language selection and F5 persist without changing themes or plans', async () => {
      const titles = { en: 'Build. Connect. Understand.', 'pt-BR': 'Construa. Conecte. Entenda.', de: 'Bauen. Verbinden. Verstehen.' };
      for (const [language, title] of Object.entries(titles)) {
        await select('.language-selector select', language);
        assert.equal(await page.evaluate('return document.querySelector("h1").textContent;'), title);
        await page.send('Page.reload'); await wait('document.querySelector(".home-empty")');
        assert.equal(await page.evaluate('return document.documentElement.lang;'), language);
        assert.equal(await page.evaluate('return document.querySelector("h1").textContent;'), title);
        assert.equal(await page.evaluate('return document.documentElement.dataset.uiTheme;'), 'original');
      }
    });
    await test('home: real recent metadata is listed safely; deleted plans and HTML are handled', async () => {
      await page.evaluate(`const m=await import('/src/projects/repository.ts');const r=await m.openProjectRepository();if(!r.ok)throw Error(JSON.stringify(r));const repo=r.value;
        window.planIds=[];for(const name of ['Büro · VLAN 10','Campus / IPv4','Laboratório <eth0>']){const p=await repo.createProject({name,document:{schemaVersion:1,topology:{app:'netsim',version:1,devices:[],links:[]}}});if(!p.ok)throw Error(JSON.stringify(p));planIds.push(p.value.project.id);}
        const d=await repo.createProject({name:'Deleted fixture',document:{schemaVersion:1,topology:{app:'netsim',version:1,devices:[],links:[]}}});await repo.deleteProject(d.value.project.id,1);repo.close();`);
      const before = await archive();
      await home(); await wait('document.querySelectorAll(".home-plan").length===3');
      assert.equal(await page.evaluate('return document.querySelectorAll("eth0").length;'), 0);
      assert(!await page.evaluate('return document.querySelector(".home-recents").textContent.includes("Deleted fixture");'));
      assert.deepEqual(await archive(), before);
      await select('.home-theme select', 'graphite-dark');
      await shot('graphite-de', 'graphite-dark', 1440);
      await select('.language-selector select', 'en'); await shot('graphite-en', 'graphite-dark', 1440);
      await select('.home-theme select', 'classic-light'); await select('.language-selector select', 'pt-BR'); await shot('classic-pt-br', 'classic-light', 1440);
      await select('.home-theme select', 'graphite-dark'); await select('.language-selector select', 'de'); await shot('graphite-mobile', 'graphite-dark', 700);
      await shot('graphite-tablet', 'graphite-dark', 1024, false); await shot('graphite-small', 'graphite-dark', 390, false);
    });
    await test('home: all locales and themes fit 390, 700, 1024 and 1440; primary text has adequate contrast', async () => {
      for (const theme of ['graphite-dark', 'classic-light']) {
        await select('.home-theme select', theme);
        for (const language of ['de', 'en', 'pt-BR']) {
          await select('.language-selector select', language);
          for (const width of [390, 700, 1024, 1440]) {
            await page.send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false });
            await delay(30);
            assert(await page.evaluate('return document.documentElement.scrollWidth<=innerWidth;'), `${theme}/${language}/${width}`);
            assert(await page.evaluate('return document.querySelector(".home-continue").getBoundingClientRect().width>0;'));
          }
        }
        const contrast = await page.evaluate(`
          const rgb = s => s.match(/[\\d.]+/g).slice(0,3).map(Number);
          const lum = c => c.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
          const ratio=(a,b)=>{const x=lum(rgb(a)),y=lum(rgb(b));return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
          const button=getComputedStyle(document.querySelector('.home-button-primary')),body=getComputedStyle(document.body);
          return {button:ratio(button.color,button.backgroundColor),text:ratio(body.color,body.backgroundColor),secondary:ratio(getComputedStyle(document.querySelector('.home-intro')).color,body.backgroundColor)};
        `);
        assert(contrast.button>=4.5&&contrast.text>=4.5&&contrast.secondary>=4.5, JSON.stringify({theme,contrast}));
        report.homeContrast ??= {}; report.homeContrast[theme]=contrast;
      }
      await select('.home-theme select','graphite-dark'); await select('.language-selector select','de');
    });
    await test('home: keyboard SVG controls, finite animation and reduced motion', async () => {
      await page.evaluate('document.querySelectorAll(".home-diagram-device")[1].focus();');
      await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
      await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
      assert.equal(await page.evaluate('return document.querySelectorAll(".home-diagram-device")[1].getAttribute("aria-pressed");'), 'true');
      await click('.home-icon-button'); await wait('document.querySelector(".home-signal")');
      assert.equal(await page.evaluate('return getComputedStyle(document.querySelector(".home-signal")).animationIterationCount;'), '1');
      await wait('!document.querySelector(".home-signal")');
      await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
      await click('.home-icon-button');
      assert.equal(await page.evaluate('return getComputedStyle(document.querySelector(".home-signal")).display;'), 'none');
      await page.send('Emulation.setEmulatedMedia', { features: [] });
    });
    let preserved;
    await test('home: new topology uses normal paused boot; F5 does not create another draft', async () => {
      await page.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
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
      await click('.home-link'); await wait('document.querySelector(".home-plan")');
      const before = await archive(); await page.send('Page.reload'); await wait('document.querySelector(".home-plan")');
      assert.deepEqual(await archive(), before);
      await click('.home-continue'); await editor();
      assert.deepEqual(await page.evaluate('return store.getState().captureWorkspaceDocument();'), preserved);
      assert(await page.evaluate('return store.getState().paused;'));
    });
    await test('home: Open uses the existing translated plan dialog; recent links preserve other drafts', async () => {
      await home(); await select('.language-selector select', 'pt-BR'); await click('.home-actions a[href*="load"]'); await editor();
      await wait('document.querySelector(".workspace-plan-list")');
      assert.equal(await page.evaluate('return document.querySelector(".workspace-dialog h2").textContent;'), 'Planos salvos');
      assert.deepEqual(await page.evaluate('return store.getState().captureWorkspaceDocument();'), preserved);
      await click('.workspace-dialog header button'); await home();
      const target = await page.evaluate('return document.querySelector(".home-plan strong").textContent;');
      await click('.home-plan'); await editor(); await wait('document.querySelector(".workspace-tab-wrap[data-active=true]")');
      await wait(`document.querySelector('.workspace-tab-wrap[data-active=true] .workspace-tab-name').textContent===${JSON.stringify(target)}`);
      assert((await page.evaluate('return document.querySelectorAll(".workspace-tab-wrap").length;')) >= 3);
      const raw = await archive(); assert(JSON.stringify(raw).includes('pc-home-check'));
    });
    await test('home: Labs and published exercises open the existing menus and retain pedagogical text', async () => {
      await home(); await click('.home-exercises'); await editor(); await wait('document.querySelector(".exercise-menu-entry button:not(:disabled)")');
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
      assert(await page.evaluate('return document.querySelector(".home-empty").textContent.includes("recuperação");'));
      assert.deepEqual(await archive(), before);
    });
  } finally {
    await navigate('/__project_repository_test__');
    await page.evaluate(`await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase('netlab-projects');r.onsuccess=resolve;r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Disposable homepage database cleanup blocked'));});`);
    await page.evaluate(`if(${JSON.stringify(savedLegacy)}===null)localStorage.removeItem('netsim:autosave:v1');else localStorage.setItem('netsim:autosave:v1',${JSON.stringify(savedLegacy)});localStorage.removeItem('netlab:language:v1');`);
  }
  const manifest = path.join(directory, 'manifest.json');
  await writeFile(manifest, JSON.stringify({ id: 'react-homepage-i18n', title: 'NetLab-FiSI — Homepage DE / EN / PT-BR',
    variants: [{ id: 'graphite-dark', label: 'Graphite Dark' }, { id: 'classic-light', label: 'Classic Light' }], states: ['normal'], captures,
    share: captures.filter(c => c.share).map(c => ({ ...c, name: c.scene })), shareContactSheet: false }, null, 2));
  report.homepageReview = await generateReview(manifest);
}
