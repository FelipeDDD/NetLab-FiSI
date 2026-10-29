import { describe, expect, it } from 'vitest';
import { ExerciseController, EXERCISE_PROGRESS_KEY, readExerciseProgress } from './exerciseController';
import { BETA_EXERCISES, betaChecks, PRACTICAL_EXERCISES } from './beta';
import { PRACTICAL_SOURCES } from './practicalPublication';
import { EXERCISE_DRAFTS } from './drafts';
import { restoreNetwork, serializeNetwork } from '../engine/serialize';
import { disposeNetwork } from '../engine/networkLifecycle';
import { IpDevice } from '../engine/ipdevice';
import type { MetaRecord, MetaMutation, ProjectDocument, RepositoryResult, WriteOptions } from '../projects/types';
import type { DraftControllerState, SessionControllerState } from '../persistence/sessionTypes';

const settle = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
function fixture() {
  let net = restoreNetwork({ app: 'netsim', version: 1, devices: [], links: [] });
  let state: SessionControllerState = { phase: 'ready', session: null, activeDraftId: null, drafts: [], error: null, pendingShare: false };
  let meta: MetaRecord | null = null, failWrite = false, conflict = false, forms = false;
  let delayWrite: (() => Promise<void>) | undefined;
  const listeners = new Set<() => void>(), runtimeListeners = new Set<() => void>();
  const publish = () => listeners.forEach(fn => fn());
  const documents = new Map<string, ProjectDocument>();
  const activate = (id: string) => { disposeNetwork(net); net = restoreNetwork(documents.get(id)!.topology); state = { ...state, activeDraftId: id }; publish(); };
  const sessions = {
    getState: () => state, subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; }, hasPendingOperations: () => false,
    openDocument: async (document: ProjectDocument) => {
      const id = crypto.randomUUID(); documents.set(id, structuredClone(document));
      state.drafts.push({ id, revision: 1, editSequence: 0, persistedSequence: 0, pendingPersistence: false, saving: false, manualSavePending: true, base: null, error: null } satisfies DraftControllerState);
      activate(id); return { ok: true as const, value: id };
    },
    switchDraft: async (id: string) => { activate(id); return { ok: true as const, value: undefined }; },
    flush: async () => ({ ok: true as const, value: undefined }),
  };
  const repository = {
    getMeta: async () => ({ ok: true as const, value: structuredClone(meta) }),
    setMeta: async (mutation: MetaMutation, options?: WriteOptions): Promise<RepositoryResult<MetaRecord>> => {
      await delayWrite?.();
      if (options?.signal?.aborted) return { ok: false, error: { code: 'aborted', message: 'aborted' } };
      if (failWrite) return { ok: false, error: { code: 'quota-exceeded', message: 'full' } };
      if (conflict || mutation.expectedRevision !== (meta?.revision ?? null)) { conflict = false; return { ok: false, error: { code: 'meta-conflict', key: mutation.key, expectedRevision: mutation.expectedRevision, current: meta, message: 'conflict' } }; }
      meta = { key: mutation.key, revision: (meta?.revision ?? 0) + 1, value: structuredClone(mutation.value) };
      return { ok: true, value: structuredClone(meta) };
    },
  };
  const runtime = { network: () => net, signature: () => JSON.stringify(serializeNetwork(net, {})), pendingForms: () => forms, run: () => {},
    subscribe: (fn: () => void) => { runtimeListeners.add(fn); return () => { runtimeListeners.delete(fn); }; } };
  const controller = new ExerciseController(sessions, repository, runtime);
  const mutate = () => { state.drafts.find(d => d.id === state.activeDraftId)!.editSequence++; publish(); };
  const solve = (index: number) => {
    const file = EXERCISE_DRAFTS.find(d => d.id === BETA_EXERCISES[index].id)!.review.reference.topology;
    // Test-only configuration transfer; production evaluation never reads references.
    disposeNetwork(net); net = restoreNetwork(structuredClone(file)); mutate();
  };
  return { controller, repository, sessions, runtime, mutate, solve,
    configure:(file:ProjectDocument['topology'])=>{disposeNetwork(net);net=restoreNetwork(structuredClone(file));mutate();},
    net: () => net, meta: () => meta, fail: (v: boolean) => { failWrite = v; }, conflict: () => { conflict = true; },
    forms: (v: boolean) => { forms = v; }, delay: (v: () => Promise<void>) => { delayWrite = v; },
    close: () => { state.drafts = state.drafts.filter(d => d.id !== state.activeDraftId); state.activeDraftId = null; publish(); },
    dispose: () => { controller.dispose(); disposeNetwork(net); },
  };
}

