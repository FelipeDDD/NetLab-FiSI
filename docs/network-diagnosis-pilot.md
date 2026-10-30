# Netzwerkdiagnose — piloto interno, etapa 1

30/10/2026. **Oito casos fixos, não publicados**, baseados no [inventário](educational-archetypes-audit.md), na [proposta de arquétipos](network-diagnosis-archetypes.md) e nos contratos da [E02 v2](practice-e02-v2.md).

Este documento registra o escopo da etapa 1. A [etapa 2](network-diagnosis-generation.md) acrescenta um gerador interno separado para ND02/ND05, preservando estes oito casos e seus gabaritos.

## Representação e escopo

A fonte autoral está em [pilot.ts](../src/exercises/diagnosis/pilot.ts); as verificações ficam em [pilot.test.ts](../src/exercises/diagnosis/pilot.test.ts). A coleção contém ID, arquétipo, versão de conteúdo, cenário, evidências classificadas e perguntas relacionadas. Cada pergunta registra conceito, gabarito, IDs das evidências decisivas e explicação alemã. Respostas indeterminadas exigem por tipo dois cenários hipotéticos dentro da própria explicação.

Os valores de resposta seguem o vocabulário existente: yes/Ja, no/Nein e unknown/Nicht eindeutig bestimmbar. O modelo distingue pertencimento, validade de gateway, possibilidade de comunicação, observação e causa. Uma alternativa hipotética responde à **afirmação daquela pergunta**: no caso HTTP, o cenário negativo preserva ICMP funcionando; no caso de causa, contrapõe firewall causal a outra causa compatível.

Não há gerador, seed, corretor, motor de diagnóstico, registro na fábrica ou adaptador de UI novo. Estender agora o Question da Rechenpraxis exigiria alterar sua união de problemas/receitas sem benefício para uma coleção autoral ainda em revisão. Por isso, a solução é um pequeno módulo declarativo independente, seguindo a separação existente entre material autoral e publicação. Não importa engine ou módulos da aplicação e não é importado por eles.

São **16 perguntas relacionadas em oito cenários**: seis Ja, cinco Nein e cinco Nicht eindeutig bestimmbar. Não houve balanceamento artificial. As respostas de pertencimento e validade com dados completos são determinadas. O formato atual não corrige justificativas livres.

## Revisão editorial dos oito casos

| Caso | Foco e gabaritos na ordem das perguntas | Avaliação editorial / limite | Variantes futuras recomendadas |
|---|---|---|---|
| nd01-01 | Mesmo /23: Ja; operação desconhecida: Nicht eindeutig bestimmbar | Exige calcular através do terceiro octeto e separar configuração de operação. Não afirma defeito observado | Outros limites de bloco; informar apenas uma evidência operacional por vez |
| nd01-02 | /24 diferentes: Nein; caminho indireto: Nicht eindeutig bestimmbar | Plano parcial e ausência de link direto não excluem router. É uma aplicação de ND01 que também prepara ND04, sem criar um quinto arquétipo | Variar recorte completo/parcial e gateways documentados, sem inferir ausência de rota |
| nd02-01 | .64 pertence: Ja; gateway .64: Nein; .65 numericamente adequado: Ja | Calcula rede /26. A regra geral sobre endereços reservados é premissa, mas a classificação de .64 não é entregue | Mudar prefixo e bloco; incluir a própria IP do PC em uma versão futura |
| nd02-02 | .63 pertence: Ja; gateway .63: Nein; .62 numericamente adequado: Ja | Distingue broadcast de último host em /27. Ja para .62 é apenas numérico, não comprovação de router | Limites atravessando octetos; endereço externo, sem introduzir /31 nesta convenção |
| nd05-01 | Reply observado: Nein; comunicação geral: Nicht eindeutig bestimmbar | A primeira pergunta é deliberadamente uma leitura simples do teste; serve de contraste para a segunda, que exige raciocínio. Não contar como dois desafios equivalentes | Um resultado ICMP negativo acompanhado de evidência TCP positiva; não diagnosticar causa pelo timeout |
| nd05-02 | Firewall causal: Nicht eindeutig bestimmbar; reply do gateway prova troca com arquivo: Nein | Resposta do primeiro salto não é resposta do destino. Os dois mundos mantêm o router respondendo | Adicionar evidência causal suficiente, como log correlacionado, sem atribuir poder probatório excessivo a uma regra isolada |
| nd06-01 | Intercâmbio ICMP no instante medido: Ja | Caso de calibração relativamente fácil: interpretar alcance, direção e tempo. Não inventar uma pegadinha que invalide uma resposta confiável | Resposta antiga ou de outro destino deve formar outro caso, com mudança explícita do dado |
| nd06-02 | HTTP/8080 após ping bem-sucedido: Nicht eindeutig bestimmbar | Os dois mundos preservam o sucesso ICMP; só o serviço varia. Falha HTTP não equivale à impossibilidade de toda comunicação IP | Outros serviços/portas; DNS exigiria dados próprios, não inferência a partir de IP literal |

