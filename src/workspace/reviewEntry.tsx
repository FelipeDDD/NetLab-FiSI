// Test-only entry, deliberately absent from Vite's HTML/build inputs and main.tsx.
import { createRoot } from 'react-dom/client';
import '@xyflow/react/dist/style.css';
import '@xterm/xterm/css/xterm.css';
import '../themes.css';
import '../styles.css';
import '../buttons.css';
import './workspace.css';
import LZString from 'lz-string';
import App from '../App';
import { ExerciseProvider } from '../exercises/ExerciseUI';
import { WorkspaceProvider, sessionErrorMessage } from './WorkspaceUI';
import { createZustandSessionRuntime } from '../persistence/zustandSessionRuntime';
import { openSessionController } from '../persistence/openSessionController';
import { hasPendingForms } from '../persistence/pendingForms';
import type { SessionController } from '../persistence/sessionController';
import type { ProjectRepository } from '../projects/repository';
import type { RepositoryOptions } from '../projects/types';
import type { SessionBootstrapOptions } from '../persistence/sessionBootstrap';
import { applyUiTheme, useUiTheme } from '../uiTheme';
import { applyDeviceColors } from '../deviceColors';
import { useStore } from '../store';

export async function mountWorkspaceReview(element: HTMLElement, options: {
  databaseName: string;
  factory?: RepositoryOptions['factory'];
  legacy?: SessionBootstrapOptions['legacy'];
}) {
  if (location.pathname !== '/__workspace_ui_test__' || !/^netlab-idb-test-[\da-f-]{36}$/.test(options.databaseName)) throw Error('Workspace review requires the isolated test route and a disposable database.');
  const root = createRoot(element);
  applyDeviceColors(document.documentElement); applyUiTheme(useUiTheme.getState().theme);
  let controller: SessionController | undefined, repository: ProjectRepository | undefined, disposed = false;
  const receiveShare = () => {
    if (!controller || !location.hash.startsWith('#t=')) return;
    try {
      const decoded = LZString.decompressFromEncodedURIComponent(location.hash.slice(3));
      if (!decoded) throw Error('Invalid Share Link.');
      const result = controller.offerShare({ schemaVersion: 1, topology: JSON.parse(decoded) });
      if (!result.ok) throw Error(result.error.message);
      history.replaceState(null, '', location.pathname + location.search);
    } catch { useStore.getState().setNotice('Share Link konnte nicht geöffnet werden. Ihre Pläne bleiben unverändert.'); }
  };
  const pagehide = () => { if (controller) void controller.flush(); };
  const beforeunload = (event: BeforeUnloadEvent) => {
    if (controller && (hasPendingForms() || controller.getState().drafts.some(d => d.pendingPersistence))) { event.preventDefault(); event.returnValue = ''; }
  };
  const start = async () => {
    root.render(<main className="workspace-start"><section><h1>Pläne werden wiederhergestellt…</h1><p>Ihre Entwürfe bleiben von manuell gespeicherten Plänen getrennt.</p></section></main>);
    const opened = await openSessionController({ runtime: createZustandSessionRuntime(), repositoryOptions: {
      databaseName: options.databaseName, ...(options.factory === undefined ? {} : { factory: options.factory }),
    }, bootstrap: { legacy: options.legacy } });
    if (disposed) { if (opened.ok) { opened.controller.dispose(); opened.repository.close(); } return; }
    if (opened.ok) {
      controller = opened.controller; repository = opened.repository;
      root.render(<WorkspaceProvider controller={controller} repository={repository}><ExerciseProvider sessions={controller} repository={repository}><App /></ExerciseProvider></WorkspaceProvider>);
      receiveShare();
    } else root.render(<main className="workspace-start"><section role="alert" data-error-code={opened.error.code}>
      <h1>Sitzung konnte nicht geöffnet werden</h1><p>{sessionErrorMessage(opened.error)}</p><p>Es wurden keine vorhandenen Pläne ersetzt.</p>
      <footer><button className="btn btn--primary" onClick={() => void start()}>Erneut versuchen</button>
        {opened.recovery?.file && <button className="btn" onClick={() => {
          const file = opened.recovery!.file!, url = URL.createObjectURL(new Blob([file.bytes], { type: file.mimeType }));
          const link = document.createElement('a'); link.href = url; link.download = file.filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        }}>Original exportieren</button>}
        <button className="btn" onClick={() => { root.render(<main className="workspace-start"><section><h1>Wiederherstellung abgebrochen</h1><p>Ihre gespeicherten Daten bleiben unverändert.</p><button className="btn" onClick={() => void start()}>Erneut versuchen</button></section></main>); }}>Abbrechen</button>
      </footer></section></main>);
  };
  window.addEventListener('hashchange', receiveShare); window.addEventListener('pagehide', pagehide); window.addEventListener('beforeunload', beforeunload);
  await start();
  return { get controller() { return controller; }, get repository() { return repository; },
    dispose() { disposed = true; window.removeEventListener('hashchange', receiveShare); window.removeEventListener('pagehide', pagehide); window.removeEventListener('beforeunload', beforeunload); controller?.dispose(); repository?.close(); root.unmount(); },
  };
}
