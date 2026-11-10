# Capítulo 5 — pontos de entrada e progresso (Rodadas 1–3)

As quatro opções estão disponíveis em **Übungen (Beta) → Geführte Tutorials →
Kapitel 5 → Neuen Versuch starten / Kapitel starten**. Não há URL experimental
ou criação automática de tentativas no boot. O início normal continua pela Parte 1.

## Cenários disponíveis

| Ponto | Primeira tarefa | Configuração fornecida |
|---|---|---|
| `part-2` | 7 | Triângulo IPv4 e LANs A/B, PCs com gateways; sem rotas estáticas entre as LANs. |
| `part-3` | 14 | Mesma rede, com as quatro rotas estáticas para A/B via R2; nenhum PC C ou cabo para ele. |
| `part-4` | 20 | A/B via R2, LAN C com PC C e gateway, rotas /24 via R2 e /25 via R3, enlace R2–R3 operacional; tempestade pendente. |

`alternativeEntryContract.ts` define um catálogo fechado e versionado: capítulo,
ponto, versão do cenário, primeira tarefa, configuração, tarefas fornecidas e
pré-requisitos técnicos. O leitor recusa versões desconhecidas, listas arbitrárias
e mistura com créditos `legacy`. Fornecimento não é comprovação do aluno.

`alternativeEntries.ts` gera documentos com as APIs normais de serialização,
materializando os MACs antes de persistir. A construção usa uma rede temporária,
descartada sem executar o Scheduler. Não executa comandos ou pings pelo aluno.

## Abertura e persistência

`await createAlternativeEntryAttempt(point)` retorna documento, progresso, checkpoint
de reinício e opções de abertura. `AlternativePathsController.begin(point)` usa
esse contrato; o harness também pode usar `openNewLearningAttempt(sessions,
attempt.document, attempt.options)`. O submenu público chama o mesmo controller,
sem duplicar a preparação das topologias na interface.
As Partes 2/3 preservam também o retorno síncrono existente. A Parte 4 calcula
assinatura técnica de forma assíncrona antes de iniciar qualquer gravação.

`SessionController.openDocument()` aceita `initialization: { id, control }`.
`WorkspaceRepository.createDraft()` grava rascunho, sessão e controles CAS na mesma
transação IndexedDB, antes da ativação. Conflito, quota e abort revertem todos os
registros dessa criação. A tentativa anterior não é substituída. Se a interrupção
ocorrer após o commit, existe uma tentativa completa para recuperação, em vez de
um rascunho que dependa de uma segunda gravação para adquirir sua identidade.

No menu público, `begin()` acrescenta o marcador de tentativa atual a esses mesmos
controles. O início normal também prepara seus metadados antes da abertura, via
`createAlternativeBeginningAttempt()`: mesmo triângulo, posições e configuração,
com MACs materializados, progresso vazio e checkpoint inicial. Isso fecha a janela
de F5 entre criar a tentativa e selecioná-la. Não se usa `legacy` nem se aprova
nenhuma tarefa. Os builders internos continuam separados da decisão de seleção.

Somente o progresso dessas novas entradas usa `schemaVersion: 2`, com o descritor
`entry` obrigatório. Isso impede builds antigos de interpretarem uma entrada
avançada como tentativa normal. O conteúdo continua com `chapterVersion: 4`,
22 tarefas, documento de projeto v1 e topologia `netsim` v1. Tentativas normais e
antigas continuam com o contrato anterior. Não há alteração de stores ou migração
estrutural do IndexedDB.

## Evidências e navegação

- O progresso começa com `completed: []`, respostas falsas e recibos nulos.
- Na Parte 3, a configuração efetiva via R2 pode habilitar a preparação de LAN C;
  isso não preenche `hopUnderstood` ou `viaReplies`.
- A/B pingado durante a tarefa 14 de uma entrada direta não dá crédito retroativo
  às tarefas fornecidas. Os pings de LAN C continuam exigindo emissão e caminhos reais.
- O botão Zurück para no limite da entrada. Uma nota DE/EN/PT-BR distingue tarefas
  fornecidas das realizadas; tarefas fornecidas nunca recebem check de conclusão.
- Alcançar a tarefa 22 por uma entrada parcial não equivale a cumprir as 22 tarefas.
  O cálculo integral continua separado do contador da prática e do histórico.

PC C continua sendo adicionado pelo aluno, Linux ou Windows. Baseline, ID/MAC,
conexão à eth3 de R3, endereço /25 e gateway são verificados normalmente. A
configuração fornecida não autoriza adotar um PC independente ou reparar a rede
automaticamente após alterações incompatíveis.

