/** Internal authoring material only. No runtime registration, generator or grader.
 * Do not import into PracticePanel, model.ts, beta.ts or the published catalogs.
 * Explanation alternatives are learner content, not hidden grading metadata.
 */
export type DiagnosisConcept = 'membership' | 'gateway-address' | 'reachability' | 'observation' | 'cause';
export interface PilotEvidence {
  id: string;
  kind: 'configuration' | 'observation' | 'premise' | 'missing';
  text: string;
}
export type PilotQuestion = {
  id: string;
  concept: DiagnosisConcept;
  prompt: string;
  /** IDs of supplied evidence or explicitly missing information. */
  basis: readonly string[];
} & (
  | { answer: 'yes' | 'no'; explanation: { reasoning: string; alternatives?: never } }
  | { answer: 'unknown'; explanation: {
      reasoning: string;
      /** Hypothetical, compatible examples supporting/opposing the question's claim.
       * For a service question, success/failure concerns that service, not all IP traffic.
       */
      alternatives: { yes: string; no: string };
    } }
);
export interface DiagnosisPilotCase {
  id: string;
  archetype: 'ND01' | 'ND02' | 'ND05' | 'ND06';
  contentVersion: 1;
  title: string;
  scenario: string;
  evidence: readonly PilotEvidence[];
  questions: readonly PilotQuestion[];
}

