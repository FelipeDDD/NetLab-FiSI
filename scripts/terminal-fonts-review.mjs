import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import path from 'node:path';
import { preview } from 'vite';

// Real production preview, in the existing harness's disposable Chromium profile.
export async function runTerminalFontsReview({ page, root, report }) {
  const probe = createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const server = await preview({ configFile: path.join(root, 'vite.config.ts'), preview: { port, host: '127.0.0.1', strictPort: true, open: false } });
  const origin = `http://127.0.0.1:${port}`;
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const wait = async expression => {
    for (let i = 0; i < 160; i++) { if (await page.evaluate(`return !!(${expression});`)) return; await delay(40); }
    throw Error('Timed out: ' + expression);
  };
  const test = async (name, run) => { try { await run(); report.results[name] = { passed: true }; } catch (error) { report.results[name] = { passed: false, error: error.stack }; throw error; } };
  const fonts = () => page.evaluate('return performance.getEntriesByType("resource").filter(r=>r.name.includes("/assets/fonts/")).map(r=>({url:r.name,bytes:r.transferSize}));');
  const reload = async () => {
    const previous = await page.evaluate('return performance.timeOrigin;');
    await page.send('Page.reload');
    await wait(`performance.timeOrigin!==${previous}&&document.readyState==='complete'&&document.querySelector('.react-flow__node')`);
  };
  const settings = async () => {
    if (!await page.evaluate('return !!document.querySelector("#terminal-settings");')) await page.evaluate('document.querySelector(".terminal-settings-trigger").click();');
    await wait('document.querySelector("#terminal-settings select")');
  };
  const select = async font => {
    await settings();
    await page.evaluate(`const s=[...document.querySelectorAll('#terminal-settings select')].find(s=>[...s.options].some(o=>o.value==='jetbrains-mono'));s.value=${JSON.stringify(font)};s.dispatchEvent(new Event('change',{bubbles:true}));`);
  };
  const grid = () => page.evaluate(`const rows=document.querySelector('.xterm-rows'),screen=document.querySelector('.xterm-screen'),host=document.querySelector('.term-host');const css=getComputedStyle(rows);return {family:css.fontFamily,size:css.fontSize,ligatures:css.fontVariantLigatures,features:css.fontFeatureSettings,text:rows.textContent,width:screen.getBoundingClientRect().width,host:host.clientWidth,height:screen.getBoundingClientRect().height};`);
  const globalSettings = async () => {
    await page.evaluate('document.querySelector(".toolbar-menu-trigger[aria-haspopup=dialog]").click();');
    await wait('document.querySelector("#canvas-background-choice")');
  };
  const canvasState = () => page.evaluate(`return {choice:document.querySelector('#canvas-background-choice').value,intensity:Number(document.querySelector('#canvas-background-intensity').value),dots:document.querySelector('.background-dots-choice input').checked,animation:document.querySelector('#background-animation').value};`);
  const terminalState = () => page.evaluate(`const p=document.querySelector('#terminal-settings'),s=[...p.querySelectorAll('select')];return {style:p.querySelector('[aria-label="Background style"]').value,variation:p.querySelector('[aria-label="Variation"]')?.value,intensity:Number(p.querySelector('.terminal-intensity-label input').value),fontFamily:s.find(s=>[...s.options].some(o=>o.value==='consolas')).value,fontSize:Number(s.find(s=>[...s.options].some(o=>o.textContent==='14 px')).value),experimental:p.querySelector('.terminal-experimental-toggle input').checked};`);
  const openTerminal = async () => {
    await page.evaluate('document.querySelector(".react-flow__node").dispatchEvent(new MouseEvent("click",{bubbles:true}));');
    await wait('document.querySelector(".host-os-terminal button")');
    await page.evaluate('document.querySelector(".host-os-terminal button").click();');
    await wait('document.querySelector(".xterm-rows")');
  };
  const defaultTerminal = {style:'Signal / Wireframe',variation:'fx-signal-pulse',intensity:100,fontFamily:'consolas',fontSize:14,experimental:false};
  let script;
  try {
    await page.send('Emulation.setDeviceMetricsOverride', {width:1440,height:900,deviceScaleFactor:1,mobile:false});
    await test('terminal fonts preview: homepage and editor without terminals fetch no fonts', async () => {
      await page.send('Page.navigate', { url: origin + '/' }); await wait('document.querySelector(".home-footer")');
      await delay(150); assert.deepEqual(await fonts(), []);
      assert.equal(await page.evaluate('return localStorage.getItem("netlab:canvas-background:v1");'), null);
      assert.deepEqual(await page.evaluate('return (await indexedDB.databases()).map(d=>d.name);'), []);
      await page.send('Page.navigate', { url: origin + '/app.html' }); await wait('document.querySelector(".react-flow")');
      await delay(150); assert.deepEqual(await fonts(), []);
    });
    await test('visual defaults preview: first access has exact canvas defaults without storing a canvas preference', async () => {
      await globalSettings();
      assert.deepEqual(await canvasState(), {choice:'bg2',intensity:100,dots:false,animation:'shooting'});
      assert.equal(await page.evaluate('return document.documentElement.dataset.uiTheme;'), 'graphite-dark');
      assert.equal(await page.evaluate('return document.querySelector("#ui-theme-choice").value;'), 'graphite-dark');
      assert.equal(await page.evaluate('return localStorage.getItem("netlab:ui-theme:v1");'), null);
      assert(await page.evaluate('return getComputedStyle(document.querySelector(".react-flow")).backgroundImage.includes("background-blue-circuit.png");'));
      assert.equal(await page.evaluate('return localStorage.getItem("netlab:canvas-background:v1");'), null);
      await page.evaluate('document.querySelector(".toolbar-menu-trigger[aria-haspopup=dialog]").click();');
      assert.deepEqual(await fonts(), []);
    });
    await test('terminal fonts preview: real xterm loads only selected regular/bold fonts and keeps unfinished commands', async () => {
      await page.evaluate('document.querySelector(".palette-item.kind-host").click();');
      await wait('document.querySelector(".react-flow__node")');
      await page.evaluate('document.querySelector(".react-flow__node").dispatchEvent(new MouseEvent("click",{bubbles:true}));');
      await wait('document.querySelector(".host-os-terminal button")');
      await page.evaluate('document.querySelector(".host-os-terminal button").click();'); await wait('document.querySelector(".xterm-rows")');
      await delay(150);
      const initial = await grid(); assert.equal(initial.size, '14px');
      await settings(); assert.deepEqual(await terminalState(), defaultTerminal);
      await page.evaluate('document.querySelector(".terminal-settings-trigger").click();');
      await page.evaluate('document.querySelector(".xterm-helper-textarea").focus();');
      await page.send('Input.insertText', { text: 'echo font-test => != <=' });
      await wait('document.querySelector(".xterm-rows").textContent.includes("font-test")');
      const selections = [['jetbrains-mono', 'NetLab JetBrains Mono'], ['fira-code', 'NetLab Fira Code'], ['ibm-plex-mono', 'NetLab IBM Plex Mono'], ['source-code-pro', 'NetLab Source Code Pro']];
      report.terminalFonts = [];
      for (const [id, family] of selections) {
        await select(id);
        await wait(`getComputedStyle(document.querySelector('.xterm-rows')).fontFamily.split(',')[0].replaceAll('"','').trim()===${JSON.stringify(family)}`);
        await wait(`[...document.fonts].filter(f=>f.family.replaceAll('"','')===${JSON.stringify(family)}&&f.status==='loaded').length===2`);
        await delay(75);
        const state = await grid();
        assert(state.text.includes('font-test => != <=')); assert.equal(state.ligatures, 'none');
        assert(state.features.includes('"liga" 0') && state.features.includes('"calt" 0'));
        assert(state.width > 100 && state.width <= state.host && state.height > 20);
        const loaded = await page.evaluate(`return [...document.fonts].filter(f=>f.family.replaceAll('"','')===${JSON.stringify(family)}).map(f=>({status:f.status,weight:f.weight}));`);
        assert.deepEqual(loaded.map(f=>f.status), ['loaded','loaded']);
        report.terminalFonts.push({ id, ...state, text: undefined, loaded });
        const requests = (await fonts()).filter(r => r.url.includes('/' + id + '/'));
        assert.equal(requests.length, 2);
      }
      const count = (await fonts()).length;
      await select('jetbrains-mono'); await delay(100);
      assert.equal((await fonts()).length, count, 'Reselecting an already loaded font must reuse its bytes');
      // Leave the new font selected long enough for the normal draft writer.
      await delay(650);
    });
    await test('terminal fonts preview: reload preserves the selected font, and missing Consolas uses JetBrains without rewriting preference', async () => {
      await reload();
      await page.evaluate('document.querySelector(".react-flow__node").dispatchEvent(new MouseEvent("click",{bubbles:true}));');
      await wait('document.querySelector(".host-os-terminal button")');
      await page.evaluate('document.querySelector(".host-os-terminal button").click();'); await wait('document.querySelector(".xterm-rows")');
      await settings();
      assert.equal(await page.evaluate('return [...document.querySelectorAll("#terminal-settings select")].find(s=>[...s.options].some(o=>o.value==="jetbrains-mono")).value;'), 'jetbrains-mono');
      await wait('getComputedStyle(document.querySelector(".xterm-rows")).fontFamily.startsWith(\'"NetLab JetBrains Mono"\')');
      // Simulate a device without local Consolas; render the actual free font.
      const nativeProbe = `const NativeFontFace=window.FontFace;window.FontFace=class extends NativeFontFace {constructor(f,s,d){super(f,s,d);this.missing=s==='local("Consolas")';}load(){if(this.missing){window.consolasProbeRejected=true;return Promise.reject(new DOMException('Unavailable local font','NetworkError'));}return super.load();}};`;
      script = (await page.send('Page.addScriptToEvaluateOnNewDocument', { source: nativeProbe })).identifier;
      await reload();
      await page.evaluate('document.querySelector(".react-flow__node").dispatchEvent(new MouseEvent("click",{bubbles:true}));');
      await wait('document.querySelector(".host-os-terminal button")');
      await page.evaluate('document.querySelector(".host-os-terminal button").click();'); await wait('document.querySelector(".xterm-rows")');
      await select('consolas');
      await wait('window.consolasProbeRejected&&getComputedStyle(document.querySelector(".xterm-rows")).fontFamily.startsWith(\'"NetLab JetBrains Mono"\')');
      assert.equal(await page.evaluate('return [...document.querySelectorAll("#terminal-settings select")].find(s=>[...s.options].some(o=>o.value==="jetbrains-mono")).value;'), 'consolas');
      assert.equal((await fonts()).filter(r=>r.url.includes('/jetbrains-mono/')).length, 2);
      report.terminalFontCache = await fonts();
    });
    await test('visual defaults preview: personalized saved plan, new plan, Reset and F5 remain independent', async () => {
      await select('source-code-pro');
      await page.evaluate(`const p=document.querySelector('#terminal-settings'),s=p.querySelector('[aria-label="Background style"]');s.value='dual-glow';s.dispatchEvent(new Event('change',{bubbles:true}));const n=[...p.querySelectorAll('select')].find(s=>[...s.options].some(o=>o.textContent==='14 px'));n.value='16';n.dispatchEvent(new Event('change',{bubbles:true}));const r=p.querySelector('.terminal-intensity-label input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(r,'43');r.dispatchEvent(new Event('input',{bubbles:true}));`);
      const custom = await terminalState();
      assert.deepEqual(custom, {style:'dual-glow',intensity:43,fontFamily:'source-code-pro',fontSize:16,experimental:false});
      await globalSettings();
      await page.evaluate(`const s=document.querySelector('#canvas-background-choice');s.value='verde2';s.dispatchEvent(new Event('change',{bubbles:true}));const r=document.querySelector('#canvas-background-intensity');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(r,'37');r.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('.background-dots-choice input').click();`);
      const canvas = await canvasState();
      assert.deepEqual(canvas, {choice:'verde2',intensity:37,dots:false,animation:'off'});
      await page.evaluate('document.querySelector(".toolbar-menu-trigger[aria-haspopup=dialog]").click();document.querySelector(".toolbar-menu-trigger").click();');
      await wait('document.querySelector("#toolbar-file-menu")');
      await page.evaluate('[...document.querySelectorAll("#toolbar-file-menu button")].find(b=>b.textContent.trim()==="Speichern").click();');
      await wait('document.querySelector(".workspace-name-label input")');
      await page.evaluate(`const i=document.querySelector('.workspace-name-label input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'Visual defaults saved');i.dispatchEvent(new Event('input',{bubbles:true}));`);
      await page.evaluate('document.querySelector(".workspace-dialog form").requestSubmit();');
      await wait('document.querySelector(".workspace-tab-name")?.textContent==="Visual defaults saved"&&!document.querySelector(".workspace-dialog")');
      await page.evaluate('document.querySelector(".workspace-add").click();');
      await wait('document.querySelectorAll(".workspace-tab-name").length===2&&!document.querySelector(".react-flow__node")');
      await globalSettings(); assert.deepEqual(await canvasState(), canvas);
      await page.evaluate('document.querySelector(".toolbar-menu-trigger[aria-haspopup=dialog]").click();document.querySelector(".palette-item.kind-host").click();');
      await wait('document.querySelector(".react-flow__node")'); await openTerminal();
      await settings(); assert.deepEqual(await terminalState(), defaultTerminal);
      await select('courier');
      await page.evaluate('document.querySelector("#terminal-settings .terminal-settings-reset button").click();');
      assert.deepEqual(await terminalState(), defaultTerminal);
      await delay(650); await reload(); await openTerminal();
      await settings(); assert.deepEqual(await terminalState(), defaultTerminal);
      await globalSettings(); assert.deepEqual(await canvasState(), canvas);
      await page.evaluate('document.querySelector(".toolbar-menu-trigger[aria-haspopup=dialog]").click();[...document.querySelectorAll(".workspace-tab-name")].find(t=>t.textContent==="Visual defaults saved").closest("button").click();');
      await wait('document.querySelector(".workspace-tab-wrap[data-active=true] .workspace-tab-name")?.textContent==="Visual defaults saved"&&!document.querySelector(".app").inert');
      await wait('document.querySelector(".react-flow__node")'); await openTerminal();
      await settings(); assert.deepEqual(await terminalState(), custom);
      await globalSettings(); assert.deepEqual(await canvasState(), canvas);
    });
    await test('UI theme preview: saved and legacy themes survive F5 without changing the canvas', async () => {
      const canvas = await page.evaluate('return localStorage.getItem("netlab:canvas-background:v1");');
      for (const [saved, expected, label] of [
        ['original','original','Midnight Blue'], ['graphite-dark','graphite-dark','Graphite Dark'],
        ['classic-light','classic-light','Classic Light'], ['deep-teal','deep-teal','Deep Teal'],
        ['slate-gray','slate-gray','Slate Gray'], ['midnight-blue','original','Midnight Blue'],
      ]) {
        await page.evaluate(`localStorage.setItem('netlab:ui-theme:v1',${JSON.stringify(saved)});`);
        await reload();
        assert.equal(await page.evaluate('return document.documentElement.dataset.uiTheme;'), expected);
        await globalSettings();
        assert.deepEqual(await page.evaluate('const s=document.querySelector("#ui-theme-choice");return {id:s.value,label:s.selectedOptions[0].textContent};'), {id:expected,label});
        assert.equal(await page.evaluate('return localStorage.getItem("netlab:ui-theme:v1");'), saved);
        assert.equal(await page.evaluate('return localStorage.getItem("netlab:canvas-background:v1");'), canvas);
        assert.deepEqual(await canvasState(), JSON.parse(canvas));
      }
      // Actual selector interaction preserves the original ID under its new label.
      await page.evaluate('const s=document.querySelector("#ui-theme-choice");s.value="original";s.dispatchEvent(new Event("change",{bubbles:true}));');
      await reload();
      assert.equal(await page.evaluate('return localStorage.getItem("netlab:ui-theme:v1");'), 'original');
      assert.equal(await page.evaluate('return document.documentElement.dataset.uiTheme;'), 'original');
      assert.equal(await page.evaluate('return localStorage.getItem("netlab:canvas-background:v1");'), canvas);
    });
  } finally {
    if (script) await page.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: script });
    await new Promise((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve()));
  }
}
