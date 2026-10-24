import { wirelessError } from '../engine/wirelessRange';
import { useState } from 'react';
import { useStore } from '../store';
import { sim } from '../sim';
import type { IpDevice } from '../engine/ipdevice';
import { ApDevice } from '../engine/switch';

export function HostWireless({ device }: { device: IpDevice }) {
  useStore(s => s.uiPulse);
  useStore(s => s.edges);
  const [aps, setAps] = useState<ApDevice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const wlan = device.getInterface('wlan0');
  const connected = wlan?.link;
  return <section><h3>WLAN</h3>
    {!wlan ? <button className="mini-btn" onClick={() => useStore.getState().enableWireless(device.id)}>wlan0 hinzufügen</button> : <>
      <p className="ap-note">{connected ? `${connected.ssid} · ${connected.operational ? 'WLAN aktiv' : `WLAN inaktiv: ${connected.wirelessError ?? 'Admin DOWN'}`}` : 'Nicht verbunden'}</p>
      {connected ? <button className="mini-btn" onClick={() => setError(useStore.getState().associateWireless(device.id, null))}>WLAN trennen</button> : <>
        <p className="ap-note">{device.interfaces.some(i => i.medium === 'ethernet') ? 'Ethernet vor der WLAN-Verbindung trennen. ' : ''}IPv4 und DHCP werden unten für wlan0 konfiguriert.</p>
        <button className="mini-btn" onClick={() => setAps([...sim.net.devices.values()].filter((d): d is ApDevice => d instanceof ApDevice && !d.disposed))}>WLAN suchen</button>
        <ul className="ap-clients">{aps.filter(ap => !ap.disposed && sim.net.devices.get(ap.id) === ap).map(ap => <li key={ap.id}><button className="mini-btn" disabled={!!wirelessError(ap, device, ap.ssid)} title={wirelessError(ap, device, ap.ssid) ?? undefined} onClick={() => setError(useStore.getState().associateWireless(device.id, ap.id))}>{ap.ssid} · {ap.name} · Verbinden</button></li>)}</ul>
      </>}
    </>}
    {error && <p role="alert" className="ap-note">{error}</p>}
  </section>;
}
