import { forwardRef } from 'react';
import { clamp, HERO_TIMELINE, JOURNEY_DURATION_MS, smoothStep } from './geometry';

// Purely illustrative. Uses the existing reading holds, never extends the timeline.
export const DATA_PREVIEW_TIMING = { enterMs: 300, absorbMs: 1700, chargeEndMs: 2700, revealMs: 850, fadeMs: 400 } as const;
export function dataPreviewState(progress: number, enabled = true) {
  const ms = progress * JOURNEY_DURATION_MS, timing = DATA_PREVIEW_TIMING;
  const absorb = smoothStep((ms - timing.enterMs) / (timing.absorbMs - timing.enterMs));
  const arrival = HERO_TIMELINE[6][0] * JOURNEY_DURATION_MS, departure = HERO_TIMELINE[7][0] * JOURNEY_DURATION_MS;
  const reveal = smoothStep((ms - arrival) / timing.revealMs);
  return {
    source: { x: 140 + 36 * (1 - absorb), y: 170 - 56 * (1 - absorb), scale: 1 - .9 * absorb,
      opacity: enabled ? clamp(ms / timing.enterMs) * (1 - absorb) : 0 },
    destination: { x: 1370 - 32 * reveal, y: 170 - 48 * reveal, scale: .1 + .9 * reveal,
      opacity: enabled ? reveal * clamp((departure - ms) / timing.fadeMs) : 0 },
    charge: enabled && ms >= timing.absorbMs && ms <= timing.chargeEndMs ? Math.sin(Math.PI * (ms - timing.absorbMs) / (timing.chargeEndMs - timing.absorbMs)) : 0,
  };
}

export const DataDocument = forwardRef<SVGGElement, { kind: 'source' | 'destination' }>(function DataDocument({ kind }, ref) {
  return <g ref={ref} className="journey-data-document" data-document={kind} opacity="0" aria-hidden="true">
    <path d="M-15-19 H6 L15-10 V19 H-15 Z M6-19 V-10 H15" />
    <text x="0" y="4" textAnchor="middle">DATA</text><path d="M-8 10 H8" />
  </g>;
});

export function paintDataPreview(source: SVGGElement | null, destination: SVGGElement | null, packet: SVGGElement | null, progress: number, enabled: boolean) {
  const state = dataPreviewState(progress, enabled);
  for (const [element, value] of [[source, state.source], [destination, state.destination]] as const) {
    element?.setAttribute('transform', `translate(${value.x.toFixed(3)} ${value.y.toFixed(3)}) scale(${value.scale.toFixed(3)})`);
    element?.setAttribute('opacity', value.opacity.toFixed(3));
  }
  packet?.style.setProperty('--data-charge', state.charge.toFixed(3));
}
