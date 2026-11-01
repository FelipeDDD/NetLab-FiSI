// Offline audit + reproducible editorial examples. No application or saved data.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createServer} from 'vite';
const mode=process.argv[2];
assert([undefined,'--write-review','--check-review'].includes(mode));
const vite=await createServer({configFile:false,appType:'custom',logLevel:'error',server:{middlewareMode:true,hmr:false,watch:null}});
try {
  const {generateBoundariesV3}=await vite.ssrLoadModule('/src/exercises/diagnosis/boundariesV3.ts');
  const int=ip=>ip.split('.').reduce((n,v)=>(n<<8n)|BigInt(v),0n),yn=b=>b?'yes':'no';
  const dot=n=>[24n,16n,8n,0n].map(s=>(n>>s)&255n).join('.');
  const rows=[];
  for(const difficulty of ['beginner','intermediate','advanced']) {
    const row={difficulty,samples:1000,boundaries:0,recipes:{},questions:[{yes:0,no:0},{yes:0,no:0}],masks:{}};
    for(let i=0;i<1000;i++) {
      const g=generateBoundariesV3({version:3,archetype:'ND02',difficulty,seed:`v3-audit-${i}`});
      assert.deepEqual(generateBoundariesV3(g.recipe),g);
      const p=int(g.data.pc),c=int(g.data.candidate),host=(1n<<BigInt(32-g.data.prefix))-1n,mask=0xffffffffn^host,n=p&mask,b=n|host;
      assert.notEqual(p,c);assert(p>n&&p<b);assert(c>=0n&&c<=0xffffffffn);
      assert.deepEqual(g.calculation,{network:dot(n),broadcast:dot(b),prefix:g.data.prefix,mask:dot(mask),first:dot(n+1n),last:dot(b-1n),addresses:Number(host+1n),hosts:Number(host-1n)});
      assert.deepEqual(g.case.questions.map(q=>q.answer),[yn(c>=n&&c<=b),yn(c>n&&c<b),dot(mask)]);
      assert(dot(mask).startsWith('255.255.'));
      if([n-1n,n,n+1n,b-1n,b,b+1n].includes(c))row.boundaries++;
      row.recipes[g.data.role]=(row.recipes[g.data.role]??0)+1;
      row.masks[g.data.prefix]=(row.masks[g.data.prefix]??0)+1;
      g.case.questions.slice(0,2).forEach((q,j)=>row.questions[j][q.answer]++);
    }
    assert(row.boundaries>740&&row.boundaries<860);rows.push(row);
  }
  const selections=[['beginner','before-network',24],['beginner','network',25],['beginner','first-host',26],['intermediate','last-host',27],['intermediate','broadcast',28],['intermediate','after-broadcast',23],['advanced','interior',21],['advanced','zero-host',22],['advanced','255-host',23]];
  const examples=selections.map(([difficulty,role,prefix])=>{
    for(let i=0;i<20000;i++) {
      const g=generateBoundariesV3({version:3,archetype:'ND02',difficulty,seed:`nd02-v3-review-${i}`});
      if(g.data.role===role&&g.data.prefix===prefix)return g;
    }
    throw Error('Example not found');
  });
  const hash=createHash('sha256').update(JSON.stringify(examples)).digest('hex');
  const levels={beginner:'Einstieg',intermediate:'Mittel',advanced:'Fortgeschritten'};
  const rendered=examples.map((g,i)=>{
    const f=g.calculation;
    return [`## ${i+1}. ${levels[g.recipe.difficulty]} — ${g.data.role}`,'',`Seed: \`${g.recipe.seed}\` · ND02 v3 · /${g.data.prefix}`,'','**Gateway und Subnetz**','',`- PC: ${g.data.pc}/${g.data.prefix}`,`- Gateway: ${g.data.candidate}`,'',
      ...g.case.questions.flatMap((q,j)=>[`${j+1}. **${q.prompt}** — **${q.answer==='yes'?'Ja':q.answer==='no'?'Nein':q.answer}**`,`   ${q.explanation.reasoning}`,'']),
      `**Rechenweg:** Maske ${f.mask}; ${f.addresses} Adressen. Netzadresse ${f.network}; Broadcastadresse ${f.broadcast}; Hostbereich ${f.first}–${f.last}.`,''].join('\n');
  }).join('\n');
  const document=['# ND02 v3 — Review und reproduzierbare Beispiele','',
    'Nur Entwicklungs-Preview. Die neue Standardversion fragt nach Zugehörigkeit, nutzbarem Hostbereich und der vollständigen Subnetzmaske. Keine Aussagen über Routerbetrieb oder Konnektivität. Der Kandidat ist nie die eigene PC-IP. v1/v2 bleiben unverändert wählbar.','',
    'Das Maskenfeld startet mit `255.255.`. Erst drei vollständig eingegebene Antworten erlauben die gemeinsame Korrektur; ungültige/unvollständige Oktette verraten keine Lösung. Vollständige falsche Masken (auch nicht zusammenhängende) werden als falsch bewertet. Bearbeiten verwirft das gesamte Feedback.','',
    'Audit: 1.000 Seeds je Schwierigkeit mit unabhängigem BigInt-Orakel.','',
    '| Schwierigkeit | Grenzfälle / 1.000 | Zugehörigkeit Ja/Nein | Hostadresse Ja/Nein |','|---|---:|---:|---:|',
    ...rows.map(r=>`| ${levels[r.difficulty]} | ${r.boundaries} | ${r.questions.map(q=>`${q.yes}/${q.no}`).join(' | ')} |`),'',
    `SHA-256 der neun vollständigen Beispiele: \`${hash}\`.`, '',rendered].join('\n');
  const target=new URL('../docs/nd02-v3-examples.md',import.meta.url);
  if(mode==='--write-review')writeFileSync(target,document);
  if(mode==='--check-review')assert.equal(readFileSync(target,'utf8').replace(/\r\n/g,'\n'),document);
  console.log(JSON.stringify({rows,fingerprint:hash,examples:examples.map(g=>({recipe:g.recipe,pc:g.data.pc,prefix:g.data.prefix,gateway:g.data.candidate,answers:g.case.questions.map(q=>q.answer)}))},null,2));
} finally {await vite.close();}
