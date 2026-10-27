import type { Device } from './engine/device';
import { IpDevice } from './engine/ipdevice';
import { cidrToString, ipToString } from './engine/ip';
import { DEVICE_ARTWORK, hasDeviceArtwork, type VisualNode } from './deviceArtwork';

// Partial compensation for the complete caption, never an unlimited inverse
// scale. At 0.5x, 14px names/13px IPs remain about 13px/12px on screen.
export const DEVICE_LABEL_MAX_SCALE = 1.85;
export const networkLabelScale = (zoom: number) => Math.max(1, Math.min(DEVICE_LABEL_MAX_SCALE, 1 / Math.max(.01, zoom) ** .9));

/** Caption bounds only: does not modify node dimensions or cable anchors. */
export function deviceLabelLayout(node: VisualNode, nodes: readonly VisualNode[], zoom: number) {
  const scale = networkLabelScale(zoom);
  const center = (n: VisualNode) => n.position.x + (n.measured?.width ?? 96) / 2;
  const top = (n: VisualNode) => n.position.y + (n.measured?.height ?? (hasDeviceArtwork(n.data.kind) ? DEVICE_ARTWORK[n.data.kind].height + 45 : 78)) - 37;
  const available = nodes.filter(n => n.id !== node.id && Math.abs(top(n) - top(node)) < 40 * scale).map(n => {
    const distance = Math.abs(center(n) - center(node));
    const shared = (distance - 12) / scale;
    // Bridges only display a name. Do not truncate a router's IPv4 merely to
    // reserve an equally wide, mostly empty caption for a neighboring AP.
    if (n.data.kind === 'ap' || n.data.kind === 'switch') {
      const name = 'label' in n.data && typeof n.data.label === 'string' ? n.data.label : n.id;
      const nameWidth = Math.min(180, Math.max(32, name.length * 14 + 8));
      return Math.max(shared, 2 * shared - nameWidth);
    }
    return shared;
  });
  return { scale, maxWidth: Math.max(24, Math.min(180, ...available)) };
}
export function canvasNetwork(device: Device | undefined, previousInterface?: string) {
  if (!(device instanceof IpDevice)) return null;
  const live = device.interfaces.filter(i => i.up && i.link?.operational);
  const configured = device.interfaces.filter(i => i.ip);
  const main = live.find(i => i.ip) ?? live[0] ?? device.interfaces.find(i => i.link) ?? configured.find(i => i.name === previousInterface) ?? configured[0] ?? device.interfaces[0];
  const addressOwner = main?.ip ? main : configured.find(i => i.name === previousInterface) ?? configured[0];
  const stored = !!addressOwner && !live.includes(addressOwner);
  const wireless = main?.medium === 'wireless';
  const noLink = !live.length;
  const pending = !!main?.cancelDhcp || (main?.ipv4Mode === 'dhcp' && !main.ip);
  const state = noLink ? (wireless ? main?.link?.wirelessError ?? (main?.up ? 'Kein Link' : 'Admin DOWN') : main?.up ? 'Kein Link' : 'Admin DOWN')
    : pending ? 'DHCP ausstehend' : !main?.ip ? 'IPv4 nicht konfiguriert' : 'Link aktiv';
  const lines = device.interfaces.map(i => {
    const active = !!i.up && !!i.link?.operational;
    const reason = active ? 'Link aktiv' : !i.up ? 'Admin DOWN' : i.link?.wirelessError ?? 'Kein Link';
    return `${i.name}: ${i.ip ? cidrToString(i.ip.addr, i.ip.prefix) : 'Kein IPv4'} · ${reason}${i.ip && !active ? ' · gespeichert' : ''}${i.cancelDhcp || (i.ipv4Mode === 'dhcp' && !i.ip) ? ' · DHCP ausstehend' : ''}`;
  });
  // Presentation only: keep the operational/main interface first, and show
  // other stored addresses explicitly rather than treating them as live.
  const ordered = addressOwner ? [addressOwner, ...configured.filter(i => i !== addressOwner)] : [];
  const addresses = ordered.filter(i => i.ip).map(i => ({
    address: ipToString(i.ip!.addr), interfaceName: i.name,
    active: live.includes(i), stored: !live.includes(i),
    tooltip: lines[device.interfaces.indexOf(i)],
  }));
  return { address: addressOwner?.ip ? ipToString(addressOwner.ip.addr) : null,
    addresses,
    interfaceName: addressOwner?.name, stored, state, tooltip: `${state}${stored ? ' · IPv4 gespeichert' : ''}\n${lines.join('\n')}`,
    icon: noLink ? wireless ? 'wifi-off' : 'unplug' : pending ? 'pending' : !main?.ip ? 'address' : null } as const;
}
