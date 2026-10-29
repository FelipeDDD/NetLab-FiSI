/** Authoring only: explicit pilot allowlist. Never import this file from the application. */
import { CIDR_PRACTICE } from './factory/cidrNetworks';
import { ROUTING_DRAFTS } from './factory/routing';
import { restoreNetwork, serializeNetwork } from '../engine/serialize';
import { disposeNetwork } from '../engine/networkLifecycle';
import type { PracticalCriterion, PracticalExercise, StructurePolicy } from './practicalTypes';
import type { NetworkDraft } from './factory/types';

const sources=[CIDR_PRACTICE.e06,CIDR_PRACTICE.e08,CIDR_PRACTICE.e09,ROUTING_DRAFTS.find(d=>d.id==='factory-d02-statische-routen')!];
const copy:{code:string;title:string;description:string;task:string;addressing:string;routingText:string;editable:StructurePolicy['editable'];routes:[string,string,string|null,string][]}[]=[
  {code:'E06',title:'Ungewöhnliche Adressen im selben LAN',description:'PC A und PC B verwenden unterschiedliche dritte Oktette. Untersuchen Sie, ob die bestehende Konfiguration die lokale Kommunikation ermöglicht. Es ist nicht vorausgesetzt, dass ein Fehler vorliegt.',
    task:'Beurteilen Sie die Adressen anhand der vorhandenen Masken und prüfen Sie beide Kommunikationsrichtungen. Falls die Vorgaben bereits erfüllt sind, ist keine Änderung erforderlich. Erhalten Sie die gesamte Netzkonfiguration.',
    addressing:'Die dokumentierten /16-Hostadressen bleiben erhalten.',routingText:'Die direkte Zustellung im gemeinsamen LAN funktioniert ohne zusätzliches Gateway.',
    editable:{}, routes:[['a','192.168.11.60',null,'eth0'],['b','192.168.10.50',null,'eth0']]},
  {code:'E08',title:'Archiv nicht erreichbar: Next Hop untersuchen',description:'Büro und Archiv liegen in zwei getrennten /24-Segmenten. Die Routerinterfaces und das Archiv sind vorkonfiguriert. Prüfen Sie auf Büro, wie Pakete zum entfernten Archiv zugestellt werden.',
    task:'Stellen Sie die Kommunikation zum Archiv in beiden Richtungen her. Verändern Sie ausschließlich Büros Routen oder Gateway-Eintrag; Hostadressen, Masken und alle anderen Konfigurationen bleiben erhalten. Eine passende Zielroute ist ebenso zulässig wie ein funktionierender Default.',
    addressing:'Alle dokumentierten IPv4-Adressen und /24-Masken bleiben erhalten.',routingText:'Büro wählt für das Archiv den angeschlossenen Router als Next Hop; der Rückweg bleibt erhalten.',
    editable:{a:{routes:true,gatewayIfaces:['eth0']}},routes:[['a','192.168.11.60','192.168.10.1','eth0'],['b','192.168.10.50','192.168.11.1','eth0']]},
  {code:'E09',title:'ARP oder Gateway? Maskenentscheidung untersuchen',description:'Laut Netzplan verbindet der Router das Bürosegment 192.168.10.0/24 mit dem Archivsegment 192.168.11.0/24. Die Routerinterfaces, Gateways und das Archiv sind eingerichtet. Prüfen Sie die lokale Zustellentscheidung von Büro.',
    task:'Stellen Sie die vorgesehene /24-Adressierung auf Büro und die gegenseitige Erreichbarkeit her. Nur die Maske von Büro darf geändert werden. Die Hostadresse, Gateways, Routen und der übrige Netzaufbau bleiben erhalten.',
    addressing:'Die Endgeräte entsprechen den beiden dokumentierten /24-Segmenten; Hostadressen bleiben erhalten.',routingText:'Beide Endgeräte verwenden für das entfernte Ziel den vorhandenen Router, statt dort lokal nach ARP zu fragen.',
    editable:{a:{ipIfaces:['eth0']}},routes:[['a','192.168.11.60','192.168.10.1','eth0'],['b','192.168.10.50','192.168.11.1','eth0']]},
  {code:'D02',title:'Zwei Standorte: Hin- und Rückweg',description:'Büro und Lager besitzen ihre lokalen Gateways. Die Router West und Ost sind über ein /30-Transitnetz verbunden. Stellen Sie fest, welche Wege für den Austausch zwischen den beiden Endgeräten benötigt werden.',
    task:'Ergänzen oder korrigieren Sie ausschließlich statische Routen auf West und Ost. Alle Adressen, Interfacezustände und aktives Forwarding bleiben erhalten. Spezifische Zielrouten oder funktional gleichwertige Default-Routen sind in dieser abgeschlossenen Topologie zulässig. Prüfen Sie Büro und Lager gegenseitig.',
    addressing:'LAN- und Transitadressen mit ihren vorgegebenen Masken bleiben erhalten.',routingText:'West und Ost wählen für das jeweils entfernte Endgerät den Transitnachbarn; Forwarding bleibt aktiv.',
    editable:{west:{routes:true},east:{routes:true}},routes:[['west','10.72.2.10','10.72.254.2','eth1'],['east','10.72.1.10','10.72.254.1','eth0']]},
];

