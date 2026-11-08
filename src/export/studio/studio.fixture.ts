import { Network } from '../../engine/network';
import { createDevice } from '../../engine/factory';
import { IpDevice } from '../../engine/ipdevice';
import { parseCidr, parseIp } from '../../engine/ip';

export function studioFixture(count = 10) {
  const net = new Network(), kinds = ['host', 'switch', 'router', 'router', 'router', 'server', 'notebook', 'smartphone', 'firewall', 'ap'] as const;
  const devices = Array.from({ length: count }, (_, i) => createDevice(net, kinds[i % kinds.length], { id: `studio-${i}`, name: i === 2 ? 'Zentralrouter <R1> & Universität' : `Device ${i + 1}` }));
  const r1 = devices[2] as IpDevice;
  r1.getInterface('eth0')!.ip = parseCidr('192.168.10.1/24');
  r1.getInterface('eth1')!.ip = parseCidr('10.0.12.1/30');
  r1.getInterface('eth0')!.gateway = parseIp('192.168.10.254');
  r1.addRoute(parseIp('192.168.20.0')!, 24, parseIp('10.0.12.2'), 'eth1');
  net.connect(devices[0].id, devices[1].id);
  net.connect(devices[1].id, r1.id);
  net.connect(r1.id, devices[3].id);
  const nodes = devices.map((d, i) => ({ id: d.id, position: { x: i % 4 * 260, y: Math.floor(i / 4) * 240 }, data: { kind: d.kind } }));
  return { net, devices, r1, visual: { nodes } };
}
