import { useState } from 'react';
import { useStore } from '../store';
import { sim } from '../sim';
import { IpDevice } from '../engine/ipdevice';
import { ApDevice, SwitchDevice } from '../engine/switch';
import { cidrToString, ipToString } from '../engine/ip';
import { formatNeigh, formatRoutes } from '../commands/ip-cmd';
import { formatConntrack } from '../commands/shell';
import { listRuleset } from '../engine/firewall-fmt';
import { CopyIpButton } from './CopyIpButton';
import { newInspectorDraft, syncInspectorDraft } from '../inspectorDraft';
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

// A small controlled input that commits on blur/Enter and reverts on error.
function CommitInput({
  value,
  placeholder,
  onCommit,
  mono = true,
  width,
}: {
  value: string;
  placeholder?: string;
  onCommit: (text: string) => string | null | void;
  mono?: boolean;
  width?: number | string;
}) {
  const setNotice = useStore((s) => s.setNotice);
  const [text, setText] = useState(value);
  const commit = () => {
    if (text.trim() === value) return;
    const err = onCommit(text) ?? null;
    if (err) {
      setNotice(err);
      setText(value);
    }
  };
  return (
    <input
      className="iface-ip"
      style={{ fontFamily: mono ? undefined : 'inherit', width }}
      placeholder={placeholder}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

function DhcpPanel({ device }: { device: IpDevice }) {
  const toggle = useStore((s) => s.toggleDhcpServer);
  const setField = useStore((s) => s.setDhcpField);
  const cfg = device.dhcpServer;
  return (
    <details className="svc" open={cfg?.enabled}>
      <summary>
        DHCP server <span className={`svc-state ${cfg?.enabled ? 'on' : ''}`}>{cfg?.enabled ? 'on' : 'off'}</span>
      </summary>
      <label className="svc-toggle">
        <input type="checkbox" checked={cfg?.enabled ?? false} onChange={() => toggle(device.id)} />
        serve leases on this device
      </label>
      {cfg && (
        <>
          <div className="svc-grid">
            <span>range</span>
            <CommitInput
              key={device.id + ipToString(cfg.rangeStart)}
              value={ipToString(cfg.rangeStart)}
              onCommit={(t) => setField(device.id, 'rangeStart', t)}
            />
            <span>to</span>
            <CommitInput
              key={device.id + ipToString(cfg.rangeEnd)}
              value={ipToString(cfg.rangeEnd)}
              onCommit={(t) => setField(device.id, 'rangeEnd', t)}
            />
            <span>router</span>
            <CommitInput
              key={device.id + (cfg.router ?? 'r')}
              value={cfg.router !== null ? ipToString(cfg.router) : ''}
              placeholder="none advertised"
              onCommit={(t) => setField(device.id, 'router', t)}
            />
            <span>dns</span>
            <CommitInput
              key={device.id + (cfg.dns ?? 'd')}
              value={cfg.dns !== null ? ipToString(cfg.dns) : ''}
              placeholder="none advertised"
              onCommit={(t) => setField(device.id, 'dns', t)}
            />
          </div>
          {cfg.leases.size > 0 && (
            <pre className="table-pre">
              {[...cfg.leases.entries()].map(([mac, ip]) => `${ipToString(ip)}  ${mac}\n`).join('')}
            </pre>
          )}
          <span className="hint">Clients run `dhclient` to get a lease.</span>
        </>
      )}
    </details>
  );
}

function DnsPanel({ device }: { device: IpDevice }) {
  const toggle = useStore((s) => s.toggleDnsServer);
  const setRecords = useStore((s) => s.setDnsRecords);
  const setNotice = useStore((s) => s.setNotice);
  const cfg = device.dnsServer;
  const current = cfg
    ? [...cfg.records.entries()].map(([n, a]) => `${ipToString(a)} ${n}`).join('\n')
    : '';
  const [text, setText] = useState(current);
  return (
    <details className="svc" open={cfg?.enabled}>
      <summary>
        DNS server <span className={`svc-state ${cfg?.enabled ? 'on' : ''}`}>{cfg?.enabled ? 'on' : 'off'}</span>
      </summary>
      <label className="svc-toggle">
        <input type="checkbox" checked={cfg?.enabled ?? false} onChange={() => toggle(device.id)} />
        answer A-record queries on udp/53
      </label>
      {cfg && (
        <>
          <textarea
            className="svc-textarea"
            placeholder={'records, /etc/hosts style:\n10.0.0.20 web.lan'}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => {
              if (text === current) return;
              const err = setRecords(device.id, text);
              if (err) {
                setNotice(err);
                setText(current);
              }
            }}
          />
          <span className="hint">One record per line: &lt;ip&gt; &lt;name&gt; — query with `dig`.</span>
        </>
      )}
    </details>
  );
}

function HttpPanel({ device }: { device: IpDevice }) {
  const toggle = useStore((s) => s.toggleHttpServer);
  const setPort = useStore((s) => s.setHttpPort);
  const setBody = useStore((s) => s.setHttpBody);
  const cfg = device.httpServer;
  const [body, setBodyText] = useState(cfg?.body ?? '');
  return (
    <details className="svc" open={cfg?.enabled}>
      <summary>
        Web server <span className={`svc-state ${cfg?.enabled ? 'on' : ''}`}>{cfg?.enabled ? 'on' : 'off'}</span>
      </summary>
      <label className="svc-toggle">
        <input type="checkbox" checked={cfg?.enabled ?? false} onChange={() => toggle(device.id)} />
        serve HTTP
      </label>
      {cfg && (
        <>
          <div className="svc-grid">
            <span>port</span>
            <CommitInput
              key={device.id + cfg.port}
              value={String(cfg.port)}
              onCommit={(t) => setPort(device.id, t)}
              width={70}
            />
          </div>
          <textarea
            className="svc-textarea"
            value={body}
            onChange={(e) => setBodyText(e.target.value)}
            onBlur={() => setBody(device.id, body)}
          />
          <span className="hint">Fetch it with `curl http://&lt;address&gt;/`.</span>
        </>
      )}
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

function IfaceRow({ deviceId, ifaceName }: { deviceId: string; ifaceName: string }) {
  const setIfaceIp = useStore((s) => s.setIfaceIp);
  const toggleIface = useStore((s) => s.toggleIface);
  const device = sim.net.devices.get(deviceId);
  const iface = device?.getInterface(ifaceName);
  const current = iface?.ip ? cidrToString(iface.ip.addr, iface.ip.prefix) : '';
  const draft = useInspectorDraft(`${deviceId}:${ifaceName}`, current, () => {
    const latest = sim.net.devices.get(deviceId)?.getInterface(ifaceName);
    return latest ? latest.ip ? cidrToString(latest.ip.addr, latest.ip.prefix) : '' : undefined;
  }, (text) => setIfaceIp(deviceId, ifaceName, text));

  if (!iface) return null;

  return (
    <div className="iface-row">
      <button
        className={`iface-state ${iface.up ? 'up' : 'down'}`}
        onClick={() => toggleIface(deviceId, ifaceName)}
        title={`ip link set ${ifaceName} ${iface.up ? 'down' : 'up'}`}
      >
        {iface.up ? 'UP' : 'DOWN'}
      </button>
      <div className="iface-name">
        {ifaceName}
        <span className="iface-mac">{iface.mac}</span>
        {iface.link ? null : <span className="iface-unplugged">unplugged</span>}
      </div>
      <input
        className="iface-ip"
        placeholder="no address (CIDR)"
        aria-label={`IPv4 address for ${device?.name} ${ifaceName}`}
        value={draft.value}
        onChange={(e) => draft.onChange(e.target.value)}
        onBlur={draft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) e.currentTarget.blur();
        }}
      />
      {iface.ip && <CopyIpButton address={ipToString(iface.ip.addr)} context={`${device?.name} ${ifaceName}`} />}
    </div>
  );
}

export function Inspector() {
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
    <aside className="inspector">
      <div className="inspector-head">
        <DeviceName key={device.id} deviceId={device.id} name={device.name} />
        <span className={`inspector-kind kind-${device.kind}`}>{device.kind}</span>
      </div>


      {ipd && (
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
          <IfaceRow
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
          <h3>DNS client</h3>
          <div className="svc-grid">
            <span>nameserver</span>
            <InspectorSettingInput
              key={ipd.id} identity={`${ipd.id}:nameserver`} label="DNS client nameserver"
              value={ipd.nameserver !== null ? ipToString(ipd.nameserver) : ''}
              readCurrent={() => { const d = sim.net.devices.get(ipd.id); return d instanceof IpDevice ? d.nameserver === null ? '' : ipToString(d.nameserver) : undefined; }}
              placeholder="none (set by dhclient)"
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
            Addresses set here run the same code as <code>ip address add</code> in the terminal.
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
