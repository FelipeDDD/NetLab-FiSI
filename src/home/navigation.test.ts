import { expect, it, vi, afterEach } from 'vitest';
import { consumeHomeIntent, editorHref, readHomeIntent } from './navigation';
import { readRecentPlans } from './recentPlans';
const id = '00000000-0000-4000-8000-000000000001';
afterEach(() => vi.unstubAllGlobals());
it.each(['new', 'load', 'labs', 'exercises'] as const)('routes %s through an existing workspace intent', action => {
  expect(readHomeIntent(new URL(editorHref({ action }), 'https://test/base/'))).toEqual({ action });
  expect(editorHref()).toBe('./app.html');
});
it('passes only a stable project ID, never a name or a document', () => {
  expect(readHomeIntent(new URL(editorHref({ action: 'plan', id }), 'https://test/'))).toEqual({ action: 'plan', id });
  expect(readHomeIntent(new URL('https://test/app.html?home=plan&plan=hello'))).toBeNull();
  expect(readHomeIntent(new URL('https://test/app.html?home=delete'))).toBeNull();
});
it('consumes creation once, preserving unrelated URL preferences', () => {
  const location = { href: 'https://test/app.html?home=new&background=verde2#other' };
  const replaceState = vi.fn((_state, _unused, next) => { location.href = 'https://test' + next; });
  vi.stubGlobal('location', location); vi.stubGlobal('history', { state: { keep: 1 }, replaceState });
  expect(consumeHomeIntent()).toEqual({ action: 'new' }); expect(consumeHomeIntent()).toBeNull();
  expect(replaceState).toHaveBeenCalledWith({ keep: 1 }, '', '/app.html?background=verde2#other');
});
it('leaves Share Link handling to the existing guarded offer flow', () => {
  expect(readHomeIntent(new URL('https://test/app.html?home=new#t=shared'))).toBeNull();
});
it('reports unavailable storage without creating a replacement', async () => {
  const result = await readRecentPlans({ factory: null }); expect(result.ok).toBe(false);
});
