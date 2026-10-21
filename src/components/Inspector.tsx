import { createRef, Fragment, useEffect, useRef, useState, type RefObject } from 'react';
import { useStore } from '../store';
import { sim } from '../sim';
import { Host, IpDevice, RouterDevice, ServerDevice } from '../engine/ipdevice';
import type { HostOs } from '../hostOs';
import { ApDevice, SwitchDevice } from '../engine/switch';
import { ipToString, maskOf } from '../engine/ip';
import { ArpTable, MacTable, RoutingTable } from './DiagnosticTables';
import { formatConntrack } from '../commands/shell';
import { listRuleset } from '../engine/firewall-fmt';
import { InterfaceIpv4Panel } from './InterfaceIpv4Panel';
import { newInspectorDraft, syncInspectorDraft } from '../inspectorDraft';
import { sortedDnsRecords } from '../topologyEdits';
import { sortedServicePorts } from '../topologyHistory';
import { InspectorTabs } from './InspectorTabs';
import { PersistentInspectorContent } from './PersistentInspectorContent';
import { hostDnsSummary, hostGatewaySummary } from '../hostNetworkSummary';
import { FirewallInfo } from './FirewallInfo';
import type { NetInterface } from '../engine/device';
import { InterfaceConnection, interfaceConnection } from './InterfaceConnection';
import { InfoTooltip } from './InfoTooltip';

function useInspectorDraft(identity: string, value: string, readCurrent: () => string | undefined,
  onCommit: (text: string) => string | null | void) {
  const setNotice = useStore((s) => s.setNotice);
  const [draft, setDraft] = useState(() => newInspectorDraft(identity, value));
  const current = syncInspectorDraft(draft, identity, value);
  if (current !== draft) setDraft(current);
  return {
    value: current.text,
    onChange: (text: string) => setDraft({ ...newInspectorDraft(identity, readCurrent() ?? value), text }),
    commit: () => {
      // Read the engine too: a store edit can precede React's next render.
      const latest = readCurrent(), checked = syncInspectorDraft(current, identity, latest ?? value);
      if (latest === undefined || checked.stale) {
        setDraft(newInspectorDraft(identity, latest ?? value));
        if (checked.stale) setNotice('Value changed elsewhere; the outdated draft was not applied.');
        return;
      }
      const err = checked.text === checked.source ? null : onCommit(checked.text);
      setDraft(newInspectorDraft(identity, readCurrent() ?? value));
      if (err) setNotice(err);
    },
  };
}

function DeviceName({ deviceId, name }: { deviceId: string; name: string }) {
  const rename = useStore((s) => s.renameDevice);
  const draft = useInspectorDraft(deviceId, name, () => sim.net.devices.get(deviceId)?.name, (text) => rename(deviceId, text));
  return <input className="inspector-name" aria-label="Device name" value={draft.value}
    onChange={(e) => draft.onChange(e.target.value)} onBlur={draft.commit}
    onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) e.currentTarget.blur(); }} />;
}

function InspectorSettingInput({ identity, value, readCurrent, onCommit, label, placeholder, width, mono = true }: {
  identity: string; value: string; readCurrent: () => string | undefined;
  onCommit: (text: string) => string | null | void; label: string;
  placeholder?: string; width?: number; mono?: boolean;
}) {
  const draft = useInspectorDraft(identity, value, readCurrent, onCommit);
  return <input className="iface-ip" aria-label={label} placeholder={placeholder}
    style={{ fontFamily: mono ? undefined : 'inherit', width }} value={draft.value}
    onChange={(e) => draft.onChange(e.target.value)} onBlur={draft.commit}
    onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) e.currentTarget.blur(); }} />;
}

function servicePortsValue(deviceId: string, proto: 'tcp' | 'udp'): string | undefined {
  const device = sim.net.devices.get(deviceId);
  return device instanceof IpDevice ? sortedServicePorts(device.services[proto]).join(', ') : undefined;
}

function InspectorSettingTextarea({ identity, value, readCurrent, onCommit, label, placeholder }: {
  identity: string; value: string; readCurrent: () => string | undefined;
  onCommit: (text: string) => string | null | void; label: string; placeholder?: string;
}) {
  const draft = useInspectorDraft(identity, value, readCurrent, onCommit);
  return <textarea className="svc-textarea" aria-label={label} placeholder={placeholder}
    value={draft.value} onChange={(e) => draft.onChange(e.target.value)} onBlur={draft.commit} />;
}

function dhcpFieldValue(id: string, field: 'rangeStart' | 'rangeEnd' | 'router' | 'dns'): string | undefined {
  const d = sim.net.devices.get(id), c = d instanceof IpDevice ? d.dhcpServer : null;
  return c ? c[field] === null ? '' : ipToString(c[field]) : undefined;
}
function dnsRecordsValue(id: string): string | undefined {
  const d = sim.net.devices.get(id), c = d instanceof IpDevice ? d.dnsServer : null;
  return c ? sortedDnsRecords(c.records).map(([name, addr]) => ipToString(addr) + ' ' + name).join('\n') : undefined;
}

