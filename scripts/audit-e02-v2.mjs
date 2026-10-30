// Offline deterministic audit: no browser profile, persistence or network engine instance.
import assert from 'node:assert/strict';
import {createServer} from 'vite';
const vite=await createServer({configFile:false,appType:'custom',logLevel:'error',server:{middlewareMode:true,hmr:false,watch:null}});
const ip=s=>s.split('.').reduce((n,o)=>(n<<8n)|BigInt(o),0n);
try {
  const {createQuestion,evaluate,solution}=await vite.ssrLoadModule('/src/exercises/practice/model.ts');
  const evidenceOracle={echo:'yes',tcp:'yes',udp:'yes',power:'no',disconnected:'no',vlan:'no',unspecified:'unknown',timeout:'unknown',sameVlan:'unknown'};
  const report={version:2,seeds:'e02-v2-audit-0000 … e02-v2-audit-0999',samples:[],examples:{}};
  for(const difficulty of ['beginner','intermediate','advanced']) {
    const modes={membership:0,connectivity:0},answers={membership:{yes:0,no:0,unknown:0},connectivity:{yes:0,no:0,unknown:0}},boundaries={network:0,broadcast:0,host:0,outside:0},evidence={},seen=new Set();
    for(let i=0;i<1000;i++) {
      const seed=`e02-v2-audit-${String(i).padStart(4,'0')}`,q=createQuestion('gateway',seed,difficulty,2),p=q.problem;
      assert.deepEqual(createQuestion('gateway',seed,difficulty,2),q);
      const [address,prefix]=p.pc.split('/'),size=1n<<BigInt(32-Number(prefix)),start=ip(address)/size*size,g=ip(p.gateway);
      const type=g===start?'network':g===start+size-1n?'broadcast':g<start||g>=start+size?'outside':'host';
      const expected=p.mode==='membership'?(type==='outside'?'no':'yes'):evidenceOracle[p.evidence];
      assert.equal(solution(q).local,expected);assert(evaluate(q,{local:expected}).pass);
      for(const other of ['yes','no','unknown'].filter(a=>a!==expected))assert(!evaluate(q,{local:other}).pass);
      modes[p.mode]++;answers[p.mode][expected]++;seen.add(JSON.stringify(q.data));
      if(p.mode==='membership')boundaries[type]++;else evidence[p.evidence]=(evidence[p.evidence]??0)+1;
      const key=p.mode==='membership'?type:p.evidence;
      report.examples[key]??={seed,difficulty,task:q.task,data:q.data,answer:expected,feedback:evaluate(q,{local:expected}).fields.local.explanation};
    }
    assert(modes.membership>400&&modes.membership<600);
    assert(Object.values(answers.connectivity).every(n=>n/modes.connectivity>.23));
    report.samples.push({difficulty,modes,answers,boundaries,evidence,uniqueVisible:seen.size,repetitions:1000-seen.size});
  }
  console.log(JSON.stringify(report,null,2));
}finally{await vite.close();}
