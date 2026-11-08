import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function runStudioDistanceFlipReview({ page, root, report, downloads, openPage, database }) {
  const out = path.join(root, '.playwright-mcp/reviews/studio-distance-flip-hover'), refs = path.join(out, 'referencias-chatgpt'); await mkdir(refs, { recursive: true });
  const delay = ms => new Promise(r => setTimeout(r, ms));
  const wait = async expression => { for (let n = 0; n < 250; n++) { if (await page.evaluate(`return !!(${expression});`)) return; await delay(40); } throw Error('Distance/flip timeout: ' + expression); };
  const ready = async () => { await delay(130); await wait("document.querySelector('.topology-studio iframe')?.contentDocument?.querySelector('[data-device]')&&!document.querySelector('[data-studio-print]').disabled"); };
  const click = async selector => { await page.evaluate(`const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)throw Error('Unavailable '+${JSON.stringify(selector)});e.click();`); await delay(100); };
  const select = async (selector, value) => { await page.evaluate(`const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(String(value))};e.dispatchEvent(new Event('change',{bubbles:true}));`); await ready(); };
  const shot = async (name, final = true) => { const s = await page.send('Page.captureScreenshot', { format: 'png' }); await writeFile(path.join(final ? refs : out, name + '.png'), Buffer.from(s.data, 'base64')); };
  const test = async (name, run) => { try { await run(); report.results['studio distance/flip: ' + name] = { passed: true }; } catch (e) { await shot('failure', false).catch(() => {}); report.results['studio distance/flip: ' + name] = { passed: false, error: e.stack }; throw e; } };
  const init = async () => { await page.evaluate(`window.store=(await import('/src/store.ts')).useStore;window.sim=(await import('/src/sim.ts')).sim;(await import('/src/i18n/index.ts')).useLanguage.getState().setLanguage('en');window.studioProject=()=>{const d=structuredClone(store.getState().captureWorkspaceDocument());if(d.topology.ui)delete d.topology.ui.topologyStudio;return JSON.stringify(d);};window.ws=await(await import('/src/workspace/reviewEntry.tsx')).mountWorkspaceReview(document.getElementById('root'),{databaseName:${JSON.stringify(database)}});`); await wait("document.querySelector('.react-flow')"); };
  const open = async () => { await page.evaluate("[...document.querySelectorAll('.toolbar-menu-trigger')].find(e=>e.textContent.trim()==='File').click();"); await click('.toolbar-menu-action[aria-haspopup=menu]'); await click('[data-open-topology-studio]'); await ready(); await select('[data-studio-zoom]', 'page'); await click('[data-studio-maximize]'); };
  const close = async () => { await click('.studio-header button[aria-label=Close]'); await wait("!document.querySelector('.topology-studio')"); };
  const probe = `const s=window.reviewSvg??document.querySelector('.topology-studio iframe').contentDocument.querySelector('svg');return {cards:[...s.querySelectorAll('[data-device]')].map(g=>({id:g.dataset.device,x:+g.dataset.x,y:+g.dataset.y,width:+g.dataset.width,height:+g.dataset.height,manual:g.dataset.manual,text:[...g.querySelectorAll('text')].map(t=>t.textContent)})),links:[...s.querySelectorAll('[data-link]')].map(g=>[g.dataset.link,...['points','x1','x2','y1','y2'].map(a=>g.getAttribute(a))]),labels:[...s.querySelectorAll('[data-cable-label]')].map(g=>g.textContent),tables:[...s.querySelectorAll('[data-document-block]')].map(g=>[g.dataset.documentBlock,g.dataset.x,g.dataset.y,g.dataset.width,g.dataset.height,g.textContent])};`;
  const metrics = () => page.evaluate(probe), centre = c => ({ x: c.x + c.width / 2, y: c.y + c.height / 2 });
  const setFixture = async scene => {
    if (await page.evaluate("return !!document.querySelector('.topology-studio');")) await close();
    await page.evaluate(`const d=(await import('/src/export/studio/blocks.fixture.ts')).blocksFixture('four');if(${JSON.stringify(scene)}!=='four'){d.topology.devices=d.topology.devices.filter(d=>['A','B','C'].includes(d.id));d.topology.links=[{id:'AB',a:['A','eth1'],b:['B','eth1']},{id:'BC',a:['B','eth2'],b:['C','eth1']}];}const r=await ws.controller.openDocument(d);if(!r.ok)throw Error(JSON.stringify(r));store.getState().setPaused(true);window.distanceSnapshot=(await import('/src/export/studio/model.ts')).capturePrintSnapshot(sim.net,store.getState());window.distanceOptions=(await import('/src/export/studio/options.ts')).printPreset('clean',distanceSnapshot);distanceOptions.diagramScale=.5;distanceOptions.diagram.cableLabels=true;distanceOptions.title='NetLab · Guias e inversão vertical';`);
  };
  const seed = async (code = '') => {
    await page.evaluate(`${code};const s=(await import('/src/export/studio/pageLayouts.ts')).createPageSession(distanceOptions);store.getState().setStudioPresentation((await import('/src/studioPresentation.ts')).saveStudioPresentation(s,true),store.getState().topologyGeneration);`); await open();
  };
  const gesture = async (id, target, { cancel = false, capture, expectKind, enabled = true } = {}) => {
    await page.send('Page.bringToFront'); const before = await metrics(), card = before.cards.find(c => c.id === id), c = centre(card);
    const coords = `const f=document.querySelector('.topology-studio iframe'),g=f.contentDocument.querySelector('[data-device="${id}"]'),r=g.getBoundingClientRect(),fr=f.getBoundingClientRect(),k=fr.width/f.offsetWidth;return{x:fr.x+(r.x+r.width/2)*k,y:fr.y+(r.y+r.height/2)*k,k:k*g.ownerSVGElement.getScreenCTM().a};`;
    let p = await page.evaluate(coords); await page.evaluate(`const s=document.querySelector('.studio-preview-stage'),r=s.getBoundingClientRect();s.scrollTop+=Math.max(0,${p.y}-r.bottom+50)+Math.min(0,${p.y}-r.top-50);s.scrollLeft+=Math.max(0,${p.x}-r.right+50)+Math.min(0,${p.x}-r.left-50);`); await delay(50); p = await page.evaluate(coords);
    const end = { x: p.x + (target.x - c.x) * p.k, y: p.y + (target.y - c.y) * p.k };
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y }); await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', buttons: 1, clickCount: 1 });
    for (let i = 1; i <= 6; i++) await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x + (end.x - p.x) * i / 6, y: p.y + (end.y - p.y) * i / 6, buttons: 1 }); await delay(90);
    const live = await metrics(), guides = await page.evaluate("return [...document.querySelector('.topology-studio iframe').contentDocument.querySelectorAll('[data-distance-guide]')].map(t=>({kind:t.dataset.distanceGuide,axis:t.dataset.distanceAxis,text:t.textContent}));");
    assert.deepEqual(live.cards.filter(c => c.id !== id), before.cards.filter(c => c.id !== id)); assert.deepEqual(live.tables, before.tables);
    if (expectKind) assert(guides.some(g => g.kind === expectKind), JSON.stringify({ guides, target, live }));
    if (!enabled) { assert.equal(guides.length, 0); assert(Math.abs(centre(live.cards.find(c => c.id === id)).x - target.x) < .02); }
    if (capture) await shot(capture);
    if (cancel) { await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' }); await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape' }); }
    await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...end, button: 'left', buttons: 0, clickCount: 1 }); await ready();
    assert.equal(await page.evaluate("return document.querySelector('.topology-studio iframe').contentDocument.querySelectorAll('[data-distance-guide],[data-alignment-axis]').length;"), 0);
    if (cancel) assert.deepEqual(await metrics(), before); return { live, guides };
  };
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1100, deviceScaleFactor: 1, mobile: false });
  let source, portrait, landscape, beforeFlip, afterFlip;
  await test('horizontal triangle symmetry, numeric document distances, zooms and disabled guides', async () => {
    await setFixture('triangle'); await seed(`distanceOptions.names.C='R3 · Distribution';const l=(await import('/src/export/studio/diagram.ts')).studioLayout(distanceSnapshot,distanceOptions,'en'),a=l.page.area;distanceOptions.devicePositions={A:{x:a.width*.2,y:a.y+a.height*.25},B:{x:a.width*.5,y:a.y+a.height*.75},C:{x:a.width*.8+24,y:a.y+a.height*.25+15}};`); source = await page.evaluate('return studioProject();');
    const values = [];
    for (const zoom of ['page', '0.5', '1', '1.25']) {
      await select('[data-studio-zoom]', zoom); const m = await metrics(), a = centre(m.cards.find(c => c.id === 'A')), b = centre(m.cards.find(c => c.id === 'B'));
      const r = await gesture('C', { x: 2 * b.x - a.x + 2, y: a.y + 2 }, { cancel: true, expectKind: 'symmetry', capture: zoom === 'page' ? '01-simetria-horizontal-durante-arraste' : undefined });
      const actual = centre(r.live.cards.find(c => c.id === 'C')); assert(Math.abs(actual.x - (2 * b.x - a.x)) < .01); assert(Math.abs(actual.y - a.y) < .01); values.push(r.guides[0].text);
    }
    assert(values.every(v => v === values[0])); await select('[data-studio-zoom]', 'page'); await click('[data-studio-alignment-guides]'); const m = await metrics(), a = centre(m.cards.find(c => c.id === 'A')), b = centre(m.cards.find(c => c.id === 'B'));
    await gesture('C', { x: 2 * b.x - a.x + 2, y: a.y + 2 }, { cancel: true, enabled: false }); assert.equal(await page.evaluate('return studioProject();'), source);
  });
  await test('equal edge spacing for unequal cards and an existing row of three', async () => {
    await setFixture('row'); await seed(`distanceOptions.names.B='R2 · Router com nome maior';const l=(await import('/src/export/studio/diagram.ts')).studioLayout(distanceSnapshot,distanceOptions,'en'),a=l.page.area,w=l.documentCards;const y=a.y+a.height/2,gap=70;distanceOptions.devicePositions={A:{x:70+w[0].width/2,y},B:{x:70+w[0].width+gap+w[1].width/2,y},C:{x:70+w[0].width+gap+w[1].width+gap+w[2].width/2+20,y:y+12}};`);
    const m = await metrics(), a = m.cards.find(c => c.id === 'A'), b = m.cards.find(c => c.id === 'B'), c = m.cards.find(c => c.id === 'C'), gap = b.x - a.x - a.width;
    const r = await gesture('C', { x: b.x + b.width + gap + c.width / 2 + 2, y: centre(a).y + 2 }, { cancel: true, expectKind: 'spacing', capture: '02-espacamentos-iguais-bordas-reais' });
    assert.equal(r.guides[0].text, '70 px ↔ 70 px');
  });
  await test('vertical cascade flip preserves x, tables, cables and other paper layouts; twice returns exact original coordinates', async () => {
    await setFixture('four'); await seed('distanceOptions.orientation="portrait";distanceOptions.diagram.ipv4=true;distanceOptions.diagram.interfaces=true;');
    source = await page.evaluate('return studioProject();'); await select('[data-studio-orientation]', 'landscape'); landscape = await metrics(); await select('[data-studio-orientation]', 'portrait');
    beforeFlip = await metrics(); await shot('03-cascata-antes-da-inversao'); await click('[data-studio-flip-vertical]'); await ready(); afterFlip = await metrics(); await shot('04-cascata-espelhada-verticalmente');
    const sum = Math.min(...beforeFlip.cards.map(c => c.y)) + Math.max(...beforeFlip.cards.map(c => c.y + c.height));
    afterFlip.cards.forEach((c, i) => { const before = beforeFlip.cards[i]; assert(Math.abs(c.x - before.x) < 1e-9); assert(Math.abs(centre(c).y - (sum - centre(before).y)) < 1e-9); assert.deepEqual(c.text, before.text); });
    assert.notDeepEqual(afterFlip.links, beforeFlip.links); assert.deepEqual(afterFlip.tables, beforeFlip.tables);
    await click('[data-studio-flip-vertical]'); await ready(); assert.deepEqual(await metrics(), beforeFlip); await shot('05-dupla-inversao-posicoes-originais');
    await click('[data-studio-flip-vertical]'); await ready(); assert.deepEqual(await metrics(), afterFlip);
    await select('[data-studio-orientation]', 'landscape'); assert.deepEqual(await metrics(), landscape); await select('[data-studio-orientation]', 'portrait'); portrait = await metrics(); assert.deepEqual(portrait, afterFlip); assert.equal(await page.evaluate('return studioProject();'), source);
  });
  await test('flip survives close, F5, Topology JSON import and remains manually editable', async () => {
    await close(); await open(); assert.deepEqual(await metrics(), portrait); assert((await page.evaluate('return ws.controller.flush();')).ok);
    await close(); await page.send('Page.reload'); await wait("document.readyState==='complete'&&document.getElementById('root')"); await init(); await open(); assert.deepEqual(await metrics(), portrait); await shot('06-inversao-restaurada-apos-f5');
    const json = await page.evaluate('return JSON.stringify(store.getState().captureWorkspaceDocument());'); await writeFile(path.join(out, 'topology-with-flip.json'), json); await close();
    assert((await page.evaluate(`return ws.controller.openDocument(JSON.parse(${JSON.stringify(json)}));`)).ok); await open(); assert.deepEqual(await metrics(), portrait); assert.equal(await page.evaluate('return studioProject();'), source);
    const c = centre(portrait.cards.find(c => c.id === 'D')); await gesture('D', { x: c.x + 8, y: c.y + 10 }, { cancel: true });
  });
  await test('SVG PNG HTML and printed A4 portrait match the recovered flip without temporary measurements', async () => {
    for (const kind of ['svg', 'png', 'html']) {
      const n = report.downloads.length; page.labelDownloads('distance-flip-' + kind); await click(`[data-studio-export=${kind}]`); for (let i = 0; i < 150 && report.downloads.length === n; i++) await delay(40); assert.equal(report.downloads.length, n + 1); await page.drainDownloads();
      const bytes = await readFile(path.join(downloads, report.downloads.at(-1).guid)); await writeFile(path.join(out, 'flipped.' + kind), bytes);
      if (kind === 'svg') { const text = bytes.toString(); assert(!text.includes('data-distance-guide')); assert.deepEqual(await page.evaluate(`window.reviewSvg=new DOMParser().parseFromString(${JSON.stringify(text)},'image/svg+xml').documentElement;${probe}`), portrait); await page.evaluate('delete window.reviewSvg;'); }
    }
    const printer = await openPage();
    try {
      const tree = await printer.send('Page.getFrameTree'), html = await page.evaluate("return document.querySelector('.topology-studio iframe').dataset.previewHtml;"); await printer.send('Page.setDocumentContent', { frameId: tree.frameTree.frame.id, html }); await printer.evaluate('await document.fonts.ready;'); assert.deepEqual(await printer.evaluate(`window.reviewSvg=document.querySelector('svg');${probe}`), portrait);
      const pdf = await printer.send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true }); await writeFile(path.join(out, 'flipped-A4-portrait.pdf'), Buffer.from(pdf.data, 'base64'));
      const svg = await readFile(path.join(out, 'flipped.svg'), 'utf8'), png = await readFile(path.join(out, 'flipped.png')); await printer.send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1100, deviceScaleFactor: 1, mobile: false });
      await printer.send('Page.setDocumentContent', { frameId: tree.frameTree.frame.id, html: `<!doctype html><meta charset="utf-8"><style>body{margin:20px;background:#e4e8ec;font:18px Arial}main{display:grid;grid-template-columns:1fr 1fr;gap:20px}section{min-width:0;background:#fff;padding:18px}h2{font-size:18px}svg,img{width:100%;height:auto}</style><main><section><h2>Prévia recuperada · inversão vertical</h2>${svg}</section><section><h2>PNG exportado</h2><img src="data:image/png;base64,${png.toString('base64')}"></section></main>` }); await printer.evaluate('await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()));'); const image = await printer.send('Page.captureScreenshot', { format: 'png' }); await writeFile(path.join(refs, '07-previa-invertida-e-png-exportado.png'), Buffer.from(image.data, 'base64'));
    } finally { await printer.send('Page.close'); printer.close(); }
  });
  await test('visible areas block flip safely; routing tables stay fixed and show overlap warnings', async () => {
    await close(); await page.evaluate("store.getState().setPendingMarkingRect({x:0,y:0,width:600,height:800});store.getState().createFreeMarking({name:'Área preservada',color:'blue',intensity:18});store.getState().refresh();"); await open(); await click('[data-studio-diagram-option=areas]'); await ready(); assert(await page.evaluate("return document.querySelector('[data-studio-flip-vertical]').disabled&&!!document.querySelector('[data-studio-flip-limit]');"));
    await click('[data-studio-diagram-option=areas]'); await ready(); assert(!await page.evaluate("return document.querySelector('[data-studio-flip-vertical]').disabled;"));
    await close(); await setFixture('four'); await seed(`distanceOptions.orientation='portrait';const mod=await import('/src/export/studio/diagram.ts'),l=mod.studioLayout(distanceSnapshot,distanceOptions,'en'),r=l.documentCards[l.boxes.findIndex(c=>c.device.id==='D')],sum=Math.min(...l.documentCards.map(c=>c.y))+Math.max(...l.documentCards.map(c=>c.y+c.height));const t=(await import('/src/export/studio/routingBlocks.ts')).newRoutingBlock(distanceSnapshot.devices.find(d=>d.id==='D'),'table-D');t.position={x:r.x,y:sum-r.y-r.height};distanceOptions.routingBlocks=[t];`);
    const m = await metrics(); await click('[data-studio-flip-vertical]'); await ready(); assert.deepEqual((await metrics()).tables, m.tables); assert(await page.evaluate("return !!document.querySelector('[data-studio-device-warning],[data-studio-block-warning=overlap]');")); await close();
  });
  await writeFile(path.join(out, 'geometry-comparison.json'), JSON.stringify({ beforeFlip, afterFlip, portrait, landscape }, null, 2));
}
