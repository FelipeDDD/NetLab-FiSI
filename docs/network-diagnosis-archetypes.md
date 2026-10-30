# Netzwerkdiagnose — proposta de arquétipos e organização futura

Proposta de **30/10/2026**, baseada no [inventário confirmado no código](educational-archetypes-audit.md). **Nada deste catálogo ND está publicado ou implementado por esta alteração.** Alguns mecanismos já existem em E02 v2 e nos exercícios E/D; a tabela abaixo identifica essa sobreposição. ND01–ND08 são rótulos de discussão, não novos IDs de exercícios ou versões de gerador.

## 1. Contrato pedagógico proposto

Cada pergunta deve dizer exatamente qual afirmação está sendo avaliada. Não trocar silenciosamente entre:

1. **Rechnerische Subnetzzugehörigkeit:** aplicar máscara/limites aos endereços. Com IP e máscara completos, não depende de cabos, VLAN ou firewall.
2. **Nutzbarkeit als Host/Gateway:** excluir rede/broadcast na convenção de subnet usada, endereço do próprio cliente e outros conflitos explicitamente documentados. Uma IP local utilizável não demonstra que exista um router respondendo nela.
3. **Tatsächliche Kommunikation:** identificar endpoints, protocolo/serviço, direção e momento observado. Configuração compatível não substitui observação; ausência de uma observação não é automaticamente falha.

Para os exemplos de endereçamento abaixo, declarar **subnets IPv4 convencionais de broadcast /0–/30**, como nos exercícios atuais. Não generalizar a exclusão de rede/broadcast para /31 ponto a ponto nem discutir /32 como se tivesse o mesmo contrato. Não há proposta de ampliar essas capacidades nesta etapa.

### Como interpretar as três respostas

| Pergunta | Ja | Nein | Nicht eindeutig bestimmbar |
|---|---|---|---|
| Pertencimento/validade numérica | Os dados satisfazem o cálculo/regra | Os dados contradizem o cálculo/regra | Somente se falta dado necessário, como o prefixo; não nas receitas matemáticas completas |
| Possibilidade de troca nas condições declaradas | Todas as condições necessárias foram explicitamente estabelecidas no modelo delimitado | Um impedimento suficiente foi documentado dentro desse escopo | Os mesmos fatos admitem tanto sucesso como falha |
| Comunicação observada | Existe evidência adequada de solicitação/resposta no momento e escopo perguntados | O teste completo informa que a resposta não foi recebida, quando a pergunta é **sobre aquele teste** | Não foi fornecida uma observação que permita responder sobre o evento |
| Causa de uma falha | Evidência demonstra a causa perguntada | Evidência contradiz essa causa | Timeout ou informação parcial não isolam a causa |

“Não se comprovou comunicação” e “comprovou-se impossibilidade de comunicação” são afirmações diferentes. As variantes abaixo explicitam quando a pergunta muda. Não é requisito oferecer as três respostas corretas possíveis em todo arquétipo.

Evitar perguntas metalinguísticas como “Lässt sich das anhand dieser Angaben entscheiden?” quando o gabarito pretendido é `Nicht eindeutig bestimmbar`: a resposta literal a essa pergunta seria **Nein**. Preferir perguntar diretamente se a comunicação é possível. Quando a pergunta for sobre o poder de uma prova, manter essa diferença explícita, como em ND06.

As explicações futuras devem seguir quatro passos simples: **fato fornecido → regra aplicável → conclusão no escopo → informação que ainda falta**. Não listar firewall desligado, cabo rompido ou rota ausente como fatos se forem apenas hipóteses.

## 2. Tabela dos oito arquétipos propostos

