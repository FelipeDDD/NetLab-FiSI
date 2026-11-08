/** Snapshot changes are picked up by closing/reopening the Studio. */
export async function reopenStudio(page) {
  const wait = async expression => {
    for (let n = 0; n < 200; n++) {
      if (await page.evaluate(`return !!(${expression});`)) return;
      await new Promise(resolve => setTimeout(resolve, 40));
    }
    throw Error('Studio reopen timeout: ' + expression);
  };
  await page.evaluate("document.querySelector('.studio-header .studio-window-actions button:last-child').click();");
  await wait("!document.querySelector('.topology-studio')");
  await page.evaluate("document.querySelector('.toolbar-menu-trigger').click();");
  await wait("document.querySelector('.toolbar-menu-action[aria-haspopup=menu]')");
  await page.evaluate("document.querySelector('.toolbar-menu-action[aria-haspopup=menu]').click();");
  await wait("document.querySelector('[data-open-topology-studio]')");
  await page.evaluate("document.querySelector('[data-open-topology-studio]').click();");
  await wait("document.querySelector('.topology-studio iframe')?.contentDocument?.querySelector('[data-print-section=diagram]')");
}
