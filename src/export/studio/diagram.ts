import type { Language } from '../../i18n';
import type { PrintSnapshot, PrintDevice } from './model';
import type { PrintDocumentOptions } from './options';
import { studioText } from './messages';
import { unionPath } from '../../markingGeometry';
import { makeCards, separateCards, cablePath, cableLabels, diagramBounds, measureText, overlaps, crossesCard, type Card, type Rect } from './geometry';
import { studioPage } from './page';
import { routingBlockLayouts, renderRoutingBlock } from './routingBlocks';
import { escapeMarkup, printAccent } from './markup';
import { documentRect, manualDevicePosition, positionDeviceCards, toDocument, toTopology } from './devicePositions';
import { footerNoteMarkup } from './footerMarkup';
import { headerMarkup } from './headerMarkup';

export { escapeMarkup, printAccent } from './markup';
const icons: Record<PrintDevice['kind'], string> = {
  host: '<rect x="5" y="4" width="38" height="26" rx="2"/><path d="M24 30v8m-10 0h20"/>',
  notebook: '<rect x="9" y="5" width="30" height="23" rx="2"/><path d="M9 28 3 36h42l-6-8M19 33h10"/>',
  smartphone: '<rect x="15" y="2" width="18" height="36" rx="3"/><path d="M21 6h6m-5 27h4"/>',
  server: '<rect x="12" y="1" width="24" height="38" rx="3"/><path d="M16 10h16m-16 9h16m-16 9h16"/><circle cx="18" cy="33" r="1"/>',
  switch: '<rect x="2" y="12" width="44" height="20" rx="3"/><path d="M8 19v6h6v-6zm11 0v6h6v-6zm11 0v6h6v-6z"/>',
  router: '<ellipse cx="24" cy="22" rx="22" ry="16"/><path d="m13 17 5-4 5 4m-5-4v10m17 4-5 4-5-4m5 4V21"/>',
  firewall: '<path d="M24 2 42 9v12c0 8-9 15-18 19C15 36 6 29 6 21V9Z"/><path d="M12 15h24M10 23h28M16 31h16m-8-23v7m-8 0v8m16-8v8m-8 0v8"/>',
  ap: '<path d="M4 13a30 30 0 0 1 40 0M10 21a21 21 0 0 1 28 0m-22 8a12 12 0 0 1 16 0"/><circle cx="24" cy="36" r="2"/>',
};
function connections(snapshot: PrintSnapshot, options: PrintDocumentOptions, boxes: Card[], font: number, area?: Rect) {
  const d = options.diagram, selected = new Map(boxes.map(box => [box.device.id, box]));
  const occupied: Rect[] = [];
  const cables = d.cables ? snapshot.links.flatMap(link => {
    const a = selected.get(link.a[0]), b = selected.get(link.b[0]); if (!a || !b) return [];
    const route = cablePath(a, b, boxes, area), labels = d.cableLabels ? cableLabels(route.points, [link.a[1], link.b[1]], boxes, occupied, font, measureText, area) : { labels: [], crowded: false };
    return [{ link, ...route, ...labels }];
  }) : [];
  return { cables, occupied };
}

/** Original automatic geometry. Manual centers never influence separation,
 * bounds, proportional fit, or the position of Markierungen. */
export function studioAutomaticLayout(snapshot: PrintSnapshot, options: PrintDocumentOptions, language: Language) {
  const t = (key: Parameters<typeof studioText>[1]) => studioText(language, key), d = options.diagram;
  const font = { small: 16, normal: 20, large: 24 }[options.textSize], line = font * 1.3;
  const boxes = makeCards(snapshot, options, t('gateway'), measureText, t('defaultRoute'), t('connected')), separation = separateCards(boxes, d.cables && d.cableLabels ? font * 2 : 24);
  // Canvas markings remain in project/snapshot metadata, but are deliberately
  // excluded from Studio output until editable Studio-owned areas are available.
  const areas: PrintSnapshot['areas'] = [], { cables, occupied } = connections(snapshot, options, boxes, font);
  const rects: Rect[] = [...boxes, ...areas.flatMap(a => a.rects), ...occupied,
    ...cables.flatMap(c => c.points.map(p => ({ ...p, width: 2, height: 2 }))),
    ...areas.flatMap(a => d.areaTitles ? [{ x: a.title.x, y: a.title.y - a.textSize, width: measureText(a.name, a.textSize), height: a.textSize * 1.3 }] : [])];
  const bounds = diagramBounds(rects), page = studioPage(snapshot, options, language);
  const scale = Math.max(.001, Math.min(page.area.width / bounds.width, page.area.height / bounds.height)) * Math.max(.2, Math.min(1, options.diagramScale));
  const tx = (page.area.width - bounds.width * scale) / 2 - bounds.x * scale, ty = page.area.y + (page.area.height - bounds.height * scale) / 2 - bounds.y * scale;
  const crowded = separation.unresolved || cables.some(c => c.obstructed || c.crowded);
  const labelFont = Math.min(font, ...(boxes.some(b => b.info.length || b.footer.length || b.kindLines.length) ? [font * .76] : []), ...(d.cableLabels && cables.length ? [font * .75] : []));
  return { font, line, boxes, cables, occupied, areas, bounds, page, scale, tx, ty, separation, crowded, labelPx: labelFont * scale };
}

