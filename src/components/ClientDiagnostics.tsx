import { useEffect, useRef, useState } from 'react';
import type { IpDevice } from '../engine/ipdevice';
import { parseIp, ipToString } from '../engine/ip';

export function ClientDiagnostics({ device }: { device: IpDevice }) {
  const [target, setTarget] = useState('10.0.0.1');
  const [result, setResult] = useState('');
  const cleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanup.current?.(), [device]);
  const ping = () => {
    cleanup.current?.();
    let cancelled = false;
    cleanup.current = () => { cancelled = true; };
    const send = (dst: number) => {
    if (cancelled) return;
    const id = device.allocIcmpId();
    const timeout = device.schedule(5000, () => { setResult('Zeitüberschreitung'); device.offIcmp(id); });
    cleanup.current = () => { device.offIcmp(id); device.network.scheduler.cancel(timeout); };
    device.onIcmp(id, e => {
      cleanup.current?.();
      setResult(e.type === 'reply' ? `Antwort von ${ipToString(e.from)}` : 'Ziel nicht erreichbar');
    });
    setResult('Ping läuft…');
    const error = device.sendEcho(dst, id, 1);
    if (error) { cleanup.current?.(); setResult(error); }
    };
    const dst = parseIp(target.trim());
    if (dst !== null) send(dst);
    else if (!target.trim() || device.nameserver === null) setResult('IPv4-Adresse oder Hostname mit konfiguriertem DNS eingeben.');
    else {
      setResult('DNS-Anfrage läuft…');
      device.resolveDns(target.trim(), device.nameserver, result => {
        if (cancelled) return;
        if (typeof result === 'number') send(result); else setResult('DNS-Auflösung fehlgeschlagen');
      });
    }
  };
  return <section><h3>Verbindung testen</h3>
    <label>Ping-Ziel (IPv4 / Hostname)<input className="iface-ip" aria-label="Ping-Ziel" value={target} onChange={e => setTarget(e.target.value)} /></label>
    <button type="button" className="mini-btn" onClick={ping}>Ping</button>
    <p role="status" className="ap-note">{result}</p>
  </section>;
}
