import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';

export async function runRouterTutorialReview({page,root,report,wait,delay,click,command,advance,mount,menu,tutorialId}){
 const directory=path.join(root,'.playwright-mcp/reviews/raw/router-tutorial');await mkdir(directory,{recursive:true});
 const test=async(name,fn)=>{try{await fn();report.results['router tutorial: '+name]={passed:true};}catch(e){report.results['router tutorial: '+name]={passed:false,error:e.stack,visible:await page.evaluate('return {panel:document.querySelector(".exercise-panel")?.textContent,devices:[...sim.net.devices.keys()]};')};throw e;}};
 const step=n=>wait(`document.querySelector('[data-router-step="${n}"]')`),passed=()=>page.evaluate("return document.querySelector('[data-router-passed]')?.dataset.routerPassed==='true';");
 const next=async()=>{await wait("document.querySelector('.exercise-panel footer .btn--primary:not(:disabled)')");await click('.exercise-panel footer .btn--primary');};
 const armed=()=>page.evaluate("return document.querySelector('[data-router-repeat]')?.dataset.routerRepeatConfirm==='true';");
 const escape=async()=>{for(const type of ['keyDown','keyUp'])await page.send('Input.dispatchKeyEvent',{type,key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await delay(80);};
 const repeat=async()=>{await click('[data-router-repeat]');assert(await armed());await click('[data-router-repeat]');};
 const type=async(selector,text)=>{await click(selector);for(const type of ['keyDown','keyUp'])await page.send('Input.dispatchKeyEvent',{type,key:'a',code:'KeyA',modifiers:2,windowsVirtualKeyCode:65});await page.send('Input.insertText',{text});await delay(100);};
 const inspectorGateway=async(id,gateway)=>{await page.evaluate(`store.getState().setTerminalDockCollapsed(true);store.getState().select('${id}');`);await wait("document.querySelector('.inspector [role=tab]')");await click('.inspector [role=tab]','Netzwerk');await type('.inspector input[aria-label="Standardgateway eth0"]',gateway);await click('.inspector input[aria-label="Subnetzmaske eth0"]');await delay(300);await page.evaluate('store.getState().select(null);');};
 const shot=async name=>{const r=await page.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(directory,name+'.png'),Buffer.from(r.data,'base64'));};
 const saved=async()=>{await wait("document.querySelector('[data-router-saving=false]')");await page.evaluate('await ws.controller.flush();');};
 const reload=async n=>{await saved();const before=await page.evaluate('return {ids:store.getState().nodes.map(n=>n.id),positions:store.getState().nodes.map(n=>n.position),active:ws.controller.getState().activeDraftId};');await mount(true);await step(n);assert.deepEqual(await page.evaluate('return {ids:store.getState().nodes.map(n=>n.id),positions:store.getState().nodes.map(n=>n.position),active:ws.controller.getState().activeDraftId};'),before);};
 const configure=async(id,iface,ip,gateway=null)=>{await page.evaluate(`const v={mode:'static',ip:(await import('/src/engine/ip.ts')).parseCidr(${JSON.stringify(ip)}),gateway:${gateway?`(await import('/src/engine/ip.ts')).parseIp(${JSON.stringify(gateway)})`:'null'},dns:null};const e=store.getState().setInterfaceIpv4(${JSON.stringify(id)},${JSON.stringify(iface)},v);if(e)throw Error(e);`);await delay(100);};
 const terminal=async id=>{await page.evaluate(`store.getState().terminals.filter(id=>id!==${JSON.stringify(id)}).forEach(id=>store.getState().closeTerminal(id));store.getState().openTerminal(${JSON.stringify(id)});`);await wait("document.querySelector('.xterm-helper-textarea')");};
 const r='tutorial-03-router',b='tutorial-03-switch',e='tutorial-03-e',f='tutorial-03-f';let history,positions,originalMask;
 await test('continues Chapter 2 in the same draft, preserving earlier histories, positions and D mask',async()=>{
  await page.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await page.evaluate("theme.getState().setTheme('graphite-dark');store.getState().select(null);store.getState().setTerminalDockCollapsed(true);");
  await delay(180); // Let responsive panels settle before computing click coordinates.
  history=await page.evaluate('return await Promise.all(["guided:v1:draft:","guided:subnet-mask:v1:draft:"].map(k=>ws.repository.getMeta(k+ws.controller.getState().activeDraftId)));');
  positions=await page.evaluate('return store.getState().nodes.map(n=>({id:n.id,position:n.position}));');originalMask=await page.evaluate("return sim.net.devices.get('tutorial-02-d').interfaces[0].ip.prefix;");
  await wait("document.querySelector('[data-router-continue]:not(:disabled)')");await click('[data-router-continue]');await step(1);await saved();assert.equal(await page.evaluate('return ws.controller.getState().activeDraftId;'),tutorialId);
  assert.deepEqual(await page.evaluate(`return store.getState().nodes.filter(n=>${JSON.stringify(positions.map(n=>n.id))}.includes(n.id)).map(n=>({id:n.id,position:n.position}));`),positions);
  assert.equal(await page.evaluate("return sim.net.devices.get('tutorial-02-d').interfaces[0].ip.prefix;"),originalMask);
  assert(await page.evaluate(`return !sim.net.devices.get('${f}').interfaces[0].link&&!sim.net.devices.get('${f}').interfaces[0].ip&&!document.querySelector('[data-router-passed]')&&!!document.querySelector('.exercise-panel footer .btn--primary:not(:disabled)');`));
  assert(await page.evaluate(`const p=await import('/src/devicePlacement.ts'),nodes=store.getState().nodes,old=${JSON.stringify(positions.map(n=>n.id))};return nodes.filter(n=>!old.includes(n.id)).every(n=>nodes.filter(m=>m.id!==n.id).every(m=>!p.boxesOverlap(p.placementBox(n),p.placementBox(m))));`));
  await click('.react-flow__controls-fitview');await delay(200);await shot('01-router-introduction');await reload(1);
 });
 await test('real cables and Linux interface commands validate the actual LAN correspondence',async()=>{
  await next();await step(2);assert.equal(await passed(),false);
  await page.evaluate(`store.getState().onConnect({source:'${r}',target:'tutorial-01-switch'});store.getState().onConnect({source:'${r}',target:'${b}'});`);await wait("document.querySelector('[data-router-passed=true]')");await shot('02-router-connected');await click('.exercise-panel footer button','Weiter');await step(3);
  await terminal(r);await command('ip address add 192.168.20.1/24 dev eth0');await command('ip address add 192.168.10.1/24 dev eth1');assert.equal(await passed(),false);
  await command('ip address del 192.168.20.1/24 dev eth0');await command('ip address add 192.168.10.1/24 dev eth0');await command('ip address del 192.168.10.1/24 dev eth1');await command('ip address add 192.168.20.1/24 dev eth1');await wait("document.querySelector('[data-router-passed=true]')");await saved();await shot('03-router-configured');
  const {reviewTutorialCompletion}=await import('./tutorial-completion-review.mjs');await reviewTutorialCompletion({page,root,report,wait,delay,click,menu,mount,stage:'partial'});
 });
 await test('F needs a real cable and unique address; A gateway is configured through the Inspector',async()=>{
  await next();await step(4);assert.equal(await passed(),false);assert(await page.evaluate("return document.querySelector('[data-router-step] pre').textContent==='ip address add <IPv4>/<Präfix> dev eth0';"));
  await configure(f,'eth0','192.168.20.30/24');assert.equal(await passed(),false);await page.evaluate(`store.getState().onConnect({source:'${f}',target:'${b}'});`);await wait("document.querySelector('[data-router-passed=true]')");
  await configure(f,'eth0','192.168.20.10/24');assert.equal(await passed(),false);await configure(f,'eth0','192.168.20.30/24');await wait("document.querySelector('[data-router-passed=true]')");await shot('04-pc-f-configured');await next();await step(5);
  await inspectorGateway('tutorial-01-a','192.168.10.1');await wait("document.querySelector('[data-router-passed=true]')");assert(await page.evaluate(`return sim.net.devices.get('${e}').interfaces[0].gateway===null&&[...sim.net.devices.values()].filter(d=>d.staticRoutes).every(d=>d.staticRoutes.length===0);`));await saved();await shot('05-inspector-gateway');
 });
 await test('one centered Repeat/Confirm button preserves panel size and cancels on Escape, navigation, draft switching and F5',async()=>{
  const before=await page.evaluate('return JSON.stringify(store.getState().captureWorkspaceDocument());');
  for(const themeName of ['graphite-dark','classic-light']){
   await page.evaluate(`theme.getState().setTheme('${themeName}');`);
   for(const [language,label,confirm] of [['de','Wiederholen','Bestätigen'],['en','Repeat','Confirm'],['pt-BR','Repetir','Confirmar']]){
    await page.evaluate(`lang.getState().setLanguage('${language}');`);await delay(60);
    assert.equal(await page.evaluate("return document.querySelector('[data-router-repeat]').textContent;"),label);
    const normal=await page.evaluate("const p=document.querySelector('.exercise-panel'),b=p.querySelector('[data-router-repeat]');return {height:p.getBoundingClientRect().height,color:getComputedStyle(b).color};");
    await click('[data-router-repeat]');assert(await armed());assert.equal(await passed(),true);
    assert.equal(await page.evaluate("return document.querySelector('[data-router-repeat]').textContent;"),confirm);
    const confirmation=await page.evaluate("const p=document.querySelector('.exercise-panel'),footer=p.querySelector('footer'),b=p.querySelector('[data-router-repeat]'),r=b.getBoundingClientRect(),f=footer.getBoundingClientRect();return {buttons:footer.children.length,middle:footer.children[1]===b,extra:!!p.querySelector('[role=group]'),center:(r.left+r.right-f.left-f.right)/2,height:p.getBoundingClientRect().height,color:getComputedStyle(b).color};");
    assert.equal(confirmation.buttons,3);assert(confirmation.middle);assert.equal(confirmation.extra,false);assert(Math.abs(confirmation.center)<1,JSON.stringify(confirmation));assert(Math.abs(confirmation.height-normal.height)<1,JSON.stringify({normal,confirmation}));assert.notEqual(confirmation.color,normal.color);
    await escape();assert.equal(await armed(),false);assert.equal(await page.evaluate('return JSON.stringify(store.getState().captureWorkspaceDocument());'),before);
   }
  }
  await page.evaluate("lang.getState().setLanguage('de');theme.getState().setTheme('graphite-dark');");
  await saved();await click('[data-router-repeat]');await shot('05-inline-repeat-confirmation');await reload(5);assert.equal(await armed(),false);assert.equal(await passed(),true);
  await click('[data-router-repeat]');await click('.exercise-panel footer button','Zurück');await step(4);await next();await step(5);assert.equal(await armed(),false);
  await saved();await click('[data-router-repeat]');const id=await page.evaluate('return ws.controller.getState().activeDraftId;');const other=await page.evaluate('return ws.controller.getState().drafts.find(d=>d.id!==ws.controller.getState().activeDraftId).id;');
  await page.evaluate(`await ws.controller.switchDraft(${JSON.stringify(other)});`);await wait(`ws.controller.getState().activeDraftId===${JSON.stringify(other)}&&!document.querySelector('[data-router-step]')`);await page.evaluate(`await ws.controller.switchDraft(${JSON.stringify(id)});`);await step(5);await saved();assert.equal(await armed(),false);
  await repeat();await wait("document.querySelector('[data-router-passed=false]')");await page.evaluate('store.getState().undoTopology();');await wait("document.querySelector('[data-router-passed=true]')");await page.evaluate('store.getState().redoTopology();');await wait("document.querySelector('[data-router-passed=false]')");await reload(5);assert.equal(await passed(),false);await inspectorGateway('tutorial-01-a','192.168.10.1');await wait("document.querySelector('[data-router-passed=true]')");await saved();await click('[data-router-repeat]');
 });
 await test('F Linux default route accepts equivalent existing routes and repeats without touching other routes',async()=>{
  await next();await step(6);assert.equal(await armed(),false);assert.equal(await passed(),false);await terminal(f);await command('ip route add default via 192.168.20.99 dev eth0');assert.equal(await passed(),false);await command('ip route replace default via 192.168.20.1 dev eth0');await wait("document.querySelector('[data-router-passed=true]')");await saved();await shot('06-linux-default-route');
  await command('ip route add 198.51.100.0/24 via 192.168.20.1 dev eth0');await saved();await repeat();await wait("document.querySelector('[data-router-passed=false]')");assert(await page.evaluate(`return sim.net.devices.get('${f}').staticRoutes.length===1&&sim.net.devices.get('${f}').staticRoutes[0].prefix===24;`));await page.evaluate('store.getState().undoTopology();');await wait("document.querySelector('[data-router-passed=true]')");await page.evaluate('store.getState().redoTopology();');await wait("document.querySelector('[data-router-passed=false]')");await reload(6);await terminal(f);await command('ip route add default via 192.168.20.1 dev eth0');await wait("document.querySelector('[data-router-passed=true]')");
 });
 await test('terminal and Quick Ping prove A/F directions, then a real B no-route attempt opens the correction phase',async()=>{
  await next();await step(7);await terminal('tutorial-01-a');await command('ping -c 1 192.168.20.30');await advance(5000);await wait("document.querySelector('[data-router-reply=a][data-tutorial-passed=true]')");assert.equal(await passed(),false);
  await page.evaluate(`store.getState().beginQuickPing('${f}');store.getState().chooseQuickPingTarget('tutorial-01-a');`);await delay(100);await advance(12000);await wait("document.querySelector('[data-router-passed=true]')");await saved();await shot('07-bidirectional-replies');
  await click('.exercise-panel footer button','Zurück');await step(6);await next();await step(7);assert.equal(await passed(),true);await reload(7);assert.equal(await passed(),true);
  await next();await step(8);await page.evaluate(`store.getState().beginQuickPing('tutorial-01-b');store.getState().chooseQuickPingTarget('${f}');`);await delay(100);await advance(5000);await wait("document.querySelector('[data-router-step] h3')?.textContent==='Ursache finden und beheben'");assert.equal(await passed(),false);await saved();await shot('08-diagnosis-correction');await reload(8);
  await inspectorGateway('tutorial-01-b','192.168.10.1');assert.equal(await passed(),false);await page.evaluate(`store.getState().beginQuickPing('tutorial-01-b');store.getState().chooseQuickPingTarget('${f}');`);await delay(100);await advance(12000);await wait("document.querySelector('[data-router-passed=true]')");await saved();await shot('09-chapter-complete');await reload(8);assert.equal(await passed(),true);
  assert.deepEqual(await page.evaluate('return await Promise.all(["guided:v1:draft:","guided:subnet-mask:v1:draft:"].map(k=>ws.repository.getMeta(k+ws.controller.getState().activeDraftId)));'),history);
  for(const language of ['en','pt-BR','de']){await page.evaluate(`lang.getState().setLanguage(${JSON.stringify(language)});`);await delay(60);assert.equal(await passed(),true);}
  const {reviewTutorialCompletion}=await import('./tutorial-completion-review.mjs');await reviewTutorialCompletion({page,root,report,wait,delay,click,menu,mount,stage:'completed'});
  await page.evaluate("theme.getState().setTheme('classic-light');store.getState().select(null);store.getState().setTerminalDockCollapsed(true);");await page.send('Emulation.setDeviceMetricsOverride',{width:700,height:800,deviceScaleFactor:1,mobile:false});await delay(160);assert(await page.evaluate("const r=document.querySelector('.exercise-panel').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1&&document.documentElement.scrollWidth<=innerWidth+1;"));await shot('07-classic-light-700');
 });
 if(process.env.NETLAB_CHAPTER_RESTART_REVIEW==='1'){
  const {reviewChapterRestart,reviewRestartFailures}=await import('./chapter-restart-review.mjs');
  await reviewChapterRestart({page,root,report,wait,delay,click,mount,chapter:'two-networks',variant:'-continue'});
  await reviewRestartFailures({page,report,wait,delay,click});
 }
 await test('direct start accepts early configuration and a preconfigured B, without invented earlier completion or artificial failure',async()=>{
  const tabs=await page.evaluate('return ws.controller.getState().drafts.length;');await menu();await click('[data-router-direct]');await step(1);await saved();assert.equal(await page.evaluate('return ws.controller.getState().drafts.length;'),tabs+1);
  const directId=await page.evaluate('return ws.controller.getState().activeDraftId;');assert.notEqual(directId,tutorialId);assert(await page.evaluate('const id=ws.controller.getState().activeDraftId;return (await ws.repository.getMeta("guided:v1:draft:"+id)).value===null&&(await ws.repository.getMeta("guided:subnet-mask:v1:draft:"+id)).value===null;'));
  assert(await page.evaluate(`return !sim.net.devices.get('${f}').interfaces[0].ip&&!sim.net.devices.get('${f}').interfaces[0].link;`));await reload(1);
  await page.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await page.evaluate("theme.getState().setTheme('graphite-dark');");
  assert(await page.evaluate(`const nodes=store.getState().nodes,p=id=>nodes.find(n=>n.id===id).position,a=p('tutorial-01-a'),c=p('tutorial-03-base-c'),d=p('tutorial-02-d'),left=p('tutorial-01-switch'),right=p('${b}'),router=p('${r}'),e=p('${e}'),f=p('${f}');return a.x===c.x&&a.y===p('tutorial-01-b').y&&c.y===d.y&&a.y<left.y&&left.y<c.y&&left.x<router.x&&router.x<right.x&&left.y===right.y&&e.x===f.x&&e.x>right.x&&e.y<right.y&&f.y>right.y;`));
  assert(await page.evaluate(`const p=await import('/src/devicePlacement.ts'),boxes=store.getState().nodes.map(p.placementBox);return !boxes.some((a,i)=>boxes.slice(i+1).some(b=>p.boxesOverlap(a,b)));`));
  await click('.react-flow__controls-fitview');await delay(180);await shot('10-direct-reference-layout');
  await page.evaluate(`store.getState().onConnect({source:'${r}',target:'tutorial-01-switch'});store.getState().onConnect({source:'${r}',target:'${b}'});store.getState().onConnect({source:'${f}',target:'${b}'});`);
  await configure(r,'eth0','192.168.10.254/24');await configure(r,'eth1','192.168.20.254/24');await configure(f,'eth0','192.168.20.50/24');await inspectorGateway('tutorial-01-a','192.168.10.254');
  await terminal(f);await command('ip route add default via 192.168.20.254 dev eth0');await terminal('tutorial-01-b');await command('ip route add 192.168.20.0/24 via 192.168.10.254 dev eth0');
  for(let n=2;n<=7;n++){await next();await step(n);}assert.equal(await passed(),false);
  await page.evaluate(`store.getState().beginQuickPing('tutorial-01-a');store.getState().chooseQuickPingTarget('${f}');`);await delay(100);await advance(12000);await wait("document.querySelector('[data-router-reply=a][data-tutorial-passed=true]')");
  await page.evaluate(`store.getState().beginQuickPing('${f}');store.getState().chooseQuickPingTarget('tutorial-01-a');`);await delay(100);await advance(12000);await wait("document.querySelector('[data-router-passed=true]')");await next();await step(8);assert.equal(await passed(),false);
  await terminal('tutorial-01-b');await command('ping -c 1 192.168.20.50');await advance(6000);await wait("document.querySelector('[data-router-passed=true]')");assert(await page.evaluate("return document.querySelector('.exercise-learning').textContent.includes('Es wurde kein Fehler eingebaut');"));await reload(8);assert.equal(await passed(),true);
  await page.evaluate('store.getState().setTerminalDockCollapsed(true);');await click('.react-flow__controls-fitview');await delay(180);await shot('11-direct-reference-connected');await saved();
  if(process.env.NETLAB_CHAPTER_RESTART_REVIEW==='1'){
   const {reviewChapterRestart}=await import('./chapter-restart-review.mjs');
   await reviewChapterRestart({page,root,report,wait,delay,click,mount,chapter:'two-networks',variant:'-direct'});
  }
  const before=await page.evaluate('return JSON.stringify(store.getState().captureWorkspaceDocument());');
  await page.evaluate(`const id=ws.controller.getState().activeDraftId,key='guided:two-networks:v1:draft:'+id,res=await ws.repository.getMeta(key),current=res.value.value;const legacy={schemaVersion:1,chapterVersion:1,chapterId:'two-networks',draftId:id,pcC:current.pcC,source:'direct',prepared:true,step:6,completed:[1,2,3,4,5,6],replies:{a:current.replies.a,e:current.replies.f}};const result=await ws.repository.setMeta({key,expectedRevision:res.value.revision,value:legacy});if(!result.ok)throw Error(result.error.code);`);
  await mount(true);await step(6);await saved();assert.equal(await page.evaluate('return JSON.stringify(store.getState().captureWorkspaceDocument());'),before);assert(await page.evaluate("return !document.querySelector('[data-router-step] details')&&!document.querySelector('[data-router-step]').textContent.includes('Vorhandener Versuch erhalten');"));assert(await page.evaluate("const id=ws.controller.getState().activeDraftId;return !!(await ws.repository.getMeta('guided:two-networks:v1:draft:'+id)).value.value.legacy;"));await next();await step(7);assert.equal(await passed(),false);await reload(7);assert.equal(await passed(),false);
  await page.evaluate(`await ws.controller.switchDraft(${JSON.stringify(tutorialId)});`);await step(8);assert.equal(await passed(),true);
 });
 report.routerTutorialReview={directory};
}
