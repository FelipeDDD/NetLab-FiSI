import { useTranslation } from '../i18n';
import type { ChapterCompletion } from './completion';

export function ChapterProgress({ progress }: { progress: ChapterCompletion }) {
  const { t } = useTranslation();
  return <span className={progress.complete ? 'guided-progress is-complete' : 'guided-progress'} data-chapter-completed={progress.complete} data-completed-tasks={progress.completed}>
    {progress.complete && <span aria-hidden="true">✓ </span>}{progress.complete ? t('exercises.completed') : t('guided.tasksCompleted', { completed: progress.completed, total: progress.total })}
  </span>;
}

export function ChapterFinished() {
  const { t } = useTranslation();
  return <div className="guided-action-status guided-completion" role="status" data-chapter-finished>
    <span className="guided-action-indicator" aria-hidden="true">✓</span>
    <div><strong>{t('guided.finished')}</strong><p>{t('guided.exploreInvitation')}</p></div>
  </div>;
}

export function ExploreNetworkButton({ onClick }: { onClick(): void }) {
  const { t } = useTranslation();
  return <button type="button" className="btn btn--primary" data-explore-network onClick={onClick}>{t('guided.explore')}</button>;
}
