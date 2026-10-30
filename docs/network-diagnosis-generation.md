# Netzwerkdiagnose — geração interna por seed, etapa 2

30/10/2026. Protótipo **interno e não publicado**, restrito a ND02 e ND05. Os oito [casos fixos da etapa 1](network-diagnosis-pilot.md) permanecem intactos e continuam sendo referências. Ver também [arquétipos](network-diagnosis-archetypes.md) e [inventário](educational-archetypes-audit.md).

## Contrato mínimo

[generator.ts](../src/exercises/diagnosis/generator.ts) expõe generateDiagnosis com versão 1, arquétipo ND02/ND05, dificuldade beginner/intermediate/advanced, seed e receita opcional. Retorna a receita resolvida, dados estruturados autorais e um caso com o mesmo formato de evidências/perguntas da etapa 1.

Sem receita explícita, a seed seleciona uma das receitas elegíveis para a dificuldade. A receita retornada pode ser reaplicada explicitamente para reproduzir o resultado integral. Não há geração de topologia, corretor novo, publicação, alteração de menus ou vínculo com dados salvos.

Namespaces próprios diagnosis-selection e diagnosis-generated separam este protótipo de E02 v1/v2. A identidade inclui versão, ID da receita, dificuldade e seed. Hash FNV-1a sobre unidades UTF-16 e PRNG local LCG determinístico; não utiliza relógio nem Math.random. Seeds de 1–256 caracteres, não compostas apenas de espaços; espaços nas extremidades de uma seed válida são preservados. Versões, famílias, dificuldades e combinações inválidas são rejeitadas.

A versão 1 é local ao novo gerador; não redefine a versão do piloto fixo ou da fábrica. Receitas antigas de E02 e seus fingerprints não são alterados. Mudanças futuras que afetem resultados precisam de versão nova e referências preservadas.

O código reutiliza os tipos do piloto por importação de tipo e os utilitários matemáticos puros facts/subnet da fábrica. Estes usam transitivamente as funções aritméticas de engine/ip.ts; nenhuma instância de rede, Scheduler, estado de simulação ou persistência é criada. A coleção fixa não é importada como conteúdo nem ampliada.

## Receitas explícitas

### ND02 — cálculos e significado da validade

Todas as receitas fazem duas perguntas distintas sobre o mesmo candidato: pertencimento matemático e adequação **numérica** como endereço de outro router local. O texto delimita que não comprova existência/operação desse router.

| Receita | Decisão que muda | Gabarito: pertencimento / gateway | Níveis |
|---|---|---|---|
| nd02-network | Candidato é o início do bloco, não um host | Ja / Nein | Todos |
| nd02-broadcast | Candidato é o fim do bloco, não o último host | Ja / Nein | Todos |
| nd02-host | Host estritamente dentro do bloco e diferente do PC | Ja / Ja | Todos |
| nd02-outside | Vizinho imediatamente anterior/posterior ao bloco | Nein / Nein | Mittel, Fortgeschritten |
| nd02-self | Endereço utilizável de host, mas é a própria IP do PC | Ja / Nein | Mittel, Fortgeschritten |
| nd02-zero-host | Endereço terminado em .0, interno a um bloco maior que /24 | Ja / Ja | Fortgeschritten |

Einstieg usa /24–/26: interpretar limites e separar pertencimento/usabilidade. Mittel usa /25–/30: blocos menores, limites adjacentes e identidade do next hop. Fortgeschritten usa /16, /20, /22, /23, /27 e /30, com interpretação da própria IP e fronteiras além do último octeto. zero-host usa apenas /20, /22 ou /23 e escolhe .0 estritamente interno; não é uma regra que todo .0 seja host válido.

Os endereços são privados, dentro de 10/8, com espaço para blocos adjacentes. No /30, os dois hosts são usados sem colidir. O protótipo respeita a convenção /0–/30, mas **não amostra todos esses prefixos**: não gera /0–/15, /17–/19, /21 nem /31-/32. Isso evita questões de endereços especiais e mantém o lote restrito a cálculos revisados. Não há API para forçar prefixo arbitrário.

As contas e classificações mudam entre receitas; dentro da mesma receita o raciocínio principal se repete. IPs diferentes não são contabilizados como novos arquétipos. As explicações apresentam máscara, limites, host range e a característica decisiva do candidato. ND02 não fabrica respostas indeterminadas para cálculos com todos os dados presentes.

### ND05 — observação, alcance e causa

| Receita | Evidência apresentada | Perguntas e resultados | Níveis |
|---|---|---|---|
| nd05-timeout | Teste encerrado sem Reply no processo | Recebeu algum Reply? Nein. Comunicação IP possível? Nicht eindeutig bestimmbar | Todos |
| nd05-partial | Alguns Replies correspondentes e alguns timeouts | Todos responderam? Nein. Houve possibilidade de troca? Ja | Mittel, Fortgeschritten |
| nd05-tcp | Ping sem Reply, mas HTTP/TCP respondeu no mesmo intervalo | Comunicação possível? Ja. Firewall causou os timeouts? Nicht eindeutig bestimmbar | Mittel, Fortgeschritten |
| nd05-gateway | Gateway responde; destino remoto não responde ao ping | Reply do gateway comprova intercâmbio com B? Nein. Comunicação com B possível? Nicht eindeutig bestimmbar | Mittel, Fortgeschritten |
| nd05-drop | Log confiável correlaciona todos os Requests a DROP antes de forwarding | F impediu esses Requests de chegar a B? Ja. Outra comunicação IP possível? Nicht eindeutig bestimmbar | Fortgeschritten |
| nd05-ingress | Replies correspondentes chegaram à entrada de A antes dos prazos, mas processo registra timeouts | Todos se perderam no trânsito antes de A? Nein. Filtro local causou os timeouts? Nicht eindeutig bestimmbar | Fortgeschritten |

