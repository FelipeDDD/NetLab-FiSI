import { useRef } from 'react';
import type { CSSProperties } from 'react';
import { useStore } from '../store';
import { sim } from '../sim';
import { canvasNetwork } from '../canvasNetwork';
import { CopyIpButton } from './CopyIpButton';
import { interfaceCableColor } from '../cableAppearance';
import { useCableAppearances } from './useCableAppearances';

export function NodeNetworkLabel({ id, name }: { id: string; name: string }) {
  const colors = useCableAppearances();
  useStore(s => s.uiPulse);
  const previous = useRef<string>();
  const device = sim.net.devices.get(id);
  const summary = canvasNetwork(device, previous.current);
  const color = (name?: string) => interfaceCableColor(name ? device?.getInterface(name) : undefined, colors);
  if (summary?.interfaceName) previous.current = summary.interfaceName;
  return <div className="dev-ip">{summary && <span className={`node-network-label${summary.stored ? ' is-stored' : ''}${summary.addresses.length > 1 ? ' is-multiple' : ''}`}
    title={summary.tooltip}>
    {summary.icon && <span className="node-network-indicator" title={summary.tooltip} aria-label={summary.tooltip} role="img">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {summary.icon === 'wifi-off' ? <><path d="m2 2 20 20M8.5 8.5a10 10 0 0 1 12 3M3 11a15 15 0 0 1 2.5-2M7 15a8 8 0 0 1 3-1M16 5a18 18 0 0 1 6 4M12 19h.01" /></>
          : summary.icon === 'unplug' ? <><path d="m3 3 18 18M7 7l-3 3 6 6 3-3M14 5l3-3M19 10l3-3M4 20l4-4M15 8l2 2" /></>
          : summary.icon === 'pending' ? <><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></>
          : <><circle cx="12" cy="12" r="8" /><path d="M12 7v6M12 17h.01" /></>}
      </svg>
    </span>}
    {summary.addresses.length > 1 ? <span className="node-network-addresses">{summary.addresses.map(row => <span
      key={row.interfaceName} className={`node-network-row${row.stored ? ' is-stored' : ''}`} data-interface-name={row.interfaceName} data-operational={row.active}
      data-cable-color={color(row.interfaceName)} style={{ '--interface-cable-color': color(row.interfaceName) ?? 'var(--canvas-text-muted)' } as CSSProperties} title={row.tooltip}>
      <span className="node-network-interface">{row.interfaceName}</span>
      <CopyIpButton address={row.address} context={`${name} ${row.interfaceName}`} title={`${row.tooltip}\nKlicken: IPv4 kopieren`}><span className="node-ip-value">{row.address}</span></CopyIpButton>
    </span>)}</span> : summary.address ? <><span className="node-single-address-marker" aria-hidden="true" data-cable-color={color(summary.interfaceName)}
      style={{ background: color(summary.interfaceName) ?? 'var(--canvas-text-muted)' }} />
      <CopyIpButton address={summary.address} context={name} title={`${summary.tooltip}\nKlicken: IPv4 kopieren`}><span className="node-ip-value">{summary.address}</span></CopyIpButton></>
      : <span>{summary.state === 'DHCP ausstehend' ? 'DHCP…' : 'Kein IPv4'}</span>}
  </span>}</div>;
}
