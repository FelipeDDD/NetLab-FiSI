import type { Network } from './engine/network';
import type { DeviceKind } from './engine/device';

type PositionedNode = { id: string; position: { x: number; y: number }; measured?: { width?: number; height?: number } };
type TooltipEndpoint = { deviceId: string; name: string; interfaceName: string; kind: DeviceKind };

// Order the labels only when one axis clearly dominates. The link itself is untouched.
export function linkTooltipEndpoints(net: Network, id: string | null | undefined, nodes: readonly PositionedNode[]): [TooltipEndpoint, TooltipEndpoint] | null {
  const link = id ? net.links.get(id) : undefined;
  if (!link || !linkPresentation(net, id)) return null;
  const endpoint = (iface: typeof link.a): TooltipEndpoint => ({ deviceId: iface.device.id, name: iface.device.name, interfaceName: iface.name, kind: iface.device.kind });
  const endpoints: [TooltipEndpoint, TooltipEndpoint] = [endpoint(link.a), endpoint(link.b)];
  const centers = endpoints.map(e => {
    const node = nodes.find(n => n.id === e.deviceId);
    if (!node) return null;
    const x = node.position.x + (node.measured?.width ?? 0) / 2, y = node.position.y + (node.measured?.height ?? 0) / 2;
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  });
  const [a, b] = centers;
  if (!a || !b) return endpoints;
  const dx = b.x - a.x, dy = b.y - a.y;
  const reverse = Math.abs(dx) >= 80 && Math.abs(dx) >= 1.5 * Math.abs(dy) ? dx < 0
    : Math.abs(dy) >= 80 && Math.abs(dy) >= 1.5 * Math.abs(dx) ? dy < 0 : false;
  return reverse ? [endpoints[1], endpoints[0]] : endpoints;
}

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
