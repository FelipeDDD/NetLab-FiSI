import type { ProjectDocument } from '../projects/types';
import { prepareTopologyDocument } from '../persistence/topologyDocument';
import { disposeNetwork } from '../engine/networkLifecycle';
import { serializeNetwork } from '../engine/serialize';
import { IpDevice } from '../engine/ipdevice';
import { networkOf, parseIp } from '../engine/ip';
import type { Network } from '../engine/network';

export const LPM_IDS = { a: 'tutorial-06-a', b: 'tutorial-06-b', r1: 'tutorial-06-r1', r2: 'tutorial-06-r2', r3: 'tutorial-06-r3', r4: 'tutorial-06-r4', r5: 'tutorial-06-r5' } as const;
export const LPM_TARGET = '192.168.80.130';
export const LPM_SHORT = [LPM_IDS.a, LPM_IDS.r1, LPM_IDS.r5, LPM_IDS.b];
export const LPM_LONG = [LPM_IDS.a, LPM_IDS.r1, LPM_IDS.r2, LPM_IDS.r3, LPM_IDS.r4, LPM_IDS.r5, LPM_IDS.b];
const ip = (text: string) => parseIp(text)!;
const I = LPM_IDS;

/** Five routers on the detour, two on the short path. All links are live.
 * The return deliberately uses R5→R1, independently of the request's path. */
export function lpmDocument(): ProjectDocument {
  const document: ProjectDocument = { schemaVersion: 1, topology: { app: 'netsim', version: 1, devices: [], links: [] } };
  const t = document.topology;
  for (const [id, name, x, y, addresses] of [
    [I.r1, 'R1', 360, 540, ['192.168.60.1/24', '10.6.15.1/30', '10.6.12.1/30']],
    [I.r2, 'R2', 480, 180, ['10.6.12.2/30', '10.6.23.1/30']],
    [I.r3, 'R3', 900, 100, ['10.6.23.2/30', '10.6.34.1/30']],
    [I.r4, 'R4', 1320, 180, ['10.6.34.2/30', '10.6.45.1/30']],
    [I.r5, 'R5', 1440, 540, ['192.168.80.1/24', '10.6.15.2/30', '10.6.45.2/30']],
  ] as const) t.devices.push({ id, name, x, y, kind: 'router', os: 'linux', forwarding: true, routes: [], ifaces: addresses.map((address, index) => ({ name: `eth${index}`, up: true, ip: address, ipv4Mode: 'static' })) });
  for (const [id, name, address, gateway, x] of [[I.a, 'PC A', '192.168.60.10/24', '192.168.60.1', 80], [I.b, 'PC B', LPM_TARGET + '/24', '192.168.80.1', 1760]] as const)
    t.devices.push({ id, name, x, y: 540, kind: 'host', os: 'linux', forwarding: false, routes: [], ifaces: [{ name: 'eth0', up: true, ip: address, gateway, ipv4Mode: 'static' }] });
  for (const [a, ap, b, bp] of [[I.a, 0, I.r1, 0], [I.r1, 1, I.r5, 1], [I.r1, 2, I.r2, 0], [I.r2, 1, I.r3, 0], [I.r3, 1, I.r4, 0], [I.r4, 1, I.r5, 2], [I.r5, 0, I.b, 0]] as const)
    t.links.push({ id: `lpm-${a}-${b}`, a: [a, `eth${ap}`], b: [b, `eth${bp}`], latency: 40 });
  for (const [id, dest, via, dev] of [
    [I.r1, '192.168.80.0/24', '10.6.15.2', 'eth1'], [I.r1, '192.168.80.128/25', '10.6.12.2', 'eth2'],
    [I.r2, '192.168.80.0/24', '10.6.23.2', 'eth1'], [I.r3, '192.168.80.0/24', '10.6.34.2', 'eth1'], [I.r4, '192.168.80.0/24', '10.6.45.2', 'eth1'],
    [I.r2, '192.168.60.0/24', '10.6.12.1', 'eth0'], [I.r3, '192.168.60.0/24', '10.6.23.1', 'eth0'], [I.r4, '192.168.60.0/24', '10.6.34.1', 'eth0'],
    [I.r5, '192.168.60.0/24', '10.6.15.1', 'eth1'],
  ] as const) t.devices.find(d => d.id === id)!.routes.push({ dest, via, dev });
  // Persist identities at creation, so reload and restart never invent new MACs.
  const prepared = prepareTopologyDocument(t);
  try { return { schemaVersion: 1, topology: serializeNetwork(prepared.network, Object.fromEntries(t.devices.map(d => [d.id, { x: d.x, y: d.y }]))) }; }
  finally { disposeNetwork(prepared.network); }
}

/** Configuration only, no simulation caches or presentation positions. */
export function lpmSignature(net: Network) {
  const topology = serializeNetwork(net, {});
  topology.devices.sort((a, b) => a.id.localeCompare(b.id)); topology.links.sort((a, b) => a.id.localeCompare(b.id));
  return JSON.stringify(topology);
}
export function lpmConditions(net: Network) {
  const router = net.devices.get(I.r1), target = ip(LPM_TARGET);
  const routes = router instanceof IpDevice ? router.routes() : [];
  const matches = routes.filter(r => networkOf(target, r.prefix) === r.dest);
  const directPort = router?.getInterface('eth1');
  const original = !!directPort?.up && !!directPort.link?.operational && routes.some(r => r.kind === 'static' && r.dest === ip('192.168.80.0') && r.prefix === 24 && r.via === ip('10.6.15.2') && r.ifaceName === 'eth1');
  // Use the engine's actual lookup. This does not implement another LPM algorithm.
  const selected = router instanceof IpDevice ? router.lookupRoute(target) : null;
  const short = original && selected?.kind === 'static' && selected.prefix === 24 && selected.via === ip('10.6.15.2') && selected.ifaceName === 'eth1';
  const long = original && selected?.kind === 'static' && selected.prefix > 24 && selected.via === ip('10.6.12.2') && selected.ifaceName === 'eth2';
  const initial = long && matches.some(r => r.kind === 'static' && r.prefix === 25 && r.dest === ip('192.168.80.128') && r.via === ip('10.6.12.2') && r.ifaceName === 'eth2') && selected?.prefix === 25;
  const removed = !routes.some(r => r.prefix === 25 && r.dest === ip('192.168.80.128'));
  return { original, short, long, initial, removed, matches, selected };
}
