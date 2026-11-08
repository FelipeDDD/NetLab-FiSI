import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function reviewPingSpeedPreference({ page, root, database, setup, click, key, wait, delay }) {
  const preferenceKey='netlab:ping-animation-preference:v1';
  const start=async()=>{
    await page.evaluate("store.getState().select(null);store.getState().openTerminal('pc1');store.getState().setPaused(false);terminals.getSession(sim.net.devices.get('pc1')).term.input('ping 10.0.0.30\\r',true);");
    await wait("document.querySelector('.ping-animation-remember input')");
  };
  const reload=async()=>{
    await page.evaluate('await workspace.controller.flush();workspace.dispose();');
    await page.send('Page.reload',{ignoreCache:true});await wait("document.readyState==='complete'&&document.getElementById('root')");
    await page.evaluate(`window.entry=await import('/src/workspace/reviewEntry.tsx');window.store=(await import('/src/store.ts')).useStore;window.sim=(await import('/src/sim.ts')).sim;window.theme=(await import('/src/uiTheme.ts')).useUiTheme;window.probe=await import('/src/workspace/viewportProbe.browser.tsx');window.terminals=await import('/src/terminals.ts');window.workspace=await entry.mountWorkspaceReview(document.getElementById('root'),{databaseName:${JSON.stringify(database)}});`);
    await wait("document.querySelector('.react-flow')");await delay(150);
  };
  await setup();await start();
  assert.equal(await page.evaluate("return document.querySelector('.ping-animation-remember input').checked;"),false);
  await page.evaluate("document.querySelector('#ping-animation-speed').focus();");await key('Home');await key('ArrowRight');await wait('store.getState().packetAnimationSpeed===.5');
  await click('.ping-animation-remember input');
  const saved=await page.evaluate(`return localStorage.getItem(${JSON.stringify(preferenceKey)});`);
  assert.deepEqual(JSON.parse(saved),{remember:true,speed:.5});
  const document=await page.evaluate('return store.getState().captureWorkspaceDocument();');
  for(const selectedTheme of ['graphite-dark','classic-light'])for(const [language,label]of [['de','Geschwindigkeit merken'],['en','Remember speed'],['pt-BR','Lembrar velocidade']]){
    await page.evaluate(`theme.getState().setTheme(${JSON.stringify(selectedTheme)});(await import('/src/i18n/index.ts')).useLanguage.getState().setLanguage(${JSON.stringify(language)});`);await delay(60);
    assert(await page.evaluate(`const l=document.querySelector('.ping-animation-remember');return l.textContent===${JSON.stringify(label)}&&l.querySelector('input').checked;`));
  }
  assert.deepEqual(await page.evaluate('return store.getState().captureWorkspaceDocument();'),document);
  const refs=path.join(root,'.playwright-mcp/reviews/ping-speed-preference/referencias-chatgpt');await mkdir(refs,{recursive:true});
  const png=await page.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(refs,'01-lembrar-velocidade.png'),Buffer.from(png.data,'base64'));
  // New topology and a fresh JS context both reuse the global opt-in.
  await setup();assert.equal(await page.evaluate('return store.getState().packetAnimationSpeed;'),.5);
  await reload();assert.equal(await page.evaluate('return store.getState().packetAnimationSpeed;'),.5);await start();
  assert.equal(await page.evaluate("return document.querySelector('.ping-animation-remember input').checked;"),true);
  await page.evaluate("document.querySelector('#ping-animation-speed').focus();");await key('End');await wait('store.getState().packetAnimationSpeed===2');
  assert.deepEqual(JSON.parse(await page.evaluate(`return localStorage.getItem(${JSON.stringify(preferenceKey)});`)),{remember:true,speed:2});
  await reload();assert.equal(await page.evaluate('return store.getState().packetAnimationSpeed;'),2);await start();
  await click('.ping-animation-remember input');await reload();
  assert.equal(await page.evaluate('return store.getState().packetAnimationSpeed;'),.25);await start();
  assert.equal(await page.evaluate("return document.querySelector('.ping-animation-remember input').checked;"),false);
}
