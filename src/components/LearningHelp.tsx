import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from '../i18n';
import './learningHelp.css';

export type LearningHelpPage = 'ipv4';
type HelpLocation = { page: LearningHelpPage; origin: HTMLElement | null };
const HelpContext = createContext<{ open(page: LearningHelpPage, origin: HTMLElement | null): void } | null>(null);
export const useLearningHelp = () => useContext(HelpContext);

export const IPV4_HELP_COMMANDS = {
  show: 'ip address show', add: 'ip address add 192.168.10.10/24 dev eth0', windows: 'ipconfig /all',
} as const;

export function LearningHelpProvider({ children }: { children: ReactNode }) {
  const [location, setLocation] = useState<HelpLocation | null>(null);
  return <HelpContext.Provider value={{ open: (page, origin) => setLocation({ page, origin }) }}>
    {children}
    {location && <LearningHelpDialog location={location} onClose={() => setLocation(null)} />}
  </HelpContext.Provider>;
}

export function LearningHelpLink({ page }: { page: LearningHelpPage }) {
  const help = useLearningHelp(), { t } = useTranslation();
  if (!help) return null;
  return <button type="button" className="learning-help-link" data-help-page={page} aria-haspopup="dialog"
    title={t('learningHelp.open')} onClick={event => help.open(page, event.currentTarget)}>
    <span aria-hidden="true">ⓘ</span> {t('learningHelp.title')}
  </button>;
}

function CommandExample({ command }: { command: string }) {
  return <pre className="learning-help-command"><code>{command}</code></pre>;
}

function LearningHelpDialog({ location, onClose }: { location: HelpLocation; onClose(): void }) {
  const { t, language } = useTranslation();
  const dialog = useRef<HTMLDialogElement>(null), heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const element = dialog.current!;
    element.showModal(); heading.current?.focus({ preventScroll: true });
    return () => {
      element.close();
      const origin = location.origin?.isConnected ? location.origin : document.querySelector<HTMLElement>('.canvas');
      origin?.focus({ preventScroll: true });
    };
  }, [location]);
  return createPortal(<dialog ref={dialog} className="learning-help" lang={language} data-floating-popover=""
    aria-labelledby="learning-help-title" onCancel={event => { event.preventDefault(); onClose(); }}
    onKeyDown={event => {
      event.stopPropagation();
      if (event.key !== 'Tab' || event.ctrlKey || event.altKey || event.metaKey) return;
      const controls = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === heading.current)) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }} onClick={event => {
      if (event.target !== event.currentTarget) return;
      const r = event.currentTarget.getBoundingClientRect();
      if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) onClose();
    }}>
    <header><div><small>{t('navigation.help')}</small><h2 ref={heading} tabIndex={-1} id="learning-help-title">{t('learningHelp.title')}</h2></div>
      <button type="button" className="btn" aria-label={t('common.close')} onClick={onClose}>×</button></header>
    <div className="learning-help-body">
      <p className="learning-help-intro">{t('learningHelp.intro')}</p>
      <section className="learning-help-config"><h3>{t('learningHelp.example')}</h3>
        <dl><div><dt>{t('learningHelp.ip')} <code>192.168.10.10</code></dt><dd>{t('learningHelp.ipMeaning')}</dd></div>
          <div><dt>{t('learningHelp.mask')} <code>/24</code></dt><dd>{t('learningHelp.maskMeaning')}</dd></div>
          <div><dt>{t('learningHelp.gateway')} <code>192.168.10.1</code></dt><dd>{t('learningHelp.gatewayMeaning')}</dd></div></dl>
      </section>
      <div className="learning-help-methods"><section><h3>{t('learningHelp.inspector')}</h3>
        <ol><li>{t('learningHelp.step1')}</li><li>{t('learningHelp.step2')}</li><li>{t('learningHelp.step3')}</li></ol>
      </section><section><h3>{t('learningHelp.linux')}</h3><p>{t('learningHelp.linuxIntro')}</p><CommandExample command={IPV4_HELP_COMMANDS.show} />
        <p>{t('learningHelp.linuxAdd')}</p><CommandExample command={IPV4_HELP_COMMANDS.add} />
        <details><summary>{t('learningHelp.netlabNote')}</summary><p>{t('learningHelp.linuxLimit')}</p></details>
      </section></div>
      <section className="learning-help-windows"><h3>{t('learningHelp.windows')}</h3><p>{t('learningHelp.windowsIntro')}</p>
        <CommandExample command={IPV4_HELP_COMMANDS.windows} /><p>{t('learningHelp.windowsLimit')}</p></section>
    </div>
    <footer><button type="button" className="btn" onClick={onClose}>{t('learningHelp.back')}</button></footer>
  </dialog>, document.body);
}
