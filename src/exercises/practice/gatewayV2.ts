import { address, facts, subnet } from '../factory/math';
import type { Recipe } from '../factory/generator';
import type { Question } from './model';

// Practice-only namespace. Frozen factory v1 and its authored reference cases stay untouched.
export const GATEWAY_EVIDENCE = {
  echo: {answer:'yes', text:'Ein aktueller ICMP Echo Reply des Gateways wurde am PC empfangen.', explanation:'Die aktuelle Antwort des Gateways belegt die Kommunikation mit dem PC.'},
  tcp: {answer:'yes', text:'Ein TCP-Verbindungsaufbau vom PC zum Gateway wurde gerade erfolgreich abgeschlossen.', explanation:'Der vollständige TCP-Verbindungsaufbau belegt die Erreichbarkeit. Nicht jeder andere Dienst muss deshalb verfügbar sein.'},
  udp: {answer:'yes', text:'Eine aktuelle UDP-Anfrage des PCs wurde vom Dienst am Gateway beantwortet.', explanation:'Die empfangene Antwort des Gateways belegt die Kommunikation in beide Richtungen.'},
  power: {answer:'no', text:'Das Gateway-Gerät ist ausgeschaltet. Kein anderes Gerät übernimmt seine IP-Adresse.', explanation:'Das ausgeschaltete Gateway kann nicht kommunizieren; es gibt keinen Ersatz unter dieser Adresse.'},
  disconnected: {answer:'no', text:'Alle Netzwerkschnittstellen des PCs sind physisch getrennt. Es gibt keinen weiteren Netzwerkzugang.', explanation:'Ohne einen Netzwerkzugang kann der PC das Gateway nicht erreichen.'},
  vlan: {answer:'no', text:'PC und Gateway liegen in getrennten VLANs. Zwischen ihnen gibt es weder Bridging noch Routing oder einen anderen Pfad.', explanation:'Die bestätigte Layer-2-Trennung ohne weiteren Pfad verhindert die Kommunikation, auch bei passenden IPv4-Adressen.'},
  unspecified: {answer:'unknown', text:'Interface-Status, Layer 2 und Kommunikationsversuche sind nicht dokumentiert.', explanation:'Passende Adressen allein belegen keinen funktionierenden Übertragungsweg.'},
  timeout: {answer:'unknown', text:'Ein Ping blieb ohne Antwort. Interface-Status und Filterregeln sind unbekannt.', explanation:'Eine ausbleibende ICMP-Antwort kann durch Filter entstehen. Sie beweist allein weder Erreichbarkeit noch das Fehlen jeder Kommunikation.'},
  sameVlan: {answer:'unknown', text:'Beide Anschlüsse sind für dasselbe VLAN vorgesehen. Betriebszustand und Kommunikationsversuche sind unbekannt.', explanation:'Die vorgesehene VLAN-Zuordnung genügt ohne Informationen über den tatsächlichen Betriebszustand nicht als Nachweis.'},
} as const;
export type GatewayV2Problem = {family:'gateway-v2'; mode:'membership'|'connectivity'; pc:string; gateway:string; evidence?:keyof typeof GATEWAY_EVIDENCE};

export function createGatewayV2(seed:string,difficulty:Recipe['difficulty']):Question {
  const level=['beginner','intermediate','advanced'].indexOf(difficulty);
  if(typeof seed!=='string'||!seed.length||seed.length>256||level<0)throw Error('Ungültiges E02-v2-Rezept');
  let state=2166136261;
  for(const c of `practice|E02|2|${difficulty}|${seed}`)state=Math.imul(state^c.charCodeAt(0),16777619)>>>0;
  const next=(n:number)=>{state=(state+0x6d2b79f5)>>>0;let v=state;v=Math.imul(v^(v>>>15),v|1);v^=v+Math.imul(v^(v>>>7),v|61);return Math.floor(((v^(v>>>14))>>>0)/2**32*n);};
  const mode=next(2)===0?'membership':'connectivity';
  const prefixes=[[23,25,26],[22,23,25,26,27],[20,22,23,25,26,27,28]][level];
  const prefix=prefixes[next(prefixes.length)],size=2**(32-prefix);
  const start=10*2**24+(16+next(200))*65536+next(8)*size;
  const ip=(n:number)=>[24,16,8,0].map(s=>(n>>>s)&255).join('.');
  const pc=`${ip(start+2+next(Math.min(10,size-4)))}/${prefix}`;
  // Both modes use independent draws. Address appearance never determines the evidence.
  const offset=mode==='membership'?[1,0,size-1,size+1][next(4)]:1;
  const evidence=mode==='connectivity'?(Object.keys(GATEWAY_EVIDENCE) as (keyof typeof GATEWAY_EVIDENCE)[])[next(9)]:undefined;
  const problem:GatewayV2Problem={family:'gateway-v2',mode,pc,gateway:ip(start+offset),...(evidence?{evidence}:{})};
  const task=mode==='membership'?'Liegt die Gateway-Adresse rechnerisch im Subnetz des PCs?':'Ist das Gateway vom PC aus tatsächlich erreichbar?';
  return {id:JSON.stringify(['practice','gateway',2,2,difficulty,'gateway',seed]),kind:'gateway',contentVersion:2,
    recipe:{family:'cidr',scenario:'gateway',seed,difficulty,version:2},problem,title:'E02 · Gateway und Subnetz · v2',task,
    data:[`PC: ${pc}`,`Gateway: ${problem.gateway}`,...(evidence?[`Beobachtung: ${GATEWAY_EVIDENCE[evidence].text}`]:[])],
    fields:[{id:'local',label:mode==='membership'?'Rechnerische Zugehörigkeit?':'Tatsächliche Erreichbarkeit?',type:'choice',options:[{value:'yes',label:'yes'},{value:'no',label:'no'},{value:'unknown',label:'unknown'}]}]};
}

export function gatewayV2Result(p:GatewayV2Problem):{answer:'yes'|'no'|'unknown';explanation:string} {
  if(p.mode==='connectivity') {
    if(!p.evidence)throw Error('E02 v2 benötigt eine dokumentierte Beobachtung');
    return {answer:GATEWAY_EVIDENCE[p.evidence].answer,explanation:GATEWAY_EVIDENCE[p.evidence].explanation};
  }
  const n=subnet(p.pc),g=address(p.gateway),inside=g>=n.start&&g<=n.end,f=facts(p.pc);
  const reserved=inside&&(g===n.start||g===n.end);
  return {answer:inside?'yes':'no',explanation:`PC-Netz: ${f.network}/${f.prefix}, Broadcast ${f.broadcast}. ${inside?'Die Gateway-Adresse gehört rechnerisch zu diesem Subnetz.':'Die Gateway-Adresse liegt außerhalb dieses Subnetzes.'}${reserved?' Netz- und Broadcastadresse gehören mathematisch dazu, sind aber keine konventionell nutzbaren Gateway-Hostadressen.':''} Diese Frage bewertet nur die rechnerische Zugehörigkeit; fehlende Layer-2-Angaben ändern das Ergebnis nicht.`};
}
