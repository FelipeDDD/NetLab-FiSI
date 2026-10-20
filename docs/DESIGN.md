# NetSim — Browser-Based Network Simulator & Firewall Teaching Tool

*Working design document — 2026-08-01. Distilled from the iNetwork Simulator material in this
folder, competitor research, and technical feasibility research.*

## 1. Vision

A modern, fully browser-based successor to the UTS **iNetwork Simulator** (Ye & Sandrasegaran,
IEEE 2006): drag-and-drop network building, per-device terminals, packet-level simulation, and
firewall rule configuration — but using **real open-source Linux syntax** (nftables, iptables,
iproute2) instead of invented commands, and running **entirely client-side** so it deploys as a
static site with zero installation.

Three roles in one tool:
1. **Teaching tool** (primary) — guided labs with auto-checked objectives, packet animation,
   "why was this packet dropped?" explanations.
2. **Design tool** — build a topology, generate diagrams and documentation.
3. **Config-design/testing tool** — author firewall rules against a simulated network, then
   export *real* config files and a containerlab/compose file to run it for real.

## 2. Market gap (research summary, verified 2026-08-01)

No existing tool combines: fully client-side + real Linux syntax + drag-and-drop topology +
firewall testing.

| Tool | Client-side? | Real Linux syntax? | Topology editor? | Notes |
|---|---|---|---|---|
| NetPilot | No (cloud emulator) | Vendor CLIs | Yes | Proprietary SaaS |
| PT Anywhere | No (server-side Packet Tracer) | Cisco IOS | Yes | PT is Cisco-proprietary |
| Boson NetSim Online | No (hosted, paid) | Cisco IOS | Yes | Cert-prep focus |
| Filius | No (Java desktop) | Invented CLI | Yes | Closest pedagogical cousin |
| GNS3 / EVE-NG / Containerlab / Kathará | No (server/Docker) | Real (emulation) | Varies | Heavyweight |
| PackeTTrino (GitHub, 14★) | Yes | Linux-flavoured | Partial | Solo project, no labs/nftables |
| algolg/iptables-sim (11★) | Yes | iptables subset | No (single host) | Practice tool only |

**Nothing teaches nftables in the browser at all.** That space is entirely unserved.

## 3. Decisions made

| Question | Decision |
|---|---|
| Firewall syntax | **Both iptables and nftables, nftables-first** — one internal rule model, two syntax front-ends |
| Pedagogy | **Labs + sandbox** — free-build editor plus a lab format with auto-checked objectives |
| Exports | **All**: real config files, containerlab/docker-compose, SVG/PNG diagrams + docs report, topology JSON for sharing |
| Protocol scope | **Kitchen sink** as the end goal (ARP, DHCP, DNS, static + dynamic routing (RIP/OSPF), NAT, TCP, HTTP, VLANs, wireless) — delivered in phases so v1 ships |
| Backend | **None** — static site; sharing via JSON export/import, compressed-topology URLs, and a bundled scenario library |

## 4. Architecture

**Do not run real Linux in the browser; simulate it, keep the syntax honest.**

WASM VMs (v86 etc.) were evaluated and rejected for the core: 64–512 MB + 5–30 s boot *per
device* kills classroom topologies on student hardware, and a real kernel can't explain its
decisions. A pure-TS simulator gives instant, deterministic, inspectable, gradable execution.
(A v86 "real VM sandbox" node remains a possible advanced add-on later.)

### Components

- **Simulation engine** — pure TypeScript discrete-event simulator. Nodes (host, switch,
  router, servers, firewall, AP) with interfaces; every frame/packet is an event on a global
  clock. Deterministic and replayable → timeline scrubbing, step-through, auto-grading.
- **Command layer** — per-device shell (xterm.js) accepting a curated subset of real syntax:
  `ip addr/route/link`, `ping`, `traceroute`, `dig`, `arp`/`ip neigh`, `curl` (HTTP test),
  `nft`, `iptables`. **Unsupported syntax errors loudly** — never silently fake it.
- **Syntax honesty via CI** — every example/lab ruleset in the repo is validated against real
  `nft -c` / `iptables-restore --test` in CI, so taught syntax is guaranteed genuine.
