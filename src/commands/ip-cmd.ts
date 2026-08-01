import type { IpDevice } from '../engine/ipdevice';
import { cidrToString, ipToString, parseCidr, parseIp } from '../engine/ip';

type Out = (s: string) => void;

const UNSUPPORTED_HINT =
  'Supported (phase 1): ip address [add|del], ip link [set], ip route [add|del], ip neigh\n' +
  'NetSim never fakes syntax it does not implement.\n';

// iproute2 accepts any unique prefix of an object name ("ip a", "ip ro").
function expandObject(word: string): string | null {
  for (const o of ['address', 'link', 'route', 'neighbour']) {
    if (o.startsWith(word) && word.length > 0) return o;
  }
  return null;
}

export function runIp(device: IpDevice, args: string[], out: Out): void {
  const obj = expandObject(args[0] ?? '');
  switch (obj) {
    case 'address':
      ipAddress(device, args.slice(1), out);
      return;
    case 'link':
      ipLink(device, args.slice(1), out);
      return;
    case 'route':
      ipRoute(device, args.slice(1), out);
      return;
    case 'neighbour':
      out(formatNeigh(device));
      return;
    default:
      out(`netsim: "ip ${args.join(' ')}" is not supported.\n${UNSUPPORTED_HINT}`);
  }
}

function ipAddress(device: IpDevice, a: string[], out: Out): void {
  const sub = a[0] ?? 'show';
  if (sub === 'show' || sub === 's') {
    out(formatAddresses(device));
    return;
  }
  if (sub === 'add' || sub === 'del' || sub === 'delete') {
    const cidr = parseCidr(a[1] ?? '');
    if (!cidr) {
      out(`Error: inet prefix is expected rather than "${a[1] ?? ''}".\n`);
      return;
    }
    if (a[2] !== 'dev' || !a[3]) {
      out('Error: Not enough information: "dev" argument is required.\n');
      return;
    }
    const err =
      sub === 'add'
        ? device.addIp(a[3], cidr.addr, cidr.prefix)
        : device.delIp(a[3], cidr.addr, cidr.prefix);
    if (err) out(err + '\n');
    return;
  }
  out(`netsim: "ip address ${a.join(' ')}" is not supported.\n${UNSUPPORTED_HINT}`);
}

function ipLink(device: IpDevice, a: string[], out: Out): void {
  const sub = a[0] ?? 'show';
  if (sub === 'show' || sub === 's') {
    out(formatAddresses(device, { linkOnly: true }));
    return;
  }
  if (sub === 'set') {
    let rest = a.slice(1);
    if (rest[0] === 'dev') rest = rest.slice(1);
    const iface = device.getInterface(rest[0] ?? '');
    if (!iface) {
      out(`Cannot find device "${rest[0] ?? ''}"\n`);
      return;
    }
    if (rest[1] === 'up') iface.up = true;
    else if (rest[1] === 'down') iface.up = false;
    else out(`netsim: "ip link set ${a.slice(1).join(' ')}" is not supported (use up|down).\n`);
    return;
  }
  out(`netsim: "ip link ${a.join(' ')}" is not supported.\n${UNSUPPORTED_HINT}`);
}

function parseRouteTarget(word: string): { addr: number; prefix: number } | null {
  if (word === 'default') return { addr: 0, prefix: 0 };
  const cidr = parseCidr(word);
  if (cidr) return cidr;
  const ip = parseIp(word);
  if (ip !== null) return { addr: ip, prefix: 32 };
  return null;
}

function ipRoute(device: IpDevice, a: string[], out: Out): void {
  const sub = a[0] ?? 'show';
  if (sub === 'show' || sub === 's') {
    out(formatRoutes(device));
    return;
  }
  if (sub === 'add' || sub === 'del' || sub === 'delete') {
    const target = parseRouteTarget(a[1] ?? '');
    if (!target) {
      out(`Error: inet prefix is expected rather than "${a[1] ?? ''}".\n`);
      return;
    }
    if (sub !== 'add') {
      const err = device.delRoute(target.addr, target.prefix);
      if (err) out(err + '\n');
      return;
    }
    let via: number | null = null;
    let dev: string | undefined;
    for (let i = 2; i < a.length; i += 2) {
      if (a[i] === 'via') {
        via = parseIp(a[i + 1] ?? '');
        if (via === null) {
          out(`Error: inet address is expected rather than "${a[i + 1] ?? ''}".\n`);
          return;
        }
      } else if (a[i] === 'dev') {
        dev = a[i + 1];
      } else {
        out(`Error: either "to" is duplicate, or "${a[i]}" is a garbage.\n`);
        return;
      }
    }
    const err = device.addRoute(target.addr, target.prefix, via, dev);
    if (err) out(err + '\n');
    return;
  }
  out(`netsim: "ip route ${a.join(' ')}" is not supported.\n${UNSUPPORTED_HINT}`);
}

export function formatAddresses(device: IpDevice, opts: { linkOnly?: boolean } = {}): string {
  let s = '';
  device.interfaces.forEach((i, idx) => {
    const flags = i.up ? 'BROADCAST,MULTICAST,UP,LOWER_UP' : 'BROADCAST,MULTICAST';
    const state = !i.up ? 'DOWN' : i.link ? 'UP' : 'DOWN';
    s += `${idx + 1}: ${i.name}: <${flags}> mtu 1500 state ${state}\n`;
    s += `    link/ether ${i.mac} brd ff:ff:ff:ff:ff:ff\n`;
    if (!opts.linkOnly && i.ip) {
      s += `    inet ${cidrToString(i.ip.addr, i.ip.prefix)} scope global ${i.name}\n`;
    }
  });
  return s;
}

export function formatRoutes(device: IpDevice): string {
  const rs = device.routes();
  const defaults = rs.filter((r) => r.prefix === 0);
  const rest = rs.filter((r) => r.prefix !== 0);
  let s = '';
  for (const r of [...defaults, ...rest]) {
    const dest = r.prefix === 0 ? 'default' : cidrToString(r.dest, r.prefix);
    if (r.kind === 'connected') {
      const iface = device.getInterface(r.ifaceName);
      const src = iface?.ip ? ` src ${ipToString(iface.ip.addr)}` : '';
      s += `${dest} dev ${r.ifaceName} proto kernel scope link${src}\n`;
    } else if (r.kind === 'rip' && r.via !== null) {
      s += `${dest} via ${ipToString(r.via)} dev ${r.ifaceName} proto rip metric ${r.metric ?? 1}\n`;
    } else if (r.via !== null) {
      s += `${dest} via ${ipToString(r.via)} dev ${r.ifaceName}\n`;
    } else {
      s += `${dest} dev ${r.ifaceName} scope link\n`;
    }
  }
  return s;
}

export function formatNeigh(device: IpDevice): string {
  let s = '';
  for (const [ip, e] of device.arpTable) {
    s += `${ipToString(ip)} dev ${e.ifaceName} lladdr ${e.mac} REACHABLE\n`;
  }
  return s;
}

export function formatArpClassic(device: IpDevice): string {
  let s = 'Address                  HWtype  HWaddress           Flags Mask            Iface\n';
  for (const [ip, e] of device.arpTable) {
    s += `${ipToString(ip).padEnd(25)}ether   ${e.mac.padEnd(20)}C                     ${e.ifaceName}\n`;
  }
  return s;
}
