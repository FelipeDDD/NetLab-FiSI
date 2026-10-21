import type { IpDevice } from '../engine/ipdevice';
import type { DhcpApp } from '../engine/types';
import type { ScheduledEvent } from '../engine/scheduler';
import { ipToString, maskOf } from '../engine/ip';
import type { Running } from './shell';
import { emptyIpv4 } from '../engine/ipv4Config';

export function releaseDhcp(device: IpDevice, ifname: string): void {
  const iface = device.getInterface(ifname);
  if (!iface || iface.ipv4Mode !== 'dhcp') return;
  const lease = iface.dhcpLease;
  if (lease) device.sendDhcpClient(iface, { kind: 'dhcp', op: 'release', xid: device.nextDhcpXid(),
    clientMac: iface.mac, yourIp: lease.address, serverIp: lease.serverIp });
  iface.configureIpv4(emptyIpv4('dhcp'));
  device.network.onClientConfiguration?.();
}

const DISCOVER_TRIES = 3;
const STEP_TIMEOUT_MS = 2000;

export function runDhclient(
  device: IpDevice,
  args: string[],
  write: (s: string) => void,
  done: () => void,
  windows = false,
): Running | null {
  const ifname = args.find((a) => !a.startsWith('-')) ?? 'eth0';
  const iface = device.getInterface(ifname);
  if (!iface) {
    write(`Cannot find device "${ifname}"\n`);
    done();
    return null;
  }
  if (windows && iface.ipv4Mode !== 'dhcp') {
    write(`No operation can be performed on ${ifname}: DHCP is not enabled.\n`);
    done(); return null;
  }
  iface.cancelDhcp?.();
  if (iface.ipv4Mode !== 'dhcp') {
    iface.configureIpv4(emptyIpv4('dhcp'));
    device.network.onClientConfiguration?.();
  }

  const sched = device.network.scheduler;
  const xid = device.nextDhcpXid();
  let state: 'discover' | 'request' | 'done' = 'discover';
  let tries = 0;
  let timer: ScheduledEvent | null = null;

  const cleanup = () => {
    if (iface.cancelDhcp === cancel) iface.cancelDhcp = null;
    device.dhcpListeners.delete(onDhcp);
    if (timer) sched.cancel(timer);
    timer = null;
  };
  const cancel = () => {
    if (state === 'done') return;
    state = 'done'; cleanup(); if (!device.disposed) done();
  };

  const fail = (msg: string) => {
    if (state === 'done') return;
    state = 'done';
    cleanup();
    write(windows ? `An error occurred while renewing interface ${ifname}: unable to contact your DHCP server. Request has timed out.\n` : msg);
    done();
  };

  const sendDiscover = () => {
    if (state !== 'discover') return;
    if (tries >= DISCOVER_TRIES) {
      fail('No DHCPOFFERS received.\nNo working leases in persistent database - sleeping.\n');
      return;
    }
    tries++;
    if (!windows) write(`DHCPDISCOVER on ${ifname} to 255.255.255.255 port 67 interval ${STEP_TIMEOUT_MS / 1000}\n`);
    device.sendDhcpClient(iface, { kind: 'dhcp', op: 'discover', xid, clientMac: iface.mac });
    timer = device.schedule(STEP_TIMEOUT_MS, sendDiscover);
  };

  const onDhcp = (app: DhcpApp) => {
    if (state === 'done' || app.clientMac !== iface.mac || app.xid !== xid) return;
    if (state === 'discover' && app.op === 'offer' && app.yourIp !== undefined) {
      state = 'request';
      if (timer) sched.cancel(timer);
      if (!windows) {
        write(`DHCPOFFER of ${ipToString(app.yourIp)} from ${ipToString(app.serverIp ?? 0)}\n`);
        write(`DHCPREQUEST for ${ipToString(app.yourIp)} on ${ifname} to 255.255.255.255 port 67\n`);
      }
      device.sendDhcpClient(iface, {
        kind: 'dhcp',
        op: 'request',
        xid,
        clientMac: iface.mac,
        yourIp: app.yourIp,
      });
      timer = device.schedule(STEP_TIMEOUT_MS, () =>
        fail('No DHCPACK received - giving up.\n'),
      );
      return;
    }
    if (state === 'request' && app.op === 'ack' && app.yourIp !== undefined) {
      state = 'done';
      cleanup();
      if (!windows) write(`DHCPACK of ${ipToString(app.yourIp)} from ${ipToString(app.serverIp ?? 0)}\n`);
      iface.configureIpv4({ mode: 'dhcp', ip: { addr: app.yourIp, prefix: app.prefix ?? 24 },
        gateway: app.router ?? null, dns: app.dns ?? null });
      if (app.serverIp !== undefined) iface.dhcpLease = { serverIp: app.serverIp, address: app.yourIp };
      device.network.onClientConfiguration?.();
      write(windows ? `Ethernet adapter ${ifname}:\n   IPv4 Address: ${ipToString(app.yourIp)}\n   Subnet Mask: ${ipToString(maskOf(app.prefix ?? 24))}\n` : `bound to ${ipToString(app.yourIp)} -- renewal in 43200 seconds.\n`);
      done();
    }
  };

  device.dhcpListeners.add(onDhcp);
  iface.cancelDhcp = cancel;
  sendDiscover();
  return { cancel };
}
