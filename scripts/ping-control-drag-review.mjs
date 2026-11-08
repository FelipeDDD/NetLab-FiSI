import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function reviewImmediatePingDrag({ page, wait, start, trigger, mode, report }) {
  await page.evaluate(`window.pingPanelAppearedAt=null;window.pingPanelStartedAt=performance.now();window.pingPanelObserver=new MutationObserver(()=>{if(document.querySelector('.ping-animation-drag-handle')){pingPanelAppearedAt??=performance.now();pingPanelObserver.disconnect();}});pingPanelObserver.observe(document.querySelector('.canvas'),{childList:true,subtree:true});${start}`);
  await trigger?.();
  await wait("document.querySelector('.ping-animation-drag-handle')");
  const before=await page.evaluate("const h=document.querySelector('.ping-animation-drag-handle'),r=h.getBoundingClientRect(),p=h.parentElement;window.pingPanelPointerAt=performance.now();return {x:r.left+35,y:r.top+r.height/2,left:p.offsetLeft,top:p.offsetTop,viewport:document.querySelector('.react-flow__viewport').style.transform,positions:store.getState().nodes.map(n=>n.position),hit:!!document.elementFromPoint(r.left+35,r.top+r.height/2)?.closest('.ping-animation-drag-handle')};");
  assert(before.hit,'Header must be the actual hit target on first appearance');
  await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:before.x,y:before.y});
  await page.send('Input.dispatchMouseEvent',{type:'mousePressed',x:before.x,y:before.y,button:'left',buttons:1,clickCount:1});
  for(let n=1;n<=3;n++){
    await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:before.x+70*n/3,y:before.y-60*n/3,button:'left',buttons:1});
    await new Promise(resolve=>setTimeout(resolve,16));
  }
  await page.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:before.x+70,y:before.y-60,button:'left',clickCount:1});
  const after=await page.evaluate("const p=document.querySelector('.ping-animation-control');return {left:p.offsetLeft,top:p.offsetTop,viewport:document.querySelector('.react-flow__viewport').style.transform,positions:store.getState().nodes.map(n=>n.position),shownAfter:pingPanelAppearedAt-pingPanelStartedAt,dragAfter:pingPanelPointerAt-pingPanelAppearedAt,note:!!p.querySelector('.ping-animation-note')};");
  assert(Math.abs(after.left-before.left-70)<2&&Math.abs(after.top-before.top+60)<2,JSON.stringify({mode,before,after}));
  assert(after.dragAfter<1000,`Immediate drag was not attempted early enough: ${after.dragAfter}ms`);
  assert.equal(after.note,false);assert.equal(after.viewport,before.viewport);assert.deepEqual(after.positions,before.positions);
  (report.immediatePingDrag??=[]).push({mode,shownAfter:after.shownAfter,dragAfter:after.dragAfter});
}

export async function reviewPingControlDrag({ page, root, click, key, delay }) {
  const directory=path.join(root,'.playwright-mcp/reviews/ping-control-drag/referencias-chatgpt');await mkdir(directory,{recursive:true});
  const capture=async name=>{const png=await page.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(directory,name+'.png'),Buffer.from(png.data,'base64'));};
  const geometry = () => page.evaluate("const b=document.querySelector('.ping-animation-control'),c=document.querySelector('.canvas'),d=document.querySelector('.terminal-dock');return {bar:b.getBoundingClientRect().toJSON(),canvas:c.getBoundingClientRect().toJSON(),dock:d.getBoundingClientRect().toJSON(),viewport:document.querySelector('.react-flow__viewport').style.transform,nodes:store.getState().nodes.map(n=>({id:n.id,position:n.position}))};");
  const inside = g => {
    assert(g.bar.left>=g.canvas.left-1&&g.bar.right<=g.canvas.right+1);
    assert(g.bar.top>=g.canvas.top-1&&g.bar.bottom<=Math.min(g.canvas.bottom,g.dock.top)+1);
  };
  const drag = async (dx,dy) => {
    const p=await page.evaluate("const r=document.querySelector('.ping-animation-drag-handle').getBoundingClientRect();return {x:r.x+35,y:r.y+r.height/2};");
    await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',...p});
    await page.send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',buttons:1,clickCount:1});
    await delay(40);
    assert.equal(await page.evaluate("return getComputedStyle(document.querySelector('.ping-animation-drag-handle')).cursor;"),'grabbing');
    for(let step=1;step<=5;step++) {
      await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x+dx*step/5,y:p.y+dy*step/5,button:'left',buttons:1});
      await delay(20);
    }
    await delay(80);
    await page.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x+dx,y:p.y+dy,button:'left',clickCount:1});
    await delay(70);
  };
  const original=await geometry();inside(original);
  assert(Math.abs((original.bar.left+original.bar.right)/2-(original.canvas.left+original.canvas.right)/2)<2);
  assert.equal(await page.evaluate("return getComputedStyle(document.querySelector('.ping-animation-drag-handle')).cursor;"),'grab');
  await drag(120,-130);const moved=await geometry();inside(moved);
  assert(Math.abs(moved.bar.left-original.bar.left-120)<2&&Math.abs(moved.bar.top-original.bar.top+130)<2,JSON.stringify({original,moved}));
  await capture('01-painel-movido-tema-escuro');
  // Native pointer input on the slider changes speed without moving the panel.
  await click('#ping-animation-speed');const slider=await geometry();
  assert.equal(slider.bar.x,moved.bar.x);assert.equal(slider.bar.y,moved.bar.y);
  const speed=await page.evaluate('return store.getState().packetAnimationSpeed;');assert([0.25,0.5,1,2].includes(speed));
  await drag(4000,4000);inside(await geometry());
  await drag(-4000,-4000);inside(await geometry());
  await drag(4000,4000);inside(await geometry());
  // Dock geometry changes propagate through the canvas ResizeObserver.
  await page.evaluate("document.querySelector('.terminal-resizer').focus();");await key('End');await delay(150);inside(await geometry());
  const tall=await geometry();assert(tall.dock.height>original.dock.height);
  await page.evaluate("document.querySelector('.terminal-resizer').focus();");await key('Home');await delay(150);inside(await geometry());
  assert((await geometry()).dock.height<tall.dock.height);
  await page.send('Emulation.setDeviceMetricsOverride',{width:700,height:700,deviceScaleFactor:1,mobile:false});await delay(180);inside(await geometry());
  await page.evaluate("theme.getState().setTheme('classic-light');");await delay(100);
  await capture('02-painel-movido-tema-claro');
  await page.send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});await delay(150);
  await page.evaluate("theme.getState().setTheme('graphite-dark');document.querySelector('.ping-animation-drag-handle').focus();");
  await key('ArrowRight');await delay(60);inside(await geometry());
  const after=await geometry();assert.deepEqual(after.nodes,original.nodes);assert.equal(after.viewport,original.viewport);
}
