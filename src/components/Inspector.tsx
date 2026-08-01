import { useState } from 'react';
import { useStore } from '../store';
import { sim } from '../sim';
import { IpDevice } from '../engine/ipdevice';
import { ApDevice, SwitchDevice } from '../engine/switch';
import { cidrToString, ipToString } from '../engine/ip';
import { formatNeigh, formatRoutes } from '../commands/ip-cmd';
import { formatConntrack } from '../commands/shell';
import { listRuleset } from '../engine/firewall-fmt';

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
  const setNotice = useStore((s) => s.setNotice);
  const device = sim.net.devices.get(deviceId);
  const current = device instanceof IpDevice ? [...device.services[proto]].sort((a, b) => a - b).join(', ') : '';
  const [value, setValue] = useState(current);

  const commit = () => {
    if (value.trim() === current) return;
    const err = setServices(deviceId, proto, value);
    if (err) {
      setNotice(err);
      setValue(current);
    }
  };

  return (
    <div className="service-row">
      <span className="service-proto">{proto}</span>
      <input
        className="iface-ip"
        placeholder="open ports, e.g. 22, 80"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
      />
    </div>
  );
}

function IfaceRow({ deviceId, ifaceName }: { deviceId: string; ifaceName: string }) {
  const setIfaceIp = useStore((s) => s.setIfaceIp);
  const toggleIface = useStore((s) => s.toggleIface);
  const setNotice = useStore((s) => s.setNotice);
  const device = sim.net.devices.get(deviceId);
  const iface = device?.getInterface(ifaceName);
  const current = iface?.ip ? cidrToString(iface.ip.addr, iface.ip.prefix) : '';
  const [value, setValue] = useState(current);

  if (!iface) return null;

  const commit = () => {
    if (value.trim() === current) return;
    const err = setIfaceIp(deviceId, ifaceName, value);
    if (err) {
      setNotice(err);
      setValue(current);
    }
  };

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
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
      />
    </div>
  );
}

export function Inspector() {
  const selected = useStore((s) => s.selected);
  const renameDevice = useStore((s) => s.renameDevice);
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
        <input
          key={device.id + device.name}
          className="inspector-name"
          defaultValue={device.name}
          onBlur={(e) => renameDevice(device.id, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
        />
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
          <CommitInput
            key={device.id + swd.ssid}
            value={swd.ssid}
            onCommit={(t) => useStore.getState().setSsid(device.id, t)}
            mono={false}
          />
        </div>
      )}

      <section>
        <h3>Interfaces</h3>
        {device.interfaces.map((i) => (
          // Key includes the current address so the row re-seeds when a
          // terminal command (ip addr add, dhclient) changes it underneath us.
          <IfaceRow
            key={device.id + i.name + (i.ip ? cidrToString(i.ip.addr, i.ip.prefix) : '-')}
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
            <CommitInput
              key={ipd.id + (ipd.nameserver ?? 'ns')}
              value={ipd.nameserver !== null ? ipToString(ipd.nameserver) : ''}
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
              <div className="service-row" key={device.id + i.name + swd.vlanOf(i.name)}>
                <span className="service-proto">{i.name}</span>
                <span className="hint" style={{ width: 90 }}>
                  → {sim.net.links.get(i.link!.id) ? i.link!.other(i).device.name : '?'}
                </span>
                <CommitInput
                  value={String(swd.vlanOf(i.name))}
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
