import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const chromium = process.env.NETLAB_CHROMIUM_PATH ?? [
  'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome', '/opt/google/chrome/chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find(existsSync);

it.skipIf(!chromium)('validates normal async boot, migration, recovery and browser restart in a disposable profile', async () => {
  const script = fileURLToPath(new URL('../../scripts/test-application-boot.mjs', import.meta.url));
  const stdout = await new Promise<string>((resolve, reject) => execFile(process.execPath, [script], {
    cwd: fileURLToPath(new URL('../..', import.meta.url)), windowsHide: true, timeout: 150000, maxBuffer: 2 * 1024 * 1024,
    env: { ...process.env, NETLAB_CHROMIUM_PATH: chromium, NETLAB_BOOT_PUBLISH: '0' },
  }, (error, output, stderr) => output.includes('NETLAB_PROJECT_TEST_RESULTS=') ? resolve(output) : reject(Error(String(error ?? '') + output + stderr))));
  const report = JSON.parse(stdout.split('\n').find(line => line.startsWith('NETLAB_PROJECT_TEST_RESULTS='))!.slice('NETLAB_PROJECT_TEST_RESULTS='.length));
  expect(report.fatal).toBeNull(); expect(report.browserErrors).toEqual([]);
  const cases = Object.entries(report.results) as [string, { passed: boolean; error?: string }][];
  expect(cases.filter(([name]) => name.startsWith('boot-ui:')).length).toBeGreaterThanOrEqual(12);
  for (const [name, result] of cases) expect(result.passed, name + ': ' + result.error).toBe(true);
}, 160000);
