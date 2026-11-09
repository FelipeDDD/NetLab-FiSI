# Kapitel 5 · Alternative Wege

Tutorial independente em **Übungen (Beta) → Geführte Tutorials**. **Kapitel starten**
abre um rascunho próprio; **Fortsetzen** retoma a tentativa; **Neuen Versuch starten**
cria outra sem substituir a anterior. Capítulos 1–4, engine e editor de rotas do
Inspector não são alterados por esta expansão.

## Topologia e fluxo atual — versão 3

O início continua com três routers Linux, encaminhamento ativo, RIP desativado,
quatro interfaces sem IPv4 por router e os três cabos do triângulo.

| Enlace /30 | Primeira extremidade | Segunda extremidade |
| --- | --- | --- |
| R1–R2 · 10.0.12.0/30 | R1 eth0: 10.0.12.1 | R2 eth0: 10.0.12.2 |
| R2–R3 · 10.0.23.0/30 | R2 eth1: 10.0.23.1 | R3 eth0: 10.0.23.2 |
| R1–R3 · 10.0.13.0/30 | R1 eth1: 10.0.13.1 | R3 eth1: 10.0.13.2 |

Após as quatro primeiras tarefas, a transição explícita acrescenta somente PC A
e PC B, ligados a R1 eth2 e R3 eth2. LAN A é 192.168.10.0/24; LAN B é
192.168.20.0/24. Endereços de host únicos válidos e gateway/default efetivo via
router local são aceitos. Posições, rotas e configurações anteriores são preservadas.

O capítulo tem **20 tarefas**, em quatro partes: **4 + 9 + 4 + 3**.

| Parte | Etapa | Ação e comprovação |
| --- | --- | --- |
| Nachbarn verbinden | 1–3 | Endereçar os enlaces e obter seis respostas de vizinhos. |
| | 4 | Distinguir rede conectada de remota para R1. |
| Routing über R2 | 5–6 | Configurar LAN A e LAN B. |
| | 7 | Ping A → B para investigar o alcance remoto. |
| | 8–9 | Configurar ida para LAN B em R1 e R2. |
| | 10 | Repetir A → B e investigar o retorno. |
| | 11–12 | Completar retorno em R3/R2 e comprovar A ↔ B por R2. |
| | 13 | Identificar o Next Hop efetivamente selecionado em R1. |
| Longest Prefix Match | 14 | Criar, conectar e configurar manualmente PC C. |
| | 15 | Obter Echo Reply de R3 para o ping iniciado em PC C. |
| | 16 | Preparar R2 e as duas rotas correspondentes em R1. |
| | 17 | Ping real A → C, observar os dois caminhos e responder sobre LPM. |
| Alternativweg | 18 | Interromper R1–R2 ou R2–R3 e comprovar a falha A → B. |
| | 19 | Redirecionar manualmente ida e retorno de LAN B pelo enlace R1–R3. |
| | 20 | Comprovar novas respostas A ↔ B pelo enlace direto. |

## LAN C real e atividade de LPM

Somente ao chegar à etapa 14, após Next Hop e a prova A ↔ B, o controller prepara
**R3 eth3 com 192.168.30.129/25**. Não cria host ou cabo. O aluno arrasta um novo
PC Linux e o conecta a essa interface, sem requisito de nome ou posição.

Antes da preparação, uma intenção persistida registra os IDs existentes. O host
só é vinculado quando está fisicamente conectado à eth3, é novo em relação a essa
lista, tem tipo Host/Linux e uma única eth0. O vínculo guarda **ID e MAC**. Um PC
independente que já existia, um Windows ou apenas o primeiro host criado não é
adotado. O painel mostra PC C junto ao nome real, sem renomeá-lo.

PC C precisa de **192.168.30.130/25**, enlace ativo e gateway/default efetivo
**192.168.30.129 via eth0**. Aceita o campo Gateway ou uma rota default Linux
equivalente. Máscara, unicidade dos IPs e identidade são conferidas novamente.

