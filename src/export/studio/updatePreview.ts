/** Update synchronously inside the existing browsing context. Navigating srcDoc
 * on each keystroke clears the page and loses its interaction state. */
export function updateStudioPreview(doc: Document, html: string) {
  const next = new DOMParser().parseFromString(html, 'text/html');
  doc.documentElement.lang = next.documentElement.lang;
  doc.title = next.title;
  const style = doc.head.querySelector('style');
  if (style) style.textContent = next.head.querySelector('style')?.textContent ?? '';
  const pages = [...doc.body.children], fresh = [...next.body.children];
  fresh.forEach((page, i) => {
    const existing = pages[i];
    if (existing) {
      for (const a of [...existing.attributes]) existing.removeAttribute(a.name);
      for (const a of [...page.attributes]) existing.setAttribute(a.name, a.value);
      existing.replaceChildren(...[...page.childNodes].map(node => doc.importNode(node, true)));
    } else doc.body.appendChild(doc.importNode(page, true));
  });
  pages.slice(fresh.length).forEach(page => page.remove());
}
