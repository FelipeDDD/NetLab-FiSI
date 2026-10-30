# Arquétipos educacionais — inventário confirmado no código

Auditoria: **30/10/2026**, base `a276ddb`. Este documento descreve o checkout; não publica exercícios nem altera geradores, respostas, corretores ou seeds. As alterações locais anteriores de feedback/foco da Rechenpraxis foram preservadas.

A proposta de expansão está em [Netzwerkdiagnose: arquétipos futuros](network-diagnosis-archetypes.md). Os identificadores ND daquele documento são apenas referências de planejamento.

## 1. O que está publicado e o que permanece interno

| Conjunto | Conteúdo confirmado | Disponibilidade |
|---|---|---|
| Rechenpraxis | Três adaptadores: A `subnet`, B `vlsm`, E02 `gateway` v1/v2 | Interface matemática, sem executar a simulação |
| Fábrica autoral | **32 drafts**: A01–A06, B01–B06, C01–C04, D01–D04, E01–E12 | Catálogo interno; não é uma lista de 32 exercícios publicados |
| Complementos da fábrica | Sete topologias E01/E05/E06/E07/E08/E09/E12, além das oito C/D | 15 redes de referência executáveis; os complementos E não aumentam os 32 registros |
| Übungen Beta | **Seis exercícios**: dois drafts anteriores + quatro pilotos E06/E08/E09/D02 | Projeções selecionadas, integradas aos planos |
| Drafts anteriores à fábrica | Cinco situações práticas | Duas publicadas no Beta; três continuam autorais |
| Labs existentes | **Cinco Labs**, separados do Beta e da Rechenpraxis | Fluxo legado de topologia, etapas, verificações e quizzes |

Fontes: [practice/model.ts](../src/exercises/practice/model.ts), [factory/catalog.ts](../src/exercises/factory/catalog.ts), [beta.ts](../src/exercises/beta.ts), [drafts.ts](../src/exercises/drafts.ts), [labs/library.ts](../src/labs/library.ts). A publicação dos quatro pilotos passa por [practicalPublication.ts](../src/exercises/practicalPublication.ts); o runtime importa as projeções JSON, não o catálogo autoral e suas soluções.

Documentação relacionada: [Rechenpraxis](calculation-practice.md), [variedade v1](practice-variety-audit.md), [E02 v2](practice-e02-v2.md), [fábrica](network-exercise-factory.md), [catálogo gerado](network-exercise-catalog.md), [drafts](exercise-drafts.md), [Beta](exercises-beta.md), [pilotos práticos](practical-exercises-beta.md), [Labs](LABS.md) e [autoria de Labs](LAB_AUTHORING.md). Trechos históricos sobre ausência de formulário ou publicação não substituem a disponibilidade confirmada acima. Não regeneramos o catálogo nesta auditoria.

## 2. Rechenpraxis A e B: respostas, condições e variedade

### Contrato matemático compartilhado

[math.ts](../src/exercises/factory/math.ts) implementa `subnet`, `capacity`, `vlsm`, `overlap`, `membership` e delega `cidr` ao modelo próprio. Trabalha com subnets IPv4 convencionais de broadcast, **/0 a /30**. A capacidade utilizável é `2^(32-prefixo) - 2`; /31 e /32 não são modalidades desse cálculo. Isso não proíbe rotas /32 no exercício D04.

| Família implementada | Dados e resposta | Validação/limite |
|---|---|---|
| `subnet` | IP + prefixo ou máscara → rede, broadcast, prefixo, máscara, primeiro/último host, total de endereços e hosts | Máscara contígua; rejeita entradas contraditórias. Na UI A, só rede, broadcast e hosts são campos de resposta |
| `capacity` | Demanda que já inclui infraestrutura → menor prefixo suficiente, máscara e capacidade resultante | Testa limites de capacidade; não é um adaptador publicado na Rechenpraxis |
| `membership` | Rede e candidatos → `host`, `network`, `broadcast`, `outside` | Pertencimento não equivale a usabilidade; IDs únicos. Interno |
| `overlap` | Redes → todos os pares sobrepostos `i:j`, índices iniciados em 1 | Igualdade e contenção contam; adjacência não. Interno |
| `vlsm` | Rede-pai, demandas, crescimento e reservas → uma rede CIDR por demanda | Alinhamento, contenção, capacidade mínima, ausência de sobreposição e proteção das reservas |

