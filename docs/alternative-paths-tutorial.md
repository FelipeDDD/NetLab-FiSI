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

Após as três primeiras tarefas, uma transição explícita acrescenta somente
PC A → R1 eth2 e PC B → R3 eth2, sem switches. Os routers, posições manuais,
endereços e rotas anteriores são preservados. LAN A é 192.168.10.0/24 e LAN B
192.168.20.0/24. Os quatro endereços de LAN e os gateways ficam para o aluno;
hosts únicos válidos e gateway/default efetivo via router local são aceitos.

## Oito tarefas

1. Configurar todos os endereços de trânsito e preservar o triângulo.
2. Demonstrar seis Echo Replies entre vizinhos: ambos os sentidos dos três enlaces.
   O destino precisa ser a interface do vizinho no enlace compartilhado e a rota
   escolhida precisa ser `connected`. Isso não é prova de roteamento estático.
3. Reconhecer 10.0.23.0/30 como rede de trânsito não diretamente conectada a R1.
   Conferir os prefixos reais de `ip route`.
4. Adicionar e configurar os dois PCs, interfaces de LAN e gateways.
5. Estabelecer rotas estáticas de ida e retorno por R2 e comprovar A ↔ B.
6. Identificar Next Hop, interface de saída e Longest Prefix Match. A tabela
   exibida lê `IpDevice.routes()` e marca a escolha real de `lookupRoute()`.
7. Interromper um dos enlaces utilizados, mantendo R1–R3 ativo e o restante da
   configuração comprovada. Executar novo ping A → B e observar a falha real.
8. Mudar manualmente as rotas para R1 ↔ R3, incluindo retorno, e comprovar novas
   respostas A ↔ B enquanto o enlace anterior continua interrompido.

As explicações e dicas recolhíveis usam DE/EN/PT-BR. O exemplo de LPM compara
192.168.20.0/24, 192.168.0.0/16 e default para o endereço real de PC B.
R1 também demonstra por que a conectada 10.0.13.0/30 vence uma default mais ampla.
A comparação é por especificidade, não por uma prioridade universal de rotas
estáticas sobre conectadas. Não há ensino de métricas ou empate de prefixos
neste capítulo, nem configuração de roteamento dinâmico/failover automático.

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

Para atribuir a falha da tarefa 7 ao enlace interrompido, guarda-se um hash da
configuração comprovada. A comparação normaliza apenas UP/DOWN ou remoção de
R1–R2/R2–R3. Endereços, rotas, firewall, identidades e demais cabos continuam sendo
comparados. Só um desses enlaces pode estar interrompido; R1–R3 continua ativo.
É necessária uma solicitação ICMP real de PC A para R1 e uma falha explícita
produzida pelo ping (`Destination Net/Host Unreachable` ou timeout de sequência).
Timeout isolado após outras alterações não serve como diagnóstico do enlace.

## Progresso e recuperação

- Namespace: `guided:alternative-paths:v1:draft:<draftId>`, schema/contrato 1.
  Reutiliza `meta`, CAS e confirmação da topologia antes das evidências; não muda
  o schema do IndexedDB nem os formatos de projeto.
- Provas dos vizinhos usam uma assinatura das interfaces de trânsito, dos enlaces
  e das rotas efetivas para esses vizinhos. Acrescentar LANs não as invalida.
- Pings roteados usam a configuração permanente atual. Mudanças relevantes
  invalidam as respostas atuais; mover nodes não muda as assinaturas.
- Experimentos na tabela durante a tarefa 6 podem ser seguidos de novos pings,
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

## Arquivos e testes

Blueprint/critérios: `alternativePathsChapter.ts`; fluxo: `AlternativePathsController.ts`;
persistência: `alternativePathsProgress.ts`; UI: `AlternativePathsPanel.tsx`;
traduções: `src/i18n/catalogs/guidedAlternative.ts`.

```text
npm test -- --run src/tutorials/alternativePathsChapter.test.ts src/tutorials/AlternativePathsController.test.ts
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

Limites intencionais: backbone e redes de trânsito definidos; sem switches,
terceiro PC, protocolos dinâmicos, métricas ou recuperação automática. Desligar
uma interface local pode tirar uma rota da seleção; falha em um enlace remoto
não faz o router local reescrever suas rotas. Esses comportamentos são observados
no motor existente, sem alterações ou respostas simuladas.
