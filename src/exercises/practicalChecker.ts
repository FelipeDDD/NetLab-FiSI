import type { Network } from '../engine/network';
import { IpDevice } from '../engine/ipdevice';
import { parseIp } from '../engine/ip';
import { serializeNetwork, type SaveFile } from '../engine/serialize';
import { runChecks, type CheckResult } from '../labs/checker';
import type { PracticalCriterion, PracticalExercise, StructurePolicy } from './practicalTypes';

function ordered(value:unknown):unknown {
  if(Array.isArray(value))return value.map(ordered);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,ordered(v)]));
  return value;
}
function protectedShape(file:SaveFile,policy:StructurePolicy) {
  const devices=file.devices.map(d=>{
    const {name:_name,x:_x,y:_y,...rest}=structuredClone(d),edit=policy.editable[d.id];
    // Layout, display names and transient runtime state are not assessment constraints.
    if(edit?.routes)rest.routes=[];
    else rest.routes.sort((a,b)=>JSON.stringify(ordered(a)).localeCompare(JSON.stringify(ordered(b))));
    rest.ifaces=rest.ifaces.map(i=>{
      if(edit?.gatewayIfaces?.includes(i.name))i.gateway=null;
      if(edit?.ipIfaces?.includes(i.name))i.ip=null;
      return i;
    }).sort((a,b)=>a.name.localeCompare(b.name));
    return rest;
  }).sort((a,b)=>a.id.localeCompare(b.id));
  const links=file.links.map(l=>({...l,a:l.a.join('/')<l.b.join('/')?l.a:l.b,b:l.a.join('/')<l.b.join('/')?l.b:l.a})).sort((a,b)=>a.id.localeCompare(b.id));
  return JSON.stringify(ordered({devices,links}));
}
/** Read-only comparison of permanent data, allowing only the published edit scope. */
export function structureMatches(initial:SaveFile,current:SaveFile,policy:StructurePolicy):boolean {
  return protectedShape(initial,policy)===protectedShape(current,policy);
}
export function passiveCriterion(net:Network,exercise:PracticalExercise,c:Exclude<PracticalCriterion,{kind:'engine'}>):CheckResult {
  let pass=false, suffix='';
  if(c.kind==='structure') {
    const current=serializeNetwork(net,{});
    pass=structureMatches(exercise.student.initialTopology,current,c.policy);
    if(!pass) {
      const expected=exercise.student.initialTopology;
      const differences=current.devices.filter(d=>{
        const old=expected.devices.find(o=>o.id===d.id);
        return !old||!structureMatches({...expected,devices:[old],links:[]},{...current,devices:[d],links:[]},c.policy);
      }).map(d=>d.id);
      differences.push(...expected.devices.filter(d=>!current.devices.some(n=>n.id===d.id)).map(d=>d.id));
      if(differences.length)suffix=` Betroffene Geräte: ${differences.join(', ')}.`;
      else suffix=' Prüfen Sie Kabelendpunkte, Kabelanzahl und Linkeinstellungen.';
    }
  } else {
    const device=net.devices.get(c.device),target=parseIp(c.target),via=c.via===null?null:parseIp(c.via);
    if(device instanceof IpDevice&&target!==null) {
      const route=device.lookupRoute(target);
      pass=!!route&&route.via===via&&route.ifaceName===c.iface;
    }
  }
  return {id:c.id,pass,detail:(pass?c.success:c.failure)+suffix};
}
/** Same sequential real-engine probes as existing Übungen; passive policies never write configuration. */
export function runPracticalChecks(net:Network,exercise:PracticalExercise,criteria:PracticalCriterion[],onResult:(r:CheckResult)=>void,onDone:()=>void,isActive:()=>boolean) {
  for(const c of criteria)if(c.kind!=='engine') {
    if(!isActive())return;
    onResult(passiveCriterion(net,exercise,c));
  }
  const engine=criteria.filter((c):c is Extract<PracticalCriterion,{kind:'engine'}>=>c.kind==='engine');
  runChecks(net,engine.map(c=>({id:c.id,label:c.label,check:c.check})),r=>{
    const c=engine.find(c=>c.id===r.id)!;
    onResult({...r,detail:r.pass?c.success:c.failure});
  },onDone,isActive);
}
