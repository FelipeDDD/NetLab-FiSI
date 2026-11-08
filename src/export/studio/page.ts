import type { Language } from '../../i18n';
import type { PrintSnapshot } from './model';
import { pageSize, type PrintDocumentOptions } from './options';
import { measureText, wrapText } from './geometry';
import { studioText } from './messages';
import { normalizeFooterNote } from './footerText';

export const PRINT_PIXEL = 96 / 25.4;
export const STUDIO_BRANDING = 'NetLab-FiSI · Topology Studio';
/** One printable coordinate system, shared by preview and all four outputs. */
export function studioPage(_snapshot: PrintSnapshot, options: PrintDocumentOptions, language: Language) {
  const t = (key: Parameters<typeof studioText>[1]) => studioText(language, key), paper = pageSize(options);
  const width = (paper.width - options.margin * 2) * PRINT_PIXEL, height = (paper.height - options.margin * 2) * PRINT_PIXEL;
  const titleFont = options.preset === 'presentation' ? 26 : 22, titleLine = titleFont * 1.25;
  const title = options.title.trim() ? wrapText(options.title, width - 40, s => measureText(s, titleFont, true)) : [];
  const subtitle = options.subtitle.trim() ? wrapText(options.subtitle, width - 40, s => measureText(s, 14)) : [];
  const branding = STUDIO_BRANDING;
  const brandFont = options.preset === 'presentation' ? 30 : 26, signatureY = brandFont + 28, ruleY = signatureY + 12;
  const titleY = ruleY + 34, subtitleY = titleY + title.length * titleLine + (title.length ? 1 : -8);
  const headingRects = [...title.map((text, i) => { const w = measureText(text, titleFont, true); return { x: (width - w) / 2, y: titleY + i * titleLine - titleFont, width: w, height: titleFont * 1.2 }; }),
    ...subtitle.map((text, i) => { const w = measureText(text, 14); return { x: (width - w) / 2, y: subtitleY + i * 19 - 14, width: w, height: 18 }; })];
  const annotation = options.annotation ? wrapText(`${t('annotation')}: ${options.annotation}`, width - 16, s => measureText(s, 12)) : [];
  const note = normalizeFooterNote(options.footerNote ?? ''), allFooterLines = note.trim() ? wrapText(note, width - 16, s => measureText(s, 11)) : [];
  const footerLines = allFooterLines.slice(0, 3), footerOverflow = allFooterLines.length > 3, footerHeight = footerLines.length ? 32 + footerLines.length * 15 : 16;
  const bottom = footerHeight + annotation.length * 17 + (annotation.length ? 12 : 0), positionTop = ruleY + 18;
  const top = headingRects.length ? Math.max(...headingRects.map(r => r.y + r.height)) + 24 : positionTop;
  return { width, height, titleFont, titleLine, title, subtitle, branding, brandFont, signatureY, ruleY, titleY, subtitleY, headingRects, annotation, bottom, footerLines, footerOverflow, footerHeight,
    positionArea: { x: 0, y: positionTop, width, height: Math.max(40, height - positionTop - bottom) },
    area: { x: 0, y: top, width, height: Math.max(40, height - top - bottom) } };
}
