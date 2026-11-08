import { reopenStudio } from './studio-review-reopen.mjs';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Native pointer/download/print checks in the existing disposable workspace. */
export async function runTopologyBlocksReview({ page, root, report, downloads, openPage }) {
  const output = path.join(root, '.playwright-mcp/reviews/topology-blocks');
  await mkdir(output, { recursive: true });
  const baselineDirectory = path.join(output, 'before/src'), haveBaseline = existsSync(path.join(baselineDirectory, 'diagram.ts'));
  if (haveBaseline) {
    await mkdir(path.join(output,'before/render'),{recursive:true});
    for (const name of ['diagram.ts','geometry.ts','options.ts','messages.ts']) await writeFile(path.join(output,'before/render',name),(await readFile(path.join(baselineDirectory,name),'utf8')).replaceAll("from '../../","from '/src/"));
  }
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const wait = async expression => { for (let i = 0; i < 250; i++) { if (await page.evaluate(`return !!(${expression});`)) return; await delay(40); } throw Error('Block review timeout: ' + expression); };
  const loaded = async (allowOversize = false) => { await delay(130); await wait("document.querySelector('.topology-studio iframe')?.contentDocument?.querySelector('[data-print-section=diagram] svg')" + (allowOversize ? '' : "&&!document.querySelector('[data-studio-print]').disabled")); };
  const click = async (selector, text) => {
    const point = await page.evaluate(`const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.getClientRects().length&&${text ? `e.textContent.trim()===${JSON.stringify(text)}` : 'true'});if(!e)throw Error('Missing '+${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};`);
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, ...point, ...(type === 'mouseMoved' ? {} : { button: 'left', clickCount: 1 }) }); await delay(100);
  };
  const select = async (selector, value, oversized = false) => { await page.evaluate(`const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}));`); await loaded(oversized); };
  const input = async (selector, value) => { await page.evaluate(`const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(String(value))});e.dispatchEvent(new Event('input',{bubbles:true}));`); await loaded(); };
  const key = async name => { for (const type of ['keyDown', 'keyUp']) await page.send('Input.dispatchKeyEvent', { type, key: name, code: name, windowsVirtualKeyCode: name === 'Escape' ? 27 : 9 }); };
  const test = async (name, work) => { try { await work(); report.results['floating routing tables: ' + name] = { passed: true }; } catch (error) { report.results['floating routing tables: ' + name] = { passed: false, error: error.stack }; throw error; } };
  const metrics = () => page.evaluate(`const d=document.querySelector('.topology-studio iframe').contentDocument,s=d.querySelector('[data-print-section=diagram] svg');return{viewBox:s.getAttribute('viewBox'),topology:s.querySelector('[data-topology]').getAttribute('transform'),area:{x:Number(s.dataset.contentX),y:Number(s.dataset.contentY),width:Number(s.dataset.contentWidth),height:Number(s.dataset.contentHeight)},blocks:[...s.querySelectorAll('[data-document-block]')].map(g=>({id:g.dataset.documentBlock,device:g.dataset.blockDevice,x:Number(g.dataset.x),y:Number(g.dataset.y),width:Number(g.dataset.width),height:Number(g.dataset.height),missing:g.dataset.missing,overlap:g.dataset.overlap,oversized:g.dataset.oversized,text:g.textContent,lines:[...g.querySelectorAll('text')].map(t=>{const b=t.getBBox();return{x:b.x,y:b.y,width:b.width,height:b.height,text:t.textContent}})}))};`);
  const verify = async () => {
    const m = await metrics();
    for (const b of m.blocks) {
      assert(b.x >= m.area.x - .1 && b.y >= m.area.y - .1 && b.x + b.width <= m.area.x + m.area.width + .1 && b.y + b.height <= m.area.y + m.area.height + .1, 'Block within printable diagram area');
      for (const t of b.lines) assert(t.x >= 1 && t.x + t.width <= b.width - 1 && t.y >= 0 && t.y + t.height <= b.height, 'No table text clipped: ' + t.text);
    }
    return m;
  };
  const shot = async name => { await delay(120); const png = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); await writeFile(path.join(output, name + '.png'), Buffer.from(png.data, 'base64')); };
  const closeStudio = async () => { if (await page.evaluate("return !!document.querySelector('.topology-studio');")) { await page.evaluate("document.querySelector('[data-studio-preset]').focus();"); await key('Escape'); await wait("!document.querySelector('.topology-studio')"); } };
  const open = async scene => {
    await closeStudio();
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1050, deviceScaleFactor: 1, mobile: false });
    // The preceding legacy review assigns two IP fields directly. Complete
    // those fixture-only configurations before the controller flushes them.
    await page.evaluate("for(const d of sim.net.devices.values())for(const i of d.interfaces)if(i.ip&&i.ipv4Mode==='unconfigured')i.configureIpv4({mode:'static',ip:i.ip,gateway:i.gateway,dns:i.dns});store.getState().refresh();");
    await page.evaluate(`lang.getState().setLanguage('en');theme.getState().setTheme('graphite-dark');const f=await import('/src/export/studio/blocks.fixture.ts');const result=await ws.controller.openDocument(f.blocksFixture('${scene}'));if(!result.ok)throw Error(JSON.stringify(result.error));await ws.controller.flush();window.blockSourceBefore=studioProject();`);
    await click('.toolbar-menu-trigger', 'File'); await click('.toolbar-menu-action[aria-haspopup=menu]'); await click('[data-open-topology-studio]'); await loaded();
  };
  const add = async device => {
    await page.evaluate("document.querySelector('[data-studio-add-block-panel]').open=true;");
    await select('[data-studio-block-device]', device); await click('[data-studio-add-block]'); await loaded();
    return (await metrics()).blocks.at(-1).id;
  };
  const settings = id => `[data-studio-block-settings="${id}"]`;
  const position = async (id, x, y) => { await input(settings(id) + ' [data-block-x]', x); await input(settings(id) + ' [data-block-y]', y); };
  const drag = async (id, dx, dy, cancel = false) => {
    const before = (await metrics()).blocks.find(b => b.id === id);
    const p = await page.evaluate(`const f=document.querySelector('.topology-studio iframe'),d=f.contentDocument,g=[...d.querySelectorAll('[data-document-block]')].find(g=>g.dataset.documentBlock===${JSON.stringify(id)}),h=g.querySelector('[data-block-drag]');const stage=document.querySelector('.studio-preview-stage');let r=h.getBoundingClientRect(),fr=f.getBoundingClientRect(),k=fr.width/f.offsetWidth;const y=fr.y+(r.y+r.height/2)*k;stage.scrollTop+=Math.max(0,y-stage.getBoundingClientRect().bottom+70)+Math.min(0,y-stage.getBoundingClientRect().top-40);r=h.getBoundingClientRect();fr=f.getBoundingClientRect();const matrix=g.ownerSVGElement.getScreenCTM();return{x:fr.x+(r.x+r.width/2)*k,y:fr.y+(r.y+r.height/2)*k,k:k*matrix.a};`);
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y });
    await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', buttons: 1, clickCount: 1 });
    for (let step = 1; step <= 5; step++) await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x + dx * p.k * step / 5, y: p.y + dy * p.k * step / 5, buttons: 1 });
    assert(await page.evaluate("return !!document.querySelector('.topology-studio iframe').contentDocument.querySelector('[data-dragging=true]');"), 'Drag indication visible');
    if (cancel) await key('Escape');
    await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x + dx * p.k, y: p.y + dy * p.k, button: 'left', buttons: 0, clickCount: 1 }); await loaded();
    const m = await verify(), after = m.blocks.find(b => b.id === id);
    const expected = cancel ? { x: before.x, y: before.y } : { x: Math.max(m.area.x, Math.min(m.area.x + m.area.width - before.width, before.x + dx)), y: Math.max(m.area.y, Math.min(m.area.y + m.area.height - before.height, before.y + dy)) };
    assert(Math.abs(after.x - expected.x) < 1 && Math.abs(after.y - expected.y) < 1, `Document-coordinate drag: ${JSON.stringify({ after: { x: after.x, y: after.y }, expected, p })}`);
    return after;
  };
  const assertSource = async () => assert.equal(await page.evaluate('return studioProject();'), await page.evaluate('return blockSourceBefore;'));
  const download = async (kind, label) => {
    const start = report.downloads.length; page.labelDownloads('floating-blocks-' + label + '-' + kind); await click(`[data-studio-export=${kind}]`);
    for (let n = 0; n < 100 && report.downloads.length === start; n++) await delay(40);
    assert.equal(report.downloads.length, start + 1); await page.drainDownloads(); const file = report.downloads.at(-1);
    const bytes = await readFile(path.join(downloads, file.guid)); await writeFile(path.join(output, label + '.' + kind), bytes); return bytes;
  };
  const exportCompare = async label => {
    const expected = await metrics(), svg = (await download('svg', label)).toString('utf8'), png = await download('png', label), html = (await download('html', label)).toString('utf8');
    const actual = await page.evaluate(`const s=new DOMParser().parseFromString(${JSON.stringify(svg)},'image/svg+xml').documentElement;return{viewBox:s.getAttribute('viewBox'),topology:s.querySelector('[data-topology]').getAttribute('transform'),blocks:[...s.querySelectorAll('[data-document-block]')].map(g=>({id:g.dataset.documentBlock,x:Number(g.dataset.x),y:Number(g.dataset.y),text:g.textContent}))};`);
    assert.equal(actual.viewBox, expected.viewBox); assert.equal(actual.topology, expected.topology);
    assert.deepEqual(actual.blocks, expected.blocks.map(b => ({ id: b.id, x: b.x, y: b.y, text: b.text })));
    assert(html.includes(svg), 'HTML embeds exact standalone SVG'); assert.equal((html.match(/data-print-page=/g) ?? []).length, 1, 'Blocks do not create technical pages');
    const [,,w,h] = expected.viewBox.split(' ').map(Number); assert(Math.abs(png.readUInt32BE(16) - w * 3) <= 1 && Math.abs(png.readUInt32BE(20) - h * 3) <= 1);
    // Show the real preview SVG next to the actual downloaded PNG, using a
    // separate document so the Studio/iframe and its options remain untouched.
    const compare = await openPage();
    try {
      const tree = await compare.send('Page.getFrameTree');
      const comparison = `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#e4e8ec;font:18px Arial}main{display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:16px}section{padding:14px;background:white;min-width:0}h2{font-size:18px}svg,img{width:100%;height:auto}</style><main><section><h2>Prévia · ${label}</h2>${svg}</section><section><h2>PNG exportado · ${label}</h2><img src="data:image/png;base64,${png.toString('base64')}"></section></main>`;
      await compare.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
      await compare.send('Page.setDocumentContent', { frameId: tree.frameTree.frame.id, html: comparison });
      await compare.evaluate('await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()));');
      const shot = await compare.send('Page.captureScreenshot', { format: 'png' }); await writeFile(path.join(output, label + '-preview-export.png'), Buffer.from(shot.data, 'base64'));
      await writeFile(path.join(output, label + '-comparison.html'), comparison);
    } finally { await compare.send('Page.close'); compare.close(); }
    return expected;
  };
  const cardsComparison = async () => {
    if (!haveBaseline) return;
    const content = await page.evaluate("const m=await import('/src/export/studio/model.ts'),o=await import('/src/export/studio/options.ts'),after=await import('/src/export/studio/diagram.ts'),before=await import('/.playwright-mcp/reviews/topology-blocks/before/render/diagram.ts');const s=m.capturePrintSnapshot(sim.net,store.getState()),p=o.printPreset('technical',s);p.diagram.gateways=true;return{before:before.studioDiagram(s,p,'en'),after:after.studioDiagram(s,p,'en')};");
    const compare = await openPage();
    try {
      const tree = await compare.send('Page.getFrameTree');
      await compare.send('Emulation.setDeviceMetricsOverride',{width:1600,height:1050,deviceScaleFactor:1,mobile:false});
      await compare.send('Page.setDocumentContent',{frameId:tree.frameTree.frame.id,html:`<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#e4e8ec;font:18px Arial}main{display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:16px}section{padding:14px;background:white;min-width:0}h2{font-size:18px}svg{width:100%;height:910px}</style><main><section><h2>Antes · cards da Etapa 1</h2>${content.before}</section><section><h2>Depois · hierarquia da Etapa 1.5</h2>${content.after}</section></main>`});
      await compare.evaluate("for(const s of document.querySelectorAll('svg')){const g=s.querySelector('g[transform]');s.replaceChildren(g);g.removeAttribute('transform');const b=g.getBBox();s.setAttribute('viewBox',[b.x-16,b.y-16,b.width+32,b.height+32].join(' '));}await document.fonts.ready;");
      const png=await compare.send('Page.captureScreenshot',{format:'png'});await writeFile(path.join(output,'cards-before-after.png'),Buffer.from(png.data,'base64'));
      await writeFile(path.join(output,'cards-before-after.html'),await compare.evaluate("return '<!doctype html>'+document.documentElement.outerHTML;"));
    } finally {await compare.send('Page.close');compare.close();}
  };

  await test('A: one router, two hosts, native drag and matching SVG PNG HTML', async () => {
    await open('simple'); await select('[data-studio-diagram-scale]','0.7'); await shot('00-simple-before'); const baseline = await metrics(), id = await add('A');
    assert.equal((await metrics()).topology, baseline.topology);
    await position(id, 180, 65); await drag(id, 35, 20); assert.equal((await verify()).blocks[0].overlap,'false'); await assertSource(); await shot('01-one-table'); await exportCompare('one-table');
  });
  let ids;
  await test('B: four routers, two and three independently positioned tables on A4 and A3', async () => {
    await open('four'); await cardsComparison(); await select('[data-studio-diagram-scale]', '0.8'); await shot('02-four-before');
    const baseline = await metrics(); ids = [];
    for (const device of ['A', 'D', 'B']) {
      ids.push(await add(device)); const m = await verify(); assert.equal(m.topology, baseline.topology); assert(m.blocks.every(b => b.overlap === 'false'), 'Initial positions avoid the topology and other tables');
      if (ids.length === 2) { await shot('03-two-tables'); await exportCompare('two-tables'); }
    }
    await shot('04-three-tables-a4'); await exportCompare('three-tables'); await assertSource();
    await select('[data-studio-paper]', 'A3'); await verify(); await shot('05-three-tables-a3');
    await select('[data-studio-paper]', 'A4'); await verify();
  });
  await test('D: zoom changes and pointer cancellation preserve document coordinates and other blocks', async () => {
    const id = ids[0]; await position(id, 8, 60);
    for (const zoom of ['0.5', '1.25', '0']) {
      const prior = await metrics(); await select('[data-studio-zoom]', zoom); const afterZoom = await metrics();
      assert.deepEqual(afterZoom.blocks.map(b => [b.id,b.x,b.y]), prior.blocks.map(b => [b.id,b.x,b.y]));
      const other = afterZoom.blocks.slice(1).map(b => [b.id,b.x,b.y]); await drag(id, 30, 12);
      assert.deepEqual((await metrics()).blocks.slice(1).map(b => [b.id,b.x,b.y]), other);
    }
    await drag(id,-150,-250);
    await drag(id, 25, 10, true); await exportCompare('zoom-drag'); await assertSource();
  });
  await test('independent filters, columns, presets, removal and position recovery', async () => {
    const id = ids[0], before = await metrics();
    await select(settings(id) + ' [data-block-filter]', 'default'); const filtered = await metrics();
    assert(filtered.blocks[0].text.includes('0.0.0.0/0')); assert(!filtered.blocks[0].text.includes('192.168.10.0/24'));
    assert.deepEqual(filtered.blocks.slice(1).map(b=>b.text),before.blocks.slice(1).map(b=>b.text));
    await page.evaluate(`const p=document.querySelector(${JSON.stringify(settings(id))});for(const d of p.querySelectorAll('details'))d.open=true;`);
    await click(settings(id)+' [data-block-all-interfaces]');await loaded();assert(await page.evaluate(`return document.querySelector(${JSON.stringify(settings(id)+' [data-block-count]')}).textContent.includes('0 / 3');`));
    await click(settings(id)+' [data-block-interface=eth1]');await loaded();assert((await metrics()).blocks[0].text.includes('0.0.0.0/0'));
    await click(settings(id) + ' [data-block-column=origin]'); await loaded();
    await select(settings(id) + ' [data-block-width]', 'normal'); await position(id, 5, 70);
    const pinned = (await metrics()).blocks[0];
    for (const preset of ['presentation', 'technical', 'clean']) { await select('[data-studio-preset]', preset); const m=await metrics(); assert.equal(m.blocks.length,3); assert.equal(m.blocks[0].id,id); assert.equal(m.blocks[0].x,pinned.x); assert.equal(m.blocks[0].y,pinned.y); }
    await select(settings(id) + ' [data-block-width]', 'compact'); await click(settings(id) + ' [data-block-reset]'); await loaded();
    await click('[data-studio-reset-blocks]'); await loaded(); assert((await verify()).blocks.every(b=>b.overlap==='false'));
    for(const language of ['de','pt-BR','en']){await page.evaluate(`lang.getState().setLanguage('${language}');`);await loaded();await verify();}
    await click(settings(ids[2]) + ' [data-block-remove]'); await loaded(); assert.equal((await metrics()).blocks.length,2); await assertSource();
  });
  await test('E: snapshot refresh retains positions/filters and marks removed devices without stale data', async () => {
    const id = ids[0]; await select(settings(id) + ' [data-block-filter]', 'static'); await position(id, 5, 65); const before = (await metrics()).blocks[0];
    await page.evaluate("const ip=await import('/src/engine/ip.ts');sim.net.devices.get('A').addRoute(ip.parseIp('172.31.0.0'),16,ip.parseIp('10.0.1.2'),'eth1');store.getState().refresh();await ws.controller.flush();");
    assert.equal((await metrics()).blocks[0].text,before.text); await reopenStudio(page); await loaded();
    const refreshed=(await metrics()).blocks[0]; assert(refreshed.text.replace(/\s/g,'').includes('172.31.0.0/16'),refreshed.text);assert.equal(refreshed.id,id);assert.equal(refreshed.x,before.x);assert.equal(refreshed.y,before.y);
    assert.equal(await page.evaluate(`return document.querySelector(${JSON.stringify(settings(id)+' [data-block-filter]')}).value;`),'static');
    await page.evaluate("store.getState().deleteDevice('A');await ws.controller.flush();window.blockSourceBefore=studioProject();");
    await reopenStudio(page); await loaded(); const removed=(await metrics()).blocks[0];
    assert.equal(removed.id,id);assert.equal(removed.device,'A');assert.equal(removed.missing,'true');assert(!removed.text.replace(/\s/g,'').includes('172.31.0.0/16'));assert(removed.text.includes('removed'));await assertSource();await shot('06-removed-device');
  });
  await test('C: dense content warns, oversize keeps all rows and export recovers after filtering', async () => {
    await open('dense');const a=await add('A'),d=await add('D');await position(a,5,55);await position(d,5,55);
    assert(await page.evaluate("return document.querySelector('[data-studio-block-warning]')?.dataset.studioBlockWarning==='overlap';"));await shot('07-dense-two-tables');await assertSource();
    await page.evaluate("const ip=await import('/src/engine/ip.ts');const a=sim.net.devices.get('A');for(let i=0;i<60;i++)a.addRoute(ip.parseIp('172.'+i+'.0.0'),16,ip.parseIp('10.0.1.2'),'eth1');store.getState().refresh();await ws.controller.flush();window.blockSourceBefore=studioProject();");
    await reopenStudio(page); await loaded(true);const tall=(await metrics()).blocks.find(b=>b.device==='A');assert.equal(tall.oversized,'true');assert(tall.text.includes('172.59.0.0/16'));
    assert(await page.evaluate("return document.querySelector('[data-studio-print]').disabled&&[...document.querySelectorAll('[data-studio-export]')].every(b=>b.disabled)&&document.querySelector('[data-studio-block-warning]').dataset.studioBlockWarning==='oversized';"));
    await click('[data-studio-section=routes]');await loaded(true);await click('[data-studio-section=diagram]');
    await wait("document.querySelector('.topology-studio iframe')?.contentDocument?.querySelector('.print-table-section')&&!document.querySelector('.topology-studio iframe').contentDocument.querySelector('[data-print-section=diagram]')&&!document.querySelector('[data-studio-print]').disabled");
    assert(await page.evaluate("return !document.querySelector('[data-studio-export=html]').disabled&&document.querySelector('[data-studio-export=svg]').disabled;"),'An excluded oversize block cannot prevent conventional report export');
    await click('[data-studio-section=diagram]');await loaded(true);await click('[data-studio-section=routes]');await loaded(true);
    await select(settings(a)+' [data-block-filter]','default');await verify();await assertSource();
  });
  await test('positioned tables print in exactly one A4/A3 page with matching content and coordinates', async () => {
    await open('four');await select('[data-studio-diagram-scale]','0.8');await add('A');await add('D');await add('B');
    await page.evaluate("window.blockPrintPositions=null;const w=document.querySelector('.topology-studio iframe').contentWindow;w.addEventListener('beforeprint',()=>{blockPrintPositions=[...w.document.querySelectorAll('[data-document-block]')].map(g=>[g.dataset.documentBlock,g.dataset.x,g.dataset.y]);},{once:true});");
    const expected=(await metrics()).blocks.map(b=>[b.id,String(b.x),String(b.y)]);await click('[data-studio-print]');assert.deepEqual(await page.evaluate('return blockPrintPositions;'),expected);
    const printer=await openPage();
    try {
      for(const paper of ['A4','A3']) {
        await select('[data-studio-paper]',paper);await verify();const html=await page.evaluate("return document.querySelector('.topology-studio iframe').dataset.previewHtml;");
        const tree=await printer.send('Page.getFrameTree');await printer.send('Page.setDocumentContent',{frameId:tree.frameTree.frame.id,html});await printer.evaluate('await document.fonts.ready;');
        const pdf=await printer.send('Page.printToPDF',{printBackground:true,preferCSSPageSize:true});const bytes=Buffer.from(pdf.data,'base64');
        assert.equal(Math.max(...[...bytes.toString('latin1').matchAll(/\/Count\s+(\d+)/g)].map(m=>Number(m[1]))),1);
        await writeFile(path.join(output,`three-tables-${paper}.pdf`),bytes);
      }
    } finally {await printer.send('Page.close');printer.close();}
    await assertSource();await closeStudio();
  });
  report.floatingBlocksReview = { output, scenarios: Object.keys(report.results).filter(k=>k.startsWith('floating routing tables:')).length };
  await writeFile(path.join(output,'results.json'),JSON.stringify(report.floatingBlocksReview,null,2));
}