Cuidados resolvidos na redação:

- Perguntar diretamente se a comunicação é possível, não se “é possível decidir”: a segunda formulação poderia exigir Nein em vez de Nicht eindeutig bestimmbar.
- Separar “um endereço é numericamente adequado” de “um router existe e responde”.
- Não transformar exemplos hipotéticos de cabo desligado/firewall em fatos do enunciado.
- Não usar um host desligado como cenário negativo de HTTP quando o enunciado já prova resposta ICMP atual e mantém o estado constante.
- Não exigir ausência de todos os caminhos como premissa óbvia para obter Nein. Os resultados negativos deste lote decorrem de cálculo, leitura de observação ou distinção entre endpoints.

## Casos completos para revisão

Os textos abaixo reproduzem a coleção, inclusive dados, perguntas, gabaritos e explicações. Os IDs junto às evidências permitem identificar o suporte ou a lacuna decisiva. São material autoral com respostas, não uma projeção para alunos.

<!-- pilot-cases:start -->

### nd01-01 — Gleiches Netz, ungeprüfte Verbindung

Zwei Arbeitsplätze sollen Dateien austauschen. Sie haben bisher nur die IP-Konfigurationen geprüft.

- [addresses / configuration] A: 192.168.10.50/23; B: 192.168.11.60/23.
- [operation / missing] Verkabelung, VLAN-Zuordnung, Betriebszustand und Filter sind unbekannt. Es liegt kein Kommunikationsversuch vor.

**membership: Gehören die beiden IP-Adressen rechnerisch zum selben Subnetz?**

Antwort: **Ja**.

Bezug: addresses.

/23 entspricht 255.255.254.0. Beide Adressen liegen im Block 192.168.10.0–192.168.11.255. Der unterschiedliche dritte Oktettwert trennt sie hier nicht in zwei Subnetze. Damit ist nur die rechnerische Zugehörigkeit geklärt.

**communication: Können A und B in ihrem aktuellen Zustand IP-Daten miteinander austauschen?**

Antwort: **Nicht eindeutig bestimmbar**.

Bezug: addresses, operation.

Passende IP-Adressen belegen keinen betriebsbereiten Übertragungsweg. Der tatsächliche Zustand ist nicht dokumentiert; die folgenden Beispiele sind Möglichkeiten, keine Beobachtungen.

- Hypothetisches Beispiel mit Kommunikation: Beide PCs sind aktiv, ihre Ports liegen im selben funktionierenden VLAN und Filter erlauben den Verkehr. Dann können sie einander direkt per ARP finden und IP-Daten austauschen.
- Hypothetisches Beispiel ohne Kommunikation: A hat nur eine Netzwerkschnittstelle und deren Kabel ist abgezogen. Die gespeicherte /23-Konfiguration bleibt gleich, aber A hat keinen Netzwerkzugang.

### nd01-02 — Kein direktes Kabel zwischen den Switches

A hängt an Switch S1, B an Switch S2. Ein Kollege hält Kommunikation wegen der unterschiedlichen Netze und des fehlenden direkten Kabels für unmöglich.

