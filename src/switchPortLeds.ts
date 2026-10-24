import { linkAttachment, type VisualNode, type VisualEdge } from './deviceArtwork';
import type { Network } from './engine/network';
import { interfaceConnection } from './components/InterfaceConnection';

export function switchPortLeds(node: VisualNode, nodes: VisualNode[], edges: VisualEdge[], net: Network) {
  const slots = Array.from({ length: 16 }, () => ({ active: false, linkId: undefined as string | undefined }));
  for (const edge of edges) {
    if (edge.source !== node.id && edge.target !== node.id) continue;
    const slot = linkAttachment(node, edge.id, nodes, edges).visualSlot;
    // Extra interfaces have no illustrated socket and must not borrow its LEDs.
    if (slot === undefined) continue;
    const link = net.links.get(edge.id);
    const connection = link && interfaceConnection(link.a);
    slots[slot] = { linkId: edge.id, active: !!link && connection?.link === link && connection.state === 'connected' };
  }
  return slots;
}
