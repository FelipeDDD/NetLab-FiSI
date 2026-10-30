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
}
