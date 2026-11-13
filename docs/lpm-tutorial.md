# Capítulo 6 — Longest Prefix Match, Parte 1

Primeiro protótipo com cinco tarefas independentes dos capítulos 1–5. A entrada
fica em **Übungen (Beta) → Geführte Tutorials**. Não amplia os protocolos nem
implementa métricas, ECMP, failover, múltiplos destinos ou partes posteriores.

## Cenário funcional

- PC A: `192.168.60.10/24`, gateway `192.168.60.1` em R1.
- PC B: `192.168.80.130/24`, gateway `192.168.80.1` em R5.
- Curto: PC A → R1 → R5 → PC B.
- Longo: PC A → R1 → R2 → R3 → R4 → R5 → PC B.
- Trânsitos separados `/30`: `10.6.12.0`, `10.6.23.0`, `10.6.34.0`,
  `10.6.45.0` e `10.6.15.0`. Não há sobreposição de sub-redes.
- R1 tem `192.168.80.0/24 via 10.6.15.2 dev eth1` e
  `192.168.80.128/25 via 10.6.12.2 dev eth2`.
- R2, R3 e R4 encaminham a LAN de destino pelo próximo roteador do desvio.
  O retorno de R5 à LAN A usa diretamente R1, via `10.6.15.1`.

Todos os enlaces começam operacionais. A rota curta é funcional: retirar a
mais específica comprova isso com um ping real. O desvio tem cinco roteadores
incluindo R1/R5; o caminho curto tem dois. A diferença é visualmente explícita,
sem acrescentar um roteador intermediário desnecessário ao caminho curto.

O **Echo Reply usa outro caminho**. A interface apresenta separadamente os
percursos comprovados do Request e do Reply; não desenha um retorno simétrico
presumido. A engine e o sistema normal de animação permanecem intactos.

## Tarefas e evidências

| Tarefa | Ação | Critério |
| --- | --- | --- |
| 1. Caminho inesperado | Prever, confirmar e testar de PC A para PC B | Previsão sem correção antecipada; resposta verdadeira, Request pelo desvio, Reply direto e comparação após o teste. Sem comando pronto, ajuda inicial ou explicação antecipada da regra. |
| 2. Investigar | Consultar a tabela de R1 no Inspector ou terminal | Pergunta e alternativas no painel; Ajuda fechada oferece `ip route`, atalho para Routing e orientação de pertencimento. Sem tabela embutida ou indicação antecipada da vencedora. |
| 3. Descobrir | Relacionar a regra apresentada ao percurso observado | Escolha da `/25`, após a comparação; feedback distingue saltos de comprimento do prefixo. |
| 4. Mudar | Remover `/25` e repetir ping | Ausência efetiva da entrada, `/24` original selecionada pela engine e novo Request direto com Reply real. |
| 5. Aplicar | Criar rota mais específica para o desvio | `/24` original preservada, seleção efetiva de rota estática com prefixo >24 via `10.6.12.2`/`eth2`, novo Request longo e Reply real. |

A tarefa 5 aceita qualquer prefixo suportado que corresponda ao destino e
satisfaça essas condições, inclusive `/32`. A instrução/ajuda não entrega a
máscara ou o comando resolvidos. A regra usa **somente rotas correspondentes**;
`IpDevice.lookupRoute()` continua sendo a única seleção real de LPM.

As tarefas práticas aceitam o terminal digitado pelo aluno ou Quick Ping.
Não são fornecidos exemplos prontos de ping. Um ping contínuo manual continua
suportado, mas não substitui o novo teste exigido depois de mudar a configuração.
Chamadas de origem `api`, texto de saída isolado, outro dispositivo, outro
destino ou ping iniciado antes da alteração não concedem crédito.

`LpmController` correlaciona comando, Network, dispositivo, ID ICMP, sequência,
endereços, arestas de ida/volta e linha real de Echo Reply. Uma assinatura da
configuração é mantida estável durante o teste e conferida novamente após o
hash assíncrono. Mudança de rascunho, etapa, configuração ou identidade cancela
as candidaturas. Histórico comprovado não vira evidência de uma tarefa nova.

## Refinamento de apresentação (13/11/2026)

