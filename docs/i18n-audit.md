# Auditoria de internacionalização — 28/10/2026

## Escopo e método

Inspeção de componentes, navegação, store, persistência, comandos e conteúdo pedagógico. O inventário reproduzível usa `node scripts/audit-ui-strings.mjs`: AST TypeScript/JSX e valores JSON, excluindo testes, URLs e identificadores simples. Conta candidatos distintos **por arquivo**, não chaves definitivas. Pode incluir textos técnicos e excluir labels de uma palavra em objetos; as quantidades são estimativas de trabalho, não percentuais de cobertura.

Não houve substituição global de strings. Protocolos, engine, comandos, JSON de exercícios, verificadores, IDs e progressos não foram traduzidos. A extração de `projectMetadata.ts` mantém os mesmos validadores e reexporta a API antiga, removendo apenas o acoplamento da listagem da homepage com a reconstrução da rede.

## Módulos, riscos e ordem recomendada

| Módulo / arquivos principais | Idiomas encontrados | Prioridade / risco / recomendação |
|---|---|---|
| `home/`, `i18n/catalogs/` | DE / EN / PT-BR | Migrado integralmente. Inglês é a origem dos catálogos; mesmos campos e placeholders nos três idiomas. |
| `components/Toolbar.tsx`, `Palette.tsx`, `FloatingPopover.tsx` | DE/EN misturados | P1. Menus principais e ações de planos migrados; descrições de exportação, grupos de dispositivos e captura ainda pendentes. Preservar foco, typeahead, atalhos e nomes de formatos. |
| `workspace/WorkspaceUI.tsx`, `WorkspaceApplication.tsx` | DE predominante | P1. Criar/abrir/salvar/listar/excluir planos traduzidos. Fechamento com alterações, avisos de conflito, recuperação, status de rascunhos e boot ainda em DE. Não mudar a semântica de Save vs. autosave ao traduzir. |
| `projects/`, `persistence/` | Erros internos EN, mensagens ao usuário DE | P1 para mensagens de UX, P3 para diagnósticos. Traduzir na fronteira UI usando os códigos existentes, sem mudar `error.code`, IDs, contratos ou esquema. |
| `exercises/ExerciseUI.tsx`, `exerciseController.ts` | Interface DE, enunciados DE | Menu, botões de início/continuação e estados de progresso migrados. Painel de execução/validação e mensagens do controller pendentes. Enunciados precisam de revisão pedagógica separada. Não alterar `contentVersion`, `resolveBy: 'id'`, requisitos ou gabaritos. |
| `labs/library.ts`, `labs/examples.ts`, `components/LabPanel.tsx` | Conteúdo EN, controles EN/DE | P2. Separar UI de enunciados aprovados. Traduções dos textos didáticos não podem mudar comandos, topologias ou critérios. |
| `components/Inspector.tsx`, `InterfaceIpv4Panel.tsx`, `DhcpPoolsPanel.tsx`, `InterfaceConnection.tsx` | DE com termos técnicos EN | P2. Extrair por seção: Geral, interfaces, serviços, routing. Variáveis: nomes, IPs, portas, intervalos, VLAN e contagens. Não construir mensagens traduzidas a partir de texto técnico analisável. |
| `components/InspectorLayoutSettings.tsx`, `BackgroundSettings.tsx`, `TerminalAppearanceControls.tsx` | DE/EN | P2. Seletor de idioma introduzido, demais formulários pendentes. Nomes de presets e temas são nomes próprios, não valores serializados traduzíveis. |
| `components/PacketInspector.tsx`, `PacketAnimationControl.tsx`, `packetPresentation.ts` | DE/EN | P2. Separar `Live`, `Schrittmodus`, descrições de inspeção e dados de protocolo. `ICMP Echo Request`, IDs de transferências e flags permanecem invariáveis. |
| `components/Flow.tsx`, `DeviceNode.tsx`, `AreaMarkings.tsx`, `CableManager.tsx`, `store.ts` | DE/EN | P2. Labels e tooltips traduzíveis; nomes de equipamentos e áreas são conteúdo do usuário. Preservar MIME de clipboard, dados do canvas e IDs de interfaces. |
| `components/TerminalDock.tsx`, `terminals.ts`, `commands/` | UI DE/EN; comandos e saídas EN | P2 para chrome do terminal; preservar saída simulada dos comandos. Não aplicar `t()` ao parser, stdout, flags, exemplos executáveis ou paleta ANSI. |
| `engine/` | Erros e descrições EN | P3 na fronteira UI. Não internacionalizar objetos de pacotes, enums ou mensagens usadas em protocolos/testes. |
| `exercises/factory/`, drafts e JSON gerados | Conteúdo didático DE | Não publicar nem traduzir automaticamente. Os 20 drafts internos continuam separados do catálogo beta publicado. |

