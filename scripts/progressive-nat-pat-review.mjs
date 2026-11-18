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
  const check = async () => {
    await click('.lab-check');
    await page.evaluate('sim.net.scheduler.advanceTo(sim.net.now + 12000);');
    await wait('!store.getState().labChecking');
  };
  const next = '.lab-stepnav button[aria-label="Avançar"]';
  try {
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false });
    await mount();
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
        formatted: !!body.querySelector(':scope > .lab-line code'),
        fontSize: getComputedStyle(body).fontSize,
        clearOfPanel: first.left > panel.right,
      };
    `);
    assert.deepEqual(initialLayout, { hasAddress: true, formatted: false, fontSize: '13px', clearOfPanel: true });
    assert(await page.evaluate('return document.querySelector(".lab-stepnav button:last-child").disabled;'));
    assert.equal(await page.evaluate('return document.querySelectorAll(".lab-hints[open]").length;'), 0);
    await click('.lab-hints > summary');
    await wait('document.querySelector(".lab-hints[open] > details:first-of-type[open]")');
    assert.equal(await page.evaluate('return document.querySelectorAll(".lab-hints details[open]").length;'), 1);
    await click('.lab-hints > details:first-of-type > summary');
    await wait('!document.querySelector(".lab-hints details[open]")');
    await click('.lab-hints > summary');
    await page.evaluate(`
      window.desktop = (await import('/src/browser/desktopState.ts')).useDesktop;
      desktop.getState().openBrowser(sim.net.devices.get('PC1'));
    `);
    await wait('document.querySelector(".pc-desktop")?.style.top');
    assert(await page.evaluate(`
      const panel = document.querySelector('.lab-panel').getBoundingClientRect();
      const browser = document.querySelector('.pc-desktop').getBoundingClientRect();
      return browser.top >= panel.bottom + 7 && browser.bottom <= innerHeight;
    `));
    await page.evaluate('desktop.getState().close();');
    await page.send('Emulation.setDeviceMetricsOverride', { width: 700, height: 620, deviceScaleFactor: 1, mobile: false });
    await page.evaluate('desktop.getState().openBrowser(sim.net.devices.get("PC1"));');
    await wait('document.querySelector(".pc-desktop")?.style.top');
    assert(await page.evaluate(`
      const browser = document.querySelector('.pc-desktop').getBoundingClientRect();
      return browser.left >= 0 && browser.top >= 0 && browser.right <= innerWidth && browser.bottom <= innerHeight;
    `));
    await page.evaluate('desktop.getState().close();');
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false });
    await check();
    assert(await page.evaluate('return store.getState().packets.some(packet => packet.kind === "tcp" && packet.visualDuration === 800);'));
    await click(next);
    await wait('store.getState().labStep === 1');
    await check();
    assert(await page.evaluate('return document.querySelector(".lab-stepnav button:last-child").disabled;'));
    await page.evaluate('store.getState().onConnect({ source:"PC2", target:"lan", sourceHandle:null, targetHandle:null });');
    await check();
    await wait('document.querySelector(".lab-step-feedback")?.textContent.includes("origem privada")');
    await click(next);
    await wait('store.getState().labStep === 2');
    await page.evaluate('const r = await ws.controller.flush(); if (!r.ok) throw Error(JSON.stringify(r.error));');
    await mount(true);
    await wait('store.getState().labStep === 2 && document.querySelector(".lab-check")');
    assert(await page.evaluate('return store.getState().labResults["nat-before-pc2"].pass && !!sim.net.devices.get("PC2").getInterface("eth0").link;'));
    await check();
    assert(await page.evaluate('return store.getState().labResults["nat-after-pair"].pass === false;'));
    await page.evaluate(`
      const { Shell } = await import('/src/commands/shell.ts');
      new Shell(sim.net.devices.get('edge')).exec('iptables -t nat -A POSTROUTING -s 192.168.60.11/32 -o eth1 -j MASQUERADE',
        { write: () => {} }, () => {});
    `);
    await check();
    await wait('document.querySelector(".lab-step-feedback")?.textContent.includes("Tutorial concluído")');
    await click('.lab-stepnav button[aria-label="Voltar"]');
    await wait('store.getState().labStep === 1');
    await click(next);
    await wait('store.getState().labStep === 2');
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
    report.results['NAT/PAT tutorial: Labs menu, optional hints, progression, F5, review and Save/Load'] = { passed: true };
  } finally {
    await page.evaluate(`
      window.ws?.dispose();
      await new Promise((resolve, reject) => {
        const req = indexedDB.deleteDatabase(${JSON.stringify(database)});
        req.onsuccess = resolve; req.onerror = () => reject(req.error); req.onblocked = () => reject(Error('database blocked'));
      });
    `);
  }
}
