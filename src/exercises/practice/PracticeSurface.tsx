import { lazy, Suspense } from 'react';
import { usePractice } from './session';
import { useTranslation } from '../../i18n';
const Panel=lazy(()=>import('./PracticePanel'));
export function PracticeLauncher({close}:{close():void}) {
  const {t}=useTranslation();
  return <section className="practice-menu-entry"><strong>{t('practice.title')}</strong>
    <button type="button" role="menuitem" className="btn" onClick={()=>{usePractice.getState().show();close();}}>{t('practice.open')}</button>
  </section>;
}
export function PracticeSurface() {
  const open=usePractice(s=>s.open), {t}=useTranslation();
  if(!open)return null;
  return <Suspense fallback={<aside className="exercise-panel" role="status">{t('practice.loading')}</aside>}><Panel /></Suspense>;
}
