import type { CSSProperties, ReactNode } from 'react';
import { ipToString } from '../engine/ip';
import type { NetInterface } from '../engine/device';
import { useStore } from '../store';
import { interfaceCableColor } from '../cableAppearance';
import { useCableAppearances } from './useCableAppearances';
import { useTranslation } from '../i18n';

/** Use structural link state, never parse the legacy diagnostic text. */
function connectionPresentation(iface: NetInterface, connection: ReturnType<typeof interfaceConnection>, medium: 'wired' | 'wireless' | 'unspecified', t: ReturnType<typeof useTranslation>['t']) {
  const wifi = medium === 'wireless';
  const unoccupied = medium === 'unspecified' && connection.state === 'disconnected';
  const label = unoccupied ? t('navigation.linkUnused') : t({
    connected: wifi ? 'navigation.linkWifiActive' : 'navigation.linkActive',
    inactive: wifi ? 'navigation.linkWifiInactive' : 'navigation.linkInactive',
    disconnected: wifi ? 'navigation.linkNoWifi' : 'navigation.linkNoCable',
    unknown: 'navigation.linkUnknown',
  }[connection.state] as Parameters<typeof t>[0]);
  if (unoccupied) return { label, text: t('navigation.linkUnusedHint') };
  if (!connection.link) return { label, text: t(connection.state === 'unknown' ? 'navigation.linkStatusUnknown' : wifi ? 'navigation.linkWifiDisconnected' : 'navigation.linkDisconnected') };
  const peer = connection.link.other(iface);
  if (connection.state === 'connected') return { label, text: t('navigation.linkConnectedTo', { name: peer.device.name, status: label }) };
  // Opaque WLAN diagnostics belong to 3C2; preserve their content verbatim.
  const reason = iface.up && peer.up && connection.link.wirelessError || t(!iface.up && !peer.up ? 'navigation.linkBothDown' : !iface.up ? 'navigation.linkLocalDown' : !peer.up ? 'navigation.linkPeerDown' : 'navigation.linkUnavailable');
  return { label, text: t(wifi ? 'navigation.linkWifiTo' : 'navigation.linkCableTo', { name: peer.device.name, reason }) };
}

export function interfaceConnection(iface: NetInterface) {
  const link = iface.link;
  if (!link) return { link: null, state: 'disconnected', text: 'Nicht verbunden · kein Kabel' } as const;
  const peer = link.other(iface);
  if (iface.device.network.links.get(link.id) !== link || peer.link !== link || iface.device.disposed || peer.device.disposed) {
    return { link: null, state: 'unknown', text: 'Verbindungszustand unbekannt' } as const;
  }
  if (!link.operational) {
    const reason = iface.up && peer.up ? link.wirelessError ?? 'Verbindung inaktiv' : !iface.up && !peer.up ? 'beide Schnittstellen DOWN' : !iface.up ? 'lokale Schnittstelle DOWN' : 'Gegenstelle DOWN';
    return { link, state: 'inactive', text: `Kabel zu ${peer.device.name} · ${reason}` } as const;
  }
  return { link, state: 'connected', text: `Verbunden mit ${peer.device.name} · Link aktiv` } as const;
}

// A link can carry frames only when both modeled endpoints are administratively UP.
// This is link status, never an assertion of IP reachability.
export function InterfaceConnection({ iface }: { iface: NetInterface }) {
  const { t } = useTranslation();
  const connection = interfaceConnection(iface);
  const { text } = connectionPresentation(iface, connection, iface.medium === 'wireless' ? 'wireless' : 'wired', t);
  return <span className={`interface-physical-state is-${connection.state}`}
    data-link-state={connection.state} data-link-id={connection.link?.id}
    aria-label={t('navigation.linkAria', { iface: iface.name, status: text })}>{text}</span>;
}

// Device identity shares the canvas category palette, not terminal preferences.
export function InterfaceSummary({ iface, vlan, showMode = false, action, medium = iface.medium === 'wireless' ? 'wireless' : 'wired' }: {
  iface: NetInterface; vlan?: number; showMode?: boolean; action?: ReactNode; medium?: 'wired' | 'wireless' | 'unspecified';
}) {
  const { t } = useTranslation();
  const connection = interfaceConnection(iface);
  const peer = connection.link?.other(iface).device;
  const linkId = connection.link?.id;
  const selected = useStore(s => !!linkId && !!s.edges?.some(e => e.id === linkId && e.selected));
  const colors = useCableAppearances(iface.device.network);
  const cableColor = interfaceCableColor(iface, colors);
  const hovered = useStore(s => !!linkId && s.hoveredLinkId === linkId);
  const highlighted = hovered || selected;
  // The AP models wireless endpoints as links too. Preserve detection while
  // avoiding cable terminology in their visible and accessible descriptions.
  const { text, label: stateLabel } = connectionPresentation(iface, connection, medium, t);
  return <span className={`interface-summary is-${connection.state}${highlighted ? ' cable-interface-highlighted' : ''}`} data-interface-name={iface.name}
    style={{ '--interface-identity': cableColor ?? `var(--${peer?.kind ?? iface.device.kind}, var(--ui-accent))`,
      '--interface-cable-color': cableColor ?? 'var(--ui-link-empty)' } as CSSProperties} data-cable-color={cableColor}
    onMouseEnter={() => { if (linkId) useStore.getState().hoverLink(linkId); }}
    onMouseLeave={() => { if (linkId && useStore.getState().hoveredLinkId === linkId) useStore.getState().hoverLink(null); }}
    data-device-id={iface.device.id} data-link-state={connection.state} data-link-id={connection.link?.id} data-link-selected={selected || undefined}>
    <strong className="interface-summary-name">{iface.name}</strong>
    <span className="interface-summary-state" title={text}
      aria-label={t('navigation.linkAria', { iface: iface.name, status: text })}>{stateLabel}</span>
    <span className="interface-summary-config">
      <span>{vlan === undefined ? iface.ip ? `${ipToString(iface.ip.addr)}/${iface.ip.prefix}` : t('navigation.linkNoIpv4') : `VLAN ${vlan}`}</span>
      {' \u00b7 '}<span>Admin: {iface.up ? 'UP' : 'DOWN'}</span>
      {showMode && <span> &middot; {{ static: t('navigation.linkStaticMode'), dhcp: 'DHCP', unconfigured: t('navigation.linkUnconfigured') }[iface.ipv4Mode]}</span>}
    </span>
    <span className="interface-summary-peer">{peer ? <><span className="sr-only">{t('navigation.linkPeerPrefix')}</span><svg className="interface-peer-connector" width="17" height="17" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M7 2v4m4-4v4M5 6h8v4a4 4 0 0 1-8 0V6Zm4 8v3a4 4 0 0 0 8 0v-3m-3-4h6v4h-6zM16 7v3m2-3v3" />
    </svg><strong style={{ color: `var(--${peer.kind}, var(--text))` }}>{peer.name}</strong></>
      : t(connection.state === 'unknown' ? 'navigation.linkConnectionUnknown' : 'navigation.linkNone')}</span>
    {action && <span className="interface-summary-action">{action}</span>}
  </span>;
}
