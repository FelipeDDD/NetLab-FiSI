import { useTranslation } from '../i18n';
import { useEffect, useRef, useState } from 'react';
import type { IpDevice } from '../engine/ipdevice';
import { parseIp, ipToString } from '../engine/ip';
import { editorMessage, editorMessageText, type EditorMessage } from '../editorMessages';

export function ClientDiagnostics({ device }: { device: IpDevice }) {
  const { t } = useTranslation();
  const [target, setTarget] = useState('10.0.0.1');
  const [result, setResult] = useState<EditorMessage>('');
  const cleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanup.current?.(), [device]);
  const ping = () => {
    cleanup.current?.();
    let cancelled = false;
    cleanup.current = () => { cancelled = true; };
    const send = (dst: number) => {
    if (cancelled) return;
    const id = device.allocIcmpId();
    const timeout = device.schedule(5000, () => { setResult(editorMessage('navigation.diagnosticsTimeout')); device.offIcmp(id); });
    cleanup.current = () => { device.offIcmp(id); device.network.scheduler.cancel(timeout); };
    device.onIcmp(id, e => {
      cleanup.current?.();
      setResult(e.type === 'reply' ? editorMessage('navigation.diagnosticsReply', { address: ipToString(e.from) }) : editorMessage('navigation.diagnosticsUnreachable'));
    });
    setResult(editorMessage('navigation.diagnosticsRunning'));
    const error = device.sendEcho(dst, id, 1);
    if (error) { cleanup.current?.(); setResult(error); }
    };
    const dst = parseIp(target.trim());
    if (dst !== null) send(dst);
    else if (!target.trim() || device.nameserver === null) setResult(editorMessage('navigation.diagnosticsInput'));
    else {
      setResult(editorMessage('navigation.diagnosticsDnsRunning'));
      device.resolveDns(target.trim(), device.nameserver, result => {
        if (cancelled) return;
        if (typeof result === 'number') send(result); else setResult(editorMessage('navigation.diagnosticsDnsFailed'));
      });
    }
  };
  return <section><h3>{t('navigation.diagnosticsTitle')}</h3>
    <label>{t('navigation.diagnosticsTarget')}<input className="iface-ip" aria-label={t('navigation.diagnosticsTargetAria')} value={target} onChange={e => setTarget(e.target.value)} /></label>
    <button type="button" className="mini-btn" onClick={ping}>Ping</button>
    <p role="status" className="ap-note">{editorMessageText(result, t)}</p>
  </section>;
}