- **Rule model** — one internal firewall IR; nftables and iptables parsers both compile to it;
  exporters emit both dialects. Evaluation engine annotates every verdict with the matching
  rule (the "explain" feature).
- **Topology editor** — React Flow (xyflow, MIT): device palette, drag-drop, interface
  handles, minimap. Packet animation = markers moving along edge paths, driven by the event log.
- **Lab format** — JSON: starting topology + narrative steps + objectives expressed as
  assertions the engine can check (e.g. `reach(hostA, web:80) && !reach(hostA, web:22)` and
  "conntrack must show ESTABLISHED"). Quiz questions per iNetwork tradition.
- **Persistence/sharing** — localStorage autosave; topology/lab/attempt JSON export-import
  (lecturer posts file to LMS → student imports → student exports attempt for submission);
  URL-fragment sharing (lz-string-compressed JSON) for small scenarios; bundled scenario
  library (JSON in repo, contributions by PR).

### Stack

TypeScript + React + React Flow + xterm.js + Vite; Zustand (or similar) for state;
Vitest for engine tests; deploy to GitHub Pages. No backend.

## 5. Firewall semantics (v1 scope within phase 2)

IPv4: filter (INPUT/FORWARD/OUTPUT) + NAT (masquerade, DNAT). Matches: `ip saddr/daddr`,
`tcp/udp sport/dport`, `icmp type`, `ct state`, `iifname/oifname`. Verdicts: accept, drop,
reject (with ICMP unreachable — as the iNetwork paper distinguished). Stateful tracking via a
simple conntrack table (NEW/ESTABLISHED/RELATED). Deferred: IPv6, mangle/raw, sets/maps,
marks, rate limiting, helpers.

This already exceeds the original iNetwork firewall (stateless, inbound-only) and covers its
paper's stated future work (outbound filtering, NAT, stateful).

## 6. Phased roadmap (end state = kitchen sink, but shippable at every phase)

1. **Core engine + editor** — topology editor, host/switch/router, ARP, IPv4 static
   addressing/routing, ICMP; terminals with `ip`, `ping`, `traceroute`; packet animation;
   save/load/share.
2. **Firewalls** ← the differentiator; do it early — nftables + iptables parsers, conntrack,
   NAT, verdict explanations; firewall lab series; real-config export.
3. **Services** — DHCP, DNS, TCP handshake, HTTP server + `curl`; iNetwork lab parity
   (addressing → DHCP → DNS → routing → firewall → HTTP).
4. **Lab/pedagogy layer polish** — lab player UI, objective auto-grading, quizzes, attempt
   export for submission.
5. **Design/testing exports** — SVG/PNG diagram + documentation report; containerlab +
   docker-compose export (bridge to the existing Docker environment: design in browser, run
   for real).
6. **Kitchen sink** — RIPv1/v2 (iNetwork parity) then OSPF; VLANs/802.1Q on switches;
   wireless AP/client (SSID association model). Optional: v86 real-VM node type.

## NetLab-FiSI — aparência dos terminais

- `terminalAppearance.ts` define padrões por tipo, validação de cores hexadecimais
  opacas e tema fixo do xterm. A preferência por dispositivo pertence ao store,
  sem campos adicionados ao motor. O JSON v1 recebe apenas a extensão opcional
  `ui.terminalColors`, um mapa de ID para `#rrggbb`, e `ui.terminalAppearance`
  opcional com `{ style: 'diagonal' | 'dual-glow', intensity: 0..100, fontSize: 12..18,
  fontFamily: 'system' | 'consolas' | 'cascadia' | 'courier' }`.
  Estilo/intensidade se aplicam aos terminais da topologia e usam Diagonal/80%
  quando ausentes. As cores individuais anteriores são preservadas. Arquivos antigos continuam
  válidos; cores inválidas e referências a dispositivos ausentes são ignoradas.
  Editores antigos podem abrir o arquivo, mas podem descartar esses metadados ao
  reexportá-lo. A restauração da cor padrão remove o override.
  Novas topologias usam fonte de 14 px; arquivos anteriores sem `fontSize`
  preservam os 13 px originais. O tamanho é inteiro e limitado a 12–18 px.
  O salvamento inclui a preferência de fonte mesmo no padrão, distinguindo
  arquivos novos de antigos. O tamanho afeta somente os terminais.
  Famílias são identificadores de uma lista fixa, nunca CSS importado. Arquivos
  sem família preservam a pilha original (`system`); valores inválidos também
  usam esse padrão. As fontes são locais, com fallback monoespaçado, sem downloads.
