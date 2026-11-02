import { IpDevice } from '../engine/ipdevice';
import type { NetInterface } from '../engine/device';
import { ipToString } from '../engine/ip';
import { defaultRouteSummary } from '../hostNetworkSummary';
import { RoutingTable } from './DiagnosticTables';

/** Read-only explanation: editing the interface never writes a static route. */
export function InterfaceGatewayRoutes({ device, iface }: { device: IpDevice; iface: NetInterface }) {
  const { explicit, learned, selected, selectedSource, multiple } = defaultRouteSummary(device, iface);
  return <div className="interface-default-routes">
    <small>Schnittstellen-Gateway: {iface.gateway === null ? 'nicht gesetzt' : ipToString(iface.gateway)}</small>
    {[...explicit, ...learned].map((route, index) => <div key={index}>
      <strong>{route.kind === 'rip' ? 'RIP' : 'Explizite Route'}</strong>: <code>0.0.0.0/0 → {route.via === null ? 'direkt' : ipToString(route.via)}</code>
    </div>)}
    <p>{selected ? <>Ausgewählte Standardroute: <code>{selected.via === null ? 'direkt' : ipToString(selected.via)} · {selected.ifaceName}</code> · {selectedSource}</> : 'Keine verwendbare Standardroute für Ziele ohne spezifischere Route.'}</p>
    {multiple && <p>Mehrere Standardwege sind konfiguriert. Der Simulator wählt bei gleicher Präfixlänge den ersten verwendbaren Eintrag; spezifischere Routen haben Vorrang. Unterschiedliche Gateways sind nicht automatisch ein Fehler.</p>}
    <details><summary>Vollständige Routing-Tabelle</summary><RoutingTable device={device} /></details>
  </div>;
}