Todos usam o mesmo contrato: medições confiáveis no mesmo intervalo, configuração constante, e o relatório apresentado é o conjunto completo de evidências disponível — não um inventário de todos os caminhos existentes. Esse escopo aparece também nas respostas determinadas. Não é necessário reconhecer palavras como “unbekannt” ou “nicht dokumentiert” para identificar o gabarito.

Einstieg concentra uma estrutura simples, distinguindo resultado de ICMP de comunicação IP geral. Mittel acrescenta contagens parciais, outro protocolo e identidade do endpoint. Fortgeschritten acrescenta correlação de pacotes e localização do ponto de medição; matemática de subnet não é o fator de dificuldade de ND05. Os níveis altos mantêm receitas básicas, portanto o nível permite complexidade maior sem prometer que toda seed será mais difícil.

As duas explicações hipotéticas de cada resposta aberta devem preservar o que já foi observado. HTTP bem-sucedido impede usar “B desligado” como alternativa. Replies medidos em A impedem explicar aqueles mesmos pacotes como perdidos antes de A. Log de DROP não prova que o bloqueio seja a única falha, nem que a remoção da regra vá reparar toda a comunicação.

## Validação e variedade

Os [testes](../src/exercises/diagnosis/generator.test.ts) calculam limites com BigInt, de forma independente da fábrica. Conferem gabaritos, papel do candidato, explicações, limites /30 e candidatos .0, reprodução e rejeição de receitas inválidas.

Para ND05, um conjunto **somente de teste** enumera 1.024 combinações de estado do destino, caminhos, responder ICMP, filtros, processo e serviço TCP. Os fatos observados selecionam estados compatíveis; uma resposta aberta exige estados favoráveis e desfavoráveis. Perda parcial também é conferida pelas contagens. Essa enumeração fornece testemunhos dentro de um modelo pequeno, não uma prova sobre todos os comportamentos possíveis de redes reais.

O modelo diferencia entrega à entrada da máquina de entrega ao processo, e ICMP de HTTP. Os textos e os exemplos hipotéticos recebem revisão editorial adicional: um teste de booleanos não interpreta automaticamente uma frase em alemão.

Comando de auditoria: node scripts/audit-diagnosis-generation.mjs. Por padrão, só escreve JSON em stdout. --check-review confere os 12 exemplos abaixo; --write-review regenera **apenas** o bloco demarcado deste documento. Não acessa navegador, dados pessoais ou projetos.

Amostra automática: seeds diagnosis-audit-0000 até diagnosis-audit-0199, para cada arquétipo/nível, **1.200 casos e 2.400 perguntas**. Todas as receitas elegíveis apareceram. Os gabaritos na tabela contam perguntas, não casos.

| Arquétipo / nível | Casos | Receitas estruturais | Dados visíveis distintos | Ja / Nein / indeterminada |
|---|---:|---:|---:|---|
| ND02 Einstieg | 200 | 3 | 200 | 271 / 129 / 0 |
| ND02 Mittel | 200 | 5 | 200 | 191 / 209 / 0 |
| ND02 Fortgeschritten | 200 | 6 | 200 | 231 / 169 / 0 |
| ND05 Einstieg | 200 | 1 | 200 | 0 / 200 / 200 |
| ND05 Mittel | 200 | 4 | 200 | 110 / 142 / 148 |
| ND05 Fortgeschritten | 200 | 6 | 200 | 104 / 127 / 169 |

Não houve repetição exata dentro de cada amostra de 200, mas as mesmas estruturas aparecem repetidamente. Em ND05 Einstieg, todos os casos repetem o mesmo contraste; novos endereços e contagens não resolvem essa limitação. Não há garantia de unicidade para seeds arbitrárias nem política de progressão/deduplicação nova.

Além da seleção automática, os testes percorrem 1.000 combinações com receita explícita e 400 casos dirigidos a /30 e host .0. O fingerprint integral dos 12 exemplos de revisão é 237863bd15b3e545f1622b4bd102ece0cc87b08485f8706da734a942d9492c1c, fixado em teste. Ele cobre conteúdo e metadados, não substitui a revisão de outras seeds.

Validação com Node 24.21.0:

- **917 testes aprovados em nove arquivos**, incluindo os 20 testes novos do gerador e os 21 do piloto fixo. Comando: node node_modules/vitest/vitest.mjs run src/exercises/diagnosis src/exercises/practice src/exercises/factory.
- Preservados o fingerprint das 27 receitas legadas e a auditoria E02 v2 de 3.000 seeds. A fonte dos oito casos fixos também tem fingerprint próprio.
- TypeScript (tsc --noEmit) e build Vite aprovados; permanece o aviso existente de chunk maior que 500 kB.
- --check-review confirmou correspondência exata dos 12 exemplos. Links, UTF-8, whitespace dos quatro arquivos novos e git diff --check aprovados.
- Oito arquivos locais anteriores, incluindo fonte/teste/documentação do piloto fixo, conservaram seus hashes SHA-256.
- Inspeção de produção confirmou ausência do piloto/gerador nos bundles. Nenhum teste acessou dados reais do navegador; nenhuma revisão Chromium foi necessária para este protótipo exclusivamente autoral.

## Revisão editorial e exclusões deliberadas

- nd02-zero-host aumenta a variedade conceitual: não classificar rede pelo último octeto. O recorte de prefixos garante que o candidato não seja uma fronteira real.
- nd05-partial pergunta “todos” e depois comunicação geral, evitando equiparar perda parcial a ausência de toda comunicação.
- nd05-tcp separa diagnóstico diferencial de evidência de causa: serviço funcionando não identifica automaticamente filtro de ICMP.
- nd05-drop requer correspondência de endpoints, identificador, sequências, momento e ação efetiva. Não gera alegações de causalidade a partir de uma regra de firewall isolada ou um contador genérico.
- nd05-ingress é mais técnico: pressupõe uma medição confiável antes do filtro local. O enunciado explicita o ponto; a explicação não chama entrada no dispositivo de entrega ao processo.
- A mesma receita conserva uma estrutura reconhecível. Não é objetivo disfarçar repetição com sinônimos ou ocultar premissas necessárias.
- Não implementados: inferir causa única por timeout, garantir reparo por remover regra, ausência global de comunicação por ping negativo, causalidade de rotas sem tabela completa, perda por ARP sem captura adequada, estados que mudam silenciosamente entre medições, pacotes de outros testes tratados como atuais, /31-/32 e endereçamento especial.
- Não há balanceamento artificial entre respostas. ND05 beginner possui uma receita; para variedade interpretativa, escolher Mittel/Fortgeschritten ou receita explícita.

## Doze exemplos completos para revisão humana

Seis ND02 e seis ND05, um de cada receita, escolhidos por cobertura estrutural e não por distribuição de gabaritos. Cada exemplo contém a receita reproduzível, todos os dados, perguntas, respostas e explicações. IDs e gabaritos são material autoral, não uma publicação.

<!-- generated-review:start -->

### Beispiel 01 — nd02-network

```json
{"version":1,"archetype":"ND02","difficulty":"beginner","seed":"diagnosis-review-01","recipe":"nd02-network"}
```

**Gateway-Vorschlag prüfen**

Prüfen Sie einen Eintrag im Adressplan, bevor er als Gateway übernommen wird.

- PC: 10.134.48.26/24; vorgeschlagene Gateway-Adresse: 10.134.48.0.
- Bewertet wird nur die numerische Eignung als Adresse eines anderen lokalen Routers im gewöhnlichen IPv4-Broadcast-Subnetz (/0–/30). Netz, Broadcast und die eigene PC-Adresse scheiden aus; spezielle On-Link-Routen sind nicht Teil der Aufgabe. Ein Routerbetrieb unter der vorgeschlagenen Adresse wurde nicht geprüft.

**membership: Gehört 10.134.48.0 rechnerisch zum Subnetz des PCs?**

Antwort: **Ja**.

Bezug: addresses.

/24 entspricht 255.255.255.0 und umfasst 256 Adressen. Der Block reicht von 10.134.48.0 bis 10.134.48.255; nutzbare Hosts liegen zwischen 10.134.48.1 und 10.134.48.254. 10.134.48.0 ist die Netzadresse. Sie gehört zum Block, ist hier aber keine Hostadresse. Die Zugehörigkeit bewertet keine Erreichbarkeit.

**gateway: Ist 10.134.48.0 hinsichtlich Subnetzgrenzen und eigener PC-Adresse als Gateway-Adresse eines anderen lokalen Routers geeignet?**

Antwort: **Nein**.

Bezug: addresses, scope.

/24 entspricht 255.255.255.0 und umfasst 256 Adressen. Der Block reicht von 10.134.48.0 bis 10.134.48.255; nutzbare Hosts liegen zwischen 10.134.48.1 und 10.134.48.254. 10.134.48.0 ist die Netzadresse. Sie gehört zum Block, ist hier aber keine Hostadresse. Daraus folgt keine Aussage über die Kommunikation des PCs mit anderen lokalen Hosts.

### Beispiel 02 — nd02-broadcast

```json
{"version":1,"archetype":"ND02","difficulty":"beginner","seed":"diagnosis-review-02","recipe":"nd02-broadcast"}
```

**Gateway-Vorschlag prüfen**

Prüfen Sie einen Eintrag im Adressplan, bevor er als Gateway übernommen wird.

