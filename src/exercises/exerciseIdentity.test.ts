import { expect, it } from 'vitest';
import { BETA_EXERCISES, betaChecks } from './beta';
import { EXERCISE_DRAFTS } from './drafts';
import { validateDraftCollection } from './validate';
import { restoreNetwork, serializeNetwork } from '../engine/serialize';
import type { Network } from '../engine/network';
import { disposeNetwork } from '../engine/networkLifecycle';
import { runChecks, type CheckResult } from '../labs/checker';
import { IpDevice } from '../engine/ipdevice';
import { createDevice } from '../engine/factory';

function verify(net: Network, exerciseId: string) {
  const rows: CheckResult[] = []; let done = false;
  runChecks(net, betaChecks[exerciseId].map(a => ({ id: a.id, label: '', check: a.check })), r => rows.push(r), () => { done = true; });
  net.scheduler.advanceTo(net.scheduler.now + 120_000);
  expect(done).toBe(true); return rows;
}

it.each(BETA_EXERCISES)('$id keeps identity and technical results through Unicode renames and Save/Load', exercise => {
  const reference = EXERCISE_DRAFTS.find(d => d.id === exercise.id)!.review.reference.topology;
  const net = restoreNetwork(structuredClone(reference));
  try {
    expect(verify(net, exercise.id).filter(r => !r.pass)).toEqual([]);
    if (net.devices.has('buero')) net.devices.get('buero')!.name = 'büro';
    expect(verify(net, exercise.id).filter(r => !r.pass)).toEqual([]);
    const before = serializeNetwork(net, {});
    [...net.devices.values()].forEach((d, i) => { d.name = ['Office-PC / Escritório 🖥', 'Büro – 東京', 'Servidor João', 'Rede de testes'][i]; });
    const renamed = serializeNetwork(net, {});
    expect(renamed.devices.map(d => d.id)).toEqual(before.devices.map(d => d.id));
    expect(renamed.links).toEqual(before.links);
    expect(renamed.devices.map(({ name: _name, ...d }) => d)).toEqual(before.devices.map(({ name: _name, ...d }) => d));
    expect(verify(net, exercise.id).filter(r => !r.pass)).toEqual([]);
    const restored = restoreNetwork(JSON.parse(JSON.stringify(renamed)));
    try {
      expect(serializeNetwork(restored, {})).toEqual(renamed);
      expect(verify(restored, exercise.id).filter(r => !r.pass)).toEqual([]);
    } finally { disposeNetwork(restored); }
  } finally { disposeNetwork(net); }
});

it.each(BETA_EXERCISES)('$id rejects an identity replacement, even with the old name and identical networking', exercise => {
  const reference = structuredClone(EXERCISE_DRAFTS.find(d => d.id === exercise.id)!.review.reference.topology);
  const source = reference.devices[0], oldId = source.id;
  source.id = 'replacement-with-different-id'; source.name = oldId;
  reference.links.forEach(link => { for (const end of ['a', 'b'] as const) if (link[end][0] === oldId) link[end][0] = source.id; });
  const net = restoreNetwork(reference);
  try {
    expect(net.devices.has(oldId)).toBe(false);
    expect(verify(net, exercise.id).find(r => r.id === (exercise.id.includes('routing') ? 'buero-eth0' : 'ip-servicepc'))?.pass).toBe(false);
  } finally { disposeNetwork(net); }
});

it.each(BETA_EXERCISES)('$id ignores same-named additions and still rejects real networking errors', exercise => {
  const net = restoreNetwork(structuredClone(EXERCISE_DRAFTS.find(d => d.id === exercise.id)!.review.reference.topology));
  try {
    const sourceId = exercise.id.includes('routing') ? 'buero' : 'servicepc';
    net.devices.get(sourceId)!.name = 'Büro Office-PC';
    createDevice(net, 'host', { id: 'unrelated', name: sourceId });
    expect(verify(net, exercise.id).filter(r => !r.pass)).toEqual([]);
    if (exercise.id.includes('routing')) (net.devices.get('r1') as IpDevice).forwarding = false;
    else (net.devices.get('portal') as IpDevice).httpServer!.enabled = false;
    expect(verify(net, exercise.id).some(r => !r.pass)).toBe(true);
  } finally { disposeNetwork(net); }
});

it('validates translated/duplicate display names while rejecting references that contain a name instead of an ID', () => {
  const drafts = structuredClone(EXERCISE_DRAFTS);
  for (const d of drafts) for (const file of [d.student.initialTopology, d.review.reference.topology]) file.devices.forEach(device => { device.name = 'Gerät / Dispositivo 🔧'; });
  expect(validateDraftCollection(drafts)).toEqual([]);
  const check = drafts[0].review.assessments[0];
  if (check.kind === 'engine' && check.check.type === 'iface-ip') check.check.device = 'Gerät / Dispositivo 🔧';
  expect(validateDraftCollection(drafts)).toHaveLength(1);
});
