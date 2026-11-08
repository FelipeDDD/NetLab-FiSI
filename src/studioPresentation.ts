import { printPreset, REPORT_SECTIONS, type PrintDocumentOptions } from './export/studio/options';
import type { PageLayoutKey, PagePresentation, StudioPageSession } from './export/studio/pageLayouts';
import type { DeviceKind } from './engine/device';
import { normalizeFooterNote } from './export/studio/footerText';

/** JSON-only presentation metadata. No technical snapshot, undo or viewport. */
export interface StudioPresentationData {
  version: 1;
  shared: StudioPageSession['shared'];
  layouts: Partial<Record<PageLayoutKey, Omit<PagePresentation, 'compactUndo' | 'compactNotice'>>>;
  alignmentGuides: boolean;
  positioningTipDismissed?: boolean;
}
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const identifier = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 512;
const finite = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const formats: PageLayoutKey[] = ['A4-landscape', 'A4-portrait', 'A3-landscape', 'A3-portrait'];

/** Repair individual fields/IDs rather than rejecting the plan. Unknown future
 * envelopes stay opaque in Topology JSON; the Studio warns and does not replace
 * them merely by opening. This reader owns its returned maps and arrays. */
export function readStudioPresentation(value: unknown, devices: readonly { id: string; kind: DeviceKind }[]): { data: StudioPresentationData | null; warning: boolean } {
  if (value == null) return { data: null, warning: false };
  const source = object(value); if (source.version !== 1) return { data: null, warning: true };
  let warning = ['shared', 'layouts'].some(key => source[key] !== undefined && (source[key] === null || typeof source[key] !== 'object' || Array.isArray(source[key])));
  const choice = <T extends string | number>(v: unknown, values: readonly T[], fallback: T): T => {
    if (values.includes(v as T)) return v as T;
    if (v !== undefined) warning = true; return fallback;
  };
  const bool = (v: unknown, fallback: boolean) => { if (typeof v === 'boolean') return v; if (v !== undefined) warning = true; return fallback; };
  const text = (v: unknown, fallback: string, max: number) => { if (typeof v !== 'string') { if (v !== undefined) warning = true; return fallback; } if (v.length > max) warning = true; return v.slice(0, max); };
  const ids = new Set(devices.map(d => d.id));
  const selected = (v: unknown, fallback: string[]) => { if (Array.isArray(v)) return [...new Set(v.filter((id): id is string => identifier(id) && ids.has(id)))]; if (v !== undefined) warning = true; return [...fallback]; };
  const sharedRaw = object(source.shared), preset = choice(sharedRaw.preset, ['clean', 'technical', 'presentation'] as const, 'clean');
  const base = printPreset(preset, { devices }), diagram = object(sharedRaw.diagram), sections = object(sharedRaw.sections);
  const shared: StudioPageSession['shared'] = {
    preset, paper: choice(sharedRaw.paper, ['A4', 'A3'] as const, base.paper), orientation: choice(sharedRaw.orientation, ['landscape', 'portrait'] as const, base.orientation),
    margin: choice(sharedRaw.margin, [10, 15, 20] as const, base.margin), textSize: choice(sharedRaw.textSize, ['small', 'normal', 'large'] as const, base.textSize),
    title: sharedRaw.title === 'NetLab-FiSI' ? '' : text(sharedRaw.title, base.title, 160), subtitle: text(sharedRaw.subtitle, base.subtitle, 220), annotation: text(sharedRaw.annotation, base.annotation, 1200),
    footerNote: normalizeFooterNote(text(sharedRaw.footerNote, '', 600)),
    accent: typeof sharedRaw.accent === 'string' && /^#[0-9a-f]{6}$/i.test(sharedRaw.accent) ? sharedRaw.accent : base.accent,
    diagramScale: choice(sharedRaw.diagramScale, [.2, .3, .4, .5, .6, .7, .8, .9, 1], base.diagramScale),
    diagram: { ...base.diagram, ...Object.fromEntries(Object.entries(base.diagram).filter(([key]) => key !== 'deviceIds').map(([key, fallback]) => [key, bool(diagram[key], fallback as boolean)])), deviceIds: selected(diagram.deviceIds, base.diagram.deviceIds) },
    names: Object.fromEntries(Object.entries(object(sharedRaw.names)).filter(([id, alias]) => ids.has(id) && typeof alias === 'string').map(([id, alias]) => [id, text(alias, '', 100)])),
    routeFilter: choice(sharedRaw.routeFilter, ['all', 'static', 'connected'] as const, base.routeFilter),
    sections: Object.fromEntries(REPORT_SECTIONS.map(key => { const raw = object(sections[key]); return [key, { enabled: bool(raw.enabled, base.sections[key].enabled), deviceIds: selected(raw.deviceIds, base.sections[key].deviceIds) }]; })) as PrintDocumentOptions['sections'],
    routingBlocks: [],
  };
  const blockIds = new Set<string>();
  if (sharedRaw.reportSettings !== undefined) {
    const report = object(sharedRaw.reportSettings), reportSections = object(report.sections), technical = printPreset('technical', { devices });
    shared.reportSettings = {
      sections: Object.fromEntries(REPORT_SECTIONS.map(key => { const raw = object(reportSections[key]); return [key, { enabled: bool(raw.enabled, technical.sections[key].enabled), deviceIds: selected(raw.deviceIds, technical.sections[key].deviceIds) }]; })) as PrintDocumentOptions['sections'],
      routeFilter: choice(report.routeFilter, ['all', 'static', 'connected'] as const, 'all'), annotation: text(report.annotation, '', 1200),
    };
  }
  if (typeof sharedRaw.footerNote === 'string' && shared.footerNote !== sharedRaw.footerNote.replace(/\r\n?/g, '\n')) warning = true;
  if (sharedRaw.accent !== undefined && !(typeof sharedRaw.accent === 'string' && /^#[0-9a-f]{6}$/i.test(sharedRaw.accent))) warning = true;
  if (Array.isArray(sharedRaw.routingBlocks) && sharedRaw.routingBlocks.length > 2000) warning = true;
  if (Array.isArray(sharedRaw.routingBlocks)) for (const entry of sharedRaw.routingBlocks.slice(0, 2000)) {
    const block = object(entry); if (!identifier(block.id) || !identifier(block.deviceId) || blockIds.has(block.id)) { warning = true; continue; }
    blockIds.add(block.id); const columns = object(block.columns);
    if (block.interfaceNames !== undefined && block.interfaceNames !== null && !Array.isArray(block.interfaceNames)) warning = true;
    shared.routingBlocks.push({ id: block.id, deviceId: block.deviceId, deviceName: text(block.deviceName, block.deviceId, 240),
      filter: choice(block.filter, ['all', 'static', 'connected', 'default'] as const, 'all'),
      interfaceNames: Array.isArray(block.interfaceNames) ? [...new Set(block.interfaceNames.filter(identifier))].slice(0, 2000) : null,
      columns: { nextHop: bool(columns.nextHop, true), iface: bool(columns.iface, true), origin: bool(columns.origin, false) } });
  }
  const points = (value: unknown) => Object.fromEntries(Object.entries(object(value)).filter(([id, point]) => {
    if (!ids.has(id)) return false; const p = object(point), valid = finite(p.x, -1e7, 1e7) && finite(p.y, -1e7, 1e7); if (!valid) warning = true; return valid;
  }).map(([id, point]) => { const p = object(point); return [id, { x: p.x as number, y: p.y as number }]; }));
  const layouts: StudioPresentationData['layouts'] = {}, rawLayouts = object(source.layouts);
  for (const key of formats) if (Object.hasOwn(rawLayouts, key)) {
    const page = object(rawLayouts[key]), blocks: PagePresentation['blocks'] = {};
    for (const [id, value] of Object.entries(object(page.blocks))) {
      if (!blockIds.has(id)) continue; const block = object(value), position = object(block.position);
      if (!finite(position.x, -1e7, 1e7) || !finite(position.y, -1e7, 1e7)) { warning = true; continue; }
      const width = choice(block.width, ['compact', 'normal'] as const, 'compact');
      if (block.customWidth !== undefined && !finite(block.customWidth, 1, 10000) || block.scale !== undefined && !finite(block.scale, .8, 1.5)) warning = true;
      Object.defineProperty(blocks, id, { enumerable: true, configurable: true, writable: true, value: { position: { x: position.x, y: position.y }, width,
        ...(finite(block.customWidth, 1, 10000) ? { customWidth: block.customWidth } : {}), ...(finite(block.scale, .8, 1.5) ? { scale: block.scale } : {}) } });
    }
    const offset = object(page.areaOffset), validOffset = finite(offset.x, -1e7, 1e7) && finite(offset.y, -1e7, 1e7);
    if (page.areaOffset !== undefined && !validOffset) warning = true;
    layouts[key] = { devicePositions: points(page.devicePositions), compactOffsets: points(page.compactOffsets), blocks, ...(validOffset ? { areaOffset: { x: offset.x as number, y: offset.y as number } } : {}) };
  }
  const positioningTipDismissed = bool(source.positioningTipDismissed, false);
  return { data: { version: 1, shared, layouts, alignmentGuides: bool(source.alignmentGuides, true), ...(positioningTipDismissed ? { positioningTipDismissed: true } : {}) }, warning };
}

export function saveStudioPresentation(session: StudioPageSession, alignmentGuides: boolean, positioningTipDismissed = false): StudioPresentationData {
  return structuredClone({ version: 1 as const, shared: session.shared, alignmentGuides, ...(positioningTipDismissed ? { positioningTipDismissed: true } : {}),
    layouts: Object.fromEntries(Object.entries(session.layouts).map(([key, page]) => [key, { devicePositions: page.devicePositions, compactOffsets: page.compactOffsets, blocks: page.blocks, ...(page.areaOffset ? { areaOffset: page.areaOffset } : {}) }])) });
}
