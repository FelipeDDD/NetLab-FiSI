import { expect, it } from 'vitest';
import { simulatedInternet } from './simulatedInternet';
import { restoreNetwork, serializeNetwork } from '../engine/serialize';
import { disposeNetwork } from '../engine/networkLifecycle';
import { IpDevice } from '../engine/ipdevice';
import { requestPage, simulatedUrl, type BrowserResult } from '../browser/request';
import { resolveHost } from '../commands/resolve';

it.each(['example.test', 'www.example.test'])('delivers %s to both browsers through NAT and the modem after JSON restoration', hostname => {
  let net = restoreNetwork(structuredClone(simulatedInternet));
  try {
    const saved = serializeNetwork(net, Object.fromEntries(simulatedInternet.devices.map(d => [d.id, { x: d.x, y: d.y }])));
    disposeNetwork(net); net = restoreNetwork(JSON.parse(JSON.stringify(saved)));
    expect(serializeNetwork(net, Object.fromEntries(saved.devices.map(d => [d.id, { x: d.x, y: d.y }])))).toEqual(saved);
    const results: BrowserResult[] = [], protocols = new Set<string>(), modemDirections = new Set<string>();
    net.onWireTransfer = (t, c) => { protocols.add(c.frame.payload.kind); if (t.fromDeviceId === 'Modem') modemDirections.add(t.toDeviceId); };
    for (const id of ['PC1', 'PC2']) requestPage(net.devices.get(id) as IpDevice, simulatedUrl(`http://${hostname}`)!, r => results.push(r));
    net.scheduler.advanceTo(15000);
    expect(results).toHaveLength(2);
    for (const r of results) expect(r).toMatchObject({ kind: 'http', status: 200, body: simulatedInternet.devices.find(d => d.id === 'Web Server')!.httpServer!.body });
    expect(protocols).toEqual(new Set(['arp', 'ipv4'])); expect(modemDirections).toEqual(new Set(['Router', 'Provider']));
    expect((net.devices.get('Provider') as IpDevice).staticRoutes).toEqual([]);
  } finally { disposeNetwork(net); }
});

it.each(['gateway absent', 'gateway incorrect', 'DNS disabled', 'DNS incorrect', 'NAT disabled', 'modem disconnected', 'firewall', 'HTTP disabled'])('fails through real networking when %s', failure => {
  const file = structuredClone(simulatedInternet), pc = file.devices.find(d => d.id === 'PC1')!, router = file.devices.find(d => d.id === 'Router')!;
  if (failure === 'gateway absent') delete pc.ifaces[0].gateway;
  if (failure === 'gateway incorrect') pc.ifaces[0].gateway = '192.168.10.99';
  if (failure === 'DNS disabled') file.devices.find(d => d.id === 'DNS Server')!.dnsServer!.enabled = false;
  if (failure === 'DNS incorrect') pc.nameserver = '198.51.100.99';
  if (failure === 'NAT disabled') router.firewall!.nat.postrouting!.rules = [];
  if (failure === 'modem disconnected') file.links = file.links.filter(l => l.a[0] !== 'Modem');
  if (failure === 'firewall') { router.firewall!.tables.filter = true; router.firewall!.filter.forward = { name: 'forward', policy: 'drop', rules: [] }; }
  if (failure === 'HTTP disabled') file.devices.find(d => d.id === 'Web Server')!.httpServer!.enabled = false;
  const net = restoreNetwork(file);
  try {
    let named: BrowserResult | undefined, direct: BrowserResult | undefined;
    requestPage(net.devices.get('PC1') as IpDevice, simulatedUrl('http://www.example.test')!, r => { named = r; });
    requestPage(net.devices.get('PC1') as IpDevice, simulatedUrl('http://198.51.100.10')!, r => { direct = r; });
    net.scheduler.advanceTo(30000);
    expect(named).toMatchObject({ kind: 'error' });
    expect(direct).toMatchObject({ kind: failure.startsWith('DNS') ? 'http' : 'error' });
  } finally { disposeNetwork(net); }
});

it('isolates HTTP service switches and applies HTTP off/on to fresh requests while DNS keeps resolving', async () => {
  const net = restoreNetwork(structuredClone(simulatedInternet));
  try {
    const pc = net.devices.get('PC1') as IpDevice, dns = net.devices.get('DNS Server') as IpDevice, web = net.devices.get('Web Server') as IpDevice;
    const fetch = (url: string) => new Promise<BrowserResult>(resolve => requestPage(pc, simulatedUrl(url)!, resolve));
    const name = (host: string) => new Promise(resolve => resolveHost(pc, host, resolve));
    const settle = async <T>(promise: Promise<T>): Promise<T> => { for (let i = 0; i < 12; i++) { net.scheduler.advanceTo(net.now + 5000); await Promise.resolve(); } return promise; };
    dns.httpServer = { enabled: false, port: 80, body: '' };
    expect(await settle(fetch('http://www.example.test'))).toMatchObject({ kind: 'http', status: 200 });
    web.httpServer!.enabled = false;
    expect(await settle(fetch('http://www.example.test'))).toMatchObject({ kind: 'error', code: 'refused' });
    expect(await settle(fetch('http://198.51.100.10'))).toMatchObject({ kind: 'error', code: 'refused' });
    expect(await settle(name('www.example.test'))).toMatchObject({ ip: expect.any(Number) });
    web.httpServer!.enabled = true;
    expect(await settle(fetch('http://www.example.test'))).toMatchObject({ kind: 'http', status: 200 });
    expect(await settle(fetch('http://198.51.100.10'))).toMatchObject({ kind: 'http', status: 200 });
  } finally { disposeNetwork(net); }
});