function DhcpPanel({ device }: { device: IpDevice }) {
  const toggle = useStore((s) => s.toggleDhcpServer), setField = useStore((s) => s.setDhcpField);
  const cfg = device.dhcpServer;
  return (
    <details className="svc" open={cfg?.enabled}>
      <summary>DHCP server <span className={`svc-state ${cfg?.enabled ? 'on' : ''}`}>{cfg?.enabled ? 'on' : 'off'}</span></summary>
      <label className="svc-toggle">
        <input type="checkbox" checked={cfg?.enabled ?? false} onChange={() => toggle(device.id)} />
        serve leases on this device
      </label>
      {cfg && <>
        <div className="svc-grid">
          {(['rangeStart', 'rangeEnd', 'router', 'dns'] as const).map((field) => <Fragment key={field}>
            <span>{field === 'rangeStart' ? 'range' : field === 'rangeEnd' ? 'to' : field}</span>
            <InspectorSettingInput identity={device.id + ':dhcp:' + field} label={'DHCP ' + field}
              value={dhcpFieldValue(device.id, field) ?? ''}
              readCurrent={() => dhcpFieldValue(device.id, field)}
              placeholder={field === 'router' || field === 'dns' ? 'none advertised' : undefined}
              onCommit={(text) => setField(device.id, field, text)} />
          </Fragment>)}
        </div>
        {cfg.leases.size > 0 && <pre className="table-pre">{[...cfg.leases.entries()].map(([mac, ip]) => mac + '  ' + ipToString(ip) + '\n').join('')}</pre>}
        <span className="hint">Clients run &#96;dhclient&#96; to get a lease.</span>
      </>}
    </details>
  );
}

function DnsPanel({ device }: { device: IpDevice }) {
  const toggle = useStore((s) => s.toggleDnsServer), setRecords = useStore((s) => s.setDnsRecords);
  const cfg = device.dnsServer;
  return (
    <details className="svc" open={cfg?.enabled}>
      <summary>DNS server <span className={`svc-state ${cfg?.enabled ? 'on' : ''}`}>{cfg?.enabled ? 'on' : 'off'}</span></summary>
      <label className="svc-toggle">
        <input type="checkbox" checked={cfg?.enabled ?? false} onChange={() => toggle(device.id)} />
        answer A-record queries on udp/53
      </label>
      {cfg && <>
        <InspectorSettingTextarea identity={device.id + ':dns:records'} label="DNS A records"
          placeholder={'records, /etc/hosts style:\n10.0.0.20 web.lan'}
          value={dnsRecordsValue(device.id) ?? ''} readCurrent={() => dnsRecordsValue(device.id)}
          onCommit={(text) => setRecords(device.id, text)} />
        <span className="hint">One record per line: &lt;ip&gt; &lt;name&gt; ? query with &#96;dig&#96;.</span>
      </>}
    </details>
  );
}

function HttpPanel({ device }: { device: IpDevice }) {
  const toggle = useStore((s) => s.toggleHttpServer), setPort = useStore((s) => s.setHttpPort), setBody = useStore((s) => s.setHttpBody);
  const cfg = device.httpServer;
  return (
    <details className="svc" open={cfg?.enabled}>
      <summary>Web server <span className={`svc-state ${cfg?.enabled ? 'on' : ''}`}>{cfg?.enabled ? 'on' : 'off'}</span></summary>
      <label className="svc-toggle">
        <input type="checkbox" checked={cfg?.enabled ?? false} onChange={() => toggle(device.id)} />
        serve HTTP
      </label>
      {cfg && <>
        <div className="svc-grid">
          <span>port</span>
          <InspectorSettingInput identity={device.id + ':http:port'} label="HTTP port" value={String(cfg.port)} width={70}
            readCurrent={() => { const d = sim.net.devices.get(device.id); return d instanceof IpDevice && d.httpServer ? String(d.httpServer.port) : undefined; }}
            onCommit={(text) => setPort(device.id, text)} />
        </div>
        <InspectorSettingTextarea identity={device.id + ':http:body'} label="HTTP response body" value={cfg.body}
          readCurrent={() => { const d = sim.net.devices.get(device.id); return d instanceof IpDevice ? d.httpServer?.body : undefined; }}
          onCommit={(text) => setBody(device.id, text)} />
        <span className="hint">Fetch it with &#96;curl http://&lt;address&gt;/&#96;.</span>
      </>}
    </details>
  );
}

function ServicesRow({ deviceId, proto }: { deviceId: string; proto: 'tcp' | 'udp' }) {
  const setServices = useStore((s) => s.setServices);

  return (
    <div className="service-row">
      <span className="service-proto">{proto}</span>
      <InspectorSettingInput
        identity={`${deviceId}:${proto}`} label={`Additional ${proto.toUpperCase()} ports`}
        value={servicePortsValue(deviceId, proto) ?? ''}
        readCurrent={() => servicePortsValue(deviceId, proto)}
        onCommit={(text) => setServices(deviceId, proto, text)}
        placeholder="open ports, e.g. 22, 80"
      />
    </div>
  );
}



