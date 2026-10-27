import { createDevice } from '../engine/factory';
import { Network } from '../engine/network';
import { disposeNetwork } from '../engine/networkLifecycle';
import { serializeNetwork, type SavedDevice, type SaveFile } from '../engine/serialize';
import type { DeviceKind } from '../engine/device';
import type { Check } from '../labs/types';
import type { Assessment, ExerciseDraft } from './types';

// The real factory supplies complete port lists and MACs, including 8 switch ports.
// No Lab templates, browser store or persistence repositories are used here.
function topology(devices: [DeviceKind, string, string[]][], links: [string, string, string, string][]): SaveFile {
  const net = new Network();
  try {
    const positions: Record<string, { x: number; y: number }> = {};
    devices.forEach(([kind, name], i) => {
      createDevice(net, kind, { id: name, name });
      positions[name] = { x: 100 + (i % 3) * 240, y: 100 + Math.floor(i / 3) * 230 };
    });
    links.forEach(([a, ai, b, bi], i) => net.connect(a, b, { id: `cable-${i + 1}`, aIface: ai, bIface: bi }));
    const file = serializeNetwork(net, positions);
    devices.forEach(([, name, addresses]) => addresses.forEach((ip, i) => address(file, name, i, ip)));
    return file;
  } finally { disposeNetwork(net); }
}
const device = (file: SaveFile, id: string): SavedDevice => file.devices.find(d => d.id === id)!;
function address(file: SaveFile, id: string, index: number, ip: string) {
  Object.assign(device(file, id).ifaces[index], { ip, ipv4Mode: 'static' });
}
function route(file: SaveFile, id: string, dest: string, via: string) {
  device(file, id).routes.push({ dest, via, dev: 'eth0' });
}
const check = (id: string, requirementId: string, value: Check): Assessment => ({ id, requirementId, kind: 'engine', check: { ...value, resolveBy: 'id' } });
const manual = (id: string, requirementId: string, procedure: string, reason: string): Assessment => ({ id, requirementId, kind: 'manual', procedure, reason });
const req = (id: string, text: string, objectiveIds = ['configure'], evidence: 'final' | 'historical' = 'final') => ({ id, text, objectiveIds, evidence });

function local(): ExerciseDraft {
  const initial = topology([
    ['host', 'annahme', []], ['host', 'werkstatt', []], ['server', 'archiv', ['172.20.8.35/27']], ['switch', 'sw1', []],
  ], [['annahme', 'eth0', 'sw1', 'eth0'], ['werkstatt', 'eth0', 'sw1', 'eth1'], ['archiv', 'eth0', 'sw1', 'eth2']]);
  const solved = structuredClone(initial);
  address(solved, 'annahme', 0, '172.20.8.40/27'); address(solved, 'werkstatt', 0, '172.20.8.41/27');
  return {
    id: 'fisi-workshop-ipv4', contentVersion: 1, status: 'draft', category: 'ipv4', difficulty: 'beginner',
    student: {
      title: 'Werkstatt: zwei Arbeitsplätze ins Archivnetz aufnehmen',
      description: 'Ein bestehender Archivserver und zwei neue Arbeitsplätze teilen einen Switch; ein Router ist nicht nötig.',
      learningObjectives: [{ id: 'configure', text: 'Hostbereich eines /27-Netzes bestimmen und lokale Erreichbarkeit herstellen.' }],
      initialTopology: initial,
      task: 'Konfigurieren Sie annahme und werkstatt im Netz 172.20.8.32/27. archiv bleibt 172.20.8.35/27. Wählen Sie unterschiedliche freie Hostadressen; Netz- und Broadcastadresse sind ausgeschlossen. Prüfen Sie alle drei Geräte in beide Richtungen. Kein bestimmter Befehl ist vorgeschrieben.',
      requirements: [req('addresses', 'Beide Arbeitsplätze haben eindeutige gültige /27-Hostadressen; archiv behält seine Adresse.'), req('connectivity', 'Alle drei Geräte erreichen sich gegenseitig per ICMP.')],
    },
    review: {
      assessments: [
        ...['annahme', 'werkstatt'].map(d => check(`ip-${d}`, 'addresses', { type: 'iface-ip', device: d, iface: 'eth0', inSubnet: '172.20.8.32/27' })),
        check('archive-ip', 'addresses', { type: 'iface-ip', device: 'archiv', iface: 'eth0', cidr: '172.20.8.35/27' }),
        manual('host-validity', 'addresses', 'Adressen auf Eindeutigkeit und Hostbereich .33–.62 prüfen; .35 ist reserviert.', 'iface-ip prüft Präfix und Netzzugehörigkeit, aber keine netzweite Eindeutigkeit oder reservierte Hostadressen.'),
        ...['annahme', 'werkstatt', 'archiv'].flatMap(from => ['annahme', 'werkstatt', 'archiv'].filter(to => to !== from).map(to => check(`${from}-${to}`, 'connectivity', { type: 'ping', from, toDevice: to, expect: 'success' }))),
      ],
      reference: { topology: solved, commands: [], explanation: 'Beispiel: .40 und .41 mit /27. Lokale Connected-Routen reichen aus; kein Gateway erforderlich.' },
      alternatives: [{ description: 'Andere freie Adressen aus .33–.62 außer .35.', rationale: 'Die Netzfunktion zählt, nicht die beiden Beispieladressen oder die Eingabemethode.' }],
      rejectionCases: ['Doppelte Adresse, /24 statt /27, Netz-/Broadcastadresse.', 'Nur ein Arbeitsplatz erreicht das Archiv.'],
      limitations: ['Adress-Eindeutigkeit und zulässige Hostadressen benötigen zusätzlich menschliche Prüfung.'],
    },
  };
}

