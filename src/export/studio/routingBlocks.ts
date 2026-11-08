import type { Language } from '../../i18n';
import type { PrintDevice, PrintRoute, PrintSnapshot } from './model';
import type { PrintDocumentOptions } from './options';
import { measureText, wrapText, overlaps, crossesCard, type Point, type Rect } from './geometry';
import { studioText } from './messages';
import { escapeMarkup as esc, printAccent } from './markup';

export type BlockRouteFilter = 'all' | 'static' | 'connected' | 'default';
export interface RoutingBlockOptions {
  id: string; deviceId: string; deviceName: string;
  filter: BlockRouteFilter; interfaceNames: string[] | null;
  columns: { nextHop: boolean; iface: boolean; origin: boolean };
  width: 'compact' | 'normal'; customWidth?: number; scale?: number; position: Point;
}
type ColumnKey = 'destination' | 'nextHop' | 'iface' | 'origin';
export interface RoutingBlockContent {
  block: RoutingBlockOptions; width: number; height: number; size: number;
  baseWidth: number; baseHeight: number; scale: number;
  title: string[]; titleHeight: number; columns: { key: ColumnKey; x: number; width: number; lines: string[] }[];
  headerHeight: number; rows: { cells: string[][]; height: number }[]; count: string;
  notice: string[]; missing: boolean;
}
export interface RoutingBlockLayout extends Rect { content: RoutingBlockContent; oversized: boolean; overlap: boolean; }
export const routingDevices = (snapshot: PrintSnapshot) => snapshot.devices.filter(d => d.ipCapable);
export const routeInterfaceNames = (device: PrintDevice) => [...new Set([...device.interfaces.map(i => i.name), ...device.routes.map(r => r.iface)])];
export function selectBlockRoutes(device: PrintDevice, block: RoutingBlockOptions): PrintRoute[] {
  return device.routes.filter(r => (block.interfaceNames === null || block.interfaceNames.includes(r.iface)) &&
    (block.filter === 'all' || block.filter === 'static' && r.origin === 'static' || block.filter === 'connected' && r.origin === 'connected' || block.filter === 'default' && r.prefix === 0));
}
export function newRoutingBlock(device: PrintDevice, id: string): RoutingBlockOptions {
  return { id, deviceId: device.id, deviceName: device.name, filter: 'all', interfaceNames: null,
    columns: { nextHop: true, iface: true, origin: false }, width: 'compact', position: { x: 0, y: 0 } };
}

/** Widths are physical document pixels; presets remain the recovery defaults. */
export function blockWidthLimits(block: RoutingBlockOptions, available: number) {
  const columns = Object.values(block.columns).filter(Boolean).length;
  // The existing 300px compact composition is valid even with all columns.
  return { min: Math.min(available, 300, 180 + columns * 45), max: available };
}
export function blockWidth(block: RoutingBlockOptions, available = Infinity): number {
  const preset = block.width === 'compact' ? 300 : 380;
  if (!Number.isFinite(block.customWidth)) return Math.min(available, preset);
  const limits = blockWidthLimits(block, available);
  return Math.max(limits.min, Math.min(limits.max, block.customWidth!));
}

/** The smallest header stays at least 7 pt on the physical sheet (96 dpi).
 * Preview zoom never participates in these limits. */
export function blockScaleLimits(options: Pick<PrintDocumentOptions, 'textSize'>) {
  return { min: { small: .95, normal: .85, large: .8 }[options.textSize], max: 1.5 };
}
export function blockScale(block: RoutingBlockOptions, options: Pick<PrintDocumentOptions, 'textSize'>) {
  const limits = blockScaleLimits(options);
  return Math.max(limits.min, Math.min(limits.max, Number.isFinite(block.scale) ? block.scale! : 1));
}
function scaleContent(content: RoutingBlockContent, scale: number): RoutingBlockContent {
  return { ...content, scale, width: content.baseWidth * scale, height: content.baseHeight * scale };
}