- PC: 10.127.192.124/25; vorgeschlagene Gateway-Adresse: 10.127.192.127.
- Bewertet wird nur die numerische Eignung als Adresse eines anderen lokalen Routers im gewöhnlichen IPv4-Broadcast-Subnetz (/0–/30). Netz, Broadcast und die eigene PC-Adresse scheiden aus; spezielle On-Link-Routen sind nicht Teil der Aufgabe. Ein Routerbetrieb unter der vorgeschlagenen Adresse wurde nicht geprüft.

**membership: Gehört 10.127.192.127 rechnerisch zum Subnetz des PCs?**

Antwort: **Ja**.

Bezug: addresses.

/25 entspricht 255.255.255.128 und umfasst 128 Adressen. Der Block reicht von 10.127.192.0 bis 10.127.192.127; nutzbare Hosts liegen zwischen 10.127.192.1 und 10.127.192.126. 10.127.192.127 ist der Broadcast dieses Blocks. Er gehört mathematisch dazu, bezeichnet aber keinen einzelnen Gateway-Host. Die Zugehörigkeit bewertet keine Erreichbarkeit.

**gateway: Ist 10.127.192.127 hinsichtlich Subnetzgrenzen und eigener PC-Adresse als Gateway-Adresse eines anderen lokalen Routers geeignet?**

Antwort: **Nein**.

Bezug: addresses, scope.

/25 entspricht 255.255.255.128 und umfasst 128 Adressen. Der Block reicht von 10.127.192.0 bis 10.127.192.127; nutzbare Hosts liegen zwischen 10.127.192.1 und 10.127.192.126. 10.127.192.127 ist der Broadcast dieses Blocks. Er gehört mathematisch dazu, bezeichnet aber keinen einzelnen Gateway-Host. Daraus folgt keine Aussage über die Kommunikation des PCs mit anderen lokalen Hosts.

### Beispiel 03 — nd02-host

```json
{"version":1,"archetype":"ND02","difficulty":"intermediate","seed":"diagnosis-review-03","recipe":"nd02-host"}
```

**Gateway-Vorschlag prüfen**

Prüfen Sie einen Eintrag im Adressplan, bevor er als Gateway übernommen wird.

- PC: 10.82.54.249/25; vorgeschlagene Gateway-Adresse: 10.82.54.248.
- Bewertet wird nur die numerische Eignung als Adresse eines anderen lokalen Routers im gewöhnlichen IPv4-Broadcast-Subnetz (/0–/30). Netz, Broadcast und die eigene PC-Adresse scheiden aus; spezielle On-Link-Routen sind nicht Teil der Aufgabe. Ein Routerbetrieb unter der vorgeschlagenen Adresse wurde nicht geprüft.

**membership: Gehört 10.82.54.248 rechnerisch zum Subnetz des PCs?**

Antwort: **Ja**.

Bezug: addresses.

/25 entspricht 255.255.255.128 und umfasst 128 Adressen. Der Block reicht von 10.82.54.128 bis 10.82.54.255; nutzbare Hosts liegen zwischen 10.82.54.129 und 10.82.54.254. 10.82.54.248 liegt im Hostbereich und unterscheidet sich von der PC-Adresse 10.82.54.249. Die Zugehörigkeit bewertet keine Erreichbarkeit.

**gateway: Ist 10.82.54.248 hinsichtlich Subnetzgrenzen und eigener PC-Adresse als Gateway-Adresse eines anderen lokalen Routers geeignet?**

Antwort: **Ja**.

Bezug: addresses, scope.

/25 entspricht 255.255.255.128 und umfasst 128 Adressen. Der Block reicht von 10.82.54.128 bis 10.82.54.255; nutzbare Hosts liegen zwischen 10.82.54.129 und 10.82.54.254. 10.82.54.248 liegt im Hostbereich und unterscheidet sich von der PC-Adresse 10.82.54.249. Das ist eine numerische Eignung, kein Nachweis eines erreichbaren Routers.

### Beispiel 04 — nd02-outside

```json
{"version":1,"archetype":"ND02","difficulty":"intermediate","seed":"diagnosis-review-04","recipe":"nd02-outside"}
```

**Gateway-Vorschlag prüfen**

Prüfen Sie einen Eintrag im Adressplan, bevor er als Gateway übernommen wird.

- PC: 10.41.177.238/30; vorgeschlagene Gateway-Adresse: 10.41.177.235.
- Bewertet wird nur die numerische Eignung als Adresse eines anderen lokalen Routers im gewöhnlichen IPv4-Broadcast-Subnetz (/0–/30). Netz, Broadcast und die eigene PC-Adresse scheiden aus; spezielle On-Link-Routen sind nicht Teil der Aufgabe. Ein Routerbetrieb unter der vorgeschlagenen Adresse wurde nicht geprüft.

**membership: Gehört 10.41.177.235 rechnerisch zum Subnetz des PCs?**

Antwort: **Nein**.

Bezug: addresses.

/30 entspricht 255.255.255.252 und umfasst 4 Adressen. Der Block reicht von 10.41.177.236 bis 10.41.177.239; nutzbare Hosts liegen zwischen 10.41.177.237 und 10.41.177.238. 10.41.177.235 liegt jenseits einer Blockgrenze des PCs. Ein ähnlich aussehender Anfang ersetzt den Maskenvergleich nicht. Die Zugehörigkeit bewertet keine Erreichbarkeit.