function routing(): ExerciseDraft {
  const initial = topology([
    ['host', 'buero', ['10.44.0.10/26']], ['router', 'r1', ['10.44.0.1/26', '10.44.0.65/27']], ['host', 'lager', ['10.44.0.70/27']],
  ], [['buero', 'eth0', 'r1', 'eth0'], ['lager', 'eth0', 'r1', 'eth1']]);
  device(initial, 'r1').forwarding = false;
  const solved = structuredClone(initial); device(solved, 'r1').forwarding = true;
  route(solved, 'buero', '10.44.0.64/27', '10.44.0.1'); route(solved, 'lager', '10.44.0.0/26', '10.44.0.65');
  return {
    id: 'fisi-office-warehouse-routing', contentVersion: 1, status: 'draft', category: 'routing', difficulty: 'intermediate',
    student: {
      title: 'Büro und Lager: Hin- und Rückweg reparieren', description: 'Die Adressen stimmen bereits. Client-Routen fehlen und das Routing auf r1 ist ausgeschaltet.',
      learningObjectives: [{ id: 'configure', text: 'Connected-Routen, Client-Routen und IPv4-Forwarding unterscheiden.' }], initialTopology: initial,
      task: 'Verbinden Sie Büro (10.44.0.0/26) und Lager (10.44.0.64/27) über r1. Behalten Sie alle vier vorgegebenen IP-Adressen und Präfixe bei. Spezifische Routen oder Default-Routen sind zulässig; NAT ist nicht erforderlich.',
      requirements: [req('addresses', 'Die vier vorgegebenen IPv4-Konfigurationen bleiben erhalten.'), req('forward', 'r1 leitet IPv4 weiter.'), req('reachable', 'Büro und Lager erreichen sich in beide Richtungen.')],
    },
    review: {
      assessments: [
        ...initial.devices.flatMap(d => d.ifaces.filter(i => i.ip).map(i => check(`${d.id}-${i.name}`, 'addresses', { type: 'iface-ip', device: d.id, iface: i.name, cidr: i.ip! }))),
        check('forwarding', 'forward', { type: 'forwarding', device: 'r1', expect: true }),
        check('outbound', 'reachable', { type: 'ping', from: 'buero', toDevice: 'lager', expect: 'success' }),
        check('return', 'reachable', { type: 'ping', from: 'lager', toDevice: 'buero', expect: 'success' }),
      ],
      reference: { topology: solved, commands: [], explanation: 'r1: Forwarding einschalten; buero: Route 10.44.0.64/27 via .1; lager: Route 10.44.0.0/26 via .65.' },
      alternatives: [{ description: 'Default-Routen der Clients über die jeweiligen lokalen Routeradressen.', rationale: 'Gleiche Hin-/Rückwegfunktion; eine bestimmte Routingtabellenform ist kein Lernziel.' }],
      rejectionCases: ['Nur Hinweg eingerichtet.', 'Präfix auf /24 erweitert, statt Routing zu reparieren.', 'Forwarding bleibt aus.'],
      limitations: ['Prüft die genannten Endpunkte; kein Beweis für beliebige weitere Netze oder Ausfallsicherheit.'],
    },
  };
}

