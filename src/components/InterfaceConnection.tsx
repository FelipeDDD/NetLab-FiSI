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
