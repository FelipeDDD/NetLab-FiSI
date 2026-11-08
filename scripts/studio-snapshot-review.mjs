import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {reopenStudio} from './studio-review-reopen.mjs';

export async function runStudioSnapshotReview({page,root,report,downloads,openPage,test,open,close,value,click,ready,wait,init,metrics,gesture}){
  const out=path.join(root,'.playwright-mcp/reviews/studio-snapshot');await mkdir(out,{recursive:true});
  const state=()=>page.evaluate('return structuredClone(store.getState().studioPresentation);');
  let saved,layouts;
  await test('snapshot audit: reopen reads changed IP/route/device while preserving presentation in all four formats',async()=>{
    await value('[data-studio-title]','Snapshot audit / trabalho preservado');await value('[data-studio-subtitle]','IPv4 e rotas atuais');await value('[data-studio-footer-note]','Autor: Felipe');
    await click('[data-studio-diagram-option=ipv4]');await click('[data-studio-add-block-panel] > summary');await value('[data-studio-block-device]','A');await click('[data-studio-add-block]');
    const id=await page.evaluate("return document.querySelector('[data-studio-block-settings]').dataset.studioBlockSettings;");
    await click(`[data-studio-block-settings="${id}"] > summary`);await value(`[data-studio-block-settings="${id}"] [data-block-width]`,'normal');
    for(const paper of ['A4','A3'])for(const orientation of ['portrait','landscape']){
      await value('[data-studio-paper]',paper);await value('[data-studio-orientation]',orientation);await value('[data-studio-zoom]','page');await gesture('[data-device=B] > rect',5,7);
    }
    saved=await state();layouts=saved.layouts;await close();
    await page.evaluate("const {parseIp,parseCidr}=await import('/src/engine/ip.ts');sim.net.devices.get('PC-A').getInterface('eth0').configureIpv4({mode:'static',ip:parseCidr('192.168.10.77/24'),gateway:parseIp('192.168.10.1'),dns:null});sim.net.devices.get('A').addRoute(parseIp('172.29.0.0'),16,parseIp('10.0.1.2'),'eth1');store.getState().renameDevice('C','Router C atualizado');store.getState().addDeviceAt('host',{x:1200,y:900});");
    await open();const after=await state();assert.deepEqual(after.layouts,layouts);assert.deepEqual(after.shared,saved.shared);
    const text=await page.evaluate("return document.querySelector('.topology-studio iframe').contentDocument.body.textContent;");assert(text.includes('192.168.10.77'));assert(text.includes('172.29.0.0/16'));assert(text.includes('Router C atualizado'));assert(!text.includes('192.168.10.10/24'));
    await writeFile(path.join(out,'reopen-audit.json'),JSON.stringify({freshIp:true,freshRoute:true,freshDeviceName:true,allFourLayoutsIdentical:true,presentation:after},null,2));
  });
  await test('snapshot audit: F5 retains current topology and presentation; SVG PNG HTML PDF still export',async()=>{
    assert((await page.evaluate('return ws.controller.flush();')).ok);await close();await page.send('Page.reload');await init();await open();assert.deepEqual((await state()).layouts,layouts);assert.deepEqual((await state()).shared,saved.shared);
    assert((await page.evaluate("return document.querySelector('.topology-studio iframe').contentDocument.body.textContent;")).includes('192.168.10.77'));
    for(const kind of ['svg','png','html']){const n=report.downloads.length;page.labelDownloads('snapshot-audit-'+kind);await click(`[data-studio-export=${kind}]`);await wait(`document.querySelector('[data-studio-export=${kind}]').disabled===false`);for(let i=0;i<200&&report.downloads.length===n;i++)await new Promise(r=>setTimeout(r,30));assert.equal(report.downloads.length,n+1);await page.drainDownloads();const bytes=await readFile(path.join(downloads,report.downloads.at(-1).guid));await writeFile(path.join(out,'reopened.'+kind),bytes);if(kind!=='png'){assert(bytes.toString().includes('192.168.10.77'));assert(bytes.toString().includes('172.29.0.0/16'));}}
    const printer=await openPage();try{const tree=await printer.send('Page.getFrameTree'),html=await page.evaluate("return document.querySelector('.topology-studio iframe').dataset.previewHtml;");await printer.send('Page.setDocumentContent',{frameId:tree.frameTree.frame.id,html});await printer.evaluate('await document.fonts.ready;');const pdf=await printer.send('Page.printToPDF',{printBackground:true,preferCSSPageSize:true});await writeFile(path.join(out,'reopened.pdf'),Buffer.from(pdf.data,'base64'));}finally{await printer.send('Page.close');printer.close();}
  });
  await test('snapshot audit: no refresh section; pending DHCP does not change the open snapshot and reopening updates it',async()=>{
    await close();await page.evaluate("const r=await ws.controller.openDocument({schemaVersion:1,topology:(await import('/src/testing/dhcpGlobalFixture.ts')).dhcpGlobalDocument()});if(!r.ok)throw Error(JSON.stringify(r));store.getState().setPaused(true);(await import('/src/commands/dhclient.ts')).runDhclient(sim.net.devices.get('client-0'),['eth0'],()=>{},()=>{});");
    await open();await value('[data-studio-preset]','technical');const before=await page.evaluate("return document.querySelector('.topology-studio iframe').dataset.previewHtml;");assert(!before.includes('10.20.1.100'));
    await page.evaluate('store.getState().setPaused(false);');await wait("sim.net.devices.get('client-0').interfaces[0].dhcpLease");await page.evaluate('store.getState().setPaused(true);');
    const stale=await page.evaluate("return document.querySelector('.topology-studio iframe').dataset.previewHtml;");assert.equal(stale,before,'The Studio intentionally holds its initial snapshot');
    const presentation=await state();
    for(const language of ['de','en','pt-BR']){
      await page.evaluate(`lang.getState().setLanguage(${JSON.stringify(language)});`);
      assert(await page.evaluate("return !document.querySelector('[data-studio-refresh],.studio-help')&&!/Aufnahme:|Snapshot:|Captura:|Dokumenthilfe/.test(document.querySelector('.studio-options').textContent)&&!!document.querySelector('[data-studio-panel=report]');"),'Only snapshot help is removed; report contents remain');
    }
    await reopenStudio(page);await ready();const updated=await page.evaluate("return document.querySelector('.topology-studio iframe').dataset.previewHtml;");assert(updated.includes('10.20.1.100'));assert.deepEqual((await state()).layouts,presentation.layouts);assert.deepEqual((await state()).shared,presentation.shared);
    await page.evaluate("lang.getState().setLanguage('de');");await click('[data-studio-panel=report] > summary');await page.evaluate("const a=document.querySelector('.studio-options');a.scrollTop=a.scrollHeight;");
    const refs=path.join(out,'referencias-chatgpt');await mkdir(refs,{recursive:true});const capture=await page.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(refs,'01-lateral-sem-atualizacao-manual.png'),Buffer.from(capture.data,'base64'));
    await writeFile(path.join(out,'dhcp-audit.json'),JSON.stringify({pendingBeforeOpen:true,leaseCompletedWithStudioOpen:true,previousPreviewRemainedFixed:true,reopenShowsAssignedIp:'10.20.1.100',presentationPreserved:true,refreshSectionAbsent:true,reportContentsPreserved:true},null,2));
  });
}
