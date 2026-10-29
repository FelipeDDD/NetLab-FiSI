import { describe, expect, it } from 'vitest';
import { NETWORK_FACTORY_DRAFTS as catalog } from './catalog';
import { validateFactory } from './validate';
import { BETA_EXERCISES } from '../beta';
import { EXERCISE_DRAFTS } from '../drafts';

it('keeps the original 20 and 12 CIDR drafts JSON-roundtrippable and separate from published exercises', () => {
  const before = JSON.stringify(catalog);
  expect(catalog).toHaveLength(32);
  expect(['A', 'B', 'C', 'D', 'E'].map(g => catalog.filter(d => d.group === g).length)).toEqual([6, 6, 4, 4, 12]);
  expect(validateFactory(JSON.parse(before))).toEqual([]);
  expect(JSON.stringify(catalog)).toBe(before);
  expect(BETA_EXERCISES).toHaveLength(2);
  expect(EXERCISE_DRAFTS).toHaveLength(5);
  expect(catalog.some(d => [...BETA_EXERCISES, ...EXERCISE_DRAFTS].some(old => old.id === d.id))).toBe(false);
});
describe('fail-closed authoring validation', () => {
  it('rejects duplicate IDs and missing criteria', () => {
    expect(validateFactory([catalog[0], catalog[0]])).not.toEqual([]);
    const bad = structuredClone(catalog[0]); bad.review.assessments = [];
    expect(validateFactory([bad])).not.toEqual([]);
  });
  it.each([null, [], {}, { format: 'calculation' }])('rejects malformed input %j', input => expect(validateFactory([input])).not.toEqual([]));
  it('rejects wrong answers, unknown objectives, missing review and reference conflicts', () => {
    const calc = structuredClone(catalog[0]);
    if (calc.format !== 'calculation') throw new Error();
    calc.review.reference.answer = { wrong: true };
    expect(validateFactory([calc])).not.toEqual([]);
    const objective = structuredClone(catalog[0]); objective.student.requirements[0].objectiveIds = ['missing'];
    expect(validateFactory([objective])).not.toEqual([]);
    const noReview = structuredClone(catalog[0]); noReview.review.commonMistakes = [];
    expect(validateFactory([noReview])).not.toEqual([]);
    const net = structuredClone(catalog[12]);
    if (net.format !== 'network') throw new Error();
    net.review.reference.topology.devices[1].ifaces[0].ip = net.review.reference.topology.devices[0].ifaces[0].ip;
    expect(validateFactory([net]).join(' ')).toContain('doppelte Adresse');
  });
});