/** IPv4/CIDR values wrap between octets, never in the middle of a number. */
function wrapRouteValue(value: string, width: number, size: number): string[] {
  const measure = (s: string) => measureText(s, size, false, true);
  if (!/^\d+\.\d+\.\d+\.\d+(\/\d+)?$/.test(value)) return wrapText(value, width, measure);
  const result: string[] = []; let line = '';
  for (const part of value.match(/\d+\.|\d+(?:\/\d+)?/g)!) {
    if (line && measure(line + part) > width) { result.push(line); line = ''; }
    line += part;
  }
  if (line) result.push(line);
  return result;
}

/** All data comes from the owned snapshot. No route lookup or simulator access. */
export function routingBlockContent(snapshot: PrintSnapshot, block: RoutingBlockOptions, options: PrintDocumentOptions, language: Language, measuredWidth = blockWidth(block), scale = blockScale(block, options)): RoutingBlockContent {
  const t = (key: Parameters<typeof studioText>[1]) => studioText(language, key);
  const device = snapshot.devices.find(d => d.id === block.deviceId && d.ipCapable), missing = !device;
  const size = { small: 11, normal: 12, large: 13 }[options.textSize], width = measuredWidth;
  const title = wrapText(`${t('routingTable')} — ${device?.name ?? block.deviceName}`, width - 20, s => measureText(s, size + 1, true));
  const titleHeight = 12 + title.length * (size + 4);
  const notice = missing ? wrapText(t('blockDeviceMissing'), width - 20, s => measureText(s, size)) : [];
  const keys: ColumnKey[] = ['destination', ...(block.columns.nextHop ? ['nextHop' as const] : []), ...(block.columns.iface ? ['iface' as const] : []), ...(block.columns.origin ? ['origin' as const] : [])];
  const weights = { destination: .4, nextHop: .36, iface: .18, origin: .28 }, total = keys.reduce((n, k) => n + weights[k], 0);
  let x = 0;
  const columns = keys.map(key => {
    const columnWidth = width * weights[key] / total, label = key === 'iface' ? t('blockDev') : t(key);
    const column = { key, x, width: columnWidth, lines: wrapText(label, columnWidth - 14, s => measureText(s, size - 1, true)) }; x += columnWidth; return column;
  });
  const headerHeight = Math.max(...columns.map(c => c.lines.length)) * (size + 2) + 7;
  const routes = device ? selectBlockRoutes(device, block) : [];
  const rows = routes.map(route => {
    const values = { destination: `${route.destination}/${route.prefix}`, nextHop: route.via ?? t(route.origin === 'connected' ? 'connectedShort' : 'connected'), iface: route.iface,
      origin: t(route.origin === 'interface' ? 'interfaceDefault' : route.origin === 'static' ? 'staticOrigin' : 'connected') };
    const cells = columns.map(c => wrapRouteValue(values[c.key], c.width - 14, size));
    return { cells, height: Math.max(...cells.map(lines => lines.length)) * (size + 3) + 6 };
  });
  if (!routes.length && !missing) notice.push(...wrapText(t('empty'), width - 20, s => measureText(s, size)));
  const height = titleHeight + headerHeight + rows.reduce((n, r) => n + r.height, 0) + notice.length * (size + 3) + (notice.length ? 10 : 0);
  return { block, baseWidth: width, baseHeight: height, width: width * scale, height: height * scale, scale, size, title, titleHeight, columns, headerHeight, rows, notice, missing, count: `${routes.length} / ${device?.routes.length ?? 0} · ${t('routes')}` };
}

/** Reflow only this table. Narrowing stops before its bottom would leave the page.
 * A pre-existing oversize table keeps all rows and the existing export warning. */
