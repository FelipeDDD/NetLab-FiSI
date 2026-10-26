import { disposeNetwork } from '../engine/networkLifecycle';
import { captureTopologyDocument, prepareTopologyDocument } from '../persistence/topologyDocument';
import { fail } from './errors';
import { PROJECT_DOCUMENT_VERSION, type ProjectDocument, type ProjectMetadata, type MetaValue } from './types';

export const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export const isRevision = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 1;
export const isTimestamp = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
export const isProjectId = (v: unknown): v is string => typeof v === 'string' && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(v);

export function createProjectId(): string {
  const source = globalThis.crypto;
  if (typeof source?.randomUUID === 'function') return source.randomUUID();
  if (typeof source?.getRandomValues !== 'function') fail({ code: 'unavailable', message: 'A cryptographic identifier source is unavailable.' });
  const bytes = source.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function projectName(value: string): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 200) fail({ code: 'invalid-input', message: 'Project name must contain 1–200 characters.' });
  return value.trim();
}

/** Canonical persistent DTO only. Reuse v1 legacy readers, then discard the
 * prepared engine; caches/events/session objects can never enter the database. */
export function normalizeProjectDocument(input: unknown): ProjectDocument {
  if (!isObject(input) || input.schemaVersion !== PROJECT_DOCUMENT_VERSION) fail({ code: 'incompatible-document', message: 'Unsupported project document schema version.' });
  if (isObject(input.topology) && (input.topology.app !== 'netsim' || input.topology.version !== 1)) fail({ code: 'incompatible-document', message: 'Unsupported topology format; expected netsim v1.' });
  try {
    const prepared = prepareTopologyDocument(input.topology);
    try {
      const data = prepared.document;
      return { schemaVersion: PROJECT_DOCUMENT_VERSION, topology: captureTopologyDocument(prepared.network, {
        nodes: data.devices.map(d => ({ id: d.id, position: { x: d.x, y: d.y } })), ...prepared.presentation,
        lab: data.lab ?? null, labStep: data.labProgress?.step ?? 0,
        labResults: data.labProgress?.results ?? {}, quizAnswers: data.labProgress?.quiz ?? {},
      }) };
    } finally { disposeNetwork(prepared.network); }
  } catch (error) {
    fail({ code: 'invalid-document', message: error instanceof Error ? error.message : String(error) });
  }
}

export function validateMetadata(value: unknown, id?: string): ProjectMetadata {
  if (!isObject(value) || !isProjectId(value.id) || (id !== undefined && value.id !== id) || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 200 ||
      !isRevision(value.revision) || !isTimestamp(value.createdAt) || !isTimestamp(value.updatedAt) || value.updatedAt < value.createdAt ||
      (value.lastOpenedAt !== null && (!isTimestamp(value.lastOpenedAt) || value.lastOpenedAt < value.createdAt)) ||
      (value.deletedAt !== null && (!isTimestamp(value.deletedAt) || value.deletedAt < value.createdAt))) {
    fail({ code: 'corrupt-data', message: 'Invalid project metadata.' });
  }
  return value as unknown as ProjectMetadata;
}

export function cloneMetaValue(value: MetaValue): MetaValue {
  const active = new Set<object>();
  const check = (v: unknown, depth: number): boolean => {
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return true;
    if (typeof v === 'number') return Number.isFinite(v);
    if (typeof v !== 'object' || depth > 100 || active.has(v)) return false;
    if (!Array.isArray(v) && Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null) return false;
    active.add(v);
    const valid = Object.values(v).every(item => check(item, depth + 1));
    active.delete(v);
    return valid;
  };
  if (!check(value, 0)) fail({ code: 'invalid-input', message: 'Control metadata must be finite, acyclic JSON data.' });
  return structuredClone(value);
}