function dhcp(): ExerciseDraft {
  const initial = topology([
    ['host', 'gast', []], ['server', 'srv1', ['192.168.77.2/27']], ['router', 'r1', ['192.168.77.1/27']], ['switch', 'sw1', []],
  ], [['gast', 'eth0', 'sw1', 'eth0'], ['srv1', 'eth0', 'sw1', 'eth1'], ['r1', 'eth0', 'sw1', 'eth2']]);
  device(initial, 'r1').dhcpPools = { eth0: { enabled: true, rangeStart: '192.168.77.10', rangeEnd: '192.168.77.20', router: '192.168.77.1', dns: '192.168.77.2' } };
  device(initial, 'srv1').dnsServer = { enabled: true, records: [['hilfe.intern', '192.168.77.2']] };
  const solved = structuredClone(initial);
  return {
    id: 'fisi-guest-dhcp-client', contentVersion: 1, status: 'draft', category: 'dhcp', difficulty: 'beginner',
    student: {
      title: 'Serviceplatz: Konfiguration aus dem vorhandenen DHCP-Pool', description: 'Der Router verteilt .10–.20; Gateway und DNS werden mitgeliefert. gast ist noch unkonfiguriert.',
      learningObjectives: [{ id: 'configure', text: 'DORA beobachten und eine dynamische Clientkonfiguration prüfen.' }], initialTopology: initial,
      task: 'Beziehen Sie auf gast/eth0 die Konfiguration per DHCP. Verwenden Sie keine statische Ersatzadresse. Router-Pool und DNS-Server bleiben unverändert. Dokumentieren Sie einen erfolgreichen DORA-Ablauf; anschließend müssen Gateway und Namensauflösung funktionieren.',
      requirements: [req('lease', 'gast nutzt DHCP mit Lease .10–.20/27, Gateway .1 und DNS .2.'), req('dora', 'Ein erfolgreicher DORA-Ablauf ist dokumentiert.', ['configure'], 'historical'), req('services', 'Gateway erreichbar und hilfe.intern löst zu 192.168.77.2 auf.')],
    },
    review: {
      assessments: [
        check('subnet', 'lease', { type: 'iface-ip', device: 'gast', iface: 'eth0', inSubnet: '192.168.77.0/27' }),
        check('gateway', 'lease', { type: 'default-route', device: 'gast', via: '192.168.77.1' }),
        manual('dhcp-origin', 'lease', 'DHCP-Modus, Client-Lease, Pool-Lease zur Client-MAC, Adresse .10–.20 und DNS .2 prüfen; Serverkonfiguration mit Startzustand vergleichen.', 'Die vorhandenen Checks beweisen weder DHCP-Herkunft noch Lease/Poolgrenzen oder unveränderte Serverkonfiguration.'),
        manual('dora-capture', 'dora', 'Packet Capture oder Terminal-/Paketnachweis für Discover, Offer, Request, ACK prüfen.', 'Historische Evidenz wird nicht durch einen späteren Ping ersetzt und nicht im Entwurf gespeichert.'),
        check('router', 'services', { type: 'ping', from: 'gast', toAddr: '192.168.77.1', expect: 'success' }),
        check('dns', 'services', { type: 'dns', from: 'gast', name: 'hilfe.intern', addr: '192.168.77.2', expect: 'resolves' }),
      ],
      reference: { topology: solved, commands: [{ device: 'gast', line: 'dhclient eth0' }], explanation: 'DHCP am Client starten; Scheduler fortschreiten lassen. Lease und DORA entstehen erst zur Laufzeit, nicht als gespeicherte statische Lösung.' },
      alternatives: [{ description: 'DHCP über den vorhandenen Inspector aktivieren und beziehen.', rationale: 'Die Technik DHCP ist vorgeschrieben, die Bedienmethode nicht.' }],
      rejectionCases: ['Statische Adresse trotz erfolgreichem Ping.', 'Pool verändert, Lease außerhalb .10–.20 oder fehlender DORA-Nachweis.'],
      limitations: ['Teilautomatisch: DHCP-Nachweis und historische Evidenz bleiben manuell.', 'Keine echte Lease-Ablauf-/Erneuerungssimulation als Lernziel verwenden.'],
    },
  };
}

