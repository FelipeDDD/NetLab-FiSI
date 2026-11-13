import { useState } from 'react';
import { useTranslation, type TranslationKey } from '../i18n';
import type { IpDevice, Route } from '../engine/ipdevice';
import { cidrToString, ipToString } from '../engine/ip';
import { routeEditSignature, type RouteEditError } from '../staticRouteEdit';
import { usePendingForm } from '../persistence/usePendingForm';
import { useStore } from '../store';
import { RoutingTable } from './DiagnosticTables';

export function StaticRouteEditor({ device }: { device: IpDevice }) {
 const {t}=useTranslation();
 const [editing,setEditing]=useState<{original:Route|null;signature:string;destination:string;gateway:string;iface:string}|null>(null);
 const [error,setError]=useState<RouteEditError|null>(null);
 usePendingForm(()=>editing!==null);
 const open=(route:Route|null)=>{setError(null);setEditing({original:route&&structuredClone(route),signature:routeEditSignature(device),destination:route?cidrToString(route.dest,route.prefix):'',gateway:route?.via===null||!route?'':ipToString(route.via),iface:route?.ifaceName??''});};
 const commit=(remove=false)=>{
   if(!editing)return;
   const result=useStore.getState().editStaticRoute(device.id,editing.signature,editing.original,remove?null:{destination:editing.destination,gateway:editing.gateway,iface:editing.iface});
   if(result)setError(result);else{setEditing(null);setError(null);}
 };
 const errors:Record<RouteEditError,TranslationKey>={stale:'routeEditor.stale',cidr:'routeEditor.cidr',hostBits:'routeEditor.hostBits',gateway:'routeEditor.gatewayError',iface:'routeEditor.ifaceError',duplicate:'routeEditor.duplicate',missing:'routeEditor.missing',ambiguous:'routeEditor.ambiguous',required:'routeEditor.required'};
 if(!editing)return <div data-static-route-table><div className="static-route-heading"><h3>{t('navigation.tableRoutes')}</h3><button type="button" className="mini-btn" data-route-add onClick={()=>open(null)}>{t('routeEditor.add')}</button></div><RoutingTable device={device} onEdit={open}/></div>;
 return <form className="static-route-form" data-static-route-form aria-label={t('routeEditor.title')} onSubmit={e=>{e.preventDefault();commit();}}>
  <h3>{t('routeEditor.title')}</h3>
  <label>{t('routeEditor.destination')}<input className="iface-ip" autoFocus data-route-destination value={editing.destination} onChange={e=>setEditing({...editing,destination:e.target.value})}/></label>
  <label>{t('routeEditor.gateway')}<input className="iface-ip" data-route-gateway value={editing.gateway} onChange={e=>setEditing({...editing,gateway:e.target.value})}/></label>
  <label>{t('routeEditor.iface')}<select data-route-interface value={editing.iface} onChange={e=>setEditing({...editing,iface:e.target.value})}><option value="">{t('routeEditor.automatic')}</option>{device.interfaces.map(i=><option key={i.name} value={i.name}>{i.name}</option>)}</select></label>
  {error&&<p role="alert">{t(errors[error])}</p>}
  <div className="static-route-actions"><button type="submit" className="btn" data-route-save>{t(editing.original?'routeEditor.save':'routeEditor.add')}</button><button type="button" className="btn" data-route-cancel onClick={()=>{setEditing(null);setError(null);}}>{t('routeEditor.cancel')}</button>{editing.original&&<button type="button" className="btn" data-route-delete onClick={()=>commit(true)}>{t('routeEditor.remove')}</button>}</div>
 </form>;
}
