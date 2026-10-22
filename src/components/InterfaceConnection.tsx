import type { ReactNode } from 'react';
import { ipToString } from '../engine/ip';
import type { NetInterface } from '../engine/device';

export function interfaceConnection(iface: NetInterface) {
  const link = iface.link;
  if (!link) return { link: null, state: 'disconnected', text: 'Nicht verbunden · kein Kabel' } as const;
  const peer = link.other(iface);
  if (iface.device.network.links.get(link.id) !== link || peer.link !== link || iface.device.disposed || peer.device.disposed) {
    return { link: null, state: 'unknown', text: 'Verbindungszustand unbekannt' } as const;
  }
  if (!iface.up || !peer.up) {
    const reason = !iface.up && !peer.up ? 'beide Schnittstellen DOWN' : !iface.up ? 'lokale Schnittstelle DOWN' : 'Gegenstelle DOWN';
    return { link, state: 'inactive', text: `Kabel zu ${peer.device.name} · ${reason}` } as const;
  }
  return { link, state: 'connected', text: `Verbunden mit ${peer.device.name} · Link aktiv` } as const;
}

// A link can carry frames only when both modeled endpoints are administratively UP.
// This is link status, never an assertion of IP reachability.
export function InterfaceConnection({ iface }: { iface: NetInterface }) {
  const connection = interfaceConnection(iface);
  return <span className={`interface-physical-state is-${connection.state}`}
    data-link-state={connection.state} data-link-id={connection.link?.id}
    aria-label={`Verbindungszustand ${iface.name}: ${connection.text}`}>{connection.text}</span>;
}

// Device identity shares the canvas category palette, not terminal preferences.
export function InterfaceSummary({ iface, vlan, showMode = false, action, medium = 'wired' }: {
  iface: NetInterface; vlan?: number; showMode?: boolean; action?: ReactNode; medium?: 'wired' | 'wireless' | 'unspecified';
}) {
  const connection = interfaceConnection(iface);
  const peer = connection.link?.other(iface).device;
  const label = { connected: 'Link aktiv', inactive: 'Link inaktiv', disconnected: 'Kein Kabel', unknown: 'Unbekannt' }[connection.state];
  // The AP models wireless endpoints as links too. Preserve detection while
  // avoiding cable terminology in their visible and accessible descriptions.
  const unoccupied = medium === 'unspecified' && connection.state === 'disconnected';
  const text = unoccupied ? 'Nicht belegt · Verbindungstyp nicht bestimmt'
    : medium === 'wireless' ? connection.text.replace('Kabel zu', 'WLAN-Verbindung zu').replace('kein Kabel', 'kein WLAN-Link').replace('Link aktiv', 'WLAN aktiv') : connection.text;
  const stateLabel = unoccupied ? 'Nicht belegt'
    : medium === 'wireless' ? { connected: 'WLAN aktiv', inactive: 'WLAN inaktiv', disconnected: 'Kein WLAN-Link', unknown: 'Unbekannt' }[connection.state] : label;
  return <span className={`interface-summary is-${connection.state}`} data-interface-name={iface.name}
    data-device-id={iface.device.id} data-link-state={connection.state} data-link-id={connection.link?.id}>
    <strong className="interface-summary-name">{iface.name}</strong>
    <span className="interface-summary-state" title={text}
      aria-label={`Verbindungszustand ${iface.name}: ${text}`}>{stateLabel}</span>
    <span className="interface-summary-config">
      <span>{vlan === undefined ? iface.ip ? `${ipToString(iface.ip.addr)}/${iface.ip.prefix}` : 'Kein IPv4' : `VLAN ${vlan}`}</span>
      {' \u00b7 '}<span>Admin: {iface.up ? 'UP' : 'DOWN'}</span>
      {showMode && <span> &middot; {{ static: 'Static', dhcp: 'DHCP', unconfigured: 'Unconfigured' }[iface.ipv4Mode]}</span>}
    </span>
    <span className="interface-summary-peer">{peer ? <>Mit <strong style={{ color: `var(--${peer.kind}, var(--text))` }}>{peer.name}</strong></>
      : connection.state === 'unknown' ? 'Verbindung unbekannt' : 'Keine Verbindung'}</span>
    {action && <span className="interface-summary-action">{action}</span>}
  </span>;
}
