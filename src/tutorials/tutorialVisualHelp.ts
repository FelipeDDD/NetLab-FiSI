import type { Language, TranslationKey } from '../i18n';

export type TutorialVisualHelp = {
  images: Record<Language, string>;
  title: TranslationKey;
  description: TranslationKey;
};

/** Presentation only: no tutorial progression or simulator state is stored here. */
export const staticRoutingVisualHelp: Partial<Record<number, TutorialVisualHelp>> = {
  2: { title: 'guidedVisual.title', description: 'guidedVisual.description', images: {
    de: new URL('../../output/imagens-ip-route-sem-setas/ip-route-de.png', import.meta.url).href,
    en: new URL('../../output/imagens-ip-route-sem-setas/ip-route-en.png', import.meta.url).href,
    'pt-BR': new URL('../../output/imagens-ip-route-sem-setas/ip-route-pt-BR.png', import.meta.url).href,
  } },
  4: { title: 'guidedVisual.staticRouteTitle', description: 'guidedVisual.staticRouteDescription', images: {
    de: new URL('../../output/imagens-rotas-estaticas-referencia/rota-estatica-de.png', import.meta.url).href,
    en: new URL('../../output/imagens-rotas-estaticas-referencia/rota-estatica-en.png', import.meta.url).href,
    'pt-BR': new URL('../../output/imagens-rotas-estaticas-referencia/rota-estatica-pt-BR.png', import.meta.url).href,
  } },
};

/** Reuse the approved static-route illustration; no duplicated assets. */
export const alternativeRoutingVisualHelp: Partial<Record<number, TutorialVisualHelp>> = {
  8: staticRoutingVisualHelp[4],
  9: staticRoutingVisualHelp[4],
  11: staticRoutingVisualHelp[4],
};

export function visualHelpPosition(panelRight: number, panelTop: number, width: number, height: number) {
  const left = Math.max(12, panelRight + 12), available = width - left - 12;
  return available >= 760 && height >= 560
    ? { modal: false, left, top: Math.max(12, Math.min(panelTop, height - 500)), width: Math.min(1100, available) }
    : { modal: true, left: 12, top: 12, width: Math.max(0, width - 24) };
}