## Inconsistências confirmadas

- A homepage antiga era EN e usava NetSim, enquanto menus do editor eram majoritariamente DE e o produto se apresenta como NetLab-FiSI. A nova homepage tem identidade própria e três catálogos completos.
- `Toolbar` combina Datei, Run, Packets, Share link e descrições EN/DE. Nesta etapa os rótulos de navegação/planos são localizados; comandos técnicos e operações não foram renomeados internamente.
- `WorkspaceUI`, `ExerciseUI` e outros componentes usavam datas `de-DE` fixas. As listas e o menu migrados agora usam o idioma escolhido; demais datas são migração posterior.
- O terminal ainda apresenta um banner NetSim e exemplos em inglês. Não foi alterado: a política desta rodada preserva a saída dos terminais.
- Existem mensagens com nomes interpolados, plurais de contagens, resultados de verificações e estados montados por concatenação. A migração deve manter placeholders e distinguir dados do usuário de vocabulário traduzido.
- Enunciados e verificações não são apenas UI: uma tradução silenciosa pode mudar o significado pedagógico ou os critérios. A interface explicita que o conteúdo mantém o idioma original.

## Migração gradual

1. Completar navegação secundária e mensagens de workspace, com testes dos códigos de erro e recuperação.
2. Traduzir Settings e o chrome dos terminais, sem tocar no stdout ou nas preferências existentes.
3. Migrar Inspector por domínio, mantendo labels de protocolo e valores técnicos.
4. Traduzir apresentação de pacotes, Quick Ping, ferramentas e catálogo.
5. Introduzir traduções pedagógicas aprovadas por ID e versão de conteúdo, sem alterar topologias, enunciados de professores ou gabaritos automaticamente.

O hook não troca de árvore React nem inicia uma simulação. Preferência de idioma não entra em documentos, histórico ou IndexedDB. Há testes de paridade dos catálogos, placeholders, chaves estáticas, literais JSX da homepage e navegação real nos três idiomas.

## Glossário inicial DE / EN / PT-BR

| DE | EN | PT-BR | Política |
|---|---|---|---|
| Startseite | Home | Início | Traduzível |
| Arbeitsbereich | Workspace | Área de trabalho | Traduzível; não renomear contratos |
| Plan | Plan | Plano | Documento de topologia salvo |
| Entwurf | Draft | Rascunho | Diferenciar de plano salvo manualmente |
| Gesichert | Protected / backed up | Protegido / cópia segura | Não confundir autosave do rascunho com Save |
| Speichern unter | Save as | Salvar como | Traduzível |
| Gerät | Device | Dispositivo | Categoria traduzível; nome/ID do usuário invariável |
| Schnittstelle | Interface | Interface | `eth0`, `wlan0` invariáveis |
| Verbindung | Connection | Conexão | Traduzível |
| Bereich / Markierung | Area / marking | Área / marcação | Nunca confundir com VLAN real |
| Schrittmodus | Step mode | Modo passo a passo | Manter identificador interno `guided` |
| Live | Live | Live | Nome de modo; manter |
| Übungen | Exercises | Exercícios | Enunciados exigem aprovação separada |
| Labs | Labs | Labs | Nome do recurso |
| In Bearbeitung | In progress | Em andamento | Estado de progresso |
| Default Gateway | Default Gateway | Gateway padrão | Label traduzível; valor IP invariável |
| Subnetzmaske | Subnet mask | Máscara de sub-rede | Label traduzível |
| Routing | Routing | Roteamento | Vocabulário; tabelas/contratos invariáveis |
| Firewall | Firewall | Firewall | Termo técnico |
| Subnetting | Subnetting | Subnetting | Termo técnico |
| Packet Capture | Packet Capture | Packet Capture | Nome do recurso |
| Quick Ping | Quick Ping | Quick Ping | Nome do recurso |
| ARP / DHCP / DNS / ICMP / TCP / UDP | Idem | Idem | Invariável |
| IPv4 / CIDR / MAC / SSID / VLAN | Idem | Idem | Invariável |
| `ping`, `dhclient`, `ipconfig`, flags | Idem | Idem | Comandos e saída técnica não traduzidos |
| IPs, máscaras, IDs, JSON keys | Idem | Idem | Nunca traduzir ou reformatar na persistência |