| Rótulo / nome alemão | O que distingue | Base já existente | Lacuna para a proposta |
|---|---|---|---|
| ND01 — Subnetz ist kein Verbindungsnachweis | Pertencimento versus operação | E02 v1/v2, E01/E10 internos | Perguntas pareadas explícitas para dois endpoints, sem herdar premissas de engine |
| ND02 — Netzadresse, Broadcast oder Gateway? | Pertencimento versus host/gateway utilizável | A06 interno, E02 v2 `membership` e classificação CIDR | Pergunta direta de validade do gateway, separada de existência/funcionamento |
| ND03 — VLAN-Grenzen und unbekanntes Routing | Separação L2 versus possibilidade de caminho L3 | E05 interno; v2 `vlan` com ausência total de caminho | Variante VLAN diferente com roteamento realmente desconhecido |
| ND04 — Kein direkter Switchpfad | Diagrama parcial versus ausência de todo caminho | Redes roteadas D/E como referências | Evidência de topologia incompleta; não há gerador atual desse arquétipo |
| ND05 — Ping ohne Antwort | Falha de uma sondagem versus causa/alcance geral | E02 v2 `timeout` | Expandir endpoints e explicitar perguntas sobre teste, comunicação geral e causa |
| ND06 — Was beweist ein Echo Reply? | Evidência positiva com limite temporal e de serviço | E02 v2 `echo`, `tcp`, `udp`; probes da engine | Contrastar prova do intercâmbio observado com afirmações indevidas sobre DNS/web/futuro |
| ND07 — Link-LED ist kein IP-Test | Camada física versus comunicação IP | `sameVlan` v2 ensina distinção semelhante | Evidência de LED ainda não modelada nos geradores |
| ND08 — Hinweg, Rückweg und längstes Präfix | Rotas conhecidas, tabelas incompletas e retorno | D02/D04, E07/E09 e piloto D02 | Perguntas textuais sobre suficiência de evidência; não confundir tabela parcial com ausência de rota |

## 3. Definições, exemplos e respostas

### ND01 — Subnetz ist kein Verbindungsnachweis

**Definição:** calcular a relação numérica entre duas IPs e, separadamente, avaliar o que isso permite concluir sobre comunicação. Não presumir estado operacional a partir do cálculo.

**Dados e perguntas em alemão:**

> A ist mit 192.168.10.50/23 konfiguriert, B mit 192.168.11.60/23. Zu Verkabelung, VLANs, Interface-Status und Kommunikationsversuchen liegen keine Angaben vor.
>
> 1. Gehören beide Adressen rechnerisch zum selben Subnetz?
> 2. Können A und B jetzt tatsächlich IP-Daten miteinander austauschen?

**Respostas:** 1. **Ja**; 2. **Nicht eindeutig bestimmbar**.

**Explicação proposta:**

> Die Maske /23 entspricht 255.255.254.0. Beide Adressen liegen zwischen 192.168.10.0 und 192.168.11.255 und sind nutzbare Hostadressen. Damit ist die rechnerische Zugehörigkeit geklärt. Ob ein betriebsbereiter Übertragungsweg besteht, geht aus den Angaben jedoch nicht hervor. Es wurde weder ein funktionierender Austausch noch ein Hindernis nachgewiesen.

**Variantes legítimas:** B `192.168.12.60/23` torna a resposta de pertencimento **Nein**, mas não prova falta de comunicação via router. Uma resposta atual de B recebida em A pode provar a troca específica; ausência de toda interface de rede de A, explicitamente confirmada e sem outro acesso, pode provar impossibilidade naquele estado. Não adicionar essas evidências implicitamente.

**Critério futuro:** calcular os dois limites independentemente; manter a pergunta de pertencimento separada da pergunta de operação, inclusive na explicação e no feedback por campo.

### ND02 — Netzadresse, Broadcast oder Gateway?

**Definição:** uma IP pode pertencer ao intervalo matemático sem ser endereço convencional de host. Mesmo um endereço utilizável não comprova um router em operação.

**Exemplo em alemão:**

> Ein PC verwendet 192.168.50.70/26. Im gewöhnlichen IPv4-Broadcast-Subnetz soll 192.168.50.64 als Gateway eingetragen werden.
>
> 1. Liegt die vorgeschlagene Adresse rechnerisch im Subnetz des PCs?
> 2. Ist sie dort eine nutzbare Gateway-Hostadresse?

**Respostas:** 1. **Ja**; 2. **Nein**.

**Explicação proposta:**

