# Kapitel 5 · Alternative Wege

Tutorial independente em **Übungen (Beta) → Geführte Tutorials**. **Kapitel starten**
abre um rascunho próprio; **Fortsetzen** retoma a tentativa; **Neuen Versuch starten**
cria outra sem substituir a anterior. Capítulos 1–4, engine e editor de rotas do
Inspector não são alterados por esta expansão.

## Topologia e fluxo atual — versão 4

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

O capítulo tem **22 tarefas**, em quatro partes: **4 + 9 + 6 + 3**.

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
| | 16 | Configurar a /25 em R2 e comprovar um ping real R2 → PC C. |
| | 17 | Configurar somente a /24 em R1 e comprovar A → R1 → R2 → R3 → C. |
| | 18 | Adicionar a /25 em R1, preservando a /24, e comprovar A → R1 → R3 → C. |
| | 19 | Comparar os dois caminhos realmente observados e responder sobre LPM. |
| Alternativweg | 20 | Tempestade única em R2–R3; repetir A → B e observar a falha real. |
| | 21 | Usar replace para recuperar ida/retorno por R1–R3, com dois checkpoints de rota efetiva. |
| | 22 | Comprovar novas respostas A ↔ B pelo enlace direto. |

## LAN C real e atividade de LPM

### Refinamentos didáticos/UX — Rodada 1

As etapas 5 e 6 oferecem a ajuda de gateway/default route, sempre recolhida ao
entrar na etapa. A etapa 10 pede observar um novo ping sem antecipar uma falha.
Só após o Echo Request chegar a PC B e o Echo Reply ser observado parando em
R3 ou R2 sem rota para LAN A, o card explica a falta de retorno. Timeout isolado,
loop e sucesso não recebem essa causa. A etapa 7 continua distinguindo a falta
de rota de ida em R1. Esse feedback é transitório e não muda os comprovantes ou
validadores: F5 conserva o progresso, mas exige nova observação para exibir a causa.

O caminho observado aparece antes dos indicadores A/B, com rótulo próprio;
na atividade de LPM, os caminhos também ficam antes da pergunta. Não foram
incluídos checkpoints adicionais, alterações de LPM/prefixos ou editor de rotas.

Validação da rodada: **112 testes em 6 arquivos** e **149 verificações Chromium**,
DE/EN/PT-BR, Graphite Dark/Classic Light, fluxo completo, F5 e Undo/Redo aprovados.
TypeScript e build passaram. Capturas finais organizadas separadamente em
`.playwright-mcp/reviews/chapter5-round1/referencias-chatgpt/` (fora do Git).

### Configuração e reconhecimento existentes

Somente ao chegar à etapa 14, após Next Hop e a prova A ↔ B, o controller prepara
**R3 eth3 com 192.168.30.129/25**. Não cria host ou cabo. O aluno arrasta um novo
PC Linux e o conecta a essa interface, sem requisito de nome ou posição.

Antes da preparação, uma intenção persistida registra os IDs existentes. O host
só é vinculado quando está fisicamente conectado à eth3, é novo em relação a essa
lista, tem tipo Host/Linux e uma única eth0. O vínculo guarda **ID e MAC**. Um PC
independente que já existia, um Windows ou apenas o primeiro host criado não é
adotado. O painel e os caminhos didáticos mostram o papel **PC C**. O nome padrão
é renomeado para `PC C` quando o histórico de criação confirma sua origem e não
há nome personalizado ou colisão; ID/MAC e configuração permanecem. A decisão
opcional `pc.nameChecked` impede reaplicação após Undo/F5. Sem histórico seguro
ou com comprovantes antigos, o nome existente é preservado. A exigência de Linux
continua explícita: o reconhecimento atual não aceita Windows nesta atividade.

PC C precisa de **192.168.30.130/25**, enlace ativo e gateway/default efetivo
**192.168.30.129 via eth0**. Aceita o campo Gateway ou uma rota default Linux
equivalente. Máscara, unicidade dos IPs e identidade são conferidas novamente.

Na etapa 15, somente o ping desse PC ao gateway com resposta e saltos reais prova
a conexão local. Essa prova não equivale à comunicação entre LANs.

As etapas 16–19 formam um experimento progressivo, sem executar pings pelo aluno:

```text
16 · R2: ip route add 192.168.30.128/25 via 10.0.23.2
     R2: ping 192.168.30.130
17 · R1: ip route add 192.168.30.0/24 via 10.0.12.2
     PC A: ping 192.168.30.130
18 · R1: ip route add 192.168.30.128/25 via 10.0.13.2
     PC A: novo ping 192.168.30.130
19 · Comparação e pergunta de LPM
```

Cada etapa prática distingue **rota configurada** e **Echo Reply observada**.
R2 precisa da rota de rede /25; uma /32 isolada não a substitui. O primeiro ping
A → C deve usar a /24 por R2. A explicação de que a /24 contém 192.168.30.130 só
aparece após a resposta real. A etapa seguinte usa **add**, mantendo ambas as
entradas; a prova anterior não aprova esse novo ping.