export function resizedRoutingBlock(snapshot: PrintSnapshot, options: PrintDocumentOptions, language: Language, box: RoutingBlockLayout, area: Rect, requested: number): RoutingBlockLayout {
  const block = box.content.block, scale = box.content.scale, max = Math.max(1, (area.x + area.width - box.x) / scale), limits = blockWidthLimits(block, max);
  const at = (width: number) => routingBlockContent(snapshot, { ...block, customWidth: width }, options, language, width, scale);
  let width = Math.max(limits.min, Math.min(max, requested / scale)), content = at(width);
  const room = area.y + area.height - box.y;
  if (content.height > room && content.height > box.height) {
    let lo = width, hi = max;
    if (at(hi).height > room) return box;
    for (let n = 0; n < 18; n++) { const mid = (lo + hi) / 2; if (at(mid).height > room) lo = mid; else hi = mid; }
    width = hi; content = at(width);
  }
  return { ...box, width: content.width, height: content.height, content, oversized: content.height > area.height || content.width > area.width };
}

/** Change the complete physical table, preserving every intrinsic row/column.
 * The top-left stays fixed; an impossible enlargement is simply bounded. */
export function scaledRoutingBlock(options: PrintDocumentOptions, box: RoutingBlockLayout, area: Rect, requested: number): RoutingBlockLayout {
  const limits = blockScaleLimits(options), max = Math.min(limits.max, (area.x + area.width - box.x) / box.content.baseWidth, (area.y + area.height - box.y) / box.content.baseHeight);
  if (max < limits.min) return box;
  const content = scaleContent(box.content, Math.max(limits.min, Math.min(max, Math.round(requested * 1000) / 1000)));
  return { ...box, content, width: content.width, height: content.height, oversized: false };
}

export function clampBlockPosition(position: Point, content: Pick<Rect, 'width' | 'height'>, area: Rect): Point {
  return { x: Math.max(area.x, Math.min(area.x + Math.max(0, area.width - content.width), position.x)),
    y: Math.max(area.y, Math.min(area.y + Math.max(0, area.height - content.height), position.y)) };
}
export function blockConflicts(box: Rect, occupied: Rect[], cables: Point[][] = []): boolean {
  return occupied.some(r => overlaps(box, r, 5)) || cables.some(points => points.slice(1).some((p, i) => crossesCard(points[i], p, box)));
}
/** Scan a small document-space grid. Never move cards or existing blocks. */
export function initialBlockPosition(content: Pick<Rect, 'width' | 'height'>, area: Rect, occupied: Rect[], cables: Point[][] = []): Point {
  const left = area.x + 5, right = area.x + area.width - content.width - 5, top = area.y + 5, bottom = area.y + area.height - content.height - 5;
  const candidates: Point[] = [{ x: left, y: bottom }, { x: right, y: bottom }, { x: left, y: top }, { x: right, y: top }];
  for (let y = bottom; y >= top; y -= 20) for (let x = left; x <= right; x += 20) candidates.push({ x, y });
  for (const p of candidates) {
    const position = clampBlockPosition(p, content, area);
    if (!blockConflicts({ ...position, ...content }, occupied, cables)) return position;
  }
  return clampBlockPosition(candidates[0], content, area);
}

