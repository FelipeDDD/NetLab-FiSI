import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function reviewGuidedVisualHelp({ page, root, click, wait, delay }) {
  const directory = path.join(root, '.playwright-mcp/reviews/guided-visual-help/referencias-chatgpt');
  await mkdir(directory, { recursive: true });
  const capture = async name => {
    await delay(180);
    const png = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(path.join(directory, name + '.png'), Buffer.from(png.data, 'base64'));
  };
  const escape = async () => {
    for (const type of ['keyDown', 'keyUp']) await page.send('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await wait("!document.querySelector('[data-guided-image-dialog]')");
    assert(await page.evaluate("return document.activeElement===document.querySelector('[data-guided-image]');"));
  };
  const open = async () => {
    await click('[data-guided-image]');
    await wait("document.querySelector('[data-guided-image-dialog] img')?.naturalWidth>0");
    assert(await page.evaluate("return document.activeElement===document.querySelector('[data-guided-image-close]');"));
  };
  const before = await page.evaluate("return {document:store.getState().captureWorkspaceDocument(),viewport:document.querySelector('.react-flow__viewport').style.transform};");
  assert(await page.evaluate("return document.querySelectorAll('[data-guided-image]').length===1&&!document.querySelector('[data-static-help]').open;"));
  const aligned = await page.evaluate("const a=document.querySelector('[data-static-help] summary').getBoundingClientRect(),b=document.querySelector('[data-guided-image]').getBoundingClientRect();return Math.abs(a.top-b.top)<5&&b.right<=a.right+1;");
  assert(aligned);
  await capture('01-botao-ajuda-recolhida');
  await open();
  assert(await page.evaluate("const d=document.querySelector('[data-guided-image-dialog]'),p=document.querySelector('.exercise-panel');return d.dataset.modal==='false'&&d.getBoundingClientRect().left>p.getBoundingClientRect().right&&!document.querySelector('[data-static-help]').open;"));
  await capture('02-imagem-aberta');
  for (const [language, label, closedLabel] of [['en', 'Close image', 'View image'], ['pt-BR', 'Fechar imagem', 'Ver imagem'], ['de', 'Bild schließen', 'Bild ansehen']]) {
    await page.evaluate(`lang.getState().setLanguage(${JSON.stringify(language)});`);
    await wait(`document.querySelector('[data-guided-image-dialog] img')?.src.includes('ip-route-${language}.png')&&document.querySelector('[data-guided-image-dialog] img')?.naturalWidth>0`);
    assert.equal(await page.evaluate("return document.querySelector('[data-guided-image]').textContent.trim();"), label);
    await click('[data-guided-image]');
    await wait("!document.querySelector('[data-guided-image-dialog]')");
    assert.equal(await page.evaluate("return document.querySelector('[data-guided-image]').textContent.trim();"), closedLabel);
    await open();
  }
  assert.equal(await page.evaluate("return document.querySelector('[data-guided-image-zoom]').textContent;"), '50%');
  await click('[data-guided-image-zoom]');
  assert(await page.evaluate("const i=document.querySelector('[data-guided-image-dialog] img');return Math.abs(i.getBoundingClientRect().width-i.naturalWidth/2)<1;"));
  await escape();
  await click('[data-static-help] > summary'); await open();
  assert(await page.evaluate("return document.querySelector('[data-static-help]').open;"));
  await click('[data-guided-image-close]');
  await wait("!document.querySelector('[data-guided-image-dialog]')");
  assert(await page.evaluate("return document.querySelector('[data-static-help]').open;"));
  await click('[data-static-help] > summary');
  for (const [width, theme] of [[1024, 'graphite-dark'], [390, 'classic-light']]) {
    await page.send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false });
    await page.evaluate(`theme.getState().setTheme(${JSON.stringify(theme)});`); await delay(180);
    const documentWidth = await page.evaluate('return document.documentElement.scrollWidth;');
    await open();
    const geometry = await page.evaluate("const d=document.querySelector('[data-guided-image-dialog]'),s=d.querySelector('.guided-visual-help-scroll');return {modal:d.matches(':modal'),right:d.getBoundingClientRect().right,width:innerWidth,scroll:s.scrollWidth,client:s.clientWidth,document:document.documentElement.scrollWidth};");
    assert(geometry.modal && geometry.right<=geometry.width && geometry.scroll<=geometry.client+1 && geometry.document<=documentWidth,JSON.stringify({ ...geometry, documentWidth }));
    // Native modal focus stays inside the viewer when tabbing backwards from close.
    for (let i=0;i<6;i++) await page.send('Input.dispatchKeyEvent', { type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9,modifiers:8 });
    assert(await page.evaluate("return document.querySelector('[data-guided-image-dialog]').contains(document.activeElement);"));
    await click('[data-guided-image-zoom]');
    assert(await page.evaluate("const i=document.querySelector('[data-guided-image-dialog] img');return Math.abs(i.getBoundingClientRect().width-i.naturalWidth/2)<1;"));
    if (width === 390) assert(await page.evaluate("const s=document.querySelector('.guided-visual-help-scroll');return s.scrollWidth>s.clientWidth;"));
    await click('[data-guided-image-zoom]');
    assert(await page.evaluate("const s=document.querySelector('.guided-visual-help-scroll');return s.scrollWidth<=s.clientWidth+1;"));
    await escape();
  }
  await page.send('Emulation.setDeviceMetricsOverride', { width:1440, height:1000, deviceScaleFactor:1, mobile:false });
  await page.evaluate("theme.getState().setTheme('graphite-dark');"); await delay(180);
  assert.deepEqual(await page.evaluate("return {document:store.getState().captureWorkspaceDocument(),viewport:document.querySelector('.react-flow__viewport').style.transform};"), before);
  await open();
  await click('[data-exercise=guided-static-routing] header > button[aria-expanded]');
  await wait("!document.querySelector('[data-guided-image-dialog]')");
  await click('[data-exercise=guided-static-routing] header > button[aria-expanded]');
  assert(await page.evaluate("return !document.querySelector('[data-guided-image-dialog]');"));
  // Leave it open so the caller also verifies dismissal when moving to step 3.
  await open();
}
