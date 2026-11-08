import { expect, it } from 'vitest';
import { geometryFixture } from './geometry.fixture';
import { printPreset } from './options';
import { makeCards } from './geometry';
import { newRoutingBlock, routingBlockContent } from './routingBlocks';
import { studioDiagram } from './diagram';
import { reportTables } from './report';

it.each([0,1,3,10])('measures only displayed content for %i routes, without a count footer',count=>{
  const snap=geometryFixture(),d=snap.devices.find(d=>d.id==='D')!,o=printPreset('clean',snap),block=newRoutingBlock(d,'table');o.routingBlocks.push(block);
  d.routes=Array.from({length:count},(_,i)=>({destination:`192.168.${i}.0`,prefix:24,via:'172.16.0.1',iface:'eth0',origin:'static'}));
  const c=routingBlockContent(snap,block,o,'en');expect(c.rows).toHaveLength(count);expect(c.count).toBe(`${count} / ${count} · Routing Tables`);
  expect(c.height).toBe(c.titleHeight+c.headerHeight+c.rows.reduce((n,r)=>n+r.height,0)+c.notice.length*(c.size+3)+(c.notice.length?10:0));
  const svg=studioDiagram(snap,o,'en');expect(svg).not.toContain(c.count);expect(svg).toContain('Routing Table');expect(svg).toContain('Destination');
  if(count===3)expect(c.height).toBeLessThan(120);
});

it.each([['en','Connected'],['de','Direkt'],['pt-BR','Conectado']] as const)('uses a short connected label in %s without changing real next hops', (language,label)=>{
  const snap=geometryFixture(),d=snap.devices.find(d=>d.id==='D')!,o=printPreset('clean',snap),b=newRoutingBlock(d,'t');
  d.routes=[{destination:'192.168.1.0',prefix:24,via:null,iface:'eth0',origin:'connected'},{destination:'0.0.0.0',prefix:0,via:'172.16.0.1',iface:'eth0',origin:'static'}];
  const c=routingBlockContent(snap,b,o,language);expect(c.rows[0].cells[1]).toEqual([label]);expect(c.rows[1].cells[1].join('')).toBe('172.16.0.1');
  b.filter='default';expect(routingBlockContent(snap,b,o,language).rows).toHaveLength(1);b.interfaceNames=['eth9'];expect(routingBlockContent(snap,b,o,language).rows).toHaveLength(0);
});

it('deduplicates only identical default forwarding pairs; keeps different interfaces, gateways and defaults explicit',()=>{
  const snap=geometryFixture(),d=snap.devices.find(d=>d.id==='D')!,o=printPreset('technical',snap);o.diagram.gateways=true;
  d.interfaces[0].gateway='172.16.0.1';d.interfaces[1].gateway='172.16.0.1';d.interfaces[2].gateway='172.16.0.9';
  d.routes=[{destination:'0.0.0.0',prefix:0,via:'172.16.0.1',iface:'eth0',origin:'interface'},
    {destination:'0.0.0.0',prefix:0,via:'172.16.0.1',iface:'eth0',origin:'static'},
    {destination:'0.0.0.0',prefix:0,via:'172.16.0.2',iface:'eth0',origin:'static'},
    {destination:'0.0.0.0',prefix:0,via:'172.16.0.1',iface:'eth1',origin:'static'},
    {destination:'10.0.0.0',prefix:8,via:'172.16.0.9',iface:'eth2',origin:'static'}];
  const original=structuredClone(snap),tables=reportTables(snap,o,'en'),footer=makeCards(snap,o,'Gateway').find(c=>c.device.id==='D')!.footer.join('');
  expect(footer).not.toContain('Gateway eth0');expect(footer).not.toContain('Gateway eth1');expect(footer).toContain('Gateway: 172.16.0.9 (eth2)');
  expect(footer.match(/172\.16\.0\.1 \(eth0\)/g)).toHaveLength(1);expect(footer).toContain('172.16.0.2 (eth0)');expect(footer).toContain('172.16.0.1 (eth1)');
  expect(reportTables(snap,o,'en')).toEqual(tables);expect(snap).toEqual(original);
});

it('does not manufacture a default for a standalone interface gateway or a specific static route',()=>{
  const snap=geometryFixture(),d=snap.devices.find(d=>d.id==='D')!,o=printPreset('technical',snap);o.diagram.gateways=true;
  d.interfaces[0].gateway='172.16.0.1';d.routes=[{destination:'10.0.0.0',prefix:8,via:'172.16.0.1',iface:'eth0',origin:'static'}];
  const card=()=>makeCards(snap,o,'Gateway').find(c=>c.device.id==='D')!;expect(card().footer.join('')).toBe('Gateway: 172.16.0.1 (eth0)');
  d.interfaces[0].gateway=null;expect(card().footer).toEqual([]);o.diagram.gateways=false;expect(card().footer).toEqual([]);
});
