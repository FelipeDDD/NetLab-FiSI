import { expect, it } from 'vitest';
import { openSessionController } from './openSessionController';
import { hasPendingForms, registerPendingForm } from './pendingForms';
import type { SessionRuntime } from './sessionTypes';

it('keeps normal boot untouched and provides exact legacy recovery when IndexedDB is unavailable', async () => {
  let connected = false, activated = false;
  const runtime: SessionRuntime = {
    capture: () => { throw Error('An unavailable database must not capture/replace the active topology.'); },
    identity: () => null, connect: () => { connected = true; return () => {}; },
    activate: () => { activated = true; }, hasPendingForms: () => false,
  };
  const result = await openSessionController({ runtime, repositoryOptions: { factory: null },
    bootstrap: { legacy: { migrate: false, origin: 'https://isolated.example', storage: { getItem: () => '  {broken 🌐' } } } });
  expect(result.ok).toBe(false);
  if (!result.ok) { expect(result.error.code).toBe('unavailable'); expect(result.legacyMode).toBe(true); expect(result.recovery?.source).toMatchObject({ status: 'present', original: { rawText: '  {broken 🌐' } }); expect(result.recovery?.file).not.toBeNull(); }
  expect(connected).toBe(false); expect(activated).toBe(false);
});

it('tracks volatile form checks and removes registrations without retaining field text', () => {
  let dirty = false;
  const remove = registerPendingForm(() => dirty);
  try { expect(hasPendingForms()).toBe(false); dirty = true; expect(hasPendingForms()).toBe(true); }
  finally { remove(); }
  expect(hasPendingForms()).toBe(false);
});
