import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { FirewallInfo } from './FirewallInfo';

// Expose tooltip contents for semantic rendering tests; browser checks cover opening/focus.
vi.mock('./InfoTooltip', () => ({ InfoTooltip: ({ label, children }: { label: string; children: ReactNode }) => createElement('aside', { 'aria-label': label }, children) }));
it('explains the actual ruleset concepts in German without adding an editor', () => {
  const html = renderToStaticMarkup(createElement(FirewallInfo, { label: 'Firewall-Begriffe erklären', concepts: ['nftables', 'INPUT', 'OUTPUT', 'FORWARD', 'Quelle', 'Ziel'] }));
  for (const text of ['Linux-Firewall-System.', 'Pakete an dieses Gerät.', 'Pakete von diesem Gerät.',
    'Pakete, die durch das Gerät weitergeleitet werden.', 'Absenderadresse eines Pakets.', 'Empfängeradresse eines Pakets.']) expect(html).toContain(text);
  expect(html).not.toContain('Conntrack'); expect(html).not.toContain('<input');
});
it('can explain Conntrack separately without duplicating unrelated concepts', () => {
  const html = renderToStaticMarkup(createElement(FirewallInfo, { label: 'Conntrack erklären', concepts: ['Conntrack'] }));
  expect(html).toContain('Verfolgung von Netzwerkverbindungen.'); expect(html.match(/<dt>/g)).toHaveLength(1);
  expect(html).not.toContain('FORWARD');
});