**gateway: Ist 10.41.177.235 hinsichtlich Subnetzgrenzen und eigener PC-Adresse als Gateway-Adresse eines anderen lokalen Routers geeignet?**

Antwort: **Nein**.

Bezug: addresses, scope.

/30 entspricht 255.255.255.252 und umfasst 4 Adressen. Der Block reicht von 10.41.177.236 bis 10.41.177.239; nutzbare Hosts liegen zwischen 10.41.177.237 und 10.41.177.238. 10.41.177.235 liegt jenseits einer Blockgrenze des PCs. Ein ähnlich aussehender Anfang ersetzt den Maskenvergleich nicht. Daraus folgt keine Aussage über die Kommunikation des PCs mit anderen lokalen Hosts.

### Beispiel 05 — nd02-self

```json
{"version":1,"archetype":"ND02","difficulty":"advanced","seed":"diagnosis-review-05","recipe":"nd02-self"}
```

**Gateway-Vorschlag prüfen**

Prüfen Sie einen Eintrag im Adressplan, bevor er als Gateway übernommen wird.

- PC: 10.44.219.85/23; vorgeschlagene Gateway-Adresse: 10.44.219.85.
- Bewertet wird nur die numerische Eignung als Adresse eines anderen lokalen Routers im gewöhnlichen IPv4-Broadcast-Subnetz (/0–/30). Netz, Broadcast und die eigene PC-Adresse scheiden aus; spezielle On-Link-Routen sind nicht Teil der Aufgabe. Ein Routerbetrieb unter der vorgeschlagenen Adresse wurde nicht geprüft.

**membership: Gehört 10.44.219.85 rechnerisch zum Subnetz des PCs?**

Antwort: **Ja**.

Bezug: addresses.

/23 entspricht 255.255.254.0 und umfasst 512 Adressen. Der Block reicht von 10.44.218.0 bis 10.44.219.255; nutzbare Hosts liegen zwischen 10.44.218.1 und 10.44.219.254. 10.44.219.85 ist die eigene PC-Adresse. Obwohl sie ein nutzbarer Host im Block ist, ist sie keine Adresse eines anderen lokalen Routers. Die Zugehörigkeit bewertet keine Erreichbarkeit.

**gateway: Ist 10.44.219.85 hinsichtlich Subnetzgrenzen und eigener PC-Adresse als Gateway-Adresse eines anderen lokalen Routers geeignet?**

Antwort: **Nein**.

Bezug: addresses, scope.

/23 entspricht 255.255.254.0 und umfasst 512 Adressen. Der Block reicht von 10.44.218.0 bis 10.44.219.255; nutzbare Hosts liegen zwischen 10.44.218.1 und 10.44.219.254. 10.44.219.85 ist die eigene PC-Adresse. Obwohl sie ein nutzbarer Host im Block ist, ist sie keine Adresse eines anderen lokalen Routers. Daraus folgt keine Aussage über die Kommunikation des PCs mit anderen lokalen Hosts.

### Beispiel 06 — nd02-zero-host

```json
{"version":1,"archetype":"ND02","difficulty":"advanced","seed":"diagnosis-review-06","recipe":"nd02-zero-host"}
```

**Gateway-Vorschlag prüfen**

Prüfen Sie einen Eintrag im Adressplan, bevor er als Gateway übernommen wird.

- PC: 10.86.114.29/20; vorgeschlagene Gateway-Adresse: 10.86.122.0.
- Bewertet wird nur die numerische Eignung als Adresse eines anderen lokalen Routers im gewöhnlichen IPv4-Broadcast-Subnetz (/0–/30). Netz, Broadcast und die eigene PC-Adresse scheiden aus; spezielle On-Link-Routen sind nicht Teil der Aufgabe. Ein Routerbetrieb unter der vorgeschlagenen Adresse wurde nicht geprüft.

**membership: Gehört 10.86.122.0 rechnerisch zum Subnetz des PCs?**

Antwort: **Ja**.

Bezug: addresses.

/20 entspricht 255.255.240.0 und umfasst 4096 Adressen. Der Block reicht von 10.86.112.0 bis 10.86.127.255; nutzbare Hosts liegen zwischen 10.86.112.1 und 10.86.127.254. 10.86.122.0 endet zwar auf .0, liegt bei /20 aber innerhalb des Hostbereichs. Das letzte Oktett allein entscheidet nicht über eine Netzadresse. Die Zugehörigkeit bewertet keine Erreichbarkeit.

**gateway: Ist 10.86.122.0 hinsichtlich Subnetzgrenzen und eigener PC-Adresse als Gateway-Adresse eines anderen lokalen Routers geeignet?**

Antwort: **Ja**.

Bezug: addresses, scope.

/20 entspricht 255.255.240.0 und umfasst 4096 Adressen. Der Block reicht von 10.86.112.0 bis 10.86.127.255; nutzbare Hosts liegen zwischen 10.86.112.1 und 10.86.127.254. 10.86.122.0 endet zwar auf .0, liegt bei /20 aber innerhalb des Hostbereichs. Das letzte Oktett allein entscheidet nicht über eine Netzadresse. Das ist eine numerische Eignung, kein Nachweis eines erreichbaren Routers.

