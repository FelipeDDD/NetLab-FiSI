import { TERMINAL_FONTS, terminalFontFamily, type TerminalFont } from './terminalAppearance';

// Versioned same-origin URLs: HTTP cache can reuse bytes across tabs and reloads.
// Merely importing this module never constructs a FontFace or requests a font.
export const HOSTED_TERMINAL_FONTS = {
  'jetbrains-mono': { path: 'jetbrains-mono/19371302/', files: ['JetBrainsMono-Regular.woff2', 'JetBrainsMono-Bold.woff2'] },
  'fira-code': { path: 'fira-code/6.2/', files: ['FiraCode-Regular.woff2', 'FiraCode-Bold.woff2'] },
  'ibm-plex-mono': { path: 'ibm-plex-mono/71f55899/', files: ['IBMPlexMono-Regular.woff2', 'IBMPlexMono-Bold.woff2'] },
  'source-code-pro': { path: 'source-code-pro/803b7e23/', files: ['SourceCodePro-Regular.ttf.woff2', 'SourceCodePro-Bold.ttf.woff2'] },
} as const;
type HostedFont = keyof typeof HOSTED_TERMINAL_FONTS;
const pending = new Map<HostedFont, Promise<boolean>>();
let localConsolas: Promise<boolean> | undefined;

function loadHostedFont(font: HostedFont): Promise<boolean> {
  const existing = pending.get(font);
  if (existing) return existing;
  const asset = HOSTED_TERMINAL_FONTS[font];
  const load = Promise.all(asset.files.map((file, index) => {
    const url = new URL(`${import.meta.env.BASE_URL}assets/fonts/${asset.path}${file}`, document.baseURI);
    return new FontFace(TERMINAL_FONTS[font].webFamily, `url("${url.href}") format("woff2")`, {
      style: 'normal', weight: index === 0 ? '400' : '700', display: 'swap',
    }).load();
  })).then(faces => {
    for (const face of faces) document.fonts.add(face);
    return true;
  }).catch(() => {
    // A failed network request never rewrites the saved preference. Retrying
    // after selecting/reopening remains possible; successful loads stay cached.
    pending.delete(font);
    return false;
  });
  pending.set(font, load);
  return load;
}

/** Resolve a renderable family before applying it to xterm's measured grid. */
export async function loadTerminalFont(font: TerminalFont): Promise<string> {
  if (typeof document === 'undefined' || !document.fonts || typeof FontFace === 'undefined') return terminalFontFamily(font);
  let hosted: HostedFont | undefined;
  if (font === 'consolas') {
    // fonts.check() accepts nonexistent families via fallback. A local-only
    // FontFace probe verifies availability without copying any Microsoft font.
    localConsolas ??= new FontFace('NetLab Local Consolas Probe', 'local("Consolas")').load()
      .then(() => true, () => false);
    if (await localConsolas) return terminalFontFamily(font);
    hosted = 'jetbrains-mono';
  } else if (Object.hasOwn(HOSTED_TERMINAL_FONTS, font)) hosted = font as HostedFont;
  if (!hosted) return terminalFontFamily(font);
  return await loadHostedFont(hosted) ? terminalFontFamily(hosted) : terminalFontFamily('system');
}