No VLSM, a demanda efetiva é `ceil(hosts × (100 + crescimento)/100)`. Uma demanda `future` ocupa um bloco próprio; não é o mesmo que aumentar o bloco de outra equipe. A referência aloca blocos maiores primeiro, com desempate estável e busca de intervalos alinhados. **O corretor aceita outras disposições válidas**, mas exige o menor bloco suficiente para cada demanda. Não compara apenas com os endereços da solução de referência.

### A — referências autorais existentes

As seis referências de [calculations.ts](../src/exercises/factory/calculations.ts) são exemplos fixos, não seis modos disponíveis no seletor A.

| ID autoral (sem prefixo de fábrica) | Arquétipo e condições | Resposta/raciocínio esperado |
|---|---|---|
| `a01-service-netz` | Subnet /26 | 64 endereços, 62 hosts; calcular os limites reais do bloco |
| `a02-werkstatt-hostbereich` | /27 e intervalo de hosts | Separar último host de broadcast, inclusive ao delimitar um pool |
| `a03-sensor-maske` | Máscara decimal correspondente a /28 | Converter máscara e calcular limites/capacidade |
| `a04-kassen-kapazitaet` | /29, seis dispositivos incluindo gateway | Seis hosts utilizáveis, sem espaço adicional |
| `a05-campus-oktett` | `172.19.7.211/22` | Rede `172.19.4.0`, broadcast `172.19.7.255`, 1022 hosts; atravessa o terceiro octeto |
| `a06-dmz-zugehoerigkeit` | `192.168.60.96/27`; finais 95, 96, 97, 126, 127, 128 | Fora, rede, host, host, broadcast, fora |

O gerador publicado em A varia IP e prefixo, mantendo os mesmos três campos. Faixas: Einstieg /26–/28, Mittel /25–/30, Fortgeschritten /19–/30. Não há dedução automática de conectividade a partir dessas respostas.

### B — referências autorais existentes

| ID autoral | Condições | Solução estrutural e alternativas |
|---|---|---|
| `b01-buero` | `10.50.10.0/24`; 100/50/20/10 hosts | /25, /26, /27, /28: 240 endereços; posições alternativas são aceitas |
| `b02-schule` | `10.51.0.0/22`; 200 + 25%, 100, 60, 25 e 100 futuros | /24, /25, /26, /27, /25; 608 endereços. Crescimento e futura ala separados |
| `b03-lager` | `10.52.7.0/24`; `.0/26` reservado; 58/26/12 hosts | /26, /27, /28 fora da instalação existente |
| `b04-filiale` | `10.53.9.0/26`; 22/10/5/2/2 hosts | /27 + /28 + /29 + /30 + /30 ocupam todo o /26; enunciado exclui a convenção /31 |
| `b05-atelier` | `10.54.12.0/24`; 70 + 50%, 28, 12 e 30 futuros | /25, /27, /28, /27: 208 endereços |
| `b06-fusion` | `10.55.4.0/24`; `.64/26` e `.192/27` reservados; 50/20/12 hosts | /26, /27 e /28 em lacunas alinhadas; quantidade total livre não basta para provar encaixe |

O **gerador B publicado** conserva quatro demandas: Büro, Technik, Lager e Reserve. Rede-pai /24, /23 ou /22 conforme dificuldade; crescimento de 10% apenas no Büro nos níveis Mittel/Fortgeschritten; reserva fixa /25 adicional no avançado. As faixas atuais mantêm os padrões mínimos /25–/26–/27–/28 no Einstieg e /24–/26–/27–/28 nos outros níveis. Há variedade numérica, mas não variedade equivalente em número de departamentos ou formato da solução. As seis referências autorais são mais variadas que esse gerador.

O adaptador corrige os campos separadamente, distingue ausência de resposta de erro e verifica também sobreposições entre respostas individuais válidas. Explicações de texto livre não são avaliadas.

## 3. E02: três contratos que não devem ser confundidos

