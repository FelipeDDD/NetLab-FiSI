import type { Device } from '../engine/device';
import { useTranslation } from '../i18n';
import { InterfaceConnection } from './InterfaceConnection';
export function ModemInspector({device,hidden}:{device:Device;hidden:boolean}){
 const {t}=useTranslation();
 return <aside className="inspector modem-inspector" hidden={hidden} aria-label={t('navigation.paletteModem')}>
 <div className="inspector-head"><strong>{device.name}</strong><span>Modem</span></div>
 <p className="hint">{t('navigation.modemHint')}</p>
 {device.interfaces.map(iface=><section key={iface.name}><h3>{iface.name} · {iface.up?'UP':'DOWN'}</h3><InterfaceConnection iface={iface}/></section>)}
 </aside>;
}
