import type { IpDevice } from '../engine/ipdevice';
import { formatArpClassic, runIp } from './ip-cmd';
import { runPing } from './ping';
import { runTraceroute } from './traceroute';

export interface TermIO {
  write(s: string): void;
}

export interface Running {
  cancel(): void;
}

const HELP = `NetSim phase-1 commands (real Linux syntax, curated subset):
  ip address [show | add <cidr> dev <if> | del <cidr> dev <if>]
  ip link    [show | set <if> up|down]
  ip route   [show | add <cidr>|default via <gw> [dev <if>] | del <cidr>|default]
  ip neigh                 show the neighbour (ARP) cache
  arp                      classic ARP table view
  ping [-c N] <ip>         ICMP echo (Ctrl-C to stop)
  traceroute [-m max] <ip> trace the route packets take
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

export class Shell {
  constructor(public device: IpDevice) {}

  // Runs one command line. `done` is always called exactly once — immediately
  // for synchronous commands, later for ping/traceroute. Returns a handle for
  // Ctrl-C when the command is still running, else null.
  exec(line: string, io: TermIO, done: () => void): Running | null {
    const argv = line.trim().split(/\s+/).filter(Boolean);
    if (argv.length === 0) {
      done();
      return null;
    }
    const [cmd, ...args] = argv;
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
      case 'ping':
        return runPing(this.device, args, io.write.bind(io), done);
      case 'traceroute':
        return runTraceroute(this.device, args, io.write.bind(io), done);
      default:
        io.write(`${cmd}: command not found (try 'help')\n`);
        break;
    }
    done();
    return null;
  }
}