Se a /25 estiver antecipada, não se modifica a rede automaticamente: o painel
orienta removê-la manualmente em R1, observar a /24 e adicioná-la novamente na
etapa 18. A configuração sem comprovantes não recebe evidência inventada.
Depois de comprovar os dois caminhos, a etapa 19 apresenta a comparação:

```text
Antes (/24): PC A → R1 → R2 → R3 → PC C
Depois (/25): PC A → R1 → R3 → PC C
Retorno usual: PC C → R3 → R2 → R1 → PC A
```

Ida e volta não precisam coincidir: qualquer retorno real contínuo de C até a
origem, correlacionado à mesma resposta, é aceito e seus saltos são persistidos
no comprovante para apresentação fiel. O feedback explica que o maior CIDR vence
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
- O ping local C–R3 tem assinatura própria. Os novos comprovantes ficam em
  `lpm.experiment.r2`, `.broad` e `.specific`, com hash e saltos de retorno.
  O escopo R2–R3–C ignora rotas posteriores em R1; o hash da /24 omite somente
  a /25 esperada via R3. Adicionar essa entrada conserva o crédito do primeiro
  caminho, sem esconder alterações relevantes. A /25 exige novo ping de usuário.
- A falha da etapa 20 continua exigindo um baseline completo e pacotes reais.
  Na tentativa nova, o enlace R2–R3 precisa estar indisponível e R1–R2 ativo;
  o request precisa ter chegado a R2 por A → R1 → R2. Tentativas antigas mantêm
  a verificação do cenário manual, inclusive a interrupção do outro enlace.
  Outras alterações antes da observação bloqueiam atribuir a falha ao incidente.
- A explicação específica da etapa 7 sobre falta de rota em R1 continua exigindo
  ICMP Destination Net Unreachable de R1, request A → R1 e ausência de rota antes
  e depois. Timeout isolado não identifica a causa; sucesso antecipado recebe
  feedback compatível. Essa causa não é inferida do histórico após F5.

## Persistência, preparação e reinício

Namespace `guided:alternative-paths:v1:draft:<draftId>`, schema 1 e IndexedDB
existentes são mantidos; **chapterVersion passa a 4**. O registro inclui a
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

O leitor valida a versão original antes de converter uma cópia: v1 → v2 → v3 → v4.
Não altera topologia, MACs, posições, rotas, tentativa, checkpoint ou entrada bruta.
Usa o CAS existente na próxima escrita; leitura isolada não exige regravação.

- Da v3, as etapas 1–15 mantêm o número. Uma antiga 16 ou 17 parcial retoma na
  nova 16, pois configuração conjunta ou um ping isolado não comprovam os três
  novos testes. Configurações, PC C, baseline e provas existentes são preservados.
- As antigas 18/19/20 passam a 20/21/22, preservando a fase de falha e conclusão.
- Uma antiga tarefa 17 já concluída recebe `lpm.experiment.legacy`, com crédito
  explícito para 16–19 e **três recibos novos nulos**. Uma tentativa concluída
  continua concluída; revisitar mostra a nota histórica. Nova tentativa oferece
  o experimento completo. Não se transforma o `pathReply` antigo em prova da /24.
- A antiga teoria da v2 conserva `lpm.legacy` e o crédito de 14–19, sem criar
  PC C ou pacotes. V1 mantém as conversões anteriores antes desse mapeamento.
- F5 e checkpoints antigos passam pelo mesmo leitor; não há novo banco, chave
  de persistência ou esquema de topologia.

## Destinos IPv4 no terminal

