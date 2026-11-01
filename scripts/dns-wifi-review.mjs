import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {generateReview} from './visual-review.mjs';

export async function runDnsWifiReview({page,url,root,report}) {
  const database='netlab-idb-test-'+randomUUID();
  const baseline=process.env.NETLAB_DNS_WIFI_REVIEW==='before';
  const directory=path.join(root,'.playwright-mcp/reviews/raw/dns-wifi-staging');
  const captures=[];
  await mkdir(directory,{recursive:true});
  const delay=ms=>new Promise(r=>setTimeout(r,ms));
  const wait=async expression=>{for(let i=0;i<200;i++){if(await page.evaluate('return !!('+expression+');'))return;await delay(70);}throw Error('Timed out: '+expression);};
  const click=async(selector,text)=>{
    const p=await page.evaluate(`const es=[...document.querySelectorAll(${JSON.stringify(selector)})],e=${text?`es.find(e=>e.textContent.trim()===${JSON.stringify(text)})`:'es[0]'};if(!e)throw Error('Missing '+${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};`);
    await page.send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1});
    await page.send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1});await delay(90);
  };
  const field='textarea[aria-label="DNS A records"]';
  const value=()=>page.evaluate(`return document.querySelector(${JSON.stringify(field)}).value;`);
  const replace=async text=>{
    await click(field);await page.send('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',modifiers:2,windowsVirtualKeyCode:65});
    await page.send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',modifiers:2,windowsVirtualKeyCode:65});await page.send('Input.insertText',{text});
  };
  const blur=()=>page.evaluate(`document.querySelector(${JSON.stringify(field)}).blur();`);
  const shot=async(name,width=1440,variant='graphite-dark')=>{
    const png=await page.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    const file=path.join(directory,name+'.png');await writeFile(file,Buffer.from(png.data,'base64'));
    captures.push({source:path.relative(root,file).split(path.sep).join('/'),scene:name,variant,state:'normal',width,height:960});
  };
  const test=async(name,fn)=>{await fn();report.results['dns/wifi: '+name]={passed:true};};
  try {
    await page.send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});
    await page.send('Page.navigate',{url});await wait("document.readyState==='complete'");
    await page.evaluate(`window.entry=await import('/src/workspace/reviewEntry.tsx');window.store=(await import('/src/store.ts')).useStore;window.sim=(await import('/src/sim.ts')).sim;window.ws=await entry.mountWorkspaceReview(document.getElementById('root'),{databaseName:${JSON.stringify(database)}});window.theme=(await import('/src/uiTheme.ts')).useUiTheme;theme.getState().setTheme('graphite-dark');`);
    await wait("document.querySelector('.react-flow')");
    await page.evaluate(`const s=store.getState();s.addDeviceAt('server',{x:300,y:100});s.addDeviceAt('host',{x:300,y:270});s.addDeviceAt('ap',{x:1000,y:100});window.server=[...sim.net.devices.values()].find(d=>d.kind==='server');window.pc=[...sim.net.devices.values()].find(d=>d.kind==='host');window.ap=[...sim.net.devices.values()].find(d=>d.kind==='ap');s.select(server.id);s.toggleDnsServer(server.id);s.setPaused(true);`);
    await wait("document.querySelector('[aria-label=\"Server Inspector\"]')");
    await click('[role=tab]','Dienste');await wait(`document.querySelector(${JSON.stringify(field)})`);
    const first='10.0.0.10 pc1.lan\n';await replace(first);
    // OS focus loss reaches the field through the same native blur handler.
    await blur();await delay(150);
    const lostNewline=(await value())!==first;
    await click(field);await page.send('Input.dispatchKeyEvent',{type:'keyDown',key:'End',code:'End',modifiers:2,windowsVirtualKeyCode:35});
    await page.send('Input.dispatchKeyEvent',{type:'keyUp',key:'End',code:'End',modifiers:2,windowsVirtualKeyCode:35});await page.send('Input.insertText',{text:'10.0.0.20 pc2.lan'});await blur();await delay(100);
    const records=await page.evaluate('return [...server.dnsServer.records];');
    if(baseline)await shot('dns-before');
    await page.evaluate('store.getState().select(pc.id);store.getState().enableWireless(pc.id);');
    await wait("document.querySelector('[aria-label=\"Host Inspector\"]')");
    await click('[role=tab]','Netzwerk');await click('button','WLAN suchen');
    const scan=await page.evaluate("return [...document.querySelectorAll('.ap-clients button')].map(e=>({text:e.textContent,disabled:e.disabled}));");
    report.dnsWifiEvidence={phase:baseline?'before':'after',lostNewline,records,scan};
    if(baseline){assert(lostNewline);assert.equal(records.length,1);assert(records[0][0].includes('lan10.0.0.20'));assert.equal(scan.length,1);assert(scan[0].disabled);}
    else {assert(!lostNewline);assert.equal(records.length,2);assert.equal(scan.length,0);}
    report.results['dns/wifi: '+(baseline?'original bugs reproduced':'newline and unavailable AP regression')]={passed:true};
    await writeFile(path.join(directory,(baseline?'before':'after')+'-evidence.json'),JSON.stringify(report.dnsWifiEvidence,null,2));
    if(!baseline){
      await test('live scan has no phantom networks and distinguishes an administratively DOWN adapter',async()=>{
        assert(await page.evaluate("return document.querySelector('.host-inspector').textContent.includes('Keine WLAN-Netze verfügbar.');"));
        await shot('wifi-empty');
        await page.evaluate('pc.getInterface("wlan0").up=false;store.getState().refresh();');await delay(100);
        assert(await page.evaluate("return [...document.querySelectorAll('button')].find(e=>e.textContent==='WLAN suchen').disabled;"));
        await page.evaluate('pc.getInterface("wlan0").up=true;store.getState().refresh();');
      });
      await test('scan updates immediately after moving, range/SSID edits, deletion and Undo',async()=>{
        await page.evaluate('store.getState().onNodesChange([{type:"position",id:ap.id,position:{x:400,y:270},dragging:false}]);');
        await wait("document.querySelector('.ap-clients button')?.textContent.includes('NetLab-WiFi')");
        await page.evaluate('store.getState().setWifiRange(ap.id,50);');await wait("!document.querySelector('.ap-clients button')");
        await page.evaluate('store.getState().undoTopology();');await wait("document.querySelector('.ap-clients button')");
        await page.evaluate('store.getState().setSsid(ap.id,"Büro WLAN");');await wait("document.querySelector('.ap-clients button')?.textContent.includes('Büro WLAN')");
        await page.evaluate('store.getState().deleteDevice(ap.id);');await wait("!document.querySelector('.ap-clients button')");
        await page.evaluate('store.getState().undoTopology();window.ap=sim.net.devices.get(ap.id);');await wait("document.querySelector('.ap-clients button')?.textContent.includes('Büro WLAN')");
        await shot('wifi-available');
        await click('.ap-clients button');await wait("document.querySelector('.host-inspector').textContent.includes('WLAN aktiv')");
        assert(await page.evaluate('return pc.getInterface("wlan0").link.operational;'));
        await click('button','WLAN trennen');await wait("document.querySelector('.ap-clients button')");
      });
      await page.evaluate('store.getState().select(server.id);');await wait("document.querySelector('[aria-label=\"Server Inspector\"]')");
      await click('[role=tab]','Dienste');
      await test('native textarea editing retains trailing/blank lines, refreshes and repeated focus loss',async()=>{
        const text='10.0.0.20 pc2.lan\n\n10.0.0.10 pc1.lan\n';
        await replace(text);await blur();await delay(80);assert.equal(await value(),text);
        for(let i=0;i<3;i++){
          await page.evaluate('store.getState().refresh();window.dispatchEvent(new Event("blur"));');
          await click(field);await blur();await page.evaluate('window.dispatchEvent(new Event("focus"));');await delay(70);
          assert.equal(await value(),text);
        }
        assert.equal(await page.evaluate('return (await import("/src/persistence/pendingForms.ts")).hasPendingForms();'),false);
        await wsFlush();await delay(250);assert.equal(await value(),text);
        await shot('dns-multiline-after');
      });
      await test('invalid pasted CRLF draft is preserved atomically across blur, tabs and autosave',async()=>{
        const invalid='10.0.0.30 new.lan\r\n10.0.0.40 bad.lan extra.lan\r\n';
        await replace(invalid);await blur();await delay(100);
        assert.equal(await value(),invalid.replaceAll('\r\n','\n'));
        assert.equal(await page.evaluate(`return document.querySelector(${JSON.stringify(field)}).getAttribute('aria-invalid');`),'true');
        assert(await page.evaluate("return [...document.querySelectorAll('[role=alert]')].some(e=>e.textContent.includes('Zeile 2'));"));
        assert.equal(await page.evaluate('return (await import("/src/persistence/pendingForms.ts")).hasPendingForms();'),true);
        const before=await page.evaluate('return [...server.dnsServer.records];');
        assert.deepEqual(before,records);await wsFlush();
        await click('[role=tab]','Allgemein');await click('[role=tab]','Dienste');
        assert.equal(await value(),invalid.replaceAll('\r\n','\n'));
        assert.deepEqual(await page.evaluate('return [...server.dnsServer.records];'),before);
        await shot('dns-validation-after');
        // A confirmed external edit must not be overwritten by the invalid draft.
        await page.evaluate('store.getState().setDnsRecords(server.id,"10.0.0.90 external.lan");');await delay(80);await click(field);await blur();await delay(80);
        assert.equal(await value(),invalid.replaceAll('\r\n','\n'));
        assert.notDeepEqual(await page.evaluate('return [...server.dnsServer.records];'),before);
        await page.evaluate('store.getState().undoTopology();');await delay(80);await click(field);await blur();await delay(80);
        assert.equal(await value(),invalid.replaceAll('\r\n','\n'));
        assert.deepEqual(await page.evaluate('return [...server.dnsServer.records];'),before);
        await page.evaluate('store.getState().redoTopology();');await delay(80);await click(field);await blur();await delay(80);
        assert.equal(await value(),invalid.replaceAll('\r\n','\n'));
        assert.notDeepEqual(await page.evaluate('return [...server.dnsServer.records];'),before);
        await page.evaluate('store.getState().undoTopology();');await delay(80);
        assert.deepEqual(await page.evaluate('return [...server.dnsServer.records];'),before);
      });
      await test('corrected CRLF paste, Undo/Redo and autosave survive reopening without record loss',async()=>{
        await replace('10.0.0.30 new.lan\r\n10.0.0.40 next.lan\r\n');await blur();await delay(80);
        assert.equal(await value(),'10.0.0.30 new.lan\n10.0.0.40 next.lan\n');
        assert.equal(await page.evaluate('return (await import("/src/persistence/pendingForms.ts")).hasPendingForms();'),false);
        await page.evaluate('store.getState().undoTopology();');await delay(80);assert.deepEqual(await page.evaluate('return [...server.dnsServer.records];'),records);
        await page.evaluate('store.getState().redoTopology();');await delay(80);
        assert.equal(await value(),'10.0.0.30 new.lan\n10.0.0.40 next.lan');
        await wsFlush();await page.evaluate('ws.dispose();');
        await page.send('Page.reload');await wait("document.readyState==='complete'&&!window.ws");
        await page.evaluate(`window.entry=await import('/src/workspace/reviewEntry.tsx');window.store=(await import('/src/store.ts')).useStore;window.sim=(await import('/src/sim.ts')).sim;window.ws=await entry.mountWorkspaceReview(document.getElementById('root'),{databaseName:${JSON.stringify(database)}});`);
        await wait("document.querySelector('.react-flow')");
        await page.evaluate('window.server=[...sim.net.devices.values()].find(d=>d.kind==="server");store.getState().select(server.id);');
        await wait("document.querySelector('[aria-label=\"Server Inspector\"]')");await click('[role=tab]','Dienste');
        assert.equal(await value(),'10.0.0.30 new.lan\n10.0.0.40 next.lan');
        assert.equal(await page.evaluate('return [...sim.net.devices.values()].find(d=>d.kind==="ap").ssid;'),'Büro WLAN');
      });
      await test('compact error stays readable in Classic Light with 700px window/290px inspector',async()=>{
        await page.send('Emulation.setDeviceMetricsOverride',{width:700,height:960,deviceScaleFactor:1,mobile:false});
        await page.evaluate('(await import("/src/uiTheme.ts")).useUiTheme.getState().setTheme("classic-light");');
        await replace('10.0.0.30 new.lan\n10.0.0.40 next.lan extra');await blur();await delay(100);
        assert(await page.evaluate('return document.documentElement.scrollWidth<=innerWidth+1;'));
        await shot('dns-error-mobile',700,'classic-light');
        // End with no pending form so disposing the disposable session is explicit.
        await replace('10.0.0.30 new.lan\n10.0.0.40 next.lan');await blur();
      });
    }
  }finally {
    await page.evaluate('window.ws?.dispose();');
    await page.evaluate(`await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase(${JSON.stringify(database)});r.onsuccess=resolve;r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Review cleanup blocked'));});`);
  }
  async function wsFlush(){await page.evaluate('const r=await ws.controller.flush();if(!r.ok)throw Error(JSON.stringify(r.error));');}
  if(!baseline){
    const manifest=path.join(directory,'manifest.json');
    await writeFile(manifest,JSON.stringify({id:'dns-wifi',title:'DNS drafts and live Wi-Fi discovery',variants:[{id:'graphite-dark',label:'Graphite Dark'},{id:'classic-light',label:'Classic Light'}],states:['normal'],captures,share:captures.filter(c=>['dns-validation-after','wifi-empty','wifi-available','dns-error-mobile'].includes(c.scene)).map(c=>({...c,name:c.scene})),shareContactSheet:false}));
    report.dnsWifiReview=await generateReview(manifest);
  }
}
