import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Production controller/React/xterm, with a disposable browser profile and DB.
export async function runPingBackpressure({page,url,root,report}) {
  const database='netlab-idb-test-'+crypto.randomUUID();
  const directory=path.join(root,'.playwright-mcp/reviews/raw/ping-backpressure');
  await mkdir(directory,{recursive:true});const evidence={stress:[],broadcast:[]};
  const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const wait=async expression=>{for(let i=0;i<240;i++){if(await page.evaluate(`return !!(${expression});`))return;await delay(30);}throw Error('Ping backpressure condition: '+expression);};
  const test=async(name,run)=>{try{await run();report.results['Ping backpressure: '+name]={passed:true};}catch(error){report.results['Ping backpressure: '+name]={passed:false,error:error.stack};throw error;}};
  const settle=async()=>{await delay(40);await page.evaluate('if(window.session)await new Promise(resolve=>session.term.write("",resolve));');};
  const command=async(id,line)=>{await page.evaluate(`store.getState().openTerminal(${JSON.stringify(id)});window.session=terminals.getSession(sim.net.devices.get(${JSON.stringify(id)}));session.term.input(${JSON.stringify(line+'\r')},true);`);await settle();};
  const cancel=async()=>{await page.evaluate('session.term.input("\\x03",true);');await settle();};
  const text=()=>page.evaluate('const b=session.term.buffer.active;return Array.from({length:b.length},(_,i)=>b.getLine(i)?.translateToString(true)??"").join("\\n");');
  const mount=async()=>{
    await page.send('Page.navigate',{url});await wait("document.readyState==='complete'&&document.getElementById('root')");
    await page.evaluate(`await import('/node_modules/@xyflow/react/dist/style.css');await import('/node_modules/@xterm/xterm/css/xterm.css');await import('/src/themes.css');await import('/src/styles.css');await import('/src/buttons.css');
      window.store=(await import('/src/store.ts')).useStore;window.sim=(await import('/src/sim.ts')).sim;window.terminals=await import('/src/terminals.ts');window.fixture=await import('/src/testing/pingPlaybackFixture.ts');window.visual=await import('/src/guidedPacket.ts');window.animation=await import('/src/packetAnimation.ts');
      const entry=await import('/src/workspace/WorkspaceApplication.tsx');window.application=entry.mountWorkspaceApplication(document.getElementById('root'),{repositoryOptions:{databaseName:${JSON.stringify(database)}},legacy:{storage:{getItem:key=>key==='netsim:autosave:v1'?JSON.stringify(fixture.pingPlaybackDocument()):null},origin:'https://ping-backpressure.invalid'}});await application.ready;`);
    await wait("application.controller?.getState().phase==='ready'");
  };
  // Test-only deterministic stepping of the EXISTING store tick, not Scheduler
  // rewriting. The normal rAF driver is restored before lifecycle checks.
  const manual=async()=>{await page.evaluate('if(!window.tick){window.tick=store.getState().tick;store.setState({tick:dt=>{if(!window.manualVisualClock)tick(dt);}});}window.manualVisualClock=true;');await delay(80);};
  const reset=async()=>{await page.evaluate('store.getState().setPaused(false);const r=await application.controller.openDocument({schemaVersion:1,topology:fixture.pingPlaybackDocument()});if(!r.ok)throw Error(JSON.stringify(r));window.session=null;');await settle();};
  const screen=async name=>{await delay(100);const image=await page.send('Page.captureScreenshot',{format:'png'});await writeFile(path.join(directory,name),Buffer.from(image.data,'base64'));};
  try{
    await page.send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});await mount();
    await test('F5, early-created sessions and Linux/Windows profile changes release only activation Pause',async()=>{
      await page.evaluate('await application.controller.flush();');await mount();
      for(const os of ['windows','linux']){
        await reset();await page.evaluate(`window.early=terminals.getSession(sim.net.devices.get('pc1'));store.getState().setHostOs('pc1',${JSON.stringify(os)});`);
        await command('pc1',os==='linux'?'ip addr':'ipconfig');assert.equal(await page.evaluate('return store.getState().paused;'),true);
        await command('pc1',os==='linux'?'ping -c 1 10.0.0.30':'ping -n 1 10.0.0.30');
        assert.equal(await page.evaluate('return store.getState().paused;'),false);assert(await page.evaluate('return session===early;'));
        await wait('store.getState().guidedPacket.observation.sourceFinished');assert((await text()).includes(os==='linux'?'1 received':'Received = 1'));
      }
    });
    await test('recreated xterm sessions start DHCP in both profiles while explicit Pause prints a Run hint',async()=>{
      for(const [id,line] of [['pc1','dhclient eth0'],['pc2','ipconfig /renew eth0']]){
        await reset();await page.evaluate(`const d=sim.net.devices.get(${JSON.stringify(id)});const {emptyIpv4}=await import('/src/engine/ipv4Config.ts');d.interfaces[0].configureIpv4(emptyIpv4('dhcp'));store.getState().refresh();terminals.getSession(d).dispose();terminals.getSession(d);`);
        await command(id,line);assert.equal(await page.evaluate('return store.getState().paused;'),false);
        await wait(`sim.net.devices.get(${JSON.stringify(id)}).interfaces[0].dhcpLease`);
        await page.evaluate("store.getState().setPaused(true);window.pausedAt=sim.net.now;");await command(id,id==='pc1'?'ping 10.0.0.30':'ping -t 10.0.0.30');
        assert.equal(await page.evaluate('return store.getState().paused;'),true);assert((await text()).includes('Zum Fortsetzen Run klicken.'));
        await delay(150);assert(await page.evaluate('return sim.net.now===pausedAt;'));await cancel();
      }
    });
    await test('Quick Ping after restoration and plan switching use the same automatic Run gate',async()=>{
      await reset();const a=await page.evaluate('return application.controller.getState().activeDraftId;');await reset();
      await page.evaluate(`const r=await application.controller.switchDraft(${JSON.stringify(a)});if(!r.ok)throw Error(JSON.stringify(r));terminals.getSession(sim.net.devices.get('pc1'));`);
      assert.equal(await page.evaluate('return store.getState().pauseReason;'),'activation');
      await page.evaluate("store.getState().beginQuickPing('pc1');store.getState().chooseQuickPingTarget('pc3');");
      assert.equal(await page.evaluate('return store.getState().paused;'),false);
      await wait('store.getState().guidedPacket.observation.observed.some(h=>h.direction==="reply"&&!h.arp)');
      await page.evaluate("window.session=terminals.getSession(sim.net.devices.get('pc1'));session.term.input('\\x03',true);");await settle();
      await page.evaluate("store.getState().setPaused(true,'activation');");await command('pc1','ping -c 1 10.0.0.30');assert.equal(await page.evaluate('return store.getState().paused;'),false);
      await wait('store.getState().guidedPacket.observation.sourceFinished');
    });
    await manual();
    for(const os of ['linux','windows'])for(const speed of [.5,1,2]){
      await test(`${os} at ${speed}x: 100 real attempts, bounded queue and no old cycles after Ctrl+C`,async()=>{
        await reset();await page.evaluate(`store.getState().setHostOs('pc1',${JSON.stringify(os)});store.getState().setPacketAnimationSpeed(${speed});store.getState().startPacketCapture();`);
        await command('pc1',os==='linux'?'ping 10.0.0.30':'ping -t 10.0.0.30');
        const stats=await page.evaluate(`let maxAttempts=0,maxHops=0,maxObserved=0,maxMetadata=0;for(let i=0;i<1005;i++){tick(100);const g=store.getState().guidedPacket;maxAttempts=Math.max(maxAttempts,new Set(g.playback.hops.map(h=>h.ping)).size);maxHops=Math.max(maxHops,g.playback.hops.length);maxObserved=Math.max(maxObserved,g.observation.observed.length);maxMetadata=Math.max(maxMetadata,g.observation.attempts.length);}const g=store.getState().guidedPacket;window.activeAttempt=g.playback.hops[g.playback.index].ping;return {maxAttempts,maxHops,maxObserved,maxMetadata,last:g.observation.attempts.at(-1).seq,active:activeAttempt};`);
        assert(stats.last>=100);assert(stats.maxAttempts<=2);assert(stats.maxHops<=32);assert(stats.maxObserved<=256);assert(stats.maxMetadata<=5);evidence.stress.push({os,speed,...stats});
        await cancel();assert(await page.evaluate('return store.getState().guidedPacket.playback.hops.every(h=>h.ping===activeAttempt);'));
        const drained=await page.evaluate('let changed=false;for(let i=0;i<50;i++){tick(100);if(store.getState().guidedPacket.playback.hops.some(h=>h.ping!==activeAttempt))changed=true;}store.getState().stopPacketCapture();return {changed,active:animation.isPingAnimationActive(store.getState().guidedPacket),requests:store.getState().packetCapture.records.filter(r=>r.fromDeviceId==="pc1"&&r.frame.payload.kind==="ipv4"&&r.frame.payload.l4.kind==="icmp"&&r.frame.payload.l4.msg.type==="echo-request").length};');
        assert.equal(drained.changed,false);assert.equal(drained.active,false);assert.equal(drained.requests,101);
        assert((await text()).includes(os==='linux'?'101 packets transmitted':'Sent = 101'));
      });
    }
    await test('actual ARP flooding branches animate concurrently on four eligible links, with no cross-VLAN dot',async()=>{
      await reset();await page.evaluate('store.getState().setPacketAnimationSpeed(.5);store.getState().startPacketCapture();');await command('pc1','ping -c 1 10.0.0.30');
      await page.evaluate('tick(100);tick(100);tick(100);tick(100);tick(100);');await settle();
      const observed=await page.evaluate('const g=store.getState().guidedPacket;return {visible:visual.visibleGuidedHops(g.playback),all:g.observation.observed,dots:[...document.querySelectorAll(".packet-dot[data-ping-sequence]")].map(d=>Number(d.dataset.transferId))};');
      assert.equal(observed.visible.length,4);assert.deepEqual(observed.visible.map(h=>h.toDeviceId).sort(),['pc2','pc3','pc4','router']);assert.deepEqual(observed.dots.sort((a,b)=>a-b),observed.visible.map(h=>h.id).sort((a,b)=>a-b));
      assert(!observed.all.some(h=>h.toDeviceId==='pc5'));evidence.broadcast=observed;
      for(const theme of ['graphite-dark','classic-light'])for(const width of [1440,700]){
        await page.send('Emulation.setDeviceMetricsOverride',{width,height:960,deviceScaleFactor:1,mobile:false});await page.evaluate(`(await import('/src/uiTheme.ts')).useUiTheme.getState().setTheme(${JSON.stringify(theme)});`);await screen(`arp-parallel-${theme}-${width}.png`);
      }
      await page.evaluate('for(let i=0;i<45;i++)tick(100);store.getState().stopPacketCapture();');await settle();
      assert(await page.evaluate('const r=store.getState().packetCapture.records.filter(r=>r.frame.payload.kind==="arp"&&r.frame.payload.op==="reply"&&r.fromDeviceId!=="sw");return r.length===1&&r[0].fromDeviceId==="pc3";'));
      await wait('!document.querySelector(".ping-animation-control")');
    });
    await test('Ctrl+C during Request and Reply finishes only that attempt; independent ping sessions do not steal ARP provenance',async()=>{
      for(const direction of ['request','reply']){
        await reset();await page.evaluate('store.getState().setPacketAnimationSpeed(1);');await command('pc1','ping -c 1 10.0.0.30');await page.evaluate('for(let i=0;i<15;i++)tick(100);');await settle();
        await command('pc1','ping 10.0.0.30');await page.evaluate(`for(let i=0;i<${direction==='request'?1:5};i++)tick(100);`);
        assert.equal(await page.evaluate('const g=store.getState().guidedPacket;return g.playback.hops[g.playback.index].direction;'),direction);
        await cancel();await page.evaluate('for(let i=0;i<30;i++)tick(100);');assert.equal(await page.evaluate('return animation.isPingAnimationActive(store.getState().guidedPacket);'),false);
      }
      await reset();await page.evaluate('store.getState().startPacketCapture();');await command('pc1','ping 10.0.0.30');await command('pc2','ping -t 10.0.0.40');
      await page.evaluate('for(let i=0;i<7;i++)tick(100);');
      assert(await page.evaluate('const a=store.getState().guidedPacket.observation.observed.filter(h=>h.arp);return a.length>0&&a.some(h=>h.fromDeviceId==="pc2")&&a.filter(h=>h.fromDeviceId!=="sw").every(h=>h.fromDeviceId==="pc2"||h.fromDeviceId==="pc4");'));
      await page.evaluate('for(let i=0;i<1005;i++)tick(100);');
      assert.equal(await page.evaluate('return store.getState().guidedPacket.observation.session.deviceId;'),'pc2');
      assert(await page.evaluate('const g=store.getState().guidedPacket;return g.observation.observed.filter(h=>h.arp&&h.fromDeviceId!=="sw").every(h=>h.fromDeviceId==="pc2"||h.fromDeviceId==="pc4");'));
      assert(await page.evaluate('store.getState().stopPacketCapture();const r=store.getState().packetCapture.records;return ["pc1","pc2"].every(id=>r.filter(h=>h.fromDeviceId===id&&h.frame.payload.kind==="ipv4"&&h.frame.payload.l4.kind==="icmp"&&h.frame.payload.l4.msg.type==="echo-request").length>=100);'));
      await cancel();assert.equal(await page.evaluate('return store.getState().guidedPacket.observation.cancelled;'),true);
      await page.evaluate('for(let i=0;i<30;i++)tick(100);');
      assert.equal(await page.evaluate('return animation.isPingAnimationActive(store.getState().guidedPacket);'),false);
      await command('pc1','');assert((await text()).includes('icmp_seq=100'));await cancel();
    });
    await test('ARP Inspector clearing triggers new parallel resolution; Packets and line editor retain their current UX',async()=>{
      await page.send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});await reset();await page.evaluate('store.getState().setPacketAnimationSpeed(.5);');await command('pc1','ping -c 1 10.0.0.30');await page.evaluate('for(let i=0;i<45;i++)tick(100);store.getState().select("pc1");');await settle();
      await page.evaluate('for(const d of document.querySelectorAll(".inspector details"))if(d.querySelector(":scope>summary")?.textContent==="ARP-Tabelle")d.open=true;');
      await wait('[...document.querySelectorAll(".inspector button")].some(b=>b.textContent==="ARP-Cache leeren"&&b.getClientRects().length)');
      await page.evaluate('[...document.querySelectorAll(".inspector button")].find(b=>b.textContent==="ARP-Cache leeren"&&b.getClientRects().length).click();');
      await command('pc1','ping -c 1 10.0.0.30');await page.evaluate('for(let i=0;i<5;i++)tick(100);');assert(await page.evaluate('return visual.visibleGuidedHops(store.getState().guidedPacket.playback).length===4;'));
      await page.evaluate('for(let i=0;i<45;i++)tick(100);document.querySelector(".packet-settings-toggle").click();');await wait('document.querySelector("#packet-capture-menu")');
      assert(!await page.evaluate('return /Replay|Schrittmodus|Geschwindigkeit/.test(document.querySelector("#packet-capture-menu").textContent);'));
      await page.evaluate('document.querySelector(".packet-settings-toggle").click();session.term.input("hostme\\x1b[D\\x1b[Dna\\r",true);');await settle();assert((await text()).endsWith('pc1:~$ ')||(await text()).includes('PC1'));
    });
    await writeFile(path.join(directory,'evidence.json'),JSON.stringify(evidence,null,2));
  }finally{
    await page.evaluate(`window.manualVisualClock=false;application?.dispose();await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase(${JSON.stringify(database)});r.onsuccess=resolve;r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Ping review DB blocked'));});`);
  }
}
