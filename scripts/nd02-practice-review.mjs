import assert from 'node:assert/strict';

/** Real editor integration, using the existing disposable workspace and input helpers. */
export async function runND02PracticeReview({page,test,click,choose,type,shot,delay}) {
  const state=async()=>page.evaluate("return JSON.stringify({q:practice.getState().question,a:practice.getState().attempts});");
  const key=async(key,code,text)=>{
    await page.send('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode:code==='Space'?32:13,...(text?{text}:{})});
    await page.send('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode:code==='Space'?32:13});await delay(70);
  };
  const answer=async()=>{
    const a=await page.evaluate('return model.solution(practice.getState().question);');
    for(const id of ['membership','host'])await click(`#practice-${id} label:has(input[value="${a[id]}"])`);
    await type('#practice-mask',a.mask);return a;
  };
  const languageCycle=async()=>{
    const before=await state();
    for(const [language,term,title,category] of [['de','rechnerisch','Gateway und Subnetz','Subnetzgrenzen'],['pt-BR','matematicamente','Gateway e sub-rede','Limites das sub-redes'],['en','mathematically','Gateway and subnet','Subnet boundaries'],['de','rechnerisch','Gateway und Subnetz','Subnetzgrenzen']]) {
      await choose('#toolbar-language',language);assert.equal(await state(),before);
      assert.equal(await page.evaluate("return document.querySelector('#practice-membership u').textContent;"),term);
      assert.equal(await page.evaluate("return document.querySelector('.practice-question h3').textContent;"),title);
      assert(await page.evaluate(`const s=practice.getState(),q=s.question,r=s.attempts[q.id].result,summary=document.querySelector('.practice-summary-values');
        if(document.querySelector('.practice-summary-seed,.practice-recipe')||summary.textContent.includes(q.recipe.seed))return false;
        if(summary.children.length!==2||summary.querySelector('strong').textContent!==${JSON.stringify(category)})return false;
        if(r?.complete){
          if(document.querySelector('.practice-result-summary'))return false;
          for(const id of ['membership','host']){
            const field=document.querySelector('#practice-'+id),feedback=document.querySelector('#practice-'+id+'-feedback');
            if(feedback.querySelectorAll(':scope > p').length!==1)return false;
            const correct=field.querySelector('[data-choice-result=correct]');
            if(!correct?.textContent.includes('✓'))return false;
            if(r.fields[id].state==='incorrect'&&!field.querySelector('[data-choice-result=incorrect]')?.textContent.includes('✕'))return false;
          }
        }else if(document.querySelector('[data-choice-result],.practice-calculation'))return false;
        return true;`),'ND02 compact header/feedback and accessible verdicts: '+language);
    }
  };
  await test('ND02 practice: published selection, same generator, complete questions and no premature answers',async()=>{
    await page.send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});await delay(150);
    await page.evaluate("window.practice=(await import('/src/exercises/practice/session.ts')).usePractice;window.model=await import('/src/exercises/practice/model.ts');lang.getState().setLanguage('de');theme.getState().setTheme('graphite-dark');window.nd02Before=JSON.stringify(store.getState().captureWorkspaceDocument());");
    await click('.practice-config-toggle');await choose('.practice-controls select','boundaries');
    await type('.practice-seed input','nd02-v3-review-38');await click('.practice-seed button','Diese Seed öffnen');await click('.practice-config-toggle');
    assert.equal(await page.evaluate("return document.querySelectorAll('.practice-field').length;"),3);
    assert.equal(await page.evaluate("return document.querySelectorAll('.practice-choice input').length;"),4);
    assert.equal(await page.evaluate("return document.querySelector('#practice-mask').value;"),'255.255.');
    assert.equal(await page.evaluate("return document.querySelectorAll('.practice-solution,.practice-calculation,.practice-feedback,.practice-content-note').length;"),0);
    assert(await page.evaluate("return practice.getState().question.problem.family==='nd02-v3'&&practice.getState().question.recipe.version===3;"));
    const unchanged=await state();await click('.practice-config-toggle');
    assert(await page.evaluate("const e=document.querySelector('.practice-seed input');return e.value==='nd02-v3-review-38'&&e.getBoundingClientRect().height>0&&!document.querySelector('.practice-recipe');"));
    await click('.practice-config-toggle');assert.equal(await state(),unchanged);
    await languageCycle();await shot('nd02-desktop-before','graphite-dark',1440);
    await click('.practice-actions button');
    assert.equal(await page.evaluate("return document.querySelectorAll('.practice-calculation,.practice-next').length;"),0);
    assert.equal(await page.evaluate("return practice.getState().attempts[practice.getState().question.id].result.complete;"),false);
    await click('#practice-membership label:has(input[value="yes"])');await languageCycle();
    await type('#practice-mask','255.255.25');await languageCycle();
    await click('.practice-actions button');assert.equal(await page.evaluate("return document.querySelectorAll('.practice-calculation,.practice-next').length;"),0);
    await page.evaluate("document.querySelector('#practice-mask').focus();");await key(' ','Space',' ');
    assert.equal(await page.evaluate("return practice.getState().question.recipe.seed;"),'nd02-v3-review-38');
  });
  await test('ND02 practice: typed mask octets auto-separate without duplicate dots or interfering with deletion',async()=>{
    await type('#practice-mask','255.255.');
    for(const text of ['2','5','5']){await page.send('Input.insertText',{text});await delay(60);}
    assert.equal(await page.evaluate("return document.querySelector('#practice-mask').value;"),'255.255.255.');
    await page.send('Input.insertText',{text:'.'});await delay(60);
    assert.equal(await page.evaluate("return document.querySelector('#practice-mask').value;"),'255.255.255.');
    await page.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8});
    await page.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8});await delay(60);
    assert.equal(await page.evaluate("return document.querySelector('#practice-mask').value;"),'255.255.255');
    await type('#practice-mask','255.255.25');
    await page.send('Input.insertText',{text:'.'});await delay(60);
    assert.equal(await page.evaluate("return document.querySelector('#practice-mask').value;"),'255.255.25.');
    await page.send('Input.insertText',{text:'.'});await delay(60);
    assert.equal(await page.evaluate("return document.querySelector('#practice-mask').value;"),'255.255.25.');
    for(const text of ['2','2','4']){await page.send('Input.insertText',{text});await delay(60);}
    assert.equal(await page.evaluate("return document.querySelector('#practice-mask').value;"),'255.255.25.224');
  });
  await test('ND02 practice: joint grading, complete wrong mask, editing, Enter and Space progression',async()=>{
    await answer();await languageCycle();
    await type('#practice-mask','1.2.3.4');
    const correct=await page.evaluate('return model.solution(practice.getState().question).membership;');
    await click(`#practice-membership label:has(input[value="${correct==='yes'?'no':'yes'}"])`);await key('Enter','Enter','\r');
    assert.equal(await page.evaluate("return document.querySelector('#practice-mask').getAttribute('aria-invalid');"),'true');
    assert.equal(await page.evaluate("return document.querySelectorAll('.practice-calculation').length;"),1);await languageCycle();
    assert.equal(await page.evaluate("return document.querySelectorAll('[data-choice-result=incorrect]').length;"),1);
    await shot('nd02-desktop-mixed','graphite-dark',1440);
    await answer();assert.equal(await page.evaluate("return document.querySelectorAll('.practice-calculation,.practice-feedback').length;"),0);
    await key('Enter','Enter','\r');
    assert.equal(await page.evaluate("return document.querySelectorAll('[data-result=correct]').length;"),3);await languageCycle();
    assert(await page.evaluate("const q=practice.getState().question,f=q.problem.generated.calculation,t=document.querySelector('.practice-calculation').textContent;return [f.mask,f.network,f.broadcast,f.first,f.last].every(v=>t.includes(v));"));
    await shot('nd02-desktop-after','graphite-dark',1440);
    await shot('nd02-desktop-calculation','graphite-dark',1440,'bottom');
    const before=await state();await page.evaluate("document.querySelector('.practice-config-toggle').focus();");await key(' ','Space',' ');assert.equal(await state(),before);
    // Restore the config closed if its native Space action opened it.
    if(await page.evaluate("return document.querySelector('.practice-config-toggle').getAttribute('aria-expanded')==='true';"))await click('.practice-config-toggle');
    await page.evaluate("document.querySelector('#practice-heading').focus();");await key(' ','Space',' ');
    assert.notEqual(await page.evaluate("return practice.getState().question.recipe.seed;"),'nd02-v3-review-38');
    assert.equal(await page.evaluate("return document.querySelector('#practice-mask').value;"),'255.255.');
    assert.equal(await page.evaluate("return document.querySelectorAll('.practice-calculation,.practice-feedback,.practice-next').length;"),0);
    // Reproduce the same approved seed through the actual controls.
    await click('.practice-config-toggle');await type('.practice-seed input','nd02-v3-review-38');await click('.practice-seed button','Diese Seed öffnen');
    assert.equal(await page.evaluate("return practice.getState().question.problem.generated.data.pc;"),'10.61.101.194');
    await click('.practice-config-toggle');
  });
  await test('ND02 practice: narrow layout, translated feedback, internal scroll and retained category attempts',async()=>{
    // Reproduction returns the existing graded attempt; edit to show the ungraded mobile state.
    await type('#practice-mask','255.255.');await choose('#toolbar-language','pt-BR');
    await page.send('Emulation.setDeviceMetricsOverride',{width:390,height:960,deviceScaleFactor:1,mobile:true});await delay(150);
    await page.evaluate("theme.getState().setTheme('classic-light');");
    assert(await page.evaluate("const p=document.querySelector('.practice-panel');return p.scrollWidth<=p.clientWidth+1&&document.documentElement.scrollWidth<=innerWidth+1;"));
    await shot('nd02-mobile-before','classic-light',390);
    await answer();await key('Enter','Enter','\r');await languageCycle();await choose('#toolbar-language','pt-BR');
    assert.equal(await page.evaluate("return document.querySelectorAll('[data-result=correct]').length;"),3);
    await shot('nd02-mobile-after','classic-light',390);
    await shot('nd02-mobile-calculation','classic-light',390,'bottom');
    assert(await page.evaluate("const b=document.querySelector('.practice-body');b.scrollTop=b.scrollHeight;const c=document.querySelector('.practice-calculation').getBoundingClientRect(),r=b.getBoundingClientRect();return c.bottom<=r.bottom+1&&document.querySelector('.practice-next').getBoundingClientRect().bottom<=innerHeight&&document.documentElement.scrollWidth<=innerWidth+1;"));
    await languageCycle();
    const correct=await page.evaluate('return model.solution(practice.getState().question).membership;');
    await click(`#practice-membership label:has(input[value="${correct==='yes'?'no':'yes'}"])`);await key('Enter','Enter','\r');
    await languageCycle();await shot('nd02-mobile-mixed','classic-light',390);
    const saved=await page.evaluate("return JSON.stringify(practice.getState().attempts[practice.getState().question.id]);");
    await click('.practice-config-toggle');await choose('.practice-controls select','subnet');await choose('.practice-controls select','boundaries');
    assert.equal(await page.evaluate("return JSON.stringify(practice.getState().attempts[practice.getState().question.id]);"),saved);
    await click('.practice-config-toggle');await click('.practice-close');
    assert.equal(await page.evaluate("return JSON.stringify(store.getState().captureWorkspaceDocument());"),await page.evaluate('return nd02Before;'));
    await page.evaluate('practice.getState().show();');await delay(100);
    assert.equal(await page.evaluate("return JSON.stringify(practice.getState().attempts[practice.getState().question.id]);"),saved);
  });
}