- [addresses / configuration] A: 10.30.1.10/24; B: 10.30.2.20/24.
- [switches / premise] Zwischen S1 und S2 gibt es keinen direkten Link. Der vorliegende Planausschnitt ist unvollständig.
- [paths / missing] Weitere Uplinks, Router, Gateway-Einträge, Routen, Filter und Betriebszustände sind nicht dokumentiert. Es gibt keine Testergebnisse.

**membership: Gehören die beiden IP-Adressen rechnerisch zum selben Subnetz?**

Antwort: **Nein**.

Bezug: addresses.

Bei /24 liegen A in 10.30.1.0/24 und B in 10.30.2.0/24. Diese Netze sind verschieden. Daraus folgt jedoch nicht, dass kein Router zwischen ihnen vermitteln könnte.

**communication: Können A und B in dieser Netzsituation IP-Daten miteinander austauschen?**

Antwort: **Nicht eindeutig bestimmbar**.

Bezug: addresses, switches, paths.

Verschiedene Subnetze benötigen einen passenden gerouteten Weg einschließlich Rückweg. Ein direkter Switch-Link ist dafür nicht erforderlich. Ein unvollständiger Plan zeigt weder, dass ein solcher Weg existiert, noch, dass er fehlt.

- Hypothetisches Beispiel mit Kommunikation: Beide Switches haben Uplinks zu einem aktiven Router. A nutzt 10.30.1.1 und B 10.30.2.1 als Gateway; Router, Rückweg und Filter erlauben den Austausch. Ein direkter Link S1–S2 ist nicht nötig.
- Hypothetisches Beispiel ohne Kommunikation: S1 und S2 bilden zwei isolierte Inseln ohne weitere Uplinks oder Netzwerkzugänge. Dann fehlt ein Weg zwischen A und B. Diese vollständige Isolation ist im Planausschnitt aber nicht belegt.

### nd02-01 — Die erste Adresse im Block

Für einen Arbeitsplatz werden zwei Gateway-Adressen vorgeschlagen. Prüfen Sie zunächst nur die Adresswahl.

- [address / configuration] PC: 192.168.50.70/26.
- [convention / premise] Es gilt ein gewöhnliches IPv4-Broadcast-Subnetz. Ein Gateway soll ein anderer lokaler Router sein; Netz- und Broadcastadressen sind keine Hostadressen.
- [routers / missing] Ob unter den vorgeschlagenen Adressen tatsächlich ein Router arbeitet, wurde nicht geprüft.

**membership: Gehört 192.168.50.64 rechnerisch zum Subnetz des PCs?**

Antwort: **Ja**.

Bezug: address.

Der /26-Block des PCs reicht von 192.168.50.64 bis 192.168.50.127. Auch seine erste Adresse gehört mathematisch zum Block. Zugehörigkeit und Nutzbarkeit als Host sind verschiedene Fragen.

**network-gateway: Ist 192.168.50.64 in diesem Subnetz als Gateway-Hostadresse nutzbar?**

Antwort: **Nein**.

Bezug: address, convention.

/26 bildet 64er-Blöcke. .70 liegt im Block .64–.127; .64 bezeichnet das Netz und kann in dieser Konvention keinem Gateway-Host zugewiesen werden. Eine Default-Route mit diesem Eintrag wird nicht dadurch korrekt, dass die Adresse im Block liegt.

**usable-gateway: Ist 192.168.50.65 hinsichtlich der Subnetzgrenzen und der eigenen PC-Adresse als lokale Gateway-Hostadresse geeignet?**

Antwort: **Ja**.

Bezug: address, convention, routers.

Der nutzbare Hostbereich ist 192.168.50.65–192.168.50.126. .65 liegt darin und ist nicht die PC-Adresse .70. Damit passt die Adresse numerisch; ein erreichbarer Router unter .65 ist noch nicht nachgewiesen.

### nd02-02 — Broadcast oder letzter Host?

Ein Eintrag am oberen Rand des Subnetzes wird als Gateway diskutiert. Eine zweite Adresse liegt direkt davor.