export function HostOverview({ device, editing = null, onEdit, editorSlot }: {
  device: Host; editing?: string | null; onEdit: (ifaceName: string | null) => void; editorSlot?: RefObject<HTMLDivElement>;
}) {
  return <section className="host-overview">
    <label className="host-field-label">Name<DeviceName deviceId={device.id} name={device.name} /></label>
    <label className="host-os-setting">Betriebssystem
      <select aria-label="Betriebssystem" value={device.os} onChange={(e) => useStore.getState().setHostOs(device.id, e.target.value as HostOs)}>
        <option value="linux">Linux</option><option value="windows">Windows (CMD)</option>
      </select>
    </label>
    <h3>Schnittstellen</h3>
    {device.interfaces.map((iface) => {
      const gateways = hostGatewaySummary(device, iface), dns = hostDnsSummary(device, iface);
      return <div key={iface.name} className="host-interface-summary">
        <div className="host-interface-status"><strong>{iface.name}</strong>
          <span className={iface.up ? 'is-up' : 'is-down'}>{iface.up ? 'UP' : 'DOWN'}</span>
          {!iface.link && <span>Kein Kabel</span>}
          <span className="host-ipv4-mode">{{ static: 'Static', dhcp: 'DHCP', unconfigured: 'Unconfigured' }[iface.ipv4Mode]}</span>
        </div>
        <div className="host-summary-edit-row"><dl className="host-ipv4-summary">
          <dt>IPv4</dt><dd>{iface.ip ? `${ipToString(iface.ip.addr)}/${iface.ip.prefix}` : '—'}</dd>
          <dt>Subnetzmaske</dt><dd>{iface.ip ? ipToString(maskOf(iface.ip.prefix)) : '—'}</dd>
          <dt>Gateway</dt><dd>{gateways.length ? gateways.map((gateway, index) => <span className="host-network-value" key={index}>
            {ipToString(gateway.value)}<small>{gateway.source}</small></span>) : '—'}</dd>
          <dt>DNS (effektiv)</dt><dd>{dns ? <span className="host-network-value">{ipToString(dns.value)}<small>{dns.source}</small></span> : '—'}</dd>
        </dl>
        <button type="button" className="host-edit-network" aria-expanded={editing === iface.name}
          onClick={() => onEdit(editing === iface.name ? null : iface.name)} aria-label={`Bearbeiten ${iface.name}`}>
          <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <path d="m12 3 5 5M3 17l4-1L17 6a2 2 0 0 0-3-3L4 13Z" />
          </svg>Bearbeiten
        </button></div>
        {iface.ipv4Mode === 'dhcp' && <span className="hint">{iface.cancelDhcp ? 'DHCP-Anfrage läuft…'
          : iface.dhcpLease ? 'Lease aktiv' : 'Kein aktives Lease'}</span>}
        {editing === iface.name && <div className="host-quick-editor" ref={editorSlot} />}
      </div>;
    })}
    <div className="host-quick-actions">
      <details className="host-quick-arp"><summary>ARP-Tabelle</summary><ArpTable device={device} /></details>
      <button type="button" className="mini-btn" onClick={() => useStore.getState().openTerminal(device.id)}>Terminal</button>
    </div>
  </section>;
}

function HostInspector({ device, hidden }: { device: Host; hidden: boolean }) {
  const [active, setActive] = useState('general');
  const [editing, setEditing] = useState<string | null>(null);
  const quickSlot = useRef<HTMLDivElement>(null);
  const networkSlots = useRef(new Map<string, RefObject<HTMLDivElement>>());
  for (const iface of device.interfaces) if (!networkSlots.current.has(iface.name)) networkSlots.current.set(iface.name, createRef<HTMLDivElement>());
  return <aside className="inspector host-inspector" hidden={hidden} aria-label="Host Inspector">
    <div className="inspector-head host-inspector-head"><strong>{device.name}</strong>
      <span className="inspector-kind kind-host">{device.os === 'windows' ? 'Windows' : 'Linux'} · Host</span>
    </div>
    <InspectorTabs active={active} onChange={setActive} tabs={[
      { id: 'general', label: 'Allgemein', content: <HostOverview device={device} editing={editing} onEdit={setEditing} editorSlot={quickSlot} /> },
      { id: 'network', label: 'Netzwerk', content: <>
        <section><h3>Interfaces · IPv4</h3>
          {device.interfaces.map((iface) => <div key={iface.name} ref={networkSlots.current.get(iface.name)} />)}
        </section>
        <details className="host-inspector-details"><summary>Routing-Tabelle</summary>
          <RoutingTable device={device} />
        </details>
        <details className="host-inspector-details"><summary>ARP-Tabelle</summary>
          <ArpTable device={device} />
        </details>
        <details className="host-inspector-details"><summary>DNS global override</summary>
          <div className="svc-grid"><span>nameserver</span>
            <InspectorSettingInput identity={`${device.id}:nameserver`} label="DNS client nameserver"
              value={device.manualNameserver === null ? '' : ipToString(device.manualNameserver)}
              readCurrent={() => { const d = sim.net.devices.get(device.id); return d instanceof IpDevice ? d.manualNameserver === null ? '' : ipToString(d.manualNameserver) : undefined; }}
              placeholder="none (use interface DNS)" onCommit={(text) => useStore.getState().setNameserver(device.id, text)} />
          </div>
        </details>
        <details className="host-inspector-details"><summary>Erweiterte Einstellungen · Dienste</summary>
          <DhcpPanel device={device} /><DnsPanel device={device} /><HttpPanel device={device} />
          <h3>Extra open ports</h3>
          <ServicesRow deviceId={device.id} proto="tcp" /><ServicesRow deviceId={device.id} proto="udp" />
          <span className="hint">Open ports answer TCP connects / accept UDP; test them with nc.</span>
        </details>
      </> },
      { id: 'security', label: 'Sicherheit', content: <>
        <section><h3>Simulierte Firewall (NetLab)</h3>
          <p className="hint host-firewall-note">{device.os === 'windows'
            ? 'NetLab-Paketfilter, kein Windows Defender Firewall. Regeln werden im nftables-Format dargestellt/exportiert.'
            : 'NetLab-Paketfilter. Regeln werden im nftables-Format dargestellt/exportiert.'}</p>
          <button type="button" className="mini-btn" title="Export im nftables-Format"
            onClick={() => useStore.getState().copyDeviceConfig(device.id)}>Copy firewall config</button>
          <pre className="table-pre">{listRuleset(device.fw) || '(keine Regeln)\n'}</pre>
        </section>
        <details className="host-inspector-details"><summary>Conntrack</summary>
          <pre className="table-pre">{formatConntrack(device) || '(empty)\n'}</pre>
        </details>
        <details className="host-inspector-details"><summary>Firewall log (latest first)</summary>
          <pre className="table-pre fw-log">{device.fwLog.slice(0, 12).map((e) =>
            `${(e.t / 1000).toFixed(1)}s ${e.hook.toUpperCase()} ${e.verdict.toUpperCase()} ${e.pkt}\n    ← ${e.rule}\n`).join('') || '(empty)\n'}</pre>
        </details>
      </> },
    ]} />
    {device.interfaces.map((iface) => <PersistentInspectorContent key={iface.name}
      target={active === 'general' && editing === iface.name ? quickSlot : networkSlots.current.get(iface.name)!}>
      <InterfaceIpv4Panel deviceId={device.id} ifaceName={iface.name} />
    </PersistentInspectorContent>)}
    <div className="inspector-actions"><button type="button" className="btn danger"
      onClick={() => useStore.getState().deleteDevice(device.id)}>Delete device</button></div>
  </aside>;
}

