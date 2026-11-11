# Capítulo 5 v5 — pontos de entrada e progresso

O submenu em **Übungen (Beta) → Geführte Tutorials → Kapitel 5** oferece
somente início, Parte 2 e Parte 3. Não há criação de tentativas no boot nem URL
experimental. FloatingPopover, fallback lateral, teclado/Escape e Voltar em telas
estreitas permanecem; o menu não foi redesenhado.

| Entrada | Primeira tarefa | Configuração fornecida | Prática |
|---|---:|---|---:|
| Início | 1 | Triângulo R1/R2/R3 sem IPv4 | 16/16 |
| part-2 | 7 | Transit /30, LANs A/B /24 e gateways; sem rotas entre LANs | 10/10 |
| part-3 | 14 | A/B funcionais via R2, quatro rotas estáticas, enlaces UP | 3/3 |

As tarefas 1–4 formam a Parte 1; 5–13, a Parte 2; 14–16, a Parte 3.
As antigas tarefas 20–22 passaram a 14–16. Não há LAN C, PC C ou atividade LPM.
O descritor de part-3 usa **scenarioVersion: 2**; part-4 não existe no catálogo.

## Contrato e abertura atômica

alternativeEntryContract.ts define os dois descritores fechados e valida os
pré-requisitos reais do documento inicial. alternativeEntries.ts monta a rede
usando serialização normal e materializa MACs antes de gravar. A rede temporária
é descartada, sem Scheduler, comandos ou pings do aluno.

createAlternativeBeginningAttempt() e createAlternativeEntryAttempt(point)
fornecem documento, progresso vazio e checkpoint. As entradas avançadas são
assíncronas; a Parte 3 calcula o fingerprint técnico antes da abertura.
AlternativePathsController.begin() acrescenta a seleção da tentativa à mesma
initialization. SessionController.openDocument()/WorkspaceRepository.createDraft()
persistem rascunho, sessão, progresso, checkpoint e seleção atomicamente. CAS,
quota ou abort não deixam tentativa parcial; uma interrupção posterior ao commit
recupera o conjunto completo. A tentativa anterior não é substituída.

Progresso de início usa schemaVersion 1; entradas avançadas usam schemaVersion 2
com entry obrigatório. Ambos pertencem exclusivamente a **chapterVersion: 5**.
Documento/topologia e stores IndexedDB mantêm seus schemas anteriores.

## Baseline e tempestade

No início integral e na Parte 2, a transição 13 → 14 confere configuração via R2,
Next Hop respondido e os dois comprovantes A/B reais. Grava viaBaseline com a
nova etapa, antes de consumir o incidente. Visitar tarefas anteriores depois da
tempestade não recalcula esse baseline.

Na entrada direta da Parte 3, scenarioBaseline identifica somente a configuração
fornecida. viaBaseline, viaReplies, respostas e completed permanecem vazios.
Não há crédito fictício para tarefas 1–13.

A tarefa 14 consome storm: pending pela transação commitStorm existente:
porta R2 eth1 DOWN e marcador applied/adopted são gravados juntos. Cabo, endereços,
rotas e os cinco equipamentos permanecem. F5, navegação, Undo da porta ou uma
correção do aluno não reaplicam a tempestade. Porta já indisponível é adotada sem
nova alteração. Configuração diferente do baseline bloqueia o incidente.

O aluno observa uma falha real A → R1 → R2 antes da explicação. Na tarefa 15,
dois indicadores verificam R1 → LAN B via R3 e R3 → LAN A via R1, incluindo toda
a faixa utilizável de cada LAN. replace e del + add equivalentes são aceitos;
um atalho /32 que só permite o ping de um PC não basta. A tarefa 16 exige novas
Echo Requests/Replies nos dois sentidos A → R1 → R3 → B e B → R3 → R1 → A.

## Reinício, revisão e conclusão

O checkpoint restaura a origem escolhida: tarefa 1, 7 ou 14. Na Parte 3, restaura
A/B via R2 e enlace UP/pending, preparando uma nova execução explícita do
incidente. Equipamentos independentes são preservados; identidades ou cabos
ambíguos bloqueiam a operação. O baseline técnico do cenário restaurado considera
os equipamentos independentes preservados. O checkpoint original não é reescrito.

recordEntryIncident() concilia o consumo da tempestade com o ticket do reinício.
Undo da porta seguido de Undo do reinício recupera a tentativa anterior; Redo
mantém o marcador consumido, sem disparar outro incidente. Como antes, o histórico
Undo/Redo é transitório; documento e progresso persistem após F5.

Revisão histórica continua separada da validade atual da configuração: o box
com check não cria recibos nem autoriza novas provas com base na configuração.
A prática parcial termina positivamente em 10/10 ou 3/3 e permite explorar a
rede; seus resultados integrais são 10/16 ou 3/16. Só uma tentativa iniciada no
começo que comprove todas as 16 tarefas concede conclusão integral histórica.
Não há soma de tentativas. Indicadores verde/azul/neutro e textos acessíveis
continuam independentes do contador da prática atual.

## Edição antiga preservada

Os quatro namespaces da edição nova são:

- `guided:alternative-paths:v5:draft:<id>`
- `guided:checkpoint:v5:<id>:alternative-paths`
- `guided:current-attempt:v5:alternative-paths`
- `guided:chapter-completion:v5:alternative-paths`

As chaves anteriores permanecem intactas, sem migração, exclusão ou limpeza de
IndexedDB. Um draft com progresso antigo é reconhecido como pertencente à edição
anterior, para suspender controllers de capítulos anteriores, mas não ativa o
painel v5, sua tempestade ou o reinício novo. Continua aberto como rede editável.
Progresso e histórico antigos não são apresentados como erro de corrupção nem
reinterpretados como crédito v5. Apenas registros inválidos no namespace v5 são
erros de contrato. Nova tentativa cria outro draft com controles v5.

O histórico/seleção v5 usam CAS e guards da revisão da origem, como antes.
São metadados locais ao navegador: não acompanham exportações JSON.
Os capítulos 1–4 mantêm suas chaves e comportamento.

## Testes e capturas

O roteiro node scripts/test-alternative-paths-tutorial.mjs usa Chromium, xterm,
pings reais e banco/perfil descartáveis. Cobre fluxo integral, duas entradas,
conclusão parcial/integral, tempestade, F5, recuperação, /32 insuficiente,
histórico, reinício/Undo/Redo, registros antigos, idiomas e Dark/Light.
Capturas reais ficam em .playwright-mcp/reviews/chapter5-v5/referencias-chatgpt/,
separadas dos logs e backups locais. Nenhum atalho de conclusão é distribuído.

Validação em 11/11/2026: **3.020 testes em 184 arquivos**, **134 verificações
Chromium**, TypeScript, build e diff-check aprovados. Sem erros de navegador.
Sete PNGs inspecionados e galeria em `.playwright-mcp/reviews/chapter5-v5/index.html`.
Permanece o aviso conhecido de chunk JS acima de 500 kB. Sem commit/push/deploy.