### Beispiel 07 — nd05-timeout

```json
{"version":1,"archetype":"ND05","difficulty":"beginner","seed":"diagnosis-review-07","recipe":"nd05-timeout"}
```

**Ping-Befund einordnen**

Bewerten Sie den vorliegenden Messbericht. Unterscheiden Sie Testergebnis, Kommunikation und Fehlerursache.

- A: 10.142.15.116/24; B: 10.142.16.76/24; Gateway von A: 10.142.15.1.
- Alle Angaben gehören zum selben kurzen Messintervall bei unveränderter Konfiguration. Beobachtete Antworten sind vertrauenswürdig ihrem Ziel und Test zugeordnet. Die folgenden Messungen bilden den gesamten vorliegenden Befund; zusätzliche Tests oder Konfigurationsdaten werden nicht vorausgesetzt.
- Abgeschlossener Ping A → B, Kennung 5780, Sequenzen 1–3. Gesendet: 3 Echo Requests; im Ping-Prozess empfangene zugeordnete Echo Replies: 0; Timeouts: 3.

**received: Hat der Ping-Prozess auf A in diesem Test mindestens einen Echo Reply von B empfangen?**

Antwort: **Nein**.

Bezug: test.

Von 3 Requests wurde kein Reply an den Ping-Prozess geliefert. Das beantwortet diese Beobachtungsfrage mit Nein, bestimmt aber weder den Verlustort noch die Verfügbarkeit anderer IP-Dienste.

**communication: Ist im beschriebenen Messintervall grundsätzlich IP-Kommunikation zwischen A und B möglich?**

Antwort: **Nicht eindeutig bestimmbar**.

Bezug: test, scope.

Die 3 Timeouts betreffen ICMP Echo. Ein Ergebnis für TCP oder UDP und eine Ursache sind daraus nicht ableitbar.

- Hypothetisches Beispiel: B (10.142.16.76) beantwortet HTTP-Anfragen von A, während ein Filter nur Echo Requests verwirft. IP-Kommunikation funktioniert trotz aller Ping-Timeouts.
- Hypothetisches Beispiel: B (10.142.16.76) ist ausgeschaltet, und seine IP wird von keinem anderen Gerät übernommen. Auch andere IP-Kommunikation mit B funktioniert dann nicht; derselbe Ping-Befund entsteht.

### Beispiel 08 — nd05-partial

```json
{"version":1,"archetype":"ND05","difficulty":"intermediate","seed":"diagnosis-review-08","recipe":"nd05-partial"}
```

**Ping-Befund einordnen**

Bewerten Sie den vorliegenden Messbericht. Unterscheiden Sie Testergebnis, Kommunikation und Fehlerursache.

- A: 10.132.85.163/24; B: 10.132.86.32/24; Gateway von A: 10.132.85.1.
- Alle Angaben gehören zum selben kurzen Messintervall bei unveränderter Konfiguration. Beobachtete Antworten sind vertrauenswürdig ihrem Ziel und Test zugeordnet. Die folgenden Messungen bilden den gesamten vorliegenden Befund; zusätzliche Tests oder Konfigurationsdaten werden nicht vorausgesetzt.
- Abgeschlossener Ping A → B, Kennung 6246, Sequenzen 1–3. Gesendet: 3 Echo Requests; im Ping-Prozess empfangene zugeordnete Echo Replies: 2; Timeouts: 1.

**complete: Wurde in diesem Test jeder Echo Request mit einem beim Ping-Prozess empfangenen Reply beantwortet?**

Antwort: **Nein**.

Bezug: test.

Der Ping-Prozess hat Antworten auf 2 von 3 Requests empfangen. Die übrigen Anfragen liefen in einen Timeout. Vollständiger Erfolg und wenigstens ein erfolgreicher Austausch sind verschiedene Aussagen.

**communication: Ist im beschriebenen Messintervall grundsätzlich IP-Kommunikation zwischen A und B möglich?**

Antwort: **Ja**.

Bezug: test, scope.

Mindestens ein zugeordneter Reply von 10.132.86.32 ist angekommen (insgesamt: 2). Das belegt Austausch in beide Richtungen im Messintervall. Die weiteren Timeouts widerlegen diese Beobachtung nicht. Sie lassen weder die Verlustursache noch dauerhafte Zuverlässigkeit erkennen.

### Beispiel 09 — nd05-tcp

```json
{"version":1,"archetype":"ND05","difficulty":"intermediate","seed":"diagnosis-review-09","recipe":"nd05-tcp"}
```

**Ping-Befund einordnen**

Bewerten Sie den vorliegenden Messbericht. Unterscheiden Sie Testergebnis, Kommunikation und Fehlerursache.

