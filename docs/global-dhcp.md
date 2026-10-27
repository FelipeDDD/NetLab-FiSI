# Controle global de DHCP no Router

O Router oferece **DHCP-Server global aktivieren** em Inspector → Dienste →
DHCP · Schnittstellen. O estado é `IpDevice.dhcpServerEnabled`, inicialmente
`true`, compartilhado pelo motor, Inspector e terminal. Não existe cópia paralela
no Zustand: a ação do store escreve no dispositivo e atualiza a apresentação.

O controle global não altera `pool.enabled`, ranges, gateway, DNS, mapas de
leases/reservas, IPv4, estado administrativo ou Link UP. Com o serviço desligado,
o Inspector mostra **DHCP-Server global ausgeschaltet**, mesmo com links ativos.
Reativar libera somente os pools individualmente habilitados e válidos.

## Terminal Linux, sem emular Cisco IOS

No terminal do Router, diretamente no prompt normal:

```sh
systemctl stop kea-dhcp4-server
systemctl start kea-dhcp4-server
systemctl status kea-dhcp4-server
```

O sufixo `.service` também é aceito. Start/Stop alteram o mesmo flag da interface;
Status consulta esse flag e explicita o escopo DHCPv4 Server, sem DHCP Relay.
`help` documenta o subconjunto e seu contexto. Não é necessário entrar em
`configure terminal`; o Router utiliza o shell Linux existente. Não foram
implementados sudo, privilégios Unix, instalação de pacotes ou um gerenciador
systemd completo. Outras unidades, ações e argumentos extras são rejeitados.

Foi escolhida uma sintaxe real de serviço DHCPv4 do Ubuntu/Kea. `no service dhcp`
do Cisco IOS também desliga Relay, enquanto NetLab não implementa Relay; por isso
essa sintaxe Cisco não foi acrescentada. O serviço é uma representação didática
do servidor do motor, sem executar um daemon Kea real. DNS permanece independente.
O `ss` deixa de anunciar o servidor DHCP/UDP 67 quando o controle global está off.

Referências: [Ubuntu/Kea](https://ubuntu.com/server/docs/how-to/networking/install-isc-kea/),
[systemctl](https://www.freedesktop.org/software/systemd/man/latest/systemctl),
[Cisco: escopo de service dhcp](https://www.cisco.com/c/en/us/support/docs/ip/dynamic-address-allocation-resolution/27470-100.html).

## Segurança e persistência

Discover e Request não são atendidos enquanto o flag está off. Um probe ARP
pendente também não pode emitir uma nova Offer depois da parada: sua reserva
permanece retida e é reavaliada por novos probes no próximo Discover após Start.
Não se apagam leases ou reservas ao clicar no controle. Pacotes já transmitidos
antes da parada continuam obedecendo ao Scheduler; não são retirados dos cabos.

O campo opcional `SavedDevice.dhcpServerEnabled` pertence à topologia `netsim`
v1. `false` é serializado; ausência significa `true`, preservando documentos
antigos. Valores diferentes de boolean são rejeitados antes da ativação. O
normalizador/migrador aceita o default explícito `true` sem considerar sua
omissão uma perda de dados. Não houve mudança de versão do documento ou IndexedDB.

Save/Load e sessões usam a serialização existente. O toggle preserva os leases
atuais em memória; caches, negociações, reservas e leases de execução continuam
transitórios após F5, conforme o contrato anterior. O estado global e as
configurações dos pools são restaurados. Alterar o controle não inicia Run.

A ação do Inspector participa de Undo/Redo como uma alteração booleana isolada,
sem rebobinar leases. Mudanças pela CLI passam pelo detector de configuração
existente do terminal, atualizam o Inspector imediatamente e invalidam histórico
incompatível. Formulários ainda não aplicados não são substituídos pelo toggle.

## Validação

`engine/dhcpGlobal.test.ts` cobre três sub-redes, pool individual off, interrupção
durante probe/Offer/Request, reservas, leases, Link UP, CLI estrita e documentos
v1 antigos/novos. `terminals.test.ts` cobre os dois sentidos Inspector ↔ CLI,
Undo/Redo, atualização imediata e restauração. O harness descartável
`scripts/test-interface-audit.mjs` valida a interface real, DHCP, Save/Load e F5,
além do Terminal preto/branco redondo nos temas Graphite Dark e Classic Light.

Validação desta alteração: 347 testes direcionados em 10 arquivos e 112
verificações no Chromium passaram, sem erros do navegador. TypeScript, build
e `git diff --check` também passaram. O build mantém o aviso de chunk acima
de 500 kB. Os testes do navegador usaram perfil e banco descartáveis; nenhum
dado real foi migrado ou alterado.