export function routingBlockLayouts(snapshot: PrintSnapshot, options: PrintDocumentOptions, language: Language, area: Rect, occupied: Rect[], cables: Point[][]): RoutingBlockLayout[] {
  const layouts = options.routingBlocks.map(block => {
    if (block.scale !== undefined) {
      const natural = routingBlockContent(snapshot, block, options, language), limits = blockScaleLimits(options);
      const x = Math.max(area.x, block.position.x), y = Math.max(area.y, block.position.y);
      const atPosition = Math.min((area.x + area.width - x) / natural.baseWidth, (area.y + area.height - y) / natural.baseHeight);
      const fit = atPosition >= limits.min ? atPosition : Math.min(area.width / natural.baseWidth, area.height / natural.baseHeight);
      const content = scaleContent(natural, Math.max(limits.min, Math.min(natural.scale, fit))), position = clampBlockPosition(block.position, content, area);
      return { ...position, width: content.width, height: content.height, content, oversized: content.width > area.width || content.height > area.height, overlap: false };
    }
    const minimum = block.customWidth === undefined ? Math.min(area.width, block.width === 'compact' ? 300 : 380) : blockWidthLimits(block, area.width).min;
    const anchor = clampBlockPosition(block.position, { width: minimum, height: 0 }, area);
    const width = blockWidth(block, area.x + area.width - anchor.x);
    // Retain the requested width in the session even if a smaller sheet clamps it.
    const content = routingBlockContent(snapshot, block, options, language, width), position = clampBlockPosition(anchor, content, area);
    return { ...position, width: content.width, height: content.height, content, oversized: content.width > area.width || content.height > area.height, overlap: false };
  });
  for (const layout of layouts) layout.overlap = blockConflicts(layout, [...occupied, ...layouts.filter(other => other !== layout)], cables);
  return layouts;
}

/** Native SVG text/rectangles keep coordinates identical in PNG, HTML and PDF. */
export function renderRoutingBlock(layout: RoutingBlockLayout, options: PrintDocumentOptions): string {
  const { x, y, content: c } = layout, width = c.baseWidth, height = c.baseHeight, accent = options.diagram.colored ? printAccent(options.accent) : '#334155';
  const parts = [`<g data-document-block="${esc(c.block.id)}" data-block-device="${esc(c.block.deviceId)}" data-missing="${c.missing}" data-oversized="${layout.oversized}" data-overlap="${layout.overlap}" data-x="${x}" data-y="${y}" data-width="${layout.width}" data-height="${layout.height}" data-scale="${c.scale}" data-base-width="${c.baseWidth}" data-base-height="${c.baseHeight}" transform="translate(${x} ${y})" role="group" aria-label="${esc(c.title.join(''))}"><g data-block-content="" transform="scale(${c.scale})"><rect width="${width}" height="${height}" rx="4" fill="#fff" stroke="#94a3b8" stroke-width="1"/><g data-block-drag="" style="cursor:grab;touch-action:none"><rect x=".5" y=".5" width="${width - 1}" height="${c.titleHeight}" rx="4" fill="#f8fafc"/>`];
  c.title.forEach((text, i) => parts.push(`<text x="10" y="${17 + i * (c.size + 4)}" font-size="${c.size + 1}" font-weight="700" fill="${accent}">${esc(text)}</text>`));
  parts.push('</g>');
  parts.push(`<rect y="${c.titleHeight}" width="${width}" height="${c.headerHeight}" fill="#f1f5f9"/>`);
  for (const column of c.columns) column.lines.forEach((text, i) => parts.push(`<text x="${column.x + 7}" y="${c.titleHeight + c.size + 3 + i * (c.size + 2)}" font-size="${c.size - 1}" font-weight="700" fill="#475569">${esc(text)}</text>`));
  let rowY = c.titleHeight + c.headerHeight;
  for (const row of c.rows) {
    parts.push(`<line x1="0" x2="${width}" y1="${rowY}" y2="${rowY}" stroke="#e2e8f0"/>`);
    row.cells.forEach((lines, index) => lines.forEach((text, i) => parts.push(`<text x="${c.columns[index].x + 7}" y="${rowY + c.size + 4 + i * (c.size + 3)}" font-size="${c.size}" font-family="monospace" fill="#1e293b">${esc(text)}</text>`)));
    rowY += row.height;
  }
  c.notice.forEach((text, i) => parts.push(`<text x="10" y="${rowY + c.size + 6 + i * (c.size + 3)}" font-size="${c.size}" fill="${c.missing ? '#9f1239' : '#475569'}">${esc(text)}</text>`));
  parts.push('</g></g>');
  return parts.join('\n');
}