> /26 bildet Blöcke mit 64 Adressen. Der PC liegt im Block 192.168.50.64–192.168.50.127. .64 ist die Netzadresse und .127 der Broadcast; beide gehören rechnerisch zum Block, sind hier aber keine Hostadressen. Als Gateway wird eine nutzbare Adresse eines tatsächlich vorhandenen lokalen Routers benötigt, nicht die Netzadresse.

**Variantes:**

| Gateway proposto | Pertence? | Endereço local de gateway utilizável? | O que não se conclui |
|---|---|---|---|
| `.64` | Ja | Nein, rede | Nada sobre sucesso de tráfego local entre outros hosts |
| `.127` | Ja | Nein, broadcast | Idem |
| `.65` | Ja | Ja, quanto aos limites numéricos e diferente da IP do PC | Router existente/ativo continua desconhecido |
| `.70` | Ja | Nein, é o próprio PC neste cenário | Não assumir que o PC também seja um router com configuração adicional |
| `.129` | Nein | Nein como next hop local convencional nas condições da tarefa | Não introduzir rotas on-link especiais não previstas |

Não forçar `Nicht eindeutig bestimmbar` nas duas perguntas com dados completos. Uma terceira pergunta, **“Antwortet unter .65 tatsächlich ein Router?”**, seria indeterminada sem evidência operacional. Não concluir que gateway inválido impede comunicação dentro do mesmo subnet.

**Critério futuro:** reutilizar os cálculos/classificações existentes, sem transformar a resposta de pertencimento da E02 antiga numa resposta de validade.

### ND03 — VLAN-Grenzen und unbekanntes Routing

**Definição:** VLANs diferentes separam o domínio L2, mas isso não exclui roteamento entre subnets distintos. A ausência de informações de encaminhamento não equivale a encaminhamento desabilitado.

**Exemplo em alemão:**

> A verwendet 10.20.10.10/24 in VLAN 10, B verwendet 10.20.20.20/24 in VLAN 20. Als Gateways sind 10.20.10.1 und 10.20.20.1 eingetragen. Ob die Gateways aktiv sind und zwischen den Netzen weiterleiten, wurde nicht geprüft. Angaben zu Filtern und Kommunikationsversuchen fehlen.
>
> Können A und B unter diesen Bedingungen tatsächlich miteinander kommunizieren?

**Resposta:** **Nicht eindeutig bestimmbar**.

**Explicação proposta:**

> Die Hosts befinden sich in unterschiedlichen Subnetzen und VLANs. Für die Kommunikation benötigen sie einen passenden gerouteten Weg einschließlich Rückweg. Die eingetragenen Gateway-Adressen zeigen nur die beabsichtigten Next Hops. Ob dort erreichbare Router mit passenden Routen und erlaubtem Verkehr arbeiten, ist nicht dokumentiert. Unterschiedliche VLAN-Nummern allein beweisen weder funktionierende Kommunikation noch deren Unmöglichkeit.

**Evidência suficiente para variantes:**

- **Nein:** isolamento confirmado entre os dois segmentos, sem qualquer caminho de forwarding, bridging, túnel ou acesso alternativo. A tarefa deve declarar essa ausência, como já faz `vlan` na E02 v2.
- **Ja para uma troca observada:** Echo Request identificado e Echo Reply correspondente recebidos entre A e B naquele momento. Isso não prova disponibilidade de todos os serviços.

**Cuidado:** não usar hosts no mesmo prefixo em VLANs isoladas e, simultaneamente, assumir ausência de proxy ARP/rotas adicionais, para depois afirmar que só falta conhecer o router. Nesse modelo, a tentativa de ARP local pode já determinar o bloqueio. A variante acima usa subnets distintos para manter a incerteza coerente.

### ND04 — Kein direkter Switchpfad

**Definição:** distinguir “não há enlace L2 direto entre esses switches” de “não existe caminho de rede entre os endpoints”. Não requer desenhar uma interface nova: uma descrição textual ou recorte de diagrama identificado como parcial é suficiente.

**Exemplo em alemão:**

