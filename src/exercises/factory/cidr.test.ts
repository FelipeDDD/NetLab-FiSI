import { describe, expect, it } from 'vitest';
import { generate, CIDR_SCENARIOS } from './generator';
import { grade, solve } from './math';
import { diagnose, type CidrCase, type CidrProblem } from './cidr';
import { CIDR_DRAFTS } from './cidrDrafts';
import { validateFactory } from './validate';

// Independent oracle: bit masks and exhaustive possible-world evaluation.
// No production subnet, facts, diagnose or solve calls inside the oracle.
const int=(ip:string)=>ip.split('.').reduce((n,s)=>(n<<8n)|BigInt(s),0n);
const dotted=(n:bigint)=>[24n,16n,8n,0n].map(s=>(n>>s)&255n).join('.');
function oracle(cidr:string) {
  const [ip,p]=cidr.split('/'), prefix=Number(p), hostMask=(1n<<BigInt(32-prefix))-1n;
  const mask=0xffffffffn^hostMask,start=int(ip)&mask,end=start|hostMask;
  return {network:dotted(start),broadcast:dotted(end),prefix,mask:dotted(mask),first:dotted(start+1n),last:dotted(end-1n),addresses:Number(hostMask+1n),hosts:Number(hostMask-1n)};
}
const inside=(ip:string,cidr:string,host=false)=>{
  const f=oracle(cidr), n=int(ip),start=int(f.network),end=int(f.broadcast);
  return host?n>start&&n<end:n>=start&&n<=end;
};
function independent(c:CidrCase) {
  const own=[c.a,c.b], ips=own.map(s=>s.split('/')[0]), local=own.map((s,i)=>inside(ips[1-i],s));
  const gateway=[c.gatewayA,c.gatewayB].map((g,i)=>g===undefined?'absent':!inside(g,own[i])?'outside':!inside(g,own[i],true)||g===ips[i]?'unusable':'in-subnet');
  const hosts=ips[0]!==ips[1]&&ips.every((ip,i)=>inside(ip,own[i],true));
  const configuration=hosts&&gateway.every(s=>!['outside','unusable'].includes(s))?'valid':'invalid';
  const l2=c.layer2==='unknown'?[true,false]:[c.layer2==='same'];
  const routes=c.routedPath==='unknown'?[true,false]:[c.routedPath==='working'];
  const actual=[c.routerA,c.routerB], given=[c.gatewayA,c.gatewayB];
  const routerChoices=actual.map((a,i)=>a===undefined?[true,false]:[a===given[i]]);
  const outcomes=[];
  for(const connected of l2) for(const routed of routes) for(const ga of routerChoices[0]) for(const gb of routerChoices[1]) {
    const available=[ga,gb];
    outcomes.push(hosts&&local.every((isLocal,i)=>isLocal?connected:gateway[i]==='in-subnet'&&available[i]&&routed));
  }
  return {a:oracle(c.a),b:oracle(c.b),localA:local[0],localB:local[1],gatewayA:gateway[0],gatewayB:gateway[1],configuration,
    connectivity:outcomes.every(Boolean)?'possible':outcomes.some(Boolean)?'undetermined':'blocked'};
}
const recipes=CIDR_SCENARIOS.flatMap(scenario=>(['beginner','intermediate','advanced'] as const).flatMap(difficulty=>
  Array.from({length:30},(_,i)=>({family:'cidr' as const,scenario,difficulty,seed:`cidr-review-${i}`,version:1}))));
