import { fail } from './errors';
import { isObject, isProjectId, isRevision, isTimestamp, normalizeProjectDocument } from './projectDocument';
import type { MetaRecord, MetaValue, ProjectDocument, ProjectSnapshot } from './types';
import { DRAFT_PREFIX, SESSION_PREFIX, type DraftRecord, type DraftSavedBase, type OpenDraft, type SessionRecord } from './workspaceTypes';

const sequence = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (isObject(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, sortJson(value[key])]));
  return value;
}

/** JSON is the existing persistence format. Undefined optional fields are
 * omitted just as in JSON export; runtime fields are projected out first. */
export function encodeDraftDocument(input: unknown): { document: ProjectDocument; json: string } {
  const json = JSON.stringify(sortJson(normalizeProjectDocument(input)));
  return { document: JSON.parse(json) as ProjectDocument, json };
}

export function savedBase(plan: ProjectSnapshot): DraftSavedBase {
  return { planId: plan.project.id, planRevision: plan.project.revision, planName: plan.project.name,
    saveId: plan.project.id + '@' + plan.project.revision, savedAt: plan.project.updatedAt,
    documentJson: encodeDraftDocument(plan.document).json };
}

function envelope(value: unknown, key: string): Record<string, unknown> {
  if (!isObject(value) || value.key !== key || !isRevision(value.revision) || !isObject(value.value) || value.value.revision !== value.revision) fail({ code: 'corrupt-data', message: 'Invalid workspace record envelope: ' + key });
  if (value.value.schemaVersion !== 1) fail({ code: 'incompatible-document', message: 'Unsupported workspace record version.' });
  const data = value.value;
  if (!isProjectId(data.id) || !isTimestamp(data.createdAt) || !isTimestamp(data.updatedAt) || data.updatedAt < data.createdAt) fail({ code: 'corrupt-data', message: 'Invalid workspace record identity/timestamps.' });
  return data;
}

export function decodeSession(record: unknown, id: string): SessionRecord {
  const value = envelope(record, SESSION_PREFIX + id);
  if (value.kind !== 'topology-session' || value.id !== id || !Array.isArray(value.draftIds) || !value.draftIds.every(isProjectId) || new Set(value.draftIds).size !== value.draftIds.length ||
      (value.draftIds.length === 0 ? value.activeDraftId !== null : typeof value.activeDraftId !== 'string' || !value.draftIds.includes(value.activeDraftId))) fail({ code: 'corrupt-data', message: 'Invalid session tab order or focus.' });
  return value as unknown as SessionRecord;
}

export function decodeDraft(record: unknown, id: string): DraftRecord {
  const value = envelope(record, DRAFT_PREFIX + id);
  if (value.kind !== 'topology-draft' || value.id !== id || !isProjectId(value.sessionId) || !sequence(value.editSequence)) fail({ code: 'corrupt-data', message: 'Invalid draft identity or edit sequence.' });
  if (value.state === 'closed') {
    if (!isTimestamp(value.closedAt) || value.closedAt < Number(value.createdAt) || value.closedAt !== value.updatedAt || ['document', 'base', 'dirty'].some(key => Object.hasOwn(value, key))) fail({ code: 'corrupt-data', message: 'Invalid closed draft tombstone.' });
    return value as unknown as DraftRecord;
  }
  if (value.state !== 'open' || typeof value.dirty !== 'boolean') fail({ code: 'corrupt-data', message: 'Invalid open draft.' });
  const encoded = encodeDraftDocument(value.document);
  if (JSON.stringify(sortJson(value.document)) !== encoded.json) fail({ code: 'corrupt-data', message: 'Draft contains nonpersistent or noncanonical fields.' });
  let baseline: string | null = null;
  if (value.base !== null) {
    const base = value.base;
    if (!isObject(base) || !isProjectId(base.planId) || !isRevision(base.planRevision) || typeof base.planName !== 'string' || !base.planName.trim() ||
        base.saveId !== base.planId + '@' + base.planRevision || !isTimestamp(base.savedAt) || typeof base.documentJson !== 'string') fail({ code: 'corrupt-data', message: 'Invalid draft Save baseline.' });
    try {
      baseline = encodeDraftDocument(JSON.parse(base.documentJson)).json;
      if (baseline !== base.documentJson) throw Error('Noncanonical baseline.');
    } catch { fail({ code: 'corrupt-data', message: 'Unreadable draft Save baseline.' }); }
  }
  if (value.dirty !== (baseline === null || encoded.json !== baseline)) fail({ code: 'corrupt-data', message: 'Draft dirty flag disagrees with its document and Save baseline.' });
  return { ...value, document: encoded.document } as unknown as OpenDraft;
}

export function workspaceMeta(record: SessionRecord | DraftRecord): MetaRecord {
  const key = (record.kind === 'topology-session' ? SESSION_PREFIX : DRAFT_PREFIX) + record.id;
  return { key, revision: record.revision, value: record as unknown as MetaValue };
}

export function validateEditSequence(value: number): void {
  if (!sequence(value)) fail({ code: 'invalid-input', message: 'Edit sequence must be a nonnegative safe integer.' });
}