- [address / configuration] PC: 172.20.8.34/27.
- [convention / premise] Es gilt ein gewöhnliches IPv4-Broadcast-Subnetz. Ein Gateway soll ein anderer lokaler Router sein; Netz- und Broadcastadressen sind keine Hostadressen.
- [routers / missing] Es liegen keine Beobachtungen zu Routern unter den vorgeschlagenen Adressen vor.

**membership: Gehört 172.20.8.63 rechnerisch zum Subnetz des PCs?**

Antwort: **Ja**.

Bezug: address.

/27 umfasst 32 Adressen. .34 liegt im Block 172.20.8.32–172.20.8.63; dessen letzte Adresse gehört mathematisch dazu. Das allein macht sie nicht zu einer nutzbaren Hostadresse.

**broadcast-gateway: Ist 172.20.8.63 in diesem Subnetz als Gateway-Hostadresse nutzbar?**

Antwort: **Nein**.

Bezug: address, convention.

Im Block .32–.63 ist .63 der Broadcast, nicht der letzte nutzbare Host. Dieser ist .62. Ein konventionelles Gateway benötigt eine eigene Hostadresse; die Broadcastadresse bezeichnet hier kein einzelnes Routergerät.

**usable-gateway: Ist 172.20.8.62 hinsichtlich der Subnetzgrenzen und der eigenen PC-Adresse als lokale Gateway-Hostadresse geeignet?**

Antwort: **Ja**.

Bezug: address, convention, routers.

Die Hostadressen reichen von 172.20.8.33 bis 172.20.8.62. .62 ist der letzte nutzbare Host und unterscheidet sich von der PC-Adresse .34. Ob dort tatsächlich ein Router erreichbar ist, bleibt offen.

### nd05-01 — Vier Zeitüberschreitungen

Sie prüfen die Verbindung zwischen zwei Arbeitsplätzen mit ping. Der Test ist beendet.

- [addresses / configuration] A: 192.168.40.10/24; B: 192.168.40.20/24.
- [ping / observation] Der gerade abgeschlossene Test von A nach B meldet vier gesendete Echo Requests, keinen empfangenen Echo Reply und vier Zeitüberschreitungen.
- [operation / missing] Interface-Status, VLANs und Filter sind nicht geprüft. Zu anderen IP-Diensten liegen keine Testergebnisse vor.

**reply: Hat A in diesem abgeschlossenen Test einen Echo Reply von B empfangen?**

Antwort: **Nein**.

Bezug: ping.

Das vollständige Testergebnis enthält keinen Echo Reply. Für diesen Test ist die Antwort daher Nein. Daraus folgt weder, wo ein Paket verloren ging, noch, dass auch TCP- oder UDP-Kommunikation unmöglich ist.

**communication: Ist zwischen A und B im beschriebenen Zustand grundsätzlich IP-Kommunikation möglich?**

Antwort: **Nicht eindeutig bestimmbar**.

Bezug: addresses, ping, operation.

Die vier Timeouts belegen das Ausbleiben von Echo Replies, nicht den Ausfall aller IP-Protokolle. Sie unterscheiden zum Beispiel nicht zwischen ICMP-Filterung und einem nicht betriebsbereiten Ziel.

- Hypothetisches Beispiel mit Kommunikation: B ist aktiv und ein Webdienst antwortet A über TCP; eine Firewall verwirft nur die ICMP Echo Requests. Der Ping bleibt erfolglos, während IP-Kommunikation über TCP funktioniert.
- Hypothetisches Beispiel ohne Kommunikation: B ist ausgeschaltet und kein anderes Gerät übernimmt seine Adresse. Der Ping läuft ebenfalls in Timeouts, aber auch andere IP-Dienste von B sind nicht erreichbar.

### nd05-02 — Das Gateway antwortet, das Archiv nicht

Der lokale Router antwortet auf ping. Beim entfernten Archiv sehen Sie nur Timeouts. Ein Kollege vermutet eine Firewall.

