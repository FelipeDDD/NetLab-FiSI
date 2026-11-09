import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { TutorialCommand, TutorialText } from './TutorialCommand';

it('highlights command phrases without treating addresses, route output or ordinary ping prose as commands', () => {
  const html = renderToStaticMarkup(createElement(TutorialText, { children: 'Prüfen Sie ip route und ip addr. Der Ping erreicht 192.168.10.20/24.' }));
  expect(html.match(/class="guided-command"/g)).toHaveLength(2);
  expect(html).toContain('<code class="guided-command">ip route</code>');
  expect(renderToStaticMarkup(createElement(TutorialText, { children: '192.168.10.0/24 dev eth0 proto kernel scope link src 192.168.10.1' }))).not.toContain('guided-command');
  expect(renderToStaticMarkup(createElement(TutorialCommand, { children: 'ip route add <network/CIDR> via <next-hop>' }))).toContain('&lt;network/CIDR&gt;');
});