export function OverviewServices({ device, onServices }: { device: IpDevice; onServices?: () => void }) {
  return <>
    <h3>Dienste</h3>
    <dl className="overview-service-summary">
      {([
        ['DHCP', device.dhcpServer?.enabled, 'toggleDhcpServer'],
        ['DNS', device.dnsServer?.enabled, 'toggleDnsServer'],
        ['HTTP', device.httpServer?.enabled, 'toggleHttpServer'],
      ] as const).map(([name, enabled, action]) => <Fragment key={name}>
        <dt>{name} Server</dt><dd><button type="button" role="switch" aria-label={`${name} Server`}
          aria-checked={!!enabled} className="overview-service-toggle"
          onClick={() => useStore.getState()[action](device.id)}>
          <span className="service-switch-track" aria-hidden="true"><span /></span>
          <span className="service-switch-state">{enabled ? 'AN' : 'AUS'}</span>
        </button></dd>
      </Fragment>)}
    </dl>
    {onServices && <button type="button" className="mini-btn" onClick={onServices}>Dienste bearbeiten</button>}
  </>;
}

export function OverviewInterface({ iface, onEdit, showMode = false }: {
  iface: NetInterface; onEdit: (name: string) => void; showMode?: boolean;
}) {
  const { link } = interfaceConnection(iface);
  return <div className="overview-interface-summary" data-interface-name={iface.name}
    data-device-id={iface.device.id} data-link-id={link?.id}>
    <div><div className="host-interface-status"><strong className="overview-interface-name">{iface.name}</strong>
      <span className={iface.up ? 'is-up' : 'is-down'} aria-label={`Administrativer Zustand ${iface.name}: ${iface.up ? 'UP' : 'DOWN'}`}>Admin: {iface.up ? 'UP' : 'DOWN'}</span>
      {showMode && <span>{{ static: 'Static', dhcp: 'DHCP', unconfigured: 'Unconfigured' }[iface.ipv4Mode]}</span>}
    </div>
    <code>{iface.ip ? `${ipToString(iface.ip.addr)}/${iface.ip.prefix}` : 'Kein IPv4'}</code>
    <InterfaceConnection iface={iface} /></div>
    <button type="button" className="mini-btn" aria-label={`Bearbeiten ${iface.name}`} onClick={() => onEdit(iface.name)}>Bearbeiten</button>
  </div>;
}

export function RouterOverview({ device, onEdit, onServices }: { device: RouterDevice; onEdit: (iface: string) => void; onServices?: () => void }) {
  const connected = device.interfaces.filter(iface => iface.link).length;
  return <section className="router-overview">
    <label className="host-field-label">Name<DeviceName deviceId={device.id} name={device.name} /></label>
    <p className="router-summary-status">{connected} von {device.interfaces.length} Schnittstellen verbunden<br />
      IP-Forwarding: <strong>{device.forwarding ? 'Aktiv' : 'Inaktiv'}</strong> · RIP: <strong>{device.ripEnabled ? 'Aktiv' : 'Inaktiv'}</strong>
    </p>
    {device.interfaces.map(iface => <OverviewInterface key={iface.name} iface={iface} onEdit={onEdit} />)}
    <OverviewServices device={device} onServices={onServices} />
  </section>;
}

