import type { SwitchDevice } from '../engine/switch';
import { useTranslation } from '../i18n';
import { useStore } from '../store';
import { InterfaceConnection } from './InterfaceConnection';
import { InspectorTabs } from './InspectorTabs';

export function ModemInspector({ device, hidden }: { device: SwitchDevice; hidden: boolean }) {
  const { t } = useTranslation();
  return <aside className="inspector modem-inspector" hidden={hidden} aria-label={t('navigation.paletteModem')}>
    <div className="inspector-head"><strong>{device.name}</strong><span>Modem</span></div>
    <InspectorTabs active="general" onChange={() => {}} tabs={[
      { id: 'general', label: t('navigation.basicGeneral'), content: <>
        <p className="hint">{t('navigation.modemHint')}</p>
        <label className="host-os-setting modem-color-setting">{t('navigation.modemColor')}
          <select value={device.modemColor} onChange={({ currentTarget: { value } }) => {
            if (value === 'white' || value === 'dark') useStore.getState().setModemColor(device.id, value);
          }}>
            <option value="white">{t('navigation.modemWhite')}</option>
            <option value="dark">{t('navigation.modemDark')}</option>
          </select>
        </label>
        {device.interfaces.map(iface => {
          const traffic = device.modemPortTraffic(iface);
          return <section key={iface.name} data-modem-port={iface.name}>
            <h3>{iface.name} · {iface.up ? 'UP' : 'DOWN'}</h3><InterfaceConnection iface={iface} />
            {traffic && <>
              <dl className="modem-port-traffic">
                <div><dt><span aria-hidden="true">↓ </span>{t('traffic.received')}</dt><dd data-modem-received>{traffic.received}</dd></div>
                <div><dt><span aria-hidden="true">↑ </span>{t('traffic.forwarded')}</dt><dd data-modem-forwarded>{traffic.forwarded}</dd></div>
              </dl>
              {traffic.disconnected + traffic.unavailable > 0 && <details className="modem-port-drops">
                <summary>{t('traffic.dropped', { count: traffic.disconnected + traffic.unavailable })}</summary>
                {traffic.disconnected > 0 && <p>{t('traffic.disconnected', { count: traffic.disconnected })}</p>}
                {traffic.unavailable > 0 && <p>{t('traffic.unavailable', { count: traffic.unavailable })}</p>}
              </details>}
            </>}
          </section>;
        })}
      </> },
    ]} />
  </aside>;
}
