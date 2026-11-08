import { reopenStudio } from './studio-review-reopen.mjs';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Actual pointer interactions in the disposable Studio; no production database. */
export async function runTopologyDevicesReview({ page, root, report, downloads, openPage }) {
  const output=path.join(root,'.playwright-mcp/reviews/topology-devices');await mkdir(output,{recursive:true});
  const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const wait=async expression=>{for(let n=0;n<250;n++){if(await page.evaluate(`return !!(${expression});`))return;await delay(40);}throw Error('Device review timeout: '+expression);};
  const ready=async()=>{await delay(120);await wait("document.querySelector('.topology-studio iframe')?.contentDocument?.querySelector('[data-device]')&&!document.querySelector('[data-studio-print]').disabled");};
  const click=async(selector,text)=>{
    const p=await page.evaluate(`const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.getClientRects().length&&${text?`e.textContent.trim()===${JSON.stringify(text)}`:'true'});if(!e)throw Error('Missing '+${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};`);
    for(const type of ['mouseMoved','mousePressed','mouseReleased'])await page.send('Input.dispatchMouseEvent',{type,...p,...(type==='mouseMoved'?{}:{button:'left',clickCount:1})});await delay(100);
  };
  const select=async(selector,value)=>{await page.evaluate(`const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(String(value))};e.dispatchEvent(new Event('change',{bubbles:true}));`);await ready();};
  const escape=async()=>{for(const type of ['keyDown','keyUp'])await page.send('Input.dispatchKeyEvent',{type,key:'Escape',code:'Escape',windowsVirtualKeyCode:27});};
  const test=async(name,work)=>{try{await work();report.results['manual device positions: '+name]={passed:true};}catch(error){report.results['manual device positions: '+name]={passed:false,error:error.stack};await shot('failure').catch(()=>{});throw error;}};
  const shot=async name=>{await delay(100);const r=await page.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(output,name+'.png'),Buffer.from(r.data,'base64'));};
  const source=()=>page.evaluate('return studioProject();');
  const assertSource=async()=>assert.equal(await source(),await page.evaluate('return devicesSourceBefore;'));
  const open=async scene=>{
    if(await page.evaluate("return !!document.querySelector('.topology-studio');")){await page.evaluate("document.querySelector('[data-studio-preset]').focus();");await escape();await wait("!document.querySelector('.topology-studio')");}
    await page.send('Emulation.setDeviceMetricsOverride',{width:1600,height:1050,deviceScaleFactor:1,mobile:false});
    await page.evaluate(`lang.getState().setLanguage('en');theme.getState().setTheme('graphite-dark');for(const d of sim.net.devices.values())for(const i of d.interfaces)if(i.ip&&i.ipv4Mode==='unconfigured')i.configureIpv4({mode:'static',ip:i.ip,gateway:i.gateway,dns:i.dns});store.getState().refresh();const f=await import('/src/export/studio/blocks.fixture.ts');const r=await ws.controller.openDocument(f.blocksFixture('${scene}'));if(!r.ok)throw Error(JSON.stringify(r.error));
      if('${scene}'==='four'){store.getState().setPendingMarkingRect({x:-60,y:-50,width:500,height:740});store.getState().createFreeMarking({name:'Presentation area',color:'blue',intensity:18});}
      await ws.controller.flush();window.devicesSourceBefore=studioProject();window.devicesLinks=(await import('/src/export/studio/model.ts')).capturePrintSnapshot(sim.net,store.getState()).links;`);
    await click('.toolbar-menu-trigger','File');await click('.toolbar-menu-action[aria-haspopup=menu]');await click('[data-open-topology-studio]');await ready();
  };
  // This probe also runs against XML from the real SVG/HTML downloads.
  const probe=`const s=window.probeSvg??document.querySelector('.topology-studio iframe').contentDocument.querySelector('[data-print-section=diagram] svg'),world=s.querySelector('[data-topology]'),m=world.transform.baseVal.consolidate().matrix;
    const project=p=>({x:p.x*m.a+p.y*m.c+m.e,y:p.x*m.b+p.y*m.d+m.f});
    return{transform:world.getAttribute('transform'),viewBox:s.getAttribute('viewBox'),area:{x:Number(s.dataset.contentX),y:Number(s.dataset.contentY),width:Number(s.dataset.contentWidth),height:Number(s.dataset.contentHeight)},
      cards:[...s.querySelectorAll('[data-device]')].map(g=>({id:g.dataset.device,x:Number(g.dataset.x),y:Number(g.dataset.y),width:Number(g.dataset.width),height:Number(g.dataset.height),manual:g.dataset.manual})),
      tables:[...s.querySelectorAll('[data-document-block]')].map(g=>({id:g.dataset.documentBlock,x:Number(g.dataset.x),y:Number(g.dataset.y),width:Number(g.dataset.width),height:Number(g.dataset.height),text:g.textContent})),
      areas:[...world.querySelectorAll('[data-studio-area] > path')].map(p=>[p.getAttribute('d'),p.getAttribute('fill')]),
      links:[...s.querySelectorAll('[data-link]')].map(e=>({id:e.dataset.link,points:(e.tagName==='line'?[{x:Number(e.getAttribute('x1')),y:Number(e.getAttribute('y1'))},{x:Number(e.getAttribute('x2')),y:Number(e.getAttribute('y2'))}]:[...e.points].map(p=>({x:p.x,y:p.y}))).map(project),labels:[...s.querySelectorAll('[data-cable-label]')].filter(g=>g.dataset.cableLabel===e.dataset.link).map(g=>g.textContent.replace(/\\s/g,''))}))};`;
  const metrics=()=>page.evaluate(probe);
  const sameOtherCards=(before,after,id)=>assert.deepEqual(after.cards.filter(c=>c.id!==id),before.cards.filter(c=>c.id!==id),'All other device positions remain fixed');
  const checkConnections=async()=>{
    const current=await metrics(),links=await page.evaluate('return devicesLinks;');assert.deepEqual(current.links.map(l=>l.id),links.map(l=>l.id));
    const border=(p,c)=>p.x>=c.x-.15&&p.x<=c.x+c.width+.15&&p.y>=c.y-.15&&p.y<=c.y+c.height+.15&&Math.min(Math.abs(p.x-c.x),Math.abs(p.x-c.x-c.width),Math.abs(p.y-c.y),Math.abs(p.y-c.y-c.height))<.15;
    for(const link of current.links){const actual=links.find(l=>l.id===link.id),a=current.cards.find(c=>c.id===actual.a[0]),b=current.cards.find(c=>c.id===actual.b[0]);if(!a||!b)continue;assert(border(link.points[0],a)&&border(link.points.at(-1),b),'Real endpoints on resized/moved borders: '+link.id);
      if(link.labels.length)assert.deepEqual(link.labels,[actual.a[1],actual.b[1]],'Real interface names retained');}
    for(const c of current.cards)if(c.manual==='true')assert(c.x>=current.area.x-.1&&c.y>=current.area.y-.1&&c.x+c.width<=current.area.x+current.area.width+.1&&c.y+c.height<=current.area.y+current.area.height+.1,'Manually placed card fits the printable area');
    return current;
  };
  const pointer=async id=>page.evaluate(`const f=document.querySelector('.topology-studio iframe'),s=f.contentDocument.querySelector('[data-print-section=diagram] svg'),g=[...s.querySelectorAll('[data-device]')].find(g=>g.dataset.device===${JSON.stringify(id)}),stage=document.querySelector('.studio-preview-stage');
    let r=g.getBoundingClientRect(),fr=f.getBoundingClientRect(),k=fr.width/f.offsetWidth;const cy=fr.y+(r.y+r.height/2)*k,cx=fr.x+(r.x+r.width/2)*k,sr=stage.getBoundingClientRect();stage.scrollTop+=Math.max(0,cy-sr.bottom+70)+Math.min(0,cy-sr.top-50);stage.scrollLeft+=Math.max(0,cx-sr.right+70)+Math.min(0,cx-sr.left-50);r=g.getBoundingClientRect();fr=f.getBoundingClientRect();return{x:fr.x+(r.x+r.width/2)*k,y:fr.y+(r.y+r.height/2)*k,k:k*s.getScreenCTM().a,scroll:[stage.scrollLeft,stage.scrollTop]};`);
  const drag=async(id,dx,dy,cancel=false)=>{
    // These legacy checks assert exact free-drag deltas; snap has its own review.
    await page.evaluate("const e=document.querySelector('[data-studio-alignment-guides]');if(e?.checked)e.click();");
    const before=await metrics(),card=before.cards.find(c=>c.id===id),p=await pointer(id);
    // Let the compositor apply the helper's stage scroll before native hit testing.
    await delay(60);
    await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x,y:p.y});await page.send('Input.dispatchMouseEvent',{type:'mousePressed',x:p.x,y:p.y,button:'left',buttons:1,clickCount:1});
    for(let n=1;n<=5;n++)await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x+dx*p.k*n/5,y:p.y+dy*p.k*n/5,buttons:1});await delay(70);
    assert(await page.evaluate("return !!document.querySelector('.topology-studio iframe').contentDocument.querySelector('[data-device-dragging=true]');"),'Active card indication');
    const during=await metrics();sameOtherCards(before,during,id);assert.deepEqual(during.tables,before.tables);assert.equal(during.transform,before.transform);assert.deepEqual(during.areas,before.areas);
    if(dx||dy){const connected=before.links.filter(l=>{const c=card;return l.points.some(p=>p.x>=c.x-.2&&p.x<=c.x+c.width+.2&&p.y>=c.y-.2&&p.y<=c.y+c.height+.2);});assert(connected.some(c=>JSON.stringify(c.points)!==JSON.stringify(during.links.find(l=>l.id===c.id).points)),'Cables follow before releasing pointer');}
    assert.deepEqual(await page.evaluate("const s=document.querySelector('.studio-preview-stage');return[s.scrollLeft,s.scrollTop];"),p.scroll,'Dragging does not scroll the page');
    if(cancel)await escape();await page.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x+dx*p.k,y:p.y+dy*p.k,button:'left',buttons:0,clickCount:1});await ready();
    const after=await checkConnections(),changed=after.cards.find(c=>c.id===id);
    const target={x:Math.max(before.area.x+card.width/2,Math.min(before.area.x+before.area.width-card.width/2,card.x+card.width/2+dx)),y:Math.max(before.area.y+card.height/2,Math.min(before.area.y+before.area.height-card.height/2,card.y+card.height/2+dy))};
    assert(Math.abs(changed.x+(changed.width/2)-(cancel?card.x+card.width/2:target.x))<1&&Math.abs(changed.y+changed.height/2-(cancel?card.y+card.height/2:target.y))<1,'Document coordinates independent of zoom');
    sameOtherCards(before,after,id);assert.deepEqual(after.tables,before.tables);assert.deepEqual(after.areas,before.areas);assert.equal(after.transform,before.transform);await assertSource();return after;
  };
  const addTable=async id=>{await page.evaluate("document.querySelector('[data-studio-add-block-panel]').open=true;");await select('[data-studio-block-device]',id);await click('[data-studio-add-block]');await ready();};
  const download=async(kind,label)=>{const count=report.downloads.length;page.labelDownloads('manual-devices-'+label+'-'+kind);await click('[data-studio-export='+kind+']');for(let n=0;n<100&&report.downloads.length===count;n++)await delay(40);assert.equal(report.downloads.length,count+1);await page.drainDownloads();const file=report.downloads.at(-1),bytes=await readFile(path.join(downloads,file.guid));await writeFile(path.join(output,label+'.'+kind),bytes);return bytes;};
  const compareExports=async label=>{
    const expected=await metrics(),svg=(await download('svg',label)).toString('utf8'),png=await download('png',label),html=(await download('html',label)).toString('utf8');
    const actual=await page.evaluate(`window.probeSvg=new DOMParser().parseFromString(${JSON.stringify(svg)},'image/svg+xml').documentElement;const result=await(async()=>{${probe}})();delete window.probeSvg;return result;`);
    assert.deepEqual(actual,expected,'Preview and real SVG download share card/cable/table coordinates');assert(html.includes(svg),'HTML uses the exact exported SVG');
    const [,,width,height]=expected.viewBox.split(' ').map(Number);assert(Math.abs(png.readUInt32BE(16)-width*3)<=1&&Math.abs(png.readUInt32BE(20)-height*3)<=1);
    const compare=await openPage();try{const tree=await compare.send('Page.getFrameTree');await compare.send('Emulation.setDeviceMetricsOverride',{width:1600,height:900,deviceScaleFactor:1,mobile:false});
      const content=`<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#e4e8ec;font:18px Arial}main{display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:16px}section{padding:14px;background:white;min-width:0}h2{font-size:18px}svg,img{width:100%;height:auto}</style><main><section><h2>Prévia · posições ajustadas</h2>${svg}</section><section><h2>PNG exportado · ${label}</h2><img src="data:image/png;base64,${png.toString('base64')}"></section></main>`;
      await compare.send('Page.setDocumentContent',{frameId:tree.frameTree.frame.id,html:content});await compare.evaluate('await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()));');const capture=await compare.send('Page.captureScreenshot',{format:'png'});await writeFile(path.join(output,label+'-preview-export.png'),Buffer.from(capture.data,'base64'));await writeFile(path.join(output,label+'-comparison.html'),content);
    }finally{await compare.send('Page.close');compare.close();}return{svg,png,html};
  };

  await test('A: move a router with two real links; live endpoints and export agree',async()=>{
    await open('simple');await select('[data-studio-diagram-scale]','0.7');await click('[data-studio-diagram-option=cableLabels]');await ready();await shot('01-small-original');await drag('A',50,18);await shot('02-small-adjusted');await compareExports('small-adjusted');
  });
  let original;
  await test('B: move B laterally and D vertically without moving neighbours or Markierungen',async()=>{
    await open('four');await select('[data-studio-preset]','presentation');await select('[data-studio-diagram-scale]','0.8');await click('[data-studio-diagram-option=cableLabels]');await ready();original=await metrics();assert(original.areas.length>0);await shot('03-four-original');
    await drag('B',30,0);await drag('D',0,30);await shot('04-four-adjusted');
  });
  await test('C: two positioned Routing Tables remain fixed while equipment moves',async()=>{
    const before=await metrics();await addTable('A');await addTable('D');const added=await metrics();assert.deepEqual(added.cards,before.cards);assert.equal(added.transform,before.transform);
    await drag('B',-20,-12);await shot('05-devices-and-tables');await compareExports('devices-and-tables');
  });
  await test('D: interface IPv4 and gateway toggles resize a card while preserving its document center',async()=>{
    const b=(await metrics()).cards.find(c=>c.id==='B'),chosen={x:b.x+b.width/2,y:b.y+b.height/2};
    for(const key of ['interfaces','ipv4','gateways']){await click('[data-studio-diagram-option='+key+']');await ready();const m=await checkConnections(),current=m.cards.find(c=>c.id==='B');assert(Math.abs(current.x+current.width/2-chosen.x)<.1&&Math.abs(current.y+current.height/2-chosen.y)<.1,'Chosen center survives content changes');}
    await shot('06-content-resized');for(const key of ['gateways','ipv4','interfaces']){await click('[data-studio-diagram-option='+key+']');await ready();}
  });
  await test('E: fit width 50% 100% 125%, both orientations, A4/A3, margins and diagram scale',async()=>{
    for(const zoom of ['0','0.5','1','1.25']){const prior=await metrics();await select('[data-studio-zoom]',zoom);assert.deepEqual((await metrics()).cards,prior.cards);await drag('B',8,4);}
    await select('[data-studio-zoom]','0');
    // A paper change can make deliberately retained absolute positions overlap.
    // Explicitly recover the tables before testing a card covered by a table;
    // the drag itself must never move those tables on the user's behalf.
    for(const paper of ['A4','A3'])for(const orientation of ['portrait','landscape']){await select('[data-studio-paper]',paper);await select('[data-studio-orientation]',orientation);await click('[data-studio-reset-blocks]');await ready();await drag('D',5,-5);}
    await select('[data-studio-paper]','A4');await select('[data-studio-orientation]','landscape');for(const margin of ['10','20','15']){await select('[data-studio-margin]',margin);await checkConnections();}
    await select('[data-studio-diagram-scale]','0.6');await checkConnections();await drag('B',-10,5);await select('[data-studio-diagram-scale]','0.8');await checkConnections();
    const prior=await metrics(),b=prior.cards.find(c=>c.id==='B'),cx=b.x+b.width/2,cy=b.y+b.height/2;await drag('B',-cx-30,prior.area.y-cy-30);const edge=(await metrics()).cards.find(c=>c.id==='B');assert(Math.abs(edge.x-prior.area.x)<.1&&Math.abs(edge.y-prior.area.y)<.1);await drag('B',cx-edge.x-edge.width/2,cy-edge.y-edge.height/2);await drag('B',15,5,true);
    const chosen=(await metrics()).cards.filter(c=>c.manual==='true').map(c=>({id:c.id,x:c.x+c.width/2,y:c.y+c.height/2}));for(const preset of ['clean','technical','presentation']){await select('[data-studio-preset]',preset);const m=await checkConnections();for(const p of chosen){const c=m.cards.find(c=>c.id===p.id);assert.equal(c.manual,'true');assert(Math.abs(c.x+c.width/2-p.x)<.1&&Math.abs(c.y+c.height/2-p.y)<.1);}}
    await click('[data-studio-diagram-option=cableLabels]');await ready();await checkConnections();
  });
  await test('F: identical manual geometry in SVG PNG HTML and printed A4/A3 PDFs',async()=>{
    await compareExports('final-adjusted');const beforePrint=await metrics();
    await page.evaluate("window.devicePrintCapture=null;const w=document.querySelector('.topology-studio iframe').contentWindow;w.addEventListener('beforeprint',()=>{devicePrintCapture={highlighted:w.document.querySelectorAll('[data-selected-device]').length,cards:[...w.document.querySelectorAll('[data-device]')].map(g=>[g.dataset.device,g.dataset.x,g.dataset.y])};},{once:true});");
    await click('[data-studio-print]');const nativePrint=await page.evaluate('return devicePrintCapture;');assert.equal(nativePrint.highlighted,0,'Selection indication stays out of print');assert.deepEqual(nativePrint.cards,beforePrint.cards.map(c=>[c.id,String(c.x),String(c.y)]));
    const printer=await openPage();try{
      for(const paper of ['A4','A3'])for(const orientation of ['landscape','portrait']){await select('[data-studio-paper]',paper);await select('[data-studio-orientation]',orientation);const html=await page.evaluate("return document.querySelector('.topology-studio iframe').dataset.previewHtml;"),tree=await printer.send('Page.getFrameTree');await printer.send('Page.setDocumentContent',{frameId:tree.frameTree.frame.id,html});await printer.evaluate('await document.fonts.ready;');
        const current=await metrics();const printed=await printer.evaluate(`window.devicesLinks=${JSON.stringify(await page.evaluate('return devicesLinks;'))};window.probeSvg=document.querySelector('[data-print-section=diagram] svg');${probe}`);assert.deepEqual(printed,current,'PDF document uses the same geometry');
        const pdf=await printer.send('Page.printToPDF',{printBackground:true,preferCSSPageSize:true}),bytes=Buffer.from(pdf.data,'base64');assert.equal(Math.max(...[...bytes.toString('latin1').matchAll(/\/Count\s+(\d+)/g)].map(m=>Number(m[1]))),1);await writeFile(path.join(output,`adjusted-${paper}-${orientation}.pdf`),bytes);
      }
    }finally{await printer.send('Page.close');printer.close();}
    await select('[data-studio-paper]','A4');await select('[data-studio-orientation]','landscape');await assertSource();
  });
  await test('G: restore one device and all devices without changing the tables or preset',async()=>{
    const before=await metrics();await drag('B',0,0);await click('[data-studio-restore-device]');await ready();const one=await metrics();assert.deepEqual(one.cards.find(c=>c.id==='B'),original.cards.find(c=>c.id==='B'));sameOtherCards(before,one,'B');assert.deepEqual(one.tables,before.tables);
    await click('[data-studio-restore-devices]');await ready();const all=await metrics();assert.deepEqual(all.cards,original.cards);assert.deepEqual(all.tables,before.tables);assert.equal(await page.evaluate("return document.querySelector('[data-studio-preset]').value;"),'presentation');await assertSource();await shot('07-restored-devices');
  });
  await test('snapshot keeps surviving manual IDs and removes references to deleted devices',async()=>{
    await drag('B',18,0);await drag('D',0,15);const before=await metrics();await page.evaluate("store.getState().renameDevice('D','D refreshed');await ws.controller.flush();window.devicesSourceBefore=studioProject();");await reopenStudio(page);await ready();
    const refreshed=await metrics();for(const id of ['B','D']){const a=before.cards.find(c=>c.id===id),b=refreshed.cards.find(c=>c.id===id);assert(Math.abs(a.x+a.width/2-b.x-b.width/2)<.1&&Math.abs(a.y+a.height/2-b.y-b.height/2)<.1);assert.equal(b.manual,'true');}
    await page.evaluate("store.getState().deleteDevice('B');await ws.controller.flush();window.devicesSourceBefore=studioProject();window.devicesLinks=(await import('/src/export/studio/model.ts')).capturePrintSnapshot(sim.net,store.getState()).links;");await reopenStudio(page);await ready();assert(!(await metrics()).cards.some(c=>c.id==='B'));assert.equal((await metrics()).cards.find(c=>c.id==='D').manual,'true');await assertSource();
  });
  report.manualDevicesReview={output,scenarios:Object.keys(report.results).filter(k=>k.startsWith('manual device positions:')).length};await writeFile(path.join(output,'results.json'),JSON.stringify(report.manualDevicesReview,null,2));
}