function RouterInspector({ device, hidden }: { device: RouterDevice; hidden: boolean }) {
  const [active, setActive] = useState('general');
  const [editTarget, setEditTarget] = useState<string | null>(null);
  const interfaces = useRef(new Map<string, HTMLDetailsElement>());
  useEffect(() => {
    if (active !== 'interfaces' || !editTarget) return;
    const section = interfaces.current.get(editTarget);
    if (section) {
      section.open = true;
      section.querySelector<HTMLInputElement>('input:not([readonly])')?.focus({ preventScroll: true });
      section.scrollIntoView({ block: 'nearest' });
    }
    setEditTarget(null);
  }, [active, editTarget]);
  return <aside className="inspector router-inspector" hidden={hidden} aria-label="Router Inspector">
    <div className="inspector-head router-inspector-head"><strong>{device.name}</strong>
      <span className="inspector-kind kind-router">Router</span>
    </div>
    <InspectorTabs label="Router-Einstellungen" active={active} onChange={setActive} tabs={[
      { id: 'general', label: 'Allgemein', content: <RouterOverview device={device} onEdit={iface => {
        setEditTarget(iface); setActive('interfaces');
      }} onServices={() => setActive('services')} /> },
      { id: 'interfaces', label: 'Interfaces', content: <section>
        {device.interfaces.map((iface, index) => <details key={iface.name} className="router-interface-editor" open={index === 0}
          ref={element => { if (element) interfaces.current.set(iface.name, element); else interfaces.current.delete(iface.name); }}>
          <summary><strong>{iface.name}</strong><span>{iface.ip ? `${ipToString(iface.ip.addr)}/${iface.ip.prefix}` : 'Kein IPv4'} · {iface.up ? 'UP' : 'DOWN'}</span></summary>
          <InterfaceIpv4Panel deviceId={device.id} ifaceName={iface.name} />
        </details>)}
      </section> },
      { id: 'routing', label: 'Routing', content: <section>
        <p className="hint">IP-Forwarding: <strong>{device.forwarding ? 'Aktiv' : 'Inaktiv'}</strong> · {device.routes().length} Routen</p>
        <label className="svc-toggle"><input type="checkbox" checked={device.ripEnabled}
          onChange={() => useStore.getState().toggleRip(device.id)} />RIP aktivieren</label>
        <h3>Routing-Tabelle</h3><RoutingTable device={device} />
        <span className="hint">Statische Routen über das Terminal: <code>ip route</code>.</span>
        <h3>ARP-Tabelle</h3><ArpTable device={device} />
      </section> },
      { id: 'services', label: 'Dienste', content: <>
        <DhcpPanel device={device} /><DnsPanel device={device} /><HttpPanel device={device} />
        <details className="router-inspector-details"><summary>Zusätzliche TCP/UDP-Ports</summary>
          <ServicesRow deviceId={device.id} proto="tcp" /><ServicesRow deviceId={device.id} proto="udp" />
        </details>
        <details className="router-inspector-details"><summary>DNS global override</summary>
          <div className="svc-grid"><span>nameserver</span>
            <InspectorSettingInput identity={`${device.id}:nameserver`} label="DNS client nameserver"
              value={device.manualNameserver === null ? '' : ipToString(device.manualNameserver)}
              readCurrent={() => { const d = sim.net.devices.get(device.id); return d instanceof IpDevice ? d.manualNameserver === null ? '' : ipToString(d.manualNameserver) : undefined; }}
              placeholder="none (use interface DNS)" onCommit={text => useStore.getState().setNameserver(device.id, text)} />
          </div>
        </details>
      </> },
      { id: 'firewall', label: 'Firewall', content: <>
        <section><h3>Firewall (nftables)</h3>
          <button type="button" className="mini-btn" onClick={() => useStore.getState().copyDeviceConfig(device.id)}>Copy config</button>
          <pre className="table-pre">{listRuleset(device.fw) || '(keine Regeln)\n'}</pre>
        </section>
        <details className="router-inspector-details"><summary>Conntrack</summary>
          <pre className="table-pre">{formatConntrack(device) || '(empty)\n'}</pre>
        </details>
        <details className="router-inspector-details"><summary>Firewall logs</summary>
          <pre className="table-pre fw-log">{device.fwLog.slice(0, 12).map(e =>
            `${(e.t / 1000).toFixed(1)}s ${e.hook.toUpperCase()} ${e.verdict.toUpperCase()} ${e.pkt}\n    ← ${e.rule}\n`).join('') || '(empty)\n'}</pre>
        </details>
      </> },
    ]} />
    <div className="inspector-actions">
      <button type="button" className="btn danger" onClick={() => useStore.getState().deleteDevice(device.id)}>Delete device</button>
    </div>
  </aside>;
}

export function ServerOverview({ device, onEdit, onServices }: {
  device: ServerDevice; onEdit: (iface: string) => void; onServices: () => void;
}) {
  return <section>
    <label className="host-field-label">Name<DeviceName deviceId={device.id} name={device.name} /></label>
    <h3>Schnittstellen</h3>
    {device.interfaces.map(iface => <OverviewInterface key={iface.name} iface={iface} onEdit={onEdit} showMode />)}
    <OverviewServices device={device} onServices={onServices} />
  </section>;
}

