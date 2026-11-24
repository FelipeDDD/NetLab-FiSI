import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from '../i18n';

const DIVIDER_HEIGHT = 10;

export function PacketInspectorSplit({ list, details, selected }: {
  list: ReactNode; details: ReactNode; selected: boolean;
}) {
  const { t } = useTranslation();
  const container = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointer: number; y: number; share: number }>();
  const [available, setAvailable] = useState(0);
  const [preferredShare, setShare] = useState(0.52);
  const [resizing, setResizing] = useState(false);
  const minShare = Math.min(0.45, 72 / Math.max(1, available));
  const clamp = (value: number) => Math.max(minShare, Math.min(1 - minShare, value));
  const share = clamp(preferredShare);
  const finish = () => { drag.current = undefined; setResizing(false); };

  useLayoutEffect(() => {
    const element = container.current!;
    const measure = () => setAvailable(Math.max(0, element.clientHeight - DIVIDER_HEIGHT));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return <div ref={container} className={`packet-split${selected ? ' is-split' : ''}${resizing ? ' is-resizing' : ''}`}
    style={{ '--packet-list-share': `${share}fr`, '--packet-detail-share': `${1 - share}fr`,
      '--packet-divider-height': `${DIVIDER_HEIGHT}px` } as CSSProperties}>
    <div className="packet-list-pane">{list}</div>
    {selected && <div className="packet-splitter" role="separator" tabIndex={0} aria-orientation="horizontal"
      aria-label={t('traffic.resizeSplit')} aria-controls="packet-list packet-detail-pane"
      aria-valuemin={Math.round(minShare * 100)} aria-valuemax={Math.round((1 - minShare) * 100)}
      aria-valuenow={Math.round(share * 100)}
      onKeyDown={event => {
        if (!available || event.nativeEvent.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
        const step = (event.shiftKey ? 20 : 5) / available;
        const next = event.key === 'ArrowUp' ? share - step : event.key === 'ArrowDown' ? share + step
          : event.key === 'Home' ? minShare : event.key === 'End' ? 1 - minShare : null;
        if (next === null) return;
        event.preventDefault();
        event.stopPropagation();
        setShare(clamp(next));
      }}
      onPointerDown={event => {
        if (!available || event.button !== 0 || !event.isPrimary) return;
        event.preventDefault();
        event.currentTarget.focus({ preventScroll: true });
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { pointer: event.pointerId, y: event.clientY, share };
        setResizing(true);
      }}
      onPointerMove={event => {
        const start = drag.current;
        if (start?.pointer === event.pointerId && available) setShare(clamp(start.share + (event.clientY - start.y) / available));
      }}
      onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish} />}
    <div id="packet-detail-pane">{details}</div>
  </div>;
}
