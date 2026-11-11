import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from '../i18n';
import { visualHelpPosition, type TutorialVisualHelp } from './tutorialVisualHelp';
import './guidedVisualHelp.css';

/** Mount with a step key so leaving a task always dismisses its visual help. */
export function GuidedVisualHelp({ help, embedded = false }: { help: TutorialVisualHelp; embedded?: boolean }) {
  const { t, language } = useTranslation();
  const [open, setOpen] = useState(false), [halfScale, setHalfScale] = useState(false);
  const [imageWidth, setImageWidth] = useState(0);
  const [failedSource, setFailedSource] = useState<string>();
  const trigger = useRef<HTMLButtonElement>(null), dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null), id = useId();
  const [placement, setPlacement] = useState(() => visualHelpPosition(0, 12, 0, 0));
  const source = help.images[language];
  const close = () => {
    // Release native modal inertness before returning focus to the exercise.
    dialog.current?.close(); setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  };

  useEffect(() => {
    if (!open) return;
    let frame: number;
    const update = () => {
      const rect = trigger.current?.closest('.exercise-panel')?.getBoundingClientRect();
      const next = visualHelpPosition(rect?.right ?? innerWidth, rect?.top ?? 12, innerWidth, innerHeight);
      setPlacement(old => JSON.stringify(old) === JSON.stringify(next) ? old : next);
      frame = requestAnimationFrame(update);
    };
    update();
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const element = dialog.current!;
    if (placement.modal) element.showModal(); else element.show();
    closeButton.current?.focus({ preventScroll: true });
    return () => {
      const hadFocus = element.contains(document.activeElement);
      element.close();
      if (hadFocus && trigger.current?.isConnected) trigger.current.focus({ preventScroll: true });
    };
  }, [open, placement.modal]);

  return <>
    <button ref={trigger} type="button" className={`btn guided-visual-help-trigger${embedded ? ' is-embedded' : ''}`} data-guided-image
      aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => {
        if (open) { close(); return; }
        const rect = trigger.current?.closest('.exercise-panel')?.getBoundingClientRect();
        const next = visualHelpPosition(rect?.right ?? innerWidth, rect?.top ?? 12, innerWidth, innerHeight);
        setPlacement(next); setHalfScale(false); setOpen(true);
      }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 4-6 5 7"/></svg>
      {t(open ? 'guidedVisual.close' : 'guidedVisual.open')}
    </button>
    {open && createPortal(<dialog ref={dialog} id={id} className="guided-visual-help" data-guided-image-dialog
      data-modal={placement.modal} lang={language} aria-labelledby={`${id}-title`}
      style={placement.modal ? undefined : { left: placement.left, top: placement.top, width: placement.width, maxHeight: `calc(100dvh - ${placement.top + 12}px)` }}
      onCancel={event => { event.preventDefault(); close(); }}
      onKeyDown={event => {
        event.stopPropagation();
        if (event.key === 'Escape') { event.preventDefault(); close(); }
        if (placement.modal && event.key === 'Tab') {
          const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button, [tabindex="0"]')];
          const first = controls[0], last = controls[controls.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
      }}>
      <header><strong id={`${id}-title`}>{t(help.title)}</strong>
        <button className="btn" type="button" data-guided-image-zoom aria-pressed={halfScale}
          onClick={() => setHalfScale(value => !value)}>{t(halfScale ? 'guidedVisual.fit' : 'guidedVisual.half')}</button>
        <button ref={closeButton} className="btn btn--icon" type="button" data-guided-image-close aria-label={t('common.close')} onClick={close}>×</button>
      </header>
      <div className="guided-visual-help-scroll" tabIndex={0} role="region" aria-label={t(help.title)}>
        {!source || failedSource === source ? <p role="alert">{t('guidedVisual.missing', { language })}</p> :
          <img key={source} src={source} alt={t(help.description)}
            style={halfScale && imageWidth ? { width: imageWidth / 2 } : undefined}
            onLoad={event => setImageWidth(event.currentTarget.naturalWidth)} onError={() => setFailedSource(source)}/>}
      </div>
    </dialog>, document.body)}
  </>;
}
