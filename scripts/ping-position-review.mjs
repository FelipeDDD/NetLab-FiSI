import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function reviewPingPosition({ page, root, database, setup, click, key, wait, delay }) {
  const checkbox = '.ping-animation-preferences label:nth-child(2) input';
  const preference = () => page.evaluate('return store.getState().pingAnimationPosition;');
  const shown = () => page.evaluate("const p=document.querySelector('.ping-animation-control');return {x:p.offsetLeft,y:p.offsetTop};");
  const start = async () => {
    await page.evaluate("store.getState().openTerminal('pc1');store.getState().setPaused(false);terminals.getSession(sim.net.devices.get('pc1')).term.input('ping 10.0.0.30\\r',true);");
    await wait("document.querySelector('#ping-animation-speed')&&store.getState().guidedPacket.playback.status==='playing'");
    await page.evaluate('store.getState().toggleGuidedPlayback();'); await delay(80);
  };
  const restartPing = async () => {
    await page.evaluate("terminals.getSession(sim.net.devices.get('pc1')).term.input('\\u0003',true);");
    // Finish only the old visual playback; no topology or preference changes.
    await page.evaluate("const s=store.getState();if(s.guidedPacket.playback.status==='paused')s.toggleGuidedPlayback();store.getState().setPacketAnimationSpeed(2);");
    await wait("store.getState().guidedPacket.playback.status==='finished'");
    await start();
  };
  const move = async (dx, dy) => {
    const p=await page.evaluate("const r=document.querySelector('.ping-animation-drag-handle').getBoundingClientRect();return {x:r.left+30,y:r.top+r.height/2};");
    await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',...p});
    await page.send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',buttons:1,clickCount:1});
    for(let i=1;i<=6;i++){await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x+dx*i/6,y:p.y+dy*i/6,button:'left',buttons:1});await delay(20);}
    await page.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x+dx,y:p.y+dy,button:'left',clickCount:1});await delay(80);
  };
  const inside = async () => assert(await page.evaluate("const p=document.querySelector('.ping-animation-control').getBoundingClientRect(),c=document.querySelector('.canvas').getBoundingClientRect();return p.left>=c.left-1&&p.right<=c.right+1&&p.top>=c.top-1&&p.bottom<=c.bottom+1;"));
  await setup(); await start();
  const a=await page.evaluate('return workspace.controller.getState().activeDraftId;');
  assert.deepEqual(await preference(),{remember:false});
  assert.equal(await page.evaluate('return document.querySelector('+JSON.stringify(checkbox)+').checked;'),false);
  const defaultPosition=await shown();
  await move(140,-140); const chosenA=await shown();
  assert(chosenA.x>defaultPosition.x+100);
  assert.deepEqual(await preference(),{remember:false});
  await click(checkbox); assert.deepEqual(await preference(),{remember:true,position:chosenA});
  await move(50,-30); const finalA=await shown();
  assert.deepEqual(await preference(),{remember:true,position:finalA});
  const globalSpeed=await page.evaluate("return localStorage.getItem('netlab:ping-animation-preference:v1');");
  await page.evaluate('store.getState().setPacketAnimationSpeed(2);');
  assert.deepEqual(await preference(),{remember:true,position:finalA});
  assert.equal(await page.evaluate("return localStorage.getItem('netlab:ping-animation-preference:v1');"),globalSpeed);
  await click('.ping-animation-close'); await wait("!document.querySelector('.ping-animation-control')");
  await restartPing(); assert.deepEqual(await shown(),finalA);
  for(const width of [700,1440]) {
    await page.send('Emulation.setDeviceMetricsOverride',{width,height:960,deviceScaleFactor:1,mobile:false});await delay(180);await inside();
    assert.deepEqual(await preference(),{remember:true,position:finalA});
  }
  assert.deepEqual(await shown(),finalA);
  await page.evaluate("document.querySelector('.terminal-resizer').focus();");await key('End');await delay(160);await inside();
  assert.deepEqual(await preference(),{remember:true,position:finalA});
  await page.evaluate("document.querySelector('.terminal-resizer').focus();");await key('Home');await delay(160);await inside();
  assert.deepEqual(await preference(),{remember:true,position:finalA});
  // A second draft has no preference, then receives its own manual position.
  await setup();await start();
  const b=await page.evaluate('return workspace.controller.getState().activeDraftId;');
  assert.notEqual(a,b); assert.deepEqual(await preference(),{remember:false});
  await move(-130,-80); await click(checkbox); const finalB=(await preference()).position;
  assert.notDeepEqual(finalA,finalB);
  await page.evaluate('await workspace.controller.flush();');
  await page.evaluate('await workspace.controller.switchDraft('+JSON.stringify(a)+');');await start();
  assert.deepEqual(await shown(),finalA);
  await page.evaluate('await workspace.controller.switchDraft('+JSON.stringify(b)+');');await start();
  assert.deepEqual(await shown(),finalB);
  // Canonical JSON and manual Save retain this preference.
  const exported=await page.evaluate('const r=await workspace.controller.save("Position B");if(!r.ok)throw Error(JSON.stringify(r));return workspace.controller.recoveryDocument();');
  assert.deepEqual(exported.topology.ui.pingAnimationPosition,{remember:true,position:finalB});
  const imported=await page.evaluate('const r=await workspace.controller.openDocument('+JSON.stringify(exported)+');if(!r.ok)throw Error(JSON.stringify(r));return r.value;');await start();
  assert.deepEqual(await shown(),finalB);
  // Actual F5 in the same disposable origin/database restores only document data.
  await page.evaluate('await workspace.controller.flush();workspace.dispose();');
  await page.send('Page.reload',{ignoreCache:true});await wait("document.readyState==='complete'&&document.getElementById('root')");
  await page.evaluate(`window.entry=await import('/src/workspace/reviewEntry.tsx');window.store=(await import('/src/store.ts')).useStore;window.sim=(await import('/src/sim.ts')).sim;window.theme=(await import('/src/uiTheme.ts')).useUiTheme;window.probe=await import('/src/workspace/viewportProbe.browser.tsx');window.terminals=await import('/src/terminals.ts');window.workspace=await entry.mountWorkspaceReview(document.getElementById('root'),{databaseName:${JSON.stringify(database)}});`);
  await wait("document.querySelector('.react-flow')");await delay(150);await page.evaluate('window.flow=probe.getViewportProbe();');await start();assert.deepEqual(await shown(),finalB);
  const directory=path.join(root,'.playwright-mcp/reviews/ping-position/referencias-chatgpt');await mkdir(directory,{recursive:true});
  for(const selectedTheme of ['graphite-dark','classic-light'])for(const [language,label]of [['de','Position merken'],['en','Remember position'],['pt-BR','Lembrar posição']]){
    await page.evaluate(`theme.getState().setTheme(${JSON.stringify(selectedTheme)});(await import('/src/i18n/index.ts')).useLanguage.getState().setLanguage(${JSON.stringify(language)});`);await delay(60);
    assert.equal(await page.evaluate('return document.querySelector('+JSON.stringify(checkbox)+').parentElement.textContent;'),label);
    await inside();
    if(language==='de'){const png=await page.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(directory,selectedTheme+'.png'),Buffer.from(png.data,'base64'));}
  }
  await click(checkbox);await delay(80);assert.deepEqual(await preference(),{remember:false});
  assert(await page.evaluate("const b=document.querySelector('.ping-animation-control').getBoundingClientRect(),c=document.querySelector('.canvas').getBoundingClientRect();return Math.abs((b.left+b.right)/2-(c.left+c.right)/2)<2&&Math.abs(c.bottom-b.bottom-56)<2;"));
  await page.evaluate('await workspace.controller.switchDraft('+JSON.stringify(a)+');');await start();
  assert.deepEqual(await preference(),{remember:true,position:finalA});
  await page.evaluate('await workspace.controller.switchDraft('+JSON.stringify(b)+');');await start();
  assert.deepEqual(await preference(),{remember:true,position:finalB});
  // Opt-out belongs to the imported draft, not the original B or A.
  await page.evaluate('await workspace.controller.switchDraft('+JSON.stringify(imported)+');');await start();
  assert.deepEqual(await preference(),{remember:false});
}
