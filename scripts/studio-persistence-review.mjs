import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function runStudioPersistenceReview({ page, root, report, downloads, openPage, database, url }) {
  const output = path.join(root, '.playwright-mcp/reviews/canvas-studio-persistence'), refs = path.join(output, 'referencias-chatgpt'); await mkdir(refs, { recursive: true });
  const delay = ms => new Promise(r => setTimeout(r, ms));
  const wait = async expression => { for (let n = 0; n < 250; n++) { if (await page.evaluate(`return !!(${expression});`)) return; await delay(40); } throw Error('Persistence review timeout: ' + expression); };
  const ready = async () => { await delay(150); await wait("document.querySelector('.topology-studio iframe')?.contentDocument?.querySelector('[data-device]')&&!document.querySelector('[data-studio-print]').disabled"); };
  const click = async (selector, text) => { await page.evaluate(`const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>${text ? `e.textContent.trim()===${JSON.stringify(text)}` : 'true'});if(!e)throw Error('Missing '+${JSON.stringify(selector)});e.click();`); await delay(140); };
  const select = async (selector, value) => { await page.evaluate(`const e=document.querySelector(${JSON.stringify(selector)});if(![...e.options].some(o=>o.value===${JSON.stringify(String(value))}))throw Error('Missing option');e.value=${JSON.stringify(String(value))};e.dispatchEvent(new Event('change',{bubbles:true}));`); await ready(); };
  const input = async (selector, value) => { await page.evaluate(`const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));`); await ready(); };
  const shot = async (name, reference = true) => { const r = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); await writeFile(path.join(reference ? refs : output, name + '.png'), Buffer.from(r.data, 'base64')); };
  const test = async (name, run) => { try { await run(); report.results['studio persistence: ' + name] = { passed: true }; } catch (error) { report.results['studio persistence: ' + name] = { passed: false, error: error.stack }; await shot('persistence-failure', false).catch(() => {}); throw error; } };
  const init = async () => {
    await page.evaluate(`window.store=(await import('/src/store.ts')).useStore;window.sim=(await import('/src/sim.ts')).sim;window.lang=(await import('/src/i18n/index.ts')).useLanguage;lang.getState().setLanguage('en');(await import('/src/uiTheme.ts')).useUiTheme.getState().setTheme('graphite-dark');window.studioProject=()=>{const d=structuredClone(store.getState().captureWorkspaceDocument());if(d.topology.ui)delete d.topology.ui.topologyStudio;return JSON.stringify(d);};window.ws=await(await import('/src/workspace/reviewEntry.tsx')).mountWorkspaceReview(document.getElementById('root'),{databaseName:${JSON.stringify(database)}});`); await wait("document.querySelector('.react-flow')");
  };
  const openStudio = async () => { await click('.toolbar-menu-trigger', 'File'); await click('.toolbar-menu-action[aria-haspopup=menu]'); await click('[data-open-topology-studio]'); await ready(); };
  const closeStudio = async () => { await click('.studio-header button[aria-label=Close]'); await wait("!document.querySelector('.topology-studio')"); };
  const switchPage = async (paper, orientation) => { await select('[data-studio-paper]', paper); await select('[data-studio-orientation]', orientation); };
  const persisted = async () => { await wait("document.querySelector('[data-studio-storage-status]')?.textContent==='Presentation draft autosaved'"); const r = await page.evaluate('return ws.controller.flush();'); assert(r.ok, JSON.stringify(r)); };
  const saved = () => page.evaluate('return structuredClone(store.getState().studioPresentation);');
  const probe = `const s=window.persistSvg??document.querySelector('.topology-studio iframe').contentDocument.querySelector('[data-print-section=diagram] svg');return {viewBox:s.getAttribute('viewBox'),transform:s.querySelector('[data-topology]').getAttribute('transform'),cards:[...s.querySelectorAll('[data-device]')].map(g=>({id:g.dataset.device,x:+g.dataset.x,y:+g.dataset.y,width:+g.dataset.width,height:+g.dataset.height,manual:g.dataset.manual,text:[...g.querySelectorAll('text')].map(t=>t.textContent)})),links:[...s.querySelectorAll('[data-link]')].map(g=>[g.dataset.link,...['points','x1','y1','x2','y2'].map(k=>g.getAttribute(k))]),labels:[...s.querySelectorAll('[data-cable-label]')].map(g=>g.textContent),tables:[...s.querySelectorAll('[data-document-block]')].map(g=>({id:g.dataset.documentBlock,device:g.dataset.blockDevice,x:+g.dataset.x,y:+g.dataset.y,width:+g.dataset.width,height:+g.dataset.height,scale:+g.dataset.scale,baseWidth:+g.dataset.baseWidth,text:g.textContent}))};`;
  const metrics = () => page.evaluate(probe), settings = id => `[data-studio-block-settings="${id}"]`;
  const position = async (id, x, y) => { await page.evaluate(`document.querySelector('${settings(id)} [data-block-advanced]').open=true;`); for (const [axis, value] of [['x', x], ['y', y]]) await input(`${settings(id)} [data-block-${axis}]`, String(value * 25.4 / 96)); };
  const arrange = async ids => {
    const area = await page.evaluate("const s=document.querySelector('.topology-studio iframe').contentDocument.querySelector('svg');return{x:+s.dataset.contentX,y:+s.dataset.contentY,width:+s.dataset.contentWidth,height:+s.dataset.contentHeight};");
    for (const [i, id] of ids.entries()) { const table = (await metrics()).tables.find(t => t.id === id); await position(id, i === 1 ? area.x + area.width - table.width - 8 : area.x + 8, i < 2 ? area.y + 8 : area.y + area.height - table.height - 8); }
  };
  const gesture = async (selector, dx, dy, mode = 'device') => {
    await page.send('Page.bringToFront');
    const coords = `const f=document.querySelector('.topology-studio iframe'),g=f.contentDocument.querySelector(${JSON.stringify(selector)}),r=g.getBoundingClientRect(),fr=f.getBoundingClientRect(),k=fr.width/f.offsetWidth;return{x:fr.x+(r.x+${mode === 'width' || mode === 'scale' ? 'r.width-9' : 'r.width/2'})*k,y:fr.y+(r.y+${mode === 'scale' ? 'r.height-9' : mode === 'block' ? '12' : 'r.height/2'})*k,k:k*g.ownerSVGElement.getScreenCTM().a};`;
    let p = await page.evaluate(coords); await page.evaluate(`const s=document.querySelector('.studio-preview-stage'),r=s.getBoundingClientRect();s.scrollLeft+=Math.max(0,${p.x}-r.right+35)+Math.min(0,${p.x}-r.left-35);s.scrollTop+=Math.max(0,${p.y}-r.bottom+35)+Math.min(0,${p.y}-r.top-35);`); await delay(70); p = await page.evaluate(coords);
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y }); await delay(60); await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', buttons: 1, clickCount: 1 });
    for (let i = 1; i <= 5; i++) await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x + dx * p.k * i / 5, y: p.y + dy * p.k * i / 5, buttons: 1 }); await delay(60);
    assert(await page.evaluate(`return !!document.querySelector('.topology-studio iframe').contentDocument.querySelector('[data-${mode === 'device' ? 'device-dragging' : mode === 'width' ? 'resizing' : mode === 'scale' ? 'scaling' : 'dragging'}=true]');`));
    await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x + dx * p.k, y: p.y + dy * p.k, button: 'left', buttons: 0, clickCount: 1 }); await ready();
  };
  let draftA, draftB, planA, ids, networkA, metadataA; const layouts = new Map();
  if (await page.evaluate("return !!document.querySelector('.topology-studio');")) await closeStudio();
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1100, deviceScaleFactor: 1, mobile: false });
  await test('autosaves shared settings, three tables and four independent layouts without changing network configuration', async () => {
    draftA = await page.evaluate("const r=await ws.controller.openDocument((await import('/src/export/studio/blocks.fixture.ts')).blocksFixture('four'));if(!r.ok)throw Error(JSON.stringify(r));return r.value;"); networkA = await page.evaluate('return studioProject();');
    await openStudio(); await select('[data-studio-diagram-scale]', '0.4'); await select('[data-studio-zoom]', 'page'); await click('[data-studio-maximize]'); await input('[data-studio-title]', 'Campus A · apresentação salva'); await input('[data-studio-subtitle]', 'Quatro formatos independentes'); await select('[data-studio-margin]', '10'); await input('.studio-options input[type=color]', '#1d637a');
    for (const key of ['ipv4', 'interfaces', 'gateways', 'cableLabels']) { await click(`[data-studio-diagram-option=${key}]`); await ready(); }
    await page.evaluate("document.querySelector('[data-studio-alias=A]').closest('details').open=true;"); await input('[data-studio-alias=A]', 'Router A / Campus');
    await page.evaluate("document.querySelector('[data-studio-add-block-panel]').open=true;"); ids = [];
    for (const device of ['A', 'B', 'D']) { await select('[data-studio-block-device]', device); await click('[data-studio-add-block]'); await ready(); ids.push((await metrics()).tables.at(-1).id); }
    await select(`${settings(ids[1])} [data-block-filter]`, 'static'); await click(`${settings(ids[2])} [data-block-column=origin]`); await ready();
    for (const [i, [paper, orientation]] of [['A4', 'portrait'], ['A4', 'landscape'], ['A3', 'portrait'], ['A3', 'landscape']].entries()) {
      await switchPage(paper, orientation); await gesture('[data-device="A"]', -12 - i * 3, -4); await gesture('[data-device="D"]', 0, 8 + i * 2); await arrange(ids);
      await gesture(`[data-document-block="${ids[0]}"]`, 22 + i * 3, 0, 'width'); await select(`${settings(ids[2])} [data-block-scale-select]`, '0.85');
      if (i === 0) { await click('[data-studio-compact]'); await ready(); }
      layouts.set(paper + '-' + orientation, await metrics());
    }
    await switchPage('A4', 'portrait'); assert.deepEqual(await metrics(), layouts.get('A4-portrait')); await click('[data-studio-alignment-guides]'); await persisted(); metadataA = await saved();
    assert.equal(metadataA.shared.title, 'Campus A · apresentação salva'); assert.equal(metadataA.shared.subtitle, 'Quatro formatos independentes'); assert.equal(metadataA.shared.accent, '#1d637a'); assert.equal(metadataA.shared.margin, 10); assert.equal(metadataA.shared.routingBlocks[1].filter, 'static'); assert(metadataA.shared.routingBlocks[2].columns.origin); assert.equal(metadataA.alignmentGuides, false); assert.equal(Object.keys(metadataA.layouts).length, 4); assert.equal(metadataA.shared.routingBlocks.length, 3); assert(!JSON.stringify(metadataA).includes('compactUndo')); assert.equal(await page.evaluate('return studioProject();'), networkA);
    await shot('05-studio-antes-de-fechar');
  });
  await test('closing and reopening restores exact layout and preferences, with fresh technical snapshot and no undo history', async () => {
    await closeStudio(); await openStudio(); await select('[data-studio-zoom]', 'page'); await click('[data-studio-maximize]');
    assert.equal(await page.evaluate("return document.querySelector('[data-studio-orientation]').value;"), 'portrait'); assert.equal(await page.evaluate("return document.querySelector('[data-studio-alignment-guides]').checked;"), false); assert.deepEqual(await metrics(), layouts.get('A4-portrait')); assert(await page.evaluate("return document.querySelector('[data-studio-undo-compact]').disabled;"));
    for (const [key, expected] of layouts) { const [paper, orientation] = key.split('-'); await switchPage(paper, orientation); assert.deepEqual(await metrics(), expected); }
    await switchPage('A4', 'portrait'); await persisted(); assert.deepEqual(await saved(), metadataA); await shot('06-studio-reaberto-restaurado'); assert.equal(await page.evaluate('return studioProject();'), networkA);
  });
  await test('F5 recovers the durable draft, last page and all four layouts without requiring Save per edit', async () => {
    await closeStudio(); await page.send('Page.reload'); await wait("document.readyState==='complete'&&document.getElementById('root')"); await init(); assert.equal(await page.evaluate('return ws.controller.getState().activeDraftId;'), draftA);
    await openStudio(); await select('[data-studio-zoom]', 'page'); await click('[data-studio-maximize]'); assert.deepEqual(await metrics(), layouts.get('A4-portrait')); assert.deepEqual(await saved(), metadataA);
    await shot('07-studio-apos-f5'); assert.equal(await page.evaluate('return studioProject();'), networkA);
    const savedPlan = await page.evaluate("const r=await ws.controller.save('Campus A');if(!r.ok)throw Error(JSON.stringify(r));return r.value.plan.project.id;"); planA = savedPlan;
  });
  await test('isolates other plans and rejects late updates from a previous topology generation', async () => {
    const oldGeneration = await page.evaluate('return store.getState().topologyGeneration;'); await closeStudio();
    draftB = await page.evaluate("const r=await ws.controller.openDocument((await import('/src/export/studio/blocks.fixture.ts')).blocksFixture('simple'));if(!r.ok)throw Error(JSON.stringify(r));return r.value;");
    assert.equal(await saved(), null); await openStudio(); assert.equal((await metrics()).tables.length, 0); assert((await metrics()).cards.every(c => c.manual === 'false')); await input('[data-studio-title]', 'Plan B only'); await persisted();
    const b = await saved(); assert.equal(await page.evaluate(`return store.getState().setStudioPresentation(${JSON.stringify(metadataA)},${oldGeneration});`), false); assert.deepEqual(await saved(), b);
    await closeStudio(); assert((await page.evaluate(`return ws.controller.switchDraft(${JSON.stringify(draftA)});`)).ok); await openStudio(); await select('[data-studio-zoom]', 'page'); assert.deepEqual(await metrics(), layouts.get('A4-portrait')); assert.deepEqual(await saved(), metadataA);
    await closeStudio(); const state = await page.evaluate('return ws.controller.getState();'), a = state.drafts.find(d => d.id === draftA); assert(!a.manualSavePending);
    assert((await page.evaluate(`return ws.controller.closeDraft(${JSON.stringify(draftA)},{expectedEditSequence:${a.editSequence}});`)).ok);
    assert((await page.evaluate(`return ws.controller.openPlan(${JSON.stringify(planA)});`)).ok); draftA = await page.evaluate('return ws.controller.getState().activeDraftId;'); await openStudio(); await select('[data-studio-zoom]', 'page'); assert.deepEqual(await metrics(), layouts.get('A4-portrait'));
  });
  await test('Topology JSON carries owned presentation metadata, imports independently, and keeps old files compatible', async () => {
    const count = report.downloads.length; page.labelDownloads('topology-json-with-studio'); await page.evaluate('store.getState().exportJson();'); for (let n = 0; n < 150 && report.downloads.length === count; n++) await delay(40); assert.equal(report.downloads.length, count + 1); await page.drainDownloads();
    const json = await readFile(path.join(downloads, report.downloads.at(-1).guid), 'utf8'); await writeFile(path.join(output, 'topology-with-studio.json'), json); assert.deepEqual(JSON.parse(json).ui.topologyStudio, metadataA);
    await closeStudio(); const imported = await page.evaluate(`const r=await ws.controller.openDocument({schemaVersion:1,topology:JSON.parse(${JSON.stringify(json)})});if(!r.ok)throw Error(JSON.stringify(r));return r.value;`); assert.notEqual(imported, draftA);
    await openStudio(); await select('[data-studio-zoom]', 'page'); assert.deepEqual(await metrics(), layouts.get('A4-portrait')); await input('[data-studio-title]', 'Imported independent copy'); await persisted();
    await closeStudio(); assert((await page.evaluate(`return ws.controller.switchDraft(${JSON.stringify(draftA)});`)).ok); assert.deepEqual(await saved(), metadataA); await openStudio(); await select('[data-studio-zoom]', 'page');
  });
  await test('delayed acknowledgements and storage failures preserve latest settings and expose recovery status', async () => {
    await page.evaluate("window.updateOriginal=ws.controller.workspace.updateDraft.bind(ws.controller.workspace);window.writeEntered=false;window.writeReleased=new Promise(r=>window.releaseWrite=r);ws.controller.workspace.updateDraft=async(...args)=>{ws.controller.workspace.updateDraft=updateOriginal;writeEntered=true;await writeReleased;return updateOriginal(...args);};");
    await input('[data-studio-title]', 'Older pending title'); await page.evaluate('window.pendingWrite=ws.controller.flush();'); await wait('writeEntered'); await input('[data-studio-title]', 'Latest title wins');
    await page.evaluate('releaseWrite();await pendingWrite;'); await persisted(); assert.equal((await saved()).shared.title, 'Latest title wins');
    await page.evaluate("ws.controller.workspace.updateDraft=async()=>({ok:false,error:{code:'quota-exceeded',message:'Test storage full'}});"); await input('[data-studio-title]', 'Kept after storage failure'); const failed = await page.evaluate('return ws.controller.flush();'); assert(!failed.ok);
    await wait("document.querySelector('[data-studio-storage-status]').textContent.includes('Saving failed')"); assert.equal((await saved()).shared.title, 'Kept after storage failure');
    await page.evaluate('ws.controller.workspace.updateDraft=updateOriginal;'); assert((await page.evaluate('return ws.controller.flush();')).ok); await persisted(); await input('[data-studio-title]', 'Campus A · apresentação salva'); await persisted(); metadataA = await saved();
  });
  await test('SVG PNG HTML and four PDFs match recovered variants without persistent interaction controls', async () => {
    await select('[data-studio-zoom]', 'page'); const expected = await metrics();
    const download = async kind => { const n = report.downloads.length; page.labelDownloads('persisted-studio-' + kind); await click(`[data-studio-export=${kind}]`); for (let i = 0; i < 150 && report.downloads.length === n; i++) await delay(40); assert.equal(report.downloads.length, n + 1); await page.drainDownloads(); const bytes = await readFile(path.join(downloads, report.downloads.at(-1).guid)); await writeFile(path.join(output, 'persisted.' + kind), bytes); return bytes; };
    const svg = (await download('svg')).toString('utf8'), png = await download('png'), html = (await download('html')).toString('utf8'); assert(html.includes(svg)); assert(!svg.includes('data-studio-device-guides')); assert(!svg.includes('data-studio-block-ui'));
    assert.deepEqual(await page.evaluate(`window.persistSvg=new DOMParser().parseFromString(${JSON.stringify(svg)},'image/svg+xml').documentElement;const r=await(async()=>{${probe}})();delete window.persistSvg;return r;`), expected);
    const printer = await openPage(); try { const tree = await printer.send('Page.getFrameTree'); await printer.send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1120, deviceScaleFactor: 1, mobile: false });
      await printer.send('Page.setDocumentContent', { frameId: tree.frameTree.frame.id, html: `<!doctype html><meta charset="utf-8"><style>body{margin:20px;background:#e4e8ec;font:18px Arial}main{display:grid;grid-template-columns:1fr 1fr;gap:20px}section{min-width:0;background:white;padding:18px}h2{font-size:18px}svg,img{width:100%;height:auto}</style><main><section><h2>Prévia recuperada · A4 Hochformat</h2>${svg}</section><section><h2>PNG exportado após recuperação</h2><img src="data:image/png;base64,${png.toString('base64')}"></section></main>` }); await printer.evaluate('await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()));'); const r = await printer.send('Page.captureScreenshot', { format: 'png' }); await writeFile(path.join(refs, '08-previa-recuperada-exportacao.png'), Buffer.from(r.data, 'base64'));
      for (const [key, expected] of layouts) { const [paper, orientation] = key.split('-'); await switchPage(paper, orientation); assert.deepEqual(await metrics(), expected); const document = await page.evaluate("return document.querySelector('.topology-studio iframe').dataset.previewHtml;"); await printer.send('Page.setDocumentContent', { frameId: tree.frameTree.frame.id, html: document }); await printer.evaluate('await document.fonts.ready;'); assert.deepEqual(await printer.evaluate(`window.persistSvg=document.querySelector('[data-print-section=diagram] svg');${probe}`), expected); const pdf = await printer.send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true }); await writeFile(path.join(output, `persisted-${key}.pdf`), Buffer.from(pdf.data, 'base64')); }
    } finally { await printer.send('Page.close'); printer.close(); }
  });
  await test('network edits keep valid layouts and IDs without restoring removed devices or old IP configuration', async () => {
    await closeStudio(); await page.evaluate("store.getState().setIfaceIp('A','eth0','192.168.99.1/24');store.getState().deleteDevice('C');store.getState().addDeviceAt('host',{x:900,y:400});store.getState().refresh();"); const expectedNetwork = await page.evaluate('return studioProject();');
    await openStudio(); assert(!(await metrics()).cards.some(c => c.id === 'C')); assert((await metrics()).cards.find(c => c.id === 'A').text.join(' ').includes('192.168.99.1')); assert.equal(await page.evaluate('return studioProject();'), expectedNetwork); await closeStudio();
  });
}
