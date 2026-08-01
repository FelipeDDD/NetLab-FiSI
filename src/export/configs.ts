// Generates real, runnable Linux configuration from a device's simulated
// state: iproute2 setup scripts, /etc/nftables.conf, dnsmasq.conf. This is
// the "design in the browser, run it for real" half of the project vision.
import type { Network } from '../engine/network';
import { IpDevice } from '../engine/ipdevice';
import { cidrToString, ipToString } from '../engine/ip';
import { listRuleset } from '../engine/firewall-fmt';

export function setupScript(d: IpDevice): string {
  const lines: string[] = [
    '#!/bin/sh',
    `# NetSim generated configuration for ${d.name} (${d.kind})`,
    '# Apply on a Linux machine with iproute2, as root. Interface names on',
    '# real hardware will differ — adjust eth0/eth1/... accordingly.',
    '',
  ];
  for (const i of d.interfaces) {
    if (i.ip) lines.push(`ip addr add ${cidrToString(i.ip.addr, i.ip.prefix)} dev ${i.name}`);
    if (i.ip || i.link) lines.push(`ip link set ${i.name} ${i.up ? 'up' : 'down'}`);
  }
  for (const r of d.staticRoutes) {
    const dest = r.prefix === 0 ? 'default' : cidrToString(r.dest, r.prefix);
    const via = r.via !== null ? ` via ${ipToString(r.via)}` : '';
    lines.push(`ip route add ${dest}${via} dev ${r.ifaceName}`);
  }
  if (d.nameserver !== null) {
    lines.push(`printf 'nameserver ${ipToString(d.nameserver)}\\n' > /etc/resolv.conf`);
  }
  if (d.forwarding) lines.push('sysctl -w net.ipv4.ip_forward=1');
  if (d.fw.active()) lines.push('nft -f ./nftables.conf');
  if (d.dhcpServer?.enabled || d.dnsServer?.enabled) {
    lines.push('# start DHCP/DNS: dnsmasq --conf-file=./dnsmasq.conf --no-daemon');
  }
  if (d.httpServer?.enabled) {
    lines.push(`# serve the web page: busybox httpd -f -p ${d.httpServer.port} -h . (index.html exported alongside)`);
  }
  lines.push('');
  return lines.join('\n');
}

export function nftablesConf(d: IpDevice): string | null {
  if (!d.fw.active()) return null;
  return `#!/usr/sbin/nft -f\n# NetSim generated ruleset for ${d.name}\nflush ruleset\n\n${listRuleset(d.fw)}`;
}

export function dnsmasqConf(d: IpDevice): string | null {
  const dhcp = d.dhcpServer?.enabled ? d.dhcpServer : null;
  const dns = d.dnsServer?.enabled ? d.dnsServer : null;
  if (!dhcp && !dns) return null;
  const lines: string[] = [`# NetSim generated dnsmasq.conf for ${d.name}`];
  for (const i of d.interfaces) {
    if (i.ip) lines.push(`interface=${i.name}`);
  }
  if (!dns) {
    lines.push('port=0  # DHCP only, no DNS');
  } else {
    lines.push('no-resolv');
    for (const [name, addr] of dns.records) {
      lines.push(`host-record=${name},${ipToString(addr)}`);
    }
  }
  if (dhcp) {
    lines.push(`dhcp-range=${ipToString(dhcp.rangeStart)},${ipToString(dhcp.rangeEnd)},12h`);
    if (dhcp.router !== null) lines.push(`dhcp-option=option:router,${ipToString(dhcp.router)}`);
    if (dhcp.dns !== null) lines.push(`dhcp-option=option:dns-server,${ipToString(dhcp.dns)}`);
  }
  lines.push('');
  return lines.join('\n');
}

export interface ConfigFile {
  path: string; // e.g. "fw1/nftables.conf"
  content: string;
}

export function sanitizeName(name: string): string {
  return name.replace(/[^\w.-]/g, '_');
}

export function configBundle(net: Network): ConfigFile[] {
  const files: ConfigFile[] = [];
  const devices = [...net.devices.values()].filter((d): d is IpDevice => d instanceof IpDevice);
  const readme: string[] = [
    '# NetSim configuration bundle',
    '',
    'One directory per device, containing genuine Linux configuration derived',
    'from the simulated design. Interface names map 1:1 to the simulation;',
    'real hardware will differ.',
    '',
    '| Device | Kind | Files |',
    '|---|---|---|',
  ];
  for (const d of devices) {
    const dir = sanitizeName(d.name);
    const names: string[] = ['setup.sh'];
    files.push({ path: `${dir}/setup.sh`, content: setupScript(d) });
    const nft = nftablesConf(d);
    if (nft) {
      files.push({ path: `${dir}/nftables.conf`, content: nft });
      names.push('nftables.conf');
    }
    const dnsmasq = dnsmasqConf(d);
    if (dnsmasq) {
      files.push({ path: `${dir}/dnsmasq.conf`, content: dnsmasq });
      names.push('dnsmasq.conf');
    }
    if (d.httpServer?.enabled) {
      files.push({ path: `${dir}/index.html`, content: d.httpServer.body + '\n' });
      names.push('index.html');
    }
    readme.push(`| ${d.name} | ${d.kind} | ${names.join(', ')} |`);
  }
  readme.push('');
  files.unshift({ path: 'README.md', content: readme.join('\n') });
  return files;
}