- A: 10.109.63.66/24; B: 10.109.64.44/24; Gateway von A: 10.109.63.1.
- Alle Angaben gehören zum selben kurzen Messintervall bei unveränderter Konfiguration. Beobachtete Antworten sind vertrauenswürdig ihrem Ziel und Test zugeordnet. Die folgenden Messungen bilden den gesamten vorliegenden Befund; zusätzliche Tests oder Konfigurationsdaten werden nicht vorausgesetzt.
- Abgeschlossener Ping A → B, Kennung 28654, Sequenzen 1–3. Gesendet: 3 Echo Requests; im Ping-Prozess empfangene zugeordnete Echo Replies: 0; Timeouts: 3.
- Im selben Intervall empfängt A eine gültige HTTP-Antwort von B (10.109.64.44) auf eine Anfrage über TCP-Port 8080.

**communication: Ist im beschriebenen Messintervall grundsätzlich IP-Kommunikation zwischen A und B möglich?**

Antwort: **Ja**.

Bezug: test, extra, scope.

Die HTTP-Antwort von 10.109.64.44:8080 setzt einen TCP/IP-Austausch voraus. Die Ping-Timeouts schließen also nicht jede IP-Kommunikation aus; sie betreffen einen anderen Test.

**cause: Ist eine Firewall die Ursache der Ping-Timeouts zu B?**

Antwort: **Nicht eindeutig bestimmbar**.

Bezug: test, extra, scope.

HTTP funktioniert, ICMP Echo liefert keinen Reply. Damit ist eine protokollspezifische Ursache vereinbar, aber noch keine Firewall als Ursache bewiesen.

- Hypothetisches Beispiel: Eine Firewall verwirft ausschließlich Echo Requests an 10.109.64.44 und lässt TCP-Port 8080 zu. B würde Echo sonst beantworten; der Filter verursacht die Timeouts.
- Hypothetisches Beispiel: Alle Filter lassen ICMP durch, aber der ICMP-Responder auf B ist deaktiviert. Der Webdienst läuft weiter. Die Timeouts entstehen ohne Firewall als Ursache.

### Beispiel 10 — nd05-gateway

```json
{"version":1,"archetype":"ND05","difficulty":"intermediate","seed":"diagnosis-review-10","recipe":"nd05-gateway"}
```

**Ping-Befund einordnen**

Bewerten Sie den vorliegenden Messbericht. Unterscheiden Sie Testergebnis, Kommunikation und Fehlerursache.

- A: 10.91.58.149/24; B: 10.91.59.55/24; Gateway von A: 10.91.58.1.
- Alle Angaben gehören zum selben kurzen Messintervall bei unveränderter Konfiguration. Beobachtete Antworten sind vertrauenswürdig ihrem Ziel und Test zugeordnet. Die folgenden Messungen bilden den gesamten vorliegenden Befund; zusätzliche Tests oder Konfigurationsdaten werden nicht vorausgesetzt.
- Abgeschlossener Ping A → B, Kennung 7762, Sequenzen 1–5. Gesendet: 5 Echo Requests; im Ping-Prozess empfangene zugeordnete Echo Replies: 0; Timeouts: 5.
- Ein separater Ping von A an 10.91.58.1 liefert im selben Intervall einen passend zugeordneten Echo Reply vom Gateway.

**target-proof: Belegt die Antwort von 10.91.58.1 einen beobachteten ICMP-Austausch zwischen A und B (10.91.59.55)?**

Antwort: **Nein**.

Bezug: addresses, extra.

Die Antwort stammt von 10.91.58.1, nicht von 10.91.59.55. Sie belegt nur den getesteten Austausch mit dem Gateway, nicht Weiterleitung oder Rückweg zum Ziel B.

**communication: Ist im beschriebenen Messintervall grundsätzlich IP-Kommunikation zwischen A und B möglich?**

Antwort: **Nicht eindeutig bestimmbar**.

Bezug: test, extra, scope.

Ein antwortendes Gateway klärt einen ersten Abschnitt. Es entscheidet nicht, ob das entfernte Ziel B kommunizieren kann oder weshalb der Ping zu B scheitert.

- Hypothetisches Beispiel: Der Router vermittelt zu B (10.91.59.55), dessen Webdienst A antwortet; nur ICMP Echo zu B wird gefiltert. Gateway-Reply und Ziel-Timeouts passen zu funktionierender anderer Kommunikation.
- Hypothetisches Beispiel: Das Gateway antwortet weiterhin lokal, aber B (10.91.59.55) ist ausgeschaltet, ohne Ersatz unter seiner IP. Austausch mit B funktioniert nicht. Beide Ping-Befunde bleiben gleich.

### Beispiel 11 — nd05-drop

```json
{"version":1,"archetype":"ND05","difficulty":"advanced","seed":"diagnosis-review-11","recipe":"nd05-drop"}
```

**Ping-Befund einordnen**

Bewerten Sie den vorliegenden Messbericht. Unterscheiden Sie Testergebnis, Kommunikation und Fehlerursache.