function services(): ExerciseDraft {
  const initial = topology([
    ['host', 'servicepc', ['10.63.5.10/24']], ['server', 'dns1', ['10.63.5.53/24']], ['server', 'portal', ['10.63.5.80/24']], ['switch', 'sw1', []],
  ], [['servicepc', 'eth0', 'sw1', 'eth0'], ['dns1', 'eth0', 'sw1', 'eth1'], ['portal', 'eth0', 'sw1', 'eth2']]);
  device(initial, 'servicepc').nameserver = '10.63.5.53';
  device(initial, 'dns1').dnsServer = { enabled: true, records: [['portal.intern', '10.63.5.81']] };
  device(initial, 'portal').httpServer = { enabled: false, port: 8080, body: 'Serviceportal bereit' };
  const solved = structuredClone(initial);
  device(solved, 'dns1').dnsServer!.records = [['portal.intern', '10.63.5.80']]; device(solved, 'portal').httpServer!.enabled = true;
  return {
    id: 'fisi-service-portal', contentVersion: 1, status: 'draft', category: 'dns-http', difficulty: 'intermediate',
    student: {
      title: 'Serviceportal: DNS-Ziel und Webdienst entstören', description: 'DNS verweist auf .81 statt .80 und der HTTP-Dienst auf Port 8080 ist ausgeschaltet.',
      learningObjectives: [{ id: 'configure', text: 'Namensauflösung und Anwendungsdienst getrennt diagnostizieren.' }], initialTopology: initial,
      task: 'Reparieren Sie das Portal. servicepc soll portal.intern zu 10.63.5.80 auflösen und http://portal.intern:8080/ mit dem Text „Serviceportal bereit“ abrufen können. Behalten Sie die angegebenen IPv4-Adressen bei. Ein Zugriff nur über eine numerische IP reicht nicht.',
      requirements: [req('addresses', 'Vorgegebene IPv4-Adressen bleiben erhalten.'), req('dns', 'portal.intern löst vom Client zu 10.63.5.80 auf.'), req('http', 'HTTP über den Namen auf Port 8080 liefert den geforderten Inhalt.')],
    },
    review: {
      assessments: [
        ...initial.devices.flatMap(d => d.ifaces.filter(i => i.ip).map(i => check(`ip-${d.id}`, 'addresses', { type: 'iface-ip', device: d.id, iface: i.name, cidr: i.ip! }))),
        check('lookup', 'dns', { type: 'dns', from: 'servicepc', name: 'portal.intern', addr: '10.63.5.80', expect: 'resolves' }),
        check('page', 'http', { type: 'http', from: 'servicepc', url: 'http://portal.intern:8080/', contains: 'Serviceportal bereit', expect: 'ok' }),
      ],
      reference: { topology: solved, commands: [], explanation: 'Im DNS-Inspector den A-Eintrag korrigieren; HTTP auf portal mit Port 8080 und dem vorhandenen Inhalt aktivieren.' },
      alternatives: [{ description: 'Ein anderer korrekt konfigurierter DNS-Dienst im vorhandenen Netz.', rationale: 'Gefordert ist funktionierende Namensauflösung, kein bestimmter DNS-Server oder Klickpfad.' }],
      rejectionCases: ['Nur curl auf die numerische IP erfolgreich.', 'DNS korrekt, aber HTTP ausgeschaltet/falscher Port oder Inhalt.'],
      limitations: ['Vereinfachtes DNS/HTTP: keine HTTPS-, Zertifikats- oder vollständige Browserprüfung.'],
    },
  };
}

