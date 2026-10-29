import { Network } from '../../engine/network';
import { createDevice } from '../../engine/factory';
import { disposeNetwork } from '../../engine/networkLifecycle';
import { serializeNetwork, type SaveFile } from '../../engine/serialize';
import type { DeviceKind } from '../../engine/device';
import type { Check } from '../../labs/types';
import type { Assessment } from '../types';
import type { NetworkDraft } from './types';
import { address as number, subnet } from './math';

export function topology(devices: [DeviceKind, string, string, string[]][], links: [string, string, string, string][]): SaveFile {
  const net = new Network();
  try {
    const positions: Record<string, { x: number; y: number }> = {};
    devices.forEach(([kind, id, name], i) => {
      createDevice(net, kind, { id, name });
      positions[id] = { x: 100 + (i % 3) * 270, y: 100 + Math.floor(i / 3) * 230 };
    });
    links.forEach(([a, aIface, b, bIface], i) => net.connect(a, b, { id: `line-${i + 1}`, aIface, bIface }));
    const file = serializeNetwork(net, positions);
    devices.forEach(([, id, , ips]) => ips.forEach((ip, i) => setAddress(file, id, i, ip)));
    return file;
  } finally { disposeNetwork(net); }
}
export const device = (f: SaveFile, id: string) => {
  const d = f.devices.find(d => d.id === id);
  if (!d) throw new Error(`Unbekannte Geräte-ID ${id}`);
  return d;
};
export function setAddress(f: SaveFile, id: string, index: number, ip: string) {
  Object.assign(device(f, id).ifaces[index], { ip, ipv4Mode: 'static' });
}
export function route(f: SaveFile, id: string, dest: string, via: string, dev = 'eth0') {
  device(f, id).routes.push({ dest, via, dev });
}
export const check = (id: string, requirementId: string, c: Check): Assessment => ({ id, requirementId, kind: 'engine', check: { ...c, resolveBy: 'id' } });
export const fixedAddresses = (f: SaveFile): Assessment[] => f.devices.flatMap(d => d.ifaces.filter(i => i.ip).map(i =>
  check(`ip-${d.id}-${i.name}`, 'config', { type: 'iface-ip', device: d.id, iface: i.name, cidr: i.ip! })));
export const pingPairs = (ids: string[]): Assessment[] => ids.flatMap(from => ids.filter(to => from !== to).map(to =>
  check(`ping-${from}-${to}`, 'traffic', { type: 'ping', from, toDevice: to, expect: 'success' })));

export function networkDraft(options: {
  id: string; group: 'C' | 'D' | 'E'; difficulty: NetworkDraft['difficulty']; title: string; situation: string; task: string;
  initial: SaveFile; solved: SaveFile; assessments: Assessment[]; explanation: string;
  alternatives: string[]; wrong: string[]; limits?: string[];
}): NetworkDraft {
  const o = options;
  return { id: `factory-${o.id}`, contentVersion: 1, status: 'draft', format: 'network', group: o.group,
    category: o.group === 'D' ? 'routing' : 'ipv4', difficulty: o.difficulty,
    student: { title: o.title, description: o.situation, initialTopology: o.initial,
      task: `${o.task} Prüfen Sie die geforderten Endgeräte gegenseitig per ICMP. Nutzen Sie Inspector oder unterstützte Terminalbefehle; kein bestimmter Befehl ist vorgeschrieben. Geräte, Kabel und nicht genannte Vorgaben bleiben erhalten.`,
      learningObjectives: [{ id: 'configure', text: o.group === 'D' ? 'Hin- und Rückweg einschließlich Gateway und Weiterleitung herstellen.' : 'IPv4-Adressierung und Subnetzgrenzen korrekt anwenden.' },
        { id: 'verify', text: 'Konfiguration und tatsächliche Ende-zu-Ende-Kommunikation getrennt prüfen.' }],
      requirements: [{ id: 'config', objectiveIds: ['configure'], text: o.task, evidence: 'final' },
        { id: 'traffic', objectiveIds: ['verify'], text: 'Alle angegebenen Endgeräte erreichen sich gegenseitig; Erfolg eines einzelnen Pings genügt nicht.', evidence: 'final' }] },
    review: { assessments: o.assessments, reference: { topology: o.solved, commands: [], explanation: o.explanation },
      alternatives: o.alternatives.map(description => ({ description, rationale: 'Gleichwertige Endkonfigurationen sind unabhängig vom Eingabeweg zulässig.' })),
      rejectionCases: o.wrong, commonMistakes: o.wrong.map(w => `Typischer Fehler: ${w}`),
      limitations: [...(o.limits ?? []), 'Interner Entwurf, nicht im Menü veröffentlicht. Aktive Prüfungen senden echte ICMP-Pakete in der isolierten Simulation.',
        'Die bestehenden Prüfer belegen Endzustand und Stichproben-Kommunikation, weder den Diagnoseweg noch die Unverändertheit aller Kabel, VLANs und zusätzlicher Konfigurationen. Vor Veröffentlichung ist dafür eine Topologie-Schutzregel oder manuelle Kontrolle erforderlich.'] } };
}
/** Authoring safety check for these single-address-space references, NOT a new public grader.
 * Duplicate addresses in isolated VLANs/VRFs would need a segment-aware policy in future content. */
export function referenceAddressIssues(f: SaveFile): string[] {
  const issues: string[] = [], seen = new Set<number>();
  for (const d of f.devices) for (const i of d.ifaces) if (i.ip) {
    try {
      const s = subnet(i.ip), ip = number(i.ip.split('/')[0]);
      if (ip <= s.start || ip >= s.end) issues.push(`${d.id}/${i.name}: keine Hostadresse`);
      if (seen.has(ip)) issues.push(`${d.id}/${i.name}: doppelte Adresse`);
      seen.add(ip);
    } catch { issues.push(`${d.id}/${i.name}: ungültiges IPv4`); }
  }
  return issues;
}