## Inventário quantitativo

<!-- GENERATED-INVENTORY: appended from the read-only AST audit. -->

| Module | Candidates |
|---|---:|
| UI / utilitários | 392 |
| Canvas / ferramentas | 112 |
| Preferências visuais | 23 |
| Terminais / CLI | 488 |
| Inspector / configuração | 344 |
| Menus / catálogo | 80 |
| Pacotes / diagnóstico | 74 |
| Engine / protocolos | 149 |
| Übungen | 173 |
| Fábrica interna | 248 |
| Homepage / catálogos | 259 |
| Labs / exemplos | 170 |
| Planos / persistência | 199 |

<details>
<summary>File inventory (144)</summary>

| File | Candidates |
|---|---:|
| src/App.tsx | 6 |
| src/areaMarkings.ts | 2 |
| src/backgroundParticles.ts | 4 |
| src/cableAppearance.ts | 2 |
| src/cableInteraction.ts | 4 |
| src/canvasBackground.ts | 9 |
| src/canvasNetwork.ts | 9 |
| src/commands/curl.ts | 19 |
| src/commands/dhclient.ts | 19 |
| src/commands/dhcp-service.ts | 6 |
| src/commands/dig.ts | 15 |
| src/commands/ip-cmd.ts | 34 |
| src/commands/iptables.ts | 34 |
| src/commands/nc.ts | 18 |
| src/commands/nft.ts | 43 |
| src/commands/ping.ts | 47 |
| src/commands/resolve.ts | 2 |
| src/commands/shell.ts | 17 |
| src/commands/traceroute.ts | 17 |
| src/commands/windows.ts | 38 |
| src/components/AlignmentGuides.tsx | 1 |
| src/components/ApRangeControl.tsx | 3 |
| src/components/AreaMarkings.tsx | 35 |
| src/components/BackgroundParticles.tsx | 4 |
| src/components/BackgroundSettings.tsx | 4 |
| src/components/CableManager.tsx | 18 |
| src/components/ClientDiagnostics.tsx | 10 |
| src/components/CopyIpButton.tsx | 4 |
| src/components/DeviceActions.tsx | 6 |
| src/components/DeviceArtwork.tsx | 7 |
| src/components/DeviceLabels.tsx | 1 |
| src/components/DeviceNode.tsx | 9 |
| src/components/DhcpPoolsPanel.tsx | 20 |
| src/components/DiagnosticTables.tsx | 21 |
| src/components/FirewallInfo.tsx | 6 |
| src/components/FloatingEdge.tsx | 1 |
| src/components/FloatingPopover.tsx | 2 |
| src/components/Flow.tsx | 15 |
| src/components/GuidedPacketControls.tsx | 19 |
| src/components/HostWireless.tsx | 11 |
| src/components/Inspector.tsx | 190 |
| src/components/InspectorLayoutSettings.tsx | 17 |
| src/components/InspectorTabs.tsx | 1 |
| src/components/InterfaceConnection.tsx | 34 |
| src/components/InterfaceIpv4Panel.tsx | 12 |
| src/components/LabPanel.tsx | 11 |
| src/components/LinkDetails.tsx | 6 |
| src/components/MarkingFreeDraw.tsx | 6 |
| src/components/MarkingGeometryEditor.tsx | 23 |
| src/components/NodeNetworkLabel.tsx | 7 |
| src/components/PacketAnimationControl.tsx | 8 |
| src/components/PacketInspector.tsx | 60 |
| src/components/PacketLayer.tsx | 4 |
| src/components/Palette.tsx | 20 |
| src/components/PersistenceStatus.tsx | 14 |
| src/components/ResizableInspector.tsx | 4 |
| src/components/ResizablePacketPanel.tsx | 4 |
| src/components/ShootingStar.tsx | 6 |
| src/components/SwitchPortLeds.tsx | 4 |
| src/components/TerminalAppearanceControls.tsx | 37 |
| src/components/TerminalDock.tsx | 10 |
| src/components/TerminalPanelSplitter.tsx | 4 |
| src/components/TerminalPanelView.tsx | 18 |
| src/components/TerminalTabMovement.tsx | 24 |
| src/components/Toolbar.tsx | 58 |
| src/components/WifiCoverage.tsx | 1 |
| src/components/useSmartAlignment.ts | 1 |
| src/engine/dhcpPools.ts | 10 |
| src/engine/factory.ts | 1 |
| src/engine/firewall-fmt.ts | 37 |
| src/engine/ipdevice.ts | 17 |
| src/engine/network.ts | 18 |
| src/engine/serialize.ts | 9 |
| src/engine/switch.ts | 10 |
| src/engine/validateSave.ts | 45 |
| src/engine/wirelessRange.ts | 2 |
| src/exercises/ExerciseUI.tsx | 19 |
| src/exercises/betaChecks.json | 1 |
| src/exercises/betaStudents.json | 15 |
| src/exercises/drafts.ts | 84 |
| src/exercises/exerciseController.ts | 19 |
| src/exercises/factory/calculations.ts | 109 |
| src/exercises/factory/generator.ts | 8 |
| src/exercises/factory/math.ts | 27 |
| src/exercises/factory/networkTools.ts | 13 |
| src/exercises/factory/practical.ts | 34 |
| src/exercises/factory/routing.ts | 34 |
| src/exercises/factory/validate.ts | 23 |
| src/exercises/validate.ts | 35 |
| src/export/compose.ts | 14 |
| src/export/configs.ts | 26 |
| src/export/containerlab.ts | 27 |
| src/export/diagram.ts | 27 |
| src/export/report.ts | 41 |
| src/guidedPacket.ts | 14 |
| src/home/Home.tsx | 4 |
| src/home/HomeTopology.tsx | 4 |
| src/home/recentPlans.ts | 4 |
| src/hostNetworkSummary.ts | 3 |
| src/i18n/catalogs/common.ts | 14 |
| src/i18n/catalogs/exercises.ts | 22 |
| src/i18n/catalogs/home.ts | 136 |
| src/i18n/catalogs/navigation.ts | 31 |
| src/i18n/catalogs/workspace.ts | 43 |
| src/i18n/index.ts | 1 |
| src/inspectorLayout.ts | 3 |
| src/labs/checker.ts | 25 |
| src/labs/examples.ts | 6 |
| src/labs/library.ts | 139 |
| src/main.tsx | 2 |
| src/packetPresentation.ts | 24 |
| src/persistence/openSessionController.ts | 1 |
| src/persistence/replacement.ts | 1 |
| src/persistence/sessionBootstrap.ts | 5 |
| src/persistence/sessionController.ts | 23 |
| src/persistence/topologyActivation.ts | 1 |
| src/persistence/topologyDocument.ts | 1 |
| src/projects/browserFixtures.ts | 6 |
| src/projects/database.ts | 11 |
| src/projects/legacyInspection.ts | 2 |
| src/projects/legacyMigration.ts | 14 |
| src/projects/legacySource.ts | 5 |
| src/projects/projectDocument.ts | 5 |
| src/projects/projectMetadata.ts | 1 |
| src/projects/recoveryArchive.ts | 4 |
| src/projects/repository.ts | 25 |
| src/projects/transactions.ts | 4 |
| src/projects/workspaceDocument.ts | 13 |
| src/projects/workspaceRepository.ts | 18 |
| src/quickPing.ts | 1 |
| src/store.ts | 109 |
| src/terminalAppearance.ts | 25 |
| src/terminalEffects.ts | 48 |
| src/terminalLine.ts | 1 |
| src/terminalPresentationSelection.ts | 1 |
| src/terminalStyleOptions.ts | 3 |
| src/terminals.ts | 8 |
| src/testing/dhcpGlobalFixture.ts | 2 |
| src/topologyHistory.ts | 3 |
| src/topologyShortcuts.ts | 1 |
| src/uiTheme.ts | 4 |
| src/workspace/WorkspaceApplication.tsx | 20 |
| src/workspace/WorkspaceUI.tsx | 38 |
| src/workspace/WorkspaceViewport.tsx | 1 |

</details>
