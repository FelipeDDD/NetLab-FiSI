import type { IpDevice } from '../engine/ipdevice';
import { ipToString, maskOf } from '../engine/ip';
import type { Running, TermIO } from './shell';
import { runPing } from './ping';
import { runTraceroute } from './traceroute';
import { releaseDhcp, runDhclient } from './dhclient';

const HELP = `NetLab Windows CMD (simulated command subset):
  ipconfig [/all | /renew | /release] [adapter]   display / renew / release IPv4
  arp -a                    display the ARP cache
  route print               display the IPv4 routing table
  ping [-n count | -t] host  four requests by default; -t until Ctrl+C
  tracert host              trace the route using ICMP
  nslookup host             query the configured DNS server (A records)
  hostname                  display the host name
  cls                       clear the screen
  help                      show these commands
No PowerShell, netsh, scripts, pipes or file system are simulated.
ICMP payload sizes, lease expiration and Windows interface indices are not simulated.
`;

export function formatIpconfig(device: IpDevice, all = false): string {
  let text = '\nWindows IP Configuration\n';
  if (all) text += `\n   Host Name . . . . . . . . . . . . : ${device.name}\n`;
  for (const iface of device.interfaces) {
    text += `\nEthernet adapter ${iface.name}:\n\n`;
    if (!iface.up || !iface.link) text += '   Media State . . . . . . . . . . . : Media disconnected\n';
    if (all) text += `   Physical Address. . . . . . . . . : ${iface.mac.replace(/:/g, '-').toUpperCase()}\n`;
    if (all) text += `   DHCP Enabled. . . . . . . . . . : ${iface.ipv4Mode === 'dhcp' ? 'Yes' : 'No'}\n`;
    if (iface.ip) {
      text += `   IPv4 Address. . . . . . . . . . . : ${ipToString(iface.ip.addr)}\n`;
      text += `   Subnet Mask . . . . . . . . . . . : ${ipToString(maskOf(iface.ip.prefix))}\n`;
    }
    const gateways = device.routes().filter((r) => r.prefix === 0 && r.ifaceName === iface.name && r.via !== null);
    text += `   Default Gateway . . . . . . . . . : ${gateways.map((r) => ipToString(r.via!)).join(', ')}\n`;
    const dns = device.manualNameserver ?? iface.dns;
    if (all && dns !== null) text += `   DNS Servers . . . . . . . . . . . : ${ipToString(dns)}\n`;
  }
  return text;
}

function formatArp(device: IpDevice): string {
  if (!device.arpTable.size) return 'No ARP Entries Found.\n';
  let text = '';
  for (const iface of device.interfaces) {
    const entries = [...device.arpTable].filter(([, e]) => e.ifaceName === iface.name);
    if (!entries.length) continue;
    text += `\nInterface: ${iface.ip ? ipToString(iface.ip.addr) : iface.name} (${iface.name})\n  Internet Address      Physical Address      Type\n`;
    for (const [ip, e] of entries) text += `  ${ipToString(ip).padEnd(22)}${e.mac.replace(/:/g, '-').padEnd(22)}dynamic\n`;
  }
  return text;
}

function formatRoutePrint(device: IpDevice): string {
  let text = 'IPv4 Route Table\nActive Routes:\nNetwork Destination    Netmask                Gateway                Interface\n';
  for (const r of device.routes()) {
    const iface = device.getInterface(r.ifaceName);
    text += `${ipToString(r.dest).padEnd(23)}${ipToString(maskOf(r.prefix)).padEnd(23)}${(r.via === null ? 'On-link' : ipToString(r.via)).padEnd(23)}${iface?.ip ? ipToString(iface.ip.addr) : r.ifaceName}\n`;
  }
  return text;
}

// Windows parsing and formatting. Protocols still run through the same IpDevice.
export function runWindows(device: IpDevice, argv: string[], io: TermIO, done: () => void): Running | null {
  const [command, ...args] = argv, cmd = command.toLowerCase();
  const write = io.write.bind(io);
  const options = args.map((a) => a.toLowerCase());
  switch (cmd) {
    case 'ping': return runPing(device, args, write, done, true);
    case 'tracert':
      if (args.length === 1 && !/^[/-]/.test(args[0])) return runTraceroute(device, args, write, done, true);
      write('Usage: tracert <host>\n'); break;
    case 'ipconfig':
      if (!args.length || (args.length === 1 && options[0] === '/all')) write(formatIpconfig(device, options[0] === '/all'));
      else if (args.length <= 2 && (options[0] === '/renew' || options[0] === '/release')) {
        write('\nWindows IP Configuration\n');
        const adapters = device.interfaces.filter((i) => (!args[1] || i.name.toLowerCase() === options[1]) && i.ipv4Mode === 'dhcp');
        if (!adapters.length) { write('No operation can be performed: DHCP is not enabled on the requested adapter(s).\n'); break; }
        if (options[0] === '/release') {
          for (const i of adapters) releaseDhcp(device, i.name);
          write(formatIpconfig(device)); break;
        }
        let remaining = adapters.length;
        const running = adapters.map((i) => runDhclient(device, [i.name], write, () => { if (--remaining === 0) done(); }, true));
        return { needsScheduler: running.some(r => r?.needsScheduler), cancel: () => running.forEach((r) => r?.cancel()) };
      } else write('Usage: ipconfig [/all | /renew | /release] [adapter]\n');
      break;
    case 'arp':
      write(args.length === 1 && options[0] === '-a' ? formatArp(device) : 'Usage: arp -a\n'); break;
    case 'route':
      write(args.length === 1 && options[0] === 'print' ? formatRoutePrint(device) : 'Usage: route print\n'); break;
    case 'hostname': write(!args.length ? device.name + '\n' : 'Usage: hostname\n'); break;
    case 'cls': write(!args.length ? '\x1b[2J\x1b[H' : 'Usage: cls\n'); break;
    case 'help': write(!args.length ? HELP : 'Usage: help\n'); break;
    case 'nslookup': {
      if (args.length !== 1 || /^[/-]/.test(args[0])) { write('Usage: nslookup <host>\n'); break; }
      const ns = device.nameserver;
      if (ns === null) { write('*** No DNS server configured.\n'); break; }
      const address = ipToString(ns), name = args[0];
      // No reverse DNS is simulated, so only display the known server address.
      write(`Server:  ${address}\nAddress: ${address}\n\n`);
      let finished = false;
      device.resolveDns(name, ns, (result) => {
        if (finished) return;
        finished = true;
        if (typeof result === 'number') write(`Name:    ${name}\nAddress: ${ipToString(result)}\n`);
        else if (result === null) write(`*** ${address} can't find ${name}: Non-existent domain\n`);
        else if (result === 'refused') write(`*** Query to ${address} refused.\n`);
        else write(`DNS request timed out.\n*** Request to ${address} timed-out\n`);
        done();
      });
      return { needsScheduler: true, cancel() { if (!finished) { finished = true; done(); } } };
    }
    default: write(`'${command}' is not recognized as an internal or external command,\noperable program or batch file.\n`);
  }
  done();
  return null;
}
