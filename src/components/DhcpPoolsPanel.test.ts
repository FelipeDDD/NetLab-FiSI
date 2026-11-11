import { afterEach, expect, it, vi } from 'vitest';
import * as i18n from '../i18n';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
vi.mock('../store',()=>({useStore:()=>({})}));
import { DhcpPoolsPanel } from './DhcpPoolsPanel';
import { Network } from '../engine/network';
import { createDevice } from '../engine/factory';
import { IpDevice } from '../engine/ipdevice';
import { parseIp } from '../engine/ip';
afterEach(() => vi.restoreAllMocks());
it('renders independent compact switches, correct pool/lease data and unconfigured interfaces',()=>{
  const d=createDevice(new Network(),'router') as IpDevice;
  d.addIp('eth0',parseIp('192.168.1.1')!,24);
  d.dhcpPools.set('eth0',{enabled:true,rangeStart:parseIp('192.168.1.100')!,rangeEnd:parseIp('192.168.1.150')!,router:parseIp('192.168.1.1'),dns:null,leases:new Map([['02:00:00:00:00:55',parseIp('192.168.1.100')!]])});
  const html=renderToStaticMarkup(createElement(DhcpPoolsPanel,{device:d}));
  expect(html.match(/role="switch"/g)).toHaveLength(4);
  expect(html).toContain('aria-label="DHCP eth0" aria-checked="true"');
  expect(html).toContain('aria-label="DHCP eth1" aria-checked="false"');
  expect(html).toContain('192.168.1.1/24');expect(html).toContain('02:00:00:00:00:55');
  expect(html).toContain('Keine Leases in diesem Pool.');expect(html).toContain('Zuerst eine gültige IPv4-Adresse konfigurieren.');
  expect(html).not.toContain('DHCP ON');expect(html).not.toContain('serve leases on this device');
  expect(html).not.toMatch(/> IPv4<\/button>/);
  expect(html.match(/>DHCP konfigurieren<\/button>/g)).toHaveLength(4);
  expect(html).not.toContain('aria-label="IP-Adresse eth0"'); // IPv4 stays in the existing interface page.
});

it.each([
  ['de', 'Pool-Anfang', 'Keine Leases in diesem Pool.', 'Zuerst eine gültige IPv4-Adresse konfigurieren.'],
  ['en', 'Pool start', 'No leases in this pool.', 'Configure a valid IPv4 address first.'],
  ['pt-BR', 'Início do pool', 'Nenhum lease neste pool.', 'Configure primeiro um endereço IPv4 válido.'],
] as const)('localizes DHCP fields and local warnings in %s without changing pool data', (language, start, empty, needsIpv4) => {
  vi.spyOn(i18n, 'useTranslation').mockReturnValue({ language, t: (key, values) => i18n.translate(language, key, values) });
  const device = createDevice(new Network(), 'router') as IpDevice;
  device.addIp('eth0', parseIp('192.0.2.1')!, 24);
  const configuration = JSON.stringify(device.interfaces.map(i => i.ipv4));
  const html = renderToStaticMarkup(createElement(DhcpPoolsPanel, { device }));
  for (const value of [start, empty, needsIpv4, '192.0.2.1/24', 'DHCP eth0', 'eth0']) expect(html).toContain(value);
  expect(JSON.stringify(device.interfaces.map(i => i.ipv4))).toBe(configuration);
  expect(device.dhcpPools.size).toBe(0);
});
