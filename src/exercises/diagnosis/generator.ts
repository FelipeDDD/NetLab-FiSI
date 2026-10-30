/** Internal authoring prototype. Never registered in the learner catalogs.
 * Recipe version 1 is independent of the fixed pilot and E02 v1/v2.
 * Only the existing pure IPv4 math helpers are reused; no simulation instances.
 */
import { facts, subnet } from '../factory/math';
import type { DiagnosisPilotCase, PilotEvidence, PilotQuestion } from './pilot';

export type DiagnosisDifficulty = 'beginner' | 'intermediate' | 'advanced';
const all = ['beginner', 'intermediate', 'advanced'] as const;
const upper = ['intermediate', 'advanced'] as const;
export const DIAGNOSIS_RECIPES = [
  { id: 'nd02-network', archetype: 'ND02', levels: all },
  { id: 'nd02-broadcast', archetype: 'ND02', levels: all },
  { id: 'nd02-host', archetype: 'ND02', levels: all },
  { id: 'nd02-outside', archetype: 'ND02', levels: upper },
  { id: 'nd02-self', archetype: 'ND02', levels: upper },
  { id: 'nd02-zero-host', archetype: 'ND02', levels: ['advanced'] },
  { id: 'nd05-timeout', archetype: 'ND05', levels: all },
  { id: 'nd05-partial', archetype: 'ND05', levels: upper },
  { id: 'nd05-tcp', archetype: 'ND05', levels: upper },
  { id: 'nd05-gateway', archetype: 'ND05', levels: upper },
  { id: 'nd05-drop', archetype: 'ND05', levels: ['advanced'] },
  { id: 'nd05-ingress', archetype: 'ND05', levels: ['advanced'] },
] as const;
export type DiagnosisRecipeId = typeof DIAGNOSIS_RECIPES[number]['id'];
export interface DiagnosisRecipe {
  version: 1;
  archetype: 'ND02' | 'ND05';
  difficulty: DiagnosisDifficulty;
  seed: string;
  recipe?: DiagnosisRecipeId;
}
export interface AddressEvidence {
  kind: 'address';
  pc: string;
  prefix: number;
  candidate: string;
  role: 'network' | 'broadcast' | 'host' | 'outside' | 'self' | 'zero-host';
}
export interface PingEvidence {
  kind: 'ping';
  source: string;
  target: string;
  gateway: string;
  sent: number;
  terminalReplies: number;
  ingressReplies: number | null;
  tcpReply: boolean;
  gatewayReply: boolean;
  requestDrops: number | null;
  identifier: number;
  port: number;
}
export interface GeneratedDiagnosis {
  recipe: DiagnosisRecipe & { recipe: DiagnosisRecipeId };
  data: AddressEvidence | PingEvidence;
  case: DiagnosisPilotCase;
}

// Own frozen namespace; no ambient random source or mutable global PRNG.
function random(key: string) {
  let state = 2166136261;
  for (let i = 0; i < key.length; i++) state = Math.imul(state ^ key.charCodeAt(i), 16777619) >>> 0;
  return (n: number) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return Math.floor(state / 2 ** 32 * n);
  };
}
const dotted = (n: number) => [24, 16, 8, 0].map(s => (n >>> s) & 255).join('.');
const yesNo = (value: boolean): 'yes' | 'no' => value ? 'yes' : 'no';
function definite(id: string, concept: PilotQuestion['concept'], prompt: string, basis: string[],
  answer: 'yes' | 'no', reasoning: string): PilotQuestion {
  return { id, concept, prompt, basis, answer, explanation: { reasoning } };
}
function uncertain(id: string, concept: PilotQuestion['concept'], prompt: string, basis: string[],
  reasoning: string, yes: string, no: string): PilotQuestion {
  return { id, concept, prompt, basis, answer: 'unknown', explanation: {
    reasoning, alternatives: { yes: 'Hypothetisches Beispiel: ' + yes, no: 'Hypothetisches Beispiel: ' + no },
  } };
}

