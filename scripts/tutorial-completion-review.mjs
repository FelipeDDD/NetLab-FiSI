import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { generateReview } from './visual-review.mjs';

/** Called by the real chapter walkthrough after real task validation. */
export async function reviewTutorialCompletion({page,root,report,wait,delay,click,menu,mount,stage}) {
  const directory=path.join(root,'.playwright-mcp/reviews/raw/tutorial-completion-staging');await mkdir(directory,{recursive:true});
  await page.evaluate("lang.getState().setLanguage('de');theme.getState().setTheme('graphite-dark');store.getState().setTerminalDockCollapsed(true);store.getState().select(null);");await delay(120);
  const shot=async(name,state)=>{const image=await page.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(directory,name+'.png'),Buffer.from(image.data,'base64'));return{source:path.relative(root,path.join(directory,name+'.png')).split(path.sep).join('/'),scene:name,variant:'graphite-dark',state,width:1440,height:1000};};
  const receipt=()=>page.evaluate("const id=ws.controller.getState().activeDraftId;return {id,document:store.getState().captureWorkspaceDocument(),meta:await ws.repository.getMeta('guided:two-networks:v1:draft:'+id),tabs:ws.controller.getState().drafts.length};");
  const before=await receipt();await menu();await wait("document.querySelector('[data-chapter-progress=two-networks] [data-completed-tasks]')");
  assert(await page.evaluate("return !!document.querySelector('[data-chapter-progress=first-connection] [data-chapter-completed=true]')&&!!document.querySelector('[data-chapter-progress=subnet-mask] [data-chapter-completed=true]');"),'Earlier chapter completion must survive Chapter 3 activation and F5');
  if(stage==='partial'){
    assert.equal(await page.evaluate("return document.querySelector('[data-chapter-progress=two-networks] [data-completed-tasks]').dataset.completedTasks;"),'3');
    for(const [language,text] of [['de','3/8 Aufgaben abgeschlossen'],['en','3/8 tasks completed'],['pt-BR','3/8 tarefas concluídas']]){await page.evaluate(`lang.getState().setLanguage(${JSON.stringify(language)});`);await delay(60);assert.equal(await page.evaluate("return document.querySelector('[data-chapter-progress=two-networks] .guided-progress').textContent.trim();"),text);}
    await page.evaluate("lang.getState().setLanguage('de');");await delay(60);const capture=await shot('01-menu-partial','partial');await writeFile(path.join(directory,'partial.json'),JSON.stringify(capture));
    await click('.toolbar-menu-trigger,.toolbar-menu-action','Übungen (Beta)');assert.deepEqual(await receipt(),before);return;
  }
  assert(await page.evaluate("return !!document.querySelector('[data-chapter-progress=two-networks] [data-chapter-completed=true]');"));
  for(const [language,label] of [['de','Abgeschlossen'],['en','Completed'],['pt-BR','Concluído']]){await page.evaluate(`lang.getState().setLanguage(${JSON.stringify(language)});`);await delay(60);assert.equal(await page.evaluate("return document.querySelector('[data-chapter-progress=two-networks] .guided-progress').textContent.trim();"),'✓ '+label);}
  await page.evaluate("lang.getState().setLanguage('de');");await delay(60);
  assert.deepEqual(await page.evaluate("const actions=document.querySelector('[data-router-completed-actions]');return {count:actions?.querySelectorAll('button').length??0,labels:[...actions?.querySelectorAll('button')??[]].map(button=>button.textContent.trim()),restart:!!actions?.querySelector('[data-chapter-restart=two-networks]')};"),{count:2,labels:['Netzwerk öffnen','Direkt starten'],restart:false});
  const completed=await shot('02-menu-completed','completed');
  await click('[data-router-resume]');await wait("document.querySelector('[data-explore-network]')");const final=await shot('03-chapter-finished','final');
  for(const [language,text] of [['en','Explore the network freely'],['pt-BR','Explorar a rede livremente'],['de','Netzwerk frei erkunden']]){await page.evaluate(`lang.getState().setLanguage(${JSON.stringify(language)});`);await delay(60);assert.equal(await page.evaluate("return document.querySelector('[data-explore-network]').textContent;"),text);}
  await click('[data-explore-network]');await wait("!document.querySelector('[data-router-step]')");assert.deepEqual(await receipt(),before);
  await menu();await wait("document.querySelector('[data-router-resume]')");await click('[data-router-resume]');await wait("document.querySelector('[data-explore-network]')");assert.deepEqual(await receipt(),before);
  await mount(true);await wait("document.querySelector('[data-router-step=\"8\"]')&&document.querySelector('[data-chapter-completed=true]')");assert.deepEqual(await receipt(),before);
  const partial=JSON.parse(await readFile(path.join(directory,'partial.json'),'utf8')),captures=[partial,completed,final],manifest=path.join(directory,'manifest.json');
  await writeFile(manifest,JSON.stringify({id:'tutorial-completion',title:'Tutorial progress and completion',variants:[{id:'graphite-dark',label:'Graphite Dark'}],states:['partial','completed','final'],captures,share:captures.map(c=>({...c,name:c.scene.replace(/^\d+-/, '')})),shareContactSheet:false}));
  report.tutorialCompletionReview=await generateReview(manifest);report.results['tutorial completion: real 3/8 and 8/8, three languages, non-destructive explore, resume and F5']={passed:true};
}
