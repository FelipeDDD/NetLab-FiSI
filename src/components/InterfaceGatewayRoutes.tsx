import { IpDevice } from '../engine/ipdevice';
import type { NetInterface } from '../engine/device';
import { ipToString } from '../engine/ip';
import { defaultRouteSummary } from '../hostNetworkSummary';
import { RoutingTable } from './DiagnosticTables';
import { useTranslation } from '../i18n';

/** Read-only explanation: editing the interface never writes a static route. */
export function InterfaceGatewayRoutes({ device, iface }: { device: IpDevice; iface: NetInterface }) {
  const { t, language } = useTranslation();
  const { explicit, learned, selected, selectedSource, multiple } = defaultRouteSummary(device, iface, language);
  return <div className="interface-default-routes">
    <small>{t('navigation.gatewayInterface')}: {iface.gateway === null ? t('navigation.gatewayUnset') : ipToString(iface.gateway)}</small>
    {[...explicit, ...learned].map((route, index) => <div key={index}>
      <strong>{route.kind === 'rip' ? 'RIP' : t('navigation.gatewayExplicit')}</strong>: <code>0.0.0.0/0 → {route.via === null ? t('navigation.gatewayDirect') : ipToString(route.via)}</code>
    </div>)}
    <p>{selected ? <>{t('navigation.gatewaySelected')}: <code>{selected.via === null ? t('navigation.gatewayDirect') : ipToString(selected.via)} · {selected.ifaceName}</code> · {selectedSource}</> : t('navigation.gatewayNone')}</p>
    {multiple && <p>{t('navigation.gatewayMultiple')}</p>}
    <details><summary>{t('navigation.gatewayFullTable')}</summary><RoutingTable device={device} /></details>
  </div>;
}