it('ships exactly the two student/check projections, synchronized with drafts and without solutions', () => {
  const selected = EXERCISE_DRAFTS.filter(d => ['routing', 'dns-http'].includes(d.category));
  expect(BETA_EXERCISES).toEqual(selected.map(({ id, contentVersion, student }) => ({ id, contentVersion, student })));
  expect(betaChecks).toEqual(Object.fromEntries(selected.map(d => [d.id, d.review.assessments])));
  expect(JSON.stringify(BETA_EXERCISES)).not.toMatch(/"review"|"reference"|"commands"|"alternatives"/);
});

describe.each(PRACTICAL_EXERCISES)('practical attempt $id',exercise=>{
  it('preserves an existing document, evaluates actual criteria and keeps historical completion separate on restart',async()=>{
    const f=fixture();
    try {
      await f.controller.initialize();await f.sessions.openDocument({schemaVersion:1,topology:BETA_EXERCISES[0].student.initialTopology});
      const personal=f.sessions.getState().activeDraftId!,before=serializeNetwork(f.net(),{});
      await f.controller.start(exercise.id);const attempt=f.controller.activeAttempt()!;
      expect(f.sessions.getState().drafts).toHaveLength(2);expect(attempt.draftId).not.toBe(personal);
      await f.controller.verify();f.net().scheduler.advanceTo(120_000);await settle();
      expect(!!f.controller.getState().progress.completed[exercise.id]).toBe(exercise.id.includes('e06'));
      f.configure(PRACTICAL_SOURCES[exercise.id].review.reference.topology);
      await f.controller.verify();f.net().scheduler.advanceTo(120_000);await settle();
      expect(Object.values(f.controller.getState().results).every(r=>r.pass)).toBe(true);
      expect(f.controller.getState().message).toContain('Technische Anforderungen erfüllt');
      expect(f.controller.getState().progress.completed[exercise.id]).toBeDefined();
      await f.controller.resume(personal);expect(serializeNetwork(f.net(),{})).toEqual(before);expect(f.controller.activeAttempt()).toBeUndefined();
      await f.controller.start(exercise.id);expect(f.controller.activeAttempt()?.id).not.toBe(attempt.id);expect(f.sessions.getState().drafts).toHaveLength(3);
      const reopened=new ExerciseController(f.sessions,f.repository,f.runtime);await reopened.initialize();
      expect(reopened.activeAttempt()?.id).toBe(f.controller.activeAttempt()?.id);expect(reopened.getState().progress.completed[exercise.id]).toBeDefined();reopened.dispose();
    }finally {f.dispose();}
  });
  it('cancels pending evaluation and refuses stale completion after switching drafts',async()=>{
    const f=fixture();try {
      await f.controller.initialize();await f.controller.start(exercise.id);f.configure(PRACTICAL_SOURCES[exercise.id].review.reference.topology);
      await f.controller.verify();f.controller.cancel();f.net().scheduler.advanceTo(120_000);await settle();
      expect(f.controller.getState().progress.completed[exercise.id]).toBeUndefined();
      await f.controller.verify();const prior=f.net();await f.controller.start(BETA_EXERCISES[0].id);prior.scheduler.advanceTo(240_000);await settle();
      expect(f.controller.getState().progress.completed[exercise.id]).toBeUndefined();expect(f.controller.getState().results).toEqual({});
    }finally {f.dispose();}
  });
});

describe.each([0, 1])('Beta exercise %s', index => {
  it('opens a separate attempt, fails initially, passes solved, and persists completion independently of the draft', async () => {
    const f = fixture();
    try {
      await f.controller.initialize(); await f.controller.start(BETA_EXERCISES[index].id);
      expect(f.meta()?.key).toBe(EXERCISE_PROGRESS_KEY);
      await f.controller.verify(); f.net().scheduler.advanceTo(120_000); await settle();
      expect(Object.values(f.controller.getState().results).some(r => !r.pass)).toBe(true);
      expect(f.controller.getState().progress.completed).toEqual({});
      f.solve(index); await f.controller.verify(); f.net().scheduler.advanceTo(120_000); await settle();
      const completion = f.controller.getState().progress.completed[BETA_EXERCISES[index].id]; expect(completion).toBeDefined();
      f.close(); await f.controller.start(BETA_EXERCISES[index].id);
      expect(f.controller.getState().progress.completed[BETA_EXERCISES[index].id]).toEqual(completion);
      expect(f.controller.activeAttempt()!.id).not.toBe(completion.attemptId);
      const reopened = new ExerciseController(f.sessions, f.repository, f.runtime);
      await reopened.initialize(); expect(reopened.getState().progress.completed[BETA_EXERCISES[index].id]).toEqual(completion); reopened.dispose();
    } finally { f.dispose(); }
  });
});

