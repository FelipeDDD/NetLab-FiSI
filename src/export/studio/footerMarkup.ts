import { escapeMarkup } from './markup';

/** Shared physical coordinates for standalone diagrams and the final report page. */
export function footerNoteMarkup(lines: string[], height: number) {
  return lines.length ? `<g data-footer-note="">${lines.map((text, i) => `<text data-footer-line="${i}" x="8" y="${height - 28 - (lines.length - 1 - i) * 15}" font-size="11" fill="#475569">${escapeMarkup(text)}</text>`).join('')}</g>` : '';
}
