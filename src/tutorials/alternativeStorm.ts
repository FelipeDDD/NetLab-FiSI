import type { ProjectDocument } from '../projects/types';

/** A selective patch: preserve devices, cable, addresses, routes and document UI. */
export function stormDocument(before: ProjectDocument) {
  const after = structuredClone(before);
  const port = after.topology.devices.find(d => d.id === 'tutorial-05-r2')?.ifaces.find(i => i.name === 'eth1');
  if (!port) throw Error('Missing storm interface.');
  port.up = false;
  return after;
}
