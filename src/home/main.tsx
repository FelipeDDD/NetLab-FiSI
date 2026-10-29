import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { homeExperience } from './experience';
import { applyUiTheme, useUiTheme } from '../uiTheme';
import { installLanguageDocument } from '../i18n';
import '../themes.css';
import './home.css';

applyUiTheme(useUiTheme.getState().theme);
const releaseLanguage = installLanguageDocument();
const root = createRoot(document.getElementById('root')!);
let disposed = false;
// Keep the former homepage behind an explicit URL, without loading it on normal visits.
const page = homeExperience(location.search).classic
  ? import('./Home').then(module => module.Home)
  : import('./journey/ThematicHome').then(module => module.default);
void page.then(Page => {
  if (!disposed) flushSync(() => root.render(<Page />));
});
if (import.meta.hot) import.meta.hot.dispose(() => { disposed = true; releaseLanguage(); root.unmount(); });
