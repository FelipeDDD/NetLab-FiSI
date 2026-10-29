import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { generateReview } from './visual-review.mjs';

export async function runPracticeReview({page,url,root,report}) {
  const database='netlab-idb-test-'+randomUUID(), directory=path.join(root,'.playwright-mcp/reviews/raw/practice-beta-staging');
  await mkdir(directory,{recursive:true});
  const screenshots=[],results={},delay=ms=>new Promise(r=>setTimeout(r,ms));
  const wait=async expression=>{for(let i=0;i<180;i++){if(await page.evaluate('return !!('+expression+');'))return;await delay(50);}throw Error('Timed out: '+expression);};
  const click=async(selector,text)=>{
    const p=await page.evaluate(`const es=[...document.querySelectorAll(${JSON.stringify(selector)})];const e=${text?`es.find(e=>e.textContent.trim()===${JSON.stringify(text)})`:'es[0]'};if(!e)throw Error('Missing control');e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};`);
    await page.send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1});
    await page.send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1});await delay(80);
  };
  const choose=async(selector,value)=>{await page.evaluate(`const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}));`);await delay(80);};
  const type=async(selector,text)=>{await click(selector);await page.send('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',modifiers:2,windowsVirtualKeyCode:65});await page.send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',modifiers:2,windowsVirtualKeyCode:65});await page.send('Input.insertText',{text});await delay(60);};
  const shot=async(name,variant,width)=>{
    await page.evaluate("document.querySelector('.practice-body').scrollTop=0;");await delay(100);
    const png=await page.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    await writeFile(path.join(directory,name+'.png'),Buffer.from(png.data,'base64'));
    screenshots.push({source:path.relative(root,path.join(directory,name+'.png')).split(path.sep).join('/'),scene:name,variant,state:'normal',width,height:960});
  };
  const test=async(name,fn)=>{try{await fn();results[name]={passed:true};}catch(e){results[name]={passed:false,error:e.stack};throw e;}};
  const open=async()=>{
    if(await page.evaluate('return innerWidth<1100;'))await click('.toolbar-menu-trigger','Menü ▾');
    await click('.toolbar-menu-trigger,.toolbar-menu-action','Übungen (Beta)');
    await click('#toolbar-exercises-menu button','Subnetting & CIDR üben');
    await wait("document.querySelector('#practice-local')");
  };
  const mount=async()=>{
    await page.send('Page.navigate',{url});await wait("document.readyState==='complete'&&location.pathname==='/__workspace_ui_test__'");
    await page.evaluate(`window.entry=await import('/src/workspace/reviewEntry.tsx');window.store=(await import('/src/store.ts')).useStore;window.sim=(await import('/src/sim.ts')).sim;window.ws=await entry.mountWorkspaceReview(document.getElementById('root'),{databaseName:${JSON.stringify(database)}});window.lang=(await import('/src/i18n/index.ts')).useLanguage;lang.getState().setLanguage('de');window.theme=(await import('/src/uiTheme.ts')).useUiTheme;`);
    await wait("document.querySelector('.react-flow')");
  };
  try {
    await page.send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});await mount();
    await page.evaluate("theme.getState().setTheme('graphite-dark');window.beforeTopology=JSON.stringify(store.getState().captureWorkspaceDocument());window.beforeProgress=JSON.stringify(await ws.repository.getMeta('exercises:beta:v1'));");
    await test('practice: selective menu and E02 single-field correction',async()=>{
      await open();assert.equal(await page.evaluate("return document.querySelectorAll('.practice-field').length;"),1);
      assert(await page.evaluate("return document.querySelector('.practice-data').textContent.includes('192.168.99.60/16');"));
      await click('.practice-actions button','Antwort prüfen');assert(await page.evaluate("return !!document.querySelector('[data-result=missing]');"));
      await choose('#practice-local','unknown');await click('.practice-actions button','Antwort prüfen');assert(await page.evaluate("return !!document.querySelector('[data-result=incorrect]');"));
      await choose('#practice-local','yes');await click('.practice-actions button','Antwort prüfen');assert(await page.evaluate("return !!document.querySelector('[data-result=correct]');"));
      await shot('01-gateway-dark','graphite-dark',1440);
    });
    await test('practice: language changes, close and navigation preserve answers',async()=>{
      for(const language of ['en','pt-BR','de']){await choose('.practice-panel .language-selector select',language);assert.equal(await page.evaluate("return document.querySelector('#practice-local').value;"),'yes');}
      await choose('.practice-controls select','subnet');assert.equal(await page.evaluate("return document.querySelectorAll('.practice-field').length;"),3);
      await type('#practice-network','10.1.2.3');
      await choose('.practice-controls select','gateway');assert.equal(await page.evaluate("return document.querySelector('#practice-local').value;"),'yes');
      await click('.practice-panel header button');await open();assert.equal(await page.evaluate("return document.querySelector('#practice-local').value;"),'yes');
    });
    await test('practice: solution display is separate; another seed is reproducible',async()=>{
      await click('.practice-actions button','Lösung anzeigen');assert(await page.evaluate("return document.querySelector('.practice-solution').textContent.includes('unterstützter Versuch');"));
      await click('.practice-seed button','Andere Variante');
      await wait("!document.querySelector('.practice-solution')");
      const data=await page.evaluate("return document.querySelector('.practice-data').textContent;"), seed=await page.evaluate("return document.querySelector('.practice-seed input').value;");
      await choose('.practice-controls select','subnet');await choose('.practice-controls select','gateway');await type('.practice-seed input',seed);await click('.practice-seed button','Diese Seed öffnen');
      assert.equal(await page.evaluate("return document.querySelector('.practice-data').textContent;"),data);
      assert.equal(await page.evaluate("return JSON.stringify(store.getState().captureWorkspaceDocument())===beforeTopology&&JSON.stringify(await ws.repository.getMeta('exercises:beta:v1'))===beforeProgress;"),true);
    });
    await test('practice: Classic Light at 700 and mobile at 390 have internal scroll and no document overflow',async()=>{
      await page.send('Emulation.setDeviceMetricsOverride',{width:700,height:960,deviceScaleFactor:1,mobile:false});await page.evaluate("theme.getState().setTheme('classic-light');");
      await choose('.practice-controls select','subnet');await click('.practice-actions button','Antwort prüfen');
      assert(await page.evaluate('return document.documentElement.scrollWidth<=innerWidth+1;'));await shot('02-subnet-light-700','classic-light',700);
      await choose('.practice-controls select','vlsm');await click('.practice-actions button','Lösung anzeigen');
      assert.equal(await page.evaluate("return document.querySelectorAll('.practice-field').length;"),4);
      await page.send('Emulation.setDeviceMetricsOverride',{width:390,height:960,deviceScaleFactor:1,mobile:true});await delay(120);
      assert(await page.evaluate('return document.documentElement.scrollWidth<=innerWidth+1;'));
      assert(await page.evaluate("const p=document.querySelector('.practice-panel');return p.scrollWidth<=p.clientWidth+1;"));await shot('03-vlsm-mobile','classic-light',390);
    });
    await test('shortcut: physical DE/EN/PT-BR key, repeat/composition/modifier and editable focus guards',async()=>{
      await page.send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});
      // Test-only fixture; all changes stay in this disposable document/database.
      await page.evaluate("const {createDevice}=await import('/src/engine/factory.ts');createDevice(sim.net,'host',{id:'shortcut-pc',name:'PC'});store.getState().refresh();store.getState().openTerminal('shortcut-pc');");await wait("document.querySelector('.xterm-helper-textarea')");
      const send=async(key,extra={})=>page.evaluate(`const e=new KeyboardEvent('keydown',{key:${JSON.stringify(key)},code:'Backquote',bubbles:true,cancelable:true,...${JSON.stringify(extra)}});document.activeElement.dispatchEvent(e);return e.defaultPrevented;`);
      for(const key of ["'",'`','^','Dead']) {
        await page.evaluate("store.getState().setTerminalDockCollapsed(false);document.querySelector('.canvas').focus();");await delay(30);
        assert.equal(await send(key),true);assert.equal(await page.evaluate('return store.getState().terminalDockCollapsed;'),true);
        await page.evaluate("document.querySelector('.canvas').focus();");assert.equal(await send(key),true);await delay(30);
        assert.equal(await page.evaluate('return store.getState().terminalDockCollapsed;'),false);
      }
      for(const extra of [{repeat:true},{ctrlKey:true},{altKey:true},{shiftKey:true},{metaKey:true},{isComposing:true},{code:'Quote'}]) {
        await page.evaluate("document.querySelector('.canvas').focus();");assert.equal(await send('Dead',extra),false);assert.equal(await page.evaluate('return store.getState().terminalDockCollapsed;'),false);
      }
      for(const selector of ['.practice-seed input','.xterm-helper-textarea']) {
        await page.evaluate(`document.querySelector(${JSON.stringify(selector)}).focus();`);assert.equal(await send('Dead'),false);assert.equal(await page.evaluate('return store.getState().terminalDockCollapsed;'),false);
        await page.send('Input.insertText',{text:"'^`"});
      }
      assert(await page.evaluate("return document.querySelector('.practice-seed input').value.includes(\"'^`\");"));
      await page.evaluate("store.getState().closeTerminal('shortcut-pc');");
    });
    await test('practice: F5 clears visit-only answers without writing mathematical progress',async()=>{
      await page.evaluate('ws.dispose();');await mount();await open();
      assert.equal(await page.evaluate("return document.querySelector('#practice-local').value;"),'');
      assert.equal(await page.evaluate("const r=await ws.repository.getMeta('exercises:beta:v1');return r.value;"),null);
    });
  } finally {
    await page.evaluate('window.ws?.dispose();');
    await page.evaluate(`await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase(${JSON.stringify(database)});r.onsuccess=resolve;r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Practice cleanup blocked'));});`);
    Object.assign(report.results,results);await writeFile(path.join(directory,'results.json'),JSON.stringify(results,null,2));
    if(screenshots.length&&Object.values(results).every(r=>r.passed)) {
      const manifest=path.join(directory,'manifest.json');
      await writeFile(manifest,JSON.stringify({id:'practice-beta',title:'Rechenpraxis Beta',variants:[{id:'graphite-dark',label:'Graphite Dark'},{id:'classic-light',label:'Classic Light'}],states:['normal'],captures:screenshots,share:screenshots.map(c=>({...c,name:c.scene})),shareContactSheet:false}));
      report.practiceReview=await generateReview(manifest);
    }
  }
}
