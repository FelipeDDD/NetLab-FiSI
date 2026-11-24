import type { CapturedPacket } from './packetCapture';

// ARP resolution can release several unrelated queued packets. Show its ID as
// supporting evidence, never use it to merge those packets into one path.
export const predecessor = (p: CapturedPacket) => p.parentTransferId ?? p.responseTo;

export function packetPath(records: readonly CapturedPacket[], selected: number) {
  const byId = new Map(records.map(p => [p.id, p]));
  const children = new Map<number, number[]>();
  for (const p of records) {
    const parent = predecessor(p);
    if (parent === undefined) continue;
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent)!.push(p.id);
  }
  const related = new Set<number>(), pending = [selected];
  while (pending.length) {
    const id = pending.pop()!, p = byId.get(id);
    if (!p || related.has(id)) continue;
    related.add(id);
    const parent = predecessor(p);
    if (parent !== undefined) pending.push(parent);
    pending.push(...children.get(id) ?? []);
  }
  return records.filter(p => related.has(p.id));
}
