import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import { useViewport } from '@xyflow/react';
import { useStore } from '../store';
import { deviceLabelLayout } from '../canvasNetwork';
import { NodeNetworkLabel } from './NodeNetworkLabel';

/** Scale the caption as one block, leaving sprite/Handles/hitbox unchanged. */
export function DeviceLabels({ id, name }: { id: string; name: string }) {
  const nodes = useStore(s => s.nodes), { zoom } = useViewport();
  const node = nodes.find(n => n.id === id);
  const layout = node ? deviceLabelLayout(node, nodes, zoom) : { scale: 1, maxWidth: 180 };
  const labels = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const content = labels.current?.querySelector<HTMLElement>('.device-label-content');
    const card = labels.current?.closest<HTMLElement>('.device-node');
    if (!content || !card) return;
    // The caption is absolutely positioned and scaled independently of the
    // node. Extend only the painted hover/selection outline, never the node box.
    const update = () => {
      const labelBox = content.getBoundingClientRect(), cardBox = card.getBoundingClientRect();
      card.style.setProperty('--device-selection-bottom', `${Math.max(0, (labelBox.bottom - cardBox.bottom) / zoom) + 6}px`);
      card.style.setProperty('--device-selection-left', `${Math.max(0, (cardBox.left - labelBox.left) / zoom + 6)}px`);
      card.style.setProperty('--device-selection-right', `${Math.max(0, (labelBox.right - cardBox.right) / zoom + 6)}px`);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(content); observer.observe(card);
    return () => {
      observer.disconnect();
      for (const side of ['bottom', 'left', 'right']) card.style.removeProperty(`--device-selection-${side}`);
    };
  }, [zoom, layout.scale, layout.maxWidth]);
  return <div ref={labels} className="device-labels"><div className="device-label-content" style={{
    '--device-label-scale': layout.scale, '--device-label-width': `${layout.maxWidth}px`,
  } as CSSProperties}>
    <div className="device-name-row"><div className="dev-label" title={name}>{name}</div></div>
    <NodeNetworkLabel id={id} name={name} />
  </div></div>;
}
