import { Fragment, useState } from 'react';
import { useStore } from '../store';
import { sim } from '../sim';
import { Host, IpDevice } from '../engine/ipdevice';
import type { HostOs } from '../hostOs';
import { ApDevice, SwitchDevice } from '../engine/switch';
import { ipToString } from '../engine/ip';
import { formatNeigh, formatRoutes } from '../commands/ip-cmd';
import { formatConntrack } from '../commands/shell';
import { listRuleset } from '../engine/firewall-fmt';
import { InterfaceIpv4Panel } from './InterfaceIpv4Panel';
import { newInspectorDraft, syncInspectorDraft } from '../inspectorDraft';
import { sortedDnsRecords } from '../topologyEdits';
import { sortedServicePorts } from '../topologyHistory';

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


export function Inspector({ hidden = false }: { hidden?: boolean }) {
  const selected = useStore((s) => s.selected);
  const deleteDevice = useStore((s) => s.deleteDevice);
  const openTerminal = useStore((s) => s.openTerminal);
  useStore((s) => s.uiPulse); // live tables refresh a few times a second
  useStore((s) => s.nodes); // re-render after refresh()

  if (!selected) return null;
  const device = sim.net.devices.get(selected);
  if (!device) return null;

  const ipd = device instanceof IpDevice ? device : null;
  const swd = device instanceof SwitchDevice ? device : null;

  return (
    <aside className="inspector" hidden={hidden}>
      <div className="inspector-head">
        <DeviceName key={device.id} deviceId={device.id} name={device.name} />
        <span className={`inspector-kind kind-${device.kind}`}>{device.kind}</span>
      </div>
      {device instanceof Host && <section>
        <label className="host-os-setting">Operating system
          <select value={device.os} onChange={(e) => useStore.getState().setHostOs(device.id, e.target.value as HostOs)}>
            <option value="linux">Linux</option><option value="windows">Windows (CMD)</option>
          </select>
        </label>
        <span className="hint">Active commands and typed input keep their shell until the next prompt.</span>
      </section>}


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
          <h3>Routing table</h3>
          <pre className="table-pre">{formatRoutes(ipd) || '(empty)\n'}</pre>
          <h3>Neighbours (ARP)</h3>
          <pre className="table-pre">{formatNeigh(ipd) || '(empty)\n'}</pre>
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
          <h3 style={{ marginTop: 10 }}>MAC address table</h3>
          <pre className="table-pre">
            {swd.macTable.size
              ? [...swd.macTable.entries()]
                  .map(([key, port]) => {
                    const [vlan, mac] = key.split('|');
                    return `vlan ${vlan.padEnd(5)}${mac}  ${port.name}\n`;
                  })
                  .join('')
              : '(empty — forward a frame to teach me)\n'}
          </pre>
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
