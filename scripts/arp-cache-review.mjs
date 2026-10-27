import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function runArpCacheReview({ page, url, root, report }) {
  const database = 'netlab-idb-test-' + crypto.randomUUID();
  const directory = path.join(root, '.playwright-mcp/reviews/raw/arp-cache');
  await mkdir(directory, { recursive: true });
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const wait = async condition => {
    for (let i = 0; i < 200; i++) {
      if (await page.evaluate(`return !!(${condition});`)) return;
      await delay(30);
    }
    throw Error('ARP review condition: ' + condition);
  };
  const test = async (name, run) => {
    try { await run(); report.results['ARP cache: ' + name] = { passed: true }; }
    catch (error) { report.results['ARP cache: ' + name] = { passed: false, error: error.stack }; throw error; }
  };
  const command = async (id, line) => {
    await page.evaluate(`store.getState().openTerminal(${JSON.stringify(id)});window.session=terminals.getSession(sim.net.devices.get(${JSON.stringify(id)}));session.term.input(${JSON.stringify(line + '\r')},true);`);
    await delay(80); await page.evaluate('await new Promise(resolve=>session.term.write("",resolve));');
  };
  const text = () => page.evaluate('const b=session.term.buffer.active;return Array.from({length:b.length},(_,i)=>b.getLine(i)?.translateToString(true)??"").join("\\n");');
  const count = id => page.evaluate(`return sim.net.devices.get(${JSON.stringify(id)}).arpTable.size;`);
  const button = () => `[...document.querySelectorAll('.inspector button')].find(b=>b.textContent==='ARP-Cache leeren'&&b.getClientRects().length)`;
  const inspect = async id => {
    await page.evaluate(`store.getState().select(${JSON.stringify(id)});`);
    await delay(80);
    await page.evaluate("[...document.querySelectorAll('.inspector [role=tab]')].find(b=>b.textContent==='Routing')?.click();");
    await delay(40);
    await page.evaluate(`for(const details of document.querySelectorAll('.inspector details'))if(details.querySelector(':scope>summary')?.textContent==='ARP-Tabelle')details.open=true;`);
    await wait(button());
  };
  const ping = async (id, windows = false) => {
    await page.evaluate('store.getState().startPacketCapture();');
    await command(id, windows ? 'ping -n 1 192.168.1.20' : 'ping -c 1 192.168.1.10');
    await page.evaluate('sim.net.scheduler.advanceTo(sim.net.now+1400);store.getState().stopPacketCapture();store.getState().refresh();');
    await delay(60);
    const captured = await page.evaluate('return store.getState().packetCapture.records.map(r=>r.frame.payload);');
    assert(captured.some(p => p.kind === 'arp' && p.op === 'request'));
    assert(captured.some(p => p.kind === 'arp' && p.op === 'reply'));
    assert(captured.some(p => p.kind === 'ipv4' && p.l4.kind === 'icmp' && p.l4.msg.type === 'echo-reply'));
  };
  const state = () => page.evaluate(`return {document:store.getState().captureWorkspaceDocument(),clock:sim.net.now,paused:store.getState().paused,
    caches:Object.fromEntries([...sim.net.devices].filter(([,d])=>d.arpTable).map(([id,d])=>[id,[...d.arpTable]])),
    macs:[...sim.net.devices.get('sw1').macTable].map(([mac,p])=>[mac,p.name]),leases:[...sim.net.devices.get('r1').dhcpPools].map(([name,p])=>[name,[...p.leases]])};`);
  const image = async name => {
    await page.evaluate("[...document.querySelectorAll('.inspector .diagnostic-table-arp')].find(t=>t.getClientRects().length)?.scrollIntoView({block:'center'});");
    await delay(100); const shot = await page.send('Page.captureScreenshot', { format: 'png' });
    await writeFile(path.join(directory, name), Buffer.from(shot.data, 'base64'));
  };
  const mount = async () => {
    await page.send('Page.navigate', { url });
    await wait("document.readyState==='complete'&&document.getElementById('root')");
    await page.evaluate(`await import('/node_modules/@xyflow/react/dist/style.css');await import('/node_modules/@xterm/xterm/css/xterm.css');await import('/src/themes.css');await import('/src/styles.css');await import('/src/buttons.css');
      window.store=(await import('/src/store.ts')).useStore;window.sim=(await import('/src/sim.ts')).sim;window.terminals=await import('/src/terminals.ts');window.fixtures=await import('/src/testing/interfaceAuditFixture.ts');
      const entry=await import('/src/workspace/WorkspaceApplication.tsx');const {serializeNetwork}=await import('/src/engine/serialize.ts');const {parseIp}=await import('/src/engine/ip.ts');const f=fixtures.interfaceAuditFixture();f.client.addIp('eth0',parseIp('192.168.1.20'),24);f.staticClient.os='windows';const source=serializeNetwork(f.net,Object.fromEntries([...f.net.devices].map(([id,d])=>[id,d.position])));
      window.application=entry.mountWorkspaceApplication(document.getElementById('root'),{repositoryOptions:{databaseName:${JSON.stringify(database)}},legacy:{storage:{getItem:key=>key==='netsim:autosave:v1'?JSON.stringify(source):null},origin:'https://arp-review.invalid'}});await application.ready;`);
    await wait("application.controller?.getState().phase==='ready'");
  };
  try {
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false });
    await mount(); await page.evaluate("store.getState().setPaused(true,'manual');");
    await test('Linux ping learns ARP, flush all clears only the source and a real captured ARP exchange follows',async()=>{
      await ping('pc1');assert.equal(await count('pc1'),1);assert.equal(await count('pc2'),1);
      await command('pc1','ip neigh show');assert((await text()).includes('192.168.1.10 dev eth0 lladdr'));
      await page.evaluate("sim.net.devices.get('r1').dhcpPools.get('eth0').leases.set('test-lease',3232235876);");
      const before=await state();await command('pc1','ip neigh flush all');const after=await state();
      assert.equal(await count('pc1'),0);assert.equal(after.clock,before.clock);assert.equal(after.paused,true);
      assert.deepEqual(after.document,before.document);assert.deepEqual(after.macs,before.macs);assert.deepEqual(after.leases,before.leases);
      delete before.caches.pc1;delete after.caches.pc1;assert.deepEqual(after.caches,before.caches);
      await ping('pc1');assert.equal(await count('pc1'),1);
    });
    await test('Windows arp -a, wildcard deletion and one-IP deletion operate on the shared cache',async()=>{
      await command('pc2','arp -a');assert((await text()).includes('192.168.1.20'));
      await command('pc2','arp -d *');assert.equal(await count('pc2'),0);await ping('pc2',true);
      await command('pc2','arp -d 192.168.1.20');assert.equal(await count('pc2'),0);assert.equal(await count('pc1'),1);
      await ping('pc2',true);assert.equal(await count('pc2'),1);
    });
    await test('invalid Linux/Windows arguments never clear the cache, print the table or advance the paused simulation',async()=>{
      for(const [id,commands] of [['pc1',['ip neigh xyz','ip neigh flush','ip neigh flush dev missing','ip neigh flush all extra','arp -d','arp -a extra']],['pc2',['arp -d','arp -d 999.1.1.1','arp -d * extra','arp -a extra']]]){
        const before=await state();
        for(const line of commands)await command(id,line);
        assert.deepEqual(await state(),before);
      }
      assert((await text()).includes('Invalid IPv4 address'));
    });
    await test('Inspector clear refreshes immediately while paused in Dark and Light, without affecting other runtime/configuration state',async()=>{
      for(const [theme,width,id] of [['graphite-dark',1440,'pc1'],['classic-light',700,'pc2']]){
        await page.send('Emulation.setDeviceMetricsOverride',{width,height:960,deviceScaleFactor:1,mobile:false});
        await page.evaluate(`(await import('/src/uiTheme.ts')).useUiTheme.getState().setTheme(${JSON.stringify(theme)});`);
        await inspect(id);const before=await state();
        assert.equal(await page.evaluate(`return ${button()}.title;`),'Löscht die dynamisch gelernten ARP-Einträge dieses Geräts.');
        await page.evaluate(`${button()}.click();`);await wait(`sim.net.devices.get(${JSON.stringify(id)}).arpTable.size===0`);
        await wait("[...document.querySelectorAll('.inspector .diagnostic-table-arp')].filter(t=>t.getClientRects().length).every(t=>t.textContent.includes('Keine ARP-Einträge'))");
        const after=await state();assert.equal(after.clock,before.clock);assert.equal(after.paused,true);assert.deepEqual(after.document,before.document);assert.deepEqual(after.macs,before.macs);assert.deepEqual(after.leases,before.leases);
        delete before.caches[id];delete after.caches[id];assert.deepEqual(after.caches,before.caches);
        await image(theme+'-'+width+'-empty.png');
        await page.evaluate(`${button()}.click();`);assert.equal(await count(id),0);
        await ping(id,id==='pc2');assert.equal(await count(id),1);
      }
      await page.evaluate("store.getState().select('sw1');");await delay(100);
      assert.equal(await page.evaluate("return [...document.querySelectorAll('.inspector button')].some(b=>b.textContent==='ARP-Cache leeren');"),false);
    });
    await test('Save/Load, plan switching and F5 preserve configurations while dropping transient ARP caches',async()=>{
      await page.evaluate("const r=await application.controller.save('ARP review');if(!r.ok)throw Error(JSON.stringify(r));window.originalDraft=application.controller.getState().activeDraftId;");
      const before=await state();
      assert(!JSON.stringify(before.document).includes('arpTable'));
      await page.evaluate("const r=await application.controller.openDocument({schemaVersion:1,topology:fixtures.interfaceAuditDocument()});if(!r.ok)throw Error(JSON.stringify(r));");
      await page.evaluate("const r=await application.controller.switchDraft(originalDraft);if(!r.ok)throw Error(JSON.stringify(r));");
      assert.equal(await count('pc1'),0);assert.equal(await count('pc2'),0);
      assert.deepEqual((await state()).document,before.document);
      await page.evaluate('await application.controller.flush();');await mount();
      assert.equal(await count('pc1'),0);assert.equal(await count('pc2'),0);assert.deepEqual((await state()).document,before.document);
    });
    await test('Router dev eth0 flush preserves mappings learned on its other interfaces',async()=>{
      await page.send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});
      await page.evaluate("const f=await import('/src/testing/dhcpGlobalFixture.ts');const fixture=f.dhcpGlobalFixture();const {parseIp}=await import('/src/engine/ip.ts');fixture.clients.forEach((c,n)=>c.addIp('eth0',parseIp('10.20.'+(n+1)+'.20'),24));const {serializeNetwork}=await import('/src/engine/serialize.ts');const d=serializeNetwork(fixture.net,Object.fromEntries([...fixture.net.devices].map(([id,c])=>[id,c.position])));const r=await application.controller.openDocument({schemaVersion:1,topology:d});if(!r.ok)throw Error(JSON.stringify(r));store.getState().setPaused(true,'manual');window.router=sim.net.devices.get('r-dhcp');for(let n=0;n<3;n++){router.sendEcho(parseIp('10.20.'+(n+1)+'.20'),1,n);sim.net.scheduler.advanceTo(sim.net.now+1200);}store.getState().refresh();");
      assert.equal(await count('r-dhcp'),3);await command('r-dhcp','ip neigh flush dev eth0');assert.equal(await count('r-dhcp'),2);
      assert.deepEqual(await page.evaluate('return [...router.arpTable.values()].map(e=>e.ifaceName);'),['eth1','eth2']);
      await inspect('r-dhcp');await page.evaluate(`${button()}.click();`);assert.equal(await count('r-dhcp'),0);
      await page.evaluate("(await import('/src/uiTheme.ts')).useUiTheme.getState().setTheme('graphite-dark');");await image('router-three-interfaces-empty.png');
    });
  } finally {
    await page.evaluate(`application?.dispose();await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase(${JSON.stringify(database)});r.onsuccess=resolve;r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('ARP review database blocked'));});`);
  }
}
