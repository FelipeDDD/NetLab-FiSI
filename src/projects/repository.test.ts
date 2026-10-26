import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { browserCases } from './repository.browser';
import { openProjectRepository } from './repository';
import { createProjectId, normalizeProjectDocument } from './projectDocument';

const chromium = process.env.NETLAB_CHROMIUM_PATH ?? [
  'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome', '/opt/google/chrome/chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find(existsSync);

it('reports IndexedDB unavailability without touching browser storage or boot', async () => {
  expect(await openProjectRepository({ factory: null })).toMatchObject({ ok: false, error: { code: 'unavailable' } });
});
it('rejects unsupported document versions at the persistent boundary', () => {
  expect(() => normalizeProjectDocument({ schemaVersion: 2, topology: {} })).toThrow('Unsupported project document');
});
afterEach(() => vi.unstubAllGlobals());
it('uses cryptographic UUIDs even when randomUUID is unavailable', () => {
  vi.stubGlobal('crypto', { getRandomValues: (bytes: Uint8Array) => bytes.fill(255) });
  expect(createProjectId()).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
});

// Native IDB is tested instead of introducing a mock database dependency. On CI
// without a browser, these cases are explicitly skipped; set the documented env
// var to make them run. The standalone script fails when no browser is available.
describe.skipIf(!chromium)('native IndexedDB in disposable Chromium', () => {
  let report: { results: Record<string, { passed: boolean; error?: string }>; fatal: string | null };
  beforeAll(async () => {
    const script = fileURLToPath(new URL('../../scripts/test-project-repository.mjs', import.meta.url));
    const stdout = await new Promise<string>((resolve, reject) => execFile(process.execPath, [script], {
      cwd: fileURLToPath(new URL('../..', import.meta.url)), env: { ...process.env, NETLAB_CHROMIUM_PATH: chromium },
      windowsHide: true, timeout: 110000, maxBuffer: 2 * 1024 * 1024,
    }, (error, output, stderr) => {
      if (output.includes('NETLAB_PROJECT_TEST_RESULTS=')) resolve(output);
      else reject(Error(String(error ?? '') + '\n' + output + '\n' + stderr));
    }));
    report = JSON.parse(stdout.split('\n').find(line => line.startsWith('NETLAB_PROJECT_TEST_RESULTS='))!.slice('NETLAB_PROJECT_TEST_RESULTS='.length));
    if (report.fatal) throw Error(report.fatal);
  }, 120000);
  it.each([...Object.keys(browserCases), 'real two-tab concurrency and deletion', 'migration: real two-tab migration and post-commit reload', 'workspace: real two-tab conflict and full browser restart', 'controller: F5 and full browser restart restore only the active simulation'])('%s', name => {
    const result = report.results[name];
    expect(result, 'Missing native browser result').toBeDefined();
    expect(result.passed, result.error).toBe(true);
  });
});
