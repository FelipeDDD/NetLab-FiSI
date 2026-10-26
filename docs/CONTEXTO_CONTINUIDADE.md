# NetLab-FiSI — Contexto para continuidade

Atualizado em **26/10/2026**, para continuar o desenvolvimento no desktop de casa.
Base histórica do código: **`main` · `13460d118bda2159fb1c97e29935c349a97fc4c6`**;
as Fases 1–5B2-A descritas a seguir foram desenvolvidas sobre essa base.
Este documento descreve o estado encontrado; o código e os testes continuam sendo a fonte de verdade.

## Estado atual para retomar no desktop

- **Fases 1–5B2-A concluídas e validadas. Próxima etapa: 5B2-B**, revisão e
  ativação controlada do novo boot, migração/fallback e ciclo de página.
  A interface de planos ainda funciona somente na entrada de teste isolada;
  o boot normal e `netsim:autosave:v1` continuam preservados. Não ativar migração
  em dados reais sem revisar esse fluxo.
- Contratos atuais: [segurança](persistence-safety.md), [repositório](project-repository.md),
  [migração](legacy-migration.md), [rascunhos](workspace-drafts.md),
  [controller](session-controller.md) e [interface 5B2-A](workspace-ui.md).
- Pendências de terminal: comandos desconhecidos **não devem executar outro
  comando**; implementar limpeza ARP nos comandos Windows/Linux.
- Pendências de ping: revisar velocidade **1×–4×** e sincronizar visualmente a
  chegada dos pacotes e suas respostas.
- Última validação: **Node 24, 1.135 testes em 82 arquivos, TypeScript, build e
  `git diff --check` aprovados**; Chromium validou 18 cenários da interface,
  Graphite Dark/Classic Light e 700/1440 px com bancos/perfil descartáveis.
- No desktop, conferir branch/status, atualizar sem sobrescrever trabalho local
  e executar `npm ci`. O lockfile mantém somente patches transitivos compatíveis
  de `nanoid` e `source-map-js`; os seis alertas de auditoria restantes exigem
  majors de ferramentas e continuam pendentes de discussão, sem `--force`.
- Git transfere código/documentação, **não** IndexedDB/localStorage ou screenshots
  locais. Exportar/copiar separadamente qualquer topologia real necessária.

O mapa geral abaixo conserva referências históricas da base `13460d1`; para o
estado atual da persistência e a próxima etapa, prevalecem os contratos acima.

## 1. Visão geral e mapa do projeto

O NetLab-FiSI é um simulador didático de redes executado no navegador, sem backend
necessário para a simulação. Permite montar topologias, configurar dispositivos,
executar um subconjunto de comandos reais e observar o tráfego simulado.
Não executa kernels Linux, Windows, Android ou iOS reais.

Tecnologias: React 18, TypeScript, Vite 5, Zustand 5, React Flow 12 (`@xyflow/react`),
xterm.js com FitAddon, Vitest 2, CSS Custom Properties, tsParticles para efeitos
visuais, `lz-string` para links compartilháveis e `fflate` para exportações ZIP.
Consultar `package.json` e `package-lock.json` antes de atualizar versões.

