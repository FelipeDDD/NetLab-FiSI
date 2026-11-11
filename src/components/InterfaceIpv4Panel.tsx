import { Fragment, useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { sim } from '../sim';
import { ipToString } from '../engine/ip';
import { emptyIpv4, gatewayOutsideSubnet, sameIpv4 } from '../engine/ipv4Config';
import { editIpv4Draft, newIpv4Draft, normalizeIpv4Shortcut, parseIpv4Draft, syncIpv4Draft, type Ipv4Fields } from '../ipv4Draft';
import { CopyIpButton } from './CopyIpButton';
import { usePendingForm } from '../persistence/usePendingForm';
import { IpDevice } from '../engine/ipdevice';
import { InterfaceGatewayRoutes } from './InterfaceGatewayRoutes';
import { LearningHelpLink } from './LearningHelp';
import { useTranslation } from '../i18n';
import { editorMessage, editorMessageText, type EditorMessage } from '../editorMessages';

const labels = { ip: 'navigation.ipv4Address', mask: 'navigation.ipv4Mask', gateway: 'navigation.ipv4Gateway', dns: 'navigation.ipv4Dns' } as const;
type Field = keyof Ipv4Fields;

export function InterfaceIpv4Panel({ deviceId, ifaceName }: { deviceId: string; ifaceName: string }) {
  const { t } = useTranslation();
  useStore((s) => s.nodes);
  useStore((s) => s.uiPulse);
  const device = sim.net.devices.get(deviceId), iface = device?.getInterface(ifaceName);
  const [editor, setEditor] = useState(() => ({ iface, draft: newIpv4Draft(iface?.ipv4 ?? emptyIpv4('unconfigured')) }));
  const draft = iface === editor.iface ? syncIpv4Draft(editor.draft, iface?.ipv4 ?? emptyIpv4('unconfigured'))
    : newIpv4Draft(iface?.ipv4 ?? emptyIpv4('unconfigured'));
  if (draft !== editor.draft || iface !== editor.iface) setEditor({ iface, draft });
  const current = useRef(draft); current.current = draft;
  usePendingForm(() => current.current.dirty);
  const group = useRef<object>();
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const composing = useRef(false);
  const form = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<EditorMessage>('');
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
        setError(editorMessage('navigation.ipv4Stale'));
      } else update({ ...pending, stale: true });
      return;
    }
    // Do not append a CIDR suffix while the user is still typing the address.
    const editingIp = !blur && document.activeElement === form.current?.elements.namedItem('ip');
    const fields = editingIp ? pending.fields : normalizeIpv4Shortcut(pending.fields, blur);
    if (fields !== pending.fields) { pending = { ...pending, fields }; update(pending); }
    const value = parseIpv4Draft(pending.fields);
    if (!value) {
      if (blur) setError(editorMessage('navigation.ipv4Invalid'));
      return;
    }
    const failure = useStore.getState().setInterfaceIpv4(deviceId, ifaceName, value, group.current);
    if (failure) { setError(failure); return; }
    // Preserve raw fields/cursor positions; IP/prefix and mask stay synchronized.
    update({ ...newIpv4Draft(latest.ipv4), fields: pending.fields });
    setError('');
  };
  const schedule = () => { clearPending(); if (!composing.current) timer.current = setTimeout(() => commit(), 500); };
  const displayed = newIpv4Draft(iface.ipv4).fields;
  const warning = gatewayOutsideSubnet(iface.ipv4Mode === 'dhcp' ? iface.ipv4 : parseIpv4Draft(draft.fields) ?? iface.ipv4);
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
        {!iface.link && <span className="iface-unplugged">{t('navigation.ipv4Unplugged')}</span>}</div>
      {iface.ip && <CopyIpButton address={ipToString(iface.ip.addr)} context={`${device?.name} ${ifaceName}`} />}
    </div>
    <LearningHelpLink page="ipv4" />
    <label className="ipv4-mode">
      <input type="checkbox" aria-label={t('navigation.ipv4AutomaticNamed', { iface: ifaceName })}
        checked={iface.ipv4Mode === 'dhcp'} onChange={(e) => toggleDhcp(e.target.checked)} />
      {t('navigation.ipv4Automatic')}
    </label>
    {iface.ipv4Mode !== 'dhcp' && <form ref={form} className="ipv4-form"
      onFocus={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) group.current = {}; }}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) group.current = undefined; }}
      onSubmit={(e) => { e.preventDefault(); commit(true); }}>
      {(Object.keys(labels) as Field[]).map((field) => <Fragment key={field}><label>{t(labels[field])}
        <input name={field} className="iface-ip" aria-label={`${t(labels[field])} ${ifaceName}`} value={draft.fields[field]}
          aria-invalid={!!error || undefined}
          placeholder={field === 'mask' ? t('navigation.ipv4MaskHint') : field === 'gateway' || field === 'dns' ? t('navigation.ipv4Optional') : '192.168.1.10'}
          onChange={(e) => { update(editIpv4Draft(current.current, field, e.target.value)); setError(''); schedule(); }}
          onBlur={() => commit(true)}
          onCompositionStart={() => { composing.current = true; clearPending(); }}
          onCompositionEnd={() => { composing.current = false; schedule(); }} />
      </label>{field === 'gateway' && device instanceof IpDevice && <InterfaceGatewayRoutes device={device} iface={iface} />}</Fragment>)}
    </form>}
    {warning && <span className="hint" role="status">{t('navigation.ipv4GatewayWarning')}</span>}
    {error && <span className="hint" role="status">{editorMessageText(error, t)}</span>}
    {iface.ipv4Mode === 'dhcp' && <>
      <dl className="ipv4-assigned">{(Object.keys(labels) as Field[]).map((field) => <Fragment key={field}>
        <dt>{t(labels[field])}</dt><dd>{displayed[field] || '—'}</dd>
      </Fragment>)}</dl>
      {device instanceof IpDevice && <InterfaceGatewayRoutes device={device} iface={iface} />}
      <span className="hint" role="status">{t(iface.cancelDhcp ? 'navigation.ipv4DhcpPending' : iface.dhcpLease ? 'navigation.ipv4Lease' : 'navigation.ipv4NoLease')}{iface.ip && !iface.dhcpLease ? t('navigation.ipv4SavedValues') : ''}</span>
      <button className="btn" disabled={!!iface.cancelDhcp} onClick={() => useStore.getState().renewInterfaceDhcp(deviceId, ifaceName)}>{t('navigation.ipv4Renew')}</button>
    </>}
  </div>;
}
