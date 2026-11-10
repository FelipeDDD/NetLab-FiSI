import { useEffect, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { FloatingPopover } from '../components/FloatingPopover';
import { useTranslation } from '../i18n';
import type { AlternativeEntryPoint } from './alternativeEntryContract';

export function AlternativeEntryMenu({disabled,existing,choose,popupRef,children}:{disabled:boolean;existing:boolean;choose(entry?:AlternativeEntryPoint):void;popupRef?:MutableRefObject<HTMLDivElement|null>;children(trigger:ReactNode):ReactNode}){
  const {t}=useTranslation(),[open,setOpen]=useState(false),[compact,setCompact]=useState(()=>window.matchMedia('(max-width:760px)').matches);
  const anchor=useRef<HTMLButtonElement>(null),back=useRef<HTMLButtonElement>(null);
  useEffect(()=>{const m=window.matchMedia('(max-width:760px)'),change=()=>setCompact(m.matches);m.addEventListener('change',change);return()=>m.removeEventListener('change',change);},[]);
  useEffect(()=>{if(open&&compact)back.current?.focus();},[open,compact]);
  const close=()=>{setOpen(false);requestAnimationFrame(()=>anchor.current?.focus({preventScroll:true}));};
  const options=<>{([undefined,'part-2','part-3','part-4'] as const).map((point,index)=><button key={index} type="button" className="labs-menu-item" role="menuitem" data-alternative-entry-choice={point??'beginning'} disabled={disabled} onClick={()=>{setOpen(false);choose(point);}}>{t(index===0?'guidedAlternative.entryBeginning':index===1?'guidedAlternative.entryPart2':index===2?'guidedAlternative.entryPart3':'guidedAlternative.entryPart4')}</button>)}</>;
  const keys=(event:React.KeyboardEvent)=>{if(event.key==='ArrowLeft'||compact&&event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}};
  if(open&&compact)return <section data-alternative-entry-compact aria-label={t('guidedAlternative.entryMenu')} onKeyDown={keys}>
    <button ref={back} type="button" role="menuitem" className="labs-menu-item toolbar-menu-back" data-alternative-entry-back onClick={close}>‹ {t('guided.previous')}</button><strong className="labs-menu-section">{t('guidedAlternative.entryMenu')}</strong>{options}
  </section>;
  const trigger=<button ref={anchor} type="button" role="menuitem" className="btn" data-alternative-direct aria-haspopup="menu" aria-expanded={open} aria-controls={open?'alternative-entry-menu':undefined} disabled={disabled} onClick={()=>setOpen(v=>!v)} onKeyDown={event=>{if(['ArrowRight','ArrowDown'].includes(event.key)){event.preventDefault();event.stopPropagation();setOpen(true);}}}>{t(existing?'guided.newAttempt':'guided.chapterStart')}<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true"><path d="m6 3 5 5-5 5"/></svg></button>;
  return <>{children(trigger)}
    {open&&<FloatingPopover anchor={anchor} id="alternative-entry-menu" label={t('guidedAlternative.entryMenu')} role="menu" preferredSide="right" width={300} className="labs-menu alternative-entry-menu" popupRef={popupRef} onClose={close} onKeyDown={keys}>{options}</FloatingPopover>}
  </>;
}
