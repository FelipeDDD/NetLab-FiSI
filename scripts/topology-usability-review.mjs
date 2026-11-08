import { reopenStudio } from './studio-review-reopen.mjs';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function runTopologyUsabilityReview({ page, root, report, downloads, openPage }) {
  const output = path.join(root, '.playwright-mcp/reviews/topology-usability'); await mkdir(output, { recursive: true });
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const ready = async () => { await delay(160); for (let n=0;n<200;n++) { if (await page.evaluate("return !!document.querySelector('.topology-studio iframe')?.contentDocument?.querySelector('[data-device]')&&!document.querySelector('[data-studio-print]').disabled;")) return; await delay(40); } throw Error('Studio not ready: '+JSON.stringify(await page.evaluate("return {print:document.querySelector('[data-studio-print]')?.disabled,svg:document.querySelector('[data-studio-export=svg]')?.disabled,active:[...document.querySelector('.topology-studio iframe').contentDocument.querySelectorAll('[data-resizing],[data-scaling],[data-dragging],[data-device-dragging]')].map(e=>e.outerHTML.slice(0,160)),warnings:[...document.querySelectorAll('.studio-preview-warning')].map(e=>e.textContent)};"))); };
  const select = async (selector, value) => { await page.evaluate(`const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(String(value))};e.dispatchEvent(new Event('change',{bubbles:true}));`); await ready(); };
  const click = async (selector, text) => { await page.evaluate(`const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>${text ? `e.textContent.trim()===${JSON.stringify(text)}` : 'true'});if(!e)throw Error('Missing control');e.click();`); await delay(180); };
  const shot = async name => { const r=await page.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(output,name+'.png'),Buffer.from(r.data,'base64')); };
  const test = async (name, fn) => { try { await fn();report.results['studio usability: '+name]={passed:true}; } catch(error) { report.results['studio usability: '+name]={passed:false,error:error.stack};await shot('failure');throw error; } };
  if (await page.evaluate("return !!document.querySelector('.topology-studio');")) { await page.evaluate("document.querySelector('.studio-header [aria-label=Close]').click();"); await delay(150); }
  await page.send('Emulation.setDeviceMetricsOverride',{width:2560,height:1440,deviceScaleFactor:1,mobile:false});
  await page.evaluate("lang.getState().setLanguage('en');theme.getState().setTheme('graphite-dark');for(const d of sim.net.devices.values())for(const i of d.interfaces)if(i.ip&&i.ipv4Mode==='unconfigured')i.configureIpv4({mode:'static',ip:i.ip,gateway:i.gateway,dns:i.dns});store.getState().refresh();const f=await import('/src/export/studio/blocks.fixture.ts');const r=await ws.controller.openDocument(f.blocksFixture('four'));if(!r.ok)throw Error(JSON.stringify(r.error));await ws.controller.flush();window.usabilitySource=studioProject();");
  await click('.toolbar-menu-trigger','File');await click('.toolbar-menu-action[aria-haspopup=menu]');await click('[data-open-topology-studio]');
  await select('[data-studio-preset]','presentation');await select('[data-studio-diagram-scale]','0.6');
  await page.evaluate("const e=document.querySelector('[data-studio-alignment-guides]');if(e?.checked)e.click();");
  const geometry = () => page.evaluate("return document.querySelector('.topology-studio iframe').dataset.previewHtml;");
  const fit = async () => {
    const result=await page.evaluate("const f=document.querySelector('.topology-studio iframe'),stage=document.querySelector('.studio-preview-stage'),p=f.contentDocument.querySelector('.print-page'),fr=f.getBoundingClientRect(),sr=stage.getBoundingClientRect(),pr=p.getBoundingClientRect(),k=fr.width/f.offsetWidth;return {left:fr.x+pr.x*k,top:fr.y+pr.y*k,right:fr.x+pr.right*k,bottom:fr.y+pr.bottom*k,area:{left:sr.left,top:sr.top,right:sr.left+stage.clientWidth,bottom:sr.top+stage.clientHeight}};");
    assert(result.left>=result.area.left-1&&result.top>=result.area.top-1&&result.right<=result.area.right+1&&result.bottom<=result.area.bottom+1,JSON.stringify(result));
  };
  if (process.env.NETLAB_STUDIO_USABILITY_CHECKPOINT !== '3') {
  await test('checkpoint 2: maximize restores dimensions and Fit Page fits A4/A3 at 2560, 1440 and 700 px',async()=>{
    for(const width of [2560,1440,700]) {
      await page.send('Emulation.setDeviceMetricsOverride',{width,height:width===2560?1440:1000,deviceScaleFactor:1,mobile:false});await ready();
      const original=await page.evaluate("const r=document.querySelector('.topology-studio').getBoundingClientRect();return [r.width,r.height];");
      for(const maximized of [false,true]) {
        if(maximized)await click('[data-studio-maximize]');
        for(const paper of ['A4','A3'])for(const orientation of ['landscape','portrait']) {
          await select('[data-studio-paper]',paper);await select('[data-studio-orientation]',orientation);const before=await geometry();
          for(const zoom of ['page','0','0.5','1','1.25']){await select('[data-studio-zoom]',zoom);assert.equal(await geometry(),before);if(zoom==='page')await fit();}
          await select('[data-studio-zoom]','page');if(paper==='A4'&&orientation==='landscape')await shot(`${width}-${maximized?'maximized':'normal'}-fit-page`);
        }
      }
      await click('[data-studio-maximize]');assert.deepEqual(await page.evaluate("const r=document.querySelector('.topology-studio').getBoundingClientRect();return [r.width,r.height];"),original);
    }
  });
  await test('checkpoint 2: presets, themes and later report pages retain geometry and current sheet',async()=>{
    await page.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await select('[data-studio-paper]','A4');await select('[data-studio-orientation]','landscape');
    for(const preset of ['clean','technical','presentation'])for(const theme of ['graphite-dark','classic-light']) {
      await select('[data-studio-preset]',preset);await page.evaluate(`theme.getState().setTheme('${theme}');`);const before=await geometry();
      await click('[data-studio-maximize]');await select('[data-studio-zoom]','page');await click('[data-studio-maximize]');assert.equal(await geometry(),before);
    }
    await select('[data-studio-preset]','technical');await select('[data-studio-zoom]','1');
    await page.evaluate("const f=document.querySelector('.topology-studio iframe'),p=f.contentDocument.querySelectorAll('.print-page')[1],s=document.querySelector('.studio-preview-stage');s.scrollTop=p.offsetTop-16;s.dispatchEvent(new Event('scroll'));");
    await select('[data-studio-zoom]','page');assert(await page.evaluate("const f=document.querySelector('.topology-studio iframe'),p=f.contentDocument.querySelectorAll('.print-page')[1],s=document.querySelector('.studio-preview-stage'),k=f.getBoundingClientRect().width/f.offsetWidth;return Math.abs(s.scrollTop-(p.offsetTop-16)*k)<2;"));
    assert.equal(await page.evaluate('return studioProject();'),await page.evaluate('return usabilitySource;'));
  });
  }
  if (process.env.NETLAB_STUDIO_USABILITY_CHECKPOINT === '2') { report.usabilityReview={output}; return; }
  await page.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await select('[data-studio-preset]','presentation');await select('[data-studio-paper]','A3');await select('[data-studio-orientation]','landscape');await select('[data-studio-zoom]','page');
  await page.evaluate("theme.getState().setTheme('graphite-dark');document.querySelector('.studio-preview-stage').scrollTop=0;document.querySelector('[data-studio-add-block-panel]').open=true;");
  for(const id of ['A','B','D']){await select('[data-studio-block-device]',id);await click('[data-studio-add-block]');await ready();}
  const probe = `const s=window.usabilitySvg??document.querySelector('.topology-studio iframe').contentDocument.querySelector('[data-print-section=diagram] svg');return {viewBox:s.getAttribute('viewBox'),area:{x:+s.dataset.contentX,y:+s.dataset.contentY,width:+s.dataset.contentWidth,height:+s.dataset.contentHeight},cards:[...s.querySelectorAll('[data-device]')].map(g=>[g.dataset.device,g.dataset.x,g.dataset.y,g.dataset.width,g.dataset.height]),links:[...s.querySelectorAll('[data-link]')].map(g=>[g.dataset.link,...['points','x1','y1','x2','y2','stroke'].map(a=>g.getAttribute(a))]),tables:[...s.querySelectorAll('[data-document-block]')].map(g=>({id:g.dataset.documentBlock,device:g.dataset.blockDevice,x:+g.dataset.x,y:+g.dataset.y,width:+g.dataset.width,height:+g.dataset.height,text:g.textContent.replace(/\\s/g,''),lines:[...g.querySelectorAll('text')].map(t=>{const b=t.getBBox();return {x:b.x,y:b.y,width:b.width,height:b.height,text:t.textContent};})}))};`;
  const metrics=()=>page.evaluate(probe),settings=id=>`[data-studio-block-settings="${id}"]`;
  // Browser glyph bounds vary slightly with CSS zoom. Compare literal content
  // and document geometry exactly; verify rendered glyph containment separately.
  const scene=m=>({...m,tables:m.tables.map(({lines,...b})=>({...b,lines:lines.map(t=>t.text)}))});
  const input=async(selector,value)=>{await page.evaluate(`const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(String(value))});e.dispatchEvent(new Event('input',{bubbles:true}));`);await ready();};
  const position=async(id,x,y)=>{await page.evaluate(`document.querySelector(${JSON.stringify(settings(id)+' [data-block-advanced]')}).open=true;`);await input(settings(id)+' [data-block-x]',x*25.4/96);await input(settings(id)+' [data-block-y]',y*25.4/96);};
  let m=await metrics();const [a,b,d]=m.tables.map(t=>t.id);
  await position(a,m.area.x+12,m.area.y+12);await position(b,m.area.x+m.area.width-312,m.area.y+12);await position(d,m.area.x+12,m.area.y+230);
  await page.evaluate(`document.querySelector(${JSON.stringify(settings(d)+' [data-block-column=origin]')}).click();`);await ready();
  const verify=async()=>{const m=await metrics();for(const b of m.tables){assert(b.x>=m.area.x-.1&&b.y>=m.area.y-.1&&b.x+b.width<=m.area.x+m.area.width+.1&&b.y+b.height<=m.area.y+m.area.height+.1,'Table stays in printable area');for(const t of b.lines)assert(t.x>=0&&t.y>=0&&t.x+t.width<=b.width+1&&t.y+t.height<=b.height+1,'No clipped text: '+t.text);}return m;};
  const pointer=async(selector,corner=false)=>{
    await page.evaluate(`const f=document.querySelector('.topology-studio iframe'),g=f.contentDocument.querySelector(${JSON.stringify(selector)}),s=document.querySelector('.studio-preview-stage');let r=g.getBoundingClientRect(),fr=f.getBoundingClientRect(),k=fr.width/f.offsetWidth,sr=s.getBoundingClientRect(),x=fr.x+(r.x+${corner?'r.width-9':'r.width/2'})*k,y=fr.y+(r.y+r.height/2)*k;s.scrollLeft+=Math.max(0,x-sr.right+35)+Math.min(0,x-sr.left-35);s.scrollTop+=Math.max(0,y-sr.bottom+35)+Math.min(0,y-sr.top-35);`);
    await delay(60);
    return page.evaluate(`const f=document.querySelector('.topology-studio iframe'),g=f.contentDocument.querySelector(${JSON.stringify(selector)}),r=g.getBoundingClientRect(),fr=f.getBoundingClientRect(),k=fr.width/f.offsetWidth;return {x:fr.x+(r.x+${corner?'r.width-9':'r.width/2'})*k,y:fr.y+(r.y+r.height/2)*k,k:k*g.ownerSVGElement.getScreenCTM().a};`);
  };
  const gesture=async(selector,dx,dy,{resize=false,cancel=false}={})=>{
    await page.send('Page.bringToFront');
    const p=await pointer(selector,resize);await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x,y:p.y});await delay(80);
    await page.send('Input.dispatchMouseEvent',{type:'mousePressed',x:p.x,y:p.y,button:'left',buttons:1,clickCount:1});
    for(let n=1;n<=5;n++)await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x+dx*p.k*n/5,y:p.y+dy*p.k*n/5,buttons:1});await delay(50);
    assert(await page.evaluate(`return !!document.querySelector('.topology-studio iframe').contentDocument.querySelector('${resize?'[data-resizing=true]':selector.includes('data-device=')?'[data-device-dragging=true]':'[data-dragging=true]'}');`),'Native gesture remains active: '+JSON.stringify({selector,p}));
    const live=await metrics();assert(await page.evaluate("return document.querySelector('[data-studio-export=svg]').disabled;"));
    if(cancel)for(const type of ['keyDown','keyUp'])await page.send('Input.dispatchKeyEvent',{type,key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    await page.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x+dx*p.k,y:p.y+dy*p.k,button:'left',buttons:0,clickCount:1});await ready();return live;
  };
  const resize=async(id,dx,cancel=false)=>{
    const before=await metrics(),old=before.tables.find(t=>t.id===id),live=await gesture(`[data-document-block="${id}"]`,dx,0,{resize:true,cancel}),after=await verify(),now=after.tables.find(t=>t.id===id);
    for(const current of [live,after]){assert.deepEqual(current.cards,before.cards);assert.deepEqual(current.links,before.links);assert.deepEqual(current.tables.filter(t=>t.id!==id),before.tables.filter(t=>t.id!==id));}
    assert.equal(now.x,old.x);assert.equal(now.y,old.y);assert.equal(now.text,old.text);
    if(cancel)assert.deepEqual(now,old);else {assert(Math.abs(now.width-(old.width+dx))<1,'Pointer movement uses physical document width');assert(Math.abs(live.tables.find(t=>t.id===id).width-now.width)<1,'Live reflow matches release');}
    return {before:old,after:now};
  };
  await test('checkpoint 1 evidence: genuine before/after rendering of three routes, compact DE labels and no count footer',async()=>{
    const render=path.join(output,'before/render');await mkdir(render,{recursive:true});
    let old=await readFile(path.join(output,'before/src/routingBlocks.ts'),'utf8');old=old.replaceAll("from './","from '/src/export/studio/").replace("from '/src/export/studio/messages'","from './messages'");await writeFile(path.join(render,'routingBlocks.ts'),old);
    await writeFile(path.join(render,'messages.ts'),(await readFile(path.join(output,'before/src/messages.ts'),'utf8')).replaceAll("from '../../","from '/src/"));
    const content=await page.evaluate(`const model=await import('/src/export/studio/model.ts'),now=await import('/src/export/studio/routingBlocks.ts'),old=await import('/.playwright-mcp/reviews/topology-usability/before/render/routingBlocks.ts'),o=(await import('/src/export/studio/options.ts')).printPreset('clean',model.capturePrintSnapshot(sim.net,store.getState())),s=model.capturePrintSnapshot(sim.net,store.getState()),b=now.newRoutingBlock(s.devices.find(d=>d.id==='A'),'comparison');return [old,now].map(mod=>{const c=mod.routingBlockContent(s,b,o,'de');return {height:c.height,svg:'<svg xmlns="http://www.w3.org/2000/svg" width="302" height="'+(c.height+2)+'" style="font-family:Arial">'+mod.renderRoutingBlock({x:1,y:1,width:c.width,height:c.height,content:c,oversized:false,overlap:false},o)+'</svg>'};});`);
    assert(content[1].height<content[0].height-25);assert(!content[1].svg.includes('3 / 3'));
    const compare=await openPage();try{await compare.send('Emulation.setDeviceMetricsOverride',{width:900,height:500,deviceScaleFactor:1,mobile:false});const tree=await compare.send('Page.getFrameTree');await compare.send('Page.setDocumentContent',{frameId:tree.frameTree.frame.id,html:`<!doctype html><meta charset="utf-8"><style>body{font:18px Arial;background:#e4e8ec;margin:30px}main{display:flex;gap:40px}section{background:white;padding:18px}h2{font-size:18px}p{font-size:14px}</style><main><section><h2>Antes</h2>${content[0].svg}<p>${content[0].height}px</p></section><section><h2>Depois</h2>${content[1].svg}<p>${content[1].height}px</p></section></main>`});await compare.evaluate('await document.fonts.ready;');const shot=await compare.send('Page.captureScreenshot',{format:'png'});await writeFile(path.join(output,'compact-before-after.png'),Buffer.from(shot.data,'base64'));}finally{await compare.send('Page.close');compare.close();}
    report.usabilityCompact=content.map(c=>c.height);
  });
  await test('checkpoint 3: resize six routes live, preserve neighbours and cancel with Escape at every zoom',async()=>{
    const tableSvg=()=>page.evaluate(`const g=document.querySelector('.topology-studio iframe').contentDocument.querySelector('[data-document-block="${d}"]').cloneNode(true);g.setAttribute('transform','translate(1 1)');return '<svg xmlns="http://www.w3.org/2000/svg" width="'+(+g.dataset.width+2)+'" height="'+(+g.dataset.height+2)+'" style="font-family:Arial">'+g.outerHTML+'</svg>';`);
    await shot('resize-before');const old=await tableSvg(),result=await resize(d,220);assert(result.after.height<result.before.height);await shot('resize-after');const current=await tableSvg();
    const compare=await openPage();try{const tree=await compare.send('Page.getFrameTree');await compare.send('Emulation.setDeviceMetricsOverride',{width:1000,height:550,deviceScaleFactor:1,mobile:false});await compare.send('Page.setDocumentContent',{frameId:tree.frameTree.frame.id,html:`<!doctype html><meta charset="utf-8"><style>body{margin:24px;background:#e4e8ec;font:18px Arial}main{display:flex;gap:24px}section{padding:16px;background:white}h2{font-size:18px}p{font-size:14px}</style><main><section><h2>Antes do resize</h2>${old}<p>${result.before.width} × ${result.before.height}px</p></section><section><h2>Depois do resize</h2>${current}<p>${result.after.width} × ${result.after.height}px</p></section></main>`});await compare.evaluate('await document.fonts.ready;');const capture=await compare.send('Page.captureScreenshot',{format:'png'});await writeFile(path.join(output,'resize-table-before-after.png'),Buffer.from(capture.data,'base64'));}finally{await compare.send('Page.close');compare.close();}
    for(const zoom of ['page','0','0.5','1','1.25']) {await select('[data-studio-zoom]',zoom);await resize(d,12);await resize(d,-12,true);}
    await select('[data-studio-zoom]','page');await resize(d,-60);await verify();
  });
  await test('checkpoint 3: header drag, precise keyboard fields, manual device move and session recovery retain custom width',async()=>{
    const before=await metrics(),prior=before.tables.find(t=>t.id===d);await gesture(`[data-document-block="${d}"] [data-block-drag]`,10,-10);const moved=await metrics();
    assert(Math.abs(moved.tables.find(t=>t.id===d).x-prior.x-10)<1);assert.equal(moved.tables.find(t=>t.id===d).width,prior.width);assert.deepEqual(moved.tables.filter(t=>t.id!==d),before.tables.filter(t=>t.id!==d));
    await page.evaluate(`document.querySelector(${JSON.stringify(settings(d)+' [data-block-advanced]')}).open=true;document.querySelector(${JSON.stringify(settings(d)+' [data-block-x]')}).focus();`);
    for(const [key,code] of [['ArrowUp',38],['ArrowDown',40]]){for(const type of ['keyDown','keyUp'])await page.send('Input.dispatchKeyEvent',{type,key,code:key,windowsVirtualKeyCode:code});await ready();}
    assert(Math.abs((await metrics()).tables.find(t=>t.id===d).x-prior.x-10)<.1,'Precise keyboard positioning is retained');
    const positioned=await metrics();await gesture('[data-device="C"]',12,8);const device=await metrics();assert.deepEqual(device.tables,positioned.tables);assert.notDeepEqual(device.links,positioned.links);
    const chosen=device.tables.find(t=>t.id===d).width;
    for(const preset of ['technical','clean','presentation']){await select('[data-studio-preset]',preset);assert.equal((await metrics()).tables.find(t=>t.id===d).width,chosen);}
    await reopenStudio(page);await ready();assert.equal((await metrics()).tables.find(t=>t.id===d).width,chosen);
    await select('[data-studio-paper]','A3');await select('[data-studio-orientation]','portrait');await verify();await select('[data-studio-paper]','A3');await select('[data-studio-orientation]','landscape');await verify();
    assert.equal((await metrics()).tables.find(t=>t.id===d).width,chosen);
    assert.equal(await page.evaluate('return studioProject();'),await page.evaluate('return usabilitySource;'));
  });
  await test('checkpoint 3: actual SVG PNG HTML and printed PDFs share resized geometry without editing affordances',async()=>{
    await select('[data-studio-paper]','A3');await select('[data-studio-orientation]','landscape');await select('[data-studio-zoom]','page');await click('[data-studio-maximize]');await shot('resized-final-preview');
    const download=async kind=>{const n=report.downloads.length;page.labelDownloads('studio-usability-resized-'+kind);await click(`[data-studio-export=${kind}]`);for(let i=0;i<150&&report.downloads.length===n;i++)await delay(40);assert.equal(report.downloads.length,n+1);await page.drainDownloads();const bytes=await readFile(path.join(downloads,report.downloads.at(-1).guid));await writeFile(path.join(output,'resized.'+kind),bytes);return bytes;};
    const svg=(await download('svg')).toString('utf8'),png=await download('png'),html=(await download('html')).toString('utf8');
    assert(html.includes(svg));assert(!svg.includes('data-block-resize'));assert(!svg.includes('data-studio-block-ui'));assert(!svg.includes('data-selected-device'));
    const expected=await metrics();const comparison=await page.evaluate(`window.usabilitySvg=new DOMParser().parseFromString(${JSON.stringify(svg)},'image/svg+xml').documentElement;document.body.appendChild(usabilitySvg);const result=await(async()=>{${probe}})();usabilitySvg.remove();delete window.usabilitySvg;return result;`);assert.deepEqual(scene(comparison),scene(expected));
    const [,,w,h]=expected.viewBox.split(' ').map(Number);assert(Math.abs(png.readUInt32BE(16)-w*3)<1);assert(Math.abs(png.readUInt32BE(20)-h*3)<1);
    const printer=await openPage();try{await printer.send('Emulation.setDeviceMetricsOverride',{width:1600,height:1000,deviceScaleFactor:1,mobile:false});let tree=await printer.send('Page.getFrameTree');
      const compareHtml=`<!doctype html><meta charset="utf-8"><style>body{background:#e4e8ec;font:18px Arial;margin:16px}main{display:grid;grid-template-columns:1fr 1fr;gap:16px}section{background:white;padding:12px;min-width:0}h2{font-size:18px}svg,img{width:100%;height:auto}</style><main><section><h2>Prévia confirmada</h2>${svg}</section><section><h2>PNG exportado</h2><img src="data:image/png;base64,${png.toString('base64')}"></section></main>`;
      await printer.send('Page.setDocumentContent',{frameId:tree.frameTree.frame.id,html:compareHtml});await printer.evaluate('await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()));');const capture=await printer.send('Page.captureScreenshot',{format:'png'});await writeFile(path.join(output,'resized-preview-png.png'),Buffer.from(capture.data,'base64'));
      for(const paper of ['A4','A3'])for(const orientation of ['landscape','portrait']){await select('[data-studio-paper]',paper);await select('[data-studio-orientation]',orientation);const current=await metrics(),html=await geometry();await printer.send('Page.setDocumentContent',{frameId:tree.frameTree.frame.id,html});await printer.evaluate('await document.fonts.ready;');
        const printed=await printer.evaluate(`window.usabilitySvg=document.querySelector('[data-print-section=diagram] svg');${probe}`);assert.deepEqual(scene(printed),scene(current));const pdf=await printer.send('Page.printToPDF',{printBackground:true,preferCSSPageSize:true}),bytes=Buffer.from(pdf.data,'base64');assert.equal(Math.max(...[...bytes.toString('latin1').matchAll(/\/Count\s+(\d+)/g)].map(m=>+m[1])),1);await writeFile(path.join(output,`resized-${paper}-${orientation}.pdf`),bytes);
      }
    }finally{await printer.send('Page.close');printer.close();}
    // Printing the interactive preview also hides all preview-only controls.
    await page.evaluate("window.usabilityPrint=null;const f=document.querySelector('.topology-studio iframe'),w=f.contentWindow;w.addEventListener('beforeprint',()=>{usabilityPrint={ui:w.getComputedStyle(w.document.querySelector('[data-studio-block-ui]')).display,selected:w.document.querySelectorAll('[data-selected-device]').length};},{once:true});");await click('[data-studio-print]');assert.deepEqual(await page.evaluate('return usabilityPrint;'),{ui:'none',selected:0});
    await select('[data-studio-paper]','A4');await select('[data-studio-orientation]','landscape');
    await select(settings(d)+' [data-block-width]','compact');assert.equal((await metrics()).tables.find(t=>t.id===d).width,300);
  });
  report.usabilityReview={output};
}