Na etapa 15, somente o ping desse PC ao gateway com resposta e saltos reais prova
a conexão local. Essa prova não equivale à comunicação entre LANs.

Na etapa 16 o aluno prepara:

```text
R2: ip route add 192.168.30.128/25 via 10.0.23.2
R1: ip route add 192.168.30.0/24 via 10.0.12.2
R1: ip route add 192.168.30.128/25 via 10.0.13.2
```

R2 deve encaminhar toda a faixa utilizável da /25 para R3; uma /32 isolada não
substitui isso. R1 deve possuir as duas entradas, sem duplicatas ambíguas. As rotas
anteriores de retorno para LAN A por R2 são preservadas.

As duas alternativas são reais: sem a /25, A alcança C por R1 → R2 → R3; com as
duas, R1 seleciona a /25 para 192.168.30.130. A pergunta só aparece após uma Echo
Reply do ping A → C com os caminhos físicos exigidos:

```text
Echo Request: PC A → R1 → R3 → PC C
Echo Reply:   PC C → R3 → R2 → R1 → PC A
```

Ida e volta não precisam coincidir. O feedback explica que o maior CIDR vence
**entre as rotas correspondentes ao destino**, sem ensinar prioridade universal
de rotas estáticas, métricas, ECMP ou failover automático. A animação existente
mostra as transmissões reais; não há PNG novo, replay inventado ou motor adicional.

## Evidências e segurança

- O canal existente de observação correlaciona teclado/Quick Ping, dispositivo,
  Network, ID ICMP, sequência, saída e saltos de request/reply. API, texto forjado,
  ping de outro dispositivo ou pacote somente enviado não aprovam as tarefas.
- As provas dos vizinhos continuam limitadas a seus enlaces e rotas efetivas.
  As provas A ↔ B usam uma projeção da configuração relevante a A/B e aos trânsitos;
  LAN C, sua interface e rotas não relacionadas não apagam essas provas.
  Mudanças relevantes, como uma exceção de host que desvie o caminho, invalidam-nas.
- Comprovantes globais antigos continuam aceitos quando a configuração coincide.
  Ao repetir um ping, os dois comprovantes ainda válidos do par são normalizados
  juntos, preservando o contrato persistido de igualdade entre os hashes.
- O ping local C–R3 tem assinatura própria; adicionar rotas para a etapa 16 não o
  invalida. A prova A → C verifica a configuração atual e os dois caminhos distintos.
- A falha do enlace na etapa 18 conserva a proteção anterior: baseline completo
  comprovado, normalizando somente UP/DOWN ou remoção de um dos dois enlaces
  permitidos. Outras mudanças impedem atribuir a falha a esse enlace.
- A explicação específica da etapa 7 sobre falta de rota em R1 continua exigindo
  ICMP Destination Net Unreachable de R1, request A → R1 e ausência de rota antes
  e depois. Timeout isolado não identifica a causa; sucesso antecipado recebe
  feedback compatível. Essa causa não é inferida do histórico após F5.

## Persistência, preparação e reinício

Namespace `guided:alternative-paths:v1:draft:<draftId>`, schema 1 e IndexedDB
existentes são mantidos; **chapterVersion passa de 2 a 3**. O registro inclui a
fase de preparação de LAN C, baseline de IDs, vínculo de PC C e hashes das novas
provas. Não duplica a topologia e não persiste caches ou processos ativos.

A intenção é gravada antes da edição de eth3. A edição usa o setter normal do
Inspector/store, com histórico e autosave; a topologia é confirmada antes do recibo
de preparação. Interrupção entre esses commits mantém a intenção recuperável.
Após F5, uma configuração exata pode ser adotada sem duplicar equipamentos. Porta
ocupada por equipamento independente ou IPv4 incompatível bloqueia a preparação;
o usuário corrige o conflito, sem sobrescrita silenciosa.

