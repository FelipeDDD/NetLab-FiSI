import { expect, it } from 'vitest';
import { geometryFixture } from './geometry.fixture';
import { printPreset, type PrintPreset } from './options';
import { studioDiagram, studioLayout } from './diagram';
import { studioReport } from './report';
import { studioPage } from './page';
import { newRoutingBlock } from './routingBlocks';
import { createPageSession } from './pageLayouts';
import { saveStudioPresentation } from '../../studioPresentation';
import { restoreStudioPresentation } from './persistence';

const cases = (['de', 'en', 'pt-BR'] as const).flatMap(language =>
  (['clean', 'presentation', 'technical'] as const).flatMap(preset =>
    (['A4', 'A3'] as const).flatMap(paper =>
      (['portrait', 'landscape'] as const).map(orientation => ({ language, preset, paper, orientation })))));

it.each(cases)('keeps mandatory branding and custom text without automatic metadata: $language/$preset/$paper/$orientation', ({ language, preset, paper, orientation }) => {
  const snapshot = geometryFixture(), options = { ...printPreset(preset, snapshot), paper, orientation };
  options.title = 'Projeto <Felipe> & rede';
  options.subtitle = 'Subtítulo ä ö ü ç';
  options.footerNote = 'Autor: Felipe\nData escolhida: 07.11.2026';
  const svg = studioDiagram(snapshot, options, language), report = studioReport(snapshot, options, language);
  const body = report.html.slice(report.html.indexOf('<body>'));
  for (const content of [svg, body]) {
    expect(content).toContain('>NetLab-FiSI</text>');
    expect(content).toContain('>Topology Studio</text>');
    expect(content).toContain('Projeto &lt;Felipe&gt; &amp; rede');
    expect(content).toContain(options.subtitle);
    expect(content).toContain('Data escolhida: 07.11.2026');
    expect(content).not.toContain(snapshot.capturedAt);
    expect(content).not.toMatch(/Snapshot:|Aufnahme:|Captura:|A[34] (?:Portrait|Landscape|Hochformat|Querformat|Retrato|Paisagem)/);
  }
  expect(svg.match(/data-studio-branding=/g)).toHaveLength(1);
  expect(body.match(/data-studio-branding=/g)).toHaveLength(report.pages);
  expect(body.match(/data-footer-note=/g)).toHaveLength(1);
  expect(snapshot.capturedAt).toBe('2026-11-06T12:00:00.000Z');
});

it('retains the software signature with empty work fields and no diagram section', () => {
  const snapshot = geometryFixture(), options = printPreset('technical', snapshot);
  options.title = ''; options.subtitle = ''; options.sections.diagram.enabled = false;
  const report = studioReport(snapshot, options, 'en');
  expect(report.html.match(/data-studio-branding=/g)).toHaveLength(report.pages);
  expect(report.html).toContain('>Topology Studio</text>');
  expect(report.html).not.toContain(snapshot.capturedAt);
  expect(report.html).not.toContain('data-footer-note');
});

it('keeps capture metadata in the snapshot without making any geometry depend on its value', () => {
  const snapshot = geometryFixture();
  for (const preset of ['clean', 'technical', 'presentation'] as PrintPreset[]) {
    const options = printPreset(preset, snapshot);
    options.devicePositions.D = { x: 360, y: 450 };
    expect(studioLayout({ ...snapshot, capturedAt: 'another capture' }, options, 'en'))
      .toEqual(studioLayout(snapshot, options, 'en'));
  }
});

it('places optional work headings below fixed branding without moving manual centres or table anchors on edit', () => {
  const s = geometryFixture(), o = printPreset('clean', s);
  o.diagramScale = .3; o.devicePositions.A = { x: 340, y: 300 };
  o.routingBlocks = [{ ...newRoutingBlock(s.devices[0], 'a'), position: { x: 8, y: 100 } }];
  const before = studioLayout(s, o, 'en'); o.title = 'Long work heading '.repeat(8); o.subtitle = 'Subtitle';
  const after = studioLayout(s, o, 'en'), card = after.documentCards[after.boxes.findIndex(b => b.device.id === 'A')];
  expect(card.x + card.width / 2).toBeCloseTo(340); expect(card.y + card.height / 2).toBeCloseTo(300);
  expect(after.blocks[0].x).toBe(before.blocks[0].x); expect(after.blocks[0].y).toBe(before.blocks[0].y);
  expect(after.headingOverlap).toBe(true);
  expect(after.page.headingRects.every(r => r.y > after.page.ruleY)).toBe(true);
  expect(studioPage(s, printPreset('clean', s), 'en').headingRects).toEqual([]);
});

it('migrates only the former default title and retains custom text and every saved layout', () => {
  const s = geometryFixture(), o = printPreset('clean', s); o.title = 'NetLab-FiSI'; o.devicePositions.A = { x: 240, y: 300 };
  const saved = saveStudioPresentation(createPageSession(o), true);
  const restored = restoreStudioPresentation(saved, s, 'en');
  expect(restored.session.shared.title).toBe(''); expect(restored.session.layouts['A4-landscape']?.devicePositions).toEqual(o.devicePositions);
  saved.shared.title = 'Custom NetLab-FiSI project';
  expect(restoreStudioPresentation(saved, s, 'en').session.shared.title).toBe(saved.shared.title);
  expect(saved.shared.title).toBe('Custom NetLab-FiSI project');
});

it('does not pull a valid saved anchor inward when removing a long title enlarges cards', () => {
  const s = geometryFixture('vertical'), o = printPreset('technical', s);
  o.orientation = 'portrait'; o.title = 'A long work title '.repeat(9); o.devicePositions.A = { x: 15, y: 300 };
  for (const title of [o.title, '']) {
    const l = studioLayout(s, { ...o, title }, 'en'), rect = l.documentCards[l.boxes.findIndex(b => b.device.id === 'A')];
    expect(rect.x + rect.width / 2).toBeCloseTo(15); expect(rect.y + rect.height / 2).toBeCloseTo(300);
    expect(l.manualOutside).toBe(true);
  }
});
