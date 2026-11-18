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
  const initial=await page.evaluate('await ws.controller.flush();return store.getState().captureWorkspaceDocument();');
  await test('F5 retains service configuration and names without role/schema metadata',async()=>{await mount(true);assert.deepEqual(await page.evaluate('return store.getState().captureWorkspaceDocument();'),initial);});
  await test('creation is undone/redone as one operation and drag/drop accepts the same preset',async()=>{
   await page.evaluate('const transfer=new DataTransfer();transfer.setData("application/netsim","server");transfer.setData("application/netsim-server-preset","web");document.querySelector(".react-flow").dispatchEvent(new DragEvent("drop",{bubbles:true,dataTransfer:transfer,clientX:700,clientY:400}));');await delay(140);
   const before=await page.evaluate('return store.getState().captureWorkspaceDocument();');assert.equal(before.topology.devices.length,6);await page.evaluate('store.getState().undoTopology();');assert.equal(await page.evaluate('return sim.net.devices.size;'),5);await page.evaluate('store.getState().redoTopology();');assert.deepEqual(await page.evaluate('return store.getState().captureWorkspaceDocument();'),before);
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
 }finally{await page.evaluate('window.ws?.dispose();');await page.evaluate(`await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase(${JSON.stringify(database)});r.onsuccess=resolve;r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Blocked'));});`);}
}
