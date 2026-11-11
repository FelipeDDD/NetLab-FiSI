import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function runIpv4I18nReview({page,url,root,report}) {
  const directory=path.join(root,'.playwright-mcp/reviews/ipv4-3b'),images=path.join(directory,'referencias-chatgpt');await mkdir(images,{recursive:true});
  const results={},captures=[],databases=[];
  const delay=ms=>new Promise(r=>setTimeout(r,ms));
  const wait=async exp=>{for(let i=0;i<200;i++){try{if(await page.evaluate(`return !!(${exp});`))return;}catch{}await delay(40);}throw Error('IPv4 i18n timeout: '+exp);};
  const test=async(name,run)=>{try{await run();results['ipv4-i18n: '+name]={passed:true};}catch(error){results['ipv4-i18n: '+name]={passed:false,error:error.stack};throw error;}};
  const navigate=async(db,theme)=>{
    await page.send('Page.navigate',{url});await wait(`document.readyState==='complete'&&location.pathname==='/__application_boot_test__'`);
    await page.evaluate(`await import('/node_modules/@xyflow/react/dist/style.css');await import('/node_modules/@xterm/xterm/css/xterm.css');await import('/src/themes.css');await import('/src/styles.css');await import('/src/buttons.css');window.i18n=await import('/src/i18n/index.ts');window.tr=k=>i18n.translate(i18n.useLanguage.getState().language,k);window.store=(await import('/src/store.ts')).useStore;window.sim=(await import('/src/sim.ts')).sim;window.summary=await import('/src/hostNetworkSummary.ts');window.theme=(await import('/src/uiTheme.ts')).useUiTheme;theme.getState().setTheme(${JSON.stringify(theme)});const entry=await import('/src/workspace/WorkspaceApplication.tsx');window.application=entry.mountWorkspaceApplication(document.getElementById('root'),{repositoryOptions:{databaseName:${JSON.stringify(db)}},legacy:{storage:{getItem:()=>null},origin:location.origin}});await application.ready;`);
    await wait(`document.querySelector('.workspace-tabs')`);
  };
  const open=async()=>{
    await page.evaluate(`store.getState().select(window.deviceId??store.getState().nodes[0].id);`);
    await wait(`document.querySelector('.inspector:not([hidden])')`);
    await page.evaluate(`const inspector=document.querySelector('.inspector:not([hidden])');const tab=inspector.querySelector('[id$="-tab-network"],[id$="-tab-interfaces"]');tab?.click();const details=inspector.querySelector('.router-interface-editor');if(details)details.open=true;`);
    await wait(`document.querySelector('.inspector:not([hidden]) .ipv4-form input[name=ip]')`);
  };
  const input=async(field,value)=>{await page.evaluate(`const el=document.querySelector('.inspector:not([hidden]) .ipv4-form input[name=${field}]');el.focus();el.select();`);await page.send('Input.insertText',{text:value});};
  const fields=()=>page.evaluate(`return Object.fromEntries([...document.querySelector('.inspector:not([hidden]) .ipv4-form').querySelectorAll('input[name]')].map(el=>[el.name,el.value]));`);
  const doc=()=>page.evaluate(`return store.getState().captureWorkspaceDocument();`);
  const flush=async()=>assert.equal(await page.evaluate(`return (await application.controller.flush()).ok;`),true);
  const capture=async(name)=>{await page.evaluate(`await document.fonts.ready;`);await delay(100);const r=await page.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(images,name),Buffer.from(r.data,'base64'));captures.push(name);};
  try{
    for(const theme of ['graphite-dark','classic-light'])for(const [kind,os]of [['host','linux'],['host','windows'],['notebook','linux'],['server',null],['router',null],['firewall',null],['smartphone',null]]){
      const db='netlab-idb-test-'+crypto.randomUUID();databases.push(db);const prefix=kind+'-'+(os??'default')+'-'+theme;
      await page.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});await navigate(db,theme);
      await page.evaluate(`store.getState().addDeviceAt(${JSON.stringify(kind)},{x:100,y:100});window.deviceId=store.getState().nodes.at(-1).id;if(${JSON.stringify(os)})store.getState().setHostOs(deviceId,${JSON.stringify(os)});store.getState().renameDevice(deviceId,'IPv4 – São Paulo 東京');`);await open();
      await test(prefix+': static IPv4 gateway and DNS through existing form',async()=>{
        for(const [field,value]of [['ip','192.0.2.10/24'],['gateway','192.0.2.1'],['dns','192.0.2.53']])await input(field,value);
        await page.evaluate(`document.activeElement.blur();`);await wait(`sim.net.devices.get(deviceId).interfaces[0].dns!==null`);await flush();
        await page.evaluate(`const device=sim.net.devices.get(deviceId);const ip=(await import('/src/engine/ip.ts')).parseIp;device.addRoute(0,0,ip('192.0.2.254'),device.interfaces[0].name);store.getState().refresh();`);await flush();
        if(kind==='host'&&os==='linux'&&theme==='graphite-dark')for(const lang of ['de','en','pt-BR']){await page.evaluate(`i18n.useLanguage.getState().setLanguage(${JSON.stringify(lang)});`);await delay(30);await capture(lang+'-'+prefix+'-valid.png');}
      });
      await input('ip','192.0.2.');const beforeFields=await fields(),before=await doc(),history=await page.evaluate(`return store.getState().topologyHistory;`);
      for(const lang of ['de','en','pt-BR'])await test(prefix+': incomplete draft and error follow '+lang+' without technical writes',async()=>{
        await page.evaluate(`i18n.useLanguage.getState().setLanguage(${JSON.stringify(lang)});`);await delay(550);
        assert.deepEqual(await fields(),beforeFields);assert.deepEqual(await doc(),before);assert.deepEqual(await page.evaluate(`return store.getState().topologyHistory;`),history);
        assert.equal(await page.evaluate(`const text=document.querySelector('.inspector:not([hidden]) .interface-default-routes').textContent;return text.includes(tr('navigation.gatewayInterface'))&&text.includes(tr('navigation.gatewayExplicit'))&&text.includes('192.0.2.1')&&text.includes('192.0.2.254');`),true);
        await page.evaluate(`document.activeElement.blur();`);await wait(`[...document.querySelectorAll('.ipv4-interface [role=status]')].some(el=>el.textContent===tr('navigation.ipv4Invalid'))`);
        if(['host','router'].includes(kind))await capture(lang+'-'+prefix+'-form.png');
        await page.evaluate(`document.querySelector('.inspector:not([hidden]) input[name=ip]').focus();`);
      });
      await test(prefix+': restore valid draft and DHCP toggle is language independent',async()=>{
        await input('ip','192.0.2.10/24');await page.evaluate(`document.activeElement.blur();`);await flush();
        await page.evaluate(`document.querySelector('.inspector:not([hidden]) .ipv4-mode input').click();`);await wait(`sim.net.devices.get(deviceId).interfaces[0].ipv4Mode==='dhcp'`);
        const dhcp=await doc(),stack=await page.evaluate(`return store.getState().topologyHistory;`);
        for(const lang of ['de','en','pt-BR']){await page.evaluate(`i18n.useLanguage.getState().setLanguage(${JSON.stringify(lang)});`);await delay(30);assert.deepEqual(await doc(),dhcp);assert.deepEqual(await page.evaluate(`return store.getState().topologyHistory;`),stack);assert.equal(await page.evaluate(`return document.querySelector('.ipv4-mode input').checked;`),true);}
        await page.evaluate(`document.querySelector('.inspector:not([hidden]) .ipv4-mode input').click();`);await wait(`document.querySelector('.inspector:not([hidden]) input[name=ip]')`);
        for(const [field,value]of [['ip','198.51.100.10/24'],['gateway','198.51.100.1'],['dns','198.51.100.53']])await input(field,value);
        await page.evaluate(`document.activeElement.blur();`);await flush();
      });
      await test(prefix+': F5 restores actual configuration',async()=>{
        const before=await doc(),realm=await page.evaluate(`return performance.timeOrigin;`);await page.send('Page.reload');await wait(`performance.timeOrigin!==${realm}&&document.readyState==='complete'`);await navigate(db,theme);assert.deepEqual(await doc(),before);await open();assert.equal((await fields()).gateway,'198.51.100.1');assert.equal((await fields()).dns,'198.51.100.53');
      });
      await page.evaluate(`application.dispose();`);
    }
  }finally{
    await page.evaluate(`window.application?.dispose();`).catch(()=>{});for(const name of databases){assert(/^netlab-idb-test-[\da-f-]{36}$/.test(name));await page.evaluate(`await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase(${JSON.stringify(name)});r.onsuccess=resolve;r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Disposable cleanup blocked'));});`);}
    Object.assign(report.results,results);report.ipv4I18n={checks:Object.keys(results).length,captures};await writeFile(path.join(directory,'validation.json'),JSON.stringify(report.ipv4I18n,null,2));await writeFile(path.join(directory,'index.html'),'<!doctype html><meta charset="utf-8"><title>IPv4 i18n 3B</title><style>body{background:#171d24;color:white;font-family:system-ui}img{width:1100px;max-width:100%}figure{margin:24px}</style>'+captures.map(f=>`<figure><figcaption>${f}</figcaption><a href="referencias-chatgpt/${f}"><img src="referencias-chatgpt/${f}" alt="${f}"></a></figure>`).join(''));
  }
}
