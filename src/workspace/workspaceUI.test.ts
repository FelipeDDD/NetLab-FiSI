import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, it } from 'vitest';
import { LANGUAGES, translate, useLanguage } from '../i18n';
import { canCloseEmptyDraft, emptyPlan, sessionErrorMessage, workspaceStatus } from './WorkspaceUI';
import { encodeDraftDocument } from '../projects/workspaceDocument';
import type { SessionControllerState } from '../persistence/sessionTypes';

const state = (): SessionControllerState => ({ phase: 'ready', activeDraftId: 'draft', session: null, pendingShare: false, error: null,
  drafts: [{ id: 'draft', revision: 2, editSequence: 1, persistedSequence: 1, pendingPersistence: false, saving: false, manualSavePending: true, base: null, error: null }] });
it('distinguishes a persisted draft from manual Save and an uncommitted edit', () => {
  const s = state(); expect(workspaceStatus(s)).toBe('Entwurf lokal gesichert · Plan nicht gespeichert');
  s.drafts[0].manualSavePending = false; expect(workspaceStatus(s)).toBe('Plan lokal gespeichert');
  s.drafts[0].pendingPersistence = true; expect(workspaceStatus(s)).toBe('Lokaler Entwurf wird gesichert…');
  s.drafts[0].saving = true; expect(workspaceStatus(s)).toBe('Wird lokal gesichert…');
  s.error = { code: 'quota-exceeded', message: 'failure' }; expect(workspaceStatus(s)).toBe('Speicherfehler');
});
afterEach(() => useLanguage.setState({ language: 'de' }));
it.each(Object.keys(LANGUAGES) as (keyof typeof LANGUAGES)[])('localizes status precedence and coded recovery in %s without exposing internal text', language => {
  useLanguage.setState({ language });
  const s = state(), t = (key: Parameters<typeof translate>[1]) => translate(language, key);
  expect(workspaceStatus(s)).toBe(t('workspace.statusDraft'));
  s.drafts[0].pendingPersistence = true; expect(workspaceStatus(s)).toBe(t('workspace.statusPending'));
  s.drafts[0].saving = true; expect(workspaceStatus(s)).toBe(t('workspace.statusSaving'));
  s.drafts[0].error = { code: 'quota-exceeded', message: 'German internal detail' };
  expect(workspaceStatus(s)).toBe(t('workspace.statusError'));
  s.drafts = []; expect(workspaceStatus(s)).toBe(t('workspace.noPlan'));
  s.error = { code: 'storage-error', message: 'internal' }; expect(workspaceStatus(s)).toBe(t('workspace.statusError'));
  const errors = {
    conflict: 'errorConflict', 'draft-conflict': 'errorConflict', 'session-conflict': 'errorConflict', 'meta-conflict': 'errorConflict', 'stale-edit': 'errorConflict',
    'quota-exceeded': 'errorQuota', 'legacy-recovery-required': 'errorLegacy', 'incompatible-document': 'errorDocument', 'incompatible-database': 'errorDocument',
    'corrupt-data': 'errorDocument', 'invalid-document': 'errorDocument', unavailable: 'errorUnavailable', blocked: 'errorUnavailable', closed: 'errorUnavailable',
    'version-changed': 'errorUnavailable', deleted: 'errorDeleted', 'draft-closed': 'errorDeleted', 'unapplied-forms': 'errorForms', 'runtime-changed': 'errorChanged', 'storage-error': 'errorGeneric',
  } as const;
  for (const [code, key] of Object.entries(errors)) {
    const error = { code, message: 'Untranslated secret diagnostic', id: 'test', expectedRevision: 1, actualRevision: 2 } as Parameters<typeof sessionErrorMessage>[0];
    expect(sessionErrorMessage(error)).toBe(translate(language, `workspace.${key}`));
    expect(sessionErrorMessage(error)).not.toContain(error.message);
  }
});
it('gives recoverable German messages without exposing storage internals', () => {
  expect(sessionErrorMessage({ code: 'quota-exceeded', message: 'internal exception' })).toContain('Backup');
  expect(sessionErrorMessage({ code: 'session-conflict', id: 'session', expectedRevision: 1, actualRevision: 2, message: 'internal exception' })).toContain('anderen Tab');
  expect(sessionErrorMessage({ code: 'incompatible-document', message: 'internal exception' })).not.toContain('internal exception');
});

it('allows immediate close for a new canonical empty draft without changing its Save As status', () => {
  const draft = state().drafts[0];
  expect(canCloseEmptyDraft(draft, emptyPlan)).toBe(true);
  expect(canCloseEmptyDraft(draft, encodeDraftDocument(emptyPlan).document)).toBe(true);
  expect(draft.manualSavePending).toBe(true);
});
it.each([
  { terminalLayoutMode: 'by-type' as const },
  { terminalAppearance: { fontSize: 18 } },
])('does not confuse zero devices with an unmodified document (%j)', ui => {
  expect(canCloseEmptyDraft(state().drafts[0], { ...emptyPlan, topology: { ...emptyPlan.topology, ui } })).toBe(false);
});
it('keeps saved plans, pending writes, errors and unreadable drafts on the existing guarded path', () => {
  const draft = state().drafts[0];
  expect(canCloseEmptyDraft({ ...draft, base: { planId: 'saved', planRevision: 1, planName: 'Saved', saveId: 'saved@1', savedAt: 0, documentJson: encodeDraftDocument(emptyPlan).json } }, emptyPlan)).toBe(false);
  expect(canCloseEmptyDraft({ ...draft, pendingPersistence: true }, emptyPlan)).toBe(false);
  expect(canCloseEmptyDraft({ ...draft, saving: true }, emptyPlan)).toBe(false);
  expect(canCloseEmptyDraft({ ...draft, error: { code: 'quota-exceeded', message: 'failure' } }, emptyPlan)).toBe(false);
  expect(canCloseEmptyDraft(draft, null)).toBe(false);
  expect(canCloseEmptyDraft(draft, { schemaVersion: 99 } as never)).toBe(false);
});

const chromium = process.env.NETLAB_CHROMIUM_PATH ?? [
  'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome', '/opt/google/chrome/chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find(existsSync);
it.skipIf(!chromium)('validates the complete isolated UI in Chromium and records screenshots', async () => {
  const script = fileURLToPath(new URL('../../scripts/test-workspace-ui.mjs', import.meta.url));
  const output = await new Promise<string>((resolve, reject) => execFile(process.execPath, [script], {
    cwd: fileURLToPath(new URL('../..', import.meta.url)), env: { ...process.env, NETLAB_CHROMIUM_PATH: chromium }, windowsHide: true, timeout: 150000, maxBuffer: 2 * 1024 * 1024,
  }, (error, stdout, stderr) => { if (stdout.includes('NETLAB_PROJECT_TEST_RESULTS=')) resolve(stdout); else reject(Error(String(error ?? '') + stdout + stderr)); }));
  const report = JSON.parse(output.split('\n').find(line => line.startsWith('NETLAB_PROJECT_TEST_RESULTS='))!.slice('NETLAB_PROJECT_TEST_RESULTS='.length));
  expect(report.fatal).toBeNull(); expect(report.browserErrors).toEqual([]);
  expect(report.uiReview.readyPngs).toBe(6); expect(report.uiReview.captures).toBe(19);
  const cases = Object.entries(report.results) as [string, { passed: boolean; error?: string }][];
  expect(cases.filter(([name]) => name.startsWith('ui:')).length).toBeGreaterThanOrEqual(14);
  for (const [name, result] of cases) expect(result.passed, name + ': ' + result.error).toBe(true);
}, 160000);