| Contrato existente | Pergunta/resposta | Evidência e limites |
|---|---|---|
| E02 autoral da fábrica v1 | Diagnóstico completo de dois hosts, gateway e dados de rede | Exemplo /16; pertencimento e validade numérica calculáveis, conectividade indeterminada porque L2/caminho não foram informados |
| E02 Rechenpraxis v1 | “Liegt das Gateway im selben Subnetz wie der PC?” → Ja/Nein | Adaptador reduzido: pertencimento matemático. Broadcast local recebe Ja, com ressalva de não ser gateway utilizável. `Nicht eindeutig bestimmbar` é oferecido, mas não é solução das receitas completas desse modo |
| E02 Rechenpraxis v2, `membership` | “Liegt die Gateway-Adresse rechnerisch im Subnetz des PCs?” → Ja/Nein | Gateway local utilizável, rede, broadcast ou fora. Rede/broadcast pertencem, mas não são hosts convencionais |
| E02 Rechenpraxis v2, `connectivity` | “Ist das Gateway vom PC aus tatsächlich erreichbar?” → Ja/Nein/Nicht eindeutig bestimmbar | Gateway numericamente local e utilizável; resposta determinada pela observação explicitamente fornecida, não pelo aspecto do IP |

Fontes: [model.ts](../src/exercises/practice/model.ts), [gatewayV2.ts](../src/exercises/practice/gatewayV2.ts), [cidrDrafts.ts](../src/exercises/factory/cidrDrafts.ts).

O modo v2 é escolhido deterministicamente pela seed, não alternado obrigatoriamente a cada questão. Os nove tipos de evidência implementados são:

| Chave v2 | Fato apresentado | Resposta | Por quê |
|---|---|---|---|
| `echo` | Echo Reply atual do gateway recebido no PC | Ja | Existe comunicação observada; não prova todos os serviços |
| `tcp` | Estabelecimento TCP atual concluído | Ja | O handshake confirma troca; não demonstra disponibilidade de qualquer outra porta |
| `udp` | Serviço no gateway respondeu à consulta UDP atual | Ja | Há solicitação e resposta observadas |
| `power` | Gateway desligado e nenhum equipamento assume sua IP | Nein | O destino declarado não pode responder e a hipótese de substituto foi excluída |
| `disconnected` | Todas as interfaces do PC desconectadas, sem outro acesso | Nein | Todos os acessos do emissor foram explicitamente excluídos |
| `vlan` | VLANs separadas, sem bridging, routing ou outro caminho | Nein | A ausência de qualquer caminho está informada; não foi inferida só dos IDs de VLAN |
| `unspecified` | Estado das interfaces, L2 e tentativas não documentados | Nicht eindeutig bestimmbar | Compatibilidade de endereços não informa operação |
| `timeout` | Ping sem resposta; interfaces e filtros desconhecidos | Nicht eindeutig bestimmbar | Falta de Echo Reply não demonstra ausência de toda comunicação IP nem identifica a causa |
| `sameVlan` | Portas previstas para a mesma VLAN, estado real desconhecido | Nicht eindeutig bestimmbar | Planejamento de VLAN não é medição de conectividade |

Essas evidências são dados de um exercício matemático/textual; não são capturas ao vivo da engine. Não há ainda um catálogo publicado de diagnóstico geral para pares arbitrários, LEDs ou diagramas incompletos.

## 4. Demais E: inventário autoral e modelo de diagnóstico

Os 12 E estão em [cidrDrafts.ts](../src/exercises/factory/cidrDrafts.ts), versão de conteúdo 1. Salvo E11, usam o modelo restrito [cidr.ts](../src/exercises/factory/cidr.ts): IPv4 estático, interfaces UP, sem filtros de host, proxy ARP, NAT ou rotas adicionais. `routedPath: working` inclui encaminhamento, rotas remotas, retorno e filtros permissivos. Essas premissas fazem parte da tarefa; não podem ser presumidas nas novas questões de evidência incompleta.

