import { expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Network } from '../engine/network';
import { createDevice } from '../engine/factory';
import { sim } from '../sim';
import { emptyIpv4, parseStaticIpv4 } from '../engine/ipv4Config';
import { InterfaceIpv4Panel } from './InterfaceIpv4Panel';

vi.mock('../store', () => ({ useStore: (select: (s: object) => unknown) => select({ nodes: [], uiPulse: 0 }) }));

it('renders manual fields for unconfigured/static interfaces and a DHCP checkbox with read-only assigned values', () => {
  sim.net = new Network(); const d = createDevice(sim.net, 'host'), iface = d.interfaces[0];
  const render = () => renderToStaticMarkup(createElement(InterfaceIpv4Panel, { deviceId: d.id, ifaceName: 'eth0' }));
  expect(render()).toContain('IP-Adresse automatisch beziehen (DHCP)');
  expect(render()).toContain('type="checkbox"'); expect(render()).not.toContain('checked=""');
  expect(render()).toContain('aria-label="IP-Adresse eth0"'); expect(render()).not.toContain('<select');
  expect(render()).not.toContain('Übernehmen');
  iface.configureIpv4(parseStaticIpv4('10.0.0.5', '24', '10.0.0.1', '10.0.0.2')!);
  expect(render()).toContain('value="255.255.255.0"'); expect(render()).toContain('aria-label="DNS-Server eth0"');
  expect(render()).toContain('value="10.0.0.5/24"');
  expect(render()).not.toContain('Übernehmen');
  iface.configureIpv4({ ...iface.ipv4, mode: 'dhcp' });
  expect(render()).toContain('Kein aktives Lease'); expect(render()).toContain('gespeicherte Werte');
  expect(render()).not.toContain('class="iface-ip"'); expect(render()).toContain('checked=""'); expect(render()).toContain('DHCP erneuern');
  iface.dhcpLease = { serverIp: 1, address: iface.ip!.addr };
  expect(render()).toContain('Lease aktiv');
  iface.configureIpv4(emptyIpv4('dhcp')); iface.cancelDhcp = () => {};
  expect(render()).toContain('DHCP-Anfrage läuft'); expect(render()).toContain('disabled=""');
});