- [addresses / configuration] A: 10.44.1.10/24; Archiv B: 10.44.2.20/24; Gateway von A: 10.44.1.1.
- [gateway-reply / observation] A hat gerade einen korrekt zugeordneten Echo Reply von 10.44.1.1 empfangen.
- [target-timeout / observation] Ein separater, gerade abgeschlossener Ping-Test von A nach 10.44.2.20 meldet ausschließlich Timeouts und keinen Echo Reply.
- [remote-state / missing] Betriebszustand von B, Hin- und Rückweg, Filterregeln und Filterlogs sind unbekannt. Andere Dienste auf B wurden nicht getestet.

**cause: Ist eine Firewall die Ursache der Timeouts beim Ping von A zum Archiv B?**

Antwort: **Nicht eindeutig bestimmbar**.

Bezug: gateway-reply, target-timeout, remote-state.

Die Antwort von 10.44.1.1 belegt nur den Austausch mit dem Gateway. Sie erklärt nicht die Timeouts von 10.44.2.20. Ohne Filterlogs oder andere eingrenzende Befunde ist die vermutete Ursache nicht nachgewiesen.

- Hypothetisches Beispiel mit Firewall als Ursache: Der geroutete Weg funktioniert und B beantwortet HTTP-Anfragen von A. Eine Firewall auf diesem Weg verwirft nur Echo Requests an B. So funktioniert andere IP-Kommunikation, während genau dieser Filter die Ping-Timeouts verursacht.
- Hypothetisches Beispiel ohne Firewall als Ursache: Der Router bleibt aktiv, aber B ist ausgeschaltet und seine IP wird nicht übernommen. Die Filter würden den Verkehr erlauben. Kommunikation mit B funktioniert nicht; der fehlende Zielbetrieb statt einer Firewall erklärt die Timeouts.

**target-proof: Belegt der Echo Reply von 10.44.1.1 bereits einen beobachteten ICMP-Austausch zwischen A und dem Archiv 10.44.2.20?**

Antwort: **Nein**.

Bezug: addresses, gateway-reply, target-timeout.

Die antwortende Adresse ist die des Gateways, nicht die des Archivs. Ein funktionierender erster Abschnitt ist kein beobachteter Austausch mit dem entfernten Ziel. Dafür müsste eine zugeordnete Antwort von B bei A ankommen.

### nd06-01 — Eine zugeordnete Antwort

Sie werten eine aktuelle Ping-Messung zwischen zwei Geräten aus. Die Messung ist vertrauenswürdig und eindeutig den genannten Geräten zugeordnet.

- [addresses / configuration] A: 192.168.60.10/24; B: 192.168.60.20/24.
- [exchange / observation] Um 10:15:03 sendet A einen Echo Request an B. Um 10:15:03.020 empfängt A den Echo Reply von B mit passender Kennung, Sequenznummer und Nutzlast.
- [other-services / missing] Andere Dienste und spätere Zeitpunkte wurden nicht untersucht.

**exchange: Ist damit für diesen Messzeitpunkt ein ICMP-Austausch in beiden Richtungen zwischen A und B nachgewiesen?**

Antwort: **Ja**.

Bezug: addresses, exchange.

Der zugeordnete Echo Reply von 192.168.60.20 zeigt, dass B die Anfrage verarbeitet hat und die Antwort bei A angekommen ist. Damit ist dieser ICMP-Austausch einschließlich Rückweg belegt. Daraus folgt keine Zusage für spätere Pings und kein Nachweis für DNS oder HTTP.

### nd06-02 — Ping erfolgreich — und das Webportal?

Nach einem erfolgreichen Ping möchten Sie das Webportal auf B öffnen. Bislang haben Sie nur ICMP geprüft.

- [addresses / configuration] A: 10.60.1.10/24; B: 10.60.2.20/24.
- [exchange / observation] A hat gerade einen aktuellen, vertrauenswürdig B zugeordneten Echo Reply auf seinen Echo Request empfangen. Kennung, Sequenznummer und Nutzlast stimmen überein.
- [http / missing] Ob auf B ein HTTP-Dienst auf TCP-Port 8080 lauscht und dessen Verkehr erlaubt ist, wurde nicht geprüft. Der Zustand wird während dieser Betrachtung als unverändert angenommen.

**http: Kann A im beschriebenen Zustand von http://10.60.2.20:8080/ eine HTTP-Antwort erhalten?**

