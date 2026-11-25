import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
export async function runServerPresetsReview({page,url,root,report}){
 const database='netlab-idb-test-'+crypto.randomUUID();
 const captureEnabled=process.env.NETLAB_SERVER_PRESETS_CAPTURE==='1';
 const folder=captureEnabled?path.join(root,'.playwright-mcp/reviews/server-presets/runs',`${Date.now()}-${crypto.randomUUID()}`):null;
 if(folder)await mkdir(folder,{recursive:true});
 const delay=ms=>new Promise(r=>setTimeout(r,ms));
 const wait=async expression=>{for(let i=0;i<200;i++){if(await page.evaluate('return !!('+expression+');'))return;await delay(50);}throw Error(expression);};
 const mount=async(reload=false)=>{await page.send(reload?'Page.reload':'Page.navigate',reload?{ignoreCache:true}:{url});await delay(400);await page.evaluate(`window.store=(await import('/src/store.ts')).useStore;window.sim=(await import('/src/sim.ts')).sim;window.i18n=await import('/src/i18n/index.ts');window.theme=(await import('/src/uiTheme.ts')).useUiTheme;window.ws=await(await import('/src/workspace/reviewEntry.tsx')).mountWorkspaceReview(document.getElementById('root'),{databaseName:${JSON.stringify(database)}});`);await wait('document.querySelector(".react-flow")');};
 const capture=async name=>{const shot=await page.send('Page.captureScreenshot',{format:'png'});await writeFile(path.join(folder,name+'.png'),Buffer.from(shot.data,'base64'));};
 const test=async(name,fn)=>{await fn();report.results['server presets: '+name]={passed:true};};
 try{
  await page.send('Emulation.setDeviceMetricsOverride',{width:1440,height:950,deviceScaleFactor:1,mobile:false});await mount();
  if(process.env.NETLAB_INTERNET_REVIEW==='1'){
   await test('simulated Internet example opens, serves two integrated browsers and survives F5',async()=>{
    await page.evaluate('window.internetExample=(await import("/src/labs/examples.ts")).EXAMPLES.find(e=>e.file.devices.some(d=>d.id==="Provider")&&e.file.devices.some(d=>d.id==="Modem"));await ws.controller.openDocument({schemaVersion:1,topology:internetExample.file});');
    await wait('sim.net.devices.has("PC1")');
    const before=await page.evaluate('await ws.controller.flush();return store.getState().captureWorkspaceDocument();');
    await mount(true);assert.deepEqual(await page.evaluate('return store.getState().captureWorkspaceDocument();'),before);
    for(const hostname of ['example.test','www.example.test']){
     const results=await page.evaluate(`const {requestPage,simulatedUrl}=await import("/src/browser/request.ts");const results=[];for(const id of ["PC1","PC2"])requestPage(sim.net.devices.get(id),simulatedUrl(${JSON.stringify('http://'+hostname)}),r=>results.push(r));sim.net.scheduler.advanceTo(sim.net.now+15000);return results;`);
     assert.equal(results.length,2);for(const result of results){assert.equal(result.kind,'http');assert.equal(result.status,200);}
    }
   });
   return;
  }
  await test('single generic palette entry starts empty; internal presets remain compatible',async()=>{
   await page.evaluate('window.ids={};');
   await page.evaluate('document.querySelector(".palette-item.kind-server").click();');
   assert(await page.evaluate('const d=[...sim.net.devices.values()].at(-1);return !d.httpServer&&!d.dnsServer&&!d.dhcpPools.size;'));
   await page.evaluate('store.getState().undoTopology();');
   for(const preset of ['web','dns','dhcp']){
    await page.evaluate(`store.getState().addDeviceAt('server',{x:400,y:200},'${preset}');`);await delay(140);
    assert(await page.evaluate('return !!document.querySelector(\'.server-inspector [id$="-tab-services"][aria-selected="true"]\');'));
    await page.evaluate(`ids[${JSON.stringify(preset)}]=store.getState().selected;`);
   }
   const result=await page.evaluate('return Object.fromEntries(Object.entries(ids).map(([key,id])=>{const d=sim.net.devices.get(id);return [key,{kind:d.kind,ip:d.interfaces[0].ip,http:!!d.httpServer?.enabled,dns:!!d.dnsServer?.enabled,records:d.dnsServer?.records.size,pools:d.dhcpPools.size,dhcp:d.dhcpServiceEnabled}];}));');
   for(const value of Object.values(result)){assert.equal(value.kind,'server');assert.equal(value.ip,null);assert.equal(value.pools,0);assert.equal(value.dhcp,false);}assert(result.web.http);assert(result.dns.dns);assert.equal(result.dns.records,0);
  });
  await test('services can be enabled independently using Inspector controls',async()=>{
   await page.evaluate('const d=sim.net.devices.get(ids.dhcp);store.getState().select(d.id);(await import("/src/serverPresets.ts")).requestServerServices(sim.net,d.id);');await delay(100);
   await page.evaluate('document.querySelectorAll(".server-inspector details.svc .svc-toggle input").forEach(input=>input.click());');await delay(100);
   assert(await page.evaluate('const d=sim.net.devices.get(ids.dhcp);return d.httpServer?.enabled&&d.dnsServer?.enabled&&!d.dhcpServiceEnabled;'));
  });
  await test('Relay and remote pools share workspace persistence, Undo/Redo and localized Inspector',async()=>{
   await page.evaluate('store.getState().addDeviceAt("router",{x:800,y:300});window.relayRouter=[...sim.net.devices.values()].at(-1).id;const ip=(s)=>(s.split(".").reduce((a,n)=>(a*256+Number(n))>>>0,0));const view=store.getState();if(!view.setDhcpRelay(relayRouter,"eth0",{enabled:true,server:ip("192.168.20.10")}))throw Error("relay rejected");view.undoTopology();if(sim.net.devices.get(relayRouter).dhcpRelays.size)throw Error("undo");view.redoTopology();if(!view.setRemoteDhcpPool(ids.dhcp,"lan10",{enabled:true,network:ip("192.168.10.0"),prefix:24,rangeStart:ip("192.168.10.100"),rangeEnd:ip("192.168.10.150"),router:ip("192.168.10.1"),dns:ip("192.168.20.10")}))throw Error("pool rejected");');
   await delay(100);
   for(const lang of ['de','en','pt-BR']){
    await page.evaluate('i18n.useLanguage.getState().setLanguage('+JSON.stringify(lang)+');store.getState().select(relayRouter);');await delay(70);
    await page.evaluate('document.querySelector(".router-inspector [id$=-tab-network]")?.click();');await delay(70);
    assert(await page.evaluate('return document.querySelector(".router-inspector").textContent.includes("DHCP Relay");'));
   }
  });
  await test('modem palette creation and Inspector use a persistent two-port bridge',async()=>{
   await page.evaluate('document.querySelector(".palette-item.kind-modem").click();window.modemId=[...sim.net.devices.values()].at(-1).id;store.getState().select(modemId);');await delay(100);
   assert(await page.evaluate('const d=sim.net.devices.get(modemId);return d.kind==="modem"&&d.interfaces.length===2&&d.interfaces.every(i=>!i.ip)&&!!document.querySelector(".modem-inspector");'));
   const saved=await page.evaluate('return store.getState().captureWorkspaceDocument();');await page.evaluate('store.getState().undoTopology();');assert(await page.evaluate('return !sim.net.devices.has(modemId);'));await page.evaluate('store.getState().redoTopology();');assert.deepEqual(await page.evaluate('return store.getState().captureWorkspaceDocument();'),saved);
  });
  await test('modems use independent artwork and changing colour leaves node geometry intact', async () => {
   const node = id => `document.querySelector('.react-flow__node[data-id="' + ${id} + '"]')`;
   const artwork = id => `${node(id)}?.querySelector('image')?.getAttribute('href')`;
   const first = artwork('modemId'), second = artwork('secondModemId');
   await page.evaluate('store.getState().select(modemId);');
   await wait('document.querySelector(".modem-inspector select")?.value === "white"');
   for (const [ui, asset] of [['classic-light','dark'],['graphite-dark','white']]) {
    await page.evaluate(`theme.getState().setTheme(${JSON.stringify(ui)});`);
    await wait(`document.querySelector(".palette-item.kind-modem image")?.getAttribute("href").endsWith("netlab-modem-${asset}.png")`);
   }
   assert.match(await page.evaluate(`return ${first};`), /netlab-modem-white\.png$/);
   const box = await page.evaluate(`return ${node('modemId')}.getBoundingClientRect().toJSON();`);
   await page.evaluate('const select=document.querySelector(".modem-inspector select");select.value="dark";select.dispatchEvent(new Event("change",{bubbles:true}));');
   await wait(`${first}?.endsWith('netlab-modem-dark.png')`);
   assert.deepEqual(await page.evaluate(`return ${node('modemId')}.getBoundingClientRect().toJSON();`), box);
   await page.evaluate('store.getState().undoTopology();');
   await wait(`${first}?.endsWith('netlab-modem-white.png')`);
   await page.evaluate('store.getState().redoTopology();');
   await wait(`${first}?.endsWith('netlab-modem-dark.png')`);
   await page.evaluate('document.querySelector(".palette-item.kind-modem").click();window.secondModemId=[...sim.net.devices.keys()].at(-1);');
   await wait(`${second}?.endsWith('netlab-modem-white.png')`);
   assert.match(await page.evaluate(`return ${first};`), /netlab-modem-dark\.png$/);
  });
  const initial=await page.evaluate('await ws.controller.flush();return store.getState().captureWorkspaceDocument();');
  await test('F5 retains service configuration and names without role/schema metadata',async()=>{await mount(true);assert.deepEqual(await page.evaluate('return store.getState().captureWorkspaceDocument();'),initial);});
  await test('creation is undone/redone as one operation and drag/drop accepts the same preset',async()=>{
   const count = await page.evaluate('return sim.net.devices.size;');
   await page.evaluate('const transfer=new DataTransfer();transfer.setData("application/netsim","server");transfer.setData("application/netsim-server-preset","web");document.querySelector(".react-flow").dispatchEvent(new DragEvent("drop",{bubbles:true,dataTransfer:transfer,clientX:700,clientY:400}));');await delay(140);
   const before=await page.evaluate('return store.getState().captureWorkspaceDocument();');assert.equal(before.topology.devices.length,count+1);await page.evaluate('store.getState().undoTopology();');assert.equal(await page.evaluate('return sim.net.devices.size;'),count);await page.evaluate('store.getState().redoTopology();');assert.deepEqual(await page.evaluate('return store.getState().captureWorkspaceDocument();'),before);
  });
  for(const lang of ['de','en','pt-BR'])for(const appearance of ['graphite-dark','classic-light'])for(const width of [1440,700])await test(lang+' '+appearance+' '+width,async()=>{
   await page.send('Emulation.setDeviceMetricsOverride',{width,height:950,deviceScaleFactor:1,mobile:false});await page.evaluate(`i18n.useLanguage.getState().setLanguage(${JSON.stringify(lang)});theme.getState().setTheme(${JSON.stringify(appearance)});`);await delay(100);
   await page.evaluate('const toggle=document.querySelector(".palette-toggle");if(document.querySelector(".palette.is-collapsed"))toggle.click();');
   assert.equal(await page.evaluate('return document.querySelectorAll(".palette-item.kind-server").length;'),1);
   assert.equal(await page.evaluate('return document.querySelectorAll("[data-server-preset]").length;'),0);
   await page.evaluate('const d=[...sim.net.devices.values()].find(d=>d.dnsServer);store.getState().select(d.id);(await import("/src/serverPresets.ts")).requestServerServices(sim.net,d.id);');await delay(100);
   assert(await page.evaluate('return document.querySelector(".server-inspector").scrollWidth<=document.querySelector(".server-inspector").clientWidth+1;'));
  });
  await page.send('Emulation.setDeviceMetricsOverride',{width:1440,height:950,deviceScaleFactor:1,mobile:false});
  await page.evaluate('i18n.useLanguage.getState().setLanguage("de");theme.getState().setTheme("graphite-dark");');await delay(100);
  if(captureEnabled){await page.evaluate('const d=[...sim.net.devices.values()].find(d=>d.httpServer&&d.dnsServer);store.getState().select(d.id);(await import("/src/serverPresets.ts")).requestServerServices(sim.net,d.id);');await delay(100);await page.evaluate('store.getState().select([...sim.net.devices.values()].find(d=>d.kind==="modem").id);');await delay(100);await capture('modem-bridge');}
  await test('manual Save/Load preserves the exact preset document',async()=>{
   const before=await page.evaluate('await ws.controller.flush();return store.getState().captureWorkspaceDocument();');
   await page.evaluate('const saved=await ws.controller.save("Server preset review");if(!saved.ok)throw Error(saved.error.code);const id=ws.controller.getState().activeDraftId,draft=ws.controller.getState().drafts.find(d=>d.id===id);const closed=await ws.controller.closeDraft(id,{expectedEditSequence:draft.editSequence});if(!closed.ok)throw Error(closed.error.code);const opened=await ws.controller.openPlan(saved.value.plan.project.id);if(!opened.ok)throw Error(opened.error.code);');
   assert.deepEqual(await page.evaluate('return store.getState().captureWorkspaceDocument();'),before);
  });
  await test('combined display filters and animation filters preserve live traffic across the modem', async () => {
   await page.evaluate(`
    const { EXAMPLES } = await import('/src/labs/examples.ts');
    const example = EXAMPLES.find(({ file }) => file.devices.some(d => d.id === 'Provider') && file.devices.some(d => d.id === 'Modem'));
    await ws.controller.openDocument({ schemaVersion: 1, topology: example.file });
    i18n.useLanguage.getState().setLanguage('en');
    store.getState().setPaused(true, 'activation');
   `);
   await wait('sim.net.devices.has("Modem")');
   await page.evaluate('if (!document.querySelector("#packet-capture-menu")) document.querySelector(".packet-settings-toggle").click();');
   await wait('document.querySelector("[data-animation-protocol=tcp]")');
   await page.evaluate(`
     document.querySelector('[data-animation-protocol=tcp]').click();
     document.querySelector('#packets-toggle').click();
     store.getState().startPacketCapture();
     const { requestPage, simulatedUrl } = await import('/src/browser/request.ts');
     const results = [];
     for (const id of ['PC1', 'PC2']) requestPage(sim.net.devices.get(id), simulatedUrl('http://example.test'), r => results.push(r));
     sim.net.scheduler.advanceTo(sim.net.now + 15000);
     store.getState().stopPacketCapture();
     window.httpResults = results.map(result => [result.kind, result.status]);
   `);
   assert.deepEqual(await page.evaluate('return httpResults;'), [['http', 200], ['http', 200]]);
   const retained = await page.evaluate('return store.getState().packetCapture.records.length;');
   assert(retained > 50);
   const visualClock = await page.evaluate(`
    const { packets } = store.getState();
    const http = packets.find(p => p.application === 'http');
    const parent = packets.find(p => p.id === http.parentTransferId);
    if (!parent || http.visualStart < parent.visualStart + parent.visualDuration) throw Error('HTTP visual order');
    return http.visualStart + 10;
   `);
   await page.evaluate(`store.setState({ packetAnimationClock: ${visualClock} });`);
   await wait('document.querySelector(".packet-dot[data-application=http]")');
   assert(await page.evaluate('return [...document.querySelectorAll(".packet-dot")].every(dot => dot.dataset.protocol === "tcp");'));
   await page.evaluate('if (!document.querySelector("#packet-capture-menu")) document.querySelector(".packet-settings-toggle").click();');
   await wait('document.querySelector("[data-animation-protocol=all]")');
   await page.evaluate('document.querySelector("[data-animation-protocol=all]").click();document.querySelector(".packet-settings-toggle").click();');
   assert.deepEqual(await page.evaluate('return store.getState().animationProtocols;'), []);
   assert.equal(await page.evaluate('return document.querySelector(".packet-view-filters").open;'), false);
   await page.evaluate(`
    document.querySelector('.packet-view-filters summary').click();
    document.querySelector('.packet-protocol-options label').click();
    [...document.querySelectorAll('.packet-protocol-options label')].find(label => label.textContent === 'HTTP').click();
    const mode = document.querySelector('.packet-table-mode');
    mode.value = 'compact';
    mode.dispatchEvent(new Event('change', { bubbles: true }));
   `);
   const target = await page.evaluate(`
    const { ipToString } = await import('/src/engine/ip.ts');
    const packet = store.getState().packetCapture.records.find(p => p.frame.payload.l4?.app?.kind === 'http-request');
    const { src, dst } = packet.frame.payload;
    const count = store.getState().packetCapture.records.filter(p => p.linkId === packet.linkId &&
      p.frame.payload.src === src && p.frame.payload.dst === dst &&
      ['http-request', 'http-response'].includes(p.frame.payload.l4?.app?.kind)).length;
    return { linkId: packet.linkId, source: ipToString(src), destination: ipToString(dst), count };
   `);
   await page.evaluate(`
    const target = ${JSON.stringify(target)};
    const inputs = document.querySelectorAll('.packet-address-filters input');
    [target.source, target.destination].forEach((value, i) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(inputs[i], value);
      inputs[i].dispatchEvent(new Event('input', { bubbles: true }));
    });
    const link = document.querySelector('.packet-link-filter select');
    link.value = target.linkId;
    link.dispatchEvent(new Event('change', { bubbles: true }));
   `);
   await wait('document.querySelector(".packet-time") && [...document.querySelectorAll(".packet-protocol")].every(cell => cell.textContent === "HTTP")');
   const counts = await page.evaluate('return document.querySelector("[data-packet-filter-count]").textContent;');
   assert.equal(counts, `${target.count} visible · ${retained} captured`);
   assert(await page.evaluate(`return [...document.querySelectorAll('.packet-time')].every(button => button.title.endsWith(${JSON.stringify('(' + target.linkId + ')')}));`));
   await page.evaluate('document.querySelector(".packet-view-filters summary").click();');
   await wait('!document.querySelector(".packet-view-filters").open');
   assert.equal(await page.evaluate('return document.querySelector(".packet-active-filters").textContent;'), '5 active');
   assert.equal(await page.evaluate('return document.querySelector("[data-packet-filter-count]").textContent;'), counts);
   await page.evaluate('document.querySelector(".packet-time").click();');
   await wait('document.querySelector(".packet-details")');
   await page.evaluate('document.querySelector(".packet-view-filters summary").click();');
   await wait('document.querySelector(".packet-view-filters").open');
   await page.evaluate('document.querySelector(".packet-view-filters > button").click();');
   await wait(`document.querySelector("[data-packet-filter-count]").textContent.startsWith("${retained} visible")`);
   await page.send('Page.bringToFront');
   await page.evaluate('document.querySelector(".packet-view-filters summary").click(); store.getState().openTerminal("PC1");');
   await wait('document.querySelector(".terminal-dock:not(.is-collapsed)")?.contains(document.activeElement) && document.querySelector(".app").dataset.panelPriority==="terminal"');
   const overlapOwner = () => page.evaluate(`
     const dock=document.querySelector('.terminal-dock').getBoundingClientRect(), panel=document.querySelector('.packet-panel-shell').getBoundingClientRect();
     const owner=document.elementFromPoint(panel.left+panel.width/2, dock.top+Math.min(dock.height/2,70));
     return owner?.closest('.packet-panel-shell') ? 'packets' : owner?.closest('.terminal-dock') ? 'terminal' : null;
   `);
   assert.equal(await overlapOwner(), 'terminal');
   await page.evaluate('document.querySelector(".packet-table-mode").focus({preventScroll:true});');
   await wait('document.querySelector(".app").dataset.panelPriority==="packets"');
   assert.equal(await overlapOwner(), 'packets', JSON.stringify(await page.evaluate(`
     return ['.app','.main','.packet-panel-shell','.packet-inspector','.terminal-dock'].map(selector => {
       const node=document.querySelector(selector), css=getComputedStyle(node);
       return [selector,node.className,node.dataset.analysisLayout,css.zIndex,css.overflowY,
         css.getPropertyValue('--terminal-overlap-height'),node.getBoundingClientRect().toJSON()];
     });
   `)));
   await page.evaluate('document.querySelector(".terminal-dock-toggle").focus({preventScroll:true});');
   await wait('document.querySelector(".app").dataset.panelPriority==="terminal"');
   assert.equal(await overlapOwner(), 'terminal');
   await page.evaluate('document.querySelector(".packet-table-mode").focus({preventScroll:true});');
   await wait('document.querySelector(".app").dataset.panelPriority==="packets"');
   const splitSize = () => page.evaluate(`
     const panel=document.querySelector('#packet-inspector'), list=document.querySelector('.packet-list-scroll'), details=document.querySelector('.packet-details');
     return {height:panel.clientHeight,list:list.clientHeight,details:details.clientHeight,selection:details.querySelector('h3').textContent};
   `);
   const splitBefore = await splitSize();
   await page.evaluate('document.querySelector(".packet-list-scroll").scrollTop=30;');
   const listPosition = await page.evaluate('return document.querySelector(".packet-list-scroll").scrollTop;');
   assert(listPosition > 0);
   const grip = await page.evaluate(`
     const r=document.querySelector('.packet-splitter').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};
   `);
   await page.send('Page.bringToFront');
   assert(await page.evaluate(`return document.elementFromPoint(${grip.x},${grip.y})?.matches('.packet-splitter');`),
     JSON.stringify(await page.evaluate(`return document.elementFromPoint(${grip.x},${grip.y})?.outerHTML.slice(0,300);`)));
   await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',...grip});
   await page.send('Input.dispatchMouseEvent',{type:'mousePressed',...grip,button:'left',buttons:1,clickCount:1});
   await wait('document.querySelector(".packet-split.is-resizing")');
   for(let i=1;i<=4;i++) {
     await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:grip.x,y:grip.y+i*12,button:'left',buttons:1});
     await page.evaluate('await new Promise(requestAnimationFrame);');
   }
   await page.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:grip.x,y:grip.y+48,button:'left',buttons:0,clickCount:1});
   await wait(`document.querySelector('.packet-list-scroll').clientHeight>${splitBefore.list}`);
   const splitAfter = await splitSize();
   assert(splitAfter.details < splitBefore.details);
   assert.equal(splitAfter.height, splitBefore.height);
   assert.equal(splitAfter.selection, splitBefore.selection);
   assert.equal(await page.evaluate('return document.querySelector(".packet-list-scroll").scrollTop;'), listPosition);
   await page.evaluate(`
     const sep=document.querySelector('.packet-splitter');
     sep.dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true}));
     document.querySelector('.packet-details').scrollTop=35;
   `);
   await wait('document.querySelector(".packet-details").clientHeight<95');
   await page.evaluate('document.querySelector(".packet-details").scrollTop=35;');
   assert(await page.evaluate(`return document.querySelector('.packet-details').scrollTop>0 &&
     document.querySelector('.packet-list-scroll').scrollTop===${listPosition};`));
   await page.evaluate(`
     store.getState().closeTerminal('PC1');
     document.querySelector('.packet-splitter').dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true}));
   `);
   await wait('!document.querySelector(".terminal-dock") && document.querySelector(".packet-details").clientHeight>100');
   assert(await page.evaluate('return !!document.querySelector(".packet-details");'));
   assert.equal(await page.evaluate('return store.getState().packetCapture.records.length;'), retained);

   await page.evaluate('document.querySelector("[data-investigate]").click();');
   await wait('document.querySelector(".packet-diagnosis details[open]")');
   assert(await page.evaluate(`
     const panel=document.querySelector('.packet-diagnosis');
     const request=panel.querySelector('[data-role="request"] .packet-diagnosis-kind');
     const reply=panel.querySelector('[data-role="reply"] .packet-diagnosis-kind');
     return request?.textContent.includes('Request') && reply?.textContent.includes('Reply') &&
       getComputedStyle(request).color!==getComputedStyle(reply).color &&
       parseFloat(getComputedStyle(panel.querySelector('.packet-diagnosis-selection strong')).fontSize)>
       parseFloat(getComputedStyle(panel.querySelector('.packet-diagnosis-hop-id')).fontSize) &&
       panel.querySelector('.packet-diagnosis-overview').textContent.includes('HTTP') &&
       panel.textContent.includes('masquerade') && panel.textContent.includes('192.0.2.2');
   `));
   const dialog = '.packet-diagnosis';
   const rect = () => page.evaluate('return document.querySelector(".packet-diagnosis").getBoundingClientRect().toJSON();');
   const initialRect = await rect();
   assert.equal(initialRect.width, 520);
   assert.equal(initialRect.height, 400);
   assert(await page.evaluate(`const a=document.querySelector('.packet-diagnosis').getBoundingClientRect(),b=document.querySelector('#packet-inspector').getBoundingClientRect();return a.right<=b.left||a.left>=b.right;`));
   await page.evaluate(`window.traceWindow=document.querySelector('.packet-diagnosis');
     const buttons=[...document.querySelectorAll('.packet-time')];buttons.find(b=>b.getAttribute('aria-pressed')==='false').click();`);
   await wait('document.querySelector("#packet-diagnosis-title").textContent.includes(document.querySelector(".packet-details h3").textContent.match(/#\\d+/)[0])');
   assert(await page.evaluate('return traceWindow===document.querySelector(".packet-diagnosis");'));
   const drag = async (selector, dx, dy) => {
     await page.send('Page.bringToFront');
     const {x,y,hit}=await page.evaluate(`const el=document.querySelector(${JSON.stringify(selector)}), b=el.getBoundingClientRect(),x=b.left+b.width/2,y=b.top+b.height/2,target=document.elementFromPoint(x,y);return {x,y,hit:el.contains(target)?true:target?.outerHTML.slice(0,180)};`);
     assert.equal(hit,true,selector+' '+JSON.stringify({x,y,hit}));
     await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',x,y});
     await page.send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',buttons:1,clickCount:1});
     for(let i=1;i<=5;i++) await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:x+dx*i/5,y:y+dy*i/5,button:'left',buttons:1});
     await page.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:x+dx,y:y+dy,button:'left',buttons:0,clickCount:1});
     await page.evaluate('await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));');
   };
   await drag(dialog+' header',-20,25);
   await wait('document.querySelector(".packet-diagnosis").getBoundingClientRect().top>'+initialRect.top);
   const moved = await rect();
   assert(moved.left < initialRect.left);
   await drag(dialog+' .resize-se',20,15);
   const movedAndResized = await rect();
   assert(movedAndResized.width > moved.width && movedAndResized.height > moved.height);
   assert.equal(movedAndResized.left, moved.left);
   assert.equal(movedAndResized.top, moved.top);
   const workspaceTop = () => page.evaluate(`return document.querySelector('.main').getBoundingClientRect().top;`);
   const offsetTop = movedAndResized.top - await workspaceTop();
   await page.evaluate(`document.querySelector('.packet-time[aria-pressed="false"]').click();`);
   await wait('document.querySelector("#packet-diagnosis-title").textContent.includes(document.querySelector(".packet-details h3").textContent.match(/#\\d+/)[0])');
   assert.deepEqual(await rect(), movedAndResized);
   assert(await page.evaluate(`return getComputedStyle(document.querySelector('.packet-diagnosis-list')).overflowY==='auto';`));

   await page.send('Emulation.setDeviceMetricsOverride',{width:390,height:440,deviceScaleFactor:1,mobile:false});
   await wait(`document.querySelector('.packet-diagnosis').offsetWidth<390 && document.querySelector('.packet-diagnosis').offsetHeight<${movedAndResized.height}`);
   await page.evaluate(`const workspace=document.querySelector('.main');workspace.scrollTop=workspace.scrollHeight;`);
   await wait(`document.querySelector('.main').scrollTop>0 &&
     document.querySelector('.packet-diagnosis').getBoundingClientRect().top>=document.querySelector('.main').getBoundingClientRect().top`);
   assert(await page.evaluate(`const grip=document.querySelector('.packet-diagnosis .resize-se'),r=grip.getBoundingClientRect();
     return r.width>=24 && r.height>=24 && document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===grip;`));
   await page.send('Emulation.setDeviceMetricsOverride',{width:1440,height:950,deviceScaleFactor:1,mobile:false});
   await wait(`document.querySelector('.packet-diagnosis').offsetWidth>=520 &&
     document.querySelector('.packet-diagnosis').offsetHeight>=400`);
   const restored = await rect();
   assert.equal(restored.width, movedAndResized.width);
   assert.equal(restored.height, movedAndResized.height);
   assert.equal(restored.left, movedAndResized.left);
   assert.equal(restored.top - await workspaceTop(), offsetTop);

   await page.send('Emulation.setDeviceMetricsOverride',{width:700,height:950,deviceScaleFactor:1,mobile:false});
   await page.evaluate('store.getState().select("Modem");');
   await wait('document.querySelectorAll(".modem-inspector [data-modem-received]").length === 2');
   await page.evaluate('store.getState().openTerminal("PC1");');
   await wait('document.querySelector(".terminal-dock") && document.querySelector(".packet-diagnosis")');
   const compact = await splitSize();
   assert(compact.list >= 28 && compact.details >= 45, JSON.stringify(compact));
   assert(await page.evaluate('return document.documentElement.scrollWidth<=innerWidth+1;'));
   assert(await page.evaluate('const d=document.querySelector(".packet-diagnosis").getBoundingClientRect();return d.left>=0&&d.right<=innerWidth&&d.height>100;'));
   await page.evaluate('document.querySelector(".packet-diagnosis header button").click();');
   assert(await page.evaluate('return !document.querySelector(".packet-diagnosis") && !!document.querySelector(".packet-details");'));
   await page.evaluate('document.querySelector("[data-investigate]").click(); store.getState().clearPacketCapture();');
   await wait('document.querySelector(".packet-diagnosis [role=status]")');
   assert(await page.evaluate(`return [...document.querySelectorAll('[data-modem-received],[data-modem-forwarded]')].every(item => Number(item.textContent) > 0);`));
   assert(await page.evaluate(`return [...document.querySelectorAll('.packet-inspector,.modem-inspector')].every(panel => panel.scrollWidth <= panel.clientWidth + 1);`));
   await page.evaluate('store.getState().setModemColor("Modem", "dark"); await ws.controller.flush();');
   await mount(true);
   assert.equal(await page.evaluate('return !!document.querySelector(".packet-diagnosis");'), false);
   await page.evaluate('store.getState().select("Modem");');
   await wait('document.querySelector(".modem-inspector select")?.value === "dark"');
   assert(await page.evaluate(`return store.getState().packetCapture.records.length === 0 &&
     [...document.querySelectorAll('[data-modem-received],[data-modem-forwarded]')].every(item => item.textContent === '0');`));
   await page.evaluate(`i18n.useLanguage.getState().setLanguage('en');
     store.getState().setPacketInspectorOpen(true);store.getState().startPacketCapture();
     sim.net.devices.get('Router').delRoute(0,0);
     const {parseIp}=await import('/src/engine/ip.ts');sim.net.devices.get('PC1').sendEcho(parseIp('198.51.100.10'),19,1);
     sim.net.scheduler.advanceTo(sim.net.now+5000);store.getState().stopPacketCapture();`);
   await wait('document.querySelector(".packet-time")');
   assert.equal(await page.evaluate('return document.querySelector(".packet-view-filters").open;'), false);
   await page.evaluate(`
     const request=store.getState().packetCapture.records.find(p=>p.toDeviceId==='Router' &&
       p.frame.payload.l4?.msg?.type==='echo-request');
     document.querySelector('[aria-label="Inspect packet '+request.id+', ICMP"]').click();
   `);
   await wait('document.querySelector("[data-investigate]")');
   await page.evaluate('document.querySelector("[data-investigate]").click();');
   await wait('document.querySelector(".packet-diagnosis details")');
   assert(await page.evaluate(`
     const panel=document.querySelector('.packet-diagnosis');
     const request=panel.querySelector('[data-role="request"][data-tone="error"]');
     const error=panel.querySelector('[data-role="icmp-error"][data-tone="error"]');
     return panel.querySelector('.packet-diagnosis-overview').textContent.includes('No route to destination') &&
       request?.textContent.includes('Request') && error?.textContent.includes('ICMP error') &&
       error.textContent.includes('Response to transmission '+request.querySelector('.packet-diagnosis-hop-id').textContent) &&
       !panel.querySelector('[data-role="reply"]');
   `));
   await page.evaluate(`const {EXAMPLES}=await import('/src/labs/examples.ts');await ws.controller.openDocument({schemaVersion:1,topology:EXAMPLES[0].file});`);
   await wait('!document.querySelector(".packet-diagnosis") && store.getState().packetCapture.records.length===0');
  });
 }finally{await page.evaluate('window.ws?.dispose();');await page.evaluate(`await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase(${JSON.stringify(database)});r.onsuccess=resolve;r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Blocked'));});`);}
}
