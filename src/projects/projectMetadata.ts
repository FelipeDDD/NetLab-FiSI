import { fail } from './errors';
import type { ProjectMetadata } from './types';

export const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export const isRevision = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 1;
export const isTimestamp = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
export const isProjectId = (v: unknown): v is string => typeof v === 'string' && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(v);

export function validateMetadata(value: unknown, id?: string): ProjectMetadata {
  if (!isObject(value) || !isProjectId(value.id) || (id !== undefined && value.id !== id) || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 200 ||
      !isRevision(value.revision) || !isTimestamp(value.createdAt) || !isTimestamp(value.updatedAt) || value.updatedAt < value.createdAt ||
      (value.lastOpenedAt !== null && (!isTimestamp(value.lastOpenedAt) || value.lastOpenedAt < value.createdAt)) ||
      (value.deletedAt !== null && (!isTimestamp(value.deletedAt) || value.deletedAt < value.createdAt))) {
    fail({ code: 'corrupt-data', message: 'Invalid project metadata.' });
  }
  return value as unknown as ProjectMetadata;
}