Os textos DE/EN/PT-BR ficaram mais curtos, com “rota mais específica” nas
instruções e “prefixo mais longo” na explicação técnica. A tarefa 4 não tem
Ajuda redundante; a tarefa 5 mantém uma explicação adicional sobre o papel do
Next Hop, sem valores resolvidos. Feedbacks continuam posteriores às evidências.

A previsão inicial não existia no primeiro protótipo: agora é uma escolha
**somente visual**, confirmada antes da instrução de teste. Não muda aprovação,
progressão nem recibos. Um ping real executado livremente pelo aluno continua
sendo validado pelas regras anteriores. A previsão não é salva: F5 antes do
teste pede uma nova escolha; depois do teste, o recibo preserva o percurso e
não se inventa uma previsão anterior para compará-lo. Troca/reabertura do
painel também pode reinicializar essa escolha visual.

`inspectorRouting.ts` contém apenas sinais transitórios de navegação/visibilidade,
associados à instância Network e ao dispositivo. O botão da Ajuda abre realmente
a aba Routing de R1, inclusive se o Inspector ainda precisar montar. A requisição
é consumida uma vez, sem mover o canvas, alterar zoom ou descartar formulários.
A consulta efetiva da aba e o término de `ip route`, `ip route show/list` ou
`ip -4 route show` no terminal de R1 alimentam o **mesmo flag `inspected`** já
existente. A resposta continua exigindo as condições e alternativas anteriores;
abrir a tabela não conclui a tarefa automaticamente.

## Persistência, navegação e reinício

### Auditoria da rota /30 e escolha de destino (13/11/2026)

Reprodução isolada em Chromium: PC B `192.168.80.130`, `/24` original via
caminho curto e `192.168.80.128/30 via 10.6.12.2 dev eth2` em R1. A engine
selecionou a `/30` automaticamente; o Echo Request percorreu R2/R3/R4 e o
Echo Reply retornou diretamente por R5/R1. A etapa 5 foi aprovada, incluindo
os dois indicadores atuais. A rota /30 cobre `.128` a `.131`, portanto inclui
`.130`. Isso não modifica a máscara de PC B.

O terminal de ping e `IpDevice.lookupRoute()` não solicitam escolha de rota.
Existe outro seletor: `quickPing.ts`/`QuickPingAddressPopover.tsx` pedem um
**endereço de destino** se o equipamento clicado tem vários IPv4 distintos.
PC B tem um único endereço; R1 e R5 têm três. O seletor de três endereços foi
reproduzido ao escolher R1 como destino, sem depender da quantidade de rotas.
Não foi possível atribuir com certeza o relato original a esse clique, pois
não há registro daquela interação. Também há um seletor de interface no
formulário de rotas, mas ele pertence à configuração, não à execução do ping.

Sem bug de LPM reproduzido: nenhuma mudança de engine, GUI, comandos ou
validadores. 27 testes existentes (incluindo /30) aprovados, 115 verificações
Chromium sem falhas/erros, TypeScript, build e diff-check aprovados. Roteiro
temporário/capturas em `.playwright-mcp/lpm30-*.mjs` e
`.playwright-mcp/reviews/lpm30-audit/`, ignorados pelo Git. A reprodução também
passou pela configuração GUI, consulta CLI, F5 e conclusão da prática.

Na etapa 5, duas verificações substituem o indicador único: **rota /24 preservada
no caminho curto** (`lpmConditions.original`) e **nova rota comprovada pelo
caminho longo** (seleção efetiva, recibo posterior e fingerprint correspondente
à configuração atual). Ambas são reavaliadas continuamente. Configuração
incompatível ou recibo antigo deixam a respectiva linha pendente. O crédito
histórico em `completed` permanece separado; a mensagem final e a conclusão
visual da etapa só aparecem com a comprovação atual válida. Nenhum Next Hop,
interface ou prefixo da solução é revelado nos indicadores. Sem novo metadado.

- Documento normal `netsim` v1; rascunho pelo SessionController existente.
- Metadado `guided:lpm:v1:draft:<id>`: contrato versionado, UUID da tentativa,
  etapa 1–5, tarefas comprovadas, respostas, identidades ID/MAC e três recibos
  limitados (desvio inicial, direto e novo desvio).
