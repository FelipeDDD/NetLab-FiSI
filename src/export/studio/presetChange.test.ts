import { expect, it } from 'vitest';
import { geometryFixture } from './geometry.fixture';
import { changePrintPreset, printPreset } from './options';
import { createPageSession } from './pageLayouts';
import { saveStudioPresentation } from '../../studioPresentation';
import { restoreStudioPresentation } from './persistence';
import { studioDiagram } from './diagram';

it('retains report selections, custom work and geometry across presets and JSON recovery', () => {
  const s = geometryFixture(), o = printPreset('technical', s);
  o.sections.services.enabled = true; o.sections.interfaces.deviceIds = ['A']; o.routeFilter = 'connected'; o.annotation = 'Technical note';
  o.title = 'Project'; o.names.A = 'Alias'; o.footerNote = 'Author'; o.devicePositions.A = { x: 300, y: 350 };
  const hidden = changePrintPreset(o, 'presentation', s);
  expect(hidden.sections.services.enabled).toBe(false); expect(hidden.names).toEqual(o.names); expect(hidden.title).toBe(o.title);
  expect(hidden.devicePositions).toEqual(o.devicePositions); expect(hidden.footerNote).toBe(o.footerNote);
  const saved = saveStudioPresentation(createPageSession(hidden), true), restored = restoreStudioPresentation(JSON.parse(JSON.stringify(saved)), s, 'en');
  const returned = changePrintPreset({ ...hidden, ...restored.session.shared, routingBlocks: [] }, 'technical', s);
  expect(returned.sections).toEqual(o.sections); expect(returned.routeFilter).toBe('connected'); expect(returned.annotation).toBe(o.annotation);
});

it('excludes inherited markings even in old Presentation settings without deleting their data', () => {
  const s = geometryFixture(); s.areas.push({ id: 'canvas', name: 'Original marking', color: '#256080', intensity: 18, rects: [{ x: 0, y: 0, width: 500, height: 500 }], title: { x: 12, y: 20 }, textSize: 18 });
  const original = structuredClone(s), o = printPreset('presentation', s); o.diagram.areas = true; o.areaOffset = { x: 12, y: 20 };
  const saved = saveStudioPresentation(createPageSession(o), true);
  expect(studioDiagram(s, o, 'en')).not.toContain('data-studio-area'); expect(s).toEqual(original);
  expect(saved.shared.diagram.areas).toBe(true); expect(saved.layouts['A4-landscape']?.areaOffset).toEqual(o.areaOffset);
  expect(printPreset('presentation', s).diagram.areas).toBe(false);
});