/** Reuse the automatic reference while dragging; only positions and connection
 * geometry change. Routing Tables keep their existing document coordinates. */
export function positionStudioDevices(automatic: ReturnType<typeof studioAutomaticLayout>, snapshot: PrintSnapshot, options: PrintDocumentOptions, language: Language) {
  const compact = Object.fromEntries(automatic.boxes.flatMap(box => {
    const offset = manualDevicePosition(options.compactOffsets, box.device.id);
    return offset ? [[box.device.id, toDocument({ x: box.x + box.width / 2 + offset.x, y: box.y + box.height / 2 + offset.y }, automatic)]] : [];
  }));
  const positions = { ...compact, ...options.devicePositions };
  const page = studioPage(snapshot, options, language), manual = automatic.boxes.some(b => manualDevicePosition(positions, b.device.id));
  const boxes = manual ? positionDeviceCards(automatic.boxes, positions, automatic, page.positionArea) : automatic.boxes;
  const worldArea = { ...toTopology(page.area, automatic), width: page.area.width / automatic.scale, height: page.area.height / automatic.scale };
  const { cables, occupied } = manual ? connections(snapshot, options, boxes, automatic.font, worldArea) : automatic;
  const documentCards = boxes.map(b => documentRect(b, automatic)), documentLabels = occupied.map(r => documentRect(r, automatic)), documentCables = cables.map(c => c.points.map(p => toDocument(p, automatic)));
  const manualOutside = documentCards.some((rect, i) => manualDevicePosition(positions, boxes[i].device.id) && (rect.x < page.positionArea.x - .01 || rect.y < page.positionArea.y - .01 || rect.x + rect.width > page.positionArea.x + page.positionArea.width + .01 || rect.y + rect.height > page.positionArea.y + page.positionArea.height + .01));
  const offset = options.areaOffset ?? { x: 0, y: 0 }, dx = offset.x / automatic.scale, dy = offset.y / automatic.scale;
  const areas = automatic.areas.map(area => ({ ...area, rects: area.rects.map(rect => ({ ...rect, x: rect.x + dx, y: rect.y + dy })), title: { x: area.title.x + dx, y: area.title.y + dy } }));
  const areaOutside = areas.flatMap(a => [...a.rects, ...(options.diagram.areaTitles ? [{ x: a.title.x, y: a.title.y - a.textSize, width: measureText(a.name, a.textSize), height: a.textSize * 1.3 }] : [])]).some(r => {
    const rect = documentRect(r, automatic);
    return rect.x < page.area.x - .01 || rect.y < page.area.y - .01 || rect.x + rect.width > page.area.x + page.area.width + .01 || rect.y + rect.height > page.area.y + page.area.height + .01;
  });
  const blocks = routingBlockLayouts(snapshot, options, language, page.positionArea, [...documentCards, ...documentLabels], documentCables);
  const headingOverlap = page.headingRects.some(heading => [...documentCards, ...documentLabels, ...blocks].some(rect => overlaps(heading, rect)) || documentCables.some(points => points.slice(1).some((p, i) => crossesCard(points[i], p, heading))));
  const manualOverlap = !!manual && documentCards.some((card, i) => manualDevicePosition(positions, boxes[i].device.id) &&
    (documentCards.some((other, j) => i !== j && overlaps(card, other)) || blocks.some(block => overlaps(card, block))));
  const crowded = automatic.separation.unresolved || cables.some(c => c.obstructed || c.crowded);
  return { ...automatic, page, boxes, cables, occupied, areas, areaOutside, documentCards, documentLabels, documentCables, blocks, crowded, headingOverlap, manualOutside, manualOverlap, manualCableWarning: !!manual && cables.some(c => c.obstructed || c.crowded), automatic };
}

/** Derive geometry without mutating the document, snapshot or simulator. */
export function studioLayout(snapshot: PrintSnapshot, options: PrintDocumentOptions, language: Language) {
  return positionStudioDevices(studioAutomaticLayout(snapshot, options, language), snapshot, options, language);
}

