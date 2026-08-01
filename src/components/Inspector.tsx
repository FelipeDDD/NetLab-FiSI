import { useState } from 'react';
import { useStore } from '../store';
import { sim } from '../sim';
import { IpDevice } from '../engine/ipdevice';
import { SwitchDevice } from '../engine/switch';
import { cidrToString } from '../engine/ip';
import { formatNeigh, formatRoutes } from '../commands/ip-cmd';

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