| Área | Arquivos e responsabilidades principais |
| --- | --- |
| Entradas | `index.html`: landing page; `app.html`: aplicação; `src/main.tsx`: estilos, tema, boot e montagem React |
| Layout | `src/App.tsx`, `src/styles.css`: toolbar, Palette, canvas, Inspector, Packet Inspector e dock inferior |
| Estado/coordenador | `src/store.ts`: ações da UI, integração com motor, histórico, persistência, sessões e Labs |
| Motor compartilhado | `src/sim.ts`: referência mutável única `sim.net`, usada pelo store, terminais e componentes |
| Rede | `src/engine/network.ts`, `device.ts`, `factory.ts`, `types.ts`: dispositivos, interfaces, links e transmissões |
| Tempo | `src/engine/scheduler.ts`: fila determinística de eventos em milissegundos virtuais |
| Protocolos | `src/engine/ipdevice.ts`, `ip.ts`, `ipv4Config.ts`, `switch.ts`, `dhcpPools.ts`, `firewall.ts`, `conntrack.ts` |
| Serialização | `src/engine/serialize.ts`: configuração dos dispositivos, posições, interfaces e links |
| Canvas | `src/components/Flow.tsx`, `DeviceNode.tsx`, `FloatingEdge.tsx`, `DeviceArtwork.tsx` |
| Cabos/pacotes | `src/cableGeometry.ts`, `deviceArtwork.ts`, `components/PacketLayer.tsx`, `packetAnimation.ts`, `packetCapture.ts`, `guidedPacket.ts` |
| Gerenciamento de cabos | `src/cableAppearance.ts`, `cableInteraction.ts`, `deviceColors.ts`, `components/CableManager.tsx` |
| Alinhamento | `src/alignmentGuides.ts`, `alignmentPreferences.ts`, `components/useSmartAlignment.ts`, `AlignmentGuides.tsx` |
| Inspectors | `src/components/Inspector.tsx` e componentes compartilhados: `InterfaceConnection`, `InterfaceIpv4Panel`, `DhcpPoolsPanel`, `DiagnosticTables`, `HostWireless` |
| Terminais | `src/terminals.ts`, `commands/shell.ts`, `terminalPanels.ts`, `terminalPanelPreferences.ts`, `terminalTabPreferences.ts` e componentes `Terminal*` |
| Temas/visual | `src/uiTheme.ts`, `themes.css`, `buttons.css`, `canvasBackground.ts`, `backgroundParticles.ts` |
| Histórico | `src/topologyHistory.ts`, `topologyEdits.ts`, `topologyShortcuts.ts`, integrados pelo store |
| Ensino/exportação | `src/labs/`, `components/LabPanel.tsx`, `src/export/` |
| Assets ativos | `public/assets/devices/` e `public/assets/backgrounds/` |

### Ambiente e comandos

A CI usa **Node 22** e `npm ci`. Não existe requisito `engines` em `package.json`;
Node 22 é a referência verificada no workflow, não uma exigência inferida de `@types/node`.
O `.npmrc` contém `bin-links=false`; os scripts chamam as ferramentas via `node`
diretamente para funcionar também em volumes sem suporte a symlinks.

| Comando | Finalidade |
| --- | --- |
| `npm ci` | Instalar exatamente as dependências do lockfile no notebook |
| `npm run dev` | Servidor Vite; abrir `/app.html` na URL/porta informada |
| `npm test` | Executar todos os testes Vitest |
| `npm run test:watch` | Testes em modo watch |
| `node node_modules/typescript/bin/tsc --noEmit` | Verificar TypeScript sem build |
| `npm run build` | TypeScript e build Vite das duas entradas; executar quando necessário/autorizado |
| `npm run preview` | Servir um build já existente |
| `git diff --check` | Verificar problemas de whitespace nas alterações rastreadas |

## 2. Funcionalidades implementadas

### Dispositivos, interfaces e Wi-Fi

Os tipos reais estão em `DeviceKind` e são criados por `createDevice`.

| Tipo | Interfaces/comportamento atual |
| --- | --- |
| Host | `eth0`; perfil Linux ou Windows para apresentação/comandos; pode adicionar `wlan0` pela UI |
| Notebook | Reutiliza Host; `eth0` e `wlan0`, com configurações IPv4 independentes e perfil Linux/Windows |
| Smartphone | Somente `wlan0`; configuração e diagnósticos pela UI; sem terminal xterm |
| Switch | 8 portas Ethernet por padrão; capacidade real ajustável de 1 a 24, nomes `eth0`…`eth23` |
| Router | 4 interfaces Ethernet; IP forwarding habilitado inicialmente |
| Firewall dedicado | 4 interfaces Ethernet e forwarding; chains input/forward/output predeclaradas com política ACCEPT inicial |
| Server | 1 interface Ethernet; mesma base IP e serviços compartilhados |
| Wi-Fi AP | Bridge L2; 8 interfaces Ethernet por padrão e interfaces wireless virtuais criadas por associação |