Na entrada da Parte 4, PC C já é fornecido pelo cenário, como Host Linux, com
ID/MAC materializados e associados à tentativa. Não há adoção de um computador
independente após remover/substituir esse PC. As entradas das Partes 2/3 continuam
exigindo a criação manual e aceitando Linux/Windows.

## Parte 4: baseline, incidente e encerramento parcial

O documento inicial contém R3 eth3 `192.168.30.129/25`, PC C
`192.168.30.130/25` com gateway `.129`, R2 encaminhando LAN C via R3 e R1 com
`192.168.30.0/24` via R2 e `192.168.30.128/25` via R3. A/B continuam via R2.
Nenhum ping é executado para preencher o progresso.

`scenarioBaseline` identifica somente a configuração técnica fornecida. Fica
separado de `viaBaseline` (comprovação normal anterior), que permanece nulo,
e dos recibos de ping, respostas e `completed`, inicialmente vazios. O leitor
recusa evidências das tarefas 1–19 nessa entrada e não usa créditos `legacy`.

A tarefa 20 começa com `storm: pending`. O controller reutiliza `commitStorm()`:
documento com R2 eth1 DOWN e marcador consumido são gravados atomicamente. Falha
antes do commit mantém rede operacional/pending; interrupção depois dele recupera
rede e marcador juntos. F5, navegação ou Undo da porta não reaplicam o incidente.
Uma mudança incompatível com o baseline bloqueia a preparação, sem corrigir a rede.

As tarefas 20–22 exigem a observação real da falha, recuperação das LANs completas
e Echo Replies nos dois sentidos pelo enlace R1–R3. `replace` ou `del` + `add`
equivalentes continuam aceitos; /32 isoladas não substituem cobertura da LAN.
Ao concluir, a UI DE/EN/PT-BR identifica a conclusão **da prática da Parte 4** e
permite explorar a rede. A prática indica **3/3**; o resultado integral permanece
**3/22**, sem crédito para tarefas fornecidas ou concessão de conclusão histórica.

## Menu e indicadores — Rodada 3

O botão abre um `FloatingPopover` à direita, com fallback à esquerda e navegação
por teclado. Escape/Seta esquerda retornam ao acionador; clique fora fecha o
submenu. O popup pai reconhece o filho por referência, sem fechar ao utilizá-lo.
Em até 760 px, a lista substitui o conteúdo dos tutoriais por quatro opções e
Voltar, mantendo o menu compacto. Os demais grupos não foram reformulados.

No capítulo 5:

- **Check verde:** existe conclusão integral histórica verificada. Prevalece
  mesmo quando a prática atual tem 0 tarefas. O contador atual aparece separado.
- **Círculo azul:** existe uma tentativa, mas nenhuma conclusão integral histórica.
  Exibe o progresso da prática atual; uma prática parcial finalizada tem mensagem
  positiva de conclusão própria, mantendo esse indicador de capítulo.
- **Neutro:** nenhuma tentativa disponível nem conclusão histórica.

Os estados têm texto DE/EN/PT-BR e símbolos acessíveis, sem depender só da cor.
Capítulos 1–4 conservam seus indicadores anteriores. Na revisão de uma tarefa
comprovada, o box existente recebe um pequeno check verde; não representa a
validade técnica da rede atual nem é exibido por um pré-requisito fornecido.

Práticas iniciadas nas Partes 2/3/4 terminam nas mesmas verificações da tarefa 22.
Seus contadores são **16/16**, **9/9** e **3/3**, respectivamente, com encerramento
próprio e acesso a explorar a rede. Os resultados integrais correspondentes são
**16/22**, **9/22** e **3/22**. Nenhuma dessas origens concede conclusão integral.

## Metadados independentes de aprendizagem

Nenhum store novo; ambos os registros usam `meta`:

- `guided:chapter-completion:v1:alternative-paths`: contrato v1 com capítulo,
  versão atual, origem (`draftId`, `attemptId`, versão original, início integral)
  e `recordedAt`. Essa é a data de registro/verificação, não uma data inventada
  de conclusão para tentativas antigas. Preserva o primeiro registro válido.
- `guided:current-attempt:v1:alternative-paths`: referência à tentativa selecionada,
  com IDs e `selectedAt`. Não copia topologia, etapas ou comprovantes.

`alternativeLearning.ts` só grava a conclusão a partir de **um único** progresso
persistido e validado pelo leitor existente, sem `entry`, com conclusão integral.
Não soma atividades entre tentativas. Conclusões antigas integrais verificáveis
podem ser preservadas, identificando sua versão original; não se criam recibos
modernos fictícios para preencher diferenças de contrato.