- As abas usam texto de 14 px, fechamento de 32 × 32 px e borda superior
  integrada de 3 px na cor do dispositivo. A aba ativa tem preenchimento
  discreto; a faixa permite rolagem e revela a aba ativada sem rolar o editor.
  O indicador abre o mesmo formulário do menu central Terminal settings,
  selecionando o dispositivo correspondente. O Inspector não duplica as opções.
  `TerminalSessionView` altera `term.options.fontSize` e `fontFamily` sem recriar sessões e
  agenda o FitAddon novamente; abas ocultas ajustam colunas ao serem exibidas.
  Após mudanças de colunas, a fila de entrada redesenha somente a linha
  editável não vazia a partir do buffer lógico, evitando desalinhamento do
  reflow em comandos longos Unicode. Não redesenha comandos em execução.
- Os fundos CSS estáticos oferecem Diagonal e Dual Glow. O primeiro começa
  a transição em 12% do percurso diagonal; o segundo combina duas fontes radiais,
  com a inferior direita mais forte e o centro escuro. A intensidade escala a
  faixa segura inteira, de 0 a 100%, com padrão 80%. A luminância relativa do
  ponto mais claro é limitada a 0,032, preservando contraste de pelo menos 4,5:1
  dos textos ANSI normais. Alterar cor, estilo ou intensidade muda somente
  CSS e o indicador da aba, sem `term.write`, troca de tema ou recriação da sessão.
