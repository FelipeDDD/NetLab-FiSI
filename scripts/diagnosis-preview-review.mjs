import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {generateReview} from './visual-review.mjs';

export async function runDiagnosisPreviewReview({page,url,root,report}) {
  const directory=path.join(root,'.playwright-mcp/reviews/raw/diagnosis-preview-staging');await mkdir(directory,{recursive:true});
  const captures=[],delay=ms=>new Promise(r=>setTimeout(r,ms));
  const test=async(name,fn)=>{try{await fn();report.results['diagnosis preview: '+name]={passed:true};}catch(e){report.results['diagnosis preview: '+name]={passed:false,error:e.stack};throw e;}};
  const wait=async()=>{for(let i=0;i<150;i++){try{if(await page.evaluate("return !!document.querySelector('#diagnosis-archetype');"))return;}catch{}await delay(50);}throw Error('Preview did not mount');};
  const click=async selector=>{
    const p=await page.evaluate(`const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing '+${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};`);
    await page.send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1});await page.send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1});await delay(60);
  };
  const choose=async(selector,value)=>{await page.evaluate(`const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}));`);await delay(70);};
  const seed=async value=>{
    await click('#diagnosis-seed');await page.send('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',modifiers:2,windowsVirtualKeyCode:65});await page.send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',modifiers:2,windowsVirtualKeyCode:65});await page.send('Input.insertText',{text:value});await click('.practice-seed button[type=submit]');
  };
  const answer=async(q,value)=>click(`#diagnosis-${q.id} label:has(input[value="${value}"])`);
  const shot=async(name,variant,width)=>{
    await page.evaluate("document.querySelector('.practice-body').scrollTop=0;");await delay(80);
    const png=await page.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});const file=path.join(directory,name+'.png');await writeFile(file,Buffer.from(png.data,'base64'));
    captures.push({source:path.relative(root,file).split(path.sep).join('/'),scene:name,variant,state:'normal',width,height:960});
  };
  const storage=()=>page.evaluate('return {local:{...localStorage},session:{...sessionStorage},databases:await indexedDB.databases()};');
  const before=await storage();
  await page.send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});await page.send('Page.navigate',{url});await wait();
  await choose('#diagnosis-language','de');
  assert.equal(await page.evaluate("return document.querySelector('#diagnosis-version').value;"),'3');
  assert.equal(await page.evaluate("return document.querySelector('#diagnosis-mask-input').value;"),'255.255.');
  const samples=await page.evaluate("const {generateDiagnosis}=await import('/src/exercises/diagnosis/generator.ts');const out={};for(const archetype of ['ND02','ND05'])for(let i=0;i<300;i++){const g=generateDiagnosis({version:1,archetype,difficulty:'advanced',seed:'preview-review-'+i});out[g.recipe.recipe]??=g;}return Object.values(out);");
  await test('all 12 eligible recipes retain premises and hide solutions until all related answers are submitted',async()=>{
    assert.equal(samples.length,12);
    for(const g of samples) {
      await choose('#diagnosis-archetype',g.recipe.archetype);if(g.recipe.archetype==='ND02')await choose('#diagnosis-version','1');await choose('#diagnosis-difficulty','advanced');await seed(g.recipe.seed);
      assert.equal(await page.evaluate("return document.querySelectorAll('.practice-field').length;"),g.case.questions.length);
      assert.deepEqual(await page.evaluate("return [...document.querySelectorAll('.diagnosis-evidence p')].map(p=>p.textContent);"),g.data.kind==='address'?[`PC: ${g.data.pc}/${g.data.prefix}`,`Gateway: ${g.data.candidate}`]:g.case.evidence.map(e=>e.text));
      if(g.data.kind==='address') {
        assert.equal(await page.evaluate("return document.querySelector('.practice-question h3').textContent;"),'Gateway und Subnetz');
        assert.equal(await page.evaluate("return document.querySelector('.practice-choice legend u').textContent;"),'numerisch');
        assert(!await page.evaluate("return /Prüfen Sie einen Eintrag|Bewertet wird nur/.test(document.querySelector('.practice-body').textContent);"));
        if(g.recipe.recipe==='nd02-zero-host') {
          await click('.practice-config-toggle');
          await shot('nd02-quick-desktop','graphite-dark',1440);
          await page.send('Emulation.setDeviceMetricsOverride',{width:390,height:960,deviceScaleFactor:1,mobile:true});await delay(100);
          assert(await page.evaluate('return document.documentElement.scrollWidth<=innerWidth+1;'));
          await shot('nd02-quick-mobile','graphite-dark',390);
          await page.send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});await click('.practice-config-toggle');
        }
      }
      assert(!await page.evaluate("return document.querySelector('.practice-body').textContent.includes('Hypothetisches Beispiel')||!!document.querySelector('.diagnosis-recipe');"));
      for(const q of g.case.questions) {
        const options=await page.evaluate(`return [...document.querySelectorAll('#diagnosis-${q.id} input')].map(e=>e.value);`);
        assert.deepEqual(options,['reachability','cause'].includes(q.concept)?['yes','no','unknown']:['yes','no']);
      }
      await answer(g.case.questions[0],g.case.questions[0].answer);await click('.diagnosis-check');
      assert.equal(await page.evaluate("return document.querySelectorAll('.practice-next,.diagnosis-recipe,[data-choice-result]').length;"),0);
      assert(!await page.evaluate("return document.querySelector('.practice-body').textContent.includes('Hypothetisches Beispiel');"));
      await answer(g.case.questions[1],g.case.questions[1].answer);await click('.diagnosis-check');
      assert.equal(await page.evaluate("return document.querySelectorAll('[data-result=correct]').length;"),2);
      const feedback=await page.evaluate("return document.querySelector('.practice-body').textContent;");
      for(const q of g.case.questions){assert(feedback.includes(q.explanation.reasoning));if(q.explanation.alternatives){assert(feedback.includes(q.explanation.alternatives.yes));assert(feedback.includes(q.explanation.alternatives.no));}}
      assert.deepEqual(await page.evaluate("return JSON.parse(document.querySelector('.diagnosis-recipe code').textContent);"),g.recipe);
      if(g.recipe.recipe==='nd02-zero-host')await shot('01-nd02-checked','graphite-dark',1440);
      // One edit invalidates the entire joint disclosure, including the other question.
      await answer(g.case.questions[0],g.case.questions[0].answer==='yes'?'no':'yes');
      assert.equal(await page.evaluate("return document.querySelectorAll('.practice-feedback,.practice-next,.diagnosis-recipe').length;"),0);
      await click('.diagnosis-check');assert.equal(await page.evaluate("return document.querySelectorAll('[data-result=incorrect]').length;"),1);
    }
  });
  await test('ND02 v2 compares with v1, preserves seeds/version and jointly grades three questions before showing one calculation',async()=>{
    await choose('#diagnosis-archetype','ND02');await choose('#diagnosis-version','2');await choose('#diagnosis-difficulty','intermediate');await seed('nd02-v2-review-31');
    const g=await page.evaluate("const {generateBoundariesV2}=await import('/src/exercises/diagnosis/boundariesV2.ts');return generateBoundariesV2({version:2,archetype:'ND02',difficulty:'intermediate',seed:'nd02-v2-review-31'});");
    assert.equal(await page.evaluate("return document.querySelectorAll('.practice-field').length;"),3);
    assert.equal(await page.evaluate("return document.querySelectorAll('[aria-label=Rechenweg]').length;"),0);
    await click('.practice-config-toggle');await shot('nd02-v2-desktop','graphite-dark',1440);await click('.practice-config-toggle');
    for(const q of g.case.questions.slice(0,2))await answer(q,q.answer);
    await click('.diagnosis-check');assert.equal(await page.evaluate("return document.querySelectorAll('[data-choice-result],.practice-next,[aria-label=Rechenweg]').length;"),0);
    await answer(g.case.questions[2],g.case.questions[2].answer);await click('.diagnosis-check');
    assert.equal(await page.evaluate("return document.querySelectorAll('[data-result=correct]').length;"),3);
    assert.equal(await page.evaluate("return document.querySelectorAll('[aria-label=Rechenweg]').length;"),1);
    assert.equal(await page.evaluate("return JSON.parse(document.querySelector('.diagnosis-recipe code').textContent).version;"),2);
    await choose('#diagnosis-theme','classic-light');await page.send('Emulation.setDeviceMetricsOverride',{width:390,height:960,deviceScaleFactor:1,mobile:true});await click('.practice-config-toggle');
    assert(await page.evaluate('return document.documentElement.scrollWidth<=innerWidth+1;'));await shot('nd02-v2-mobile-checked','classic-light',390);
    await page.evaluate("document.querySelector('#practice-heading').focus();");
    await page.send('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32,text:' '});await page.send('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});await delay(80);
    assert.equal(await page.evaluate("return document.querySelectorAll('input:checked,[aria-label=Rechenweg]').length;"),0);
    assert.equal(await page.evaluate("return document.querySelector('#diagnosis-version').value;"),'2');
    await click('.practice-config-toggle');await seed(g.recipe.seed);assert.equal(await page.evaluate("return [...document.querySelectorAll('.practice-choice legend')].map(e=>e.textContent).join('|');"),g.case.questions.map(q=>q.prompt).join('|'));
    await choose('#diagnosis-version','1');assert.equal(await page.evaluate("return document.querySelectorAll('.practice-field').length;"),2);
    await choose('#diagnosis-theme','graphite-dark');await page.send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});
  });
  await test('ND02 v3 defaults, text mask, joint disclosure, editing, keyboard and both themes',async()=>{
    await choose('#diagnosis-archetype','ND02');await choose('#diagnosis-difficulty','intermediate');await seed('nd02-v3-review');
    const g=await page.evaluate("const {generateBoundariesV3}=await import('/src/exercises/diagnosis/boundariesV3.ts');return generateBoundariesV3({version:3,archetype:'ND02',difficulty:'intermediate',seed:'nd02-v3-review'});");
    const current=()=>page.evaluate("return document.querySelector('.practice-summary-seed code').textContent;");
    const mask=async text=>{
      await click('#diagnosis-mask-input');await page.send('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',modifiers:2,windowsVirtualKeyCode:65});await page.send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',modifiers:2,windowsVirtualKeyCode:65});await page.send('Input.insertText',{text});await delay(30);
    };
    const hidden=async()=>assert.equal(await page.evaluate("return document.querySelectorAll('[data-choice-result],.practice-next,[aria-label=Rechenweg],.diagnosis-recipe').length;"),0);
    assert.equal(await page.evaluate("return document.querySelectorAll('.practice-field').length;"),3);
    assert.equal(await page.evaluate("return document.querySelector('.practice-choice legend u').textContent;"),'rechnerisch');
    assert.deepEqual(await page.evaluate("return [...document.querySelectorAll('.practice-choice legend, label[for=diagnosis-mask-input]')].map(e=>e.textContent);"),g.case.questions.map(q=>q.prompt));
    assert.equal(await page.evaluate("return document.querySelector('#diagnosis-mask-input').getAttribute('placeholder');"),null);
    for(const q of g.case.questions.slice(0,2))await answer(q,q.answer);
    await click('.practice-config-toggle');await shot('nd02-v3-desktop','graphite-dark',1440);
    await click('.diagnosis-check');await hidden();
    assert.deepEqual(await page.evaluate("const e=document.querySelector('#diagnosis-mask-input');return {focused:document.activeElement===e,start:e.selectionStart,end:e.selectionEnd};"),{focused:true,start:8,end:8});
    // Completion appends to the supplied prefix, rather than replacing it.
    await page.send('Input.insertText',{text:g.calculation.mask.slice(8)});await delay(40);
    assert.equal(await page.evaluate("return document.querySelector('#diagnosis-mask-input').value;"),g.calculation.mask);
    await click('.diagnosis-check');assert.equal(await page.evaluate("return document.querySelectorAll('[data-result=correct]').length;"),3);
    assert.equal(await page.evaluate("return document.querySelectorAll('[aria-label=Rechenweg]').length;"),1);
    assert(await page.evaluate(`return document.querySelector('#diagnosis-mask-feedback').textContent.includes(${JSON.stringify(g.case.questions[2].explanation.reasoning)});`));
    // Space inside text input is never the next-question shortcut, even after grading.
    await click('#diagnosis-mask-input');const previous=await current();
    assert.equal(await page.evaluate("const e=new KeyboardEvent('keydown',{key:' ',code:'Space',bubbles:true,cancelable:true});document.activeElement.dispatchEvent(e);return e.defaultPrevented;"),false);assert.equal(await current(),previous);
    await mask('255.255.255.255');await hidden();await click('.diagnosis-check');
    assert.equal(await page.evaluate("return document.querySelectorAll('[data-result=incorrect]').length;"),1);
    assert.equal(await page.evaluate("return document.querySelectorAll('[data-result=correct]').length;"),2);
    for(const incomplete of ['255.255.','255.255.255','255.255.999.0']) {
      await mask(incomplete);await click('.diagnosis-check');await hidden();
      assert.equal(await page.evaluate("return document.activeElement.id;"),'diagnosis-mask-input');
    }
    await mask(g.calculation.mask);
    // Native Enter in the text field uses the same joint submit handler.
    await page.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'});await page.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});await delay(100);
    assert.equal(await page.evaluate("return document.querySelectorAll('[data-result=correct]').length;"),3);
    await shot('nd02-v3-desktop-checked','graphite-dark',1440);
    await click('.practice-config-toggle');await choose('#diagnosis-theme','classic-light');await page.send('Emulation.setDeviceMetricsOverride',{width:390,height:960,deviceScaleFactor:1,mobile:true});await click('.practice-config-toggle');
    assert(await page.evaluate('return document.documentElement.scrollWidth<=innerWidth+1;'));await shot('nd02-v3-mobile-checked','classic-light',390);
    await page.evaluate("document.querySelector('#practice-heading').focus();");
    await page.send('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32,text:' '});await page.send('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});await delay(80);
    assert.notEqual(await current(),previous);await hidden();
    assert.equal(await page.evaluate("return document.querySelector('#diagnosis-mask-input').value;"),'255.255.');
    assert.equal(await page.evaluate("return document.querySelector('#diagnosis-version').value;"),'3');
    await shot('nd02-v3-mobile','classic-light',390);
    await click('.practice-config-toggle');await seed(g.recipe.seed);
    assert.deepEqual(await page.evaluate("return [...document.querySelectorAll('.diagnosis-evidence p')].map(e=>e.textContent);"),[`PC: ${g.data.pc}/${g.data.prefix}`,`Gateway: ${g.data.candidate}`]);
    for(const lang of ['en','pt-BR','de']){await choose('#diagnosis-language',lang);assert.equal(await page.evaluate("return document.querySelector('#diagnosis-mask-input').value;"),'255.255.');}
    await choose('#diagnosis-theme','graphite-dark');await page.send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});
  });
  await test('v3 DE/PT/EN/DE preserves unanswered, partial masks, complete answers and correct/incorrect grading',async()=>{
    await choose('#diagnosis-archetype','ND02');await choose('#diagnosis-difficulty','advanced');
    const examples=await page.evaluate("const {generateBoundariesV3}=await import('/src/exercises/diagnosis/boundariesV3.ts');const out={};for(let i=0;i<1000;i++){const g=generateBoundariesV3({version:3,archetype:'ND02',difficulty:'advanced',seed:'i18n-review-'+i});out[g.data.role]??=g;}return Object.values(out).filter(g=>['network','broadcast','last-host','after-broadcast','zero-host','255-host'].includes(g.data.role));");
    assert.equal(examples.length,6);
    const mask=async text=>{await click('#diagnosis-mask-input');await page.send('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',modifiers:2,windowsVirtualKeyCode:65});await page.send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',modifiers:2,windowsVirtualKeyCode:65});await page.send('Input.insertText',{text});await delay(35);};
    const state=()=>page.evaluate("return {seed:document.querySelector('.practice-summary-seed code').textContent,addresses:document.querySelector('.diagnosis-evidence').textContent,mask:document.querySelector('#diagnosis-mask-input').value,answers:[...document.querySelectorAll('.practice-choice input:checked')].map(e=>[e.name,e.value]),verdicts:[...document.querySelectorAll('.practice-field')].map(e=>e.dataset.result??null),checked:!!document.querySelector('.diagnosis-recipe')};");
    for(const g of examples) {
      await seed(g.recipe.seed);
      const cycle=async capture=>{
        const beforeCycle=await state();
        for(const language of ['de','pt-BR','en','de']) {
          await choose('#diagnosis-language',language);
          assert.deepEqual(await state(),beforeCycle);
          const view=await page.evaluate(`const {presentationV3}=await import('/src/exercises/diagnosis/presentationV3.ts');return presentationV3(${JSON.stringify(g)},${JSON.stringify(language)});`);
          assert.equal(await page.evaluate("return document.querySelector('.practice-question h3').textContent;"),view.title);
          assert.deepEqual(await page.evaluate("return [...document.querySelectorAll('.practice-choice legend,label[for=diagnosis-mask-input]')].map(e=>e.textContent);"),Object.values(view.prompts));
          assert.equal(await page.evaluate("return document.querySelector('.practice-choice u').textContent;"),view.emphasis);
          assert.equal(await page.evaluate("return document.querySelector('.practice-question').lang;"),language);
          assert.equal(await page.evaluate("return document.documentElement.lang;"),language);
          if(beforeCycle.checked) {
            for(const id of ['membership','host','mask'])assert(await page.evaluate(`return document.querySelector('#diagnosis-${id}-feedback').textContent.includes(${JSON.stringify(view.explanations[id])});`));
            assert.equal(await page.evaluate("return document.querySelectorAll('.diagnosis-calculation').length;"),1);
            const calculation=await page.evaluate("return document.querySelector('.diagnosis-calculation').textContent;");
            for(const value of [g.calculation.network,g.calculation.broadcast,g.calculation.mask,g.calculation.first,g.calculation.last])assert(calculation.includes(value));
          } else assert.equal(await page.evaluate("return document.querySelectorAll('[data-choice-result],.diagnosis-calculation').length;"),0);
          if(capture&&g.data.role==='network'&&language!=='de') {
            await choose('#diagnosis-theme',language==='pt-BR'?'graphite-dark':'classic-light');
            const width=language==='pt-BR'?1440:390;await page.send('Emulation.setDeviceMetricsOverride',{width,height:960,deviceScaleFactor:1,mobile:width===390});await click('.practice-config-toggle');
            assert(await page.evaluate('return document.documentElement.scrollWidth<=innerWidth+1;'));await shot('nd02-i18n-'+language.toLowerCase(),language==='pt-BR'?'graphite-dark':'classic-light',width);await click('.practice-config-toggle');
          }
        }
      };
      await cycle(false); // no answers, supplied prefix only
      await answer(g.case.questions[0],g.case.questions[0].answer);await cycle(false);
      await mask('255.255.25');await cycle(false); // deliberately unfinished octet sequence
      await answer(g.case.questions[1],g.case.questions[1].answer);await mask(g.calculation.mask);await cycle(false);
      await click('.diagnosis-check');await cycle(true);
      await mask('255.255.255.255');await click('.diagnosis-check');await cycle(false);
      assert.equal(await page.evaluate("return document.querySelectorAll('[data-result=incorrect]').length;"),1);
      await mask('255.255.');await cycle(false);
    }
    await choose('#diagnosis-theme','graphite-dark');await page.send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});
  });
  await test('manual seeds reproduce, invalid seeds preserve work, settings and translations do not reset answers',async()=>{
    const g=samples.find(g=>g.recipe.recipe==='nd05-tcp');await choose('#diagnosis-archetype','ND05');await choose('#diagnosis-difficulty',g.recipe.difficulty);await seed(g.recipe.seed);
    const original=await page.evaluate("return document.querySelector('.diagnosis-evidence').textContent;");await seed(g.recipe.seed);assert.equal(await page.evaluate("return document.querySelector('.diagnosis-evidence').textContent;"),original);
    await answer(g.case.questions[0],g.case.questions[0].answer);await answer(g.case.questions[1],g.case.questions[1].answer);await click('.diagnosis-check');
    await seed(' ');assert.equal(await page.evaluate("return document.querySelector('.diagnosis-evidence').textContent;"),original);assert.equal(await page.evaluate("return document.querySelectorAll('input:checked').length;"),2);
    await seed(g.recipe.seed);for(const q of g.case.questions)await answer(q,q.answer);await click('.diagnosis-check');
    for(const lang of ['en','pt-BR','de']){await choose('#diagnosis-language',lang);assert.equal(await page.evaluate("return document.querySelectorAll('input:checked').length;"),2);}
    await click('.practice-config-toggle');await click('.practice-config-toggle');assert.equal(await page.evaluate("return document.querySelectorAll('input:checked').length;"),2);
    await choose('#diagnosis-theme','classic-light');await page.send('Emulation.setDeviceMetricsOverride',{width:700,height:960,deviceScaleFactor:1,mobile:false});await delay(120);await click('.practice-config-toggle');await shot('02-nd05-checked','classic-light',700);await click('.practice-config-toggle');
  });
  await test('native radios, focus, guarded Space, next question and every archetype/difficulty',async()=>{
    const current=()=>page.evaluate("return document.querySelector('.practice-summary-seed code').textContent;");
    const send=async(extra={})=>page.evaluate(`const e=new KeyboardEvent('keydown',{key:' ',code:'Space',bubbles:true,cancelable:true,...${JSON.stringify(extra)}});document.activeElement.dispatchEvent(e);return e.defaultPrevented;`);
    const previous=await current();await page.evaluate("document.querySelector('#practice-heading').focus();");
    for(const extra of [{repeat:true},{altKey:true},{ctrlKey:true},{metaKey:true},{shiftKey:true},{isComposing:true},{code:'KeyS'}])assert.equal(await send(extra),false);
    for(const selector of ['#diagnosis-seed','#diagnosis-archetype','.practice-config-toggle','.practice-choice input']){await page.evaluate(`document.querySelector(${JSON.stringify(selector)}).focus();`);assert.equal(await send(),false);assert.equal(await current(),previous);}
    await page.evaluate("document.querySelector('#practice-heading').focus();");
    await page.send('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32,text:' '});await page.send('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});await delay(80);
    assert.notEqual(await current(),previous);assert.match(await current(),/^[a-f0-9]{8}$/);assert.equal(await page.evaluate("return document.querySelectorAll('input:checked,.practice-feedback,.practice-next').length;"),0);assert.equal(await send(),false);
    for(const archetype of ['ND02','ND05'])for(const difficulty of ['beginner','intermediate','advanced']){await choose('#diagnosis-archetype',archetype);await choose('#diagnosis-difficulty',difficulty);assert.equal(await page.evaluate("return document.querySelectorAll('.practice-field').length;"),archetype==='ND02'?3:2);assert.equal(await page.evaluate("return document.querySelectorAll('input:checked').length;"),0);}
    await click('.practice-choice label');await page.send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});await page.send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});assert.equal(await page.evaluate("return document.querySelector('.practice-choice input:checked').value;"),'no');
    await page.send('Emulation.setDeviceMetricsOverride',{width:390,height:960,deviceScaleFactor:1,mobile:true});await delay(120);await click('.practice-config-toggle');assert(await page.evaluate('return document.documentElement.scrollWidth<=innerWidth+1;'));await shot('03-nd05-unchecked-mobile','classic-light',390);
    const preserved=await current();await click('.practice-panel header button');await click('.diagnosis-preview-page > button');assert.equal(await current(),preserved);
  });
  await test('no storage mutations, application bootstrap or network sessions; refresh clears answers',async()=>{
    const withoutLanguage=s=>({...s,local:Object.fromEntries(Object.entries(s.local).filter(([key])=>key!=='netlab:language:v1'))});
    assert.deepEqual(withoutLanguage(await storage()),withoutLanguage(before));
    assert.equal((await storage()).local['netlab:language:v1'],'de');
    assert(!await page.evaluate("return performance.getEntriesByType('resource').some(e=>/\\/src\\/(App.tsx|store.ts|sim.ts|terminals.ts)/.test(e.name));"));
    await page.send('Page.reload');await wait();assert.equal(await page.evaluate("return document.querySelectorAll('input:checked,.practice-next,.practice-feedback').length;"),0);assert.deepEqual(withoutLanguage(await storage()),withoutLanguage(before));
  });
  const manifest=path.join(directory,'manifest.json');await writeFile(manifest,JSON.stringify({id:'diagnosis-preview',title:'Netzwerkdiagnose · Development preview',variants:[{id:'graphite-dark',label:'Graphite Dark'},{id:'classic-light',label:'Classic Light'}],states:['normal'],captures,share:captures.filter(c=>c.scene.startsWith('nd02-i18n')||c.scene==='nd02-v3-desktop').map(c=>({...c,name:c.scene})),shareContactSheet:false}));
  report.diagnosisPreviewReview=await generateReview(manifest);
}
