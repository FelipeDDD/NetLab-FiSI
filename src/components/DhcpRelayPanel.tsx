import { useEffect, useRef, useState } from 'react';
import { IpDevice } from '../engine/ipdevice';
import { ipToString, parseCidr, parseIp } from '../engine/ip';
import { useStore } from '../store';
import { useTranslation } from '../i18n';
import { usePendingForm } from '../persistence/usePendingForm';

export function DhcpRelayPanel({device,ifaceName}:{device:IpDevice;ifaceName:string}) {
 const {t}=useTranslation(),cfg=device.dhcpRelays.get(ifaceName),signature=JSON.stringify(cfg);
 const [server,setServer]=useState(cfg?ipToString(cfg.server):''),[enabled,setEnabled]=useState(cfg?.enabled??false),[error,setError]=useState(false);
 const dirty=useRef(false),base=useRef(signature);usePendingForm(()=>dirty.current);
 useEffect(()=>{if(!dirty.current){setServer(cfg?ipToString(cfg.server):'');setEnabled(cfg?.enabled??false);base.current=signature;}},[signature]);
 if(device.kind!=='router')return null;
 return <details className="svc"><summary>DHCP Relay · {ifaceName} · {t(cfg?.enabled?'navigation.basicOn':'navigation.basicOff')}</summary>
 <p className="hint">{t('navigation.relayHint')}</p>
 <label><input type="checkbox" checked={enabled} onChange={e=>{dirty.current=true;setEnabled(e.target.checked);}}/>{t('navigation.relayEnable')}</label>
 <label>{t('navigation.relayServer')}<input className="iface-ip" value={server} onChange={e=>{dirty.current=true;setServer(e.target.value);}}/></label>
 <button className="mini-btn" onClick={()=>{const address=parseIp(server);if(base.current!==JSON.stringify(device.dhcpRelays.get(ifaceName))||address===null||!useStore.getState().setDhcpRelay(device.id,ifaceName,{enabled,server:address})){setError(true);return;}dirty.current=false;base.current=JSON.stringify(device.dhcpRelays.get(ifaceName));setError(false);}}>{t('navigation.dhcpApply')}</button>
 {(!device.getInterface(ifaceName)?.ip||error)&&<p role="status" className="hint">{t(error?'navigation.relayInvalid':'navigation.dhcpPoolNeedsIpv4')}</p>}
 </details>;
}
export function RemoteDhcpPoolsPanel({device}:{device:IpDevice}) {
 const {t}=useTranslation();const [id,setId]=useState(''),[fields,setFields]=useState({network:'',rangeStart:'',rangeEnd:'',router:'',dns:''}),[enabled,setEnabled]=useState(false),[error,setError]=useState(false);
 const dirty=useRef(false),base=useRef<string|undefined>(undefined);usePendingForm(()=>dirty.current);
 const signature=(key:string)=>{const c=device.dhcpRemotePools.get(key);return c?JSON.stringify({...c,leases:undefined}):undefined;};
 const choose=(key:string)=>{const c=device.dhcpRemotePools.get(key);setId(key);base.current=signature(key);dirty.current=false;setError(false);setEnabled(c?.enabled??false);setFields(c?{network:`${ipToString(c.network)}/${c.prefix}`,rangeStart:ipToString(c.rangeStart),rangeEnd:ipToString(c.rangeEnd),router:c.router===null?'':ipToString(c.router),dns:c.dns===null?'':ipToString(c.dns)}:{network:'',rangeStart:'',rangeEnd:'',router:'',dns:''});};
 return <details className="svc"><summary>{t('navigation.remotePools')}</summary><p className="hint">{t('navigation.remotePoolHint')}</p>
 <select aria-label={t('navigation.remotePools')} value={id} onChange={e=>choose(e.target.value)}><option value="">{t('navigation.remotePoolNew')}</option>{[...device.dhcpRemotePools].map(([key,c])=><option key={key} value={key}>{ipToString(c.network)}/{c.prefix} · {t(c.enabled?'navigation.basicOn':'navigation.basicOff')}</option>)}</select>
 <label><input type="checkbox" checked={enabled} onChange={e=>{dirty.current=true;setEnabled(e.target.checked);}}/>{t('navigation.relayEnable')}</label>
 {(['network','rangeStart','rangeEnd','router','dns'] as const).map(key=><label key={key}>{key==='network'?t('navigation.remotePoolNetwork'):key==='rangeStart'?t('navigation.dhcpPoolStart'):key==='rangeEnd'?t('navigation.dhcpPoolEnd'):key==='router'?'Gateway':'DNS'}<input className="iface-ip" value={fields[key]} onChange={e=>{dirty.current=true;setFields({...fields,[key]:e.target.value});}}/></label>)}
 <button className="mini-btn" onClick={()=>{const net=parseCidr(fields.network),start=parseIp(fields.rangeStart),end=parseIp(fields.rangeEnd),router=fields.router.trim()?parseIp(fields.router):null,dns=fields.dns.trim()?parseIp(fields.dns):null;
 if(!net||start===null||end===null||(fields.router.trim()&&router===null)||(fields.dns.trim()&&dns===null)||(id&&base.current!==signature(id))){setError(true);return;}
 const key=id||crypto.randomUUID();if(!useStore.getState().setRemoteDhcpPool(device.id,key,{enabled,network:net.addr,prefix:net.prefix,rangeStart:start,rangeEnd:end,router,dns})){setError(true);return;}choose(key);
 }}>{t('navigation.dhcpApply')}</button>
 {id&&<button className="mini-btn" onClick={()=>{if(base.current!==signature(id)){setError(true);return;}useStore.getState().setRemoteDhcpPool(device.id,id,null);choose('');}}>{t('navigation.remotePoolDelete')}</button>}
 {error&&<p className="hint" role="alert">{t('navigation.relayInvalid')}</p>}
 </details>;
}