export function studioConnectionMarkup(layout: ReturnType<typeof studioLayout>, options: PrintDocumentOptions) {
  const cables = layout.cables.map(({ link, points }) => {
    const paint = `data-link="${escapeMarkup(link.id)}" fill="none" stroke="${options.diagram.colored ? printAccent(link.color) : '#64748b'}" stroke-width="1.8"${link.medium === 'wireless' ? ' stroke-dasharray="6 4"' : ''}`;
    return points.length === 2 ? `<line x1="${points[0].x}" y1="${points[0].y}" x2="${points[1].x}" y2="${points[1].y}" ${paint}/>` : `<polyline points="${points.map(p => `${p.x},${p.y}`).join(' ')}" ${paint}/>`;
  }).join('\n');
  const labels = layout.cables.flatMap(cable => cable.labels.map(label => `<g data-cable-label="${escapeMarkup(cable.link.id)}">${label.lines.map((text, i) => `<text x="${label.x + label.width / 2}" y="${label.y + label.size + 1 + i * label.size * 1.25}" text-anchor="middle" font-size="${label.size}" fill="#334155" stroke="#fff" stroke-width="4" paint-order="stroke">${escapeMarkup(text)}</text>`).join('')}</g>`)).join('\n');
  return { cables, labels };
}

/** The complete printable visual page is identical in SVG, PNG, HTML and PDF. */
export function studioDiagram(snapshot: PrintSnapshot, options: PrintDocumentOptions, language: Language, layout = studioLayout(snapshot, options, language)): string {
  const { boxes, areas, bounds, page, scale, tx, ty } = layout;
  const t = (key: Parameters<typeof studioText>[1]) => studioText(language, key), d = options.diagram;
  const accent = d.colored ? printAccent(options.accent) : '#334155', w = page.width, h = page.height;
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" overflow="visible" data-content-x="${page.area.x}" data-content-y="${page.area.y}" data-content-width="${page.area.width}" data-content-height="${page.area.height}" data-label-px="${layout.labelPx}" data-layout-crowded="${layout.crowded}" data-layout-expanded="${layout.separation.expanded}" role="img" aria-label="${escapeMarkup(options.title)}" font-family="Arial, sans-serif"><title>${escapeMarkup(options.title)}</title><rect width="100%" height="100%" fill="#fff"/>`];
  parts.push(headerMarkup(page, accent));
  parts.push(`<g data-topology="" transform="translate(${tx} ${ty}) scale(${scale})">`);
  for (const area of areas) parts.push(`<g data-studio-area="${escapeMarkup(area.id)}"><path d="${unionPath(area.rects)}" fill="${printAccent(area.color)}" fill-opacity="${Math.min(.22, area.intensity / 200)}" stroke="${printAccent(area.color)}" stroke-width="1" fill-rule="evenodd"/>${d.areaTitles ? `<text x="${area.title.x}" y="${area.title.y}" font-size="${area.textSize}" fill="#334155">${escapeMarkup(area.name)}</text>` : ''}</g>`);
  const connectionMarkup = studioConnectionMarkup(layout, options); if (connectionMarkup.cables) parts.push(connectionMarkup.cables);
  for (const box of boxes) {
    const { x, y, width, height, device, textRows, footerY } = box;
    const docBox = documentRect(box, layout);
    parts.push(`<g data-device="${escapeMarkup(device.id)}" data-x="${docBox.x}" data-y="${docBox.y}" data-width="${docBox.width}" data-height="${docBox.height}" data-manual="${!!manualDevicePosition(options.devicePositions, device.id)}" style="cursor:grab;touch-action:none"><title>${escapeMarkup(device.name)}</title><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="7" fill="#fff" stroke="#94a3b8" stroke-width="1.2"/><g transform="translate(${x + (width - 48) / 2} ${y + 8})" fill="none" stroke="${accent}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round">${icons[device.kind]}</g>`);
    if (footerY !== undefined) parts.push(`<line data-card-footer="" x1="${x + 12}" x2="${x + width - 12}" y1="${y + footerY}" y2="${y + footerY}" stroke="#e2e8f0"/>`);
    textRows.forEach(({ text, role, size, y: baseline }) => parts.push(`<text data-card-role="${role}" x="${x + width / 2}" y="${y + baseline}" font-size="${size}" font-weight="${role === 'name' ? 700 : 400}" text-anchor="middle" fill="${role === 'type' ? '#64748b' : '#1e293b'}"${role === 'interface' || role === 'gateway' ? ' font-family="monospace"' : ''}>${escapeMarkup(text)}</text>`));
    parts.push('</g>');
  }
  if (connectionMarkup.labels) parts.push(connectionMarkup.labels);
  if (!boxes.length) parts.push(`<text x="${bounds.x + 20}" y="${bounds.y + 70}" fill="#475569" font-size="16">${escapeMarkup(t('noDevices'))}</text>`);
  parts.push('</g>');
  for (const block of layout.blocks) parts.push(renderRoutingBlock(block, options));
  page.annotation.forEach((text, i) => parts.push(`<text x="8" y="${h - page.bottom + 17 + i * 17}" font-size="12" fill="#334155">${escapeMarkup(text)}</text>`));
  parts.push(footerNoteMarkup(page.footerLines, h));
  parts.push('</svg>'); return parts.join('\n');
}
