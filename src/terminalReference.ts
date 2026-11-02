/** Read-only command documentation. No shell, engine or session imports. */
export type ReferenceOs = 'linux' | 'windows';
export const REFERENCE_CATEGORIES = [
  { id: 'ip', title: 'IP & Interfaces' }, { id: 'routing', title: 'Routing' },
  { id: 'diagnosis', title: 'Diagnose & Verbindung' }, { id: 'arp', title: 'ARP' },
  { id: 'services', title: 'DHCP, DNS & HTTP' }, { id: 'firewall', title: 'Firewall & Sicherheit' },
  { id: 'other', title: 'Weitere Befehle' },
] as const;
type Category = typeof REFERENCE_CATEGORIES[number]['id'];
export interface ReferenceOperation { title: string; syntax: string; example: string; description: string; parameters?: string }
export interface CommandReference {
  id: string; os: ReferenceOs; command: string; title: string; category: Category;
  summary: string; operations: ReferenceOperation[]; notes: string[];
}
const op = (title: string, syntax: string, example: string, description: string, parameters?: string): ReferenceOperation =>
  ({ title, syntax, example, description, ...(parameters ? { parameters } : {}) });
const entry = (os: ReferenceOs, title: string, category: Category, summary: string,
  operations: ReferenceOperation[], notes: string[] = []): CommandReference =>
  ({ id: os + '-' + title.replaceAll(' ', '-'), os, command: title.split(' ')[0], title, category, summary, operations, notes });

const routeViaParameters = 'Zielnetz: Das Netzwerk, das erreicht werden soll. Gateway / Next Hop: der nächste Router. dev bezeichnet die Ausgangsschnittstelle des aktuellen Geräts zum Next Hop, nicht unbedingt die Schnittstelle des Zielnetzes. [] bedeutet optional. Im D02-Beispiel: West eth1 hat 10.72.254.1, Ost eth0 hat 10.72.254.2. West erreicht Lager über Ost; eth1 gehört zu West, nicht zu Ost oder Lager. Ohne dev versucht NetLab eine passende Schnittstelle zu bestimmen.';