`setMeta()` aceita `guards` opcionais. A revisão do progresso de origem e o CAS do
histórico são conferidos na mesma transação. Escritores concorrentes preservam o
primeiro vencedor verificado. Falhas não criam histórico parcial nem alteram a
origem. Um F5 entre o commit do progresso e o registro independente é recuperado
na próxima ativação/leitura; o reinício preserva a conclusão antes de limpar o
progresso da tentativa. Se isso falhar, a restauração não prossegue.

Essas gravações são apenas de metadados: não chamam `commitDocument()`, não ativam
novamente a simulação nem interrompem processos. A conclusão permanece após
reinício, nova prática ou fechamento do draft. Se o último draft já foi fechado,
seu progresso ainda disponível pode reparar um registro histórico pendente, sem
reabri-lo. Falhas específicas desses metadados têm retry no capítulo 5 e não
bloqueiam os capítulos 1–4. Dados incompatíveis não são sobrescritos.

Para Fortsetzen, a tentativa do capítulo no plano ativo tem prioridade; fora
dela, usa-se o marcador da última seleção, conferindo também `attemptId`.
Respostas atrasadas conferem novamente a identidade ativa antes de selecionar.
Novas tentativas não apagam as anteriores. Em tentativas antigas sem marcador,
o fallback usa os drafts existentes; não tenta inventar qual foi a última visita.

O histórico é local ao IndexedDB deste navegador. Não foi criada sincronização
entre computadores; exportar uma topologia JSON não exporta esse histórico global.

## Reinício e próximos passos

O checkpoint de reinício guarda a origem específica da entrada: etapa 7, 14 ou 20,
com as mesmas identidades e sem crédito pelas tarefas fornecidas. O leitor confere
também as condições técnicas iniciais. A restauração seletiva existente preserva
equipamentos independentes e bloqueia identidades ou conexões ambíguas.
No reinício da entrada da Parte 3, a preparação automática de R3 eth3 e seu
progresso `lpm.ready` entram na própria transação de restauração. Isso evita uma
gravação adicional que invalidaria o ticket Undo/Redo do reinício. PC C e seus
recibos continuam ausentes; o checkpoint original não é reescrito.

Na Parte 4, o reinício restaura o cenário anterior à falha, inclusive PC C, rotas
e enlace operacional, com progresso vazio/pending; a tarefa 20 então consome a
nova tempestade. Equipamentos independentes preservados entram no novo baseline
técnico, sem gerar evidências. O checkpoint original permanece intacto. O ticket
Undo/Redo do reinício acompanha o consumo confirmado do incidente: desfaz-se a
porta e depois o reinício; refazer restaura o marcador consumido e permite refazer
a operação normal da porta, sem agendar outra tempestade. Como no restante da
aplicação, o histórico Undo/Redo é transitório; o documento/progresso persistidos
continuam recuperáveis após F5.

O submenu, os indicadores e a conclusão independente do capítulo 5 foram
implementados. Os capítulos 1–4 não receberam novos pontos de entrada ou registros
de histórico nesta rodada. As verificações de roteamento, os cenários fornecidos
e a transação da tempestade foram reutilizados.

Testes unitários e Chromium usam tentativas, perfis e bancos descartáveis; não se
executa essa infraestrutura sobre os projetos reais do usuário nesta rodada.

## Validação da Rodada 3

**304 testes distintos em 23 arquivos** aprovados, incluindo os capítulos 1–4,
metadados concorrentes, quota, origem alterada, progresso antigo verificável,
seleção tardia, abertura normal/avançada interrompida e reinício. O roteiro
Chromium passou em **320 verificações**, sem erros de navegador: quatro opções
públicas, teclado/Escape/Voltar, fallback lateral, 700 px, DE/EN/PT-BR, temas,
F5, retomada após visitar um plano pessoal, conclusão integral real, histórico
preservado numa prática nova, três encerramentos parciais, tempestade e Undo/Redo.
TypeScript, build e diff-check aprovados; apenas o aviso conhecido de chunk grande.

Capturas reais em `.playwright-mcp/reviews/chapter5-entries-round3/`:
`01-desktop-submenu.png`, `02-compact-submenu.png`, `03-partial-progress.png`,
`04-history-complete-new-practice.png` e `05-part-{2,3,4}-practice-complete.png`.
Arquivos gerados permanecem fora do Git. Nenhum commit, push, merge ou deploy.
