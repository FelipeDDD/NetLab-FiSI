import { BaseEdge, useInternalNode } from '@xyflow/react';
import type { EdgeProps } from '@xyflow/react';
import { useStore } from '../store';

import { cableGeometry } from '../cableGeometry';
import { linkAttachment } from '../deviceArtwork';
import type { DevNode } from '../store';
import { sim } from '../sim';
import { inactiveWireless } from '../wirelessPresentation';
import type { CSSProperties } from 'react';
import { useCableAppearances } from './useCableAppearances';

export function FloatingEdge({ id, source, target, style, selected }: EdgeProps) {
  const nodes = useStore(s => s.nodes);
  const edges = useStore(s => s.edges);
  const cableStyle = useStore(s => s.cableStyle);
  const hovered = useStore(s => s.hoveredLinkId === id);
  const color = useCableAppearances()[id];
  const reconnecting = useStore(s => s.reconnectingCable?.id === id);
  const sourceNode = useInternalNode<DevNode>(source);
  const targetNode = useInternalNode<DevNode>(target);
  if (!sourceNode || !targetNode || reconnecting) return null;

  const geometry = cableGeometry(
    linkAttachment({ ...sourceNode, position: sourceNode.internals.positionAbsolute }, id, nodes, edges),
    linkAttachment({ ...targetNode, position: targetNode.internals.positionAbsolute }, id, nodes, edges), cableStyle);
  const path = geometry.path;
  const inactive = inactiveWireless(sim.net.links.get(id));
  const tint = color?.color;
  return <BaseEdge id={id} path={path} style={{ ...style, ...(tint ? { '--cable-color': tint, '--cable-glow': tint + '66' } : {}) } as CSSProperties} interactionWidth={18}
    className={[inactive ? 'wlan-inactive' : '', hovered || selected ? 'cable-emphasized' : ''].filter(Boolean).join(' ')} />;
}
