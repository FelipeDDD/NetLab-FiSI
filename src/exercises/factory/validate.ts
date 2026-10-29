import { validateDraft } from '../validate';
import { grade, solve } from './math';
import { referenceAddressIssues } from './networkTools';
import type { FactoryDraft } from './types';

function requireValue(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message); }
function text(v: unknown): v is string { return typeof v === 'string' && v.trim().length > 0; }
const unique = (ids: unknown[]) => ids.every(text) && new Set(ids).size === ids.length;

/** Internal boundary for authored/imported drafts, not an application save validator. */
export function validateFactoryDraft(value: unknown): asserts value is FactoryDraft {
  requireValue(value && typeof value === 'object', 'draft: object required');
  const d = value as FactoryDraft;
  requireValue(text(d.id) && /^[a-z][a-z0-9-]+$/.test(d.id), 'stable ID required');
  requireValue(Number.isInteger(d.contentVersion) && d.contentVersion > 0 && d.status === 'draft', 'invalid version/status');
  requireValue(['beginner', 'intermediate', 'advanced'].includes(d.difficulty), 'invalid difficulty');
  requireValue(d.format === 'network' || d.format === 'calculation', 'invalid format');
  if (d.format === 'network') {
    requireValue(['C', 'D', 'E'].includes(d.group), 'invalid network group');
    validateDraft(d);
    const issues = referenceAddressIssues(d.review.reference.topology);
    requireValue(!issues.length, `reference addresses: ${issues.join('; ')}`);
  } else {
    requireValue(['A', 'B', 'E'].includes(d.group) && d.category === (d.group === 'B' ? 'vlsm' : 'subnetting'), 'invalid calculation category/group');
    const s = d.student, r = d.review;
    requireValue(s && [s.title, s.description, s.task].every(text), 'student text missing');
    requireValue(Array.isArray(s.learningObjectives) && s.learningObjectives.length && unique(s.learningObjectives.map(o => o.id)) && s.learningObjectives.every(o => text(o.text)), 'invalid objectives');
    requireValue(Array.isArray(s.requirements) && s.requirements.length && unique(s.requirements.map(r => r.id)), 'invalid requirements');
    for (const req of s.requirements) requireValue(text(req.text) && req.evidence === 'final' && Array.isArray(req.objectiveIds) &&
      req.objectiveIds.length && req.objectiveIds.every(id => s.learningObjectives.some(o => o.id === id)), 'invalid requirement/objective');
    for (const o of s.learningObjectives) requireValue(s.requirements.some(r => r.objectiveIds.includes(o.id)), 'unassessed objective');
    requireValue(r && Array.isArray(r.assessments) && unique(r.assessments.map(a => a.id)), 'invalid math assessments');
    for (const a of r.assessments) requireValue(a.kind === 'math' && text(a.criterion) && s.requirements.some(r => r.id === a.requirementId), 'invalid math mapping');
    for (const req of s.requirements) requireValue(r.assessments.some(a => a.requirementId === req.id), 'unassessed requirement');
    solve(s.initialData);
    requireValue((s.initialData.family === 'vlsm') === (d.group === 'B'), 'family/group mismatch');
    requireValue((s.initialData.family === 'cidr') === (d.group === 'E'), 'CIDR family/group mismatch');
    requireValue(r.reference && text(r.reference.explanation) && grade(s.initialData, r.reference.answer).pass, 'invalid reference answer');
    requireValue(Array.isArray(r.alternatives) && r.alternatives.length && r.alternatives.every(a => text(a.description) && text(a.rationale)), 'alternatives required');
    for (const rows of [r.rejectionCases, r.limitations]) requireValue(Array.isArray(rows) && rows.length && rows.every(text), 'review guidance required');
    if (r.hints !== undefined) requireValue(Array.isArray(r.hints) && r.hints.every(text), 'invalid hints');
    if (d.practice !== undefined) {
      requireValue(d.group === 'E' && d.practice.format === 'network' && d.practice.group === 'E', 'invalid practical supplement');
      validateFactoryDraft(d.practice);
    }
  }
  requireValue(Array.isArray(d.review.commonMistakes) && d.review.commonMistakes.length && d.review.commonMistakes.every(text), 'common mistakes required');
}
export function validateFactory(values: unknown): string[] {
  if (!Array.isArray(values) || !values.length) return ['nonempty catalog required'];
  const seen = new Set<string>(), issues: string[] = [];
  values.forEach((v, i) => {
    try {
      validateFactoryDraft(v); requireValue(!seen.has(v.id), 'duplicate draft ID'); seen.add(v.id);
    } catch (e) { issues.push(`[${i}] ${e instanceof Error ? e.message : String(e)}`); }
  });
  return issues;
}
