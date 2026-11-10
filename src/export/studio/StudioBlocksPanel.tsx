import { useState } from 'react';
import type { Language } from '../../i18n';
import type { PrintSnapshot } from './model';
import type { PrintDocumentOptions } from './options';
import type { studioLayout } from './diagram';
import { studioText, type StudioKey } from './messages';
import { PRINT_PIXEL } from './page';
import { StudioSection } from './StudioSection';
import { blockScaleLimits, clampBlockPosition, initialBlockPosition, newRoutingBlock, routeInterfaceNames, routingBlockContent, routingDevices, scaledRoutingBlock, type RoutingBlockOptions, type BlockRouteFilter } from './routingBlocks';

type Layout = ReturnType<typeof studioLayout>;
interface Props { snapshot: PrintSnapshot; options: PrintDocumentOptions; layout: Layout; language: Language; onChange(blocks: RoutingBlockOptions[]): void; }
const filters: [BlockRouteFilter, StudioKey][] = [['all', 'blockAll'], ['static', 'blockStatic'], ['connected', 'blockConnected'], ['default', 'blockDefault']];

export function StudioBlocksPanel({ snapshot, options, layout, language, onChange }: Props) {
  const t = (key: StudioKey) => studioText(language, key), devices = routingDevices(snapshot);
  const [selected, setSelected] = useState(''), [filter, setFilter] = useState<BlockRouteFilter>('all');
  const device = devices.find(d => d.id === selected) ?? devices[0];
  const occupied = [...layout.documentCards, ...layout.documentLabels];
  const patch = (id: string, value: Partial<RoutingBlockOptions>) => onChange(options.routingBlocks.map(b => b.id === id ? { ...b, ...value } : b));
  const add = () => {
    if (!device) return;
    const block = { ...newRoutingBlock(device, crypto.randomUUID()), filter }, content = routingBlockContent(snapshot, block, options, language);
    block.position = initialBlockPosition(content, layout.page.area, [...occupied, ...layout.blocks], layout.documentCables);
    onChange([...options.routingBlocks, block]);
  };
  const restore = (id?: string) => {
    const placed = id ? layout.blocks.filter(b => b.content.block.id !== id) : [];
    const next = options.routingBlocks.map(block => {
      if (id && block.id !== id) return block;
      const content = routingBlockContent(snapshot, block, options, language), position = initialBlockPosition(content, layout.page.area, [...occupied, ...placed], layout.documentCables);
      placed.push({ ...position, ...content, content, oversized: false, overlap: false });
      return { ...block, position };
    });
    onChange(next);
  };
  return <StudioSection title={t('documentationBlocks')} id="blocks" initialOpen accent><div className="studio-blocks">
    <details data-studio-add-block-panel><summary>{t('addBlock')}</summary>
      <label>{t('blockDevice')}<select data-studio-block-device value={device?.id ?? ''} disabled={!devices.length} onChange={e => setSelected(e.target.value)}>{devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
      <label>{t('routeFilter')}<select data-studio-new-block-filter value={filter} onChange={e => setFilter(e.target.value as BlockRouteFilter)}>{filters.map(([value, key]) => <option key={value} value={value}>{t(key)}</option>)}</select></label>
      <button type="button" className="btn" data-studio-add-block disabled={!device} onClick={add}>{t('addBlock')}</button>
    </details>
    {options.routingBlocks.length > 0 && <details className="studio-submenu" data-studio-block-controls open>
      <summary>{t('blockHelp')}</summary>
      {!options.sections.diagram.enabled && <p className="studio-warning">{t('blockDiagramHidden')}</p>}
      <button type="button" className="btn btn--ghost" data-studio-reset-blocks onClick={() => restore()}>{t('restoreBlocks')}</button>
    {options.routingBlocks.map((block, index) => {
      const current = devices.find(d => d.id === block.deviceId), box = layout.blocks.find(b => b.content.block.id === block.id)!;
      const scales = [...[.8, .85, .95, 1, 1.15, 1.3, 1.5].filter(s => Math.abs(s - box.content.scale) > .001), box.content.scale].filter(s => s >= blockScaleLimits(options).min).sort((a, b) => a - b);
      const setPosition = (axis: 'x' | 'y', value: string) => {
        if (!value.trim() || !Number.isFinite(Number(value))) return;
        patch(block.id, { position: clampBlockPosition({ x: box.x, y: box.y, [axis]: Number(value) * PRINT_PIXEL }, box, layout.page.area) });
      };
      return <details key={block.id} data-studio-block-settings={block.id}>
        <summary><span>{index + 1}. {current?.name ?? block.deviceName}</span><small data-block-count>{box.content.count}</small></summary>
        {box.content.missing && <p className="studio-warning">{t('blockDeviceMissing')}</p>}
        <label>{t('blockDevice')}<select data-block-device-select value={block.deviceId} onChange={e => { const d = devices.find(d => d.id === e.target.value)!; patch(block.id, { deviceId: d.id, deviceName: d.name, interfaceNames: null }); }}>
          {!current && <option value={block.deviceId}>{block.deviceName} — {t('unconfigured')}</option>}{devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
        <label>{t('routeFilter')}<select data-block-filter value={block.filter} onChange={e => patch(block.id, { filter: e.target.value as BlockRouteFilter })}>{filters.map(([value, key]) => <option key={value} value={value}>{t(key)}</option>)}</select></label>
        {current && <details><summary>{t('blockInterfaces')}</summary>
          <label className="studio-check"><input type="checkbox" data-block-all-interfaces checked={block.interfaceNames === null} onChange={e => patch(block.id, { interfaceNames: e.target.checked ? null : [] })}/>{t('blockAllInterfaces')}</label>
          {block.interfaceNames !== null && routeInterfaceNames(current).map(name => <label className="studio-check" key={name}><input type="checkbox" data-block-interface={name} checked={block.interfaceNames!.includes(name)} onChange={e => patch(block.id, { interfaceNames: e.target.checked ? [...block.interfaceNames!, name] : block.interfaceNames!.filter(n => n !== name) })}/>{name}</label>)}
        </details>}
        <details><summary>{t('blockColumns')}</summary>{(['nextHop', 'iface', 'origin'] as const).map(key => <label className="studio-check" key={key}><input type="checkbox" data-block-column={key} checked={block.columns[key]} onChange={e => patch(block.id, { columns: { ...block.columns, [key]: e.target.checked } })}/>{t(key === 'iface' ? 'interface' : key)}</label>)}</details>
        <label>{t('blockWidth')}<select data-block-width value={block.customWidth === undefined ? block.width : 'custom'} onChange={e => patch(block.id, { width: e.target.value as RoutingBlockOptions['width'], customWidth: undefined })}><option value="compact">{t('compact')}</option><option value="normal">{t('normalWidth')}</option>{block.customWidth !== undefined && <option value="custom" disabled>{t('customWidth')} ({Math.round(box.width / PRINT_PIXEL)} mm)</option>}</select></label>
        <details data-block-advanced><summary>{t('advancedPositioning')}</summary><div className="studio-option-pair"><label>{t('positionX')}<input data-block-x type="number" step="1" value={Number((box.x / PRINT_PIXEL).toFixed(2))} onChange={e => setPosition('x', e.target.value)}/></label><label>{t('positionY')}<input data-block-y type="number" step="1" value={Number((box.y / PRINT_PIXEL).toFixed(2))} onChange={e => setPosition('y', e.target.value)}/></label></div></details>
        <label>{t('tableScale')}<select data-block-scale-select value={box.content.scale} onChange={e => {
          const scaled = scaledRoutingBlock(options, box, layout.page.area, Number(e.target.value));
          patch(block.id, { scale: scaled.content.scale, customWidth: scaled.content.baseWidth, position: { x: box.x, y: box.y } });
        }}>{scales.map(scale => <option key={scale} value={scale}>{Number((scale * 100).toFixed(1))}%</option>)}</select></label>
        <button type="button" className="btn btn--ghost" data-block-reset-size onClick={() => patch(block.id, { width: 'compact', customWidth: undefined, scale: undefined })}>{t('restoreBlockSize')}</button>
        <div className="studio-block-actions"><button type="button" className="btn btn--ghost" data-block-reset onClick={() => restore(block.id)}>{t('restoreBlock')}</button><button type="button" className="btn btn--ghost" data-block-remove onClick={() => onChange(options.routingBlocks.filter(b => b.id !== block.id))}>{t('removeBlock')}</button></div>
      </details>;
    })}</details>}
  </div></StudioSection>;
}
