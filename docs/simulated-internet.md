# Primeiro laboratório de Internet simulada

Abrir **Labs → Internet simuliert — DNS, HTTP & NAT/PAT**, na seção de exemplos.
É um cenário pronto, sem avaliação ou provas pré-fabricadas. O fluxo normal de
exemplos abre um novo plano quando o controller está ativo; no fluxo legado,
vale o aviso existente de substituição da topologia. Salve o trabalho antes.

Abra o desktop/navegador de PC1 ou PC2 e acesse `http://example.test` ou
`http://www.example.test`. Ambos os registros A apontam para `198.51.100.10`,
sem redirecionamento HTTP.
Também funciona `http://198.51.100.10`. Execute a simulação para processar os
pacotes. O domínio `.test` é resolvido exclusivamente pelo DNS simulado.

## Configuração

- PC1 `.10` e PC2 `.20` em `192.168.10.0/24`, gateway `.1`, DNS `198.51.100.53`.
- Router eth0 `192.168.10.1/24`, eth1 `192.0.2.2/30`, default via `192.0.2.1`.
- Masquerade em eth1; firewall inicialmente permissivo.
- Modem eth0/eth1: bridge sem IPv4, entre Router e Provider.
- Provider `192.0.2.1/30` e `198.51.100.1/24`; forwarding, sem rota privada.
- DNS Server `198.51.100.53/24`: somente DNS, registros A de `example.test` e `www.example.test`.
- Web Server `198.51.100.10/24`: somente HTTP/80. Ambos têm gateway `.1`.

LAN e rede externa têm switches separados. Configuração em
`src/labs/simulatedInternet.ts`, documento netsim v1 comum, sem novos campos.
IPs, gateways, regras, serviços, cabos e posições passam por Save/Load, JSON e
autosave existentes. Conntrack, caches e processos não são recuperados.

## Diagnóstico

Desative DNS: acesso por nome falha, por IP continua funcionando. Remova o
gateway ou configure um next hop inexistente: o cliente não alcança a rede
externa. Desative masquerade antes de iniciar novos fluxos: falta retorno no
Provider. Remova o cabo do Modem, bloqueie FORWARD ou desative HTTP: cada
falha é produzida pela engine existente. Não há flags de sucesso/falha.
Associações NAT já existentes podem continuar após mudanças de regras até
expirarem; use nova abertura do exemplo para comparar estados limpos.

Testes `src/labs/simulatedInternet.test.ts` usam a mesma função `requestPage`
do navegador integrado, dois clientes simultâneos, ARP/IPv4 nos dois sentidos
do Modem, JSON e oito falhas. Harness opcional sem captura:
`NETLAB_INTERNET_REVIEW=1 node scripts/test-server-presets.mjs` verifica abertura
de plano, F5 e requisições pelo mecanismo do navegador em Chromium descartável.

Limites: ambiente determinístico local, HTTP simplificado, sem HTTPS, Internet
real, ISP automático ou protocolos novos. Futuramente pode servir de base para
diagnóstico guiado, sem incluir avaliação nesta versão.