- Adicionar portas ao Switch não recria interfaces existentes nem muda seus MACs.
  A redução remove somente a última porta, após verificar cabo, VLAN, estado
  administrativo e outras configurações relevantes. Não desconectar silenciosamente.
- `NetInterface` separa `medium`, estado administrativo, endereço, modo IPv4,
  gateway, DNS e referência ao link. Estado administrativo e link operacional são conceitos diferentes.
- A associação Wi-Fi é funcional: busca APs da topologia, verifica SSID/alcance,
  cria `Link` wireless e encaminha tráfego pela bridge. Não ocupa uma RJ45 do AP.
- Nesta versão, clientes **não podem manter links Ethernet e WLAN simultâneos**;
  é necessário desconectar o link existente antes da troca. As configurações
  das interfaces permanecem independentes. Não habilitar dual-homing sem estudar rotas, ARP e DNS.
- Alcance do AP: 50–500 m, padrão 250, com escala didática de `180 / 250`
  unidades do canvas por metro em `wirelessRange.ts`. Pan/zoom não alteram o alcance.
  Não é um modelo físico de rádio.
- SSID incompatível, distância e estados administrativos afetam `Link.operational`.
  A associação existente pode continuar representada como inativa e voltar a operar
  quando as condições melhorarem. A linha inativa fica tracejada/apagada e não transmite pacotes.
- Cobertura visual: `Auto`, `Always`, `Hidden`; acompanha os APs e não intercepta cliques.
  Não confundir `wifiCenter`, usado no alcance funcional, com as âncoras ópticas de alinhamento.

### Protocolos e serviços

- ARP, IPv4, ICMP/ping/traceroute, TTL, erros de encaminhamento e tabelas de rotas.
  Rotas Connected, Static e RIP compartilham a infraestrutura IP; seleção considera prefixos.
- Switch e AP fazem aprendizado/forwarding MAC com isolamento por VLAN de acesso.
  Entradas dinâmicas expiram após **300 segundos simulados**, com reaprendizado
  atualizando o instante. Limpezas de portas/conexões usam a arquitetura existente.
  MAC learning é estado temporário, não configuração persistente.
- Router/Firewall oferecem forwarding e RIP. Firewall possui modelo compartilhado
  para comandos `nft` e `iptables`, políticas/veredictos, conntrack, logs e NAT
  implementado, incluindo masquerade/SNAT/DNAT. É um subconjunto didático, não nftables completo.
- TCP/UDP simplificados, teste de portas e listeners (`nc`, `ss`), DNS A e HTTP
  simulados; serviços atravessam os mesmos links e podem ser filtrados pelo firewall.
- **DHCP por interface está implementado**, inclusive através de Switch/AP:
  pools independentes, gateway/DNS distribuídos, validação de sub-rede e conflitos,
  ativação individual e visualização de leases. Não existe DHCP Relay automático.
- `IpDevice.dhcpPools` guarda os pools; `dhcpServer` ainda existe para compatibilidade
  legada. `legacyPoolInterface`, `dhcpConfiguration` e `applyDhcpConfiguration`
  coordenam isso. Não remover o estado legado apenas porque não há toggle global redundante na UI.
- Configurações dos pools são serializadas; mapas de leases, ARP, conntrack,
  eventos pendentes e tabelas aprendidas não são restaurados como snapshots de execução.

### Simulação, terminais e Inspector

- Scheduler usa tempo virtual. O store avança o motor conforme Pause/Run e
  velocidade; timers do navegador coordenam a UI, não devem substituir relógios
  virtuais em aging ou protocolos.
- **Velocidade da simulação e velocidade visual dos pacotes são independentes**.
  Live/Guided e seus controles de reprodução não equivalem ao Pause do motor.