> A befindet sich im Netz 10.30.1.0/24 an Switch S1, B im Netz 10.30.2.0/24 an Switch S2. Zwischen S1 und S2 besteht kein direkter Link. Der gezeigte Planausschnitt enthält nicht alle Uplinks und Router. Routentabellen und Testergebnisse liegen nicht vor.
>
> Können A und B in dieser Netzsituation IP-Daten miteinander austauschen?

**Resposta:** **Nicht eindeutig bestimmbar**.

**Explicação proposta:**

> Ein direkter Switch-Link ist keine notwendige Bedingung für Kommunikation zwischen unterschiedlichen IP-Netzen. Ein Weg über Router oder weitere Infrastruktur ist durch den unvollständigen Plan nicht ausgeschlossen. Umgekehrt beweist diese Möglichkeit keinen tatsächlich funktionierenden Weg. Der Planausschnitt reicht daher nicht zur Entscheidung aus.

**Variantes:** troca roteada atual comprovada → **Ja** para essa troca; inventário completo confirma todos os acessos de A desconectados e nenhum alternativo → **Nein** quanto à possibilidade atual. Um desenho sem linha de cabo, sem indicação de completude, não é evidência suficiente para a segunda conclusão.

**Não inferir:** switch desligado, uplink ausente ou rota inexistente apenas por não aparecerem no recorte. O atributo “diagrama completo/parcial” precisa estar explícito no texto futuro.

### ND05 — Ping ohne Antwort

**Definição:** um timeout informa o resultado daquele teste; não identifica automaticamente sua causa nem exclui comunicação por outros protocolos.

**Exemplo em alemão:**

> Ein abgeschlossener Ping-Test von A nach B meldet ausschließlich Zeitüberschreitungen. Interface-Status, Firewall-Regeln und Hin- und Rückweg sind nicht dokumentiert. Andere Dienste wurden nicht getestet.
>
> Ist zwischen A und B grundsätzlich IP-Kommunikation möglich?

**Resposta:** **Nicht eindeutig bestimmbar**.

**Explicação proposta:**

> Für diesen Test wurde kein Echo Reply empfangen. Ein ICMP-Filter wäre eine mögliche Erklärung, ebenso ein anderer Fehler auf Hin- oder Rückweg; keiner davon wurde hier nachgewiesen. Andere IP-Dienste könnten weiterhin funktionieren. Aus dem Timeout allein folgt daher weder eine bestimmte Fehlerursache noch der Ausfall jeder IP-Kommunikation.

**Perguntas relacionadas, com escopo diferente:**

- “Hat A in diesem abgeschlossenen Test einen Echo Reply empfangen?” → **Nein**, pois o resultado completo foi fornecido.
- “Blockiert eine Firewall den Ping?” → **Nicht eindeutig bestimmbar**, sem log/regra/observação que isole essa causa.
- “Ist IP-Kommunikation grundsätzlich möglich?”, com resposta TCP atual de B recebida em A → **Ja**, mesmo que aquele ping não tenha respondido.
- Mesma pergunta de possibilidade, com B desligado, nenhuma substituição de IP e nenhum endpoint alternativo no escopo → **Nein**.

**Critério futuro:** o corretor precisa da afirmação exata, não apenas de um booleano `pingSucceeded`. Não atribuir a causa “firewall” aos resultados negativos dos checks legados por conveniência.

### ND06 — Was beweist ein Echo Reply?

**Definição:** ensinar o alcance de uma evidência positiva confiável. Identidade do destino, momento e correspondência entre solicitação e resposta devem estar informados.

**Exemplo em alemão:**

> Um 10:15:03 sendet A einen ICMP Echo Request an B. A empfängt den dazugehörigen Echo Reply von B mit passender Kennung und Sequenznummer. Die Messung ist aktuell und dem angegebenen Ziel zugeordnet.
>
> Ist damit für diesen Zeitpunkt ein ICMP-Austausch zwischen A und B nachgewiesen?

**Resposta:** **Ja**.

**Explicação proposta:**