function ServerInspector({ device, hidden }: { device: ServerDevice; hidden: boolean }) {
  const [active, setActive] = useState('general');
  const [editTarget, setEditTarget] = useState<string | null>(null);
  const interfaces = useRef(new Map<string, HTMLDivElement>());
  useEffect(() => {
    if (active !== 'network' || !editTarget) return;
    const section = interfaces.current.get(editTarget);
    section?.querySelector<HTMLInputElement>('input:not([readonly])')?.focus({ preventScroll: true });
    section?.scrollIntoView({ block: 'nearest' });
    setEditTarget(null);
  }, [active, editTarget]);
  return <aside className="inspector server-inspector" hidden={hidden} aria-label="Server Inspector">
    <div className="inspector-head host-inspector-head"><strong>{device.name}</strong>
      <span className="inspector-kind kind-server">Server</span>
    </div>
    <InspectorTabs label="Server-Einstellungen" active={active} onChange={setActive} tabs={[
      { id: 'general', label: 'Allgemein', content: <ServerOverview device={device} onEdit={iface => {
        setEditTarget(iface); setActive('network');
      }} onServices={() => setActive('services')} /> },
      { id: 'network', label: 'Netzwerk', content: <>
        <section><h3>Interfaces · IPv4</h3>
          {device.interfaces.map(iface => <div key={iface.name}
            ref={element => { if (element) interfaces.current.set(iface.name, element); else interfaces.current.delete(iface.name); }}>
            <InterfaceIpv4Panel deviceId={device.id} ifaceName={iface.name} />
          </div>)}
        </section>
        <details className="host-inspector-details"><summary>Routing-Tabelle</summary><RoutingTable device={device} /></details>
        <details className="host-inspector-details"><summary>ARP-Tabelle</summary><ArpTable device={device} /></details>
        <details className="host-inspector-details"><summary>DNS global override</summary>
          <div className="svc-grid"><span>nameserver</span>
            <InspectorSettingInput identity={`${device.id}:nameserver`} label="DNS client nameserver"
              value={device.manualNameserver === null ? '' : ipToString(device.manualNameserver)}
              readCurrent={() => { const d = sim.net.devices.get(device.id); return d instanceof IpDevice ? d.manualNameserver === null ? '' : ipToString(d.manualNameserver) : undefined; }}
              placeholder="none (use interface DNS)" onCommit={text => useStore.getState().setNameserver(device.id, text)} />
          </div>
        </details>
        <details className="host-inspector-details"><summary>Erweiterte Netzwerkinformationen</summary>
          <p className="hint">IP forwarding: <strong>{device.forwarding ? 'on' : 'off'}</strong> (sysctl net.ipv4.ip_forward)</p>
          <span className="hint">IPv4 wird pro Schnittstelle konfiguriert. Statische Routen und der globale DNS-Override bleiben unabhängig.</span>
        </details>
      </> },
      { id: 'services', label: 'Dienste', content: <>
        <DhcpPanel device={device} /><DnsPanel device={device} /><HttpPanel device={device} />
        <details className="host-inspector-details"><summary>Zusätzliche TCP/UDP-Ports</summary>
          <ServicesRow deviceId={device.id} proto="tcp" /><ServicesRow deviceId={device.id} proto="udp" />
          <span className="hint">Open ports answer TCP connects / accept UDP; test them with nc.</span>
        </details>
      </> },
      { id: 'security', label: 'Sicherheit', content: <>
        <section><h3>Firewall (nftables)<FirewallInfo label="Firewall-Begriffe erklären"
          concepts={['nftables', 'INPUT', 'OUTPUT', 'FORWARD', 'Quelle', 'Ziel']} /></h3>
          <button type="button" className="mini-btn" onClick={() => useStore.getState().copyDeviceConfig(device.id)}>Copy firewall config</button>
          <pre className="table-pre">{listRuleset(device.fw) || '(keine Regeln)\n'}</pre>
        </section>
        <details className="host-inspector-details"><summary>Conntrack</summary>
          <div className="server-conntrack-help"><FirewallInfo label="Conntrack erklären" concepts={['Conntrack']} /></div>
          <pre className="table-pre">{formatConntrack(device) || '(empty)\n'}</pre>
        </details>
        <details className="host-inspector-details"><summary>Firewall log (latest first)</summary>
          <pre className="table-pre fw-log">{device.fwLog.slice(0, 12).map(e =>
            `${(e.t / 1000).toFixed(1)}s ${e.hook.toUpperCase()} ${e.verdict.toUpperCase()} ${e.pkt}\n    ← ${e.rule}\n`).join('') || '(empty)\n'}</pre>
        </details>
      </> },
    ]} />
    <div className="inspector-actions">
      <button type="button" className="btn danger" onClick={() => useStore.getState().deleteDevice(device.id)}>Delete device</button>
    </div>
  </aside>;
}

function SwitchPortSummary({ device, iface, onEdit }: { device: SwitchDevice; iface: NetInterface; onEdit: (port: string) => void }) {
  return <div className="overview-interface-summary">
    <div><div className="host-interface-status"><strong className="overview-interface-name">{iface.name}</strong>
      <span>VLAN {device.vlanOf(iface.name)}</span><span className={iface.up ? 'is-up' : 'is-down'}>Admin: {iface.up ? 'UP' : 'DOWN'}</span>
    </div><InterfaceConnection iface={iface} /></div>
    <button type="button" className="mini-btn" aria-label={`Port ${iface.name} bearbeiten`} onClick={() => onEdit(iface.name)}>Bearbeiten</button>
  </div>;
}

export function SwitchOverview({ device, onPort, onMac }: { device: SwitchDevice; onPort: (port: string) => void; onMac: () => void }) {
  const connected = device.interfaces.filter(iface => interfaceConnection(iface).link);
  const unplugged = device.interfaces.filter(iface => !interfaceConnection(iface).link);
  const vlans = [...new Set(device.interfaces.map(iface => device.vlanOf(iface.name)))].sort((a, b) => a - b);
  return <section>
    <label className="host-field-label">Name<DeviceName deviceId={device.id} name={device.name} /></label>
    <dl className="switch-overview-stats">
      <dt>Ports mit Kabel</dt><dd>{connected.length} von {device.interfaces.length}</dd>
      <dt>Port-VLANs</dt><dd>{vlans.join(', ')}</dd>
      <dt>Gelernte MACs</dt><dd>{device.macTable.size}</dd>
    </dl>
    <button type="button" className="mini-btn" onClick={onMac}>MAC-Tabelle anzeigen</button>
    <h3>Ports</h3>
    {connected.map(iface => <SwitchPortSummary key={iface.name} device={device} iface={iface} onEdit={onPort} />)}
    {!!unplugged.length && <details className="host-inspector-details"><summary>Ports ohne Verbindung ({unplugged.length})</summary>
      {unplugged.map(iface => <SwitchPortSummary key={iface.name} device={device} iface={iface} onEdit={onPort} />)}
    </details>}
  </section>;
}

