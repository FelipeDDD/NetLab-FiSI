import type { DeviceKind } from './engine/device';
import type { CableBox } from './cableGeometry';

// Local visual experiment: false restores the original canvas icons and sizing.
export const EXPERIMENTAL_DEVICE_ARTWORK = true;
export const DEVICE_ARTWORK = {
  host: { file: 'pc1.png', viewBox: '95 298 1090 676', width: 106, height: 66 },
  switch: { file: 'switch1.png', viewBox: '55 468 1144 363', width: 136, height: 44 },
  router: { file: 'router1.png', viewBox: '58 226 1138 813', width: 114, height: 82 },
  server: { file: 'server1.png', viewBox: '335 253 585 784', width: 74, height: 100 },
  firewall: { file: 'firewall1.png', viewBox: '45 285 1170 675', width: 128, height: 74 },
  ap: { file: 'ap1.png', viewBox: '90 285 1075 705', width: 106, height: 70 },
  notebook: { file: 'note1.png', viewBox: '175 325 910 660', width: 110, height: 80 },
  smartphone: { file: 'phone1.png', viewBox: '415 205 450 880', width: 50, height: 98 },
} as const;
export function hasDeviceArtwork(kind: DeviceKind): kind is keyof typeof DEVICE_ARTWORK {
  return EXPERIMENTAL_DEVICE_ARTWORK && kind in DEVICE_ARTWORK;
}

// Visual landing regions only, unrelated to Handles or simulated interfaces.
// Switch: near the RJ45 bank. Router: inside the chassis below the antennas.
export function cableAttachmentBox(box: CableBox, kind: DeviceKind): CableBox {
  if (hasDeviceArtwork(kind) && (kind === 'notebook' || kind === 'smartphone')) {
    const asset = DEVICE_ARTWORK[kind];
    return {x:box.x+box.width/2-6,y:box.y+6+asset.height/2-3,width:12,height:6};
  }
  // Land underneath each new silhouette; the shared underlay hides the cable
  // and packets behind opaque pixels, without changing their common path.
  if (hasDeviceArtwork(kind) && (kind === 'firewall' || kind === 'ap')) {
    const asset = DEVICE_ARTWORK[kind];
    const x = box.x + box.width / 2;
    const y = box.y + 6 + asset.height * (kind === 'firewall' ? 0.78 : 0.6);
    return { x: x - 6, y: y - 3, width: 12, height: 6 };
  }
  if (!hasDeviceArtwork(kind) || (kind !== 'switch' && kind !== 'router')) return box;
  const asset = DEVICE_ARTWORK[kind];
  const x = box.x + box.width / 2 + (kind === 'switch' ? asset.width * 0.12 : 0);
  // Matches the artwork node's 5px padding + 1px border.
  const y = box.y + 6 + asset.height * (kind === 'switch' ? 0.68 : 0.77);
  return { x: x - 6, y: y - 3, width: 12, height: 6 };
}

// Deterministic visual slots: never use interface numbers as physical PNG ports.
export type VisualNode = { id: string; position: { x: number; y: number }; measured?: { width?: number; height?: number }; data: { kind: DeviceKind } };
export type VisualEdge = { id: string; source: string; target: string };
export function linkAttachment(node: VisualNode, linkId: string, nodes: VisualNode[], edges: VisualEdge[]): CableBox & { visualSlot?: number } {
  const box = { ...node.position, width: node.measured?.width ?? 96, height: node.measured?.height ?? 78 };
  if (!hasDeviceArtwork(node.data.kind) || node.data.kind !== 'switch') return cableAttachmentBox(box, node.data.kind);
  const occupied = new Set<number>();
  const links = edges.filter(e => e.source === node.id || e.target === node.id)
    .sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
  for (const edge of links) {
    const peer = nodes.find(n => n.id === (edge.source === node.id ? edge.target : edge.source));
    const dx = peer ? peer.position.x + (peer.measured?.width ?? 96) / 2 - (box.x + box.width / 2) : 0;
    const dy = peer ? peer.position.y - box.y : 0;
    const side = Math.abs(dx) > Math.abs(dy);
    // Spread lower arrivals across the panel according to their approach angle.
    // Side and rear arrivals retain their existing socket preference.
    const fromBelow = !side && dy > 0;
    const preferredColumn = side ? (dx < 0 ? 0 : 7)
      : fromBelow ? 3.5 + 3.5 * dx / dy : 3.5;
    const fromAbove = !side && dy < 0;
    const preferredRow = 1;
    const candidates = Array.from({ length: 16 }, (_, i) => i).filter(i => !occupied.has(i));
    candidates.sort((a, b) => {
      const score = (i: number) => Math.abs(i % 8 - preferredColumn) * 2 + (Math.floor(i / 8) === preferredRow ? 0 : 20);
      return score(a) - score(b) || a - b;
    });
    const slot = candidates[0];
    if (slot !== undefined) occupied.add(slot);
    if (edge.id !== linkId) continue;
    if (slot === undefined) return cableAttachmentBox(box, 'switch');
    // Pixel centers of the two RJ45 rows in the unmodified 1254px artwork.
    const scale = 136 / 1144;
    const x = box.x + (box.width - 136) / 2 + (420 + (slot % 8) * 94 - 55) * scale;
    const y = box.y + 6 + (Math.floor(slot / 8) === 0 ? 670 - 468 : 750 - 468) * scale + (44 - 363 * scale) / 2;
    return { x: x - 1, y: y - 1, width: 2, height: 2, visualSlot: slot,
      ...(!fromAbove ? { front: { x: side ? Math.sign(dx) * 24 : 28 * Math.tanh(dx / 160), y: fromBelow ? 38 : 26 } }
        : { rearBelow: 8 + (slot < 8 ? 80 * scale : 0) }) };
  }
  return cableAttachmentBox(box, 'switch');
}
