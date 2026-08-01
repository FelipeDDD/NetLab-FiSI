import { useState } from 'react';
import { useStore } from '../store';
import { sim } from '../sim';
import { IpDevice } from '../engine/ipdevice';
import { SwitchDevice } from '../engine/switch';
import { cidrToString } from '../engine/ip';
import { formatNeigh, formatRoutes } from '../commands/ip-cmd';
import { formatConntrack } from '../commands/shell';
import { listRuleset } from '../engine/firewall-fmt';

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

      <section>
        <h3>Interfaces</h3>
        {device.interfaces.map((i) => (
          <IfaceRow key={device.id + i.name} deviceId={device.id} ifaceName={i.name} />
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
          <h3>Listening services</h3>
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
          <h3>MAC address table</h3>
          <pre className="table-pre">
            {swd.macTable.size
              ? [...swd.macTable.entries()].map(([mac, port]) => `${mac}  ${port.name}\n`).join('')
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
