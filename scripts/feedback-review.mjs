import assert from 'node:assert/strict';

const embedUrl = 'https://tally.so/embed/NetLabTestOnly';

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
  const requests = [];
  await page.send('Fetch.enable', { patterns: [{ urlPattern: 'https://tally.so/*' }] });
  const release = page.onEvent('Fetch.requestPaused', ({ requestId, request }) => {
    requests.push(request);
    void page.send('Fetch.fulfillRequest', {
      requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/html' }],
      body: Buffer.from('<!doctype html><title>Form fixture</title><input type="file">').toString('base64'),
    });
  });
  try {
    await page.send('Page.navigate', { url });
    await wait('document.readyState==="complete" && document.getElementById("root")');
    await page.evaluate(`
      window.language = (await import('/src/i18n/index.ts')).useLanguage;
      (await import('/src/uiTheme.ts')).useUiTheme.getState().setTheme('graphite-dark');
      window.ws = await (await import('/src/workspace/reviewEntry.tsx')).mountWorkspaceReview(document.getElementById('root'), { databaseName: ${JSON.stringify(database)} });
    `);
    await wait('document.querySelector(".toolbar")');
    assert.equal(await page.evaluate(`return !!${button};`), configured);
    assert.equal(requests.length, 0);
    if (!configured) {
      report.results['feedback: absent without a configured ID, no Tally request'] = { passed: true };
      return;
    }

    for (const width of [1440, 400]) {
      await page.send('Emulation.setDeviceMetricsOverride', { width, height: 850, deviceScaleFactor: 1, mobile: width === 400 });
      for (const [locale, suffix] of [['pt-BR', ''], ['en', '?utm_source=chatgpt.com'], ['de', '?email=teste@example.com#privado']]) {
        const before = requests.length;
        const location = await page.evaluate(`
          language.getState().setLanguage(${JSON.stringify(locale)});
          history.replaceState(null, '', '/app.html' + ${JSON.stringify(suffix)});
          ${button}.focus();
          ${button}.click();
          return window.location.href;
        `);
        await wait('document.querySelector(".feedback-dialog[open] iframe")');
        for (let i = 0; i < 200 && requests.length === before; i++) await new Promise(resolve => setTimeout(resolve, 50));
        assert.equal(requests.length, before + 1);
        const request = requests.at(-1);
        assert.equal(request.method, 'GET');
        assert.equal(request.url, embedUrl);
        assert(!request.hasPostData && !Object.keys(request.headers).some(key => /^referer$/i.test(key)));
        assert.deepEqual(await page.evaluate(`
          const dialog = document.querySelector('.feedback-dialog');
          const iframe = dialog.querySelector('iframe');
          const rect = dialog.getBoundingClientRect();
          return {
            url: window.location.href, policy: iframe.referrerPolicy, src: iframe.src,
            closeFocused: document.activeElement === dialog.querySelector('button'),
            fits: rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight,
            dark: getComputedStyle(dialog).colorScheme === 'dark',
          };
        `), { url: location, policy: 'no-referrer', src: embedUrl, closeFocused: true, fits: true, dark: true });

        if (locale === 'de') {
          for (const type of ['keyDown', 'keyUp']) await page.send('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
        } else {
          await page.evaluate('document.querySelector(".feedback-dialog-close").click();');
        }
        await wait(`!document.querySelector(".feedback-dialog") && document.activeElement===${button}`);
      }
    }
    report.results['feedback: clean iframe requests, desktop/mobile layout, and focus restored'] = { passed: true };
  } finally {
    release();
    await page.send('Fetch.disable');
    await page.evaluate(`window.ws?.dispose();await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase(${JSON.stringify(database)});r.onsuccess=resolve;r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Database blocked'));});`);
  }
}
