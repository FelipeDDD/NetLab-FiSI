import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const chromium = process.env.NETLAB_CHROMIUM_PATH ?? [
  'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome', '/opt/google/chrome/chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find(existsSync);
it.skipIf(!chromium)('preserves viewport through panels/browser zoom and keeps legacy/manual cable colors safe', async () => {
  const script = fileURLToPath(new URL('../../scripts/test-viewport.mjs', import.meta.url));
  const output = await new Promise<string>((resolve, reject) => execFile(process.execPath, [script], {
    cwd: fileURLToPath(new URL('../..', import.meta.url)), windowsHide: true, timeout: 180000, maxBuffer: 2 * 1024 * 1024,
    env: { ...process.env, NETLAB_CHROMIUM_PATH: chromium },
  }, (error, stdout, stderr) => stdout.includes('NETLAB_PROJECT_TEST_RESULTS=') ? resolve(stdout) : reject(Error(String(error ?? '') + stdout + stderr))));
  const report = JSON.parse(output.split('\n').find(line => line.startsWith('NETLAB_PROJECT_TEST_RESULTS='))!.slice('NETLAB_PROJECT_TEST_RESULTS='.length));
  expect(report.fatal).toBeNull(); expect(report.browserErrors).toEqual([]);
  expect(report.viewportReview.checks).toBeGreaterThanOrEqual(150);
  for (const [name, result] of Object.entries(report.results) as [string, { passed: boolean; error?: string }][]) expect(result.passed, name + ': ' + result.error).toBe(true);
}, 190000);
