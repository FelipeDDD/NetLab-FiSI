import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {generateReview} from './visual-review.mjs';

export async function runBrowserReview({page,url,root,report}) {
  const database='netlab-idb-test-'+randomUUID(),directory=path.join(root,'.playwright-mcp/reviews/raw/pc-browser-staging');
  await mkdir(directory,{recursive:true});
  const results={},captures=[],realRequests=[],delay=ms=>new Promise(r=>setTimeout(r,ms));
  const unsubscribe=page.onEvent('Network.requestWillBeSent',p=>realRequests.push(p.request.url));
  const wait=async expression=>{for(let i=0;i<250;i++){if(await page.evaluate('return !!('+expression+');'))return;await delay(60);}throw Error('Timed out: '+expression);};
  const test=async(name,fn)=>{try{await fn();results[name]={passed:true};}catch(e){results[name]={passed:false,error:e.stack};throw e;}};
  const click=async(selector,text)=>{
    const p=await page.evaluate(`const es=[...document.querySelectorAll(${JSON.stringify(selector)})],e=${text?`es.find(e=>e.textContent.trim()===${JSON.stringify(text)})`:'es[0]'};if(!e)throw Error('Missing '+${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};`);
    await page.send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1});
    await page.send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1});await delay(90);
  };
  const type=async(value)=>{await click('#pc-browser-address');await page.send('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',modifiers:2,windowsVirtualKeyCode:65});await page.send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',modifiers:2,windowsVirtualKeyCode:65});await page.send('Input.insertText',{text:value});};
  const navigate=async(value)=>{await type(value);await click('.pc-browser-navigation button[type=submit]');};
  const language=async value=>{await page.evaluate(`const e=document.querySelector('#toolbar-language');e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}));`);await delay(90);};
  const failure=async code=>{await wait(`document.querySelector('.pc-browser-error-code')?.textContent===${JSON.stringify(code)}`);assert(await page.evaluate("return !!document.querySelector('.pc-browser-error-help h4')&&!document.querySelector('.pc-browser-error').textContent.includes('unreachable');"));};
  const rect=()=>page.evaluate("const r=document.querySelector('.pc-desktop').getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};");
  const browserState=()=>page.evaluate("return {address:document.querySelector('#pc-browser-address')?.value,page:document.querySelector('.pc-browser-page')?.textContent,status:document.querySelector('.pc-browser-http-status')?.textContent,back:document.querySelector('.pc-browser-navigation button')?.disabled};");
  const drag=async(selector,dx,dy)=>{
    const p=await page.evaluate(`const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+Math.min(r.width/2,30),y:r.y+Math.min(r.height/2,12)};`);
    await page.send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1});
    for(let i=1;i<=5;i++)await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x+dx*i/5,y:p.y+dy*i/5,button:'left',buttons:1});
    await page.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x+dx,y:p.y+dy,button:'left',clickCount:1});await delay(100);
  };
  const nodeMenu=async(id,keyboard=false)=>{
    const p=await page.evaluate(`const e=[...document.querySelectorAll('.react-flow__node')].find(e=>e.dataset.id===${JSON.stringify(id)});e.focus({preventScroll:true});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};`);
    if(keyboard){await page.send('Input.dispatchKeyEvent',{type:'keyDown',key:'F10',code:'F10',modifiers:8,windowsVirtualKeyCode:121});await page.send('Input.dispatchKeyEvent',{type:'keyUp',key:'F10',code:'F10',modifiers:8,windowsVirtualKeyCode:121});}
    else {await page.send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'right',clickCount:1});await page.send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'right',clickCount:1});}
    await wait("document.querySelector('#device-context-menu [role=menuitem]')");
  };
  const shot=async(name,variant,width)=>{
    const png=await page.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    await writeFile(path.join(directory,name+'.png'),Buffer.from(png.data,'base64'));
    captures.push({source:path.relative(root,path.join(directory,name+'.png')).split(path.sep).join('/'),scene:name,variant,state:'normal',width,height:960});
  };
  try {
    await page.send('Network.enable');await page.send('Network.setBlockedURLs',{urls:['*example.invalid*','http://192.168.*/*','http://server.lab/*']});
    await page.send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});
    await page.send('Page.navigate',{url});await wait("document.readyState==='complete'&&location.pathname==='/__workspace_ui_test__'");
    await page.evaluate(`window.entry=await import('/src/workspace/reviewEntry.tsx');window.store=(await import('/src/store.ts')).useStore;window.sim=(await import('/src/sim.ts')).sim;window.ws=await entry.mountWorkspaceReview(document.getElementById('root'),{databaseName:${JSON.stringify(database)}});window.lang=(await import('/src/i18n/index.ts')).useLanguage;lang.getState().setLanguage('de');window.theme=(await import('/src/uiTheme.ts')).useUiTheme;theme.getState().setTheme('graphite-dark');`);
    await wait("document.querySelector('.react-flow')");
    await page.evaluate(`const s=store.getState();for(const [kind,x,y] of [['host',130,130],['host',130,350],['switch',420,230],['server',680,230]])s.addDeviceAt(kind,{x,y});
      const hosts=[...sim.net.devices.values()].filter(d=>d.kind==='host');window.pc=hosts[0];window.linux=hosts[1];window.server=[...sim.net.devices.values()].find(d=>d.kind==='server');const sw=[...sim.net.devices.values()].find(d=>d.kind==='switch');
      for(const d of [pc,linux,server])s.onConnect({source:d.id,target:sw.id});
      const ip=await import('/src/engine/ip.ts');pc.interfaces[0].ip=ip.parseCidr('192.168.1.10/24');linux.interfaces[0].ip=ip.parseCidr('192.168.1.11/24');server.interfaces[0].ip=ip.parseCidr('192.168.1.20/24');
      pc.nameserver=ip.parseIp('192.168.1.20');linux.nameserver=pc.nameserver;server.dnsServer={enabled:true,records:new Map([['server.lab',pc.nameserver]])};
      window.safeBody='<h1>Serviceportal</h1><p>Willkommen im simulierten Netz von NetLab-FiSI.</p><ul><li><a href="/index.html">Startseite</a></li><li><a href="/missing.html">Fehlende Seite testen</a></li></ul>';
      server.httpServer={enabled:true,port:80,body:safeBody};s.setHostOs(pc.id,'windows');s.refresh();s.select(pc.id);s.setPaused(true,'activation');s.startPacketCapture();window.beforeBrowser=JSON.stringify(s.captureWorkspaceDocument());`);
    await test('browser: Windows/Linux desktop launch shares UI and leaves terminals/configuration intact',async()=>{
      await click('.host-os-terminal button','Desktop');await wait("document.querySelector('.pc-desktop-home')");
      await wait("document.querySelector('.pc-desktop').getBoundingClientRect().width===600");
      assert.equal((await rect()).height,420);
      assert(await page.evaluate("return document.querySelector('.pc-desktop-header').textContent.includes('Windows');"));await shot('desktop-windows','graphite-dark',1440);
      await click('.pc-desktop-app');await wait("document.activeElement?.id==='pc-browser-address'");
      assert.equal(await page.evaluate('return store.getState().terminals.length;'),0);
      await navigate('http://server.lab');await wait("document.querySelector('.pc-browser-http-status')");
      assert.equal(await page.evaluate('return store.getState().paused;'),false);
      assert(await page.evaluate("return document.querySelector('.pc-browser-page').textContent.includes('Serviceportal');"));
      assert.equal(await page.evaluate('return JSON.stringify(store.getState().captureWorkspaceDocument());'),await page.evaluate('return beforeBrowser;'));
      await shot('browser-http-desktop','graphite-dark',1440);
    });
    await test('browser window: headers move one compact frame; edges/corners/keyboard resize without requests, history or canvas changes',async()=>{
      const before=await browserState(),doc=await page.evaluate('return JSON.stringify(store.getState().captureWorkspaceDocument());');
      const viewport=await page.evaluate("return document.querySelector('.react-flow__viewport').getAttribute('style');");
      const start=await rect();await drag('.pc-desktop-header',90,55);const moved=await rect();
      assert.equal(moved.x,start.x+90);assert.equal(moved.y,start.y+55);assert.equal(moved.width,600);assert.equal(moved.height,420);
      await drag('.pc-browser-header',-30,15);assert.equal((await rect()).x,moved.x-30);
      await drag('.resize-se',80,50);assert.equal((await rect()).width,680);assert.equal((await rect()).height,470);
      for(const edge of ['n','s','e','w','ne','nw','sw'])await drag('.resize-'+edge,edge.includes('w')?-8:edge.includes('e')?8:0,edge.includes('n')?-8:edge.includes('s')?8:0);
      const preKey=await rect();await page.evaluate("document.querySelector('.pc-desktop-header').focus();");
      await page.send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});await page.send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});await delay(60);
      assert.equal((await rect()).x,preKey.x+5);
      const preResize=await rect();await page.evaluate("document.querySelector('.resize-e').focus();");
      await page.send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});await page.send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});await delay(60);
      assert.equal((await rect()).width,preResize.width+5);
      assert.deepEqual(await browserState(),before);assert.equal(await page.evaluate('return JSON.stringify(store.getState().captureWorkspaceDocument());'),doc);
      assert.equal(await page.evaluate("return document.querySelector('.react-flow__viewport').getAttribute('style');"),viewport);
      assert.equal(await page.evaluate("return document.querySelectorAll('.pc-desktop,.pc-browser').length;"),2);
      await shot('browser-window-resized','graphite-dark',1440);
    });
    await test('browser: DNS/ARP/TCP/HTTP appear in capture; links, 404, back, forward and reload use engine responses',async()=>{
      await wait("store.getState().packetCapture.records.some(p=>p.frame.payload.kind==='ipv4'&&p.frame.payload.l4.app?.kind==='http-response')");
      assert(await page.evaluate("const rs=store.getState().packetCapture.records;return rs.some(p=>p.frame.payload.kind==='arp')&&rs.some(p=>p.frame.payload.kind==='ipv4'&&p.frame.payload.l4.app?.kind==='dns-query')&&rs.some(p=>p.frame.payload.kind==='ipv4'&&p.frame.payload.l4.kind==='tcp'&&p.frame.payload.l4.syn);"));
      await click('.pc-browser-link','Fehlende Seite testen');await wait("document.querySelector('.pc-browser-http-status')?.textContent.includes('404')");
      await shot('browser-404-desktop','graphite-dark',1440);
      assert(await page.evaluate("return document.querySelector('.pc-browser-error h3').textContent==='Seite nicht gefunden'&&document.querySelector('.pc-browser-error-help').textContent.includes('HTTP-Server')&&!!document.querySelector('.pc-browser-server-response');"));
      await click('.pc-browser-navigation button[aria-label="Zurück"]');await wait("document.querySelector('.pc-browser-page')?.textContent.includes('Serviceportal')");
      await click('.pc-browser-navigation button[aria-label="Vorwärts"]');await wait("document.querySelector('.pc-browser-http-status')?.textContent.includes('404')");
      await page.evaluate("server.httpServer.body='<h1>Aktualisiert</h1>';store.getState().refresh();");
      await navigate('http://server.lab/index.html');await wait("document.querySelector('.pc-browser-page')?.textContent.includes('Aktualisiert')");
      await page.evaluate("server.httpServer.body='<h1>Neu geladen</h1>';store.getState().refresh();");
      await click('.pc-browser-navigation button[aria-label="Neu laden"]');await wait("document.querySelector('.pc-browser-page')?.textContent.includes('Neu geladen')");
    });
    await test('browser: errors reflect DNS/service/link changes and recover on retry',async()=>{
      await navigate('http://unknown.lab');await failure('ERR_NAME_NOT_RESOLVED');
      for(const [lang,title,help] of [['de','Diese Website ist nicht erreichbar','Was bedeutet das?'],['pt-BR','Não é possível acessar este site','O que significa?'],['en','This site can’t be reached','What does this mean?'],['de','Diese Website ist nicht erreichbar','Was bedeutet das?']]){
        await language(lang);assert.equal(await page.evaluate("return document.querySelector('.pc-browser-error h3').textContent;"),title);
        assert.equal(await page.evaluate("return document.querySelector('.pc-browser-error-help h4').textContent;"),help);
        assert.equal(await page.evaluate("return document.querySelector('.pc-browser-error-code').textContent;"),'ERR_NAME_NOT_RESOLVED');
        assert.equal(await page.evaluate("return document.querySelectorAll('.pc-browser-dns-resolution').length;"),0);
      }
      await shot('browser-error-dns','graphite-dark',1440);
      await page.evaluate('server.httpServer.enabled=false;store.getState().refresh();');await navigate('http://192.168.1.20');await wait("document.querySelector('.pc-browser-error')");
      await failure('ERR_CONNECTION_REFUSED');assert.equal(await page.evaluate("return document.querySelectorAll('.pc-browser-dns-resolution').length;"),0);
      await navigate('http://server.lab');await failure('ERR_CONNECTION_REFUSED');
      assert(await page.evaluate("return document.querySelector('.pc-browser-dns-resolution').textContent.includes('server.lab → 192.168.1.20');"));await shot('browser-error-refused','graphite-dark',1440);
      await page.evaluate('server.httpServer.enabled=true;pc.interfaces[0].up=false;store.getState().refresh();');await navigate('http://192.168.1.20');await wait("document.querySelector('.pc-browser-error')");
      await failure('ERR_ADDRESS_UNREACHABLE');
      await page.evaluate('pc.interfaces[0].up=true;server.httpServer.body=safeBody;store.getState().refresh();');await navigate('http://server.lab');await wait("document.querySelector('.pc-browser-http-status')");
    });
    await test('browser errors: connection timeout differs from established TCP without HTTP; neither invents firewall causation',async()=>{
      await page.evaluate("server.fw.declareFilter('input','input');window.block=server.fw.addFilterRule('input',{proto:'tcp',dport:{from:80,to:80}},'drop');");
      await navigate('http://server.lab');await failure('ERR_CONNECTION_TIMED_OUT');
      assert(await page.evaluate("return !!document.querySelector('.pc-browser-dns-resolution')&&!/firewall|blockiert/i.test(document.querySelector('.pc-browser-error-help').textContent);"));
      await page.evaluate("server.fw=new (await import('/src/engine/firewall.ts')).FirewallModel();server.httpServer.enabled=false;server.services.tcp.add(80);");
      await navigate('http://server.lab');await failure('ERR_TIMED_OUT');
      assert(await page.evaluate("return document.querySelector('.pc-browser-error h3').textContent==='Diese Seite antwortet nicht'&&document.querySelector('.pc-browser-error-help').textContent.includes('TCP wurde aufgebaut');"));
      await page.evaluate('server.services.tcp.delete(80);server.httpServer.enabled=true;');
    });
    await test('browser: inert content cannot run scripts, load external resources or create real navigation links',async()=>{
      const before=realRequests.length;
      await page.evaluate(`server.httpServer.body='<h1>Safe page</h1><img src="https://example.invalid/leak" onerror="window.browserXss=1"><iframe src="https://example.invalid/frame"></iframe><style>body{background:url(https://example.invalid/css)}</style><script>window.browserXss=1</script><a href="javascript:window.browserXss=1">Unsafe</a><a href="/index.html">Safe link</a>';`);
      await navigate('http://server.lab');await wait("document.querySelector('.pc-browser-page')?.textContent.includes('Safe page')");await delay(200);
      assert(await page.evaluate("return !window.browserXss&&!document.querySelector('.pc-browser-page script,.pc-browser-page img,.pc-browser-page iframe,.pc-browser-page style,.pc-browser-page a[href]')&&document.querySelectorAll('.pc-browser-page [role=link]').length===1;"));
      assert(!realRequests.slice(before).some(value=>/example\.invalid|^http:\/\/(server\.lab|192\.168\.)/.test(value)));
    });
    await test('browser: explicit manual pause, stop, HTTPS warning and optional TCP-only 443 probe',async()=>{
      await page.evaluate("store.getState().setPaused(true,'manual');");await navigate('http://192.168.1.20');
      assert.equal(await page.evaluate('return store.getState().paused;'),true);
      assert(await page.evaluate("return !!document.querySelector('.pc-browser-pause');"));
      await click('.pc-browser-navigation button[aria-label="Stoppen"]');await page.evaluate('store.getState().setPaused(false);');await delay(300);
      assert(await page.evaluate("return document.querySelector('.pc-browser-document').textContent.includes('gestoppt');"));
      await navigate('https://server.lab');await wait("document.querySelector('.pc-browser-error')");assert(await page.evaluate("return document.querySelector('.pc-browser-error').textContent.includes('TLS');"));
      await page.evaluate('server.services.tcp.add(443);');await click('.pc-browser-error button');await wait("document.querySelector('.pc-browser-document').textContent.includes('Nur TCP wurde getestet')");
      assert.equal(await page.evaluate("return document.querySelectorAll('.pc-browser-http-status').length;"),0);
      await shot('browser-https-probe','graphite-dark',1440);
    });
    await test('browser menu: right click and Shift+F10 open the same browser directly without hover controls or duplicates',async()=>{
      await drag('.pc-desktop-header',0,600);
      const before=await browserState(),geometry=await rect();
      const id=await page.evaluate('return pc.id;');await nodeMenu(id);
      await click('#device-context-menu button','Browser öffnen');await wait("!document.querySelector('#device-context-menu')");
      assert.deepEqual(await browserState(),before);assert.deepEqual(await rect(),geometry);
      assert.equal(await page.evaluate("return document.querySelectorAll('.pc-desktop').length;"),1);
      assert.equal(await page.evaluate("return document.querySelectorAll('.pc-desktop-home').length;"),0);
      assert(await page.evaluate("return ![...document.querySelectorAll('.device-actions button')].some(e=>/Browser|Desktop/.test(e.textContent+' '+e.getAttribute('aria-label')));"));
      await click('.pc-desktop-header button');await wait("!document.querySelector('.pc-desktop')");
      await nodeMenu(id,true);await page.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await page.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await wait("!document.querySelector('#device-context-menu')");
      await nodeMenu(id);await click('#device-context-menu button','Browser öffnen');await wait("document.querySelector('#pc-browser-address')");
      assert.equal(await page.evaluate("return document.querySelectorAll('.pc-desktop-home').length;"),0);
      assert.equal((await rect()).width,600);assert.equal((await rect()).height,420);
    });
    await test('browser: Linux reuses the same desktop, mobile/Light fits and device deletion closes stale window',async()=>{
      await click('.pc-desktop-header button');await page.evaluate('store.getState().select(linux.id);');await delay(100);await nodeMenu(await page.evaluate('return linux.id;'));await click('#device-context-menu button','Browser öffnen');await wait("document.querySelector('#pc-browser-address')");
      assert(await page.evaluate("return document.querySelector('.pc-desktop-header').textContent.includes('Linux');"));
      await page.evaluate("theme.getState().setTheme('classic-light');server.httpServer.body=safeBody;");
      await page.send('Emulation.setDeviceMetricsOverride',{width:700,height:960,deviceScaleFactor:1,mobile:false});await delay(150);
      await navigate('http://server.lab');await wait("document.querySelector('.pc-browser-page')?.textContent.includes('Serviceportal')");await shot('browser-http-700','classic-light',700);
      await page.send('Emulation.setDeviceMetricsOverride',{width:390,height:960,deviceScaleFactor:1,mobile:true});await delay(150);
      const layout=await page.evaluate("const e=document.querySelector('.pc-desktop'),r=e.getBoundingClientRect();return {scroll:e.scrollWidth,client:e.clientWidth,left:r.x,right:r.right,viewport:innerWidth,document:document.documentElement.scrollWidth};");
      await shot('browser-http-mobile','classic-light',390);
      assert(layout.scroll<=layout.client+1&&layout.left>=0&&layout.right<=layout.viewport+1&&layout.document<=layout.viewport+1,JSON.stringify(layout));
      const before=await browserState(),start=await rect();await page.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
      const touch=await page.evaluate("const r=document.querySelector('.pc-desktop-header').getBoundingClientRect();return{x:r.x+30,y:r.y+15,id:1};");
      await page.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touch]});await page.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...touch,y:touch.y+35}]});await page.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await delay(100);
      assert((await rect()).y>start.y);assert.deepEqual(await browserState(),before);
      await page.send('Emulation.setTouchEmulationEnabled',{enabled:false});
      await language('pt-BR');await navigate('http://unknown.lab');await failure('ERR_NAME_NOT_RESOLVED');
      assert(await page.evaluate("const e=document.querySelector('.pc-browser-document');return e.scrollWidth<=e.clientWidth+1&&document.documentElement.scrollWidth<=innerWidth+1;"));await shot('browser-error-mobile','classic-light',390);
      await page.evaluate('store.getState().deleteDevice(linux.id);');await wait("!document.querySelector('.pc-desktop')");
      assert.equal(await page.evaluate('return store.getState().terminals.length;'),0);
    });
  }finally {
    unsubscribe();await page.send('Network.setBlockedURLs',{urls:[]});
    await page.evaluate('window.ws?.dispose();');
    await page.evaluate(`await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase(${JSON.stringify(database)});r.onsuccess=resolve;r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Browser cleanup blocked'));});`);
    Object.assign(report.results,results);await writeFile(path.join(directory,'results.json'),JSON.stringify(results,null,2));
    if(captures.length&&Object.values(results).every(r=>r.passed)){
      const manifest=path.join(directory,'manifest.json');await writeFile(manifest,JSON.stringify({id:'pc-browser',title:'PC Desktop · Simulierter Web Browser',variants:[{id:'graphite-dark',label:'Graphite Dark'},{id:'classic-light',label:'Classic Light'}],states:['normal'],captures,share:captures.filter(c=>['browser-error-dns','browser-error-refused','browser-error-mobile'].includes(c.scene)).map(c=>({...c,name:c.scene})),shareContactSheet:false}));
      report.browserReview=await generateReview(manifest);
    }
  }
}
