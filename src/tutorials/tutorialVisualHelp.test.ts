import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { translate, type Language } from '../i18n';
import { GuidedVisualHelp } from './GuidedVisualHelp';
import { alternativeRoutingVisualHelp, staticRoutingVisualHelp, visualHelpPosition } from './tutorialVisualHelp';

describe('optional tutorial visual help', () => {
  it('reuses the same approved route images only on Chapter 5 tasks 8, 9 and 11', () => {
    expect(Object.keys(alternativeRoutingVisualHelp)).toEqual(['8', '9', '11']);
    for (const help of Object.values(alternativeRoutingVisualHelp)) expect(help).toBe(staticRoutingVisualHelp[4]);
  });
  it('associates only steps 2 and 4 with their own existing images in every language', () => {
    expect(Object.keys(staticRoutingVisualHelp)).toEqual(['2', '4']);
    for (const [step, directory, prefix] of [[2, 'imagens-ip-route-sem-setas', 'ip-route'], [4, 'imagens-rotas-estaticas-referencia', 'rota-estatica']] as const) {
      const help = staticRoutingVisualHelp[step]!;
      for (const language of ['de', 'en', 'pt-BR'] as const) {
        expect(help.images[language]).toContain(`${prefix}-${language}.png`);
        const png = readFileSync(new URL(`../../output/${directory}/${prefix}-${language}.png`, import.meta.url));
        expect(png.subarray(1, 4).toString()).toBe('PNG');
        expect(png.readUInt32BE(16)).toBeGreaterThan(1500);
        expect(translate(language, help.description)).toContain(step === 2 ? 'R1' : '192.168.50.0/24');
      }
    }
  });
  it('keeps a full-width side card only where it fits; otherwise uses a modal', () => {
    expect(visualHelpPosition(600, 100, 1440, 1000)).toEqual({ modal: false, left: 612, top: 100, width: 816 });
    expect(visualHelpPosition(600, 100, 1024, 1000).modal).toBe(true);
    expect(visualHelpPosition(380, 100, 390, 844).modal).toBe(true);
    expect(visualHelpPosition(300, 100, 1440, 500).modal).toBe(true);
    const large = visualHelpPosition(600, 900, 2500, 1000);
    expect(large.width).toBe(1100); expect(large.top).toBe(500);
  });
  it('renders a named, collapsed dialog trigger in every language without opening text help', () => {
    for (const [language, label] of [['de', 'Bild ansehen'], ['en', 'View image'], ['pt-BR', 'Ver imagem']] as [Language, string][]) {
      expect(translate(language, 'guidedVisual.open')).toBe(label);
    }
    const html = renderToStaticMarkup(createElement(GuidedVisualHelp, { help: staticRoutingVisualHelp[2]! }));
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-haspopup="dialog"'); expect(html).not.toContain('<dialog');
  });
});
