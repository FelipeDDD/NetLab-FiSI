import { expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StudioBlocksPanel } from './StudioBlocksPanel';
import { geometryFixture } from './geometry.fixture';
import { printPreset } from './options';
import { studioDiagram, studioLayout } from './diagram';
import { reportTables, studioReport } from './report';
import { newRoutingBlock } from './routingBlocks';
import { studioMessages } from './messages';

it.each(['de','en','pt-BR'] as const)('keeps %s table controls and nonempty disclosure without the explanatory paragraphs',language=>{
  const snapshot=geometryFixture(),options=printPreset('technical',snapshot);
  options.routingBlocks=['A','D'].map(id=>newRoutingBlock(snapshot.devices.find(d=>d.id===id)!,id));
  const before=structuredClone(options),layout=studioLayout(snapshot,options,language);
  const html=renderToStaticMarkup(createElement(StudioBlocksPanel,{snapshot,options,layout,language,onChange:()=>{}}));
  expect(html).toContain(studioMessages[language].blockHelp);
  expect(html).toMatch(/<details[^>]*data-studio-block-controls[^>]*open=""/);
  expect(html).toContain('data-studio-reset-blocks');expect(html.match(/data-studio-block-settings=/g)).toHaveLength(2);
  for(const control of ['data-block-device-select','data-block-filter','data-block-width','data-block-x','data-block-y','data-block-scale-select','data-block-reset-size','data-block-remove'])expect(html.match(new RegExp(control+'=', 'g'))).toHaveLength(2);
  expect(html).not.toContain('class="studio-note"');expect(options).toEqual(before);
});

it.each(['clean','technical','presentation'] as const)('%s documents opt out locally while preserving printable data and SVG colours',preset=>{
  const snapshot=geometryFixture(),options=printPreset(preset,snapshot),before=structuredClone(snapshot);
  const tables=reportTables(snapshot,options,'de'),svg=studioDiagram(snapshot,options,'de'),report=studioReport(snapshot,options,'de',svg);
  expect(report.html).toMatch(/html\s*\{[^}]*color-scheme:\s*only light/);
  expect(svg).toContain('style="color-scheme:only light"');expect(svg).toContain('fill="#fff"');
  expect(report.html).not.toContain('filter:invert');expect(report.html).not.toContain('forced-color-adjust:none');
  expect(reportTables(snapshot,options,'de')).toEqual(tables);expect(snapshot).toEqual(before);
  expect(report.html.match(/data-print-page="/g)).toHaveLength(report.pages);
});
