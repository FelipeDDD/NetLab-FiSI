# NAT/PAT e tradução reversa

Implementação local de 16/11/2026. Reutiliza `ConnTrack` e as regras existentes
de SNAT, masquerade e DNAT. Não adiciona modem, Internet ou novos dispositivos.

## Causa e correção

Antes, SNAT alterava apenas o IPv4; duas origens com porta/ID iguais podiam
produzir a mesma tupla traduzida. `confirm()` sobrescrevia então o índice
reverso. Agora a confirmação retorna uma tupla exclusiva ou falha, antes de
qualquer transmissão. Os índices original/reverso são inseridos juntos.

O identificador da associação inclui protocolo, IP/porta de origem e destino.
TCP e UDP têm espaços independentes; IPv4 WAN diferentes não conflitam.
Porta original livre é preservada. Havendo colisão após SNAT, procura-se o
primeiro valor livre em 1024–65535; ICMP Echo usa IDs 0–65535. A busca é
determinística. Portas TCP/UDP fora de 1–65535 são recusadas.

O mapeamento é por fluxo completo, dependente de endereço e porta remotos.
Assim, uma porta WAN pode ser reutilizada para destinos diferentes sem tornar
a consulta reversa ambígua. Não se promete mapeamento independente do destino.
DNAT ou tráfego sem SNAT não ganham uma porta de origem artificial se ocorrer
uma colisão: a confirmação falha e a associação anterior permanece intacta.

Retransmissões e pacotes seguintes usam a associação original; não voltam a
alocar. O pacote no enlace contém a porta/ID traduzido. O retorno restaura
endereços, portas e ID ICMP originais antes da decisão de roteamento e filtros.
As associações visuais são copiadas quando o remapeamento cria uma mensagem
ICMP nova, preservando a relação Request/Reply nas animações.

## Erros ICMP, firewall e ciclo de vida

Time Exceeded e Destination Unreachable usam o `OriginalRef` já representado
pela engine. A consulta compara a tupla citada com o lado traduzido/original,
verifica que o destinatário do erro é o emissor citado e restaura os endereços
e os campos citados apropriados. Quando aplicável, a origem do erro
também volta ao endereço público de DNAT. Esses pacotes são `related`, sem
criar outra associação ou prolongar sua validade. Não há cabeçalhos binários
ou checksums inventados.

OUTPUT/INPUT/FORWARD continuam sendo avaliados nos caminhos existentes. Um
pacote bloqueado antes da confirmação não consome mapeamento. Não se ignora
firewall para entregar respostas. Esgotamento deixa ambos os índices intactos:
envio local retorna erro; encaminhamento descarta o pacote e o cliente observa
a falha/timeout existente.

Mantido o timeout didático uniforme de 120 segundos de inatividade, medidos
pelo relógio do Scheduler. Expiração é verificada nas consultas, alocação e
listagem; não precisa de um timer por conexão. `remove()` libera ambos os
índices com verificação de identidade. Não há uma tabela separada de reservas.
Mapeamentos expirados não impedem reutilização, mesmo antes de uma limpeza geral.

Masquerade registra interface e IPv4 utilizados. Antes do processamento seguinte,
mudança/remoção desse endereço ou da interface invalida as associações afetadas.
Queda de link não transfere a reserva a outro cliente. Mudanças de regras NAT
preservam associações existentes até expiração/remoção; regras novas valem para
fluxos novos. SNAT fixo mantém seu endereço explícito durante a vida do fluxo.
Alterações de rotas continuam obedecendo à tabela efetiva.

## Persistência e validação

Regras NAT/firewall mantêm o formato existente. Conntrack e alocações são
transitórios: Save/Load/F5 não os restauram. Não há mudança de schema.

`src/engine/natPat.test.ts` cobre dois PCs, LAN `192.168.10.0/24`, Router WAN
`192.0.2.2/30`, provedor `192.0.2.1/30` e Server `198.51.100.10/24`.
Não há rota privada no provedor no cenário NAT. TCP/HTTP, UDP/DNS e ICMP
simultâneos usam portas/IDs iguais e recebem respostas corretas. Um controle
sem NAT falha; adicionar uma rota de retorno explícita permite comunicação
roteada sem NAT. Também são cobertos esgotamento TCP/UDP em faixa limitada,
todos os 65.536 IDs ICMP ocupados, expiração virtual, remoção, estabilidade,
protocolos/WANs separados, erros ICMP reais e unitários, DNAT, mudança WAN,
regras NAT, SNAT stateful, bloqueio de FORWARD e Save/Load.

Regressões: `commands/firewall.test.ts`, `engine/visualTrace.test.ts` e suíte
completa. Resultados finais em `docs/CONTEXTO_CONTINUIDADE.md`.

## Referências e limites

Foram consultadas [RFC 3022](https://datatracker.ietf.org/doc/html/rfc3022),
[RFC 4787](https://datatracker.ietf.org/doc/html/rfc4787),
[RFC 5382](https://datatracker.ietf.org/doc/html/rfc5382) e
[RFC 5508](https://datatracker.ietf.org/doc/html/rfc5508) para tradução,
colisões, comportamento TCP/UDP e ICMP. São referências, não uma declaração
de conformidade integral. O timeout TCP uniforme e o mapeamento por fluxo
continuam simplificações do NetLab.

Não há TCP completo, verificação de números de sequência, temporizadores por
fase TCP, tratamento binário de checksums/fragmentos, ALG, hairpin NAT ou todas
as modalidades ICMP. O alocador usa busca linear limitada; não foi projetado
para cargas de produção. Captura contém somente campos existentes da simulação.
