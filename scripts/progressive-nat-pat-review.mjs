import assert from 'node:assert/strict';

export async function runProgressiveNatPatReview({ page, url, report }) {
  const database = 'netlab-idb-test-' + crypto.randomUUID();
  const wait = async condition => {
    for (let attempt = 0; attempt < 200; attempt++) {
      try { if (await page.evaluate(`return !!(${condition});`)) return; }
      catch (error) {
        if (!/Inspected target navigated or closed|Execution context was destroyed|Cannot find context/.test(String(error))) throw error;
      }
      await new Promise(resolve => setTimeout(resolve, 40));
    }
    throw Error('NAT/PAT review: ' + condition);
  };
  const click = selector => page.evaluate(`document.querySelector(${JSON.stringify(selector)}).click();`);
  const mount = async (reload = false) => {
    const token = JSON.stringify(crypto.randomUUID());
    await page.evaluate(`window.previousDocument = ${token};`);
    await page.send(reload ? 'Page.reload' : 'Page.navigate', reload ? { ignoreCache: true } : { url });
    await wait(`window.previousDocument !== ${token} && document.getElementById("root") && document.readyState === "complete"`);
    await page.evaluate(`
      window.store = (await import('/src/store.ts')).useStore;
      window.sim = (await import('/src/sim.ts')).sim;
      window.ws = await (await import('/src/workspace/reviewEntry.tsx')).mountWorkspaceReview(
        document.getElementById('root'), { databaseName: ${JSON.stringify(database)} });
    `);
    await wait('document.querySelector(".react-flow")');
  };
  const check = async (id) => {
    await click(id ? '[data-nat-check="' + id + '"]' : '.lab-check');
    await page.evaluate('sim.net.scheduler.advanceTo(sim.net.now + 12000);');
    await wait('!store.getState().labChecking');
  };
  const next = '.lab-nat-nav .btn--primary';
  try {
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false });
    await mount();
    await page.evaluate("window.languageStore = (await import('/src/i18n/index.ts')).useLanguage;");
    await page.evaluate('[...document.querySelectorAll(".toolbar-menu-trigger")].find(e => e.textContent.trim().startsWith("Labs")).click();');
    await wait('document.querySelector("#toolbar-labs-menu")');
    await page.evaluate('[...document.querySelectorAll("#toolbar-labs-menu button")].find(e => e.textContent.includes("Tutorial progressivo")).click();');
    await wait('document.querySelector(".lab-title")?.textContent.includes("Tutorial progressivo")');
    await wait(`(() => {
      const viewport = document.querySelector('.react-flow__viewport');
      return viewport && new DOMMatrix(getComputedStyle(viewport).transform).a <= 0.901;
    })()`);
    const initialLayout = await page.evaluate(`
      const body = document.querySelector('.lab-body');
      const panel = document.querySelector('.lab-panel').getBoundingClientRect();
      const first = document.querySelector('.react-flow__node[data-id="PC1"]').getBoundingClientRect();
      return {
        hasAddress: body.textContent.includes('http://198.51.100.80'),
        hasNatDefinition: body.textContent.includes('Network Address Translation'),
        hasComparison: ['192.168.60.10', '198.51.100.2', '[SYN]'].every(token => body.textContent.includes(token)),
        fontSize: getComputedStyle(body).fontSize,
        clearOfPanel: first.left > panel.right,
      };
    `);
    assert.deepEqual(initialLayout, { hasAddress: true, hasNatDefinition: true, hasComparison: false, fontSize: '13px', clearOfPanel: true });
    for (const [locale, labels] of [
      ['de', ['Pakete', 'Aufnahme starten', 'Browser öffnen']],
      ['en', ['Packets', 'Start capture', 'Open Browser']],
      ['pt-BR', ['Pacotes', 'Iniciar captura', 'Abrir navegador']],
    ]) {
      await page.evaluate(`languageStore.getState().setLanguage(${JSON.stringify(locale)});`);
      await wait(`document.querySelector('#packets-toggle')?.textContent === ${JSON.stringify(labels[0])}`);
      const names = await page.evaluate("return [...document.querySelectorAll('.lab-body code')].map(node => node.textContent);");
      assert.deepEqual(names, labels);
    }
    assert(await page.evaluate('return document.querySelector(".lab-nat-nav .btn--primary").disabled && !sim.net.devices.has("PC2");'));
    await click('#packets-toggle');
    await wait('document.querySelector("#packet-inspector")');
    assert(await page.evaluate(`
      const panel = document.querySelector('.lab-panel').getBoundingClientRect();
      const inspector = document.querySelector('#packet-inspector').getBoundingClientRect();
      return panel.right <= inspector.left && inspector.right <= innerWidth;
    `));
    await click('.packet-settings-toggle');
    await wait('document.querySelector("[data-capture-action=start]")?.textContent === "Iniciar captura"');
    await click('[data-capture-action="start"]');
    await wait('store.getState().packetCapture.status === "capturing"');
    await click('#packets-toggle');
    await wait('!document.querySelector("#packet-inspector")');
    assert(await page.evaluate('return store.getState().packetCapture.status === "capturing";'));
    await page.evaluate(`
      window.desktop = (await import('/src/browser/desktopState.ts')).useDesktop;
      const pc = document.querySelector('.react-flow__node[data-id="PC1"]');
      const rect = pc.getBoundingClientRect();
      pc.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, button: 2, clientX: rect.x, clientY: rect.y }));
    `);
    await wait('document.querySelector("#device-context-menu button")?.textContent === "Abrir navegador"');
    await click('#device-context-menu button');
    await wait('document.querySelector(".pc-desktop")?.style.top');
    const browserLayout = await page.evaluate(`
      const panel = document.querySelector('.lab-panel').getBoundingClientRect().toJSON();
      const browser = document.querySelector('.pc-desktop').getBoundingClientRect().toJSON();
      return { panel, browser, viewport: { width: innerWidth, height: innerHeight } };
    `);
    const { panel, browser, viewport } = browserLayout;
    assert((browser.top >= panel.bottom + 7 || browser.left >= panel.right + 7)
      && browser.right <= viewport.width && browser.bottom <= viewport.height, JSON.stringify(browserLayout));
    await page.evaluate(`
      const input = document.getElementById('pc-browser-address');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'http://198.51.100.80');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    `);
    await click('.pc-browser-navigation button[type="submit"]');
    await wait('document.querySelector(".pc-browser-page")?.textContent.includes("Oficina conectada")');
    assert(await page.evaluate('return document.querySelectorAll(".pc-desktop-header").length === 1 && document.querySelector("#pc-desktop-heading").textContent.includes("PC1 · Web Browser");'));
    await click('.pc-desktop-close');
    await click(next);
    await wait('document.querySelector(".lab-intro-heading")?.textContent.startsWith("2/2")');
    await click('#packets-toggle');
    await wait('document.querySelector(".packet-table tbody tr")');
    const synRows = await page.evaluate(`
      return [...document.querySelectorAll('.packet-table tbody tr')]
        .map(row => [...row.cells].map(cell => cell.textContent.trim()))
        .filter(cells => cells[1] === 'TCP' && cells[3] === 'IP 198.51.100.80' && cells[5].endsWith('→ 80 [SYN]'))
        .map(cells => [cells[2], cells[4]]);
    `);
    assert.deepEqual(synRows, [
      ['IP 192.168.60.10', 'PC1→ Switch LAN'],
      ['IP 192.168.60.10', 'Switch LAN→ Router Borda'],
      ['IP 198.51.100.2', 'Router Borda→ Servidor Web'],
    ]);
    await click('.packet-position-toggle');
    await wait('document.querySelector(".main").dataset.packetSide === "left"');
    await click('.packet-position-toggle');
    await wait('document.querySelector(".main").dataset.packetSide === "right"');
    await page.send('Emulation.setDeviceMetricsOverride', { width: 700, height: 620, deviceScaleFactor: 1, mobile: false });
    await wait('document.querySelector(".main").dataset.analysisLayout === "stack"');
    assert(await page.evaluate(`
      const body = document.querySelector('.lab-body');
      const bounds = body.getBoundingClientRect();
      const code = [...body.querySelectorAll(':scope > p code')];
      return document.getElementById('nat-source-local').getBoundingClientRect().right <= bounds.right + 1 && code.every(element => [...element.getClientRects()].every(rect =>
        rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1 &&
        rect.height <= parseFloat(getComputedStyle(body).lineHeight)));
    `));
    assert(await page.evaluate(`
      const panel = document.querySelector('.lab-panel').getBoundingClientRect();
      const inspector = document.querySelector('#packet-inspector').getBoundingClientRect();
      return panel.bottom <= inspector.top && inspector.right <= innerWidth;
    `));
    await click('#packets-toggle');
    await wait('!document.querySelector("#packet-inspector")');
    assert(await page.evaluate('return store.getState().packetCapture.status === "capturing" && store.getState().packetCapture.records.length > 0;'));
    await page.evaluate('desktop.getState().openBrowser(sim.net.devices.get("PC1"));');
    await wait('document.querySelector(".pc-desktop")?.style.top');
    assert(await page.evaluate(`
      const browser = document.querySelector('.pc-desktop').getBoundingClientRect();
      return browser.left >= 0 && browser.top >= 0 && browser.right <= innerWidth && browser.bottom <= innerHeight;
    `));
    await page.evaluate('desktop.getState().close();');
    await click('#packets-toggle');
    await wait('document.querySelector("#packet-inspector")');
    assert(await page.evaluate('return !!document.querySelector(".packet-table tbody tr");'));
    await click('#packets-toggle');
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false });
    report.results['NAT/PAT introduction: toolbar, live SYN comparison and desktop/compact panels'] = { passed: true };

    const answer = async (id, value) => {
      await page.evaluate(`const input=document.getElementById(${JSON.stringify(id)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));`);
      await page.evaluate(`document.getElementById(${JSON.stringify(id)}).form.requestSubmit();`);
    };
    assert(await page.evaluate('return !document.getElementById("nat-source-external");'));
    await click('.lab-hints > summary');
    assert.deepEqual(await page.evaluate('return [...document.querySelectorAll(".lab-hints > details")].map(d => d.open);'), [true, false, false]);
    await click('.lab-hints > details > summary');
    await answer('nat-source-local','192.168.60.99');
    assert(await page.evaluate('return !document.getElementById("nat-source-external") && !!document.querySelector("[role=alert]");'));
    assert(await page.evaluate('return !document.querySelector(".lab-hints > details").open;'));
    await click('.lab-hints > summary');
    await answer('nat-source-local','192.168.60.10');
    await wait('document.getElementById("nat-source-external")');
    await page.evaluate('store.getState().stopPacketCapture(); sim.net.scheduler.advanceTo(sim.net.now + 121000); return sim.net.devices.get("edge").ct.list(sim.net.now).length;').then(count => assert.equal(count, 0));
    await answer('nat-source-external','198.51.100.3');
    assert(await page.evaluate('return document.querySelector(".lab-body [role=alert]").textContent.includes("Confira o IPv4") && document.querySelector(".lab-nat-nav .btn--primary").disabled;'));
    await answer('nat-source-external','198.51.100.2');
    await wait('!document.querySelector(".lab-nat-nav .btn--primary").disabled');
    await page.evaluate("(await import('/src/uiTheme.ts')).useUiTheme.getState().setTheme('graphite-dark');");
    const { mkdir, writeFile } = await import('node:fs/promises');
    const directory = '.playwright-mcp/reviews/nat-pat-refinement';
    await mkdir(directory, { recursive: true });
    const screenshot = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(directory + '/comparacao.png', Buffer.from(screenshot.data, 'base64'));
    for (const theme of ['classic-light','graphite-dark']) {
      await page.evaluate(`(await import('/src/uiTheme.ts')).useUiTheme.getState().setTheme(${JSON.stringify(theme)});`);
      await page.send('Emulation.setDeviceMetricsOverride',{width:700,height:800,deviceScaleFactor:1,mobile:false});
      assert(await page.evaluate('const p=document.querySelector(".lab-panel").getBoundingClientRect();return p.right<=innerWidth && p.bottom<=innerHeight && [...document.querySelectorAll(".lab-nat-answer input")].every(e=>e.getBoundingClientRect().right<=p.right);'));
    }
    await page.send('Emulation.setDeviceMetricsOverride',{width:1440,height:950,deviceScaleFactor:1,mobile:false});

    await page.evaluate('const saved=await ws.controller.flush();if(!saved.ok)throw Error(JSON.stringify(saved.error));');
    await mount(true);
    await wait('document.getElementById("nat-source-external")?.disabled');
    assert(await page.evaluate('return document.getElementById("nat-source-local").disabled && !document.querySelector(".lab-nat-nav .btn--primary").disabled;'));
    await click(next);
    await wait('store.getState().labStep === 1');
    assert(await page.evaluate('return !document.querySelector(".lab-footer");'));
    await page.evaluate('store.getState().setHostCreationMode("windows");document.querySelector(".palette-item.kind-host").click();');
    await wait('store.getState().labResults["nat-host"]');
    await page.evaluate(`
      const id=store.getState().labResults['nat-host'].detail;
      window.pc2=id;
      const {parseCidr,parseIp}=await import('/src/engine/ip.ts');
      store.getState().setInterfaceIpv4(id,'eth0',{mode:'static',ip:parseCidr('192.168.60.11/24'),gateway:parseIp('192.168.60.1'),dns:null});
      store.getState().onConnect({source:id,target:'lan',sourceHandle:null,targetHandle:null});
    `);
    await wait('document.querySelector("[data-nat-check=nat-before-local]")');
    await check('nat-before-local');
    await check('nat-before-pc1');
    await check('nat-before-pc2');
    await wait('store.getState().labResults["nat-before-pc2"].pass');
    await click(next);
    await wait('store.getState().labStep === 2');
    assert(await page.evaluate('return !document.querySelector(".lab-footer");'));
    await page.evaluate('const r = await ws.controller.flush(); if (!r.ok) throw Error(JSON.stringify(r.error));');
    await mount(true);
    await wait('store.getState().labStep === 2 && document.querySelector(".lab-check")');
    assert(await page.evaluate('return store.getState().labResults["nat-before-pc2"].pass && !!sim.net.devices.get(store.getState().labResults["nat-host"].detail).getInterface("eth0").link;'));
    await check();
    assert(await page.evaluate('return store.getState().labResults["nat-after-pair"].pass === false;'));
    await page.evaluate(`
      const { Shell } = await import('/src/commands/shell.ts');
      new Shell(sim.net.devices.get('edge')).exec('iptables -t nat -A POSTROUTING -s 192.168.60.11/32 -o eth1 -j MASQUERADE',
        { write: () => {} }, () => {});
    `);
    await check('nat-after-pair');
    await check('nat-after-local');
    await wait('document.querySelector(".lab-step-feedback")?.textContent.includes("Tutorial concluído")');
    await click('.lab-nat-nav button:first-child');
    await wait('store.getState().labStep === 1');
    assert(await page.evaluate('return document.querySelector(".lab-nat-nav .btn--primary").disabled;'));
    await check('nat-before-local');
    await check('nat-before-pc1');
    await check('nat-before-pc2');
    assert(await page.evaluate('return !store.getState().labResults["nat-before-pc2"].pass;'));
    await page.evaluate('store.getState().setLabStep(2);');
    await page.evaluate(`
      const { controller } = ws;
      const saved = await controller.save('NAT/PAT review');
      if (!saved.ok) throw Error(JSON.stringify(saved.error));
      const state = controller.getState(), id = state.activeDraftId;
      const closed = await controller.closeDraft(id, { expectedEditSequence: state.drafts.find(d => d.id === id).editSequence });
      if (!closed.ok) throw Error(JSON.stringify(closed.error));
      const opened = await controller.openPlan(saved.value.plan.project.id);
      if (!opened.ok) throw Error(JSON.stringify(opened.error));
    `);
    await wait('document.querySelector(".lab-step-feedback")?.textContent.includes("Tutorial concluído")');
    await check();
    assert(await page.evaluate('return store.getState().labResults["nat-after-pair"].pass;'));
    await page.evaluate('[...document.querySelectorAll(".toolbar-menu-trigger")].find(e => e.textContent.trim().startsWith("Labs")).click();');
    await wait('document.querySelector("#toolbar-labs-menu")');
    await page.evaluate('[...document.querySelectorAll("#toolbar-labs-menu button")].find(e => e.textContent.includes("Static addressing & ARP")).click();');
    await wait('document.querySelector(".lab-footer button")?.textContent === "Export attempt for submission"');
    report.results['NAT/PAT tutorial: Labs menu, optional hints, progression, F5, review and Save/Load'] = { passed: true };
  } finally {
    await page.evaluate(`
      window.ws?.dispose();
      await new Promise((resolve, reject) => {
        const req = indexedDB.deleteDatabase(${JSON.stringify(database)});
        const timeout = setTimeout(() => reject(Error('database cleanup timed out')), 10000);
        req.onsuccess = () => { clearTimeout(timeout); resolve(); };
        req.onerror = () => { clearTimeout(timeout); reject(req.error); };
      });
    `);
  }
}
