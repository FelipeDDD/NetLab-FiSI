import type {Language} from '../i18n';
import type {BrowserResult} from './request';
import {browserText} from './messages';
import {browserErrorPresentation} from './errorPresentation';

export function BrowserErrorPanel({result,language,showCode=true,children}:{result:BrowserResult;language:Language;showCode?:boolean;children?:import('react').ReactNode}) {
  const info=browserErrorPresentation(result,language);if(!info)return null;
  return <section role="alert" className="pc-browser-error" lang={language}>
    <div className="pc-browser-error-heading"><svg width="24" height="28" viewBox="0 0 24 28" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="M5 2h9l5 5v19H5zM14 2v6h5M8 13h2m4 0h2m-8 8 3-3 4 3"/></svg><h3>{info.title}</h3></div>
    {showCode&&info.code&&<p className="pc-browser-error-code"><code>{info.code}</code></p>}
    <div className="pc-browser-error-help"><h4>{browserText(language,'whatMeans')}</h4><p>{info.explanation}</p>
      {info.resolution&&<p className="pc-browser-dns-resolution">{info.resolution}</p>}</div>
    {children}
  </section>;
}
