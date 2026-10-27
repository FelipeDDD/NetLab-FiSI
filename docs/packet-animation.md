# Animação de ping: uma barra e uma tentativa por vez

A UX pública usa somente a barra temporária **Ping-Animation**, na parte inferior
do canvas e acima dos terminais. Ela aparece na primeira transmissão observada
(ARP ou ICMP) de um comando de ping, inclusive Quick Ping. Pings locais ou falhas
sem transmissão não abrem uma barra vazia.

O único slider oferece **Langsam (0,5×)**, **Normal (1×)** e **Schnell (2×)**.
A duração vem da função existente `packetAnimationDuration(speed)`: 400/200/100 ms
por link. O padrão é 1×; preferências antigas de velocidade/posição não são lidas,
reescritas ou migradas pelo novo controle. A escolha dura na execução atual da
aplicação e não integra documentos, rascunhos ou sessões persistentes.

A barra desaparece **3 segundos depois de o comando terminar e a última animação
pendente chegar ao fim**. Ela permanece entre tentativas de um ping contínuo.
Fechar manualmente esconde apenas os controles daquele comando, sem interromper
ping ou animação; o próximo comando pode abrir a barra novamente. Timers antigos
são cancelados ao mudar de comando/documento. A barra não rouba foco nem altera
dimensões do canvas, viewport, Inspector, dock ou topologia.

O botão superior **Packets**, sua seta e estilos foram preservados. Seu dropdown
oferece inspeção e atalhos para as operações existentes Start/Pause/Resume/Stop
capture. Nenhum controle de velocidade, Live/Schrittmodus, Step, Replay ou posição
do widget aparece ali. O Packet Inspector e sua infraestrutura não mudaram.

## Menor intervenção na reprodução existente

O store agora alimenta o observador `guidedPacket` automaticamente pelos callbacks
existentes `onPingProgress` e `onWireTransfer`, sem exigir seleção de modo.
O comando mais recente continua sendo o foco, como na implementação anterior;
comandos anteriores não são cancelados e continuam disponíveis no terminal/captura.

`PacketLayer` reutiliza `guidedPacket.playback` para desenhar **uma tentativa
ICMP por vez** durante o ping. Ramificações reais de broadcast ARP são a exceção:
elas aparecem em paralelo nos respectivos links. Não desenha as cópias Live
do mesmo tráfego nem mantém uma bolinha parada no destino após o fim. A indicação
`AnimatedTransfer.pingTraffic` é somente apresentação; nunca entra no frame,
Packet Capture ou serialização. Fora do ping focado, os demais protocolos mantêm
as animações Live e a duração normal de 200 ms por link, independente do slider.

A fila existente conserva as dependências reais dentro de cada tentativa e
agrupa tentativas pela sequência ICMP: Request, Reply, próxima tentativa. Se a
rede ainda não observou a volta, o cursor aguarda a resposta ou o encerramento
real da tentativa, sem bloquear o Scheduler. Após timeout, segue sem inventar
Reply. Um frame atrasado continua na observação/captura e não rebobina o cursor.

Mudar a velocidade altera somente o incremento futuro do cursor fracionário,
preservando sua posição. O Scheduler fica em 1×; o intervalo de um segundo virtual
entre os envios, RTTs, timestamps e quantidade de pacotes não mudam. O terminal
escreve as respostas quando o motor as entrega, independentemente da animação.
Run após restauração e Pause manual mantêm a política existente. Reprodução
visual pode terminar com a rede pausada; ela não produz novos eventos de rede.

## Contratos técnicos preservados

As APIs de modo, Pause, Step, Replay e Follow permanecem disponíveis internamente,
assim como `GuidedPacketControls`, os helpers de retiming e as constantes legadas.
Não são uma segunda UX ativa. O parâmetro explícito `guided` de
`packetAnimationDuration` mantém o contrato histórico para consumidores técnicos;
a experiência pública usa somente a duração comum acima, sem multiplicador oculto.

A observação mantém a janela das últimas quatro tentativas e, se necessário,
a tentativa atualmente apresentada (no máximo cinco metadados), com o limite
total de 256 saltos. A fila visual mantém somente a tentativa atual e uma
pendente, limitada também a 32 transmissões. Em sobrecarga, a barra indica **Animation gekürzt ·
Details in Packets**. Esses limites não descartam registros do Packet Capture;
este conserva sua política independente. Não há um novo motor, gerenciador de
sessões de ping, histórico extenso ou persistência para a barra.

A proveniência ARP/ICMP existente continua usando identidades reais e o canal
`WireVisualTrace`, separado dos payloads. São preservados `parentTransferId`,
`echoRequestTransferId`, `arpRequestTransferId` e `arpPing`, inclusive através de
switches, roteadores e NAT. Não se adivinham relações por IP ou horário.
`sequencePacketAnimation` e `retimePacketAnimations` continuam disponíveis para
as animações técnicas Live. Não foram alterados protocolos ou seus intervalos.

## Sobrecarga, cancelamento e broadcast

Antes, uma fila FIFO limitada a 32 saltos ainda podia conter várias tentativas
antigas. Em velocidade lenta, novos Requests surgiam mais rápido que a
reprodução visual de cada Request/Reply. Ctrl+C encerrava o produtor, mas não
retirava essa fila, prolongando a apresentação de tentativas antigas.

Agora um novo ciclo substitui a tentativa pendente que ainda não começou. Os
saltos da tentativa atual permanecem na frente, incluindo seu Reply real. A
proveniência da tentativa ativa é mantida mesmo quando ela sai da janela das
quatro mais recentes, para não perder relações Request/Reply durante lentidão.
Saltos atrasados permanecem observados, mas não rebobinam uma etapa já exibida.