| E | Arquétipo confirmado e condições decisivas | Resultado esperado | Complemento de simulação |
|---|---|---|---|
| E01 | Terceiros octetos diferentes: `192.168.10.50/23` e `192.168.11.60/23`, mesmo L2 | Mesmo subnet; troca possível sob as premissas declaradas | Interno |
| E02 | `192.168.99.60/16`, gateway `192.168.9.1`; L2/roteamento desconhecidos | Gateway local utilizável; conectividade indeterminada | Não |
| E03 | Cruzar limites reais /23, /22 e /20, mesmo L2, sem gateways/rotas | IPs em subnets distintos; cabo não substitui rota de ida/retorno | Não |
| E04 | Mesmo terceiro octeto, lados opostos de limites /25, /26 e /27, sem roteamento | Não pertencem ao mesmo subnet; troca bloqueada nas condições declaradas | Não |
| E05 | /23 compatível, VLAN 10/20 sem conexão/encaminhamento; reparar VLAN de B | Ampliar máscara não resolve separação L2 | Interno |
| E06 | `.10.50/16` e `.11.60/16`, mesmo L2, interfaces ativas | Configuração ampla funciona; não há reparo necessário | **Piloto publicado** |
| E07 | A `.10.50/23`, B `.11.60/24`, mesmo L2, sem gateway/rotas extras | A trata B como local; B trata A como remoto, sem retorno; corrigir B para /23 | Interno |
| E08 | Dois /24, router e retorno corretos, gateway do PC `.10.254` explicitamente sem equipamento; router `.10.1` | Next hop errado apesar de endereço numericamente utilizável | **Piloto publicado** |
| E09 | A `.10.50/16` deveria /24; B `.11.60/24` em outro segmento; router funcional, sem proxy ARP | A tenta ARP local para destino remoto; corrigir máscara | **Piloto publicado** |
| E10 | Quatro tickets: hosts locais válidos; host broadcast; L2 desconhecido; gateway inválido com troca local possível | Separar validade da configuração, decisão local e conectividade; gateway errado não bloqueia necessariamente tráfego local | Não |
| E11 | Escolher rede em `10.80.4.0/24`, ≥30 hosts, prefixos permitidos **/25 ou /26**, dois hosts distintos | Várias redes/endereços aceitos; não exige menor bloco. /27 não é permitido pela tarefa | Não |
| E12 | Empresa: Büro `10.60.0.0/22`, Lager `10.60.4.0/25`, Archiv `10.60.4.128/26`; router/retorno corretos | Corrigir máscara /16 do Büro e gateway do Lager `.4.126` para `.4.1`; preservar Archiv | Interno |

E03 usa pares `172.20.11.250/23`–`172.20.12.5/23`, `7.250/22`–`8.5/22` e `15.250/20`–`16.5/20` dentro de `172.20.*.*`. E04 usa `192.168.5.126/25`–`.129/25`, `.62/26`–`.65/26`, `.30/27`–`.33/27`. Nos E06–E09, os endereços abreviados da tabela são `192.168.*.*`.

### Respostas e limites de `cidr.ts`

O corretor compara respostas estruturadas: fatos de cada subnet, decisão local de A e B, gateway `absent/in-subnet/outside/unusable`, configuração `valid/invalid`, conectividade `possible/blocked/undetermined` e diagnóstico. Aceita equivalências explícitas de formato e alguns rótulos alemães, sem interpretar justificativa livre.

`possible` significa **possível sob as condições do modelo**, não “Echo Reply observado”. `configuration: valid` é validade numérica dentro do contrato, não certificado de funcionamento. `routerA/B` omitido significa router real não documentado; `gatewayA/B` omitido representa ausência de gateway configurado nesse modelo fechado. Esses significados diferentes não devem virar uma regra geral de “campo ausente = defeito”.

O gerador v1 tem seis cenários CIDR, distintos dos 12 exemplos fixos:

| `scenario` | Variação realmente implementada |
|---|---|
| `same-network` | Hosts com terceiro octeto diferente no mesmo /23, /22 ou /20, L2 comum conhecido |
| `boundary` | Hosts em lados opostos de uma fronteira, sem gateway |
| `gateway` | Gateway local utilizável, fora ou broadcast; L2/caminho desconhecidos |
| `mixed-masks` | Máscaras adjacentes p/p+1 produzem decisão local assimétrica, sem gateway |
| `healthy` | Rede local íntegra; nos níveis superiores também pode haver redes distintas com routers e caminho completos |
| `real-fault` | Separação VLAN, gateway externo ao subnet ou máscara excessiva que provoca ARP no segmento errado |

Fonte: [cidrGenerator.ts](../src/exercises/factory/cidrGenerator.ts). Esses cenários não geram LEDs, resultados de ping ou evidências parciais arbitrárias. E02 v2 é outro adaptador, não uma mudança silenciosa desse gerador.

## 5. C, D e exercícios executáveis

### C/D da fábrica: topologias fixas, não geradores por seed

Fontes: [practical.ts](../src/exercises/factory/practical.ts), [routing.ts](../src/exercises/factory/routing.ts), [networkTools.ts](../src/exercises/factory/networkTools.ts).

