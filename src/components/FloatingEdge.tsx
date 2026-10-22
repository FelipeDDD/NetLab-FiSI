import { BaseEdge, useInternalNode } from '@xyflow/react';
import type { EdgeProps } from '@xyflow/react';
import { useStore } from '../store';

import { cableGeometry } from '../cableGeometry';

export function FloatingEdge({ id, source, target, style, selected }: EdgeProps) {
  const cableStyle = useStore(s => s.cableStyle);
  const hovered = useStore(s => s.hoveredLinkId === id);
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  if (!sourceNode || !targetNode) return null;

  const geometry = cableGeometry(
    { ...sourceNode.internals.positionAbsolute, width: sourceNode.measured.width ?? 96, height: sourceNode.measured.height ?? 78 },
    { ...targetNode.internals.positionAbsolute, width: targetNode.measured.width ?? 96, height: targetNode.measured.height ?? 78 }, cableStyle);
  const path = geometry.path;
  return <BaseEdge id={id} path={path} style={style} interactionWidth={18}
    className={hovered || selected ? 'cable-emphasized' : undefined} />;
}
