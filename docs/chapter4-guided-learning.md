# Kapitel 4 — aprendizado guiado

## Auditoria e limites de escopo

O capítulo anterior tinha oito tarefas **no total**: cinco para a linha de
routers e três para a expansão LAN C. A sequência solicitada corresponde a oito
tarefas somente no primeiro cenário. O capítulo passa a ter 11 tarefas internas;
o cabeçalho mostra `Schritt 1 von 8` no cenário 1 e `Schritt 1 von 3` no cenário 2.
A expansão conserva seus três objetivos, validações de rede, conexões e endereços.

No documento inicial não há rotas estáticas. Endereços, interfaces, forwarding,
gateways, VLANs, enlaces e latência foram preservados. Apenas o posicionamento
inicial de R1/R3 mudou: x=580/1460 → 660/1380, com R2 em x=1020. A distância
entre routers cai de 440 para 360 unidades, cerca de 18%. PCs e switches
conservam suas coordenadas. A fábrica não reorganiza planos já existentes;
reinício continua usando o checkpoint da própria tentativa.

O Topology Studio, os assets dos dispositivos, handles, geometria de cabos do
canvas e o conteúdo didático do capítulo 5 não foram alterados nesta rodada.
Nos outros capítulos, a alteração é restrita ao cabeçalho de progresso comum.

## Checkpoint 1 — cabeçalho

`ChapterStepProgress`, em `CompletionUI.tsx`, apresenta nome do capítulo,
cenário quando aplicável, um contador de navegação e uma barra discreta. A
repetição visível de “N/N Aufgaben abgeschlossen” saiu dos cabeçalhos de todos
os capítulos. O contador textual dos menus de exercícios continua útil e foi
mantido. As evidências de conclusão dos demais capítulos não foram alteradas.
No capítulo 4 a barra e a navegação usam o total do cenário; o estado de
conclusão do capítulo ainda exige os dois cenários.

## Checkpoint 2 — sequência progressiva

| Etapa | Ação | Comprovação |
| --- | --- | --- |
| 1 | Testar PC A → PC B | Falha real atribuída a R1, ou resposta em rede já configurada. |
| 2 | Consultar `ip route` em R1 e configurar LAN B | Consulta real pelo teclado e rota válida de R1 para toda a LAN B. |
| 3 | Repetir o teste e diagnosticar o próximo salto | Novo teste na configuração atual e escolha correta do primeiro router sem rota. |
| 4 | Configurar R2 para LAN B | R1 e R2 encaminham para toda a LAN B. |
| 5 | Testar e investigar o retorno | Novo teste com a ida configurada; não basta ter executado um teste antigo. |
| 6 | Configurar retorno em R3 | Rota válida para LAN A, mantendo a ida. |
| 7 | Configurar retorno em R2 | Caminho de retorno completo. |
| 8 | Verificar A → B e B → A | Respostas reais dos dois sentidos na configuração atual. |

As quatro rotas esperadas continuam sendo:

```text
R1: 192.168.20.0/24 via 10.0.12.2
R2: 192.168.20.0/24 via 10.0.23.2
R3: 192.168.10.0/24 via 10.0.23.1
R2: 192.168.10.0/24 via 10.0.12.1
```

Agregados e rotas divididas equivalentes continuam aceitos pelo validador real;
uma rota /32 só para PC B não substitui a rota para toda a LAN. Next hops
incorretos ou rotas mais específicas erradas continuam bloqueando a tarefa.

Cada etapa apresenta título curto, instrução, condição de conclusão e um único
menu `Hilfe`, inicialmente fechado. Dentro ficam uma dica conceitual, `Weitere
Hilfe` e `Adressplan`. A primeira configuração explica destino e next hop e
mostra seu comando somente na ajuda adicional. As seguintes reduzem a orientação
e deixam o aluno consultar o plano. O plano completo de interfaces/endereço
continua disponível sob demanda. A ajuda fecha ao mudar de etapa. DE/EN/PT-BR
usam o catálogo `guidedStaticLine`.

### Divergência observada nos pings

A auditoria usa o `Shell` e o scheduler reais:

| Configuração | Saída real de PC A → PC B |
| --- | --- |
| Inicial | `From 192.168.10.1 ... Destination Net Unreachable` |
| Somente R1 configurado | `no answer yet for icmp_seq=1` |
| Ida completa, retorno ausente | Sem resposta |
| R3 com retorno, R2 sem retorno | Sem resposta |
| Quatro rotas configuradas | Echo Reply de PC B |

