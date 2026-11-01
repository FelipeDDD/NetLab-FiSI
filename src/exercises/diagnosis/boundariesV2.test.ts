import {expect,it} from 'vitest';
import {BOUNDARY_PREFIXES,BOUNDARY_RECIPES,generateBoundariesV2} from './boundariesV2';
import {checkDiagnosis,diagnosisPrompt,nextDiagnosis} from './previewModel';

// Independent BigInt bit-mask oracle. No imports from production IPv4 helpers.
const int=(ip:string)=>ip.split('.').reduce((n,v)=>(n<<8n)|BigInt(v),0n);
const dot=(n:bigint)=>[24n,16n,8n,0n].map(s=>(n>>s)&255n).join('.');
const yn=(b:boolean)=>b?'yes':'no';
it('audits 3000 automatic seeds against an independent oracle, boundary mix and all question roles',()=>{
  const roles=new Set<string>(),probes=new Set<string>(),prefixes=new Set<number>(),answers=new Set<string>();
  let zero=0,ff=0,self=0;
  for(const difficulty of ['beginner','intermediate','advanced'] as const) {
    let boundaries=0;
    for(let i=0;i<1000;i++) {
      const g=generateBoundariesV2({version:2,archetype:'ND02',difficulty,seed:`boundary-audit-${i}`});
      expect(generateBoundariesV2(g.recipe)).toEqual(g);
      const {pc,prefix,candidate,probe}=g.data,p=int(pc),c=int(candidate),a=int(probe.address);
      const host=(1n<<BigInt(32-prefix))-1n,mask=0xffffffffn^host,n=p&mask,b=n|host;
      expect(p>n&&p<b).toBe(true);
      for(const address of [p,c,a])expect(address>=0n&&address<=0xffffffffn).toBe(true);
      expect(g.calculation).toEqual({network:dot(n),broadcast:dot(b),prefix,mask:dot(mask),first:dot(n+1n),last:dot(b-1n),addresses:Number(host+1n),hosts:Number(host-1n)});
      expect(g.case.questions[0].answer).toBe(yn(c>=n&&c<=b));
      expect(g.case.questions[1].answer).toBe(yn(c>n&&c<b&&c!==p));
      const expected={network:n,broadcast:b,first:n+1n,last:b-1n,next:b+1n,membership:0n};
      expect(g.case.questions[2].answer).toBe(yn(probe.kind==='membership'?a>=n&&a<=b:a===expected[probe.kind]));
      const positions={'before-network':n-1n,network:n,'first-host':n+1n,'last-host':b-1n,broadcast:b,'after-broadcast':b+1n};
      if(g.data.role in positions){expect(c).toBe(positions[g.data.role as keyof typeof positions]);boundaries++;}
      else expect(c>n+1n&&c<b-1n).toBe(true);
      if(g.data.role==='zero-host'){expect(candidate.endsWith('.0')).toBe(true);zero++;}
      if(g.data.role==='255-host'){expect(candidate.endsWith('.255')).toBe(true);ff++;}
      if(g.data.role==='self'){expect(c).toBe(p);self++;}
      else expect(c).not.toBe(p);
      roles.add(g.data.role);probes.add(probe.kind);prefixes.add(prefix);answers.add(`${probe.kind}:${g.case.questions[2].answer}`);
      expect((BOUNDARY_PREFIXES[difficulty] as readonly number[]).includes(prefix)).toBe(true);
      expect(g.case.contentVersion).toBe(2);
      expect(g.case.questions).toHaveLength(3);
    }
    expect(boundaries).toBeGreaterThan(740);expect(boundaries).toBeLessThan(860);
  }
  expect(roles.size).toBe(10);expect(probes.size).toBe(6);expect(answers.size).toBe(12);
  expect([...prefixes].sort()).toEqual([21,22,23,24,25,26,27,28]);
  expect(Math.min(zero,ff,self)).toBeGreaterThan(0);
});
it('keeps every explicit boundary recipe reproducible and joint feedback/progression versioned',()=>{
  for(const recipe of BOUNDARY_RECIPES) {
    const g=generateBoundariesV2({version:2,archetype:'ND02',difficulty:'advanced',seed:'review-東京',recipe});
    const original=JSON.stringify(g),qs=g.case.questions;
    expect(checkDiagnosis(g,Object.fromEntries(qs.slice(0,2).map(q=>[q.id,q.answer])))).toEqual({complete:false,missing:['boundary']});
    const result=checkDiagnosis(g,Object.fromEntries(qs.map(q=>[q.id,q.answer])));
    expect(result.complete&&result.pass).toBe(true);
    expect(diagnosisPrompt(g).questions[2].prompt).toBe(qs[2].prompt);
    expect(JSON.stringify(diagnosisPrompt(g))).not.toContain('calculation');
    const next=nextDiagnosis(g,'next-v2');expect(next.recipe.version).toBe(2);expect(generateBoundariesV2(next.recipe)).toEqual(next);
    expect(JSON.stringify(g)).toBe(original);
  }
});
it('rejects malformed or unsupported v2 recipes without coercing them to v1',()=>{
  const valid={version:2 as const,archetype:'ND02' as const,difficulty:'beginner' as const,seed:'safe'};
  for(const bad of [{version:1},{archetype:'ND05'},{difficulty:'other'},{seed:''},{seed:'a'.repeat(257)},{recipe:'bad'},{recipe:'zero-host'}])
    expect(()=>generateBoundariesV2({...valid,...bad} as typeof valid)).toThrow();
});
