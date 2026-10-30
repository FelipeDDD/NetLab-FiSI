import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { generateReview } from './visual-review.mjs';
import { runE02Review } from './e02-review.mjs';

export async function runPracticeReview({page,url,root,report}) {
  const database='netlab-idb-test-'+randomUUID(), directory=path.join(root,'.playwright-mcp/reviews/raw/practice-e02-v2-staging');
  await mkdir(directory,{recursive:true});
  const screenshots=[],results={},delay=ms=>new Promise(r=>setTimeout(r,ms));
  const wait=async expression=>{for(let i=0;i<180;i++){if(await page.evaluate('return !!('+expression+');'))return;await delay(50);}throw Error('Timed out: '+expression);};
  const click=async(selector,text)=>{
    const p=await page.evaluate(`const es=[...document.querySelectorAll(${JSON.stringify(selector)})];const e=${text?`es.find(e=>e.textContent.trim()===${JSON.stringify(text)})`:'es[0]'};if(!e)throw Error('Missing control');e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};`);
    await page.send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1});
    await page.send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1});await delay(80);
  };
  const choose=async(selector,value)=>{if(selector==='#practice-local')return click(`#practice-local label:has(input[value="${value}"])`);await page.evaluate(`const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}));`);await delay(80);};
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
      assert.equal(await page.evaluate("return (await import('/src/exercises/practice/session.ts')).usePractice.getState().question.recipe.version;"),2);
      // Re-run the existing v1 UX regression flow through the explicit compatibility selector.
      await click('.practice-config-toggle');await choose('.practice-version','1');
      await type('.practice-seed input','reference');await click('.practice-seed button','Diese Seed öffnen');await click('.practice-config-toggle');
      assert.equal(await page.evaluate("return document.querySelector('.practice-config-toggle').getAttribute('aria-expanded');"),'false');
      assert.equal(await page.evaluate("return document.querySelector('.practice-config-fields').hidden;"),true);
      assert.equal(await page.evaluate("return document.querySelectorAll('.practice-next').length;"),0);
      assert.equal(await page.evaluate("return [...document.querySelectorAll('.practice-actions button')].some(e=>e.textContent==='Lösung anzeigen');"),false);
      assert(await page.evaluate("return document.querySelector('.practice-data').textContent.includes('192.168.99.60/16');"));
      await click('.practice-actions button','Antwort prüfen');assert(await page.evaluate("return !!document.querySelector('[data-result=missing]');"));
      await choose('#practice-local','unknown');await click('.practice-actions button','Antwort prüfen');assert(await page.evaluate("return !!document.querySelector('[data-result=incorrect]');"));
      assert(await page.evaluate("return document.querySelector('.practice-feedback').textContent.includes('Gateway gehört rechnerisch');"));
      assert(await page.evaluate("return !!document.querySelector('.practice-next');"));
      await choose('#practice-local','yes');await click('.practice-actions button','Antwort prüfen');assert(await page.evaluate("return !!document.querySelector('[data-result=correct]');"));
      assert.equal(await page.evaluate("return document.querySelectorAll('#practice-local input:checked').length;"),1);
      assert(await page.evaluate("const rows=[...document.querySelectorAll('.practice-data dd')].map(e=>e.getBoundingClientRect().left);return rows.length===2&&Math.abs(rows[0]-rows[1])<1;"));
      await shot('01-gateway-dark','graphite-dark',1440);
      await click('#practice-local label:has(input[value="yes"])');
      await page.send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});await page.send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});await delay(60);
      assert.equal(await page.evaluate("return document.querySelector('#practice-local input:checked').value;"),'no');
      await page.send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowLeft',code:'ArrowLeft',windowsVirtualKeyCode:37});await page.send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowLeft',code:'ArrowLeft',windowsVirtualKeyCode:37});await delay(60);
      assert.equal(await page.evaluate("return document.querySelector('#practice-local input:checked').value;"),'yes');
      await click('.practice-actions button','Antwort prüfen');
    });
    await test('practice: language changes, close and navigation preserve answers',async()=>{
      await click('.practice-config-toggle');
      const saved=await page.evaluate("return JSON.stringify((await import('/src/exercises/practice/session.ts')).usePractice.getState().attempts);");
      await click('.practice-config-toggle');
      await page.evaluate("document.querySelector('.practice-config-toggle').focus();");
      await page.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r'});await page.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});await delay(60);
      assert.equal(await page.evaluate("return document.querySelector('.practice-config-toggle').getAttribute('aria-expanded');"),'true');
      assert.equal(await page.evaluate("return JSON.stringify((await import('/src/exercises/practice/session.ts')).usePractice.getState().attempts);"),saved);
      for(const [language,names] of [['en',['Yes','No','Not enough information']],['pt-BR',['Sim','Não','Informações insuficientes']],['de',['Ja','Nein','Nicht eindeutig bestimmbar']]]){
        await choose('.practice-panel .language-selector select',language);assert.equal(await page.evaluate("return (document.querySelector('#practice-local input:checked')?.value??'');"),'yes');
        assert.deepEqual(await page.evaluate("return [...document.querySelectorAll('#practice-local label span')].map(e=>e.textContent);"),names);
      }
      await choose('.practice-controls select','subnet');assert.equal(await page.evaluate("return document.querySelectorAll('.practice-field').length;"),3);
      await type('#practice-network','10.1.2.3');
      await choose('.practice-controls select','gateway');assert.equal(await page.evaluate("return (document.querySelector('#practice-local input:checked')?.value??'');"),'yes');
      await click('.practice-close');await open();assert.equal(await page.evaluate("return (document.querySelector('#practice-local input:checked')?.value??'');"),'yes');
    });
    await test('practice: solution display is separate; another seed is reproducible',async()=>{
      await click('.practice-config-toggle');await choose('.practice-controls select','subnet');
      await click('.practice-actions button','Lösung anzeigen');assert(await page.evaluate("return document.querySelector('.practice-solution').textContent.includes('unterstützter Versuch');"));
      await click('.practice-seed button','Andere Variante');
      await wait("!document.querySelector('.practice-solution')");
      const data=await page.evaluate("return document.querySelector('.practice-data').textContent;"), seed=await page.evaluate("return document.querySelector('.practice-seed input').value;");
      assert.match(seed,/^[a-f0-9]{8}$/);
      await choose('.practice-controls select','gateway');await choose('.practice-controls select','subnet');await type('.practice-seed input',seed);await click('.practice-seed button','Diese Seed öffnen');
      assert.equal(await page.evaluate("return document.querySelector('.practice-data').textContent;"),data);
      assert.equal(await page.evaluate("return JSON.stringify(store.getState().captureWorkspaceDocument())===beforeTopology&&JSON.stringify(await ws.repository.getMeta('exercises:beta:v1'))===beforeProgress;"),true);
    });
    await test('practice: next question after failure keeps category/difficulty, changes content and clears only the previous attempt',async()=>{
      await choose('.practice-controls select','gateway');
      await choose('.practice-controls label:nth-child(2) select','intermediate');
      await click('.practice-config-toggle');
      for(let i=0;i<3;i++) {
        await choose('#practice-local','unknown');await click('.practice-actions button','Antwort prüfen');
        assert(await page.evaluate("return !!document.querySelector('[data-result=incorrect]');"));
        const before=await page.evaluate("const s=(await import('/src/exercises/practice/session.ts')).usePractice.getState();return {id:s.question.id,problem:JSON.stringify(s.question.problem),others:JSON.stringify(Object.fromEntries(Object.entries(s.attempts).filter(([id])=>id!==s.question.id)))};");
        await click('.practice-next');
        const after=await page.evaluate("const s=(await import('/src/exercises/practice/session.ts')).usePractice.getState();return {id:s.question.id,problem:JSON.stringify(s.question.problem),previousIds:Object.keys(s.attempts),others:JSON.stringify(Object.fromEntries(Object.entries(s.attempts).filter(([id])=>id!==s.question.id))),attempt:s.attempts[s.question.id],category:s.question.kind,difficulty:s.question.recipe.difficulty,reproduced:JSON.stringify((await import('/src/exercises/practice/model.ts')).createQuestion(s.question.kind,s.question.recipe.seed,s.question.recipe.difficulty,s.question.recipe.version).problem)};");
        assert.notEqual(after.id,before.id);assert.notEqual(after.problem,before.problem);assert.equal(after.problem,after.reproduced);
        assert(await page.evaluate("return /^[a-f0-9]{8}$/.test((await import('/src/exercises/practice/session.ts')).usePractice.getState().question.recipe.seed);"));
        assert.equal(after.category,'gateway');assert.equal(after.difficulty,'intermediate');assert.equal(after.others,before.others);assert(!after.previousIds.includes(before.id));
        assert.deepEqual(after.attempt,{answers:{},revealed:false});assert.equal(await page.evaluate("return !!document.querySelector('.practice-next');"),false);
      }
    });
    await test('practice: side/center preserves viewport and answers; expanded settings and incorrect feedback remain accessible',async()=>{
      await choose('#practice-local','unknown');await click('.practice-actions button','Antwort prüfen');
      const before=await page.evaluate("return {viewport:document.querySelector('.react-flow__viewport').style.transform,document:JSON.stringify(store.getState().captureWorkspaceDocument()),answer:(document.querySelector('#practice-local input:checked')?.value??'')};");
      await click('.practice-position');assert.equal(await page.evaluate("return document.querySelector('.practice-position').getAttribute('aria-pressed');"),'true');
      assert(await page.evaluate("const p=document.querySelector('.practice-panel').getBoundingClientRect(),c=document.querySelector('.canvas').getBoundingClientRect();return Math.abs((p.left+p.right)/2-(c.left+c.right)/2)<2;"));
      await shot('04-gateway-centered','graphite-dark',1440);
      await click('.practice-position');assert.equal(await page.evaluate("return document.querySelector('.practice-position').getAttribute('aria-pressed');"),'false');
      assert.deepEqual(await page.evaluate("return {viewport:document.querySelector('.react-flow__viewport').style.transform,document:JSON.stringify(store.getState().captureWorkspaceDocument()),answer:(document.querySelector('#practice-local input:checked')?.value??'')};"),before);
      assert(await page.evaluate("const f=document.querySelector('.practice-footer').getBoundingClientRect(),p=document.querySelector('.practice-panel').getBoundingClientRect();return Math.abs(f.bottom-p.bottom)<2;"));
      await click('.practice-config-toggle');await shot('05-settings-expanded','graphite-dark',1440);
    });
    await test('practice: Classic Light at 700 and mobile at 390 have internal scroll and no document overflow',async()=>{
      await page.send('Emulation.setDeviceMetricsOverride',{width:700,height:960,deviceScaleFactor:1,mobile:false});await page.evaluate("theme.getState().setTheme('classic-light');");
      await choose('.practice-controls select','subnet');await type('.practice-seed input','reference');await click('.practice-seed button','Diese Seed öffnen');await click('.practice-config-toggle');await click('.practice-actions button','Antwort prüfen');
      assert(await page.evaluate('return document.documentElement.scrollWidth<=innerWidth+1;'));await shot('02-subnet-light-700','classic-light',700);
      await click('.practice-config-toggle');await choose('.practice-controls select','vlsm');await click('.practice-config-toggle');await click('.practice-actions button','Lösung anzeigen');
      assert.equal(await page.evaluate("return document.querySelectorAll('.practice-field').length;"),4);
      await page.send('Emulation.setDeviceMetricsOverride',{width:390,height:960,deviceScaleFactor:1,mobile:true});await delay(120);
      assert(await page.evaluate('return document.documentElement.scrollWidth<=innerWidth+1;'));
      assert(await page.evaluate("const p=document.querySelector('.practice-panel');return p.scrollWidth<=p.clientWidth+1;"));await shot('03-vlsm-mobile','classic-light',390);
    });
    await test('practice: three horizontal choices fit narrow windows in Dark/Light; native keyboard selection remains exclusive',async()=>{
      await click('.practice-config-toggle');await choose('.practice-controls select','gateway');await click('.practice-config-toggle');
      for(const theme of ['graphite-dark','classic-light'])for(const width of [390,700]) {
        await page.send('Emulation.setDeviceMetricsOverride',{width,height:960,deviceScaleFactor:1,mobile:width===390});await page.evaluate(`window.theme.getState().setTheme(${JSON.stringify(theme)});`);await delay(60);
        await choose('#practice-local','yes');
        assert(await page.evaluate("const rs=[...document.querySelectorAll('.practice-choice-options label')].map(e=>e.getBoundingClientRect());return rs.length===3&&rs.every(r=>Math.abs(r.top-rs[0].top)<1)&&rs[2].right<=innerWidth&&document.documentElement.scrollWidth<=innerWidth+1;"));
        assert.equal(await page.evaluate("return document.querySelectorAll('#practice-local input:checked').length;"),1);
        if(theme==='classic-light'&&width===390)await shot('06-choice-light-390','classic-light',390);
      }
    });
    await runE02Review({page,test,click,choose,type,shot,delay});
    await test('shortcut: physical DE/EN/PT-BR key, repeat/composition/modifier and editable focus guards',async()=>{
      await page.send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});
      await click('.practice-config-toggle');
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
        const question=await page.evaluate("return (await import('/src/exercises/practice/session.ts')).usePractice.getState().question.id;");
        await page.send('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32,text:' '});
        await page.send('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});
        assert.equal(await page.evaluate("return (await import('/src/exercises/practice/session.ts')).usePractice.getState().question.id;"),question);
      }
      assert(await page.evaluate("return document.querySelector('.practice-seed input').value.includes(\"'^`\");"));
      await page.evaluate("store.getState().closeTerminal('shortcut-pc');");
    });
    await test('practice: F5 clears visit-only answers without writing mathematical progress',async()=>{
      await page.evaluate('ws.dispose();');await mount();await open();
      assert.equal(await page.evaluate("return (document.querySelector('#practice-local input:checked')?.value??'');"),'');
      assert.equal(await page.evaluate("const r=await ws.repository.getMeta('exercises:beta:v1');return r.value;"),null);
    });
  } finally {
    await page.evaluate('window.ws?.dispose();');
    await page.evaluate(`await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase(${JSON.stringify(database)});r.onsuccess=resolve;r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Practice cleanup blocked'));});`);
    Object.assign(report.results,results);await writeFile(path.join(directory,'results.json'),JSON.stringify(results,null,2));
    if(screenshots.length&&Object.values(results).every(r=>r.passed)) {
      const manifest=path.join(directory,'manifest.json');
      await writeFile(manifest,JSON.stringify({id:'practice-e02-v2',title:'Rechenpraxis · E02 v2, IPv4 und Leertaste',variants:[{id:'graphite-dark',label:'Graphite Dark'},{id:'classic-light',label:'Classic Light'}],states:['normal'],captures:screenshots,share:screenshots.filter(c=>c.scene.startsWith('v2-')).map(c=>({...c,name:c.scene})),shareContactSheet:false}));
      report.practiceReview=await generateReview(manifest);
    }
  }
}
