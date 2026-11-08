import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';

export async function runStudioInterfaceReview({page,url,root,report,downloads,openPage}) {
  const out=path.join(root,'.playwright-mcp/reviews/studio-interface'),refs=path.join(out,'referencias-chatgpt'),db='netlab-idb-test-'+crypto.randomUUID();await mkdir(refs,{recursive:true});
  const delay=ms=>new Promise(r=>setTimeout(r,ms));
  const wait=async expr=>{for(let i=0;i<200;i++){if(await page.evaluate(`return !!(${expr});`))return;await delay(30);}throw Error('Timeout: '+expr);};
  const ready=()=>wait("document.querySelector('.topology-studio iframe')?.contentDocument?.querySelector('[data-device]')&&!document.querySelector('[data-studio-print]').disabled");
  const click=async(selector)=>{await page.evaluate(`document.querySelector(${JSON.stringify(selector)}).click();`);await delay(60);};
  const value=async(selector,value)=>{await page.evaluate(`const e=document.querySelector(${JSON.stringify(selector)});const p=e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(e,${JSON.stringify(String(value))});if(e.tagName==='SELECT'&&e.value!==${JSON.stringify(String(value))})throw Error('Invalid review select value: '+${JSON.stringify(selector+'='+value)});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));`);await delay(35);};
  const test=async(name,fn)=>{try{await fn();report.results['studio interface: '+name]={passed:true};}catch(e){report.results['studio interface: '+name]={passed:false,error:e.stack};throw e;}};
  const init=async()=>{await wait("document.readyState==='complete'&&document.getElementById('root')");await page.evaluate(`window.store=(await import('/src/store.ts')).useStore;window.sim=(await import('/src/sim.ts')).sim;window.lang=(await import('/src/i18n/index.ts')).useLanguage;window.theme=(await import('/src/uiTheme.ts')).useUiTheme;window.ws=await(await import('/src/workspace/reviewEntry.tsx')).mountWorkspaceReview(document.getElementById('root'),{databaseName:${JSON.stringify(db)}});lang.getState().setLanguage('de');theme.getState().setTheme('graphite-dark');window.source=()=>{const d=structuredClone(store.getState().captureWorkspaceDocument());if(d.topology.ui)delete d.topology.ui.topologyStudio;return JSON.stringify(d);};`);await wait("document.querySelector('.react-flow')");};
  const open=async()=>{await click('.toolbar-menu-trigger');await page.evaluate("[...document.querySelectorAll('.toolbar-menu-action[aria-haspopup=menu]')][0].click();");await click('[data-open-topology-studio]');await ready();};
  const close=()=>click('.studio-header .studio-window-actions button:last-child');
  const shot=async name=>{const r=await page.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(refs,name+'.png'),Buffer.from(r.data,'base64'));};
  // Document↔topology conversion differs at machine epsilon after cancel/undo.
  const rounded=value=>typeof value==='number'?+value.toFixed(6):typeof value==='string'?value.replace(/-?\d+\.\d{7,}/g,n=>String(+Number(n).toFixed(6))):Array.isArray(value)?value.map(rounded):Object.fromEntries(Object.entries(value).map(([k,v])=>[k,rounded(v)]));
  const metrics=async()=>rounded(await page.evaluate("const s=document.querySelector('.topology-studio iframe').contentDocument.querySelector('[data-print-section=diagram] svg');return{cards:[...s.querySelectorAll('[data-device]')].map(g=>({id:g.dataset.device,x:+g.dataset.x,y:+g.dataset.y,width:+g.dataset.width,height:+g.dataset.height})),tables:[...s.querySelectorAll('[data-document-block]')].map(g=>({id:g.dataset.documentBlock,x:+g.dataset.x,y:+g.dataset.y,width:+g.dataset.width,height:+g.dataset.height})),links:[...s.querySelectorAll('[data-link]')].map(e=>e.outerHTML)};"));
  const point=async(selector)=>page.evaluate(`const f=document.querySelector('.topology-studio iframe'),g=f.contentDocument.querySelector(${JSON.stringify(selector)}),r=g.getBoundingClientRect(),fr=f.getBoundingClientRect(),k=fr.width/f.offsetWidth;return{x:fr.x+(r.x+r.width/2)*k,y:fr.y+(r.y+r.height/2)*k,k:k*g.ownerSVGElement.getScreenCTM().a};`);
  const pointerClick=async p=>{await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x,y:p.y});for(const type of ['mousePressed','mouseReleased'])await page.send('Input.dispatchMouseEvent',{type,x:p.x,y:p.y,button:'left',buttons:type==='mousePressed'?1:0,clickCount:1});await delay(60);};
  const escape=async()=>{for(const type of ['keyDown','keyUp'])await page.send('Input.dispatchKeyEvent',{type,key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await delay(280);};
  const gesture=async(selector,dx,dy,cancel=false)=>{const p=await point(selector);await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x,y:p.y});await page.send('Input.dispatchMouseEvent',{type:'mousePressed',x:p.x,y:p.y,button:'left',buttons:1,clickCount:1});for(let n=1;n<=5;n++)await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x+dx*p.k*n/5,y:p.y+dy*p.k*n/5,buttons:1});await delay(30);assert(await page.evaluate("return document.querySelector('[data-studio-export=svg]').disabled;"),'A real native gesture must be active');if(selector.startsWith('[data-device='))assert(await page.evaluate("return !!document.querySelector('.topology-studio iframe').contentDocument.querySelector('[data-device-dragging],[data-diagram-dragging]');"),'A device gesture must not hit an overlapping table');if(cancel)await escape();await page.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x+dx*p.k,y:p.y+dy*p.k,button:'left',buttons:0,clickCount:1});await delay(80);};
  let sourceBefore;
  try {
    await page.send('Emulation.setDeviceMetricsOverride',{width:1600,height:1100,deviceScaleFactor:1,mobile:false});await page.send('Page.navigate',{url});await init();
    await page.evaluate("const r=await ws.controller.openDocument((await import('/src/export/studio/stabilization.fixture.ts')).stabilizationFixture());if(!r.ok)throw Error(JSON.stringify(r));store.getState().setPaused(true);const s=(await import('/src/export/studio/model.ts')).capturePrintSnapshot(sim.net,store.getState()),o=(await import('/src/export/studio/options.ts')).printPreset('clean',s);o.diagramScale=.4;o.devicePositions.A={x:340,y:340};o.title='Projeto de rede existente';o.names.A='Campus Router A';store.getState().setStudioPresentation((await import('/src/studioPresentation.ts')).saveStudioPresentation((await import('/src/export/studio/pageLayouts.ts')).createPageSession(o),true),store.getState().topologyGeneration);window.original=source();");
    await open();
    sourceBefore=await page.evaluate('return original;');
    if(process.env.NETLAB_STUDIO_SNAPSHOT_REVIEW==='1'){
      const {runStudioSnapshotReview}=await import('./studio-snapshot-review.mjs');
      await runStudioSnapshotReview({page,root,report,downloads,openPage,test,open,close,value,click,ready,wait,init,metrics,gesture});return;
    }
    await test('checkpoint 1: fixed branding and optional centred work headings preserve draft and manual centre',async()=>{
      assert.equal(await page.evaluate("return document.querySelector('[data-studio-title]').value;"),'Projeto de rede existente');
      await value('[data-studio-title]','Netzwerkprojekt – Beispiel');await value('[data-studio-subtitle]','IPv4-Subnetting und statisches Routing');
      const result=await page.evaluate("const d=document.querySelector('.topology-studio iframe').contentDocument,g=d.querySelector('[data-device=A]'),h=d.querySelector('[data-work-heading]'),b=d.querySelector('[data-studio-branding]');return{brand:b.textContent,heading:h.textContent,below:h.getBBox().y>b.getBBox().y+b.getBBox().height,center:[+g.dataset.x + +g.dataset.width/2,+g.dataset.y + +g.dataset.height/2]};");
      assert.equal(result.brand,'NetLab-FiSITopology Studio');assert(result.below);assert.deepEqual(result.center,[340,340]);
      await value('[data-studio-title]','');await value('[data-studio-subtitle]','');assert.equal(await page.evaluate("return document.querySelector('.topology-studio iframe').contentDocument.querySelector('[data-work-heading]').textContent;"),'');
      await value('[data-studio-title]','Netzwerkprojekt – Beispiel');await value('[data-studio-subtitle]','IPv4-Subnetting und statisches Routing');
    });
    await test('checkpoint 1: native continuous typing keeps browsing context, pages, scroll, zoom, selection and autosave',async()=>{
      await pointerClick(await point('[data-device=A] > rect'));
      await value('[data-studio-zoom]','1.25');
      await page.evaluate("const f=document.querySelector('.topology-studio iframe');window.previewDocument=f.contentDocument;window.previewPage=previewDocument.querySelector('.print-page');window.previewLoads=0;f.addEventListener('load',()=>previewLoads++);document.querySelector('.studio-preview-stage').scrollTop=90;window.previewScroll=document.querySelector('.studio-preview-stage').scrollTop;const e=document.querySelector('[data-studio-footer-note]');for(let p=e.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;e.focus();");
      for(const ch of 'Autor: Felipe / 07.11.2026')await page.send('Input.insertText',{text:ch});
      const state=await page.evaluate("const f=document.querySelector('.topology-studio iframe'),s=store.getState().studioPresentation;return{loads:previewLoads,sameDocument:f.contentDocument===previewDocument,samePage:f.contentDocument.querySelector('.print-page')===previewPage,scroll:document.querySelector('.studio-preview-stage').scrollTop,previousScroll:previewScroll,zoom:document.querySelector('[data-studio-zoom]').value,note:document.querySelector('[data-studio-footer-note]').value,saved:s.shared.footerNote};");
      assert(state.sameDocument&&state.samePage);assert.equal(state.loads,0);assert(state.previousScroll>0,'Typing must exercise a genuinely scrolled page');assert.equal(state.scroll,state.previousScroll);assert.equal(state.zoom,'1.25');assert.equal(state.note,state.saved);assert.equal(state.note,'Autor: Felipe / 07.11.2026');
      assert.equal(await page.evaluate("return document.querySelector('.topology-studio iframe').contentDocument.querySelector('[data-selected-device]')?.dataset.device;"),'A');
      for(const selector of ['[data-studio-title]','[data-studio-subtitle]','[data-studio-alias=A]']){await page.evaluate(`const e=document.querySelector(${JSON.stringify(selector)});for(let p=e.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;e.focus();`);await page.send('Input.insertText',{text:' · geprüft'});}
      assert.equal(await page.evaluate('return previewLoads;'),0);assert((await page.evaluate('return ws.controller.flush();')).ok);assert.equal(await page.evaluate('return source();'),await page.evaluate('return original;'));
      await writeFile(path.join(out,'typing-audit.json'),JSON.stringify(state,null,2));await value('[data-studio-zoom]','page');
    });
    if(process.env.NETLAB_STUDIO_INTERFACE_CHECKPOINT==='1')return;
    await test('checkpoint 2: compact collapsible sidebar, contextual report controls and preserved custom fields across presets',async()=>{
      await close();await open();
      assert(!await page.evaluate("return document.querySelector('[data-studio-panel=devices]').open;"));
      assert(!await page.evaluate("return !!document.querySelector('[data-studio-panel=report]');"));
      assert(!await page.evaluate("return !!document.querySelector('[data-studio-diagram-option=areas],[data-studio-diagram-option=areaTitles]');"));
      const saved=await page.evaluate('return structuredClone(store.getState().studioPresentation);');
      await value('[data-studio-preset]','technical');await click('[data-studio-panel=report] > summary');
      await value('[data-studio-route-filter]','connected');await value('[data-studio-annotation]','Technical report retained');await click('[data-studio-section=services]');
      await value('[data-studio-preset]','presentation');assert(!await page.evaluate("return !!document.querySelector('[data-studio-panel=report]');"));
      assert(!await page.evaluate("return !!document.querySelector('.topology-studio iframe').contentDocument.querySelector('[data-studio-area]');"));
      assert.equal(await page.evaluate("return document.querySelector('.topology-studio iframe').contentDocument.querySelectorAll('.print-page').length;"),1);
      await value('[data-studio-preset]','clean');await value('[data-studio-preset]','technical');
      assert.equal(await page.evaluate("return document.querySelector('[data-studio-route-filter]').value;"),'connected');assert.equal(await page.evaluate("return document.querySelector('[data-studio-annotation]').value;"),'Technical report retained');assert(await page.evaluate("return document.querySelector('[data-studio-section=services]').checked;"));
      const after=await page.evaluate('return structuredClone(store.getState().studioPresentation);');for(const key of ['title','subtitle','names','footerNote'])assert.deepEqual(after.shared[key],saved.shared[key]);assert.deepEqual(after.layouts,saved.layouts);
      await value('[data-studio-preset]','clean');await close();await open();assert(!await page.evaluate("return document.querySelector('[data-studio-panel=devices]').open;"));
    });
    await test('checkpoint 2: four table editors start closed and can close after edits without losing fields',async()=>{
      await value('[data-studio-paper]','A3');await value('[data-studio-orientation]','landscape');await value('[data-studio-diagram-scale]','0.3');
      await click('[data-studio-add-block-panel] > summary');
      for(const id of ['A','B','C','D']){await value('[data-studio-block-device]',id);await click('[data-studio-add-block]');}
      const ids=await page.evaluate("return [...document.querySelectorAll('[data-studio-block-settings]')].map(e=>({id:e.dataset.studioBlockSettings,open:e.open}));");assert.equal(ids.length,4);assert(ids.every(e=>!e.open));
      for(const {id}of ids){const s=`[data-studio-block-settings="${id}"]`;await click(s+' > summary');await value(s+' [data-block-filter]','connected');await value(s+' [data-block-width]','normal');await click(s+' > summary');assert(!await page.evaluate(`return document.querySelector(${JSON.stringify(s)}).open;`));await value('[data-studio-subtitle]','Subnetting / '+id);assert(!await page.evaluate(`return document.querySelector(${JSON.stringify(s)}).open;`));}
      await close();await open();assert(await page.evaluate("return [...document.querySelectorAll('[data-studio-block-settings]')].every(e=>!e.open);"));
      assert(await page.evaluate("return [...document.querySelectorAll('[data-block-filter]')].every(e=>e.value==='connected');"));
    });
    if(process.env.NETLAB_STUDIO_INTERFACE_CHECKPOINT==='2')return;
    await test('checkpoint 3: select, blank-page deselect, Escape priority and explicit global movement with undo',async()=>{
      await value('[data-studio-zoom]','page');
      await pointerClick(await point('[data-device=A] > rect'));assert.equal(await page.evaluate("return document.querySelector('[data-studio-selected-device]')?.dataset.studioSelectedDevice;"),'A');
      const blank=await page.evaluate("const f=document.querySelector('.topology-studio iframe'),s=f.contentDocument.querySelector('[data-print-section=diagram] svg'),r=s.getBoundingClientRect(),fr=f.getBoundingClientRect(),k=fr.width/f.offsetWidth;return{x:fr.x+(r.x+r.width-5)*k,y:fr.y+(r.y+12)*k};");await pointerClick(blank);assert(!await page.evaluate("return !!document.querySelector('[data-studio-selected-device]');"));
      await pointerClick(await point('[data-device=A] > rect'));await escape();assert(!await page.evaluate("return !!document.querySelector('[data-studio-selected-device]');"));assert(await page.evaluate("return !!document.querySelector('.topology-studio');"));
      await click('[data-studio-move-diagram]');assert.equal(await page.evaluate("return document.querySelector('[data-studio-move-diagram]').getAttribute('aria-pressed');"),'true');assert(!await page.evaluate("return !!document.querySelector('[data-selected-device]');"));
      const before=await metrics();await gesture('[data-device=A] > rect',12,10,true);assert.deepEqual(await metrics(),before);assert.equal(await page.evaluate("return document.querySelector('[data-studio-position-mode]').dataset.studioPositionMode;"),'global');
      await gesture('[data-device=A] > rect',12,10);const after=await metrics(),delta={x:after.cards[0].x-before.cards[0].x,y:after.cards[0].y-before.cards[0].y};assert(Math.abs(delta.x-12)<.1&&Math.abs(delta.y-10)<.1,JSON.stringify(delta));after.cards.forEach((r,i)=>{assert(Math.abs(r.x-before.cards[i].x-delta.x)<.001);assert(Math.abs(r.y-before.cards[i].y-delta.y)<.001);});assert.deepEqual(after.tables,before.tables);assert.notDeepEqual(after.links,before.links);
      await click('[data-studio-undo-move]');assert.deepEqual(await metrics(),before);await escape();assert.equal(await page.evaluate("return document.querySelector('[data-studio-position-mode]').dataset.studioPositionMode;"),'individual');
      await gesture('[data-device=A] > rect',-8,9);const individual=await metrics();assert.deepEqual(individual.cards.filter(c=>c.id!=='A'),before.cards.filter(c=>c.id!=='A'));assert.notDeepEqual(individual.cards.find(c=>c.id==='A'),before.cards.find(c=>c.id==='A'));await click('[data-studio-restore-device]');
      assert.equal(await page.evaluate('return source();'),await page.evaluate('return original;'));
    });
    await test('checkpoint 3: table drag and resize keep editors closable and restore independently',async()=>{
      const id=(await metrics()).tables[0].id,s=`[data-studio-block-settings="${id}"]`;await click(s+' > summary');const before=await metrics();
      await gesture(`[data-document-block="${id}"] [data-block-drag]`,8,10);assert.notDeepEqual((await metrics()).tables[0],before.tables[0]);
      await gesture(`[data-block-resize="${id}"]`,30,0);assert((await metrics()).tables[0].width>before.tables[0].width);
      await click(s+' > summary');assert(!await page.evaluate(`return document.querySelector(${JSON.stringify(s)}).open;`));await click(s+' > summary');await click(s+' [data-block-reset-size]');await click(s+' [data-block-reset]');await click(s+' > summary');assert(!await page.evaluate(`return document.querySelector(${JSON.stringify(s)}).open;`));
    });
    if(process.env.NETLAB_STUDIO_INTERFACE_CHECKPOINT==='3')return;
    await test('checkpoint 4: four independent layouts survive close, F5 and actual Topology JSON download/import',async()=>{
      const states=new Map();
      for(const paper of ['A4','A3'])for(const orientation of ['portrait','landscape']){
        await value('[data-studio-paper]',paper);await value('[data-studio-orientation]',orientation);await value('[data-studio-zoom]','page');
        const chosen=await page.evaluate("const d=document.querySelector('.topology-studio iframe').contentDocument;return [...d.querySelectorAll('[data-device]')].find(g=>{const r=g.querySelector('rect').getBoundingClientRect();return d.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('[data-device]')===g;})?.dataset.device;");assert(chosen,'Find an unobstructed card');await gesture(`[data-device="${chosen}"] > rect`,7,8);states.set(paper+'-'+orientation,await metrics());
      }
      for(const [key,expected]of states){const [p,o]=key.split('-');await value('[data-studio-paper]',p);await value('[data-studio-orientation]',o);assert.deepEqual(await metrics(),expected);}
      const saved=await page.evaluate('return structuredClone(store.getState().studioPresentation);');assert((await page.evaluate('return ws.controller.flush();')).ok);await close();await open();assert.deepEqual(await page.evaluate('return structuredClone(store.getState().studioPresentation);'),saved);await close();await page.send('Page.reload');await init();await open();assert.deepEqual(await page.evaluate('return structuredClone(store.getState().studioPresentation);'),saved);
      const count=report.downloads.length;page.labelDownloads('studio-interface-topology-json');await page.evaluate('store.getState().exportJson();');for(let n=0;n<150&&report.downloads.length===count;n++)await delay(30);await page.drainDownloads();assert.equal(report.downloads.length,count+1);const json=await readFile(path.join(downloads,report.downloads.at(-1).guid),'utf8');await writeFile(path.join(out,'topology-presentation.json'),json);assert.deepEqual(JSON.parse(json).ui.topologyStudio,saved);await close();
      assert((await page.evaluate(`return ws.controller.openDocument({schemaVersion:1,topology:JSON.parse(${JSON.stringify(json)})});`)).ok);await open();assert.deepEqual(await page.evaluate('return structuredClone(store.getState().studioPresentation);'),saved);assert(await page.evaluate("return [...document.querySelectorAll('[data-studio-block-settings]')].every(e=>!e.open);"));
      for(const [key,expected]of states){const [p,o]=key.split('-');await value('[data-studio-paper]',p);await value('[data-studio-orientation]',o);assert.deepEqual(await metrics(),expected);}
      await writeFile(path.join(out,'page-layouts.json'),JSON.stringify([...states],null,2));
    });
    await test('checkpoint 4: three presets, live SVG/PNG/HTML downloads and 36 localized print variants',async()=>{
      await value('[data-studio-title]','Netzwerkprojekt – Beispiel');await value('[data-studio-subtitle]','IPv4-Subnetting und statisches Routing');await value('[data-studio-paper]','A4');await value('[data-studio-orientation]','portrait');await value('[data-studio-diagram-scale]','0.5');await click('[data-studio-restore-devices]');
      // Use the real table controls to restore compact size and safe positions.
      for(const id of (await metrics()).tables.map(t=>t.id)){const s=`[data-studio-block-settings="${id}"]`;await click(s+' > summary');await click(s+' [data-block-reset-size]');await click(s+' > summary');}await click('[data-studio-reset-blocks]');
      const printer=await openPage(),matrix=[];try{
        const tree=await printer.send('Page.getFrameTree');
        for(const [index,preset]of ['clean','presentation','technical'].entries()){
          await page.evaluate("lang.getState().setLanguage('de');");await value('[data-studio-preset]',preset);await value('[data-studio-paper]','A4');await value('[data-studio-orientation]','portrait');await click('[data-studio-reset-blocks]');await value('[data-studio-zoom]','page');await page.evaluate("document.querySelector('.studio-options').scrollTop=0;");await delay(100);await shot(`${String(index+1).padStart(2,'0')}-${preset}-barra-lateral`);
          const expected=await metrics();
          for(const kind of ['svg','png','html']){
            const count=report.downloads.length;page.labelDownloads('studio-interface-'+preset+'-'+kind);await click(`[data-studio-export=${kind}]`);for(let n=0;n<150&&report.downloads.length===count;n++)await delay(30);await page.drainDownloads();assert.equal(report.downloads.length,count+1,'Actual export '+preset+' '+kind);const bytes=await readFile(path.join(downloads,report.downloads.at(-1).guid));await writeFile(path.join(out,preset+'.'+kind),bytes);
            if(kind==='svg'){
              const cards=await printer.evaluate(`const doc=new DOMParser().parseFromString(${JSON.stringify(bytes.toString())},'image/svg+xml');return [...doc.querySelectorAll('[data-device]')].map(g=>({id:g.dataset.device,x:+g.dataset.x,y:+g.dataset.y,width:+g.dataset.width,height:+g.dataset.height}));`);assert.deepEqual(rounded(cards),expected.cards);
              assert(bytes.toString().includes('>Topology Studio</text>'));assert(!bytes.toString().includes('data-studio-area'));assert(!bytes.toString().includes('data-selected-device'));
            }
            if(kind==='png')assert(bytes.readUInt32BE(16)>1500&&bytes.readUInt32BE(20)>2000);
            if(kind==='html')assert.equal(bytes.toString(),await page.evaluate("return document.querySelector('.topology-studio iframe').dataset.previewHtml;"));
          }
          for(const language of ['de','en','pt-BR'])for(const paper of ['A4','A3'])for(const orientation of ['portrait','landscape']){
            await page.evaluate(`lang.getState().setLanguage(${JSON.stringify(language)});`);await value('[data-studio-paper]',paper);await value('[data-studio-orientation]',orientation);
            const html=await page.evaluate("return document.querySelector('.topology-studio iframe').dataset.previewHtml;");await printer.send('Page.setDocumentContent',{frameId:tree.frameTree.frame.id,html});await printer.evaluate('await document.fonts.ready;');
            const check=await printer.evaluate("const pages=[...document.querySelectorAll('.print-page')],clipped=[];for(const g of document.querySelectorAll('[data-device]')){const b=g.querySelector('rect').getBBox();for(const t of g.querySelectorAll('text')){const r=t.getBBox();if(r.x<b.x-1||r.y<b.y-1||r.x+r.width>b.x+b.width+1||r.y+r.height>b.y+b.height+1)clipped.push(g.dataset.device);}}const headings=[...document.querySelectorAll('[data-studio-branding]')].map(e=>e.textContent);return{pages:pages.length,headings,clipped,notes:document.querySelectorAll('[data-footer-note]').length,area:!!document.querySelector('[data-studio-area]'),text:document.body.textContent};");
            assert.equal(check.clipped.length,0);assert.equal(check.headings.length,check.pages);assert(check.headings.every(s=>s==='NetLab-FiSITopology Studio'));assert(!check.area);assert.equal(check.notes,1);assert(!/Snapshot:|Aufnahme:|Captura:|A[34] (Hochformat|Portrait|Retrato|Querformat|Landscape|Paisagem)/.test(check.text));
            const key=language+'-'+preset+'-'+paper+'-'+orientation;await writeFile(path.join(out,key+'.html'),html);matrix.push({key,...check,text:undefined});
            if(language==='de'){const pdf=await printer.send('Page.printToPDF',{printBackground:true,preferCSSPageSize:true});await writeFile(path.join(out,key+'.pdf'),Buffer.from(pdf.data,'base64'));}
          }
        }
      }finally{await printer.send('Page.close');printer.close();}
      await writeFile(path.join(out,'export-matrix.json'),JSON.stringify(matrix,null,2));
    });
    await test('checkpoint 4: DE/EN/PT-BR menus, keyboard and sidebars at smaller desktop and mobile widths',async()=>{
      for(const width of [1100,800,480])for(const language of ['de','en','pt-BR']){
        await page.send('Emulation.setDeviceMetricsOverride',{width,height:width===480?900:1000,deviceScaleFactor:1,mobile:false});await page.evaluate(`lang.getState().setLanguage(${JSON.stringify(language)});`);await value('[data-studio-preset]','technical');await value('[data-studio-zoom]','page');
        const result=await page.evaluate("const a=document.querySelector('.studio-options'),d=document.querySelector('.topology-studio'),panels=[...a.querySelectorAll('[data-studio-panel] > summary')];return{asideOverflow:a.scrollWidth>a.clientWidth+1,dialogOverflow:d.scrollWidth>d.clientWidth+1,panels:panels.map(s=>s.textContent),scrollable:a.scrollHeight>a.clientHeight};");assert(!result.asideOverflow&&!result.dialogOverflow,JSON.stringify({width,language,result}));assert(result.scrollable);assert(result.panels.every(Boolean));
        await click('[data-studio-panel=devices] > summary');await value('[data-studio-alias=B]','Router B / '+language);await click('[data-studio-panel=devices] > summary');
        await page.evaluate("document.querySelector('[data-studio-preset]').focus();");for(const type of ['keyDown','keyUp'])await page.send('Input.dispatchKeyEvent',{type,key:'Tab',code:'Tab',windowsVirtualKeyCode:9});assert(await page.evaluate("return document.querySelector('.topology-studio').contains(document.activeElement);"));
        if(width===800&&language==='pt-BR')await shot('05-pt-br-800px');if(width===480&&language==='en')await shot('06-en-480px');
      }
      await page.send('Emulation.setDeviceMetricsOverride',{width:1600,height:1100,deviceScaleFactor:1,mobile:false});await page.evaluate("lang.getState().setLanguage('de');");await value('[data-studio-preset]','clean');await value('[data-studio-paper]','A4');await value('[data-studio-orientation]','portrait');await value('[data-studio-zoom]','page');
      await click('[data-studio-panel=document] > summary');await click('[data-studio-panel=diagram] > summary');await click('[data-studio-block-settings] > summary');await page.evaluate("document.querySelector('.studio-options').scrollTop=0;");await shot('04-dispositivos-e-blocos-recolhiveis');
      assert.equal(await page.evaluate('return source();'),sourceBefore);
    });
  } finally {
    if(await page.evaluate("return !!document.querySelector('.topology-studio');"))await close();
    await page.evaluate('await ws.controller.flush();ws.dispose();');await page.evaluate(`await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase(${JSON.stringify(db)});r.onsuccess=resolve;r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Audit cleanup blocked'));});`);
  }
}