- Packet Inspector apresenta observações do tráfego; a animação deve seguir os
  links e a geometria compartilhada, nunca escolher destinos por proximidade visual.
- Terminais pertencem a Host, Notebook, Server, Router e Firewall; Switch, AP e
  Smartphone não recebem xterm. `getSession` preserva uma sessão por dispositivo.
  Comandos incluem `ip`, `arp`, `ping`, `traceroute`, `sysctl`, `nft`, `iptables`,
  `conntrack`, `ss`, `nc`, `dhclient`, `dig`, `curl`, `hostname`, além do adaptador Windows.
  Consultar `help`/parsers; não presumir suporte a qualquer comando do sistema real.
- Dock: redimensionamento vertical, recolhimento pela barra, abas, atalhos,
  movimentação de abas/painéis e modos **Free panels / Group by type**.
- **Distribuição automática dos terminais já concluída:** até cinco colunas;
  mudanças no número de colunas equalizam somente os painéis desbloqueados.
  A partir do sexto terminal, Free panels usa abas na última coluna; Group by type
  mantém abas no grupo correspondente. Nenhuma sessão é encerrada por esse limite.
- Cadeados são individuais e preservam pixels contra redistribuição automática.
  Redimensionar explicitamente um divisor continua permitido, inclusive junto
  a painel bloqueado, mantendo a semântica anterior.
- Mínimo de 220 px por coluna; falta de espaço gera rolagem horizontal **dentro
  dos terminais**. `Gleichmäßig verteilen` fica em Terminal Settings → Layout.
  Altura total do dock não muda por causa dessa ação.
- FitAddon é acionado pela infraestrutura `ResizeObserver` + coalescência por
  animation frame. Não recriar xterm para redimensionar/reagrupar. Abas ocultas
  reajustam dimensões ao reaparecer.
- Inspector: abas por tipo, formulários IPv4 compartilhados, expansão de interfaces,
  tabelas e configurações existentes. Rascunhos não devem desaparecer ao trocar abas.
  Largura ajustável entre 290 e 470 px, com preferência persistente.
- `/24` no input IPv4 é um atalho para preencher a máscara e retirar o sufixo
  do campo; dados do motor continuam com prefixo. Labels do canvas mostram IPv4
  sem sufixo, podem empilhar interfaces e distinguem configuração armazenada de link ativo.

### Cabos, âncoras e apresentação

- React Flow trabalha com posições em coordenadas do canvas e zoom entre 25%
  e 250%; o fit inicial limita-se a 125%. Não remonte o canvas ao mudar painéis
  nem converta coordenadas persistidas em pixels da viewport.
- Straight e Hybrid usam `cableGeometry.ts` tanto nos edges quanto no PacketLayer.
  Preservar oclusão atrás dos PNGs, segmentos frontais RJ45 e pontos de pacote.
- Os quatro Handles são pontos visuais de arraste, **não quatro portas físicas**.
  O Switch desenha 16 RJ45, mas mantém até 24 interfaces lógicas; slots visuais
  são distribuídos por conexão, não uma equivalência fixa com `ethX`.
  LEDs dinâmicos acompanham os slots mapeados; conexões extras usam fallback visual.
- Hover/seleção de cabos destacam trajeto, endpoints e interfaces correspondentes.
  Menu de contexto permite cores, remoção e reencaixe.
- Cores são metadados de apresentação em `ui.cableColors`, com modo auto/manual;
  **não são VLANs, sub-redes ou estado operacional**. `deviceColors.ts` centraliza
  a paleta de categorias; não confundir com cores personalizadas dos terminais.
- Cor automática usa identidade do vizinho e evita colisões em links incidentes
  a Router/Firewall. Não recolore toda a topologia continuamente. Cores manuais
  são preservadas; Auto recalcula explicitamente. JSON/Share Link preservam os metadados.
