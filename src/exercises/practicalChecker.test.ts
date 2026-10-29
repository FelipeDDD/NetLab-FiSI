import { describe,expect,it } from 'vitest';
import { AVAILABLE_EXERCISES,PRACTICAL_EXERCISES,practicalChecks } from './beta';
import { PRACTICAL_STUDENTS,PRACTICAL_RULES,PRACTICAL_SOURCES } from './practicalPublication';
import { restoreNetwork,serializeNetwork,type SaveFile } from '../engine/serialize';
import { disposeNetwork } from '../engine/networkLifecycle';
import { runPracticalChecks,structureMatches } from './practicalChecker';
import type { CheckResult } from '../labs/checker';

const exercise=(code:string)=>PRACTICAL_EXERCISES.find(e=>e.id===`pilot-${code}-v1`)!;
const reference=(code:string)=>structuredClone(PRACTICAL_SOURCES[exercise(code).id].review.reference.topology);
function check(code:string,file:SaveFile) {
  const e=exercise(code),net=restoreNetwork(structuredClone(file)),results:CheckResult[]=[];
  try {
    const before=serializeNetwork(net,{});let done=false;
    runPracticalChecks(net,e,practicalChecks[e.id],r=>results.push(r),()=>{done=true;},()=>true);
    net.scheduler.advanceTo(net.scheduler.now+120_000);
    expect(done).toBe(true);expect(results).toHaveLength(practicalChecks[e.id].length);
    expect(serializeNetwork(net,{})).toEqual(before); // No configuration writes, even when a check fails.
    return results;
  }finally {disposeNetwork(net);}
}
it('publishes only four explicit, solution-free projections with every technical requirement covered',()=>{
  expect(AVAILABLE_EXERCISES).toHaveLength(6);
  expect(PRACTICAL_EXERCISES).toEqual(PRACTICAL_STUDENTS);expect(practicalChecks).toEqual(PRACTICAL_RULES);
  expect(PRACTICAL_EXERCISES.map(e=>e.id)).toEqual(['pilot-e06-v1','pilot-e08-v1','pilot-e09-v1','pilot-d02-v1']);
  expect(JSON.stringify(PRACTICAL_EXERCISES)).not.toMatch(/"review"|"reference"|"commands"|"alternatives"/);
  for(const e of PRACTICAL_EXERCISES) {
    expect(e.manualReview.join(' ')).toContain('nicht automatisch');
    expect(new Set(practicalChecks[e.id].map(c=>c.id)).size).toBe(practicalChecks[e.id].length);
    for(const r of e.student.requirements)expect(practicalChecks[e.id].some(c=>c.requirementId===r.id)).toBe(true);
  }
});
describe.each(['e06','e08','e09','d02'])('%s real-engine pilot',code=>{
  it('distinguishes initial state and reference, preserves config and supports JSON restoration',()=>{
    const initial=check(code,exercise(code).student.initialTopology);
    expect(initial.every(r=>r.pass)).toBe(code==='e06');
    expect(initial.find(r=>r.id==='preserve-structure')?.pass).toBe(true);
    const solved=reference(code);expect(check(code,solved).filter(r=>!r.pass)).toEqual([]);
    expect(check(code,JSON.parse(JSON.stringify(solved))).filter(r=>!r.pass)).toEqual([]);
  });
  it('does not grade by names/positions or accept forbidden changes just because pings pass',()=>{
    const file=reference(code);file.devices.forEach(d=>{d.name='診断 Büro';d.x+=37;d.y-=50;});
    expect(check(code,file).every(r=>r.pass)).toBe(true);
    file.devices[0].services={tcp:[12345],udp:[]};
    const results=check(code,file);expect(results.filter(r=>r.id.startsWith('ping-')).every(r=>r.pass)).toBe(true);
    expect(results.find(r=>r.id==='preserve-structure')?.pass).toBe(false);
  });
  it('rejects changed link endpoints, VLAN, port count and interface administrative state',()=>{
    const e=exercise(code),policy=practicalChecks[e.id].find(c=>c.kind==='structure')!;
    if(policy.kind!=='structure')throw Error('missing policy');
    for(const change of ['link','vlan','port','admin']) {
      const file=structuredClone(e.student.initialTopology);
      if(change==='link')file.links[0].a[1]='eth9';
      if(change==='vlan')file.devices[0].vlans={eth0:20};
      if(change==='port')file.devices[0].ifaces.push({...file.devices[0].ifaces[0],name:'eth9'});
      if(change==='admin')file.devices[0].ifaces[0].up=false;
      expect(structureMatches(e.student.initialTopology,file,policy.policy),change).toBe(false);
    }
  });
});
it('accepts E08 target-route and IPv4-form gateway alternatives, without hardcoding a default route',()=>{
  for(const method of ['target','iface']) {
    const f=reference('e08'),a=f.devices.find(d=>d.id==='a')!;
    if(method==='target')a.routes[0].dest='192.168.11.0/24';
    else {a.routes=[];a.ifaces[0].gateway='192.168.10.1';}
    expect(check('e08',f).filter(r=>!r.pass)).toEqual([]);
  }
});
it('accepts D02 defaults or specific routes; missing return route cannot pass',()=>{
  const f=reference('d02');for(const id of ['west','east'])f.devices.find(d=>d.id===id)!.routes[0].dest='0.0.0.0/0';
  expect(check('d02',f).filter(r=>!r.pass)).toEqual([]);
  f.devices.find(d=>d.id==='east')!.routes=[];
  const results=check('d02',f);expect(results.find(r=>r.id==='route-1')?.pass).toBe(false);
  expect(results.filter(r=>r.id.startsWith('ping-')).some(r=>!r.pass)).toBe(true);
});
it('requires the intended E09 mask even if a host route would make the ping succeed',()=>{
  const f=reference('e09'),a=f.devices.find(d=>d.id==='a')!;
  a.ifaces[0].ip='192.168.10.50/16';a.routes.unshift({dest:'192.168.11.60/32',via:'192.168.10.1',dev:'eth0'});
  const results=check('e09',f);
  expect(results.find(r=>r.id==='ip-a-eth0')?.pass).toBe(false);expect(results.find(r=>r.id==='preserve-structure')?.pass).toBe(false);
  expect(results.filter(r=>r.id.startsWith('ping-')).every(r=>r.pass)).toBe(true);
});