- A: 10.48.94.181/24; B: 10.48.95.38/24; Gateway von A: 10.48.94.1.
- Alle Angaben gehören zum selben kurzen Messintervall bei unveränderter Konfiguration. Beobachtete Antworten sind vertrauenswürdig ihrem Ziel und Test zugeordnet. Die folgenden Messungen bilden den gesamten vorliegenden Befund; zusätzliche Tests oder Konfigurationsdaten werden nicht vorausgesetzt.
- Abgeschlossener Ping A → B, Kennung 12243, Sequenzen 1–5. Gesendet: 5 Echo Requests; im Ping-Prozess empfangene zugeordnete Echo Replies: 0; Timeouts: 5.
- Am durchlaufenen Firewall-Gerät F werden alle Requests dieses Tests erfasst: Quelle 10.48.94.181, Ziel 10.48.95.38, ICMP Echo Request, Kennung 12243, Sequenzen 1–5. Das vertrauenswürdige Paketprotokoll ordnet jedem dieser Requests die Aktion DROP vor der Weiterleitung zu; diese verworfenen Pakete werden von F nicht ausgegeben.

**cause: Hat die Filterung an F verhindert, dass diese Echo Requests B erreichen?**

Antwort: **Ja**.

Bezug: test, extra.

Quelle, Ziel, Kennung und sämtliche Sequenzen stimmen mit dem Ping-Test überein. Die Requests wurden an F vor der Weiterleitung verworfen. Das ist ein belegtes Hindernis für diese Pakete, kein Beweis, dass es die einzige Störung der Verbindung ist.

**communication: Ist im beschriebenen Messintervall grundsätzlich IP-Kommunikation zwischen A und B möglich?**

Antwort: **Nicht eindeutig bestimmbar**.

Bezug: test, extra, scope.

Die korrelierten DROP-Einträge erklären, warum diese Echo Requests F nicht verlassen. Sie messen weder andere Protokolle noch den Zustand von B hinter F.

- Hypothetisches Beispiel: F sperrt nur Echo Requests, erlaubt aber HTTP. B (10.48.95.38) läuft und beantwortet A über TCP. Andere IP-Kommunikation ist möglich, obwohl genau diese Requests verworfen wurden.
- Hypothetisches Beispiel: F verwirft dieselben Requests, und zusätzlich ist B (10.48.95.38) ausgeschaltet, ohne IP-Ersatz. Keine Kommunikation mit B funktioniert. Das DROP-Protokoll bleibt trotzdem genau gleich.

### Beispiel 12 — nd05-ingress

```json
{"version":1,"archetype":"ND05","difficulty":"advanced","seed":"diagnosis-review-12","recipe":"nd05-ingress"}
```

**Ping-Befund einordnen**

Bewerten Sie den vorliegenden Messbericht. Unterscheiden Sie Testergebnis, Kommunikation und Fehlerursache.

- A: 10.127.2.25/24; B: 10.127.3.122/24; Gateway von A: 10.127.2.1.
- Alle Angaben gehören zum selben kurzen Messintervall bei unveränderter Konfiguration. Beobachtete Antworten sind vertrauenswürdig ihrem Ziel und Test zugeordnet. Die folgenden Messungen bilden den gesamten vorliegenden Befund; zusätzliche Tests oder Konfigurationsdaten werden nicht vorausgesetzt.
- Abgeschlossener Ping A → B, Kennung 16899, Sequenzen 1–5. Gesendet: 5 Echo Requests; im Ping-Prozess empfangene zugeordnete Echo Replies: 0; Timeouts: 5.
- Eine unabhängige, vollständige Eingangsmessung auf A vor lokalen Filtern erfasst 5 Echo Replies von B (10.127.3.122) an A (10.127.2.25), Kennung 16899, Sequenzen 1–5, jeweils mit passender Nutzlast vor Ablauf des zugehörigen Timeouts.

**transit-loss: Sind alle Echo Replies dieses Tests bereits im Transitnetz vor dem Netzwerkeingang von A verloren gegangen?**

Antwort: **Nein**.

Bezug: test, extra.

Alle 5 Replies haben den gemessenen Eingang von A rechtzeitig erreicht. Die Timeouts im Ping-Prozess sind damit kein Nachweis ihres Verlusts im Transitnetz. Eingang am Gerät und Empfang im Prozess sind verschiedene Messpunkte.

**cause: Ist ein lokaler Eingangsfilter auf A die Ursache der Timeouts?**

Antwort: **Nicht eindeutig bestimmbar**.

Bezug: test, extra, scope.

Die Replies liegen vor dem lokalen Filter rechtzeitig an, erreichen laut Testergebnis aber nicht den Ping-Prozess. Dieser Unterschied grenzt den Bereich ein, isoliert jedoch noch keine konkrete lokale Ursache.

- Hypothetisches Beispiel: Ein lokaler ICMP-Eingangsfilter auf A verwirft die gemessenen Replies nach dem Messpunkt. Ohne diesen Filter würden sie den funktionsfähigen Ping-Prozess erreichen.
- Hypothetisches Beispiel: Der lokale Filter lässt die Replies passieren, aber der Ping-Prozess verarbeitet sie wegen eines lokalen Softwarefehlers nicht korrekt und meldet Timeouts. Die Ursache liegt dann im Prozess, nicht im Filter.

<!-- generated-review:end -->

## Próxima decisão

Revisar primeiro os doze exemplos e a extensão pretendida dos níveis. Só depois considerar outras receitas, prefixos ou integração na Rechenpraxis. O conjunto finito atual e os oito casos fixos são referências a preservar, não um catálogo ilimitado.
