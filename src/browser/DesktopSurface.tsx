import {lazy,Suspense,useEffect} from 'react';
import {useDesktop} from './desktopState';
import {useStore} from '../store';
import {sim} from '../sim';
import type {Host} from '../engine/ipdevice';
import {useTranslation} from '../i18n';
import {browserText} from './messages';
const Desktop=lazy(()=>import('./PCDesktop'));
const validHost = (host: Host) => !host.disposed && sim.net.devices.get(host.id) === host;
export function OpenDesktopButton({device}:{device:Host}) {
  const {language}=useTranslation();
  return <button type="button" className="mini-btn" title={browserText(language,'openDesktop')} onClick={()=>useDesktop.getState().open(device)}>{browserText(language,'desktop')}</button>;
}
export function DesktopSurface() {
  const device=useDesktop(s=>s.device);
  const tabs=useDesktop(s=>s.tabs);
  const nodes=useStore(s=>s.nodes), generation=useStore(s=>s.topologyGeneration);
  const active=device&&validHost(device)?device:null;
  useEffect(()=>{
    useDesktop.getState().prune(validHost);
  },[device,tabs,nodes,generation]);
  const liveTabs = tabs.filter(tab => validHost(tab.device));
  if (!active && !liveTabs.length) return null;
  return <Suspense fallback={null}><Desktop key={generation} device={active} tabs={liveTabs}/></Suspense>;
}
