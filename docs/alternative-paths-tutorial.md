# Kapitel 5 · Alternative Wege

Tutorial independente em **Übungen (Beta) → Geführte Tutorials**. Início direto
cria um rascunho próprio; retomada abre a tentativa existente. O Capítulo 4 não
é pré-requisito nem tem seus blueprints, controller ou critérios modificados.

## Blueprint progressivo

Inicialmente há somente três routers em triângulo, encaminhamento ativo, RIP
desativado e interfaces sem IPv4. Os três cabos já existem.

| Enlace /30 | Primeira extremidade | Segunda extremidade |
| --- | --- | --- |
| R1–R2 · 10.0.12.0/30 | R1 eth0: 10.0.12.1 | R2 eth0: 10.0.12.2 |
| R2–R3 · 10.0.23.0/30 | R2 eth1: 10.0.23.1 | R3 eth0: 10.0.23.2 |
| R1–R3 · 10.0.13.0/30 | R1 eth1: 10.0.13.1 | R3 eth1: 10.0.13.2 |

O aluno configura os seis endereços, praticando `ip address add`. O verificador
consulta a configuração real, sem depender da grafia literal do comando.

Após as quatro primeiras tarefas, uma transição explícita acrescenta somente
PC A → R1 eth2 e PC B → R3 eth2, sem switches. Os routers, posições manuais,
endereços e rotas anteriores são preservados. LAN A é 192.168.10.0/24 e LAN B
192.168.20.0/24. Os quatro endereços de LAN e os gateways ficam para o aluno;
hosts únicos válidos e gateway/default efetivo via router local são aceitos.

## Checkpoint 1 — três partes, 17 tarefas

O capítulo mantém o blueprint, os endereços, os próximos saltos e os critérios
finais existentes. A quantidade passa de oito para 17 tarefas internas, sem
transformar cada comando numa etapa. O cabeçalho compartilhado apresenta a
parte atual, um contador e a barra de progresso dessa parte: 4 / 10 / 3 tarefas.

| Parte | Etapa interna | Ação e comprovação |
| --- | --- | --- |
| Nachbarn verbinden | 1 | Endereçar R1–R2 e obter respostas dos dois vizinhos. |
| | 2 | Endereçar R2–R3 e obter respostas dos dois vizinhos. |
| | 3 | Endereçar R1–R3 e completar os seis testes locais. |
| | 4 | Distinguir rede conectada de remota para R1. |
| Routing über R2 | 5 | Configurar LAN A, incluindo gateway de PC A. |
| | 6 | Configurar LAN B com menos orientação. |
| | 7 | Novo ping A → B para investigar o alcance remoto. |
| | 8 | Configurar R1 para toda a LAN B por R2. |
| | 9 | Completar a ida em R2 por R3. |
| | 10 | Novo ping com a ida completa; a solicitação deve alcançar PC B por R2. |
| | 11 | Configurar R3 para toda a LAN A por R2. |
| | 12 | Completar retorno em R2 e comprovar A ↔ B por R2. |
| | 13 | Identificar o Next Hop selecionado em R1. |
| | 14 | Identificar Longest Prefix Match; experimento /24 versus /16 opcional. |
| Alternativweg | 15 | Interromper um enlace usado e comprovar a falha com novo ping. |
| | 16 | Identificar a alternativa física e redirecionar as duas rotas por R1–R3. |
| | 17 | Comprovar novas solicitações e respostas A ↔ B pelo enlace direto. |

Cada teste local exige a interface do vizinho no enlace compartilhado, rota
`connected` e pacotes reais. Provas novas têm escopo por enlace: endereçar o
próximo cabo não invalida o teste anterior. Recibos antigos com a assinatura
global continuam reconhecidos enquanto correspondem à configuração atual.

As etapas 7/10 aceitam uma resposta pelo caminho correto quando o aluno já
configurou as rotas antecipadamente, sem exigir apagar configurações nem
fabricar falhas. Para um resultado de falha, a etapa 7 exige a solicitação real
PC A → R1; a etapa 10 exige a solicitação completa por R2 até PC B. Texto
isolado de terminal, comandos API e resultados de configuração anterior não
aprovam essas observações.

## Checkpoint 2 — instruções e ajuda

Cada etapa tem título curto e instrução de uma ou duas frases. Os parágrafos
“Abgeschlossen, wenn …” saíram do painel; os critérios continuam integralmente
nos validadores. O indicador genérico aparece somente após a conclusão.

Há no máximo um `Hilfe`, fechado inicialmente e sem submenus. `Weitere Hilfe`
e `Adressplan` foram removidos. As etapas 6, 7, 11, 12 e 17 não têm ajuda:
aplicam conteúdo já ensinado ou pedem testes identificados pelos indicadores.
Nas três primeiras etapas, os dois endereços/interfaces necessários aparecem
diretamente na instrução, vindos do plano técnico existente, sem uma tabela
completa repetida. A ajuda da primeira configuração explica `ip addr`,
`ip address add`, `dev` e o prefixo /30.

