import {expect,it} from 'vitest';
import {generateBoundariesV3,isCompleteMaskInput,V3_RECIPES} from './boundariesV3';
import {checkDiagnosis,diagnosisPrompt,generatePreview,initialDiagnosisAnswers,nextDiagnosis} from './previewModel';

// Independent mask oracle: BigInt bit operations, never production subnet/facts.
const int=(ip:string)=>ip.split('.').reduce((n,v)=>(n<<8n)|BigInt(v),0n);
const dot=(n:bigint)=>[24n,16n,8n,0n].map(s=>(n>>s)&255n).join('.');
const yn=(v:boolean)=>v?'yes':'no';
it('checks 3000 v3 seeds, every prefix/role, both subnet boundaries and masks independently',()=>{
  const roles=new Set<string>(),prefixes=new Set<number>();let zero=0,ff=0,cross=0;
  for(const difficulty of ['beginner','intermediate','advanced'] as const) {
    let boundaries=0;
    for(let i=0;i<1000;i++) {
      const g=generateBoundariesV3({version:3,archetype:'ND02',difficulty,seed:`v3-audit-${i}`});
      expect(generateBoundariesV3(g.recipe)).toEqual(g);
      const p=int(g.data.pc),c=int(g.data.candidate),host=(1n<<BigInt(32-g.data.prefix))-1n,mask=0xffffffffn^host,n=p&mask,b=n|host;
      expect(p>n&&p<b).toBe(true);expect(c).not.toBe(p);
      expect(c>=0n&&c<=0xffffffffn).toBe(true);
      expect(g.calculation).toEqual({network:dot(n),broadcast:dot(b),prefix:g.data.prefix,mask:dot(mask),first:dot(n+1n),last:dot(b-1n),addresses:Number(host+1n),hosts:Number(host-1n)});
      expect(g.case.questions.map(q=>q.answer)).toEqual([yn(c>=n&&c<=b),yn(c>n&&c<b),dot(mask)]);
      expect(g.case.questions.map(q=>q.prompt)).toEqual(['Liegt die Gateway-Adresse rechnerisch im Subnetz des PCs?','Ist die Gateway-Adresse eine nutzbare Hostadresse dieses Subnetzes?','Welche Subnetzmaske entspricht dem CIDR-Präfix des PCs?']);
      expect(dot(mask)).toMatch(/^255\.255\./);
      const positions={'before-network':n-1n,network:n,'first-host':n+1n,'last-host':b-1n,broadcast:b,'after-broadcast':b+1n};
      if(g.data.role in positions){expect(c).toBe(positions[g.data.role as keyof typeof positions]);boundaries++;}
      else expect(c>n+1n&&c<b-1n).toBe(true);
      if(g.data.role==='zero-host'){expect(g.data.candidate.endsWith('.0')).toBe(true);zero++;}
      if(g.data.role==='255-host'){expect(g.data.candidate.endsWith('.255')).toBe(true);ff++;}
      if((n>>8n)!==(b>>8n))cross++;
      roles.add(g.data.role);prefixes.add(g.data.prefix);
      expect(g.case.contentVersion).toBe(3);
    }
    expect(boundaries).toBeGreaterThan(740);expect(boundaries).toBeLessThan(860);
  }
  expect([...roles].sort()).toEqual([...V3_RECIPES].sort());
  expect([...prefixes].sort()).toEqual([21,22,23,24,25,26,27,28]);
  expect(Math.min(zero,ff,cross)).toBeGreaterThan(0);
});
it('requires four valid decimal octets before joint disclosure and grades complete wrong masks',()=>{
  const g=generateBoundariesV3({version:3,archetype:'ND02',difficulty:'beginner',seed:'mask-check'});
  const choices=Object.fromEntries(g.case.questions.slice(0,2).map(q=>[q.id,q.answer]));
  expect(initialDiagnosisAnswers(g)).toEqual({mask:'255.255.'});
  for(const value of ['', '255.255.', '255.255.255', '255.255.255.', '255.255.256.0', '255.255.-1.0', '255.255.255.00', '255,255,255,0', '255.255.255.0/24', '255.255.a.0']) {
    expect(isCompleteMaskInput(value)).toBe(false);
    expect(checkDiagnosis(g,{...choices,mask:value})).toEqual({complete:false,missing:['mask']});
  }
  const correct=checkDiagnosis(g,{...choices,mask:` ${g.calculation.mask} `});expect(correct.complete&&correct.pass).toBe(true);
  for(const value of ['255.255.255.255','0.0.0.0','255.255.254.128']) {
    expect(isCompleteMaskInput(value)).toBe(true);
    const result=checkDiagnosis(g,{...choices,mask:value});expect(result.complete&&!result.pass).toBe(true);
    if(result.complete)expect(result.fields.map(f=>f.correct)).toEqual([true,true,false]);
  }
  // Rechecking after editing an answer is fresh; no mutable grading state or hidden cache.
  expect(checkDiagnosis(g,{...choices,mask:'255.255.'}).complete).toBe(false);
  expect(checkDiagnosis(g,{mask:g.calculation.mask})).toEqual({complete:false,missing:['membership','host']});
});
it('preserves v3 across next/reproduction, including maximum-length seeds, without leaking mask answers',()=>{
  for(const recipe of V3_RECIPES) {
    const g=generateBoundariesV3({version:3,archetype:'ND02',difficulty:'advanced',seed:'東京'.repeat(128),recipe});
    expect(generatePreview(g.recipe)).toEqual(g);
    const projection=diagnosisPrompt(g);
    expect(projection.questions[2]).toMatchObject({id:'mask',input:'mask'});
    expect(JSON.stringify(projection)).not.toContain(g.calculation.mask);
    expect(projection.questions[1].prompt).not.toContain('Router');
    const next=nextDiagnosis(g,'v3-next');expect(next.recipe.version).toBe(3);expect(next.case.id).not.toBe(g.case.id);
    expect(generateBoundariesV3(next.recipe)).toEqual(next);
  }
});
it('rejects self and invalid versions rather than reinterpreting older recipes',()=>{
  const base={version:3 as const,archetype:'ND02' as const,difficulty:'beginner' as const,seed:'test'};
  for(const bad of [{version:2},{version:1},{archetype:'ND05'},{difficulty:'other'},{seed:''},{seed:'a'.repeat(257)},{recipe:'self'},{recipe:'zero-host'}])expect(()=>generateBoundariesV3({...base,...bad} as typeof base)).toThrow();
});
