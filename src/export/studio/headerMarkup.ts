import { escapeMarkup } from './markup';
import type { studioPage } from './page';

/** Fixed branding and optional work headings share coordinates in every output. */
export function headerMarkup(page: ReturnType<typeof studioPage>, accent: string) {
  const { width, brandFont, signatureY, ruleY, titleFont, titleLine, titleY, subtitleY } = page;
  return `<g data-studio-branding=""><text x="8" y="${brandFont + 4}" font-size="${brandFont}" font-weight="700" fill="${accent}">NetLab-FiSI</text><text x="8" y="${signatureY}" font-size="14" fill="#475569">Topology Studio</text><path d="M8 ${ruleY}H${width - 8}" stroke="${accent}" stroke-width="2"/></g>` +
    `<g data-work-heading="">${page.title.map((text, i) => `<text x="${width / 2}" y="${titleY + i * titleLine}" font-size="${titleFont}" font-weight="700" text-anchor="middle" fill="${accent}">${escapeMarkup(text)}</text>`).join('')}${page.subtitle.map((text, i) => `<text x="${width / 2}" y="${subtitleY + i * 19}" font-size="14" text-anchor="middle" fill="#475569">${escapeMarkup(text)}</text>`).join('')}</g>`;
}