- Reencaixe escolhe a extremidade pela posição clicada no trajeto e usa a primeira
  interface Ethernet compatível disponível no destino. Voltar à interface original
  é permitido como restauração sem alteração. Preview/Esc não desligam o link real.
  O commit valida e reaproveita objeto/ID/latência, limpando apenas estados afetados.
  Wireless é reassociado pelas configurações WLAN, não pelo reencaixe Ethernet.
- Undo/Redo inclui cores e reencaixe. Não restaurar artificialmente caches ARP/MAC
  ou pacotes antigos ao reexecutar operações de configuração.
- Alinhamento horizontal usa `getVisualAlignmentPoint`: Router, Firewall, AP,
  Notebook e Smartphone reutilizam os anchors atuais dos cabos; PC/Server usam
  faixas ópticas no artwork (75%/66,5% da altura, mais 6 px de inset).
  **Switch mantém seu centro como caso especial; eixo vertical continua pelo centro geométrico.**
- Tolerância de 8 px visuais corrigida por zoom, no máximo uma guia por eixo,
  somente durante drag; Alt ignora snap. Multi-select recebe uma translação comum.
  `Ausrichtungshilfen` liga/desliga guias e snap; preferência independente do background.

### Temas, backgrounds e navegação

- Separar **UI Theme**, **Canvas Background** e **Layout**. Nenhum deve trocar
  configurações da rede ou remontar React Flow.
- Temas: Original (**padrão**), Graphite Dark (preferência visual atual do usuário),
  Deep Teal, Classic Light e Slate Gray. Midnight Blue foi retirado; ID antigo
  resolve para Original. Registro em `uiTheme.ts`, tokens em `themes.css`,
  dimensões/layout em `styles.css`, botões compartilhados em `buttons.css`.
- Interface cards usam **B / Graphite Accent** como base; comparação A temporária
  por `?interfaceCards=elevated`. A cor da barra de estado continua verde/âmbar/cinza,
  separada da identidade do vizinho e da cor do cabo.
- Console xterm mantém aparência/configuração próprias; chrome/abas respeitam
  a cor de terminal existente. Não aplicar filtros de brilho no console ou nos PNGs inteiros.
- Backgrounds atuais: Original, Verde 1, Verde 2, Cyan Circuit, Blue Circuit,
  Slate Circuit, Carbon Circuit, Titanium Circuit, Graphite Clean e Azure Circuit.
  Registro em `canvasBackground.ts`; imagens fixas à janela, cover, intensidade
  e pontos configuráveis. URL `?background=<id>` continua disponível para comparação.
- Animações opcionais: Off (padrão), Emerald Dust, Fireflies, Teal Drift e
  Shooting Star; respeitam movimento reduzido/visibilidade. tsParticles limitado
  a 30 FPS; o cometa tem camada própria. São efeitos de fundo, não pacotes de rede.
- Toolbar: Datei, Labs, Einstellungen e Hilfe; Undo/Redo, Run/Pause, velocidade
  e Packets à direita; Menü compacto abaixo de 1100 px. Export possui submenu.
- Palette: Geräte/Werkzeuge, duas colunas e categorias recolhíveis; Werkzeuge
  ainda é um espaço reservado. A faixa inteira recolhida pode reabrir o catálogo.
  Minimap é oculto inicialmente e tem controle próprio.

### Persistência e exportações

- `netsim:autosave:v1`: uma topologia ativa, autosave com debounce de 500 ms;
  `pagehide` solicita flush. Boot tenta Share Link, autosave e depois demo.
- Formato base continua `app: 'netsim', version: 1`; identificadores antigos
  são compatibilidade, não motivo para renomear tudo ao atualizar a marca.
- JSON salva dispositivos, interfaces/MACs, IPv4, links, posições, regras,
  serviços, SSID/alcance/VLANs e estado de Lab, mais metadados UI aplicáveis.
  Switch é reconstruído com a capacidade correta **antes** de restaurar links.
  `ifaces: []` é o atalho legado específico para oito portas; layouts inválidos
  continuam sendo rejeitados, sem fallback genérico.
