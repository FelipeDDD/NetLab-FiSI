import { describe, expect, it } from 'vitest';
import { restoreNetwork, serializeNetwork, type SaveFile } from '../../engine/serialize';
import { disposeNetwork } from '../../engine/networkLifecycle';
import { runChecks, type CheckResult } from '../../labs/checker';
import { CIDR_PRACTICE } from './cidrNetworks';
import { device, referenceAddressIssues, setAddress } from './networkTools';
import type { NetworkDraft } from './types';

function probes(d:NetworkDraft,file:SaveFile) {
  const net=restoreNetwork(structuredClone(file));
  try {
    const results:CheckResult[]=[];let done=false;
    const checks=d.review.assessments.flatMap(a=>a.kind==='engine'?[{id:a.id,label:a.id,check:a.check}]:[]);
    runChecks(net,checks,r=>results.push(r),()=>{done=true;});
    net.scheduler.advanceTo(net.scheduler.now+120_000);
    expect(done).toBe(true);expect(results).toHaveLength(checks.length);
    return results;
  } finally {disposeNetwork(net);}
}
const pingFailures=(d:NetworkDraft,f:SaveFile)=>probes(d,f).filter(r=>r.id.startsWith('ping-')&&!r.pass);
describe.each(Object.entries(CIDR_PRACTICE))('%s real-engine practice',(id,d)=>{
  it('runs the reference with bidirectional ICMP and configuration checks',()=>{
    expect(referenceAddressIssues(d.review.reference.topology)).toEqual([]);
    expect(probes(d,d.review.reference.topology).filter(r=>!r.pass)).toEqual([]);
  });
  it('distinguishes a healthy initial topology from a real initial fault',()=>{
    const failures=pingFailures(d,d.student.initialTopology);
    if(['e01','e06'].includes(id)) {expect(failures).toEqual([]);expect(d.review.reference.topology).toEqual(d.student.initialTopology);}
    else expect(failures.length).toBeGreaterThan(0);
  });
  it('preserves interfaces, links, masks and VLANs through JSON export and restore',()=>{
    for(const f of [d.student.initialTopology,d.review.reference.topology]) {
      const net=restoreNetwork(JSON.parse(JSON.stringify(f)));
      try {
        const saved=serializeNetwork(net,{});
        expect(saved.links.map(l=>[l.id,l.a,l.b])).toEqual(f.links.map(l=>[l.id,l.a,l.b]));
        expect(saved.devices.map(d=>[d.id,d.vlans,d.routes,d.ifaces.map(i=>[i.name,i.ip])])).toEqual(f.devices.map(d=>[d.id,d.vlans,d.routes,d.ifaces.map(i=>[i.name,i.ip])]));
        expect(probes(d,saved).map(r=>r.pass)).toEqual(probes(d,f).map(r=>r.pass));
      } finally {disposeNetwork(net);}
    }
  });
  it('does not depend on editable display names',()=>{
    const f=structuredClone(d.review.reference.topology);f.devices.forEach(d=>d.name='Änderung 日本語');
    expect(probes(d,f).every(r=>r.pass)).toBe(true);
  });
});
it('widening both client masks does not repair a VLAN split',()=>{
  const d=CIDR_PRACTICE.e05,f=structuredClone(d.student.initialTopology);
  setAddress(f,'a',0,'192.168.10.50/16');setAddress(f,'b',0,'192.168.11.60/16');
  expect(pingFailures(d,f).length).toBe(2);
  expect(d.review.assessments.some(a=>a.kind==='manual')).toBe(true);
});
it('accepts a functional target route alternative without enforcing a fixed default-route string',()=>{
  const d=CIDR_PRACTICE.e08,f=structuredClone(d.review.reference.topology);
  device(f,'a').routes[0].dest='192.168.11.0/24';
  expect(probes(d,f).every(r=>r.pass)).toBe(true);
  device(f,'b').routes=[];
  expect(pingFailures(d,f).length).toBeGreaterThan(0);
});
it('does not let a single company repair hide the second fault or damage healthy paths',()=>{
  const d=CIDR_PRACTICE.e12,maskOnly=structuredClone(d.student.initialTopology),gatewayOnly=structuredClone(d.student.initialTopology);
  setAddress(maskOnly,'a',0,'10.60.0.10/22');
  device(gatewayOnly,'b').routes[0].via='10.60.4.1';
  for(const f of [maskOnly,gatewayOnly]) {
    const results=probes(d,f).filter(r=>r.id.startsWith('ping-'));
    expect(results.some(r=>r.pass)).toBe(true);expect(results.some(r=>!r.pass)).toBe(true);
  }
  const off=structuredClone(d.review.reference.topology);device(off,'r').forwarding=false;
  expect(pingFailures(d,off).length).toBeGreaterThan(0);
});
