import {createContext,useContext,useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {useTranslation,type TranslationKey} from '../i18n';
import type {ChapterId} from './chapterCheckpoints';
import type {ChapterRestartService,RestartTicket} from './ChapterRestartService';
export const ChapterRestartContext=createContext<{service:ChapterRestartService;newAttempt(chapter:ChapterId):Promise<void>}|null>(null);
export function ChapterRestartButton({chapter,draftId,step}:{chapter:ChapterId;draftId:string|null;step:number}){
 const context=useContext(ChapterRestartContext);if(!context)return null;
 return <RestartControl {...context} chapter={chapter} draftId={draftId} step={step}/>;
}
function RestartControl({service,newAttempt,chapter,draftId,step}:{service:ChapterRestartService;newAttempt(chapter:ChapterId):Promise<void>;chapter:ChapterId;draftId:string|null;step:number}){
 const {t}=useTranslation(),state=useSyncExternalStore(service.subscribe,service.getState);
 const [open,setOpen]=useState(false),[loading,setLoading]=useState(false),[ticket,setTicket]=useState<RestartTicket|null>(null),[error,setError]=useState<string|null>(null);
 const holder=useRef<HTMLSpanElement>(null),button=useRef<HTMLButtonElement>(null),cancel=useRef<HTMLButtonElement>(null),request=useRef(0);
 const close=(focus=false)=>{request.current++;setOpen(false);setTicket(null);setLoading(false);if(focus)button.current?.focus();};
 useEffect(()=>{close();},[chapter,draftId,step]);
 useEffect(()=>()=>{request.current++;},[]);
 useEffect(()=>{
  if(!open)return;cancel.current?.focus();
  const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close(true);}};
  const outside=(e:PointerEvent)=>{if(!holder.current?.contains(e.target as Node))close();};
  window.addEventListener('keydown',key,true);document.addEventListener('pointerdown',outside,true);
  return()=>{window.removeEventListener('keydown',key,true);document.removeEventListener('pointerdown',outside,true);};
 },[open]);
 const message:TranslationKey=error==='checkpoint-later'?'guidedRestart.later':error==='checkpoint-missing'||error==='checkpoint-invalid'?'guidedRestart.missing':error==='checkpoint-conflict'?'guidedRestart.conflict':'guidedRestart.storage';
 return <span ref={holder} className="chapter-restart-control">
  <button ref={button} type="button" className="btn btn--icon" data-chapter-restart={chapter} title={t('guidedRestart.open')} aria-label={t('guidedRestart.open')} aria-haspopup="dialog" aria-expanded={open} disabled={state.busy} onClick={()=>{
   if(open){close();return;}const token=++request.current;setTicket(null);setError(null);setLoading(true);setOpen(true);
   void service.inspect(chapter).then(value=>{if(token===request.current){setTicket(value);setLoading(false);}}).catch(e=>{if(token===request.current){setError(e instanceof Error?e.message:'storage');setLoading(false);}});
  }}>↻</button>
  {open&&<div className="chapter-restart-popover" data-chapter-restart-popover role="dialog" aria-modal="false" aria-label={t('guidedRestart.title')} aria-busy={loading||state.busy} onPointerDown={e=>e.stopPropagation()} onKeyDown={e=>e.stopPropagation()}>
   <strong>{t('guidedRestart.title')}</strong><p>{t('guidedRestart.description')}</p>
   {error&&<p role="alert">{t(message)}</p>}
   <div className="chapter-restart-actions"><button ref={cancel} type="button" className="btn" onClick={()=>close(true)}>{t('guidedRestart.cancel')}</button>
   <button type="button" className="btn chapter-restart-confirm" data-chapter-restart-confirm disabled={!ticket||loading||state.busy} onClick={()=>{if(ticket)void service.restart(ticket).then(ok=>{if(ok)close();else{setTicket(null);setError('storage');}});}}>{t('guidedRestart.confirm')}</button></div>
   {error&&error.startsWith('checkpoint-')&&<><p className="hint">{t('guidedRestart.newInfo')}</p><button className="btn" data-chapter-new-attempt onClick={()=>void newAttempt(chapter).then(()=>close())}>{t('guidedRestart.newAttempt')}</button></>}
  </div>}
 </span>;
}
