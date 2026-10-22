import type { Network } from './engine/network';

// Read live endpoints; presentation never caches interface numbers or status.
export function linkPresentation(net: Network, id: string | null | undefined) {
  const link = id ? net.links.get(id) : undefined;
  if (!link || link.a.link !== link || link.b.link !== link || link.a.device.disposed || link.b.device.disposed) return null;
  const endpoint = (iface: typeof link.a) => `${iface.device.name} / ${iface.name}`;
  return {
    title: `${endpoint(link.a)} ↔ ${endpoint(link.b)}`,
    a: `${endpoint(link.a)} · ${link.a.up ? 'UP' : 'DOWN'}`,
    b: `${endpoint(link.b)} · ${link.b.up ? 'UP' : 'DOWN'}`,
    latency: link.latency,
  };
}
