/** Presentation tokens only. Joining their text always reproduces the syntax. */
export type SyntaxToken = { text: string; kind: 'literal' | 'value' | 'optional' };

export function tokenizeSyntax(syntax: string): SyntaxToken[] {
  const pattern = /<[^<>]+>|\[|\]|[-\w.]+(?:\|[-\w.]+)+|(?<=\[)(?:adapter|matches|zieloption|:port|\/pfad)(?=\])/g;
  const tokens: SyntaxToken[] = [];
  let end = 0;
  for (const match of syntax.matchAll(pattern)) {
    if (match.index > end) tokens.push({ text: syntax.slice(end, match.index), kind: 'literal' });
    const text = match[0];
    tokens.push({ text, kind: text === '[' || text === ']' ? 'optional' : 'value' });
    end = match.index + text.length;
  }
  if (end < syntax.length) tokens.push({ text: syntax.slice(end), kind: 'literal' });
  return tokens;
}

const parameterMeanings: Record<string, string> = {
  '<zielnetz/CIDR>': 'Zielnetz: das zu erreichende Netzwerk mit Präfixlänge.',
  '<IPv4/CIDR>': 'IPv4/CIDR: IPv4-Adresse und Präfixlänge, z. B. 10.72.1.10/26.',
  '<IPv4>': 'IPv4: eine gültige IPv4-Adresse.',
  '<CIDR>': 'CIDR: Netzwerkadresse mit Präfixlänge.',
  '<gateway>': 'Gateway / Next Hop: die Adresse des nächsten Routers.',
  '<interface>': 'Interface: die lokale Schnittstelle dieses Geräts, z. B. eth0.',
  '<host>': 'Host: Ziel als IPv4-Adresse oder auflösbarer Name.',
  '<name>': 'Name: der benötigte DNS-, Tabellen- oder Kettenname im jeweiligen Befehl.',
  '<server>': 'Server: IPv4-Adresse des DNS-Servers.',
  '<anzahl>': 'Anzahl: wie viele Testpakete gesendet werden sollen.',
  '<max_hops>': 'max_hops: maximale Anzahl der untersuchten Zwischenstationen.',
  '<sekunden>': 'Sekunden: Wartezeit für den Verbindungstest.',
  '<port>': 'Port: Nummer des Dienstes oder Listeners.',
  '<nummer>': 'Nummer: die angezeigte Regelnummer bzw. das Handle.',
  '<n>': 'n: Prioritätswert der Kette.',
  '<tabelle>': 'Tabelle: filter oder nat.',
  '<kette>': 'Kette: der Name der passenden Filter- oder NAT-Kette.',
  '<liste>': 'Liste: die gewünschten Verbindungszustände, durch Kommas getrennt.',
  '<aktion>': 'Aktion: die Entscheidung oder NAT-Aktion der Regel.',
  '<ziel>': 'Ziel: die Aktion der Firewallregel, z. B. ACCEPT oder DROP.',
  'adapter': 'adapter: Name der lokalen DHCP-Schnittstelle, z. B. eth0.',
  'matches': 'matches: optionale Bedingungen, etwa Quelladresse, Interface oder Port.',
  'zieloption': 'zieloption: zusätzliche Zieladresse für SNAT oder DNAT, falls benötigt.',
  ':port': ':port: optionaler TCP-Port; ohne Angabe wird Port 80 verwendet.',
  '/pfad': '/pfad: optionaler Pfad auf dem HTTP-Server.',
  '0|1': '0 = Weiterleitung deaktivieren; 1 = Weiterleitung aktivieren.',
};

/** Short, contextual hints for placeholders not explained by the catalog entry. */
export function syntaxParameterHints(syntax: string): string[] {
  const tokens = tokenizeSyntax(syntax);
  const hints = tokens.flatMap(token => {
    if (token.kind !== 'value') return [];
    const known = parameterMeanings[token.text];
    if (known) return [known];
    if (token.text.includes('|')) return [`${token.text}: eine der angegebenen Alternativen auswählen.`];
    return [];
  });
  if (tokens.some(token => token.kind === 'optional')) hints.push('[]: Der eingeschlossene Teil ist optional.');
  return [...new Set(hints)];
}
