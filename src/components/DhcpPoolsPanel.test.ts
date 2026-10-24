import { expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
vi.mock('../store',()=>({useStore:()=>({})}));
import { DhcpPoolsPanel } from './DhcpPoolsPanel';
import { Network } from '../engine/network';
import { createDevice } from '../engine/factory';
import { IpDevice } from '../engine/ipdevice';
import { parseIp } from '../engine/ip';
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