`ip route add` e `ip route replace` rejeitam bits de host no destino com
`Error: Invalid prefix for given prefix length.`. Assim, usar
`192.168.30.128/25` em uma rota, não `192.168.30.130/25`. A ajuda da etapa 16
explica essa diferença. O comportamento foi conferido no
[validador IPv4 do Linux](https://github.com/torvalds/linux/blob/master/net/ipv4/fib_frontend.c)
(`rtm_to_fib_config`), compartilhado pela inserção e substituição de rotas.
O parser CIDR global e a engine não mudam: endereços de interface com bits de
host, rotas /32, default/0 canônico, conectadas e restauração de projetos antigos
continuam funcionando. A exclusão de rotas mantém o comportamento suportado.

## Parte 4 — tempestade e recuperação (Rodada 3)

O capítulo conserva **22 tarefas**, com Parte 4 nas etapas **20–22**. Ao entrar
na etapa 20 pela primeira vez, uma tempestade desativa **somente R2 eth1**.
O cabo R2–R3 permanece, e nomes, MACs, posições, IPv4, rotas e demais configurações
são preservados. A indisponibilidade é real: `Link.operational` depende das
interfaces. Cabos Ethernet indisponíveis ganham uma marcação discreta tracejada,
preservando sua cor; o painel apresenta a mensagem curta sobre o incidente.

Não há temporizador narrativo, biblioteca nova ou alteração na engine. A alteração
da porta e o marcador `storm` são gravados **juntos**, por CAS, usando a transação
existente `SessionController.commitDocument`. Não existe uma janela de autosave
entre “marcar o evento” e desativar a porta. A transação valida o documento atual;
mudanças concorrentes ou falhas não autorizam sobrescrever o trabalho do aluno.

O contrato de progresso permanece **v4**, com leitura compatível do campo opcional
anteriormente ausente. Estados do marcador:

- `pending`: incidente ainda não consumido; apenas uma entrada segura em 20 o aplica.
- `applied`: porta desativada e marcador confirmados na mesma transação.
- `adopted`: R2–R3 já estava indisponível; o estado existente é preservado.
- `legacy`: tentativa antiga já na Parte 4 ou com prova dessa fase; nenhuma
  tempestade retroativa é aplicada. Continua o cenário manual anterior.

Uma tentativa antiga ainda nas Partes 1–3 recebe `pending`; uma já na Parte 4
recebe `legacy`. Marcadores inválidos são recusados. O marcador consumido não
volta a `pending` por navegação, F5, troca de plano, retry ou Undo da porta.
O histórico existente recebe uma operação `set-iface-state`: Undo restaura
a interface, Redo reaplica essa edição, sem criar outro incidente. Se o aluno
restaurar o enlace antes da primeira observação, não há falha fictícia: o painel
orienta Redo ou desativação manual para observar o problema. Após a prova real,
restaurar o enlace não apaga o aprendizado nem provoca nova tempestade.

As etapas LPM já comprovadas podem ser revisitadas como histórico, com nota
explícita de que o estado atual inclui a Parte 4. Seus recibos não são regravados
nem usados para inventar novos pings. O baseline não é substituído após o incidente.
Reinício **explícito** do capítulo restaura o checkpoint inicial e reinicia também
o incidente; Undo do reinício recupera o documento e o marcador anteriores.
Uma nova tentativa possui seu próprio marcador.

A explicação de que o segundo cabo não faz recuperação automática aparece apenas
após a falha A → B observada. A etapa 21 apresenta:

```text
R1: ip route replace 192.168.20.0/24 via 10.0.13.2
R3: ip route replace 192.168.10.0/24 via 10.0.13.1
```

Dois indicadores verificam o encaminhamento **efetivo** de R1 por R3 e de R3 por
R1, não a digitação dos comandos. `add` adiciona uma entrada; `replace` substitui
ou cria a entrada daquele prefixo. Como as rotas anteriores existem, `replace`
é a escolha didática. As rotas /24 e /25 da LAN C permanecem intactas.

Na etapa 22, novos pings A → B e B → A precisam receber Echo Replies reais pelos
saltos diretos. Pings de API, só texto, outra Network ou uma etapa anterior não
comprovam essa fase. A conclusão explica brevemente o ajuste manual de rotas
estáticas e mantém a exploração livre da rede.

**Limitação do mecanismo reutilizado:** `commitDocument` reativa o documento
consistente e descarta processos transitórios em andamento, como na restauração
existente. Configurações, apresentação e histórico de edição são preservados;
não há tentativa de restaurar pings/processos em execução. Falhas ambíguas depois
do commit usam a recuperação existente: preservar a cópia local e recarregar o
estado consistente, sem repetir a tempestade.

## Interface e validação

Instruções DE/EN/PT-BR, uma ajuda opcional por tarefa, painel flutuante e comandos
reutilizados, com sintaxe âmbar e parâmetros neutros. R1 mostra sua tabela nas
etapas 4, 13 e 19. A conclusão usa o
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

Histórico da versão 3 em 09/11/2026: **487 testes em 18 arquivos**, TypeScript,
build e diff-check aprovados; **113 verificações no roteiro Chromium completo**,
sem falhas ou erros de navegador. O build conserva o aviso de tamanho de chunk
já existente; não foram alteradas dependências ou configurações de empacotamento.

Validação final da **Rodada 2 / versão 4**: **3.009 testes em 180 arquivos**,
**176 verificações Chromium**, TypeScript, build e diff-check aprovados. Sem erros
de navegador. Inclui o fluxo completo de 22 tarefas, recuperação manual de /25
antecipada, três pings separados, provas preservadas após adicionar /25,
retorno alternativo real, F5, planos, reinício/Undo/Redo e migrações v1–v4.
Capturas finais em `.playwright-mcp/reviews/chapter5-round2/referencias-chatgpt/`;
logs em `.playwright-mcp/round2-*.log`. Sem commit, push ou deploy.

Validação final da **Rodada 3**: **3.015 testes em 180 arquivos**, **196 verificações
Chromium**, TypeScript, build e diff-check aprovados. Inclui transação interrompida
antes/depois do commit, edição concorrente antes da tempestade, Undo/Redo, F5 antes
da observação e após a recuperação, LPM preservado, conexão já indisponível,
tentativa v4 antiga sem marcador, checkpoints efetivos e pings reais nos dois sentidos.
DE/EN/PT-BR, Graphite Dark/Classic Light, planos e larguras 700/1024/1440 px,
sem erros de navegador. Capturas em
`.playwright-mcp/reviews/chapter5-round3/referencias-chatgpt/`; logs locais
`.playwright-mcp/round3-*.log`. Permanece o aviso conhecido de chunk acima de 500 kB.
Sem commit, push, merge ou deploy.
