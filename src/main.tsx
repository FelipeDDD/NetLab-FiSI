import '@xyflow/react/dist/style.css';
import '@xterm/xterm/css/xterm.css';
import './themes.css';
import './styles.css';
import './buttons.css';
import { mountWorkspaceApplication } from './workspace/WorkspaceApplication';

// A single owner opens storage, restores the paused active draft and installs
// lifecycle hooks. The legacy boot/listeners must not run alongside it.
const application = mountWorkspaceApplication(document.getElementById('root')!);
if (import.meta.hot) import.meta.hot.dispose(() => application.dispose());
