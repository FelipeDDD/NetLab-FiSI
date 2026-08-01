import type { IpDevice } from '../engine/ipdevice';
import { ipToString } from '../engine/ip';
import { formatArpClassic, runIp } from './ip-cmd';
import { runPing } from './ping';
import { runTraceroute } from './traceroute';
import { runNft } from './nft';
import { runIptables } from './iptables';
import { runNc } from './nc';
import { runDig } from './dig';
import { runCurl } from './curl';
import { runDhclient } from './dhclient';

export interface TermIO {
  write(s: string): void;
}

export interface Running {
  cancel(): void;
}

const HELP = `NetSim commands (real Linux syntax, curated subset):
  ip address [show | add <cidr> dev <if> | del <cidr> dev <if>]
  ip link    [show | set <if> up|down]
  ip route   [show | add <cidr>|default via <gw> [dev <if>] | del <cidr>|default]
  ip neigh / arp           neighbour (ARP) cache
  ping [-c N] <host>       ICMP echo (Ctrl-C to stop)
  traceroute [-m max] <host>  trace the route packets take
  dhclient [<if>]          acquire an address over DHCP
  dig [@server] <name> [+short]   DNS lookup
  curl [-v] http://<host>[:port][/path]   fetch a web page
  nft <...>                nftables firewall (try: nft list ruleset)
  iptables <...>           iptables front-end onto the same ruleset
  nc [-u] [-z] [-w s] <host> <port> test a port; nc -l [-u] <port> to listen
  conntrack -L             connection tracking table
  ss -tlnu                 listening sockets
  sysctl [-w] net.ipv4.ip_forward[=0|1]
  hostname | help | clear
Anything else errors loudly — NetSim never fakes syntax it doesn't implement.
`;

function runSysctl(device: IpDevice, args: string[], write: (s: string) => void): void {
  const KEY = 'net.ipv4.ip_forward';
  let rest = args;
  let writeMode = false;
  if (rest[0] === '-w') {
    writeMode = true;
    rest = rest.slice(1);
  }
  const arg = rest[0] ?? '';
  if (writeMode || arg.includes('=')) {
    const [key, value] = arg.split('=');
    if (key !== KEY || (value !== '0' && value !== '1')) {
      write(`sysctl: netsim supports only: sysctl -w ${KEY}=0|1\n`);
      return;
    }
    device.forwarding = value === '1';
    write(`${KEY} = ${value}\n`);
    return;
  }
  if (arg === KEY || arg === '') {
    write(`${KEY} = ${device.forwarding ? 1 : 0}\n`);
    return;
  }
  write(`sysctl: cannot stat /proc/sys/${arg.replace(/\./g, '/')}: No such file or directory\n`);
}

export function formatConntrack(device: IpDevice): string {
  const entries = device.ct.list(device.network.now);
  let s = '';
  for (const e of entries) {
    const o = e.orig;
    const state = e.state === 'established' ? 'ESTABLISHED' : 'NEW';
    const natNote =
      e.trans.srcIp !== o.srcIp || e.trans.dstIp !== o.dstIp || e.trans.srcPort !== o.srcPort || e.trans.dstPort !== o.dstPort
        ? ` [nat: ${ipToString(e.trans.srcIp)}:${e.trans.srcPort} > ${ipToString(e.trans.dstIp)}:${e.trans.dstPort}]`
        : '';
    s += `${o.proto.padEnd(8)}src=${ipToString(o.srcIp)} dst=${ipToString(o.dstIp)} sport=${o.srcPort} dport=${o.dstPort} state=${state}${natNote}\n`;
  }
  s += `conntrack: ${entries.length} flow entries have been shown.\n`;
  return s;
}

export function formatSockets(device: IpDevice): string {
  const s = 'Netid  State   Local Address:Port   Process\n';
  const tcp = new Map<number, string>();
  const udp = new Map<number, string>();
  for (const p of device.services.tcp) tcp.set(p, '');
  for (const p of device.ncTcp.keys()) tcp.set(p, 'nc');
  if (device.httpServer?.enabled) tcp.set(device.httpServer.port, 'httpd');
  for (const p of device.services.udp) udp.set(p, '');
  for (const p of device.ncUdp.keys()) udp.set(p, 'nc');
  if (device.dnsServer?.enabled) udp.set(53, 'dnsmasq');
  if (device.dhcpServer?.enabled) udp.set(67, 'dnsmasq');
  const rows: string[] = [];
  for (const [p, proc] of [...tcp.entries()].sort((a, b) => a[0] - b[0])) {
    rows.push(`tcp    LISTEN  0.0.0.0:${String(p).padEnd(14)}${proc}\n`);
  }
  for (const [p, proc] of [...udp.entries()].sort((a, b) => a[0] - b[0])) {
    rows.push(`udp    UNCONN  0.0.0.0:${String(p).padEnd(14)}${proc}\n`);
  }
  return s + rows.join('');
}

export class Shell {
  constructor(public device: IpDevice) {}

  // Runs one command line. `done` is always called exactly once — immediately
  // for synchronous commands, later for ping/traceroute/nc. Returns a handle
  // for Ctrl-C when the command is still running, else null.
  exec(line: string, io: TermIO, done: () => void): Running | null {
    const trimmed = line.trim();
    const argv = trimmed.split(/\s+/).filter(Boolean);
    if (argv.length === 0) {
      done();
      return null;
    }
    const [cmd, ...args] = argv;
    const rawRest = trimmed.slice(cmd.length).trim();
    switch (cmd) {
      case 'help':
        io.write(HELP);
        break;
      case 'hostname':
        io.write(this.device.name + '\n');
        break;
      case 'ip':
        runIp(this.device, args, io.write.bind(io));
        break;
      case 'arp':
        io.write(formatArpClassic(this.device));
        break;
      case 'sysctl':
        runSysctl(this.device, args, io.write.bind(io));
        break;
      case 'nft':
        runNft(this.device, rawRest, io.write.bind(io));
        break;
      case 'iptables':
        runIptables(this.device, args, io.write.bind(io));
        break;
      case 'conntrack':
        if (args[0] === '-L' || args.length === 0) io.write(formatConntrack(this.device));
        else io.write('conntrack: netsim supports only: conntrack -L\n');
        break;
      case 'ss':
        io.write(formatSockets(this.device));
        break;
      case 'ping':
        return runPing(this.device, args, io.write.bind(io), done);
      case 'traceroute':
        return runTraceroute(this.device, args, io.write.bind(io), done);
      case 'nc':
        return runNc(this.device, args, io.write.bind(io), done);
      case 'dig':
        return runDig(this.device, args, io.write.bind(io), done);
      case 'curl':
        return runCurl(this.device, args, io.write.bind(io), done);
      case 'dhclient':
        return runDhclient(this.device, args, io.write.bind(io), done);
      default:
        io.write(`${cmd}: command not found (try 'help')\n`);
        break;
    }
    done();
    return null;
  }
}
