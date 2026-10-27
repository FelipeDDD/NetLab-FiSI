# Limpeza do cache ARP

## Comandos disponíveis

Linux:

```sh
ip neigh show
ip neigh show dev eth0
ip neigh flush all
ip neigh flush dev eth0
```

`ip neigh` sem argumentos continua mostrando a tabela; `ip neighbour` também
é aceito. `arp`, `arp -a`, `arp -n`, `arp -an` e `arp -na` mantêm a tabela
clássica numérica. Outros argumentos de `arp`, inclusive `-d`, dão erro e
orientam usar `ip neigh flush`. Este subconjunto Linux não oferece remoção
por IP, filtros `to`/`nud`, entradas proxy, IPv6 ou Neighbor Discovery.

Windows:

```bat
arp -a
arp -d *
arp -d 192.168.1.20
```

O primeiro mostra o cache; os outros removem todas as entradas elegíveis ou
somente a entrada IPv4 indicada. As opções são aceitas sem distinção de caixa,
como no shell Windows existente. Uma remoção específica sem correspondência
informa `ARP entry not found`; um endereço inválido é rejeitado. O simulador
não implementa privilégios de administrador, criação de entradas estáticas,
índices de interface Windows nem filtros adicionais de `arp`.

Os comandos de remoção bem-sucedidos não imprimem confirmação artificial;
consulte novamente a tabela para conferir o resultado. Repetir uma limpeza
total com o cache vazio é válido. Argumentos desconhecidos, incompletos ou
extras nunca caem implicitamente em `show` nem executam remoção parcial.
Interfaces inexistentes dão erro antes da operação. O `help` de cada terminal
traz descrições curtas em alemão e os exemplos aplicáveis ao seu sistema.

Referências de sintaxe:
[iproute2: ip-neighbour](https://kernel.googlesource.com/pub/scm/network/iproute2/iproute2/+/refs/heads/main/man/man8/ip-neighbour.8),
[Microsoft: arp](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/arp).
No Linux real, o flush padrão preserva estados `permanent`/`noarp`. Hoje o
NetLab armazena **somente mapeamentos ARP aprendidos dinamicamente**, sem esses
estados ou comandos de criação estática. Não foi inventada uma distinção que
o motor não possui; se entradas estáticas forem introduzidas futuramente, a
operação central deverá passar a excluí-las da limpeza padrão.

## Motor e Inspector

`IpDevice.clearArpCache({ address?, ifaceName? })` remove os mapeamentos
correspondentes da `arpTable` existente e retorna a quantidade removida.
Sem filtro, remove todos. A interface de origem já pertence a cada entrada,
portanto o filtro `dev` não depende de adivinhar sub-redes ou rotas.

O método não gera pacotes, não avança tempo e não toca nas resoluções ARP
pendentes, filas de envio, timers, ICMP, Scheduler ou DHCP. Uma resolução que
já estava em andamento pode repopular o cache normalmente. Após a limpeza,
o próximo tráfego que precisar daquele vizinho usa a resolução ARP já
implementada, com Request/Reply reais observáveis no Packet Capture.

O botão **ARP-Cache leeren** é apresentado nas tabelas ARP existentes do
Inspector. O tooltip diz: **Löscht die dynamisch gelernten ARP-Einträge dieses
Geräts.** A ação do store valida o equipamento, chama o método do motor e
executa `refresh()` para atualizar a tabela imediatamente, inclusive pausada.
O componente de tabela recebe apenas o callback, sem importar o store.
Switches/APs sem `IpDevice` não recebem o botão.

A CLI chama o mesmo método. O callback de conclusão do terminal já existente
atualiza o Inspector. Como o snapshot de configuração não inclui ARP, limpar
o cache não altera o documento, não gera Undo/Redo e não agenda autosave.
Interfaces, Link UP, rotas, leases DHCP, tabelas MAC e caches de outros
equipamentos permanecem intactos. Edição de linha, Ctrl+A, Quick Ping e
Ping-Animation não foram alterados.

Save/Load, troca de planos e F5 continuam reconstruindo a rede sem caches
ARP de execução, conforme o contrato anterior. Nenhum campo foi acrescentado
ao documento ou ao schema do IndexedDB.

## Validação reproduzível

`src/engine/arpCache.test.ts` cobre aprendizado, remoção, filtros, argumentos
inválidos, cache vazio, múltiplas interfaces, independência de DHCP/MAC e
novas trocas ARP no Packet Capture. Os testes do store verificam atualização
pausada sem gravação ou alteração de histórico. As suítes do Inspector,
componentes de diagnóstico, comandos e edição de terminal cobrem regressões.

```sh
node scripts/test-arp-cache.mjs
```

O harness usa perfil Chromium e banco descartáveis, com boot explicitamente
isolado. Verifica Linux/Windows, CLI/Inspector, três interfaces do Router,
Packet Capture, simulação pausada, Save/Load, troca de planos e F5. As capturas
ficam em `.playwright-mcp/reviews/raw/arp-cache/`, nos temas Graphite Dark e
Classic Light, em 1440 e 700 px. Nenhum dado real do navegador é utilizado.

Em 27/10/2026, com Node 24: passaram **370 testes direcionados em 8 arquivos**,
depois a suíte relevante ampliada de **534 testes em 26 arquivos**. O Chromium
passou **109 verificações**, incluindo seis cenários desta alteração, sem erros
do navegador. TypeScript, build e `git diff --check` passaram. O build mantém
o aviso existente de chunk acima de 500 kB; nenhuma dependência foi adicionada.
