import { useId, useState } from 'react';
import { DEVICE_ARTWORK } from '../deviceArtwork';
import { linkAttachment } from '../deviceArtwork';
import { cableGeometry } from '../cableGeometry';
import { useStore } from '../store';
import { SwitchPortLeds } from './SwitchPortLeds';
export { hasDeviceArtwork } from '../deviceArtwork';

// Reversible, decorative finishing only; the actual cable remains in its underlay.
const SWITCH_CABLE_TIPS = true;
const SWITCH_DYNAMIC_LEDS = true;
function SwitchCableTips({ id }: { id: string }) {
  const nodes = useStore(s => s.nodes);
  const edges = useStore(s => s.edges);
  const style = useStore(s => s.cableStyle);
  const hovered = useStore(s => s.hoveredLinkId);
  const colors = useStore(s => s.cableColors);
  const reconnecting = useStore(s => s.reconnectingCable?.id);
  const node = nodes.find(n => n.id === id);
  if (!node) return null;
  const scale = 136 / 1144;
  const left = node.position.x + ((node.measured?.width ?? 152) - 136) / 2;
  const top = node.position.y + 6 + (44 - 363 * scale) / 2;
  return <g pointerEvents="none" className="switch-cable-tips">
    {edges.filter(e => e.source === id || e.target === id).map(edge => {
      if (reconnecting === edge.id) return null;
      const peer = nodes.find(n => n.id === (edge.source === id ? edge.target : edge.source));
      if (!peer) return null;
      const attachment = linkAttachment(node, edge.id, nodes, edges);
      // Extra interfaces use the generic underlay region, without invented sockets.
      if (attachment.width !== 2) return null;
      const geometry = cableGeometry(linkAttachment(peer, edge.id, nodes, edges), attachment, style);
      if (!geometry.frontEnd) return null;
      const active = edge.selected || hovered === edge.id;
      const tint = colors[edge.id]?.color;
      return <g key={edge.id} data-cable-tip={edge.id} fill="none" strokeLinecap="round" strokeLinejoin="round" transform={`translate(${55 - left / scale} ${468 - top / scale}) scale(${1 / scale})`}>

        <path d={geometry.frontEnd} stroke={tint || (active ? 'var(--accent)' : '#52698f')} strokeWidth={active ? 3 : 2} />
      </g>;
    })}
  </g>;
}

export function DeviceArtwork({ kind, fallback, id }: { kind: keyof typeof DEVICE_ARTWORK; fallback: React.ReactNode; id?: string }) {
  const [failed, setFailed] = useState(false);
  const shieldId = useId().replace(/:/g, '');
  const asset = DEVICE_ARTWORK[kind];
  if (failed) return <>{fallback}</>;
  // Frame the silhouette; overflow stays visible to preserve faint outer glows.
  return <svg className="device-artwork" viewBox={asset.viewBox} width={asset.width} height={asset.height}
    preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">
    <image href={`${import.meta.env.BASE_URL}assets/devices/${asset.file}`} width="1254" height="1254" onError={() => setFailed(true)} />
    {kind === 'firewall' && <>
      <defs>
        <filter id={`${shieldId}-soft`}><feGaussianBlur stdDeviation="6" /></filter>
        <mask id={`${shieldId}-shield`} maskUnits="userSpaceOnUse" x="420" y="280" width="410" height="430">
          <path d="M627 305 Q710 350 796 367 L796 502 Q790 610 627 684 Q464 610 452 502 L452 367 Q540 350 627 305Z" fill="white" filter={`url(#${shieldId}-soft)`} />
        </mask>
      </defs>
      {/* Local, reversible 22% light reduction; cyan LEDs/chassis untouched. */}
      <path d="M420 280H830V710H420Z" fill="black" opacity="0.22" mask={`url(#${shieldId}-shield)`} pointerEvents="none" />
    </>}
    {SWITCH_DYNAMIC_LEDS && kind === 'switch' && id && <SwitchPortLeds id={id} />}
    {SWITCH_CABLE_TIPS && kind === 'switch' && id && <SwitchCableTips id={id} />}
  </svg>;
}
