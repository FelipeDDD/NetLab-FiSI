import { useTranslation } from '../i18n';
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
  const { t } = useTranslation();
  const rows: DiagnosticRow[] = [...device.arpTable].sort(([a], [b]) => a - b).map(([ip, entry]) => ({
    key: String(ip),
    cells: [<IpAddress value={ipToString(ip)} />, <MacAddress value={entry.mac} />],
    details: [
      { label: t('navigation.tableInterface'), value: <code>{entry.ifaceName}</code> },
      { label: t('navigation.tableAge'), value: `${Math.max(0, Math.floor((device.network.now - entry.at) / 1000))} s` },
    ],
  }));
  return <>
    {onClear && <button type="button" className="mini-btn" title={t('navigation.tableClearArpHint')}
      onClick={onClear}>{t('navigation.tableClearArp')}</button>}
    <DiagnosticTable label={t('navigation.tableArp')} columns={[t('navigation.tableIp'), t('navigation.tableMacAddress')]}
      variant="arp" rows={rows} empty={t('navigation.tableEmptyArp')} />
  </>;
}

export function RouteTypeInfo() {
  const { t } = useTranslation();
  return <InfoTooltip label={t('navigation.tableTypeExplain')} title={t('navigation.tableTypeTitle')}>
    <dl><dt>{t('navigation.tableConnected')}</dt><dd>{t('navigation.tableConnectedHint')}</dd>
        <dt>{t('navigation.tableStatic')}</dt><dd>{t('navigation.tableStaticHint')}</dd>
        <dt>RIP</dt><dd>{t('navigation.tableRipHint')}</dd></dl>
  </InfoTooltip>;
}

export function RoutingTable({ device }: { device: IpDevice }) {
  const { t } = useTranslation();
  const rows: DiagnosticRow[] = device.routes().map(route => ({
    key: `${route.kind}:${route.dest}/${route.prefix}:${route.via}:${route.ifaceName}`,
    cells: [<>{route.prefix === 0 && <span className="diagnostic-secondary">{t('navigation.tableDefault')}</span>}
      <IpAddress value={cidrToString(route.dest, route.prefix)} /></>,
      route.via === null ? <span>{t('navigation.tableDirect')}</span> : <IpAddress value={ipToString(route.via)} />],
    details: [
      { label: t('navigation.tableInterface'), value: <code>{route.ifaceName}</code> },
      { label: t('navigation.tableType'), value: <span className={`diagnostic-route-type is-${route.kind}`}>
        {{ connected: t('navigation.tableConnected'), static: t('navigation.tableStatic'), rip: 'RIP' }[route.kind]}</span> },
      ...(route.metric === undefined ? [] : [{ label: t('navigation.tableMetric'), value: route.metric }]),
    ],
  }));
  return <DiagnosticTable label={t('navigation.tableRoutes')} columns={[t('navigation.tableDestination'), t('navigation.tableGateway')]}
    help={<span>{t('navigation.tableType')}<RouteTypeInfo /></span>} rows={rows} empty={t('navigation.tableEmptyRoutes')} />;
}

export function MacTable({ device }: { device: SwitchDevice }) {
  const { t } = useTranslation();
  const rows: DiagnosticRow[] = [...device.macTable].map(([key, port]) => {
    const separator = key.indexOf('|');
    return { key, vlan: Number(key.slice(0, separator)), mac: key.slice(separator + 1), port: port.name };
  }).sort((a, b) => a.vlan - b.vlan || a.mac.localeCompare(b.mac)).map(entry => ({
    key: entry.key, cells: [<MacAddress value={entry.mac} />, entry.vlan, <code>{entry.port}</code>],
  }));
  return <DiagnosticTable label={t('navigation.tableMac')} columns={[t('navigation.tableMacAddress'), 'VLAN', t('navigation.tablePort')]}
    variant="mac" rows={rows} empty={t('navigation.tableEmptyMac')} />;
}
