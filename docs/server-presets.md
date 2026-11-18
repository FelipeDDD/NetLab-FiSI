# Server multifuncional e presets internos

A paleta oferece somente **Server**, com o asset existente e sem IPv4, pools
ou serviços habilitados automaticamente. Web Server, DNS Server e DHCP Server
foram retirados da paleta em 16/11/2026. Não há novos tipos de dispositivo,
protocolos, campos persistentes ou migração.

## Serviços independentes

Inspector → Serviços mantém os controles existentes:

- **HTTP Server:** seção recolhível, estado, toggle, porta e conteúdo da página.
- **DNS Server:** seção recolhível, estado, toggle e registros A.
- **DHCP Server:** estado e configuração por interface, intervalos, gateway,
  DNS e leases. Primeiro configurar IPv4; nenhum pool arbitrário é criado.

Os três podem funcionar simultaneamente no mesmo Server. Não foi necessário
reorganizar ou duplicar formulários. Desligar HTTP não desliga DNS ou DHCP.
Instâncias diferentes mantêm configurações independentes.

Serviço habilitado não comprova acessibilidade. HTTP/DNS exibem orientação
quando falta IPv4 ou enlace operacional; DNS vazio informa que faltam registros.
O placeholder DNS não é um registro salvo. DHCP valida a configuração por
interface antes de servir. Firewall, links, rotas e configurações do cliente
continuam determinando o acesso real. Um DNS vazio pode responder NXDOMAIN.

## Compatibilidade e reutilização

`src/serverPresets.ts` conserva as fábricas internas `web`, `dns` e `dhcp`,
utilizadas em testes e disponíveis para futura reutilização. Não são opções
visíveis na paleta. Web prepara HTTP/80 com página simples; DNS prepara serviço
sem registros; DHCP não cria pool. Todos permanecem `kind: server`.

O caminho opcional de criação do store e o MIME de drag/drop são preservados.
Valores desconhecidos são recusados. Presets internos são aplicados antes da
captura da operação de criação, para Undo/Redo incluir nome e serviço juntos.
A requisição interna para abrir Serviços é transitória, vinculada a Network/ID.

Nomes não determinam serviços. Servidores antigos chamados Web Server, DNS
Server ou DHCP Server preservam nomes, configurações e IDs. Save/Load, autosave,
F5, JSON e clipboard usam os campos existentes do documento v1. Sem exclusão
ou reescrita de projetos anteriores. Leases e negociações continuam transitórios,
conforme o contrato anterior. Nenhuma funcionalidade nova de HTTP, DHCP Relay,
NTP, Syslog ou Database foi introduzida.

## Validação

`src/serverPresets.test.ts` cobre fábricas internas e Server genérico, serviços
simultâneos com HTTP/DNS/DHCP pelos enlaces reais, IP/gateway/DNS recebidos,
independência de toggles/instâncias, configuração inválida, JSON e Undo/Redo.
`src/components/Inspector.test.ts` exige oito entradas de dispositivos na paleta,
incluindo somente um Server e nenhum preset visível.

`node scripts/test-server-presets.mjs` valida a paleta única, toggles reais do
Inspector, compatibilidade interna, drop, Undo/Redo, F5 e Save/Load manual com
perfil/IndexedDB descartáveis. Confere DE/EN/PT-BR, ambos os temas e 700/1440 px
sem gerar uma matriz de imagens. Uma captura Graphite Dark:
`.playwright-mcp/reviews/server-presets/multifunction-server.png` (ignorada).

Resultados finais desta rodada em `docs/CONTEXTO_CONTINUIDADE.md`.