/** Canonical restoration matches what the student actually receives, without exposing references. */
function canonicalInitial(source:NetworkDraft) {
  const file=source.student.initialTopology,net=restoreNetwork(structuredClone(file));
  try {return serializeNetwork(net,Object.fromEntries(file.devices.map(d=>[d.id,{x:d.x,y:d.y}])));}
  finally {disposeNetwork(net);}
}
export const PRACTICAL_STUDENTS:PracticalExercise[]=sources.map((source,index)=>{
  const c=copy[index];
  return {id:`pilot-${c.code.toLowerCase()}-v1`,contentVersion:1,pilot:true,difficulty:source.difficulty,
    manualReview:['Erklären Sie die lokale ARP-Entscheidung und gegebenenfalls den Hin- und Rückweg. Diese Begründung wird nicht automatisch bewertet. Technisch bestanden bedeutet keinen Nachweis des Diagnosewegs oder aller denkbaren Netzwerkdienste.'],
    student:{title:`${c.code} · ${c.title} (Beta)`,description:c.description,task:c.task,initialTopology:canonicalInitial(source),
      learningObjectives:[{id:'diagnose',text:'Adressierung, Zustellentscheidung und Erreichbarkeit getrennt untersuchen.'},{id:'preserve',text:'Nur freigegebene Änderungen vornehmen und die Netzstruktur erhalten.'}],
      requirements:[
        {id:'addressing',objectiveIds:['diagnose'],evidence:'final',text:c.addressing},
        {id:'routing',objectiveIds:['diagnose'],evidence:'final',text:c.routingText},
        {id:'traffic',objectiveIds:['diagnose'],evidence:'final',text:'Die geforderten Endgeräte erreichen sich per ICMP in beiden Richtungen.'},
        {id:'structure',objectiveIds:['preserve'],evidence:'final',text:'Geräte, Ports, Kabel und nicht freigegebene Netzkonfigurationen bleiben erhalten. Namen, Positionen und visuelle Einstellungen dürfen verändert werden.'},
      ]}};
});
export const PRACTICAL_RULES:Record<string,PracticalCriterion[]>=Object.fromEntries(sources.map((source,index)=>{
  const c=copy[index],exercise=PRACTICAL_STUDENTS[index];
  const engine:PracticalCriterion[]=source.review.assessments.flatMap(a=>{
    if(a.kind!=='engine')return [];
    const type=a.check.type, requirementId=type==='ping'?'traffic':type==='forwarding'?'routing':'addressing';
    const label=type==='iface-ip'?`${a.check.device} / ${a.check.iface}`:type==='ping'?`${a.check.from} → ${a.check.toDevice}`:type==='forwarding'?`${a.check.device}: IP-Forwarding`:a.id;
    return [{...a,requirementId,label,
      success:type==='ping'?'ICMP-Antwort empfangen.':type==='forwarding'?'Weiterleitung ist aktiv.':'Adresse und Maske entsprechen der Vorgabe.',
      failure:type==='ping'?'Keine erfolgreiche ICMP-Antwort. Prüfen Sie Hinweg, Rückweg und Interfacezustände.':type==='forwarding'?'Die geforderte Weiterleitung ist nicht aktiv.':'Adresse oder Maske entspricht noch nicht der Netzvorgabe.'}];
  });
  const routes:PracticalCriterion[]=c.routes.map(([device,target,via,iface],i)=>({id:`route-${i}`,requirementId:'routing',kind:'route',device,target,via,iface,
    label:`${device}: Weg zu ${target}`,success:via===null?'Das Ziel wird direkt im lokalen Segment zugestellt.':'Die Route verwendet den vorgesehenen Nachbarn und Ausgang.',
    failure:'Die effektive Route zum geforderten Ziel fehlt oder verwendet einen ungeeigneten Next Hop/Ausgang. Prüfen Sie Maske, Route und Rückweg.'}));
  const structure:PracticalCriterion={id:'preserve-structure',requirementId:'structure',kind:'structure',policy:{editable:c.editable},label:'Netzstruktur und geschützte Konfiguration',
    success:'Netzstruktur und nicht freigegebene Einstellungen sind erhalten.',failure:'Die Verbindung allein genügt nicht: Netzstruktur oder geschützte Einstellungen wurden verändert. Erlaubt sind nur die im Auftrag genannten Änderungen.'};
  return [exercise.id,[structure,...engine,...routes]];
}));
// Test/author-only references. This export is never written to a public projection.
export const PRACTICAL_SOURCES=Object.fromEntries(PRACTICAL_STUDENTS.map((e,i)=>[e.id,sources[i]]));
