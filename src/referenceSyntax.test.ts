import { expect, it } from 'vitest';
import { syntaxParameterHints, tokenizeSyntax } from './referenceSyntax';
import { TERMINAL_REFERENCE } from './terminalReference';

it('preserves every character while identifying values, alternatives and optional delimiters', () => {
  const syntax = 'ip route add <zielnetz/CIDR> via <gateway> [dev <interface>]';
  const parts = tokenizeSyntax(syntax);
  expect(parts.map(part => part.text).join('')).toBe(syntax);
  expect(parts.filter(part => part.kind === 'value').map(part => part.text)).toEqual(['<zielnetz/CIDR>', '<gateway>', '<interface>']);
  expect(parts.filter(part => part.kind === 'optional').map(part => part.text)).toEqual(['[', ']']);
  expect(tokenizeSyntax('sysctl -w net.ipv4.ip_forward=0|1')).toContainEqual({ text: '0|1', kind: 'value' });
  expect(tokenizeSyntax('ipconfig /renew [adapter]')).toContainEqual({ text: 'adapter', kind: 'value' });
  expect(tokenizeSyntax('ip route show')).toEqual([{ text: 'ip route show', kind: 'literal' }]);
  for (const entry of TERMINAL_REFERENCE) for (const operation of entry.operations)
    expect(tokenizeSyntax(operation.syntax).map(part => part.text).join('')).toBe(operation.syntax);
});

it('provides useful explanations for relevant inputs without inventing command behavior', () => {
  const hints = syntaxParameterHints('ip route add <zielnetz/CIDR> via <gateway> [dev <interface>]');
  expect(hints.join(' ')).toContain('nächsten Routers');
  expect(hints.join(' ')).toContain('lokale Schnittstelle');
  expect(hints.join(' ')).toContain('optional');
  expect(syntaxParameterHints('sysctl -w net.ipv4.ip_forward=0|1').join(' ')).toContain('0 = Weiterleitung deaktivieren');
  expect(syntaxParameterHints('ip route show')).toEqual([]);
});
