import { reopenStudio } from './studio-review-reopen.mjs';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function runTopologyPageLayoutsReview({ page, root, report, downloads, openPage }) {
  const output = path.join(root, '.playwright-mcp/reviews/topology-page-layouts'), references = path.join(output, 'referencias-chatgpt');
  await mkdir(references, { recursive: true });
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const ready = async () => { await delay(150); for (let n = 0; n < 200; n++) { if (await page.evaluate("return !!document.querySelector('.topology-studio iframe')?.contentDocument?.querySelector('[data-device]')&&!document.querySelector('[data-studio-print]').disabled;")) return; await delay(40); } throw Error('Page variant preview not ready'); };
  const click = async (selector, text) => { await page.evaluate(`const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>${text ? `e.textContent.trim()===${JSON.stringify(text)}` : 'true'});if(!e)throw Error('Missing '+${JSON.stringify(selector)});e.click();`); await delay(140); };
  const select = async (selector, value) => { await page.evaluate(`const e=document.querySelector(${JSON.stringify(selector)});if(![...e.options].some(o=>o.value===${JSON.stringify(String(value))}))throw Error('Invalid option');e.value=${JSON.stringify(String(value))};e.dispatchEvent(new Event('change',{bubbles:true}));`); await ready(); };
  const shot = async (name, reference = true) => { await ready(); const r = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); await writeFile(path.join(reference ? references : output, name + '.png'), Buffer.from(r.data, 'base64')); };
  const test = async (name, fn) => { try { await fn(); report.results['studio page layouts: ' + name] = { passed: true }; } catch (error) { report.results['studio page layouts: ' + name] = { passed: false, error: error.stack }; await shot('failure', false).catch(() => {}); throw error; } };
  const probe = `const s=window.variantSvg??document.querySelector('.topology-studio iframe').contentDocument.querySelector('[data-print-section=diagram] svg');return{viewBox:s.getAttribute('viewBox'),transform:s.querySelector('[data-topology]').getAttribute('transform'),area:{x:+s.dataset.contentX,y:+s.dataset.contentY,width:+s.dataset.contentWidth,height:+s.dataset.contentHeight},cards:[...s.querySelectorAll('[data-device]')].map(g=>({id:g.dataset.device,x:+g.dataset.x,y:+g.dataset.y,width:+g.dataset.width,height:+g.dataset.height,manual:g.dataset.manual})),links:[...s.querySelectorAll('[data-link]')].map(g=>[g.dataset.link,...['points','x1','y1','x2','y2'].map(a=>g.getAttribute(a))]),labels:[...s.querySelectorAll('[data-cable-label]')].map(g=>[g.dataset.cableLabel,g.textContent]),tables:[...s.querySelectorAll('[data-document-block]')].map(g=>({id:g.dataset.documentBlock,device:g.dataset.blockDevice,x:+g.dataset.x,y:+g.dataset.y,width:+g.dataset.width,height:+g.dataset.height,scale:+g.dataset.scale,baseWidth:+g.dataset.baseWidth,text:g.textContent})),warning:document.querySelector('[data-studio-block-warning],[data-studio-device-warning]')?.textContent??null};`;
  // Warnings belong to the UI rather than the exported SVG.
  const printable = m => { const { warning, ...result } = m; return result; };
  const metrics = () => page.evaluate(probe), settings = id => `[data-studio-block-settings="${id}"]`;
  const sourceUnchanged = async () => assert.equal(await page.evaluate('return studioProject();'), await page.evaluate('return variantSource;'));
  const open = async () => {
    if (await page.evaluate("return !!document.querySelector('.topology-studio');")) await click('.studio-header button[aria-label=Close]');
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1100, deviceScaleFactor: 1, mobile: false });
    await page.evaluate("lang.getState().setLanguage('en');theme.getState().setTheme('graphite-dark');for(const d of sim.net.devices.values())for(const i of d.interfaces)if(i.ip&&i.ipv4Mode==='unconfigured')i.configureIpv4({mode:'static',ip:i.ip,gateway:i.gateway,dns:i.dns});store.getState().refresh();const f=await import('/src/export/studio/blocks.fixture.ts'),doc=f.blocksFixture('four');for(const d of doc.topology.devices){d.x*=2.2;d.y*=2.2;}const r=await ws.controller.openDocument(doc);if(!r.ok)throw Error(JSON.stringify(r.error));await ws.controller.flush();window.variantSource=studioProject();");
    await click('.toolbar-menu-trigger', 'File'); await click('.toolbar-menu-action[aria-haspopup=menu]'); await click('[data-open-topology-studio]'); await ready();
    await select('[data-studio-diagram-scale]', '0.5'); await select('[data-studio-zoom]', 'page'); await click('[data-studio-maximize]');
  };
  const switchPage = async (paper, orientation) => { await select('[data-studio-paper]', paper); await select('[data-studio-orientation]', orientation); };
  const blockPosition = async (id, x, y) => {
    await page.evaluate(`document.querySelector('${settings(id)} [data-block-advanced]').open=true;`);
    for (const [axis, value] of [['x', x], ['y', y]]) { await page.evaluate(`const e=document.querySelector('${settings(id)} [data-block-${axis}]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(String(value * 25.4 / 96))});e.dispatchEvent(new Event('input',{bubbles:true}));`); await ready(); }
  };
  const gesture = async (selector, dx, dy, mode = 'device', cancel = false) => {
    await page.send('Page.bringToFront');
    const coords = `const f=document.querySelector('.topology-studio iframe'),g=f.contentDocument.querySelector(${JSON.stringify(selector)}),r=g.getBoundingClientRect(),fr=f.getBoundingClientRect(),k=fr.width/f.offsetWidth;return{x:fr.x+(r.x+${mode === 'width' || mode === 'scale' ? 'r.width-9' : 'r.width/2'})*k,y:fr.y+(r.y+${mode === 'scale' ? 'r.height-9' : mode === 'block' ? '12' : 'r.height/2'})*k,k:k*g.ownerSVGElement.getScreenCTM().a};`;
    let p = await page.evaluate(coords); await page.evaluate(`const s=document.querySelector('.studio-preview-stage'),r=s.getBoundingClientRect();s.scrollLeft+=Math.max(0,${p.x}-r.right+35)+Math.min(0,${p.x}-r.left-35);s.scrollTop+=Math.max(0,${p.y}-r.bottom+35)+Math.min(0,${p.y}-r.top-35);`); await delay(70); p = await page.evaluate(coords);
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y }); await delay(60); await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', buttons: 1, clickCount: 1 });
    for (let i = 1; i <= 5; i++) await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x + dx * p.k * i / 5, y: p.y + dy * p.k * i / 5, buttons: 1 }); await delay(80);
    assert(await page.evaluate(`return !!document.querySelector('.topology-studio iframe').contentDocument.querySelector('[data-${mode === 'device' ? 'device-dragging' : mode === 'width' ? 'resizing' : mode === 'scale' ? 'scaling' : 'dragging'}=true]');`));
    const live = await metrics(), guides = await page.evaluate("return document.querySelector('.topology-studio iframe').contentDocument.querySelectorAll('[data-alignment-axis]').length;");
    assert(await page.evaluate("return document.querySelector('[data-studio-export=svg]').disabled;"));
    if (cancel) for (const type of ['keyDown', 'keyUp']) await page.send('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x + dx * p.k, y: p.y + dy * p.k, button: 'left', buttons: 0, clickCount: 1 }); await ready(); await sourceUnchanged(); return { live, guides };
  };
  const add = async device => { await page.evaluate("document.querySelector('[data-studio-add-block-panel]').open=true;"); await select('[data-studio-block-device]', device); await click('[data-studio-add-block]'); await ready(); return (await metrics()).tables.at(-1).id; };
  const arrangeTables = async ids => {
    for (const [i, id] of ids.entries()) { const m = await metrics(), t = m.tables.find(t => t.id === id); await blockPosition(id, i === 0 ? m.area.x + 8 : m.area.x + m.area.width - t.width - 8, m.area.y + m.area.height - t.height - 12); }
  };
  let ids, landscape, portrait, a3Landscape, a3Portrait;
  await test('A4 landscape edits survive a first independent portrait and exact round trips', async () => {
    await open(); const initial = await metrics(); await gesture('[data-device="B"]', 24, -15); await gesture('[data-device="D"]', 0, 18);
    ids = [await add('A'), await add('D')]; await arrangeTables(ids); await gesture(`[data-document-block="${ids[0]}"]`, 20, 0, 'width'); await gesture(`[data-document-block="${ids[1]}"]`, -15, -8, 'scale');
    landscape = await metrics(); assert(!landscape.warning); await shot('01-a4-querformat-ajustado');
    await switchPage('A4', 'portrait'); const first = await metrics(); assert(first.cards.every(c => c.manual === 'false')); assert(first.tables.every(t => t.baseWidth === 300 && t.scale === 1)); assert.equal(first.warning, null); assert(await page.evaluate("return document.querySelector('[data-studio-undo-compact]').disabled;"));
    await shot('02-a4-hochformat-primeira-abertura');
    const expected = await page.evaluate("const s=(await import('/src/export/studio/model.ts')).capturePrintSnapshot(sim.net,store.getState()),o=(await import('/src/export/studio/options.ts')).printPreset('clean',s);o.orientation='portrait';o.diagramScale=.5;const l=(await import('/src/export/studio/diagram.ts')).studioLayout(s,o,'en');return l.documentCards.map((r,i)=>({id:l.boxes[i].device.id,x:r.x,y:r.y,width:r.width,height:r.height,manual:'false'}));"); assert.deepEqual(first.cards, expected);
    await gesture('[data-device="B"]', -18, 12); await gesture('[data-device="D"]', 12, -8); await arrangeTables(ids); await select(`${settings(ids[0])} [data-block-scale-select]`, '0.85');
    portrait = await metrics(); assert(!portrait.warning); await shot('03-a4-hochformat-ajustado');
    await switchPage('A4', 'landscape'); assert.deepEqual(await metrics(), landscape); await shot('04-a4-querformat-restaurado');
    await switchPage('A4', 'portrait'); assert.deepEqual(await metrics(), portrait); assert.notDeepEqual(initial.cards, landscape.cards); await sourceUnchanged();
  });
  await test('A3 has its own initial layouts, table widths/scales and exact recovery', async () => {
    await switchPage('A3', 'landscape'); let m = await metrics(); assert(m.cards.every(c => c.manual === 'false')); assert(m.tables.every(t => t.baseWidth === 300 && t.scale === 1)); assert(!m.warning);
    await gesture('[data-device="B"]', 20, -12); await arrangeTables(ids); await gesture(`[data-document-block="${ids[0]}"]`, 42, 0, 'width'); a3Landscape = await metrics();
    await switchPage('A3', 'portrait'); m = await metrics(); assert(m.cards.every(c => c.manual === 'false')); assert(m.tables.every(t => t.baseWidth === 300 && t.scale === 1));
    await gesture('[data-device="D"]', 16, 10); await arrangeTables(ids); await select(`${settings(ids[1])} [data-block-scale-select]`, '0.85'); a3Portrait = await metrics();
    for (const [paper, orientation, saved] of [['A4', 'landscape', landscape], ['A3', 'landscape', a3Landscape], ['A4', 'portrait', portrait], ['A3', 'portrait', a3Portrait]]) { await switchPage(paper, orientation); assert.deepEqual(await metrics(), saved); }
  });
  await test('compaction undo, guides, Escape, zoom and maximize remain local to the active format', async () => {
    await switchPage('A4', 'portrait'); const before = await metrics(); await click('[data-studio-compact]'); await ready(); const compacted = await metrics(); assert.notDeepEqual(compacted.cards, before.cards); assert.deepEqual(compacted.tables, before.tables);
    await switchPage('A4', 'landscape'); assert.deepEqual(await metrics(), landscape); assert(await page.evaluate("return document.querySelector('[data-studio-undo-compact]').disabled;"));
    await click('[data-studio-compact]'); await ready(); const compactLandscape = await metrics(); assert.notDeepEqual(compactLandscape.cards, landscape.cards);
    await switchPage('A4', 'portrait'); assert.deepEqual(await metrics(), compacted); await click('[data-studio-undo-compact]'); await ready(); assert.deepEqual(await metrics(), before);
    for (const zoom of ['page', '0', '0.5', '1', '1.25']) { await select('[data-studio-zoom]', zoom); assert.deepEqual(await metrics(), before); await gesture('[data-device="PC-A"]', 14, 9, 'device', true); assert.deepEqual(await metrics(), before); }
    await select('[data-studio-zoom]', 'page'); await click('[data-studio-maximize]'); const snap = await gesture('[data-device="PC-A"]', 0, 2, 'device', true); assert(snap.guides > 0); assert.deepEqual(await metrics(), before); await click('[data-studio-maximize]');
    await switchPage('A4', 'landscape'); assert.deepEqual(await metrics(), compactLandscape); await click('[data-studio-undo-compact]'); await ready(); assert.deepEqual(await metrics(), landscape);
  });
  await test('shared filters and block addition/removal preserve independent saved geometry', async () => {
    await switchPage('A4', 'portrait'); const geometry = (await metrics()).tables.map(({ text, height, ...t }) => t);
    await select(`${settings(ids[1])} [data-block-filter]`, 'static');
    const third = await add('B'); assert.equal((await metrics()).tables.length, 3);
    await switchPage('A4', 'landscape'); assert.equal((await metrics()).tables.length, 3); assert.equal(await page.evaluate(`return document.querySelector('${settings(ids[1])} [data-block-filter]').value;`), 'static');
    assert.deepEqual((await metrics()).tables.filter(t => ids.includes(t.id)).map(({ text, height, ...t }) => t), landscape.tables.map(({ text, height, ...t }) => t));
    await click(`${settings(third)} [data-block-remove]`); await ready();
    await switchPage('A4', 'portrait'); assert.deepEqual((await metrics()).tables.map(({ text, height, ...t }) => t), geometry);
    await select(`${settings(ids[1])} [data-block-filter]`, 'all'); portrait = await metrics();
    await switchPage('A4', 'landscape'); assert.deepEqual(await metrics(), landscape);
  });
  await test('SVG PNG HTML and all four printed PDFs use their active saved layout without UI overlays', async () => {
    await switchPage('A4', 'portrait'); assert.deepEqual(await metrics(), portrait);
    const expected = await metrics(), download = async kind => { const count = report.downloads.length; page.labelDownloads('page-layouts-' + kind); await click(`[data-studio-export=${kind}]`); for (let n = 0; n < 150 && report.downloads.length === count; n++) await delay(40); assert.equal(report.downloads.length, count + 1); await page.drainDownloads(); const bytes = await readFile(path.join(downloads, report.downloads.at(-1).guid)); await writeFile(path.join(output, 'final.' + kind), bytes); return bytes; };
    const svg = (await download('svg')).toString('utf8'), png = await download('png'), html = (await download('html')).toString('utf8'); assert(html.includes(svg)); assert(!svg.includes('data-alignment-axis')); assert(!svg.includes('data-studio-block-ui'));
    const actual = await page.evaluate(`window.variantSvg=new DOMParser().parseFromString(${JSON.stringify(svg)},'image/svg+xml').documentElement;const r=await(async()=>{${probe}})();delete window.variantSvg;return r;`); assert.deepEqual(printable(actual), printable(expected));
    const printer = await openPage(); try {
      await printer.send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1120, deviceScaleFactor: 1, mobile: false }); const tree = await printer.send('Page.getFrameTree');
      const comparison = `<!doctype html><meta charset="utf-8"><style>body{margin:20px;background:#e4e8ec;font:18px Arial;color:#1e293b}main{display:grid;grid-template-columns:1fr 1fr;gap:20px}section{min-width:0;background:white;padding:18px}h2{font-size:18px}svg,img{width:100%;height:auto}</style><main><section><h2>Prévia · A4 Hochformat ajustado</h2>${svg}</section><section><h2>PNG exportado · mesmas posições</h2><img src="data:image/png;base64,${png.toString('base64')}"></section></main>`;
      await printer.send('Page.setDocumentContent', { frameId: tree.frameTree.frame.id, html: comparison }); await printer.evaluate('await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()));'); const shot = await printer.send('Page.captureScreenshot', { format: 'png' }); await writeFile(path.join(references, '05-previa-exportacao-a4-hochformat.png'), Buffer.from(shot.data, 'base64'));
      for (const [paper, orientation, saved] of [['A4', 'landscape', landscape], ['A4', 'portrait', portrait], ['A3', 'landscape', a3Landscape], ['A3', 'portrait', a3Portrait]]) {
        await switchPage(paper, orientation); const current = await metrics(); assert.deepEqual(current, saved); const html = await page.evaluate("return document.querySelector('.topology-studio iframe').dataset.previewHtml;");
        await printer.send('Page.setDocumentContent', { frameId: tree.frameTree.frame.id, html }); await printer.evaluate('await document.fonts.ready;');
        assert.deepEqual(printable(await printer.evaluate(`window.variantSvg=document.querySelector('[data-print-section=diagram] svg');${probe}`)), printable(current));
        const pdf = await printer.send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true }); await writeFile(path.join(output, `final-${paper}-${orientation}.pdf`), Buffer.from(pdf.data, 'base64'));
      }
    } finally { await printer.send('Page.close'); printer.close(); }
    await sourceUnchanged();
  });
  await test('restore, presets, global changes and refresh revalidate without deleting other variants', async () => {
    await switchPage('A4', 'portrait'); const before = await metrics(); await gesture('[data-device="B"]', 0, 0); await click('[data-studio-restore-device]'); await ready(); assert.equal((await metrics()).cards.find(c => c.id === 'B').manual, 'false');
    await switchPage('A4', 'landscape'); assert.deepEqual(await metrics(), landscape); await switchPage('A4', 'portrait');
    await click('[data-studio-restore-devices]'); await ready(); assert((await metrics()).cards.every(c => c.manual === 'false'));
    const blocksBefore = (await metrics()).tables; await click('[data-studio-reset-blocks]'); await ready();
    await switchPage('A4', 'landscape'); assert.deepEqual(await metrics(), landscape);
    for (const preset of ['technical', 'presentation', 'clean']) { await select('[data-studio-preset]', preset); assert.equal(await page.evaluate("return document.querySelector('[data-studio-orientation]').value;"), 'landscape'); }
    for (const [selector, value] of [['[data-studio-margin]', '20'], ['[data-studio-text]', 'large'], ['[data-studio-diagram-scale]', '0.6'], ['[data-studio-margin]', '15'], ['[data-studio-text]', 'normal'], ['[data-studio-diagram-scale]', '0.5']]) await select(selector, value);
    assert.deepEqual(await metrics(), landscape);
    await page.evaluate("store.getState().renameDevice('D','Zentralrouter D refreshed');await ws.controller.flush();window.variantSource=studioProject();"); await reopenStudio(page); await ready();
    for (const [paper, orientation, saved] of [['A4', 'landscape', landscape], ['A3', 'landscape', a3Landscape], ['A3', 'portrait', a3Portrait]]) {
      await switchPage(paper, orientation); const current = await metrics(); for (const card of saved.cards.filter(c => c.manual === 'true')) { const actual = current.cards.find(c => c.id === card.id); assert(Math.abs(actual.x + actual.width / 2 - card.x - card.width / 2) < .01); assert(Math.abs(actual.y + actual.height / 2 - card.y - card.height / 2) < .01); }
    }
    await sourceUnchanged(); assert.equal(blocksBefore.length, before.tables.length);
    await page.evaluate("store.getState().deleteDevice('B');await ws.controller.flush();window.variantSource=studioProject();"); await reopenStudio(page); await ready();
    for (const [paper, orientation] of [['A4', 'landscape'], ['A4', 'portrait'], ['A3', 'landscape'], ['A3', 'portrait']]) { await switchPage(paper, orientation); assert(!(await metrics()).cards.some(c => c.id === 'B')); }
    await sourceUnchanged();
  });
}
