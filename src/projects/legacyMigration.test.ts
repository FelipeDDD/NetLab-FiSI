import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { LABS } from '../labs/library';
import { EXAMPLES } from '../labs/examples';
import { createLegacyRecoveryFile, fingerprintLegacyText, identifyLegacySource, readLegacyAutosave, readLegacyRecoveryFile } from './legacySource';
import { inspectLegacyTopology } from './legacyInspection';
import { LEGACY_AUTOSAVE_KEY, type LegacySource } from './legacyTypes';
import { migrateLegacyAutosave } from './legacyMigration';
import type { LegacyMigrationRepository } from './legacyTypes';

const source: LegacySource = { storage: 'localStorage', key: LEGACY_AUTOSAVE_KEY, origin: 'https://isolated.example' };

it('protects reads, distinguishes absence and never requests a storage writer', () => {
  expect(readLegacyAutosave({ getItem: () => null }, source.origin).status).toBe('absent');
  expect(readLegacyAutosave({ getItem: () => '' }, source.origin).status).toBe('present');
  expect(readLegacyAutosave({ getItem: () => { throw Error('denied'); } }, source.origin)).toMatchObject({ status: 'failed', diagnostic: { code: 'read-failed' } });
});
it.each(['abc', 'á🌐\n', '\ud800', '\ud801', '\ufeffraw'])('fingerprints exact UTF-16 code units stably (%#)', async rawText => {
  const expected = 'sha256-utf16le-v1:' + createHash('sha256').update(Buffer.from(rawText, 'utf16le')).digest('hex');
  expect(await fingerprintLegacyText(rawText)).toBe(expected);
  expect(await fingerprintLegacyText(rawText)).toBe(expected);
});
it('separates origins and changed source bytes, including malformed Unicode', async () => {
  const a = await identifyLegacySource({ source, rawText: '\ud800' });
  const b = await identifyLegacySource({ source, rawText: '\ud801' });
  const other = await identifyLegacySource({ source: { ...source, origin: 'https://other.example' }, rawText: '\ud800' });
  expect(a.fingerprint).not.toBe(b.fingerprint); expect(a.markerKey).not.toBe(other.markerKey);
});
it('keeps the raw source available if fingerprinting is unavailable, without touching IndexedDB', async () => {
  const digest = vi.spyOn(crypto.subtle, 'digest').mockRejectedValue(new Error('SHA-256 unavailable'));
  const repository = new Proxy({} as LegacyMigrationRepository, { get: () => { throw Error('Database must not be used.'); } });
  try {
    const rawText = JSON.stringify(LABS[0]);
    const result = await migrateLegacyAutosave({ repository, storage: { getItem: () => rawText }, origin: source.origin });
    expect(result).toMatchObject({ status: 'failed', stage: 'fingerprint', original: { rawText }, diagnostic: { code: 'fingerprint-unavailable' } });
  } finally { digest.mockRestore(); }
});
it.each(['{"app":"netsim"}', '{bad', '', '\ud800', '\ud801', '\ufeffa', 'a\r\n🌐'])('exports and recovers the exact original string (%#)', raw => {
  const file = createLegacyRecoveryFile(raw); expect(readLegacyRecoveryFile(file)).toBe(raw);
  expect(file.encoding).toBe(raw.includes('\ud800') || raw.includes('\ud801') ? 'utf-16le' : 'utf-8');
});
describe('conservative legacy inspection', () => {
  it.each([...LABS, ...EXAMPLES.map(e => e.file)])('accepts known legacy documents without touching the original (%#)', topology => {
    const text = JSON.stringify(topology), result = inspectLegacyTopology(text);
    expect(result.ok, JSON.stringify(result)).toBe(true); expect(JSON.stringify(topology)).toBe(text);
  });
  it.each([
    ['{broken', 'invalid-json'],
    [JSON.stringify({ app: 'netsim', version: 2, devices: [], links: [] }), 'unsupported-version'],
    [JSON.stringify({ ...LABS[0], discarded: false }), 'lossy-document'],
    [JSON.stringify({ ...LABS[0], ui: { terminalAppearance: { intensity: 900 } } }), 'lossy-document'],
    [JSON.stringify({ ...LABS[0], ui: { cableColors: { absent: 'red' } } }), 'lossy-document'],
  ])('rejects unsupported or lossy conversions (%#)', (text, code) => {
    expect(inspectLegacyTopology(text)).toMatchObject({ ok: false, diagnostic: { code } });
  });
});
