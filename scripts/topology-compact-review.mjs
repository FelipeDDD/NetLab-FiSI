import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function runTopologyCompactReview({ page, root, report, downloads, openPage }) {
  const output = path.join(root, '.playwright-mcp/reviews/topology-compact');
  const references = path.join(output, 'referencias-chatgpt');
  await mkdir(references, { recursive: true });
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const ready = async () => { await delay(140); for (let n = 0; n < 200; n++) { if (await page.evaluate("return !!document.querySelector('.topology-studio iframe')?.contentDocument?.querySelector('[data-device]')&&!document.querySelector('[data-studio-print]').disabled;")) return; await delay(40); } throw Error('Compact preview not ready'); };
  const click = async (selector, text) => { await page.evaluate(`const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>${text ? `e.textContent.trim()===${JSON.stringify(text)}` : 'true'});if(!e)throw Error('Missing '+${JSON.stringify(selector)});e.click();`); await delay(160); };
  const select = async (selector, value) => { await page.evaluate(`const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(String(value))};e.dispatchEvent(new Event('change',{bubbles:true}));`); await ready(); };
  const shot = async name => { const r = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); await writeFile(path.join(output, name + '.png'), Buffer.from(r.data, 'base64')); };
  const test = async (name, fn) => { try { await fn(); report.results['studio compact: ' + name] = { passed: true }; } catch (error) { report.results['studio compact: ' + name] = { passed: false, error: error.stack }; await shot('failure').catch(() => {}); throw error; } };
  const probe = `const s=window.compactSvg??document.querySelector('.topology-studio iframe').contentDocument.querySelector('[data-print-section=diagram] svg');return {transform:s.querySelector('[data-topology]').getAttribute('transform'),area:{x:+s.dataset.contentX,y:+s.dataset.contentY,width:+s.dataset.contentWidth,height:+s.dataset.contentHeight},cards:[...s.querySelectorAll('[data-device]')].map(g=>({id:g.dataset.device,x:+g.dataset.x,y:+g.dataset.y,width:+g.dataset.width,height:+g.dataset.height,manual:g.dataset.manual})),links:[...s.querySelectorAll('[data-link]')].map(g=>[g.dataset.link,...['points','x1','y1','x2','y2'].map(a=>g.getAttribute(a))]),labels:[...s.querySelectorAll('[data-cable-label]')].map(g=>[g.dataset.cableLabel,g.textContent]),tables:[...s.querySelectorAll('[data-document-block]')].map(g=>[g.dataset.documentBlock,...['x','y','width','height','scale'].map(a=>g.dataset[a]),g.textContent])};`;
  const metrics = () => page.evaluate(probe);
  const sourceUnchanged = async () => assert.equal(await page.evaluate('return studioProject();'), await page.evaluate('return compactSource;'));
  const open = async (scene = 'four') => {
    if (await page.evaluate("return !!document.querySelector('.topology-studio');")) await click('.studio-header button[aria-label=Close]');
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1100, deviceScaleFactor: 1, mobile: false });
    await page.evaluate(`lang.getState().setLanguage('en');theme.getState().setTheme('graphite-dark');for(const d of sim.net.devices.values())for(const i of d.interfaces)if(i.ip&&i.ipv4Mode==='unconfigured')i.configureIpv4({mode:'static',ip:i.ip,gateway:i.gateway,dns:i.dns});store.getState().refresh();const f=await import('/src/export/studio/blocks.fixture.ts'),doc=f.blocksFixture('${scene}');for(const d of doc.topology.devices){d.x*=3;d.y*=3;}const r=await ws.controller.openDocument(doc);if(!r.ok)throw Error(JSON.stringify(r.error));await ws.controller.flush();window.compactSource=studioProject();`);
    await click('.toolbar-menu-trigger', 'File'); await click('.toolbar-menu-action[aria-haspopup=menu]'); await click('[data-open-topology-studio]'); await ready();
    await select('[data-studio-orientation]', 'portrait'); await select('[data-studio-zoom]', 'page');
  };
  const compare = async (name, html, width = 1400, height = 1050) => {
    const tab = await openPage(); try {
      await tab.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }); const tree = await tab.send('Page.getFrameTree');
      await tab.send('Page.setDocumentContent', { frameId: tree.frameTree.frame.id, html }); await tab.evaluate('await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()));');
      const r = await tab.send('Page.captureScreenshot', { format: 'png' }); await writeFile(path.join(references, name + '.png'), Buffer.from(r.data, 'base64')); await writeFile(path.join(output, name + '.html'), html);
    } finally { await tab.send('Page.close'); tab.close(); }
  };
  const svg = () => page.evaluate("return document.querySelector('.topology-studio iframe').dataset.previewHtml.match(/<svg[\\s\\S]*<\\/svg>/)[0];");
  await test('checkpoint 1: explicit compact operation and isolated undo in A4 portrait', async () => {
    await open(); const before = await metrics(), beforeSvg = await svg();
    assert(await page.evaluate("return document.querySelector('[data-studio-undo-compact]').disabled;"));
    await click('[data-studio-compact]'); await ready(); const after = await metrics(), afterSvg = await svg();
    assert.notDeepEqual(after.cards, before.cards); assert.equal(after.transform, before.transform); assert.deepEqual(after.tables, before.tables);
    assert.deepEqual(after.labels.map(l => l[1]), before.labels.map(l => l[1])); assert(after.cards.every(c => c.manual === 'false'));
    await compare('01-compactacao-a4-retrato-antes-depois', `<!doctype html><meta charset="utf-8"><style>body{background:#e4e8ec;margin:20px;font:18px Arial;color:#1e293b}main{display:grid;grid-template-columns:1fr 1fr;gap:20px}section{background:white;padding:18px;min-width:0}h2{font-size:18px}svg{width:100%;height:900px}</style><main><section><h2>Antes · A4 Hochformat · posições originais</h2>${beforeSvg}</section><section><h2>Depois · compactação conservadora · mesma escala</h2>${afterSvg}</section></main>`);
    await click('[data-studio-undo-compact]'); await ready(); assert.deepEqual(await metrics(), before); await sourceUnchanged();
    await click('[data-studio-compact]'); await ready(); assert.deepEqual(await metrics(), after);
    for (const paper of ['A4', 'A3']) for (const orientation of ['portrait', 'landscape']) {
      await select('[data-studio-paper]', paper); await select('[data-studio-orientation]', orientation); const stable = await metrics(), central = stable.cards.find(c => c.id === 'D');
      for (const id of ['A', 'B', 'C']) { const pc = stable.cards.find(c => c.id === 'PC-' + id), sw = stable.cards.find(c => c.id === 'SW-' + id), router = stable.cards.find(c => c.id === id); assert(pc.y < sw.y && sw.y < router.y && router.y < central.y); assert(Math.abs(pc.x + pc.width / 2 - sw.x - sw.width / 2) < .01); }
      await select('[data-studio-zoom]', '0.5'); await select('[data-studio-zoom]', 'page'); assert.deepEqual(await metrics(), stable);
    }
    await sourceUnchanged();
  });
  await test('checkpoint 1: tables are stationary and original positions are never rewritten', async () => {
    await open(); await select('[data-studio-diagram-scale]', '0.5');
    await page.evaluate("document.querySelector('[data-studio-add-block-panel]').open=true;"); await select('[data-studio-block-device]', 'D'); await click('[data-studio-add-block]'); await ready();
    const before = await metrics(); await click('[data-studio-compact]'); await ready(); const after = await metrics();
    assert.deepEqual(after.tables, before.tables); assert.notDeepEqual(after.cards, before.cards);
    await click('[data-studio-undo-compact]'); await ready(); assert.deepEqual(await metrics(), before); await sourceUnchanged();
  });
  await test('checkpoint 1: rendered geometry matrix preserves order, margins, areas and all real connections', async () => {
    const result = await page.evaluate(`const f=await import('/src/export/studio/geometry.fixture.ts'),d=await import('/src/export/studio/diagram.ts'),o=await import('/src/export/studio/options.ts'),c=await import('/src/export/studio/compactLayout.ts'),g=await import('/src/export/studio/geometry.ts');let cases=0,moved=0;const issues=[];for(const scene of f.geometryScenes)for(const paper of ['A4','A3'])for(const orientation of ['portrait','landscape'])for(const preset of ['clean','technical','presentation'])for(const textSize of ['small','normal','large']){const s=f.geometryFixture(scene);for(const device of s.devices){device.x*=3;device.y*=3;}const source=JSON.stringify(s),opts={...o.printPreset(preset,s),paper,orientation,textSize},before=d.studioLayout(s,opts,'en'),r=c.compactStudioLayout(s,opts,'en',before),after=d.studioLayout(s,{...opts,compactOffsets:r.positions},'en');cases++;moved+=r.moved.length;const key=[scene,paper,orientation,preset,textSize].join('/');if(JSON.stringify(s)!==source)issues.push(key+' source changed');if(JSON.stringify(after.cables.map(c=>c.link))!==JSON.stringify(before.cables.map(c=>c.link)))issues.push(key+' links changed');for(let i=0;i<after.documentCards.length;i++){const a=after.documentCards[i],old=before.documentCards[i];if(a.x<after.page.area.x-.1||a.y<after.page.area.y-.1||a.x+a.width>after.page.area.x+after.page.area.width+.1||a.y+a.height>after.page.area.y+after.page.area.height+.1)issues.push(key+' margins');for(let j=i+1;j<after.documentCards.length;j++){const b=after.documentCards[j],ob=before.documentCards[j];if(g.overlaps(a,b)&&!g.overlaps(old,ob))issues.push(key+' new overlap');for(const axis of ['x','y']){const delta=g.center(old)[axis]-g.center(ob)[axis];if(Math.abs(delta)>1&&(g.center(a)[axis]-g.center(b)[axis])*Math.sign(delta)<=0)issues.push(key+' inversion');}}}if(after.cables.some((c,i)=>c.obstructed&&!before.cables[i].obstructed))issues.push(key+' new obstruction');}return{cases,moved,issues};`);
    assert.equal(result.cases, 396); assert.deepEqual(result.issues, []); assert(result.moved > 0); await writeFile(path.join(output, 'compact-geometry.json'), JSON.stringify(result, null, 2));
  });
  if (process.env.NETLAB_STUDIO_COMPACT_CHECKPOINT === '1') return;
  const enabled = async value => { await page.evaluate(`const e=document.querySelector('[data-studio-alignment-guides]');if(e.checked!==${value})e.click();`); };
  const gesture = async (id, target, { cancel = false, referenceShot } = {}) => {
    await page.send('Page.bringToFront'); const before = await metrics(), card = before.cards.find(c => c.id === id);
    const coords = `const f=document.querySelector('.topology-studio iframe'),g=f.contentDocument.querySelector('[data-device="${id}"]'),r=g.getBoundingClientRect(),fr=f.getBoundingClientRect(),k=fr.width/f.offsetWidth;return{x:fr.x+(r.x+r.width/2)*k,y:fr.y+(r.y+r.height/2)*k,k:k*g.ownerSVGElement.getScreenCTM().a};`;
    let p = await page.evaluate(coords);
    await page.evaluate(`const e=document.querySelector('.studio-preview-stage'),r=e.getBoundingClientRect();e.scrollLeft+=Math.max(0,${p.x}-r.right+35)+Math.min(0,${p.x}-r.left-35);e.scrollTop+=Math.max(0,${p.y}-r.bottom+35)+Math.min(0,${p.y}-r.top-35);`); await delay(80); p = await page.evaluate(coords);
    const dx = (target.x - card.x - card.width / 2) * p.k, dy = (target.y - card.y - card.height / 2) * p.k;
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y }); await delay(60);
    await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', buttons: 1, clickCount: 1 });
    for (let i = 1; i <= 6; i++) await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x + dx * i / 6, y: p.y + dy * i / 6, buttons: 1 }); await delay(100);
    assert(await page.evaluate("return !!document.querySelector('.topology-studio iframe').contentDocument.querySelector('[data-device-dragging]');"), 'Native device drag remains active');
    const live = await metrics(), guides = await page.evaluate("return [...document.querySelector('.topology-studio iframe').contentDocument.querySelectorAll('[data-alignment-axis]')].map(e=>({axis:e.dataset.alignmentAxis,edge:e.dataset.alignmentEdge}));");
    assert(await page.evaluate("return document.querySelector('[data-studio-export=svg]').disabled;"));
    if (referenceShot) { const r = await page.send('Page.captureScreenshot', { format: 'png' }); await writeFile(path.join(references, referenceShot + '.png'), Buffer.from(r.data, 'base64')); }
    if (cancel) for (const type of ['keyDown', 'keyUp']) await page.send('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x + dx, y: p.y + dy, button: 'left', buttons: 0, clickCount: 1 }); await ready(); const after = await metrics();
    assert.deepEqual(after.cards.filter(c => c.id !== id), before.cards.filter(c => c.id !== id)); assert.deepEqual(after.tables, before.tables);
    assert.equal(await page.evaluate("return document.querySelector('.topology-studio iframe').contentDocument.querySelectorAll('[data-alignment-axis]').length;"), 0);
    if (cancel) assert.deepEqual(after, before); await sourceUnchanged(); return { before, live, after, guides, k: p.k };
  };
  const tableGesture = async (id, mode, dx, dy) => {
    const before = await metrics();
    const coords = `const f=document.querySelector('.topology-studio iframe'),g=f.contentDocument.querySelector('[data-document-block="${id}"]'),r=g.getBoundingClientRect(),fr=f.getBoundingClientRect(),k=fr.width/f.offsetWidth;return{x:fr.x+(r.x+${mode === 'move' ? 'r.width/2' : 'r.width-9'})*k,y:fr.y+(r.y+${mode === 'move' ? '12' : mode === 'width' ? 'r.height/2' : 'r.height-9'})*k,k:k*g.ownerSVGElement.getScreenCTM().a};`;
    let p = await page.evaluate(coords); await page.evaluate(`const s=document.querySelector('.studio-preview-stage'),r=s.getBoundingClientRect();s.scrollLeft+=Math.max(0,${p.x}-r.right+35)+Math.min(0,${p.x}-r.left-35);s.scrollTop+=Math.max(0,${p.y}-r.bottom+35)+Math.min(0,${p.y}-r.top-35);`); await delay(80); p = await page.evaluate(coords);
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y }); await delay(60); await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', buttons: 1, clickCount: 1 });
    for (let i = 1; i <= 5; i++) await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x + dx * p.k * i / 5, y: p.y + dy * p.k * i / 5, buttons: 1 }); await delay(80);
    assert(await page.evaluate(`return !!document.querySelector('.topology-studio iframe').contentDocument.querySelector('[data-${mode === 'move' ? 'dragging' : mode === 'width' ? 'resizing' : 'scaling'}=true]');`));
    assert.equal(await page.evaluate("return document.querySelector('.topology-studio iframe').contentDocument.querySelectorAll('[data-alignment-axis]').length;"), 0);
    await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x + dx * p.k, y: p.y + dy * p.k, button: 'left', buttons: 0, clickCount: 1 }); await ready();
    const after = await metrics(); assert.deepEqual(after.cards, before.cards); assert.deepEqual(after.links, before.links); assert.notDeepEqual(after.tables, before.tables);
  };
  await test('checkpoint 2: top/centre/bottom and left/centre/right with different card dimensions', async () => {
    await open(); assert(await page.evaluate("return document.querySelector('[data-studio-alignment-guides]').checked;"));
    await page.evaluate("document.querySelector('[data-studio-alias=PC-A]').closest('details').open=true;const e=document.querySelector('[data-studio-alias=PC-A]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'PC A / Laboratory Universität Nord mit langem Namen');e.dispatchEvent(new Event('input',{bubbles:true}));"); await ready();
    for (const axis of ['x', 'y']) for (const [n, ratio] of [0, .5, 1].entries()) {
      const m = await metrics(), c = m.cards.find(c => c.id === 'PC-A'), ref = m.cards.find(c => c.id === (axis === 'x' ? 'D' : 'A')), dimension = axis === 'x' ? 'width' : 'height';
      assert(c.width !== ref.width || c.height !== ref.height);
      const target = { x: c.x + c.width / 2, y: c.y + c.height / 2 }; target[axis] = ref[axis] + ref[dimension] * ratio + c[dimension] * (.5 - ratio) + 2;
      if (axis === 'x') { const pc = m.cards.find(c => c.id === 'PC-B'), sw = m.cards.find(c => c.id === 'SW-B'); target.y = (pc.y + pc.height + sw.y) / 2; }
      else { const a = m.cards.find(c => c.id === 'A'), b = m.cards.find(c => c.id === 'B'); target.x = (a.x + a.width / 2 + b.x + b.width / 2) / 2; }
      const r = await gesture('PC-A', target, { cancel: true, referenceShot: axis === 'x' && ratio === .5 ? '02-guia-vertical-centros-durante-arraste' : axis === 'y' && ratio === 1 ? '03-guia-horizontal-bordas-durante-arraste' : undefined });
      const actual = r.live.cards.find(c => c.id === 'PC-A'); assert(Math.abs(actual[axis] - ref[axis] - (ref[dimension] - c[dimension]) * ratio) < .01, JSON.stringify({ axis, ratio, actual, ref, c, guides: r.guides, target }));
      assert(r.guides.some(g => g.axis === axis && g.edge === ['start', 'center', 'end'][n]));
    }
  });
  await test('checkpoint 2: visual tolerance across zooms, window modes, themes, free drag and Escape', async () => {
    await open();
    for (const zoom of ['page', '0', '0.5', '1', '1.25']) {
      await select('[data-studio-zoom]', zoom);
      const m = await metrics(), c = m.cards.find(c => c.id === 'PC-A'), ref = m.cards.find(c => c.id === 'PC-B');
      const k = await page.evaluate("const f=document.querySelector('.topology-studio iframe');return f.getBoundingClientRect().width/f.offsetWidth*f.contentDocument.querySelector('svg').getScreenCTM().a;");
      const target = { x: c.x + c.width / 2, y: ref.y + c.height / 2 + 4 / k };
      const r = await gesture('PC-A', target, { cancel: true }); assert(Math.abs(r.live.cards.find(c => c.id === 'PC-A').y - ref.y) < .01); assert(r.guides.some(g => g.axis === 'y'));
    }
    await select('[data-studio-zoom]', 'page'); await click('[data-studio-maximize]');
    await page.evaluate("theme.getState().setTheme('classic-light');");
    let m = await metrics(), c = m.cards.find(c => c.id === 'PC-A'); await enabled(false);
    let target = { x: c.x + c.width / 2 + 3, y: c.y + c.height / 2 + 3 }; const free = await gesture('PC-A', target); assert.deepEqual(free.guides, []);
    const moved = free.after.cards.find(c => c.id === 'PC-A'); assert(Math.abs(moved.x - c.x - 3) < .01); assert(Math.abs(moved.y - c.y - 3) < .01);
    await enabled(true); m = await metrics(); c = m.cards.find(c => c.id === 'PC-A');
    const ref = m.cards.find(c => c.id === 'PC-B');
    const snapped = await gesture('PC-A', { x: c.x + c.width / 2, y: ref.y + c.height / 2 + 2 }, { cancel: true }); assert(snapped.guides.some(g => g.axis === 'y'));
    await gesture('PC-A', { x: -100, y: m.area.y + 100 }, { cancel: true });
    await gesture('PC-A', { x: c.x + c.width / 2 + 30, y: c.y + c.height / 2 + 30 }, { cancel: true });
    await page.evaluate("theme.getState().setTheme('graphite-dark');");
  });
  await test('checkpoint 1/2: pinned layout reports no safe compaction without erasing manual edits', async () => {
    await open('simple'); await enabled(false);
    for (const c of (await metrics()).cards) await gesture(c.id, { x: c.x + c.width / 2 + 2, y: c.y + c.height / 2 + 2 });
    const before = await metrics(); assert(before.cards.every(c => c.manual === 'true'));
    await click('[data-studio-compact]'); await ready(); assert.deepEqual(await metrics(), before);
    assert(await page.evaluate("return !!document.querySelector('[data-studio-compact-notice]')&&document.querySelector('[data-studio-undo-compact]').disabled;"));
  });
  await test('integration: compact, pinned manual position, tables, undo and all visual exports', async () => {
    await open(); await click('[data-studio-maximize]'); await select('[data-studio-diagram-scale]', '0.5');
    await click('[data-studio-compact]'); await ready(); let m = await metrics(), c = m.cards.find(c => c.id === 'PC-A');
    await gesture('PC-A', { x: c.x + c.width / 2 + 8, y: c.y + c.height / 2 + 10 }); const pinned = (await metrics()).cards.find(c => c.id === 'PC-A');
    await click('[data-studio-compact]'); await ready(); assert.deepEqual((await metrics()).cards.find(c => c.id === 'PC-A'), pinned);
    await click('[data-studio-undo-compact]'); await ready(); assert.deepEqual((await metrics()).cards.find(c => c.id === 'PC-A'), pinned);
    await page.evaluate("document.querySelector('[data-studio-add-block-panel]').open=true;"); await select('[data-studio-block-device]', 'D'); await click('[data-studio-add-block]'); await ready();
    const table = (await metrics()).tables[0][0];
    await page.evaluate(`document.querySelector('[data-studio-block-settings="${table}"] [data-block-advanced]').open=true;`);
    const placement = await metrics(), box = placement.tables[0];
    for (const [axis, value] of [['x', 12 * 25.4 / 96], ['y', (placement.area.y + placement.area.height - box[4] - 35) * 25.4 / 96]]) { await page.evaluate(`const e=document.querySelector('[data-studio-block-settings="${table}"] [data-block-${axis}]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'${value}');e.dispatchEvent(new Event('input',{bubbles:true}));`); await ready(); }
    await tableGesture(table, 'move', 12, 8); await tableGesture(table, 'width', 40, 0); await tableGesture(table, 'scale', -15, -8);
    await select(`[data-studio-block-settings="${table}"] [data-block-scale-select]`, '0.85');
    m = await metrics(); await select('[data-studio-zoom]', '0.75'); assert.deepEqual(await metrics(), m); await select('[data-studio-zoom]', 'page');
    const expected = await metrics();
    assert(!await page.evaluate("return !!document.querySelector('[data-studio-block-warning],[data-studio-device-warning]');"), 'Final review has no content/cable overlap warning');
    const download = async kind => { const count = report.downloads.length; page.labelDownloads('studio-compact-' + kind); await click(`[data-studio-export=${kind}]`); for (let n = 0; n < 150 && report.downloads.length === count; n++) await delay(40); assert.equal(report.downloads.length, count + 1); await page.drainDownloads(); const bytes = await readFile(path.join(downloads, report.downloads.at(-1).guid)); await writeFile(path.join(output, 'final.' + kind), bytes); return bytes; };
    const visual = (await download('svg')).toString('utf8'), png = await download('png'), html = (await download('html')).toString('utf8');
    assert(html.includes(visual)); assert(!visual.includes('data-studio-device-guides')); assert(!visual.includes('data-alignment-axis')); assert(!visual.includes('data-block-resize='));
    assert.deepEqual(await page.evaluate(`window.compactSvg=new DOMParser().parseFromString(${JSON.stringify(visual)},'image/svg+xml').documentElement;const r=await(async()=>{${probe}})();delete window.compactSvg;return r;`), expected);
    await compare('04-integracao-previa-png-a4-retrato', `<!doctype html><meta charset="utf-8"><style>body{margin:20px;background:#e4e8ec;font:18px Arial;color:#1e293b}main{display:grid;grid-template-columns:1fr 1fr;gap:20px}section{min-width:0;background:white;padding:18px}h2{font-size:18px}svg,img{width:100%;height:auto}</style><main><section><h2>Prévia · compacto + snap + Routing Table</h2>${visual}</section><section><h2>PNG exportado · A4 Hochformat</h2><img src="data:image/png;base64,${png.toString('base64')}"></section></main>`);
    const printer = await openPage(); try { const tree = await printer.send('Page.getFrameTree'); for (const paper of ['A4', 'A3']) for (const orientation of ['portrait', 'landscape']) {
      await select('[data-studio-paper]', paper); await select('[data-studio-orientation]', orientation);
      // Table coordinates deliberately stay fixed on paper changes. If the new
      // sheet warns about overlap, prepare that sheet explicitly via its existing
      // position fields; never add automatic table movement to the product.
      if (await page.evaluate("return !!document.querySelector('[data-studio-block-warning],[data-studio-device-warning]');")) {
        const sheet = await metrics(), b = sheet.tables[0];
        for (const [axis, value] of [['x', 12 * 25.4 / 96], ['y', (sheet.area.y + sheet.area.height - b[4] - 16) * 25.4 / 96]]) {
          await page.evaluate(`const e=document.querySelector('[data-studio-block-settings="${table}"] [data-block-${axis}]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'${value}');e.dispatchEvent(new Event('input',{bubbles:true}));`); await ready();
        }
      }
      assert(!await page.evaluate("return !!document.querySelector('[data-studio-block-warning],[data-studio-device-warning]');"), 'Prepared PDF sheet has no overlap warning');
      const current = await metrics(), document = await page.evaluate("return document.querySelector('.topology-studio iframe').dataset.previewHtml;");
      await printer.send('Page.setDocumentContent', { frameId: tree.frameTree.frame.id, html: document }); await printer.evaluate('await document.fonts.ready;');
      assert.deepEqual(await printer.evaluate(`window.compactSvg=document.querySelector('[data-print-section=diagram] svg');${probe}`), current);
      const pdf = await printer.send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true }); await writeFile(path.join(output, `final-${paper}-${orientation}.pdf`), Buffer.from(pdf.data, 'base64'));
    } } finally { await printer.send('Page.close'); printer.close(); }
    await sourceUnchanged();
  });
}