function SwitchInspector({ device, hidden }: { device: SwitchDevice; hidden: boolean }) {
  const [active, setActive] = useState('general');
  const [target, setTarget] = useState<{ tab: 'ports' | 'vlan'; port: string } | null>(null);
  const ports = useRef(new Map<string, HTMLDetailsElement>());
  const vlans = useRef(new Map<string, HTMLDivElement>());
  useEffect(() => {
    if (!target || active !== target.tab) return;
    const element = target.tab === 'ports' ? ports.current.get(target.port) : vlans.current.get(target.port);
    if (element) {
      if (element instanceof HTMLDetailsElement) element.open = true;
      element.querySelector<HTMLElement>(target.tab === 'ports' ? 'button' : 'input')?.focus({ preventScroll: true });
      element.scrollIntoView({ block: 'nearest' });
    }
    setTarget(null);
  }, [active, target]);
  const edit = (tab: 'ports' | 'vlan', port: string) => { setActive(tab); setTarget({ tab, port }); };
  return <aside className="inspector switch-inspector" hidden={hidden} aria-label="Switch Inspector">
    <div className="inspector-head host-inspector-head"><strong>{device.name}</strong><span className="inspector-kind kind-switch">Switch</span></div>
    <InspectorTabs label="Switch-Einstellungen" active={active} onChange={setActive} tabs={[
      { id: 'general', label: 'Allgemein', content: <SwitchOverview device={device} onPort={port => edit('ports', port)} onMac={() => setActive('mac')} /> },
      { id: 'ports', label: 'Ports', content: <section><h3>Ports</h3>
        {device.interfaces.map(iface => <details key={iface.name} className="switch-port-details"
          ref={element => { if (element) ports.current.set(iface.name, element); else ports.current.delete(iface.name); }}>
          <summary><span className="switch-port-heading"><strong>{iface.name}</strong><span>VLAN {device.vlanOf(iface.name)}</span>
            <span>Admin: {iface.up ? 'UP' : 'DOWN'}</span></span><InterfaceConnection iface={iface} /></summary>
          <div className="iface-row"><button type="button" className={`iface-state ${iface.up ? 'up' : 'down'}`}
            aria-label={`Admin ${iface.name}`} aria-pressed={iface.up} onClick={() => useStore.getState().toggleIface(device.id, iface.name)}>{iface.up ? 'UP' : 'DOWN'}</button>
            <div className="iface-name">MAC-Adresse<code>{iface.mac}</code></div>
          </div>
          <button type="button" className="mini-btn" onClick={() => edit('vlan', iface.name)}>VLAN bearbeiten</button>
        </details>)}
      </section> },
      { id: 'vlan', label: 'VLAN', content: <section><h3>Access-VLANs<InfoTooltip label="Access-VLAN erklären">
        <dl><dt>Access-VLAN</dt><dd>Jeder Port gehört genau einem VLAN. Frames werden nur innerhalb desselben VLANs weitergeleitet.</dd>
          <dt>VLAN-ID</dt><dd>Nummer von 1 bis 4094. Ohne eigene Einstellung verwendet ein Port VLAN 1.</dd>
          <dt>Untagged</dt><dd>Frames tragen hier kein VLAN-Tag. Der Simulator ordnet sie intern anhand des Ports einem VLAN zu.</dd></dl>
      </InfoTooltip></h3>
        {device.interfaces.map(iface => <div key={iface.name} className="switch-vlan-row"
          ref={element => { if (element) vlans.current.set(iface.name, element); else vlans.current.delete(iface.name); }}>
          <div><strong>{iface.name}</strong><InterfaceConnection iface={iface} /></div>
          <InspectorSettingInput identity={`${device.id}:${iface.name}:vlan`} label={`Access VLAN for ${iface.name}`}
            value={String(device.vlanOf(iface.name))} width={68}
            readCurrent={() => { const current = sim.net.devices.get(device.id); return current instanceof SwitchDevice && current.getInterface(iface.name) ? String(current.vlanOf(iface.name)) : undefined; }}
            onCommit={text => useStore.getState().setPortVlan(device.id, iface.name, text)} />
        </div>)}
      </section> },
      { id: 'mac', label: 'MAC-Tabelle', content: <section><h3>MAC-Tabelle</h3><MacTable device={device} /></section> },
    ]} />
    <div className="inspector-actions"><button type="button" className="btn danger" onClick={() => useStore.getState().deleteDevice(device.id)}>Delete device</button></div>
  </aside>;
}

