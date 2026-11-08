import { useEffect, useState } from 'react';
import { ExercisePanelFrame } from '../exercises/ExercisePanelFrame';
import { useTranslation } from '../i18n';
import type { RouterState, RouterTutorialController, RouterRepeatTicket } from './RouterTutorialController';
import { sim } from '../sim';
import { routerTarget } from './routerChapter';
import { LearningHelpLink } from '../components/LearningHelp';
import { ChapterRestartButton } from './ChapterRestartUI';
import { routerChapterCompletion } from './completion';
import { ChapterStepProgress, ChapterFinished, ExploreNetworkButton } from './CompletionUI';

export const ROUTER_TITLES=['introTitle','cablesTitle','interfacesTitle','hostTitle','gatewaysTitle','routeTitle','testTitle','diagnosisTitle'] as const;
export const ROUTER_TEXTS=['introText','cablesText','interfacesText','hostText','gatewaysText','routeText','testText','diagnosisText'] as const;
export function RouterTutorialPanel({controller,state,onExplore}:{controller:RouterTutorialController;state:RouterState;onExplore?():void}) {
  const {t}=useTranslation(),[collapsed,setCollapsed]=useState(false),[repeat,setRepeat]=useState<RouterRepeatTicket|null>(null),r=state.record;
  useEffect(()=>setRepeat(null),[r?.draftId,r?.step,state.active,collapsed]);
  useEffect(()=>{
    if(!repeat)return;
    const cancel=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!event.isComposing){setRepeat(null);event.preventDefault();event.stopPropagation();}};
    window.addEventListener('keydown',cancel,true);
    return()=>window.removeEventListener('keydown',cancel,true);
  },[repeat]);
  if(!state.active||!r)return null;
  const canRepeat=r.step===5||r.step===6,armed=repeat?.draftId===r.draftId&&repeat.step===r.step;
  const completion=routerChapterCompletion(r);
  const values={fIp:routerTarget(sim.net)??'…'},solving=r.step===8&&r.diagnosis.failure;
  return <ExercisePanelFrame exerciseId="guided-two-networks" collapsed={collapsed} header={<>
    <div className="exercise-heading"><strong>{t('guidedRouter.title')}</strong><ChapterStepProgress step={r.step} total={8} progress={completion}/></div>
    <button className="btn btn--icon" aria-label={t(collapsed?'exercises.expand':'exercises.collapse')} aria-expanded={!collapsed} onClick={()=>setCollapsed(v=>!v)}>{collapsed?'+':'−'}</button>
    <ChapterRestartButton chapter="two-networks" draftId={r.draftId} step={r.step}/>
  </>}>
    {!collapsed&&<><div className="exercise-body" data-router-step={r.step} data-router-saving={state.saving}>
      <h3>{t(`guidedRouter.${solving?'solveTitle':ROUTER_TITLES[r.step-1]}`)}</h3><p>{t(`guidedRouter.${solving?'solveText':ROUTER_TEXTS[r.step-1]}`,values)}</p>
      {r.step===3&&<details className="exercise-learning" data-router-interface-help><summary>{t('guidedRouter.interfaceHelpTitle')}</summary><p>{t('guidedRouter.interfaceHelpText')}</p></details>}
      {(r.step===4||r.step===6)&&<><pre><code>{t(r.step===4?'guidedRouter.addressSyntax':'guidedRouter.routeSyntax')}</code></pre><LearningHelpLink page="ipv4"/></>}
      {state.warning&&<p role="status">{t(`guidedRouter.${state.warning}`)}</p>}
      {state.storageError&&<p role="alert">{t('guided.storageError')} <button className="btn" onClick={()=>void controller.retryProgress()}>{t('common.retry')}</button></p>}
      {!r.prepared&&<button className="btn" disabled={state.busy||state.storageError} onClick={()=>void controller.prepare()}>{t('guidedRouter.prepare')}</button>}
      {r.step===7&&<ul className="guided-subnet-replies">{(['a','f'] as const).map(key=><li key={key} data-router-reply={key} data-tutorial-passed={state.replies[key]}><span aria-hidden="true">{state.replies[key]?'✓':'○'}</span> {t(key==='a'?'guidedRouter.replyA':'guidedRouter.replyF')}</li>)}</ul>}
      {r.step!==1&&<p className="guided-action-status" role="status" data-router-passed={state.passed} data-tutorial-passed={state.passed}><span className="guided-action-indicator" aria-hidden="true">{state.passed?'✓':''}</span><span>{t(state.passed?r.step===8?'guidedRouter.finished':'guidedRouter.passed':'guided.pending')}</span></p>}
      {r.step===8&&state.passed&&<p className="exercise-learning">{t(r.diagnosis.failure?'guidedRouter.explanation':'guidedRouter.alreadyCorrect')}</p>}
      {r.step===8&&completion.complete&&<ChapterFinished/>}
      {state.repeatError&&<p role="alert">{t('guidedRouter.repeatUnsafe')}</p>}
    </div><footer className={canRepeat?'guided-router-repeat-footer':undefined}>
      <button className="btn" disabled={state.busy||r.step===1} onClick={()=>{setRepeat(null);controller.previous();}}>{t('guided.previous')}</button>
      {canRepeat&&<button type="button" className="btn" data-router-repeat data-router-repeat-confirm={armed} aria-pressed={armed}
        title={t(r.step===5?'guidedRouter.repeatGateway':'guidedRouter.repeatRoute')} aria-live="polite"
        disabled={!state.passed||state.saving||state.busy||state.storageError} onClick={()=>{
          if(armed){setRepeat(null);controller.repeatTask(repeat!);}else setRepeat(controller.repeatTicket());
        }}>{t(armed?'guidedRouter.repeatYes':'guidedRouter.repeat')}</button>}
      {r.step<8&&<button className="btn btn--primary" disabled={!state.passed||state.busy||state.storageError} onClick={()=>{setRepeat(null);controller.next();}}>{t('guided.next')}</button>}
      {r.step===8&&completion.complete&&onExplore&&<ExploreNetworkButton onClick={onExplore}/>}
    </footer></>}
  </ExercisePanelFrame>;
}
