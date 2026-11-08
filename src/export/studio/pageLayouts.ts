import type { Language } from '../../i18n';
import type { PrintSnapshot } from './model';
import { reconcilePrintOptions, type PrintDocumentOptions } from './options';
import type { DevicePositions } from './devicePositions';
import { studioLayout } from './diagram';
import { initialBlockPosition, routingBlockContent, type RoutingBlockOptions } from './routingBlocks';

export type PageLayoutKey = `${PrintDocumentOptions['paper']}-${PrintDocumentOptions['orientation']}`;
type BlockGeometry = Pick<RoutingBlockOptions, 'position' | 'width' | 'customWidth' | 'scale'>;
type BlockDefinition = Omit<RoutingBlockOptions, keyof BlockGeometry>;
type SharedOptions = Omit<PrintDocumentOptions, 'devicePositions' | 'compactOffsets' | 'areaOffset' | 'routingBlocks'> & { routingBlocks: BlockDefinition[] };
export interface PagePresentation {
  devicePositions: DevicePositions; compactOffsets: DevicePositions;
  areaOffset?: PrintDocumentOptions['areaOffset'];
  blocks: Record<string, BlockGeometry>;
  compactUndo: DevicePositions | null; compactNotice: boolean;
}
export interface StudioPageSession { shared: SharedOptions; layouts: Partial<Record<PageLayoutKey, PagePresentation>>; }
export const pageLayoutKey = (options: Pick<PrintDocumentOptions, 'paper' | 'orientation'>): PageLayoutKey => `${options.paper}-${options.orientation}`;
const emptyPresentation = (): PagePresentation => ({ devicePositions: {}, compactOffsets: {}, blocks: {}, compactUndo: null, compactNotice: false });
const definition = ({ position: _position, width: _width, customWidth: _customWidth, scale: _scale, ...shared }: RoutingBlockOptions): BlockDefinition => shared;
const geometry = (block: RoutingBlockOptions): BlockGeometry => ({ position: block.position, width: block.width, customWidth: block.customWidth, scale: block.scale });
export const activePresentation = (session: StudioPageSession): PagePresentation => session.layouts[pageLayoutKey(session.shared)]!;

/** Existing renderers/drag hooks still receive one ordinary document. The session
 * stores shared table identities/filters once and only geometry in each variant. */
export function activePageOptions(session: StudioPageSession): PrintDocumentOptions {
  const page = activePresentation(session);
  return { ...session.shared, devicePositions: page.devicePositions, compactOffsets: page.compactOffsets, areaOffset: page.areaOffset,
    routingBlocks: session.shared.routingBlocks.map(block => ({ ...block, ...(page.blocks[block.id] ?? { width: 'compact' as const, position: { x: 0, y: 0 } }) })) };
}

export function createPageSession(options: PrintDocumentOptions): StudioPageSession {
  const { devicePositions, compactOffsets, areaOffset, routingBlocks, ...shared } = options;
  return { shared: { ...shared, routingBlocks: routingBlocks.map(definition) }, layouts: {
    [pageLayoutKey(options)]: { ...emptyPresentation(), devicePositions, compactOffsets, areaOffset, blocks: Object.fromEntries(routingBlocks.map(block => [block.id, geometry(block)])) },
  } };
}

/** First visits and tables added elsewhere use the existing safe-placement scan.
 * Existing positions/sizes are never rewritten by materialisation or revalidation. */
export function preparePageSession(session: StudioPageSession, snapshot: PrintSnapshot, language: Language): StudioPageSession {
  const key = pageLayoutKey(session.shared), page = session.layouts[key] ?? emptyPresentation();
  const missing = session.shared.routingBlocks.filter(block => !Object.hasOwn(page.blocks, block.id));
  let result = { ...session, layouts: { ...session.layouts, [key]: page } };
  for (const block of missing) {
    const options = activePageOptions(result);
    options.routingBlocks = options.routingBlocks.filter(b => Object.hasOwn(activePresentation(result).blocks, b.id));
    const scene = studioLayout(snapshot, options, language);
    const fresh: RoutingBlockOptions = { ...block, width: 'compact', position: { x: 0, y: 0 } };
    const content = routingBlockContent(snapshot, fresh, options, language);
    fresh.position = initialBlockPosition(content, scene.page.area, [...scene.documentCards, ...scene.documentLabels, ...scene.blocks], scene.documentCables);
    result = updateActivePresentation(result, current => ({ ...current, blocks: { ...current.blocks, [block.id]: geometry(fresh) } }));
  }
  return result;
}

/** Update shared content and active geometry atomically. A paper/orientation
 * switch saves the source and activates a separate destination, never copying
 * manual centres, compact offsets, undo or table dimensions into that page. */
export function updatePageSession(session: StudioPageSession, update: (options: PrintDocumentOptions) => PrintDocumentOptions, snapshot: PrintSnapshot, language: Language): StudioPageSession {
  const previousKey = pageLayoutKey(session.shared), next = update(activePageOptions(session));
  const { devicePositions, compactOffsets, areaOffset, routingBlocks, ...shared } = next;
  const validBlocks = new Set(routingBlocks.map(block => block.id));
  const layouts = Object.fromEntries(Object.entries(session.layouts).map(([key, page]) => [key, {
    ...page, blocks: Object.fromEntries(Object.entries(page.blocks).filter(([id]) => validBlocks.has(id))),
  }])) as StudioPageSession['layouts'];
  layouts[previousKey] = { ...layouts[previousKey]!, devicePositions, compactOffsets, areaOffset, blocks: Object.fromEntries(routingBlocks.map(block => [block.id, geometry(block)])) };
  return preparePageSession({ shared: { ...shared, routingBlocks: routingBlocks.map(definition) }, layouts }, snapshot, language);
}

export function updateActivePresentation(session: StudioPageSession, update: (page: PagePresentation) => PagePresentation): StudioPageSession {
  return { ...session, layouts: { ...session.layouts, [pageLayoutKey(session.shared)]: update(activePresentation(session)) } };
}

export function reconcilePageSession(session: StudioPageSession, snapshot: PrintSnapshot, language: Language): StudioPageSession {
  const refreshed = updatePageSession(session, options => reconcilePrintOptions(options, snapshot), snapshot, language);
  const ids = new Set(snapshot.devices.map(device => device.id));
  const keep = (positions: DevicePositions) => Object.fromEntries(Object.entries(positions).filter(([id]) => ids.has(id)));
  return { ...refreshed, layouts: Object.fromEntries(Object.entries(refreshed.layouts).map(([key, page]) => [key, {
    ...page, devicePositions: keep(page.devicePositions), compactOffsets: keep(page.compactOffsets), compactUndo: page.compactUndo && keep(page.compactUndo), compactNotice: false,
  }])) };
}
