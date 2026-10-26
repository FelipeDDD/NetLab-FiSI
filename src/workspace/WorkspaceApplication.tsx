import { createRoot } from 'react-dom/client';
import LZString from 'lz-string';
import App from '../App';
import { useStore } from '../store';
import { applyUiTheme, useUiTheme } from '../uiTheme';
import { applyDeviceColors } from '../deviceColors';
import { WorkspaceProvider, exportWorkspaceDocument, sessionErrorMessage } from './WorkspaceUI';
import { createZustandSessionRuntime } from '../persistence/zustandSessionRuntime';
import { openSessionController } from '../persistence/openSessionController';
import { installApplicationLifecycle } from '../persistence/applicationLifecycle';
import { encodeDraftDocument } from '../projects/workspaceDocument';
import { readLegacyAutosave, createLegacyRecoveryFile } from '../projects/legacySource';
import { readRecoveryArchive } from '../projects/recoveryArchive';
import type { RepositoryOptions } from '../projects/types';
import type { SessionController } from '../persistence/sessionController';
import type { ProjectRepository } from '../projects/repository';
import type { SessionError, SessionRuntime } from '../persistence/sessionTypes';
import './workspace.css';

export function mountWorkspaceApplication(element: HTMLElement, options: {
  repositoryOptions?: RepositoryOptions;
  runtime?: SessionRuntime;
  legacy?: { storage: Pick<Storage, 'getItem'>; origin: string };
} = {}) {
  // This claim precedes opening IDB, migration, retries and lifecycle listeners.
  useStore.getState().protectLegacyAutosave();
  applyDeviceColors(document.documentElement); applyUiTheme(useUiTheme.getState().theme);
  document.documentElement.dataset.interfaceCards = new URLSearchParams(location.search).get('interfaceCards') === 'elevated' ? 'elevated' : 'accent';
  const root = createRoot(element), runtime = options.runtime ?? createZustandSessionRuntime({ pauseOnActivation: true });
  const legacy = options.legacy ?? { storage: { getItem: (key: string) => window.localStorage.getItem(key) }, origin: location.origin };
  const original = readLegacyAutosave(legacy.storage, legacy.origin);
  const baseline = encodeDraftDocument(runtime.capture());
  const previousWork = !!runtime.identity() || baseline.document.topology.devices.length > 0;
  let controller: SessionController | undefined, repository: ProjectRepository | undefined;
  let disposed = false, starting = false, cancelled = false, recoveryBusy = false;
  let error: SessionError | null = null, recoveryError = '';
  let attempt = new AbortController();
  const localStartupEdits = () => {
    if (controller) return false;
    try { return previousWork || encodeDraftDocument(runtime.capture()).json !== baseline.json; }
    catch { return true; }
  };
  const download = (name: string, blob: Blob) => {
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const backupCurrent = () => {
    try { exportWorkspaceDocument(runtime.capture()); }
    catch { recoveryError = 'Die lokale Kopie konnte nicht exportiert werden. Das Original und der Speicher bleiben unverändert.'; draw(); }
  };
  const backupStorage = async () => {
    if (recoveryBusy) return;
    recoveryBusy = true; recoveryError = ''; draw();
    try {
      const result = await readRecoveryArchive(options.repositoryOptions);
      if (!result.ok) recoveryError = sessionErrorMessage(result.error);
      else download('netlab-storage-recovery.json', new Blob([JSON.stringify(result.value, null, 2)], { type: 'application/json' }));
    } catch { recoveryError = 'Speicher-Backup konnte nicht gelesen werden. Es wurden keine Daten verändert.'; }
    finally { recoveryBusy = false; if (!disposed) draw(); }
  };
  const cancel = () => { cancelled = true; attempt.abort(); starting = false; draw(); };
  const draw = () => {
    if (disposed || controller) return;
    root.render(<main className="workspace-start"><section role={error ? 'alert' : undefined} data-error-code={error?.code} aria-busy={starting || recoveryBusy}>
      <h1>{starting ? 'Pläne werden wiederhergestellt…' : cancelled ? 'Wiederherstellung abgebrochen' : 'Sitzung konnte nicht geöffnet werden'}</h1>
      <p>{starting ? 'Ihre Entwürfe werden geladen. Die Simulation startet pausiert.' : error ? sessionErrorMessage(error) : 'Ihre gespeicherten Daten bleiben unverändert.'}</p>
      {!starting && <><p>Kein automatischer Wechsel zum alten Autosave. Vorhandene Pläne und das Original bleiben geschützt.</p>
        {localStartupEdits() && <p>Lokale Änderungen zuerst exportieren. Erneut versuchen verwirft diese Änderungen nicht; zum Wiederherstellen anschließend neu laden.</p>}
        {recoveryError && <p role="alert">{recoveryError}</p>}
        <footer>
          <button className="btn btn--primary" disabled={recoveryBusy} onClick={() => void start()}>Erneut versuchen</button>
          {original.status === 'present' && <button className="btn" onClick={() => {
            const file = createLegacyRecoveryFile(original.original.rawText); download(file.filename, new Blob([file.bytes], { type: file.mimeType }));
          }}>Original exportieren</button>}
          <button className="btn" onClick={backupCurrent}>Lokale Kopie exportieren</button>
          <button className="btn" disabled={recoveryBusy} onClick={() => void backupStorage()}>Speicher-Backup exportieren</button>
          <button className="btn" disabled={recoveryBusy} onClick={cancel}>Abbrechen</button>
        </footer><p>Das Speicher-Backup enthält rohe Datensätze zur Wiederherstellung, kein direkt importierbares Topologie-JSON.</p></>}
      {starting && <button className="btn" onClick={cancel}>Abbrechen</button>}
    </section></main>);
  };
  const receiveShare = () => {
    if (!controller || !location.hash.startsWith('#t=')) return;
    try {
      const json = LZString.decompressFromEncodedURIComponent(location.hash.slice(3));
      if (!json) throw Error('Invalid Share Link.');
      const offered = controller.offerShare({ schemaVersion: 1, topology: JSON.parse(json) });
      if (!offered.ok) throw Error(offered.error.message);
      history.replaceState(null, '', location.pathname + location.search);
    } catch { useStore.getState().setNotice('Share Link konnte nicht geöffnet werden. Ihre Pläne bleiben unverändert.'); }
  };
  async function start() {
    if (disposed || starting || controller) return;
    cancelled = false; recoveryError = '';
    if (localStartupEdits()) { error = { code: 'runtime-changed', message: 'Startup work must be recovered before restoration.' }; draw(); return; }
    starting = true; error = null; attempt = new AbortController();
    const currentAttempt = attempt;
    draw();
    try {
      const opened = await openSessionController({ runtime, repositoryOptions: options.repositoryOptions, signal: currentAttempt.signal,
        bootstrap: { legacy: { ...legacy, migrate: true }, expectedRuntimeDocument: baseline.document } });
      if (disposed || currentAttempt !== attempt || currentAttempt.signal.aborted) { if (opened.ok) { opened.controller.dispose(); opened.repository.close(); } return; }
      if (opened.ok) {
        controller = opened.controller; repository = opened.repository;
        root.render(<WorkspaceProvider controller={controller} repository={repository}><App /></WorkspaceProvider>);
        receiveShare();
      } else error = opened.error;
    } catch { if (currentAttempt === attempt && !currentAttempt.signal.aborted) error = { code: 'storage-error', message: 'Startup failed; original storage and local work were preserved.' }; }
    finally { if (currentAttempt === attempt) { starting = false; draw(); } }
  }
  const releaseLifecycle = installApplicationLifecycle({ controller: () => controller, pendingForms: runtime.hasPendingForms,
    pendingStartup: () => starting, localStartupEdits });
  window.addEventListener('hashchange', receiveShare);
  const ready = start();
  return { ready, get controller() { return controller; }, get repository() { return repository; },
    dispose() {
      disposed = true; attempt.abort(); releaseLifecycle(); window.removeEventListener('hashchange', receiveShare);
      controller?.dispose(); repository?.close(); root.unmount();
    },
  };
}
