import type { Assessment } from '../types';
import { check, device, fixedAddresses, networkDraft, pingPairs, setAddress, topology } from './networkTools';

function lan(a: string[], b: string[], server: string[]) {
  return topology([['host', 'client-a', 'Empfang', a], ['host', 'client-b', 'Werkbank', b],
    ['server', 'archive', 'Archiv', server], ['switch', 'access', 'Zugang', []]],
  [['client-a', 'eth0', 'access', 'eth0'], ['client-b', 'eth0', 'access', 'eth1'], ['archive', 'eth0', 'access', 'eth2']]);
}
const endpoints = ['client-a', 'client-b', 'archive'];
function flexibleChecks(net: string, server: string, hostRange: string): Assessment[] {
  return [check('ip-archive', 'config', { type: 'iface-ip', device: 'archive', iface: 'eth0', cidr: server }),
    ...endpoints.slice(0, 2).map(id => check(`ip-${id}`, 'config', { type: 'iface-ip', device: id, iface: 'eth0', inSubnet: net })),
    { id: 'unique-hosts', requirementId: 'config', kind: 'manual', procedure: `Alle Geräteadressen auf Eindeutigkeit und ${hostRange} prüfen; Archivadresse reservieren.`,
      reason: 'iface-ip prüft Netz/Präfix, aber nicht Eindeutigkeit und reservierte Endpunkte. Ein Ping kann bei einem Konflikt trotzdem gelingen.' }, ...pingPairs(endpoints)];
}
function maskFault() {
  const initial = lan(['192.168.71.70/24'], ['192.168.71.80/26'], ['192.168.71.65/26']), solved = structuredClone(initial);
  setAddress(solved, 'client-a', 0, '192.168.71.70/26');
  return networkDraft({ id: 'c01-maskenfehler', group: 'C', difficulty: 'beginner', title: 'Werkstatt: Ping funktioniert, Maske ist trotzdem falsch',
    situation: 'Empfang, Werkbank und Archiv hängen am selben Switch. Empfang hat irrtümlich /24; alle aktuellen Nachbarn liegen dennoch im vorgesehenen /26. Ein erfolgreicher Ping allein ist hier kein korrekter Abnahmetest.',
    task: 'Behalten Sie alle IPv4-Adressen bei und korrigieren Sie nur Empfang auf /26. Werkbank bleibt 192.168.71.80/26, Archiv 192.168.71.65/26. Es wird kein Gateway benötigt.',
    initial, solved, assessments: [...fixedAddresses(solved), ...pingPairs(endpoints)],
    explanation: '192.168.71.64/26 reicht von .64 bis .127. .70, .80 und .65 sind nutzbar. /24 kann lokale Pings erlauben, verletzt aber den Adressplan und würde andere Bereiche fälschlich als lokal behandeln.',
    alternatives: ['Maske 255.255.255.192 oder CIDR /26 eingeben.'],
    wrong: ['Nur Ping testen und /24 beibehalten.', 'Die IP ändern, obwohl nur die Maske fehlerhaft ist.'] });
}
function installation() {
  const initial = lan([], [], ['10.61.2.162/28']), solved = structuredClone(initial);
  setAddress(solved, 'client-a', 0, '10.61.2.165/28'); setAddress(solved, 'client-b', 0, '10.61.2.166/28');
  return networkDraft({ id: 'c02-neue-arbeitsplaetze', group: 'C', difficulty: 'intermediate', title: 'Labor: zwei Arbeitsplätze im knappen /28 installieren',
    situation: 'Zwei neue Rechner sind bereits verkabelt, aber noch unadressiert. Das Archiv ist unter 10.61.2.162/28 fest eingerichtet. Kein DHCP-Server und kein Router sind erforderlich.',
    task: 'Wählen Sie zwei unterschiedliche freie Hostadressen in 10.61.2.160/28. Archiv bleibt 10.61.2.162/28. Keine Netz-/Broadcastadresse und keine doppelte Adresse verwenden.',
    initial, solved, assessments: flexibleChecks('10.61.2.160/28', '10.61.2.162/28', 'Hostbereich .161–.174'),
    explanation: 'Der Hostbereich ist .161–.174, .162 ist belegt. .165 und .166 sind eine Lösung, .170 und .171 ebenfalls. Die Connected-Route genügt für lokale Kommunikation.',
    alternatives: ['Empfang .170/28 und Werkbank .171/28, Archiv unverändert.'],
    wrong: ['.175 als Host: Broadcast.', 'Beide Rechner .165: Adresskonflikt.'],
    limits: ['Vollständige Freigabe benötigt die verpflichtende manuelle Hostgültigkeits-/Eindeutigkeitsprüfung; keine vorgetäuschte Vollautomatik.'] });
}
function wrongNetwork() {
  const initial = lan(['172.26.8.100/27'], ['172.26.8.82/27'], ['172.26.8.65/27']), solved = structuredClone(initial);
  setAddress(solved, 'client-a', 0, '172.26.8.80/27');
  return networkDraft({ id: 'c03-falsches-netz', group: 'C', difficulty: 'intermediate', title: 'Reparaturplatz: gleiches drittes Oktett, anderes Netz',
    situation: 'Empfang wurde aus einer anderen Abteilung übernommen und hat noch .100/27. Kabel und Switch sind in Ordnung. Werkbank und Archiv befinden sich im Bereich .64–.95.',
    task: 'Setzen Sie Empfang gemäß Adressplan auf 172.26.8.80/27. Werkbank bleibt 172.26.8.82/27, Archiv 172.26.8.65/27. Keine Route als Ersatz für die richtige lokale Adressierung hinzufügen.',
    initial, solved, assessments: [...fixedAddresses(solved), ...pingPairs(endpoints)],
    explanation: '.100/27 gehört zu .96/27, nicht .64/27. .80/27 korrigiert die Netzzuordnung. /24 würde nur die Segmentierung verschleiern.',
    alternatives: ['IPv4-Felder im Inspector oder unterstützte ip-adress-Befehle führen zur gleichen Endkonfiguration.'],
    wrong: ['Präfix auf /24 erweitern.', 'Ein erfundenes Gateway konfigurieren, statt den Adressplan umzusetzen.'] });
}
function duplicate() {
  const initial = lan(['10.62.5.2/29'], ['10.62.5.2/29'], ['10.62.5.1/29']);
  // Clarifies that the duplicate is authored data, not an accidental save/restore failure.
  device(initial, 'client-b').name = 'Werkbank (umgezogen)';
  const solved = structuredClone(initial);
  setAddress(solved, 'client-b', 0, '10.62.5.3/29');
  return networkDraft({ id: 'c04-adresskonflikt', group: 'C', difficulty: 'intermediate', title: 'Umzug: zwei Rechner mit derselben IPv4-Adresse',
    situation: 'Nach einem Umzug besitzen Empfang und Werkbank beide 10.62.5.2/29. Wechselnde ARP-Zuordnung oder Antworten eines Nachbarn sind kein Beweis für zwei korrekt adressierte Rechner.',
    task: 'Archiv bleibt 10.62.5.1/29. Geben Sie Empfang und Werkbank unterschiedliche freie Hostadressen im Netz 10.62.5.0/29; mindestens eine der doppelten .2-Adressen muss geändert werden.',
    initial, solved, assessments: flexibleChecks('10.62.5.0/29', '10.62.5.1/29', 'Hostbereich .1–.6'),
    explanation: 'Werkbank .3 beseitigt den Konflikt bei unverändertem Empfang .2. Auch .4 und .5 wären gültig. ARP-Cache-Löschen allein ändert keine doppelte Konfiguration.',
    alternatives: ['Empfang .4/29 und Werkbank .5/29, Archiv .1/29.'],
    wrong: ['Nur ARP-Einträge löschen.', 'Erfolgreichen Ping auf die eigene doppelte Adresse als Lösung werten.'],
    limits: ['Konfliktfreiheit wird verpflichtend manuell kontrolliert; die vorhandenen Ping-/Subnetzprüfer reichen allein nicht.'] });
}
export const PRACTICAL_DRAFTS = [maskFault(), installation(), wrongNetwork(), duplicate()];