export function generateDiagnosis(input: DiagnosisRecipe): GeneratedDiagnosis {
  if (!input || input.version !== 1 || !['ND02', 'ND05'].includes(input.archetype) ||
    !(all as readonly string[]).includes(input.difficulty) || typeof input.seed !== 'string' ||
    !input.seed.trim() || input.seed.length > 256) throw Error('Ungültiges Diagnose-Rezept');
  const available = DIAGNOSIS_RECIPES.filter(r => r.archetype === input.archetype &&
    (r.levels as readonly string[]).includes(input.difficulty));
  const selection = random(JSON.stringify(['diagnosis-selection', 1, input.archetype, input.difficulty, input.seed]));
  const recipeId = input.recipe === undefined ? available[selection(available.length)].id : input.recipe;
  if (!available.some(r => r.id === recipeId)) throw Error('Rezept passt nicht zu Archetyp oder Schwierigkeit');
  const recipe = { version: 1 as const, archetype: input.archetype, difficulty: input.difficulty, seed: input.seed, recipe: recipeId };
  // Normalized explicit recipe reproduces exactly the same variant as automatic selection.
  const key = JSON.stringify(['diagnosis-generated', 1, recipeId, input.difficulty, input.seed]);
  const next = random(key);
  const generated = input.archetype === 'ND02' ? addressCase(recipe, next) : pingCase(recipe, next);
  return { recipe, data: generated.data, case: {
    id: key, archetype: input.archetype, contentVersion: 1, ...generated.content,
  } };
}

function addressCase(recipe: GeneratedDiagnosis['recipe'], next: (n: number) => number) {
  const role = recipe.recipe.slice(5) as AddressEvidence['role'];
  const choices = role === 'zero-host' ? [20, 22, 23] :
    recipe.difficulty === 'beginner' ? [24, 25, 26] :
    recipe.difficulty === 'intermediate' ? [25, 26, 27, 28, 29, 30] : [16, 20, 22, 23, 27, 30];
  const prefix = choices[next(choices.length)], size = 2 ** (32 - prefix);
  // Stay inside private 10/8, with room for adjacent blocks. No special IPv4 ranges.
  const raw = 10 * 2 ** 24 + (32 + next(128)) * 65536 + next(65536);
  const start = Math.floor(raw / size) * size;
  let offset = 1 + next(size - 2);
  if (role === 'zero-host' && offset % 256 === 0) offset++;
  const pc = dotted(start + offset);
  let candidate: number;
  switch (role) {
    case 'network': candidate = start; break;
    case 'broadcast': candidate = start + size - 1; break;
    case 'outside': candidate = next(2) ? start - 1 : start + size; break;
    case 'self': candidate = start + offset; break;
    case 'zero-host': candidate = start + 256 * (1 + next(size / 256 - 1)); break;
    case 'host': {
      let other = 1 + next(size - 2);
      if (other === offset) other = other === size - 2 ? 1 : other + 1;
      candidate = start + other; break;
    }
  }
  const ip = dotted(candidate), cidr = pc + '/' + prefix, f = facts(cidr), n = subnet(cidr);
  const belongs = candidate >= n.start && candidate <= n.end;
  const usable = candidate > n.start && candidate < n.end && ip !== pc;
  const calculation = '/' + prefix + ' entspricht ' + f.mask + ' und umfasst ' + f.addresses +
    ' Adressen. Der Block reicht von ' + f.network + ' bis ' + f.broadcast +
    '; nutzbare Hosts liegen zwischen ' + f.first + ' und ' + f.last + '. ';
  const reason: Record<AddressEvidence['role'], string> = {
    network: ip + ' ist die Netzadresse. Sie gehört zum Block, ist hier aber keine Hostadresse.',
    broadcast: ip + ' ist der Broadcast dieses Blocks. Er gehört mathematisch dazu, bezeichnet aber keinen einzelnen Gateway-Host.',
    host: ip + ' liegt im Hostbereich und unterscheidet sich von der PC-Adresse ' + pc + '.',
    outside: ip + ' liegt jenseits einer Blockgrenze des PCs. Ein ähnlich aussehender Anfang ersetzt den Maskenvergleich nicht.',
    self: ip + ' ist die eigene PC-Adresse. Obwohl sie ein nutzbarer Host im Block ist, ist sie keine Adresse eines anderen lokalen Routers.',
    'zero-host': ip + ' endet zwar auf .0, liegt bei /' + prefix + ' aber innerhalb des Hostbereichs. Das letzte Oktett allein entscheidet nicht über eine Netzadresse.',
  };
  const evidence: PilotEvidence[] = [
    { id: 'addresses', kind: 'configuration', text: 'PC: ' + cidr + '; vorgeschlagene Gateway-Adresse: ' + ip + '.' },
    { id: 'scope', kind: 'premise', text: 'Bewertet wird nur die numerische Eignung als Adresse eines anderen lokalen Routers im gewöhnlichen IPv4-Broadcast-Subnetz (/0–/30). Netz, Broadcast und die eigene PC-Adresse scheiden aus; spezielle On-Link-Routen sind nicht Teil der Aufgabe. Ein Routerbetrieb unter der vorgeschlagenen Adresse wurde nicht geprüft.' },
  ];
  return { data: { kind: 'address', pc, prefix, candidate: ip, role } as AddressEvidence, content: {
    title: 'Gateway-Vorschlag prüfen',
    scenario: 'Prüfen Sie einen Eintrag im Adressplan, bevor er als Gateway übernommen wird.',
    evidence,
    questions: [
      definite('membership', 'membership', 'Gehört ' + ip + ' rechnerisch zum Subnetz des PCs?', ['addresses'],
        yesNo(belongs), calculation + reason[role] + ' Die Zugehörigkeit bewertet keine Erreichbarkeit.'),
      definite('gateway', 'gateway-address', 'Ist ' + ip + ' hinsichtlich Subnetzgrenzen und eigener PC-Adresse als Gateway-Adresse eines anderen lokalen Routers geeignet?',
        ['addresses', 'scope'], yesNo(usable), calculation + reason[role] +
        (usable ? ' Das ist eine numerische Eignung, kein Nachweis eines erreichbaren Routers.' :
          ' Daraus folgt keine Aussage über die Kommunikation des PCs mit anderen lokalen Hosts.')),
    ],
  } };
}

