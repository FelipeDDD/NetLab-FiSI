import type { Language } from '../../i18n';
import type { PrintSnapshot, PrintDevice } from './model';
import { pageSize, REPORT_SECTIONS, type PrintDocumentOptions, type ReportSection } from './options';
import { studioText, type StudioKey } from './messages';
import { escapeMarkup as esc, printAccent, studioDiagram } from './diagram';
import { studioPage } from './page';
import { footerNoteMarkup } from './footerMarkup';
import { headerMarkup } from './headerMarkup';

interface Table { heading: string; headers: string[]; rows: string[][]; }
/** Content and per-section selections are independent of diagram visibility. */
export function reportTables(snapshot: PrintSnapshot, options: PrintDocumentOptions, language: Language): Table[] {
  const t = (key: StudioKey) => studioText(language, key), tables: Table[] = [];
  const chosen = (section: ReportSection) => snapshot.devices.filter(d => options.sections[section].deviceIds.includes(d.id));
  const address = (d: PrintDevice) => d.interfaces.filter(i => i.address).map(i => `${i.name} · ${i.address}/${i.prefix}`).join('\n') || '—';
  const table = (section: ReportSection, headers: StudioKey[], rows: string[][], suffix = '') => tables.push({ heading: t(section) + (suffix ? ' — ' + suffix : ''), headers: headers.map(t), rows });
  for (const section of REPORT_SECTIONS) {
    if (!options.sections[section].enabled || section === 'diagram') continue;
    const devices = chosen(section);
    if (section === 'inventory') table(section, ['name', 'kind', 'interfaces', 'address'], devices.map(d => [d.name, d.kind, String(d.interfaces.length), address(d)]));
    if (section === 'connections') table(section, ['name', 'interface', 'peer', 'interface'], snapshot.links.filter(l => l.medium === 'ethernet' && options.sections.connections.deviceIds.includes(l.a[0]) && options.sections.connections.deviceIds.includes(l.b[0]))
      .map(l => [snapshot.devices.find(d => d.id === l.a[0])!.name, l.a[1], snapshot.devices.find(d => d.id === l.b[0])!.name, l.b[1]]));
    for (const d of devices) {
      if (section === 'interfaces') table(section, ['interface', 'address', 'gateway', 'state', 'peer'], d.interfaces.map(i => [i.name, i.address ? `${i.address}/${i.prefix}\n${i.mode}` : t('unconfigured'), i.gateway ?? '—', `${i.up ? 'UP' : 'DOWN'} / ${i.operational ? 'Link UP' : 'Link DOWN'}`,
        i.peer ? `${snapshot.devices.find(p => p.id === i.peer!.deviceId)?.name ?? i.peer.deviceId} / ${i.peer.iface}` : '—']), d.name);
      if (section === 'routes' && d.ipCapable) table(section, ['destination', 'nextHop', 'interface', 'origin'], d.routes.filter(route => options.routeFilter === 'all' || (options.routeFilter === 'connected' ? route.origin === 'connected' : route.origin !== 'connected'))
        .map(route => [`${route.destination}/${route.prefix}${route.prefix === 0 ? '\n' + t('defaultRoute') : ''}`, route.via ?? t('connected'), route.iface, t(route.origin === 'interface' ? 'interfaceDefault' : route.origin === 'static' ? 'staticOrigin' : 'connected')]), d.name);
      if (section === 'services') table(section, ['name', 'services'], d.services.map(s => [t(s.key), s.value]), d.name);
      if (section === 'firewall') table(section, ['name', 'firewall'], d.firewall ? [[d.name, d.firewall]] : [], d.name);
    }
  }
  return tables;
}

/** Deterministic conservative row packing for the screen preview; native print
 * layout remains allowed to grow/split at safe rows (no clipped fixed heights). */