PC criado mas ainda desconectado continua descobrível após F5 pela baseline
persistida. PC C já vinculado não é substituído se removido: Undo/Redo pode
restaurar sua identidade. A preparação confirmada não recria equipamento nem
reaplica automaticamente configurações desfeitas pelo aluno.

O checkpoint inicial continua representando os três routers sem IPv4. Reinício,
Undo/Redo do reinício e recuperação usam o serviço transacional existente. A regra
de propriedade inclui PC C **somente depois do vínculo ID/MAC**; identidade
reutilizada ou conexão com trabalho independente bloqueia remoção insegura.
Um PC ainda não vinculado não é apagado por suposição. Os outros planos permanecem
intactos. Navegar para instruções anteriores não desfaz a rede.

## Migração das tentativas anteriores

O leitor valida a versão original antes de converter uma cópia: v1 → v2 → v3.
Não altera topologia, MACs, posições, rotas, tentativa, checkpoint ou entrada bruta.
Usa o CAS existente na próxima escrita; leitura isolada não exige regravação.

- Etapas 1–13 da v2 mantêm os números; antiga 14 não concluída abre a nova 14,
  com prática pendente e sem PC C fictício. A preparação é segura/idempotente.
- Antigas 15/16/17 passam a 18/19/20, preservando falha e respostas comprovadas.
- Se a antiga tarefa teórica 14 já estava concluída, `lpm.legacy` registra o crédito
  histórico. O resumo reconhece a equivalência das quatro tarefas para manter uma
  tentativa concluída; `localReply` e `pathReply` permanecem nulos. Não se inventam
  pings, host ou LAN. Revisitar essa parte mostra uma nota explícita de crédito
  antigo, e uma nova tentativa oferece a atividade prática ampliada.
- Tentativas v1 mantêm a conversão anterior de provas locais, rotas e retorno,
  seguida desse mapeamento. Uma configuração sem comprovante não ganha evidência.

## Interface e validação

Instruções DE/EN/PT-BR, uma ajuda opcional por tarefa, painel flutuante e comandos
âmbar reutilizados. R1 mostra sua tabela nas etapas 4, 13 e 17. A conclusão usa o
componente comum e a exploração livre só fecha o painel, mantendo a rede.

Arquivos centrais: `alternativePathsChapter.ts`, `alternativeLpm.ts`,
`AlternativePathsController.ts`, `alternativePathsProgress.ts`,
`AlternativePathsPanel.tsx`, `guidedAlternative.ts` e a regra específica do
capítulo em `chapterCheckpoints.ts`.

```text
npm test -- src/tutorials src/i18n/i18n.test.ts src/terminals.test.ts
node scripts/test-alternative-paths-tutorial.mjs
npm run build
git diff --check
```

Os testes cobrem criação e vínculo, IP/máscara/gateway, default equivalente via
terminal, pings incorretos/API/Quick Ping, caminhos /24 e /25 reais, retorno
assimétrico, assinatura antiga, migração na etapa 14 e conclusão antiga, falhas de
gravação, Undo/Redo e F5. O Chromium usa perfil e banco descartáveis, arraste pelo
catálogo, xterm real, conclusão original de LAN B, reinício, troca de planos,
DE/EN/PT-BR, temas e larguras 700/1024/1440 px. Artefatos locais em
`.playwright-mcp/reviews/raw/alternative-paths-staging/` e nas pastas organizadas
pelo Visual Review existente; sem novas imagens didáticas de execução.

Validação da versão 3 em 09/11/2026: **487 testes em 18 arquivos**, TypeScript,
build e diff-check aprovados; **113 verificações no roteiro Chromium completo**,
sem falhas ou erros de navegador. O build conserva o aviso de tamanho de chunk
já existente; não foram alteradas dependências ou configurações de empacotamento.
