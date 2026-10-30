import { expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { createQuestion, evaluate, solution, PRACTICE_KINDS } from './model';
import { gatewayV2Result, GATEWAY_EVIDENCE, type GatewayV2Problem } from './gatewayV2';
import { nextQuestion } from './progression';
import { practiceNextShortcut } from './shortcuts';

const ip=(s:string)=>s.split('.').reduce((n,o)=>(n<<8n)|BigInt(o),0n);
it('keeps the complete frozen v1 legacy recipe fingerprint, including reference and UUID seeds',()=>{
  const legacy=[];
  for(const kind of PRACTICE_KINDS)for(const difficulty of ['beginner','intermediate','advanced'] as const)
    for(const seed of ['reference','37b3c848-b226-44c2-93eb-0337af1ce011-0','manuell-büro'])legacy.push(createQuestion(kind,seed,difficulty));
  expect(createHash('sha256').update(JSON.stringify(legacy)).digest('hex')).toBe('b9a7bf5fc1c1dca9ac0a8d408becb221da3c50c26145349526b38f06fd0be2b9');
});
it('E02 v2 is explicit, deterministic, version-isolated and preserves the version during progression',()=>{
  for(const seed of ['reference','37b3c848-b226-44c2-93eb-0337af1ce011-0','büro 東京']) {
    const q=createQuestion('gateway',seed,'advanced',2);
    expect(createQuestion('gateway',seed,'advanced',2)).toEqual(q);
    expect(q.id).not.toBe(createQuestion('gateway',seed,'advanced',1).id);
    expect(nextQuestion(q,'next').recipe.version).toBe(2);
    expect(nextQuestion(q,seed).problem).not.toEqual(q.problem);
  }
  expect(()=>createQuestion('subnet','x','beginner',2)).toThrow();
  expect(()=>createQuestion('gateway','x','beginner',3)).toThrow();
  expect(()=>createQuestion('gateway','','beginner',2)).toThrow();
});
it('membership includes network and broadcast and never depends on Layer 2 evidence',()=>{
  for(const [gateway,answer,reserved] of [['10.140.0.0','yes',true],['10.140.0.127','yes',true],['10.140.0.1','yes',false],['10.140.0.129','no',false]] as const) {
    const p:GatewayV2Problem={family:'gateway-v2',mode:'membership',pc:'10.140.0.11/25',gateway};
    expect(gatewayV2Result(p).answer).toBe(answer);
    expect(gatewayV2Result(p).explanation.includes('keine konventionell')).toBe(reserved);
  }
});
it('actual connectivity distinguishes positive evidence, demonstrated failure and insufficient information',()=>{
  const expected={echo:'yes',tcp:'yes',udp:'yes',power:'no',disconnected:'no',vlan:'no',unspecified:'unknown',timeout:'unknown',sameVlan:'unknown'};
  for(const evidence of Object.keys(GATEWAY_EVIDENCE) as (keyof typeof GATEWAY_EVIDENCE)[]) {
    const p:GatewayV2Problem={family:'gateway-v2',mode:'connectivity',pc:'10.1.0.10/24',gateway:'10.1.0.1',evidence};
    expect(gatewayV2Result(p).answer).toBe(expected[evidence]);
  }
});
it.each(['beginner','intermediate','advanced'] as const)('audits 1000 reproducible %s seeds with independent BigInt membership oracle and balanced evidence',difficulty=>{
  const counts={membership:0,connectivity:0,yes:0,no:0,unknown:0},seen=new Set(),evidence=new Set();
  for(let i=0;i<1000;i++) {
    const q=createQuestion('gateway',`e02-v2-audit-${String(i).padStart(4,'0')}`,difficulty,2),p=q.problem;
    if(p.family!=='gateway-v2')throw Error();
    expect(createQuestion('gateway',q.recipe.seed,difficulty,2)).toEqual(q);
    counts[p.mode]++;seen.add(JSON.stringify(q.data));
    const actual=solution(q).local;
    if(p.mode==='membership') {
      const [address,prefix]=p.pc.split('/'),size=1n<<BigInt(32-Number(prefix)),start=ip(address)/size*size;
      expect(actual).toBe(ip(p.gateway)>=start&&ip(p.gateway)<start+size?'yes':'no');
    } else {counts[actual as 'yes'|'no'|'unknown']++;evidence.add(p.evidence);}
    for(const choice of ['yes','no','unknown'])expect(evaluate(q,{local:choice}).pass).toBe(choice===actual);
    expect(evaluate(q,{}).fields.local.state).toBe('missing');
  }
  expect(counts.membership).toBeGreaterThan(400);expect(counts.membership).toBeLessThan(600);
  for(const answer of ['yes','no','unknown'] as const)expect(counts[answer]/counts.connectivity).toBeGreaterThan(.23);
  expect(evidence.size).toBe(9);expect(seen.size).toBeGreaterThan(990);
});
it('only executes unmodified physical Space after checking in a non-interactive practice target',()=>{
  const e={code:'Space',repeat:false,defaultPrevented:false,ctrlKey:false,altKey:false,shiftKey:false,metaKey:false,isComposing:false};
  expect(practiceNextShortcut(e,true,false)).toBe(true);
  expect(practiceNextShortcut(e,false,false)).toBe(false);
  expect(practiceNextShortcut(e,true,true)).toBe(false);
  for(const field of ['repeat','defaultPrevented','ctrlKey','altKey','shiftKey','metaKey','isComposing'])expect(practiceNextShortcut({...e,[field]:true},true,false)).toBe(false);
  expect(practiceNextShortcut({...e,code:'KeyS'},true,false)).toBe(false);
});
