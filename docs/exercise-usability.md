# Übungen Beta — refinamentos pedagógicos e de usabilidade

## Escopo e compatibilidade

- O menu público agrupa somente os seis exercícios já publicados: E06/E09 em
  IPv4 & Subnetting; Büro und Lager/E08/D02 em Routing & Gateway; Serviceportal
  em DNS & Netzwerkdienste. Rechenpraxis permanece separada, com os nomes
  Subnetting, VLSM, Gateway & CIDR e Subnetzgrenzen. IDs internos não mudam.
- Subnetzgrenzen (ND02 v3) é a categoria inicial, em dificuldade iniciante,
  quando ainda não existe uma questão ativa. Reabrir preserva a questão atual.
- `menuGroups.ts` contém a organização; novos labels usam DE/EN/PT-BR.
  Grupos usam `<details>`; setas do popover incluem os títulos e ignoram
  botões ocultos. Enter/Espaço expandem/recolhem; Escape restaura o foco.
- Não foram alterados contratos, versões, critérios de conclusão, progresso,
  verificadores ou o menu Labs. Nenhum draft interno adicional foi publicado.

## Gateway no Inspector

`InterfaceGatewayRoutes.tsx` explica os defaults abaixo de Standardgateway.
O input continua editando exclusivamente `iface.gateway`. Rotas explícitas e
RIP são informações independentes e não são copiadas para o formulário.

`defaultRouteSummary()` consulta o `lookupRoute` real em limites da tabela,
em vez de assumir que um IP público arbitrário utiliza o default. Identifica
a rota escolhida para destinos sem correspondência mais específica, incluindo
o caso de não existir destino servido por default (por exemplo, duas /1).
A ordem e os critérios de disponibilidade continuam pertencendo à engine.
Uma rota selecionada não garante que o gateway responda a ARP/ICMP.

Múltiplos defaults recebem uma explicação informativa; não são automaticamente
considerados inválidos. A tabela completa fica em uma seção recolhível. As
atualizações reutilizam `nodes`/`uiPulse` do formulário existente, inclusive
terminal, Undo/Redo e restauração.

Em **Allgemein**, Gateway mostra somente o endereço da rota default aplicável
àquela interface, sem a origem. Ausência de default ou múltiplos próximos saltos
utilizáveis distintos mostram `—`. Essa apresentação é conservadora: Netzwerk
continua identificando a escolha determinística por ordem feita pelo simulador.
Entradas independentes com o mesmo próximo salto/interface não são ambíguas.

## Ping a 0.25×

`PING_ANIMATION_SPEEDS` oferece 0.25, 0.5, 1 e 2; o valor inicial é
`DEFAULT_PING_ANIMATION_SPEED = 0.25`. O cursor sequencial atual usa base de
200 ms/link: 0.25× corresponde a **800 ms/link**. A base técnica histórica de
1.000 ms de `packetAnimationDuration(speed, 'guided')` permanece disponível e
inalterada; não foi usada para mudar retroativamente a escala deste controle.

O slider modifica somente o cursor do ping. Live continua em 200 ms/link e
o Scheduler em ritmo normal. Preferências antigas de velocidade não são lidas
nem reativadas. A mudança preserva progresso fracionário, pausa, Step, Replay,
ARP/ICMP, os horários e a quantidade de pings.

## Layout experimental de novas tentativas

- `publicationLayout.ts` é um adaptador de autoria: aumenta os espaçamentos em
  **18%** e organiza E06 como PC–Switch–PC, E08/E09 como Büro–Router–Archiv e
  D02 como Büro–West–Ost–Lager. Os dois exercícios anteriores recebem o mesmo
  aumento proporcional, preservando sua composição original.
- Regenerar com `node scripts/generate-exercise-beta.mjs` e
  `node scripts/generate-practical-beta.mjs`. Apenas as projeções de aluno
  mudam de posição; regras e dados de rede permanecem iguais.
- Ao concluir a abertura de uma **nova** tentativa, `ExerciseController`
  solicita um enquadramento de apresentação associado ao draft recém-criado.
  `WorkspaceViewport` consome esse pedido uma única vez, após medir os nodes,
  usando **maxZoom: 0.65**, respeitando os limites do editor.
