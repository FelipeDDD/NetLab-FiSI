/** Internal, explicitly bounded reasoning model; never a substitute for an engine probe.
 * Assumptions: static IPv4, ordinary broadcast subnets, no proxy ARP/NAT/extra routes,
 * interfaces UP, unique addresses, and no host filters unless an input is invalid. */
import { ipToString } from '../../engine/ip';
import { address, facts, network, subnet, type Grade } from './math';

export interface CidrCase {
  id: string;
  a: string;
  b: string;
  layer2: 'same' | 'separate' | 'unknown';
  /** working explicitly includes forwarding, remote routing, return path and permissive filters. */
  routedPath: 'working' | 'absent' | 'unknown';
  gatewayA?: string;
  gatewayB?: string;
  /** Actual local router addresses, when documented; omission is not proof of absence. */
  routerA?: string;
  routerB?: string;
}
export type CidrProblem = { family: 'cidr' } & (
  | { mode: 'diagnosis'; cases: CidrCase[] }
  | { mode: 'plan'; parent: string; hosts: number; allowedPrefixes: number[] }
);
export type Diagnosis = 'none' | 'invalid-host' | 'gateway' | 'vlan' | 'subnet-boundary' | 'asymmetric' | 'remote-arp' | 'unknown';
export type Connectivity = 'possible' | 'blocked' | 'undetermined';
type Gateway = 'absent' | 'in-subnet' | 'outside' | 'unusable';
const usable = (ip: string, cidr: string) => { const n = address(ip), s = subnet(cidr); return n > s.start && n < s.end; };
const local = (destination: string, cidr: string) => { const n = address(destination), s = subnet(cidr); return n >= s.start && n <= s.end; };
function gateway(ip: string | undefined, cidr: string): Gateway {
  if (ip === undefined) return 'absent';
  if (!local(ip, cidr)) return 'outside';
  return usable(ip, cidr) && address(ip) !== address(cidr.split('/')[0]) ? 'in-subnet' : 'unusable';
}
function validateCase(c: CidrCase) {
  if (!c || typeof c.id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(c.id) ||
    !['same','separate','unknown'].includes(c.layer2) || !['working','absent','unknown'].includes(c.routedPath)) throw Error('Ungültiger Diagnosefall');
  subnet(c.a); subnet(c.b);
  for (const value of [c.gatewayA,c.gatewayB,c.routerA,c.routerB]) if (value !== undefined) address(value);
  if (c.routedPath === 'working' && c.layer2 === 'same') throw Error('Gerouteter Referenzpfad verlangt getrennte oder unbekannte Segmente');
  // A deliberately wrong client mask may exclude its real router; a self address is never a router.
  if (c.routerA === c.a.split('/')[0] || c.routerB === c.b.split('/')[0]) throw Error('Router und Client dürfen keine identische Adresse haben');
}
export function diagnose(c: CidrCase) {
  validateCase(c);
  const aIp = c.a.split('/')[0], bIp = c.b.split('/')[0];
  const localA = local(bIp,c.a), localB = local(aIp,c.b), gatewayA = gateway(c.gatewayA,c.a), gatewayB = gateway(c.gatewayB,c.b);
  const validHosts = usable(aIp,c.a) && usable(bIp,c.b) && address(aIp) !== address(bIp);
  const configuration = validHosts && ![gatewayA,gatewayB].some(g=>g==='outside'||g==='unusable') ? 'valid' : 'invalid';
  let connectivity: Connectivity = 'undetermined', diagnosis: Diagnosis = 'unknown';
  if (!validHosts) { connectivity='blocked'; diagnosis='invalid-host'; }
  else if (localA && localB) {
    if (c.layer2==='same') { connectivity='possible'; diagnosis='none'; }
    else if (c.layer2==='separate') { connectivity='blocked'; diagnosis=c.routedPath==='working'?'remote-arp':'vlan'; }
  } else {
    const sides = [
      { local:localA, state:gatewayA, given:c.gatewayA, actual:c.routerA },
      { local:localB, state:gatewayB, given:c.gatewayB, actual:c.routerB },
    ];
    if (sides.some(s=>!s.local && (s.state!=='in-subnet'||s.actual!==undefined && s.given!==s.actual))) {
      connectivity='blocked'; diagnosis=localA!==localB?'asymmetric':gatewayA==='absent'&&gatewayB==='absent'?'subnet-boundary':'gateway';
    } else if (c.layer2==='separate' && (localA||localB)) {
      connectivity='blocked'; diagnosis=c.routedPath==='working'?'remote-arp':'asymmetric';
    } else if (c.routedPath==='absent') { connectivity='blocked'; diagnosis=localA!==localB?'asymmetric':'subnet-boundary'; }
    else if (c.routedPath==='working' && sides.every(s=>!s.local&&s.actual!==undefined)) { connectivity='possible'; diagnosis='none'; }
  }
  return { id:c.id, a:facts(c.a), b:facts(c.b), localA, localB, gatewayA, gatewayB, configuration, connectivity, diagnosis };
}
export function explainCase(c: CidrCase): string {
  const r=diagnose(c);
  const reason: Record<Diagnosis,string> = {
    none:'Unter den ausdrücklich genannten Bedingungen ist der Austausch möglich. Ein Ping allein beweist keine fehlerfreie Gesamtkonfiguration.',
    'invalid-host':'Netz-/Broadcastadresse oder doppelte Hostadresse: zunächst die Adressvergabe korrigieren.',
    gateway:'Der konfigurierte Next Hop liegt außerhalb des lokalen Hostbereichs oder entspricht nicht dem dokumentierten Router.',
    vlan:'Die IP-Zugehörigkeit überbrückt keine getrennten Layer-2-Segmente. Eine größere Maske repariert keine VLAN-Trennung.',
    'subnet-boundary':'Die Grenze des Subnetzes wird überschritten. Ohne nutzbaren gerouteten Hin- und Rückweg reicht das Kabel nicht aus.',
    asymmetric:'Die Endgeräte entscheiden unterschiedlich über lokale Zustellung. Ein fehlender Next Hop oder Rückweg verhindert den vollständigen Austausch.',
    'remote-arp':'Mindestens ein Client hält das entfernte Ziel für lokal und sendet ARP im falschen Segment. Der Router wird für dieses Ziel umgangen.',
    unknown:'Nicht eindeutig bestimmbar: IP-Zugehörigkeit und ein lokales Gateway beweisen weder Layer-2-Verbindung noch Routing, Forwarding, Filter und Rückweg.',
  };
  return `${c.id}: A: ${r.a.network}/${r.a.prefix}, Maske ${r.a.mask}, Broadcast ${r.a.broadcast}; B: ${r.b.network}/${r.b.prefix}, Maske ${r.b.mask}, Broadcast ${r.b.broadcast}. A behandelt B ${r.localA?'lokal (ARP für B)':'als entfernt (Gateway nötig)'}, B behandelt A ${r.localB?'lokal (ARP für A)':'als entfernt (Gateway nötig)'}. ${reason[r.diagnosis]}`;
}
function planInput(p: Extract<CidrProblem,{mode:'plan'}>) {
  const n=network(p.parent);
  if (!Number.isSafeInteger(p.hosts)||p.hosts<2||!Array.isArray(p.allowedPrefixes)||!p.allowedPrefixes.length||new Set(p.allowedPrefixes).size!==p.allowedPrefixes.length||
    p.allowedPrefixes.some(v=>!Number.isInteger(v)||v<n.prefix||v>30)||!p.allowedPrefixes.some(v=>2**(32-v)-2>=p.hosts)) throw Error('Unlösbarer oder ungültiger Adressplan');
  return n;
}
export function solveCidr(p: CidrProblem): unknown {
  if (p.mode==='diagnosis') {
    if (!Array.isArray(p.cases)||!p.cases.length||new Set(p.cases.map(c=>c.id)).size!==p.cases.length) throw Error('Eindeutige Diagnosefälle erforderlich');
    return { rows:p.cases.map(diagnose) };
  }
  if (p.mode!=='plan') throw Error('Unbekannter CIDR-Modus');
  const n=planInput(p), prefix=Math.max(...p.allowedPrefixes.filter(v=>2**(32-v)-2>=p.hosts));
  return { cidr:`${ipToString(n.start)}/${prefix}`, addresses:[ipToString(n.start+1),ipToString(n.start+2)] };
}
// Explicit answer equivalences; no fuzzy free-text grading or order-dependent object equality.
const aliases: Record<string,string> = { 'nicht eindeutig bestimmbar':'undetermined', 'möglich':'possible', 'nicht möglich':'blocked', 'gültig':'valid', 'ungültig':'invalid' };
function canonical(value: unknown, key=''): unknown {
  if (typeof value==='string') {
    const v=value.trim();
    if (key==='prefix' && /^\/?\d{1,2}$/.test(v)) return Number(v.replace('/',''));
    if (key==='mask' && /^\/\d{1,2}$/.test(v)) return facts(`0.0.0.0${v}`).mask;
    return aliases[v.toLowerCase()]??v;
  }
  if (Array.isArray(value)) return value.map(v=>canonical(v)).sort((a,b)=>String((a as {id?:string})?.id).localeCompare(String((b as {id?:string})?.id)));
  if (value && typeof value==='object') return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v,k)]));
  return value;
}
export function gradeCidr(p:CidrProblem, answer:unknown): Grade {
  try {
    const expected=solveCidr(p);
    if (p.mode==='diagnosis') {
      const feedback=p.cases.map(explainCase);
      const pass=JSON.stringify(canonical(answer))===JSON.stringify(canonical(expected));
      return { pass, issues:pass?[]:['Mathematische Grenzen, lokale Entscheidungen und Netznachweis getrennt prüfen.',...feedback], feedback };
    }
    const parent=planInput(p);
    if (!answer||typeof answer!=='object'||Array.isArray(answer)) throw Error('Netz und zwei Hostadressen angeben');
    const a=answer as {cidr:string;addresses:string[]};
    if (Object.keys(a).sort().join(',')!=='addresses,cidr') throw Error('Nur cidr und addresses angeben');
    const n=network(a.cidr);
    if (!p.allowedPrefixes.includes(n.prefix)||n.size-2<p.hosts||n.start<parent.start||n.end>parent.end) throw Error('Netz muss im Stammnetz liegen und die geforderte Hostzahl/Präfixauswahl erfüllen');
    if (!Array.isArray(a.addresses)||a.addresses.length!==2||new Set(a.addresses.map(address)).size!==2||a.addresses.some(ip=>!usable(ip,a.cidr))) throw Error('Zwei unterschiedliche nutzbare Hostadressen im gewählten Netz erforderlich');
    return { pass:true, issues:[], feedback:[`${n.cidr} bietet ${n.size-2} Hosts. Andere passende Netze, Präfixe und Adressen sind ebenfalls zulässig; Routing ist dadurch nicht bewiesen.`] };
  } catch(e) { return {pass:false,issues:[e instanceof Error?e.message:String(e)]}; }
}
