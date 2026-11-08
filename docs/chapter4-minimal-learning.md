# Kapitel 4 — instruções mínimas, composição e causalidade ARP

Esta rodada preserva as oito tarefas do cenário 1 e as três do cenário 2, os
validadores, os dados técnicos e o contrato de progresso. Não há migração nova.
O relatório anterior permanece em `chapter4-guided-learning.md` como histórico.

## Checkpoints 1 e 2 — instrução e ajuda

O painel mostra título curto e uma instrução de uma ou duas frases. O indicador
de conclusão só aparece depois da comprovação; não há círculo vazio, texto
pendente nem parágrafos “Abgeschlossen, wenn …”. Alertas reais de configuração
ou persistência continuam disponíveis.

| Etapa interna | Ação | Ajuda opcional |
| --- | --- | --- |
| 1 | Primeiro ping A → B | Nenhuma: a instrução é suficiente. |
| 2 | Consultar R1 e acrescentar a rota para LAN B | Interpretar a saída real de `ip route` e a primeira rota estática. |
| 3 | Retestar e identificar a primeira rota ausente | Por que uma falha remota pode resultar apenas em timeout. |
| 4 | Configurar R2 para LAN B | Destino constante, próximo salto local e `ip addr`. |
| 5 | Retestar e investigar o retorno | Echo Reply é outro pacote destinado à LAN A. |
| 6 | Configurar retorno em R3 | Escolher o vizinho no enlace diretamente conectado. |
| 7 | Completar retorno em R2 | Retorno por R1, preservando a ida. |
| 8 | Comprovar A → B e B → A | Nenhuma: os indicadores já identificam os testes. |
| 9 | Configurar LAN C e gateway | Hosts utilizáveis, prefixo e gateway local. |
| 10 | Configurar R1 e R3 para LAN C | R2 é alcançado por um enlace diferente em cada router. |
| 11 | Comprovar seis direções | Nenhuma: os indicadores já identificam os testes. |

Nas etapas com ajuda existe somente um `Hilfe`, inicialmente fechado. Não há
submenus `Weitere Hilfe`, `Adressplan` nem tabela completa de endereços. A ajuda
fecha ao trocar de etapa. As explicações usam exemplos da própria rede e estão
traduzidas em DE/EN/PT-BR.

A etapa 2 mantém consulta e configuração juntas para preservar as oito tarefas
e seus critérios. Dentro da mesma ajuda, a leitura da tabela precede o exemplo
de configuração: Zielnetz, `dev`, `proto kernel`, `scope link` e `src` têm
definições distintas. O exemplo de `ip route add` explica destino, `via`,
alcance direto do Next Hop e a independência das rotas de retorno. A solução
fica recolhida, permitindo uma primeira tentativa sem abrir a ajuda.

## Checkpoint 3 — posições iniciais

Somente as coordenadas iniciais do capítulo 4 mudaram:

- R1/R2/R3: x = 420/660/900, y = 320; intervalo de 240 em vez de 360.
- Switch A/B: x = 240/1080, y = 320.
- PC A/B: x = 100/1220, y = 140, com conexões diagonais aos switches.
- Na inserção de LAN C, PC C fica acima e à direita de Switch C; o grupo local
  usa deslocamentos (180, 0) / (0, 140), em vez da coluna anterior com 280 de
  intervalo. A busca existente de espaço livre permanece ativa.

Considerando a largura mínima de 140 do host, a composição inicial cai de
aproximadamente 2.180 para 1.260 unidades: cerca de 42% mais estreita. Os nomes,
interfaces e endereços continuam nos dispositivos atuais. Assets, hitboxes,
cabos globais e opções de Fit View não foram alterados.

Planos existentes não são reposicionados. Reinício continua usando o checkpoint
da própria tentativa; a expansão preserva todas as posições e configurações
anteriores. A revisão verifica Fit View, recorte e colisões entre dispositivos
em 1440/1024/700 px. Na abertura do cenário 1 também confere ausência de
interseção entre a topologia e o painel mínimo.

Limite preservado: Fit View considera o canvas inteiro, sem reservar uma área
para o painel flutuante. Ajuda expandida e painéis abertos em telas estreitas
podem cobrir parte da rede. Recolher ou mover o painel pelos controles existentes
permite ver a composição completa; não foi acrescentado um auto-layout ou um
comportamento global novo para contornar essa limitação.
Em 700 px, Fit View preserva a rede inteira, mas o comportamento existente dos
rótulos pode abreviar endereços em zoom baixo; ampliar continua necessário para
ler todos os detalhes de interfaces.

