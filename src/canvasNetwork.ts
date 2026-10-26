import type { Device } from './engine/device';
import { IpDevice } from './engine/ipdevice';
import { cidrToString, ipToString } from './engine/ip';

export const networkLabelScale = (zoom: number) => Math.max(1, Math.min(1.5, 1 / Math.sqrt(Math.max(.01, zoom))));
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
