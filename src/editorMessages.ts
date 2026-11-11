import type { TranslationKey, useTranslation } from './i18n';
import type { TopologyOperation } from './topologyHistory';

/** Volatile presentation only. Free text remains valid; never parse old labels. */
export type EditorMessage = string | { key: TranslationKey; values?: Record<string, string | number> };
type Translator = ReturnType<typeof useTranslation>['t'];
export const editorMessage = (key: TranslationKey, values?: Record<string, string | number>): EditorMessage => ({ key, ...(values && { values }) });
export const editorMessageText = (message: EditorMessage, t: Translator): string => typeof message === 'string' ? message : t(message.key, message.values);

/** Read existing discriminants/snapshots, never change or infer operation data. */
export function historyOperationLabel(operation: TopologyOperation | { label: string; type?: undefined }, t: Translator): string {
  switch (operation.type) {
    case 'create-device': return t('navigation.historyCreate', { name: operation.device.saved.name });
    case 'delete-devices': return t(operation.devices.length === 1 ? 'navigation.historyDeleteOne' : 'navigation.historyDeleteMany', { count: operation.devices.length });
    case 'move-nodes': return t(operation.changes.length === 1 ? 'navigation.historyMoveOne' : 'navigation.historyMoveMany', { count: operation.changes.length });
    case 'paste-devices': return t(operation.devices.length === 1 ? 'navigation.historyPasteOne' : 'navigation.historyPasteMany', { count: operation.devices.length });
    case 'add-links': return t(operation.links.every(l => l.medium === 'wireless') ? 'navigation.historyConnectWifi' : 'navigation.historyConnect');
    case 'remove-links': return t(operation.links.every(l => l.medium === 'wireless') ? 'navigation.historyDisconnectWifi' : operation.links.length === 1 ? 'navigation.historyRemoveLinkOne' : 'navigation.historyRemoveLinkMany', { count: operation.links.length });
    case 'rename-device': return t('navigation.historyRename', { before: operation.before, after: operation.after });
    case 'enable-wireless': return t('navigation.historyAddWifi');
    case 'set-area-markings': return t(operation.after.length > operation.before.length ? 'navigation.historyCreateMarking' : operation.after.length < operation.before.length ? 'navigation.historyRemoveMarking' : 'navigation.historyEditMarking');
    case 'set-interface-ipv4': case 'set-iface-ip': return t('navigation.historyIpv4', { iface: operation.ifaceName });
    case 'set-iface-state': return t('navigation.historyInterfaceState', { iface: operation.ifaceName, state: operation.after ? 'UP' : 'DOWN' });
    case 'set-services': return t('navigation.historyPorts', { protocol: operation.proto.toUpperCase() });
    case 'set-server-enabled': return t(operation.after ? 'navigation.historyEnableServer' : 'navigation.historyDisableServer', { server: { dhcpServer: 'DHCP', dnsServer: 'DNS', httpServer: 'HTTP' }[operation.server] });
    case 'set-forwarding': return t(operation.after ? 'navigation.historyEnableForwarding' : 'navigation.historyDisableForwarding');
    case 'set-rip-enabled': return t(operation.after ? 'navigation.historyEnableRip' : 'navigation.historyDisableRip');
    case 'resize-switch': return t(operation.after > operation.before ? 'navigation.historyAddPort' : 'navigation.historyRemovePort');
    case 'set-nameserver': return t(operation.after === null ? 'navigation.historyRemoveDns' : 'navigation.historySetDns');
    case 'set-dhcp-field': return t('navigation.historyDhcpField', { field: operation.field });
    case 'set-dhcp-server-enabled': return t(operation.after ? 'navigation.historyEnableDhcp' : 'navigation.historyDisableDhcp');
    case 'set-static-routes': return t('navigation.historyRoutes');
    case 'set-dhcp-configuration': return t('navigation.historyDhcp');
    case 'set-wifi-range': return t('navigation.historyWifiRange');
    case 'set-host-os': return t('navigation.historyHostOs', { os: operation.after });
    case 'set-cable-color': return t('navigation.historyCableColor');
    case 'reconnect-link': return t('navigation.historyReconnect');
    case 'set-ssid': return t('navigation.historySsid');
    case 'set-port-vlan': return t('navigation.historyVlan', { port: operation.port });
    case 'create-dhcp-server': return t('navigation.historyCreateDhcp');
    case 'create-dns-server': return t('navigation.historyCreateDns');
    case 'create-http-server': return t('navigation.historyCreateHttp');
    case 'set-dns-records': return t('navigation.historyDnsRecords');
    case 'set-http-port': return t('navigation.historyHttpPort');
    case 'set-http-body': return t('navigation.historyHttpBody');
    // A chapter restore ID says nothing about the free-text teaching context.
    default: return operation.label;
  }
}
