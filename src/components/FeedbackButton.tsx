import { useEffect, useRef, useState } from 'react';
import { editorMessage } from '../editorMessages';
import { useTranslation } from '../i18n';
import { useStore } from '../store';

const formId = String(import.meta.env.VITE_TALLY_FEEDBACK_FORM_ID ?? '').trim();
const tallyWidgetUrl = 'https://tally.so/widgets/embed.js';
const timeoutMs = 12_000;

interface TallyWidget {
  openPopup(id: string, options: {
    layout: 'modal';
    width: number;
    onOpen(): void;
    onClose(): void;
  }): void;
  closePopup(id: string): void;
}

const tallyWidget = () => (window as Window & { Tally?: TallyWidget }).Tally;

function loadTally(signal: AbortSignal): Promise<TallyWidget> {
  const existing = tallyWidget();
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const finish = (widget?: TallyWidget) => {
      clearTimeout(timer);
      signal.removeEventListener('abort', fail);
      script.onload = script.onerror = null;
      if (widget) resolve(widget);
      else { script.remove(); reject(new Error('Tally widget unavailable')); }
    };
    const fail = () => finish();
    const timer = window.setTimeout(fail, timeoutMs);
    signal.addEventListener('abort', fail, { once: true });
    script.src = tallyWidgetUrl;
    script.referrerPolicy = 'no-referrer';
    script.onload = () => finish(tallyWidget());
    script.onerror = fail;
    document.head.appendChild(script);
  });
}

export function FeedbackButton({ onOpen }: { onOpen(): void }) {
  const { t } = useTranslation();
  const button = useRef<HTMLButtonElement>(null);
  const active = useRef<AbortController | null>(null);
  const [state, setState] = useState<'idle' | 'opening' | 'open'>('idle');
  useEffect(() => () => active.current?.abort(), []);
  if (!/^[A-Za-z0-9]+$/.test(formId)) return null;

  const open = async () => {
    if (active.current) return;
    onOpen();
    // The SDK automatically forwards query parameters. Keep share links and
    // other URL data out of the third-party embed without changing navigation.
    if (location.search || location.hash) {
      useStore.getState().setNotice(editorMessage('navigation.feedbackCleanUrl'));
      return;
    }
    const request = new AbortController();
    active.current = request;
    setState('opening');
    const reset = () => {
      if (active.current !== request) return;
      active.current = null;
      setState('idle');
      button.current?.focus({ preventScroll: true });
    };
    const fail = () => {
      if (request.signal.aborted) return;
      reset();
      request.abort();
      useStore.getState().setNotice(editorMessage('navigation.feedbackFailed'));
    };
    try {
      const widget = await loadTally(request.signal);
      if (request.signal.aborted) return;
      if (location.search || location.hash) { fail(); return; }
      const timer = window.setTimeout(fail, timeoutMs);
      request.signal.addEventListener('abort', () => {
        clearTimeout(timer);
        widget.closePopup(formId);
      }, { once: true });
      widget.openPopup(formId, {
        layout: 'modal',
        width: Math.min(560, window.innerWidth - 24),
        onOpen() {
          clearTimeout(timer);
          if (active.current === request) setState('open');
        },
        onClose() {
          clearTimeout(timer);
          reset();
        },
      });
    } catch { fail(); }
  };
  const label = t('navigation.feedback');
  return <button ref={button} type="button" className="toolbar-menu-trigger toolbar-feedback" data-feedback
    aria-label={label} aria-description={t('navigation.feedbackPrivacy')}
    title={t('navigation.feedbackPrivacy')} aria-haspopup="dialog" aria-expanded={state === 'open'}
    aria-busy={state === 'opening' || undefined} onClick={() => void open()}>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 5h16v11H9l-5 4zM8 9h8m-8 3h5"/>
    </svg><span>{label}</span>
  </button>;
}
