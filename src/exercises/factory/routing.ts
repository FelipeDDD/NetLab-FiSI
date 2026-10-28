import { check, device, fixedAddresses, networkDraft, pingPairs, route, topology } from './networkTools';

function gateway() {
  const initial = topology([['host', 'office', 'Büro', ['10.70.1.10/27']], ['router', 'gateway', 'Standortrouter', ['10.70.1.1/27', '10.70.2.1/28']],
    ['server', 'archive', 'Archiv', ['10.70.2.2/28']]], [['office', 'eth0', 'gateway', 'eth0'], ['archive', 'eth0', 'gateway', 'eth1']]);
  route(initial, 'office', '0.0.0.0/0', '10.70.1.30'); route(initial, 'archive', '0.0.0.0/0', '10.70.2.1');
  const solved = structuredClone(initial); device(solved, 'office').routes[0].via = '10.70.1.1';
  return networkDraft({ id: 'd01-default-gateway', group: 'D', difficulty: 'beginner', title: 'Büro: lokales Netz erreichbar, Archiv nicht',
    situation: 'Der Büro-PC verwendet .30 als Default Gateway, dort existiert aber kein Router. Archiv und Router sind bereits korrekt konfiguriert. Der Router kennt beide Netze direkt.',
    task: 'Behalten Sie alle IPv4-Adressen und Präfixe bei. Korrigieren Sie das Default Gateway von Büro auf 10.70.1.1; Archiv behält 10.70.2.1. IP-Forwarding bleibt aktiv.',
    initial, solved, assessments: [...fixedAddresses(solved), check('gateway-office', 'config', { type: 'default-route', device: 'office', via: '10.70.1.1' }),
      check('gateway-archive', 'config', { type: 'default-route', device: 'archive', via: '10.70.2.1' }), check('forward', 'config', { type: 'forwarding', device: 'gateway', expect: true }), ...pingPairs(['office', 'archive'])],
    explanation: 'Ein Gateway muss als Nachbar auf dem lokalen Segment erreichbar sein. Der Router besitzt .1 in beiden Netzen, mit unterschiedlichen vollständigen Adressen. Ein Gateway im Zielnetz ist für Büro kein direkter Nachbar.',
    alternatives: ['Default Gateway über das IPv4-Formular oder als Route konfigurieren. Eine reine Zielroute ersetzt in dieser Aufgabe die ausdrücklich geforderte Standardroute nicht.'],
    wrong: ['10.70.2.1 als Büro-Gateway: nicht lokal.', 'Nur den Router anpingen statt das entfernte Archiv.'] });
}
function twoRouters() {
  const initial = topology([['host', 'office', 'Büro', ['10.72.1.10/26']], ['router', 'west', 'West', ['10.72.1.1/26', '10.72.254.1/30']],
    ['router', 'east', 'Ost', ['10.72.254.2/30', '10.72.2.1/27']], ['server', 'warehouse', 'Lager', ['10.72.2.10/27']]],
  [['office', 'eth0', 'west', 'eth0'], ['west', 'eth1', 'east', 'eth0'], ['east', 'eth1', 'warehouse', 'eth0']]);
  route(initial, 'office', '0.0.0.0/0', '10.72.1.1'); route(initial, 'warehouse', '0.0.0.0/0', '10.72.2.1');
  const solved = structuredClone(initial);
  route(solved, 'west', '10.72.2.0/27', '10.72.254.2', 'eth1'); route(solved, 'east', '10.72.1.0/26', '10.72.254.1');
  return networkDraft({ id: 'd02-statische-routen', group: 'D', difficulty: 'intermediate', title: 'Zwei Standorte: Ziel- und Rückroute ergänzen',
    situation: 'Büro und Lager besitzen korrekte Default Gateways. West und Ost sind per /30 verbunden, kennen aber nur ihre direkt angeschlossenen Netze. Es gibt keinen weiteren Uplink.',
    task: 'Behalten Sie alle Adressen und aktives Forwarding bei. Ergänzen Sie auf West und Ost passende Routen, sodass Büro und Lager kommunizieren. Spezifische Routen sind empfohlen; funktional gleichwertige Default-Routen sind in dieser abgeschlossenen Topologie erlaubt.',
    initial, solved, assessments: [...fixedAddresses(solved), ...['west', 'east'].map(id => check(`forward-${id}`, 'config', { type: 'forwarding', device: id, expect: true })), ...pingPairs(['office', 'warehouse'])],
    explanation: 'West benötigt 10.72.2.0/27 via 10.72.254.2 dev eth1; Ost benötigt 10.72.1.0/26 via 10.72.254.1 dev eth0. Nur der Hinweg genügt nicht für Echo Replies. Connected-Routen schlagen zulässige Defaults für lokale Ziele.',
    alternatives: ['Auf beiden Routern eine Default-Route zum Transitnachbarn statt der spezifischen LAN-Route; lokale Connected-Netze bleiben spezifischer.'],
    wrong: ['Nur West ergänzen: Rückweg fehlt.', 'Next Hop mit eigener Transitadresse oder falscher Schnittstelle.'],
    limits: ['Routing wird funktional geprüft, nicht durch Erzwingen einer bestimmten Routenliste. Verkehr zu nicht genannten Zielen wird nicht bewertet.'] });
}
function forwarding() {
  const initial = topology([['firewall', 'edge', 'Segmentrouter', ['10.74.1.1/26', '10.74.2.1/27', '10.74.3.1/28']],
    ['host', 'office', 'Büro', ['10.74.1.10/26']], ['host', 'lab', 'Labor', ['10.74.2.10/27']], ['server', 'service', 'Dienst', ['10.74.3.10/28']]],
  [['edge', 'eth0', 'office', 'eth0'], ['edge', 'eth1', 'lab', 'eth0'], ['edge', 'eth2', 'service', 'eth0']]);
  route(initial, 'office', '0.0.0.0/0', '10.74.1.1'); route(initial, 'lab', '0.0.0.0/0', '10.74.2.1'); route(initial, 'service', '0.0.0.0/0', '10.74.3.1');
  device(initial, 'edge').forwarding = false;
  const solved = structuredClone(initial); device(solved, 'edge').forwarding = true;
  return networkDraft({ id: 'd03-forwarding', group: 'D', difficulty: 'intermediate', title: 'Drei Segmente: Router erreichbar, Weiterleitung aus',
    situation: 'Das dedizierte Firewall-Gerät hat permissive Ausgangsregeln und drei direkt angeschlossene Netze. Endgeräte erreichen ihre Gateway-Adresse, aber nicht die Nachbarsegmente. Es wurde IP-Forwarding deaktiviert.',
    task: 'Aktivieren Sie IP-Forwarding auf Segmentrouter. Behalten Sie Adressen, Gateways und die vorhandenen erlaubenden Firewall-Regeln bei. Büro, Labor und Dienst müssen miteinander kommunizieren.',
    initial, solved, assessments: [...fixedAddresses(solved), check('forward-edge', 'config', { type: 'forwarding', device: 'edge', expect: true }),
      ...['input', 'forward', 'output'].map(hook => check(`policy-${hook}`, 'config', { type: 'fw-policy', device: 'edge', hook: hook as 'input' | 'forward' | 'output', policy: 'accept' })),
      ...pingPairs(['office', 'lab', 'service'])],
    explanation: 'An das Gateway gerichtete Pakete werden lokal verarbeitet und benötigen kein IP-Forwarding. Weitergeleitete Pakete zwischen den drei Connected-Netzen benötigen es sehr wohl; zusätzliche statische Routen sind nicht erforderlich.',
    alternatives: ['Forwarding-Schalter im Inspector oder unterstützte sysctl-Konfiguration verwenden.'],
    wrong: ['Nur Gateway-Ping als Abnahme nutzen.', 'Firewall-Policies ändern, obwohl Forwarding fehlt.'] });
}
function returnPath() {
  const initial = topology([['host', 'client-a', 'Büro A', ['10.76.1.10/27']], ['host', 'client-b', 'Büro B', ['10.76.1.11/27']],
    ['switch', 'access', 'Zugang', []], ['router', 'west', 'West', ['10.76.1.1/27', '10.76.254.1/29']],
    ['router', 'east', 'Ost', ['10.76.254.2/29', '10.76.2.1/28']], ['server', 'archive', 'Archiv', ['10.76.2.2/28']]],
  [['client-a', 'eth0', 'access', 'eth0'], ['client-b', 'eth0', 'access', 'eth1'], ['access', 'eth2', 'west', 'eth0'], ['west', 'eth1', 'east', 'eth0'], ['east', 'eth1', 'archive', 'eth0']]);
  for (const id of ['client-a', 'client-b']) route(initial, id, '0.0.0.0/0', '10.76.1.1');
  route(initial, 'archive', '0.0.0.0/0', '10.76.2.1'); route(initial, 'west', '10.76.2.0/28', '10.76.254.2', 'eth1');
  route(initial, 'east', '0.0.0.0/0', '10.76.254.1'); route(initial, 'east', '10.76.1.10/32', '10.76.254.6');
  const solved = structuredClone(initial); device(solved, 'east').routes = device(solved, 'east').routes.filter(r => r.dest !== '10.76.1.10/32');
  return networkDraft({ id: 'd04-rueckweg-hostroute', group: 'D', difficulty: 'advanced', title: 'Selektiver Ausfall: alte /32-Route schlägt korrekten Default',
    situation: 'Büro B erreicht das Archiv, Büro A nicht. Auf Ost ist eine alte Hostroute für Büro A über den nicht vorhandenen Nachbarn 10.76.254.6 gespeichert. Der Default über West ist korrekt, wird für dieses Ziel aber nicht gewählt.',
    task: 'Behalten Sie sämtliche IPv4-Adressen und aktives Forwarding auf West/Ost bei. Reparieren Sie die Route zu Büro A auf Ost; sowohl Büro A als auch Büro B müssen das Archiv erreichen. Entfernen oder korrigieren Sie die veraltete Hostroute.',
    initial, solved, assessments: [...fixedAddresses(solved), ...['west', 'east'].map(id => check(`forward-${id}`, 'config', { type: 'forwarding', device: id, expect: true })), ...pingPairs(['client-a', 'client-b', 'archive'])],
    explanation: '/32 ist spezifischer als /0. Deshalb läuft der Rückweg zu .10 in eine Sackgasse, während .11 funktioniert. Löschen der Hostroute lässt den richtigen Default greifen. Ein zusätzlicher /27-Eintrag allein überstimmt die falsche /32 nicht.',
    alternatives: ['Hostroute 10.76.1.10/32 auf den korrekten Next Hop 10.76.254.1 ändern.', 'Falsche /32 entfernen und eine spezifische 10.76.1.0/27-Route über West verwenden.'],
    wrong: ['Nur eine richtige /27 neben der falschen /32 ergänzen.', 'Büro A umadressieren, statt den Rückweg zu reparieren.'],
    limits: ['Ein Ping benötigt Hin- und Rückweg. Sein Fehlschlag allein lokalisiert keinen Fehler; die Erklärung muss mit Routingtabelle und Paketbeobachtung erarbeitet werden.'] });
}
export const ROUTING_DRAFTS = [gateway(), twoRouters(), forwarding(), returnPath()];