- Share Link usa JSON comprimido no hash `#t=`. Também existem ZIP de configs,
  Containerlab, Compose, SVG/PNG e relatório HTML. Diagramas/configs exportados
  não reproduzem necessariamente todos os detalhes cosméticos do canvas.
- Tema, background, layout do Inspector/Packet Inspector/Palette, cobertura,
  guias e preferências de painéis/abas têm suas próprias chaves locais.
  Não assumir que todas as preferências visuais acompanham o JSON de topologia.
- F5/importação recriam o motor; não preservam sessões xterm abertas, buffers,
  comandos em execução, histórico Undo/Redo nem captura de pacotes em memória.
  Preferências de apresentação das sessões permanecem conforme seus módulos.

## 3. Decisões de arquitetura e UX a preservar

1. Manter protocolos no motor, apresentação nos componentes/helpers e operações
   transacionais no store. Usar factory/serialização/histórico existentes.
2. Não duplicar DHCP, DNS, ARP ou o modelo de links para novos dispositivos.
3. Não mudar IDs, MACs, interfaces e links para resolver apenas um problema visual.
4. Não criar uma segunda geometria de cabos: FloatingEdge, PacketLayer e segmentos
   frontais precisam concordar. PNGs originais devem permanecer intactos.
5. Preservar estado durante preview, menus e drag; só confirmar alterações de rede
   após validação. Escape deve cancelar sem efeitos permanentes.
6. Layout compacto, contraste/foco acessíveis, sinais textuais de estado, cores
   semânticas separadas. Graphite Dark é o alvo favorito, mas Original/Classic Light
   também precisam continuar utilizáveis.
7. Preservar divisores por mouse/teclado e rolagem interna. Não mascarar problemas
   estruturais com `overflow: hidden` global, alturas arbitrárias ou `!important`.
8. Preferências e topologia são coisas diferentes; não misturar undo da rede com
   opções visuais nem usar relógio real para o motor.

Documentos complementares: [cabos](cable-management.md),
[alinhamento](alignment-guides.md), [terminais](terminal-layout.md),
[temas](ui-themes.md), [Visual Review](visual-review.md).
`README.md`/documentos antigos ainda usam NetSim e descrições históricas;
conferir sempre o código atual antes de tratá-los como inventário definitivo.

## 4. Histórico do Git e transferência entre computadores

- Branch inspecionado: **`main`**. Remoto: `origin`, repositório `FelipeDDD/NetLab-FiSI`.
- Commit da base histórica **`13460d1`** — `feat: refine themes, cable management and terminal layouts`.
  Commit e push concluídos; após o push, `HEAD` e `origin/main` estavam iguais.
  Inclui temas/botões, backgrounds, cabos/cores/reencaixe, labels IPv4,
  alinhamento óptico, distribuição de terminais, testes e documentação técnica.
- Anteriores relevantes: `9c7e315` (toolbar/Palette e restauração do Switch),
  `047a315` (assets, clientes Wi-Fi e DHCP por interface), `e42cd95` (MAC aging),
  `99eba26` (Hybrid/interatividade de links).
- O contexto original ficou apenas local após `13460d1`. Agora a versão canônica
  em `docs/CONTEXTO_CONTINUIDADE.md` acompanha as Fases 1–5B2-A no Git;
  o arquivo da raiz aponta para esta versão.
- Auditoria de assets: os 17 PNGs em `public/assets` têm referência no código;
  os sete backgrounds novos ativos foram incluídos no commit. Nenhum print de
  teste, asset experimental bruto ou arquivo de autenticação foi incluído.
  `docs/img/screenshot.jpg` já era documentação rastreada e referenciada, não um descarte.
- `.gitignore` exclui `.playwright-mcp/`, `assets-tests/`, `node_modules/`, `dist/`,
  `samples/`, coverage/resultados de testes, logs/scratch e `.env` locais.
  Não remover originais de capturas sem autorização nem adicionar pastas inteiras indiscriminadamente.
