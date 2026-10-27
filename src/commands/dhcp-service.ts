import { RouterDevice, type IpDevice } from '../engine/ipdevice';

export const DHCP_SERVICE = 'kea-dhcp4-server';

/** Narrow Linux service-control subset; no Cisco CLI, relay or systemd model. */
export function runDhcpService(device: IpDevice, args: string[], write: (text: string) => void): void {
  const [action, unit] = args;
  if (args.length !== 2 || !['start', 'stop', 'status'].includes(action) ||
      (unit !== DHCP_SERVICE && unit !== DHCP_SERVICE + '.service')) {
    write(`systemctl: supported syntax: systemctl start|stop|status ${DHCP_SERVICE}\n`);
    return;
  }
  if (!(device instanceof RouterDevice)) {
    write('systemctl: this DHCPv4 server control is available on Router devices only.\n');
    return;
  }
  if (action === 'status') {
    write(`${DHCP_SERVICE}.service - NetLab DHCPv4 server\n`);
    write(`  Active: ${device.dhcpServerEnabled ? 'active (running)' : 'inactive (dead)'}\n`);
    write('  Scope: DHCPv4 server only; no DHCP relay. Per-interface pool settings are retained.\n');
    return;
  }
  device.dhcpServerEnabled = action === 'start';
}
