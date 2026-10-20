import { expect, it } from 'vitest';
import { newInspectorDraft, syncInspectorDraft } from './inspectorDraft';

it('updates confirmed values without resetting drafts on unchanged simulation refreshes', () => {
  const clean = newInspectorDraft('pc1:eth0', '192.0.2.1/24');
  expect(syncInspectorDraft(clean, clean.identity, clean.source)).toBe(clean);
  expect(syncInspectorDraft(clean, clean.identity, '')).toEqual(newInspectorDraft(clean.identity, ''));
  const typing = { ...clean, text: '192.0.2.' };
  expect(syncInspectorDraft(typing, clean.identity, clean.source)).toBe(typing);
});

it('retains dirty text on external changes, marks it stale and accepts convergence or explicit further editing', () => {
  const typing = { ...newInspectorDraft('pc1:name', 'PC1'), text: 'PC-Lab' };
  const changed = syncInspectorDraft(typing, typing.identity, 'PC-Terminal');
  expect(changed).toEqual({ ...typing, source: 'PC-Terminal', stale: true });
  expect(syncInspectorDraft(changed, typing.identity, 'PC-Lab')).toEqual(newInspectorDraft(typing.identity, 'PC-Lab'));
  const resumed = { ...newInspectorDraft(typing.identity, changed.source), text: 'PC-Lab2' };
  expect(syncInspectorDraft(resumed, resumed.identity, resumed.source).stale).toBe(false);
});

it('discards drafts when switching devices or interfaces', () => {
  const typing = { ...newInspectorDraft('pc1:eth0', '192.0.2.1/24'), text: 'unfinished' };
  expect(syncInspectorDraft(typing, 'pc2:eth0', '198.51.100.2/24')).toEqual(newInspectorDraft('pc2:eth0', '198.51.100.2/24'));
  expect(syncInspectorDraft(typing, 'pc1:eth1', '')).toEqual(newInspectorDraft('pc1:eth1', ''));
});

it.each([['nameserver', '192.0.2.53', ''], ['tcp', '22, 443', '80'], ['ssid', 'Lab 🌐', 'Other'], ['vlan:eth0', '20', '1']])(
  'synchronizes %s and prevents stale blur drafts after Undo or external changes', (field, before, after) => {
    const identity = `device:${field}`, clean = newInspectorDraft(identity, before);
    expect(syncInspectorDraft(clean, identity, after).text).toBe(after);
    const dirty = { ...clean, text: 'unfinished' }, external = syncInspectorDraft(dirty, identity, after);
    expect(external.text).toBe('unfinished'); expect(external.stale).toBe(true);
    expect(syncInspectorDraft(external, 'other-device:' + field, after)).toEqual(newInspectorDraft('other-device:' + field, after));
  },
);