describe('540 deterministic E variants against an independent oracle',()=>{
  it.each(recipes)('$scenario/$difficulty/$seed',recipe=>{
    const v=generate(recipe);
    expect(generate(recipe)).toEqual(v);
    expect(generate(JSON.parse(JSON.stringify(v.recipe)))).toEqual(v);
    if(v.problem.family!=='cidr'||v.problem.mode!=='diagnosis') throw Error('wrong family');
    const rows=(v.reference as {rows:ReturnType<typeof diagnose>[]}).rows;
    v.problem.cases.forEach((c,i)=>{
      expect(rows[i]).toMatchObject(independent(c));
      expect(rows[i].a.prefix).toBeLessThanOrEqual(30); expect(rows[i].b.prefix).toBeLessThanOrEqual(30);
      if(recipe.scenario==='same-network') { expect(c.a.split('.')[2]).not.toBe(c.b.split('.')[2]); expect(rows[i].diagnosis).toBe('none'); }
      if(recipe.scenario==='boundary') expect(rows[i].diagnosis).toBe('subnet-boundary');
      if(recipe.scenario==='gateway') expect(rows[i].diagnosis).toBe('unknown');
      if(recipe.scenario==='mixed-masks') expect(rows[i].diagnosis).toBe('asymmetric');
      if(recipe.scenario==='healthy') expect(rows[i].diagnosis).toBe('none');
      if(recipe.scenario==='real-fault') expect(['vlan','gateway','remote-arp']).toContain(rows[i].diagnosis);
    });
    expect(grade(v.problem,v.reference).pass).toBe(true);
    const bad=structuredClone(rows); bad[0].a.broadcast='0.0.0.0';
    expect(grade(v.problem,{rows:bad}).pass).toBe(false);
    const lie=structuredClone(rows); lie[0].connectivity=lie[0].connectivity==='possible'?'blocked':'possible';
    expect(grade(v.problem,{rows:lie}).pass).toBe(false);
  });
});
it('covers distinct prefixes, genuine faults, healthy and ambiguous cases rather than repeating a fixed list',()=>{
  const variants=recipes.map(generate),serialized=variants.map(v=>JSON.stringify(v.problem));
  expect(new Set(serialized).size).toBeGreaterThan(500);
  const rows=variants.flatMap(v=>(v.reference as {rows:ReturnType<typeof diagnose>[]}).rows);
  for(const prefix of [20,22,23,25,26,27,28]) expect(rows.some(r=>r.a.prefix===prefix)).toBe(true);
  for(const status of ['possible','blocked','undetermined']) expect(rows.some(r=>r.connectivity===status)).toBe(true);
  for(const reason of ['none','unknown','vlan','gateway','remote-arp','asymmetric','subnet-boundary']) expect(rows.some(r=>r.diagnosis===reason)).toBe(true);
});
it('freezes the CIDR version-1 example independently of the existing five generator families',()=>{
  expect(generate({family:'cidr',scenario:'real-fault',difficulty:'advanced',seed:'notebook-demo',version:1}).problem).toEqual({
    family:'cidr',mode:'diagnosis',cases:[{id:'fall',a:'10.30.8.10/22',b:'10.30.11.254/22',layer2:'separate',routedPath:'absent'}],
  });
});
const reasons=[['none'],['unknown'],['subnet-boundary','subnet-boundary','subnet-boundary'],['subnet-boundary','subnet-boundary','subnet-boundary'],['vlan'],['none'],['asymmetric'],['gateway'],['remote-arp'],['none','invalid-host','unknown','none'],[],['remote-arp','gateway']];
it.each(CIDR_DRAFTS.map((draft,index)=>({draft,index})))('audits reference $draft.id independently',({draft,index})=>{
  expect(validateFactory([draft])).toEqual([]);
  const p=draft.student.initialData;
  if(p.family!=='cidr') throw Error('family');
  if(p.mode==='diagnosis') {
    const rows=(draft.review.reference.answer as {rows:ReturnType<typeof diagnose>[]}).rows;
    expect(rows.map(r=>r.diagnosis)).toEqual(reasons[index]);
    p.cases.forEach((c,i)=>expect(rows[i]).toMatchObject(independent(c)));
    expect(grade(p,draft.review.reference.answer).feedback?.length).toBe(p.cases.length);
  }
});
it('accepts equivalent ordering, German classifications, prefix notation and decimal masks without fuzzy free-text guesses',()=>{
  const d=CIDR_DRAFTS[9], answer=structuredClone(d.review.reference.answer) as {rows:Record<string,unknown>[]};
  answer.rows.reverse();
  for(const r of answer.rows) {
    if(r.connectivity==='undetermined') r.connectivity=' Nicht eindeutig bestimmbar ';
    if(r.configuration==='valid') r.configuration='gültig';
    for(const side of ['a','b']) { const f=r[side] as Record<string,unknown>; f.mask=`/${f.prefix}`; f.prefix=`/${f.prefix}`; }
  }
  expect(grade(d.student.initialData,answer).pass).toBe(true);
  answer.rows.push(answer.rows[0]); expect(grade(d.student.initialData,answer).pass).toBe(false);
  expect(grade(d.student.initialData,'looks fine').pass).toBe(false);
});
it('accepts multiple blocks, prefixes and hosts by constraints; rejects plans that merely resemble the reference',()=>{
  const p=CIDR_DRAFTS[10].student.initialData;
  for(const [cidr,addresses] of [
    ['10.80.4.0/25',['10.80.4.80','10.80.4.81']],['10.80.4.128/25',['10.80.4.130','10.80.4.254']],
    ['10.80.4.192/26',['10.80.4.194','10.80.4.200']],['10.80.4.64/26',['10.80.4.65','10.80.4.126']],
  ]) expect(grade(p,{cidr,addresses}).pass).toBe(true);
  for(const answer of [
    {cidr:'10.80.4.0/27',addresses:['10.80.4.1','10.80.4.2']},
    {cidr:'10.80.5.0/26',addresses:['10.80.5.1','10.80.5.2']},
    {cidr:'10.80.4.1/26',addresses:['10.80.4.2','10.80.4.3']},
    {cidr:'10.80.4.0/26',addresses:['10.80.4.0','10.80.4.63']},
    {cidr:'10.80.4.0/26',addresses:['10.80.4.1','10.80.4.1']},
    {cidr:'10.80.4.0/26',addresses:['10.80.4.1','10.80.4.65']},
  ]) expect(grade(p,answer).pass).toBe(false);
  const tight:CidrProblem={family:'cidr',mode:'plan',parent:'10.0.0.0/24',hosts:100,allowedPrefixes:[25,26]};
  expect(grade(tight,{cidr:'10.0.0.0/26',addresses:['10.0.0.1','10.0.0.2']}).pass).toBe(false);
});
it('does not turn incomplete router or L2 knowledge into a connectivity claim',()=>{
  const c:CidrCase={id:'ambiguous',a:'10.0.0.2/24',b:'10.0.1.2/24',layer2:'separate',routedPath:'working',gatewayA:'10.0.0.1',gatewayB:'10.0.1.1'};
  expect(diagnose(c).connectivity).toBe('undetermined');
  const mixed={...c,a:'10.0.0.2/23',layer2:'unknown' as const,routerA:'10.0.0.1',routerB:'10.0.1.1'};
  expect(diagnose(mixed)).toMatchObject(independent(mixed));
  expect(diagnose(mixed).connectivity).toBe('undetermined');
});
it('different masks need not imply a fault, and a working local exchange need not validate a gateway',()=>{
  const c:CidrCase={id:'healthy-mixed',a:'192.168.5.10/24',b:'192.168.5.20/25',layer2:'same',routedPath:'absent'};
  expect(diagnose(c)).toMatchObject({...independent(c),configuration:'valid',connectivity:'possible',diagnosis:'none'});
  const badGateway={...c,gatewayA:'192.168.6.1'};
  expect(diagnose(badGateway)).toMatchObject({...independent(badGateway),configuration:'invalid',connectivity:'possible'});
});
it('rejects unsupported and contradictory authoring recipes',()=>{
  expect(()=>generate({family:'cidr',difficulty:'beginner',version:2})).toThrow();
  expect(()=>generate({family:'cidr',difficulty:'beginner',scenario:'invented' as never})).toThrow();
  expect(()=>generate({family:'subnet',difficulty:'beginner',scenario:'healthy'})).toThrow();
  const c:CidrCase={id:'a',a:'10.0.0.1/24',b:'10.0.0.2/24',layer2:'same',routedPath:'absent'};
  for(const change of [{a:'10.0.0.1/31'},{a:'10.0.0.1/32'},{routerA:'10.0.0.1'},{routedPath:'working' as const}]) expect(()=>diagnose({...c,...change})).toThrow();
  expect(()=>solve({family:'cidr',mode:'diagnosis',cases:[c,c]})).toThrow();
  expect(()=>solve({family:'cidr',mode:'plan',parent:'10.0.0.0/28',hosts:30,allowedPrefixes:[28]})).toThrow();
});
