import { Fragment, useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { sim } from '../sim';
import { ipToString } from '../engine/ip';
import { emptyIpv4, sameIpv4 } from '../engine/ipv4Config';
import { editIpv4Draft, newIpv4Draft, normalizeIpv4Shortcut, parseIpv4Draft, syncIpv4Draft, type Ipv4Fields } from '../ipv4Draft';
import { CopyIpButton } from './CopyIpButton';

const labels = { ip: 'IP-Adresse', mask: 'Subnetzmaske', gateway: 'Standardgateway', dns: 'DNS-Server' };
type Field = keyof Ipv4Fields;

export function InterfaceIpv4Panel({ deviceId, ifaceName }: { deviceId: string; ifaceName: string }) {
  useStore((s) => s.nodes);
  useStore((s) => s.uiPulse);
  const device = sim.net.devices.get(deviceId), iface = device?.getInterface(ifaceName);
  const [editor, setEditor] = useState(() => ({ iface, draft: newIpv4Draft(iface?.ipv4 ?? emptyIpv4('unconfigured')) }));
  const draft = iface === editor.iface ? syncIpv4Draft(editor.draft, iface?.ipv4 ?? emptyIpv4('unconfigured'))
    : newIpv4Draft(iface?.ipv4 ?? emptyIpv4('unconfigured'));
  if (draft !== editor.draft || iface !== editor.iface) setEditor({ iface, draft });
  const current = useRef(draft); current.current = draft;
  const group = useRef<object>();
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const composing = useRef(false);
  const [error, setError] = useState('');
  const clearPending = () => { if (timer.current !== undefined) clearTimeout(timer.current); timer.current = undefined; };
  useEffect(() => {
    group.current = undefined;
    clearPending(); setError('');
    return clearPending;
  }, [iface, iface?.ipv4Mode === 'dhcp']);
  if (!iface) return null;
  const update = (next: typeof draft) => { current.current = next; setEditor({ iface, draft: next }); };
  const commit = (blur = false) => {
    clearPending();
    if (composing.current) return;
    let pending = current.current;
    const latest = sim.net.devices.get(deviceId)?.getInterface(ifaceName);
    if (latest !== iface || latest.ipv4Mode === 'dhcp') return;
    if (!pending.dirty) {
      const fields = normalizeIpv4Shortcut(pending.fields, blur);
      if (fields !== pending.fields) update({ ...pending, fields });
      return;
    }
    if (pending.stale || !sameIpv4(pending.source, latest.ipv4)) {
      group.current = undefined;
      if (blur) {
        update(newIpv4Draft(latest.ipv4));
        setError('Konfiguration wurde geändert. Veralteter Entwurf wurde nicht übernommen.');
      } else update({ ...pending, stale: true });
      return;
    }
    const fields = normalizeIpv4Shortcut(pending.fields, blur);
    if (fields !== pending.fields) { pending = { ...pending, fields }; update(pending); }
    const value = parseIpv4Draft(pending.fields);
    if (!value) {
      if (blur) setError('Ungültige oder unvollständige IPv4-Konfiguration. Gateway muss im selben Subnetz liegen.');
      return;
    }
    const failure = useStore.getState().setInterfaceIpv4(deviceId, ifaceName, value, group.current);
    if (failure) { setError(failure); return; }
    // Preserve other raw fields/cursor positions; the consumed IP shortcut
    // already transferred its prefix into the separate subnet-mask field.
    update({ ...newIpv4Draft(latest.ipv4), fields: pending.fields });
    setError('');
  };
  const schedule = () => { clearPending(); if (!composing.current) timer.current = setTimeout(() => commit(), 500); };
  const displayed = newIpv4Draft(iface.ipv4).fields;
  const toggleDhcp = (enabled: boolean) => {
    clearPending(); group.current = undefined;
    const failure = useStore.getState().setInterfaceIpv4(deviceId, ifaceName, emptyIpv4(enabled ? 'dhcp' : 'unconfigured'));
    if (failure) setError(failure);
    else { update(newIpv4Draft(iface.ipv4)); setError(''); }
  };
  return <div className="ipv4-interface">
    <div className="iface-row">
      <button className={`iface-state ${iface.up ? 'up' : 'down'}`} onClick={() => useStore.getState().toggleIface(deviceId, ifaceName)}
        title={`ip link set ${ifaceName} ${iface.up ? 'down' : 'up'}`}>{iface.up ? 'UP' : 'DOWN'}</button>
      <div className="iface-name">{ifaceName}<span className="iface-mac">{iface.mac}</span>
        {!iface.link && <span className="iface-unplugged">unplugged</span>}</div>
      {iface.ip && <CopyIpButton address={ipToString(iface.ip.addr)} context={`${device?.name} ${ifaceName}`} />}
    </div>
    <label className="ipv4-mode">
      <input type="checkbox" aria-label={`IP-Adresse automatisch beziehen (DHCP) ${ifaceName}`}
        checked={iface.ipv4Mode === 'dhcp'} onChange={(e) => toggleDhcp(e.target.checked)} />
      IP-Adresse automatisch beziehen (DHCP)
    </label>
    {iface.ipv4Mode !== 'dhcp' && <form className="ipv4-form"
      onFocus={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) group.current = {}; }}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) group.current = undefined; }}
      onSubmit={(e) => { e.preventDefault(); commit(true); }}>
      {(Object.keys(labels) as Field[]).map((field) => <label key={field}>{labels[field]}
        <input className="iface-ip" aria-label={`${labels[field]} ${ifaceName}`} value={draft.fields[field]}
          aria-invalid={!!error || undefined}
          placeholder={field === 'mask' ? '255.255.255.0 oder /24' : field === 'gateway' || field === 'dns' ? 'Optional' : '192.168.1.10'}
          onChange={(e) => { update(editIpv4Draft(current.current, field, e.target.value)); setError(''); schedule(); }}
          onBlur={() => commit(true)}
          onCompositionStart={() => { composing.current = true; clearPending(); }}
          onCompositionEnd={() => { composing.current = false; schedule(); }} />
      </label>)}
    </form>}
    {error && <span className="hint" role="status">{error}</span>}
    {iface.ipv4Mode === 'dhcp' && <>
      <dl className="ipv4-assigned">{(Object.keys(labels) as Field[]).map((field) => <Fragment key={field}>
        <dt>{labels[field]}</dt><dd>{displayed[field] || '—'}</dd>
      </Fragment>)}</dl>
      <span className="hint" role="status">{iface.cancelDhcp ? 'DHCP-Anfrage läuft…' : iface.dhcpLease ? 'Lease aktiv' : 'Kein aktives Lease'}{iface.ip && !iface.dhcpLease ? ' (gespeicherte Werte)' : ''}</span>
      <button className="btn" disabled={!!iface.cancelDhcp} onClick={() => useStore.getState().renewInterfaceDhcp(deviceId, ifaceName)}>DHCP erneuern</button>
    </>}
  </div>;
}
