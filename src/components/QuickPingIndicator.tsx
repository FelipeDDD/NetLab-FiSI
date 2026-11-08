import { Panel } from '@xyflow/react';
import { useTranslation } from '../i18n';

/** Passive status only: target selection and Escape remain owned by the canvas. */
export function QuickPingIndicator({ source, message }: { source: string; message?: string }) {
  const { t } = useTranslation();
  const label = t('pingControls.chooseTarget', { source });
  return <Panel position="top-center" className="quick-ping-indicator nodrag nopan nowheel">
    <div role="status" title={message ? `${label} · ${message}` : label}>
      <span aria-hidden="true">◎</span> {label}{message && <span> · {message}</span>}
    </div>
  </Panel>;
}
