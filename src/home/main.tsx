import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { Home } from './Home';
import { applyUiTheme, useUiTheme } from '../uiTheme';
import { installLanguageDocument } from '../i18n';
import '../themes.css';
import './home.css';

applyUiTheme(useUiTheme.getState().theme);
const releaseLanguage = installLanguageDocument();
const root = createRoot(document.getElementById('root')!);
let disposed = false;
// Opt-in experiment: the classic homepage remains the default entrypoint.
if (new URLSearchParams(location.search).get('experience') === 'journey') {
  void import('./journey/ThematicHome').then(({ default: ThematicHome }) => {
    if (!disposed) flushSync(() => root.render(<ThematicHome />));
  });
} else root.render(<Home />);
if (import.meta.hot) import.meta.hot.dispose(() => { disposed = true; releaseLanguage(); root.unmount(); });