- O pedido não é serializado. Em F5/reabertura de uma sessão, a associação
  validada da tentativa ao draft permite limitar o Fit View Beta a **0.65×**.
  O primeiro enquadramento aguarda a leitura desses metadados; não infere um
  exercício pelo nome ou pelos IPs. Coordenadas existentes não são modificadas.
- Viewports de abas visitadas ficam em memória, por sessão/draft, e são
  restaurados ao retornar à aba. Zoom e pan manuais não sofrem novo Fit View.
  F5 descarta esse cache e aplica o limite de recuperação acima. Projetos
  pessoais e Labs preservam o máximo inicial anterior de 1.25×.
- Não há auto-layout durante o arraste nem novo fit ao redimensionar painéis.
  As opções padrão do React Flow têm identidade estável para não sobrescrever
  os limites de um `fitView()` que ainda esteja enfileirado.

## E06 e reflexão opcional

A descrição compacta do E06 é um adaptador de apresentação do exercício v1.
Após a verificação, explica 192.168.0.0/16, máscara 255.255.0.0 e ARP local.
Não introduz uma nova condição de conclusão nem uma avaliação conceitual falsa.

O resumo dos pilotos não anuncia mais uma discussão manual pendente. Nos
outros pilotos, as observações continuam disponíveis como **reflexão opcional,
sem nota**. A confirmação técnica continua separada da compreensão do aluno.

## Verificação

```powershell
npm.cmd test -- src/exercises src/hostNetworkSummary.test.ts src/components/Inspector.test.ts src/components/floatingPosition.test.ts src/guidedPacket.test.ts src/packetAnimation.test.ts src/terminals.test.ts src/i18n/i18n.test.ts src/persistence/sessionController.test.ts
node scripts/test-practical-exercises.mjs
npm.cmd run build
node scripts/validate-network-factory.mjs --check-bundle
git diff --check
```

O harness Chromium usa perfil temporário, origem de teste e banco
`netlab-idb-test-*`. Reutiliza os testes de exercícios anteriores, pilotos,
Save/Load, F5 e sessões. As capturas principais são publicadas pelo gerador
Visual Review em `.playwright-mcp/reviews/`, com extras em `raw/` e revisões
anteriores preservadas em `archive/`. Todos esses artefatos ficam fora do Git.

Validação desta rodada: **1.456 testes / 28 arquivos**, **118 verificações
Chromium** sem erros de navegador, TypeScript, build e `git diff --check`
aprovados. A auditoria do bundle confirmou a ausência do catálogo interno;
`betaChecks.json` e `practicalRules.json` não tiveram alterações. O build
mantém o aviso conhecido de chunk acima de 500 kB e o teste SSR da homepage
mantém seu aviso de `useLayoutEffect` no servidor.

Limitações deliberadas: a compreensão conceitual do E06 não recebe uma nota nem
um novo requisito. Os limites de enquadramento são experimentais; o limite
inferior normal do editor permanece 0.25×. Tentativas existentes não recebem
as novas posições por migração. Um plano salvo e reaberto como outro draft,
sem associação à tentativa, continua sendo um plano comum, como já documentado
no piloto; não recebe classificação Beta por heurística nem novo vínculo.

Validação adicional de Gateway/Zoom: **90 testes direcionados** aprovados,
incluindo a suíte Chromium de Workspace UI; **118 verificações** no harness de
exercícios e **204 verificações específicas de viewport** aprovadas, sem erros
de navegador. E08/E09 testados com limite de 0.65×, F5 com o mesmo limite, ida/volta de abas com
zoom/pan manual, gateway pelo formulário e rotas pelo terminal real. TypeScript,
build e `git diff --check` aprovados; preservado o aviso de bundle acima de 500 kB.

Revisão de consolidação em 03/11/2026: **2.608 testes / 134 arquivos**,
TypeScript e build aprovados; as quatro projeções JSON correspondem às fontes.
O fluxo Chromium da Rechenpraxis passou em **140 verificações**, sem falhas
nem erros de navegador, incluindo o novo default, as quatro categorias,
traduções, respostas, navegação e F5. Os roteiros visuais agora selecionam E02
explicitamente para verificar sua compatibilidade, em vez de presumir que
continua sendo o default. O bundle continua excluindo o catálogo interno.
