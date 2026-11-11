import { useTranslation } from '../i18n';
import { availableAccessPoints } from '../wifiDiscovery';
import { useState } from 'react';
import { useStore } from '../store';
import type { IpDevice } from '../engine/ipdevice';
import { editorMessage, editorMessageText, type EditorMessage } from '../editorMessages';

export function HostWireless({ device }: { device: IpDevice }) {
  const { t } = useTranslation();
  useStore(s => s.uiPulse);
  useStore(s => s.edges);
  useStore(s => s.nodes);
  const [searchedFor, setSearchedFor] = useState<IpDevice | null>(null);
  const [error, setError] = useState<EditorMessage | null>(null);
  const wlan = device.getInterface('wlan0');
  const connected = wlan?.link;
  const aps = searchedFor === device ? availableAccessPoints(device) : [];
  const ethernetConnected = device.interfaces.some(i => i.medium === 'ethernet' && i.link);
  return <section><h3>WLAN</h3>
    {!wlan ? <button className="mini-btn" onClick={() => useStore.getState().enableWireless(device.id)}>{t('navigation.wifiAdd')}</button> : <>
      <p className="ap-note">{connected ? `${connected.ssid} · ${connected.operational ? t('navigation.linkWifiActive') : t('navigation.wifiInactiveReason', { reason: connected.wirelessError ?? 'Admin DOWN' })}` : t('navigation.wifiDisconnected')}</p>
      {connected ? <button className="mini-btn" onClick={() => setError(useStore.getState().associateWireless(device.id, null))}>{t('navigation.wifiDisconnect')}</button> : <>
        <p className="ap-note">{device.interfaces.some(i => i.medium === 'ethernet') ? t('navigation.wifiUnplugFirst') : ''}{t('navigation.wifiIpv4Hint')}</p>
        <button className="mini-btn" disabled={!wlan.up} onClick={() => { setSearchedFor(device); setError(null); }}>{t('navigation.wifiSearch')}</button>
        {!wlan.up && <p className="ap-note">{t('navigation.wifiAdminDown')}</p>}
        {searchedFor === device && <>
          {!aps.length && <p className="ap-note" role="status">{t('navigation.wifiNone')}</p>}
          <ul className="ap-clients">{aps.map(ap => <li key={ap.id}><button className="mini-btn" disabled={ethernetConnected}
            title={ethernetConnected ? t('navigation.wifiUnplugTooltip') : undefined} onClick={() => {
              if (!availableAccessPoints(device).includes(ap)) { setError(editorMessage('navigation.wifiUnavailable')); return; }
              setError(useStore.getState().associateWireless(device.id, ap.id));
            }}>{ap.ssid} · {ap.name} · {t('navigation.wifiConnect')}</button></li>)}</ul>
        </>}
      </>}
    </>}
    {error && <p role="alert" className="ap-note">{editorMessageText(error, t)}</p>}
  </section>;
}