| ID | Condição e objetivo | Verificação e limite |
|---|---|---|
| C01 | Prefixo /24 viola o plano /26, embora os pings locais funcionem | Confere configuração e tráfego; ping isolado não prova atendimento ao plano |
| C02 | Dois clientes sem endereço em `10.61.2.160/28`, arquivo `.162` | Escolher hosts distintos/utilizáveis. Unicidade e endereços reservados também têm revisão manual |
| C03 | Cliente `172.26.8.100/27` no bloco errado; rede pretendida `.64/27` | Corrigir para o endereço/prefixo solicitado (`.80/27`), não contornar por rota |
| C04 | Dois hosts com `10.62.5.2/29`, arquivo `.1` | Corrigir duplicidade; limpar ARP não resolve atribuição duplicada. Há revisão manual de unicidade |
| D01 | Gateway errado `.30` explicitamente sem router; router `10.70.1.1/27`, arquivo `10.70.2.2/28` | Tarefa pede default route; checks de IP, rota e ping |
| D02 | Redes `10.72.1.0/26` e `10.72.2.0/27`, routers West/Ost no trânsito `10.72.254.0/30`, hosts com gateways | Instalar ida e retorno; rotas específicas ou defaults equivalentes válidas. **Piloto publicado** |
| D03 | Três segmentos `10.74.1.0/26`, `.2.0/27`, `.3.0/28`; políticas permissivas, forwarding explicitamente desligado | Ativar encaminhamento sem mudar endereços/políticas; testar pares nos dois sentidos |
| D04 | Default de retorno correta, mas rota /32 para `10.76.1.10` via next hop inexistente no trânsito /29 | Corrigir/remover rota mais específica; acrescentar /27 não vence /32. Conferir também o outro cliente `.11` |

Os complementos E executáveis estão em [cidrNetworks.ts](../src/exercises/factory/cidrNetworks.ts). E01/E06 começam saudáveis; os demais têm falhas intencionais. O corretor autoral genérico verifica configuração e sondagens, mas preservação completa de cabos/VLANs/configurações e justificativas ainda pode depender de critérios manuais.

### Cinco drafts anteriores e seis publicações Beta

| Draft anterior (`fisi-*`) | Arquétipo e evidência avaliada | Situação |
|---|---|---|
| `workshop-ipv4` | Dois postos no subnet /27 do arquivo; escolher hosts utilizáveis e únicos | Interno; parte da atribuição exige revisão manual |
| `office-warehouse-routing` | Endereçamento, forwarding e ida/retorno entre escritório e depósito | Publicado: **Büro und Lager: Hin- und Rückweg reparieren** |
| `guest-dhcp-client` | Cliente deve obter configuração do pool existente, incluindo gateway/DNS | Interno; DORA, lease e evidência do procedimento não são demonstrados só por conferir IP/rota |
| `service-portal` | DNS aponta para `.81` em vez de `.80`; serviço HTTP/8080 precisa funcionar | Publicado: **Serviceportal: DNS-Ziel und Webdienst entstören**; checks DNS e HTTP |
| `visitor-firewall` | Portal permitido, outros serviços expostos protegidos por firewall stateful | Interno; preservação dos serviços e histórico antes/depois também requerem revisão manual |

Os outros quatro publicados são `pilot-e06-v1`, `pilot-e08-v1`, `pilot-e09-v1` e `pilot-d02-v1`. Seus títulos e dados estão em [practicalStudents.json](../src/exercises/practicalStudents.json), e as regras em [practicalRules.json](../src/exercises/practicalRules.json).

[practicalChecker.ts](../src/exercises/practicalChecker.ts) acrescenta proteção estrutural e de configuração, lookup da rota efetiva e sondagens reais. Usa IDs estáveis: renomear um dispositivo não muda sua identidade. Ignora apresentação como nome/posição, mas rejeita alterações fora da política permitida em interfaces, cabos, VLANs etc. E08 pode aceitar rota específica equivalente; E09 exige corrigir a máscara, sem aceitar rota como desvio do objetivo. Não exigir o comando literal evita confundir procedimento com resultado.

Essas proteções adicionais pertencem aos quatro pilotos; não se deve atribuí-las automaticamente aos dois Beta anteriores ou a todos os drafts internos. A mensagem de conclusão dos pilotos fala em **“Technische Anforderungen erfüllt”** e mantém a justificativa diagnóstica como discussão manual.

