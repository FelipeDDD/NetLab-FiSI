const en = {
  open: 'View image', close: 'Close image', title: 'Visual help · ip route', half: '50%', fit: 'Fit image',
  description: 'R1 routing table: destination network, outgoing interface (dev), automatic kernel route (proto kernel), directly reachable network (scope link), and preferred source IP address (src).',
  staticRouteTitle: 'Visual help · Static route',
  staticRouteDescription: 'Illustrative static route: destination network 192.168.50.0/24, next hop via 10.0.5.2 and outgoing interface dev eth1.',
  missing: 'The visual help image for {language} is unavailable.',
} as const;
type Messages = Record<keyof typeof en, string>;
const de: Messages = {
  open: 'Bild ansehen', close: 'Bild schließen', title: 'Bildhilfe · ip route', half: '50%', fit: 'Bild einpassen',
  description: 'Routingtabelle von R1: Zielnetz, Ausgangsschnittstelle (dev), automatische Kernelroute (proto kernel), direkt erreichbares Netz (scope link) und bevorzugte Quell-IP-Adresse (src).',
  staticRouteTitle: 'Bildhilfe · Statische Route',
  staticRouteDescription: 'Beispiel einer statischen Route: Zielnetz 192.168.50.0/24, Next Hop via 10.0.5.2 und Ausgangsschnittstelle dev eth1.',
  missing: 'Das Hilfebild für {language} ist nicht verfügbar.',
};
const pt: Messages = {
  open: 'Ver imagem', close: 'Fechar imagem', title: 'Ajuda visual · ip route', half: '50%', fit: 'Ajustar imagem',
  description: 'Tabela de roteamento de R1: rede de destino, interface de saída (dev), rota automática do kernel (proto kernel), rede diretamente alcançável (scope link) e IP de origem preferido (src).',
  staticRouteTitle: 'Ajuda visual · Rota estática',
  staticRouteDescription: 'Exemplo de rota estática: rede de destino 192.168.50.0/24, próximo salto via 10.0.5.2 e interface de saída dev eth1.',
  missing: 'A imagem de ajuda para {language} não está disponível.',
};
export default { en, de, 'pt-BR': pt };
