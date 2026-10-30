import assert from 'node:assert/strict';

export async function runE02Review({page,test,click,choose,type,shot,delay}) {
  const state="(await import('/src/exercises/practice/session.ts')).usePractice.getState()";
  const id=()=>page.evaluate(`return ${state}.question.id;`);
  // Observe after React's root handler but before React Flow's document-level Space/pan listener.
  // Its existing preventDefault is unrelated to the practice shortcut and must not be changed.
  const send=extra=>page.evaluate(`const e=new KeyboardEvent('keydown',{key:' ',code:'Space',bubbles:true,cancelable:true,...${JSON.stringify(extra??{})}});const root=document.getElementById('root');let consumed;const observe=()=>{consumed=e.defaultPrevented;};root.addEventListener('keydown',observe);document.activeElement.dispatchEvent(e);root.removeEventListener('keydown',observe);document.activeElement.dispatchEvent(new KeyboardEvent('keyup',{key:' ',code:'Space',bubbles:true}));return consumed??e.defaultPrevented;`);
  const correct=async()=>{const answer=await page.evaluate(`return (await import('/src/exercises/practice/model.ts')).solution(${state}.question).local;`);await choose('#practice-local',answer);await click('.practice-actions button','Antwort prüfen');};
  await page.send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});await delay(200);
  await test('E02: exact selectable address text, aligned dot columns and accessible names',async()=>{
    await click('.practice-config-toggle');await choose('.practice-version','1');
    assert.equal(await page.evaluate(`return ${state}.question.recipe.version;`),1);
    await choose('.practice-controls label:nth-child(2) select','beginner');
    await type('.practice-seed input','reference');await click('.practice-seed button','Diese Seed öffnen');
    assert.equal(await page.evaluate(`return ${state}.question.recipe.seed;`),'reference');
    await click('.practice-config-toggle');
    const values=await page.evaluate(`return [...document.querySelectorAll('.practice-ipv4')].map(e=>{const r=document.createRange();r.selectNodeContents(e);const s=getSelection();s.removeAllRanges();s.addRange(r);const copy=s.toString();s.removeAllRanges();return {copy,text:e.textContent,label:e.getAttribute('aria-label'),dots:[...e.querySelectorAll('.practice-dot')].map(d=>d.getBoundingClientRect().left)};});`);
    assert.equal(values[0].copy,'192.168.99.60/16');assert.equal(values[1].copy,'192.168.9.1');
    for(const v of values)assert.equal(v.copy,v.label);
    for(let i=0;i<3;i++)assert(Math.abs(values[0].dots[i]-values[1].dots[i])<.5);
  });
  await test('E02: v2 selectable, reproducible, all evidence types and feedback; v1 reference still accessible',async()=>{
    await click('.practice-config-toggle');await choose('.practice-version','2');
    // Discover deterministic seeds from the public generator, not fabricated grader results.
    const examples=await page.evaluate(`const {createQuestion}=await import('/src/exercises/practice/model.ts');const found={};for(let i=0;i<1000;i++){const seed='e02-v2-audit-'+String(i).padStart(4,'0'),q=createQuestion('gateway',seed,'beginner',2),p=q.problem;const key=p.mode==='membership'?'membership':p.evidence;found[key]??=seed;}return found;`);
    for(const key of ['membership','echo','power','timeout']) {
      await type('.practice-seed input',examples[key]);await click('.practice-seed button','Diese Seed öffnen');
      assert.equal(await page.evaluate(`const p=${state}.question.problem;return p.mode==='membership'?'membership':p.evidence;`),key);
      const before=await id();await click('.practice-seed button','Diese Seed öffnen');assert.equal(await id(),before);
      await click('.practice-config-toggle');await correct();assert(await page.evaluate("return !!document.querySelector('[data-result=correct]');"));
      assert.equal(await page.evaluate(`return ${state}.question.recipe.version;`),2);
      await page.evaluate(`theme.getState().setTheme(${JSON.stringify(key==='power'||key==='timeout'?'classic-light':'graphite-dark')});`);
      await shot('v2-'+key,key==='power'||key==='timeout'?'classic-light':'graphite-dark',1440);
      await click('.practice-config-toggle');
    }
    // Leave a verified v2 question with the settings open for the focus guards.
  });
  await test('E02: physical Space guards controls, editable content, dialogs, repeats, modifiers and external panels',async()=>{
    await correct();const before=await id();
    for(const extra of [{repeat:true},{ctrlKey:true},{shiftKey:true},{altKey:true},{metaKey:true},{isComposing:true},{code:'KeyS'}]){assert.equal(await send(extra),false,JSON.stringify(extra));assert.equal(await id(),before);}
    for(const selector of ['.practice-seed input','.practice-version','.practice-config-toggle','#practice-local input','.canvas']) {
      await page.evaluate(`document.querySelector(${JSON.stringify(selector)}).focus();`);assert.equal(await send(),false);assert.equal(await id(),before);
    }
    await page.evaluate("const e=document.createElement('div');e.contentEditable='true';e.id='space-editable-test';document.querySelector('.practice-body').append(e);e.focus();");
    assert.equal(await send(),false);await page.evaluate("document.querySelector('#space-editable-test').remove();document.querySelector('#practice-heading').focus();const d=document.createElement('dialog');d.id='space-modal-test';document.body.append(d);d.showModal();");
    await send();assert.equal(await id(),before); // Dialog is outside the React root; existing canvas listeners may consume it.
    await page.evaluate("document.querySelector('#practice-heading').dispatchEvent(new KeyboardEvent('keydown',{key:' ',code:'Space',bubbles:true,cancelable:true}));");
    assert.equal(await id(),before);
    await page.evaluate("document.querySelector('#space-modal-test').remove();document.querySelector('#practice-heading').focus();");
    assert.equal(await id(),before);
    // Native physical key execution, not dispatching a click.
    await page.send('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32,text:' '});
    await page.send('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});await delay(80);
    assert.notEqual(await id(),before);const after=await id();
    assert.equal(await page.evaluate(`return ${state}.question.recipe.version;`),2);
    assert.equal(await send(),false);assert.equal(await id(),after); // New question has not been checked.
    await correct();await click('.practice-next');assert.notEqual(await id(),after);
    await correct();const prevented=await id();await page.evaluate("document.querySelector('#practice-heading').addEventListener('keydown',e=>e.preventDefault(),{once:true});");assert.equal(await send(),true);
    assert.equal(await id(),prevented);
    await click('.practice-config-toggle');
  });
  await test('E02: all languages, narrow layout, dot alignment and keyboard focus in both themes',async()=>{
    await click('.practice-config-toggle');
    for(const [language,label] of [['de','Nächste Aufgabe (Leertaste)'],['en','Next question (Space)'],['pt-BR','Próxima questão (Espaço)']]) {
      await choose('.practice-panel .language-selector select',language);
      assert(await page.evaluate(`return document.querySelector('.practice-next').textContent.includes(${JSON.stringify(label)});`));
    }
    await choose('.practice-panel .language-selector select','de');await click('.practice-config-toggle');
    for(const theme of ['graphite-dark','classic-light'])for(const width of [390,700]) {
      await page.send('Emulation.setDeviceMetricsOverride',{width,height:960,deviceScaleFactor:1,mobile:width===390});await page.evaluate(`window.theme.getState().setTheme(${JSON.stringify(theme)});`);await delay(80);
      assert(await page.evaluate("const p=document.querySelector('.practice-panel');return p.scrollWidth<=p.clientWidth+1&&document.documentElement.scrollWidth<=innerWidth+1;"));
      assert(await page.evaluate("const a=[...document.querySelectorAll('.practice-ipv4')].map(e=>[...e.querySelectorAll('.practice-dot')].map(d=>d.getBoundingClientRect().left));return a[0].every((x,i)=>Math.abs(x-a[1][i])<.5);"));
      if(width===390&&theme==='classic-light')await shot('v2-mobile',theme,width);
    }
  });
  const press=async(key,code,windowsVirtualKeyCode,modifiers=0)=>{
    await page.send('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode,modifiers,...(key==='Tab'?{text:'\t',unmodifiedText:'\t'}:key==='Enter'?{text:'\r'}:key===' '?{text:' '}: {})});
    await page.send('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode,modifiers});await delay(80);
  };
  const configure=async()=>{if(await page.evaluate("return document.querySelector('.practice-config-toggle').getAttribute('aria-expanded')==='false';"))await click('.practice-config-toggle');};
  const recipe=async(version,seed)=>{
    await configure();await choose('.practice-controls select','gateway');await choose('.practice-version',String(version));
    await choose('.practice-controls label:nth-child(2) select','beginner');
    await type('.practice-seed input',seed);await click('.practice-seed button','Diese Seed öffnen');await click('.practice-config-toggle');
  };
  const markers=()=>page.evaluate("return document.querySelectorAll('[data-choice-result]').length;");
  const headingFocused=async()=>assert(await page.evaluate("const h=document.querySelector('#practice-heading');return document.activeElement===h&&getComputedStyle(h).outlineStyle==='none';"));
  const interactiveFocus=async selector=>assert(await page.evaluate(`const e=document.activeElement;return e.matches(${JSON.stringify(selector)})&&getComputedStyle(e).outlineStyle!=='none'&&parseFloat(getComputedStyle(e).outlineWidth)>0;`));
  for(const theme of ['graphite-dark','classic-light']) {
    const width=theme==='graphite-dark'?1440:700;
    await page.send('Emulation.setDeviceMetricsOverride',{width,height:960,deviceScaleFactor:1,mobile:false});
    await page.evaluate(`window.theme.getState().setTheme(${JSON.stringify(theme)});`);await delay(80);
    for(const [version,seed,answer] of [[1,'reference','yes'],[2,'e02-v2-audit-0011','yes'],[2,'e02-v2-audit-0013','no'],[2,'e02-v2-audit-0024','unknown']]) {
      await test(`E02: ${theme} v${version} ${answer} reveals correct choice only after an incorrect check`,async()=>{
        await recipe(version,seed);
        // These recipes may have been visited earlier in this same browser review.
        await page.evaluate(`const s=${state};s.answer('local','');`);await delay(80);
        assert.equal(await markers(),0);
        await click('.practice-actions button','Antwort prüfen');
        assert(await page.evaluate("return !!document.querySelector('[data-result=missing]');"));assert.equal(await markers(),0);
        const wrong=answer==='yes'?'no':'yes';await choose('#practice-local',wrong);assert.equal(await markers(),0);
        await click('.practice-actions button','Antwort prüfen');await headingFocused();
        const feedback=await page.evaluate(`return [...document.querySelectorAll('#practice-local label')].map(e=>({value:e.querySelector('input').value,checked:e.querySelector('input').checked,result:e.dataset.choiceResult,text:e.textContent,border:getComputedStyle(e).borderTopColor,verdict:e.querySelector('.practice-choice-verdict')?getComputedStyle(e.querySelector('.practice-choice-verdict')).color:null}));`);
        assert.equal(feedback.find(o=>o.checked).value,wrong);assert.equal(await markers(),2);
        const right=feedback.find(o=>o.value===answer),bad=feedback.find(o=>o.value===wrong);
        assert.equal(right.result,'correct');assert.equal(right.checked,false);assert.match(right.text,/✓.*Richtig/);
        assert.equal(bad.result,'incorrect');assert.match(bad.text,/✕.*Nicht richtig/);assert.notEqual(right.border,bad.border);
        assert.equal(right.border,right.verdict);assert.equal(bad.border,bad.verdict);
        const ax=await page.send('Accessibility.getFullAXTree');
        assert(ax.nodes.some(n=>n.role?.value==='radio'&&n.name?.value.includes('Nicht richtig')));
        assert(ax.nodes.some(n=>n.role?.value==='radio'&&n.name?.value.includes('Richtig')));
        if(version===2&&answer==='unknown')await shot('v2-feedback-'+theme,theme,width);
        await choose('#practice-local',answer);assert.equal(await markers(),0);
        assert.equal(await page.evaluate("return !!document.querySelector('.practice-feedback');"),false);
        await click('.practice-actions button','Antwort prüfen');assert.equal(await markers(),0);
        assert(await page.evaluate("return !!document.querySelector('[data-result=correct]')&&document.querySelectorAll('#practice-local input:checked').length===1;"));
      });
    }
    await test(`E02: ${theme} Space/button progression keeps reading focus, scrolling and interactive keyboard outlines`,async()=>{
      await page.send('Page.bringToFront');
      await page.send('Emulation.setDeviceMetricsOverride',{width,height:600,deviceScaleFactor:1,mobile:false});await delay(80);
      const before=await id();await page.evaluate("document.querySelector('.practice-body').scrollTop=10000;");
      await press(' ','Space',32);assert.notEqual(await id(),before);await headingFocused();
      assert(await page.evaluate("const b=document.querySelector('.practice-body'),q=document.querySelector('.practice-question').getBoundingClientRect(),r=b.getBoundingClientRect();return b.scrollTop===0&&q.top>=r.top&&q.bottom<=r.bottom;"));
      assert.equal(await markers(),0);
      await press('Tab','Tab',9);await interactiveFocus('.practice-position');
      await press('Tab','Tab',9);await interactiveFocus('.practice-close');
      await press('Tab','Tab',9,8);await interactiveFocus('.practice-position');
      await press('Tab','Tab',9);await press('Tab','Tab',9);await interactiveFocus('.practice-config-toggle');
      await press('Enter','Enter',13);
      assert.equal(await page.evaluate("return document.querySelector('.practice-config-toggle').getAttribute('aria-expanded');"),'true');
      await press('Tab','Tab',9);await interactiveFocus('.language-selector select');
      await press('Tab','Tab',9,8);await press('Enter','Enter',13);
      await press('Tab','Tab',9);await press('ArrowRight','ArrowRight',39);
      assert(await page.evaluate("const input=document.activeElement;return input.matches('#practice-local input')&&input.checked&&getComputedStyle(input.closest('label')).outlineStyle!=='none';"));
      await press('Tab','Tab',9);await interactiveFocus('.practice-actions button[type=submit]');
      const entered=await id();await press('Enter','Enter',13);await headingFocused();assert.equal(await id(),entered);
      assert(await page.evaluate("return !!document.querySelector('.practice-next');"));
      await click('.practice-next');assert.notEqual(await id(),entered);await headingFocused();assert.equal(await markers(),0);
      await page.send('Emulation.setDeviceMetricsOverride',{width,height:960,deviceScaleFactor:1,mobile:false});await delay(80);
    });
    await test(`practice: ${theme} partial subnetting/VLSM retains per-field feedback without choice markers`,async()=>{
      for(const kind of ['subnet','vlsm']) {
        await configure();await choose('.practice-controls select',kind);await type('.practice-seed input','feedback-'+theme+'-'+kind);
        await click('.practice-seed button','Diese Seed öffnen');await click('.practice-config-toggle');
        const fields=await page.evaluate(`const q=${state}.question;return {ids:q.fields.map(f=>f.id),answers:(await import('/src/exercises/practice/model.ts')).solution(q)};`);
        await type('#practice-'+fields.ids[0],fields.answers[fields.ids[0]]);await type('#practice-'+fields.ids[1],'invalid');
        await click('.practice-actions button','Antwort prüfen');assert.equal(await markers(),0);
        assert(await page.evaluate("return ['correct','incorrect','missing'].every(s=>document.querySelector('.practice-field[data-result='+s+']'))&&!document.querySelector('.practice-choice');"));
      }
      await recipe(2,'e02-v2-audit-0024');
    });
  }
}
