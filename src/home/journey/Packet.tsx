import { forwardRef } from 'react';

/** Shared visual identity only; contains no network state. Pointer-transparent. */
export const Packet = forwardRef<SVGGElement, { id: string }>(function Packet({ id }, ref) {
  return <g ref={ref} className="journey-packet" data-packet={id} aria-hidden="true">
    <circle className="journey-packet-halo" r="13" /><circle className="journey-packet-core" r="5" />
    <circle className="journey-packet-center" r="1.5" />
  </g>;
});

export function positionPacket(element: SVGGElement | null, point: { x: number; y: number }) {
  element?.setAttribute('transform', `translate(${point.x.toFixed(3)} ${point.y.toFixed(3)})`);
}
