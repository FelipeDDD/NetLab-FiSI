import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { TutorialCommand, TutorialText } from './TutorialCommand';

it('highlights command phrases without treating addresses, route output or ordinary ping prose as commands', () => {
  const html = renderToStaticMarkup(createElement(TutorialText, { children: 'Prüfen Sie ip route und ip addr. Der Ping erreicht 192.168.10.20/24.' }));
  expect(html.match(/class="guided-command"/g)).toHaveLength(2);
  expect(html).toContain('<span class="guided-command-syntax">route</span>');
  expect(renderToStaticMarkup(createElement(TutorialText, { children: '192.168.10.0/24 dev eth0 proto kernel scope link src 192.168.10.1' }))).not.toContain('guided-command');
  expect(renderToStaticMarkup(createElement(TutorialCommand, { children: 'ip route add <network/CIDR> via <next-hop>' }))).toContain('&lt;network/CIDR&gt;');
});

const syntax = (html: string) => [...html.matchAll(/<span class="guided-command-syntax">(.*?)<\/span>/g)].map(m => m[1]);
it.each([
  ['ip route add 192.168.30.128/25 via 10.0.23.2', ['ip', 'route', 'add', 'via']],
  ['ip route replace 192.168.20.0/24 via <next hop>', ['ip', 'route', 'replace', 'via']],
  ['ip address add 192.168.30.130/25 dev eth0', ['ip', 'address', 'add', 'dev']],
  ['ip route add default via <gateway>', ['ip', 'route', 'add', 'default', 'via']],
  ['ping -c 1 192.168.30.130', ['ping', '-c']],
  ['ip -4 route show', ['ip', '-4', 'route', 'show']],
  ['ip link set eth1 down', ['ip', 'link', 'set', 'down']],
  ['arp -n', ['arp', '-n']],
  ['<gateway> <next hop> <interface> <network/CIDR>', []],
] as const)('colors syntax only and preserves every argument in %s', (command, words) => {
  const html = renderToStaticMarkup(createElement(TutorialCommand, { children: command }));
  expect(syntax(html)).toEqual(words);
  expect(html.replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')).toBe(command);
});
it('uses the same formatting in prose and multiline examples without coloring labels or placeholders', () => {
  const html = renderToStaticMarkup(createElement(TutorialText, { children: 'Execute ip route add 192.168.30.128/25 via 10.0.23.2. Depois continue.' }));
  expect(syntax(html)).toEqual(['ip', 'route', 'add', 'via']);
  expect(html).toContain('192.168.30.128/25');
  expect(syntax(renderToStaticMarkup(createElement(TutorialCommand, { children: 'R1: ip route replace 192.168.20.0/24 via 10.0.13.2\nR3: ip route replace 192.168.10.0/24 via 10.0.13.1' })))).toEqual(['ip', 'route', 'replace', 'via', 'ip', 'route', 'replace', 'via']);
});
