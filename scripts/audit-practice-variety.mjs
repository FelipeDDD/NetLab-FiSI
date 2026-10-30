// Reproducible audit, not an additional runtime generator or grader.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const vite=await createServer({root,configFile:false,appType:'custom',logLevel:'error',server:{middlewareMode:true,hmr:false,watch:null}});
const ip=s=>s.split('.').reduce((n,o)=>(n<<8n)|BigInt(o),0n);
const dotted=n=>[24n,16n,8n,0n].map(s=>(n>>s)&255n).join('.');
function bounds(cidr) {
  const [host,p]=cidr.split('/'),prefix=Number(p),size=1n<<BigInt(32-prefix),mask=0xffffffffn^(size-1n),start=ip(host)&mask;
  return {start,end:start+size-1n,size,prefix};
}
const overlap=(a,b)=>a.start<=b.end&&b.start<=a.end;
function oracle(q,a) {
  const p=q.problem;
  if(p.family==='subnet') {
    const n=bounds(`${p.ip}/${p.prefix}`);
    assert.equal(a.network,dotted(n.start));assert.equal(a.broadcast,dotted(n.end));assert.equal(a.hosts,String(n.size-2n));
  } else if(p.family==='vlsm') {
    const parent=bounds(p.parent),used=p.reserved.map(bounds);
    for(const d of p.demands) {
      const n=bounds(a[d.id]),hosts=BigInt(Math.ceil(d.hosts*(100+(d.growthPercent??0))/100));
      assert.equal(ip(a[d.id].split('/')[0]),n.start,'alignment');assert(n.start>=parent.start&&n.end<=parent.end,'containment');
      assert(n.size-2n>=hosts,'capacity');assert(n.size/2n-2n<hosts,'minimal size');assert(!used.some(u=>overlap(n,u)),'reserved/overlap');used.push(n);
    }
  } else {
    const c=p.cases[0],n=bounds(c.a),gateway=ip(c.gatewayA);
    assert.equal(a.local,gateway>=n.start&&gateway<=n.end?'yes':'no');
  }
}
try {
  const {createQuestion,solution,evaluate,PRACTICE_KINDS}=await vite.ssrLoadModule('/src/exercises/practice/model.ts');
  const {NETWORK_FACTORY_DRAFTS:catalog}=await vite.ssrLoadModule('/src/exercises/factory/catalog.ts');
  const report={seedPattern:'audit-variety-000 … audit-variety-099',perFamilyPerDifficulty:100,total:0,referenceCounts:Object.fromEntries(['A','B','E'].map(g=>[g,catalog.filter(d=>d.group===g).length])),samples:[],legacyRecipeSha256:''};
  for(const kind of PRACTICE_KINDS)for(const difficulty of ['beginner','intermediate','advanced']) {
    const visible=new Set(),problems=new Set(),prefixes=new Set(),patterns={},answers={},counts={},parentPrefixes=new Set();
    let consecutive=0,last,valid=0;
    for(let i=0;i<100;i++) {
      const seed=`audit-variety-${String(i).padStart(3,'0')}`,q=createQuestion(kind,seed,difficulty),a=solution(q),p=q.problem;
      assert.deepEqual(createQuestion(kind,seed,difficulty),q);oracle(q,a);assert(evaluate(q,a).pass);assert(!evaluate(q,{}).pass);
      const invalid={...a,[q.fields[0].id]:kind==='gateway'?'unknown':'invalid'};assert(!evaluate(q,invalid).pass);
      const shown=JSON.stringify(q.data);visible.add(shown);problems.add(JSON.stringify(p));if(last===shown)consecutive++;last=shown;
      let pattern;
      if(p.family==='subnet'){prefixes.add(p.prefix);pattern=`/${p.prefix}`;}
      else if(p.family==='vlsm') {
        parentPrefixes.add(bounds(p.parent).prefix);
        pattern=JSON.stringify({prefixes:p.demands.map(d=>bounds(a[d.id]).prefix),growth:p.demands.map(d=>d.growthPercent??0),reserved:p.reserved.map(r=>bounds(r).prefix)});
        for(const d of p.demands)counts[d.id]=[Math.min(counts[d.id]?.[0]??Infinity,d.hosts),Math.max(counts[d.id]?.[1]??0,d.hosts)];
      } else {
        const c=p.cases[0],n=bounds(c.a),g=ip(c.gatewayA);prefixes.add(n.prefix);
        pattern=g<n.start||g>n.end?'outside':g===n.end||g===n.start?'network-or-broadcast':'usable-local';answers[a.local]=(answers[a.local]??0)+1;
      }
      patterns[pattern]=(patterns[pattern]??0)+1;valid++;report.total++;
    }
    report.samples.push({kind,difficulty,valid,uniqueVisible:visible.size,uniqueProblems:problems.size,exactVisibleRepetitions:100-visible.size,consecutiveVisibleRepetitions:consecutive,prefixes:[...prefixes].sort((a,b)=>a-b),parentPrefixes:[...parentPrefixes],patterns,answers,hostRanges:counts});
  }
  const legacy=[];
  for(const kind of PRACTICE_KINDS)for(const difficulty of ['beginner','intermediate','advanced'])for(const seed of ['reference','37b3c848-b226-44c2-93eb-0337af1ce011-0','manuell-büro'])legacy.push(createQuestion(kind,seed,difficulty));
  report.legacyRecipeSha256=createHash('sha256').update(JSON.stringify(legacy)).digest('hex');
  console.log(JSON.stringify(report,null,2));
}finally {await vite.close();}
