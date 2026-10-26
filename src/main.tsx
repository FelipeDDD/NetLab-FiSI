import { createRoot } from 'react-dom/client';
import '@xyflow/react/dist/style.css';
import '@xterm/xterm/css/xterm.css';
import './themes.css';
import './styles.css';
import './buttons.css';
import App from './App';
import { useStore } from './store';
import { applyUiTheme, useUiTheme } from './uiTheme';
import { applyDeviceColors } from './deviceColors';

applyDeviceColors(document.documentElement);
applyUiTheme(useUiTheme.getState().theme);
// Temporary visual comparison, independent of saved UI/topology preferences.
document.documentElement.dataset.interfaceCards = new URLSearchParams(window.location.search).get('interfaceCards') === 'elevated' ? 'elevated' : 'accent';
useStore.getState().boot();
// Preserve pending debounced edits even if the page is reloaded immediately.
window.addEventListener('pagehide', useStore.getState().flushAutosave);
// Pasting another Share Link into an already open tab is a same-document
// navigation. Offer it explicitly without rebooting or replacing local work.
window.addEventListener('hashchange', useStore.getState().receiveShareLink);

createRoot(document.getElementById('root')!).render(<App />);