function firewall(): ExerciseDraft {
  const initial = topology([
    ['host', 'besucher', ['10.91.1.10/24']], ['firewall', 'fw1', ['10.91.1.1/24', '10.91.2.1/24']], ['server', 'intranet', ['10.91.2.20/24']],
  ], [['besucher', 'eth0', 'fw1', 'eth0'], ['intranet', 'eth0', 'fw1', 'eth1']]);
  route(initial, 'besucher', '0.0.0.0/0', '10.91.1.1'); route(initial, 'intranet', '0.0.0.0/0', '10.91.2.1');
  device(initial, 'intranet').services = { tcp: [22, 2345], udp: [] };
  device(initial, 'intranet').httpServer = { enabled: true, port: 80, body: 'Besucherinformation' };
  return {
    id: 'fisi-visitor-firewall', contentVersion: 1, status: 'draft', category: 'firewall', difficulty: 'advanced',
    student: {
      title: 'Besuchernetz: nur das Informationsportal freigeben', description: 'Die Netze sind bereits geroutet; HTTP, TCP/22 und TCP/2345 sind zunächst erreichbar.',
      learningObjectives: [{ id: 'configure', text: 'Restriktive FORWARD-Policy mit eng begrenzter Freigabe und Rückverkehr kombinieren.' }], initialTopology: initial,
      task: 'Setzen Sie auf fw1 eine FORWARD-Policy DROP. Erlauben Sie neue Verbindungen nur vom Besuchernetz 10.91.1.0/24 zu intranet (10.91.2.20) TCP/80 sowie deren Antwortverkehr. Andere neue weitergeleitete Verbindungen bleiben gesperrt, insbesondere TCP/22, TCP/2345 und ICMP. Ändern Sie weder Adressen, Verkabelung noch Serverdienste. Dokumentieren Sie vorher die Erreichbarkeit von TCP/22.',
      requirements: [req('baseline', 'TCP/22 war vor der Absicherung erreichbar.', ['configure'], 'historical'), req('policy', 'FORWARD auf fw1 verwendet DROP.'), req('allowed', 'Besucher können das HTTP-Portal einschließlich Rückverkehr erreichen.'), req('restricted', 'Nur die beschriebene Ausnahme und Antwortverkehr sind freigegeben; andere neue Verbindungen sind gesperrt. Dienste und Topologie bleiben unverändert.')],
    },
    review: {
      assessments: [
        manual('baseline-record', 'baseline', 'Vorherigen TCP/22-Erfolg anhand eines Protokolls prüfen, nicht im gesicherten Endzustand erneut verlangen.', 'Historischer Erfolg und spätere Sperre müssen getrennt bewertet werden.'),
        check('policy', 'policy', { type: 'fw-policy', device: 'fw1', hook: 'forward', policy: 'drop' }),
        check('web', 'allowed', { type: 'http', from: 'besucher', url: 'http://10.91.2.20/', contains: 'Besucherinformation', expect: 'ok' }),
        ...[22, 2345].map(port => check(`blocked-${port}`, 'restricted', { type: 'tcp', from: 'besucher', toDevice: 'intranet', port, expect: 'filtered' })),
        check('icmp', 'restricted', { type: 'ping', from: 'besucher', toDevice: 'intranet', expect: 'fail' }),
        manual('rules-review', 'restricted', 'Regeln auf Quellnetz, Zieladresse, Port und Rückverkehr prüfen. Adressen/Links/Dienste mit Ausgangsdatei vergleichen; TCP/22 und /2345 müssen weiter lauschen. Weitere Freigaben ausschließen.', 'Negative Probes können auch bei fehlenden Routen/Links passen; Stichproben beweisen keine umfassende Default-Deny-Sicherheit.'),
      ],
      reference: {
        topology: structuredClone(initial), explanation: 'Gezielte TCP/80-Freigabe für das Besuchernetz und ESTABLISHED/RELATED vor DROP; unveränderte Serverdienste erlauben aussagekräftige Negativtests.',
        commands: [
          'iptables -P FORWARD DROP',
          'iptables -A FORWARD -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT',
          'iptables -A FORWARD -s 10.91.1.0/24 -d 10.91.2.20 -p tcp --dport 80 -m conntrack --ctstate NEW -j ACCEPT',
        ].map(line => ({ device: 'fw1', line })),
      },
      alternatives: [{ description: 'Äquivalente nftables-Regeln oder explizit eingeschränkte Rückverkehrsregeln.', rationale: 'Erlaubte Datenflüsse und Policy zählen; Reihenfolge/Syntax werden nicht wörtlich verglichen. DROP für sonstigen Verkehr bleibt Pflicht.' }],
      rejectionCases: ['ACCEPT-Policy mit nur zwei Sperrregeln.', 'HTTP-Ausnahme ohne Ziel-/Quellbegrenzung.', 'Serverdienste deaktiviert oder Kabel entfernt, um Negativtests zu bestehen.'],
      limitations: ['Teilautomatisch; Regeln, unveränderte Dienste und historische Ausgangsevidenz erfordern Review.', 'Ein bestandener Porttest ist kein allgemeiner Sicherheitsbeweis.'],
    },
  };
}

export const EXERCISE_DRAFTS: ExerciseDraft[] = [local(), routing(), dhcp(), services(), firewall()];
