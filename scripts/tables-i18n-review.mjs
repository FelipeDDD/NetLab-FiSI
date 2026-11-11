import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
export async function runTablesI18nReview({page,url,root,report}) {
  const directory=path.join(root,'.playwright-mcp/reviews/tables-3c1'),images=path.join(directory,'referencias-chatgpt');await mkdir(images,{recursive:true});
  const databases=[],captures=[],results={};const delay=ms=>new Promise(r=>setTimeout(r,ms));
  const wait=async exp=>{for(let i=0;i<200;i++){try{if(await page.evaluate(`return !!(${exp});`))return;}catch{}await delay(40);}throw Error('Tables i18n timeout: '+exp);};
  const test=async(name,run)=>{try{await run();results['tables-i18n: '+name]={passed:true};}catch(error){results['tables-i18n: '+name]={passed:false,error:error.stack};throw error;}};
  const mount=async(db,theme)=>{
    await page.send('Page.navigate',{url});await wait(`document.readyState==='complete'&&location.pathname==='/__application_boot_test__'`);
    await page.evaluate(`await import('/node_modules/@xyflow/react/dist/style.css');await import('/node_modules/@xterm/xterm/css/xterm.css');await import('/src/themes.css');await import('/src/styles.css');await import('/src/buttons.css');window.i18n=await import('/src/i18n/index.ts');window.tr=k=>i18n.translate(i18n.useLanguage.getState().language,k);window.store=(await import('/src/store.ts')).useStore;window.sim=(await import('/src/sim.ts')).sim;window.theme=(await import('/src/uiTheme.ts')).useUiTheme;theme.getState().setTheme(${JSON.stringify(theme)});const entry=await import('/src/workspace/WorkspaceApplication.tsx');window.application=entry.mountWorkspaceApplication(document.getElementById('root'),{repositoryOptions:{databaseName:${JSON.stringify(db)}},legacy:{storage:{getItem:()=>null},origin:location.origin}});await application.ready;`);await wait(`document.querySelector('.workspace-tabs')`);
  };
  const snapshot=()=>page.evaluate(`return {document:store.getState().captureWorkspaceDocument(),runtime:[...sim.net.devices.values()].map(d=>({id:d.id,routes:d.routes?.(),arp:d.arpTable&&[...d.arpTable],mac:d.macTable&&[...d.macTable].map(([k,p])=>[k,p.name])}))};`);
  const open=async(id,tab)=>{
    await page.evaluate(`store.getState().select(${JSON.stringify(id)});`);await wait(`document.querySelector('.inspector:not([hidden])')`);
    await page.evaluate(`const root=document.querySelector('.inspector:not([hidden])');root.querySelector('[id$="-tab-${tab}"]')?.click();root.querySelectorAll('details').forEach(d=>d.open=true);`);await delay(40);
  };
  const capture=async filename=>{await page.evaluate(`await document.fonts.ready;`);await delay(100);const shot=await page.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(images,filename),Buffer.from(shot.data,'base64'));captures.push(filename);};
  try{
    for(const [theme,width]of [['graphite-dark',1440],['classic-light',900]]){
      const db='netlab-idb-test-'+crypto.randomUUID();databases.push(db);await page.send('Emulation.setDeviceMetricsOverride',{width,height:1100,deviceScaleFactor:1,mobile:false});await mount(db,theme);
      const ids=await page.evaluate(`window.ids={};for(const [key,kind]of [['linux','host'],['windows','host'],['router','router'],['peer','router'],['switch','switch'],['server','server'],['ap','ap']]){store.getState().addDeviceAt(kind,{x:200+Object.keys(ids).length*180,y:200});ids[key]=store.getState().nodes.at(-1).id;store.getState().renameDevice(ids[key],key+' – São Paulo 東京');}store.getState().setHostOs(ids.windows,'windows');return ids;`);
      for(const lang of ['de','en','pt-BR'])await test(theme+': empty tables / '+lang,async()=>{
        await page.evaluate(`i18n.useLanguage.getState().setLanguage(${JSON.stringify(lang)});`);await open(ids.linux,'network');
        await wait(`document.querySelector('.inspector:not([hidden]) .diagnostic-empty')`);
        assert.equal(await page.evaluate(`return [...document.querySelectorAll('.inspector:not([hidden]) [role=tab]')].some(e=>e.textContent===tr('navigation.basicNetwork'));`),true);
        assert.equal(await page.evaluate(`return [...document.querySelectorAll('.inspector:not([hidden]) .diagnostic-empty')].some(e=>e.textContent===tr('navigation.tableEmptyArp'));`),true);
        await open(ids.switch,'mac');assert.equal(await page.evaluate(`return document.querySelector('.inspector:not([hidden]) .diagnostic-empty').textContent;`),await page.evaluate(`return tr('navigation.tableEmptyMac');`));
        await open(ids.router,'routing');assert.equal(await page.evaluate(`return [...document.querySelectorAll('.inspector:not([hidden]) .diagnostic-empty')].some(e=>e.textContent===tr('navigation.tableEmptyRoutes'));`),true);
      });
      await test(theme+': real ARP/MAC learning and RIP',async()=>{
        await page.evaluate(`window.ip=(await import('/src/engine/ip.ts')).parseIp;window.config=(await import('/src/engine/ipv4Config.ts')).parseStaticIpv4;for(const key of ['linux','windows','server','router','ap'])store.getState().onConnect({source:ids[key],target:ids.switch});store.getState().onConnect({source:ids.router,target:ids.peer});for(const [key,address]of [['linux','192.0.2.10'],['windows','192.0.2.20'],['server','192.0.2.30'],['router','192.0.2.1']]){const d=sim.net.devices.get(ids[key]);d.interfaces[0].configureIpv4(config(address,'/24','',''));}const a=sim.net.devices.get(ids.router),b=sim.net.devices.get(ids.peer);a.interfaces[1].configureIpv4(config('10.0.0.1','/30','',''));b.interfaces[0].configureIpv4(config('10.0.0.2','/30','',''));b.interfaces[1].configureIpv4(config('198.51.100.1','/24','',''));a.addRoute(0,0,ip('10.0.0.2'),'eth1');a.enableRip(true);b.enableRip(true);sim.net.devices.get(ids.linux).sendEcho(ip('192.0.2.20'),42,1);sim.net.scheduler.advanceTo(5000);store.getState().refresh();`);
        assert.equal(await page.evaluate(`return sim.net.devices.get(ids.linux).arpTable.size>0&&sim.net.devices.get(ids.switch).macTable.size>0&&sim.net.devices.get(ids.router).routes().some(r=>r.kind==='rip');`),true);
      });
      const original=await snapshot();
      for(const [key,tab]of [['linux','network'],['windows','network'],['router','routing'],['server','network'],['switch','mac'],['ap','general']]){
        await open(ids[key],tab);
        const active=await page.evaluate(`return document.querySelector('.inspector:not([hidden]) [role=tab][aria-selected=true]')?.id;`);
        for(const lang of ['de','en','pt-BR'])await test(theme+': '+key+' open tables / '+lang,async()=>{
          await page.evaluate(`i18n.useLanguage.getState().setLanguage(${JSON.stringify(lang)});`);await delay(50);
          assert.deepEqual(await snapshot(),original);
          assert.equal(await page.evaluate(`return store.getState().selected;`),ids[key]);assert.equal(await page.evaluate(`return document.querySelector('.inspector:not([hidden]) [role=tab][aria-selected=true]')?.id;`),active);
          const labels=await page.evaluate(`const root=document.querySelector('.inspector:not([hidden])');return [...(root.querySelector('[role=tabpanel]:not([hidden])')??root).querySelectorAll('.diagnostic-table-region')].map(e=>e.getAttribute('aria-label'));`);
          assert(labels.includes(await page.evaluate(`return tr(${JSON.stringify(key==='switch'||key==='ap'?'navigation.tableMac':'navigation.tableArp')});`)));
          if(key==='router'){
            assert.equal(await page.evaluate(`const root=document.querySelector('.inspector:not([hidden]) [role=tabpanel]:not([hidden])');return ['is-connected','is-static','is-rip'].every(cls=>root.querySelector('.diagnostic-route-type.'+cls));`),true);
            await page.evaluate(`document.querySelector('.inspector:not([hidden]) [role=tabpanel]:not([hidden]) .diagnostic-info').click();`);
            await wait(`document.querySelector('.diagnostic-info-popup')`);
            assert.equal(await page.evaluate(`return document.querySelector('.diagnostic-info-popup').textContent.includes(tr('navigation.tableRipHint'));`),true);
            await page.evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));`);
            await wait(`!document.querySelector('.diagnostic-info-popup')`);
            assert.equal(await page.evaluate(`return [...document.querySelectorAll('.inspector:not([hidden]) [role=tabpanel]:not([hidden]) .hint')].some(e=>e.textContent.includes(tr('navigation.tableStaticTerminal')));`),true);
          }
          if(['linux','router','switch','ap'].includes(key))await capture(lang+'-'+theme+'-'+key+'.png');
          if(key==='linux'){
            await page.evaluate(`document.querySelector('.inspector:not([hidden]) [role=tabpanel]:not([hidden]) .diagnostic-table-arp').scrollIntoView({block:'center'});`);
            await capture(lang+'-'+theme+'-arp.png');
            await page.evaluate(`document.querySelector('.inspector:not([hidden])').scrollTop=0;document.scrollingElement.scrollTop=0;`);
          }
        });
      }
      await test(theme+': administrative DOWN and disconnection remain real',async()=>{
        await open(ids.switch,'ports');
        for(const lang of ['de','en','pt-BR']){await page.evaluate(`i18n.useLanguage.getState().setLanguage(${JSON.stringify(lang)});`);await delay(30);assert.equal(await page.evaluate(`const d=sim.net.devices.get(ids.switch);return document.querySelector('.inspector:not([hidden]) .switch-capacity-controls span').textContent===i18n.translate(i18n.useLanguage.getState().language,'navigation.portsCapacity',{total:d.interfaces.length,occupied:d.interfaces.filter(i=>i.link).length,free:d.interfaces.filter(i=>!i.link).length});`),true);}
        await page.evaluate(`store.getState().toggleIface(ids.linux,'eth0');`);await open(ids.linux,'general');
        for(const lang of ['de','en','pt-BR']){await page.evaluate(`i18n.useLanguage.getState().setLanguage(${JSON.stringify(lang)});`);await delay(30);assert.equal(await page.evaluate(`return document.querySelector('.inspector:not([hidden]) .interface-summary-state').textContent;`),await page.evaluate(`return tr('navigation.linkInactive');`));}
        await page.evaluate(`store.getState().deleteTopologyElements([],[sim.net.devices.get(ids.linux).interfaces[0].link.id]);`);await delay(40);
        assert.equal(await page.evaluate(`return document.querySelector('.inspector:not([hidden]) .interface-summary-state').textContent;`),await page.evaluate(`return tr('navigation.linkNoCable');`));
        assert.equal(await page.evaluate(`return sim.net.devices.get(ids.linux).interfaces[0].link===null;`),true);
      });
      await test(theme+': F5 preserves configuration; runtime tables keep existing lifecycle',async()=>{
        assert.equal(await page.evaluate(`return (await application.controller.flush()).ok;`),true);const before=(await snapshot()).document,realm=await page.evaluate(`return performance.timeOrigin;`);
        await page.send('Page.reload');await wait(`performance.timeOrigin!==${realm}&&document.readyState==='complete'`);await mount(db,theme);assert.deepEqual((await snapshot()).document,before);
      });
      await page.evaluate(`application.dispose();`);
    }
  }finally{
    await page.evaluate(`window.application?.dispose();`).catch(()=>{});for(const name of databases){assert(/^netlab-idb-test-[\da-f-]{36}$/.test(name));await page.evaluate(`await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase(${JSON.stringify(name)});r.onsuccess=resolve;r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Disposable cleanup blocked'));});`);}
    Object.assign(report.results,results);report.tablesI18n={checks:Object.keys(results).length,captures};await writeFile(path.join(directory,'validation.json'),JSON.stringify(report.tablesI18n,null,2));await writeFile(path.join(directory,'index.html'),'<!doctype html><meta charset="utf-8"><title>Tables i18n 3C1</title><style>body{background:#171d24;color:white;font-family:system-ui}img{width:1100px;max-width:100%}figure{margin:24px}</style>'+captures.map(f=>`<figure><figcaption>${f}</figcaption><a href="referencias-chatgpt/${f}"><img src="referencias-chatgpt/${f}" alt="${f}"></a></figure>`).join(''));
  }
}
