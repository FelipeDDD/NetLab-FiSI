import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const device = (id, kind, x, y, ips) => ({ id, kind, name: id, x, y, forwarding: ['router', 'firewall'].includes(kind),
  ifaces: ips.map((ip, i) => ({ name: 'eth' + i, ip, up: true })), routes: [] });
function topology(large) {
  const count = large ? 20 : 4;
  const devices = [device('sw1', 'switch', 520, 245, Array(24).fill(null)),
    device('r1', 'router', 280, 65, ['192.168.10.1/24', '10.20.0.1/24', '172.16.0.1/24', null]),
    device('fw1', 'firewall', 590, 60, ['192.168.10.254/24', '10.30.0.1/24', null, null]),
    device('ap1', 'ap', 850, 60, Array(8).fill(null)), device('srv1', 'server', 1080, 55, ['192.168.10.2/24'])];
  devices[1].dhcpPools = { eth0: { enabled: true, rangeStart: '192.168.10.100', rangeEnd: '192.168.10.180', router: '192.168.10.1', dns: '192.168.10.2' } };
  devices[1].dnsServer = { enabled: true, records: [] };
  devices[1].httpServer = { enabled: true, port: 80, body: 'NetLab' };
  for (let i = 0; i < count; i++) {
    const pc = device('pc' + (i + 1), 'host', 30 + (i % 5) * 210, 410 + Math.floor(i / 5) * 155,
      [i === 2 || i === 3 ? null : `192.168.10.${100 + i}/24`]);
    if (i % 3 === 0 || i === 2) pc.ifaces[0].ipv4Mode = 'dhcp';
    devices.push(pc);
  }
  const peers = [...devices.filter(d => d.kind === 'host'), ...devices.filter(d => ['router', 'firewall', 'ap', 'server'].includes(d.kind))];
  return { app: 'netsim', version: 1, devices, links: peers.map((d, i) => ({ id: 'link-' + d.id, a: ['sw1', 'eth' + i], b: [d.id, 'eth0'] })),
    ui: { cableColors: { 'link-fw1': { mode: 'manual', color: '#e76670' }, 'link-pc2': { mode: 'manual', color: '#5b9ee8' } } } };
}

