import { expect, it } from 'vitest';
import { geometryFixture } from './geometry.fixture';
import { printPreset } from './options';
import { studioDiagram } from './diagram';
import { studioReport, reportTables } from './report';
import { studioPage } from './page';
import { normalizeFooterNote } from './footerText';
import { activePageOptions, createPageSession } from './pageLayouts';
import { saveStudioPresentation } from '../../studioPresentation';
import { restoreStudioPresentation } from './persistence';

it('exports no fixed technical disclaimer in any language or preset while retaining selected technical tables', () => {
  const snap = geometryFixture();
  for (const language of ['en','de','pt-BR'] as const) for (const preset of ['clean','technical','presentation'] as const) {
    const options = printPreset(preset, snap), svg = studioDiagram(snap, options, language), html = studioReport(snap, options, language).html;
    expect(svg + html).not.toMatch(/Configuration snapshot|Konfigurationsaufnahme|Captura da configuração|Routes do not guarantee|Rotas não garantem/);
    if (preset === 'technical') { expect(reportTables(snap, options, language).length).toBeGreaterThan(5); expect(html).toContain('eth0'); expect(html).toContain('192.168.10.1'); }
  }
});

it('keeps empty notes absent and preserves three plain-text lines, escaped and above the printable content boundary', () => {
  const snap=geometryFixture(),o=printPreset('clean',snap),empty=studioPage(snap,o,'en');
  expect(studioDiagram(snap,o,'en')).not.toContain('data-footer-note'); o.footerNote='Netzwerkprojekt – DAA Bonn\nErstellt von: <Felipe>\nStand: 07.11.2026';
  expect(normalizeFooterNote(o.footerNote+'\nignored')).toBe(o.footerNote);
  for(const paper of ['A4','A3'] as const)for(const orientation of ['portrait','landscape'] as const){
    Object.assign(o,{paper,orientation}); const page=studioPage(snap,o,'en'),svg=studioDiagram(snap,o,'en');
    expect(page.footerLines).toEqual(o.footerNote.split('\n'));expect(page.footerOverflow).toBe(false);expect(page.area.y+page.area.height).toBeLessThan(page.height-60);
    expect(svg).toContain('&lt;Felipe&gt;');expect(svg).not.toContain('<Felipe>');expect(svg.match(/data-footer-line=/g)).toHaveLength(3);
    expect(studioReport(snap,o,'en').html).toContain(svg);
    const restored=restoreStudioPresentation(saveStudioPresentation(createPageSession(o),true),snap,'en');expect(activePageOptions(restored.session).footerNote).toBe(o.footerNote);
  }
  Object.assign(o,{paper:'A4',orientation:'landscape',footerNote:'   \n '});expect(studioPage(snap,o,'en').area).toEqual(empty.area);
});
it('places a custom note only on the final report page and retains structural page numbers and tables', () => {
  const snap=geometryFixture(),o=printPreset('technical',snap);o.footerNote='Author <script>plain</script>\nSecond\nThird';
  const r=studioReport(snap,o,'en');expect(r.pages).toBeGreaterThan(1);expect(r.html.match(/data-footer-note=/g)).toHaveLength(1);expect(r.html.indexOf('data-footer-note=')).toBeGreaterThan(r.html.lastIndexOf('<article'));
  expect(r.html).toContain(`${r.pages} / ${r.pages}`);expect(r.html).toContain('&lt;script&gt;plain&lt;/script&gt;');expect(reportTables(snap,o,'en').length).toBeGreaterThan(5);
});
it('reports footer overflow without silently shrinking fonts or accepting more than three logical lines', () => {
  const snap=geometryFixture(),o=printPreset('clean',snap);o.orientation='portrait';o.footerNote='W'.repeat(600);
  expect(studioPage(snap,o,'en').footerOverflow).toBe(true);expect(studioPage(snap,o,'en').footerLines).toHaveLength(3);
  expect(normalizeFooterNote('a\r\nb\rc\nd')).toBe('a\nb\nc');
});
