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
    await click(id ? '[data-nat-check="' + id + '"]' : '[data-nat-check]');
    await page.evaluate('sim.net.scheduler.advanceTo(sim.net.now + 12000);');
    await wait('!store.getState().labChecking');
  };
  const next = '[data-nat-next]';
  const guidedMenu = async () => {
    await page.evaluate(`
      const menu = [...document.querySelectorAll('.toolbar-menu-trigger')].find(e => /Übungen|Exercises|Exercícios/.test(e.textContent));
      if (!menu) throw Error('Exercises menu');
      menu.click();
    `);
    await click('[data-guided-menu-toggle]');
  };
  const navigateFrom = async id => {
    await page.evaluate(`
      window.desktop = (await import('/src/browser/desktopState.ts')).useDesktop;
      desktop.getState().openBrowser(sim.net.devices.get(${JSON.stringify(id)}));
    `);
    await wait('document.getElementById("pc-browser-address")');
    await page.evaluate(`
      const input = document.getElementById('pc-browser-address');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'http://198.51.100.80');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    `);
    await click('.pc-browser-navigation button[type="submit"]');
  };
  const quickPing = async (source, target) => {
    await page.evaluate(`
      const s = store.getState();
      s.beginQuickPing(${JSON.stringify(source)});
      s.chooseQuickPingTarget(${JSON.stringify(target)});
    `);
  };
  const submitTerminal = async (deviceId, line) => {
    const input = `.term-host[data-terminal-device="${deviceId}"] .xterm-helper-textarea`;
    await wait(`document.querySelector(${JSON.stringify(input)})`);
    await page.evaluate(`document.querySelector(${JSON.stringify(input)}).focus();`);
    await page.send('Input.insertText', { text: line });
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  };
  try {
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false });
    await mount();
    await page.evaluate("window.languageStore = (await import('/src/i18n/index.ts')).useLanguage;");
    await page.evaluate('[...document.querySelectorAll(".toolbar-menu-trigger")].find(e => e.textContent.trim().startsWith("Labs")).click();');
    await wait('document.querySelector("#toolbar-labs-menu")');
    assert(await page.evaluate('return ![...document.querySelectorAll("#toolbar-labs-menu .labs-menu-title")].some(title => title.textContent.includes("Tutorial progressivo"));'));
    await page.evaluate('[...document.querySelectorAll(".toolbar-menu-trigger")].find(e => e.textContent.trim().startsWith("Labs")).click();');
    await guidedMenu();
    await click('[data-nat-start]');
    await wait('document.querySelector("[data-exercise=guided-nat-pat]")');
    await wait(`(() => {
      const viewport = document.querySelector('.react-flow__viewport');
      return viewport && new DOMMatrix(getComputedStyle(viewport).transform).a <= 0.901;
    })()`);
    const initialLayout = await page.evaluate(`
      const body = document.querySelector('[data-nat-body]');
      const panel = document.querySelector('[data-exercise=guided-nat-pat]').getBoundingClientRect();
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
      const names = await page.evaluate("return [...document.querySelectorAll('[data-nat-body] code')].map(node => node.textContent);");
      assert.deepEqual(names, labels);
    }
    assert(await page.evaluate('return document.querySelector("[data-nat-next]").disabled && !sim.net.devices.has("PC2");'));
    await click('#packets-toggle');
    await wait('document.querySelector("#packet-inspector")');
    assert(await page.evaluate(`
      const panel = document.querySelector('[data-exercise=guided-nat-pat]').getBoundingClientRect();
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
      const panel = document.querySelector('[data-exercise=guided-nat-pat]').getBoundingClientRect().toJSON();
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
    await wait('document.querySelector("[data-nat-screen]")?.textContent.startsWith("2/2")');
    assert.equal(await page.evaluate('return document.getElementById("nat-source-local").value;'), '192.168.');
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
      const body = document.querySelector('[data-nat-body]');
      const bounds = body.getBoundingClientRect();
      const code = [...body.querySelectorAll(':scope > p code')];
      return document.getElementById('nat-source-local').getBoundingClientRect().right <= bounds.right + 1 && code.every(element => [...element.getClientRects()].every(rect =>
        rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1 &&
        rect.height <= parseFloat(getComputedStyle(body).lineHeight)));
    `));
    assert(await page.evaluate(`
      const panel = document.querySelector('[data-exercise=guided-nat-pat]').getBoundingClientRect();
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
    await click('[data-nat-hints] > summary');
    assert.deepEqual(await page.evaluate('return [...document.querySelectorAll("[data-nat-hints] > details")].map(d => d.open);'), [true, false, false]);
    await click('[data-nat-hints] > details > summary');
    await answer('nat-source-local','192.168.60.99');
    assert(await page.evaluate('return !document.getElementById("nat-source-external") && !!document.querySelector("[role=alert]");'));
    assert(await page.evaluate('return !document.querySelector("[data-nat-hints] > details").open;'));
    await click('[data-nat-hints] > summary');
    await answer('nat-source-local','192.168.60.10');
    await wait('document.getElementById("nat-source-external")');
    await page.evaluate('store.getState().stopPacketCapture(); sim.net.scheduler.advanceTo(sim.net.now + 121000); return sim.net.devices.get("edge").ct.list(sim.net.now).length;').then(count => assert.equal(count, 0));
    await answer('nat-source-external','198.51.100.3');
    assert(await page.evaluate('return document.querySelector("[data-nat-body] [role=alert]").textContent.includes("Confira o IPv4") && document.querySelector("[data-nat-next]").disabled;'));
    await answer('nat-source-external','198.51.100.2');
    await wait('!document.querySelector("[data-nat-next]").disabled');
    await page.evaluate("(await import('/src/uiTheme.ts')).useUiTheme.getState().setTheme('graphite-dark');");
    for (const theme of ['classic-light','graphite-dark']) {
      await page.evaluate(`(await import('/src/uiTheme.ts')).useUiTheme.getState().setTheme(${JSON.stringify(theme)});`);
      await page.send('Emulation.setDeviceMetricsOverride',{width:700,height:800,deviceScaleFactor:1,mobile:false});
      assert(await page.evaluate('const p=document.querySelector("[data-exercise=guided-nat-pat]").getBoundingClientRect();return p.right<=innerWidth && p.bottom<=innerHeight && [...document.querySelectorAll(".guided-subnet-answer input")].every(e=>e.getBoundingClientRect().right<=p.right);'));
    }
    await page.send('Emulation.setDeviceMetricsOverride',{width:1440,height:950,deviceScaleFactor:1,mobile:false});

    await page.evaluate('const saved=await ws.controller.flush();if(!saved.ok)throw Error(JSON.stringify(saved.error));');
    await mount(true);
    await wait('document.getElementById("nat-source-external")?.disabled');
    assert(await page.evaluate('return document.getElementById("nat-source-local").disabled && !document.querySelector("[data-nat-next]").disabled;'));
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
    await wait('document.querySelector("[data-nat-body]").textContent.includes("PC2 configurado")');
    const pc2 = await page.evaluate('return pc2;');
    assert(await page.evaluate('return sim.net.devices.get(pc2).name === "PC2" && !document.querySelector("[data-nat-body]").textContent.includes("PC2 (PC2)");'));
    await page.evaluate('store.getState().renameDevice(pc2, "Recepção");');
    await wait('document.querySelector("[data-nat-body]").textContent.includes("PC2 (Recepção)")');

    await page.evaluate(`
      const s = store.getState();
      const first = sim.net.devices.get('PC1');
      first.sendEcho(sim.net.devices.get(pc2).getInterface('eth0').ip.addr, first.allocIcmpId(), 1);
      sim.net.scheduler.advanceTo(sim.net.now + 1000);
    `);
    assert(await page.evaluate('return !store.getState().labResults["nat-before-local"];'));
    await quickPing(pc2, 'PC1');
    await wait('store.getState().labResults["nat-before-local"]?.pass');
    await navigateFrom('PC1');
    await wait('store.getState().labResults["nat-before-pc1"]?.pass');
    await click('.pc-desktop-close');
    await navigateFrom(pc2);
    await wait('store.getState().labResults["nat-before-pc2"]?.pass');
    await click('.pc-desktop-close');
    await click(next);
    await wait('store.getState().labStep === 2');
    assert(await page.evaluate('return !document.querySelector(".lab-footer");'));
    await click(next);
    await wait('document.querySelector("[data-guided-image]")');
    assert(await page.evaluate('return !document.querySelector("[data-nat-body] img");'));
    assert(await page.evaluate(`
      const button = document.querySelector("[data-guided-image]");
      return Math.abs(button.getBoundingClientRect().right - button.parentElement.getBoundingClientRect().right) < 1;
    `));
    await click('[data-guided-image]');
    await wait('document.querySelector("[data-guided-image-dialog] img")?.complete');
    assert(await page.evaluate(`
      const viewer = document.querySelector("[data-guided-image-dialog]");
      const panel = document.querySelector("[data-exercise=guided-nat-pat]").getBoundingClientRect();
      const bounds = viewer.getBoundingClientRect();
      return viewer.dataset.modal === 'false' && viewer.querySelector('img').naturalWidth > 0 &&
        bounds.left > panel.right && bounds.right <= innerWidth && bounds.bottom <= innerHeight;
    `));
    await click('[data-guided-image-zoom]');
    assert(await page.evaluate('return document.querySelector("[data-guided-image-zoom]").getAttribute("aria-pressed") === "true";'));
    await click('[data-guided-image-close]');
    await page.send('Emulation.setDeviceMetricsOverride', { width: 700, height: 800, deviceScaleFactor: 1, mobile: false });
    await click('[data-guided-image]');
    await wait('document.querySelector("[data-guided-image-dialog][data-modal=" + JSON.stringify("true") + "]")');
    assert(await page.evaluate(`
      const viewer = document.querySelector("[data-guided-image-dialog]").getBoundingClientRect();
      return viewer.left > 0 && viewer.right < innerWidth && viewer.top > 0 && viewer.bottom < innerHeight;
    `));
    await click('[data-guided-image-close]');
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false });
    await page.evaluate('const r = await ws.controller.flush(); if (!r.ok) throw Error(JSON.stringify(r.error));');
    await mount(true);
    await wait('store.getState().labStep === 2 && document.querySelector("[data-guided-image]")');
    await click(next);
    await wait('store.getState().labStep === 2 && document.querySelector("[data-nat-screen]")?.textContent.startsWith("3/3")');
    assert(await page.evaluate('return store.getState().labResults["nat-before-pc2"].pass && !!sim.net.devices.get(store.getState().labResults["nat-host"].detail).getInterface("eth0").link;'));
    await navigateFrom(pc2);
    await wait('document.querySelector(".pc-browser-error")');
    assert(await page.evaluate('return !store.getState().labResults["nat-after-browser"] && !document.querySelector("[data-nat-check=nat-after-pair]");'));
    await click('.pc-desktop-close');
    await page.evaluate('store.getState().openTerminal("edge");');
    await page.evaluate(`
      const { observeTerminalCommands } = await import('/src/terminalCommandEvents.ts');
      window.natCommandEvents = [];
      window.stopNatCommandObservation = observeTerminalCommands(event => {
        if (event.command.deviceId === 'edge' && event.command.source === 'keyboard') window.natCommandEvents.push(event);
      });
    `);
    const runRouterCommand = async line => {
      await submitTerminal('edge', line);
      await wait(`window.natCommandEvents.some(event => event.command.line === ${JSON.stringify(line)} && event.type === "finished")`);
      return page.evaluate(`return window.natCommandEvents.filter(event => event.command.line === ${JSON.stringify(line)} && event.type === "output").map(event => event.text).join("");`);
    };
    try {
      const initial = await runRouterCommand('nft -a list ruleset');
      const initialHandle = initial.match(/ip saddr 192\.168\.60\.10 masquerade # handle (\d+)/)?.[1];
      assert(initialHandle, initial);
      const replace = await runRouterCommand(`nft replace rule ip nat postrouting handle ${initialHandle} oifname eth1 ip saddr 192.168.60.0/24 masquerade`);
      assert.match(replace, /not supported/);
      const invalid = await runRouterCommand('nft add rule ip nat postrouting oifname eth1 ip saddr 192.168.60.0/99 masquerade');
      assert.match(invalid, /invalid address/);
      assert(await page.evaluate('return sim.net.devices.get("edge").fw.nat.postrouting.rules.length === 1;'));
      assert.equal(await runRouterCommand('nft add rule ip nat postrouting oifname "eth1" ip saddr 192.168.60.11 masquerade'), '');
      await navigateFrom(pc2);
      await wait('store.getState().labResults["nat-after-browser"]?.pass');
      assert(await page.evaluate('return !store.getState().labResults["nat-after-pair"]?.pass;'));
      await click('.pc-desktop-close');
      await check('nat-after-pair');

      await page.evaluate('store.getState().select("edge");');
      const firewallTab = '.router-inspector [role="tab"][id$="-tab-firewall"]';
      await wait(`document.querySelector(${JSON.stringify(firewallTab)})`);
      await click(firewallTab);
      const ruleset = '.router-inspector [role="tabpanel"]:not([hidden]) pre.table-pre';
      await wait(`document.querySelector(${JSON.stringify(ruleset)})?.textContent.includes("ip saddr 192.168.60.11 masquerade")`);
      const cliRules = await runRouterCommand('nft --handle list ruleset');
      const peerHandle = cliRules.match(/ip saddr 192\.168\.60\.11 masquerade # handle (\d+)/)?.[1];
      assert(peerHandle, cliRules);
      assert.equal(await runRouterCommand(`nft delete rule ip nat postrouting handle ${peerHandle}`), '');
      await wait(`!document.querySelector(${JSON.stringify(ruleset)})?.textContent.includes("ip saddr 192.168.60.11 masquerade")`);
      await wait('!document.querySelector("[data-nat-check=nat-after-pair]")');

      await page.evaluate(`
        const panel = document.querySelector('.router-inspector [role="tabpanel"]:not([hidden])');
        [...panel.querySelectorAll('button')].find(button => button.textContent === 'Adicionar regra NAT').click();
      `);
      const changeSource = source => page.evaluate(`
        const input = document.querySelector('.nat-rule-form input');
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(source)});
        input.dispatchEvent(new Event('input', { bubbles: true }));
      `);
      await page.evaluate(`
        const select = document.querySelector('.nat-rule-form select');
        select.value = 'eth1';
        select.dispatchEvent(new Event('change', { bubbles: true }));
      `);
      await changeSource('192.168.60.0/99');
      await click('.nat-rule-form button[type="submit"]');
      await wait('document.querySelector(".nat-rule-form [role=alert]")?.textContent.includes("CIDR")');
      assert(await page.evaluate('return sim.net.devices.get("edge").fw.nat.postrouting.rules.length === 1;'));
      await changeSource('192.168.60.0/24');
      const expected = 'nft add rule ip nat postrouting oifname "eth1" ip saddr 192.168.60.0/24 masquerade';
      assert.equal(await page.evaluate('return document.querySelector(".nat-rule-form pre").textContent;'), expected);
      const copied = await page.evaluate(`
        const clipboard = navigator.clipboard;
        const writeText = clipboard.writeText;
        try {
          let copied;
          clipboard.writeText = async text => { copied = text; };
          [...document.querySelectorAll('.nat-rule-form button')].find(button => button.textContent === 'Copiar comando').click();
          return copied;
        } finally {
          clipboard.writeText = writeText;
        }
      `);
      assert.equal(copied, expected);
      await page.send('Emulation.setDeviceMetricsOverride', { width: 700, height: 800, deviceScaleFactor: 1, mobile: false });
      assert(await page.evaluate(`
        const form = document.querySelector('.nat-rule-form');
        return ['input', 'select', 'pre', 'button[type="submit"]'].every(selector => {
          const field = form.querySelector(selector).getBoundingClientRect();
          return field.width > 0 && field.right <= form.getBoundingClientRect().right + 1;
        });
      `));
      await page.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false });
      await click('.nat-rule-form button[type="submit"]');
      await wait(`document.querySelector(${JSON.stringify(ruleset)})?.textContent.includes("ip saddr 192.168.60.0/24 masquerade")`);
      const updated = await runRouterCommand('nft list ruleset');
      assert(updated.includes('ip saddr 192.168.60.10 masquerade'));
      assert(updated.includes('ip saddr 192.168.60.0/24 masquerade'));
    } finally {
      await page.evaluate('window.stopNatCommandObservation();');
    }
    await page.evaluate('store.getState().closeTerminal("edge"); store.getState().select(null);');
    await wait('!document.querySelector("[data-nat-check=nat-after-pair]")');
    await navigateFrom(pc2);
    await wait('document.querySelector("[data-nat-check=nat-after-pair]")');
    await click('.pc-desktop-close');
    await page.evaluate('const r = await ws.controller.flush(); if (!r.ok) throw Error(JSON.stringify(r.error));');
    await mount(true);
    await wait('document.querySelector("[data-nat-check=nat-after-pair]")');
    assert(await page.evaluate('return document.querySelector("[data-nat-body]").textContent.includes("PC2 recebeu a página por uma nova conexão traduzida.");'));
    await check('nat-after-pair');
    await page.evaluate('store.getState().openTerminal("PC1");');
    await wait('document.querySelector(".xterm-helper-textarea")');
    await page.evaluate('store.getState().select("edge");');
    await wait('document.querySelector(".app")?.dataset.panelPriority === "inspector"');
    await page.evaluate('store.getState().openTerminal("PC1");');
    await wait('document.querySelector(".app")?.dataset.panelPriority === "terminal"');
    await submitTerminal('PC1', 'ping -c 1 192.168.60.11');
    await wait('store.getState().labResults["nat-after-local"]?.pass');
    await wait('document.querySelector("[data-nat-finished]")?.textContent.includes("Tutorial concluído")');
    await click('[data-nat-nav] button:first-child');
    await click('[data-nat-nav] button:first-child');
    await click('[data-nat-nav] button:first-child');
    await wait('store.getState().labStep === 1');
    assert(await page.evaluate('return document.querySelector("[data-nat-next]").disabled;'));
    await navigateFrom(pc2);
    await wait('document.querySelector(".pc-browser-page")?.textContent.includes("Oficina conectada")');
    assert(await page.evaluate('return store.getState().labResults["nat-proof-nat-before-pc2"].detail !== store.getState().labResults["nat-proof-nat-after-pair"].detail;'));
    await click('.pc-desktop-close');
    await page.evaluate(`
      const legacy = ws.controller.recoveryDocument();
      legacy.topology.labProgress.step = 2;
      delete legacy.topology.labProgress.quiz['nat-rule-screen'];
      const opened = await ws.controller.openDocument(legacy);
      if (!opened.ok) throw Error(JSON.stringify(opened.error));
    `);
    await wait('document.querySelector("[data-nat-screen]")?.textContent.startsWith("1/3")');
    assert(await page.evaluate('return !document.querySelector(".lab-panel") && store.getState().labResults["nat-after-pair"].pass;'));
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
    await wait('store.getState().labStep === 2');
    assert(await page.evaluate('return sim.net.devices.get("edge").fw.nat.postrouting.rules.some(rule => rule.match.srcNet?.prefix === 24 && rule.match.oif === "eth1" && rule.action.type === "masquerade");'));
    await click(next);
    await wait('document.querySelector("[data-guided-image]")');
    await click(next);
    await wait('document.querySelector("[data-nat-finished]")?.textContent.includes("Tutorial concluído")');
    await check();
    assert(await page.evaluate('return store.getState().labResults["nat-after-pair"].pass;'));
    const attempt = await page.evaluate('return ws.controller.getState().activeDraftId;');
    await click('[data-explore-network]');
    await wait('!document.querySelector("[data-exercise=guided-nat-pat]")');
    await guidedMenu();
    await click('[data-nat-resume]');
    await wait('document.querySelector("[data-nat-finished]")');
    assert.equal(await page.evaluate('return ws.controller.getState().activeDraftId;'), attempt);
    await page.evaluate('[...document.querySelectorAll(".toolbar-menu-trigger")].find(e => e.textContent.trim().startsWith("Labs")).click();');
    await wait('document.querySelector("#toolbar-labs-menu")');
    await page.evaluate('[...document.querySelectorAll("#toolbar-labs-menu button")].find(e => e.textContent.includes("Static addressing & ARP")).click();');
    await wait('document.querySelector(".lab-footer button")?.textContent === "Export attempt for submission"');
    report.results['NAT/PAT tutorial: Inspector and xterm, current PC2 browser proof, real PAT, F5 and Save/Load'] = { passed: true };
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
