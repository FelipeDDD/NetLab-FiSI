import { useState } from 'react';
import { previewNftMasquerade, type MasqueradeRuleError } from '../commands/nft';
import type { RouterDevice } from '../engine/ipdevice';
import { useTranslation, type TranslationKey } from '../i18n';
import { usePendingForm } from '../persistence/usePendingForm';
import { useStore } from '../store';

const errorMessages: Record<MasqueradeRuleError, TranslationKey> = {
  iface: 'natEditor.ifaceError',
  source: 'natEditor.sourceError',
  chain: 'natEditor.chainError',
  stale: 'natEditor.stale',
};

export function NatRuleEditor({ device }: { device: RouterDevice }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [iface, setIface] = useState('');
  const [source, setSource] = useState('');
  const [error, setError] = useState<TranslationKey | null>(null);
  const [status, setStatus] = useState<TranslationKey | null>(null);
  usePendingForm(() => open && (iface !== '' || source.trim() !== ''));

  if (!open) return <section>
    <button type="button" className="mini-btn" onClick={() => {
      setIface('');
      setSource('');
      setError(null);
      setStatus(null);
      setOpen(true);
    }}>{t('natEditor.add')}</button>
    {status && <p role="status">{t(status)}</p>}
  </section>;

  const preview = previewNftMasquerade(device, iface, source);
  const commands = preview.commands.join('\n');
  const clearFeedback = () => { setError(null); setStatus(null); };

  return <form className="nat-rule-form" aria-label={t('natEditor.add')} onSubmit={event => {
    event.preventDefault();
    const result = useStore.getState().addNatMasquerade(device, iface, source);
    if (result) {
      setStatus(null);
      setError(errorMessages[result]);
      return;
    }
    setStatus('natEditor.added');
    setOpen(false);
  }}>
    <h3>{t('natEditor.add')}</h3>
    <p>{t('natEditor.chain', { chain: preview.chain })}</p>
    <label>{t('natEditor.iface')}
      <select autoFocus value={iface} onChange={event => { setIface(event.target.value); clearFeedback(); }}>
        <option value="">{t('natEditor.select')}</option>
        {device.interfaces.map(port => <option key={port.name} value={port.name}>{port.name}</option>)}
      </select>
      <small className="hint">{t('natEditor.ifaceHint')}</small>
    </label>
    <label>{t('natEditor.source')}
      <input className="iface-ip" value={source} onChange={event => { setSource(event.target.value); clearFeedback(); }}
        autoComplete="off" spellCheck={false} />
      <small className="hint">{t('natEditor.sourceHint')}</small>
    </label>
    <p>{t('natEditor.action')} · <code>masquerade</code><br /><small className="hint">{t('natEditor.masquerade')}</small></p>
    <h4>{t('natEditor.preview')}</h4>
    <pre className="table-pre"><code>{commands}</code></pre>
    <div className="static-route-actions">
      <button type="submit" className="btn">{t('natEditor.add')}</button>
      <button type="button" className="btn" disabled={'error' in preview} onClick={async () => {
        clearFeedback();
        try {
          await navigator.clipboard.writeText(commands);
          setStatus('natEditor.copied');
        } catch {
          setError('navigation.clipboardFailed');
        }
      }}>{t('natEditor.copy')}</button>
      <button type="button" className="btn" onClick={() => { clearFeedback(); setOpen(false); }}>{t('common.cancel')}</button>
    </div>
    {error && <p role="alert">{t(error)}</p>}
    {status && <p role="status">{t(status)}</p>}
  </form>;
}
