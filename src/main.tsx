import { createRoot } from 'react-dom/client';
import '@xyflow/react/dist/style.css';
import '@xterm/xterm/css/xterm.css';
import './styles.css';
import App from './App';
import { useStore } from './store';

useStore.getState().boot();

createRoot(document.getElementById('root')!).render(<App />);