> Die zugeordnete Antwort belegt, dass die Anfrage B erreicht hat und eine Antwort bei A angekommen ist. Damit ist dieser ICMP-Austausch nachgewiesen. Ob DNS-Auflösung, ein Webdienst oder ein späterer Test funktionieren, wurde dadurch nicht geprüft. Auch die Anzahl der Router auf dem Weg lässt sich daraus allein nicht bestimmen.

Esse exemplo não precisa de uma variante **Nein** com a mesma evidência. Uma resposta antiga ou não atribuível ao destino não prova comunicação **agora** e pode motivar outro enunciado indeterminado; não declarar que a rede está com defeito por isso.

**Perguntas adicionais:** “Funktioniert auch HTTP auf B?” e “Liegen A und B in derselben Broadcast-Domäne?” → **Nicht eindeutig bestimmbar** com apenas essa evidência. A pergunta “Beweist dieser Ping, dass HTTP funktioniert?” teria resposta **Nein**: são predicados diferentes, portanto o enunciado deve evitar essa ambiguidade.

**Critério futuro:** manter a conclusão limitada ao teste. Se uma futura atividade usar engine, correlacionar solicitação/resposta/identidade da tentativa; não reutilizar um evento antigo de outro plano como evidência atual.

### ND07 — Link-LED ist kein IP-Test

**Definição:** uma indicação física de link não demonstra IP correto, VLAN, roteamento ou resposta de um serviço. O significado do indicador precisa ser declarado; nem todo LED de equipamento tem a mesma semântica.

**Exemplo em alemão:**

> Die Link-LEDs an den Ethernet-Anschlüssen von A und B leuchten. Laut Gerätebeschreibung zeigen diese LEDs lediglich einen aktiven physischen Link zum jeweils angeschlossenen Gerät an. IP-Konfiguration, VLANs, Routing und Kommunikationsversuche sind nicht dokumentiert.
>
> Können A und B tatsächlich IP-Daten miteinander austauschen?

**Resposta:** **Nicht eindeutig bestimmbar**.

**Explicação proposta:**

> Die LEDs bestätigen hier nur die beiden lokalen physischen Links. Sie sagen nicht aus, ob die Endgeräte passende IP-Konfigurationen besitzen oder ob zwischen ihren Anschlüssen ein geeigneter Weg existiert. Ein Austausch zwischen A und B wurde nicht beobachtet. Leuchtende Link-LEDs ersetzen deshalb keinen IP-Kommunikationstest.

**Variantes:** Echo Reply atual correspondente → **Ja** para ICMP observado. Para perguntar possibilidade e responder **Nein**, informar que todas as interfaces de A estão fisicamente desconectadas e não existe outro acesso. **LED apagado sozinho não basta**, pois significado/estado do indicador pode variar; não inventar cabo rompido ou switch desligado.

**Critério futuro:** usar evidência textual controlada antes de vincular exercícios às cores/LEDs do editor. Não mudar indicadores da aplicação nem a engine para publicar esse arquétipo.

### ND08 — Hinweg, Rückweg und längstes Präfix

**Definição:** uma troca requer ida e retorno; uma rota conhecida num sentido não prova o outro. O retorno não precisa percorrer os mesmos routers. Completude da tabela e seleção da rota mais específica devem ser tratadas separadamente.

**Exemplo em alemão:**

> A nutzt 10.72.1.10/26 mit Gateway 10.72.1.1, B nutzt 10.72.2.10/27 mit Gateway 10.72.2.1. West und Ost sind über 10.72.254.0/30 verbunden. Eine Route von West zu B ist dokumentiert. Von Ost liegt nur ein Ausschnitt der Routentabelle vor; eine Default- oder Rückroute ist darin nicht zu sehen. Es gibt keinen vollständigen Ping-Test.
>
> Ist in dieser Netzsituation ein vollständiger ICMP-Austausch zwischen A und B möglich?

**Resposta:** **Nicht eindeutig bestimmbar**.

**Explicação proposta:**