O erro de R2 não consegue retornar a PC A enquanto falta sua rota para LAN A.
A instrução não exige uma mensagem de R2: ensina a examinar sua tabela. Se o
aluno configurar o retorno antes, o erro de R2 também pode chegar e é aceito.
Configurações completas antecipadas são aceitas, sem fabricar uma falha inicial.
Eventos de comandos API, respostas de outra configuração e retestes antigos não
produzem crédito indevido. A consulta inicial é reconhecida em `ip route`,
`ip route show`, `ip route list` e suas formas com `-4`.

### Progresso antigo, persistência e reinício

O envelope de metadados e a chave `guided:static-routing:v1:draft:` foram
mantidos; `chapterVersion` passa a 2. O leitor valida e converte os registros
anteriores sem modificar o objeto de entrada. Tentativa, identidade MAC da LAN C,
configuração da rede, posições e comprovantes válidos são preservados.

Uma linha já concluída tem suas oito tarefas reconhecidas; os três passos
anteriores da expansão são remapeados para 9–11. Uma linha antiga ainda em
andamento retoma a orientação de R1, conservando suas rotas. Isso permite fazer
as novas inspeções/retestes sem perder configuração nem chegar ao final com
tarefas novas inacessíveis. Não são inventados recibos de inspeção ou reteste.
Metadados incompatíveis continuam gerando a proteção existente, sem reset
silencioso. Checkpoints, CAS e a ordenação topologia-antes-evidência permanecem.

## Checkpoint 3 — ARP/ICMP

O motor já respeitava a resolução ARP antes de transmitir IP e o request antes
da reply. A reprodução mostrou um defeito no **timeline visual Live**: o
primeiro quadro IP liberado pela fila ARP não tinha a dependência da resposta
ARP que o liberou. Com animações lentas, podia começar visualmente cedo demais.

Foi acrescentado apenas um vínculo de apresentação, `resolvedArpTransferId`,
no side channel visual existente. Ao liberar a fila, uma WeakMap associa o
pacote à chegada da resposta ARP, por identidade do payload e do dispositivo.
Não há heurística por IP/tempo, campos novos nos pacotes, estado persistido,
mudança no scheduler, no cache, no protocolo ou na ordem de liberação da fila.

`sequencePacketAnimation` espera o término visual de todas as dependências
conhecidas: encaminhamento, request de Echo/ARP e resolução ARP. Guarda como
predecessor aquele que termina por último. Tentativas e branches independentes
continuam concorrentes. Testes com switch, router e firewall/NAT confirmam as
duas respostas simultâneas e os mesmos tempos reais de entrega. O teste de
cache frio dos três routers reproduz quatro violações antes e nenhuma depois.

ARP de outra tentativa ou de outro vizinho pode legitimamente coexistir com
uma Echo Reply. O foco de reprodução guiada já distingue dispositivo, icmpId e
sequência, seleciona o comando mais recente e ignora eventos antigos; essa
lógica não foi reimplementada. O mecanismo de ping não foi serializado.

## Checkpoint 4 — validação

Executar:

```text
node scripts/test-static-routing-tutorial.mjs
npm.cmd test
npm.cmd run build
git diff --check
```

A revisão nativa usa banco e perfil descartáveis. São seis cenários cobrindo
terminal por teclado, oito passos da linha, ajuda/plano, escolha errada/correta,
F5, expansão preservada, seis pings finais, retomada, troca de plano, idiomas,
viewport de 1440/700 px e reinício com undo/redo. O helper de teste aguarda o
início real do comando antes de avançar o relógio, evitando uma corrida do CDP
com o processamento assíncrono do terminal.

Artefatos em `.playwright-mcp/reviews/chapter4-guided/`. A subpasta
`referencias-chatgpt/` contém somente cinco PNGs finais numerados, prontos para
selecionar todos. Logs, testes, cópias anteriores e a galeria ficam fora dela.

Limites: o validador aceita estados equivalentes e configurações antecipadas;
não força uma falha artificial nem exige exatamente quatro comandos literais.
Uma tentativa antiga parcial revisita as novas orientações sem apagar suas
rotas. A visualização só pode esperar dependências identificadas; referências
já expiradas usam o fallback existente. O build mantém o aviso de chunk acima
de 500 kB. Sem commit, push, merge ou deploy; alterações locais anteriores
preservadas.