- Abertura grava documento, sessão, progresso vazio e checkpoint em uma única
  transação existente, antes da ativação. Não cria novos stores/schema IDB.
- Gravação serializada, flush do rascunho antes do crédito e CAS de revisão.
  Falhas mantêm progresso em memória e bloqueiam avanço; retry não rebasa um
  conflito nem substitui a versão de outra instância.
- `historical` representa crédito; `passed` exige também configuração/recibo
  atualmente correspondente; `canAdvance` permite revisar tarefas comprovadas
  mesmo após mudanças legítimas de caminho. Formulários pendentes continuam
  impedindo avanço e troca segura de contexto.
- F5 restaura a etapa e o histórico. Não inicia pings nem recria a topologia.
  Um teste interrompido sem recibo precisa ser repetido.
- Reinício explícito reutiliza `ChapterRestartService`: confirmação, CAS,
  documento + progresso atômicos e operação existente de Undo/Redo.
  Restaura apenas o grupo de IDs do capítulo; equipamentos externos são
  preservados. Reuso de identidade ou conexões externas ambíguas bloqueiam
  a restauração em vez de executar um reset parcial.
- Reiniciar permite desfazer/refazer na sessão atual; a pilha de Undo/Redo,
  como no restante do projeto, não é persistida após F5. O documento e o
  progresso efetivamente confirmados são persistidos.

**Limites preservados:** mutações pelo terminal invalidam o histórico de Undo
incompatível; não foi adicionado um novo histórico para comandos CLI. A
aba Routing agora permite editar rotas estáticas de Router/Firewall pelo
editor descrito em `static-route-editor.md`, além do terminal Linux. A
recuperação de prática descobre rascunhos abertos, priorizando o ativo e depois
o mais recente na ordem da sessão. Não há registro independente de conclusão
histórica integral do capítulo 6 nem crédito para partes futuras. Exportar
somente a topologia não transporta o progresso local dos tutoriais.

## Arquivos e reprodução

- `lpmChapter.ts`: cenário e condições pela engine.
- `lpmAttempt.ts`: inicialização atômica e checkpoint.
- `lpmProgress.ts`: validação, recibos e CAS.
- `LpmController.ts`: coordenação e observação sem executar sondas.
- `LpmPanel.tsx`, catálogo `guidedLpm.ts`: painel e DE/EN/PT-BR.
- `TutorialUI.tsx`, `chapterCheckpoints.ts`, `ChapterRestartService.ts`:
  integração mínima com menu, ciclo de vida e restauração compartilhados.
- `LpmController.test.ts`: rede real, respostas e percursos, prefixos,
  navegação/F5, concorrência, falhas e preservação de identidades.
- `node scripts/test-lpm-tutorial.mjs`: Chromium nativo, perfil e banco
  descartáveis; abertura no menu, xterm, cinco tarefas, temas/idiomas,
  700/1440 px, F5, navegação, reinício/Undo/Redo e isolamento entre planos.

Capturas reais ficam em `.playwright-mcp/reviews/chapter6-lpm/` (ignoradas pelo
Git), incluindo as cinco tarefas nos três idiomas e a conclusão da Parte 1.

Validação de 13/11/2026: **3.097 testes em 187 arquivos** aprovados (20 casos
novos do capítulo, incluindo concorrência e abertura interrompida), TypeScript,
build e diff-check. Chromium: **112 verificações aprovadas** no harness, sendo
sete cenários compostos específicos do capítulo, zero falhas/erros de navegador.
Os cenários específicos incluem 15 revisões visuais (cinco tarefas × três
combinações de idioma/tema/largura), usando eventos nativos do xterm para os
comandos. O build mantém o aviso preexistente de chunks acima de 500 kB.

Refinamento didático: **280 testes direcionados em 25 arquivos**, incluindo
regressão dos capítulos 1–5, Inspector, catálogo, apresentação e 23 casos do
controller LPM; TypeScript, build e diff-check aprovados. Chromium: **113
verificações**, oito cenários compostos do capítulo, três idiomas, temas
claro/escuro e 700/1440 px, sem falhas/erros. Capturas desta revisão ficam
separadas em `.playwright-mcp/reviews/chapter6-lpm-refinement/`.
