import type { IpDevice } from '../engine/ipdevice';
import type { DhcpApp } from '../engine/types';
import type { ScheduledEvent } from '../engine/scheduler';
import { ipToString } from '../engine/ip';
import type { Running } from './shell';

const DISCOVER_TRIES = 3;
const STEP_TIMEOUT_MS = 2000;

export function runDhclient(
  device: IpDevice,
  args: string[],
  write: (s: string) => void,
  done: () => void,
): Running | null {
  const ifname = args.find((a) => !a.startsWith('-')) ?? 'eth0';
  const iface = device.getInterface(ifname);
  if (!iface) {
    write(`Cannot find device "${ifname}"\n`);
    done();
    return null;
  }

  const sched = device.network.scheduler;
  const xid = device.nextDhcpXid();
  let state: 'discover' | 'request' | 'done' = 'discover';
  let tries = 0;
  let timer: ScheduledEvent | null = null;

  const cleanup = () => {
    device.dhcpListeners.delete(onDhcp);
    if (timer) sched.cancel(timer);
    timer = null;
  };

  const fail = (msg: string) => {
    if (state === 'done') return;
    state = 'done';
    cleanup();
    write(msg);
    done();
  };

  const sendDiscover = () => {
    if (state !== 'discover') return;
    if (tries >= DISCOVER_TRIES) {
      fail('No DHCPOFFERS received.\nNo working leases in persistent database - sleeping.\n');
      return;
    }
    tries++;
    write(`DHCPDISCOVER on ${ifname} to 255.255.255.255 port 67 interval ${STEP_TIMEOUT_MS / 1000}\n`);
    device.sendDhcpClient(iface, { kind: 'dhcp', op: 'discover', xid, clientMac: iface.mac });
    timer = sched.schedule(STEP_TIMEOUT_MS, sendDiscover);
  };

  const onDhcp = (app: DhcpApp) => {
    if (state === 'done' || app.clientMac !== iface.mac || app.xid !== xid) return;
    if (state === 'discover' && app.op === 'offer' && app.yourIp !== undefined) {
      state = 'request';
      if (timer) sched.cancel(timer);
      write(`DHCPOFFER of ${ipToString(app.yourIp)} from ${ipToString(app.serverIp ?? 0)}\n`);
      write(`DHCPREQUEST for ${ipToString(app.yourIp)} on ${ifname} to 255.255.255.255 port 67\n`);
      device.sendDhcpClient(iface, {
        kind: 'dhcp',
        op: 'request',
        xid,
        clientMac: iface.mac,
        yourIp: app.yourIp,
      });
      timer = sched.schedule(STEP_TIMEOUT_MS, () =>
        fail('No DHCPACK received - giving up.\n'),
      );
      return;
    }
    if (state === 'request' && app.op === 'ack' && app.yourIp !== undefined) {
      state = 'done';
      cleanup();
      write(`DHCPACK of ${ipToString(app.yourIp)} from ${ipToString(app.serverIp ?? 0)}\n`);
      iface.ip = { addr: app.yourIp, prefix: app.prefix ?? 24 };
      if (app.router !== null && app.router !== undefined) {
        // dhclient replaces the default route with the offered gateway.
        device.staticRoutes = device.staticRoutes.filter((r) => !(r.dest === 0 && r.prefix === 0));
        device.addRoute(0, 0, app.router);
      }
      if (app.dns !== null && app.dns !== undefined) device.nameserver = app.dns;
      write(`bound to ${ipToString(app.yourIp)} -- renewal in 43200 seconds.\n`);
      done();
    }
  };

  device.dhcpListeners.add(onDhcp);
  sendDiscover();
  return {
    cancel: () => {
      if (state === 'done') return;
      state = 'done';
      cleanup();
      done();
    },
  };
}