## Checkpoint 4 — auditoria e correção visual

A reprodução usa o blueprint real, cache ARP vazio, `Shell`, store e
`PacketLayer`, com velocidade de apresentação 0,25×. O teste observa o motor
separadamente dos círculos efetivamente renderizados.

O motor já obedecia à sequência: ARP Request A → Switch A → R1; ARP Reply R1 →
Switch A → A; Echo Request A → Switch A → R1; Destination Unreachable R1 →
Switch A → A. Cada entrega leva os mesmos 40 ms de antes. O ARP Reply só é
emitido depois da entrega do Request a R1.

Na reprodução, a resposta visual prematura era o **ICMP Destination Unreachable**,
não o ARP Reply: o erro ainda aparecia pela camada Live, enquanto ARP e Echo
Request seguiam o player lento do ping. Ele surgia a 240 ms, antes de o Echo
Request terminar visualmente a chegada a R1, em cerca de 4.800 ms.

| Transmissão | Motor: início relativo | Apresentação após a correção |
| --- | --- | --- |
| ARP Request A → Switch A | 0 ms | primeira etapa |
| ARP Request Switch A → R1 | 40 ms | depois da primeira entrega visual |
| ARP Reply R1 → Switch A | 80 ms | depois da chegada visual do Request a R1 |
| ARP Reply Switch A → A | 120 ms | depois da entrega anterior |
| Echo Request A → Switch A | 160 ms | depois do retorno visual do ARP Reply |
| Echo Request Switch A → R1 | 200 ms | depois da entrega anterior |
| Destination Unreachable R1 → Switch A | 240 ms | depois do Echo Request chegar visualmente a R1 |
| Destination Unreachable Switch A → A | 280 ms | depois da entrega anterior |

O player agora reconhece erros ICMP que citam o ID/sequência do ping observado.
Só associa uma resposta raiz quando há uma única solicitação realmente entregue
ao dispositivo que a gerou. O erro acompanha a sequência causal e deixa de
aparecer como cópia Live antecipada. A descrição distingue Destination
Unreachable/Time Exceeded de Echo Reply, e um erro nunca conta como sucesso.

Scheduler, latência, ARP e protocolos do motor não foram modificados. Erros de
UDP/TCP continuam como tráfego Live independente. O teste existente de flooding
mantém os ramos físicos paralelos; não há serialização global dos pacotes.

## Checkpoint 5 — evidências e validação

- `staticRoutingPresentation.test.ts`: reprodução precisa do primeiro ping com
  falha e um ping completo com as quatro rotas, ambos com ARP frio e renderer
  real. Confere cada Request → Reply e liberação do IP nos vários saltos.
- `guidedPacket.test.ts`: erros de rede e TTL, identidade da sessão, entrega
  prévia, reprodução e ausência de crédito falso de Echo Reply. Erros UDP/TCP
  não são absorvidos pelo player do ping.
- Testes de animação, broadcast, tráfego independente, validadores, migração e
  reinício do capítulo continuam em execução.
- O roteiro Chromium usa terminal nativo, os onze passos, escolhas erradas e
  corretas, três idiomas, F5, retomada, reset e undo/redo. Verifica os dois
  cenários completos e captura a sequência visual real de ARP/ICMP.

Referências finais em
`.playwright-mcp/reviews/chapter4-minimal/referencias-chatgpt/`: somente oito PNGs
numerados para selecionar todos. Logs, evidências do teste, galeria e revisões
anteriores ficam fora dessa subpasta. Não foram criados assets ilustrativos.

Os arquivos próprios do capítulo 5 e do Topology Studio foram comparados por
SHA-256 com o estado anterior à rodada. As alterações locais anteriores foram
preservadas. Não houve commit, push, merge ou deploy.

Resultado final: 2.967 testes em 176 arquivos passaram na suíte completa;
os seis fluxos nativos passaram sem erros de navegador. TypeScript, build e
`git diff --check` passaram. O build mantém o aviso existente de chunk acima
de 500 kB, sem alteração de empacotamento nesta rodada.
