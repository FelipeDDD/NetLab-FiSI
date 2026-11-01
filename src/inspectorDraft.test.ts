import { expect, it } from 'vitest';
import { acceptedInspectorDraft, inspectorDraftDirty, newInspectorDraft, syncInspectorDraft } from './inspectorDraft';

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

it.each(['dns:records', 'http:body'])('preserves multiline %s drafts and detects conflicting confirmed changes', (field) => {
  const identity = `server:${field}`, source = 'first line\nsecond line\n';
  const dirty = { ...newInspectorDraft(identity, source), text: '  editing 🌐\n\nmore text\n' };
  expect(syncInspectorDraft(dirty, identity, source)).toBe(dirty);
  const changed = syncInspectorDraft(dirty, identity, 'restored value\n');
  expect(changed.text).toBe(dirty.text); expect(changed.stale).toBe(true);
  expect(syncInspectorDraft(newInspectorDraft(identity, source), identity, '')).toEqual(newInspectorDraft(identity, ''));
  expect(syncInspectorDraft(dirty, `other-server:${field}`, 'other body')).toEqual(newInspectorDraft(`other-server:${field}`, 'other body'));
});

it('keeps accepted DNS formatting on refresh without a pending form and reconciles Undo/Redo', () => {
  const text = '10.0.0.2 z.lan\n\n10.0.0.1 a.lan\n', source = '10.0.0.1 a.lan\n10.0.0.2 z.lan';
  const draft = acceptedInspectorDraft('server:dns:records', source, text);
  expect(inspectorDraftDirty(draft)).toBe(false);
  expect(syncInspectorDraft(draft, draft.identity, source)).toBe(draft);
  const typing = { ...draft, text: text + '10.0.0.' };
  expect(inspectorDraftDirty(typing)).toBe(true);
  expect(syncInspectorDraft(typing, draft.identity, source).text).toBe(typing.text);
  expect(syncInspectorDraft(draft, draft.identity, '')).toEqual(newInspectorDraft(draft.identity, ''));
  expect(syncInspectorDraft(draft, 'other:dns:records', source).text).toBe(source);
});
