import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { generateReview } from './visual-review.mjs';

/** Runs exclusively in the existing harness's disposable profile and origin. */
export async function runJourneyReview({ page, url, root, report }) {
  const origin = new URL(url).origin, directory = path.join(root, '.playwright-mcp', 'journey-' + Date.now());
  await mkdir(directory, { recursive: true });
  const captures = [], delay = ms => new Promise(r => setTimeout(r, ms));
  const wait = async condition => { for (let i = 0; i < 250; i++) { if (await page.evaluate(`return !!(${condition});`)) return; await delay(40); } throw Error('Timed out: ' + condition); };
  const test = async (name, run) => { if(process.env.NETLAB_JOURNEY_REVIEW_FILTER&&!name.includes(process.env.NETLAB_JOURNEY_REVIEW_FILTER))return;page.labelDownloads(name); try { await run(); report.results[name] = { passed: true }; } catch (e) { report.results[name] = { passed: false, error: e.stack }; throw e; } };
  const navigate = async route => { await page.send('Page.navigate', { url: origin + route }); await wait(`location.href === ${JSON.stringify(origin + route)} && document.readyState === 'complete'`); };
  const home = async (demo = '', manual = true, alternate = false, dataPreview = false, continuous = false) => {
    const query = new URLSearchParams();
    if (demo) query.set('demo', demo);
    if (!alternate) query.set('stations', 'original');
    if (!dataPreview) query.set('dataPreview', '0');
    if (continuous) query.set('scrollMotion', 'continuous');
    await navigate('/' + (query.size ? '?' + query : ''));
    await wait('document.querySelector(".journey-page")'); await delay(200);
    if (demo !== 'scroll') {
      await wait('document.querySelector(".journey-scenes").dataset.assets === "ready"');
      if (manual) { await page.evaluate('document.querySelector(".journey-scenes").scrollIntoView({block:"center"});'); await delay(100); await click('[data-scene="0"]'); await wait('document.querySelector(".journey-scenes").dataset.seeking==="false"'); await page.evaluate('scrollTo(0,0);'); }
    }
  };
  const click = async selector => page.evaluate(`document.querySelector(${JSON.stringify(selector)}).click();`);
  const select = async (selector, value) => {
    // Legacy contrast checks may still render other themes in the disposable page.
    // This is test-only DOM styling, not a homepage control or saved preference.
    if (selector === '.home-theme select' && !await page.evaluate('return !!document.querySelector(".home-theme select");')) {
      await page.evaluate(`document.documentElement.dataset.uiTheme=${JSON.stringify(value)};`);
    } else await page.evaluate(`const el=document.querySelector(${JSON.stringify(selector)});el.value=${JSON.stringify(value)};el.dispatchEvent(new Event('change',{bubbles:true}));`);
    await delay(100);
  };
  const size = async (width, height = 950) => { await page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }); await delay(200); };
  const sceneProgress = index => page.evaluate(`return Number(document.querySelector('[data-scene="${index}"]').dataset.progress);`);
  const progress = selector => page.evaluate(`return Number(document.querySelector('${selector}').dataset.progress);`);
  const scrollTo = async y => { await page.evaluate(`window.scrollTo(0,${y});`); await delay(700); await wait('!document.querySelector(".journey-stations") || document.querySelector(".journey-stations").dataset.animating==="false"'); };
  const shot = async (scene, variant, width, share = false) => {
    assert(await page.evaluate('return document.documentElement.scrollWidth <= innerWidth;'), 'Horizontal overflow');
    const file = path.join(directory, `${scene}-${width}.png`), image = await page.send('Page.captureScreenshot', { format: 'png' });
    const bytes=Buffer.from(image.data,'base64');await writeFile(file,bytes);
    captures.push({ source: path.relative(root, file).replaceAll('\\', '/'), scene, variant, state: 'normal', width:bytes.readUInt32BE(16), height:bytes.readUInt32BE(20), share });
  };
  const controlsShot = async () => {
    const clip=await page.evaluate(`const r=document.querySelector('.journey-scenes').getBoundingClientRect();return {x:Math.round(r.left+r.width/2-360),y:Math.round(r.bottom-240),width:720,height:240,scale:1};`);
    const file=path.join(directory,'controls-after.png'),image=await page.send('Page.captureScreenshot',{format:'png',clip});await writeFile(file,Buffer.from(image.data,'base64'));
    captures.push({source:path.relative(root,file).replaceAll('\\','/'),scene:'controls-after',variant:'graphite-dark',state:'normal',width:720,height:240});
  };
  const saved = await page.evaluate('return {storage:Object.fromEntries(Object.entries(localStorage)),databases:(await indexedDB.databases()).map(d=>d.name).sort()};');
  try {
    await test('journey: official root enables approved defaults without loading or mutating the workspace', async () => {
      await size(1440); await navigate('/');
      await wait('document.querySelector(".journey-scenes")?.dataset.assets==="ready"');
      await wait('document.querySelector(".journey-scenes").dataset.animating==="true"');
      assert.equal(await page.evaluate('return location.pathname+location.search;'),'/');
      assert.equal(await page.evaluate('return document.documentElement.dataset.uiTheme;'),'graphite-dark');
      assert(await page.evaluate('return !!document.querySelector(".journey-scroll-alternate") && document.querySelector(".journey-stations").dataset.motion==="stations";'));
      assert.equal(await page.evaluate('return document.querySelector(".journey-scenes").dataset.preview;'),'true');
      assert.equal(await page.evaluate('return document.querySelectorAll(".journey-data-document").length;'),2);
      assert.deepEqual(await page.evaluate('return Object.fromEntries(Object.entries(localStorage));'),saved.storage);
      assert.deepEqual(await page.evaluate('return (await indexedDB.databases()).map(d=>d.name).sort();'),saved.databases);
      assert(!await page.evaluate('return performance.getEntriesByType("resource").some(r=>["/src/store.ts","/src/sim.ts","/src/engine/","WorkspaceApplication","xterm","/src/home/recentPlans.ts"].some(s=>r.name.includes(s)));'));
      report.officialRootMatrix=[];
      for(const language of ['de','en','pt-BR']) {
        await select('.language-selector select',language);await page.send('Page.reload');
        await wait('document.querySelector(".journey-scenes")?.dataset.assets==="ready"');
        assert.equal(await page.evaluate('return document.documentElement.lang;'),language);
        assert(!await page.evaluate('return !!document.querySelector(".journey-variants,a[href*=experience],.home-theme") || /EXPERIMENT|PROTOTYP/i.test(document.body.innerText);'));
        for(const width of [390,700,1440]) {
          await size(width);await page.evaluate('document.querySelector(".journey-scenes").scrollIntoView({block:"center"});');
          await click('[data-scene="0"]');await wait('document.querySelector(".journey-scenes").dataset.seeking==="false"');
          if(language==='en'&&width===1440) {
            await click('[data-action="play"]');await wait('Number(document.querySelector(".journey-scenes").dataset.progress)>.035');await click('[data-action="play"]');
            assert(Number(await page.evaluate('return document.querySelector("[data-document=source]").getAttribute("opacity");'))>0);
          }
          await page.evaluate('scrollTo(0,0);');await delay(120);
          assert.equal(await page.evaluate('return location.search;'),'');
          await shot(`official-${language.toLowerCase()}`,'graphite-dark',width);
          report.officialRootMatrix.push({language,width});
        }
      }
      await select('.language-selector select','en');
      await page.evaluate('document.querySelector(".journey-terminal-showcase").scrollIntoView({block:"start"});');await wait('document.querySelector(".journey-terminal-showcase").dataset.complete==="true"');
      await shot('official-terminals','graphite-dark',1440);
      await page.evaluate('document.querySelector(".journey-scroll").scrollIntoView({block:"start"});');await delay(1200);
      await shot('official-stations','graphite-dark',1440);
      await page.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
      await navigate('/');await wait('document.querySelector(".journey-scenes")?.dataset.assets==="ready"');
      assert(await page.evaluate('return document.querySelector("[data-action=play]").disabled && document.querySelectorAll(".journey-feature[data-reached=true]").length===5;'));
      await page.send('Emulation.setEmulatedMedia',{features:[]});
      await navigate('/?experience=journey&stations=alternate&dataPreview=1');await wait('document.querySelector(".journey-scroll-alternate")');
      assert(!await page.evaluate('return !!document.querySelector(".journey-variants");'));
      await page.evaluate(`const saved=${JSON.stringify(saved.storage)};for(const k of Object.keys(localStorage))if(!(k in saved))localStorage.removeItem(k);for(const[k,v]of Object.entries(saved))localStorage.setItem(k,v);`);
      await home();
    });
    await test('journey: final polish navigation, languages and preserved preferences', async () => {
      await size(1440); await home('',true,true,true);
      await select('.language-selector select','en');
      const baseline = process.env.NETLAB_JOURNEY_POLISH_BEFORE === '1';
      if (baseline) await select('.home-theme select','graphite-dark');
      await shot(baseline?'polish-hero-before':'polish-hero-after','graphite-dark',1440);
      await page.evaluate('document.querySelector(".journey-terminal-showcase").scrollIntoView({block:"start"});'); await delay(3400);
      await shot(baseline?'polish-terminals-before':'polish-terminals-after','graphite-dark',1440);
      await page.evaluate('document.querySelector(".journey-scroll").scrollIntoView({block:"start"});'); await delay(1200);
      await shot(baseline?'polish-stations-before':'polish-stations-after','graphite-dark',1440);
      report.polishActivation = await page.evaluate(`const cards=[...document.querySelectorAll('.journey-feature')],a=cards[0].querySelector('[data-station-port]').getBoundingClientRect(),b=cards[1].querySelector('[data-station-port]').getBoundingClientRect(),r=cards[1].getBoundingClientRect();const trigger=(a.top+a.height/2+b.top+b.height/2)/2+14-innerHeight*.58;return {viewport:innerHeight,nextCenterAtTrigger:b.top+b.height/2-trigger,panelTopAtTrigger:r.top-trigger,panelBottomAtTrigger:r.bottom-trigger};`);
      if (baseline) { report.polishCaptures=captures; return; }
      assert(!await page.evaluate('return !!document.querySelector(".home-theme");'));
      const labels={en:['CONNECTION','SWITCH PORTS','ROUTING','PACKET CAPTURE','QUICK CHECK'],de:['VERBINDUNG','SWITCH-PORTS','ROUTING','PAKETMITSCHNITT','KURZCHECK'],'pt-BR':['CONEXÃO','PORTAS DO SWITCH','ROTEAMENTO','CAPTURA DE PACOTES','TESTE RÁPIDO']};
      const ctas={en:['Start a new project','Continue learning','Browse projects','Explore exercises'],de:['Neues Projekt starten','Weiterlernen','Projekte ansehen','Übungen entdecken'],'pt-BR':['Criar novo projeto','Continuar aprendendo','Ver projetos','Explorar exercícios']};
      report.polishMatrix=[];
      await page.evaluate('localStorage.setItem("netlab:ui-theme:v1","classic-light");localStorage.setItem("netlab:canvas-background:v1",JSON.stringify({choice:"verde2",intensity:50,dots:false,animation:"off"}));');
      const preferences=await page.evaluate('return [localStorage.getItem("netlab:ui-theme:v1"),localStorage.getItem("netlab:canvas-background:v1")];');
      for(const lang of ['de','en','pt-BR']){
        await select('.language-selector select',lang);
        await page.send('Page.reload');await wait('document.querySelector(".journey-stations")');
        assert.equal(await page.evaluate('return document.documentElement.dataset.uiTheme;'),'graphite-dark');
        assert.equal(await page.evaluate('return document.querySelector(".language-selector select").value;'),lang);
        assert.deepEqual(await page.evaluate('return [localStorage.getItem("netlab:ui-theme:v1"),localStorage.getItem("netlab:canvas-background:v1")];'),preferences);
        assert.deepEqual(await page.evaluate('return [...document.querySelectorAll(".journey-example > span")].map(el=>el.textContent);'),labels[lang]);
        const actions=await page.evaluate('return [...document.querySelectorAll(".home-actions a,.journey-entry-links a")].map(a=>({text:a.textContent.replace(/[↗→]/g,"").trim(),href:a.getAttribute("href")}));');
        assert.deepEqual(actions.map(a=>a.text),ctas[lang]);
        assert.deepEqual(actions.map(a=>a.href),['./app.html?home=new','./app.html','./app.html?home=load','./app.html?home=exercises']);
        assert.equal(await page.evaluate('return document.querySelector(".journey-terminal > code").textContent;'),'PC → Switch');
        assert(!await page.evaluate('return !!document.querySelector(".journey-switch-example small");'));
        assert.equal(await page.evaluate('return document.querySelectorAll(".journey-port-bank i").length;'),6);
        for(const zoom of [1,1.2])for(const width of [390,700,1440,1920]){
          await page.send('Emulation.setDeviceMetricsOverride',{width:Math.round(width/zoom),height:Math.round(950/zoom),deviceScaleFactor:zoom,mobile:false});
          await page.evaluate('scrollTo(0,0);');await delay(160);
          assert(await page.evaluate('return document.documentElement.scrollWidth<=innerWidth;'));
          await shot(`polish-${lang.toLowerCase()}-${zoom===1?'100':'120'}`,'graphite-dark',width);
          report.polishMatrix.push({lang,zoom,width});
        }
      }
      await size(1440);await select('.language-selector select','en');await scrollTo(0);
      // Evaluate native Windows flag rendering without shipping emoji-only controls.
      await page.evaluate(`for(const option of document.querySelectorAll('.language-selector option')){option.dataset.original=option.textContent;option.textContent=({de:'🇩🇪',en:'🇬🇧','pt-BR':'🇧🇷'})[option.value]+' '+option.textContent;}`);
      await shot('polish-native-flags-trial','graphite-dark',1440);
      await page.evaluate('for(const option of document.querySelectorAll(".language-selector option"))option.textContent=option.dataset.original;');
      await navigate('/?experience=classic');await wait('document.querySelector(".home-topology")');
      assert.equal(await page.evaluate('return document.documentElement.dataset.uiTheme;'),'classic-light');
      await home('',true,true,true);await page.evaluate('localStorage.removeItem("netsim:autosave:v1");');
      await click('.home-actions a[href="./app.html?home=new"]');await wait('document.querySelector(".react-flow")');
      await wait('!location.search.includes("home=")');
      assert.equal(await page.evaluate('return document.querySelectorAll(".react-flow__node").length;'),0);
      assert.equal(await page.evaluate('return document.documentElement.dataset.uiTheme;'),'classic-light');
      await home('',true,true,true);await click('.journey-entry-links a[href="./app.html?home=load"]');await wait('document.querySelector(".workspace-empty-list")');
      await home('',true,true,true);await click('.journey-entry-links a[href="./app.html?home=exercises"]');await wait('document.querySelector(".exercise-menu-entry")');
      await home('',true,true,true);await click('.home-actions a[href="./app.html"]');await wait('document.querySelector(".react-flow")');
      await navigate('/__project_repository_test__');
      await page.evaluate('await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase("netlab-projects");r.onsuccess=resolve;r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error("Isolated cleanup blocked"));});');
      await page.evaluate(`const saved=${JSON.stringify(saved.storage)};for(const k of Object.keys(localStorage))if(!(k in saved))localStorage.removeItem(k);for(const[k,v]of Object.entries(saved))localStorage.setItem(k,v);`);
      report.polishCaptures=[...captures];
      await home();
    });
    await test('journey: static while images decode, then autoplay; manual pause survives visibility and loop stays continuous', async () => {
      await size(1440);
      const gate=await page.send('Page.addScriptToEvaluateOnNewDocument',{source:`{const original=HTMLImageElement.prototype.decode;const pending=[];window.releaseArtwork=()=>pending.splice(0).forEach(release=>release());HTMLImageElement.prototype.decode=function(){return new Promise((resolve,reject)=>pending.push(()=>original.call(this).then(resolve,reject)));};}`});
      try {
        await navigate('/?experience=journey');await wait('document.querySelector(".journey-scenes")');await delay(300);
        assert.equal(await page.evaluate('return document.querySelector(".journey-scenes").dataset.assets;'),'loading');
        assert.equal(await progress('.journey-scenes'),0);assert(await page.evaluate('return !!document.querySelector(".journey-asset-placeholder");'));
        await page.evaluate('releaseArtwork();'); await wait('document.querySelector(".journey-scenes").dataset.animating==="true"');
      } finally {await page.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:gate.identifier});}
      await delay(150); await click('[data-action="play"]');const paused=await progress('.journey-scenes');
      await scrollTo(2000);await scrollTo(0);assert.equal(await progress('.journey-scenes'),paused);
      await click('[data-action="play"]');
      await page.evaluate(`window.loopObservation=undefined;void new Promise(resolve=>{let previous,frames=0;const started=performance.now(),el=document.querySelector('.journey-scenes'),packet=document.querySelector('[data-packet=scenes]');const tick=()=>{const value={cycle:Number(el.dataset.cycles),position:packet.getAttribute('transform')};frames++;if(value.cycle>0){resolve({previous,value,frames});return;}previous=value;if(performance.now()-started>26000){resolve({timeout:true});return;}requestAnimationFrame(tick);};tick();}).then(value=>window.loopObservation=value);`);
      for(let i=0;i<60&&!await page.evaluate("return !!window.loopObservation;");i++) await delay(500);
      const loop=await page.evaluate("return window.loopObservation;");
      assert(!loop.timeout);assert.equal(loop.previous.position,loop.value.position,'Loop restarts at the same PC connector');
      report.autoplayLoop=loop;
      await click('[data-action="play"]');
    });
    await test('journey: failed artwork decode keeps static controls and never starts playback', async () => {
      const gate=await page.send('Page.addScriptToEvaluateOnNewDocument',{source:'HTMLImageElement.prototype.decode=function(){return Promise.reject(Error("Synthetic decode failure"));};'});
      try {
        await navigate('/?experience=journey');await wait('document.querySelector(".journey-scenes")?.dataset.assets==="failed"');
        assert.equal(await progress('.journey-scenes'),0);
        assert(await page.evaluate('return document.querySelector("[data-action=play]").disabled;'));
        await click('[data-scene="2"]');await delay(100);assert.equal(await progress('.journey-scenes'),await sceneProgress(2));
        assert.equal(await page.evaluate('return document.querySelector(".journey-scenes").dataset.animating;'),'false');
      } finally { await page.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:gate.identifier}); }
    });
    await test('journey: comparison overrides leave storage and simulator unloaded', async () => {
      await size(1440); await home();
      assert.deepEqual(await page.evaluate('return Object.fromEntries(Object.entries(localStorage));'), saved.storage);
      assert.deepEqual(await page.evaluate('return (await indexedDB.databases()).map(d=>d.name).sort();'), saved.databases);
      assert(!await page.evaluate('return performance.getEntriesByType("resource").some(r=>["/src/store.ts","/src/sim.ts","/src/engine/","WorkspaceApplication","xterm"].some(s=>r.name.includes(s)));'));
      assert.equal(await progress('.journey-scenes'), 0);
    });
    await test('journey: persistent packet, manual scenes, pause during seek and keyboard', async () => {
      await page.evaluate('window.originalPacket=document.querySelector("[data-packet=scenes]");');
      await click('[data-scene="2"]'); await delay(180);
      const pausePositions=await page.evaluate('const p=document.querySelector("[data-packet=scenes]"),before=p.getAttribute("transform");document.querySelector("[data-action=play]").click();return[before,p.getAttribute("transform")];');
      assert.equal(pausePositions[0],pausePositions[1], 'Pausing a seek must not jump to a timeline hold');
      const stopped = await progress('.journey-scenes'); await delay(300); assert.equal(await progress('.journey-scenes'), stopped);
      assert(stopped > 0 && stopped < await sceneProgress(2));
      await click('[data-scene="1"]'); await wait('document.querySelector(".journey-scenes").dataset.seeking==="false"');
      assert.equal(await progress('.journey-scenes'), await sceneProgress(1));
      await page.evaluate('document.querySelector(".journey-scenes").focus();');
      await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'End', code: 'End' }); await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'End', code: 'End' });
      await wait('document.querySelector(".journey-scenes").dataset.seeking==="false"'); assert.equal(await progress('.journey-scenes'), await sceneProgress(2));
      assert(await page.evaluate('return originalPacket===document.querySelector("[data-packet=scenes]");'));
      await select('.home-theme select', 'graphite-dark'); await click('[data-scene="1"]'); await wait('document.querySelector(".journey-scenes").dataset.seeking==="false"');
      await page.evaluate('document.activeElement.blur();scrollTo(0,0);'); await shot('graphite-scenes', 'graphite-dark', 1440, true);
      await controlsShot();
      await click('[data-scene="2"]'); await wait('document.querySelector(".journey-scenes").dataset.seeking==="false"');
    });
    await test('journey: playback, locale/theme changes and new reply preserve progress', async () => {
      await click('[data-action="play"]'); await delay(500); const before = await progress('.journey-scenes');
      await select('.language-selector select', 'pt-BR'); await select('.home-theme select', 'classic-light');
      assert(await progress('.journey-scenes') > before);
      assert(await page.evaluate('return originalPacket===document.querySelector("[data-packet=scenes]");'));
      await wait('document.querySelector("[data-packet=scenes]").dataset.reply==="true"');
      await click('[data-action="play"]');
      assert(await page.evaluate('return document.querySelector(".journey-protocol").textContent.includes("novo pacote");'));
      await shot('classic-reply', 'classic-light', 1440);
      await click('[data-action="replay"]'); await wait('Number(document.querySelector(".journey-scenes").dataset.progress)<.04');
      await click('[data-action="play"]');
    });
    await test('journey: balanced travel with preserved reading time and exact hero arrival', async () => {
      await click('[data-scene="0"]');await wait('document.querySelector(".journey-scenes").dataset.seeking==="false"');
      await click('[data-action="play"]');
      const samples=await page.evaluate(`return await new Promise(resolve=>{const data=[],start=performance.now(),el=document.querySelector('.journey-scenes');const sample=now=>{data.push({p:Number(el.dataset.progress),travel:Number(el.dataset.travel),ms:Number(el.dataset.progress)*Number(el.dataset.duration)});if(now-start<5500)requestAnimationFrame(sample);else resolve(data);};requestAnimationFrame(sample);});`);
      assert(samples.filter(s=>s.ms<2600).every(s=>s.travel===0), 'Initial scene holds for reading');
      assert(samples.some(s=>s.ms>4900 && s.travel>.3), 'First balanced transfer reaches the switch after 4.86s');
      const hold=samples.filter(s=>s.ms>4900 && s.ms<6000);assert(hold.length>5);assert(hold.every(s=>s.travel===hold[0].travel));
      const distance=await page.evaluate('const packet=document.querySelector("[data-packet=scenes]").getScreenCTM(),r=document.querySelector("[data-hero-device=switch] [data-station-port]").getBoundingClientRect();return Math.hypot(packet.e-r.left-r.width/2,packet.f-r.top-r.height/2);');
      assert(distance<.1); report.heroArrivalError=distance;
      await click('[data-action="play"]');
    });
    await test('journey: scroll advances, reverses and settles with cached geometry', async () => {
      const positions = await page.evaluate(`return [...document.querySelectorAll('.journey-feature [data-station-port]')].map(p=>{const r=p.getBoundingClientRect();return r.top+r.height/2+scrollY-innerHeight*.58;});`);
      await scrollTo(positions[0]); const first = await progress('.journey-stations');
      const measures = await page.evaluate('return document.querySelector(".journey-stations").dataset.measurements;');
      const pageHeight = await page.evaluate('return document.documentElement.scrollHeight;');
      for (let i = 1; i <= 6; i++) { await page.evaluate(`scrollTo(0,${positions[0]+(positions[1]-positions[0])*i/6});`); await delay(40); }
      await wait('document.querySelector(".journey-stations").dataset.animating==="false"');assert(await progress('.journey-stations') > first);
      await scrollTo(positions[4]); const ahead = await progress('.journey-stations'); await scrollTo(positions[0]); assert.equal(await progress('.journey-stations'), first);
      assert(ahead > first);
      assert.equal(await page.evaluate('return document.querySelector(".journey-stations").dataset.measurements;'), measures);
      assert.equal(await page.evaluate('return document.documentElement.scrollHeight;'), pageHeight);
      assert.equal(await page.evaluate('return document.querySelector(".journey-stations").dataset.animating;'), 'false');
      await select('.home-theme select', 'graphite-dark');
      await page.evaluate(`const el=document.querySelector('.journey-stations'),r=el.getBoundingClientRect(),cards=[...el.querySelectorAll('.journey-feature')],port=c=>{const p=c.querySelector('[data-station-port]').getBoundingClientRect();return p.top+p.height/2-r.top};const first=port(cards[0]),last=port(cards.at(-1)),t=Number(cards[1].dataset.threshold);scrollTo(0,r.top+scrollY+(el.dataset.motion==='continuous'?first+t*(last-first):port(cards[1]))-innerHeight*.58);`);await delay(60);await wait('document.querySelector(".journey-stations").dataset.animating==="false"');
      await shot('graphite-scroll', 'graphite-dark', 1440, true);
    });
    await test('journey: F5 at mid-page reconstructs the scroll position; resize remeasures', async () => {
      const y = await page.evaluate('return scrollY;'), before = await progress('.journey-stations');
      await page.send('Page.reload'); await wait('document.querySelector(".journey-stations")?.dataset.progress'); await delay(500);
      assert(Math.abs(await page.evaluate('return scrollY;') - y) < 2, JSON.stringify({before:y,after:await page.evaluate('return scrollY;')}));
      assert(Math.abs(await progress('.journey-stations') - before) < .005);
      const pathBefore = await page.evaluate('return document.querySelector(".journey-scroll-svg path").getAttribute("d");');
      await size(700); assert.notEqual(await page.evaluate('return document.querySelector(".journey-scroll-svg path").getAttribute("d");'), pathBefore);
    });
    await test('journey: station destinations finish after scrolling stops, reverse without jumps and keep geometry cached',async()=>{
      report.scrollComparisons=[];
      for(const continuous of [true,false]){
        await size(1440);await home('',true,true,false,continuous);await select('.home-theme select','graphite-dark');
        const positions=await page.evaluate(`return [...document.querySelectorAll('.journey-feature [data-station-port]')].map(p=>{const r=p.getBoundingClientRect();return r.top+r.height/2+scrollY-innerHeight*.58;});`);
        await scrollTo(positions[0]);
        const measurements=await page.evaluate('return document.querySelector(".journey-stations").dataset.measurements;');
        await page.evaluate(`window.geometryReads=0;window.originalRect=Element.prototype.getBoundingClientRect;Element.prototype.getBoundingClientRect=function(){window.geometryReads++;return originalRect.call(this);};`);
        try {
          // Discrete wheel-like scroll deltas stop before the next activation threshold.
          for(let i=1;i<=5;i++){await page.evaluate(`scrollTo(0,${positions[0]+(positions[1]-positions[0])*.4*i/5});`);await delay(45);}
          await wait('document.querySelector(".journey-stations").dataset.animating==="false"');
          const resting=await progress('.journey-stations'),firstThreshold=await page.evaluate('return Number(document.querySelectorAll(".journey-feature")[1].dataset.threshold);');
          if(continuous)assert(resting>0&&resting<firstThreshold);else assert.equal(resting,0);
          await shot(continuous?'continuous-between-stations':'station-resting-at-connector','graphite-dark',1440);
          if(!continuous){
            await page.evaluate(`scrollTo(0,${(positions[0]+positions[1])/2+20});`);await wait('document.querySelector(".journey-stations").dataset.destination==="1"');
            const moving=await progress('.journey-stations');await wait('document.querySelector(".journey-stations").dataset.animating==="false"');
            assert.equal(await progress('.journey-stations'),Number(firstThreshold.toFixed(6)));assert(moving<firstThreshold);
            const boundary=(positions[0]+positions[1])/2;
            for(const y of [boundary+5,boundary-5,boundary+3]){await page.evaluate(`scrollTo(0,${y});`);await delay(50);assert.equal(await page.evaluate('return document.querySelector(".journey-stations").dataset.destination;'),'1');}
            await scrollTo(positions[0]);await page.evaluate(`scrollTo(0,${positions[2]});`);await wait('document.querySelector(".journey-stations").dataset.destination==="2"');await delay(150);
            const continuity=await page.evaluate(`const root=document.querySelector('.journey-stations'),p=Number(root.dataset.progress);scrollTo(0,${positions[0]});return[p,Number(root.dataset.progress)];`);
            assert(continuity[0]>0);assert.equal(continuity[0],continuity[1]);await wait('document.querySelector(".journey-stations").dataset.destination==="0"');await delay(80);assert(await progress('.journey-stations')<continuity[0]);
            await page.evaluate(`scrollTo(0,${positions[4]});`);await wait('document.querySelector(".journey-stations").dataset.destination==="4"');await wait('document.querySelector(".journey-stations").dataset.animating==="false"');assert.equal(await progress('.journey-stations'),1);
            await scrollTo(positions[0]);
            // Chromium wheel events approximate touchpad deltas; no physical touchpad is driven.
            for(let i=0;i<8;i++){await page.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:1200,y:600,deltaX:0,deltaY:18});await delay(35);}
            await wait('document.querySelector(".journey-stations").dataset.animating==="false"');
          }
          const reads=await page.evaluate('return window.geometryReads;');assert.equal(reads,0,'No layout reads should occur in the motion/scroll handlers');
          assert.equal(await page.evaluate('return document.querySelector(".journey-stations").dataset.measurements;'),measurements);
          report.scrollComparisons.push({mode:continuous?'continuous':'stations',restingProgress:resting,layoutReads:reads});
        } finally {await page.evaluate('Element.prototype.getBoundingClientRect=window.originalRect;');}
      }
      await home();
    });
    await test('journey: terminals introduce once, pause offscreen, show supported syntax and retain progress across language changes', async () => {
      await size(1440);await home();await select('.home-theme select','graphite-dark');
      const top=await page.evaluate('return document.querySelector(".journey-terminal-showcase").getBoundingClientRect().top+scrollY;');
      await page.evaluate(`scrollTo(0,${top-30});`);await delay(250);
      assert.equal(await page.evaluate('return document.querySelector(".journey-terminal-showcase").dataset.started;'),'true');
      assert(await page.evaluate('return document.querySelector(".journey-console-linux .journey-energy rect").getAnimations().some(a=>a.playState==="running");'));
      assert(await page.evaluate('return [...document.querySelectorAll(".journey-console .journey-energy rect")].length===2 && [...document.querySelectorAll(".journey-console .journey-energy rect")].every(el=>{const effect=el.getAnimations()[0].effect,timing=effect.getTiming(),frames=effect.getKeyframes();return timing.duration===2000&&timing.iterations===1&&frames.some(f=>f.offset===.5&&parseFloat(f.strokeDashoffset)===100);});'));
      await shot('terminals-pulse','graphite-dark',1440);
      await scrollTo(0);const phase=await page.evaluate('return document.querySelector(".journey-terminal-showcase").dataset.phase;');await delay(300);assert.equal(await page.evaluate('return document.querySelector(".journey-terminal-showcase").dataset.phase;'),phase);
      await scrollTo(top-30);await wait('document.querySelector(".journey-terminal-showcase").dataset.complete==="true"');
      await shot('terminals-graphite','graphite-dark',1440,true);
      await select('.language-selector select','en');await scrollTo(0);await scrollTo(top-30);
      assert.equal(await page.evaluate('return document.querySelector(".journey-terminal-showcase").dataset.phase;'),'7');
      assert(await page.evaluate('return [...document.querySelectorAll(".journey-console-text li")].every(el=>getComputedStyle(el).opacity==="1");'));
      assert(await page.evaluate('return [...document.querySelectorAll(".journey-console .journey-energy rect")].every(el=>Number(getComputedStyle(el).opacity)===0);'));
    });
    await test('journey: alternate composition preserves exact reversible arrivals and responsive terminals',async()=>{
      for(const alternate of [false,true]){
        await home('',true,alternate);
        for(const theme of ['graphite-dark','classic-light'])for(const width of [390,700,1024,1440]){
          await size(width);await select('.home-theme select',theme);await select('.language-selector select','pt-BR');
          await page.evaluate('scrollTo(0,document.querySelector(".journey-terminal-showcase").getBoundingClientRect().top+scrollY-20);');await delay(100);
          assert(await page.evaluate('return document.documentElement.scrollWidth<=innerWidth;'));
          await wait('document.querySelector(".journey-terminal-showcase").dataset.complete==="true"');
          await shot(`terminals-${alternate?'b':'a'}-${theme}`,theme,width);
          for(const index of [1,3,1]){
            await page.evaluate(`const root=document.querySelector('.journey-stations'),box=root.getBoundingClientRect(),cards=[...root.querySelectorAll('.journey-feature')],y=c=>{const p=c.querySelector('[data-station-port]').getBoundingClientRect();return p.top+p.height/2-box.top;};scrollTo(0,box.top+scrollY+(root.dataset.motion==='continuous'?y(cards[0])+Number(cards[${index}].dataset.threshold)*(y(cards.at(-1))-y(cards[0])):y(cards[${index}]))-innerHeight*.58);`);await delay(60);await wait('document.querySelector(".journey-stations").dataset.animating==="false"');
            const error=await page.evaluate(`const p=document.querySelectorAll('.journey-feature')[${index}].querySelector('[data-station-port]').getBoundingClientRect(),m=document.querySelector('[data-packet=scroll]').getScreenCTM();return Math.hypot(m.e-p.left-p.width/2,m.f-p.top-p.height/2);`);assert(error<1.5,JSON.stringify({alternate,width,theme,error}));
          }
          await shot(`stations-${alternate?'alternate':'approved'}-${theme}`,theme,width,theme==='graphite-dark'&&width===1440);
          if(alternate) {
            const geometry=await page.evaluate(`const root=document.querySelector('.journey-stations'),path=root.querySelector('.journey-route'),matrix=path.getScreenCTM(),panels=[...root.querySelectorAll('.journey-station-panel')].map(el=>el.getBoundingClientRect());let intersections=0;for(let s=0;s<=path.getTotalLength();s+=2){const p=path.getPointAtLength(s),v=new DOMPoint(p.x,p.y).matrixTransform(matrix);if(panels.some(r=>v.x>r.left-2&&v.x<r.right+2&&v.y>r.top-2&&v.y<r.bottom+2))intersections++;}return {intersections,sides:[...root.querySelectorAll('.journey-feature')].map(card=>card.querySelector('.journey-equipment').getBoundingClientRect().left>card.querySelector('.journey-station-panel').getBoundingClientRect().left?'right':'left')};`);
            assert.equal(geometry.intersections,0,JSON.stringify({width,theme,...geometry}));
            assert.deepEqual(geometry.sides,width>800?['right','left','right','left','right']:['left','left','left','left','left']);
          }
        }
      }
      await home();
    });
    await test('journey: arrival pulses return to normal and final station confirms in both directions',async()=>{
      await size(1440);await home('',true,true);await select('.home-theme select','graphite-dark');
      for(const lang of ['de','en','pt-BR']){
        await scrollTo(0);await select('.language-selector select',lang);
        for(const index of [4,1,4]){
          await page.evaluate(`const root=document.querySelector('.journey-stations'),box=root.getBoundingClientRect(),cards=[...root.querySelectorAll('.journey-feature')],y=c=>{const p=c.querySelector('[data-station-port]').getBoundingClientRect();return p.top+p.height/2-box.top;};scrollTo(0,box.top+scrollY+(root.dataset.motion==='continuous'?y(cards[0])+Number(cards[${index}].dataset.threshold)*(y(cards.at(-1))-y(cards[0])):y(cards[${index}]))-innerHeight*.58);`);
          await wait(`document.querySelectorAll('.journey-feature')[${index}].dataset.arriving==='true'`);
          await wait(`document.querySelectorAll('.journey-feature')[${index}].querySelector('.journey-energy rect').getAnimations().some(a=>a.playState==='running')`);
          if(lang==='pt-BR'&&index===4&&!captures.some(c=>c.scene==='final-confirmation'))await shot('final-confirmation','graphite-dark',1440);
          await delay(1400);assert.equal(await page.evaluate(`return Number(getComputedStyle(document.querySelectorAll('.journey-feature')[${index}].querySelector('.journey-energy rect')).opacity);`),0);
        }
      }
      await home();
    });
    await test('journey: data metaphor is opt-in, follows pause/replay and stays out of reduced motion',async()=>{
      assert.equal(await page.evaluate('return document.querySelectorAll(".journey-data-document").length;'),0);
      await home('',true,false,true);await select('.home-theme select','graphite-dark');
      await click('[data-action="play"]');await wait('Number(document.querySelector(".journey-scenes").dataset.progress)>.025');await click('[data-action="play"]');
      const sample=await page.evaluate('const el=document.querySelector("[data-document=source]");return [el.getAttribute("transform"),el.getAttribute("opacity")];');
      assert(Number(sample[1])>.5);await delay(250);
      assert.deepEqual(await page.evaluate('const el=document.querySelector("[data-document=source]");return [el.getAttribute("transform"),el.getAttribute("opacity")];'),sample);
      await shot('data-source','graphite-dark',1440);
      await click('[data-action="replay"]');await wait('document.querySelector(".journey-scenes").dataset.seeking==="false"');await wait('Number(document.querySelector(".journey-scenes").dataset.progress)>.025');await click('[data-action="play"]');
      for(const theme of ['graphite-dark','classic-light'])for(const width of [390,700,1024,1440]){
        await size(width);await select('.home-theme select',theme);await page.evaluate('document.querySelector(".journey-scenes").scrollIntoView({block:"center"});');await delay(100);
        await click('[data-scene="2"]');await wait('document.querySelector(".journey-scenes").dataset.seeking==="false"');
        assert.equal(await page.evaluate('return Number(document.querySelector("[data-document=destination]").getAttribute("opacity"));'),1);
        assert(!await page.evaluate('return document.querySelector(".journey-protocol").textContent.includes("ICMP");'));
        await shot(`data-destination-${theme}`,theme,width);
      }
      await page.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await delay(100);
      assert(await page.evaluate('return [...document.querySelectorAll(".journey-data-document")].every(el=>el.getAttribute("opacity")==="0.000");'));
      await page.send('Emulation.setEmulatedMedia',{features:[]});await home();
    });
    await test('journey: exact connector arrival, reverse effects and compact stations after layout/language changes', async () => {
      report.arrivalErrors = [];
      for (const width of [390, 700, 1024, 1440]) for (const lang of ['de', 'en', 'pt-BR']) {
        await size(width); await select('.language-selector select', lang);
        for (let index = 0; index < 5; index++) {
          await page.evaluate(`const root=document.querySelector('.journey-stations'),box=root.getBoundingClientRect(),cards=[...root.querySelectorAll('.journey-feature')];const y=c=>{const r=c.querySelector('[data-station-port]').getBoundingClientRect();return r.top+r.height/2-box.top;};scrollTo(0,box.top+scrollY+(root.dataset.motion==='continuous'?y(cards[0])+Number(cards[${index}].dataset.threshold)*(y(cards.at(-1))-y(cards[0])):y(cards[${index}]))-innerHeight*.58);`);
          await delay(60);await wait('document.querySelector(".journey-stations").dataset.animating==="false"');
          const error = await page.evaluate(`const card=document.querySelectorAll('.journey-feature')[${index}],port=card.querySelector('[data-station-port]').getBoundingClientRect(),packet=document.querySelector('[data-packet=scroll]'),m=packet.getScreenCTM();return {distance:Math.hypot(m.e-port.left-port.width/2,m.f-port.top-port.height/2),arriving:card.dataset.arriving};`);
          assert(error.distance < 1.5, JSON.stringify({width,lang,index,...error})); assert.equal(error.arriving,'true'); report.arrivalErrors.push(error.distance);
        }
      }
      const height=await page.evaluate('return document.querySelector(".journey-stations").getBoundingClientRect().height;');
      assert(height<1400, 'Five desktop stations should stay compact'); report.stationHeight1440=height;
      await scrollTo(0); assert.equal(await page.evaluate('return document.querySelectorAll(".journey-feature[data-reached=true]").length;'),1);
    });
    await test('journey: offscreen and hidden pages suspend scene animation', async () => {
      await size(1440); await scrollTo(0); await click('[data-scene="0"]'); await wait('document.querySelector(".journey-scenes").dataset.seeking==="false"'); await click('[data-action="play"]'); await delay(150);
      await scrollTo(1900); const outside = await progress('.journey-scenes'); await delay(250); assert.equal(await progress('.journey-scenes'), outside);
      await scrollTo(0); assert(await progress('.journey-scenes') > outside);
      // Lifecycle notification is deterministic in headless Chromium; real offscreen is tested above.
      await page.evaluate('Object.defineProperty(document,"hidden",{configurable:true,value:true});document.dispatchEvent(new Event("visibilitychange"));');
      const hidden = await progress('.journey-scenes'); await delay(250); assert.equal(await progress('.journey-scenes'), hidden);
      await page.evaluate('delete document.hidden;document.dispatchEvent(new Event("visibilitychange"));'); await delay(150);
      assert(await progress('.journey-scenes') > hidden); await click('[data-action="play"]');
    });
    await test('journey: reduced motion provides static accessible scenes and examples', async () => {
      await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }); await delay(100);
      assert(await page.evaluate('return document.querySelector("[data-action=play]").disabled;'));
      await click('[data-scene="2"]'); assert.equal(await progress('.journey-scenes'), await sceneProgress(2));
      assert.equal(await page.evaluate('return document.querySelector(".journey-terminal-showcase").dataset.phase;'), '7');
      assert(await page.evaluate('return [...document.querySelectorAll(".journey-energy rect")].every(el=>getComputedStyle(el).animationName==="none");'));
      assert.equal(await page.evaluate('return document.querySelectorAll(".journey-feature[data-reached=true]").length;'), 5);
      await delay(150); assert.equal(await progress('.journey-scenes'), await sceneProgress(2));
      await home('', false);await delay(200);assert.equal(await progress('.journey-scenes'),0);
      assert(await page.evaluate('return document.querySelector("[data-action=play]").disabled;'));
      await page.send('Emulation.setEmulatedMedia', { features: [] });
    });
    await test('journey: responsive themes and paths at 390, 700, 1024 and 1440', async () => {
      await select('.language-selector select', 'de');
      for (const theme of ['graphite-dark', 'classic-light']) for (const width of [390, 700, 1024, 1440]) {
        await select('.home-theme select', theme); await size(width); await scrollTo(0);
        assert(await page.evaluate('return document.documentElement.scrollWidth<=innerWidth;'));
        await shot(`${theme}-hero`, theme, width);
        if (theme === 'graphite-dark' && width === 390) {
          await scrollTo(await page.evaluate('return document.querySelector(".journey-scenes").getBoundingClientRect().top+scrollY-24;'));
          await shot('mobile-scenes', theme, width);
        }
        const top = await page.evaluate('return document.querySelector(".journey-stations").getBoundingClientRect().top+scrollY;'); await scrollTo(top);
        await shot(`${theme}-path`, theme, width);
        assert(await page.evaluate('return [...document.querySelectorAll(".journey-feature")].every(el=>el.getBoundingClientRect().right<=innerWidth);'));
      }
    });
    await test('journey: editorial hierarchy, compact keyboard controls and first viewport at 100/120 percent equivalents',async()=>{
      await size(1440);await home();
      assert.equal(await page.evaluate('return document.querySelector(".journey-scenes").dataset.duration;'),'21240');
      assert.equal(await page.evaluate('return document.querySelectorAll(".journey-equipment-name").length;'),0);
      assert.equal(await page.evaluate('return document.querySelectorAll(".journey-technical-note,.journey-playback-note").length;'),0);
      await page.send('Page.bringToFront');
      await page.evaluate('document.querySelectorAll("[data-scene]")[1].focus();');
      await page.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13,text:'\r'});await page.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13});
      await wait(`document.querySelector('.journey-scenes').dataset.seeking==='false'&&Number(document.querySelector('.journey-scenes').dataset.progress)===${await sceneProgress(1)}`);
      await page.evaluate('document.querySelector("[data-action=next]").focus();');await page.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13,text:'\r'});await page.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13});
      await wait(`document.querySelector('.journey-scenes').dataset.seeking==='false'&&Number(document.querySelector('.journey-scenes').dataset.progress)===${await sceneProgress(2)}`);
      report.editorialMatrix=[];
      const expectedTitles={de:'Bauen. Verbinden. Verstehen.',en:'Build. Connect. Understand.','pt-BR':'Construa. Conecte. Entenda.'};
      for(const theme of ['graphite-dark','classic-light'])for(const lang of ['de','en','pt-BR'])for(const zoom of [1,1.2])for(const width of [390,700,1024,1440,1920]){
        const height=width===1920?1080:950;
        await page.send('Emulation.setDeviceMetricsOverride',{width:Math.round(width/zoom),height:Math.round(height/zoom),deviceScaleFactor:zoom,mobile:false});await delay(100);
        await select('.home-theme select',theme);await select('.language-selector select',lang);await page.evaluate('scrollTo(0,0);document.activeElement.blur();');await delay(100);
        assert.equal(await page.evaluate('return document.querySelector("h1").textContent;'),expectedTitles[lang]);
        const layout=await page.evaluate(`const card=document.querySelector('.journey-scenes').getBoundingClientRect(),hero=document.querySelector('.journey-hero').getBoundingClientRect(),term=document.querySelector('.journey-terminal-showcase').getBoundingClientRect(),buttons=[...document.querySelectorAll('.journey-controls button')];return {overflow:document.documentElement.scrollWidth>innerWidth,heroBottom:hero.bottom,terminalTop:term.top,viewportHeight:innerHeight,viewportWidth:innerWidth,buttonsFit:buttons.every(el=>{const r=el.getBoundingClientRect();return r.width>=30&&r.height>=36&&r.left>=card.left&&r.right<=card.right&&!!el.getAttribute('aria-label')&&!!el.title;}),deviceNames:[...document.querySelectorAll('[data-hero-device] text')].map(el=>el.textContent)};`);
        assert(!layout.overflow,JSON.stringify({width,zoom,lang,theme,...layout}));assert(layout.buttonsFit,JSON.stringify({width,zoom,lang,theme,...layout}));
        assert(!layout.deviceNames.some(name=>/^(pc|sw|r|srv)\d+$/.test(name)));
        if(layout.viewportWidth>=901&&layout.viewportHeight>=760)assert(layout.terminalTop>=layout.heroBottom-2,JSON.stringify(layout));
        report.editorialMatrix.push({width,zoom,lang,theme,...layout});
        await shot(`editorial-${theme}-${lang.toLowerCase()}-${zoom===1?'100':'120'}`,theme,width);
      }
      // A short desktop window and enlarged text must retain access to all controls.
      await size(1440,600);await page.evaluate('document.querySelector(".journey-hero h1").style.fontSize="78px";document.querySelector(".journey-hero .home-intro").style.fontSize="23px";document.querySelector(".journey-controls").scrollIntoView({block:"center"});');await delay(100);
      assert(await page.evaluate('return document.documentElement.scrollWidth<=innerWidth&&document.querySelector(".journey-controls").getBoundingClientRect().bottom<=innerHeight;'));
      await size(1440);await select('.home-theme select','graphite-dark');await select('.language-selector select','en');
      await navigate('/?experience=journey&headline=break-fix');await wait('document.querySelector("h1")');await delay(150);
      assert.equal(await page.evaluate('return document.querySelector("h1").textContent;'),'Build. Connect. Break. Fix.');
      await shot('headline-alternative','graphite-dark',1440);
      await home();await select('.language-selector select','de');
    });
    await test('journey: independent demos and intact classic entry', async () => {
      await home('scroll'); assert(!await page.evaluate('return !!document.querySelector(".journey-scenes");')); assert(await page.evaluate('return !!document.querySelector(".journey-stations");'));
      await home('slides'); assert(await page.evaluate('return !!document.querySelector(".journey-scenes");')); assert(!await page.evaluate('return !!document.querySelector(".journey-stations");'));
      const hrefs = await page.evaluate('return [...document.querySelectorAll("a")].map(a=>a.getAttribute("href"));');
      for (const action of ['new','load','exercises','labs']) assert(hrefs.includes('./app.html?home='+action));
      await navigate('/?experience=classic'); await wait('document.querySelector(".home-topology")'); assert(!await page.evaluate('return !!document.querySelector(".journey-page");'));
      await home(); assert.equal(await progress('.journey-scenes'), 0);
    });
    await test('journey: editor link and browser Back recover the page without changing projects', async () => {
      assert(!saved.databases.includes('netlab-projects'));
      await page.evaluate('localStorage.removeItem("netsim:autosave:v1");');
      await click('a[href="./app.html"]'); await wait('document.querySelector(".react-flow")');
      await page.evaluate('history.back();'); await wait('document.querySelector(".journey-page")'); await delay(200);
      assert(Number.isFinite(await progress('.journey-scenes')));
      await navigate('/__project_repository_test__');
      await page.evaluate('await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase("netlab-projects");r.onsuccess=resolve;r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error("Isolated DB cleanup blocked"));});');
      await home();
    });
    await test('journey: idle vs playing main-thread cost (diagnostic, not CPU benchmark)', async () => {
      await size(1440); await scrollTo(0); await page.send('Performance.enable');
      const metrics = async () => Object.fromEntries((await page.send('Performance.getMetrics')).metrics.map(m => [m.name,m.value]));
      const a = await metrics(); await delay(1500); const b = await metrics();
      await click('[data-action="play"]'); await delay(1500); const c = await metrics(); await click('[data-action="play"]');
      report.journeyPerformance = { intervalMs: 1500, idleScriptMs: (b.ScriptDuration-a.ScriptDuration)*1000, playingScriptMs: (c.ScriptDuration-b.ScriptDuration)*1000, idleTaskMs: (b.TaskDuration-a.TaskDuration)*1000, playingTaskMs: (c.TaskDuration-b.TaskDuration)*1000 };
    });
    if (process.env.NETLAB_JOURNEY_VIDEO === '1') {
      await home('',true,true,true);
      await size(1440, 950); await select('.home-theme select', 'graphite-dark'); await select('.language-selector select', 'en'); await scrollTo(0);
      const frames = path.join(directory, 'video-frames'); await mkdir(frames);
      const samples = [], writes = []; let recordingError;
      const release = page.onEvent('Page.screencastFrame', frame => {
        const file = `${String(samples.length).padStart(5, '0')}.jpg`;
        samples.push({ file, time: frame.metadata.timestamp });
        writes.push(writeFile(path.join(frames, file), Buffer.from(frame.data, 'base64')));
        void page.send('Page.screencastFrameAck', { sessionId: frame.sessionId }).catch(error => { recordingError = error; });
      });
      try {
        await page.send('Page.startScreencast', { format: 'jpeg', quality: 85, maxWidth: 1440, maxHeight: 950, everyNthFrame: 2 });
        await click('[data-action="replay"]'); await delay(11500);
        await page.evaluate('scrollTo(0,document.querySelector(".journey-terminal-showcase").getBoundingClientRect().top+scrollY-30);');await delay(3300);
        // Real-time review gestures: slow activation and stop, reversal mid-transfer,
        // rapid final destination and return. Only the test drives page scrolling.
        await page.evaluate(`await new Promise(resolve=>{const ys=[...document.querySelectorAll('.journey-feature [data-station-port]')].map(p=>{const r=p.getBoundingClientRect();return r.top+r.height/2+scrollY-innerHeight*.58;}),keys=[[0,ys[0]],[700,ys[0]],[2200,ys[1]],[3400,ys[1]],[3600,ys[3]],[3750,ys[3]],[3900,ys[1]],[5100,ys[1]],[5160,ys[4]],[6500,ys[4]],[6560,ys[0]],[8000,ys[0]]],start=performance.now();const frame=now=>{const t=now-start;let i=1;while(i<keys.length-1&&t>keys[i][0])i++;const a=keys[i-1],b=keys[i],f=Math.max(0,Math.min(1,(t-a[0])/(b[0]-a[0])));scrollTo(0,a[1]+(b[1]-a[1])*f);if(t<8000)requestAnimationFrame(frame);else resolve();};requestAnimationFrame(frame);});`);
      } finally {
        await page.send('Page.stopScreencast'); release(); await Promise.all(writes);
      }
      if (recordingError) throw recordingError;
      const duration = samples.at(-1).time - samples[0].time;
      const intervals = samples.slice(1).map((s, i) => s.time - samples[i].time), moving = intervals.filter(dt=>dt>0 && dt<.2);
      const concat = samples.map((s,i)=>`file '${s.file}'\noption framerate 1000\nduration ${Math.max(.001,(samples[i+1]?.time??s.time+.05)-s.time).toFixed(6)}`).join('\n') + `\nfile '${samples.at(-1).file}'\noption framerate 1000\n`;
      await writeFile(path.join(frames, 'frames.ffconcat'), 'ffconcat version 1.0\n' + concat);
      await writeFile(path.join(frames, 'timestamps.json'), JSON.stringify(samples));
      report.journeyVideoFrames = { directory: frames, frames: samples.length, durationMs: duration*1000, effectiveFps: (samples.length-1)/duration, movingFps: moving.length/moving.reduce((a,b)=>a+b,0), variableFrameTiming: true };
    }
  } finally {
    await navigate('/__project_repository_test__');
    await page.evaluate(`const saved=${JSON.stringify(saved.storage)};for(const k of Object.keys(localStorage))if(!(k in saved))localStorage.removeItem(k);for(const[k,v]of Object.entries(saved))localStorage.setItem(k,v);`);
  }
  if(process.env.NETLAB_JOURNEY_REVIEW_FILTER)return; // Focused checks never publish an incomplete review.
  const manifest = path.join(directory, 'manifest.json');
  const main=[['official-en',1440,'homepage-en'],['official-de',1440,'homepage-de'],['official-pt-br',1440,'homepage-pt-br'],['official-pt-br',390,'homepage-mobile'],['official-terminals',1440,'terminals'],['official-stations',1440,'stations']];
  await writeFile(manifest, JSON.stringify({ id: 'packet-journey-official', title: 'NetLab-FiSI — Official Homepage', variants: [{ id: 'graphite-dark', label: 'Graphite Dark' }, { id: 'classic-light', label: 'Classic Light' }], states: ['normal'], captures, share: main.flatMap(([scene,width,name])=>{const c=captures.find(c=>c.scene===scene&&c.width===width);return c?[{...c,name}]:[];}), shareContactSheet: false }, null, 2));
  report.journeyReview = await generateReview(manifest);
}
