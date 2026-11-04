import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';

// Only invoked by the disposable workspace harness, never by the application.
export async function reviewChapterRestart({page,root,report,wait,delay,click,mount,chapter,variant=''}){
 const directory=path.join(root,'.playwright-mcp/reviews/raw/chapter-restart');await mkdir(directory,{recursive:true});
 const attr=chapter==='first-connection'?'guided':chapter==='subnet-mask'?'subnet':'router';
 const step=n=>wait(`document.querySelector('[data-${attr}-step="${n}"]')`);
 const snapshot=()=>page.evaluate('return store.getState().captureWorkspaceDocument();');
 const key=async k=>page.evaluate(`return (await ws.repository.getMeta(${JSON.stringify(k)})).value;`);
 const meta=await page.evaluate(`const c=await import('/src/tutorials/chapterCheckpoints.ts'),id=ws.controller.getState().activeDraftId;return {id,key:c.progressKey(id,'${chapter}'),checkpoint:c.checkpointKey(id,'${chapter}'),others:c.CHAPTERS.filter(k=>k!=='${chapter}').map(k=>c.progressKey(id,k))};`);
 const saved=async()=>{await wait(`document.querySelector('[data-${attr}-saving=false]')`);await page.evaluate('const r=await ws.controller.flush();if(!r.ok)throw Error(r.error.code);');await delay(60);};
 const open=async()=>{await click(`[data-chapter-restart="${chapter}"]`);await wait("document.querySelector('[data-chapter-restart-confirm]:not(:disabled)')");};
 const escape=async()=>{for(const type of ['keyDown','keyUp'])await page.send('Input.dispatchKeyEvent',{type,key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await delay(80);};
 const close=async()=>{await escape();await wait("!document.querySelector('[data-chapter-restart-popover]')");};
 const label=`chapter restart: ${chapter} ${variant}`.trim();
 try{
  await saved();const before=await snapshot(),progress=await key(meta.key),earlier=await Promise.all(meta.others.map(key));
  const originalStep=progress.value.step;
  await open();assert.deepEqual(await snapshot(),before);await close();assert.deepEqual(await snapshot(),before);
  for(const [lang,title] of [['de','Kapitel neu starten?'],['en','Restart chapter?'],['pt-BR','Reiniciar capítulo?']]){
   await page.evaluate(`lang.getState().setLanguage('${lang}');`);await open();assert.equal(await page.evaluate("return document.querySelector('[data-chapter-restart-popover] strong').textContent;"),title);await close();
  }
  await page.evaluate("lang.getState().setLanguage('de');");
  await open();await click('.react-flow__controls-fitview');await wait("!document.querySelector('[data-chapter-restart-popover]')");assert.deepEqual(await snapshot(),before);
  await open();await page.evaluate(`const other=ws.controller.getState().drafts.find(d=>d.id!==${JSON.stringify(meta.id)});await ws.controller.switchDraft(other.id);`);await wait("!document.querySelector('[data-chapter-restart-popover]')");await page.evaluate(`await ws.controller.switchDraft(${JSON.stringify(meta.id)});`);await step(originalStep);await saved();
  await open();const png=await page.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(directory,chapter+variant+'-confirmation.png'),Buffer.from(png.data,'base64'));
  await click('[data-chapter-restart-confirm]');await step(1);await saved();const reset=await snapshot();assert.notDeepEqual(reset,before);
  const p=(await key(meta.key)).value;assert.equal(p.step,1);
  if(chapter==='first-connection'){assert.equal(reset.topology.devices.find(d=>d.id==='tutorial-01-a').ifaces[0].ip,null);assert.equal(p.devices.c,null);assert.deepEqual(p.completed,[]);}
  if(chapter==='subnet-mask'){assert.equal(reset.topology.devices.find(d=>d.id==='tutorial-02-d').ifaces[0].ip,'192.168.10.12/28');assert.equal(p.answerAccepted,false);assert.equal(p.unreachable,false);}
  if(chapter==='two-networks'){assert.equal(reset.topology.devices.find(d=>d.id==='tutorial-03-f').ifaces[0].ip,null);assert(reset.topology.devices.find(d=>d.id==='tutorial-03-router').ifaces.every(i=>i.ip===null));assert.deepEqual(p.diagnosis,{failure:false,reply:null});assert.equal(reset.topology.devices.find(d=>d.id==='tutorial-01-a').ifaces[0].gateway,null);}
  assert.deepEqual((await Promise.all(meta.others.map(key))).map(r=>r?.value??null),earlier.map(r=>r?.value??null));
  await page.evaluate('store.getState().undoTopology();');await step(originalStep);await saved();assert.deepEqual(await snapshot(),before);assert.deepEqual((await key(meta.key)).value,progress.value);
  await page.evaluate('store.getState().redoTopology();');await step(1);await saved();assert.deepEqual(await snapshot(),reset);
  await mount(true);await step(1);await saved();assert.deepEqual(await snapshot(),reset);assert.deepEqual((await Promise.all(meta.others.map(key))).map(r=>r?.value??null),earlier.map(r=>r?.value??null));
  // Restore the known test backup atomically so the original chapter review can
  // continue. This is fixture setup, not a product recovery path.
  await page.evaluate(`const id=${JSON.stringify(meta.id)},loaded=(await ws.repository.workspace.loadDraft(id)).value,record=(await ws.repository.getMeta(${JSON.stringify(meta.key)})).value;const result=await ws.repository.workspace.updateDraft(id,{expectedRevision:loaded.revision,editSequence:loaded.editSequence+1,document:${JSON.stringify(before)},control:[{key:record.key,expectedRevision:record.revision,value:${JSON.stringify(progress.value)}}]});if(!result.ok)throw Error(result.error.code);`);
  await mount(true);await step(originalStep);await saved();assert.deepEqual(await snapshot(),before);
  report.results[label]={passed:true};
 }catch(e){report.results[label]={passed:false,error:e.stack,visible:await page.evaluate('return document.querySelector(".exercise-panel")?.textContent;')};throw e;}
 report.chapterRestartReview={directory};
}

export async function reviewRestartFailures({page,report,wait,delay,click}){
 const test=async(name,fn)=>{try{await fn();report.results['chapter restart safety: '+name]={passed:true};}catch(e){report.results['chapter restart safety: '+name]={passed:false,error:e.stack};throw e;}};
 const escaped=async()=>{for(const type of ['keyDown','keyUp'])await page.send('Input.dispatchKeyEvent',{type,key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await delay(80);};
 const open=async()=>{await click('[data-chapter-restart=two-networks]');await wait("document.querySelector('[data-chapter-restart-confirm]:not(:disabled)')");};
 const capture=()=>page.evaluate('return store.getState().captureWorkspaceDocument();');
 const info=await page.evaluate("const c=await import('/src/tutorials/chapterCheckpoints.ts'),id=ws.controller.getState().activeDraftId;return {id,cp:c.checkpointKey(id,'two-networks'),progress:c.progressKey(id,'two-networks')};");
 await test('second connection CAS conflict aborts the combined document/progress transaction',async()=>{
  await open();const before=await capture();
  await page.evaluate(`const opened=await (await import('/src/projects/repository.ts')).openProjectRepository({databaseName:ws.repository.db.name});if(!opened.ok)throw Error(opened.error.code);try{const r=(await opened.value.getMeta(${JSON.stringify(info.cp)})).value;const result=await opened.value.setMeta({key:r.key,expectedRevision:r.revision,value:r.value});if(!result.ok)throw Error(result.error.code);}finally{opened.value.close();}`);
  await click('[data-chapter-restart-confirm]');await wait("document.querySelector('[data-chapter-restart-popover] [role=alert]')");assert.deepEqual(await capture(),before);await escaped();
 });
 await test('quota thrown after draft put rolls back network and all progress records',async()=>{
  await open();const before=await capture();const stored=await page.evaluate(`return {draft:(await ws.repository.workspace.loadDraft('${info.id}')).value,progress:(await ws.repository.getMeta('${info.progress}')).value};`);
  await page.evaluate(`window.restartOriginalPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(value,...rest){if(this.name==='meta'&&value?.key===${JSON.stringify(info.progress)})throw new DOMException('Injected quota','QuotaExceededError');return restartOriginalPut.call(this,value,...rest);};`);
  try{await click('[data-chapter-restart-confirm]');await wait("document.querySelector('[data-chapter-restart-popover] [role=alert]')");}finally{await page.evaluate('IDBObjectStore.prototype.put=restartOriginalPut;delete window.restartOriginalPut;');}
  assert.deepEqual(await capture(),before);assert.deepEqual(await page.evaluate(`return {draft:(await ws.repository.workspace.loadDraft('${info.id}')).value,progress:(await ws.repository.getMeta('${info.progress}')).value};`),stored);await escaped();
 });
 await test('native transaction abort preserves the draft and control metadata',async()=>{
  assert(await page.evaluate(`const d=(await ws.repository.workspace.loadDraft('${info.id}')).value,p=(await ws.repository.getMeta('${info.progress}')).value,abort=new AbortController(),document=structuredClone(d.document);document.topology.devices[0].name='ABORTED';const pending=ws.repository.workspace.updateDraft(d.id,{expectedRevision:d.revision,editSequence:d.editSequence+1,document,control:[{key:p.key,expectedRevision:p.revision,value:p.value}]},{signal:abort.signal});abort.abort();const result=await pending;return !result.ok&&result.error.code==='aborted'&&JSON.stringify((await ws.repository.workspace.loadDraft(d.id)).value)===JSON.stringify(d)&&JSON.stringify((await ws.repository.getMeta(p.key)).value)===JSON.stringify(p);`));
 });
 await test('an applied edit during restart aborts the write and preserves the local edit',async()=>{
  await open();const before=await capture(),p=await page.evaluate(`return (await ws.repository.getMeta('${info.progress}')).value.value;`);
  await page.evaluate(`window.restartOriginalUpdate=ws.repository.workspace.updateDraft;window.restartInjectedResult=null;ws.repository.workspace.updateDraft=function(...args){const pending=restartOriginalUpdate.apply(this,args);if(args[1].control?.some(m=>m.key==='${info.progress}')){store.getState().renameDevice('tutorial-01-a','PC A local edit');return pending.then(result=>{window.restartInjectedResult=result;return result;});}return pending;};`);
  try{await click('[data-chapter-restart-confirm]');await wait('window.restartInjectedResult?.ok===false');}finally{await page.evaluate('ws.repository.workspace.updateDraft=restartOriginalUpdate;delete window.restartOriginalUpdate;');}
  assert(await page.evaluate("return sim.net.devices.get('tutorial-01-a').name==='PC A local edit'&&sim.net.devices.get('tutorial-03-f').interfaces[0].ip!==null;"));assert.deepEqual(await page.evaluate(`return (await ws.repository.getMeta('${info.progress}')).value.value;`),p);
  await page.evaluate(`store.getState().renameDevice('tutorial-01-a',${JSON.stringify(before.topology.devices.find(d=>d.id==='tutorial-01-a').name)});const r=await ws.controller.flush();if(!r.ok)throw Error(r.error.code);`);await wait("document.querySelector('[data-router-step=\"8\"]')");assert.deepEqual(await capture(),before);
 });
 await test('missing and invalid checkpoints disable restoration without creating a retroactive baseline',async()=>{
  const backup=await page.evaluate(`return (await ws.repository.getMeta('${info.cp}')).value;`),before=await capture();
  await page.evaluate(`const db=ws.repository.db;if(!db.name.startsWith('netlab-idb-test-'))throw Error('Non-disposable database');await new Promise((resolve,reject)=>{const tx=db.transaction('meta','readwrite');tx.objectStore('meta').delete('${info.cp}');tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});`);
  for(const malformed of [false,true]){
   if(malformed)await page.evaluate(`const result=await ws.repository.setMeta({key:'${info.cp}',expectedRevision:null,value:{schemaVersion:999}});if(!result.ok)throw Error(result.error.code);`);
   await click('[data-chapter-restart=two-networks]');await wait("document.querySelector('[data-chapter-restart-popover] [role=alert]')");assert(await page.evaluate("return document.querySelector('[data-chapter-restart-confirm]').disabled&&!!document.querySelector('[data-chapter-new-attempt]');"));assert.deepEqual(await capture(),before);await escaped();
  }
  await click('[data-chapter-restart=two-networks]');await wait("document.querySelector('[data-chapter-new-attempt]')");
  const tabs=await page.evaluate('return ws.controller.getState().drafts.length;');await click('[data-chapter-new-attempt]');await wait(`ws.controller.getState().activeDraftId!==${JSON.stringify(info.id)}&&!!document.querySelector('[data-router-step="1"]')`);assert.equal(await page.evaluate('return ws.controller.getState().drafts.length;'),tabs+1);assert.deepEqual(await page.evaluate(`return (await ws.repository.workspace.loadDraft('${info.id}')).value.document;`),before);
  await page.evaluate(`const current=(await ws.repository.getMeta('${info.cp}')).value,result=await ws.repository.setMeta({key:current.key,expectedRevision:current.revision,value:${JSON.stringify(backup.value)}});if(!result.ok)throw Error(result.error.code);await ws.controller.switchDraft('${info.id}');`);await wait("document.querySelector('[data-router-step=\"8\"]')");assert.deepEqual(await capture(),before);
 });
}