it.each(['edit', 'rename', 'close', 'switch', 'unapplied'])('invalidates pending checks on %s and rejects delayed callbacks', async action => {
  const f = fixture();
  try {
    await f.controller.initialize(); await f.controller.start(BETA_EXERCISES[0].id); f.solve(0);
    await f.controller.verify(); const oldNet = f.net();
    if (action === 'edit') f.mutate();
    if (action === 'rename') { f.net().devices.get('buero')!.name = 'büro'; f.mutate(); }
    if (action === 'close') f.close();
    if (action === 'switch') await f.sessions.openDocument({ schemaVersion: 1, topology: BETA_EXERCISES[1].student.initialTopology });
    if (action === 'unapplied') f.forms(true);
    oldNet.scheduler.advanceTo(120_000); await settle();
    expect(f.controller.getState().progress.completed).toEqual({});
    expect(f.controller.getState().checking).toBe(false);
    expect(f.controller.getState().results).toEqual({});
    if (action === 'rename') {
      await f.controller.verify(); oldNet.scheduler.advanceTo(oldNet.scheduler.now + 120_000); await settle();
      expect(f.controller.getState().progress.completed[BETA_EXERCISES[0].id]).toBeDefined();
    }
  } finally { f.dispose(); }
});

it('does not persist a completion when configuration changes during the IDB write', async () => {
  const f = fixture(); let unblock!: () => void;
  try {
    await f.controller.initialize(); await f.controller.start(BETA_EXERCISES[0].id); f.solve(0);
    f.delay(() => new Promise(resolve => { unblock = resolve; }));
    await f.controller.verify(); f.net().scheduler.advanceTo(120_000); await settle();
    expect(f.controller.getState().saving).toBe(true); f.mutate(); unblock(); await settle();
    expect(readExerciseProgress(f.meta()!.value).completed).toEqual({});
  } finally { f.dispose(); }
});

it('keeps completion unconfirmed on write failure, permits recheck, and clears stale green results on later edits', async () => {
  const f = fixture();
  try {
    await f.controller.initialize(); await f.controller.start(BETA_EXERCISES[0].id); f.solve(0); f.fail(true);
    await f.controller.verify(); f.net().scheduler.advanceTo(120_000); await settle();
    expect(f.controller.getState().progress.completed).toEqual({}); expect(f.controller.getState().error).toContain('quota-exceeded');
    f.mutate(); expect(f.controller.getState().results).toEqual({}); f.fail(false); f.conflict();
    await f.controller.verify(); f.net().scheduler.advanceTo(240_000); await settle();
    expect(f.controller.getState().progress.completed[BETA_EXERCISES[0].id]).toBeDefined();
    (f.net().devices.get('r1') as IpDevice).forwarding = false; f.mutate();
    expect(f.controller.getState().results).toEqual({});
    expect(f.controller.getState().progress.completed[BETA_EXERCISES[0].id]).toBeDefined();
  } finally { f.dispose(); }
});

it('retains a new draft on association-write failure and retries without opening another topology', async () => {
  const f = fixture();
  try {
    await f.controller.initialize(); f.fail(true); await f.controller.start(BETA_EXERCISES[0].id);
    expect(f.sessions.getState().drafts).toHaveLength(1); expect(f.controller.activeAttempt()).toBeUndefined();
    f.fail(false); await f.controller.retry(); expect(f.controller.activeAttempt()).toBeDefined(); expect(f.sessions.getState().drafts).toHaveLength(1);
  } finally { f.dispose(); }
});

it('does not associate ordinary/imported documents or infer achievements from solved imports', async () => {
  const f = fixture();
  try {
    await f.controller.initialize();
    await f.sessions.openDocument({ schemaVersion: 1, topology: EXERCISE_DRAFTS[1].review.reference.topology });
    await f.controller.verify(); expect(f.controller.activeAttempt()).toBeUndefined(); expect(f.meta()).toBeNull();
  } finally { f.dispose(); }
});

it('refuses corrupt metadata without replacing it', async () => {
  const f = fixture();
  try {
    await f.repository.setMeta({ key: EXERCISE_PROGRESS_KEY, expectedRevision: null, value: { schemaVersion: 99 } });
    await f.controller.initialize(); await f.controller.start(BETA_EXERCISES[0].id);
    expect(f.controller.getState().ready).toBe(false); expect(f.meta()!.value).toEqual({ schemaVersion: 99 });
  } finally { f.dispose(); }
});
