import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { applyUiTheme, useUiTheme } from '../uiTheme';
import { installLanguageDocument } from '../i18n';
import '../themes.css';
import './home.css';

applyUiTheme(useUiTheme.getState().theme);
const releaseLanguage = installLanguageDocument();
const root = createRoot(document.getElementById('root')!);
let disposed = false;
// Old presentation query parameters are intentionally ignored; editor URLs are independent.
void import('./journey/ThematicHome').then(({ default: ThematicHome }) => {
  if (!disposed) flushSync(() => root.render(<ThematicHome />));
});
if (import.meta.hot) import.meta.hot.dispose(() => { disposed = true; releaseLanguage(); root.unmount(); });
