import { isProjectId } from '../projects/projectMetadata';

export type HomeIntent = { action: 'new' | 'load' | 'exercises' | 'labs' } | { action: 'plan'; id: string };
export function editorHref(intent?: HomeIntent): string {
  if (!intent) return './app.html';
  const query = new URLSearchParams({ home: intent.action });
  if (intent.action === 'plan') query.set('plan', intent.id);
  return './app.html?' + query.toString();
}
export function readHomeIntent(url: URL): HomeIntent | null {
  // A shared topology always retains the existing explicit offer/accept flow.
  if (url.hash.startsWith('#t=')) return null;
  const action = url.searchParams.get('home');
  if (action === 'plan') { const id = url.searchParams.get('plan'); return isProjectId(id) ? { action, id } : null; }
  return action === 'new' || action === 'load' || action === 'exercises' || action === 'labs' ? { action } : null;
}
/** Consumed only after the normal workspace boot succeeds. Reload cannot repeat
 * creation; unrelated query parameters and hashes remain untouched. */
export function consumeHomeIntent(): HomeIntent | null {
  const url = new URL(location.href), intent = readHomeIntent(url);
  if (!intent) return null;
  url.searchParams.delete('home'); url.searchParams.delete('plan');
  history.replaceState(history.state, '', url.pathname + url.search + url.hash);
  return intent;
}
