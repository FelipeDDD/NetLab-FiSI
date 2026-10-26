import { useStore } from '../store';
import { confirmReplacement } from '../persistence/replacement';

export function PersistenceStatus() {
  const error = useStore(s => s.autosaveError);
  const blocked = useStore(s => s.autosaveBlocked);
  const original = useStore(s => s.protectedAutosave);
  const rejected = useStore(s => s.rejectedDocument);
  const share = useStore(s => s.pendingShare);
  const link = useStore(s => s.shareLink);
  if (!error && !rejected && !share && !link) return null;
  const state = () => useStore.getState();
  return <section className="persistence-status" aria-label="Speicherung und Wiederherstellung">
    {error && <div className="persistence-status-row">
      <span role="alert">{error}</span>
      <button className="btn" onClick={() => state().retryAutosave()}>Erneut versuchen</button>
      <button className="btn" onClick={() => state().exportJson()}>Aktuelle Topologie exportieren</button>
      {original !== null && <button className="btn" onClick={() => state().exportProtectedAutosave()}>Original exportieren</button>}
      {blocked && original !== null && <button className="btn" onClick={() => {
        if (window.confirm('Der geschützte Autosave wird durch die aktuelle temporäre Topologie ersetzt. Das Original zuerst exportieren. Wirklich ersetzen?')) state().saveTemporaryTopology();
      }}>Temporäre Topologie speichern…</button>}
    </div>}
    {rejected && <div className="persistence-status-row">
      <span role="alert">Import nicht übernommen: {rejected.error}</span>
      <button className="btn" onClick={() => state().exportRejectedDocument()}>Abgelehntes Original exportieren</button>
      <button className="btn" onClick={() => state().dismissRejectedDocument()}>Schließen</button>
    </div>}
    {share && <div className="persistence-status-row">
      <span>Ein Share Link ist verfügbar. Die lokale Topologie bleibt geöffnet, bis Sie ihn ausdrücklich übernehmen.</span>
      <button className="btn" onClick={() => confirmReplacement(() => state().openPendingShare(), message => window.confirm(message))}>Share Link öffnen…</button>
      <button className="btn" onClick={() => state().dismissPendingShare()}>Verwerfen</button>
    </div>}
    {link && <div className="persistence-status-row">
      <label>Share Link <input aria-label="Share Link kopieren" readOnly value={link} onFocus={e => e.currentTarget.select()} /></label>
      <button className="btn" onClick={() => useStore.setState({ shareLink: null })}>Schließen</button>
    </div>}
  </section>;
}
