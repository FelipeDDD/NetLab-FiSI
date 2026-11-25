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
  const rect=()=>page.evaluate("const r=document.querySelector('.pc-desktop:not([hidden])').getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};");
  const browserState=()=>page.evaluate("return {address:document.querySelector('#pc-browser-address')?.value,page:document.querySelector('.pc-browser-page')?.textContent,status:document.querySelector('.pc-browser-http-status')?.textContent,back:document.querySelector('.pc-browser-navigation button')?.disabled};");
  const drag=async(selector,dx,dy)=>{
    const p=await page.evaluate(`const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+Math.min(r.width/2,30),y:r.y+Math.min(r.height/2,12)};`);
    await page.send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1});
    for(let i=1;i<=5;i++)await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x+dx*i/5,y:p.y+dy*i/5,button:'left',buttons:1});
    await page.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x+dx,y:p.y+dy,button:'left',clickCount:1});await delay(100);
  };
  const nodeMenu=async(id,keyboard=false)=>{
    const p=await page.evaluate(`const e=[...document.querySelectorAll('.react-flow__node')].find(e=>e.dataset.id===${JSON.stringify(id)});if(${keyboard})e.focus({preventScroll:true});const r=e.querySelector('.dev-icon').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};`);
    if(keyboard){await page.send('Input.dispatchKeyEvent',{type:'keyDown',key:'F10',code:'F10',modifiers:8,windowsVirtualKeyCode:121});await page.send('Input.dispatchKeyEvent',{type:'keyUp',key:'F10',code:'F10',modifiers:8,windowsVirtualKeyCode:121});}
    else {await page.send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'right',clickCount:1});await page.send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'right',clickCount:1});}
    await wait("document.querySelector('#device-context-menu [role=menuitem]')");
  };
  const shot=async(name,variant,width)=>{
    if (process.env.NETLAB_BROWSER_REVIEW_NO_SCREENSHOTS === '1') return;
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
    await test('canvas: stationary and one-pixel clicks select devices without dragging at different zooms', async () => {
      await page.evaluate(`
        store.getState().addDeviceAt('router',{x:420,y:420});
        store.getState().addDeviceAt('modem',{x:640,y:420});
        window.flow=(await import('/src/workspace/viewportProbe.browser.tsx')).getViewportProbe();
        window.browserInitialViewport=flow.getViewport();
        window.clickTrace=[];
        for (const type of ['pointerdown','pointermove','pointerup','click']) {
          document.addEventListener(type, event => {
            clickTrace.push([type,event.clientX,event.clientY,event.target.closest('.react-flow__node')?.dataset.id,event.target.className]);
          },true);
        }
      `);
      const issues = [];
      for (const zoom of [.25, .5, 1, 1.25]) {
        for (const kind of ['router', 'host', 'modem', 'switch']) {
          for (const drift of [0, 1]) {
            const point = await page.evaluate(`
              store.getState().select(null);
              const node=store.getState().nodes.find(n=>n.data.kind===${JSON.stringify(kind)});
              await flow.setViewport({x:250-node.position.x*${zoom},y:240-node.position.y*${zoom},zoom:${zoom}});
              await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
              const icon=document.querySelector('[data-testid="rf__node-'+node.id+'"] .dev-icon');
              const r=icon.getBoundingClientRect(),x=Math.round(r.x+r.width/2),y=Math.round(r.y+r.height/2);
              return {x,y,id:node.id,hit:document.elementFromPoint(x,y)?.closest('.react-flow__node')?.dataset.id,position:node.position};
            `);
            assert.equal(point.hit, point.id, `Artwork center must hit ${kind} at zoom ${zoom}, drift ${drift} (${point.x},${point.y})`);
            const {x,y}=point;
            await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',x,y});
            await page.evaluate('clickTrace.length=0;');
            await page.send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',buttons:1,clickCount:1});
            if(drift) await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:x+drift,y,buttons:1});
            await page.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:x+drift,y,button:'left',clickCount:1});
            const outcome = await page.evaluate(`return { selected:store.getState().selected,
              position:store.getState().nodes.find(n=>n.id===${JSON.stringify(point.id)}).position,trace:clickTrace };`);
            assert.deepEqual(outcome.position,point.position);
            if (outcome.selected !== point.id) issues.push({kind,zoom,drift,trace:outcome.trace});
          }
        }
      }
      assert.deepEqual(issues.map(({kind,zoom,drift,trace})=>({kind,zoom,drift,events:trace.map(entry=>entry[0])})),[]);
      const router = await page.evaluate(`
        store.getState().select(null);
        const node=store.getState().nodes.find(n=>n.data.kind==='router');
        await flow.setViewport({x:250-node.position.x,y:240-node.position.y,zoom:1});
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
        const r=document.querySelector('[data-testid="rf__node-'+node.id+'"] .dev-icon').getBoundingClientRect();
        return {id:node.id,position:node.position,x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};
      `);
      const {x,y}=router;
      await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',x,y});
      await page.send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',buttons:1,clickCount:1});
      for(let i=1;i<=6;i++) await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:x+i*5,y:y+i*20/6,buttons:1});
      await page.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:x+30,y:y+20,button:'left',clickCount:1});
      await delay(90);
      assert.notDeepEqual(await page.evaluate(`return store.getState().nodes.find(n=>n.id===${JSON.stringify(router.id)}).position;`),router.position);
      await page.evaluate(`
        store.getState().select(null);
        await flow.setViewport({x:0,y:0,zoom:1});
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      `);
      const modemId = await page.evaluate("return store.getState().nodes.find(n=>n.data.kind==='modem').id;");
      const routerNode = `[data-testid="rf__node-${router.id}"]`, modemNode = `[data-testid="rf__node-${modemId}"]`;
      await click(routerNode + ' .dev-icon');
      await page.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Control',code:'ControlLeft',modifiers:2,windowsVirtualKeyCode:17});
      const modemPoint = await page.evaluate(`const r=document.querySelector(${JSON.stringify(modemNode + ' .dev-icon')}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};`);
      for (const type of ['mousePressed','mouseReleased']) await page.send('Input.dispatchMouseEvent',{type,...modemPoint,button:'left',modifiers:2,clickCount:1});
      await page.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Control',code:'ControlLeft',windowsVirtualKeyCode:17});
      assert.deepEqual(await page.evaluate('return store.getState().nodes.filter(n=>n.selected).map(n=>n.data.kind).sort();'),['modem','router']);
      await page.evaluate('store.getState().select(null);store.getState().onNodesChange(store.getState().nodes.filter(n=>n.selected).map(n=>({type:"select",id:n.id,selected:false})));');
      await click(routerNode + ' [data-handleid="r"]');
      await click(modemNode + ' [data-handleid="l"]');
      await wait(`store.getState().edges.some(e=>e.source===${JSON.stringify(router.id)}&&e.target===${JSON.stringify(modemId)})`);
      await page.evaluate('store.getState().select(null);await flow.setViewport(browserInitialViewport);');
      await wait("!document.querySelector('.inspector')");
    });
    await test('canvas: device menus preserve the Inspector and browser launches without it', async () => {
      const escape = async () => {
        for (const type of ['keyDown','keyUp']) await page.send('Input.dispatchKeyEvent',{type,key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
        await wait("!document.querySelector('#device-context-menu')");
      };
      await nodeMenu(await page.evaluate('return pc.id;'));
      assert(await page.evaluate("return store.getState().selected===null&&!document.querySelector('.inspector');"));
      await click('#device-context-menu button','Browser öffnen');
      await wait("document.querySelector('#pc-browser-address')");
      assert(await page.evaluate("return store.getState().selected===null&&!document.querySelector('.inspector');"));
      await click('.pc-desktop-close');
      await page.evaluate('store.getState().select(pc.id);');
      for (const kind of ['host','router','modem','switch','server']) {
        await nodeMenu(await page.evaluate(`return ${kind==='host'?"linux.id":`store.getState().nodes.find(n=>n.data.kind===${JSON.stringify(kind)}).id`};`));
        assert(await page.evaluate("return store.getState().selected===pc.id&&!!document.querySelector('.inspector');"));
        await escape();
      }
      await nodeMenu(await page.evaluate('return linux.id;'),true);
      assert(await page.evaluate('return store.getState().selected===pc.id;'));
      await escape();
      await page.evaluate(`store.getState().deleteTopologyElements(store.getState().nodes.filter(n=>['router','modem'].includes(n.data.kind)).map(n=>n.id));
        window.beforeBrowser=JSON.stringify(store.getState().captureWorkspaceDocument());`);
    });
    await test('browser: Windows/Linux desktop launch shares UI and leaves terminals/configuration intact',async()=>{
      await click('.host-os-terminal button','Desktop');await wait("document.querySelector('.pc-desktop-home')");
      await wait("document.querySelector('.pc-desktop').getBoundingClientRect().width===420");
      assert.equal((await rect()).height,294);
      assert(await page.evaluate("return document.querySelector('.pc-desktop-header').textContent.includes('Windows');"));await shot('desktop-windows','graphite-dark',1440);
      await click('.pc-desktop-app');await wait("document.activeElement?.id==='pc-browser-address'");
      assert.equal(await page.evaluate('return store.getState().terminals.length;'),0);
      await navigate('http://server.lab');await wait("document.querySelector('.pc-browser-http-status')");
      assert(await page.evaluate("return !document.querySelector('.pc-browser-footer');"));
      assert.equal(await page.evaluate('return store.getState().paused;'),false);
      assert(await page.evaluate("return document.querySelector('.pc-browser-page').textContent.includes('Serviceportal');"));
      assert.equal(await page.evaluate('return JSON.stringify(store.getState().captureWorkspaceDocument());'),await page.evaluate('return beforeBrowser;'));
      await shot('browser-http-desktop','graphite-dark',1440);
    });
    await test('browser window: one header moves the frame; edges/corners/keyboard resize without requests, history or canvas changes',async()=>{
      const before=await browserState(),doc=await page.evaluate('return JSON.stringify(store.getState().captureWorkspaceDocument());');
      const viewport=await page.evaluate("return document.querySelector('.react-flow__viewport').getAttribute('style');");
      const start=await rect();await drag('.pc-desktop-header',90,55);const moved=await rect();
      assert.equal(moved.x,start.x+90);assert.equal(moved.y,start.y+55);assert.equal(moved.width,420);assert.equal(moved.height,294);
      assert.equal(await page.evaluate("return document.querySelectorAll('.pc-desktop header').length;"),1);
      await drag('.pc-desktop-header',-30,15);assert.equal((await rect()).x,moved.x-30);
      await drag('.resize-se',80,50);assert.equal((await rect()).width,500);assert.equal((await rect()).height,344);
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
    await test('browser tabs: one frame for all hosts, with a global limit and independent sessions',async()=>{
      const first=await browserState(),geometry=await rect();
      await page.evaluate('window.sharedBrowserFrame = document.querySelector(".pc-desktop");');
      const chooseHost = async id => {
        await wait('document.querySelector(".pc-browser-add-tab:not(:disabled)")');
        await click('.pc-browser-add-tab');
        await wait(`[...document.querySelectorAll('.pc-browser-host-choice option')].some(option => option.value === ${JSON.stringify(id)})`);
        await page.evaluate(`
          const picker=document.querySelector('.pc-browser-host-choice');
          picker.value=${JSON.stringify(id)};
          picker.dispatchEvent(new Event('change',{bubbles:true}));
        `);
      };
      const linuxId = await page.evaluate('return linux.id;');
      await chooseHost(linuxId);
      assert.equal(await page.evaluate('return document.querySelector(".pc-browser-navigation button").disabled;'),true);
      await navigate('http://server.lab');
      await wait("document.querySelector('.pc-browser-page')");
      await navigate('http://server.lab/missing.html');
      await wait("document.querySelector('.pc-browser-http-status')?.textContent.includes('404')");
      const second=await browserState();
      assert(await page.evaluate('return document.querySelector(".pc-browser-add-tab").disabled;'));
      await click('.pc-browser-tab:nth-child(1) button[aria-pressed]');
      assert.deepEqual(await browserState(),first);
      await click('.pc-browser-tab:nth-child(2) button[aria-pressed]');
      assert.deepEqual(await browserState(),second);
      const [third,fourth] = await page.evaluate(`
        const s=store.getState();
        s.addDeviceAt('notebook',{x:420,y:450});s.addDeviceAt('notebook',{x:620,y:450});
        return store.getState().nodes.filter(n=>n.data.kind==='notebook').map(n=>n.id);
      `);
      await chooseHost(third);
      assert(await page.evaluate('return document.querySelectorAll(".pc-browser-tab").length === 3 && document.querySelector(".pc-browser-add-tab").disabled;'));
      await page.evaluate(`(await import('/src/browser/desktopState.ts')).useDesktop.getState().openBrowser(sim.net.devices.get(${JSON.stringify(fourth)}));`);
      await wait("document.querySelector('.pc-browser-tab-limit')");
      await click('.pc-browser-tab:nth-child(3) button:last-child');
      await page.evaluate("const desktop = (await import('/src/browser/desktopState.ts')).useDesktop.getState();desktop.openBrowser(linux);");
      assert.deepEqual(await browserState(),second);
      await click('.pc-browser-desktop');
      await click('.pc-desktop-app');
      assert.deepEqual(await browserState(),second);
      assert(await page.evaluate('return document.querySelectorAll(".pc-desktop").length === 1 && document.querySelector(".pc-desktop") === window.sharedBrowserFrame;'));
      assert.deepEqual(await rect(),geometry);
      await click('.pc-browser-tab:nth-child(1) button[aria-pressed]');
      await click('.pc-browser-tab:nth-child(2) button:last-child');
      assert.deepEqual(await browserState(),first);
      assert.equal(await page.evaluate('return document.querySelectorAll(".pc-browser-tab").length;'),1);
      await page.evaluate(`store.getState().deleteTopologyElements(${JSON.stringify([third,fourth])});`);
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
      assert.equal(await page.evaluate("return document.querySelectorAll('.pc-desktop:not([hidden])').length;"),1);
      assert.equal(await page.evaluate("return document.querySelectorAll('.pc-desktop-home').length;"),0);
      assert(await page.evaluate("return ![...document.querySelectorAll('.device-actions button')].some(e=>/Browser|Desktop/.test(e.textContent+' '+e.getAttribute('aria-label')));"));
      await click('.pc-desktop-close');await wait("!document.querySelector('.pc-desktop:not([hidden])')");
      await nodeMenu(id,true);await page.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await page.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await wait("!document.querySelector('#device-context-menu')");
      await nodeMenu(id);await click('#device-context-menu button','Browser öffnen');await wait("document.querySelector('#pc-browser-address')");
      assert.equal(await page.evaluate("return document.querySelectorAll('.pc-desktop-home').length;"),0);
      assert.deepEqual(await rect(),geometry);assert.deepEqual(await browserState(),before);
    });
    await test('browser: Linux reuses the same desktop, mobile/Light fits and device deletion closes stale window',async()=>{
      await click('.pc-desktop-close');await page.evaluate('store.getState().select(linux.id);');await delay(100);await nodeMenu(await page.evaluate('return linux.id;'));await click('#device-context-menu button','Browser öffnen');await wait("document.querySelector('#pc-browser-address')");
      assert.equal(await page.evaluate('return document.querySelectorAll(".pc-desktop:not([hidden])").length;'),1);
      await click('.pc-browser-desktop');await wait("document.querySelector('.pc-desktop-home')");
      assert(await page.evaluate("return document.querySelector('.pc-desktop-header').textContent.includes('Linux');"));
      await click('.pc-desktop-app');await wait("document.querySelector('#pc-browser-address')");
      await page.evaluate("theme.getState().setTheme('classic-light');server.httpServer.body=safeBody;");
      await page.send('Emulation.setDeviceMetricsOverride',{width:700,height:960,deviceScaleFactor:1,mobile:false});await delay(150);
      await navigate('http://server.lab');await wait("document.querySelector('.pc-browser-page')?.textContent.includes('Serviceportal')");await shot('browser-http-700','classic-light',700);
      await wait("store.getState().packetCapture.records.some(record => record.fromDeviceId === linux.id && record.frame.payload.kind === 'ipv4' && record.frame.payload.l4.app?.kind === 'http-request')");
      await page.send('Emulation.setDeviceMetricsOverride',{width:390,height:960,deviceScaleFactor:1,mobile:true});await delay(150);
      const layout=await page.evaluate("const e=document.querySelector('.pc-desktop:not([hidden])'),r=e.getBoundingClientRect();return {scroll:e.scrollWidth,client:e.clientWidth,left:r.x,right:r.right,viewport:innerWidth,document:document.documentElement.scrollWidth};");
      await shot('browser-http-mobile','classic-light',390);
      assert(layout.scroll<=layout.client+1&&layout.left>=0&&layout.right<=layout.viewport+1&&layout.document<=layout.viewport+1,JSON.stringify(layout));
      const before=await browserState(),start=await rect();await page.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
      const touch=await page.evaluate("const r=document.querySelector('.pc-desktop-header').getBoundingClientRect();return{x:r.x+30,y:r.y+15,id:1};");
      await page.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touch]});await page.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...touch,y:touch.y-35}]});await page.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await delay(100);
      assert((await rect()).y<start.y);assert.deepEqual(await browserState(),before);
      await page.send('Emulation.setTouchEmulationEnabled',{enabled:false});
      await language('pt-BR');await navigate('http://unknown.lab');await failure('ERR_NAME_NOT_RESOLVED');
      assert(await page.evaluate("const e=document.querySelector('.pc-browser-document');return e.scrollWidth<=e.clientWidth+1&&document.documentElement.scrollWidth<=innerWidth+1;"));await shot('browser-error-mobile','classic-light',390);
      await page.evaluate('store.getState().deleteDevice(linux.id);');await wait("!document.querySelector('.pc-desktop:not([hidden])')");
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
