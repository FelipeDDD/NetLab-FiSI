import { expect, it, vi } from 'vitest';
import { installApplicationLifecycle, needsPersistenceWarning } from './applicationLifecycle';
import type { SessionController } from './sessionController';
import type { SessionControllerState } from './sessionTypes';

const state = (): SessionControllerState => ({ phase: 'ready', session: null, activeDraftId: 'a', pendingShare: false, error: null,
  drafts: [{ id: 'a', revision: 1, editSequence: 1, persistedSequence: 1, pendingPersistence: false, saving: false, manualSavePending: true, base: null, error: null }] });

it('does not ask for manual Save when the draft is durable, but warns about uncommitted work', () => {
  const s = state();
  expect(needsPersistenceWarning(s, false)).toBe(false);
  for (const field of ['pendingPersistence', 'saving'] as const) {
    s.drafts[0][field] = true; expect(needsPersistenceWarning(s, false)).toBe(true); s.drafts[0][field] = false;
  }
  expect(needsPersistenceWarning(s, true)).toBe(true);
  expect(needsPersistenceWarning(s, false, true)).toBe(true);
  expect(needsPersistenceWarning(null, false, false, true)).toBe(true);
  s.error = { code: 'runtime-changed', message: 'An external topology is still in memory.' };
  expect(needsPersistenceWarning(s, false)).toBe(true);
});

it('anticipates flush, guards pending forms and removes every listener on disposal', () => {
  const host = new EventTarget(), doc = Object.assign(new EventTarget(), { visibilityState: 'hidden' });
  const s = state(); let forms = false, operations = false;
  const flush = vi.fn();
  const controller = { getState: () => s, flush, hasPendingOperations: () => operations } as unknown as SessionController;
  const remove = installApplicationLifecycle({ controller: () => controller, pendingForms: () => forms, pendingStartup: () => false,
    localStartupEdits: () => false }, host as Window, doc as unknown as Document);
  host.dispatchEvent(new Event('blur')); host.dispatchEvent(new Event('pagehide')); doc.dispatchEvent(new Event('visibilitychange'));
  expect(flush).toHaveBeenCalledTimes(3);
  const close = () => { const e = new Event('beforeunload', { cancelable: true }); host.dispatchEvent(e); return e.defaultPrevented; };
  expect(close()).toBe(false); forms = true; expect(close()).toBe(true); forms = false;
  operations = true; expect(close()).toBe(true); operations = false;
  s.drafts[0].error = { code: 'quota-exceeded', message: 'Explicit retry required.' };
  flush.mockClear(); host.dispatchEvent(new Event('pagehide')); expect(flush).not.toHaveBeenCalled();
  remove(); host.dispatchEvent(new Event('pagehide')); expect(flush).not.toHaveBeenCalled(); expect(close()).toBe(false);
});