O evento de observação `PingProgress.finished` possui o campo opcional
`cancelled`, marcado pelo cancelamento já existente do comando. Isso diferencia
Ctrl+C de uma conclusão finita normal sem tocar nos pacotes, no Scheduler ou
no intervalo lógico do ping. No cancelamento, a apresentação remove tentativas
nunca iniciadas e só admite novos saltos da tentativa atual. Sua animação
termina com o Reply, se observado, ou sem inventar resposta. A conclusão normal
de `-c`/`-n` ainda permite terminar a única tentativa pendente conservada.

Cada `GuidedHop.visualStep` representa uma etapa de apresentação, derivada das
identidades reais `parentTransferId`, `arpRequestTransferId` e
`echoRequestTransferId`. Os filhos do mesmo broadcast têm a mesma etapa e o
mesmo progresso: Origem → Switch, ramificações paralelas, Reply do dono do IP.
As dependências ARP/ICMP no mesmo equipamento usam somente os saltos já
identificados dessa exata tentativa/direção; não usam heurísticas de IP/tempo.
Um switch em cascata conserva as etapas intermediárias. Não se cria uma
transmissão fictícia nem se altera a seleção real de VLANs/portas do motor.

Tráfego Live sem relação com o ping focado continua sendo desenhado durante
a reprodução, com sua própria linha de tempo. O foco permanece no comando
de ping mais recente, como antes; outros pings continuam no motor, terminal e
captura, sem compartilhar identidade ARP com o foco. Não foi criado um
gerenciador de múltiplas reproduções ou uma nova interface de replay.

## Run automático e ciclo de vida do terminal

A falha foi reproduzida em Linux e Windows: `getSession()` podia criar uma
sessão xterm pela apresentação/API antes de `store.openTerminal()`. Como uma
sessão existente era devolvida sem incorporar novos callbacks, o vínculo com
`onSchedulerRequired` ficava ausente. Isso também afetava sessões recriadas.

Sessões existentes agora incorporam as opções explicitamente fornecidas em
`getSession()`, sem perder callbacks nas consultas sem opções e sem recriar
xterm, seu buffer, cursor, histórico ou comandos. O único gate de Run continua
em `store.openTerminal`: libera apenas Pause de ativação para comandos com
`needsScheduler`. Leituras e comandos passivos continuam pausados. Em Pause
manual, o terminal mostra uma vez **Simulation pausiert · Zum Fortsetzen Run
klicken.** ao iniciar o comando ativo. Não se acrescentou outro gate nem
se mudou o estado do Scheduler.

Os testes cobrem F5, troca Linux/Windows, sessão criada antecipadamente,
destruição/recriação, troca de planos, Quick Ping, `dhclient`, `ipconfig /renew`
com DHCP habilitado, Ctrl+C e nova execução. Não é necessário modificar a
política de pausa manual ou a persistência para corrigir o vínculo.

## Validação

Testes dirigidos cobrem ordenação entre tentativas intercaladas, espera por
resposta/timeout, frames atrasados, uma bolinha, ausência de bolinha residual,
velocidade sem saltos, quantidade lógica e timestamps, APIs técnicas e captura.

O harness Chromium existente usa perfil e IndexedDB descartáveis. Ele exercita
ping contínuo, `-c`, `-n`, Quick Ping, slider por teclado, fechamento manual,
reabertura no próximo comando, desaparecimento automático, ambos os temas e
700/1440 px. Amostras por animation frame verificam no máximo uma bolinha e
sequências não decrescentes. Capturas reais usam a organização existente em
`.playwright-mcp/reviews/`, sem dados reais do navegador.

Validação da simplificação anterior, em 27/10/2026 com Node 24: **317 testes em 12 arquivos**, incluindo
regressões Chromium de Save/Load e viewport; **113 verificações** no harness da
interface, com **48 medições e 12 capturas reais**. TypeScript, build e
`git diff --check` aprovados. Cinco PNGs foram selecionados para compartilhar.
O build mantém o aviso conhecido de chunk acima de 500 kB.

O harness usa cache Vite exclusivo no diretório temporário de cada execução e
descarta a referência à porta antiga antes de reiniciar o Chromium. Isso evita
interferências entre testes e não altera o servidor nem o boot da aplicação.

A regressão de sobrecarga/broadcast/Run pode ser reproduzida com
`node scripts/test-ping-backpressure.mjs`, em perfil e IndexedDB descartáveis.
Ela usa o mesmo `store.tick` para avançar testes de carga de forma determinística
no Chromium, além de verificar os ciclos de vida com o driver normal da UI.
As evidências ficam em `.playwright-mcp/reviews/raw/ping-backpressure/`.

Validação desta correção, em 27/10/2026 com Node 24: suíte completa com
**1.274 testes em 91 arquivos**; verificação final dos módulos afetados com
**367 testes em 11 arquivos**, incluindo um caso adicional de Reply atrasado.
Chromium: **115 verificações**, incluindo 12 cenários desta correção, sem erros
do navegador. Testes de carga usam 120+ tentativas em cada velocidade/OS no
motor e 100+ em cada velocidade/OS no Chromium. Na amostra do Chromium, a fila
ficou em no máximo duas tentativas e dez transmissões; os limites contratuais
continuam 32 transmissões e 256 saltos observados. Os registros de captura e
resultados do terminal conservaram os envios reais. TypeScript, build e
`git diff --check` passaram; permanece o aviso de chunk acima de 500 kB.