export const TERMINAL_REFERENCE: CommandReference[] = [
  entry('linux', 'ip route', 'routing', 'Die Routing-Tabelle bestimmt den nächsten Schritt zu einem Ziel. Die passendste Route mit dem längsten Präfix gewinnt.', [
    op('Tabelle anzeigen', 'ip route show', 'ip route show', 'Zeigt Connected-, Static-, Default- und vorhandene RIP-Routen.'),
    op('Zielroute hinzufügen', 'ip route add <zielnetz/CIDR> via <gateway> [dev <interface>]', 'ip route add 10.72.2.0/27 via 10.72.254.2 dev eth1',
      'Leitet Pakete zum entfernten Zielnetz über den Transitnachbarn weiter.',
      routeViaParameters),
    op('Statische Route ersetzen oder anlegen', 'ip route replace <zielnetz/CIDR>|default via <gateway> [dev <interface>]', 'ip route replace 10.72.2.0/27 via 10.72.254.2 dev eth1',
      'replace aktualisiert die vorhandene statische Route oder legt sie an. add meldet bei gleichem Zielnetz und Präfix dagegen File exists.',
      routeViaParameters + ' Die Position der bestehenden Route bleibt erhalten.'),
    op('Default-Route hinzufügen', 'ip route add default via <gateway> [dev <interface>]', 'ip route add default via 10.72.1.1 dev eth0', 'Eine Standardroute /0 greift, wenn keine spezifischere Route zum Ziel passt.', 'Gateway / Next Hop: der nächste Router. dev nennt die Ausgangsschnittstelle dieses Geräts zum Next Hop, nicht unbedingt eine Schnittstelle des Zielnetzes. [] bedeutet optional.'),
    op('Zielroute löschen', 'ip route del <zielnetz/CIDR>', 'ip route del 10.72.2.0/27', 'Entfernt eine explizite Route für dieses Zielnetz.'),
    op('Default-Route löschen', 'ip route del default', 'ip route del default', 'Entfernt eine explizite Standardroute.'),
    op('Direkte Route über ein Interface', 'ip route add <zielnetz/CIDR> dev <interface>', 'ip route add 10.72.2.0/27 dev eth1', 'Trägt eine explizite On-Link-Route ohne Next Hop ein. Das ist nur sinnvoll, wenn das Ziel tatsächlich auf diesem Link liegt.', 'Zielnetz: das direkt erreichbare Netzwerk. dev nennt die Ausgangsschnittstelle des aktuellen Geräts; das Ziel muss auf diesem Link liegen.'),
  ], ['Connected Route: entsteht aus einer konfigurierten Interface-Adresse; proto kernel, scope link. Static Route: wird explizit hinzugefügt. Default Route: beschreibt das Ziel 0.0.0.0/0 und ist nicht automatisch ein anderer Routentyp.',
    'Eine einzelne IPv4 ohne CIDR wird als /32-Ziel akzeptiert. ip ro ist eine unterstützte Abkürzung.',
    'Statische Routen mit gleichem Zielnetz und Präfix sind doppelt, auch mit anderem Gateway oder Interface. Alte Duplikate bleiben erhalten und blockieren replace: ip route show prüfen, ip route del entfernt jeweils den ersten statischen Eintrag. Bei Bedarf wiederholen und die gewünschte Route neu hinzufügen.',
    'Kein append, change, ECMP, allgemeines iproute2 oder Cisco IOS. Interface-Gateway-Optionen und explizite statische Routen sind getrennte Konfigurationen; replace und del ändern keine Interface-Option.']),
  entry('linux', 'ip address', 'ip', 'Zeigt oder ändert die IPv4-Adresse einer Schnittstelle.', [
    op('Adressen anzeigen', 'ip address show', 'ip address show', 'Zeigt IPv4/Präfix, MAC und Interface-Status. ip a ist ebenfalls möglich.'),
    op('Adresse setzen', 'ip address add <IPv4/CIDR> dev <interface>', 'ip address add 10.72.1.10/26 dev eth0', 'Konfiguriert IPv4 und Präfix auf dem angegebenen Interface. CIDR /26 entspricht 255.255.255.192.'),
    op('Adresse entfernen', 'ip address del <IPv4/CIDR> dev <interface>', 'ip address del 10.72.1.10/26 dev eth0', 'Entfernt die entsprechende Interface-Adresse.'),
  ], ['NetLab verwaltet eine IPv4-Adresse pro Interface; kein vollständiges Linux-Mehradressmodell. dev ist beim Ändern erforderlich.']),
  entry('linux', 'ip link', 'ip', 'Prüft oder schaltet den administrativen Zustand einer Schnittstelle.', [
    op('Links anzeigen', 'ip link show', 'ip link show', 'Zeigt MAC und Link-/Adminstatus.'),
    op('Aktivieren', 'ip link set [dev] <interface> up', 'ip link set eth0 up', 'Aktiviert das Interface administrativ; ein passendes Kabel und IP-Konfiguration bleiben nötig.'),
    op('Deaktivieren', 'ip link set [dev] <interface> down', 'ip link set eth0 down', 'Deaktiviert das Interface.'),
  ], ['Kein Link-UP ist allein ein Nachweis von IP-Erreichbarkeit.']),
  entry('linux', 'ping', 'diagnosis', 'Testet ICMP Echo zu einer IPv4 oder einem auflösbaren Namen.', [
    op('Fortlaufender Test', 'ping <host>', 'ping 10.72.2.10', 'Sendet bis Ctrl+C; ein Name benötigt passende DNS-Konfiguration.'),
    op('Begrenzter Test', 'ping -c <anzahl> <host>', 'ping -c 4 10.72.2.10', 'Sendet die positive Anzahl Requests und zeigt das Ergebnis.'),
  ], ['Keine Optionen für Paketgröße oder allgemeine Linux-ping-Flags. Ein Timeout bestimmt keine eindeutige Fehlerursache; ein Reply beweist diesen ICMP-Austausch, nicht alle Dienste.']),
  entry('linux', 'traceroute', 'diagnosis', 'Untersucht mit ICMP und steigender TTL die antwortenden Zwischenstationen.', [
    op('Weg prüfen', 'traceroute [-m <max_hops>] <host>', 'traceroute -m 12 10.72.2.10', 'Standardgrenze: 30 Hops; drei Probes pro Hop. -m begrenzt die Anzahl.'),
  ], ['ICMP-basierte Simulation, kein vollständiges UDP/TCP-traceroute. Ein fehlender Hop-Reply ist kein Beweis für einen defekten Router.']),
  entry('linux', 'ip neigh', 'arp', 'Zeigt den dynamischen IPv4-ARP-Cache oder leert ihn.', [
    op('Cache anzeigen', 'ip neigh show [dev <interface>]', 'ip neigh show dev eth0', 'Zeigt bekannte IPv4/MAC-Zuordnungen, optional nach Interface gefiltert.'),
    op('Gesamten Cache leeren', 'ip neigh flush all', 'ip neigh flush all', 'Entfernt dynamische Einträge dieses Geräts. Neue Kommunikation kann ARP erneut auslösen.'),
    op('Ein Interface leeren', 'ip neigh flush dev <interface>', 'ip neigh flush dev eth0', 'Entfernt nur Einträge dieser Schnittstelle.'),
  ], ['Keine IPv6-Nachbarn, statischen Einträge oder Einzel-IP-Filter bei flush. Leeren ändert keine IPs oder Routen.']),
  entry('linux', 'arp', 'arp', 'Alternative Tabellenansicht des IPv4-ARP-Caches.', [
    op('Tabelle anzeigen', 'arp [-a|-n]', 'arp -a', 'Zeigt IPs, MACs und Interfaces. Ohne Option sowie -an/-na ebenfalls unterstützt.'),
  ], ['Zum Löschen unter Linux ip neigh flush verwenden; arp -d wird in diesem Linux-Subset nicht unterstützt.']),
  entry('linux', 'dhclient', 'services', 'Fordert per DHCP eine Interface-Konfiguration an.', [
    op('Lease anfordern', 'dhclient [<interface>]', 'dhclient eth0', 'Ohne Interface wird eth0 verwendet. Der Client wechselt in den DHCP-Modus und benötigt einen erreichbaren Server/Pool.'),
  ], ['Kein vollständiger dhclient-Daemon oder Lease-Ablauf. Statische Interface-Optionen werden beim Moduswechsel entfernt; explizite statische Routen bleiben unabhängig.']),
  entry('linux', 'systemctl', 'services', 'Schaltet den globalen DHCPv4-Server eines Routers oder zeigt seinen Zustand.', [
    op('Starten', 'systemctl start kea-dhcp4-server', 'systemctl start kea-dhcp4-server', 'Aktiviert den Router-Dienst; individuell deaktivierte Pools bleiben deaktiviert.'),
    op('Stoppen', 'systemctl stop kea-dhcp4-server', 'systemctl stop kea-dhcp4-server', 'Stoppt neue Zuteilungen ohne Poolkonfiguration oder vorhandene Leases zu löschen.'),
    op('Status', 'systemctl status kea-dhcp4-server', 'systemctl status kea-dhcp4-server', 'Zeigt aktiv/inaktiv.'),
  ], ['Nur Router, nur diese Unit (auch mit .service), nur start/stop/status. Kein allgemeines systemd, kein DHCP Relay und keine Cisco-service-dhcp-Semantik.']),
  entry('linux', 'dig', 'services', 'Fragt eine IPv4-Adresse (DNS A) zu einem Namen ab.', [
    op('DNS abfragen', 'dig [@<server>] <name> [+short]', 'dig @10.72.1.53 archiv.lan +short', 'Mit @ wird der DNS-Server explizit gewählt; sonst gilt der konfigurierte DNS. +short zeigt die IP kurz.'),
  ], ['Kein allgemeiner DNS-Abfragetyp- oder Reverse-Lookup-Client.']),
  entry('linux', 'curl', 'services', 'Ruft eine simulierte HTTP-Seite ab.', [
    op('Seite laden', 'curl [-v|--verbose] http://<host>[:port][/pfad]', 'curl -v http://10.72.2.10:8080/', 'Standardport 80. -v zeigt zusätzliche Verbindungsinformationen.'),
  ], ['Nur HTTP, kein HTTPS/TLS, keine beliebigen curl-Optionen oder Dateidownload-Verwaltung.']),
  entry('linux', 'nc', 'diagnosis', 'Prüft einen TCP-/UDP-Port oder öffnet einen simulierten Listener.', [
    op('TCP prüfen', 'nc [-z] [-w <sekunden>] <host> <port>', 'nc -z -w 3 10.72.2.10 80', 'Prüft Port-Erreichbarkeit, ohne einen interaktiven Datenstrom zu öffnen.'),
    op('UDP prüfen', 'nc -u [-z] [-w <sekunden>] <host> <port>', 'nc -u -z -w 3 10.72.2.10 53', 'Prüft über den simulierten UDP-Probe-Mechanismus.'),
    op('Listener', 'nc -l [-u] <port>', 'nc -l 9000', 'Wartet auf simulierten TCP-/UDP-Verkehr; Ctrl+C entfernt den Listener.'),
  ], ['Clientmodus ist immer Zero-I/O. -v und -k werden akzeptiert, liefern aber keine zusätzlichen Modi. -p <port> ist als Portangabe möglich. Kein Dateitransfer oder vollständiger Netcat-Chat.']),
  entry('linux', 'nft', 'firewall', 'Bearbeitet den begrenzten nftables-Regelsatz im gemeinsamen Firewall-Modell.', [
    op('Regelsatz anzeigen', 'nft [-a] list ruleset', 'nft -a list ruleset', '-a zeigt Handles für gezieltes Löschen und muss in diesem Subset vor list stehen.'),
    op('Tabelle anlegen', 'nft add table ip <filter|nat>', 'nft add table ip filter', 'Legt eine unterstützte IPv4-Tabelle an.'),
    op('Filterkette anlegen', 'nft add chain ip filter <name> { type filter hook <input|forward|output> priority <n> ; policy <accept|drop> ; }',
      'nft add chain ip filter forward { type filter hook forward priority 0 ; policy accept ; }', 'Voraussetzung für Regeln: passende Tabelle und Kette.'),
    op('Regel hinzufügen', 'nft add rule ip <tabelle> <kette> [matches] <aktion>', 'nft add rule ip filter forward tcp dport 80 accept', 'Erlaubt hier HTTP-Verkehr in der Forward-Kette; insert statt add fügt vorne ein.'),
    op('Regel löschen', 'nft delete rule ip <tabelle> <kette> handle <nummer>', 'nft delete rule ip filter forward handle 1', 'Die tatsächliche Handle-Nummer vorher mit nft -a list ruleset nachsehen.'),
    op('NAT-Kette anlegen', 'nft add chain ip nat <name> { type nat hook <prerouting|postrouting> priority <n> ; }',
      'nft add chain ip nat postrouting { type nat hook postrouting priority 100 ; }', 'Benötigt die Tabelle ip nat.'),
    op('Masquerading', 'nft add rule ip nat postrouting [matches] masquerade', 'nft add rule ip nat postrouting oifname eth1 masquerade', 'Nutzt die Ausgangs-IP; benötigt die NAT-Tabelle und Postrouting-Kette.'),
    op('SNAT / DNAT', 'nft add rule ip nat <kette> [matches] snat to <IPv4> | dnat to <IPv4>[:port]',
      'nft add rule ip nat prerouting tcp dport 80 dnat to 10.72.2.10:8080', 'SNAT gehört nach postrouting, DNAT nach prerouting; entsprechende Ketten vorher anlegen.'),
    op('Regelsatz leeren', 'nft flush ruleset', 'nft flush ruleset', 'Entfernt den Firewall-Regelsatz. Vor dem manuellen Ausführen die Auswirkungen bedenken.'),
  ], ['Matches: ip saddr/daddr <CIDR>, ip protocol tcp|udp|icmp, tcp/udp sport/dport <port|a-b>, icmp type echo-request|echo-reply, ct state new,established,related,invalid sowie iifname/oifname.',
    'Aktionen: accept, drop, reject, masquerade, snat to IPv4, dnat to IPv4[:port]. Nur ip filter/nat, kein vollständiges nftables.',
    'nft und iptables arbeiten am selben Regelsatz. Keine Shell-Pipes oder Skripte; die Semikolons im Kettenbeispiel gehören zur nft-Syntax.']),
  entry('linux', 'iptables', 'firewall', 'Alternative Syntax für denselben Firewall-Regelsatz wie nft.', [
    op('Regeln anzeigen', 'iptables [-t filter|nat] -L [--line-numbers]', 'iptables -L --line-numbers', 'Zeigt Regeln; -n und -v werden akzeptiert.'),
    op('Regelsyntax anzeigen', 'iptables [-t filter|nat] -S', 'iptables -S', 'Gibt Regeln in iptables-Syntax aus.'),
    op('Regel anhängen / vorne einfügen', 'iptables [-t filter|nat] -A|-I <kette> [matches] -j <ziel>', 'iptables -A FORWARD -p tcp --dport 80 -j ACCEPT', 'INPUT/FORWARD/OUTPUT in filter, PREROUTING/POSTROUTING in nat. -I erlaubt nur Position 1.'),
    op('Zustandsabhängiger Rückverkehr', 'iptables -A <kette> -m conntrack --ctstate <liste> -j <ziel>', 'iptables -A FORWARD -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT', 'Erlaubt passende Zustände. Auch -m state --state wird unterstützt.'),
    op('Regel löschen', 'iptables [-t filter|nat] -D <kette> <nummer>', 'iptables -D FORWARD 1', 'Löscht nach 1-basierter Nummer. In filter ist auch Löschen über dieselbe Match-/Zielbeschreibung möglich; in nat nur über die Nummer.'),
    op('Standardpolitik', 'iptables -P <kette> ACCEPT|DROP', 'iptables -P FORWARD DROP', 'Ändert die Grundentscheidung einer Filterkette.'),
    op('Regeln leeren', 'iptables [-t filter|nat] -F [<kette>]', 'iptables -F FORWARD', 'Leert die Kette, ohne die Standardpolitik automatisch auf ACCEPT zu setzen.'),
    op('NAT', 'iptables -t nat -A <kette> [matches] -j MASQUERADE|SNAT|DNAT [zieloption]', 'iptables -t nat -A POSTROUTING -o eth1 -j MASQUERADE', 'SNAT nutzt --to-source IPv4, DNAT --to-destination IPv4[:port].'),
  ], ['Matches: -s/-d CIDR, -i/-o Interface, -p tcp|udp|icmp, --sport/--dport Port oder a:b, --icmp-type echo-request|echo-reply (auch 8/0).',
    'Ziele: ACCEPT, DROP, REJECT, MASQUERADE, SNAT, DNAT. Nur filter/nat und die genannten Ketten; kein vollständiges Linux-iptables.']),
  entry('linux', 'sysctl', 'routing', 'Liest oder ändert ausschließlich IPv4-Forwarding.', [
    op('Status lesen', 'sysctl net.ipv4.ip_forward', 'sysctl net.ipv4.ip_forward', '1 bedeutet aktiv, 0 deaktiviert.'),
    op('Forwarding setzen', 'sysctl -w net.ipv4.ip_forward=0|1', 'sysctl -w net.ipv4.ip_forward=1', 'Setzt IPv4-Weiterleitung; Routen und Filter müssen zusätzlich passen.', '0 = Weiterleitung deaktivieren; 1 = Weiterleitung aktivieren. -w schreibt den Wert.'),
  ], ['Keine anderen sysctl-Schlüssel.']),
  entry('linux', 'conntrack', 'firewall', 'Zeigt nachverfolgte Verbindungen.', [
    op('Verbindungen auflisten', 'conntrack -L', 'conntrack -L', 'Zeigt Protokoll, Endpoints, Zustand und gegebenenfalls NAT-Übersetzung.'),
  ], ['Nur Anzeige, kein conntrack -D oder -F.']),
  entry('linux', 'ss', 'diagnosis', 'Zeigt simulierte lauschende TCP-/UDP-Sockets.', [
    op('Listener anzeigen', 'ss -tlnu', 'ss -tlnu', 'Listet aktive Dienste und nc-Listener.'),
  ], ['Die Implementierung liefert diese Listeneransicht; ss-Flags werden nicht vollständig ausgewertet. Keine allgemeine Prozess-/Socketanalyse.']),
  entry('linux', 'hostname', 'other', 'Zeigt den Gerätenamen.', [op('Name anzeigen', 'hostname', 'hostname', 'Ändert den Namen nicht.')]),
  entry('linux', 'clear', 'other', 'Leert die sichtbare Terminalanzeige.', [op('Anzeige leeren', 'clear', 'clear', 'Wird direkt von der Terminalsitzung verarbeitet; Netzwerk und Befehlshistorie bleiben erhalten.')]),
  entry('linux', 'help', 'other', 'Zeigt die traditionelle kurze Befehlsliste.', [op('Hilfe anzeigen', 'help', 'help', 'Die vorhandene Textausgabe bleibt verfügbar.')], ['Keine neue Unterbefehlshilfe wie help route.']),

  entry('windows', 'ipconfig', 'ip', 'Zeigt IPv4-Konfiguration oder erneuert/löst DHCP-Konfiguration.', [
    op('Konfiguration', 'ipconfig [/all]', 'ipconfig /all', '/all ergänzt MAC, DHCP-Modus und DNS; ohne /all die kompakte Ansicht.'),
    op('DHCP erneuern', 'ipconfig /renew [adapter]', 'ipconfig /renew eth0', 'Nur DHCP-Adapter; ohne Name werden alle passenden Adapter bearbeitet.'),
    op('DHCP freigeben', 'ipconfig /release [adapter]', 'ipconfig /release eth0', 'Gibt die DHCP-Konfiguration frei. Statische Adapter werden nicht umgestellt.'),
  ], ['Adapternamen sind hier eth0, eth1 usw. Kein netsh, keine Windows-Interface-Indizes oder Lease-Ablaufzeiten.']),
  entry('windows', 'route', 'routing', 'Zeigt die IPv4-Routing-Tabelle.', [
    op('Tabelle anzeigen', 'route print', 'route print', 'Zeigt Zielnetz, Maske, Gateway oder On-link und Ausgangsinterface.'),
  ], ['Windows CMD unterstützt im NetLab nur route print, kein route add/delete. Routen können über den Inspector konfiguriert werden.']),
  entry('windows', 'ping', 'diagnosis', 'Testet ICMP Echo; standardmäßig vier Requests.', [
    op('Begrenzter Test', 'ping [-n <anzahl>] <host>', 'ping -n 4 10.72.2.10', '-n verwendet eine positive Anzahl.'),
    op('Fortlaufender Test', 'ping -t <host>', 'ping -t 10.72.2.10', 'Läuft bis Ctrl+C.'),
  ], ['-n und -t nicht kombinieren. Keine Payload-Größe oder weiteren Windows-ping-Optionen. Timeout beweist keine bestimmte Fehlerursache.']),
  entry('windows', 'tracert', 'diagnosis', 'Prüft den Weg mit ICMP-Probes und steigender TTL.', [
    op('Weg prüfen', 'tracert <host>', 'tracert 10.72.2.10', 'Drei Probes pro Hop, maximal 30 Hops.'),
  ], ['Keine tracert-Optionen, insbesondere kein -h oder Linux -m.']),
  entry('windows', 'arp', 'arp', 'Zeigt oder löscht dynamische IPv4-ARP-Einträge.', [
    op('Cache anzeigen', 'arp -a', 'arp -a', 'Zeigt IPv4/MAC-Zuordnungen nach Interface.'),
    op('Alle löschen', 'arp -d *', 'arp -d *', 'Leert den dynamischen ARP-Cache dieses Geräts.'),
    op('Eine IPv4 löschen', 'arp -d <IPv4>', 'arp -d 10.72.1.1', 'Löscht nur den dynamischen Eintrag dieser IP.'),
  ], ['Keine statischen ARP-Einträge, IPv6 oder zusätzlichen Optionen.']),
  entry('windows', 'nslookup', 'services', 'Fragt einen DNS-A-Eintrag beim konfigurierten Server ab.', [
    op('Namen auflösen', 'nslookup <host>', 'nslookup archiv.lan', 'Benötigt eine DNS-Konfiguration.'),
  ], ['Kein interaktiver Modus, kein explizites zweites Serverargument und keine weiteren Abfragetypen.']),
  entry('windows', 'hostname', 'other', 'Zeigt den Gerätenamen.', [op('Name anzeigen', 'hostname', 'hostname', 'Nur Anzeige, ohne weitere Argumente.')]),
  entry('windows', 'cls', 'other', 'Leert die sichtbare Terminalanzeige.', [op('Anzeige leeren', 'cls', 'cls', 'Ändert keine Netzwerkdaten.')]),
  entry('windows', 'help', 'other', 'Zeigt die traditionelle Windows-CMD-Befehlsliste.', [op('Hilfe anzeigen', 'help', 'help', 'Die bisherige Textausgabe bleibt unverändert.')],
    ['Kein PowerShell, Dateisystem, Skripting oder Pipes; keine Unterbefehlshilfe wie help route.']),
];

/** Search includes operations, parameters and topics; never mixes OS dialects. */
export function findReference(os: ReferenceOs, search: string, category?: string): CommandReference[] {
  const words = search.toLocaleLowerCase('de').trim().split(/\s+/).filter(Boolean);
  return TERMINAL_REFERENCE.filter(e => e.os === os && (!category || e.category === category) &&
    words.every(word => JSON.stringify([e.title, e.summary, e.notes, e.operations,
      REFERENCE_CATEGORIES.find(c => c.id === e.category)?.title]).toLocaleLowerCase('de').includes(word)));
}
