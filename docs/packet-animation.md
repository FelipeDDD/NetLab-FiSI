# Live, Schrittmodus (Guided) e causalidade visual

Os tempos experimentais ficam centralizados em `PACKET_ANIMATION_BASE_MS`, em
`src/packetAnimation.ts`: **Live 200 ms**, **Schrittmodus 1.000 ms** por link em 1×.
`packetAnimationDuration(speed, mode)` aplica os multiplicadores existentes.
O modo padrão da função é Live; as chamadas de reprodução Guided são explícitas.
As APIs técnicas de multiplicadores, compatibilidade com valores antigos e
retiming continuam disponíveis. A UI não expõe seletores de velocidade: inicia
em 1× e não aplica o multiplicador antigo salvo, sem apagar essa preferência.
O identificador interno `guided` é preservado; na interface aparece Schrittmodus.

Run/Pause controla o avanço do **Scheduler** no ritmo normal. Packets oferece
apenas a escolha de apresentação Live/Schrittmodus, com Step e Replay. O
intervalo de um segundo virtual entre os envios do ping permanece igual.
O terminal continua escrevendo a resposta ao
recebê-la pelo motor; não espera a conclusão de uma animação.

Os detalhes da simplificação e do experimento de ações dos dispositivos estão
em [device-actions-and-presentation.md](device-actions-and-presentation.md).

## Live

Cada transmissão observada permanece elegível para animação. Foram removidos os
cortes antigos de 150 itens e 12 segundos de atraso, que descartavam apresentação.
As animações são removidas após o seu prazo visual, ao invalidar/remover o caminho
ou ao trocar de topologia/modo, pelas fronteiras existentes. Não há timers
individuais nem fila global que serialize transferências independentes.

`sequencePacketAnimation` usa, em ordem de prioridade:

1. `parentTransferId`: continuação no próximo link.
2. `echoRequestTransferId`: primeiro salto da resposta ICMP.
3. `arpRequestTransferId`: primeiro salto da resposta ARP.

A resposta espera o último salto identificado da sua própria solicitação. A
dependência fica no `AnimatedTransfer` para que `retimePacketAnimations` preserve
a ordem ao mudar a velocidade. Dependência ausente/expirada começa no relógio
visual atual; não há tentativa de adivinhar relações por IP ou horário.

A retenção Live é temporal, não limitada por quantidade. Tráfego muito intenso,
topologias extensas ou velocidade visual muito baixa podem consumir mais memória.
Uma futura política de sobrecarga deve ser uma decisão explícita; não foi
introduzida amostragem silenciosa nesta etapa.

## ARP e Guided

O canal de observação em `Network` usa WeakMaps e identidades reais de objetos:
o ARP Reply é ligado ao Request recebido; a resolução ARP é ligada ao pacote
ICMP que efetivamente criou a pendência. Retries mantêm essa origem. O Reply
ICMP herda a origem do Request, inclusive através de encaminhamento/NAT.

Esses metadados são transmitidos no argumento separado `WireVisualTrace`, nunca
nos frames, em `WireFrameContext`, Packet Capture, configurações ou persistência.
Os pequenos hooks no IP device não alteram payloads, rotas, eventos ou atrasos.
Não foram modificados Scheduler, comandos de ping, xterm ou Save/Load.

Guided filtra essa proveniência pelo dispositivo, identificador e sequência do
ping selecionado. Mostra ARP Request/Reply e ICMP, permitindo Step por transmissão
e Replay na ordem observada. Em rede roteada, a resolução do próximo salto pode
ocorrer entre saltos ICMP; ela aparece onde realmente foi observada.

São preservados o foco no comando mais recente, a janela das últimas quatro
tentativas de ping, os limites defensivos de observação/reprodução e os
avisos de truncamento. A captura de pacotes permanece independente desses limites.
Quando uma resolução já estava em curso para outro comando, não se inventam
saltos ARP anteriores para o novo ping: a origem é o pacote que abriu a pendência.
ARP sem proveniência de ping — por exemplo gratuitous ARP — não entra nesse replay.

## Validação

`packetAnimation.test.ts` cobre tempos, retiming, dependências, paralelismo,
predecessores ausentes e retenção além dos limites anteriores.
`engine/visualTrace.test.ts` cobre ICMP/ARP e encaminhamento/NAT; `guidedPacket.test.ts`
cobre replay ARP/ICMP e rejeição de proveniência alheia; `terminals.test.ts` valida
timing, captura, foco, Step, Pause, comandos contínuos e preservação das sessões.

A revisão Chromium reutiliza o harness descartável existente, com artefatos em
`.playwright-mcp/` ignorados pelo Git. Nenhum dado real do navegador é usado.