Antwort: **Nicht eindeutig bestimmbar**.

Bezug: addresses, exchange, http.

Der Echo Reply belegt ICMP-Kommunikation mit B trotz unterschiedlicher /24-Netze. HTTP benötigt zusätzlich einen antwortenden Dienst und erlaubten TCP-Verkehr auf Port 8080. Beides wurde nicht untersucht; die folgenden Möglichkeiten widersprechen dem erfolgreichen Ping nicht.

- Hypothetisches Beispiel mit HTTP-Kommunikation: Auf B läuft der Webdienst auf TCP-Port 8080, die Filter erlauben die Verbindung und der Dienst beantwortet die Anfrage. A erhält neben Echo Replies auch HTTP-Antworten.
- Hypothetisches Beispiel ohne HTTP-Kommunikation: Auf B läuft kein Dienst auf TCP-Port 8080. B beantwortet weiterhin ICMP, kann aber auf diesem Port keine HTTP-Antwort liefern. Nicht der gesamte IP-Verkehr, sondern der gefragte Dienst fehlt.

<!-- pilot-cases:end -->

## Validação e limites

Os testes independentes de cálculo usam BigInt e extraem IPs/prefixos dos dados e perguntas alemãs, sem chamar o solver da fábrica. Conferem pertencimento, limites, exclusão de rede/broadcast, diferença em relação à própria IP e gateways locais dos exemplos hipotéticos.

As verificações dos casos inspecionam fatos, referências, gabaritos e preservação das observações nos dois mundos: gateway respondendo mesmo com arquivo indisponível; ICMP funcionando mesmo sem HTTP; link direto ausente tanto com router indireto quanto em ilhas isoladas. Há teste de correspondência entre esta documentação e todo o conteúdo alemão.

Isso **não é um verificador automático de lógica em linguagem natural**. Os checks editoriais específicos ajudam a detectar regressões conhecidas, mas não provam sozinhos que qualquer paráfrase futura seja coerente. A revisão manual registrada acima continua necessária. Estes casos não representam eventos reais da engine.

Validação executada com Node 24.21.0:

- Piloto + Rechenpraxis + fábrica: **897 testes aprovados em oito arquivos**, incluindo 21 novos testes do piloto e o fingerprint legado de 27 receitas. Os testes da E02 v2 também verificaram as 3.000 seeds existentes.
- Os 21 testes do piloto foram repetidos após o ajuste de tipagem da extração de endereços: aprovados.
- TypeScript estrito (tsc --noEmit): aprovado.
- Build Vite: aprovado, com o aviso já existente de chunk maior que 500 kB.
- Inspeção dos 14 bundles JavaScript: nenhum ID/conteúdo de registro do piloto presente. No código-fonte, só o teste importa a coleção.
- Links locais, UTF-8, whitespace dos novos arquivos e git diff --check: aprovados.
- Os cinco arquivos com alterações anteriores (três arquivos de UI/revisão e dois documentos da auditoria) conservaram seus hashes SHA-256.

Não houve revisão Chromium: não foi criada interface, entrada experimental ou fluxo de publicação. Os testes são autorais e não acessam IndexedDB ou dados reais do navegador. Nenhuma dependência foi instalada.

## Próxima etapa sugerida

Revisar juntos os oito cenários, em especial a simplicidade intencional de nd05-01/nd06-01 e a pergunta de causalidade em nd05-02. Depois, escolher um pequeno subconjunto para receitas versionadas, conservando os casos fixos como referências.

Antes de seeds: definir quais dados podem variar sem mudar o significado da pergunta; calcular limites independentemente; testar pares de mundos compatíveis para respostas abertas; rejeitar premissas contraditórias. Aumentar variedade estrutural e não apenas trocar endereços. Não reequilibrar respostas artificialmente, não alterar receitas/fingerprints E02 v1/v2 e não publicar conteúdo antes dessa revisão.

Uma eventual integração futura deve separar enunciados das respostas autorais, reutilizar a UI existente por adaptação explícita e manter o progresso/identidade das versões antigas. Publicação, novos menus e geração não fazem parte deste piloto.
