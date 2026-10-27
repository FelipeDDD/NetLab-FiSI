import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import App from './App';

const state = vi.hoisted(() => ({ selected: 'host-1' as string | null, packetInspectorOpen: false, terminals: [] }));
vi.mock('./store', () => ({ useStore: (select: (s: typeof state) => unknown) => select(state) }));
vi.mock('@xyflow/react', () => ({ ReactFlowProvider: ({ children }: { children: ReactNode }) => children }));
vi.mock('./components/Toolbar', () => ({ Toolbar: () => null }));
vi.mock('./components/PacketAnimationControl', () => ({ PacketAnimationControl: () => null }));
vi.mock('./components/Flow', () => ({ Flow: () => createElement('span', null, 'Canvas mounted') }));
vi.mock('./components/Palette', () => ({ Palette: () => createElement('aside', { className: 'palette' }) }));
vi.mock('./components/LabPanel', () => ({ LabPanel: () => null }));
vi.mock('./components/TerminalDock', () => ({ TerminalDock: () => createElement('span', null, 'Dock mounted') }));
vi.mock('./components/Inspector', () => ({ Inspector: ({ hidden = false }: { hidden?: boolean }) => createElement('aside', { hidden }, 'Device Inspector mounted') }));
vi.mock('./components/ResizableInspector', () => ({ ResizableInspector: ({ children, hidden, side }: { children: ReactNode; hidden: boolean; side: string }) => createElement('div', { hidden, 'data-side': side }, children) }));
vi.mock('./components/PacketInspector', () => ({ PacketInspector: () => state.packetInspectorOpen ? createElement('aside', null, 'Packets mounted') : null }));

it('shows the same device Inspector with Packets and restores the normal side when closed', () => {
  const render = () => renderToStaticMarkup(createElement(App));
  state.packetInspectorOpen = false; let html = render();
  expect(html).toContain('data-side="right"');
  state.packetInspectorOpen = true; html = render();
  expect(html).toContain('is-analyzing-packets has-device-inspector'); expect(html).toContain('data-side="left"');
  for (const text of ['Device Inspector mounted', 'Packets mounted', 'Canvas mounted', 'Dock mounted']) expect(html).toContain(text);
  expect(html).not.toContain('hidden=""');
  expect(html.match(/Device Inspector mounted/g)).toHaveLength(1);
  state.packetInspectorOpen = false; expect(render()).toContain('data-side="right"');
});
it('keeps analysis available before any device is selected', () => {
  state.selected = null; state.packetInspectorOpen = true;
  const html = renderToStaticMarkup(createElement(App));
  expect(html).toContain('is-analyzing-packets'); expect(html).not.toContain('has-device-inspector');
  expect(html).toContain('Packets mounted'); expect(html).toContain('Canvas mounted'); expect(html).not.toContain('Device Inspector mounted');
});