O [controller](../src/exercises/exerciseController.ts) verifica identidade do draft, instância da rede, sequência de edição, assinatura e formulários pendentes antes de aceitar resultados. O progresso Beta se associa aos planos e é persistido localmente com controle de revisão. A Rechenpraxis, em contraste, mantém respostas/progresso corrente em memória; não possui esse contrato de progresso persistente.

### Cinco Labs existentes

| Lab | Arquétipos realmente presentes | O que a validação não prova sozinha |
|---|---|---|
| 1 — Static addressing & ARP | Endereçamento e ping em ambos os sentidos; observação de ARP proposta na atividade | Conteúdo/evolução do cache ARP e a explicação do aluno não são os critérios automáticos de conclusão |
| 2 — Routing between networks | IPs de router, defaults dos PCs e comunicação roteada | Uma sondagem não demonstra todos os destinos/serviços |
| 3 — Build a stateful firewall | Situação inicialmente aberta, default deny, saída permitida e retorno stateful | Alguns rótulos de acesso web correspondem a TCP/80, não a validação HTTP; timeout não identifica sozinho a regra causal |
| 4 — DHCP, DNS & the web | Cliente com endereço/default corretos, resolução DNS e HTTP | IP/rota compatíveis também podem ser configurados estaticamente; isso não prova DORA ou renovação de lease |
| 5 — Harden a vulnerable network | Exposição inicial, política de encaminhamento, web permitida, SSH/ICMP restringidos | Resultados negativos de sondagem precisam das demais evidências para atribuir a falha ao firewall |

Fonte de execução: [labs/checker.ts](../src/labs/checker.ts). Checks legados podem resolver dispositivos por nome; os novos exercícios selecionados usam IDs estáveis. Os quizzes e tarefas de observação complementam as sondagens, mas não equivalem a um gerador de diagnóstico por seed.

## 6. Seeds, versões e mecanismos de validação

| Camada | Reprodução e identidade |
|---|---|
| Fábrica `generate()` | Versão **1**, família, dificuldade, seed; cenário adicional para CIDR. Seed omitida: `netlab-default`; 1–256 caracteres. Hash determinístico e PRNG local, sem relógio |
| CIDR v1 | Namespace próprio inclui cenário; acrescentar CIDR não muda receitas A/B |
| Rechenpraxis `createQuestion()` | Default de API permanece v1, seed `reference`; em E02 v1 essa seed conserva o exemplo especial `192.168.99.60/16`, gateway `192.168.9.1` |
| E02 v2 | Namespace `practice\|E02\|2\|difficulty\|seed`, conteúdo/identidade v2. Criada pelo adaptador, não por `generate(version: 2)`, que continua inválido |
| UI | Seleciona E02 v2 por padrão; gera seeds curtas por `crypto`, mas aceita seeds manuais/antigas. Mesma receita mantém o mesmo problema |
| Próxima questão | [progression.ts](../src/exercises/practice/progression.ts) tenta até 32 seeds derivadas para evitar repetição imediata; não é deduplicação global nem currículo adaptativo |
| Referências A–E, drafts práticos e Labs | Conteúdo autoral fixo. Não atribuir a essas topologias um contrato de geração por seed inexistente |

Versão do conteúdo, versão do gerador e identidade da tentativa não são intercambiáveis. Expansões devem preservar receitas v1/v2 antigas; mudar o significado de uma seed existente não é uma forma segura de introduzir variedade.

### Verificações executadas nesta auditoria

Com Node **24.21.0**, sem alterar dados do navegador:

```text
node scripts/validate-network-factory.mjs
→ 32 drafts internos e 690 variantes geradas válidas

node node_modules/vitest/vitest.mjs run src/exercises/factory src/exercises/practice src/exercises/practicalChecker.test.ts src/exercises/drafts.test.ts src/labs/labs.test.ts
→ 10 arquivos; 952 testes aprovados
```

O primeiro comando foi executado sem `--catalog`: não regenerou documentação/projeções. Ele demonstra consistência com solver/validador, não uma prova independente da qualidade pedagógica.

