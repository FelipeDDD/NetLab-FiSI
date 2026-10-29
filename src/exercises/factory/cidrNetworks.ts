import { check, device, fixedAddresses, networkDraft, pingPairs, route, setAddress, topology } from './networkTools';
import type { NetworkDraft } from './types';
import type { SaveFile } from '../../engine/serialize';

function practical(id:string, initial:SaveFile, solved:SaveFile, title:string, task:string, explanation:string, ids=['a','b']):NetworkDraft {
  const d=networkDraft({id:`${id}-praxis`,group:'E',difficulty:['e01','e06'].includes(id)?'beginner':id==='e12'?'advanced':'intermediate',
    title, situation:explanation, task, initial,solved,
    assessments:[...fixedAddresses(solved),...solved.devices.filter(d=>d.kind==='router').map(d=>check(`forward-${d.id}`,'config',{type:'forwarding',device:d.id,expect:true})),
      {id:'preservation',requirementId:'config',kind:'manual',procedure:'Vergleichen Sie Kabel, VLANs, nicht freigegebene Adressen und Routen mit Ausgangszustand und Auftrag. Lassen Sie die ARP-/Routingentscheidung erklären.',reason:'Ping und IPv4-Prüfer beweisen weder VLAN-Vorgaben noch den Diagnoseweg.'},...pingPairs(ids)],
    explanation,alternatives:['Jeder Eingabeweg mit den geforderten Endwerten ist zulässig. Bei Routingaufgaben sind funktional gleichwertige Zielrouten statt Default-Routen erlaubt, sofern alle geforderten Ziele erreichbar bleiben.'],
    wrong:['Eine erfolgreiche Stichprobe als Beweis aller Konfigurationsvorgaben werten.','Nicht freigegebene Geräte oder Kabel entfernen, um die Prüfung zu umgehen.'],
    limits:['Automatisch: vorgegebene IPv4-Werte, Router-Forwarding und bidirektionale ICMP-Proben. Manuell: Layer-2-Erhalt, Diagnose und ausschließlich erlaubte Änderungen. Kein neuer VLAN-Prüfer.']});
  return d;
}
function lan(a:string,b:string) {
  return topology([['host','a','PC A',[a]],['host','b','PC B',[b]],['switch','sw','Zugang',[]]],
    [['a','eth0','sw','eth0'],['b','eth0','sw','eth1']]);
}
function routed() {
  const f=topology([['host','a','Büro',['192.168.10.50/24']],['server','b','Archiv',['192.168.11.60/24']],
    ['router','r','Router',['192.168.10.1/24','192.168.11.1/24']]],
    [['a','eth0','r','eth0'],['b','eth0','r','eth1']]);
  route(f,'a','0.0.0.0/0','192.168.10.1'); route(f,'b','0.0.0.0/0','192.168.11.1');
  return f;
}
function build():Record<string,NetworkDraft> {
  const same=lan('192.168.10.50/23','192.168.11.60/23');
  const healthy=lan('192.168.10.50/16','192.168.11.60/16');
  const vlan=lan('192.168.10.50/23','192.168.11.60/23');
  device(vlan,'sw').vlans={eth0:10,eth1:20};
  const vlanSolved=structuredClone(vlan); device(vlanSolved,'sw').vlans={eth0:10,eth1:10};
  const mixed=lan('192.168.10.50/23','192.168.11.60/24');
  const mixedSolved=structuredClone(mixed); setAddress(mixedSolved,'b',0,'192.168.11.60/23');
  const routeSolved=routed(), wrongGateway=structuredClone(routeSolved), broad=structuredClone(routeSolved);
  device(wrongGateway,'a').routes[0].via='192.168.10.254';
  setAddress(broad,'a',0,'192.168.10.50/16');
  const company=topology([['host','a','Büro',['10.60.0.10/22']],['host','b','Lager',['10.60.4.10/25']],
    ['server','c','Archiv',['10.60.4.130/26']],['router','r','Zentrale',['10.60.0.1/22','10.60.4.1/25','10.60.4.129/26']]],
    [['a','eth0','r','eth0'],['b','eth0','r','eth1'],['c','eth0','r','eth2']]);
  route(company,'a','0.0.0.0/0','10.60.0.1'); route(company,'b','0.0.0.0/0','10.60.4.1'); route(company,'c','0.0.0.0/0','10.60.4.129');
  const companyInitial=structuredClone(company);
  setAddress(companyInitial,'a',0,'10.60.0.10/16'); device(companyInitial,'b').routes[0].via='10.60.4.126';
  return {
    e01:practical('e01',same,structuredClone(same),'Unterschiedliche Oktette — Nachweis','Nichts umkonfigurieren: beide Adressen und /23 erhalten. Kommunikation in beiden Richtungen nachweisen.','192.168.10.0/23 umfasst auch 192.168.11.x. Beide Switchports gehören standardmäßig VLAN 1 an.'),
    e05:practical('e05',vlan,vlanSolved,'Die falsche Reparatur — VLAN','IPv4 und Kabel beibehalten. Ausschließlich sw/eth1 von VLAN 20 in das vorgegebene VLAN 10 ändern.','A hängt an sw/eth0 in VLAN 10, B an sw/eth1 in VLAN 20. Ohne Router zwischen diesen VLANs wird ARP nicht übermittelt. Eine breitere Maske kann das nicht ändern.'),
    e06:practical('e06',healthy,structuredClone(healthy),'Es funktioniert trotzdem — unverändert','Keine Änderung erforderlich. /16-Adressen und VLAN 1 erhalten und beide Richtungen prüfen.','Beide Adressen sind gültige Hosts in 192.168.0.0/16; im gemeinsamen VLAN antwortet der Nachbar direkt auf ARP.'),
    e07:practical('e07',mixed,mixedSolved,'Unterschiedliche Masken — Rückweg','A und beide Hostadressen beibehalten. B auf das vorgegebene gemeinsame /23 korrigieren. Kein Router ist vorhanden.','A hält B für lokal, B hält A für entfernt. Ohne Gateway scheitert der Rückweg. Die Referenz vereinheitlicht die Maske auf /23.'),
    e08:practical('e08',wrongGateway,routeSolved,'Gateway-Irrtum — Next Hop','Alle IPv4-Werte erhalten. Nur den Next Hop von A auf den dokumentierten Router 192.168.10.1 korrigieren.','Die Adresse .254 ist ein nutzbarer Host des lokalen /24, aber dort existiert kein Router. Mathematisch lokal ist nicht gleich funktionsfähig.'),
    e09:practical('e09',broad,structuredClone(routeSolved),'Zu großes Netzwerk — ARP','Nur A von /16 auf das dokumentierte Büro-Präfix /24 korrigieren. Hostadresse, Gateway, Router und Archiv unverändert lassen.','Der Router trennt 192.168.10.0/24 und 192.168.11.0/24. A verwendet zunächst /16 und fragt nach dem entfernten Archiv per ARP auf dem Bürosegment. Es gibt kein Proxy-ARP.'),
    e12:practical('e12',companyInitial,company,'Firmennetz — zwei unabhängige Fehler','A auf das dokumentierte Büro-/22 korrigieren. Lagers Next Hop auf 10.60.4.1 korrigieren. Archiv, Router, Kabel und Hostadressen erhalten. Alle drei Endgeräte müssen sich gegenseitig erreichen.',
      'Büro: 10.60.0.0/22, Lager: 10.60.4.0/25, Archiv: 10.60.4.128/26. A umgeht durch /16 den Router; Lager verwendet einen unbesetzten lokalen Next Hop .126. Archiv ist korrekt. Kein Umbau der drei Connected-Netze ist notwendig.',['a','b','c']),
  };
}
export const CIDR_PRACTICE = build();