> Die dokumentierte Route klärt nur einen Teil des Hinwegs. Für die Antwort muss B beziehungsweise sein Router ebenfalls einen nutzbaren Weg zu A auswählen. Dass eine Rückroute im Ausschnitt fehlt, beweist nicht ihr Fehlen in der vollständigen Tabelle. Außerdem wurde der gesamte Austausch nicht beobachtet. Ohne weitere Angaben sind Erfolg und Misserfolg mit den vorliegenden Informationen vereinbar.

**Variantes com evidência suficiente:**

- **Nein:** Request chegou a B; B entregou a resposta ao único router de saída. Tabela completa aplicável à resposta nesse router não tem rota correspondente, conectada nem default; forwarding alternativo, policy routing, túneis e outros acessos foram explicitamente excluídos. A resposta não tem saída nesse cenário. Não extrapolar essa conclusão para outros destinos.
- **Ja observado:** Request de A recebido em B e Reply correspondente recebido em A. A rota de retorno pode ser assimétrica.
- **Precedência /32, inspirado em D04:** tabela completa contém default correta e rota /32 para A via next hop explicitamente inexistente, sem mecanismo alternativo. Perguntar **“Wird für A die Default-Route ausgewählt?”** → **Nein**. A rota /32 é mais específica; adicionar /27 não muda essa escolha. Não diagnosticar next hop inexistente sem evidência desse fato.

**Critério futuro:** distinguir `não documentado`, `tabela parcial` e `ausente na tabela completa`. A presença de duas rotas, sem dados de operação/filtros, ainda não é prova de comunicação observada.

## 4. Validação de novos arquétipos antes de publicar

Proposta de processo, ainda sem implementação:

1. Escrever o predicado exato, dados, premissas e informação deliberadamente ausente. Para validade de endereço, dizer se a pergunta é apenas numérica ou operacional.
2. Calcular limites de subnet com um oráculo independente dos geradores. Reaproveitar o estilo BigInt dos testes atuais.
3. Para **Nicht eindeutig bestimmbar**, descrever dois estados de rede compatíveis com os mesmos dados: um em que a afirmação é verdadeira e outro em que é falsa. Se não for possível, reexaminar o gabarito.
4. Para **Nein**, apontar a contradição matemática ou o impedimento explícito suficiente. Enumerar apenas os caminhos alternativos relevantes ao escopo; não supor que uma tabela/figura é completa.
5. Para **Ja**, distinguir prova observada de conclusão sob modelo. Não misturar momento passado e presente nem extrapolar ICMP para HTTP/DNS.
6. Rejeitar receitas contraditórias: por exemplo, destino único desligado e resposta atual atribuída a ele no mesmo momento, sem mudança de estado; ou “rotas desconhecidas” e “nenhuma rota existe” usados como sinônimos.
7. Testar mudanças de uma evidência por vez: IP igual com L2 desconhecido; VLAN diferente com/sem caminho explicitamente excluído; timeout com/sem resposta de outro protocolo; trecho versus tabela completa. Conferir que feedback cite justamente a evidência decisiva.
8. Congelar exemplos e versões, testar reprodução e preservação dos fingerprints v1/v2. Amostrar seeds para variedade estrutural, não apenas para IPs distintos ou equilíbrio artificial Ja/Nein/Unknown.

Para exercícios práticos novos, aprovar também uma política mínima de edições permitidas e o limite da validação automática. Reutilizar os checks estruturais/rota efetiva/sondagens dos pilotos quando apropriado. Não apresentar justificativa livre ou observação histórica como corrigida automaticamente se não houver verificador correspondente.

Não é necessário projetar um motor geral de raciocínio. A primeira implementação pode ser uma pequena coleção explícita de casos versionados e adaptações seletivas do modelo de perguntas existente. A tabela de evidências da E02 v2 é uma referência; o modelo fechado `cidr.ts` não deve receber evidências abertas por conversão silenciosa.

## 5. Organização futura dos assuntos, sem nova interface nesta etapa

