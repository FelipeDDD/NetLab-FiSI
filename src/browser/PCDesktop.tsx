import {useEffect,useMemo,useRef,useState} from 'react';
import type {Host} from '../engine/ipdevice';
import {useStore} from '../store';
import {useTranslation} from '../i18n';
import {MAX_BROWSER_TABS,useDesktop,type BrowserTab as BrowserTabEntry} from './desktopState';
import {browserText} from './messages';
import {requestPage,simulatedUrl,type BrowserResult} from './request';
import {pageContent} from './content';
import {useDesktopWindow} from './useDesktopWindow';
import type {ResizeEdge} from './windowGeometry';
import {BrowserErrorPanel} from './BrowserErrorPanel';
import './browser.css';
import { sim } from '../sim';
import { natIntroSignature, natConfiguration, natSecondHost, natRouterEntries, natBrowserProof, natHostReady } from '../labs/natLearning';
import { PROGRESSIVE_NAT_PAT_ID, PROGRESSIVE_NAT_PAT_URL } from '../labs/progressiveNatPat';

export default function PCDesktop({ device, tabs, availableHosts }: { device: Host | null; tabs: BrowserTabEntry[]; availableHosts: Host[] }) {
  const { language } = useTranslation();
  const frame = useDesktopWindow();
  const { view, activeTab, limitReached, selectTab, closeTab, openBrowser } = useDesktop();
  const visible = device !== null;
  const open = visible && view === 'browser';
  const t = (key: Parameters<typeof browserText>[1]) => browserText(language, key);
  const launch = useRef<HTMLButtonElement>(null);
  const addTabButton = useRef<HTMLButtonElement>(null);
  const [choosingHost, setChoosingHost] = useState(false);
  const canAddTab = tabs.length < MAX_BROWSER_TABS && availableHosts.length > 0;
  const showHostChoice = open && choosingHost && canAddTab;
  useEffect(() => { setChoosingHost(false); }, [device, open, canAddTab]);
  const opener = useRef(document.activeElement instanceof HTMLElement ? document.activeElement : null);
  function closeBrowser() {
    useDesktop.getState().showDesktop();
    setTimeout(() => launch.current?.focus(), 0);
  }
  function closeDesktop() {
    useDesktop.getState().close();
    if (opener.current?.isConnected) opener.current.focus();
  }
  const moveHeader = { tabIndex: 0, 'aria-label': t('moveWindow'), title: t('moveWindow'),
    onPointerDown: (e: import('react').PointerEvent<HTMLElement>) => frame.start('move', e),
    onKeyDown: (e: import('react').KeyboardEvent<HTMLElement>) => frame.keyboard('move', e) };
  return <section ref={frame.element} hidden={!visible}
    className={`pc-desktop nodrag nopan nowheel${frame.interacting ? ' is-window-interacting' : ''}`}
    role="dialog" aria-modal="false" aria-labelledby={visible ? 'pc-desktop-heading' : undefined}
    style={frame.rect ? { left: frame.rect.x, top: frame.rect.y, width: frame.rect.width, height: frame.rect.height } : { visibility: 'hidden' }}
    onPointerMove={frame.move} onPointerUp={frame.finish} onPointerCancel={frame.finish} onLostPointerCapture={frame.finish}
    onPointerDown={event => event.stopPropagation()} onKeyDown={event => {
      event.stopPropagation();
      if (event.key === 'Escape') {
        event.preventDefault();
        if (showHostChoice) { setChoosingHost(false); addTabButton.current?.focus(); }
        else if (open) closeBrowser();
        else closeDesktop();
      }
    }}>
    {visible && <header className={`pc-desktop-header${open ? ' is-browser' : ''}`} {...moveHeader}>
      <div><h2 id="pc-desktop-heading">{device.name} · {t(open ? 'browser' : 'desktop')}</h2>{!open && <small>{device.os === 'windows' ? 'Windows' : 'Linux'}</small>}</div>
      {open && <button type="button" className="btn pc-browser-desktop" title={t('closeBrowser')} onClick={closeBrowser}>‹ {t('desktop')}</button>}
      <button type="button" className="btn btn--icon pc-desktop-close" aria-label={t('closeDesktop')} onClick={closeDesktop}>×</button>
    </header>}
    {device && !open && <div className="pc-desktop-home"><button className="btn pc-desktop-app" type="button" ref={launch} onClick={() => openBrowser(device)}>
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18M5 7h14M5 17h14"/></svg>{t('browser')}</button><p>{t('intro')}</p></div>}
    <div className={open ? 'pc-browser' : undefined} hidden={!open}>
      {open && <div className="pc-browser-tabs" role="group" aria-label={t('tabs')}>
        {tabs.map(({ id, device: host }, index) => <div className="pc-browser-tab" key={id}>
          <button type="button" className="btn" aria-pressed={activeTab === id} title={host.name}
            aria-label={browserText(language, 'tab', { number: index + 1 }) + ' · ' + host.name}
            onClick={() => selectTab(id)}><span>{index + 1} · {host.name}</span></button>
          {tabs.length > 1 && <button type="button" className="btn btn--icon" aria-label={browserText(language, 'closeTab', { number: index + 1 })}
            onClick={() => closeTab(id)}>×</button>}
        </div>)}
        <button ref={addTabButton} type="button" className="btn btn--icon pc-browser-add-tab" title={t('newTab')} aria-label={t('newTab')}
          aria-expanded={showHostChoice} disabled={!canAddTab} onClick={() => setChoosingHost(value => !value)}>+</button>
      </div>}
      {showHostChoice && <select className="pc-browser-host-choice" aria-label={t('chooseHost')} value="" autoFocus onChange={event => {
        const host = availableHosts.find(host => host.id === event.target.value);
        if (host && sim.net.devices.get(host.id) === host) openBrowser(host);
        setChoosingHost(false);
      }}>
        <option value="" disabled>{t('chooseHost')}</option>
        {availableHosts.map(host => <option key={host.id} value={host.id}>{host.name}</option>)}
      </select>}
      {open && limitReached && <p role="status" className="pc-browser-tab-limit">{t('tabLimit')}</p>}
      {tabs.map(({ id, device: host }) => <BrowserTab key={id} device={host} active={open && id === activeTab} />)}
    </div>
    {visible && (['n','s','e','w','ne','nw','se','sw'] as ResizeEdge[]).map(edge=>{
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

function BrowserTab({ device, active }: { device: Host; active: boolean }) {
  const {language}=useTranslation(),paused=useStore(s=>s.paused);
  const t=(key:Parameters<typeof browserText>[1],values?:Record<string,string|number>)=>browserText(language,key,values);
  const [draft,setDraft]=useState('http://server.lab'),[history,setHistory]=useState<string[]>([]),[index,setIndex]=useState(-1);
  const [result,setResult]=useState<BrowserResult>(),[loading,setLoading]=useState(false),[stopped,setStopped]=useState(false),[stage,setStage]=useState<'dns'|'tcp'|'http'>('dns');
  const request=useRef<{cancel():void}>(),sequence=useRef(0),address=useRef<HTMLInputElement>(null);
  function cancel(){sequence.current++;request.current?.cancel();request.current=undefined;setLoading(false);}
  useEffect(()=>()=>{sequence.current++;request.current?.cancel();},[]);
  useEffect(() => { if (active && !document.activeElement?.closest('.pc-browser-tabs')) address.current?.focus(); }, [active]);
  function navigate(raw:string,position?:number,tcpOnly=false) {
    cancel();setResult(undefined);setStopped(false);
    const url=simulatedUrl(raw);
    if(!url){setResult({kind:'error',code:'url'});return;}
    setDraft(url.address);
    if(position!==undefined)setIndex(position);
    else if(!tcpOnly){const next=[...history.slice(0,index+1),url.address];setHistory(next);setIndex(next.length-1);}
    if(!url.https||tcpOnly){const state=useStore.getState();if(state.paused&&state.pauseReason==='activation')state.setPaused(false);}
    setLoading(true);const token=++sequence.current;
    const network = sim.net;
    const initial = useStore.getState();
    const natRequest = !tcpOnly && initial.lab?.id === PROGRESSIVE_NAT_PAT_ID && url.address === PROGRESSIVE_NAT_PAT_URL + '/';
    const signature = natRequest && initial.labStep === 0 ? natIntroSignature(network) : null;
    const finalScreen = initial.labStep === 2 && initial.quizAnswers['nat-rule-screen'] === 2;
    const configuration = natRequest && (initial.labStep === 1 || finalScreen) ? natConfiguration(network) : null;
    const previous = new Set(configuration === null ? [] : natRouterEntries(network));
    request.current=requestPage(device,url,(value, localPort)=>{if(token===sequence.current){
      setResult(value);setLoading(false);
      const state = useStore.getState();
      if (state.lab?.id === PROGRESSIVE_NAT_PAT_ID && state.labStep === 0 && device.id === 'PC1' &&
          sim.net === network && network.devices.get(device.id) === device && signature === natIntroSignature(network) &&
          signature !== null && url.address === PROGRESSIVE_NAT_PAT_URL + '/' && value.kind === 'http' && value.status === 200 && value.body.includes('Oficina conectada')) {
        state.recordLabResult('nat-first-http', true, signature);
      }
      if (configuration !== null && sim.net === network && network.devices.get(device.id) === device &&
          state.lab === initial.lab && state.labStep === initial.labStep && configuration === natConfiguration(network)) {
        const host = natSecondHost(network, state.labResults['nat-host']?.detail);
        if (natHostReady(network, host) && finalScreen && state.quizAnswers['nat-rule-screen'] === 2 && device === host &&
            natBrowserProof(network, device, value, localPort, previous, true)) {
          state.recordLabResult('nat-after-browser', true, 'PC2 recebeu HTTP por NAT.', configuration);
        } else if (state.labStep === 1 && natHostReady(network, host) && (device.id === 'PC1' || device === host)) {
          const translated = device.id === 'PC1';
          if (natBrowserProof(network, device, value, localPort, previous, translated)) {
            state.recordLabResult(translated ? 'nat-before-pc1' : 'nat-before-pc2', true,
              translated ? 'HTTP recebido por NAT.' : 'Origem privada sem resposta.', configuration);
          }
        }
      }
    }},
      {tcpOnly,stage:value=>{if(token===sequence.current)setStage(value);}});
  }
  // The renderer receives only HTTP response content from the simulated engine.
  const content=useMemo(()=>result?.kind==='http'?pageContent(result.body,result.url,url=>navigate(url)):null,[result]);
  const current=history[index],https=simulatedUrl(current??draft);
  if (!active) return null;
  return <div className="pc-browser-tab-content">
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
      </div>
  </div>;
}
