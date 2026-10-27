import { Fragment, type ReactNode } from 'react';
import { InfoTooltip } from './InfoTooltip';
import type { IpDevice } from '../engine/ipdevice';
import type { SwitchDevice } from '../engine/switch';
import { cidrToString, ipToString } from '../engine/ip';

export interface DiagnosticRow {
  key: string;
  cells: readonly ReactNode[];
  details?: readonly { label: string; value: ReactNode }[];
}

// Native table semantics plus a focusable, bounded scroll region. Secondary
// fields stay visible below their record instead of becoming tiny columns.
export function DiagnosticTable({ label, columns, rows, empty, variant, help }: {
  label: string; columns: readonly string[]; rows: readonly DiagnosticRow[]; empty: string; variant?: 'arp' | 'mac'; help?: ReactNode;
}) {
  return <div className="diagnostic-table-region" role="region" aria-label={label} tabIndex={0}>
    <table className={`diagnostic-table${variant ? ` diagnostic-table-${variant}` : ''}`}>
      <caption className={help ? 'diagnostic-caption' : 'sr-only'}>
        {help ? <><span className="sr-only">{label}</span>{help}</> : label}
      </caption>
      <thead><tr>{columns.map(column => <th key={column} scope="col">{column}</th>)}</tr></thead>
      <tbody>
        {!rows.length && <tr><td className="diagnostic-empty" colSpan={columns.length}>{empty}</td></tr>}
        {rows.map(row => <Fragment key={row.key}>
          <tr className={row.details?.length ? 'diagnostic-record has-details' : 'diagnostic-record'}>
            {row.cells.map((cell, index) => index === 0
              ? <th key={index} scope="row">{cell}</th> : <td key={index}>{cell}</td>)}
          </tr>
          {!!row.details?.length && <tr className="diagnostic-record-details"><td colSpan={columns.length}>
            <dl>{row.details.map(detail => <div key={detail.label}>
              <dt>{detail.label}</dt><dd>{detail.value}</dd>
            </div>)}</dl>
          </td></tr>}
        </Fragment>)}
      </tbody>
    </table>
  </div>;
}

function MacAddress({ value }: { value: string }) {
  // Soft wrap opportunities never insert spaces/newlines into copied addresses.
  return <code>{value.split(':').map((part, index) => <Fragment key={index}>
    {index > 0 && <><span>:</span><wbr /></>}{part}
  </Fragment>)}</code>;
}

function IpAddress({ value }: { value: string }) {
  return <code>{value.split('.').map((part, index) => <Fragment key={index}>
    {index > 0 && <>.<wbr /></>}{part}
  </Fragment>)}</code>;
}

export function ArpTable({ device, onClear }: { device: IpDevice; onClear?: () => void }) {
  const rows: DiagnosticRow[] = [...device.arpTable].sort(([a], [b]) => a - b).map(([ip, entry]) => ({
    key: String(ip),
    cells: [<IpAddress value={ipToString(ip)} />, <MacAddress value={entry.mac} />],
    details: [
      { label: 'Schnittstelle', value: <code>{entry.ifaceName}</code> },
      { label: 'Aktualisiert vor', value: `${Math.max(0, Math.floor((device.network.now - entry.at) / 1000))} s` },
    ],
  }));
  return <>
    {onClear && <button type="button" className="mini-btn" title="Löscht die dynamisch gelernten ARP-Einträge dieses Geräts."
      onClick={onClear}>ARP-Cache leeren</button>}
    <DiagnosticTable label="ARP-Tabelle" columns={['IP-Adresse', 'MAC-Adresse']}
      variant="arp" rows={rows} empty="Keine ARP-Einträge. Sie werden beim Austausch von ARP-Nachrichten gelernt." />
  </>;
}

export function RouteTypeInfo() {
  return <InfoTooltip label="Routentyp erklären" title="Routentyp erklärt">
    <dl><dt>Connected</dt><dd>Direkt angeschlossenes Netzwerk.</dd>
        <dt>Static</dt><dd>Manuell konfigurierte Route.</dd>
        <dt>RIP</dt><dd>Automatisch von anderen Routern gelernte Route.</dd></dl>
  </InfoTooltip>;
}

export function RoutingTable({ device }: { device: IpDevice }) {
  const rows: DiagnosticRow[] = device.routes().map(route => ({
    key: `${route.kind}:${route.dest}/${route.prefix}:${route.via}:${route.ifaceName}`,
    cells: [<>{route.prefix === 0 && <span className="diagnostic-secondary">Standardroute</span>}
      <IpAddress value={cidrToString(route.dest, route.prefix)} /></>,
      route.via === null ? <span>Direkt · ohne Gateway</span> : <IpAddress value={ipToString(route.via)} />],
    details: [
      { label: 'Schnittstelle', value: <code>{route.ifaceName}</code> },
      { label: 'Routentyp', value: <span className={`diagnostic-route-type is-${route.kind}`}>
        {{ connected: 'Connected', static: 'Static', rip: 'RIP' }[route.kind]}</span> },
      ...(route.metric === undefined ? [] : [{ label: 'Metrik', value: route.metric }]),
    ],
  }));
  return <DiagnosticTable label="Routing-Tabelle" columns={['Zielnetz / Prefix', 'Gateway']}
    help={<span>Routentyp<RouteTypeInfo /></span>} rows={rows} empty="Keine Routen vorhanden." />;
}

export function MacTable({ device }: { device: SwitchDevice }) {
  const rows: DiagnosticRow[] = [...device.macTable].map(([key, port]) => {
    const separator = key.indexOf('|');
    return { key, vlan: Number(key.slice(0, separator)), mac: key.slice(separator + 1), port: port.name };
  }).sort((a, b) => a.vlan - b.vlan || a.mac.localeCompare(b.mac)).map(entry => ({
    key: entry.key, cells: [<MacAddress value={entry.mac} />, entry.vlan, <code>{entry.port}</code>],
  }));
  return <DiagnosticTable label="MAC-Tabelle" columns={['MAC-Adresse', 'VLAN', 'Port']}
    variant="mac" rows={rows} empty="Keine MAC-Adressen gelernt. Die Tabelle füllt sich beim Empfang von Frames." />;
}
