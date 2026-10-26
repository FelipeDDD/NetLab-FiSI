import { assert, equal, fixture, changed, document, take as takeRepository, dump } from '../projects/browserFixtures';
import { encodeDraftDocument } from '../projects/workspaceDocument';
import { disposeNetwork } from '../engine/networkLifecycle';
import { prepareTopologyDocument } from './topologyDocument';
import { SessionController } from './sessionController';
import { bootstrapSession, SESSION_RESUME_KEY } from './sessionBootstrap';
import type { SessionRuntime, SessionResult, WorkspaceIdentity, WorkspacePersistenceSink } from './sessionTypes';
import type { ProjectDocument, MetaRecord } from '../projects/types';
import type { OpenDraft } from '../projects/workspaceTypes';
import { sim } from '../sim';

const take = <T>(r: SessionResult<T>): T => { assert(r.ok, JSON.stringify(r)); return r.value; };
const code = (r: SessionResult<unknown>, expected: string) => { assert(!r.ok); equal(r.error.code, expected); };
const gate = () => { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; };
const name = (d: ProjectDocument) => d.topology.devices[0]?.name;

/** A real prepared network with an isolated presentation/document capability.
 * Used for controlled async boundaries, without changing the app's sim.net. */
export function memoryRuntime(initial = document()) {
  let current = encodeDraftDocument(initial).document, network = prepareTopologyDocument(initial.topology).network;
  let identity: WorkspaceIdentity | null = null, sink: WorkspacePersistenceSink | undefined, activations = 0, forms = false;
  const api: SessionRuntime = {
    capture: () => structuredClone(current), identity: () => identity,
    hasPendingForms: () => forms,
    connect: listener => { assert(!sink); sink = listener; return () => { sink = undefined; }; },
    activate: (prepared, next) => { disposeNetwork(network); network = prepared.network; current = encodeDraftDocument({ schemaVersion: 1, topology: prepared.document }).document; identity = next; activations++; },
  };
  return { api, edit: (n: string) => { current = encodeDraftDocument(changed(n)).document; sink?.changed(); },
    get network() { return network; }, get activations() { return activations; }, set forms(value: boolean) { forms = value; },
    dispose: () => disposeNetwork(network) };
}

