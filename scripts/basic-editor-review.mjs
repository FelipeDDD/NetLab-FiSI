import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function runBasicEditorReview({ page, url, root, report }) {
  const directory = path.join(root, '.playwright-mcp/reviews/basic-editor-3a');
  const images = path.join(directory, 'referencias-chatgpt'); await mkdir(images, { recursive: true });
  const databases = [], captures = [], results = {};
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const wait = async expression => { for(let i=0;i<180;i++){try{if(await page.evaluate(`return !!(${expression});`))return;}catch{}await delay(40);}throw Error('Basic editor timeout: '+expression); };
  const test = async (name, action) => { try {await action();results['basic-i18n: '+name]={passed:true};}catch(error){results['basic-i18n: '+name]={passed:false,error:error.stack};throw error;} };
  const capture = async filename => {
    await page.evaluate(`await document.fonts.ready;document.querySelector('.react-flow__controls-fitview')?.click();`);await delay(200);
    const image = await page.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    await writeFile(path.join(images,filename),Buffer.from(image.data,'base64'));captures.push(filename);
  };
  try {
    for(const language of ['de','en','pt-BR']) for(const [theme,width]of [['graphite-dark',1440],['classic-light',900]]) {
      const prefix=language+'-'+theme, database='netlab-idb-test-'+crypto.randomUUID();databases.push(database);
      await page.send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
      await page.send('Page.navigate',{url});await wait(`document.readyState==='complete'&&location.pathname==='/__application_boot_test__'`);
      await page.evaluate(`await import('/node_modules/@xyflow/react/dist/style.css');await import('/node_modules/@xterm/xterm/css/xterm.css');await import('/src/themes.css');await import('/src/styles.css');await import('/src/buttons.css');window.i18n=await import('/src/i18n/index.ts');i18n.useLanguage.getState().setLanguage(${JSON.stringify(language)});window.tr=key=>i18n.translate(i18n.useLanguage.getState().language,key);window.store=(await import('/src/store.ts')).useStore;window.theme=(await import('/src/uiTheme.ts')).useUiTheme;theme.getState().setTheme(${JSON.stringify(theme)});const entry=await import('/src/workspace/WorkspaceApplication.tsx');window.application=entry.mountWorkspaceApplication(document.getElementById('root'),{repositoryOptions:{databaseName:${JSON.stringify(database)}},legacy:{storage:{getItem:()=>null},origin:location.origin}});await application.ready;`);
      await wait(`document.querySelector('.palette')`);
      if(await page.evaluate(`return document.querySelector('.palette').classList.contains('is-collapsed');`))await page.evaluate(`document.querySelector('.palette-toggle').click();`);
      await test(prefix+': full catalog, titles, tools and no clipped labels',async()=>{
        await wait(`document.querySelector('.palette-title').textContent===tr('navigation.paletteCatalog')`);
        assert.equal(await page.evaluate(`return document.querySelectorAll('.palette-item').length;`),8);
        assert.equal(await page.evaluate(`return [...document.querySelectorAll('.palette-item')].every(e=>e.title.includes(tr('navigation.paletteAddHint').split('{description}').at(-1))&&e.getAttribute('aria-label')===e.querySelector('.palette-item-label').textContent);`),true);
        assert.equal(await page.evaluate(`return [...document.querySelectorAll('.palette-item-label')].every(e=>e.scrollWidth<=e.clientWidth+1);`),true);
        await capture(prefix+'-palette.png');
        await page.evaluate(`document.querySelector('.palette [role=tab]:last-child').click();`);await wait(`document.querySelector('.palette-empty')?.textContent===tr('navigation.paletteEmpty')`);
        await page.evaluate(`document.querySelector('.palette [role=tab]').click();`);
      });
      await test(prefix+': drag payload and drop add the correct device',async()=>{
        const before=await page.evaluate(`return store.getState().nodes.length;`);
        const payload=await page.evaluate(`const transfer=new DataTransfer();document.querySelector('.palette-item.kind-host').dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:transfer}));const flow=document.querySelector('.react-flow'),r=flow.getBoundingClientRect();flow.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer,clientX:r.x+r.width/2,clientY:r.y+r.height/2}));return {kind:transfer.getData('application/netsim'),effect:transfer.effectAllowed};`);
        // Synthetic DataTransfer cannot enter the browser's native drag session;
        // the MIME payload and the actual Flow drop handler are still exercised.
        assert.equal(payload.kind,'host');await wait(`store.getState().nodes.length===${before+1}`);
      });
      for(const kind of ['host','notebook','server','router','switch','ap','smartphone','firewall'])await test(prefix+': '+kind+' selection and language change preserve identity, draft and tabs',async()=>{
        await page.evaluate(`document.querySelector('.palette-item.kind-${kind}').click();`);
        await wait(`store.getState().nodes.at(-1)?.data.kind===${JSON.stringify(kind)}`);
        await page.evaluate(`window.id=store.getState().nodes.at(-1).id;store.getState().renameDevice(id,'Mein Gerät – São Paulo 東京');store.getState().select(id);`);
        await wait(`document.querySelector('.inspector:not([hidden]) .inspector-head')?.textContent.includes('São Paulo')`);
        const before=await page.evaluate(`return store.getState().captureWorkspaceDocument();`);
        const active=await page.evaluate(`return document.querySelector('.inspector:not([hidden]) [role=tab][aria-selected=true]')?.id;`);
        for(const lang of ['de','en','pt-BR']){
          await page.evaluate(`i18n.useLanguage.getState().setLanguage(${JSON.stringify(lang)});`);await delay(25);
          assert.equal(await page.evaluate(`return store.getState().selected;`),await page.evaluate(`return id;`));
          assert.deepEqual(await page.evaluate(`return store.getState().captureWorkspaceDocument();`),before);
          assert.equal(await page.evaluate(`return document.querySelector('.inspector:not([hidden]) [role=tab][aria-selected=true]')?.id;`),active);
          if(kind!=='smartphone')assert.equal(await page.evaluate(`return document.querySelector('.inspector:not([hidden]) [role=tab]').textContent;`),await page.evaluate(`return tr('navigation.basicGeneral');`));
          assert.equal(await page.evaluate(`return document.querySelector('.inspector:not([hidden]) .btn.danger').textContent.trim();`),await page.evaluate(`return tr('navigation.basicDelete');`));
        }
        await page.evaluate(`i18n.useLanguage.getState().setLanguage(${JSON.stringify(language)});`);await delay(25);
        if(kind==='host'){
          await page.evaluate(`const el=document.querySelector('.inspector:not([hidden]) .inspector-name');el.focus();el.select();`);await page.send('Input.insertText',{text:'Uncommitted – 東京'});
          await page.evaluate(`i18n.useLanguage.getState().setLanguage('en');`);await delay(30);
          assert.equal(await page.evaluate(`return document.querySelector('.inspector:not([hidden]) .inspector-name').value;`),'Uncommitted – 東京');
          await page.evaluate(`const el=document.querySelector('.inspector:not([hidden]) .inspector-name');el.focus();el.select();`);
          await page.send('Input.insertText',{text:'Mein Gerät – São Paulo 東京'});
          await page.evaluate(`document.querySelector('.inspector:not([hidden]) .inspector-name').blur();`);
          await page.evaluate(`i18n.useLanguage.getState().setLanguage(${JSON.stringify(language)});`);
        }
        if(['host','router','switch','ap'].includes(kind))await capture(prefix+'-'+kind+'.png');
      });
      await test(prefix+': device action labels and no-selection state',async()=>{
        assert.equal(await page.evaluate(`return [...document.querySelectorAll('.device-terminal')].every(e=>e.title.startsWith(tr('navigation.basicOpenTerminal').split(':')[0]));`),true);
        await page.evaluate(`store.getState().select(null);`);await wait(`!document.querySelector('.inspector:not([hidden])')`);
        assert.equal(await page.evaluate(`return document.documentElement.scrollWidth<=innerWidth+1;`),true);
      });
      await page.evaluate(`application.dispose();`);
    }
  } finally {
    await page.evaluate(`window.application?.dispose();`).catch(()=>{});
    for(const name of databases){assert(/^netlab-idb-test-[\da-f-]{36}$/.test(name));await page.evaluate(`await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase(${JSON.stringify(name)});r.onsuccess=resolve;r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Disposable cleanup blocked'));});`);}
    Object.assign(report.results,results);report.basicEditor={checks:Object.keys(results).length,captures};
    await writeFile(path.join(directory,'validation.json'),JSON.stringify(report.basicEditor,null,2));
    await writeFile(path.join(directory,'index.html'),'<!doctype html><meta charset="utf-8"><title>Palette / Inspector 3A</title><style>body{background:#171d24;color:white;font-family:system-ui}img{max-width:100%;width:1100px}figure{margin:24px}</style>'+captures.map(f=>`<figure><figcaption>${f}</figcaption><a href="referencias-chatgpt/${f}"><img src="referencias-chatgpt/${f}" alt="${f}"></a></figure>`).join(''));
  }
}
