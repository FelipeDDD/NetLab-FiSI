import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const before = process.argv.includes('--before'), phase = before ? 'before' : 'after';
const output = path.join(root, '.playwright-mcp/reviews/topology-geometry');
// Preserve diagram.ts here before implementation changes for a reproducible
// baseline. All generated files remain in the ignored review directory.
const baseline = before && existsSync(path.join(output, 'diagram-before.ts'));
const binary = process.env.NETLAB_CHROMIUM_PATH ?? ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(existsSync);
assert(binary, 'Set NETLAB_CHROMIUM_PATH to an existing Chromium; no browser is installed.');
const scratch = await mkdtemp(path.join(tmpdir(), 'netlab-geometry-'));
let browser, socket, server, send;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  await mkdir(output, { recursive: true });
  if (baseline) await writeFile(path.join(output, 'baseline-renderer.ts'), (await readFile(path.join(output, 'diagram-before.ts'), 'utf8')).replaceAll("from './", "from '/src/export/studio/").replaceAll("from '../../", "from '/src/"));
  server = await createServer({ root, server: { host: '127.0.0.1', port: 5189, strictPort: false, watch: { ignored: ['**/.playwright-mcp/**'] } }, cacheDir: path.join(scratch, 'vite-cache') });
  await server.listen();
  browser = spawn(binary, ['--headless=new', '--no-first-run', '--disable-background-networking', ...(/msedge\.exe$/i.test(binary) ? ['--edge-skip-compat-layer-relaunch'] : []), '--remote-debugging-port=0', '--user-data-dir=' + scratch, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let endpoint;
  for (let i = 0; i < 100; i++) {
    try { const port = (await readFile(path.join(scratch, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; endpoint = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(p => p.type === 'page').webSocketDebuggerUrl; break; } catch { await delay(100); }
  }
  assert(endpoint, 'Disposable browser started'); socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let sequence = 0; const pending = new Map();
  socket.onmessage = event => { const m = JSON.parse(event.data), p = pending.get(m.id); if (p) { pending.delete(m.id); m.error ? p.reject(Error(JSON.stringify(m.error))) : p.resolve(m.result); } };
  send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
  const evaluate = async code => { const r = await send('Runtime.evaluate', { expression: `(async()=>{${code}})()`, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result.value; };
  await send('Page.enable'); await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1050, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${server.httpServer.address().port}/app.html` });
  for (let i = 0; i < 100; i++) { if (await evaluate("return document.readyState==='complete'")) break; await delay(50); }
  await evaluate(`window.fixtures=await import('/src/export/studio/geometry.fixture.ts');window.diagram=await import('${baseline ? '/.playwright-mcp/reviews/topology-geometry/baseline-renderer.ts' : '/src/export/studio/diagram.ts'}');window.opts=await import('/src/export/studio/options.ts');window.reports=await import('/src/export/studio/report.ts');window.geometry=await import('/src/export/studio/geometry.ts');window.comparisonCss='body{margin:0;background:#e4e8ec;font:16px Arial;color:#1e293b}h1{margin:20px}main{display:grid;grid-template-columns:1fr 1fr;gap:20px;padding:20px}section{background:white;padding:16px}section svg{width:100%;height:850px;object-fit:contain}h2{font-size:20px}';document.body.innerHTML='<main></main>';document.head.insertAdjacentHTML('beforeend','<style>'+comparisonCss+'</style>');`);
  const results = [];
  for (const scene of await evaluate('return fixtures.geometryScenes;')) for (const preset of ['clean', 'technical', 'presentation']) for (const paper of ['A4', 'A3']) for (const orientation of ['landscape', 'portrait']) for (const textSize of ['small', 'normal', 'large']) {
    const defaultText = textSize === (preset === 'presentation' ? 'large' : 'normal');
    const result = await evaluate(`const snap=fixtures.geometryFixture(${JSON.stringify(scene)}), original=JSON.stringify(snap),o=opts.printPreset('${preset}',snap);o.paper='${paper}';o.orientation='${orientation}';o.textSize='${textSize}';o.diagram.gateways=true;window.currentSvg=diagram.studioDiagram(snap,o,'en');
      const xs=snap.devices.map(d=>d.x),ys=snap.devices.map(d=>d.y),x=Math.min(...xs)-65,y=Math.min(...ys)-50,w=Math.max(...xs)-x+65,h=Math.max(...ys)-y+65;
      const source='<svg xmlns="http://www.w3.org/2000/svg" viewBox="'+[x,y,w,h].join(' ')+'">'+snap.links.map(l=>{const a=snap.devices.find(d=>d.id===l.a[0]),b=snap.devices.find(d=>d.id===l.b[0]);return '<line x1="'+a.x+'" y1="'+a.y+'" x2="'+b.x+'" y2="'+b.y+'" stroke="#64748b"/>'}).join('')+snap.devices.map(d=>'<g><rect x="'+(d.x-45)+'" y="'+(d.y-25)+'" width="90" height="50" rx="6" fill="white" stroke="#94a3b8"/><text x="'+d.x+'" y="'+(d.y+5)+'" text-anchor="middle" font-size="14">'+d.id+'</text></g>').join('')+'</svg>';
      if('${scene}'==='four-routers')window.originalFour=source;
      document.querySelector('main').innerHTML='<section><h2>Original · reference positions</h2>'+source+'</section><section><h2>${phase} · ${scene} · ${preset} · ${paper} ${orientation}</h2>'+currentSvg+'</section>';await document.fonts.ready;
      const svg=document.querySelector('section:last-child svg'),cards=[...svg.querySelectorAll('[data-device]')].map(g=>{const r=g.querySelector('rect'),n=k=>Number(r.getAttribute(k));return{id:g.dataset.device,x:n('x'),y:n('y'),width:n('width'),height:n('height'),text:[...g.querySelectorAll(':scope > text')].map(t=>{const b=t.getBBox();return{x:b.x,y:b.y,width:b.width,height:b.height,text:t.textContent}})}});
      const issues=[];for(const c of cards){for(const t of c.text)if(t.x<c.x+3||t.x+t.width>c.x+c.width-3||t.y<c.y||t.y+t.height>c.y+c.height)issues.push('text outside '+c.id+': '+t.text);for(const b of cards)if(c.id<b.id&&c.x<b.x+b.width&&c.x+c.width>b.x&&c.y<b.y+b.height&&c.y+c.height>b.y)issues.push('overlap '+c.id+'/'+b.id);}
      const labels=[...svg.querySelectorAll('[data-cable-label]')].map(g=>{const b=g.getBBox();return{id:g.dataset.cableLabel,text:g.textContent,x:b.x-2,y:b.y-2,width:b.width+4,height:b.height+4}});
      for(const [i,label]of labels.entries()){for(const c of cards)if(geometry.overlaps(label,c))issues.push('label '+i+' crosses card '+c.id);for(const [j,l]of labels.entries())if(j>i&&geometry.overlaps(label,l))issues.push('labels overlap '+i+'/'+j);}
      for(const c of cards)for(const b of cards){const a=snap.devices.find(d=>d.id===c.id),z=snap.devices.find(d=>d.id===b.id);if((a.x-z.x)*(geometry.center(c).x-geometry.center(b).x)<-.01||(a.y-z.y)*(geometry.center(c).y-geometry.center(b).y)<-.01)issues.push('axis inverted '+c.id+'/'+b.id);}
      for(const cable of svg.querySelectorAll('[data-link]')){const link=snap.links.find(l=>l.id===cable.dataset.link),a=cards.find(c=>c.id===link.a[0]),b=cards.find(c=>c.id===link.b[0]),points=cable.tagName==='line'?[{x:Number(cable.getAttribute('x1')),y:Number(cable.getAttribute('y1'))},{x:Number(cable.getAttribute('x2')),y:Number(cable.getAttribute('y2'))}]:[...cable.points].map(p=>({x:p.x,y:p.y}));
        const border=(p,c)=>p.x>=c.x-.1&&p.x<=c.x+c.width+.1&&p.y>=c.y-.1&&p.y<=c.y+c.height+.1&&Math.min(Math.abs(p.x-c.x),Math.abs(p.x-c.x-c.width),Math.abs(p.y-c.y),Math.abs(p.y-c.y-c.height))<.1;
        if(!border(points[0],a)||!border(points.at(-1),b))issues.push('endpoint outside border');if(points.slice(1).some((p,i)=>cards.some(c=>geometry.crossesCard(points[i],p,c))))issues.push('cable crosses card');}
      const bounds=svg.querySelector('g[transform]')?.getBBox();const ct=svg.getCTM()?.inverse().multiply(svg.querySelector('g[transform]')?.getCTM());if(bounds&&ct){const p=new DOMPoint(bounds.x,bounds.y).matrixTransform(ct),q=new DOMPoint(bounds.x+bounds.width,bounds.y+bounds.height).matrixTransform(ct);if(p.x<-.5||p.y<-.5||q.x>svg.viewBox.baseVal.width+.5||q.y>svg.viewBox.baseVal.height+.5)issues.push('content clipped');}
      return{issues,unchanged:original===JSON.stringify(snap),cards,labels,crowded:svg.dataset.layoutCrowded,labelPx:Number(svg.dataset.labelPx)};`);
    results.push({ scene, preset, paper, orientation, textSize, ...result });
    if (!before) { assert(result.unchanged); if(result.issues.length)await writeFile(path.join(output,'failure.json'),JSON.stringify(result,null,2)); assert.deepEqual(result.issues, [], `${scene}/${preset}/${paper}/${orientation}/${textSize}`); }
    if (paper === 'A4' && orientation === 'landscape' && defaultText) {
      const shot = await send('Page.captureScreenshot', { format: 'png' }); await writeFile(path.join(output, `${phase}-${scene}-${preset}.png`), Buffer.from(shot.data, 'base64'));
      await writeFile(path.join(output, `${phase}-${scene}-${preset}.svg`), await evaluate('return currentSvg;'));
    }
    if (!before && scene === 'four-routers' && preset === 'technical' && defaultText) {
      const html = await evaluate(`const s=fixtures.geometryFixture(),o=opts.printPreset('technical',s);o.paper='${paper}';o.orientation='${orientation}';return reports.studioReport(s,o,'en').html;`);
      const tree = await send('Page.getFrameTree'); await send('Page.setDocumentContent', { frameId: tree.frameTree.frame.id, html });
      await evaluate('await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));');
      const pdf = await send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true }); await writeFile(path.join(output, `${paper}-${orientation}.pdf`), Buffer.from(pdf.data, 'base64'));
      await evaluate("document.head.innerHTML='<style>'+comparisonCss+'</style>';document.body.innerHTML='<main></main>'");
    }
  }
  if (!before && existsSync(path.join(output, 'before-four-routers-technical.svg'))) {
    const oldSvg = await readFile(path.join(output, 'before-four-routers-technical.svg'), 'utf8'), newSvg = await readFile(path.join(output, 'after-four-routers-technical.svg'), 'utf8');
    const html = await evaluate(`const crop=text=>{const e=new DOMParser().parseFromString(text,'image/svg+xml').documentElement,g=e.querySelector('g[transform]');e.replaceChildren(g);g.removeAttribute('transform');document.body.append(e);const b=g.getBBox();e.setAttribute('viewBox',[b.x-16,b.y-16,b.width+32,b.height+32].join(' '));e.remove();return e.outerHTML;};document.head.innerHTML='<meta charset="UTF-8"><style>'+comparisonCss+'main{grid-template-columns:repeat(3,1fr)}section svg{height:850px}h2{font-size:18px}</style>';document.body.innerHTML='<main><section><h2>Referência · posições originais</h2>'+originalFour+'</section><section><h2>Antes · exportação</h2>'+crop(${JSON.stringify(oldSvg)})+'</section><section><h2>Depois · exportação</h2>'+crop(${JSON.stringify(newSvg)})+'</section></main>';await document.fonts.ready;return '<!doctype html>'+document.documentElement.outerHTML;`);
    await writeFile(path.join(output, 'comparison-four-routers.html'), html);
    const shot = await send('Page.captureScreenshot', { format: 'png' }); await writeFile(path.join(output, 'comparison-four-routers.png'), Buffer.from(shot.data, 'base64'));
  }
  await writeFile(path.join(output, `${phase}-metrics.json`), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ phase, cases: results.length, issues: results.filter(r => r.issues.length).map(r => ({ scene:r.scene,preset:r.preset,issues:r.issues })), output }, null, 2));
} finally {
  if (send && socket?.readyState === WebSocket.OPEN) await send('Browser.close').catch(() => {});
  if (socket) socket.close();
  if (browser && browser.exitCode === null) { await new Promise(resolve => { browser.once('exit', resolve); setTimeout(resolve, 3000); }); if (browser.exitCode === null) browser.kill(); }
  if (server) await server.close();
  const resolved = await import('node:fs/promises').then(fs => fs.realpath(scratch));
  assert(path.dirname(resolved) === await import('node:fs/promises').then(fs => fs.realpath(tmpdir())) && path.basename(resolved).startsWith('netlab-geometry-'));
  await rm(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
