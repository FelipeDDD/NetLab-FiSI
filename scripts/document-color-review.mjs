import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Native Auto Dark emulation, not prefers-color-scheme alone. Disposable profile/DB. */
export async function runDocumentColorReview({page,url,root,report,downloads,openPage}) {
  const stage=process.env.NETLAB_DOCUMENT_COLOR_REVIEW,after=stage==='after';
  const out=path.join(root,'.playwright-mcp/reviews/document-colors',stage),database='netlab-idb-test-'+crypto.randomUUID();
  await mkdir(out,{recursive:true});const results={stage,emulation:'Emulation.setAutoDarkModeOverride',vivaldiTested:false,samples:[]};
  const reference=async name=>{try{return await readFile(path.join(out,'../before',name));}catch(error){if(error.code==='ENOENT')return null;throw error;}};
  const delay=ms=>new Promise(r=>setTimeout(r,ms));
  const wait=async code=>{for(let i=0;i<250;i++){if(await page.evaluate('return !!('+code+');'))return;await delay(40);}throw Error(code);};
  const click=async selector=>{await page.evaluate(`document.querySelector(${JSON.stringify(selector)}).click();`);await delay(120);};
  const ready=()=>wait('document.querySelector(".topology-studio iframe")?.contentDocument?.querySelector("[data-document-block]")&&!document.querySelector("[data-studio-print]").disabled');
  const screenshot=async(target,name,clip)=>{const {data}=await target.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,...(clip?{clip}:{})});const bytes=Buffer.from(data,'base64');await writeFile(path.join(out,name+'.png'),bytes);return bytes;};
  const compare=async(target,name,clip,{preferred='dark',print=false,protectedDocument=after}={})=>{
    await target.send('Emulation.setEmulatedMedia',{media:print?'print':'',features:[{name:'prefers-color-scheme',value:preferred}]});
    await target.send('Emulation.setAutoDarkModeOverride',{enabled:false});await delay(200);const normal=await screenshot(target,name+'-normal',clip);
    await target.send('Emulation.setAutoDarkModeOverride',{enabled:true});await delay(200);const dark=await screenshot(target,name+'-auto-dark',clip);
    const equal=normal.equals(dark);results.samples.push({name,preferred,pixelsIdentical:equal,scheme:await target.evaluate('return {root:getComputedStyle(document.documentElement).colorScheme,body:document.body?getComputedStyle(document.body).colorScheme:null,page:document.querySelector(".print-page")?getComputedStyle(document.querySelector(".print-page")).colorScheme:null};')});
    await writeFile(path.join(out,'results.json'),JSON.stringify(results,null,2));
    // Chromium's force-dark + preferred LIGHT path explicitly bypasses `only`.
    // Record this compatibility limit rather than hiding it with colour hacks.
    if(protectedDocument&&preferred==='dark')assert(equal,'Auto Dark changed printable pixels: '+name);
  };
  let printer;
  try{
    await page.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    await page.send('Page.navigate',{url});await wait('document.readyState==="complete"&&document.getElementById("root")');
    await page.evaluate(`window.store=(await import('/src/store.ts')).useStore;window.sim=(await import('/src/sim.ts')).sim;window.lang=(await import('/src/i18n/index.ts')).useLanguage;window.theme=(await import('/src/uiTheme.ts')).useUiTheme;lang.getState().setLanguage('en');theme.getState().setTheme('graphite-dark');window.ws=await(await import('/src/workspace/reviewEntry.tsx')).mountWorkspaceReview(document.getElementById('root'),{databaseName:${JSON.stringify(database)}});const opened=await ws.controller.openDocument((await import('/src/export/studio/blocks.fixture.ts')).blocksFixture('four'));if(!opened.ok)throw Error(opened.error.code);store.getState().setPaused(true);window.source=JSON.stringify(store.getState().captureWorkspaceDocument().topology.devices);const snapshot=(await import('/src/export/studio/model.ts')).capturePrintSnapshot(sim.net,store.getState()),o=(await import('/src/export/studio/options.ts')).printPreset('technical',snapshot),l=(await import('/src/export/studio/diagram.ts')).studioLayout(snapshot,o,'en'),b=(await import('/src/export/studio/routingBlocks.ts')).newRoutingBlock(snapshot.devices.find(d=>d.id==='D'),'reference-D');b.position={x:8,y:l.page.area.y+8};o.routingBlocks=[b];store.getState().setStudioPresentation((await import('/src/studioPresentation.ts')).saveStudioPresentation((await import('/src/export/studio/pageLayouts.ts')).createPageSession(o),true),store.getState().topologyGeneration);`);
    await page.evaluate('[...document.querySelectorAll(".toolbar-menu-trigger")].find(e=>e.textContent.trim()==="File").click();');
    await click('.toolbar-menu-action[aria-haspopup=menu]');await click('[data-open-topology-studio]');await ready();
    const initialGeometry=await page.evaluate('return [...document.querySelector(".topology-studio iframe").contentDocument.querySelectorAll("[data-device],[data-document-block]")].map(e=>[...e.attributes].map(a=>[a.name,a.value]));');
    await writeFile(path.join(out,'geometry.json'),JSON.stringify(initialGeometry,null,2));
    const previousGeometry=after&&await reference('geometry.json');if(previousGeometry)assert.deepEqual(initialGeometry,JSON.parse(previousGeometry.toString()));
    for(const themeName of ['graphite-dark','classic-light']){
      await page.evaluate(`theme.getState().setTheme(${JSON.stringify(themeName)});`);await delay(160);
      const clip=await page.evaluate('const r=document.querySelector(".studio-preview-stage").getBoundingClientRect();return {x:Math.ceil(r.x+8),y:Math.ceil(r.y+8),width:Math.floor(r.width-32),height:Math.floor(r.height-32),scale:1};');
      await compare(page,'preview-'+themeName,clip);await screenshot(page,'editor-'+themeName);
    }
    await page.send('Emulation.setAutoDarkModeOverride',{enabled:false});
    await page.evaluate('const s=document.querySelector(".studio-submenu");s.open=true;s.scrollIntoView({block:"center"});');await screenshot(page,'table-controls');
    if(after)for(const language of ['de','en','pt-BR']){
      await page.evaluate(`lang.getState().setLanguage(${JSON.stringify(language)});`);await ready();
      assert(await page.evaluate('const d=document.querySelector("[data-studio-block-controls]");return d.open&&!!d.querySelector("summary")&&!d.querySelector(".studio-note")&&!!d.querySelector("[data-studio-reset-blocks]")&&!!d.querySelector("[data-studio-block-settings]");'));
      // Same controls, including size/scale and numeric position, after simplification.
      const label=await page.evaluate('const s=document.querySelector("[data-studio-block-settings]");s.open=true;return s.textContent;');assert(label.includes('D'));
    }
    await page.evaluate('lang.getState().setLanguage("en");');await ready();
    const html=await page.evaluate('return document.querySelector(".topology-studio iframe").dataset.previewHtml;');await writeFile(path.join(out,'report.html'),html);
    const previousReport=after&&await reference('report.html');if(previousReport)assert.equal(html.split('<body>')[1].replaceAll(' style="color-scheme:only light"',''),previousReport.toString().split('<body>')[1].replaceAll(' style="color-scheme:only light"',''));
    printer=await openPage();await printer.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    // Navigate like an opened export, independently of the application's theme.
    await printer.send('Page.navigate',{url:'data:text/html;base64,'+Buffer.from(html).toString('base64')});await delay(180);await printer.evaluate('await document.fonts.ready;');
    const pages=await printer.evaluate('return document.querySelectorAll("[data-print-page]").length;');assert(pages>1);results.reportPages=pages;
    for(let i=1;i<=pages;i++){
      await printer.evaluate(`document.querySelector('[data-print-page="${i}"]').scrollIntoView();`);await compare(printer,'report-page-'+i);
      await compare(printer,'report-page-'+i+'-system-light',undefined,{preferred:'light'});
    }
    assert(await printer.evaluate('return !!document.querySelector("table td")&&document.body.textContent.includes("10.0.")&&document.querySelectorAll("svg").length>1;'));
    await printer.evaluate('scrollTo(0,0);');await compare(printer,'print',undefined,{print:true});
    const pdf=await printer.send('Page.printToPDF',{printBackground:true,preferCSSPageSize:true});const pdfBytes=Buffer.from(pdf.data,'base64');assert.equal(pdfBytes.subarray(0,5).toString(),'%PDF-');await writeFile(path.join(out,'report.pdf'),pdfBytes);
    await printer.send('Emulation.setEmulatedMedia',{media:''});
    if(previousReport){
      await printer.send('Page.navigate',{url:'data:text/html;base64,'+previousReport.toString('base64')});await delay(180);
      await printer.evaluate('await document.fonts.ready;document.querySelectorAll("[data-print-page]")[2].scrollIntoView();');await compare(printer,'reference-before-page-3',undefined,{protectedDocument:false});
    }
    for(const kind of ['svg','png','html']){
      const start=report.downloads.length;page.labelDownloads('document-colors-'+stage+'-'+kind);await click('[data-studio-export='+kind+']');
      for(let i=0;i<100&&report.downloads.length===start;i++)await delay(50);await page.drainDownloads();const file=report.downloads[start];assert(file?.state==='completed');const bytes=await readFile(path.join(downloads,file.guid));await writeFile(path.join(out,'export.'+kind),bytes);
      if(kind==='svg')assert(bytes.toString().includes('data-document-block="reference-D"'));if(kind==='png')assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');if(kind==='html')assert(bytes.toString().includes('data-print-page="2"'));
      const previousPng=after&&kind==='png'&&await reference('export.png');if(previousPng)assert(bytes.equals(previousPng),'PNG content/geometry changed');
      if(after&&kind==='svg'){
        await printer.send('Page.navigate',{url:'data:image/svg+xml;base64,'+bytes.toString('base64')});await delay(180);
        const clip=await printer.evaluate('const r=document.querySelector("svg").getBoundingClientRect();return{x:Math.max(0,r.x),y:Math.max(0,r.y),width:Math.min(r.width,innerWidth),height:Math.min(r.height,innerHeight),scale:1};');await compare(printer,'standalone-svg',clip);
      }
    }
    if(after){
      const legacy=await page.evaluate('return (await import("/src/export/report.ts")).networkReport(sim.net,store.getState().nodes.map(n=>({id:n.id,...n.position})),"review");');await writeFile(path.join(out,'legacy-report.html'),legacy);
      await printer.send('Page.navigate',{url:'data:text/html;base64,'+Buffer.from(legacy).toString('base64')});await delay(180);await compare(printer,'legacy-report');
      await page.send('Page.bringToFront'); // Native gestures must target the foreground tab.
      const geometry=()=>page.evaluate('const b=document.querySelector(".topology-studio iframe").contentDocument.querySelector("[data-document-block]");return{x:+b.dataset.x,y:+b.dataset.y,width:+b.dataset.width,height:+b.dataset.height};');
      const gesture=async(selector,dx,dy,cancel=false)=>{
        const p=await page.evaluate(`const f=document.querySelector('.topology-studio iframe'),g=f.contentDocument.querySelector(${JSON.stringify(selector)}),r=g.getBoundingClientRect(),fr=f.getBoundingClientRect(),k=fr.width/f.offsetWidth;return{x:fr.x+(r.x+r.width/2)*k,y:fr.y+(r.y+r.height/2)*k,k:k*g.ownerSVGElement.getScreenCTM().a};`);
        await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x,y:p.y});await page.send('Input.dispatchMouseEvent',{type:'mousePressed',x:p.x,y:p.y,button:'left',buttons:1,clickCount:1});
        for(let n=1;n<=5;n++)await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x+dx*p.k*n/5,y:p.y+dy*p.k*n/5,buttons:1});
        assert(await page.evaluate('return document.querySelector("[data-studio-export=svg]").disabled;'));
        if(cancel)for(const type of ['keyDown','keyUp'])await page.send('Input.dispatchKeyEvent',{type,key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
        await page.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x+dx*p.k,y:p.y+dy*p.k,button:'left',buttons:0,clickCount:1});await delay(120);await ready();
      };
      await page.send('Emulation.setAutoDarkModeOverride',{enabled:false});
      const initial=await geometry();await gesture('[data-block-drag]',12,9);const moved=await geometry();assert(Math.abs(moved.x-initial.x-12)<.1&&Math.abs(moved.y-initial.y-9)<.1);
      await gesture('[data-block-resize]',32,0);const wider=await geometry();assert(wider.width>moved.width);
      await gesture('[data-block-scale]',24,24);const scaled=await geometry();assert(scaled.width>wider.width&&scaled.height>wider.height);
      await gesture('[data-block-scale]',24,24,true);const canceled=await geometry();for(const key of Object.keys(scaled))assert(Math.abs(canceled[key]-scaled[key])<.001);
      await click('[data-studio-block-controls] > summary');assert(await page.evaluate('return !document.querySelector("[data-studio-block-controls]").open;'));await click('[data-studio-block-controls] > summary');assert(await page.evaluate('return document.querySelector("[data-studio-block-controls]").open;'));
      await click('[data-studio-reset-blocks]');await ready();results.nativeTableGestures=['move','width','proportional-scale','Escape','fold/unfold','restore-positions'];
      await page.send('Emulation.setDeviceMetricsOverride',{width:700,height:900,deviceScaleFactor:1,mobile:false});await delay(180);
      const narrow=await page.evaluate('const d=document.querySelector(".topology-studio"),a=document.querySelector(".studio-options");return{dialogOverflow:d.scrollWidth>d.clientWidth+1,optionsOverflow:a.scrollWidth>a.clientWidth+1};');assert(!narrow.dialogOverflow&&!narrow.optionsOverflow,JSON.stringify(narrow));await screenshot(page,'editor-700');
    }
    assert(await page.evaluate('return JSON.stringify(store.getState().captureWorkspaceDocument().topology.devices)===source;'));
    await writeFile(path.join(out,'results.json'),JSON.stringify(results,null,2));
    report.results['document colors: '+stage+' preview, all report pages, Auto Dark, controls and exports']={passed:true,...results};
  }catch(error){await writeFile(path.join(out,'failure.json'),JSON.stringify({error:error.stack},null,2));throw error;}
  finally{
    if(printer){await printer.send('Page.close');printer.close();}
    await page.send('Emulation.setAutoDarkModeOverride',{enabled:false});
    await page.evaluate('document.querySelector(".studio-header button[aria-label]")?.click();await window.ws?.controller.flush();window.ws?.dispose();');
    await page.evaluate(`await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase(${JSON.stringify(database)});r.onsuccess=resolve;r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Review cleanup blocked'));});`);
  }
}
