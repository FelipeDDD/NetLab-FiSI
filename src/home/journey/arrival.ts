import { clamp } from './geometry';

/** Arrival effects are separate from path construction and scroll tracking. */
export function arrivalState(distance: number, station: number, reduced = false) {
  const delta = distance - station;
  return { reached: reduced || delta >= -.5, arriving: !reduced && Math.abs(delta) < 22,
    intensity: reduced ? .4 : clamp(1 - Math.abs(delta) / 30) };
}

export function paintArrival(element: Element, distance: number, station: number, reduced = false) {
  const state = arrivalState(distance, station, reduced);
  for (const [name, value] of [['data-reached', String(state.reached)], ['data-arriving', String(state.arriving)]] as const) {
    if (element.getAttribute(name) !== value) element.setAttribute(name, value);
  }
  (element as HTMLElement | SVGElement).style.setProperty('--arrival', state.intensity.toFixed(3));
}
