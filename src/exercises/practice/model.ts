/** Selective learner adapters. No authored catalog, network factory, store or persistence imports. */
import { generate, type Recipe } from '../factory/generator';
import { facts, grade, prefixForMask, requiredHosts, solve, type MathProblem } from '../factory/math';
import { diagnose } from '../factory/cidr';
import { createGatewayV2, gatewayV2Result, type GatewayV2Problem } from './gatewayV2';

export const PRACTICE_KINDS = ['gateway', 'subnet', 'vlsm'] as const;
export type PracticeKind = typeof PRACTICE_KINDS[number];
export interface Field { id:string; label:string; type:'ipv4'|'prefix'|'mask'|'integer'|'cidr'|'choice'; options?:{value:string;label:'yes'|'no'|'unknown'}[] }
export interface Question {
  id:string; kind:PracticeKind; contentVersion:1|2; recipe:Recipe;
  title:string; task:string; data:string[]; fields:Field[]; problem:MathProblem|GatewayV2Problem;
}
export type Answers = Record<string,string>;
export interface FieldResult { state:'correct'|'incorrect'|'missing'; explanation:string }
export interface Evaluation { pass:boolean; fields:Record<string,FieldResult> }
const choices:Field['options']=[{value:'yes',label:'yes'},{value:'no',label:'no'},{value:'unknown',label:'unknown'}];
export function createQuestion(kind:PracticeKind, seed='reference', difficulty:Recipe['difficulty']='beginner', version=1):Question {
  if(kind==='gateway'&&version===2)return createGatewayV2(seed,difficulty);
  if(!PRACTICE_KINDS.includes(kind)) throw Error('Unbekannte Kategorie');
  const recipe:Recipe={family:kind==='gateway'?'cidr':kind,difficulty,seed,version,...(kind==='gateway'?{scenario:'gateway' as const}:{})};
  const generated=generate(recipe); // validates recipe and keeps the generator contract authoritative.
  const problem:MathProblem=kind==='gateway'&&seed==='reference'?{family:'cidr',mode:'diagnosis',cases:[{
    id:'gateway',a:'192.168.99.60/16',b:'192.168.9.20/16',gatewayA:'192.168.9.1',layer2:'unknown',routedPath:'unknown',
  }]}:generated.problem;
  const base={kind,contentVersion:1 as const,recipe:generated.recipe,problem,
    id:JSON.stringify(['practice',kind,1,version,difficulty,generated.recipe.scenario??null,seed])};
  if(problem.family==='cidr'&&problem.mode==='diagnosis') {
    const c=problem.cases[0];
    return {...base,title:'E02 · Gateway und Subnetz',task:'Liegt das Gateway im selben Subnetz wie der PC?',
      data:[`PC: ${c.a}`,`Gateway: ${c.gatewayA}`],fields:[{id:'local',label:'Gateway im selben Subnetz?',type:'choice',options:choices}]};
  }
  if(problem.family==='subnet') {
    return {...base,title:'A · Netz und Broadcast',task:'Bestimmen Sie Netzadresse, Broadcast und Anzahl nutzbarer Hosts. Netz und Broadcast zählen nicht als Hosts.',
      data:[`IPv4: ${problem.ip}/${problem.prefix}`],fields:[{id:'network',label:'Netzadresse',type:'ipv4'},{id:'broadcast',label:'Broadcast',type:'ipv4'},{id:'hosts',label:'Nutzbare Hosts',type:'integer'}]};
  }
  if(problem.family!=='vlsm') throw Error('Nicht unterstützte Aufgabenform');
  return {...base,title:'B · VLSM planen',task:'Ordnen Sie jedem Bedarf das kleinste ausreichende Subnetz zu. Die Netze müssen im Stammnetz liegen, ausgerichtet sein und dürfen sich nicht überschneiden. Andere gültige Anordnungen sind erlaubt.',
    data:[`Stammnetz: ${problem.parent}`,`Feste Reservierungen: ${problem.reserved.join(', ')||'keine'}`,...problem.demands.map(d=>`${d.label}: ${d.hosts} Hosts${d.growthPercent?` + ${d.growthPercent}% Wachstum`:''}${d.purpose==='future'?' (Reserve)':''}`)],
    fields:problem.demands.map(d=>({id:d.id,label:`${d.label} · Netz/CIDR`,type:'cidr'}))};
}
export function solution(q:Question):Answers {
  if(q.problem.family==='gateway-v2')return {local:gatewayV2Result(q.problem).answer};
  if(q.problem.family==='cidr'&&q.problem.mode==='diagnosis') {
    const r=diagnose(q.problem.cases[0]);
    return {local:['in-subnet','unusable'].includes(r.gatewayA)?'yes':'no'};
  }
  if(q.problem.family==='vlsm') return Object.fromEntries((solve(q.problem) as {id:string;cidr:string}[]).map(r=>[r.id,r.cidr]));
  const expected=solve(q.problem) as Record<string,unknown>;
  return Object.fromEntries(q.fields.map(f=>[f.id,String(expected[f.id])]));
}
function normalized(field:Field,value:string):string {
  const v=value.trim();
  if(field.type==='integer'&&/^\d+$/.test(v)) return String(Number(v));
  if(field.type==='prefix') return String(/^\/?\d+$/.test(v)?Number(v.replace('/','')):prefixForMask(v));
  if(field.type==='mask'&&/^\/\d+$/.test(v)) return facts('0.0.0.0'+v).mask;
  return v;
}
export function evaluate(q:Question,answers:Answers):Evaluation {
  const expected=solution(q), fields:Evaluation['fields']={};
  for(const f of q.fields) {
    const raw=answers[f.id]??'';
    if(!raw.trim()) {fields[f.id]={state:'missing',explanation:''};continue;}
    let pass=false, explanation='';
    try {
      if(q.problem.family==='vlsm') {
        const demand=q.problem.demands.find(d=>d.id===f.id)!;
        const checked=grade({...q.problem,demands:[demand]},[{id:f.id,cidr:raw.trim()}]);
        pass=checked.pass;
        explanation=pass?`Die Zuordnung erfüllt den Bedarf von ${requiredHosts(demand)} Hosts und die Grenzen des Stammnetzes.`:checked.issues.join(' ');
      } else {
        pass=normalized(f,raw)===expected[f.id];
        if(q.problem.family==='gateway-v2') {
          explanation=gatewayV2Result(q.problem).explanation;
        } else if(q.problem.family==='cidr'&&q.problem.mode==='diagnosis') {
          const c=q.problem.cases[0], r=diagnose(c);
          explanation=`PC-Netz: ${r.a.network}/${r.a.prefix}, Maske ${r.a.mask}, Broadcast ${r.a.broadcast}. ${expected.local==='yes'?'Das Gateway gehört rechnerisch zu diesem Netz.':'Das Gateway liegt außerhalb dieses Netzes.'} ${r.gatewayA==='unusable'?'Es ist jedoch keine nutzbare Gateway-Hostadresse. ':''}Die tatsächliche Erreichbarkeit ist ohne Layer-2- und Routinginformationen nicht eindeutig bestimmbar.`;
        } else if(q.problem.family==='subnet') {
          const n=solve(q.problem) as ReturnType<typeof facts>;
          explanation=`/${n.prefix} (${n.mask}) umfasst ${n.addresses} Adressen: ${n.network} bis ${n.broadcast}. Abzüglich Netz und Broadcast bleiben ${n.hosts} nutzbare Hosts.`;
        }
      }
    } catch { explanation='Bitte eine gültige Eingabe im angegebenen Format verwenden.'; }
    fields[f.id]={state:pass?'correct':'incorrect',explanation};
  }
  if(q.problem.family==='vlsm') {
    const valid=q.fields.filter(f=>fields[f.id].state==='correct');
    const pairs=valid.length<2?[]:(solve({family:'overlap',networks:valid.map(f=>answers[f.id].trim())}) as {pairs:string[]}).pairs;
    for(const pair of pairs) for(const index of pair.split(':').map(Number)) fields[valid[index-1].id]={state:'incorrect',explanation:'Diese Zuordnung überschneidet sich mit einem anderen eingegebenen Netz.'};
  }
  return {pass:Object.values(fields).every(f=>f.state==='correct'),fields};
}
