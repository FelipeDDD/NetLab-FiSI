import { availableAccessPoints } from '../wifiDiscovery';
import { useState } from 'react';
import { useStore } from '../store';
import type { IpDevice } from '../engine/ipdevice';

export function HostWireless({ device }: { device: IpDevice }) {
  useStore(s => s.uiPulse);
  useStore(s => s.edges);
  useStore(s => s.nodes);
  const [searchedFor, setSearchedFor] = useState<IpDevice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wlan = device.getInterface('wlan0');
  const connected = wlan?.link;
  const aps = searchedFor === device ? availableAccessPoints(device) : [];
  const ethernetConnected = device.interfaces.some(i => i.medium === 'ethernet' && i.link);
  return <section><h3>WLAN</h3>
    {!wlan ? <button className="mini-btn" onClick={() => useStore.getState().enableWireless(device.id)}>wlan0 hinzufügen</button> : <>
      <p className="ap-note">{connected ? `${connected.ssid} · ${connected.operational ? 'WLAN aktiv' : `WLAN inaktiv: ${connected.wirelessError ?? 'Admin DOWN'}`}` : 'Nicht verbunden'}</p>
      {connected ? <button className="mini-btn" onClick={() => setError(useStore.getState().associateWireless(device.id, null))}>WLAN trennen</button> : <>
        <p className="ap-note">{device.interfaces.some(i => i.medium === 'ethernet') ? 'Ethernet vor der WLAN-Verbindung trennen. ' : ''}IPv4 und DHCP werden unten für wlan0 konfiguriert.</p>
        <button className="mini-btn" disabled={!wlan.up} onClick={() => { setSearchedFor(device); setError(null); }}>WLAN suchen</button>
        {!wlan.up && <p className="ap-note">wlan0 ist administrativ DOWN.</p>}
        {searchedFor === device && <>
          {!aps.length && <p className="ap-note" role="status">Keine WLAN-Netze verfügbar.</p>}
          <ul className="ap-clients">{aps.map(ap => <li key={ap.id}><button className="mini-btn" disabled={ethernetConnected}
            title={ethernetConnected ? 'Ethernet zuerst trennen.' : undefined} onClick={() => {
              if (!availableAccessPoints(device).includes(ap)) { setError('WLAN nicht mehr verfügbar.'); return; }
              setError(useStore.getState().associateWireless(device.id, ap.id));
            }}>{ap.ssid} · {ap.name} · Verbinden</button></li>)}</ul>
        </>}
      </>}
    </>}
    {error && <p role="alert" className="ap-note">{error}</p>}
  </section>;
}
