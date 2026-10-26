import { ViewportPortal } from '@xyflow/react';
import type { AlignmentGuide } from '../alignmentGuides';

export function AlignmentGuides({ guides }: { guides: AlignmentGuide[] }) {
  if (!guides.length) return null;
  return <ViewportPortal>
    <svg className="alignment-guides-layer" aria-hidden="true" focusable="false">
      {guides.map(guide => <line key={guide.axis} data-alignment-axis={guide.axis} data-alignment-target={guide.targetId}
        x1={guide.from.x} y1={guide.from.y} x2={guide.to.x} y2={guide.to.y} vectorEffect="non-scaling-stroke" />)}
    </svg>
  </ViewportPortal>;
}