| Testes existentes | Cobertura relevante confirmada |
|---|---|
| `factory/math.test.ts` — 212 | Oráculo BigInt, limites IPv4/capacidade, reservas, crescimento, planos alternativos, overlap e entradas inválidas |
| `factory/cidr.test.ts` — 559 | 540 receitas dos seis cenários/níveis, oráculos e casos autorais; faltas de evidência, assimetria, equivalências e planos alternativos |
| `factory/network.test.ts` — 46 | Oito redes C/D, estado inicial e solução, round-trip, IDs, alternativas de rota, retorno e precedência /32 |
| `factory/cidrNetworks.test.ts` — 31 | Sete complementos E, casos saudáveis, falhas e preservação das referências |
| `factory/catalog.test.ts` — 7 | Catálogo, validação estrutural e separação de publicação |
| `practice/practice.test.ts` — 13 | Adaptadores, respostas parciais, versões, progressão e reprodução |
| `practice/gatewayV2.test.ts` — 8 | Fingerprint de 27 receitas antigas; auditoria de 1000 seeds por dificuldade, evidências e oráculo BigInt de pertencimento |
| `practicalChecker.test.ts` — 16 | Pilotos, configuração protegida, bypass por edição da topologia, rota efetiva e retorno |
| `drafts.test.ts` — 44 | Cinco drafts anteriores, critérios, referências e limites de automação |
| `labs/labs.test.ts` — 16 | Labs existentes e seus checks de configuração/serviço |

Não foi necessária revisão Chromium, build nem suíte completa para esta alteração exclusivamente documental. Testes de sondagem não garantem que todo enunciado em linguagem natural seja inequívoco; a revisão de evidências continua necessária.

## 7. Lacunas e pontos de revisão — sem correções nesta etapa

| Local | Constatação | Revisão futura recomendada |
|---|---|---|
| Gerador B/UI A | Valores variados, estrutura repetitiva; famílias internas não estão todas disponíveis | Expandir tipos de tarefa de forma versionada, sem anunciar os 32 drafts como publicados |
| E02 v1 e v2 `membership` | Três botões, mas pertencimento com IP/máscara completos só produz Ja/Nein | Explicar essa diferença; não fabricar ambiguidade para balancear alternativas |
| E02 v2 | Evidências bem delimitadas, mas centradas no gateway; seleção de modo pseudoaleatória | Reutilizar a separação conceitual, sem prometer alternância estrita ou diagnóstico geral já implementado |
| `generator.ts`, instrução CIDR | “Fehlende Layer-2-/Routingangaben erlauben nur …” é abrangente demais | Falta de informação só impede conclusão quando é decisiva: host explicitamente inválido pode determinar bloqueio no modelo mesmo sem L2 documentado |
| `cidr.ts`, `explainCase()` | Razão `gateway` cita next hop externo ou diferente do router, mas a classificação também admite gateway configurado ausente | Explicação deveria apontar o fato realmente presente. Exemplo possível: ambos destinos remotos, A sem gateway e B com gateway local; motivo não é necessariamente endereço errado |
| `cidr.ts`, razão `unknown` | Enumera L2, routing, forwarding, filtros e retorno genericamente | Nomear apenas as informações ainda faltantes em cada questão; algumas já podem estar dadas |
| Modelo CIDR | `possible` sob premissas versus “nachgewiesene Erreichbarkeit” na instrução genérica | Tornar explícita a diferença entre previsão sob modelo e comunicação efetivamente observada |
| D01 / E08 / E11 / B | Objetivos diferentes: default específica, rota equivalente, prefixos permitidos, bloco mínimo | Não aplicar uma regra universal que rejeite uma solução válida ou aceite um desvio do objetivo |
| C02/C04 e complementos E | Parte de unicidade, limites de edição e explicação permanece manual | Antes de publicar mais pilotos, definir o que será comprovado automaticamente e o que ficará manual |
| Labs 3/5 | Rótulos web ou de filtragem podem ser mais fortes que uma sondagem TCP/negativa isolada | Distinguir serviço TCP, resposta HTTP e evidência causal; não concluir firewall só porque o ping falhou |
| Lab 4/draft DHCP | Endereço correto não comprova origem DHCP | Uma futura tarefa sobre DORA/lease precisa de evidência própria; não mudar os critérios antigos silenciosamente |
| Documentação histórica | Algumas afirmações de “sem UI”/“não publicado” precedem adaptadores e pilotos atuais | Consultar o mapa de disponibilidade desta auditoria; atualizar os trechos históricos numa revisão documental específica |

O próximo passo proposto é discutir o contrato de evidências e os oito arquétipos de [Netzwerkdiagnose](network-diagnosis-archetypes.md), antes de alterar qualquer gerador ou publicar conteúdo.