- O Git **não transfere localStorage**. Antes de sair deste computador, exportar
  a topologia de trabalho pelo aplicativo como JSON e copiá-la separadamente.
  No notebook, importar esse JSON e escolher novamente tema/background/layout se necessário.
  Porta/origem do servidor também define qual localStorage o navegador utiliza.
- Prints estão só no computador que os gerou. O gerador reutilizável foi
  commitado, mas o exemplo depende de capturas locais; não é um pacote de imagens.
  Instalações, processos de servidor e sessões de terminal não viajam pelo Git.

## 5. Planejamento histórico da base — consultar o estado atual acima

### Prioridade de continuidade — distribuição automática dos terminais

**Já implementada e incluída em `13460d1`; não começar uma segunda implementação.**
Primeiro revisar/consolidar no notebook:

- Abrir 1, 2, 3, 4 e 5 colunas; fechar colunas e conferir divisão igualitária.
- Redimensionar manualmente; abrir novas colunas com um, vários ou todos os
  cadeados ativos e confirmar a preservação das larguras bloqueadas.
- Abrir sexto terminal, alternar abas, manter input/histórico/comandos e testar
  separar uma aba quando houver espaço para outra coluna.
- Conferir mínimo de 220 px, rolagem interna em 700 px, layout em 1440 px,
  `Gleichmäßig verteilen`, Free/Group by type e retorno de preferências locais.
- Ajustar somente problemas reproduzidos; não trocar a semântica dos cadeados,
  recriar sessões ou redimensionar o dock inteiro para equalizar as colunas.

### Planejamento futuro — ainda não implementado

- Gerenciamento de múltiplos projetos/topologias, seleção e organização de arquivos.
- IndexedDB, autosave por projeto e backups JSON/versionamento de recuperação.
  O código atual usa uma única `sim.net`, um store e uma chave principal de autosave;
  não há suporte pronto de múltiplos projetos só porque existem modos/abas de terminal.
- Exercícios/desafios adicionais sobre a infraestrutura de Labs existente.
- Possível integração com DAAproject: planejamento, sem integração encontrada no código atual.

Antes de múltiplos projetos, projetar migração do autosave atual, identidade dos
dispositivos por projeto, descarte de timers/listeners, histórico, captura e sessões
xterm. Não acrescentar apenas abas visuais sobre o mesmo motor global.

## 6. Testes e cuidados da base histórica

Última validação local deste estado: **75 arquivos de teste e 964 testes passando**,
TypeScript sem erros e `git diff --check` limpo. Não foi executado build local
nesta preparação; status da execução remota da CI não foi consultado.
`.github/workflows/ci.yml` define testes, build e validação de configs exportadas
com ferramentas reais; uma execução Vitest local não equivale a essa validação externa.

Verificações direcionadas úteis:

```powershell
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vitest/vitest.mjs run src/terminalPanels.test.ts src/terminals.test.ts src/terminalTabPreferences.test.ts src/components/terminalDockLayout.test.ts
node node_modules/vitest/vitest.mjs run src/alignmentGuides.test.ts src/alignmentPreferences.test.ts src/cableEditing.test.ts src/engine/cableReconnect.test.ts
node node_modules/vitest/vitest.mjs run src/engine/dhcpPools.test.ts src/engine/dhcpRoutingTrace.test.ts src/engine/wirelessRange.test.ts src/engine/mobileClients.test.ts
node node_modules/vitest/vitest.mjs run src/engine/switchCapacity.test.ts src/engine/switchRestore.test.ts src/labs/labs.test.ts src/labs/persistence.test.ts
git diff --check
```

Outros testes relevantes: `cableGeometry`, `deviceArtwork`, `guidedPacket`,
`packetAnimation`, `packetCapture`, `engine/macAging`, `Inspector`, `uiTheme`,
`topologyEdits` e `terminalShortcuts`. Usar `npm test` para validação ampla quando
necessário; não executar build/suíte inteira automaticamente em toda pequena alteração.

