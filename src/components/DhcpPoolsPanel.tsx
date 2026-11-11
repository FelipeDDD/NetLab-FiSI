import { useTranslation } from '../i18n';
import { useEffect, useRef, useState } from 'react';
import { RouterDevice, type IpDevice } from '../engine/ipdevice';
import type { NetInterface } from '../engine/device';
import { defaultDhcpPool, legacyPoolInterface, poolSettings, validateDhcpPool } from '../engine/dhcpPools';
import { ipToString, parseIp } from '../engine/ip';
import { useStore } from '../store';
import { usePendingForm } from '../persistence/usePendingForm';
import { editorMessage, editorMessageText, type EditorMessage } from '../editorMessages';

function DhcpPoolCard({device,iface}:{device:IpDevice;iface:NetInterface}) {
  const { t } = useTranslation();
  const cfg=device.dhcpPool(iface.name), defaults=cfg??defaultDhcpPool(iface);
  const values=()=>({rangeStart:ipToString(defaults.rangeStart),rangeEnd:ipToString(defaults.rangeEnd),router:defaults.router===null?'':ipToString(defaults.router),dns:defaults.dns===null?'':ipToString(defaults.dns)});
  const [draft,setDraft]=useState(values),[error,setError]=useState<EditorMessage|null>(null);
  const details=useRef<HTMLDetailsElement>(null),dirty=useRef(false);
  usePendingForm(()=>dirty.current);
  const [expanded,setExpanded]=useState(false);
  const signature=JSON.stringify(values());
  useEffect(()=>{if(!dirty.current)setDraft(JSON.parse(signature));},[signature]);
  useEffect(()=>setError(null),[signature,iface.ip?.addr,iface.ip?.prefix]);
  const invalid=cfg ? validateDhcpPool(device,iface.name,cfg) : !iface.ip ? editorMessage('navigation.dhcpPoolNeedsIpv4') : null;
  const save=()=>{
    const start=parseIp(draft.rangeStart),end=parseIp(draft.rangeEnd),router=draft.router.trim()?parseIp(draft.router):null,dns=draft.dns.trim()?parseIp(draft.dns):null;
    if(start===null||end===null||(draft.router.trim()&&router===null)||(draft.dns.trim()&&dns===null)){setError(editorMessage('navigation.dhcpInvalidAddresses'));return;}
    const result=useStore.getState().setDhcpPool(device.id,iface.name,{enabled:cfg?.enabled??false,rangeStart:start,rangeEnd:end,router,dns});
    setError(result);if(!result)dirty.current=false;
  };
  const leases=cfg ? [...cfg.leases].filter(([,ip])=>ip>=cfg.rangeStart&&ip<=cfg.rangeEnd) : [];
  return <section className="dhcp-pool-card">
    <div className="dhcp-pool-head"><strong>{iface.name} <span>— {iface.ip ? `${ipToString(iface.ip.addr)}/${iface.ip.prefix}`:t('navigation.linkNoIpv4')}</span></strong>
      <label className="dhcp-pool-toggle">DHCP<button type="button" role="switch" aria-label={`DHCP ${iface.name}`} aria-checked={cfg?.enabled??false}
        className="overview-service-toggle" onClick={()=>{
          const next={...poolSettings(cfg??{...defaultDhcpPool(iface),leases:new Map()}),enabled:!cfg?.enabled};
          setError(useStore.getState().setDhcpPool(device.id,iface.name,next));
        }}><span className="service-switch-track" aria-hidden="true"><span /></span></button></label>
    </div>
    {cfg?.enabled&&<p className="dhcp-pool-summary">{ipToString(cfg.rangeStart)} – {ipToString(cfg.rangeEnd)}</p>}
    {cfg?.enabled&&!device.dhcpServerEnabled&&<p className="hint">{t('navigation.dhcpPoolGlobalOff')}</p>}
    <div className="dhcp-pool-actions">
      <button type="button" className="mini-btn" aria-expanded={expanded} aria-controls={`${device.id}-${iface.name}-dhcp`} onClick={()=>{if(details.current)details.current.open=!details.current.open;}}>{t('navigation.dhcpConfigure')}</button></div>
    {device.dhcpServer&&!legacyPoolInterface(device)&&!cfg&&<button type="button" className="mini-btn" onClick={()=>setError(useStore.getState().bindLegacyDhcp(device.id,iface.name))}>{t('navigation.dhcpBindLegacy')}</button>}
    {(error||invalid)&&<p className="ap-note" role={error?'alert':undefined}>{editorMessageText((error??invalid)!, t)}</p>}
    <details ref={details} id={`${device.id}-${iface.name}-dhcp`} onToggle={e=>setExpanded(e.currentTarget.open)} className="dhcp-pool-editor"><summary>{t('navigation.dhcpPoolSettings')}</summary>
      <div className="svc-grid">{(['rangeStart','rangeEnd','router','dns'] as const).map(field=><label key={field}>
        {{rangeStart:t('navigation.dhcpPoolStart'),rangeEnd:t('navigation.dhcpPoolEnd'),router:'Gateway',dns:t('navigation.dnsServerTitle')}[field]}
        <input className="iface-ip" aria-label={`${iface.name} ${{rangeStart:t('navigation.dhcpPoolStart'),rangeEnd:t('navigation.dhcpPoolEnd'),router:'Gateway',dns:t('navigation.dnsServerTitle')}[field]}`}
          value={draft[field]} onChange={e=>{dirty.current=true;setDraft({...draft,[field]:e.target.value});}} /></label>)}</div>
      <button type="button" className="mini-btn" onClick={save}>{t('navigation.dhcpApply')}</button>
      <h4>{t('navigation.dhcpLeases')} ({leases.length})</h4>
      {leases.length?<div className="dhcp-lease-scroll"><table className="diagnostic-table"><thead><tr><th>MAC</th><th>IPv4</th></tr></thead><tbody>{leases.map(([mac,ip])=><tr key={mac}><td>{mac}</td><td>{ipToString(ip)}</td></tr>)}</tbody></table></div>:<p className="ap-note">{t('navigation.dhcpNoLeases')}</p>}
    </details>
  </section>;
}
export function DhcpPoolsPanel({device}:{device:IpDevice}) {
  const { t } = useTranslation();
  const legacy=device.dhcpServer;
  return <section className="dhcp-pools"><h3>{t('navigation.dhcpInterfaces')}</h3>
    {device instanceof RouterDevice&&<div className="dhcp-global-control">
      <label className="svc-toggle"><input type="checkbox" checked={device.dhcpServerEnabled}
        onChange={event=>useStore.getState().setDhcpServerEnabled(device.id,event.target.checked)} />{t('navigation.dhcpEnableGlobal')}</label>
      <p className="hint">{t('navigation.dhcpGlobalHint')}</p>
      {!device.dhcpServerEnabled&&<p className="dhcp-global-status" role="status"><strong>{t('navigation.dhcpGlobalOff')}</strong> · {t('navigation.dhcpLinkUnchanged')}</p>}
    </div>}
    {legacy&&!legacyPoolInterface(device)&&<p className="ap-note" role="status">{t('navigation.dhcpLegacyHint', { start: ipToString(legacy.rangeStart), end: ipToString(legacy.rangeEnd) })}</p>}
    {device.interfaces.map(iface=><DhcpPoolCard key={iface.name} device={device} iface={iface} />)}
  </section>;
}
