import { expect, it } from 'vitest';
import { parseDnsRecords } from './dnsRecords';
import { parseIp } from './engine/ip';

it.each(['\n', '\r\n', '\r'])('reads complete multiline DNS records with %j, whitespace and comments', newline => {
  const result = parseDnsRecords(['# hosts', ' 10.0.0.10 PC1.lan ', '', '10.0.0.20\tpc2.lan', ''].join(newline));
  expect(result.error).toBeUndefined();
  expect([...result.records!]).toEqual([['pc1.lan', parseIp('10.0.0.10')], ['pc2.lan', parseIp('10.0.0.20')]]);
});
it.each([
  '10.0.0.10 pc1.lan10.0.0.20 pc2.lan',
  '10.0.0.10 pc1.lan alias.lan', '10.0.0.10 pc1.lan # inline comment',
  '10.0.0.256 pc1.lan', '10.0.0.10', 'pc1.lan 10.0.0.10',
  '10.0.0.10 bad/name', '10.0.0.10 -bad.lan', '10.0.0.10 bad..lan',
  '10.0.0.10 ' + 'x'.repeat(64) + '.lan',
])('rejects the entire draft for an invalid line: %s', line => {
  const result = parseDnsRecords('10.0.0.1 valid.lan\n' + line);
  expect(result.records).toBeUndefined(); expect(result.error).toContain('Zeile 2');
});
it('rejects conflicting duplicates but accepts identical duplicates without data loss', () => {
  expect(parseDnsRecords('10.0.0.1 PC.lan\n10.0.0.2 pc.lan').error).toContain('widersprüchlich');
  expect(parseDnsRecords('10.0.0.1 PC.lan\n10.0.0.1 pc.lan').records?.size).toBe(1);
  expect(parseDnsRecords('# empty\n').records?.size).toBe(0);
});
