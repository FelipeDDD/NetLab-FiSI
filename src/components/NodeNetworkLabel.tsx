import { useRef } from 'react';
import { useViewport } from '@xyflow/react';
import { useStore } from '../store';
import { sim } from '../sim';
import { canvasNetwork, networkLabelScale } from '../canvasNetwork';
import { CopyIpButton } from './CopyIpButton';

export function NodeNetworkLabel({ id, name }: { id: string; name: string }) {
  const nodes = useStore(s => s.nodes);
  useStore(s => s.uiPulse);
  const { zoom } = useViewport();
  const previous = useRef<string>();
  const summary = canvasNetwork(sim.net.devices.get(id), previous.current);
  if (summary?.interfaceName) previous.current = summary.interfaceName;
  const scale = networkLabelScale(zoom);
  const node = nodes.find(n => n.id === id);
  const x = node ? node.position.x + (node.measured?.width ?? 96) / 2 : 0;
  const y = node ? node.position.y + (node.measured?.height ?? 78) : 0;
  const nearest = Math.min(Infinity, ...nodes.filter(n => n.id !== id && Math.abs(n.position.y + (n.measured?.height ?? 78) - y) < 20)
    .map(n => Math.abs(n.position.x + (n.measured?.width ?? 96) / 2 - x)));
  const width = Math.max(60, Math.min(150, (nearest - 10) / scale));
  return <div className="dev-ip">{summary && <span className={`node-network-label${summary.stored ? ' is-stored' : ''}`}
    style={{ transform: `translateX(-50%) scale(${scale})`, maxWidth: width }} title={summary.tooltip}>
    {summary.icon && <span className="node-network-indicator" title={summary.tooltip} aria-label={summary.tooltip} role="img">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {summary.icon === 'wifi-off' ? <><path d="m2 2 20 20M8.5 8.5a10 10 0 0 1 12 3M3 11a15 15 0 0 1 2.5-2M7 15a8 8 0 0 1 3-1M16 5a18 18 0 0 1 6 4M12 19h.01" /></>
          : summary.icon === 'unplug' ? <><path d="m3 3 18 18M7 7l-3 3 6 6 3-3M14 5l3-3M19 10l3-3M4 20l4-4M15 8l2 2" /></>
          : summary.icon === 'pending' ? <><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></>
          : <><circle cx="12" cy="12" r="8" /><path d="M12 7v6M12 17h.01" /></>}
      </svg>
    </span>}
    {summary.address ? <CopyIpButton address={summary.address} context={name} title={`${summary.tooltip}\nKlicken: IPv4 kopieren`}><span className="node-ip-value">{summary.address}</span></CopyIpButton>
      : <span>{summary.state === 'DHCP ausstehend' ? 'DHCP…' : 'Kein IPv4'}</span>}
  </span>}</div>;
}
