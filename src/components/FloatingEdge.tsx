import { BaseEdge, getStraightPath, useInternalNode } from '@xyflow/react';
import type { EdgeProps } from '@xyflow/react';

// Network cables have no natural "handle side": draw every edge from node
// border to node border along the centre line, whichever way the nodes sit.
function clipToRect(cx: number, cy: number, tx: number, ty: number, w: number, h: number) {
  const dx = tx - cx;
  const dy = ty - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const sx = w / 2 / Math.abs(dx || 1e-9);
  const sy = h / 2 / Math.abs(dy || 1e-9);
  const s = Math.min(sx, sy);
  return { x: cx + dx * s, y: cy + dy * s };
}

export function FloatingEdge({ id, source, target, style }: EdgeProps) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  if (!sourceNode || !targetNode) return null;

  const sw = sourceNode.measured.width ?? 96;
  const sh = sourceNode.measured.height ?? 78;
  const tw = targetNode.measured.width ?? 96;
  const th = targetNode.measured.height ?? 78;
  const scx = sourceNode.internals.positionAbsolute.x + sw / 2;
  const scy = sourceNode.internals.positionAbsolute.y + sh / 2;
  const tcx = targetNode.internals.positionAbsolute.x + tw / 2;
  const tcy = targetNode.internals.positionAbsolute.y + th / 2;

  const p1 = clipToRect(scx, scy, tcx, tcy, sw, sh);
  const p2 = clipToRect(tcx, tcy, scx, scy, tw, th);
  const [path] = getStraightPath({ sourceX: p1.x, sourceY: p1.y, targetX: p2.x, targetY: p2.y });

  return <BaseEdge id={id} path={path} style={style} />;
}
