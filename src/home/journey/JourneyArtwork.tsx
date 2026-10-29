import { DEVICE_ARTWORK } from '../../deviceArtwork';

export type JourneyDevice = 'host' | 'switch' | 'router' | 'server';
// Illustrative landing points in the original PNG's coordinate system.
// These are not simulator interfaces, LEDs or editable cable anchors.
export const ARTWORK_PORTS = {
  host: { x: 1110, y: 864 }, switch: { x: 700, y: 750 },
  router: { x: 625, y: 950 }, server: { x: 625, y: 875 },
} as const;

export function JourneyArtwork({ kind, width, height, x, y }: { kind: JourneyDevice; width?: number; height?: number; x?: number; y?: number }) {
  const asset = DEVICE_ARTWORK[kind], port = ARTWORK_PORTS[kind];
  return <svg className="journey-artwork" data-artwork={kind} viewBox={asset.viewBox} x={x} y={y} width={width} height={height} preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">
    <image href={`${import.meta.env.BASE_URL}assets/devices/${asset.file}`} width="1254" height="1254" />
    <circle className="journey-arrival-ring" cx={port.x} cy={port.y} r="43" fill="none" strokeWidth="9"/>
    <circle className="journey-arrival-port" data-station-port cx={port.x} cy={port.y} r="10"/>
  </svg>;
}

/** Place a framed sprite so its visible connector meets the path exactly. */
export function artworkPlacement(kind: JourneyDevice, point: { x: number; y: number }, width: number) {
  const [left, top, w, h] = DEVICE_ARTWORK[kind].viewBox.split(' ').map(Number), port = ARTWORK_PORTS[kind], scale = width / w;
  return { x: point.x - (port.x - left) * scale, y: point.y - (port.y - top) * scale, width, height: h * scale };
}
