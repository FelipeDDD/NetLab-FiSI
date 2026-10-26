export { openProjectRepository, ProjectRepository } from './repository';
export { normalizeProjectDocument } from './projectDocument';
export * from './types';
export { migrateLegacyAutosave, loadLegacyArchive } from './legacyMigration';
export { readLegacyAutosave, identifyLegacySource, fingerprintLegacyText, createLegacyRecoveryFile, readLegacyRecoveryFile } from './legacySource';
export { inspectLegacyTopology } from './legacyInspection';
export * from './legacyTypes';
export { WorkspaceRepository } from './workspaceRepository';
export * from './workspaceTypes';
