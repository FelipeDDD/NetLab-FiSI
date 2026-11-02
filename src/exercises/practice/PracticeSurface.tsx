import { lazy, Suspense } from 'react';
import { usePractice } from './session';
import { useTranslation } from '../../i18n';
const Panel=lazy(()=>import('./PracticePanel'));
export function PracticeLauncher({close}:{close():void}) {
  const {t}=useTranslation();
  return <details className="exercise-menu-group" open><summary>{t('practice.title')}</summary><section className="practice-menu-entry">
    <small>{t('practice.categories')}</small>
    <button type="button" role="menuitem" className="btn" onClick={()=>{usePractice.getState().show();close();}}>{t('practice.open')}</button>
  </section></details>;
}
export function PracticeSurface() {
  const open=usePractice(s=>s.open), {t}=useTranslation();
  if(!open)return null;
  return <Suspense fallback={<aside className="exercise-panel" role="status">{t('practice.loading')}</aside>}><Panel /></Suspense>;
}
