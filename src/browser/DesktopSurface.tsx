import {lazy,Suspense,useEffect} from 'react';
import {useDesktop} from './desktopState';
import {useStore} from '../store';
import {sim} from '../sim';
import type {Host} from '../engine/ipdevice';
import {useTranslation} from '../i18n';
import {browserText} from './messages';
const Desktop=lazy(()=>import('./PCDesktop'));
export function OpenDesktopButton({device}:{device:Host}) {
  const {language}=useTranslation();
  return <button type="button" className="mini-btn" title={browserText(language,'openDesktop')} onClick={()=>useDesktop.getState().open(device)}>{browserText(language,'desktop')}</button>;
}
export function DesktopSurface() {
  const device=useDesktop(s=>s.device);
  useStore(s=>s.nodes);useStore(s=>s.topologyGeneration);
  const valid=!!device&&!device.disposed&&sim.net.devices.get(device.id)===device;
  useEffect(()=>{if(device&&!valid&&useDesktop.getState().device===device)useDesktop.getState().close();},[device,valid]);
  return valid?<Suspense fallback={null}><Desktop key={device.id} device={device}/></Suspense>:null;
}
