import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';

export async function runServicesI18nReview({page,url,root,report}) {
  const directory=path.join(root,'.playwright-mcp/reviews/services-3c2'),images=path.join(directory,'referencias-chatgpt');await mkdir(images,{recursive:true});
  const databases=[],captures=[],results={},languages=['de','en','pt-BR'];const delay=ms=>new Promise(r=>setTimeout(r,ms));
  const wait=async exp=>{for(let i=0;i<200;i++){try{if(await page.evaluate(`return !!(${exp});`))return;}catch{}await delay(40);}throw Error('Services i18n timeout: '+exp);};
  const test=async(name,run)=>{try{await run();results['services-i18n: '+name]={passed:true};}catch(error){results['services-i18n: '+name]={passed:false,error:error.stack};throw error;}};
  const mount=async(db,theme)=>{
    await page.send('Page.navigate',{url});await wait(`document.readyState==='complete'&&location.pathname==='/__application_boot_test__'`);
    await page.evaluate(`await import('/node_modules/@xyflow/react/dist/style.css');await import('/node_modules/@xterm/xterm/css/xterm.css');await import('/src/themes.css');await import('/src/styles.css');await import('/src/buttons.css');window.i18n=await import('/src/i18n/index.ts');window.tr=(k,v)=>i18n.translate(i18n.useLanguage.getState().language,k,v);window.store=(await import('/src/store.ts')).useStore;window.sim=(await import('/src/sim.ts')).sim;window.theme=(await import('/src/uiTheme.ts')).useUiTheme;theme.getState().setTheme(${JSON.stringify(theme)});const entry=await import('/src/workspace/WorkspaceApplication.tsx');window.application=entry.mountWorkspaceApplication(document.getElementById('root'),{repositoryOptions:{databaseName:${JSON.stringify(db)}},legacy:{storage:{getItem:()=>null},origin:location.origin}});await application.ready;window.panel=()=>{const root=document.querySelector('.inspector:not([hidden])');return root.querySelector('[role=tabpanel]:not([hidden])')??root;};window.field=k=>[...panel().querySelectorAll('input,textarea')].find(e=>e.getAttribute('aria-label')===tr(k));`);await wait(`document.querySelector('.workspace-tabs')`);
  };
  const open=async(id,tab)=>{
    await page.evaluate(`store.getState().select(${JSON.stringify(id)});`);await wait(`document.querySelector('.inspector:not([hidden]) .inspector-head strong')?.textContent===sim.net.devices.get(${JSON.stringify(id)}).name`);
    if(tab){await page.evaluate(`document.querySelector('.inspector:not([hidden]) [id$="-tab-${tab}"]').click();`);await wait(`document.querySelector('.inspector:not([hidden]) [aria-selected=true]')?.id.endsWith('-tab-${tab}')`);}
    await delay(40);
  };
  const locale=async lang=>{await page.evaluate(`i18n.useLanguage.getState().setLanguage(${JSON.stringify(lang)});`);await delay(40);};
  const input=async(expression,value,blur=true)=>{
    await page.evaluate(`const e=${expression};if(!e)throw Error('Missing input');e.focus();if(document.activeElement!==e)throw Error('Input could not focus: '+e.getAttribute('aria-label'));`);
    await page.send('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',modifiers:2,windowsVirtualKeyCode:65});await page.send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',modifiers:2,windowsVirtualKeyCode:65});await page.send('Input.insertText',{text:value});
    await delay(40);if(blur){await page.evaluate(`document.activeElement.blur();`);await delay(40);}
  };
  const click=async key=>{await page.evaluate(`const e=[...panel().querySelectorAll('button')].find(e=>e.textContent.trim()===tr(${JSON.stringify(key)}));if(!e)throw Error('Missing button '+${JSON.stringify(key)});e.click();`);await delay(40);};
  const snapshot=()=>page.evaluate(`return {document:store.getState().captureWorkspaceDocument(),history:store.getState().topologyHistory};`);
  const capture=async(name,selector)=>{if(selector)await page.evaluate(`panel().querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'start'});`);await page.evaluate(`await document.fonts.ready;`);await delay(100);const shot=await page.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(images,name),Buffer.from(shot.data,'base64'));captures.push(name);};
  try{
    for(const [theme,width]of [['graphite-dark',1440],['classic-light',900]]){
      const db='netlab-idb-test-'+crypto.randomUUID();databases.push(db);await page.send('Emulation.setDeviceMetricsOverride',{width,height:1100,deviceScaleFactor:1,mobile:false});await mount(db,theme);
      const ids=await page.evaluate(`window.ids={};for(const [key,kind,x,y]of [['linux','host',300,100],['windows','host',360,300],['router','router',700,300],['server','server',700,100],['firewall','firewall',900,200],['ap','ap',400,200],['mobile','smartphone',420,100],['switch','switch',650,450]]){store.getState().addDeviceAt(kind,{x,y});ids[key]=store.getState().nodes.at(-1).id;store.getState().renameDevice(ids[key],key+' – São Paulo 東京');}store.getState().setHostOs(ids.windows,'windows');store.getState().setSsid(ids.ap,'Laboratório 東京');for(const key of ['router','server','firewall','ap'])store.getState().onConnect({source:ids[key],target:ids.switch});window.ip=(await import('/src/engine/ip.ts')).parseIp;window.config=(await import('/src/engine/ipv4Config.ts')).parseStaticIpv4;for(const [key,address]of [['server','192.0.2.1'],['router','192.0.2.254'],['firewall','192.0.2.253']])store.getState().setInterfaceIpv4(ids[key],'eth0',config(address,'/24','',''));return ids;`);
      await open(ids.server,'services');await page.evaluate(`panel().querySelector('.dhcp-pool-editor').open=true;`);
      await input(`panel().querySelector('.dhcp-pool-editor input')`,'192.0.2.',false);await click('navigation.dhcpApply');const invalid=await snapshot();
      for(const lang of languages)await test(theme+': DHCP invalid draft and local error / '+lang,async()=>{
        await locale(lang);assert.deepEqual(await snapshot(),invalid);assert.equal(await page.evaluate(`return panel().querySelector('.dhcp-pool-editor input').value;`),'192.0.2.');assert.equal(await page.evaluate(`return panel().querySelector('[role=alert]').textContent;`),await page.evaluate(`return tr('navigation.dhcpInvalidAddresses');`));await capture(lang+'-'+theme+'-dhcp.png','.dhcp-pools');
      });
      await test(theme+': configure real DHCP, DNS and HTTP through existing UI',async()=>{
        for(const [index,value]of [[0,'192.0.2.100'],[1,'192.0.2.150'],[2,'192.0.2.1'],[3,'192.0.2.1']])await input(`panel().querySelectorAll('.dhcp-pool-editor input')[${index}]`,value);
        await click('navigation.dhcpApply');await page.evaluate(`panel().querySelector('.dhcp-pool-toggle button').click();for(const d of panel().querySelectorAll('details.svc')){d.open=true;const input=d.querySelector('input[type=checkbox]');if(!input.checked)input.click();}`);await delay(80);
        await input(`field('navigation.dnsRecordsField')`,'192.0.2.1 web.lan\n');await input(`field('navigation.httpPortField')`,'8080');await input(`field('navigation.httpBodyField')`,'Olá São Paulo 東京');
        assert.deepEqual(await page.evaluate(`const d=sim.net.devices.get(ids.server);return {pool:d.dhcpPool('eth0').enabled,dns:d.dnsServer.records.get('web.lan'),port:d.httpServer.port,body:d.httpServer.body};`),{pool:true,dns:3221225985,port:8080,body:'Olá São Paulo 東京'});
      });
      await input(`field('navigation.dnsRecordsField')`,'192.0.2.',false);await input(`field('navigation.httpBodyField')`,'Rascunho 東京',false);const draft=await snapshot();
      for(const lang of languages)await test(theme+': service drafts, labels and selection follow '+lang,async()=>{
        await locale(lang);assert.deepEqual(await snapshot(),draft);assert.equal(await page.evaluate(`return field('navigation.dnsRecordsField').value;`),'192.0.2.');assert.equal(await page.evaluate(`return field('navigation.httpBodyField').value;`),'Rascunho 東京');assert.equal(await page.evaluate(`return store.getState().selected;`),ids.server);await capture(lang+'-'+theme+'-services.png','details.svc');
      });
      await input(`field('navigation.dnsRecordsField')`,'192.0.2.99 pending.lan',false);
      await page.evaluate(`store.getState().setDnsRecords(ids.server,'192.0.2.2 external.lan');`);await delay(60);await page.evaluate(`document.activeElement.blur();`);await delay(40);const stale=await snapshot();
      for(const lang of languages)await test(theme+': DNS stale draft and notice follow '+lang,async()=>{
        await locale(lang);assert.deepEqual(await snapshot(),stale);assert.equal(await page.evaluate(`return field('navigation.dnsRecordsField').value;`),'192.0.2.99 pending.lan');assert.equal(await page.evaluate(`return panel().querySelector('details.svc [role=alert]').textContent;`),await page.evaluate(`return tr('navigation.draftDnsStale');`));await capture(lang+'-'+theme+'-dns-stale.png','details.svc');
      });
      // Restore the valid inputs with the same form handlers, preserving whitespace.
      await input(`field('navigation.dnsRecordsField')`,'192.0.2.1 web.lan\n');await input(`field('navigation.httpBodyField')`,'Olá São Paulo 東京');
      for(const key of ['linux','windows'])await test(theme+': '+key+' WLAN discovery, association and real DHCP lease',async()=>{
        await open(ids[key],'network');await click('navigation.wifiAdd');await click('navigation.wifiSearch');await wait(`panel().querySelector('.ap-clients button')`);
        await page.evaluate(`panel().querySelector('.ap-clients button').click();`);await wait(`sim.net.devices.get(${JSON.stringify(ids[key])}).getInterface('wlan0').link?.operational`);
        await page.evaluate(`const inputs=[...panel().querySelectorAll('.ipv4-mode input')];inputs.find(e=>e.getAttribute('aria-label')===tr('navigation.ipv4AutomaticNamed',{iface:'wlan0'})).click();`);await delay(40);
        await page.evaluate(`const inputs=[...panel().querySelectorAll('.ipv4-mode input')];inputs.find(e=>e.getAttribute('aria-label')===tr('navigation.ipv4AutomaticNamed',{iface:'wlan0'})).closest('.ipv4-interface').querySelector('button.btn').click();sim.net.scheduler.advanceTo(sim.net.now+10000);store.getState().refresh();`);
        assert.equal(await page.evaluate(`return !!sim.net.devices.get(${JSON.stringify(ids[key])}).getInterface('wlan0').dhcpLease;`),true);
      });
      await test(theme+': actual DNS resolution and HTTP response remain correct',async()=>{
        await page.evaluate(`window.dnsResult=null;window.httpResult=null;const d=sim.net.devices.get(ids.linux);d.resolveDns('web.lan',ip('192.0.2.1'),r=>window.dnsResult=r);d.httpGet(ip('192.0.2.1'),8080,'/','web.lan',3000,r=>window.httpResult=r);sim.net.scheduler.advanceTo(sim.net.now+3500);store.getState().refresh();`);
        assert.equal(await page.evaluate(`return window.dnsResult;`),await page.evaluate(`return ip('192.0.2.1');`));assert.equal(await page.evaluate(`return window.httpResult?.body;`),'Olá São Paulo 東京');
      });
      await open(ids.ap,'wlan');await input(`field('navigation.wifiSsidField')`,'SSID parcial 東京',false);const apDraft=await snapshot();
      for(const lang of languages)await test(theme+': AP settings and uncommitted Unicode SSID / '+lang,async()=>{
        await locale(lang);assert.deepEqual(await snapshot(),apDraft);assert.equal(await page.evaluate(`return field('navigation.wifiSsidField').value;`),'SSID parcial 東京');assert.equal(await page.evaluate(`return panel().querySelector('.ap-range-control input').getAttribute('aria-valuetext');`),await page.evaluate(`return tr('navigation.wifiRangeValue',{value:sim.net.devices.get(ids.ap).rangeMeters});`));assert.equal(await page.evaluate(`return panel().querySelector('.ap-security-note').textContent.includes(tr('navigation.wifiSecurityHint'));`),true);await capture(lang+'-'+theme+'-wlan.png','.ap-range-control');
      });
      await input(`field('navigation.wifiSsidField')`,'Laboratório 東京');await page.evaluate(`store.getState().toggleIface(ids.linux,'wlan0');`);await open(ids.ap,'clients');const clients=await snapshot();
      for(const lang of languages)await test(theme+': AP clients active and inactive / '+lang,async()=>{
        await locale(lang);assert.deepEqual(await snapshot(),clients);assert.equal(await page.evaluate(`return panel().textContent.includes(tr('navigation.linkWifiActive'))&&panel().textContent.includes(tr('navigation.linkWifiInactive'))&&panel().textContent.includes(sim.net.devices.get(ids.windows).getInterface('wlan0').mac);`),true);await capture(lang+'-'+theme+'-clients.png');
      });
      await test(theme+': WLAN disconnect and reconnect use the existing actions',async()=>{
        await open(ids.windows,'network');await click('navigation.wifiDisconnect');assert.equal(await page.evaluate(`return sim.net.devices.get(ids.windows).getInterface('wlan0').link;`),null);assert.equal(await page.evaluate(`return panel().textContent.includes(tr('navigation.wifiDisconnected'));`),true);await click('navigation.wifiSearch');await page.evaluate(`panel().querySelector('.ap-clients button').click();store.getState().toggleIface(ids.linux,'wlan0');`);await wait(`sim.net.devices.get(ids.windows).getInterface('wlan0').link?.operational`);
      });
      for(const [key,tab]of [['linux','security'],['windows','security'],['server','security'],['router','services'],['firewall','firewall']]){
        await open(ids[key],tab);const before=await snapshot(),cli=await page.evaluate(`return (await import('/src/engine/firewall-fmt.ts')).listRuleset(sim.net.devices.get(${JSON.stringify(ids[key])}).fw);`);
        for(const lang of languages)await test(theme+': '+key+' advanced panel / '+lang,async()=>{
          await locale(lang);assert.deepEqual(await snapshot(),before);assert.equal(await page.evaluate(`return panel().textContent.includes(${JSON.stringify(tab==='services')}?tr('navigation.dhcpInterfaces'):'nftables');`),true);
          if(tab!=='services')assert.equal(await page.evaluate(`return panel().querySelector('pre.table-pre').textContent;`),cli||await page.evaluate(`return tr('navigation.firewallNoRules');`));
          if(key==='windows'||key==='router')await capture(lang+'-'+theme+'-'+key+'.png');
        });
      }
      await test(theme+': filled Firewall preserves rule order, policies and log data',async()=>{
        await page.evaluate(`const d=sim.net.devices.get(ids.firewall);d.fw.filter.forward.policy='drop';d.fw.addFilterRule('forward',{proto:'tcp',dport:{from:443,to:443}},'accept');d.fw.addFilterRule('forward',{proto:'icmp'},'drop');store.getState().refresh();`);
      });
      const firewall=await snapshot(),rules=await page.evaluate(`return (await import('/src/engine/firewall-fmt.ts')).listRuleset(sim.net.devices.get(ids.firewall).fw);`);
      for(const lang of languages)await test(theme+': populated Firewall and help / '+lang,async()=>{
        await locale(lang);assert.deepEqual(await snapshot(),firewall);assert.equal(await page.evaluate(`return panel().querySelector('pre').textContent;`),rules);assert.equal(await page.evaluate(`return panel().querySelector('.firewall-policy-list').textContent.includes('DROP');`),true);
        await page.evaluate(`panel().querySelector('button.diagnostic-info').click();`);await wait(`document.querySelector('.diagnostic-info-popup')`);assert.equal(await page.evaluate(`return document.querySelector('.diagnostic-info-popup').textContent.includes(tr('navigation.firewallSource'));`),true);await page.evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));`);await wait(`!document.querySelector('.diagnostic-info-popup')`);await capture(lang+'-'+theme+'-firewall.png');
      });
      await open(ids.mobile);await click('navigation.wifiSearch');await page.evaluate(`panel().querySelector('.ap-clients button').click();store.getState().setInterfaceIpv4(ids.mobile,'wlan0',config('192.0.2.80','/24','192.0.2.1','192.0.2.1'));`);await delay(50);
      await input(`field('navigation.diagnosticsTargetAria')`,'192.0.2.1');await page.evaluate(`[...panel().querySelectorAll('button')].find(e=>e.textContent==='Ping').click();sim.net.scheduler.advanceTo(sim.net.now+1000);store.getState().refresh();`);const diag=await snapshot();
      for(const lang of languages)await test(theme+': diagnostic real Echo Reply follows '+lang,async()=>{
        await locale(lang);assert.deepEqual(await snapshot(),diag);assert.equal(await page.evaluate(`return [...panel().querySelectorAll('[role=status]')].some(e=>e.textContent===tr('navigation.diagnosticsReply',{address:'192.0.2.1'}));`),true);
      });
      await test(theme+': DHCP off/on and F5 preserve configured data',async()=>{
        await open(ids.server,'services');await page.evaluate(`panel().querySelector('.dhcp-pool-toggle button').click();`);await delay(40);assert.equal(await page.evaluate(`return sim.net.devices.get(ids.server).dhcpPool('eth0').enabled;`),false);await page.evaluate(`panel().querySelector('.dhcp-pool-toggle button').click();`);await delay(40);
        const saved=await page.evaluate(`return await application.controller.flush();`);assert.equal(saved.ok,true,JSON.stringify(saved));const before=(await snapshot()).document,realm=await page.evaluate(`return performance.timeOrigin;`);await page.send('Page.reload');await wait(`performance.timeOrigin!==${realm}&&document.readyState==='complete'`);await mount(db,theme);assert.deepEqual((await snapshot()).document,before);
      });
      await page.evaluate(`application.dispose();`);
    }
  }finally{
    await page.evaluate(`window.application?.dispose();`).catch(()=>{});for(const name of databases){assert(/^netlab-idb-test-[\da-f-]{36}$/.test(name));await page.evaluate(`await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase(${JSON.stringify(name)});r.onsuccess=resolve;r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Disposable cleanup blocked'));});`);}
    Object.assign(report.results,results);report.servicesI18n={checks:Object.keys(results).length,captures};await writeFile(path.join(directory,'validation.json'),JSON.stringify(report.servicesI18n,null,2));await writeFile(path.join(directory,'index.html'),'<!doctype html><meta charset="utf-8"><title>Services i18n 3C2</title><style>body{background:#171d24;color:white;font-family:system-ui}img{width:1100px;max-width:100%}figure{margin:24px}</style>'+captures.map(f=>`<figure><figcaption>${f}</figcaption><a href="referencias-chatgpt/${f}"><img src="referencias-chatgpt/${f}" alt="${f}"></a></figure>`).join(''));
  }
}
