import { useStore } from '../store';
import { confirmReplacement } from '../persistence/replacement';
import { useTranslation } from '../i18n';
import { editorMessageText } from '../editorMessages';

export function PersistenceStatus() {
  const { t } = useTranslation();
  const error = useStore(s => s.autosaveError);
  const blocked = useStore(s => s.autosaveBlocked);
  const original = useStore(s => s.protectedAutosave);
  const rejected = useStore(s => s.rejectedDocument);
  const share = useStore(s => s.pendingShare);
  const link = useStore(s => s.shareLink);
  if (!error && !rejected && !share && !link) return null;
  const state = () => useStore.getState();
  // Old/injected free-text errors remain valid; newly identified branches carry
  // presentation keys. The rejected original and diagnostic remain untouched.
  return <section className="persistence-status" aria-label={t('workspace.storageRecovery')}>
    {error && <div className="persistence-status-row">
      <span role="alert">{editorMessageText(error, t)}</span>
      <button className="btn" onClick={() => state().retryAutosave()}>{t('workspace.retry')}</button>
      <button className="btn" onClick={() => state().exportJson()}>{t('workspace.exportCurrent')}</button>
      {original !== null && <button className="btn" onClick={() => state().exportProtectedAutosave()}>{t('workspace.exportOriginal')}</button>}
      {blocked && original !== null && <button className="btn" onClick={() => {
        if (window.confirm(t('workspace.replaceProtectedWarning'))) state().saveTemporaryTopology();
      }}>{t('workspace.saveTemporary')}</button>}
    </div>}
    {rejected && <div className="persistence-status-row">
      <span role="alert">{editorMessageText(rejected.presentation ?? rejected.error, t)}</span>
      <button className="btn" onClick={() => state().exportRejectedDocument()}>{t('workspace.exportRejected')}</button>
      <button className="btn" onClick={() => state().dismissRejectedDocument()}>{t('common.close')}</button>
    </div>}
    {share && <div className="persistence-status-row">
      <span>{t('workspace.legacyShareOffer')}</span>
      <button className="btn" onClick={() => confirmReplacement(() => state().openPendingShare(), message => window.confirm(message))}>{t('workspace.openShare')}</button>
      <button className="btn" onClick={() => state().dismissPendingShare()}>{t('workspace.discard')}</button>
    </div>}
    {link && <div className="persistence-status-row">
      <label>{t('workspace.shareLink')} <input aria-label={t('workspace.copyShare')} readOnly value={link} onFocus={e => e.currentTarget.select()} /></label>
      <button className="btn" onClick={() => useStore.setState({ shareLink: null })}>{t('common.close')}</button>
    </div>}
  </section>;
}
