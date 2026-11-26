import type { SaveFile, SavedDevice } from '../engine/serialize';
import { CUSTOM_SWITCH_PORTS } from '../engine/switch';
import { translate, type Language, type TranslationKey } from '../i18n';
import { browserText } from '../browser/messages';
import type { Objective } from './types';

export const PROGRESSIVE_NAT_PAT_ID = 'progressive-nat-pat';
const webIp = '198.51.100.80';
const pageTitle = 'Oficina conectada';
export const PROGRESSIVE_NAT_PAT_URL = 'http://' + webIp;

export function natIntroConcept(language: Language): string {
  const packets = translate(language, 'navigation.packets');
  const startCapture = translate(language, 'navigation.startCapture');
  const openBrowser = browserText(language, 'openBrowser');
  return [
    translate(language, 'guidedNat.definition'),
    translate(language, 'guidedNat.startCapture', { packets, startCapture }),
    translate(language, 'guidedNat.openFirstPage', { openBrowser, url: PROGRESSIVE_NAT_PAT_URL }),
  ].join('\n');
}

const hintKeys: readonly (readonly TranslationKey[])[] = [
  ['guidedNat.introHintLinks', 'guidedNat.introHintFields', 'guidedNat.introHintPorts'],
  ['guidedNat.hostHintPing', 'guidedNat.hostHintCapture'],
  ['guidedNat.ruleHintPrefix', 'guidedNat.ruleHintMasquerade', 'guidedNat.ruleHintTerminal'],
];

export function natHints(language: Language, step: number): string[] {
  return hintKeys[step].map(key => translate(language, key));
}

function pc(id: string, y: number, ip: string): SavedDevice {
  return {
    id, name: id, kind: 'host', os: 'linux', x: 60, y, forwarding: false, routes: [],
    ifaces: [{ name: 'eth0', ip, up: true, ipv4Mode: 'static', gateway: '192.168.60.1' }],
  };
}

const pc1Http: Extract<Objective['check'], { type: 'nat-http' }> = {
  type: 'nat-http', resolveBy: 'id', from: 'PC1', router: 'edge', toDevice: 'web',
  outIface: 'eth1', expect: 'translated', contains: pageTitle,
};
const localPing: Objective['check'] = {
  type: 'ping', resolveBy: 'id', from: 'PC2', toDevice: 'PC1', expect: 'success',
};

export const progressiveNatPat: SaveFile = {
  app: 'netsim', version: 1,
  devices: [
    pc('PC1', 100, '192.168.60.10/24'),
    {
      id: 'lan', name: 'Switch LAN', kind: 'switch', x: 310, y: 240, forwarding: false, routes: [],
      ifaces: Array.from({ length: CUSTOM_SWITCH_PORTS.default }, (_, i) => ({ name: `eth${i}`, ip: null, up: true })),
    },
    {
      id: 'edge', name: 'Router Borda', kind: 'router', x: 550, y: 240, forwarding: true, routes: [],
      ifaces: [{ name: 'eth0', ip: '192.168.60.1/24', up: true }, { name: 'eth1', ip: '198.51.100.2/24', up: true }],
      firewall: {
        tables: { filter: false, nat: true }, filter: {},
        nat: { postrouting: { name: 'postrouting', rules: [
          { match: { src: '192.168.60.10/32', oif: 'eth1' }, action: { type: 'masquerade' } },
        ] } },
      },
    },
    {
      id: 'web', name: 'Servidor Web', kind: 'server', x: 900, y: 240, forwarding: false, routes: [],
      ifaces: [{ name: 'eth0', ip: webIp + '/24', up: true }],
      httpServer: { enabled: true, port: 80, body: '<h1>' + pageTitle + '</h1><p>Resposta do servidor externo simulado.</p>' },
    },
  ],
  links: [
    { id: 'pc1-lan', a: ['PC1', 'eth0'], b: ['lan', 'eth0'] },
    { id: 'lan-edge', a: ['lan', 'eth2'], b: ['edge', 'eth0'] },
    { id: 'edge-web', a: ['edge', 'eth1'], b: ['web', 'eth0'] },
  ],
  // Keep the legacy Lab metadata in the document. The guided panel uses the
  // current language on render, including when it opens an older attempt.
  lab: {
    id: PROGRESSIVE_NAT_PAT_ID,
    title: 'Tutorial progressivo — NAT/PAT',
    blurb: 'Observe a tradução de um cliente, adicione um Host e compartilhe o acesso externo.',
    steps: [
      {
        title: 'Acesso funcionando',
        body: natIntroConcept('pt-BR'),
        hints: natHints('pt-BR', 0),
        objectives: [{ id: 'nat-first-http', label: 'PC1 recebe a página com a origem traduzida', check: pc1Http }],
        feedback: 'O servidor viu o endereço externo do Router. Na volta, o Router usou a associação da conexão para devolver a resposta ao PC1.',
      },
      {
        title: translate('pt-BR', 'guidedNat.workstation'),
        body: `Adicione outro Host à rede. Configure 192.168.60.11/24 e gateway 192.168.60.1, conecte-o ao Switch LAN e teste o ping e o acesso a ${PROGRESSIVE_NAT_PAT_URL} antes de alterar o Router.`,
        hints: natHints('pt-BR', 1),
        objectives: [
          { id: 'nat-before-local', label: 'PC2 alcança PC1 na LAN', check: localPing },
          { id: 'nat-before-pc1', label: 'PC1 continua recebendo a página', check: pc1Http },
          { id: 'nat-before-pc2', label: 'PC2 sai sem tradução e fica sem resposta', check: { ...pc1Http, from: 'PC2', expect: 'untranslated' } },
        ],
        feedback: 'O cabo e a comunicação local funcionam. A regra inicial cobre só PC1. O servidor não tem rota para responder à origem privada de PC2.',
      },
      {
        title: 'Acesso compartilhado',
        body: 'A regra NAT inicial contempla apenas PC1. Examine a restrição de origem no Router Borda e adapte-a para incluir PC2. Mantenha os endereços e a comunicação na LAN. A verificação abre duas conexões HTTP novas em paralelo.',
        hints: natHints('pt-BR', 2),
        objectives: [
          { id: 'nat-after-pair', label: 'Os dois PCs recebem HTTP por conexões traduzidas simultâneas', check: { ...pc1Http, peer: 'PC2' } },
        ],
        feedback: 'Tutorial concluído! As duas conexões compartilharam o IPv4 externo com portas distintas. O PAT permite entregar cada resposta ao cliente certo. A porta de origem só precisa mudar quando o mapeamento exige.',
      },
    ],
  },
};
