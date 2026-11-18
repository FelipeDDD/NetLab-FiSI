# DHCP Relay entre sub-redes

Implementado localmente em 16/11/2026. Server continua multifuncional; não há
novos dispositivos, stores IndexedDB ou mudanças no algoritmo de roteamento.
Esta implementação substitui a proposta incremental da auditoria anterior.

## Configuração manual

1. Conectar PC → Router → Server. PC começa sem IPv4.
2. Router: interface do PC `192.168.10.1/24`; interface do servidor
   `192.168.20.1/24`.
3. Server: `192.168.20.10/24`, gateway `192.168.20.1`.
4. Server → Serviços → DHCP · Sub-redes remotas: novo pool habilitado,
   rede `192.168.10.0/24`, início `192.168.10.100`, fim `192.168.10.150`,
   gateway `192.168.10.1`, DNS `192.168.20.10`. Aplicar. A opção DNS não cria
   um serviço DNS nem registros automaticamente.
5. Router → Netzwerk → IPv4 da interface do PC → DHCP Relay: habilitar,
   destino `192.168.20.10`, aplicar.
6. Executar `dhclient eth0` no cliente Linux ou `ipconfig /renew` no Windows.
   Conferir endereço, máscara, gateway e DNS. A rota de retorno do Server até
   `192.168.10.0/24` precisa existir; sem ela não chega Offer ao cliente.

## Caminho dos pacotes

O cliente envia broadcast UDP 68 → 67 na LAN. Após INPUT, o Router copia a
mensagem DHCP, preserva xid/MAC, preenche `giaddr` e incrementa `hops`.
`sendL4()` envia UDP 67 → 67 ao servidor usando rotas, ARP, enlaces,
firewall e Scheduler normais. Não há entrega direta por ID de dispositivo.

O servidor seleciona exatamente um pool remoto habilitado/compatível com
`giaddr`, reserva o endereço antes de Offer e confirma o lease em Request.
Offer/ACK retornam por unicast UDP 67 → 67 ao `giaddr`, com máscara do pool
remoto. O Router verifica transação, servidor, interface, endereço e enlace
originais antes de transmitir broadcast UDP 67 → 68 na LAN do cliente.
O cliente Request agora informa o servidor selecionado.

O Relay começa vazio/desabilitado. Uma tabela transitória de até 512
transações, com validade de 30 segundos simulados, associa respostas à LAN.
Mensagens com hops inválido/excessivo são descartadas. O cenário implementado
tem um Relay por caminho; não encadeia agentes ou retransmite giaddr estrangeiro.
Broadcasts genéricos não são encaminhados entre redes.

Referências do comportamento: [RFC 2131, seções 4.1 e 4.3.1](https://www.rfc-editor.org/rfc/rfc2131)
e [RFC 1542, seção 4.1](https://datatracker.ietf.org/doc/html/rfc1542#section-4.1).
Não se declara conformidade integral: o cliente DHCP continua um subconjunto
didático, com aquisição inicial e Release, sem temporizadores completos de
renovação, NAK ou Decline.

## Organização e segurança

- `engine/dhcpRelay.ts`: tipos, validação, seleção de pool, reservas e transporte
  Relay/servidor remoto. IPs e campos de protocolo são estruturados, sem análise
  de textos de terminal.
- `IpDevice`: mapas `dhcpRelays` por interface e `dhcpRemotePools` por ID,
  despacho de DHCP unicast/broadcast após INPUT. Pools locais e sondas ARP
  existentes continuam em seu caminho anterior.
- `dhcpPools.ts`, store e `topologyEdits.ts`: configuração e Undo/Redo existentes
  estendidos, preservando leases de pools mantidos. Comparação do histórico DHCP
  ignora ordem dos campos JSON, mas rejeita mudanças reais externas.
- `DhcpRelayPanel.tsx`: controles por interface e editor de pools remotos,
  DE/EN/PT-BR. Rascunhos de formulário participam do aviso de alterações não
  aplicadas. Gravações de formulário rejeitam configuração externa alterada.
- `packetPresentation.ts`: captura mostra giaddr/hops quando presentes.
- `serialize.ts`/`validateSave.ts`: campos opcionais no documento netsim v1;
  ausência significa mapas vazios. Nenhuma migração de dados reais.

Pools remotos exigem rede canônica, prefixo /0–/30, intervalo de hosts válido,
gateway local ao pool, DNS unicast e ausência de gateway/DNS dentro do intervalo.
Pools ativos remotos sobrepostos são rejeitados; intervalos sobrepostos com
pools locais também são rejeitados. Seleção ambígua não concede endereço.
Reservas/leases impedem duas concessões do mesmo endereço no pool, inclusive
com clientes simultâneos. HTTP, DNS e o flag global do servidor DHCP permanecem
independentes do Relay. `systemctl` controla somente o servidor DHCP.

Limitação explícita: não há detecção de IP estático ocupado na LAN remota.
ARP do servidor não alcança essa LAN e não é usado como prova de ausência de
conflito. Administrar intervalos exclusivos para DHCP. As sondas ARP locais
existentes foram preservadas. Não há DHCPv6, autenticação de servidores, opções
BOOTP completas ou suporte a cadeias de Relay.

## Persistência e validação

JSON, projetos, autosave e sessão usam os mesmos campos opcionais; F5 recupera
configuração, não processos, negociações, reservas ou leases transitórios.
Undo/Redo altera configuração, sem rebobinar os pacotes já transmitidos.

`engine/dhcpRelay.test.ts` cobre DORA real, giaddr/hops/portas, retorno roteado,
servidor inacessível, Relay off, pool ausente, interface sem IPv4/desconectada,
destino inválido, dois clientes simultâneos, duas sub-redes, HTTP/DNS simultâneos,
documento v1 e excesso de hops. `serverPresets.test.ts` cobre histórico de
Relay/pools e JSON. Regressões DHCP local permanecem na suíte.

`node scripts/test-server-presets.mjs` inclui Inspector localizado, histórico,
Save/Load e F5 dos novos campos, em banco/perfil descartáveis. Não usa dados
reais. A revisão mantém zero ou uma captura representativa, sem matriz.
Resultados finais em `docs/CONTEXTO_CONTINUIDADE.md`.