- A [API do xterm](https://xtermjs.org/docs/api/terminal/interfaces/iterminaloptions/)
  informa que `allowTransparency` deve ser habilitado antes de `open()` e pode
  afetar o desempenho. A implementação mantém o renderizador DOM já utilizado,
  sem Canvas/WebGL, filtros ou animações do fundo. A base RGB permanece no tema
  transparente para contraste e texto invertido; `minimumContrastRatio: 4.5`,
  paleta ANSI clara e seleção opaca com texto branco preservam a leitura.
  Os testes verificam contraste de texto ANSI normal, cursor e seleção inclusive
  contra o canto mais claro possível. Texto ANSI dim continua intencionalmente
  atenuado e cores true-color arbitrárias dependem também do ajuste do xterm.
- Validação em Chromium 155: inspeção visual, personalização/restauração,
  recarga, foco e entrada preservados. A validação dos painéis abaixo inclui
  quatro instâncias reais com pings ativos. Medições em hardware de laboratório
  ainda são úteis para avaliar equipamentos menos potentes.

### Painéis automáticos de terminal

- `terminalPanels.ts` contém regras puras de distribuição, seleção, remoção e
  pesos. O store mantém `terminals` como registro de sessões abertas e
  `terminalPanels` com `{ id, tabs, active, weight }` para apresentação.
  Os IDs dos painéis são independentes dos IDs de dispositivos. Novos terminais
  criam painéis independentes, sem limite fixo, salvo organização manual salva.
  Abas de outros painéis continuam selecionadas e
  visíveis. `movePanelSession` valida destinos, reordena por âncora `beforeId`,
  transfere abas, remove painéis vazios e cria colunas livres. `moveTerminalPanel`
  reordena painéis completos mantendo seus objetos, pesos e cadeados.
  Mover altera apenas a apresentação, sem mudar o registro de sessões.
- `TerminalPanelView` monta as abas e suas áreas xterm; `attachTerminalSession`
  abre uma sessão uma única vez ou reanexa o mesmo elemento DOM. Desmontar a
  apresentação e parar um ResizeObserver nunca descarta buffer nem cancela
  comandos. Só fechamento definitivo, exclusão de dispositivo ou troca de
  topologia descartam sessões. Todos os terminais visíveis usam FitAddon com
  ResizeObserver coalescido por frame; abas ocultas continuam executando.
- `terminalPanelWidths` calcula as larguras a partir do espaço medido por
  ResizeObserver no dock: reserva `lockedWidth` em pixels e distribui o restante
  pelos pesos livres, fixando em 280 px as parcelas pequenas e redistribuindo
  novamente. O espaço mínimo pode exceder a janela; o contêiner flex permite
  rolagem horizontal sem encolher os cadeados. Todos travados podem deixar
  espaço vazio à direita. FitAddon segue as dimensões reais das áreas xterm.
- `TerminalPanelSplitter` ajusta sempre os dois vizinhos imediatos do divisor,
  inclusive com um ou ambos travados. O cadeado protege somente redistribuição
  automática: arraste, teclado e equalização atualizam `lockedWidth` em pixels
  sem destravar o painel. Medidas da dupla viram pesos em pixels, preservando
  as demais larguras e o mínimo de 280 px. O store aceita somente dimensões
  válidas e mantém o estado dos cadeados, abas e organização. Seleções xterm
  são capturadas antes do ajuste e restauradas pela infraestrutura de reflow.
- `terminalPanelPreferences.ts` mantém apenas pesos e `lockedWidth` por posição
  lógica, sob `netlab:terminal-panel-layout:v1` no localStorage. Free usa slots
  `terminal-pane-N`, com N inteiro positivo; Group by type usa slots por tipo. Não guarda IDs de
  dispositivos, abas nem ordem de reabertura. Há validação de números/slots e
  fallback para armazenamento ausente, bloqueado ou inválido. Fechar/excluir a
  última aba de um painel remove sua preferência no modo atual. Trocar de modo
  preserva o outro conjunto; F5 restaura preferências ao reabrir manualmente.
  A altura salva permanece independente. Nada disso entra no JSON de topologia
  ou aciona autosave do motor; escrita local ocorre nas mudanças de layout.
- `terminalLayoutMode` escolhe `free` (comportamento original) ou `by-type`.
  `groupPanelSessions` cria somente os grupos ocupados, na ordem inicial host,
  server, router, firewall, com IDs estáveis por tipo e seleção independente.
  A restauração aplica a ordem manual de grupos salva para esse modo.
  Abas mantêm a ordem manual dentro do grupo; novas abas entram no final.
  Movimentos entre tipos ou para nova coluna são recusados. Abertura/fechamento usam
  as ações existentes; grupos vazios desaparecem via `prunePanelSessions`.
  A troca de modo reconstrói apenas a apresentação, aplica as preferências
  locais daquele modo, mantém a sessão global ativa e reanexa os mesmos
  elementos xterm. Sem preferências, as colunas começam iguais. A lista global
  de sessões e sua ordem não mudam.
  A extensão opcional `ui.terminalLayoutMode` persiste `by-type`; ausência ou
  valor inválido corresponde a `free`. Não há alteração no serializador do
  motor. Importação/autosave preservam a escolha, mas não reabrem sessões.
- `TerminalTabMovement` usa drag/drop nativo no nome da aba e uma alça separada
  para painéis completos, deixando indicador, fechamento, cadeados e divisores
  independentes. O navegador fornece o limiar entre clique e arraste e a imagem
  que acompanha o ponteiro. `terminalSortPreview` calcula destinos pelos pontos
  médios das posições originais; transforms de 180 ms deslocam vizinhos sem
  alterar o layout real nem remontar terminais. Reduced motion desliga a transição.
  Uma superfície transparente temporária mantém estável o alvo de eventos mesmo
  quando os elementos animados passam sob o ponteiro. Ela aparece após o primeiro
  dragover, para não cobrir a origem enquanto o Chromium inicia o arraste nativo.
  Cancelar descarta a prévia;
  somente drop altera o store. RAF controla rolagem proporcional nas bordas.
  Bordas/linhas mostram o destino, vermelho sinaliza recusa e `New panel` aparece
  à direita, sem ocupar espaço permanente. O menu de contexto (Shift+F10/tecla Menu ou botão direito)
  oferece as mesmas operações por teclado. Popovers sem ações habilitadas
  recebem foco no próprio contêiner, mantendo Escape e Tab utilizáveis.
- `terminalTabPreferences.ts` armazena a organização manual em uma chave própria,
  `netlab:terminal-tab-layout:v1`, separada dos pesos/cadeados. Há templates por
  modo associados a uma assinatura dos IDs/tipos da topologia, sem limite de
  slots, duplicatas, referências desconhecidas ou grupos incompatíveis.
  O formato v1 permanece compatível: layouts antigos de quatro painéis continuam
  válidos. IDs de slots ainda não reabertos ficam reservados para impedir que
  novos terminais herdem agrupamentos por coincidência de ID.
  O loader nunca abre sessões: cada abertura explícita restaura apenas a aba
  solicitada, conservando no template posições ainda não reabertas. Alterações
  manuais reconciliam o layout vivo com essas referências pendentes. Sessões
  novas usam a inserção normal; fechamento definitivo/exclusão remove a referência
  de ambos os modos. Nova topologia limpa os templates. Metadados não entram no
  motor, JSON de rede ou histórico de sessões fechadas. Armazenamento indisponível
  afeta apenas a persistência, não a movimentação durante a página atual.
- `terminalPresentationSelection.ts` captura seleções antes da movimentação e as
  recompõe após FitAddon/reflow e a fila de pintura. Usa texto/células públicas
  do buffer (incluindo Unicode, células largas e linhas quebradas), sem injetar
  comandos. Novas entradas invalidam uma restauração pendente, e apresentações
  já descartadas são ignoradas. Instâncias xterm e DOM continuam sendo reanexados.
- `terminalHasFocus` distingue foco real/solicitado de uma aba apenas visível;
  eventos de foco não geram novos pedidos de foco. Escape é capturado somente
  no xterm, libera o foco e foca a região do editor, sem enviar entrada ao shell.
  A navegação continua global e circular. Ctrl+Tab mantém as limitações do
  navegador já documentadas; Ctrl+PageDown/PageUp também só funcionam quando
  entregues à página. Alt+Shift+Setas é a alternativa. Tab/Shift+Tab puros não
  são usados para navegar entre sessões. A navegação deriva a ordem diretamente
  de `terminalPanels.flatMap(panel => panel.tabs)` a cada atalho: painéis da
  esquerda para a direita e abas na ordem visual local, em ambos os modos.
  A direção inversa percorre a mesma ordem ao contrário. Não há lista paralela
  persistida nem alteração no registro cronológico de sessões.
- `terminalDockCollapsed` é estado transitório da apresentação, sem autosave.
  O botão no canto superior direito oculta o corpo do dock com `hidden`, mantendo
  a árvore de sessões montada. A barra fica em 34 px; a grade existente entrega
  o espaço restante ao React Flow. A altura preferida permanece intacta, com
  clamp normal para janelas menores ao expandir. Recolher libera o foco para o
  editor; expandir pede foco ao terminal ativo. Abrir/ativar sessão expande o
  dock, sem alterar sua ordem de abertura. Última sessão fechada, nova topologia
  e boot limpam o estado recolhido; F5 não reabre terminais.
  Observadores de largura, divisores e FitAddon ficam suspensos enquanto o corpo
  está oculto. A última largura válida é mantida, e os observadores são retomados
  ao expandir. Opções de fonte também aguardam a expansão antes de medir o xterm.
  Não há resize com dimensões zero, desmontagem, cancelamento ou limpeza de
  seleção causada pelo recolhimento. O menu Settings continua ancorado ao seu
  botão na barra; há espaço para o link Home fixo existente. O controle funciona
  por mouse e Enter/Espaço; nenhum atalho global opcional foi acrescentado.
- Regressões cobrem distribuição, exclusão, seleção local, pesos, reanexação,
  input Unicode/histórico e quatro pings preservados em abas ocultas e após
  redimensionamento. No Chromium 155 foram validados os quatro painéis reais,
  ajustes por mouse/teclado, seis sessões, foco, Escape, copiar/colar, seleção,
  fechamento e expansão, janela estreita e identidade de DOM/buffer/sessão.

### Menus e personalização compacta

O `overflow-x: auto` da toolbar também recorta seus menus descendentes no eixo
vertical. Um z-index maior dentro desse ancestral não elimina o recorte.
`FloatingPopover` usa um portal em `document.body` e posição fixa ancorada ao
botão; `floatingPosition` limita largura/altura à janela e escolhe o lado com
espaço. Scroll, resize e ResizeObserver atualizam a posição; um botão que sai
da janela fecha seu popup. A rolagem horizontal da toolbar permanece intacta.
O mesmo componente serve ao acesso pela bolinha da aba, sem botões aninhados e
sem ativar/fechar a sessão. Há retorno de foco por Escape, fechamento por clique
externo e navegação de menus por teclado. Janelas curtas usam rolagem interna.

O dock oferece um chip Settings posicionado na margem superior esquerda, sem
uma barra horizontal adicional nem espaço reservado nas colunas. O centro da
borda continua disponível para redimensionamento vertical. O popover central
reúne Layout (organização) e Appearance. `TerminalSettingsControls` permite
escolher qualquer dispositivo com shell, inclusive sem sessão aberta. Trocar o
dispositivo do formulário não troca a sessão ativa nem abre terminais. O acesso
pela aba usa a seção Appearance do mesmo componente, com o dispositivo
pré-selecionado. Layout fica no menu central, cuja âncora estável evita fechar
o formulário quando os grupos e abas são remontados. Não há opções provisórias.
`resetTerminalAppearance` limpa cores individuais e restaura as preferências
globais atomicamente, usando o debounce existente. Não altera motor, sessões,
foco solicitado, dimensões dos painéis ou altura salva do dock. Repetir uma
preferência ou restauração sem mudanças não dispara autosave.
A restauração da aparência também preserva o modo de organização escolhido.

### Undo/Redo — primeira etapa: posições

`topologyHistory.ts` define operações tipadas `move-nodes` com IDs e posições
antes/depois, pilhas past/future e limite de 50 operações em memória. Transações
de arraste guardam posições antes do primeiro movimento e registram apenas nós
efetivamente alterados ao terminar. Seleções múltiplas geram uma operação. Setas
repetidas ficam agrupadas até 350 ms após keyup; mudança de foco, nova interação
ou Undo/Redo confirma o grupo. Escape/pointercancel cancela e restaura posições,
ignorando eventos restantes do arraste. Uma edição real limpa Redo; no-ops não.

O store aplica posições diretamente aos nós controlados, sem substituir Network,
Device, sessões xterm ou configuração. A aplicação valida todos os IDs/posições
esperados antes de alterar qualquer nó e agenda o autosave existente. Histórico
não entra em JSON, autosave, links de compartilhamento ou preferências locais.
Tick, refresh, pacotes, relógio e estado visual não participam do histórico.

Configurações ainda não têm operações inversas: são
barreiras que limpam as duas pilhas e descartam uma transação incompatível.
Para configuração, a comparação usa somente a serialização persistível sem
posições; essa assinatura serve à invalidação, nunca à restauração. É verificada
nos setters, ao iniciar/concluir movimentações, antes de Undo/Redo e ao terminar
comandos que sinalizam mudança. Isso evita atribuir a um ping longo alterações
já tratadas em outro local e detecta configurações assíncronas antes de aplicar
histórico antigo. Não observa cada tick nem caches/saídas de comandos.

New, Demo, carregamento/importação bem-sucedida, exemplos, labs e boot iniciam
histórico vazio. Falhas de importação não limpam as pilhas. Permanece fora desta
etapa o problema existente de `adoptSave` descartar sessões antes de validar toda
a restauração. O descarte mínimo de timers de dispositivos foi tratado na etapa 2.

`topologyShortcuts.ts` protege origem do evento e foco real: xterm/dock, inputs,
textareas, selects, contenteditable, textboxes e popovers. Ctrl/Cmd+Z e Shift+Z
usam listener em bubble, respeitando defaultPrevented e composição. A toolbar
oferece botões desabilitados quando vazios e tooltips com a próxima operação.

### Undo/Redo — etapa 2: cabos e criação

O mesmo histórico limitado recebe `add-links`, `remove-links` e `create-device`.
Cabos guardam ID, interfaces exatas em ambas as extremidades e latência. O
adaptador `topologyEdits.ts` valida todos os links/portas antes de aplicar um
lote, sem escolher interfaces alternativas, duplicar links ou alterar a Network.
Uma exclusão múltipla de cabos é uma operação. Movimentos, conexões e criações
compartilham a mesma sequência; novas edições confirmadas limpam Redo.

Uma criação guarda somente a configuração inicial do dispositivo, posição,
índice visual e MACs. Undo fecha apenas sua sessão e remove esse dispositivo;
Redo usa `restoreDevice` (também reutilizado pela importação) para criar uma
instância nova com a identidade original. Nenhum dispositivo sobrevivente é
reconstruído, nem há restauração de snapshot global. Terminais fechados pelo
Undo não reabrem no Redo. Alterações posteriores de configuração continuam
invalidando as pilhas, pois ainda não possuem inversa segura.

O scheduler permite associar eventos a um proprietário. Dispositivos e links
cancelam apenas seus eventos ao serem descartados. ARP, RIP, callbacks locais,
timeouts de serviços e timers de ping/traceroute/dhclient usam essa associação;
as sessões cancelam seus comandos antes da remoção. A entrega de quadros também
confere a identidade da instância do link, evitando entregar quadros antigos
mesmo quando o mesmo ID é restaurado. Protocolos, temporização e algoritmos de
rede permanecem iguais; a mudança no motor se limita ao ciclo de descarte e à
reutilização da restauração individual. Caches, relógio e resultados de comandos
não são revertidos. Se a perda de rota encerrar um ping normalmente, o Redo/Undo
do cabo não reinicia esse comando.

Continua fora do escopo a validação transacional completa da importação. O
histórico não tenta restaurar resultados de verificações de laboratórios.

### Undo/Redo — etapa 3: exclusão de dispositivos

`delete-devices` guarda registros dos dispositivos removidos, cores individuais
e cabos (incidentes ou explicitamente selecionados), deduplicados pelo ID.
Inspector, mudanças de nós por API e exclusões do editor usam a mesma ação
`deleteTopologyElements`. O `onBeforeDelete` do React Flow assume a transação
completa e retorna false, impedindo que os callbacks separados removam primeiro
os cabos e dividam o gesto em entradas diferentes. Notificações redundantes de
remoção não criam novas entradas. A ordem visual original é restaurada pelos
índices dos nós. Comandos e configurações do Inspector seguem fora do histórico.

O Undo prepara apenas os dispositivos excluídos numa rede temporária isolada,
confere configurações restauradas, MACs, IDs, portas e latências de todo o lote
contra a rede ativa e só então registra as instâncias na Network existente.
Falhas de preparação não alteram o motor ativo nem suas sessões. Não há snapshot
global aplicado à simulação. RIP é iniciado depois que todos os cabos estão
restaurados. Redo valida novamente os dispositivos/cabos e usa o descarte seguro
da etapa anterior. Sessões encerradas não ressuscitam; dispositivos sobreviventes,
seus buffers e comandos mantêm identidade e estado. Caches e relógio não voltam
no tempo. Verificações assíncronas de labs usam uma geração: excluir dispositivos
ou carregar uma topologia invalida a execução anterior, evitando resultados e
próximos passos obsoletos. Após excluir, uma nova verificação pode ser iniciada.

O formato v1 recebe campos opcionais `ifaces[].mac` e `links[].latency` para
preservar os valores também após autosave/F5/exportação. Arquivos antigos geram
MACs como antes e usam 80 ms quando a latência não estiver presente. O alocador
de MACs evita valores já restaurados, inclusive quando há lacunas ou outra ordem
de inserção. Histórico e sessões continuam apenas em memória.

## NetLab-FiSI — ideias futuras

- Expandir Undo/Redo para Inspector e comandos, com
  transações próprias e tratamento seguro de timers e referências do motor.
- Perfis de terminal Windows e Linux por dispositivo, com comandos e saídas
  equivalentes sobre o mesmo motor. Manter explícito o subconjunto suportado.
- Outros estilos de gradiente e controles avançados de aparência.
- Avaliar uma linha colorida no topo do próprio painel, imediatamente abaixo
  das abas. Nesta etapa existe apenas a borda integrada às abas, sem alternância
  entre estilos de identificação.

Estas ideias estão apenas registradas; não fazem parte da implementação atual.

## 7. References

- Ye, M. & Sandrasegaran, K. (2006). *Teaching about Firewall Concepts using the iNetwork
  Simulator*, IEEE (PDF in this folder).
- iNetwork Simulator (UTS) feature descriptions: `desc-0.md`, `desc-1.md`, `desc-2.md`,
  UI annotated screenshot `inetworksimulatorak9.png`.
- Competitor notes: `others.md` + research (NetPilot, PT Anywhere, Boson, Filius,
  PackeTTrino, iptables-sim, TULiPS; v86 networking docs; CheerpX licensing).
