import assert from 'node:assert/strict';

// Exercise the SDK contract without accessing a real form or submitting data.
const widgetFixture = `
window.Tally = {
  openPopup(id, options) {
    window.popupOptions = { id, layout: options.layout, width: options.width, hiddenFields: options.hiddenFields };
    const popup = document.createElement('dialog');
    popup.dataset.feedbackFixture = '';
    popup.style.width = options.width + 'px';
    const close = document.createElement('button');
    close.textContent = 'Close';
    close.onclick = () => this.closePopup(id);
    popup.appendChild(close);
    document.body.appendChild(popup);
    popup.addEventListener('close', () => { popup.remove(); options.onClose(); }, { once: true });
    popup.showModal();
    options.onOpen();
  },
  closePopup() { document.querySelector('[data-feedback-fixture]')?.close(); },
};
`;

export async function runFeedbackReview({ page, url, report, configured }) {
  const database = 'netlab-idb-test-' + crypto.randomUUID();
  const button = 'document.querySelector("[data-feedback]")';
  const wait = async condition => {
    for (let i = 0; i < 200; i++) {
      if (await page.evaluate(`return !!(${condition});`)) return;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error('Feedback review: ' + condition);
  };
  let blocked = true, requests = 0;
  await page.send('Fetch.enable', { patterns: [{ urlPattern: 'https://tally.so/*' }] });
  const release = page.onEvent('Fetch.requestPaused', ({ requestId, request }) => {
    requests++;
    if (blocked || request.url !== 'https://tally.so/widgets/embed.js') {
      void page.send('Fetch.failRequest', { requestId, errorReason: 'ConnectionFailed' });
    } else {
      void page.send('Fetch.fulfillRequest', {
        requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/javascript' }],
        body: Buffer.from(widgetFixture).toString('base64'),
      });
    }
  });
  try {
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false });
    await page.send('Page.navigate', { url });
    await wait('document.readyState==="complete" && document.getElementById("root")');
    await page.evaluate(`
      window.language = (await import('/src/i18n/index.ts')).useLanguage;
      language.getState().setLanguage('pt-BR');
      (await import('/src/uiTheme.ts')).useUiTheme.getState().setTheme('graphite-dark');
      window.ws = await (await import('/src/workspace/reviewEntry.tsx')).mountWorkspaceReview(document.getElementById('root'), { databaseName: ${JSON.stringify(database)} });
    `);
    await wait('document.querySelector(".toolbar")');
    assert.equal(await page.evaluate(`return !!${button};`), configured);
    assert.equal(requests, 0);
    if (!configured) {
      report.results['feedback: absent without a configured ID, no Tally request'] = { passed: true };
      return;
    }
    assert(await page.evaluate(`const b=${button};return b.previousElementSibling.textContent.endsWith('Ajuda') && b.getAttribute('aria-description').includes('Tally');`));
    await page.evaluate(`history.replaceState(null, '', location.pathname + '?review=private');${button}.click();`);
    await wait('document.querySelector(".toolbar-notice")?.textContent.includes("sem parâmetros")');
    assert.equal(requests, 0);
    await page.evaluate(`history.replaceState(null, '', location.pathname);${button}.click();`);
    await wait('document.querySelector(".toolbar-notice")?.textContent.includes("Não foi possível carregar")');
    assert.equal(requests, 1);
    blocked = false;

    for (const [locale, width] of [['en', 1440], ['de', 400]]) {
      await page.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
      await page.evaluate(`language.getState().setLanguage(${JSON.stringify(locale)});${button}.click();`);
      await wait(`${button}.getAttribute('aria-expanded')==='true'`);
      assert.deepEqual(await page.evaluate('return popupOptions;'), {
        id: 'NetLabTestOnly', layout: 'modal', width: Math.min(560, width - 24),
      });
      assert(await page.evaluate('return !!document.querySelector(".react-flow") && document.documentElement.scrollWidth<=innerWidth+1;'));
      if (locale === 'en') await page.evaluate('document.querySelector("[data-feedback-fixture] button").click();');
      else for (const type of ['keyDown', 'keyUp']) await page.send('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      await wait(`!document.querySelector("[data-feedback-fixture]") && document.activeElement===${button}`);
    }
    assert.equal(requests, 2, 'reuse the loaded widget');
    report.results['feedback: toolbar, privacy guard, error, modal contract and compact closing'] = { passed: true };
  } finally {
    release();
    await page.send('Fetch.disable');
    await page.evaluate(`window.ws?.dispose();await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase(${JSON.stringify(database)});r.onsuccess=resolve;r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Database blocked'));});`);
  }
}