export const controllerBrowserCases: Record<string, () => Promise<void>> = {
  'controller UI: Save on an inactive draft preserves the active network and closing chooses its neighbor': () => fixture(async ({ open }) => {
    const repo = await open(), runtime = memoryRuntime(), c = new SessionController(repo, runtime.api);
    try {
      const a = take(await c.start()).activeDraftId!, b = take(await c.openDocument(changed('B')));
      runtime.edit('B edited'); take(await c.switchDraft(a)); const net = runtime.network;
      const saved = take(await c.saveOpenDraft(b, 'Saved B')); assert(runtime.network === net); equal(name(saved.plan.document), 'B edited');
      const bState = c.getState().drafts.find(d => d.id === b)!;
      take(await c.closeDraft(b, { expectedEditSequence: bState.editSequence })); assert(runtime.network === net); equal(c.getState().session?.draftIds, [a]);
      take(await c.closeDraft(a, { expectedEditSequence: 0, discardChanges: true })); equal(c.getState().activeDraftId, null); equal(c.getState().drafts, []);
      equal(runtime.api.capture().topology.devices, []); take(await c.openDocument(changed('after empty session'))); equal(name(runtime.api.capture()), 'after empty session');
    } finally { c.dispose(); runtime.dispose(); }
  }),
  'controller UI: modified close and stale discard consent never abandon current edits': () => fixture(async ({ open }) => {
    const repo = await open(), runtime = memoryRuntime(), c = new SessionController(repo, runtime.api);
    try {
      const id = take(await c.start()).activeDraftId!; runtime.edit('first'); const net = runtime.network;
      code(await c.closeDraft(id, { expectedEditSequence: 1 }), 'unsaved-draft'); assert(runtime.network === net);
      runtime.edit('new after confirmation'); code(await c.closeDraft(id, { expectedEditSequence: 1, discardChanges: true }), 'runtime-changed');
      equal(name(c.recoveryDocument()!), 'new after confirmation'); assert((takeRepository(await repo.workspace.loadDraft(id))).state === 'open');
      take(await c.closeDraft(id, { expectedEditSequence: 2, discardChanges: true })); equal(c.getState().drafts, []);
    } finally { c.dispose(); runtime.dispose(); }
  }),
  'controller UI: closing is atomic when a prepared neighbor changes concurrently': () => fixture(async ({ open }) => {
    const repo = await open(), runtime = memoryRuntime(), c = new SessionController(repo, runtime.api), close = repo.workspace.discardDraft.bind(repo.workspace);
    try {
      const a = take(await c.start()).activeDraftId!, b = take(await c.openDocument(changed('B'))); take(await c.switchDraft(a));
      repo.workspace.discardDraft = async (...args) => { takeRepository(await repo.workspace.updateDraft(b, { expectedRevision: 1, editSequence: 1, document: changed('B concurrent') })); return close(...args); };
      const net = runtime.network; code(await c.closeDraft(a, { expectedEditSequence: 0, discardChanges: true }), 'draft-conflict');
      assert(runtime.network === net); equal(c.getState().activeDraftId, a); equal(takeRepository(await repo.workspace.restoreSession(c.getState().session!.id)).drafts.length, 2);
    } finally { c.dispose(); runtime.dispose(); }
  }),
  'controller UI: late edits after a close commit remain available for export and do not recreate the tab': () => fixture(async ({ open }) => {
    const repo = await open(), runtime = memoryRuntime(), c = new SessionController(repo, runtime.api), close = repo.workspace.discardDraft.bind(repo.workspace);
    try {
      const id = take(await c.start()).activeDraftId!, net = runtime.network;
      repo.workspace.discardDraft = async (...args) => { const result = await close(...args); runtime.edit('late close edit'); return result; };
      code(await c.closeDraft(id, { expectedEditSequence: 0, discardChanges: true }), 'runtime-changed'); assert(runtime.network === net);
      equal(name(c.recoveryDocument()!), 'late close edit'); equal(takeRepository(await repo.workspace.loadDraft(id)).state, 'closed');
      equal(takeRepository(await repo.workspace.restoreSession(c.getState().session!.id)).drafts, []);
    } finally { c.dispose(); runtime.dispose(); }
  }),
  'controller UI: reordering survives reconnect and preserves focus without activating another simulation': () => fixture(async ({ open }) => {
    const repo = await open(), runtime = memoryRuntime(), c = new SessionController(repo, runtime.api);
    try {
      const a = take(await c.start()).activeDraftId!, b = take(await c.openDocument(changed('B'))), third = take(await c.openDocument(changed('C'))), net = runtime.network;
      take(await c.reorderTabs([third, a, b])); assert(runtime.network === net); equal(c.getState().activeDraftId, third);
      equal(takeRepository(await repo.workspace.restoreSession(c.getState().session!.id)).session.draftIds, [third, a, b]);
    } finally { c.dispose(); runtime.dispose(); }
  }),
  'controller: accepting one Share Link cannot consume a newer offer received during its commit': () => fixture(async ({ open }) => {
    const repo = await open(), runtime = memoryRuntime(), c = new SessionController(repo, runtime.api), committed = gate(), release = gate();
    const create = repo.workspace.createDraft.bind(repo.workspace); let first = true;
    repo.workspace.createDraft = async (...args) => { const result = await create(...args); if (first) { first = false; committed.release(); await release.promise; } return result; };
    try {
      take(await c.start()); take(c.offerShare(changed('accepted old offer'))); const accepting = c.acceptShare(); await committed.promise;
      take(c.offerShare(changed('new pending offer'))); release.release(); take(await accepting);
      equal(name(runtime.api.capture()), 'accepted old offer'); assert(c.getState().pendingShare);
      take(await c.acceptShare()); equal(name(runtime.api.capture()), 'new pending offer'); assert(!c.getState().pendingShare); equal(c.getState().drafts.length, 3);
    } finally { release.release(); c.dispose(); runtime.dispose(); }
  }),

  'controller: recovery keeps both the last captured draft and an external topology replacement': () => fixture(async ({ open }) => {
    const repo = await open(), runtime = memoryRuntime(), c = new SessionController(repo, runtime.api);
    try {
      const started = take(await c.start()); runtime.edit('captured before external replacement');
      const identity = runtime.api.identity()!, external = prepareTopologyDocument(changed('external topology').topology);
      runtime.api.activate(external, { ...identity, draftId: crypto.randomUUID() });
      code(await c.flush(), 'runtime-changed'); equal(name(c.recoveryDocument()!), 'external topology');
      equal(name(c.recoveryDocument(started.activeDraftId!)!), 'captured before external replacement');
      assert(c.getState().drafts[0].pendingPersistence);
    } finally { c.dispose(); runtime.dispose(); }
  }),

  'controller: loading manual plans reuses their open drafts and keeps the current work independent': () => fixture(async ({ open }) => {
    const repo = await open(), runtime = memoryRuntime(), c = new SessionController(repo, runtime.api);
    const plan = takeRepository(await repo.createProject({ name: 'Manual plan', document: changed('saved manual') }));
    try {
      const state = take(await c.start()); runtime.edit('unnamed work'); const originalId = state.activeDraftId!;
      const loaded = take(await c.openPlan(plan.project.id)); equal(name(runtime.api.capture()), 'saved manual');
      runtime.edit('manual draft edited'); take(await c.switchDraft(originalId)); equal(name(runtime.api.capture()), 'unnamed work');
      equal(take(await c.openPlan(plan.project.id)), loaded); equal(name(runtime.api.capture()), 'manual draft edited');
      equal(c.getState().drafts.length, 2); equal(takeRepository(await repo.loadProject(plan.project.id)), plan);
    } finally { c.dispose(); runtime.dispose(); }
  }),

  'controller: A to B to A flushes drafts without manual Save or checkpoints': () => fixture(async ({ open }) => {
    const repo = await open(), a = takeRepository(await repo.createProject({ name: 'A', document: changed('A') }));
    const s = takeRepository(await repo.workspace.createSession({ initialTab: { kind: 'plan', planId: a.project.id } }));
    const b = takeRepository(await repo.workspace.createDraft(s.session.id, 1, { document: changed('B'), activate: false }));
    const runtime = memoryRuntime(), c = new SessionController(repo, runtime.api);
    try {
      take(await c.start({ sessionId: s.session.id })); const first = runtime.network;
      runtime.edit('A edited'); assert(c.getState().drafts[0].pendingPersistence);
      take(await c.switchDraft(b.draft.id)); equal(name(runtime.api.capture()), 'B'); equal(runtime.activations, 2);
      assert([...first.devices.values()].every(d => d.disposed)); equal(first.scheduler.pending, 0);
      runtime.edit('B edited'); take(await c.switchDraft(s.drafts[0].id)); equal(name(runtime.api.capture()), 'A edited');
      equal(c.getState().activeDraftId, s.drafts[0].id); assert(c.getState().drafts.every(d => !d.pendingPersistence && d.manualSavePending));
      equal(takeRepository(await repo.loadProject(a.project.id)), a); equal(takeRepository(await repo.listCheckpoints(a.project.id)), []);
      const restored = takeRepository(await repo.workspace.restoreSession(s.session.id)); equal(restored.session.draftIds, [s.drafts[0].id, b.draft.id]); equal(name(restored.drafts[1].document), 'B edited');
    } finally { c.dispose(); runtime.dispose(); }
  }),

  'controller: 500ms debounce persists unnamed drafts and distinguishes manual Save': () => fixture(async ({ open }) => {
    const repo = await open(), runtime = memoryRuntime(), c = new SessionController(repo, runtime.api);
    try {
      take(await c.start()); runtime.edit('debounced'); const id = c.getState().activeDraftId!;
      equal((takeRepository(await repo.workspace.loadDraft(id)) as OpenDraft).editSequence, 0);
      await new Promise(resolve => setTimeout(resolve, 650));
      const state = c.getState().drafts[0]; assert(!state.pendingPersistence && state.manualSavePending); equal(state.persistedSequence, 1);
      equal(takeRepository(await repo.listProjects()), []);
      const saved = take(await c.save('First manual Save')); assert(!saved.hasNewerEdits); assert(!c.getState().drafts[0].manualSavePending);
      runtime.edit('after Save'); take(await c.flush()); assert(c.getState().drafts[0].manualSavePending);
      equal(name(takeRepository(await repo.loadProject(saved.plan.project.id)).document), 'debounced'); equal(takeRepository(await repo.listCheckpoints(saved.plan.project.id)), []);
    } finally { c.dispose(); runtime.dispose(); }
  }),

  'controller: delayed draft acknowledgements never confirm or replace newer edits': () => fixture(async ({ open }) => {
    const repo = await open(), runtime = memoryRuntime(), c = new SessionController(repo, runtime.api), written = gate(), release = gate();
    const update = repo.workspace.updateDraft.bind(repo.workspace); let calls = 0, inFlight = 0, max = 0;
    repo.workspace.updateDraft = async (...args) => {
      inFlight++; max = Math.max(max, inFlight); calls++;
      try { const result = await update(...args); if (calls === 1) { written.release(); await release.promise; } return result; }
      finally { inFlight--; }
    };
    try {
      take(await c.start()); runtime.edit('old'); const flushing = c.flush(); await written.promise;
      runtime.edit('new'); assert(c.getState().drafts[0].pendingPersistence); equal(c.getState().drafts[0].persistedSequence, 0);
      release.release(); take(await flushing); equal(name(c.recoveryDocument()!), 'new'); equal(max, 1); equal(calls, 2);
      const state = c.getState().drafts[0]; equal(state.editSequence, 2); equal(state.persistedSequence, 2); assert(!state.pendingPersistence);
      equal(name((takeRepository(await repo.workspace.loadDraft(state.id)) as OpenDraft).document), 'new');
    } finally { release.release(); c.dispose(); runtime.dispose(); }
  }),

  'controller: edits arriving during focus commit are persisted before activating B': () => fixture(async ({ open }) => {
    const repo = await open(), s = takeRepository(await repo.workspace.createSession({ initialTab: { kind: 'new', document: changed('A') } }));
    const b = takeRepository(await repo.workspace.createDraft(s.session.id, 1, { document: changed('B'), activate: false }));
    const runtime = memoryRuntime(), c = new SessionController(repo, runtime.api), focused = gate(), release = gate();
    const layout = repo.workspace.setSessionLayout.bind(repo.workspace); let once = true;
    repo.workspace.setSessionLayout = async (...args) => { const result = await layout(...args); if (once) { once = false; focused.release(); await release.promise; } return result; };
    try {
      take(await c.start({ sessionId: s.session.id })); runtime.edit('first edit'); const switching = c.switchDraft(b.draft.id); await focused.promise;
      runtime.edit('late edit in A'); equal(name(runtime.api.capture()), 'late edit in A'); release.release(); take(await switching);
      equal(name(runtime.api.capture()), 'B'); take(await c.switchDraft(s.drafts[0].id)); equal(name(runtime.api.capture()), 'late edit in A');
    } finally { release.release(); c.dispose(); runtime.dispose(); }
  }),

  'controller: quota failure during switch keeps A, its pending edits and recovery input': () => fixture(async ({ open, raw }) => {
    const repo = await open(), s = takeRepository(await repo.workspace.createSession({ initialTab: { kind: 'new', document: changed('A') } }));
    const b = takeRepository(await repo.workspace.createDraft(s.session.id, 1, { document: changed('B'), activate: false }));
    const runtime = memoryRuntime(), c = new SessionController(repo, runtime.api); const update = repo.workspace.updateDraft.bind(repo.workspace);
    try {
      take(await c.start({ sessionId: s.session.id })); runtime.edit('A unsaved'); const active = runtime.network, before = await dump(await raw());
      repo.workspace.updateDraft = async () => ({ ok: false, error: { code: 'quota-exceeded', message: 'Injected quota.' } });
      code(await c.switchDraft(b.draft.id), 'quota-exceeded'); assert(runtime.network === active); equal(runtime.activations, 1);
      assert(c.getState().drafts[0].pendingPersistence); equal(name(c.recoveryDocument()!), 'A unsaved'); equal(await dump(await raw()), before);
      repo.workspace.updateDraft = update; take(await c.flush()); take(await c.switchDraft(b.draft.id)); equal(name(runtime.api.capture()), 'B');
    } finally { c.dispose(); runtime.dispose(); }
  }),

  'controller: failure of a late edit compensates focus without disposing A': () => fixture(async ({ open }) => {
    const repo = await open(), s = takeRepository(await repo.workspace.createSession({ initialTab: { kind: 'new', document: changed('A') } }));
    const b = takeRepository(await repo.workspace.createDraft(s.session.id, 1, { document: changed('B'), activate: false }));
    const runtime = memoryRuntime(), c = new SessionController(repo, runtime.api), layout = repo.workspace.setSessionLayout.bind(repo.workspace);
    let once = true;
    repo.workspace.setSessionLayout = async (...args) => { const r = await layout(...args); if (once) { once = false; runtime.edit('late and not persisted'); } return r; };
    repo.workspace.updateDraft = async () => ({ ok: false, error: { code: 'quota-exceeded', message: 'Injected quota after focus.' } });
    try {
      take(await c.start({ sessionId: s.session.id })); const original = runtime.network;
      code(await c.switchDraft(b.draft.id), 'quota-exceeded'); assert(runtime.network === original);
      equal(takeRepository(await repo.workspace.restoreSession(s.session.id)).session.activeDraftId, s.drafts[0].id);
      equal(name(c.recoveryDocument()!), 'late and not persisted');
    } finally { c.dispose(); runtime.dispose(); }
  }),

  'controller: two instances cannot overwrite concurrent edits or lose the rejected local copy': () => fixture(async ({ open }) => {
    const repo = await open(), other = await open(), runtime = memoryRuntime(), second = memoryRuntime();
    const one = new SessionController(repo, runtime.api), two = new SessionController(other, second.api);
    try {
      const state = take(await one.start()); take(await two.start()); equal(two.getState().session?.id, state.session?.id);
      runtime.edit('one'); second.edit('two'); const results = await Promise.all([one.flush(), two.flush()]);
      equal(results.filter(r => r.ok).length, 1); equal(results.filter(r => !r.ok && r.error.code === 'draft-conflict').length, 1);
      equal(name(one.recoveryDocument()!), 'one'); equal(name(two.recoveryDocument()!), 'two');
      const loser = results[0].ok ? two : one; assert(loser.getState().drafts[0].pendingPersistence);
      code(await loser.flush(), 'draft-conflict'); equal(takeRepository(await repo.workspace.listSessions()).length, 1);
    } finally { one.dispose(); two.dispose(); runtime.dispose(); second.dispose(); }
  }),

  'controller: manual Save does not include newer edits received while it commits': () => fixture(async ({ open }) => {
    const repo = await open(), runtime = memoryRuntime(), c = new SessionController(repo, runtime.api), committed = gate(), release = gate();
    const saveAs = repo.workspace.saveAsDraft.bind(repo.workspace);
    repo.workspace.saveAsDraft = async (...args) => { const r = await saveAs(...args); committed.release(); await release.promise; return r; };
    try {
      take(await c.start()); runtime.edit('explicit Save'); const saving = c.save('Named'); await committed.promise;
      runtime.edit('newer than Save'); release.release(); const saved = take(await saving);
      assert(saved.hasNewerEdits); equal(saved.savedSequence, 1); equal(name(saved.plan.document), 'explicit Save');
      assert(c.getState().drafts[0].manualSavePending); equal(name(c.recoveryDocument()!), 'newer than Save');
      take(await c.flush()); equal(name(takeRepository(await repo.loadProject(saved.plan.project.id)).document), 'explicit Save');
    } finally { release.release(); c.dispose(); runtime.dispose(); }
  }),

  'controller: manual plan conflicts remain recoverable without overwriting the plan': () => fixture(async ({ open }) => {
    const repo = await open(), runtime = memoryRuntime(), c = new SessionController(repo, runtime.api);
    try {
      take(await c.start()); const saved = take(await c.save('Manual')); runtime.edit('local');
      const external = takeRepository(await repo.updateProject(saved.plan.project.id, 1, changed('external')));
      code(await c.save(), 'conflict'); equal(name(c.recoveryDocument()!), 'local');
      const copy = take(await c.save('Save As local')); equal(name(copy.plan.document), 'local');
      equal(takeRepository(await repo.loadProject(saved.plan.project.id)), external);
    } finally { c.dispose(); runtime.dispose(); }
  }),

  'controller: a queued Save cannot target another draft after an asynchronous switch': () => fixture(async ({ open }) => {
    const repo = await open(), s = takeRepository(await repo.workspace.createSession({ initialTab: { kind: 'new', document: changed('A') } }));
    const b = takeRepository(await repo.workspace.createDraft(s.session.id, 1, { document: changed('B'), activate: false }));
    const runtime = memoryRuntime(), c = new SessionController(repo, runtime.api);
    try {
      take(await c.start({ sessionId: s.session.id })); const switching = c.switchDraft(b.draft.id), saving = c.save('Intended A');
      take(await switching); code(await saving, 'runtime-changed'); equal(takeRepository(await repo.listProjects()), []); equal(name(runtime.api.capture()), 'B');
    } finally { c.dispose(); runtime.dispose(); }
  }),

  'controller: applied terminal configuration reaches only the active draft in the real store': () => fixture(async ({ open }) => {
    const { useStore } = await import('../store'), { createZustandSessionRuntime } = await import('./zustandSessionRuntime');
    const { getSession } = await import('../terminals'), { IpDevice } = await import('../engine/ipdevice');
    const originalNet = sim.net, originalState = useStore.getState(), legacy = localStorage.getItem('netsim:autosave:v1');
    const repo = await open(), c = new SessionController(repo, createZustandSessionRuntime());
    try {
      take(await c.start()); const id = take(await c.openDocument(document())); useStore.getState().openTerminal('pc1');
      const host = sim.net.devices.get('pc1'); assert(host instanceof IpDevice);
      const terminal = getSession(host); terminal.term.input('ip addr add 192.0.2.10/24 dev eth0\r', true);
      for (let i = 0; i < 100 && !host.getInterface('eth0')?.ip; i++) await new Promise(resolve => setTimeout(resolve, 5));
      assert(host.getInterface('eth0')?.ip, 'Terminal command must apply configuration.');
      take(await c.flush()); const draft = takeRepository(await repo.workspace.loadDraft(id)); assert(draft.state === 'open');
      equal(draft.document.topology.devices.find(d => d.id === 'pc1')?.ifaces[0].ip, '192.0.2.10/24');
      equal(takeRepository(await repo.listProjects()), []); equal(localStorage.getItem('netsim:autosave:v1'), legacy);
    } finally { c.dispose(); disposeNetwork(sim.net); const { disposeAllSessions } = await import('../terminals'); disposeAllSessions(); sim.net = originalNet; useStore.setState(originalState); }
  }),

  'controller: existing IPv4 form registers unapplied values and blocks switching in Chromium': () => fixture(async ({ open }) => {
    const { useStore } = await import('../store'), { createZustandSessionRuntime } = await import('./zustandSessionRuntime');
    const { InterfaceIpv4Panel } = await import('../components/InterfaceIpv4Panel');
    const { createElement } = await import('react'), { createRoot } = await import('react-dom/client'), { flushSync } = await import('react-dom');
    const { hasPendingForms } = await import('./pendingForms');
    const originalNet = sim.net, originalState = useStore.getState();
    const repo = await open(), s = takeRepository(await repo.workspace.createSession({ initialTab: { kind: 'new', document: document() } }));
    const b = takeRepository(await repo.workspace.createDraft(s.session.id, 1, { document: changed('B'), activate: false }));
    const element = window.document.createElement('div'); window.document.body.appendChild(element); const root = createRoot(element);
    const c = new SessionController(repo, createZustandSessionRuntime());
    try {
      take(await c.start({ sessionId: s.session.id }));
      flushSync(() => root.render(createElement(InterfaceIpv4Panel, { deviceId: 'pc1', ifaceName: 'eth0' })));
      const input = element.querySelector('input[aria-label="IP-Adresse eth0"]') as HTMLInputElement; assert(input);
      flushSync(() => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '192.0.2.');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      assert(hasPendingForms(), 'Unapplied IPv4 input must be registered.');
      code(await c.switchDraft(b.draft.id), 'unapplied-forms'); equal(sim.net.devices.get('pc1')?.name, 'pc1');
      const current = c.recoveryDocument()!; assert(!JSON.stringify(current).includes('192.0.2.')); // form text is never a document field
      flushSync(() => root.unmount()); assert(!hasPendingForms()); take(await c.switchDraft(b.draft.id));
    } finally { flushSync(() => root.unmount()); element.remove(); c.dispose(); disposeNetwork(sim.net); sim.net = originalNet; useStore.setState(originalState); }
  }),

  'controller: destination revision changed after preparation prevents activation': () => fixture(async ({ open }) => {
    const repo = await open(), s = takeRepository(await repo.workspace.createSession({ initialTab: { kind: 'new', document: changed('A') } }));
    const b = takeRepository(await repo.workspace.createDraft(s.session.id, 1, { document: changed('B'), activate: false }));
    const runtime = memoryRuntime(), c = new SessionController(repo, runtime.api), layout = repo.workspace.setSessionLayout.bind(repo.workspace);
    repo.workspace.setSessionLayout = async (...args) => {
      takeRepository(await repo.workspace.updateDraft(b.draft.id, { expectedRevision: 1, editSequence: 1, document: changed('B external') }));
      return layout(...args);
    };
    try {
      take(await c.start({ sessionId: s.session.id })); const active = runtime.network;
      code(await c.switchDraft(b.draft.id), 'draft-conflict'); assert(runtime.network === active); equal(c.getState().activeDraftId, s.drafts[0].id);
    } finally { c.dispose(); runtime.dispose(); }
  }),

  'controller: form guard checks both before switching and after asynchronous persistence': () => fixture(async ({ open }) => {
    const repo = await open(), s = takeRepository(await repo.workspace.createSession({ initialTab: { kind: 'new', document: changed('A') } }));
    const b = takeRepository(await repo.workspace.createDraft(s.session.id, 1, { document: changed('B'), activate: false }));
    const runtime = memoryRuntime(), c = new SessionController(repo, runtime.api), update = repo.workspace.updateDraft.bind(repo.workspace);
    try {
      take(await c.start({ sessionId: s.session.id })); runtime.forms = true;
      code(await c.switchDraft(b.draft.id), 'unapplied-forms'); equal(runtime.activations, 1); runtime.forms = false;
      runtime.edit('applied'); repo.workspace.updateDraft = async (...args) => { const r = await update(...args); runtime.forms = true; return r; };
      code(await c.switchDraft(b.draft.id), 'unapplied-forms'); equal(runtime.activations, 1);
      take(await c.switchDraft(b.draft.id, { discardUnappliedForms: true })); equal(runtime.activations, 2);
    } finally { c.dispose(); runtime.dispose(); }
  }),

  'controller: disposal during an old write prevents any late activation or acknowledgement': () => fixture(async ({ open }) => {
    const repo = await open(), runtime = memoryRuntime(), c = new SessionController(repo, runtime.api), committed = gate(), release = gate(), update = repo.workspace.updateDraft.bind(repo.workspace);
    repo.workspace.updateDraft = async (...args) => { const r = await update(...args); committed.release(); await release.promise; return r; };
    try {
      take(await c.start()); runtime.edit('pending'); const pending = c.flush(); await committed.promise;
      c.dispose(); release.release(); code(await pending, 'disposed'); equal(c.getState().drafts[0].persistedSequence, 0);
      equal(name(c.recoveryDocument()!), 'pending'); code(await c.start(), 'disposed'); equal(runtime.activations, 1);
    } finally { release.release(); c.dispose(); runtime.dispose(); }
  }),

  'controller: startup edits are preserved and repeated starts restore one reserved session': () => fixture(async ({ open }) => {
    const repo = await open(), runtime = memoryRuntime(), c = new SessionController(repo, runtime.api), loaded = gate(), release = gate();
    const list = repo.workspace.listSessions.bind(repo.workspace);
    repo.workspace.listSessions = async () => { const r = await list(); loaded.release(); await release.promise; return r; };
    try {
      const starting = c.start(); await loaded.promise; runtime.edit('edited during start'); release.release(); code(await starting, 'runtime-changed');
      equal(runtime.activations, 0); equal(name(runtime.api.capture()), 'edited during start');
      equal(name(c.recoveryDocument()!), 'edited during start'); code(await c.start(), 'runtime-changed');
      take(await c.start({ discardStartupChanges: true })); take(await c.start()); equal(runtime.activations, 1); equal(takeRepository(await repo.workspace.listSessions()).length, 1);
    } finally { release.release(); c.dispose(); runtime.dispose(); }
  }),

  'controller: interrupted first boot resumes its reservation without a duplicate or changed source': () => fixture(async ({ open }) => {
    const repo = await open(), create = repo.workspace.createSession.bind(repo.workspace);
    repo.workspace.createSession = async () => ({ ok: false, error: { code: 'aborted', message: 'Interrupted after reservation.' } });
    code(await bootstrapSession(repo, changed('reserved original')), 'aborted');
    assert(takeRepository(await repo.getMeta(SESSION_RESUME_KEY))); equal(takeRepository(await repo.workspace.listSessions()), []);
    repo.workspace.createSession = create;
    const retried = take(await bootstrapSession(repo, changed('must not replace reservation')));
    equal(name(retried.snapshot.drafts[0].document), 'reserved original');
    const again = take(await bootstrapSession(repo, document())); equal(again.snapshot.session.id, retried.snapshot.session.id); equal(takeRepository(await repo.workspace.listSessions()).length, 1);
  }),

  'controller: competing first boots and lost commit replies reuse the reserved session': () => fixture(async ({ open }) => {
    const one = await open(), two = await open();
    const results = await Promise.all([bootstrapSession(one, changed('one')), bootstrapSession(two, changed('two'))]);
    const snapshots = results.map(r => take(r).snapshot); equal(snapshots[0].session.id, snapshots[1].session.id);
    equal(name(snapshots[0].drafts[0].document), name(snapshots[1].drafts[0].document));
    equal(takeRepository(await one.workspace.listSessions()).length, 1);
  }),

  'controller: lost first-session commit reply is recovered without creating another session': () => fixture(async ({ open }) => {
    const repo = await open(), create = repo.workspace.createSession.bind(repo.workspace);
    repo.workspace.createSession = async (...args) => { takeRepository(await create(...args)); return { ok: false, error: { code: 'aborted', message: 'Reply lost after commit.' } }; };
    code(await bootstrapSession(repo, changed('committed once')), 'aborted'); repo.workspace.createSession = create;
    const result = take(await bootstrapSession(repo, changed('retry input'))); equal(name(result.snapshot.drafts[0].document), 'committed once');
    equal(takeRepository(await repo.workspace.listSessions()).length, 1);
  }),

  'controller: explicit legacy first boot and Share Link preserve restored work and original bytes': () => fixture(async ({ open }) => {
    const repo = await open(), runtime = memoryRuntime(), c = new SessionController(repo, runtime.api), raw = JSON.stringify(changed('legacy').topology);
    const storage = { getItem: () => raw };
    try {
      take(await c.start({ legacy: { migrate: true, storage, origin: 'https://controller.example' } }));
      equal(name(runtime.api.capture()), 'legacy'); const originalId = c.getState().activeDraftId!;
      runtime.edit('restored unsaved legacy'); take(c.offerShare(changed('Shared separately')));
      equal(name(runtime.api.capture()), 'restored unsaved legacy'); assert(c.getState().pendingShare);
      const sharedId = take(await c.acceptShare()); assert(sharedId !== originalId); equal(name(runtime.api.capture()), 'Shared separately');
      take(await c.switchDraft(originalId)); equal(name(runtime.api.capture()), 'restored unsaved legacy'); equal(storage.getItem(), raw);
      equal(takeRepository(await repo.listProjects()).length, 1); const records = await repo.workspace.restoreSession(c.getState().session!.id); assert(records.ok); equal(records.value.drafts.length, 2);
    } finally { c.dispose(); runtime.dispose(); }
  }),

  'controller: migration stays off by default and invalid legacy data requires recovery': () => fixture(async ({ open }) => {
    const repo = await open(); let reads = 0;
    const runtime = memoryRuntime(), c = new SessionController(repo, runtime.api);
    try {
      take(await c.start({ legacy: { migrate: false, storage: { getItem: () => { reads++; return '{broken'; } }, origin: 'https://controller.example' } }));
      equal(reads, 0); equal(takeRepository(await repo.listProjects()), []);
    } finally { c.dispose(); runtime.dispose(); }
  }),

  'controller: invalid legacy first boot preserves network and stores only its recovery archive': () => fixture(async ({ open }) => {
    const repo = await open(), runtime = memoryRuntime(), c = new SessionController(repo, runtime.api);
    try {
      code(await c.start({ legacy: { migrate: true, storage: { getItem: () => '{broken' }, origin: 'https://controller.example' } }), 'legacy-recovery-required');
      equal(runtime.activations, 0); equal(takeRepository(await repo.listProjects()), []); equal(takeRepository(await repo.workspace.listSessions()), []);
    } finally { c.dispose(); runtime.dispose(); }
  }),

  'controller: aborted native autosave has no receipt and keeps the previous document': () => fixture(async ({ open, raw }) => {
    const repo = await open(), runtime = memoryRuntime(), c = new SessionController(repo, runtime.api), put = IDBObjectStore.prototype.put;
    try {
      take(await c.start()); const db = await raw(), before = await dump(db); runtime.edit('must roll back');
      IDBObjectStore.prototype.put = function(...args: Parameters<typeof put>) {
        const r = put.apply(this, args);
        if (this.name === 'meta' && (args[0] as MetaRecord).key.startsWith('workspace:v1:draft:')) r.addEventListener('success', () => this.transaction.abort());
        return r;
      };
      code(await c.flush(), 'aborted'); equal(await dump(db), before); assert(c.getState().drafts[0].pendingPersistence); equal(name(c.recoveryDocument()!), 'must roll back');
    } finally { IDBObjectStore.prototype.put = put; c.dispose(); runtime.dispose(); }
  }),

  'controller: real Zustand activation clears runtime state, terminals and history and preserves Labs': () => fixture(async ({ open }) => {
    const { useStore } = await import('../store'), { createZustandSessionRuntime } = await import('./zustandSessionRuntime');
    const { getSession } = await import('../terminals');
    const originalNet = sim.net, originalState = useStore.getState(), legacy = localStorage.getItem('netsim:autosave:v1');
    const repo = await open(), s = takeRepository(await repo.workspace.createSession({ initialTab: { kind: 'new', document: changed('A') } }));
    const bDoc = changed('B'); delete bDoc.topology.lab; delete bDoc.topology.labProgress;
    const b = takeRepository(await repo.workspace.createDraft(s.session.id, 1, { document: bDoc, activate: false }));
    const c = new SessionController(repo, createZustandSessionRuntime());
    try {
      take(await c.start({ sessionId: s.session.id })); const aNet = sim.net, aHost = aNet.devices.get('pc1')!;
      useStore.getState().renameDevice('pc1', 'A edited through Zustand'); useStore.getState().answerQuiz('0', 1);
      assert(useStore.getState().topologyHistory.past.length > 0); useStore.getState().openTerminal('pc1');
      const terminal = getSession(aHost as Parameters<typeof getSession>[0]); let disposed = false;
      const dispose = terminal.dispose.bind(terminal); terminal.dispose = () => { disposed = true; dispose(); };
      await new Promise<void>(resolve => terminal.term.write('buffer not persisted', resolve));
      useStore.getState().checkStep(); assert(useStore.getState().labChecking);
      let ran = false; aNet.scheduler.schedule(99999, () => { ran = true; });
      take(await c.switchDraft(b.draft.id)); assert(disposed); equal(aNet.scheduler.pending, 0); assert(aHost.disposed);
      equal(useStore.getState().terminals, []); equal(useStore.getState().terminalPanels, []); equal(useStore.getState().packets, []);
      equal(useStore.getState().topologyHistory.past, []); equal(useStore.getState().lab, null); equal(useStore.getState().clock, 0);
      equal(useStore.getState().labChecking, false); equal(useStore.getState().labResults, {});
      aNet.scheduler.advanceTo(100000); assert(!ran);
      take(await c.switchDraft(s.drafts[0].id)); equal(sim.net.devices.get('pc1')?.name, 'A edited through Zustand');
      equal(useStore.getState().quizAnswers['0'], 1); assert(useStore.getState().lab); equal(useStore.getState().topologyHistory.past, []);
      const fresh = getSession(sim.net.devices.get('pc1') as Parameters<typeof getSession>[0]); assert(fresh !== terminal); fresh.dispose();
      equal(localStorage.getItem('netsim:autosave:v1'), legacy); equal(useStore.getState().workspaceIdentity?.draftId, s.drafts[0].id);
    } finally { c.dispose(); disposeNetwork(sim.net); sim.net = originalNet; useStore.setState(originalState); }
  }),
};