function pingCase(recipe: GeneratedDiagnosis['recipe'], next: (n: number) => number) {
  const id = recipe.recipe, second = 32 + next(128), third = 2 + next(100);
  const source = '10.' + second + '.' + third + '.' + (10 + next(180));
  const target = '10.' + second + '.' + (third + 1) + '.' + (10 + next(180));
  const gateway = '10.' + second + '.' + third + '.1';
  const sent = 3 + next(4), identifier = 1000 + next(50000), port = [80, 8080, 8000][next(3)];
  const terminalReplies = id === 'nd05-partial' ? 1 + next(sent - 1) : 0;
  const data: PingEvidence = { kind: 'ping', source, target, gateway, sent, terminalReplies,
    ingressReplies: id === 'nd05-ingress' ? sent : null,
    requestDrops: id === 'nd05-drop' ? sent : null,
    tcpReply: id === 'nd05-tcp', gatewayReply: id === 'nd05-gateway', identifier, port };
  const evidence: PilotEvidence[] = [
    { id: 'addresses', kind: 'configuration', text: 'A: ' + source + '/24; B: ' + target + '/24; Gateway von A: ' + gateway + '.' },
    { id: 'scope', kind: 'premise', text: 'Alle Angaben gehören zum selben kurzen Messintervall bei unveränderter Konfiguration. Beobachtete Antworten sind vertrauenswürdig ihrem Ziel und Test zugeordnet. Die folgenden Messungen bilden den gesamten vorliegenden Befund; zusätzliche Tests oder Konfigurationsdaten werden nicht vorausgesetzt.' },
    { id: 'test', kind: 'observation', text: 'Abgeschlossener Ping A → B, Kennung ' + identifier + ', Sequenzen 1–' + sent +
      '. Gesendet: ' + sent + ' Echo Requests; im Ping-Prozess empfangene zugeordnete Echo Replies: ' + terminalReplies +
      '; Timeouts: ' + (sent - terminalReplies) + '.' },
  ];
  const questions: PilotQuestion[] = [];
  const general = 'Ist im beschriebenen Messintervall grundsätzlich IP-Kommunikation zwischen A und B möglich?';
  if (id === 'nd05-timeout') {
    questions.push(
      definite('received', 'observation', 'Hat der Ping-Prozess auf A in diesem Test mindestens einen Echo Reply von B empfangen?',
        ['test'], 'no', 'Von ' + sent + ' Requests wurde kein Reply an den Ping-Prozess geliefert. Das beantwortet diese Beobachtungsfrage mit Nein, bestimmt aber weder den Verlustort noch die Verfügbarkeit anderer IP-Dienste.'),
      uncertain('communication', 'reachability', general, ['test', 'scope'],
        'Die ' + sent + ' Timeouts betreffen ICMP Echo. Ein Ergebnis für TCP oder UDP und eine Ursache sind daraus nicht ableitbar.',
        'B (' + target + ') beantwortet HTTP-Anfragen von A, während ein Filter nur Echo Requests verwirft. IP-Kommunikation funktioniert trotz aller Ping-Timeouts.',
        'B (' + target + ') ist ausgeschaltet, und seine IP wird von keinem anderen Gerät übernommen. Auch andere IP-Kommunikation mit B funktioniert dann nicht; derselbe Ping-Befund entsteht.'),
    );
  } else if (id === 'nd05-partial') {
    questions.push(
      definite('complete', 'observation', 'Wurde in diesem Test jeder Echo Request mit einem beim Ping-Prozess empfangenen Reply beantwortet?',
        ['test'], 'no', 'Der Ping-Prozess hat Antworten auf ' + terminalReplies + ' von ' + sent +
        ' Requests empfangen. Die übrigen Anfragen liefen in einen Timeout. Vollständiger Erfolg und wenigstens ein erfolgreicher Austausch sind verschiedene Aussagen.'),
      definite('communication', 'reachability', general, ['test', 'scope'], 'yes',
        'Mindestens ein zugeordneter Reply von ' + target + ' ist angekommen (insgesamt: ' + terminalReplies +
        '). Das belegt Austausch in beide Richtungen im Messintervall. Die weiteren Timeouts widerlegen diese Beobachtung nicht. Sie lassen weder die Verlustursache noch dauerhafte Zuverlässigkeit erkennen.'),
    );
  } else if (id === 'nd05-tcp') {
    evidence.push({ id: 'extra', kind: 'observation', text: 'Im selben Intervall empfängt A eine gültige HTTP-Antwort von B (' +
      target + ') auf eine Anfrage über TCP-Port ' + port + '.' });
    questions.push(
      definite('communication', 'reachability', general, ['test', 'extra', 'scope'], 'yes',
        'Die HTTP-Antwort von ' + target + ':' + port + ' setzt einen TCP/IP-Austausch voraus. Die Ping-Timeouts schließen also nicht jede IP-Kommunikation aus; sie betreffen einen anderen Test.'),
      uncertain('cause', 'cause', 'Ist eine Firewall die Ursache der Ping-Timeouts zu B?', ['test', 'extra', 'scope'],
        'HTTP funktioniert, ICMP Echo liefert keinen Reply. Damit ist eine protokollspezifische Ursache vereinbar, aber noch keine Firewall als Ursache bewiesen.',
        'Eine Firewall verwirft ausschließlich Echo Requests an ' + target + ' und lässt TCP-Port ' + port + ' zu. B würde Echo sonst beantworten; der Filter verursacht die Timeouts.',
        'Alle Filter lassen ICMP durch, aber der ICMP-Responder auf B ist deaktiviert. Der Webdienst läuft weiter. Die Timeouts entstehen ohne Firewall als Ursache.'),
    );
  } else if (id === 'nd05-gateway') {
    evidence.push({ id: 'extra', kind: 'observation', text: 'Ein separater Ping von A an ' + gateway +
      ' liefert im selben Intervall einen passend zugeordneten Echo Reply vom Gateway.' });
    questions.push(
      definite('target-proof', 'observation', 'Belegt die Antwort von ' + gateway + ' einen beobachteten ICMP-Austausch zwischen A und B (' + target + ')?',
        ['addresses', 'extra'], 'no', 'Die Antwort stammt von ' + gateway + ', nicht von ' + target +
        '. Sie belegt nur den getesteten Austausch mit dem Gateway, nicht Weiterleitung oder Rückweg zum Ziel B.'),
      uncertain('communication', 'reachability', general, ['test', 'extra', 'scope'],
        'Ein antwortendes Gateway klärt einen ersten Abschnitt. Es entscheidet nicht, ob das entfernte Ziel B kommunizieren kann oder weshalb der Ping zu B scheitert.',
        'Der Router vermittelt zu B (' + target + '), dessen Webdienst A antwortet; nur ICMP Echo zu B wird gefiltert. Gateway-Reply und Ziel-Timeouts passen zu funktionierender anderer Kommunikation.',
        'Das Gateway antwortet weiterhin lokal, aber B (' + target + ') ist ausgeschaltet, ohne Ersatz unter seiner IP. Austausch mit B funktioniert nicht. Beide Ping-Befunde bleiben gleich.'),
    );
  } else if (id === 'nd05-drop') {
    evidence.push({ id: 'extra', kind: 'observation', text: 'Am durchlaufenen Firewall-Gerät F werden alle Requests dieses Tests erfasst: Quelle ' +
      source + ', Ziel ' + target + ', ICMP Echo Request, Kennung ' + identifier + ', Sequenzen 1–' + sent +
      '. Das vertrauenswürdige Paketprotokoll ordnet jedem dieser Requests die Aktion DROP vor der Weiterleitung zu; diese verworfenen Pakete werden von F nicht ausgegeben.' });
    questions.push(
      definite('cause', 'cause', 'Hat die Filterung an F verhindert, dass diese Echo Requests B erreichen?',
        ['test', 'extra'], 'yes', 'Quelle, Ziel, Kennung und sämtliche Sequenzen stimmen mit dem Ping-Test überein. Die Requests wurden an F vor der Weiterleitung verworfen. Das ist ein belegtes Hindernis für diese Pakete, kein Beweis, dass es die einzige Störung der Verbindung ist.'),
      uncertain('communication', 'reachability', general, ['test', 'extra', 'scope'],
        'Die korrelierten DROP-Einträge erklären, warum diese Echo Requests F nicht verlassen. Sie messen weder andere Protokolle noch den Zustand von B hinter F.',
        'F sperrt nur Echo Requests, erlaubt aber HTTP. B (' + target + ') läuft und beantwortet A über TCP. Andere IP-Kommunikation ist möglich, obwohl genau diese Requests verworfen wurden.',
        'F verwirft dieselben Requests, und zusätzlich ist B (' + target + ') ausgeschaltet, ohne IP-Ersatz. Keine Kommunikation mit B funktioniert. Das DROP-Protokoll bleibt trotzdem genau gleich.'),
    );
  } else {
    evidence.push({ id: 'extra', kind: 'observation', text: 'Eine unabhängige, vollständige Eingangsmessung auf A vor lokalen Filtern erfasst ' +
      sent + ' Echo Replies von B (' + target + ') an A (' + source + '), Kennung ' + identifier +
      ', Sequenzen 1–' + sent + ', jeweils mit passender Nutzlast vor Ablauf des zugehörigen Timeouts.' });
    questions.push(
      definite('transit-loss', 'observation', 'Sind alle Echo Replies dieses Tests bereits im Transitnetz vor dem Netzwerkeingang von A verloren gegangen?',
        ['test', 'extra'], 'no', 'Alle ' + sent + ' Replies haben den gemessenen Eingang von A rechtzeitig erreicht. Die Timeouts im Ping-Prozess sind damit kein Nachweis ihres Verlusts im Transitnetz. Eingang am Gerät und Empfang im Prozess sind verschiedene Messpunkte.'),
      uncertain('cause', 'cause', 'Ist ein lokaler Eingangsfilter auf A die Ursache der Timeouts?', ['test', 'extra', 'scope'],
        'Die Replies liegen vor dem lokalen Filter rechtzeitig an, erreichen laut Testergebnis aber nicht den Ping-Prozess. Dieser Unterschied grenzt den Bereich ein, isoliert jedoch noch keine konkrete lokale Ursache.',
        'Ein lokaler ICMP-Eingangsfilter auf A verwirft die gemessenen Replies nach dem Messpunkt. Ohne diesen Filter würden sie den funktionsfähigen Ping-Prozess erreichen.',
        'Der lokale Filter lässt die Replies passieren, aber der Ping-Prozess verarbeitet sie wegen eines lokalen Softwarefehlers nicht korrekt und meldet Timeouts. Die Ursache liegt dann im Prozess, nicht im Filter.'),
    );
  }
  return { data, content: {
    title: 'Ping-Befund einordnen',
    scenario: 'Bewerten Sie den vorliegenden Messbericht. Unterscheiden Sie Testergebnis, Kommunikation und Fehlerursache.',
    evidence, questions,
  } };
}