A tabela real de R1 aparece somente nas etapas 4, 13 e 14, dentro da ajuda
única: leitura de rotas conectadas, Next Hop e LPM. Os demais auxílios explicam
gateway, `via`, retorno ou `ip link set` quando esses conceitos são relevantes,
sem repetir uma lista de comandos em todas as etapas. A configuração de rotas
usa sintaxe genérica; o experimento LPM tem seu exemplo opcional próprio.

As perguntas de redes conectadas, Next Hop e LPM permanecem limpas antes da
tentativa. Feedback técnico curto aparece após o acerto; abrir a ajuda permite
investigar o conceito e a tabela. Next Hop e LPM conservam suas etapas distintas.
Nenhum componente comum ou conteúdo do capítulo 4 foi alterado nesta rodada.

As explicações e dicas recolhíveis usam DE/EN/PT-BR. O exemplo de LPM compara
192.168.20.0/24, 192.168.0.0/16 e default para o endereço real de PC B.
A comparação é por especificidade, não por uma prioridade universal de rotas
estáticas sobre conectadas. Não há ensino de métricas ou empate de prefixos
neste capítulo, nem configuração de roteamento dinâmico/failover automático.

## Checkpoint 3 — inconsistências corrigidas

- `ip route` permanece uma ferramenta sugerida de investigação. A etapa 4
  valida configuração e resposta, sem afirmar que a digitação do comando é
  rastreada. Não foi criado mecanismo adicional.
- Os estados internos de caminho esperado, comprovado e invalidado continuam
  intactos. Para evitar repetições no painel, a sequência aparece somente nas
  etapas 12/17, quando há comprovação atual nos dois sentidos. As etapas de
  verificação e Next Hop/LPM mantêm um aviso curto se mudanças invalidarem a
  prova. Uma resposta parcial válida não recebe aviso de prova invalidada.
- A conclusão final usa o componente comum, sem duplicar a mensagem genérica
  nem acrescentar um parágrafo sobre um caminho que já foi mostrado.
- O aviso de preservação só aparece na etapa 15 quando já existe um enlace
  interrompido e há diferença indevida em relação à configuração comprovada.
  Alterações posteriores também impedem usar uma falha antiga como prova atual.
- `Änderungen` foi corrigido e os três idiomas orientam repetir os dois pings
  depois do experimento de LPM.

## Evidência do caminho real

`networkObservations.ts` publica observações somente de leitura no ponto onde o
store já observa ping e tráfego. Preserva os handlers existentes, Packet Capture,
Live/Schrittmodus e os protocolos. A observação ICMP contém apenas primitivas,
sem expor os frames mutáveis a assinantes. Exceções de observadores são isoladas.

O controller correlaciona comando de teclado/Quick Ping, dispositivo, Network,
ID ICMP e sequência. Cada resposta precisa dos saltos reais de Echo Request **e**
Echo Reply na ordem esperada. Uma resposta por outro caminho, texto de terminal
sem pacotes, comando `api`, clique ou pacote apenas enviado não aprova a tarefa.
Os caminhos exigidos são:

```text
Via R2: PC A → R1 → R2 → R3 → PC B
Direto: PC A → R1 → R3 → PC B
```

Os PCs começam em Linux, mas a validação também reconhece o ping Windows caso
o aluno altere o sistema operacional pelo Inspector. O texto Windows não inclui
`icmp_seq`; a prova continua limitada ao ID ICMP do comando, aos endpoints e aos
saltos reais da sequência observada, sem associar tráfego de outros comandos.

O retorno deve percorrer a sequência inversa; o aluno também inicia um ping do
outro PC. Os critérios de rotas examinam todos os limites de prefixos relevantes
dentro da /24. Aceitam rotas equivalentes que cubram a LAN e rejeitam exceções
mais específicas que desviem tráfego ou uma /32 isolada para o PC.

Para atribuir a falha da tarefa 15 ao enlace interrompido, guarda-se um hash da
configuração comprovada. A comparação normaliza apenas UP/DOWN ou remoção de
R1–R2/R2–R3. Endereços, rotas, firewall, identidades e demais cabos continuam sendo
comparados. Só um desses enlaces pode estar interrompido; R1–R3 continua ativo.
É necessária uma solicitação ICMP real de PC A para R1 e uma falha explícita
produzida pelo ping (`Destination Net/Host Unreachable` ou timeout de sequência).
Timeout isolado após outras alterações não serve como diagnóstico do enlace.

## Checkpoint 4 — progresso e recuperação

- Namespace: `guided:alternative-paths:v1:draft:<draftId>` e schema 1 preservados;
  `chapterVersion` passa a 2.
  Reutiliza `meta`, CAS e confirmação da topologia antes das evidências; não muda
  o schema do IndexedDB nem os formatos de projeto.
- Provas dos vizinhos usam interfaces, enlace e rotas efetivas do par testado.
  Acrescentar os demais enlaces ou LANs não as invalida; mudanças relevantes no
  próprio enlace invalidam seus comprovantes atuais.
- Pings roteados usam a configuração permanente atual. Mudanças relevantes
  invalidam as respostas atuais; mover nodes não muda as assinaturas.
