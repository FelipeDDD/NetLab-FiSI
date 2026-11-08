import { reopenStudio } from './studio-review-reopen.mjs';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { generateReview } from './visual-review.mjs';

export async function runTopologyStudioReview({ page, url, root, report, downloads, openPage }) {
  const directory = path.join(root, '.playwright-mcp/reviews/raw/topology-studio-staging'), database = 'netlab-idb-test-' + crypto.randomUUID();
  await mkdir(directory, { recursive: true });
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const wait = async condition => { for (let n = 0; n < 300; n++) { if (await page.evaluate(`return !!(${condition});`)) return; await delay(40); } throw Error('Studio: ' + condition); };
  const click = async (selector, text) => {
    const point = await page.evaluate(`const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.getClientRects().length&&(${text ? `e.textContent.trim()===${JSON.stringify(text)}` : 'true'}));if(!e)throw Error('Missing '+${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};`);
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, ...point, ...(type === 'mouseMoved' ? {} : { button: 'left', clickCount: 1 }) }); await delay(100);
  };
  const select = async (selector, value) => { await page.evaluate(`const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}));`); await delay(100); };
  const ready = () => wait("document.querySelector('.topology-studio iframe')?.contentDocument?.querySelector('[data-print-page]')&&!document.querySelector('[data-studio-print]').disabled");
  const shot = async (name, state, width = 1440, variant = 'graphite-dark') => { await ready(); await delay(180); const image = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); await writeFile(path.join(directory, name + '.png'), Buffer.from(image.data, 'base64')); return { source: path.relative(root, path.join(directory, name + '.png')).split(path.sep).join('/'), scene: name, state, width, height: 1000, variant }; };
  const test = async (name, work) => { try { await work(); report.results['topology studio: ' + name] = { passed: true }; } catch (e) { report.results['topology studio: ' + name] = { passed: false, error: e.stack }; throw e; } };
  const input = async (selector, value) => { await page.evaluate(`const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));`); await delay(120); };
  const download = async kind => {
    const before = report.downloads.length; page.labelDownloads('topology-studio-' + kind); await click(`[data-studio-export=${kind}]`);
    for (let i = 0; i < 100 && report.downloads.length === before; i++) await delay(40);
    assert.equal(report.downloads.length, before + 1); await page.drainDownloads();
    const file = report.downloads.at(-1); assert.equal(file.suggestedFilename, 'netlab-studio.' + kind);
    const bytes = await readFile(path.join(downloads, file.guid)); await writeFile(path.join(directory, 'sample.' + kind), bytes); return bytes;
  };
  const captures = [];
  try {
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await page.send('Page.navigate', { url }); await wait("document.readyState==='complete'&&document.getElementById('root')");
    await page.evaluate(`window.store=(await import('/src/store.ts')).useStore;window.sim=(await import('/src/sim.ts')).sim;window.studioProject=()=>{const d=structuredClone(store.getState().captureWorkspaceDocument());if(d.topology.ui)delete d.topology.ui.topologyStudio;return JSON.stringify(d);};window.lang=(await import('/src/i18n/index.ts')).useLanguage;window.theme=(await import('/src/uiTheme.ts')).useUiTheme;lang.getState().setLanguage('en');theme.getState().setTheme('graphite-dark');window.ws=await(await import('/src/workspace/reviewEntry.tsx')).mountWorkspaceReview(document.getElementById('root'),{databaseName:${JSON.stringify(database)}});`);
    await wait("document.querySelector('.react-flow')");
    await page.evaluate(`const chapter=await import('/src/tutorials/staticRoutingChapter.ts');const doc=chapter.staticRoutingDocument();const result=await ws.controller.openDocument(doc);if(!result.ok)throw Error(result.error.code);`);
    await delay(240);
    await page.evaluate(`store.getState().addStaticRoutingLan();store.getState().addDeviceAt('server',{x:1860,y:800});store.getState().addDeviceAt('notebook',{x:600,y:850});const ip=await import('/src/engine/ip.ts');for(const [id,dest,via,iface]of [['tutorial-04-r1','192.168.20.0/24','10.0.12.2','eth1'],['tutorial-04-r2','192.168.10.0/24','10.0.12.1','eth0'],['tutorial-04-r2','192.168.20.0/24','10.0.23.2','eth1'],['tutorial-04-r3','0.0.0.0/0','10.0.23.1','eth0']]){const p=ip.parseCidr(dest);sim.net.devices.get(id).addRoute(p.addr,p.prefix,ip.parseIp(via),iface);}store.getState().renameDevice('tutorial-04-r2','R2 · Core Router Universität / Distribution');store.getState().refresh();await ws.controller.flush();window.studioBefore=studioProject();`);
    await page.evaluate(`const ip=await import('/src/engine/ip.ts');sim.net.devices.get('tutorial-04-r2').getInterface('eth2').configureIpv4({mode:'static',ip:ip.parseCidr('192.168.30.1/24'),gateway:null,dns:null});const pc=sim.net.devices.get('tutorial-04-c');pc.getInterface('eth0').configureIpv4({mode:'static',ip:ip.parseCidr('192.168.30.30/24'),gateway:ip.parseIp('192.168.30.1'),dns:null});sim.net.devices.get('tutorial-04-r1').addRoute(ip.parseIp('192.168.30.0'),24,ip.parseIp('10.0.12.2'),'eth1');store.getState().setCableColor('tutorial-04-a-link','purple');store.getState().setPendingMarkingRect({x:-40,y:210,width:560,height:330});store.getState().createFreeMarking({name:'LAN A · Büro',color:'blue',intensity:18});store.getState().refresh();await ws.controller.flush();window.studioBefore=studioProject();`);
    await test('menu opens a separate modal and presets leave the source plan intact', async () => {
      await click('.toolbar-menu-trigger','File'); await click('.toolbar-menu-action[aria-haspopup=menu]'); await click('[data-open-topology-studio]'); await ready();
      assert.equal(await page.evaluate("return document.querySelector('[data-studio-preset]').value;"), 'clean');
      assert(await page.evaluate("return document.querySelector('.topology-studio iframe').contentDocument.querySelectorAll('[data-print-section=diagram] svg [data-device]').length>=10;"));
      captures.push(await shot('01-clean-a4-landscape','clean'));
      await select('[data-studio-preset]','technical'); await select('[data-studio-paper]','A3'); await ready(); captures.push(await shot('02-technical-addresses','technical'));
      await select('[data-studio-paper]','A4'); await ready();
      assert(await page.evaluate("const doc=document.querySelector('.topology-studio iframe').contentDocument;return doc.body.textContent.includes('192.168.20.0/24')&&doc.body.textContent.includes('10.0.12.2')&&doc.body.textContent.includes('eth1');"));
      assert.equal(await page.evaluate('return studioProject();'),await page.evaluate('return studioBefore;'));
    });
    if (process.env.NETLAB_STUDIO_CHECKPOINT !== '2') {
      await test('presentation, paper size and orientation update only the print document', async () => {
        await select('[data-studio-preset]', 'presentation'); await ready(); captures.push(await shot('03-presentation','presentation'));
        await select('[data-studio-paper]', 'A3'); await select('[data-studio-orientation]', 'portrait'); await ready();
        assert(await page.evaluate("return document.querySelector('.topology-studio iframe').dataset.previewHtml.includes('size: A3 portrait');"));
        await select('[data-studio-preset]', 'technical'); await ready();
      });
      await test('individual selections, aliases, filtering, refresh and escaping preserve network configuration', async () => {
        await page.evaluate("const p=document.querySelector('[data-picker=routes]');for(let e=p?.parentElement;e;e=e.parentElement)if(e.tagName==='DETAILS')e.open=true;");
        await click('[data-picker=routes] [data-studio-device=tutorial-04-r2]'); await ready();
        assert(await page.evaluate("const doc=document.querySelector('.topology-studio iframe').contentDocument;return ![...doc.querySelectorAll('h2')].some(e=>e.textContent.startsWith('Routing Tables — R2'))&&[...doc.querySelectorAll('h2')].some(e=>e.textContent.startsWith('Routing Tables — R3'));"));
        await click('[data-picker=routes] [data-studio-device=tutorial-04-r2]'); await ready();
        await page.evaluate("document.querySelector('[data-studio-alias=tutorial-04-r1]').closest('details').open=true;");
        await input('[data-studio-alias=tutorial-04-r1]', 'Zentralrouter <Review>'); await ready();
        assert(await page.evaluate("const doc=document.querySelector('.topology-studio iframe').contentDocument;return doc.querySelector('[data-device=tutorial-04-r1]').textContent.replace(/\\s+/g,'').includes('Zentralrouter<Review>')&&[...doc.querySelectorAll('h2')].some(e=>e.textContent.includes('Routing Tables — R1'));"));
        await select('[data-studio-route-filter]', 'connected'); await ready();
        assert(await page.evaluate("const doc=document.querySelector('.topology-studio iframe').contentDocument;return [...doc.querySelectorAll('.print-table-section')].filter(e=>e.querySelector('h2').textContent.startsWith('Routing Tables')).every(e=>!e.textContent.includes('10.0.12.2'));"));
        await select('[data-studio-route-filter]', 'all');
        const old = await page.evaluate("return document.querySelector('.topology-studio iframe').contentDocument.body.textContent;");
        await page.evaluate("sim.net.devices.get('tutorial-04-r1').name='R1 refreshed';store.getState().refresh();"); await delay(150);
        assert.equal(await page.evaluate("return document.querySelector('.topology-studio iframe').contentDocument.body.textContent;"), old);
        await reopenStudio(page); await ready();
        assert(await page.evaluate("return document.querySelector('.topology-studio iframe').contentDocument.body.textContent.includes('R1 refreshed');"));
        await page.evaluate("sim.net.devices.get('tutorial-04-r1').name='R1';store.getState().refresh();"); await reopenStudio(page); await ready();
        assert.equal(await page.evaluate('return studioProject();'),await page.evaluate('return studioBefore;'));
      });
      await test('real SVG PNG and self-contained HTML downloads use the same isolated presentation', async () => {
        // Presets now retain the active format; choose this fixture's sheet explicitly.
        await select('[data-studio-paper]', 'A4'); await select('[data-studio-orientation]', 'landscape'); await ready();
        await input('[data-studio-title]', 'Topology Review <2026>'); await ready();
        const svg = (await download('svg')).toString('utf8'); assert.match(svg,/Topology Review &lt;2026&gt;/); assert.doesNotMatch(svg,/<script/);
        assert(await page.evaluate(`return !new DOMParser().parseFromString(${JSON.stringify(svg)},'image/svg+xml').querySelector('parsererror');`));
        const png = await download('png'); assert.equal(png.subarray(1,4).toString(),'PNG'); assert(png.readUInt32BE(16)>2500); assert(png.readUInt32BE(20)>1000);
        const html = (await download('html')).toString('utf8'); assert.match(html,/Routing Tables/); assert.match(html,/size: A4 landscape/); assert.doesNotMatch(html,/<script|<link|(?:src|href)=["']https?:/);
        assert(await page.evaluate("const doc=document.querySelector('.topology-studio iframe').contentDocument;return [...doc.querySelectorAll('.print-page')].every(p=>p.scrollWidth<=p.clientWidth+1)&&doc.querySelectorAll('.print-page').length>1;"));
        await page.evaluate("const iframe=document.querySelector('.topology-studio iframe'),d=iframe.contentDocument,e=[...d.querySelectorAll('h2')].find(e=>e.textContent.startsWith('Routing Tables')),s=document.querySelector('.studio-preview-stage');s.scrollTop=e.closest('.print-page').offsetTop*(s.querySelector('.studio-preview-space').getBoundingClientRect().width/parseFloat(iframe.style.width));"); captures.push(await shot('04-selected-routing-tables','routes'));
        await page.evaluate("const iframe=document.querySelector('.topology-studio iframe'),d=iframe.contentDocument,e=[...d.querySelectorAll('h2')].find(e=>e.textContent.startsWith('Interfaces')),s=document.querySelector('.studio-preview-stage');s.scrollTop=e.closest('.print-page').offsetTop*(s.querySelector('.studio-preview-space').getBoundingClientRect().width/parseFloat(iframe.style.width));"); captures.push(await shot('05-multiple-report-sections','report'));
        await page.evaluate("document.querySelector('.studio-preview-stage').scrollTop=0;");
      });
      await test('native print action and Chromium PDF output respect A4/A3 paper and both orientations', async () => {
        await page.evaluate("window.studioPrintTriggered=false;document.querySelector('.topology-studio iframe').contentWindow.addEventListener('beforeprint',()=>{window.studioPrintTriggered=true;},{once:true});");
        await click('[data-studio-print]'); assert(await page.evaluate('return studioPrintTriggered;'));
        const printPage = await openPage();
        try {
          for (const paper of ['A4','A3']) for (const orientation of ['landscape','portrait']) {
            await select('[data-studio-paper]',paper); await select('[data-studio-orientation]',orientation); await ready();
            const html = await page.evaluate("return document.querySelector('.topology-studio iframe').dataset.previewHtml;");
            const tree=await printPage.send('Page.getFrameTree'); await printPage.send('Page.setDocumentContent',{frameId:tree.frameTree.frame.id,html});
            const pdf=await printPage.send('Page.printToPDF',{printBackground:true,preferCSSPageSize:true,displayHeaderFooter:false});
            const bytes=Buffer.from(pdf.data,'base64'); assert.equal(bytes.subarray(0,4).toString(),'%PDF');
            const pageCounts=[...bytes.toString('latin1').matchAll(/\/Count\s+(\d+)/g)].map(m=>Number(m[1]));
            assert.equal(Math.max(...pageCounts),(html.match(/data-print-page=/g)??[]).length,'PDF page count must match preview');
            const box=/\/MediaBox\s*\[0 0 ([\d.]+) ([\d.]+)\]/.exec(bytes.toString('latin1')); assert(box,'PDF page size');
            const expected=paper==='A4'?[842,595]:[1191,842];if(orientation==='portrait')expected.reverse();
            assert(Math.abs(Number(box[1])-expected[0])<2&&Math.abs(Number(box[2])-expected[1])<2);
            await writeFile(path.join(directory,`print-${paper.toLowerCase()}-${orientation}.pdf`),bytes);
          }
        } finally { await printPage.send('Page.close'); printPage.close(); }
        await select('[data-studio-paper]','A4');await select('[data-studio-orientation]','landscape');await ready();
      });
      await test('themes, translations, narrow layout, focus and Escape do not affect the editor or print colours', async () => {
        for (const theme of ['graphite-dark','classic-light','slate-gray','burgundy-dark']) for (const language of ['de','pt-BR','en']) {
          await page.evaluate(`theme.getState().setTheme(${JSON.stringify(theme)});lang.getState().setLanguage(${JSON.stringify(language)});`); await ready();
          assert(await page.evaluate("const d=document.querySelector('.topology-studio');const paper=document.querySelector('.topology-studio iframe').contentDocument.querySelector('.print-page');return d.getBoundingClientRect().right<=innerWidth&&getComputedStyle(paper).backgroundColor==='rgb(255, 255, 255)';"));
        }
        await page.evaluate("theme.getState().setTheme('classic-light');");
        await page.send('Emulation.setDeviceMetricsOverride',{width:700,height:1000,deviceScaleFactor:1,mobile:false}); await delay(180); await ready();
        assert(await page.evaluate("const d=document.querySelector('.topology-studio'),o=document.querySelector('.studio-options');return d.scrollWidth<=d.clientWidth+1&&o.scrollWidth<=o.clientWidth+1&&document.querySelector('.studio-footer').getBoundingClientRect().bottom<=innerHeight;"));
        captures.push(await shot('06-classic-light-700','narrow',700,'classic-light'));
        await page.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});await delay(150);await ready();
        assert(await page.evaluate("const d=document.querySelector('.topology-studio'),o=document.querySelector('.studio-options');return d.scrollWidth<=d.clientWidth+1&&o.scrollWidth<=o.clientWidth+1&&document.querySelector('.studio-footer').getBoundingClientRect().bottom<=innerHeight;"));
        await page.evaluate("document.querySelector('[data-studio-preset]').focus();");
        for (const type of ['keyDown','keyUp']) await page.send('Input.dispatchKeyEvent',{type,key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
        await wait("!document.querySelector('.topology-studio')"); assert.equal(await page.evaluate('return studioProject();'),await page.evaluate('return studioBefore;'));
        assert(await page.evaluate("return !!document.activeElement?.classList.contains('toolbar-menu-trigger');"));
      });
    }
    if (process.env.NETLAB_STUDIO_BLOCKS_REVIEW === '1') {
      const { runTopologyBlocksReview } = await import('./topology-blocks-review.mjs');
      await runTopologyBlocksReview({ page, url, root, report, downloads, openPage });
    }
    if (process.env.NETLAB_STUDIO_DEVICES_REVIEW === '1') {
      const { runTopologyDevicesReview } = await import('./topology-devices-review.mjs');
      await runTopologyDevicesReview({ page, root, report, downloads, openPage });
    }
    if (process.env.NETLAB_STUDIO_USABILITY_REVIEW === '1') {
      const { runTopologyUsabilityReview } = await import('./topology-usability-review.mjs');
      await runTopologyUsabilityReview({ page, root, report, downloads, openPage });
    }
    if (process.env.NETLAB_STUDIO_REFINEMENT_REVIEW === '1') {
      const { runTopologyRefinementReview } = await import('./topology-refinement-review.mjs');
      await runTopologyRefinementReview({ page, root, report, downloads, openPage });
    }
    if (process.env.NETLAB_STUDIO_COMPACT_REVIEW === '1') {
      const { runTopologyCompactReview } = await import('./topology-compact-review.mjs');
      await runTopologyCompactReview({ page, root, report, downloads, openPage });
    }
    if (process.env.NETLAB_STUDIO_PAGE_LAYOUTS_REVIEW === '1') {
      const { runTopologyPageLayoutsReview } = await import('./topology-page-layouts-review.mjs');
      await runTopologyPageLayoutsReview({ page, root, report, downloads, openPage });
    }
    if (process.env.NETLAB_STUDIO_PERSISTENCE_REVIEW === '1') {
      const { runStudioPersistenceReview } = await import('./studio-persistence-review.mjs');
      await runStudioPersistenceReview({ page, root, report, downloads, openPage, database, url });
    }
    if (process.env.NETLAB_STUDIO_DISTANCE_FLIP_REVIEW === '1') {
      const { runStudioDistanceFlipReview } = await import('./studio-distance-flip-review.mjs');
      await runStudioDistanceFlipReview({ page, root, report, downloads, openPage, database, url });
    }
    if (process.env.NETLAB_STUDIO_MOVE_FOOTER_REVIEW === '1') {
      const { runStudioMoveFooterReview } = await import('./studio-move-footer-review.mjs');
      await runStudioMoveFooterReview({ page, root, report, downloads, openPage, database });
    }
    if(process.env.NETLAB_STUDIO_STABILIZATION_REVIEW==='1'){
      const {runStudioStabilizationReview}=await import('./studio-stabilization-review.mjs');
      await runStudioStabilizationReview({page,root,report,downloads,openPage,database});
    }
    report.studioReview = captures;
  } finally {
    await page.evaluate('if(window.ws){await ws.controller.flush();ws.dispose();}');
    await page.evaluate(`await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase(${JSON.stringify(database)});r.onsuccess=resolve;r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Studio cleanup blocked'));});`);
  }
  const manifest = path.join(directory, 'manifest.json');
  await writeFile(manifest, JSON.stringify({ id: 'topology-studio', title: 'Topology Studio', variants: [{ id: 'graphite-dark', label: 'Graphite Dark' }, { id: 'classic-light', label: 'Classic Light' }], states: [...new Set(captures.map(c=>c.state))], captures, share: captures.map(c=>({...c,name:c.scene.replace(/^\d+-/, '')})), shareContactSheet: false }));
  report.studioReview = await generateReview(manifest);
}
