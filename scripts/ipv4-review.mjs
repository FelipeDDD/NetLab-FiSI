import assert from 'node:assert/strict';

// Real inputs and workspace persistence with an isolated Chromium profile/database.
export async function runIpv4Review({ page, url, report }) {
  const database = 'netlab-idb-test-' + crypto.randomUUID();
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const wait = async expression => {
    for (let i = 0; i < 200; i++) { if (await page.evaluate('return !!(' + expression + ');')) return; await delay(40); }
    throw Error('IPv4 review condition: ' + expression);
  };
  const test = async (name, fn) => {
    try { await fn(); report.results['ipv4 edit: ' + name] = { passed: true }; }
    catch (error) { report.results['ipv4 edit: ' + name] = { passed: false, error: error.stack }; throw error; }
  };
  const ip = '[aria-label="IP-Adresse eth0"]', mask = '[aria-label="Subnetzmaske eth0"]';
  const gateway = '[aria-label="Standardgateway eth0"]', dns = '[aria-label="DNS-Server eth0"]';
  const warning = 'Hinweis: Das Standardgateway liegt nicht im selben Subnetz.';
  const mount = async navigate => {
    if (navigate) await page.send('Page.navigate', { url }); else await page.send('Page.reload');
    await wait("document.readyState==='complete'&&location.pathname==='/__workspace_ui_test__'");
    await page.evaluate("window.entry=await import('/src/workspace/reviewEntry.tsx');window.store=(await import('/src/store.ts')).useStore;window.sim=(await import('/src/sim.ts')).sim;window.serial=await import('/src/engine/serialize.ts');window.ws=await entry.mountWorkspaceReview(document.getElementById('root'),{databaseName:" + JSON.stringify(database) + "});");
    await wait("document.querySelector('.react-flow')");
  };
  const inspect = async () => {
    await page.evaluate("store.getState().select('office');");
    await wait("document.querySelector('.inspector-tabs button')");
    await page.evaluate("const b=[...document.querySelectorAll('.inspector-tabs button')].find(e=>e.textContent.trim()==='Netzwerk');if(!b)throw Error('Netzwerk tab');b.click();");
    await wait("document.querySelector(" + JSON.stringify(ip) + ")?.getBoundingClientRect().width>0");
  };
  const field = async (selector, value, blur = true) => {
    await page.evaluate("const e=document.querySelector(" + JSON.stringify(selector) + ");e.focus();e.select();");
    await page.send('Input.insertText', { text: value });
    if (blur) { await page.evaluate('document.activeElement.blur();'); await delay(80); }
  };
  const model = () => page.evaluate("const d=sim.net.devices.get('office'),i=d.interfaces[0];return {ip:i.ipv4.ip,gateway:i.ipv4.gateway,dns:i.ipv4.dns,routes:d.staticRoutes};");
  const values = () => page.evaluate("return [" + [ip, mask, gateway, dns].map(s => "document.querySelector(" + JSON.stringify(s) + ").value").join(',') + "];");
  const number = value => value.split('.').reduce((n, x) => n * 256 + Number(x), 0);
  const close = async () => {
    try { await page.evaluate('ws?.dispose();'); } catch {}
    await page.evaluate("await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase(" + JSON.stringify(database) + ");r.onsuccess=resolve;r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('IPv4 test database blocked'));});");
  };
  try {
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false });
    await mount(true);
    await page.evaluate("const e=(await import('/src/exercises/beta.ts')).PRACTICAL_EXERCISES.find(x=>x.id==='pilot-d02-v1');const r=await ws.controller.openDocument({schemaVersion:1,topology:structuredClone(e.student.initialTopology)});if(!r.ok)throw Error(JSON.stringify(r));window.originalRoutes=structuredClone(sim.net.devices.get('office').staticRoutes);");
    await inspect();
    await test('D02 explicit route stays separate from empty interface gateway', async () => {
      assert.equal((await values())[2], '');
      assert(await page.evaluate("return originalRoutes.some(r=>r.prefix===0&&r.via===(10*2**24+72*2**16+1*256+1));"));
      assert.equal(await page.evaluate("return document.querySelector('.ipv4-interface').textContent.includes(" + JSON.stringify(warning) + ");"), false);
    });
    await test('off-subnet gateway is accepted and warning is informative', async () => {
      await field(dns, '10.72.1.53');
      await field(gateway, '10.72.2.1');
      assert.deepEqual(await values(), ['10.72.1.10/26', '255.255.255.192', '10.72.2.1', '10.72.1.53']);
      const m = await model(); assert.equal(m.gateway, number('10.72.2.1')); assert.equal(m.dns, number('10.72.1.53'));
      assert.deepEqual(m.routes, await page.evaluate('return originalRoutes;'));
      assert(await page.evaluate("return document.querySelector('.ipv4-interface').textContent.includes(" + JSON.stringify(warning) + ");"));
      assert.equal(await page.evaluate("return !!document.querySelector(" + JSON.stringify(gateway) + ").getAttribute('aria-invalid');"), false);
    });
    await test('slow sequential address edits keep cursor and gateway/dns', async () => {
      await field(ip, '10.72.3.1', false);
      await delay(750); // Longer than the real auto-commit debounce.
      assert.equal((await values())[0], '10.72.3.1');
      assert.equal(await page.evaluate("const e=document.querySelector(" + JSON.stringify(ip) + ");return e.selectionStart;"), '10.72.3.1'.length);
      assert.equal((await model()).ip.addr, number('10.72.3.1'));
      await page.send('Input.insertText', { text: '0' }); await delay(700);
      assert.equal((await values())[0], '10.72.3.10');
      assert.equal((await model()).ip.addr, number('10.72.3.10'));
      await page.evaluate('document.activeElement.blur();'); await delay(80);
      assert.deepEqual(await values(), ['10.72.3.10/26', '255.255.255.192', '10.72.2.1', '10.72.1.53']);
      assert.deepEqual((await model()).routes, await page.evaluate('return originalRoutes;'));
      await field(gateway, '10.72.3.1');
      assert.equal(await page.evaluate("return document.querySelector('.ipv4-interface').textContent.includes(" + JSON.stringify(warning) + ");"), false);
      await field(gateway, '10.72.2.1');
      assert(await page.evaluate("return document.querySelector('.ipv4-interface').textContent.includes(" + JSON.stringify(warning) + ");"));
    });
    await test('incomplete and malformed fields stay editable without mutating the last valid configuration', async () => {
      const before = await model();
      for (const [selector, invalid] of [[ip, '10.72.1.999'], [ip, '10.72.3.10/33'], [mask, '255.0.255.0'], [gateway, '10.72.2.'], [dns, '1.2.3.999']]) {
        await field(selector, invalid);
        assert.equal(await page.evaluate("return document.querySelector(" + JSON.stringify(selector) + ").value;"), invalid);
        assert.deepEqual(await model(), before);
        if (selector === ip) await field(ip, '10.72.3.10/26');
        if (selector === mask) await field(mask, '255.255.255.192');
        if (selector === gateway) await field(gateway, '10.72.2.1');
        if (selector === dns) await field(dns, '10.72.1.53');
        assert.deepEqual(await model(), before);
      }
    });
    await test('undo and redo preserve explicitly configured routes and the off-subnet gateway', async () => {
      await field(ip, '10.72.4.10/26');
      const changed = await model();
      await page.evaluate('store.getState().undoTopology();'); await delay(80);
      assert.equal((await model()).ip.addr, number('10.72.3.10'));
      await page.evaluate('store.getState().redoTopology();'); await delay(80);
      assert.deepEqual(await model(), changed);
      assert.deepEqual(changed.routes, await page.evaluate('return originalRoutes;'));
    });
    await test('Save/Load, exported JSON, import and plan switching preserve the configuration', async () => {
      const expected = await model();
      await page.evaluate("window.savedDraft=ws.controller.getState().activeDraftId;const r=await ws.controller.saveOpenDraft(savedDraft,'IPv4 Test');if(!r.ok)throw Error(JSON.stringify(r));window.savedPlan=r.value.plan.project.id;const loaded=await ws.repository.loadProject(savedPlan);if(!loaded.ok)throw Error(JSON.stringify(loaded));window.savedDocument=loaded.value.document;window.exported=JSON.stringify(ws.controller.recoveryDocument().topology);");
      const saved = await page.evaluate("return savedDocument.topology.devices.find(d=>d.id==='office');");
      assert.equal(saved.ifaces[0].ip, '10.72.4.10/26'); assert.equal(saved.ifaces[0].gateway, '10.72.2.1');
      await page.evaluate("const r=await ws.controller.openDocument({schemaVersion:1,topology:JSON.parse(exported)});if(!r.ok)throw Error(JSON.stringify(r));window.importedDraft=r.value;");
      assert.deepEqual(await model(), expected);
      await page.evaluate("const r=await ws.controller.switchDraft(savedDraft);if(!r.ok)throw Error(JSON.stringify(r));");
      assert.deepEqual(await model(), expected);
      await page.evaluate("let r=await ws.controller.switchDraft(importedDraft);if(!r.ok)throw Error(JSON.stringify(r));const d=ws.controller.getState().drafts.find(x=>x.id===savedDraft);r=await ws.controller.closeDraft(savedDraft,{expectedEditSequence:d.editSequence});if(!r.ok)throw Error(JSON.stringify(r));");
      await page.evaluate("const r=await ws.controller.openPlan(savedPlan);if(!r.ok)throw Error(JSON.stringify(r));");
      assert.deepEqual(await model(), expected);
      await page.evaluate("const r=await ws.controller.switchDraft(importedDraft);if(!r.ok)throw Error(JSON.stringify(r));await ws.controller.flush();ws.dispose();");
      await mount(false);
      assert.deepEqual(await model(), expected);
      await inspect();
      assert.deepEqual(await values(), ['10.72.4.10/26', '255.255.255.192', '10.72.2.1', '10.72.1.53']);
      assert(await page.evaluate("return document.querySelector('.ipv4-interface').textContent.includes(" + JSON.stringify(warning) + ");"));
    });
  } finally { await close(); }
}