| Nome alemão proposto | Conteúdo já disponível ou referência reutilizável | Expansão futura |
|---|---|---|
| **Subnetting & CIDR** | A · Netz und Broadcast; B · VLSM planen; E02 matemático | Capacidade, máscara, pertencimento, overlap, planos com outras estruturas |
| **Netzwerkdiagnose** | E02 v2 baseado em evidências | ND01–ND08, distinguindo cálculo de diagnóstico |
| **Switching & VLAN** | Labs/topologias como contexto; E05 ainda interno | Isolamento L2, domínios e evidência de roteamento; não anunciar E05 como publicado |
| **Routing** | Büro/Lager, piloto D02, E08/E09 | D01/D03/D04 após revisão; retorno e precedência de rotas |
| **DHCP, ARP & DNS** | Labs 1/4 e Serviceportal | Draft DHCP e novas questões de evidência/procedimento antes de publicação |
| **Praxis-Labs** | Seis Übungen Beta e cinco Labs existentes, com origem claramente identificada | Acesso aos exercícios de simulação por assunto e dificuldade |

Preservar os títulos alemães existentes, IDs, versões, rotas de abertura e controller. Os nomes ingleses dos Labs legados continuam como estão até uma revisão própria; esta tabela não os renomeia. A e B podem ser subgrupos de cálculo sem misturar suas tentativas com planos simulados.

Uma futura navegação por assunto pode usar metadados/atalhos para o mesmo exercício, sem duplicar identidade, progresso ou execução. **Praxis-Labs** seria uma visão por formato, não outra cópia do catálogo. Não importar o catálogo autoral completo no bundle do aluno para preencher menus. Não criar categorias vazias nem substituir os menus atuais antes de haver conteúdo aprovado. A decisão de unificar ou apenas agrupar entradas fica para a revisão de UX.

## 6. Ordem sugerida para discussão e implementação

1. **Aprovar vocabulário e evidências.** Resolver os pontos de redação identificados no inventário; definir perguntas de possibilidade, comprovação e causa. Esta aprovação precede qualquer alteração de gabarito.
2. **Primeiro lote pequeno: ND01, ND02, ND05 e ND06.** Reutilizam matemática e distinções já verificadas em E02 v2; começar por exemplos fixos com revisão de conteúdo e testes, só depois gerar variantes. Manter v1/v2 disponíveis e imutáveis.
3. **Segundo lote: ND03, ND04 e ND07.** Introduzir informação parcial sobre VLAN, diagrama e LED de maneira textual; não ampliar editor/engine nem exigir novos desenhos interativos.
4. **ND08 e ligação com prática.** Aproveitar D02/D04 e política dos pilotos, reforçando tabela completa/parcial e caminho de retorno. Publicação prática depende dos critérios de preservação e da evidência realmente verificável.
5. **Variedade A/B e organização dos menus.** Discutir depois a publicação seletiva de capacidade/overlap/membership e novos formatos VLSM, com versões próprias. Organizar por assuntos quando existir conteúdo suficiente; não acoplar a expansão a uma reestruturação ampla.

Decisões ainda abertas: nomes finais dos grupos, quantidade de casos por lote, quais variantes terão simulação e quais serão textuais, momento de publicar cada grupo e eventual progresso persistente da Rechenpraxis. Nenhuma delas exige alterar os exercícios existentes nesta auditoria.

## 7. Referências técnicas e limites

O contrato atual foi verificado nos arquivos ligados pelo [inventário](educational-archetypes-audit.md), especialmente `math.ts`, `cidr.ts`, `gatewayV2.ts`, `routing.ts` e `practicalChecker.ts`.

Como apoio técnico à autoria: a [RFC 1122, §3.3.1.1–3.3.1.2](https://www.rfc-editor.org/rfc/rfc1122.html#section-3.3.1.1) descreve a decisão local/remota e a seleção de gateway; a [RFC 792](https://www.rfc-editor.org/rfc/rfc792.html) define Echo/Echo Reply e ressalta que a ausência de entrega ou mensagem de erro não fornece garantia de diagnóstico. Essas referências não transformam o modelo educacional simplificado em cobertura de todos os casos de redes reais. Os exemplos e as regras de evidência acima são propostas de autoria para o escopo declarado.
