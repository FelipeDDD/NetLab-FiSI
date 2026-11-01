import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createServer} from 'vite';
const mode=process.argv[2];
assert([undefined,'--write-review','--check-review'].includes(mode));
const vite=await createServer({configFile:false,appType:'custom',logLevel:'error',server:{middlewareMode:true,hmr:false,watch:null}});
try {
  const {generateBoundariesV2}=await vite.ssrLoadModule('/src/exercises/diagnosis/boundariesV2.ts');
  const int=ip=>ip.split('.').reduce((n,v)=>(n<<8n)|BigInt(v),0n),yn=b=>b?'yes':'no';
  const rows=[];
  for(const difficulty of ['beginner','intermediate','advanced']) {
    const row={difficulty,samples:1000,boundaries:0,recipes:{},questions:[{yes:0,no:0},{yes:0,no:0},{yes:0,no:0}]};
    for(let i=0;i<1000;i++) {
      const g=generateBoundariesV2({version:2,archetype:'ND02',difficulty,seed:`boundary-audit-${i}`});
      assert.deepEqual(generateBoundariesV2(g.recipe),g);
      const p=int(g.data.pc),c=int(g.data.candidate),host=(1n<<BigInt(32-g.data.prefix))-1n,n=p&(0xffffffffn^host),b=n|host,a=int(g.data.probe.address);
      assert.equal(int(g.calculation.network),n);assert.equal(int(g.calculation.broadcast),b);
      const expected={network:n,broadcast:b,first:n+1n,last:b-1n,next:b+1n};
      assert.deepEqual(g.case.questions.map(q=>q.answer),[yn(c>=n&&c<=b),yn(c>n&&c<b&&c!==p),yn(g.data.probe.kind==='membership'?a>=n&&a<=b:a===expected[g.data.probe.kind])]);
      if([n-1n,n,n+1n,b-1n,b,b+1n].includes(c))row.boundaries++;
      row.recipes[g.data.role]=(row.recipes[g.data.role]??0)+1;
      g.case.questions.forEach((q,j)=>row.questions[j][q.answer]++);
    }
    rows.push(row);
  }
  const selections=[['beginner','before-network',24],['beginner','network',25],['beginner','first-host',26],['intermediate','last-host',27],['intermediate','broadcast',28],['intermediate','after-broadcast',23],['intermediate','interior',24],['advanced','self',21],['advanced','zero-host',22],['advanced','255-host',23]];
  const examples=selections.map(([difficulty,role,prefix])=>{
    for(let i=0;i<20000;i++) {
      const g=generateBoundariesV2({version:2,archetype:'ND02',difficulty,seed:`nd02-v2-review-${i}`});
      if(g.data.role===role&&g.data.prefix===prefix)return g;
    }
    throw Error('Example not found');
  });
  const hash=createHash('sha256').update(JSON.stringify(examples)).digest('hex');
  const levels={beginner:'Einstieg',intermediate:'Mittel',advanced:'Fortgeschritten'};
  const rendered=examples.map((g,i)=>{
    const f=g.calculation;
    return [`## ${i+1}. ${levels[g.recipe.difficulty]} — ${g.data.role}`,'',`Seed: \`${g.recipe.seed}\` · ND02 v2 · /${g.data.prefix}`,'','**Gateway und Subnetz**','',`- PC: ${g.data.pc}/${g.data.prefix}`,`- Gateway: ${g.data.candidate}`,'',
      ...g.case.questions.flatMap((q,j)=>[`${j+1}. **${q.prompt}** — **${q.answer==='yes'?'Ja':'Nein'}**`, `   ${q.explanation.reasoning}`,'']),
      `**Rechenweg:** Maske ${f.mask}; ${f.addresses} Adressen. Netzadresse ${f.network}; Broadcastadresse ${f.broadcast}; Hostbereich ${f.first}–${f.last}.`,''].join('\n');
  }).join('\n');
  const document=['# ND02 v2 — Zehn reproduzierbare Review-Beispiele','',
    'Nur Entwicklungs-Preview. Automatische Rezeptauswahl mit den angegebenen Seeds; keine Änderung an v1. Antworten und Rechenweg werden in der UI erst nach gemeinsamer Abgabe sichtbar.','',
    'Die zweite Frage beurteilt nur die numerische Eignung eines anderen lokalen Routers, nicht dessen tatsächlichen Betrieb. Alle Beispiele verwenden gewöhnliche IPv4-Broadcast-Subnetze.','',
    'Audit: 1.000 Seeds je Schwierigkeit, BigInt-Orakel unabhängig von den produktiven IPv4-Helfern.','',
    '| Schwierigkeit | Grenzfälle / 1.000 | Frage 1 Ja/Nein | Frage 2 Ja/Nein | Frage 3 Ja/Nein |','|---|---:|---:|---:|---:|',
    ...rows.map(r=>`| ${levels[r.difficulty]} | ${r.boundaries} | ${r.questions.map(q=>`${q.yes}/${q.no}`).join(' | ')} |`),'',
    `SHA-256 der zehn vollständigen Ergebnisse: \`${hash}\`.`, '',rendered].join('\n');
  const target=new URL('../docs/nd02-v2-examples.md',import.meta.url);
  if(mode==='--write-review')writeFileSync(target,document);
  if(mode==='--check-review')assert.equal(readFileSync(target,'utf8').replace(/\r\n/g,'\n'),document);
  console.log(JSON.stringify({rows,fingerprint:hash,examples:examples.map(g=>({recipe:g.recipe,pc:g.data.pc,prefix:g.data.prefix,gateway:g.data.candidate,answers:g.case.questions.map(q=>q.answer)}))},null,2));
} finally {await vite.close();}