export const NETWORK_DIAGNOSIS_PILOT: readonly DiagnosisPilotCase[] = [
  {
    id: 'nd01-01', archetype: 'ND01', contentVersion: 1,
    title: 'Gleiches Netz, ungeprüfte Verbindung',
    scenario: 'Zwei Arbeitsplätze sollen Dateien austauschen. Sie haben bisher nur die IP-Konfigurationen geprüft.',
    evidence: [
      { id: 'addresses', kind: 'configuration', text: 'A: 192.168.10.50/23; B: 192.168.11.60/23.' },
      { id: 'operation', kind: 'missing', text: 'Verkabelung, VLAN-Zuordnung, Betriebszustand und Filter sind unbekannt. Es liegt kein Kommunikationsversuch vor.' },
    ],
    questions: [
      { id: 'membership', concept: 'membership', prompt: 'Gehören die beiden IP-Adressen rechnerisch zum selben Subnetz?',
        basis: ['addresses'], answer: 'yes', explanation: {
          reasoning: '/23 entspricht 255.255.254.0. Beide Adressen liegen im Block 192.168.10.0–192.168.11.255. Der unterschiedliche dritte Oktettwert trennt sie hier nicht in zwei Subnetze. Damit ist nur die rechnerische Zugehörigkeit geklärt.',
        } },
      { id: 'communication', concept: 'reachability', prompt: 'Können A und B in ihrem aktuellen Zustand IP-Daten miteinander austauschen?',
        basis: ['addresses', 'operation'], answer: 'unknown', explanation: {
          reasoning: 'Passende IP-Adressen belegen keinen betriebsbereiten Übertragungsweg. Der tatsächliche Zustand ist nicht dokumentiert; die folgenden Beispiele sind Möglichkeiten, keine Beobachtungen.',
          alternatives: {
            yes: 'Hypothetisches Beispiel mit Kommunikation: Beide PCs sind aktiv, ihre Ports liegen im selben funktionierenden VLAN und Filter erlauben den Verkehr. Dann können sie einander direkt per ARP finden und IP-Daten austauschen.',
            no: 'Hypothetisches Beispiel ohne Kommunikation: A hat nur eine Netzwerkschnittstelle und deren Kabel ist abgezogen. Die gespeicherte /23-Konfiguration bleibt gleich, aber A hat keinen Netzwerkzugang.',
          },
        } },
    ],
  },
  {
    id: 'nd01-02', archetype: 'ND01', contentVersion: 1,
    title: 'Kein direktes Kabel zwischen den Switches',
    scenario: 'A hängt an Switch S1, B an Switch S2. Ein Kollege hält Kommunikation wegen der unterschiedlichen Netze und des fehlenden direkten Kabels für unmöglich.',
    evidence: [
      { id: 'addresses', kind: 'configuration', text: 'A: 10.30.1.10/24; B: 10.30.2.20/24.' },
      { id: 'switches', kind: 'premise', text: 'Zwischen S1 und S2 gibt es keinen direkten Link. Der vorliegende Planausschnitt ist unvollständig.' },
      { id: 'paths', kind: 'missing', text: 'Weitere Uplinks, Router, Gateway-Einträge, Routen, Filter und Betriebszustände sind nicht dokumentiert. Es gibt keine Testergebnisse.' },
    ],
    questions: [
      { id: 'membership', concept: 'membership', prompt: 'Gehören die beiden IP-Adressen rechnerisch zum selben Subnetz?',
        basis: ['addresses'], answer: 'no', explanation: {
          reasoning: 'Bei /24 liegen A in 10.30.1.0/24 und B in 10.30.2.0/24. Diese Netze sind verschieden. Daraus folgt jedoch nicht, dass kein Router zwischen ihnen vermitteln könnte.',
        } },
      { id: 'communication', concept: 'reachability', prompt: 'Können A und B in dieser Netzsituation IP-Daten miteinander austauschen?',
        basis: ['addresses', 'switches', 'paths'], answer: 'unknown', explanation: {
          reasoning: 'Verschiedene Subnetze benötigen einen passenden gerouteten Weg einschließlich Rückweg. Ein direkter Switch-Link ist dafür nicht erforderlich. Ein unvollständiger Plan zeigt weder, dass ein solcher Weg existiert, noch, dass er fehlt.',
          alternatives: {
            yes: 'Hypothetisches Beispiel mit Kommunikation: Beide Switches haben Uplinks zu einem aktiven Router. A nutzt 10.30.1.1 und B 10.30.2.1 als Gateway; Router, Rückweg und Filter erlauben den Austausch. Ein direkter Link S1–S2 ist nicht nötig.',
            no: 'Hypothetisches Beispiel ohne Kommunikation: S1 und S2 bilden zwei isolierte Inseln ohne weitere Uplinks oder Netzwerkzugänge. Dann fehlt ein Weg zwischen A und B. Diese vollständige Isolation ist im Planausschnitt aber nicht belegt.',
          },
        } },
    ],
  },
  {
    id: 'nd02-01', archetype: 'ND02', contentVersion: 1,
    title: 'Die erste Adresse im Block',
    scenario: 'Für einen Arbeitsplatz werden zwei Gateway-Adressen vorgeschlagen. Prüfen Sie zunächst nur die Adresswahl.',
    evidence: [
      { id: 'address', kind: 'configuration', text: 'PC: 192.168.50.70/26.' },
      { id: 'convention', kind: 'premise', text: 'Es gilt ein gewöhnliches IPv4-Broadcast-Subnetz. Ein Gateway soll ein anderer lokaler Router sein; Netz- und Broadcastadressen sind keine Hostadressen.' },
      { id: 'routers', kind: 'missing', text: 'Ob unter den vorgeschlagenen Adressen tatsächlich ein Router arbeitet, wurde nicht geprüft.' },
    ],
    questions: [
      { id: 'membership', concept: 'membership', prompt: 'Gehört 192.168.50.64 rechnerisch zum Subnetz des PCs?',
        basis: ['address'], answer: 'yes', explanation: {
          reasoning: 'Der /26-Block des PCs reicht von 192.168.50.64 bis 192.168.50.127. Auch seine erste Adresse gehört mathematisch zum Block. Zugehörigkeit und Nutzbarkeit als Host sind verschiedene Fragen.',
        } },
      { id: 'network-gateway', concept: 'gateway-address', prompt: 'Ist 192.168.50.64 in diesem Subnetz als Gateway-Hostadresse nutzbar?',
        basis: ['address', 'convention'], answer: 'no', explanation: {
          reasoning: '/26 bildet 64er-Blöcke. .70 liegt im Block .64–.127; .64 bezeichnet das Netz und kann in dieser Konvention keinem Gateway-Host zugewiesen werden. Eine Default-Route mit diesem Eintrag wird nicht dadurch korrekt, dass die Adresse im Block liegt.',
        } },
      { id: 'usable-gateway', concept: 'gateway-address', prompt: 'Ist 192.168.50.65 hinsichtlich der Subnetzgrenzen und der eigenen PC-Adresse als lokale Gateway-Hostadresse geeignet?',
        basis: ['address', 'convention', 'routers'], answer: 'yes', explanation: {
          reasoning: 'Der nutzbare Hostbereich ist 192.168.50.65–192.168.50.126. .65 liegt darin und ist nicht die PC-Adresse .70. Damit passt die Adresse numerisch; ein erreichbarer Router unter .65 ist noch nicht nachgewiesen.',
        } },
    ],
  },
  {
    id: 'nd02-02', archetype: 'ND02', contentVersion: 1,
    title: 'Broadcast oder letzter Host?',
    scenario: 'Ein Eintrag am oberen Rand des Subnetzes wird als Gateway diskutiert. Eine zweite Adresse liegt direkt davor.',
    evidence: [
      { id: 'address', kind: 'configuration', text: 'PC: 172.20.8.34/27.' },
      { id: 'convention', kind: 'premise', text: 'Es gilt ein gewöhnliches IPv4-Broadcast-Subnetz. Ein Gateway soll ein anderer lokaler Router sein; Netz- und Broadcastadressen sind keine Hostadressen.' },
      { id: 'routers', kind: 'missing', text: 'Es liegen keine Beobachtungen zu Routern unter den vorgeschlagenen Adressen vor.' },
    ],
    questions: [
      { id: 'membership', concept: 'membership', prompt: 'Gehört 172.20.8.63 rechnerisch zum Subnetz des PCs?',
        basis: ['address'], answer: 'yes', explanation: {
          reasoning: '/27 umfasst 32 Adressen. .34 liegt im Block 172.20.8.32–172.20.8.63; dessen letzte Adresse gehört mathematisch dazu. Das allein macht sie nicht zu einer nutzbaren Hostadresse.',
        } },
      { id: 'broadcast-gateway', concept: 'gateway-address', prompt: 'Ist 172.20.8.63 in diesem Subnetz als Gateway-Hostadresse nutzbar?',
        basis: ['address', 'convention'], answer: 'no', explanation: {
          reasoning: 'Im Block .32–.63 ist .63 der Broadcast, nicht der letzte nutzbare Host. Dieser ist .62. Ein konventionelles Gateway benötigt eine eigene Hostadresse; die Broadcastadresse bezeichnet hier kein einzelnes Routergerät.',
        } },
      { id: 'usable-gateway', concept: 'gateway-address', prompt: 'Ist 172.20.8.62 hinsichtlich der Subnetzgrenzen und der eigenen PC-Adresse als lokale Gateway-Hostadresse geeignet?',
        basis: ['address', 'convention', 'routers'], answer: 'yes', explanation: {
          reasoning: 'Die Hostadressen reichen von 172.20.8.33 bis 172.20.8.62. .62 ist der letzte nutzbare Host und unterscheidet sich von der PC-Adresse .34. Ob dort tatsächlich ein Router erreichbar ist, bleibt offen.',
        } },
    ],
  },
  {
    id: 'nd05-01', archetype: 'ND05', contentVersion: 1,
    title: 'Vier Zeitüberschreitungen',
    scenario: 'Sie prüfen die Verbindung zwischen zwei Arbeitsplätzen mit ping. Der Test ist beendet.',
    evidence: [
      { id: 'addresses', kind: 'configuration', text: 'A: 192.168.40.10/24; B: 192.168.40.20/24.' },
      { id: 'ping', kind: 'observation', text: 'Der gerade abgeschlossene Test von A nach B meldet vier gesendete Echo Requests, keinen empfangenen Echo Reply und vier Zeitüberschreitungen.' },
      { id: 'operation', kind: 'missing', text: 'Interface-Status, VLANs und Filter sind nicht geprüft. Zu anderen IP-Diensten liegen keine Testergebnisse vor.' },
    ],
    questions: [
      { id: 'reply', concept: 'observation', prompt: 'Hat A in diesem abgeschlossenen Test einen Echo Reply von B empfangen?',
        basis: ['ping'], answer: 'no', explanation: {
          reasoning: 'Das vollständige Testergebnis enthält keinen Echo Reply. Für diesen Test ist die Antwort daher Nein. Daraus folgt weder, wo ein Paket verloren ging, noch, dass auch TCP- oder UDP-Kommunikation unmöglich ist.',
        } },
      { id: 'communication', concept: 'reachability', prompt: 'Ist zwischen A und B im beschriebenen Zustand grundsätzlich IP-Kommunikation möglich?',
        basis: ['addresses', 'ping', 'operation'], answer: 'unknown', explanation: {
          reasoning: 'Die vier Timeouts belegen das Ausbleiben von Echo Replies, nicht den Ausfall aller IP-Protokolle. Sie unterscheiden zum Beispiel nicht zwischen ICMP-Filterung und einem nicht betriebsbereiten Ziel.',
          alternatives: {
            yes: 'Hypothetisches Beispiel mit Kommunikation: B ist aktiv und ein Webdienst antwortet A über TCP; eine Firewall verwirft nur die ICMP Echo Requests. Der Ping bleibt erfolglos, während IP-Kommunikation über TCP funktioniert.',
            no: 'Hypothetisches Beispiel ohne Kommunikation: B ist ausgeschaltet und kein anderes Gerät übernimmt seine Adresse. Der Ping läuft ebenfalls in Timeouts, aber auch andere IP-Dienste von B sind nicht erreichbar.',
          },
        } },
    ],
  },
  {
    id: 'nd05-02', archetype: 'ND05', contentVersion: 1,
    title: 'Das Gateway antwortet, das Archiv nicht',
    scenario: 'Der lokale Router antwortet auf ping. Beim entfernten Archiv sehen Sie nur Timeouts. Ein Kollege vermutet eine Firewall.',
    evidence: [
      { id: 'addresses', kind: 'configuration', text: 'A: 10.44.1.10/24; Archiv B: 10.44.2.20/24; Gateway von A: 10.44.1.1.' },
      { id: 'gateway-reply', kind: 'observation', text: 'A hat gerade einen korrekt zugeordneten Echo Reply von 10.44.1.1 empfangen.' },
      { id: 'target-timeout', kind: 'observation', text: 'Ein separater, gerade abgeschlossener Ping-Test von A nach 10.44.2.20 meldet ausschließlich Timeouts und keinen Echo Reply.' },
      { id: 'remote-state', kind: 'missing', text: 'Betriebszustand von B, Hin- und Rückweg, Filterregeln und Filterlogs sind unbekannt. Andere Dienste auf B wurden nicht getestet.' },
    ],
    questions: [
      { id: 'cause', concept: 'cause', prompt: 'Ist eine Firewall die Ursache der Timeouts beim Ping von A zum Archiv B?',
        basis: ['gateway-reply', 'target-timeout', 'remote-state'], answer: 'unknown', explanation: {
          reasoning: 'Die Antwort von 10.44.1.1 belegt nur den Austausch mit dem Gateway. Sie erklärt nicht die Timeouts von 10.44.2.20. Ohne Filterlogs oder andere eingrenzende Befunde ist die vermutete Ursache nicht nachgewiesen.',
          alternatives: {
            yes: 'Hypothetisches Beispiel mit Firewall als Ursache: Der geroutete Weg funktioniert und B beantwortet HTTP-Anfragen von A. Eine Firewall auf diesem Weg verwirft nur Echo Requests an B. So funktioniert andere IP-Kommunikation, während genau dieser Filter die Ping-Timeouts verursacht.',
            no: 'Hypothetisches Beispiel ohne Firewall als Ursache: Der Router bleibt aktiv, aber B ist ausgeschaltet und seine IP wird nicht übernommen. Die Filter würden den Verkehr erlauben. Kommunikation mit B funktioniert nicht; der fehlende Zielbetrieb statt einer Firewall erklärt die Timeouts.',
          },
        } },
      { id: 'target-proof', concept: 'observation', prompt: 'Belegt der Echo Reply von 10.44.1.1 bereits einen beobachteten ICMP-Austausch zwischen A und dem Archiv 10.44.2.20?',
        basis: ['addresses', 'gateway-reply', 'target-timeout'], answer: 'no', explanation: {
          reasoning: 'Die antwortende Adresse ist die des Gateways, nicht die des Archivs. Ein funktionierender erster Abschnitt ist kein beobachteter Austausch mit dem entfernten Ziel. Dafür müsste eine zugeordnete Antwort von B bei A ankommen.',
        } },
    ],
  },
  {
    id: 'nd06-01', archetype: 'ND06', contentVersion: 1,
    title: 'Eine zugeordnete Antwort',
    scenario: 'Sie werten eine aktuelle Ping-Messung zwischen zwei Geräten aus. Die Messung ist vertrauenswürdig und eindeutig den genannten Geräten zugeordnet.',
    evidence: [
      { id: 'addresses', kind: 'configuration', text: 'A: 192.168.60.10/24; B: 192.168.60.20/24.' },
      { id: 'exchange', kind: 'observation', text: 'Um 10:15:03 sendet A einen Echo Request an B. Um 10:15:03.020 empfängt A den Echo Reply von B mit passender Kennung, Sequenznummer und Nutzlast.' },
      { id: 'other-services', kind: 'missing', text: 'Andere Dienste und spätere Zeitpunkte wurden nicht untersucht.' },
    ],
    questions: [
      { id: 'exchange', concept: 'observation', prompt: 'Ist damit für diesen Messzeitpunkt ein ICMP-Austausch in beiden Richtungen zwischen A und B nachgewiesen?',
        basis: ['addresses', 'exchange'], answer: 'yes', explanation: {
          reasoning: 'Der zugeordnete Echo Reply von 192.168.60.20 zeigt, dass B die Anfrage verarbeitet hat und die Antwort bei A angekommen ist. Damit ist dieser ICMP-Austausch einschließlich Rückweg belegt. Daraus folgt keine Zusage für spätere Pings und kein Nachweis für DNS oder HTTP.',
        } },
    ],
  },
  {
    id: 'nd06-02', archetype: 'ND06', contentVersion: 1,
    title: 'Ping erfolgreich — und das Webportal?',
    scenario: 'Nach einem erfolgreichen Ping möchten Sie das Webportal auf B öffnen. Bislang haben Sie nur ICMP geprüft.',
    evidence: [
      { id: 'addresses', kind: 'configuration', text: 'A: 10.60.1.10/24; B: 10.60.2.20/24.' },
      { id: 'exchange', kind: 'observation', text: 'A hat gerade einen aktuellen, vertrauenswürdig B zugeordneten Echo Reply auf seinen Echo Request empfangen. Kennung, Sequenznummer und Nutzlast stimmen überein.' },
      { id: 'http', kind: 'missing', text: 'Ob auf B ein HTTP-Dienst auf TCP-Port 8080 lauscht und dessen Verkehr erlaubt ist, wurde nicht geprüft. Der Zustand wird während dieser Betrachtung als unverändert angenommen.' },
    ],
    questions: [
      { id: 'http', concept: 'reachability', prompt: 'Kann A im beschriebenen Zustand von http://10.60.2.20:8080/ eine HTTP-Antwort erhalten?',
        basis: ['addresses', 'exchange', 'http'], answer: 'unknown', explanation: {
          reasoning: 'Der Echo Reply belegt ICMP-Kommunikation mit B trotz unterschiedlicher /24-Netze. HTTP benötigt zusätzlich einen antwortenden Dienst und erlaubten TCP-Verkehr auf Port 8080. Beides wurde nicht untersucht; die folgenden Möglichkeiten widersprechen dem erfolgreichen Ping nicht.',
          alternatives: {
            yes: 'Hypothetisches Beispiel mit HTTP-Kommunikation: Auf B läuft der Webdienst auf TCP-Port 8080, die Filter erlauben die Verbindung und der Dienst beantwortet die Anfrage. A erhält neben Echo Replies auch HTTP-Antworten.',
            no: 'Hypothetisches Beispiel ohne HTTP-Kommunikation: Auf B läuft kein Dienst auf TCP-Port 8080. B beantwortet weiterhin ICMP, kann aber auf diesem Port keine HTTP-Antwort liefern. Nicht der gesamte IP-Verkehr, sondern der gefragte Dienst fehlt.',
          },
        } },
    ],
  },
];
