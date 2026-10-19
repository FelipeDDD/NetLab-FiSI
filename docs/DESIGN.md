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
  pesos. O store mantém `terminals` como ordem global para atalhos e
  `terminalPanels` com `{ id, tabs, active, weight }` para apresentação.
  Os IDs dos painéis são independentes dos IDs de dispositivos. Os primeiros
  quatro terminais criam colunas iguais; os excedentes entram no painel que
  recebeu foco por último. Abas de outros painéis continuam selecionadas e
  visíveis. A estrutura permite acrescentar movimentação entre painéis depois,
  sem alterar o registro de sessões.
- `TerminalPanelView` monta as abas e suas áreas xterm; `attachTerminalSession`
  abre uma sessão uma única vez ou reanexa o mesmo elemento DOM. Desmontar a
  apresentação e parar um ResizeObserver nunca descarta buffer nem cancela
  comandos. Só fechamento definitivo, exclusão de dispositivo ou troca de
  topologia descartam sessões. Todos os terminais visíveis usam FitAddon com
  ResizeObserver coalescido por frame; abas ocultas continuam executando.
- Flexbox distribui pesos proporcionais. `TerminalPanelSplitter` altera apenas
  o par adjacente e oferece arraste, teclado e equalização. O mínimo de 280px
  evita compressão excessiva; telas estreitas usam rolagem horizontal, trazendo
  o painel ativado à vista. A altura salva permanece independente. Painéis,
  abas e larguras são transitórios e não entram no JSON nem no autosave.
- `terminalHasFocus` distingue foco real/solicitado de uma aba apenas visível;
  eventos de foco não geram novos pedidos de foco. Escape é capturado somente
  no xterm, libera o foco e foca a região do editor, sem enviar entrada ao shell.
  A navegação continua global e circular. Ctrl+Tab mantém as limitações do
  navegador já documentadas; Alt+Shift+Setas é a alternativa.
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

O dock oferece Terminal settings em uma faixa superior comum, sem ocupar a
largura de nenhum painel. `TerminalSettingsControls` reúne Appearance e permite
escolher qualquer dispositivo com shell, inclusive sem sessão aberta. Trocar o
dispositivo do formulário não troca a sessão ativa nem abre terminais. O acesso
pela aba usa o mesmo componente, com o dispositivo pré-selecionado. Não há
seções Layout/Behavior sem opções implementadas.
`resetTerminalAppearance` limpa cores individuais e restaura as preferências
globais atomicamente, usando o debounce existente. Não altera motor, sessões,
foco solicitado, dimensões dos painéis ou altura salva do dock. Repetir uma
preferência ou restauração sem mudanças não dispara autosave.

## NetLab-FiSI — ideias futuras (fora da etapa 2)

- Undo/Redo das alterações da topologia, inicialmente com histórico limitado a
  5 estados, botões visíveis e atalhos Ctrl+Z/Ctrl+Shift+Z. Definir quais ações
  entram no histórico e como restaurar a configuração sem reutilizar sessões
  ou eventos de simulação obsoletos.
- Proteger os atalhos globais para não interceptar digitação ou comandos em
  terminais, inputs, textareas e outros campos editáveis.
- Perfis de terminal Windows e Linux por dispositivo, com comandos e saídas
  equivalentes sobre o mesmo motor. Manter explícito o subconjunto suportado.
- Drag and drop de abas entre painéis. A estrutura atual separa o grupo,
  o botão de ativação, o indicador e o fechamento.
- Cadeado por painel para fixar sua largura; redistribuir automaticamente
  somente os painéis destravados.
- Recolher/expandir o dock sem encerrar sessões ou comandos.
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
