import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
export async function runTutorialMenuReview({page,url,root,report}){
 const db='netlab-idb-test-'+crypto.randomUUID(),delay=ms=>new Promise(r=>setTimeout(r,ms));
 const wait=async e=>{for(let i=0;i<250;i++){if(await page.evaluate('return !!('+e+');'))return;await delay(40);}throw Error('Tutorial menu: '+e);};
 const click=async(sel,text)=>{const p=await page.evaluate(`const e=[...document.querySelectorAll(${JSON.stringify(sel)})].find(e=>e.getClientRects().length&&(${text?`e.textContent.trim().startsWith(${JSON.stringify(text)})`:'true'}));if(!e)throw Error('Missing '+${JSON.stringify(sel)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};`);for(const type of ['mouseMoved','mousePressed','mouseReleased'])await page.send('Input.dispatchMouseEvent',{type,...p,...(type==='mouseMoved'?{}:{button:'left',clickCount:1})});await delay(100);};
 const mount=async()=>{await page.send('Page.navigate',{url});await wait("document.readyState==='complete'&&document.getElementById('root')");await page.evaluate(`window.store=(await import('/src/store.ts')).useStore;window.sim=(await import('/src/sim.ts')).sim;window.lang=(await import('/src/i18n/index.ts')).useLanguage;lang.getState().setLanguage('de');window.ws=await(await import('/src/workspace/reviewEntry.tsx')).mountWorkspaceReview(document.getElementById('root'),{databaseName:${JSON.stringify(db)}});`);await wait("document.querySelector('.react-flow')");};
 const menu=async()=>{await click('.toolbar-menu-trigger,.toolbar-menu-action','Übungen (Beta)');await wait("document.querySelector('[data-guided-menu-toggle]')");};
 const expand=async()=>{await menu();await click('[data-guided-menu-toggle]');};
 const current=()=>page.evaluate('return store.getState().workspaceIdentity.draftId;');
 const ready=()=>wait("document.querySelector('[data-start-tutorial]:not(:disabled)')");
 const title=label=>wait(`document.querySelector('.workspace-tab-wrap[data-active=true] .workspace-tab-name')?.textContent===${JSON.stringify(label)}`);
 const tabStrip=()=>page.evaluate(`
  const bar=document.querySelector('.workspace-tabs-bar'), tabs=bar.querySelector('.workspace-tabs');
  const last=tabs.querySelector('.workspace-tab-wrap:last-child').getBoundingClientRect();
  const add=bar.querySelector('.workspace-add').getBoundingClientRect();
  return {
   gap:add.left-last.right,
   overflow:tabs.scrollWidth>tabs.clientWidth,
   rightInset:bar.getBoundingClientRect().right-add.right,
   buttonX:add.left,
  };
 `);
 const checkHeader=async expanded=>{
  const header=await page.evaluate(`
   const guided=document.querySelector('.guided-tutorial-menu'), practice=document.querySelector('.practice-menu-entry').closest('details');
   const toggle=guided.querySelector('[data-guided-menu-toggle]'), css=getComputedStyle(toggle);
   const heading=toggle.querySelector('.guided-menu-heading strong'), summary=toggle.querySelector('.guided-menu-summary');
   return {
    followsPractice: practice.nextElementSibling===guided,
    expanded: toggle.getAttribute('aria-expanded')==='true',
    hasList: !!document.getElementById('guided-tutorial-groups'),
    height: toggle.getBoundingClientRect().height,
    border: parseFloat(css.borderTopWidth),
    radius: parseFloat(css.borderRadius),
    background: css.backgroundColor,
    iconWidth: toggle.querySelector('.guided-menu-icon svg').getBoundingClientRect().width,
    titleSize: parseFloat(getComputedStyle(heading).fontSize),
    summarySize: parseFloat(getComputedStyle(summary).fontSize),
    fits: summary.scrollWidth<=summary.clientWidth+1,
   };`);
  assert(header.followsPractice);
  assert.equal(header.expanded,expanded);
  assert.equal(header.hasList,expanded);
  assert(header.height>=54&&header.border>=1&&header.radius>=8&&header.iconWidth>=22);
  assert(header.background!=='rgba(0, 0, 0, 0)'&&header.titleSize>header.summarySize&&header.fits);
 };
 try{
  await page.send('Emulation.setDeviceMetricsOverride',{width:1440,height:950,deviceScaleFactor:1,mobile:false});await mount();const personal=await current();
  await title('Unbenannt');
  const initialStrip=await tabStrip();
  assert(!initialStrip.overflow && initialStrip.gap>=0 && initialStrip.gap<=10);
  await menu();await checkHeader(false);assert.equal(await page.evaluate("return document.querySelector('[data-start-tutorial]');"),null);
  await page.evaluate("document.querySelector('[data-guided-menu-toggle]').focus();");for(const type of ['keyDown','keyUp'])await page.send('Input.dispatchKeyEvent',{type,key:' ',code:'Space',windowsVirtualKeyCode:32});await wait("document.querySelector('#guided-tutorial-groups')");
  for(const [id,label,summary] of [['en','Chapters 1–2','6 chapters + NAT/PAT'],['pt-BR','Capítulos 1–2','6 capítulos + NAT/PAT'],['de','Kapitel 1–2','6 Kapitel + NAT/PAT']]){
    await page.evaluate(`lang.getState().setLanguage(${JSON.stringify(id)});`);
    await wait(`document.querySelector('.guided-menu-summary').textContent===${JSON.stringify(summary)}`);
    assert(await page.evaluate(`return document.querySelector('#guided-tutorial-groups').textContent.includes(${JSON.stringify(label)});`));
  }
  await click('[data-guided-menu-toggle]');assert.equal(await page.evaluate("return document.querySelector('#guided-tutorial-groups');"),null);await click('[data-guided-menu-toggle]');await ready();await click('[data-start-tutorial]');await wait("document.querySelector('[data-guided-step=\"1\"]')");const first=await current();assert.notEqual(first,personal);await title('Erste Verbindung');
  await expand();await ready();await click('[data-start-tutorial]');assert.equal(await current(),first);
  await expand();await ready();await click('[data-restart-tutorial]');await wait(`store.getState().workspaceIdentity.draftId!==${JSON.stringify(first)}`);assert.notEqual(await current(),first);
  await expand();await click('[data-router-direct]');await wait("document.querySelector('[data-router-step=\"1\"]')");const router=await current();
  await page.evaluate('await ws.controller.flush();');const count=await page.evaluate('return ws.controller.getState().drafts.length;');
  await page.evaluate(`await ws.controller.switchDraft(${JSON.stringify(personal)});`);await expand();await wait("document.querySelector('[data-router-resume]')");await click('[data-router-resume]');await wait(`store.getState().workspaceIdentity.draftId===${JSON.stringify(router)}`);assert.equal(await page.evaluate('return ws.controller.getState().drafts.length;'),count);
  const titleMatchesPanel=()=>page.evaluate(`return document.querySelector('.workspace-tab-wrap[data-active=true] .workspace-tab-name')?.textContent===document.querySelector('.exercise-panel .exercise-heading strong')?.textContent;`);
  assert(await titleMatchesPanel());
  await page.evaluate('await ws.controller.flush();ws.dispose();');await mount();await wait("document.querySelector('[data-router-step=\"1\"]')");assert.equal(await current(),router);assert(await titleMatchesPanel());
  await expand();await wait("document.querySelector('[data-router-resume]')");await click('[data-router-resume]');assert.equal(await current(),router);
  await menu();await click('[data-exercise="pilot-e08-v1"] .exercise-menu-actions button:last-child');await wait("document.querySelector('.exercise-panel[data-exercise=pilot-e08-v1]')");assert.notEqual(await current(),router);
  await expand();await wait("document.querySelector('[data-router-resume]')");await click('[data-router-resume]');await wait(`store.getState().workspaceIdentity.draftId===${JSON.stringify(router)}`);
  for(const theme of ['graphite-dark','burgundy-dark','classic-light','slate-gray','deep-teal','original']){
    await page.evaluate(`(await import('/src/uiTheme.ts')).useUiTheme.getState().setTheme(${JSON.stringify(theme)});`);
    await menu();
    await checkHeader(false);
    await click('[data-guided-menu-toggle]');
    await checkHeader(true);
    assert(await page.evaluate("return document.querySelector('#guided-tutorial-groups').getBoundingClientRect().width>0;"));
    await click('.toolbar-menu-trigger,.toolbar-menu-action','Übungen (Beta)');
  }
  report.results['tutorial menu: practice first and highlighted header stays visible collapsed/expanded in every theme']={passed:true};
  for (const [button, panel] of [
    ['[data-static-direct]', 'guided-static-routing'], ['[data-lpm-start]', 'guided-lpm'], ['[data-nat-start]', 'guided-nat-pat'],
  ]) {
    await expand();
    await wait(`document.querySelector('${button}:not(:disabled)')`);
    await click(button);
    await wait(`document.querySelector('[data-exercise="${panel}"]')`);
    assert(await titleMatchesPanel());
  }
  if (process.env.NETLAB_TUTORIAL_MENU_SCREENSHOT_ONLY === '1') {
    await page.evaluate(`(await import('/src/uiTheme.ts')).useUiTheme.getState().setTheme('graphite-dark');lang.getState().setLanguage('pt-BR');`);
    await click('.toolbar-menu-trigger,.toolbar-menu-action','Exercícios (Beta)');
    await checkHeader(false);
    const folder = path.join(root, '.playwright-mcp', 'reviews', 'cabecalho-tutoriais');
    await mkdir(folder, { recursive: true });
    const screenshot = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(path.join(folder, 'tutoriais-guiados.png'), Buffer.from(screenshot.data, 'base64'));
    await click('.toolbar-menu-trigger,.toolbar-menu-action','Exercícios (Beta)');
    await page.evaluate("lang.getState().setLanguage('de');");
  }
  await page.send('Emulation.setDeviceMetricsOverride',{width:700,height:950,deviceScaleFactor:1,mobile:false});await delay(200);await click('.toolbar-navigation > .toolbar-menu-trigger');await expand();assert(await page.evaluate('return document.documentElement.scrollWidth<=innerWidth+1;'));
  await checkHeader(true);
  const compactStrip=await tabStrip();
  assert(compactStrip.overflow && compactStrip.rightInset>=0 && compactStrip.rightInset<=5);
  await page.evaluate("const tabs=document.querySelector('.workspace-tabs');tabs.scrollLeft=0;");
  await wait("document.querySelector('.workspace-tabs').scrollLeft===0");
  assert.equal((await tabStrip()).buttonX,compactStrip.buttonX);
  await page.evaluate("const tabs=document.querySelector('.workspace-tabs');tabs.scrollLeft=tabs.scrollWidth;");
  await wait("document.querySelector('.workspace-tabs').scrollLeft>0");
  assert.equal((await tabStrip()).buttonX,compactStrip.buttonX);
  report.results['workspace tabs: new plan follows the last tab and stays at the edge during horizontal scroll']={passed:true};
  report.results['tutorial menu: click/Space collapse, translations, start/resume/restart, Chapter 3 direct/resume, F5, Beta and themes']={passed:true};
 }finally{await page.evaluate(`window.ws?.dispose();await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase(${JSON.stringify(db)});r.onsuccess=resolve;r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('cleanup blocked'));});`);}
}