export function Inspector({ hidden = false }: { hidden?: boolean }) {
  const selected = useStore((s) => s.selected);
  const deleteDevice = useStore((s) => s.deleteDevice);
  const openTerminal = useStore((s) => s.openTerminal);
  useStore((s) => s.uiPulse); // live tables refresh a few times a second
  useStore((s) => s.nodes); // re-render after refresh()

  if (!selected) return null;
  const device = sim.net.devices.get(selected);
  if (!device) return null;
  if (device instanceof Host) return <HostInspector key={device.id} device={device} hidden={hidden} />;
  if (device instanceof RouterDevice) return <RouterInspector key={device.id} device={device} hidden={hidden} />;
  if (device instanceof ServerDevice) return <ServerInspector key={device.id} device={device} hidden={hidden} />;
  if (device instanceof SwitchDevice && device.kind === 'switch') return <SwitchInspector key={device.id} device={device} hidden={hidden} />;

  const ipd = device instanceof IpDevice ? device : null;
  const swd = device instanceof SwitchDevice ? device : null;

  return (
    <aside className="inspector" hidden={hidden}>
      <div className="inspector-head">
        <DeviceName key={device.id} deviceId={device.id} name={device.name} />
        <span className={`inspector-kind kind-${device.kind}`}>{device.kind}</span>
      </div>
      {ipd && !(device instanceof Host) && (
        <div className="inspector-forwarding">
          IP forwarding: <strong>{ipd.forwarding ? 'on' : 'off'}</strong>
          <span className="hint"> (sysctl net.ipv4.ip_forward)</span>
        </div>
      )}

      {ipd && (device.kind === 'router' || device.kind === 'firewall') && (
        <label className="svc-toggle" style={{ margin: 0 }}>
          <input
            type="checkbox"
            checked={ipd.ripEnabled}
            onChange={() => useStore.getState().toggleRip(device.id)}
          />
          RIP routing — advertise &amp; learn routes (udp/520 broadcasts)
        </label>
      )}

      {swd instanceof ApDevice && (
        <div className="svc-grid">
          <span>SSID</span>
          <InspectorSettingInput
            key={device.id} identity={`${device.id}:ssid`} label="Access point SSID"
            value={swd.ssid}
            readCurrent={() => { const d = sim.net.devices.get(device.id); return d instanceof ApDevice ? d.ssid : undefined; }}
            onCommit={(t) => useStore.getState().setSsid(device.id, t)}
            mono={false}
          />
        </div>
      )}

      <section>
        <h3>Interfaces</h3>
        {device.interfaces.map((i) => (
          <InterfaceIpv4Panel
            key={device.id + ':' + i.name}
            deviceId={device.id}
            ifaceName={i.name}
          />
        ))}
      </section>

      {ipd && (
        <section>
          <h3>Routing-Tabelle</h3>
          <RoutingTable device={ipd} />
          <h3>ARP-Tabelle</h3>
          <ArpTable device={ipd} />
        </section>
      )}

      {ipd && (
        <section>
          <h3>DNS client (global override)</h3>
          <div className="svc-grid">
            <span>nameserver</span>
            <InspectorSettingInput
              key={ipd.id} identity={`${ipd.id}:nameserver`} label="DNS client nameserver"
              value={ipd.manualNameserver !== null ? ipToString(ipd.manualNameserver) : ''}
              readCurrent={() => { const d = sim.net.devices.get(ipd.id); return d instanceof IpDevice ? d.manualNameserver === null ? '' : ipToString(d.manualNameserver) : undefined; }}
              placeholder="none (use interface DNS)"
              onCommit={(t) => useStore.getState().setNameserver(ipd.id, t)}
            />
          </div>
        </section>
      )}

      {ipd && (
        <section>
          <h3>Services</h3>
          <DhcpPanel key={ipd.id + 'dhcp'} device={ipd} />
          <DnsPanel key={ipd.id + 'dns'} device={ipd} />
          <HttpPanel key={ipd.id + 'http'} device={ipd} />
          <h3 style={{ marginTop: 10 }}>Extra open ports</h3>
          <ServicesRow key={ipd.id + 'tcp'} deviceId={ipd.id} proto="tcp" />
          <ServicesRow key={ipd.id + 'udp'} deviceId={ipd.id} proto="udp" />
          <span className="hint">Open ports answer TCP connects / accept UDP; test them with nc.</span>
        </section>
      )}

      {ipd && (
        <section>
          <h3>
            Firewall (nftables)
            <button className="mini-btn" onClick={() => useStore.getState().copyDeviceConfig(ipd.id)}>
              copy config
            </button>
          </h3>
          <pre className="table-pre">{listRuleset(ipd.fw)}</pre>
          {ipd.fw.active() && (
            <>
              <h3>Conntrack</h3>
              <pre className="table-pre">{formatConntrack(ipd)}</pre>
            </>
          )}
          {ipd.fwLog.length > 0 && (
            <>
              <h3>Firewall log (latest first)</h3>
              <pre className="table-pre fw-log">
                {ipd.fwLog
                  .slice(0, 12)
                  .map(
                    (e) =>
                      `${(e.t / 1000).toFixed(1)}s ${e.hook.toUpperCase()} ${e.verdict.toUpperCase()} ${e.pkt}\n    ← ${e.rule}\n`,
                  )
                  .join('')}
              </pre>
            </>
          )}
        </section>
      )}

      {swd && (
        <section>
          <h3>Port VLANs (access)</h3>
          {swd.interfaces
            .filter((i) => i.link)
            .map((i) => (
              <div className="service-row" key={device.id + ':' + i.name}>
                <span className="service-proto">{i.name}</span>
                <span className="hint" style={{ width: 90 }}>
                  → {sim.net.links.get(i.link!.id) ? i.link!.other(i).device.name : '?'}
                </span>
                <InspectorSettingInput
                  identity={`${device.id}:${i.name}:vlan`} label={`Access VLAN for ${i.name}`}
                  value={String(swd.vlanOf(i.name))}
                  readCurrent={() => { const d = sim.net.devices.get(device.id); return d instanceof SwitchDevice && d.getInterface(i.name) ? String(d.vlanOf(i.name)) : undefined; }}
                  onCommit={(t) => useStore.getState().setPortVlan(device.id, i.name, t)}
                  width={64}
                />
              </div>
            ))}
          {swd.interfaces.every((i) => !i.link) && <span className="hint">no connected ports</span>}
          <h3 style={{ marginTop: 10 }}>MAC-Tabelle</h3>
          <MacTable device={swd} />
        </section>
      )}

      {ipd && (
        <section className="inspector-arp-note">
          <span className="hint">
            IPv4 wird pro Schnittstelle konfiguriert. Explizite statische Routen und der globale DNS-Override bleiben unabh?ngig.
          </span>
        </section>
      )}

      <div className="inspector-actions">
        {ipd && (
          <button className="btn" onClick={() => openTerminal(device.id)}>
            Open terminal
          </button>
        )}
        <button className="btn danger" onClick={() => deleteDevice(device.id)}>
          Delete device
        </button>
      </div>
    </aside>
  );
}
