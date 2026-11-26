import { useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from '../i18n';

const formId = String(import.meta.env.VITE_TALLY_FEEDBACK_FORM_ID ?? '').trim();

export function FeedbackButton({ onOpen }: { onOpen(): void }) {
  const { t } = useTranslation();
  const button = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  useLayoutEffect(() => {
    if (!open || !dialog.current || dialog.current.open) return;
    dialog.current.showModal();
    closeButton.current?.focus({ preventScroll: true });
  }, [open]);

  if (!/^[A-Za-z0-9]+$/.test(formId)) return null;

  const label = t('navigation.feedback');
  return <>
    <button ref={button} type="button" className="toolbar-menu-trigger toolbar-feedback" data-feedback
      aria-label={label} aria-description={t('navigation.feedbackPrivacy')}
      title={t('navigation.feedbackPrivacy')} aria-haspopup="dialog" aria-expanded={open}
      onClick={() => { onOpen(); setOpen(true); }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 5h16v11H9l-5 4zM8 9h8m-8 3h5"/>
      </svg><span>{label}</span>
    </button>
    {open && <dialog ref={dialog} className="feedback-dialog" aria-labelledby="feedback-dialog-title"
      onClose={() => { setOpen(false); button.current?.focus({ preventScroll: true }); }}>
      <div className="feedback-dialog-header">
        <strong id="feedback-dialog-title">{label}</strong>
        <button ref={closeButton} type="button" className="feedback-dialog-close"
          aria-label={t('common.close')} onClick={() => dialog.current?.close()}>×</button>
      </div>
      {/* Embed directly so the Tally SDK cannot forward the enclosing URL. */}
      <iframe title={label} src={`https://tally.so/embed/${formId}`} referrerPolicy="no-referrer" />
    </dialog>}
  </>;
}
