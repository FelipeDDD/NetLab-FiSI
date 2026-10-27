import type { CSSProperties } from 'react';
import { useViewport } from '@xyflow/react';
import { useStore } from '../store';
import { deviceLabelLayout } from '../canvasNetwork';
import { NodeNetworkLabel } from './NodeNetworkLabel';

/** Scale the caption as one block, leaving sprite/Handles/hitbox unchanged. */
export function DeviceLabels({ id, name }: { id: string; name: string }) {
  const nodes = useStore(s => s.nodes), { zoom } = useViewport();
  const node = nodes.find(n => n.id === id);
  const layout = node ? deviceLabelLayout(node, nodes, zoom) : { scale: 1, maxWidth: 180 };
  return <div className="device-labels"><div className="device-label-content" style={{
    '--device-label-scale': layout.scale, '--device-label-width': `${layout.maxWidth}px`,
  } as CSSProperties}>
    <div className="device-name-row"><div className="dev-label" title={name}>{name}</div></div>
    <NodeNetworkLabel id={id} name={name} />
  </div></div>;
}
