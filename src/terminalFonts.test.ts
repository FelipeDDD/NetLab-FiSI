import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

function browser(load: (source: string) => Promise<unknown> = () => Promise.resolve()) {
  const created: { family: string; source: string; weight: string }[] = [];
  const add = vi.fn();
  vi.stubGlobal('document', { baseURI: 'https://netlab.test/tools/app.html', fonts: { add } });
  vi.stubGlobal('FontFace', class {
    constructor(readonly family: string, readonly source: string, readonly descriptors: FontFaceDescriptors = {}) {
      created.push({ family, source, weight: descriptors.weight ?? '400' });
    }
    async load() { await load(this.source); return this; }
  });
  return { created, add };
}

it('does not load fonts on module import or when choosing existing system fonts', async () => {
  const b = browser();
  const { loadTerminalFont } = await import('./terminalFonts');
  expect(b.created).toEqual([]);
  for (const font of ['system', 'courier', 'cascadia'] as const) await loadTerminalFont(font);
  expect(b.created).toEqual([]);
});

it('loads only the selected family, deduplicates concurrent sessions and reuses successful loads', async () => {
  const b = browser();
  // Both weights share a single simulated network completion.
  const finishers: (() => void)[] = [];
  vi.stubGlobal('FontFace', class {
    constructor(family: string, source: string, options: FontFaceDescriptors) { b.created.push({ family, source, weight: options.weight! }); }
    load() { return new Promise(resolve => finishers.push(() => resolve(this))); }
  });
  const { loadTerminalFont } = await import('./terminalFonts');
  const first = loadTerminalFont('fira-code'), second = loadTerminalFont('fira-code');
  expect(b.created).toHaveLength(2);
  expect(b.created.every(face => face.source.includes('/assets/fonts/fira-code/6.2/') && face.source.includes('https://netlab.test/'))).toBe(true);
  expect(b.created.map(face => face.weight)).toEqual(['400', '700']);
  expect(b.add).not.toHaveBeenCalled();
  finishers.forEach(finish => finish());
  expect(await first).toBe(await second);
  expect(await loadTerminalFont('fira-code')).toContain('NetLab Fira Code');
  expect(b.created).toHaveLength(2);
  expect(b.add).toHaveBeenCalledTimes(2);
});

it('uses local Consolas without downloading any web font when available', async () => {
  const b = browser();
  const { loadTerminalFont } = await import('./terminalFonts');
  expect(await loadTerminalFont('consolas')).toMatch(/^Consolas,/);
  expect(await loadTerminalFont('consolas')).toMatch(/^Consolas,/);
  expect(b.created.map(face => face.source)).toEqual(['local("Consolas")']);
  expect(b.add).not.toHaveBeenCalled();
});

it('falls back to self-hosted JetBrains Mono when the local-only Consolas probe fails', async () => {
  const b = browser(source => source.startsWith('local(') ? Promise.reject(Error('Not installed')) : Promise.resolve());
  const { loadTerminalFont } = await import('./terminalFonts');
  expect(await loadTerminalFont('consolas')).toMatch(/^"NetLab JetBrains Mono",/);
  expect(b.created).toHaveLength(3);
  expect(b.created.slice(1).every(face => face.source.includes('/assets/fonts/jetbrains-mono/'))).toBe(true);
  await loadTerminalFont('consolas');
  expect(b.created).toHaveLength(3);
});

it('keeps a usable fallback after a failed fetch and allows retry instead of caching failure', async () => {
  let fail = true;
  const b = browser(() => fail ? Promise.reject(Error('Offline')) : Promise.resolve());
  const { loadTerminalFont } = await import('./terminalFonts');
  expect(await loadTerminalFont('ibm-plex-mono')).toContain('Consolas');
  expect(b.add).not.toHaveBeenCalled();
  fail = false;
  expect(await loadTerminalFont('ibm-plex-mono')).toContain('NetLab IBM Plex Mono');
  expect(b.created).toHaveLength(4);
  expect(b.add).toHaveBeenCalledTimes(2);
});

it('ships valid WOFF2 regular/bold assets with the original OFL notices for every hosted family', async () => {
  const { HOSTED_TERMINAL_FONTS } = await import('./terminalFonts');
  for (const asset of Object.values(HOSTED_TERMINAL_FONTS)) {
    const root = new URL(`../public/assets/fonts/${asset.path}`, import.meta.url);
    for (const file of asset.files) expect(readFileSync(new URL(file, root)).subarray(0, 4).toString()).toBe('wOF2');
    expect(readFileSync(new URL('LICENSE.txt', root), 'utf8')).toMatch(/SIL OPEN FONT LICENSE|SIL Open Font License/);
  }
});