Cuidados/limitações confirmados:

- Os dois testes antigos de aparência de terminal que comparavam `ui` inteiro
  foram corrigidos: autosave agora inclui `cableColors`; os testes verificam sua
  preservação no reset. Não retirar o campo para satisfazer expectativas antigas.
- Vitest roda em Node. Testes que importam store/xterm podem exigir mocks locais
  de `@xterm/xterm`/`@xterm/addon-fit`, como em `terminals.test.ts`; Settings puros
  usam mock do store. Não definir `self` globalmente para mascarar dependência de browser.
- Wi-Fi não simula WPA, autenticação, interferência ou intensidade de sinal.
  Notebook não opera Ethernet e WLAN simultaneamente nesta versão.
- Não há IPv6, VLAN trunk/802.1Q, stacking, módulos de hardware nem editor visual
  completo de regras de firewall. Não apresentar controles fictícios para isso.
- Apenas Switch tem capacidade configurável de 1–24 portas. Não generalizar a
  expansão para Router/Firewall/AP sem revisar factory, validação e serialização.
- Não assumir desempenho validado para 100–300 dispositivos. Renderização,
  animação, labels e tabelas grandes precisam de medição específica antes de otimizar.
- Autosave é best-effort e captura configuração, não um checkpoint completo do
  runtime. Exportar JSON é a forma prática de levar a rede para outro computador.

Revisão visual recente em Chromium: Graphite Dark/Classic Light, 700/1440 px,
3/4/5 terminais, sexto em aba, cadeados e comandos em andamento. Um ping real
simulado terminou com 5 respostas e 0% de perda durante ajustes de tamanho.
As capturas foram mantidas fora do Git, organizadas por `scripts/visual-review.mjs`:
raiz de `.playwright-mcp/reviews/` só com PNGs selecionados, demais em `raw/`/`archive/`.
Ao entregar prints, preferir link ao primeiro PNG para “Open in Explorer” abrir
a localização correta. Não gerar/apagar capturas antigas indiscriminadamente.

## 7. Como retomar o desenvolvimento

1. No desktop, abrir o repositório atualizado no VS Code e pedir ao Codex para
   ler `docs/CONTEXTO_CONTINUIDADE.md` e os módulos
   relacionados à tarefa escolhida; não depender do histórico do chat.
2. Conferir `git status --short`, `git branch --show-current`, `git remote -v`
   e `git log -5 --oneline`. Em uma árvore apropriada para atualização, usar
   `git fetch origin` e `git pull --ff-only`. Confirmar presença de `13460d1`
   ou de um descendente; não sobrescrever alterações locais/divergências.
3. Usar o Node da referência de CI, instalar com `npm ci` e iniciar `npm run dev`.
   Abrir `/app.html`; não presumir a mesma porta usada neste computador.
4. Importar o JSON da topologia de trabalho exportado separadamente. Selecionar
   Graphite Dark e as preferências desejadas, pois o navegador pode começar com Original.
5. Retomar pela Fase 5B2-B e pelas pendências listadas no início deste documento.
   A distribuição dos terminais já existe em `terminalPanels.ts`/store.
6. Fazer mudanças pequenas e reversíveis, preservar sessões/IDs e executar os
   testes direcionados e TypeScript. Usar Chromium para mudanças visuais; manter
   topologia, zoom e enquadramento iguais nas comparações.
7. Não instalar dependências, alterar assets, executar build ou fazer commit/push
   sem necessidade/autorização da tarefa. Inspecionar o diff e os arquivos a incluir
   antes de sincronizar. Não copiar tokens, credenciais, perfis de autenticação,
   `.env`, caches nem arquivos privados entre computadores por este documento.

O estado aqui é um ponto de partida verificável. Atualizar este arquivo quando
decisões ou funcionalidades mudarem, diferenciando sempre implementado de planejado.
