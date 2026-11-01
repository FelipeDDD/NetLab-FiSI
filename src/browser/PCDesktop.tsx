import {useEffect,useMemo,useRef,useState} from 'react';
import type {Host} from '../engine/ipdevice';
import {useStore} from '../store';
import {useTranslation} from '../i18n';
import {useDesktop} from './desktopState';
import {browserText} from './messages';
import {requestPage,simulatedUrl,type BrowserResult} from './request';
import {pageContent} from './content';
import {useDesktopWindow} from './useDesktopWindow';
import type {ResizeEdge} from './windowGeometry';
import {BrowserErrorPanel} from './BrowserErrorPanel';
import './browser.css';

export default function PCDesktop({device}:{device:Host}) {
  const {language}=useTranslation(),paused=useStore(s=>s.paused);
  const frame=useDesktopWindow(),open=useDesktop(s=>s.view==='browser');
  const t=(key:Parameters<typeof browserText>[1],values?:Record<string,string|number>)=>browserText(language,key,values);
  const [draft,setDraft]=useState('http://server.lab'),[history,setHistory]=useState<string[]>([]),[index,setIndex]=useState(-1);
  const [result,setResult]=useState<BrowserResult>(),[loading,setLoading]=useState(false),[stopped,setStopped]=useState(false),[stage,setStage]=useState<'dns'|'tcp'|'http'>('dns');
  const request=useRef<{cancel():void}>(),sequence=useRef(0),address=useRef<HTMLInputElement>(null),launch=useRef<HTMLButtonElement>(null);
  const opener=useRef(document.activeElement instanceof HTMLElement?document.activeElement:null);
  function cancel(){sequence.current++;request.current?.cancel();request.current=undefined;setLoading(false);}
  useEffect(()=>()=>{sequence.current++;request.current?.cancel();},[]);
  useEffect(()=>{if(open)address.current?.focus();},[open]);
  function navigate(raw:string,position?:number,tcpOnly=false) {
    cancel();setResult(undefined);setStopped(false);
    const url=simulatedUrl(raw);
    if(!url){setResult({kind:'error',code:'url'});return;}
    setDraft(url.address);
    if(position!==undefined)setIndex(position);
    else if(!tcpOnly){const next=[...history.slice(0,index+1),url.address];setHistory(next);setIndex(next.length-1);}
    if(!url.https||tcpOnly){const state=useStore.getState();if(state.paused&&state.pauseReason==='activation')state.setPaused(false);}
    setLoading(true);const token=++sequence.current;
    request.current=requestPage(device,url,value=>{if(token===sequence.current){setResult(value);setLoading(false);}},
      {tcpOnly,stage:value=>{if(token===sequence.current)setStage(value);}});
  }
  // The renderer receives only HTTP response content from the simulated engine.
  const content=useMemo(()=>result?.kind==='http'?pageContent(result.body,result.url,url=>navigate(url)):null,[result]);
  function closeBrowser(){cancel();useDesktop.getState().showDesktop();setTimeout(()=>launch.current?.focus(),0);}
  function closeDesktop(){useDesktop.getState().close();if(opener.current?.isConnected)opener.current.focus();}
  const current=history[index],https=simulatedUrl(current??draft);
  const moveHeader={tabIndex:0,'aria-label':t('moveWindow'),title:t('moveWindow'),onPointerDown:(e:import('react').PointerEvent<HTMLElement>)=>frame.start('move',e),onKeyDown:(e:import('react').KeyboardEvent<HTMLElement>)=>frame.keyboard('move',e)};
  return <section ref={frame.element} className={`pc-desktop nodrag nopan nowheel${frame.interacting?' is-window-interacting':''}`} role="dialog" aria-modal="false" aria-labelledby="pc-desktop-heading"
    style={frame.rect?{left:frame.rect.x,top:frame.rect.y,width:frame.rect.width,height:frame.rect.height}:{visibility:'hidden'}}
    onPointerMove={frame.move} onPointerUp={frame.finish} onPointerCancel={frame.finish} onLostPointerCapture={frame.finish}
    onPointerDown={e=>e.stopPropagation()} onKeyDown={e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();if(open)closeBrowser();else closeDesktop();}}}>
    <header className="pc-desktop-header" {...moveHeader}><div><h2 id="pc-desktop-heading">{device.name} · {t('desktop')}</h2><small>{device.os==='windows'?'Windows':'Linux'}</small></div>
      <button type="button" className="btn btn--icon" aria-label={t('closeDesktop')} onClick={closeDesktop}>×</button></header>
    {!open?<div className="pc-desktop-home"><button className="btn pc-desktop-app" type="button" ref={launch} onClick={()=>useDesktop.getState().openBrowser(device)}>
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="16" cy="16" r="12"/><ellipse cx="16" cy="16" rx="5" ry="12"/><path d="M4 16h24M7 9h18M7 23h18"/></svg>{t('browser')}</button><p>{t('intro')}</p></div>:
    <div className="pc-browser"><div className="pc-browser-header" {...moveHeader}><strong>{t('browser')}</strong><button className="btn btn--icon" type="button" aria-label={t('closeBrowser')} onClick={closeBrowser}>×</button></div>
      <form className="pc-browser-navigation" onSubmit={e=>{e.preventDefault();navigate(draft);}}>
        <button className="btn btn--icon" type="button" aria-label={t('back')} disabled={index<=0} onClick={()=>navigate(history[index-1],index-1)}>←</button>
        <button className="btn btn--icon" type="button" aria-label={t('forward')} disabled={index>=history.length-1} onClick={()=>navigate(history[index+1],index+1)}>→</button>
        <button className="btn btn--icon" type="button" aria-label={t(loading?'stop':'reload')} disabled={!loading&&!current} onClick={()=>{if(loading){cancel();setStopped(true);}else if(current)navigate(current,index);}}>{loading?'×':'↻'}</button>
        <label className="sr-only" htmlFor="pc-browser-address">{t('address')}</label><input id="pc-browser-address" ref={address} value={draft} maxLength={2048} autoComplete="off" spellCheck={false} onChange={e=>setDraft(e.target.value)}/>
        <button className="btn btn--primary" type="submit">{t('go')}</button>
      </form>
      <div className="pc-browser-document" tabIndex={0} aria-label={t('response')}>
        {loading?<p role="status">{t(stage==='dns'?'dnsStage':stage==='tcp'?'tcpStage':'httpStage')}</p>:stopped?<p role="status">{t('cancelled')}</p>:
          !result?<p>{t('start')}</p>:result.kind==='error'?<BrowserErrorPanel result={result} language={language}>
            {result.code==='https'&&https&&<button type="button" className="btn" onClick={()=>navigate(https.address,undefined,true)}>{t('probe',{port:https.port})}</button>}</BrowserErrorPanel>:
          result.kind==='tcp'?<p role="status">{t('tcpOpen',{port:result.port})}</p>:<><div className="pc-browser-http-status" role="status">HTTP {result.status} {result.reason}</div><BrowserErrorPanel result={result} language={language} showCode={false}/>{[403,404].includes(result.status)?<details className="pc-browser-server-response"><summary>{t('serverResponse')}</summary><article className="pc-browser-page">{content}</article></details>:<article className="pc-browser-page">{content}</article>}</>}
        {loading&&paused&&<p role="status" className="pc-browser-pause">{t('paused')}</p>}
      </div><footer className="pc-browser-footer">{t('simple')}</footer>
    </div>}
    {(['n','s','e','w','ne','nw','se','sw'] as ResizeEdge[]).map(edge=>{
      const vertical=edge==='e'||edge==='w',axis=vertical||edge==='n'||edge==='s';
      return <div key={edge} className={`pc-window-resizer resize-${edge}`} tabIndex={0} role={axis?'separator':'button'}
        aria-label={`${t('resizeWindow')} · ${edge.toUpperCase()}`} aria-orientation={axis?(vertical?'vertical':'horizontal'):undefined}
        aria-valuenow={axis&&frame.rect?Math.round(vertical?frame.rect.width:frame.rect.height):undefined}
        aria-valuemin={axis?Math.round(vertical?frame.limits.minWidth:frame.limits.minHeight):undefined}
        aria-valuemax={axis?Math.round(vertical?frame.limits.maxWidth:frame.limits.maxHeight):undefined}
        onPointerDown={e=>frame.start(edge,e)} onKeyDown={e=>frame.keyboard(edge,e)}/>;
    })}
  </section>;
}