export function studioReport(snapshot: PrintSnapshot, options: PrintDocumentOptions, language: Language, diagramSvg?: string) {
  const t = (key: StudioKey) => studioText(language, key), size = pageSize(options), accent = printAccent(options.accent);
  const pixel = 96 / 25.4, contentWidth = (size.width - 2 * options.margin) * pixel;
  const page = studioPage(snapshot, options, language);
  const headingHeight = page.area.y;
  const capacity = page.height - Math.max(145, headingHeight + 20) - (page.footerLines.length ? page.footerHeight : 0);
  const pages: string[] = []; let blocks: string[] = [], remaining = capacity;
  const flush = () => { if (blocks.length) pages.push(blocks.join('\n')); blocks = []; remaining = capacity; };
  if (options.sections.diagram.enabled) {
    // This is the same full printable SVG as the standalone SVG/PNG export.
    // Its own heading/notes reserve space in the shared document coordinates.
    pages.push(`<section data-print-section="diagram" class="print-diagram">${diagramSvg ?? studioDiagram(snapshot, options, language)}</section>`);
  } else if (options.annotation) {
    blocks.push(`<aside><strong>${esc(t('annotation'))}</strong><p>${esc(options.annotation)}</p></aside>`);
    remaining -= 40 + Math.ceil(options.annotation.length / Math.max(12, contentWidth / 8)) * 20;
  }
  for (const table of reportTables(snapshot, options, language)) {
    let rows: string[] = [], consumed = 64, part = 0;
    const emit = () => {
      const heading = table.heading + (part ? ` · ${t('continuation')}` : '');
      blocks.push(`<section class="print-table-section"><h2>${esc(heading)}</h2><table><thead><tr>${table.headers.map(h => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('') || `<tr><td colspan="${table.headers.length}">${esc(t('empty'))}</td></tr>`}</tbody></table></section>`);
      remaining -= consumed + 18; rows = []; consumed = 64; part++;
    };
    if (remaining < 120) flush();
    for (const row of table.rows) {
      const chars = Math.max(8, Math.floor((contentWidth / table.headers.length - 18) / 7));
      const lines = Math.max(...row.map(cell => cell.split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / chars)), 0)));
      const height = 14 + lines * 17;
      if (consumed + height > remaining && rows.length) { emit(); flush(); }
      else if (consumed + height > remaining && blocks.length) flush();
      rows.push(`<tr>${row.map(cell => `<td>${esc(cell)}</td>`).join('')}</tr>`); consumed += height;
    }
    emit();
  }
  flush();
  if (!pages.length) pages.push(`<p>${esc(t('noSections'))}</p>`);
  // The standalone SVG/PNG is one page. In a multi-page report, move only its
  // optional note to the final page; keep identical diagram geometry/reservation.
  if (pages.length > 1 && options.sections.diagram.enabled) pages[0] = pages[0].replace(/<g data-footer-note="">[\s\S]*?<\/g>/, '');
  const finalNote = `<svg class="print-footer-note" width="${page.width}" height="${page.footerHeight}" viewBox="0 0 ${page.width} ${page.footerHeight}" xmlns="http://www.w3.org/2000/svg" font-family="Arial, sans-serif">${footerNoteMarkup(page.footerLines, page.footerHeight)}</svg>`;
  const html = `<!doctype html><html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(options.title)}</title><style>
@page { size: ${options.paper} ${options.orientation}; margin: ${options.margin}mm; }
* { box-sizing: border-box; } html { color-scheme: light; background:#e4e8ec; } body { margin:0; color:#1e293b; font:13px/1.4 Arial,sans-serif; }
.print-page { background:#fff; width:${size.width}mm; min-height:${size.height}mm; padding:${options.margin}mm; margin:16px auto; box-shadow:0 2px 12px #0002; }
.print-page--report { position:relative; }
.print-page--report > footer { position:absolute; bottom:${options.margin}mm; left:calc(${options.margin}mm + 8px); right:calc(${options.margin}mm + 8px); height:18px; margin:0; padding-top:2px; }
.print-footer-note { position:absolute; bottom:${options.margin}mm; left:${options.margin}mm; width:calc(100% - ${options.margin * 2}mm); height:${page.footerHeight}px; }
.print-heading { margin-bottom:12px; } .print-heading svg { display:block; width:100%; height:auto; }
h1 { font-size:${options.preset === 'presentation' ? 30 : 24}px; line-height:1.2; margin:0 0 6px; color:${accent}; overflow-wrap:anywhere; } .print-subtitle { font-size:14px; margin:4px 0; }
.print-branding,footer { font-size:10px; color:#475569; } footer { border-top:1px solid #cbd5e1; margin-top:16px; padding-top:6px; }
h2 { font-size:16px; margin:16px 0 7px; break-after:avoid; color:${accent}; } p { white-space:pre-wrap; overflow-wrap:anywhere; margin:6px 0; }
table { width:100%; border-collapse:collapse; table-layout:fixed; margin-bottom:12px; font-size:12px; } th,td { border:1px solid #d4dce4; padding:6px 8px; text-align:left; vertical-align:top; overflow-wrap:anywhere; white-space:pre-wrap; }
th { background:#f1f4f7; font-size:11px; } td { font-family:ui-monospace,monospace; line-height:17px; } tr { break-inside:avoid; } thead { display:table-header-group; }
.print-diagram svg { display:block; max-width:100%; height:auto; } aside { border-left:3px solid ${accent}; padding-left:10px; margin-top:10px; }
@media print { html,body { background:white; margin:0; } .print-page { width:auto; min-height:0; margin:0; padding:0; box-shadow:none; break-after:page; } .print-page:last-child { break-after:auto; } * { print-color-adjust:exact; -webkit-print-color-adjust:exact; } }
@media print { .print-page--report { min-height:${page.height}px; } .print-page--report > footer { bottom:0; left:8px; right:8px; } .print-footer-note { bottom:0; left:0; width:100%; } }
</style></head><body>${pages.map((content, index) => options.sections.diagram.enabled && index === 0
    ? `<article class="print-page print-page--visual" data-print-page="1">${content}</article>`
    : `<article class="print-page print-page--report" data-print-page="${index + 1}"><header class="print-heading"><svg width="${page.width}" height="${headingHeight}" viewBox="0 0 ${page.width} ${headingHeight}" xmlns="http://www.w3.org/2000/svg" font-family="Arial, sans-serif">${headerMarkup(page, accent)}</svg></header>${content}<footer>${index + 1} / ${pages.length}</footer>${index === pages.length - 1 && page.footerLines.length ? finalNote : ''}</article>`).join('\n')}</body></html>`;
  return { html, pages: pages.length };
}