- Experimentos na tabela durante as tarefas 13/14 podem ser seguidos de novos pings,
  sem exigir sair da etapa. Uma nova prova atualiza a referência da fase de falha.
- A inserção dos PCs grava a intenção antes de acrescentar dois dispositivos e
  dois links, numa operação de histórico existente. Recupera uma inserção inicial
  interrompida sem duplicar e recusa configuração ambígua. F5 não recria PCs
  apagados após a confirmação; Undo/Redo da edição continua disponível.
- O checkpoint inicial e `ChapterRestartService` restauram somente a tentativa
  deste capítulo. Reinício retorna aos três routers sem IPv4; restauração e
  progresso são transacionais e possuem Undo/Redo. Identidades reutilizadas ou
  conexões com trabalho independente bloqueiam uma remoção insegura.
- F5/retomada restauram estado e evidências, com a simulação pausada pelo fluxo
  normal. Não restauram comandos ativos nem fabricam novos pings.
- **Netzwerk frei erkunden** fecha somente o painel. Novas tentativas usam
  `openNewLearningAttempt()` para herdar a apresentação dos terminais, sem copiar
  sessões. Os temas e preferências do editor são independentes do tutorial.

### Migração do progresso anterior

O leitor valida primeiro o contrato v1 inteiro, converte uma cópia e valida o
resultado v2. Não altera a topologia nem o objeto de entrada. IDs de tentativa,
MACs, hashes de pings e de falha, checkpoint e configurações são preservados.
O registro convertido é usado em memória e gravado com o CAS existente na
próxima alteração de progresso; abrir uma tentativa concluída não força escrita.

| Evidência antiga | Etapas novas reconhecidas |
| --- | --- |
| 1: seis endereços | Configuração mantida; os testes dos enlaces ainda precisam de prova. |
| 2: seis respostas locais | 1–3 |
| 3: rede remota | 4 |
| 4: duas LANs | 5–6 |
| 5: solicitações/respostas por R2 | 7–12, incluindo observações intermediárias já cobertas pelo caminho completo |
| 6: Next Hop/LPM | 13–14 |
| 7: falha comprovada | 15 |
| 8: recuperação comprovada | 16–17 |

Uma tentativa antiga concluída continua concluída. Uma tentativa parcial pode
revisitar uma orientação nova, conservando suas rotas e comprovantes; não recebe
pings fictícios. A inserção pendente dos PCs migra para a transição da etapa 4,
e o checkpoint inicial antigo continua válido para reinício e undo/redo.

## Arquivos e testes

Blueprint/critérios: `alternativePathsChapter.ts`; fluxo: `AlternativePathsController.ts`;
persistência: `alternativePathsProgress.ts`; UI: `AlternativePathsPanel.tsx`;
traduções: `src/i18n/catalogs/guidedAlternative.ts`.

```text
npm test -- --run src/tutorials/alternativePathsChapter.test.ts src/tutorials/AlternativePathsController.test.ts
npm test -- --run src/tutorials/alternativePathsMigration.test.ts src/i18n/i18n.test.ts
node scripts/test-alternative-paths-tutorial.mjs
node scripts/test-static-routing-tutorial.mjs
node scripts/test-router-tutorial.mjs
npm test
npm run build
git diff --check
```

O roteiro Chromium usa perfil e IndexedDB descartáveis, entrada nativa no xterm,
F5 intermediário/final, troca de planos, reinício e Undo/Redo, idiomas e Dark/Light.
As capturas principais são publicadas pelo Visual Review existente; extras e
revisões anteriores permanecem em `raw/` e `archive/`, fora do Git.

As oito referências finais desta simplificação ficam separadas em
`.playwright-mcp/reviews/chapter5-minimal/referencias-chatgpt/`, contendo somente
PNGs, prontos para selecionar todos. O roteiro também verifica 1440/1024/700 px,
seis temas, os três idiomas, migração completa, F5 intermediário e final,
reinício, undo/redo, troca de planos e preservação do rascunho pessoal.

Validação desta simplificação: os 84 testes direcionados passaram, incluindo
migração parcial/concluída, checkpoints antigos, pings reais, falhas locais e
remotas, invalidação e rotas equivalentes. Os oito cenários nativos do capítulo
passaram sem erros de navegador. TypeScript, build de produção e
`git diff --check` passaram. O build conserva o aviso existente de chunk acima
de 500 kB; não foram feitas mudanças de empacotamento nesta etapa.

Os arquivos técnicos do capítulo 5 (controller, validações, blueprint e
migração), progresso compartilhado, observação/animação de pacotes, motor,
persistência, capítulo 4 e Studio foram comparados por SHA-256: 119 arquivos
permaneceram idênticos ao início da rodada. Não houve alteração das 17 etapas,
da divisão 4 + 10 + 3, dos critérios, das posições nem de contratos persistidos.

Limites intencionais: backbone e redes de trânsito definidos; sem switches,
terceiro PC, protocolos dinâmicos, métricas ou recuperação automática. Desligar
uma interface local pode tirar uma rota da seleção; falha em um enlace remoto
não faz o router local reescrever suas rotas. Esses comportamentos são observados
no motor existente, sem alterações ou respostas simuladas.
