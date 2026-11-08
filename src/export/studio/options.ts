import type { PrintSnapshot } from './model';
import type { RoutingBlockOptions } from './routingBlocks';
import type { DevicePositions } from './devicePositions';
import type { Point } from './geometry';

export type PrintPreset = 'clean' | 'technical' | 'presentation';
export type ReportSection = 'diagram' | 'inventory' | 'interfaces' | 'routes' | 'connections' | 'services' | 'firewall';
export const REPORT_SECTIONS: ReportSection[] = ['diagram', 'inventory', 'interfaces', 'routes', 'connections', 'services', 'firewall'];
export interface DiagramOptions {
  deviceIds: string[]; names: boolean; types: boolean; ipv4: boolean; cidr: boolean; interfaces: boolean;
  gateways: boolean; gatewayInterfaces: boolean; cables: boolean; cableLabels: boolean; colored: boolean; areas: boolean; areaTitles: boolean;
}
export interface ReportSectionOptions { enabled: boolean; deviceIds: string[]; }
export interface PrintDocumentOptions {
  reportSettings?: { sections: PrintDocumentOptions['sections']; routeFilter: PrintDocumentOptions['routeFilter']; annotation: string };
  preset: PrintPreset; title: string; subtitle: string; annotation: string; footerNote: string; accent: string;
  paper: 'A4' | 'A3'; orientation: 'landscape' | 'portrait'; margin: 10 | 15 | 20;
  textSize: 'small' | 'normal' | 'large'; diagram: DiagramOptions;
  sections: Record<ReportSection, ReportSectionOptions>; names: Record<string, string>;
  routeFilter: 'all' | 'static' | 'connected';
  routingBlocks: RoutingBlockOptions[];
  diagramScale: number;
  devicePositions: DevicePositions;
  /** Presentation offsets in topology units, relative to automatic card centres. */
  compactOffsets: DevicePositions;
  /** Presentation-only translation of area geometry, in document pixels. */
  areaOffset?: Point;
}
export const presentationName = (options: PrintDocumentOptions, id: string): string => Object.hasOwn(options.names, id) && typeof options.names[id] === 'string' ? options.names[id] : '';
export function printPreset(preset: PrintPreset, snapshot: { devices: readonly Pick<PrintSnapshot['devices'][number], 'id' | 'kind'>[] }): PrintDocumentOptions {
  const all = snapshot.devices.map(d => d.id), routers = snapshot.devices.filter(d => d.kind === 'router' || d.kind === 'firewall').map(d => d.id);
  return { preset, title: '', subtitle: '', annotation: '', footerNote: '', accent: '#256080', paper: 'A4', orientation: 'landscape', margin: 15,
    textSize: preset === 'presentation' ? 'large' : 'normal', names: {}, routeFilter: 'all', routingBlocks: [], diagramScale: 1, devicePositions: {}, compactOffsets: {},
    diagram: { deviceIds: all, names: true, types: preset === 'technical', ipv4: preset === 'technical', cidr: true, interfaces: preset === 'technical', gateways: false, gatewayInterfaces: preset === 'technical',
      cables: true, cableLabels: preset === 'technical', colored: preset === 'presentation', areas: false, areaTitles: true },
    sections: Object.fromEntries(REPORT_SECTIONS.map(section => [section, { enabled: section === 'diagram' || preset === 'technical' && ['inventory', 'interfaces', 'routes', 'connections'].includes(section),
      deviceIds: section === 'routes' || section === 'interfaces' ? routers : all }])) as PrintDocumentOptions['sections'] };
}
/** Presets adjust presentation defaults while retaining the user's work and
 * remembering technical-report selections through non-report presets. */
export function changePrintPreset(options: PrintDocumentOptions, preset: PrintPreset, snapshot: PrintSnapshot): PrintDocumentOptions {
  const base = printPreset(preset, snapshot);
  const reportSettings = options.preset === 'technical'
    ? { sections: options.sections, routeFilter: options.routeFilter, annotation: options.annotation }
    : options.reportSettings ?? (Object.entries(options.sections).some(([key, value]) => key !== 'diagram' && value.enabled)
      ? { sections: options.sections, routeFilter: options.routeFilter, annotation: options.annotation } : undefined);
  const report = preset === 'technical' ? reportSettings ?? { sections: base.sections, routeFilter: base.routeFilter, annotation: options.annotation } : { sections: base.sections, routeFilter: options.routeFilter, annotation: '' };
  return { ...options, preset, textSize: base.textSize, diagram: { ...base.diagram, deviceIds: options.diagram.deviceIds, areas: options.diagram.areas, areaTitles: options.diagram.areaTitles }, ...report, reportSettings };
}
export function pageSize(options: Pick<PrintDocumentOptions, 'paper' | 'orientation' | 'margin'>) {
  const short = options.paper === 'A4' ? 210 : 297, long = options.paper === 'A4' ? 297 : 420;
  return { width: options.orientation === 'landscape' ? long : short, height: options.orientation === 'landscape' ? short : long };
}
/** Refresh preserves explicit selections/aliases for surviving IDs; new devices
 * are available in the pickers but never silently included in a curated report. */
export function reconcilePrintOptions(options: PrintDocumentOptions, snapshot: PrintSnapshot): PrintDocumentOptions {
  const ids = new Set(snapshot.devices.map(d => d.id)), keep = (values: string[]) => values.filter(id => ids.has(id));
  return { ...options, diagram: { ...options.diagram, deviceIds: keep(options.diagram.deviceIds) },
    devicePositions: Object.fromEntries(Object.entries(options.devicePositions).filter(([id]) => ids.has(id))),
    compactOffsets: Object.fromEntries(Object.entries(options.compactOffsets).filter(([id]) => ids.has(id))),
    routingBlocks: options.routingBlocks.map(block => {
      const device = snapshot.devices.find(d => d.id === block.deviceId);
      if (!device) return block; // Retain identity/position, never substitute another device.
      const available = new Set([...device.interfaces.map(i => i.name), ...device.routes.map(r => r.iface)]);
      return { ...block, deviceName: device.name, interfaceNames: block.interfaceNames === null ? null : block.interfaceNames.filter(name => available.has(name)) };
    }),
    names: Object.fromEntries(Object.entries(options.names).filter(([id]) => ids.has(id))),
    sections: Object.fromEntries(REPORT_SECTIONS.map(section => [section, { ...options.sections[section], deviceIds: keep(options.sections[section].deviceIds) }])) as PrintDocumentOptions['sections'] };
}
