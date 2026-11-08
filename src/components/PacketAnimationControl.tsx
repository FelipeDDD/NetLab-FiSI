import { useEffect, useState } from 'react';
import { isPingAnimationActive, PING_ANIMATION_HIDE_DELAY_MS, PING_ANIMATION_SPEEDS } from '../packetAnimation';
import { useStore } from '../store';
import { useFloatingPanelDrag } from './useFloatingPanelDrag';
import { useTranslation } from '../i18n';
import { usePingAnimationPreference } from '../pingAnimationPreference';

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
  return <PingAnimationPanel speed={speed} onClose={() => setDismissedKey(key)}/>;
}

function PingAnimationPanel({ speed, onClose }: { speed: number; onClose(): void }) {
  const { t } = useTranslation();
  const remember = usePingAnimationPreference(s => s.remember);
  const { element, position, dragging, handle } = useFloatingPanelDrag();
  const labels = PING_ANIMATION_SPEEDS.map(value => `${value}×`);
  return <section ref={element} className="ping-animation-control nodrag nopan nowheel" aria-label="Ping-Animation"
    style={position ? { left: position.x, top: position.y, bottom: 'auto', transform: 'none' } : undefined}>
    <header {...handle} tabIndex={0} className="ping-animation-drag-handle" data-dragging={dragging}
      aria-label={t('pingControls.drag')} title={t('pingControls.dragHint')}>
      <strong>Ping-Animation</strong><output htmlFor="ping-animation-speed">{String(speed).replace('.', ',')}×</output>
      <button type="button" className="ping-animation-close" aria-label={t('pingControls.close')}
        title={t('pingControls.closeHint')} onClick={event => {
          onClose();
          event.currentTarget.closest<HTMLElement>('.canvas')?.focus({ preventScroll: true });
        }}>×</button>
    </header>
    <label className="sr-only" htmlFor="ping-animation-speed">{t('pingControls.speed')}</label>
    <input id="ping-animation-speed" type="range" min={0} max={PING_ANIMATION_SPEEDS.length - 1} step={1}
      value={Math.max(0, PING_ANIMATION_SPEEDS.findIndex(value => value >= speed))}
      aria-valuetext={t('pingControls.speedValue', { speed })} title={t('pingControls.speedHint')}
      onChange={event => {
        const value = PING_ANIMATION_SPEEDS[Number(event.target.value)];
        usePingAnimationPreference.getState().setManualSpeed(value);
        useStore.getState().setPacketAnimationSpeed(value);
      }} />
    <div className="ping-animation-labels" aria-hidden="true">{labels.map((label, index) =>
      <span key={label} data-active={PING_ANIMATION_SPEEDS[index] === speed}>{label}</span>)}</div>
    <label className="ping-animation-remember"><input type="checkbox" checked={remember}
      onChange={event => usePingAnimationPreference.getState().setRemember(event.target.checked)}/>{t('pingControls.remember')}</label>
  </section>;
}
