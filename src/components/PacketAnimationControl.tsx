import { useEffect, useState } from 'react';
import { isPingAnimationActive, PING_ANIMATION_HIDE_DELAY_MS, PING_ANIMATION_SPEEDS } from '../packetAnimation';
import { useStore } from '../store';

/** Temporary ping controls, above the terminal dock and outside canvas layout. */
export function PacketAnimationControl() {
  const guided = useStore(s => s.guidedPacket);
  const generation = useStore(s => s.topologyGeneration);
  const speed = useStore(s => s.packetAnimationSpeed);
  const [visibleKey, setVisibleKey] = useState<string | null>(null);
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  const session = guided.observation.session;
  const key = session ? `${generation}:${session.deviceId}:${session.icmpId}` : null;
  const hasAnimation = guided.playback.hops.length > 0;
  const active = isPingAnimationActive(guided);

  useEffect(() => {
    if (!key || !hasAnimation) return;
    setVisibleKey(key);
    if (active) return;
    const timer = setTimeout(() => setVisibleKey(null), PING_ANIMATION_HIDE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [key, hasAnimation, active]);

  if (!key || !hasAnimation || visibleKey !== key || dismissedKey === key) return null;
  const labels = ['Langsam', 'Normal', 'Schnell'];
  return <section className="ping-animation-control nodrag nopan nowheel" aria-label="Ping-Animation">
    <header><strong>Ping-Animation</strong><output htmlFor="ping-animation-speed">{String(speed).replace('.', ',')}×</output>
      <button type="button" className="ping-animation-close" aria-label="Ping-Steuerung schließen"
        title="Steuerung schließen · Animation läuft weiter" onClick={event => {
          setDismissedKey(key);
          event.currentTarget.closest<HTMLElement>('.canvas')?.focus({ preventScroll: true });
        }}>×</button>
    </header>
    <label className="sr-only" htmlFor="ping-animation-speed">Geschwindigkeit der Ping-Animation</label>
    <input id="ping-animation-speed" type="range" min={0} max={2} step={1}
      value={speed <= 0.5 ? 0 : speed >= 2 ? 2 : 1}
      aria-valuetext={`${speed}× · nur Ping-Darstellung`} title="Nur Ping-Darstellung · Netzwerkzeit unverändert"
      onChange={event => useStore.getState().setPacketAnimationSpeed(PING_ANIMATION_SPEEDS[Number(event.target.value)])} />
    <div className="ping-animation-labels" aria-hidden="true">{labels.map((label, index) =>
      <span key={label} data-active={PING_ANIMATION_SPEEDS[index] === speed}>{label}</span>)}</div>
    {(guided.playback.skipped > 0 || guided.observation.truncated) &&
      <small className="ping-animation-note" role="status">Animation gekürzt · Details in Packets</small>}
  </section>;
}