export async function runLegibilityReview({ page, url, root, report, phase, openPage }) {
  const directory = path.join(root, '.playwright-mcp/reviews/raw/legibility-' + phase);
  await mkdir(directory, { recursive: true });
  const database = 'netlab-idb-test-' + crypto.randomUUID(), measurements = [], captures = [];
  const delay = ms => new Promise(r => setTimeout(r, ms));
  const wait = async expression => { for (let i = 0; i < 150; i++) { try { if (await page.evaluate(`return !!(${expression});`)) return; } catch {} await delay(40); } throw Error('Legibility condition: ' + expression); };
  const sameViewport = (a, b) => ['x', 'y', 'zoom'].every(k => Math.abs(a[k] - b[k]) < .00001);
  let zoomPage;
  const zoom = async factor => {
    assert(await zoomPage.evaluate(`return new Promise(r=>chrome.settingsPrivate.setDefaultZoom(${factor},r));`));
    await page.send('Page.bringToFront'); await delay(90);
    assert(Math.abs(await page.evaluate('return devicePixelRatio;') - factor) < .01);
  };
  const shot = async (filename, metadata) => {
    const result = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(path.join(directory, filename), Buffer.from(result.data, 'base64'));
    captures.push({ filename, ...metadata });
  };
  const measure = () => page.evaluate(`
    const rect=e=>e?.getBoundingClientRect().toJSON();
    const font=e=>e&&getComputedStyle(e).fontSize;
    const node=document.querySelector('.react-flow__node[data-id="pc1"]');
    const labels=[...document.querySelectorAll('.react-flow__node')].map(n=>({id:n.dataset.id,box:rect(n),name:rect(n.querySelector('.dev-label')),ip:rect(n.querySelector('.node-network-label')),sprite:rect(n.querySelector('.device-artwork')),font:font(n.querySelector('.dev-label')),ipFont:font(n.querySelector('.node-network-label')),truncated:[...n.querySelectorAll('.node-ip-value')].filter(e=>e.scrollWidth>e.clientWidth+1).map(e=>({text:e.textContent,width:e.clientWidth,full:e.scrollWidth}))}));
    const names=labels.filter(n=>n.id.startsWith('pc'));
    const overlaps=[];for(let i=0;i<names.length;i++)for(let j=i+1;j<names.length;j++){
      const a=names[i],b=names[j];for(const [x,y] of [[a.name,b.name],[a.ip,b.ip],[a.name,b.ip],[a.ip,b.name]])
        if(x&&y&&Math.min(x.right,y.right)-Math.max(x.left,y.left)>1&&Math.min(x.bottom,y.bottom)-Math.max(x.top,y.top)>1)overlaps.push([a.id,b.id]);
    }
    return {viewport:flow.getViewport(),dpr:devicePixelRatio,width:innerWidth,height:innerHeight,labels,overlaps,
      positions:store.getState().nodes.map(n=>({id:n.id,position:n.position})),document:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],
      form:[...document.querySelectorAll('.inspector label,.inspector .iface-ip,.inspector .dhcp-pool-summary,.inspector .interface-summary-config')].filter(e=>e.getBoundingClientRect().height).map(e=>({class:e.className,text:e.textContent?.slice(0,45),font:font(e)}))};`);
  try {
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false });
    await page.send('Page.navigate', { url }); await wait("document.readyState==='complete'&&location.pathname==='/__workspace_ui_test__'");
    await page.evaluate(`window.entry=await import('/src/workspace/reviewEntry.tsx');window.store=(await import('/src/store.ts')).useStore;window.theme=(await import('/src/uiTheme.ts')).useUiTheme;window.probe=await import('/src/workspace/viewportProbe.browser.tsx');window.workspace=await entry.mountWorkspaceReview(document.getElementById('root'),{databaseName:${JSON.stringify(database)}});`);
    await wait("document.querySelector('.react-flow')");await page.evaluate('window.flow=probe.getViewportProbe();');
    zoomPage = await openPage(); await zoomPage.send('Page.navigate', { url: 'chrome://settings/' });
    for (let i=0;i<70;i++) { try { if(await zoomPage.evaluate('return !!chrome.settingsPrivate?.setDefaultZoom;')) break; } catch {} await delay(40); }
    for (const large of [false, true]) {
      await page.evaluate(`const r=await workspace.controller.openDocument({schemaVersion:1,topology:${JSON.stringify(topology(large))}});if(!r.ok)throw Error(JSON.stringify(r));store.getState().setPaused(true);`);
      await wait(`document.querySelectorAll('.react-flow__node').length===${large ? 25 : 9}`); await delay(180);
      for (const width of [1440, 700]) for (const theme of ['graphite-dark', 'classic-light']) {
        await zoom(1); await page.send('Emulation.setDeviceMetricsOverride', { width, height:960, deviceScaleFactor:1, mobile:false });
        await page.evaluate(`theme.getState().setTheme(${JSON.stringify(theme)});store.getState().select(null);`); await delay(90);
        for (const browserZoom of [1, 1.25, 1.5]) {
          const before = await page.evaluate('return flow.getViewport();'); await zoom(browserZoom);
          assert(sameViewport(before, await page.evaluate('return flow.getViewport();')), 'Browser zoom changed canvas viewport');
          for (const flowZoom of [.5, .75, 1, 1.25]) {
            await page.evaluate(`await flow.setViewport({x:20,y:20,zoom:${flowZoom}});`); await delay(30);
            for (const inspector of [false, true]) {
              const meta = { large, width, theme, browserZoom, flowZoom, inspector };
              await page.evaluate(`store.getState().select(${inspector ? "'fw1'" : 'null'});`); await delay(50);
              const current = await measure(); measurements.push({ ...meta, ...current });
              assert(sameViewport({x:20,y:20,zoom:flowZoom},current.viewport));
              assert(current.document[0] <= current.width + 1 && current.document[1] <= current.height + 1, 'External overflow');
              if (phase === 'after') assert.equal(current.overlaps.length, 0, 'Neighboring PC captions overlap');
              if (phase === 'after') for (const label of current.labels) {
                if (label.ip) assert(label.name.bottom <= label.ip.top + 1, 'Name overlaps its own network caption');
                assert.equal(label.truncated.length, 0, 'Ordinary layout truncated an IPv4 address');
              }
              const capture = browserZoom === 1 && ((large && width===1440 && theme==='graphite-dark' && [.5,.75].includes(flowZoom) && !inspector)
                || (large && width===700 && theme==='classic-light' && flowZoom===.75 && inspector)
                || (!large && width===1440 && theme==='graphite-dark' && flowZoom===1 && inspector));
              if (capture) await shot(`${large?'large':'small'}-${theme}-${width}-${flowZoom}-${inspector?'inspector':'canvas'}.png`, meta);
            }
          }
        }
      }
    }
    await zoom(1); await page.send('Emulation.setDeviceMetricsOverride', { width:1440, height:960,deviceScaleFactor:1,mobile:false });
    await page.evaluate("theme.getState().setTheme('graphite-dark');store.getState().select('r1');await flow.setViewport({x:20,y:20,zoom:.75});"); await delay(100);
    for (const tab of ['Interfaces','Dienste']) {
      await page.evaluate(`const t=[...document.querySelectorAll('.inspector [role=tab]')].find(t=>t.textContent===${JSON.stringify(tab)});if(!t)throw Error('Missing tab');t.click();`); await delay(90);
      if(tab==='Interfaces') await page.evaluate("document.querySelector('.router-interface-editor').open=true;");
      else await page.evaluate("document.querySelector('.dhcp-pool-actions button').click();");
      await delay(100); const m = await measure(); measurements.push({ form:tab,...m });
      if(phase==='after') assert(m.form.every(f=>parseFloat(f.font)>=13),'Important configuration font below 13px');
      await shot('router-'+tab.toLowerCase()+'.png',{form:tab});
    }
    // Closely spaced equal-row PCs: bounded captions must not grow across peers.
    await page.evaluate("store.getState().select(null);store.setState(s=>({nodes:s.nodes.map(n=>n.id==='pc2'?{...n,position:{x:150,y:410}}:n)}));await flow.setViewport({x:20,y:20,zoom:.5});");await delay(100);
    const dense=await measure();measurements.push({dense:true,...dense});
    if(phase==='after')assert.equal(dense.overlaps.length,0,'Dense captions overlap');
    await shot('dense-captions.png',{dense:true});
    if(phase==='after') {
      const baseline=JSON.parse(await readFile(path.join(root,'.playwright-mcp/reviews/raw/legibility-before/results.json'),'utf8'));
      for(const [i,m] of measurements.entries()) {
        const old=baseline.measurements[i];assert(old&&sameViewport(old.viewport,m.viewport));assert.deepEqual(old.positions,m.positions);
        for(const label of m.labels) {
          const previous=old.labels.find(n=>n.id===label.id);assert.deepEqual(label.box,previous.box,'Node hitbox changed');assert.deepEqual(label.sprite,previous.sprite,'Sprite geometry changed');
        }
      }
    }
    report.results['legibility: zoom/browser/themes/panels, original geometry, dense labels and configuration forms']={passed:true};
  } finally {
    if(zoomPage){try{await zoomPage.evaluate('return new Promise(r=>chrome.settingsPrivate.setDefaultZoom(1,r));');await zoomPage.send('Page.close');}catch{}zoomPage.close();}
    try{await page.evaluate('workspace?.dispose();');}catch{}
    await page.evaluate(`await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase(${JSON.stringify(database)});r.onsuccess=resolve;r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Disposable legibility cleanup blocked'));});`);
    await writeFile(path.join(directory,'results.json'),JSON.stringify({phase,measurements,captures},null,2));
    report.legibilityReview={phase,measurements:measurements.length,captures:captures.length,directory};
  }
}
