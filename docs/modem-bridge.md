# Modem Bridge

Dispositivo `modem`, duas portas Ethernet simétricas `eth0` e `eth1`.
Paleta → Modem. Representação provisória: ícone vetorial existente de bridge,
identificado pelo nome Modem; sem PNG novo. Inspector localizado mostra função,
portas e estados físicos, sem IP, terminal, NAT, firewall ou serviços.

## Implementação

A fábrica cria `SwitchDevice` com kind `modem` e exatamente duas interfaces.
No recebimento, o caminho Modem usa o flood Ethernet existente para a outra
porta. Não aprende MACs nem agenda envelhecimento; não oferece VLANs ou expansão
de portas. Não modifica MACs, payload, IPv4, TTL ou o objeto do quadro.
`NetInterface.send()` e `Link.transmit()` preservam Scheduler, eventos de
transmissão, captura e associações das animações.

Não há IP automático, roteamento, NAT ou acesso à Internet real. Desconectar
um lado não derruba artificialmente o enlace do outro; o tráfego deixa de
atravessar pela ausência de caminho físico. Interface DOWN também impede envio.
Uma terceira conexão é recusada por falta de interface disponível.

## Configuração manual mínima

1. Router do aluno `eth1` → Modem `eth0`.
2. Modem `eth1` → Router do provedor `eth0`.
3. Configurar Router WAN `192.0.2.2/30`, provedor `192.0.2.1/30`.
4. Executar ping de um roteador para o outro. O Modem não precisa de configuração.
5. Para serviços além do provedor, conectar Server `198.51.100.10/24` à interface
   `198.51.100.1/24` do provedor; gateway do Server `.1`. Configurar default do
   Router do aluno via `192.0.2.1`, LAN/gateways dos clientes e NAT conforme
   `nat-pat.md`. HTTP/DNS são ativados manualmente no Server existente.

Esses endereços são exemplos do laboratório isolado; não são criados pela paleta.

## Persistência e validação

Novo kind no documento netsim v1, sem stores ou migração. Documentos antigos
continuam aceitos. Validação exige duas portas canônicas, sem IP, rotas ou
serviços no Modem; dados incompatíveis são rejeitados antes de ativar, sem
descartar configurações silenciosamente. Leitores antigos que não reconheçam
`modem` precisam ser atualizados antes de abrir esses documentos.

Criação, cabos, seleção, posição, exclusão, Undo/Redo e JSON usam os mecanismos
existentes. Save/Load, autosave e F5 passam pelo documento comum. Exportação
de diagramas recebe um ícone vetorial simples para o novo tipo.

`engine/modem.test.ts`: identidade dos quadros nos dois sentidos, ARP/IPv4,
duas portas, falta de terminal/IP, terceira conexão, JSON, HTTP/DNS de dois
clientes com NAT/PAT, cabo removido, interface DOWN e falta de rota.
`serverPresets.test.ts`: criação/exclusão/restauração no histórico e JSON.
`test-server-presets.mjs`: paleta, Inspector, Undo/Redo, F5 e Save/Load em
Chromium descartável. Uma captura Graphite Dark em
`.playwright-mcp/reviews/server-presets/modem-bridge.png`, ignorada pelo Git.

Não simula DSL, DOCSIS, PPPoE, sincronismo de operadora ou Internet cloud.
É uma bridge Ethernet didática de duas portas. Resultados finais no contexto.
