import { useEffect, useRef, useState } from 'react';
import { RouterDevice, type IpDevice } from '../engine/ipdevice';
import type { NetInterface } from '../engine/device';
import { defaultDhcpPool, legacyPoolInterface, poolSettings, validateDhcpPool } from '../engine/dhcpPools';
import { ipToString, parseIp } from '../engine/ip';
import { useStore } from '../store';
import { usePendingForm } from '../persistence/usePendingForm';

function DhcpPoolCard({device,iface}:{device:IpDevice;iface:NetInterface}) {
  const cfg=device.dhcpPool(iface.name), defaults=cfg??defaultDhcpPool(iface);
  const values=()=>({rangeStart:ipToString(defaults.rangeStart),rangeEnd:ipToString(defaults.rangeEnd),router:defaults.router===null?'':ipToString(defaults.router),dns:defaults.dns===null?'':ipToString(defaults.dns)});
  const [draft,setDraft]=useState(values),[error,setError]=useState<string|null>(null);
  const details=useRef<HTMLDetailsElement>(null),dirty=useRef(false);
  usePendingForm(()=>dirty.current);
  const [expanded,setExpanded]=useState(false);
  const signature=JSON.stringify(values());
  useEffect(()=>{if(!dirty.current)setDraft(JSON.parse(signature));},[signature]);
  useEffect(()=>setError(null),[signature,iface.ip?.addr,iface.ip?.prefix]);
  const invalid=cfg ? validateDhcpPool(device,iface.name,cfg) : !iface.ip ? 'Zuerst eine gültige IPv4-Adresse konfigurieren.' : null;
  const save=()=>{
    const start=parseIp(draft.rangeStart),end=parseIp(draft.rangeEnd),router=draft.router.trim()?parseIp(draft.router):null,dns=draft.dns.trim()?parseIp(draft.dns):null;
    if(start===null||end===null||(draft.router.trim()&&router===null)||(draft.dns.trim()&&dns===null)){setError('Bitte gültige IPv4-Adressen eingeben.');return;}
    const result=useStore.getState().setDhcpPool(device.id,iface.name,{enabled:cfg?.enabled??false,rangeStart:start,rangeEnd:end,router,dns});
    setError(result);if(!result)dirty.current=false;
  };
  const leases=cfg ? [...cfg.leases].filter(([,ip])=>ip>=cfg.rangeStart&&ip<=cfg.rangeEnd) : [];
  return <section className="dhcp-pool-card">
    <div className="dhcp-pool-head"><strong>{iface.name} <span>— {iface.ip ? `${ipToString(iface.ip.addr)}/${iface.ip.prefix}`:'Kein IPv4'}</span></strong>
      <label className="dhcp-pool-toggle">DHCP<button type="button" role="switch" aria-label={`DHCP ${iface.name}`} aria-checked={cfg?.enabled??false}
        className="overview-service-toggle" onClick={()=>{
          const next={...poolSettings(cfg??{...defaultDhcpPool(iface),leases:new Map()}),enabled:!cfg?.enabled};
          setError(useStore.getState().setDhcpPool(device.id,iface.name,next));
        }}><span className="service-switch-track" aria-hidden="true"><span /></span></button></label>
    </div>
    {cfg?.enabled&&<p className="dhcp-pool-summary">{ipToString(cfg.rangeStart)} – {ipToString(cfg.rangeEnd)}</p>}
    {cfg?.enabled&&!device.dhcpServerEnabled&&<p className="hint">Pool aktiviert · DHCP-Server global ausgeschaltet</p>}
    <div className="dhcp-pool-actions">
      <button type="button" className="mini-btn" aria-expanded={expanded} aria-controls={`${device.id}-${iface.name}-dhcp`} onClick={()=>{if(details.current)details.current.open=!details.current.open;}}>DHCP konfigurieren</button></div>
    {device.dhcpServer&&!legacyPoolInterface(device)&&!cfg&&<button type="button" className="mini-btn" onClick={()=>setError(useStore.getState().bindLegacyDhcp(device.id,iface.name))}>Alten Pool zuordnen</button>}
    {(error||invalid)&&<p className="ap-note" role={error?'alert':undefined}>{error??invalid}</p>}
    <details ref={details} id={`${device.id}-${iface.name}-dhcp`} onToggle={e=>setExpanded(e.currentTarget.open)} className="dhcp-pool-editor"><summary>Pool-Einstellungen</summary>
      <div className="svc-grid">{(['rangeStart','rangeEnd','router','dns'] as const).map(field=><label key={field}>
        {{rangeStart:'Pool-Anfang',rangeEnd:'Pool-Ende',router:'Gateway',dns:'DNS-Server'}[field]}
        <input className="iface-ip" aria-label={`${iface.name} ${{rangeStart:'Pool-Anfang',rangeEnd:'Pool-Ende',router:'Gateway',dns:'DNS-Server'}[field]}`}
          value={draft[field]} onChange={e=>{dirty.current=true;setDraft({...draft,[field]:e.target.value});}} /></label>)}</div>
      <button type="button" className="mini-btn" onClick={save}>Übernehmen</button>
      <h4>Leases ({leases.length})</h4>
      {leases.length?<div className="dhcp-lease-scroll"><table className="diagnostic-table"><thead><tr><th>MAC</th><th>IPv4</th></tr></thead><tbody>{leases.map(([mac,ip])=><tr key={mac}><td>{mac}</td><td>{ipToString(ip)}</td></tr>)}</tbody></table></div>:<p className="ap-note">Keine Leases in diesem Pool.</p>}
    </details>
  </section>;
}
export function DhcpPoolsPanel({device}:{device:IpDevice}) {
  const legacy=device.dhcpServer;
  return <section className="dhcp-pools"><h3>DHCP · Schnittstellen</h3>
    {device instanceof RouterDevice&&<div className="dhcp-global-control">
      <label className="svc-toggle"><input type="checkbox" checked={device.dhcpServerEnabled}
        onChange={event=>useStore.getState().setDhcpServerEnabled(device.id,event.target.checked)} />DHCP-Server global aktivieren</label>
      <p className="hint">Schaltet alle DHCP-Server dieses Routers ein oder aus. Die Einstellungen der einzelnen Schnittstellen bleiben erhalten.</p>
      {!device.dhcpServerEnabled&&<p className="dhcp-global-status" role="status"><strong>DHCP-Server global ausgeschaltet</strong> · Link-Status unverändert</p>}
    </div>}
    {legacy&&!legacyPoolInterface(device)&&<p className="ap-note" role="status">Alter DHCP-Pool {ipToString(legacy.rangeStart)} – {ipToString(legacy.rangeEnd)} bleibt gespeichert, ist aber keiner Schnittstelle eindeutig zugeordnet. Bitte IPv4/Subnetz prüfen.</p>}
    {device.interfaces.map(iface=><DhcpPoolCard key={iface.name} device={device} iface={iface} />)}
  </section>;
}
