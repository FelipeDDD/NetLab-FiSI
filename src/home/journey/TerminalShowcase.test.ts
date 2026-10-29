import { expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { terminalIntroPhase, TerminalShowcase, TERMINAL_EXAMPLES, TERMINAL_INTRO_MS } from './TerminalShowcase';

it('types help before revealing command lines and then stays complete', () => {
  expect([0,600,750,900,1050,1500,2000,2500,TERMINAL_INTRO_MS,99999].map(terminalIntroPhase)).toEqual([0,1,2,3,4,5,6,7,7,7]);
});
it('renders both readable OS examples without a terminal interpreter', () => {
  const html = renderToStaticMarkup(createElement(TerminalShowcase));
  expect(html).toContain('Linux'); expect(html).toContain('Windows'); expect(html).toContain('aria-label="help"');
  for (const list of Object.values(TERMINAL_EXAMPLES)) for (const command of list) expect(html).toContain(command.replace('<','&lt;').replace('>','&gt;'));
  expect(html).not.toContain('xterm'); expect(html).not.toContain('contenteditable');
});
