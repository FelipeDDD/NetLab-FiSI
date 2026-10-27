import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function runInterfaceAudit({page,url,root,report}) {
  const database='netlab-idb-test-'+crypto.randomUUID();
  const directory=path.join(root,'.playwright-mcp/reviews/raw/interface-dhcp-audit');await mkdir(directory,{recursive:true});
  const evidence={},results={};const delay=ms=>new Promise(r=>setTimeout(r,ms));
  const wait=async expression=>{for(let i=0;i<200;i++){try{if(await page.evaluate(`return !!(${expression});`))return;}catch{}await delay(50);}throw Error('Audit condition: '+expression);};
  const test=async(name,work)=>{try{await work();results[name]={passed:true};}catch(error){results[name]={passed:false,error:error.stack};throw error;}};
  const mount=async()=>{
    await page.send('Page.navigate',{url});await wait("location.pathname==='/__application_boot_test__'&&document.readyState==='complete'");
    await page.evaluate(`await import('/node_modules/@xyflow/react/dist/style.css');await import('/node_modules/@xterm/xterm/css/xterm.css');await import('/src/themes.css');await import('/src/styles.css');await import('/src/buttons.css');
      window.entry=await import('/src/workspace/WorkspaceApplication.tsx');window.store=(await import('/src/store.ts')).useStore;window.sim=(await import('/src/sim.ts')).sim;
      window.fixtures=await import('/src/testing/interfaceAuditFixture.ts');window.terminals=await import('/src/terminals.ts');
      window.source=JSON.stringify(fixtures.interfaceAuditDocument());window.application=entry.mountWorkspaceApplication(document.getElementById('root'),{repositoryOptions:{databaseName:${JSON.stringify(database)}},legacy:{storage:{getItem:key=>key==='netsim:autosave:v1'?source:null},origin:'https://disposable-audit.invalid'}});await application.ready;`);
    await wait("application.controller?.getState().phase==='ready'&&document.querySelectorAll('.react-flow__node').length===6");
    await page.send('Page.bringToFront');
  };
  const identity=()=>page.evaluate(`const d=store.getState().captureWorkspaceDocument().topology;return {devices:d.devices.map(n=>({id:n.id,ifaces:n.ifaces,vlans:n.vlans??{},dhcpPools:n.dhcpPools??{}})),links:d.links,cableColors:d.ui.cableColors};`);
  const screenshot=async name=>{await delay(150);const image=await page.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(directory,name),Buffer.from(image.data,'base64'));};
  const command=async(id,text)=>{
    await page.evaluate(`store.getState().openTerminal(${JSON.stringify(id)});window.session=terminals.getSession(sim.net.devices.get(${JSON.stringify(id)}));window.session.term.input(${JSON.stringify(text+'\r')},true);`);
    await delay(100);
  };
  const text=()=>page.evaluate(`const t=session.term.buffer.active;return Array.from({length:t.length},(_,i)=>t.getLine(i)?.translateToString(true)??'').join('\\n');`);
  try {
    await page.send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});await mount();
    await test('audit: legacy migration, Inspector, labels and physical link identities agree',async()=>{
      assert.equal(await page.evaluate('return store.getState().paused;'),true);assert.equal(await page.evaluate('return store.getState().pauseReason;'),'activation');
      await page.evaluate("(await import('/src/uiTheme.ts')).useUiTheme.getState().setTheme('graphite-dark');store.getState().select('r1');");
      await wait("document.querySelector('.interface-summary[data-interface-name=eth2]')");
      evidence.initial=await identity();
      evidence.presentation=await page.evaluate(`const card=n=>{const c=document.querySelector('.inspector .interface-summary[data-interface-name='+n+']');return {text:c.textContent,color:c.dataset.cableColor,link:c.dataset.linkId,state:c.dataset.linkState};};const rows=[...document.querySelectorAll('.react-flow__node[data-id=r1] .node-network-row')].map(r=>({name:r.dataset.interfaceName,color:r.dataset.cableColor,active:r.dataset.operational,text:r.textContent}));return {eth2:card('eth2'),eth3:card('eth3'),rows,paused:store.getState().paused,clock:sim.net.now};`);
      assert.equal(evidence.presentation.eth2.link,'ap-uplink');assert.equal(evidence.presentation.eth2.color,'#f472b6');assert(evidence.presentation.eth2.text.includes('Kein IPv4'));
      assert(!evidence.presentation.eth3.link);assert(evidence.presentation.eth3.text.includes('192.168.2.1/24'));
      assert.deepEqual(evidence.presentation.rows.map(r=>r.name),['eth0','eth3']);assert(!evidence.presentation.rows[1].color);
      // Explicit review framing only; production panel changes never auto-fit.
      await page.evaluate("document.querySelector('.react-flow__controls-fitview').click();");
      await screenshot('01-disposable-eth2-cable-eth3-ipv4.png');
    });
    await test('audit: Save/Load, plan switching and F5 preserve exact interface identities and configuration',async()=>{
      const a=await page.evaluate("const r=await application.controller.save('Interface audit');if(!r.ok)throw Error(JSON.stringify(r));return application.controller.getState().activeDraftId;");
      await page.evaluate("const r=await application.controller.openDocument({schemaVersion:1,topology:fixtures.interfaceAuditDocument(true)});if(!r.ok)throw Error(JSON.stringify(r));");
      assert.equal((await identity()).links.find(l=>l.id==='ap-uplink').a[1],'eth3');
      await page.evaluate(`const r=await application.controller.switchDraft(${JSON.stringify(a)});if(!r.ok)throw Error(JSON.stringify(r));`);
      assert.deepEqual(await identity(),evidence.initial);
      await page.evaluate('await application.controller.flush();');
      await page.send('Page.reload');await mount();assert.deepEqual(await identity(),evidence.initial);
      assert.equal(await page.evaluate('return application.controller.getState().activeDraftId;'),a);
      evidence.afterRestore=await identity();assert.equal(await page.evaluate('return sim.net.now;'),0);
    });
    await test('commands: real xterm reads stay paused; DHCP starts Run and performs normal DORA',async()=>{
      await command('pc1','ip addr');assert.equal(await page.evaluate('return store.getState().paused;'),true);
      await command('pc1','dhclient eth0');await wait("!store.getState().paused");
      await wait("sim.net.devices.get('pc1').interfaces[0].dhcpLease");
      evidence.dhcpOutput=await text();assert(evidence.dhcpOutput.includes('DHCPACK'));assert(evidence.dhcpOutput.includes('192.168.1.100'));
      assert.equal(await page.evaluate("return sim.net.devices.get('pc3').getInterface('wlan0').ip;"),null);
    });
    await test('commands: toolbar Pause is respected and explicit Run releases a queued ping',async()=>{
      await page.evaluate("document.querySelector('.toolbar-run').click();");const clock=await page.evaluate('return sim.net.now;');
      await command('pc2','ping -c 1 192.168.1.1');await delay(300);
      assert.equal(await page.evaluate('return sim.net.now;'),clock);assert.equal(await page.evaluate('return store.getState().pauseReason;'),'manual');
      await page.evaluate("document.querySelector('.toolbar-run').click();");
      await wait("(()=>{const b=session.term.buffer.active;return Array.from({length:b.length},(_,i)=>b.getLine(i)?.translateToString(true)??'').join(' ').includes('0% packet loss')})()");
      evidence.pingOutput=await text();
      await screenshot('02-command-run-and-dhcp.png');
      await page.evaluate('await application.controller.flush();');
    });
    await test('audit/commands: restored DHCP values retain identity, drop runtime leases and Guided starts without replacing playback controls',async()=>{
      // Stop only the test loop to freeze a coherent comparison, not via user Pause.
      await page.evaluate("store.getState().setPaused(true,'activation');await application.controller.flush();");const before=await identity();
      await page.send('Page.reload');await mount();assert.deepEqual(await identity(),before);
      evidence.restoredDhcp=await page.evaluate("const p=sim.net.devices.get('pc1').interfaces[0],r=sim.net.devices.get('r1');return {ipv4:p.ipv4,lease:p.dhcpLease,leases:r.dhcpPools.get('eth0').leases.size,arp:r.arpTable.size,events:sim.net.scheduler.pending,paused:store.getState().paused};");
      assert.equal(evidence.restoredDhcp.lease,null);assert.equal(evidence.restoredDhcp.leases,0);assert.equal(evidence.restoredDhcp.arp,0);assert.equal(evidence.restoredDhcp.events,0);assert.equal(evidence.restoredDhcp.paused,true);
      await page.evaluate("store.getState().setPacketVisualizationMode('guided');");await command('pc2','ping -c 1 192.168.1.1');
      await wait("store.getState().guidedPacket.observation.observed.length>=4");
      assert.equal(await page.evaluate('return store.getState().paused;'),false);
      await page.evaluate('store.getState().setPaused(true);store.getState().nextGuidedHop();store.getState().replayGuidedPacket();');
      assert.equal(await page.evaluate('return store.getState().guidedPacket.playback.kind;'),'replay');assert.equal(await page.evaluate('return store.getState().paused;'),true);
      assert.equal(await page.evaluate('return source;'),await page.evaluate('return JSON.stringify(fixtures.interfaceAuditDocument());'));
    });
    await test('audit: delayed DHCP Offer reproduces a retry without changing the live test topology',async()=>{
      evidence.delayedDora=await page.evaluate(`const {net,wireless}=fixtures.interfaceAuditFixture(true);for(const link of net.links.values())link.latency=250;const {runDhclient}=await import('/src/commands/dhclient.ts');let output='',doneAt=null;runDhclient(wireless,['wlan0'],s=>output+=s,()=>{doneAt=net.now;});net.scheduler.advanceTo(8000);return {doneAt,output};`);
      assert.equal(evidence.delayedDora.doneAt,3500);assert.equal((evidence.delayedDora.output.match(/DHCPDISCOVER/g)??[]).length,2);
      assert(evidence.delayedDora.output.includes('DHCPACK'));
    });
    report.interfaceAudit={directory,evidence};
  }finally{
    try{await page.evaluate('application?.dispose();');}catch{}
    await page.evaluate(`await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase(${JSON.stringify(database)});r.onsuccess=resolve;r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Disposable audit cleanup blocked'));});`);
    Object.assign(report.results,results);await writeFile(path.join(directory,'results.json'),JSON.stringify({results,evidence},null,2));
  }
}
