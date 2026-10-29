# Homepage principal: Packet Journey

## Acesso atual

Com `npm run dev`:

- Homepage principal: `http://localhost:5173/`
- Clássica, preservada temporariamente: `http://localhost:5173/?experience=classic` (sem link na navegação pública).
- URL antiga, ainda compatível: `http://localhost:5173/?experience=journey`
- Apenas scroll: `http://localhost:5173/?experience=journey&demo=scroll`
- Apenas cenas: `http://localhost:5173/?experience=journey&demo=slides`
- Composição alternada e animação DATA estão ativas por padrão. As URLs antigas com `stations=alternate` e `dataPreview=1` continuam válidas.
- Comparações anteriores: `?stations=original` retorna à composição anterior; `?dataPreview=0` oculta DATA. São overrides temporários de URL, sem preferência nova.
- Comparação com o movimento contínuo anterior: acrescente `&scrollMotion=continuous`.
- Título alternativo, apenas para comparação editorial: acrescente `&headline=break-fix`.

`main.tsx` abre o Packet Journey por padrão e carrega a homepage clássica somente com `experience=classic`. `experience.ts` centraliza esses defaults e os overrides de preview. A navegação experimental e o acesso à clássica ficam restritos aos protótipos explícitos `demo=scroll` / `demo=slides`; não aparecem na homepage pública, incluindo a URL antiga `experience=journey`. O identificador público é apenas “PACKET JOURNEY” (traduzido), sem “EXPERIMENT”.

Os CTAs usam o mesmo `editorHref` e o mesmo boot do editor; não criam uma simulação na homepage. O idioma reutiliza o seletor existente. A homepage usa Graphite Dark sem persistir essa escolha; a clássica e o editor continuam lendo o tema salvo pelo usuário. As demonstrações não importam store, engine, React Flow, xterm, Labs ou verificadores de exercícios. As seções seguintes também registram o histórico das versões experimentais, anterior à promoção; seus parâmetros opt-in não descrevem mais os defaults atuais.

## Escolha técnica

Foram avaliados [useScroll](https://motion.dev/docs/react-use-scroll) / [useSpring](https://motion.dev/docs/react-use-spring), do Motion, e a API v8 do Embla ([métodos](https://www.embla-carousel.com/docs/v8/api/methods), [eventos](https://www.embla-carousel.com/docs/v8/api/events)). Nenhum desses pacotes já estava instalado.

O protótipo usa SVG e controllers pequenos próprios. O scroll precisa de um progresso escalar e de um filtro sem overshoot. O hero é um único panorama SVG com câmera, não uma lista de slides DOM deslocáveis: introduzir um carrossel adicionaria outro estado para sincronizar sem necessidade. Nenhuma dependência foi instalada. Isso não impede uma migração futura para Motion/Embla se a apresentação ganhar requisitos que justifiquem essas bibliotecas.

## Experiência A: scroll

`ScrollJourney.tsx` apresenta cinco estações compactas: PC/terminal, Switch, Router, Server/Packet Capture e exercício. Seus offsets horizontais variam no desktop; no mobile, os equipamentos ficam na coluna esquerda e o conteúdo na direita. A altura não depende da animação.

O centro de `[data-station-port]` é medido diretamente no SVG de cada equipamento, incluindo viewBox e escala reais, por `ResizeObserver`, resize da janela, carregamento de fontes e troca de idioma. As curvas passam por esses conectores com tangentes verticais. A composição padrão mantém suas curvas originais; na alternativa, pernas verticais na coluna dos sprites e travessias arredondadas nos intervalos medidos entre fileiras evitam os painéis de texto. Não há leituras de layout a cada frame. `arrival.ts` calcula chegada, intensidade local e conclusão separadamente da geometria; ao retroceder, os estados voltam coerentemente.

O scroll escolhe uma estação-alvo usando os pontos médios entre os conectores e uma linha de leitura a 58% da altura da janela. Uma faixa de histerese de 14 px evita alternância perto do limite. `stationMotion.ts` calcula um único movimento até o conector, que continua quando a roda para. A duração considera o comprimento do trecho a 750 px/s, limitada a 300–1.100 ms. Alterar o destino substitui o movimento a partir da posição atual; não existe fila. Ao selecionar uma estação anterior, a inversão começa imediatamente, sem terminar a animação antiga. A linha percorrida usa `stroke-dashoffset` e o ponto usa `getPointAtLength`.

`scrollMotion=continuous` conserva o protótipo anterior: progresso contínuo ligado ao scroll, com `follow()` aplicando um filtro exponencial de 65 ms. Ambos encerram o rAF ao concluir e suspendem a animação fora da seção/documento visível. Restauração inicial e reduced motion posicionam diretamente no destino relevante; resize remapeia a posição entre os mesmos conectores antes de retomar o movimento.

Os exemplos mantêm dimensões estáveis. Ao atingir uma estação, o conector reage, o contorno recebe um destaque localizado e o exemplo é revelado: conexão `pc1 → sw1`, atividade ilustrativa de portas, próximo salto, linha ICMP e resposta de exercício. O pulso dura 550 ms; a intensidade de proximidade vem da posição do pacote, sem timers paralelos. Não executam comandos nem verificadores reais. Os textos principais permanecem acessíveis independentemente da animação. Eventos de scroll são passivos; roda, seleção e navegação não são bloqueadas.

O layout compacto aprovado continua padrão. `stations=alternate` coloca o equipamento à direita nas estações 1/3/5 (PC/Router/PC) e à esquerda nas estações 2/4 (Switch/Server). Os PNGs não são espelhados. A geometria considera os conectores reais e os limites medidos das fileiras, com 36 px de intervalo para a curva passar fora dos textos. Abaixo de 800 px, ambos usam a coluna de equipamentos à esquerda para preservar a leitura.

## Experiência B: cenas

`PacketScenes.tsx` mantém **um único elemento SVG do pacote**, um caminho de 1440 unidades e uma janela de 480 unidades. A câmera segue a posição, limitada às extremidades. Não há remontagem do indicador ao atravessar uma cena.

- Timeline completa: **21,24 segundos**; a resposta começa após 13,50 s.
- Três cenas manuais: progresso aproximado 0, 0,368644 e 0,567797, derivados das pausas da timeline.
- `HERO_TIMING` centraliza escala de movimento (1,5), escala de leitura (1), permanência no Router (1.260 ms), chegada (550 ms) e reinício (900 ms). `HERO_TIMELINE` separa **10,8 s de deslocamento**, **9,54 s de leitura** e **0,9 s de reinício**. Na ida, os deslocamentos duram 2,16 / 1,08 / 2,16 s; na volta, 2,43 / 1,35 / 1,62 s. As pausas de PC/Switch/Router/Server são 2,70 / 1,26 / 1,26 / 2,88 s, mais as pausas curtas de retorno. Somente a pausa de ida no Router foi reduzida pela metade (2,52 → 1,26 s); velocidades e demais segmentos foram mantidos.
- O easing `smoothStep` atua nos deslocamentos. Os pontos de parada são medidos no caminho, alinhados aos conectores dos PNGs. Seek interpola a distância separadamente do tempo de leitura, evitando saltos nas regiões de pausa; pausar mantém o seek e sua posição exata.
- Troca manual/replay: reposicionamento no mesmo caminho durante 650 ms, com descrição acessível. Pode ser pausado no meio.
- Autoplay inicia somente quando os PNGs terminam `Image.decode()`, o hero está visível, o documento está ativo e reduced motion está desligado. Enquanto carrega, há composição estática com placeholders; falha de decode mantém essa composição e apresenta aviso, sem iniciar movimento.
- O ciclo retorna à origem pelo mesmo caminho e permanece ali antes de reiniciar, sem salto espacial. Pause e seleção manual cancelam a intenção de autoplay; voltar à viewport não desfaz a pausa do usuário. Replay retorna controladamente ao início e reproduz.
- Setas, Home/End e Espaço no grupo complementam os botões nativos.
- Pausa por documento oculto ou seção fora da viewport conserva progresso e intenção de reprodução.

O hero utiliza títulos e frases curtas, em DE/EN/PT-BR. Sem o experimento de dados, identifica ICMP Request/Reply, mas não expõe explicações longas sobre ARP, quadros ou encapsulamento. A resposta continua uma nova mensagem na volta. A apresentação é ilustrativa: **não anima DORA/ARP nem executa protocolos**. O conteúdo pedagógico dos Labs/Übungen não é alterado.

`Packet.tsx`, `geometry.ts` e tokens `--journey-*` compartilham a identidade e funções geométricas. Scroll e cenas não compartilham progresso. Posição SVG é atualizada imperativamente; React recebe apenas mudanças de cena/estado, não cada frame.

`JourneyArtwork.tsx` reutiliza somente os metadados puros de `DEVICE_ARTWORK` e os PNGs estáticos `pc1`, `switch1`, `router1`, `server1`, sem importar o componente pesado `DeviceArtwork`. Os quatro arquivos originais somam aproximadamente 2,90 MB e são reutilizados pelo cache entre hero/estações; nenhum sprite foi modificado/gerado. O quinto exemplo reutiliza o PC. Conectores e luzes são ilustrações locais, não portas/LEDs reais da simulação. O carregamento dessas imagens é um custo novo da página experimental, não da clássica.

## Terminais ilustrativos e energia

`TerminalShowcase.tsx` fica entre hero e scroll. São dois exemplos HTML, sem xterm, execução de comandos ou acesso às sessões. Os fundos diagonais vermelho-escuro e azul-escuro se inspiram na apresentação existente dos terminais, sem copiar seu controlador ou configurações pessoais. Linux usa `ip addr`, `ip route`, `ping -c 4 <host>`; Windows usa `ipconfig /all`, `route print`, `tracert <host>`, verificados em `commands/shell.ts` e `commands/windows.ts`.

Ao entrar pelo menos 15% da dupla na viewport, uma introdução de 3,2 s revela o componente, digita `help` e mostra três linhas. Só ocorre uma vez por montagem; scroll e troca de idioma não reiniciam a digitação. Fora da viewport/documento oculto, o rAF é cancelado; após conclusão não existe rAF contínuo. Reduced motion apresenta diretamente o conteúdo final. Abaixo de 620 px os terminais ficam empilhados.

`EnergyBorder.tsx` desenha um retângulo SVG responsivo com `pathLength=100`. Nos dois terminais, duas passagens consecutivas percorrem a borda em 2 s no total, com a segunda um pouco mais intensa e fade final. A introdução continua única, com os mesmos textos, fundos, fontes e digitação. Nos painéis Switch/última estação, permanece o pulso de 1,2 s. Um pequeno `drop-shadow` local fornece luz sem máscara de pixels ou filtros SVG complexos. No scroll, é disparado por `data-arriving`, inclusive ao retornar, em vez de permanecer ligado ao estado concluído. Conector, borda e textos azuis também recebem uma confirmação de 850 ms, voltando aos valores normais. O token `--journey-flash` combina o acento com a cor de texto do tema para preservar contraste nos temas claros. Não existe loop de piscadas. Escolhemos o painel em vez de inventar uma silhueta frágil do PNG. Motion não foi necessário, e nenhuma dependência foi adicionada.

## Metáfora de dados (opt-in)

`DataPreview.tsx` desenha dois pequenos documentos SVG, sem assets novos. Com `dataPreview=1`, o documento próximo ao PC aparece, diminui e converge exatamente para `(140,170)` durante a pausa inicial. O indicador ganha luz antes de partir. No servidor, o documento reaparece durante a pausa já existente, desaparecendo antes da resposta. O hero usa rótulos de **metáfora visual** em vez de sugerir que um arquivo está sendo transportado por ICMP.

`dataPreviewState()` é função pura do progresso do controller existente: não possui timers, rAF próprio ou estado de protocolo. A apresentação acompanha a duração do hero, atualmente 21,24 s. Pause congela posição/opacidade; Replay e looping seguem o mesmo relógio. Durante seek, carregamento ou reduced motion, os documentos ficam invisíveis. Sem o parâmetro, os documentos nem são renderizados e o pacote mantém sua aparência anterior.

Tempos locais: entrada 300 ms, absorção até 1.700 ms, carga até 2.700 ms; reaparição de 850 ms após chegada ao servidor (10.620 ms) e fade nos 400 ms anteriores à resposta (13.500 ms). Chegada e partida são derivadas da timeline, sem um segundo relógio.

## Carregamento, F5 e acessibilidade

`main.tsx` carrega o módulo experimental sob demanda. O componente e CSS clássicos permanecem intactos. O carregamento tardio inicialmente fazia o Chromium restaurar scroll em uma página ainda vazia; `scrollRestore.ts` guarda somente a posição da **entrada atual de history**, sem localStorage/IndexedDB. A gravação é agrupada ao cessar o scroll e confirmada em `pagehide`. A recuperação não disputa com interações do usuário. O modo nativo de restauração anterior é devolvido ao sair/desmontar.

Com reduced motion, as cenas são estáticas e selecionáveis, Play fica desabilitado e os exemplos dos cards ficam visíveis. Não existem loops automáticos fora da viewport, loops de partículas ou timers contínuos. Listeners, observers, rAF e timer pontual de histórico são removidos na desmontagem. O caminho não intercepta eventos.

## Arquivos desta extensão

- `src/home/journey/`: duas experiências, página temática, geometria, packet, CSS, recuperação do scroll e testes.
- `src/home/main.tsx`: seleção opt-in do ponto de entrada.
- `src/i18n/catalogs/journey.ts`, `src/i18n/index.ts`, `src/i18n/i18n.test.ts`: mensagens DE/EN/PT-BR e contratos.
- `scripts/journey-review.mjs`, `scripts/test-journey.mjs`, `scripts/test-project-repository.mjs`: revisão no harness descartável existente.

Não confundir esses arquivos com alterações anteriores da homepage/i18n ainda não commitadas. Esta extensão não modifica `Home.tsx`, `HomeTopology.tsx`, `home.css`, engine, Scheduler, protocolos, sessões ou schema de projetos.

## Validação e reprodução

```powershell
node node_modules/vitest/vitest.mjs run src/home src/i18n src/commands/windows.test.ts
node scripts/test-journey.mjs
# Opcional: screencast JPEG com timestamps reais (ignorado pelo Git)
$env:NETLAB_JOURNEY_VIDEO='1'
node scripts/test-journey.mjs
Remove-Item Env:NETLAB_JOURNEY_VIDEO
npm run build
git diff --check
```

O runner abre Chromium real com perfil e origem temporários; não se conecta a `localhost:5173` nem ao perfil pessoal. O teste de entrada/retorno do editor cria/remove somente um banco sintético nessa origem. Preserva o sentinel de autosave do harness e não inicia downloads. Os testes verificam scroll reverso, paradas completas, geometria não recalculada durante scroll, altura estável, F5 intermediário, resize, seek/pausa/replay/teclado, identidade do indicador, idiomas durante reprodução, reduced motion, ausência de engine e layouts 390/700/1024/1440 em Graphite/Classic.

O evento de visibilidade oculta é injetado deterministicamente no documento headless; saída real da viewport é testada por scroll. Isso não equivale a medir bateria/CPU num notebook. `Performance.getMetrics` fornece apenas uma comparação diagnóstica de tempo da thread principal no navegador de teste.

O gerador Visual Review existente publica quatro PNGs principais em `.playwright-mcp/reviews/`, arquiva a revisão anterior e guarda extras/galeria em `raw/`. Capturas, quadros, vídeo, relatórios e build ficam ignorados pelo Git.

### Resultado da primeira versão em 28/10/2026

- **272 testes em 20 arquivos aprovados**, incluindo homepage/i18n e regressões de workspace, persistência, clipboard, áreas e exercícios.
- **114 casos no runner Chromium**: 103 compartilhados e 11 da jornada. Zero exceções JavaScript e zero downloads.
- TypeScript, build e `git diff --check` aprovados. O aviso preexistente de chunk grande do editor continua; esta tarefa não o altera.
- **20 capturas**, das quais quatro foram selecionadas para compartilhar. Galeria: `.playwright-mcp/reviews/raw/2026-10-28--packet-journey/index.html`.
- Vídeo real de aproximadamente 27 segundos: `packet-journey-review.mp4` na mesma pasta raw, 1,4 MB. Capturado por screenshots CDP em cerca de 4,6 fps efetivos e codificado com ffmpeg já instalado; serve para revisar o percurso, **não para avaliar a fluidez de 60 fps**. Não foram gerados frames artificiais/interpolados.
- Medição diagnóstica em 1,5 s: JavaScript parado **0 ms**, reproduzindo **21,5 ms**; tarefas da thread principal **1,1 ms** versus **74,5 ms**. Vite dev/headless e carga da máquina influenciam esses números; não são porcentagem de CPU nem benchmark de produção.
- Bundle experimental sob demanda: **15,31 kB JS / 5,22 kB gzip** + **7,52 kB CSS / 2,01 kB gzip**. O catálogo DE/EN/PT-BR adicional participa do chunk compartilhado: o JS inicial clássico ficou em aproximadamente **180,11 kB / 60,52 kB gzip**, contra cerca de 170/57 kB registrados na etapa anterior. Nenhum pacote externo foi incluído.
- Hashes conferidos: os três arquivos da homepage clássica, store, simulação, Scheduler, banco e manifests de dependências permaneceram idênticos ao início desta extensão.

Não houve commit nem push. As alterações anteriores de homepage e i18n continuam locais e foram preservadas.

### Refinamento com assets reais — 28/10/2026

- Arquivos desta rodada: `JourneyArtwork.tsx`, `arrival.ts`, `geometry.ts`/teste, `PacketScenes.tsx`, `ScrollJourney.tsx`, `journey.css`, catálogo/testes i18n, `journey-review.mjs`, pequena assinatura de eventos CDP no harness compartilhado e este documento. URLs, boot, restauração de scroll, background e controladores permanecem os mesmos.
- **48 testes direcionados em quatro arquivos aprovados**; **116 casos Chromium** (103 compartilhados + 13 específicos), zero exceções JS e zero downloads. TypeScript, build e `git diff --check` aprovados.
- **60 chegadas medidas** (5 estações × 4 larguras × 3 idiomas): erro máximo de **0,53 px**, incluindo o arredondamento do scroll do navegador. No hero, chegada medida ao Switch com desvio inferior a **0,001 px**. Medições ocorrem somente quando o layout muda.
- Cinco estações ocupam aproximadamente **1.256 px** em 1440 px/PT-BR; a captura principal mostra três estações e uma chegada luminosa. A revisão contém **22 imagens**, sendo quatro PNGs principais de antes/depois em `.playwright-mcp/reviews/`. Os originais anteriores foram conservados/arquivados.
- Galeria atual: `.playwright-mcp/reviews/raw/2026-10-28--packet-journey-refined--02/index.html`.
- Vídeo: `packet-journey-refined.mp4` na mesma pasta. **479 frames reais / 27,47 s**, média **17,4 fps**; nos intervalos de movimento, aproximadamente **29,4 fps**. Screencast CDP só envia novos frames quando necessário, por isso as pausas baixam a média. Os timestamps originais foram mantidos em vídeo VFR; não há interpolação de imagens. ffmpeg já estava disponível, sem instalação.
- As capturas anteriores e refinadas usam os mesmos temas, idiomas e dimensões. O enquadramento do scroll refinado prioriza a chegada exata ao Switch; a composição mudou, portanto não representa o mesmo offset em pixels do documento antigo.
- Restrição intencional: nomes/portas são dados sintéticos. Brilhos e exemplos não são telemetria real, e o exercício ilustrado não executa um verificador.

## Limites intencionais

- A apresentação é conceitual, não uma captura da simulação. Não demonstra ARP animado ou validação real de exercícios.
- As cenas usam câmera contínua, não swipe de carrossel. Navegação arbitrária é um reposicionamento explícito, sem teletransporte invisível.
- O idioma pode alterar naturalmente a altura dos cards; a geometria é recalculada. O progresso não é uma simulação persistida.
- No mobile, a trilha é simplificada para manter texto livre. Em telas baixas, é necessário rolar para ver todos os controles do hero.
- As animações continuam experimentais; a homepage clássica permanece como entrada padrão.

## Polimento: autoplay, terminais e composição alternativa — 28/10/2026

Arquivos desta rodada: `PacketScenes.tsx`, `geometry.ts`/teste, `ScrollJourney.tsx`, `ThematicHome.tsx`, `journey.css`, novos `TerminalShowcase.tsx`/teste e `EnergyBorder.tsx`; catálogo/teste i18n, `scripts/journey-review.mjs` e este documento. Nenhum arquivo de terminal real, engine, persistência, Labs, exercícios ou assets foi alterado nesta rodada.

Comparação visual: a composição alternativa tem mais variação horizontal e intercala o lado dos painéis; alguns segmentos ficam ocultos atrás deles. A composição aprovada mantém a trilha mais fácil de acompanhar e continua como padrão. Os dois layouts usam exatamente a mesma medição de conectores e a mesma animação reversível. No mobile, convergem para o layout de leitura mais simples.

Validações técnicas: **60 testes direcionados em seis arquivos**, TypeScript, build e `git diff --check` aprovados. O módulo experimental tem **21,07 kB JS / 7,22 kB gzip**, **14,00 kB CSS / 3,28 kB gzip**, além dos metadados compartilhados dos assets. Permanece o aviso preexistente sobre o chunk grande do editor. Os nove arquivos protegidos conferidos por SHA-256 continuam intactos, incluindo a homepage clássica e os manifests de dependências.

Os testes Chromium esperam um ciclo real de 22,5 s (sem avançar o relógio artificialmente), injetam atraso/falha de decode, verificam pausa manual, mudança de idioma, introdução única dos terminais, reduced motion inicial e posterior, layouts/temas e chegadas nas duas composições. A falha de decode é sintética; não representa um teste offline completo. A revisão de limpeza dos efeitos confirma cancelamento dos rAFs e remoção de observers/listeners na desmontagem; a navegação de ida/volta é também exercitada pelo runner. Não foi realizado um benchmark prolongado de memória/bateria.

Resultado final: **120 casos Chromium aprovados** (103 compartilhados + 17 da jornada), zero exceções JavaScript e zero downloads. Os dois lados do reinício do ciclo apresentaram a mesma posição `translate(140.000 170.000)`. Nas 60 chegadas da matriz principal, o desvio máximo foi **0,524 px**; no hero, menos de **0,001 px**. A alternativa também foi conferida em avanço/retorno nas quatro larguras e dois temas, abaixo da tolerância de 1,5 px.

A revisão reúne **56 capturas / 53 imagens únicas**, com quatro PNGs principais em `.playwright-mcp/reviews/`. Galeria completa e capturas anteriores comparativas: `.playwright-mcp/reviews/raw/2026-10-28--packet-journey-polish/index.html`. O arquivo `packet-journey-polish.mp4`, na mesma pasta, registra hero, introdução dos terminais e scroll em **35,58 s / 590 frames reais**, cerca de **30 fps durante o movimento** e 16,55 fps médios incluindo pausas. Codificação VFR preserva os timestamps, sem interpolação; foi usado ffmpeg já instalado. Os originais e frames permanecem ignorados pelo Git.

Diagnóstico da thread principal em intervalos de 1,5 s: parado **0 ms de JavaScript / 1,50 ms de tarefas**; reproduzindo **21,86 ms / 42,12 ms**. São medições de uma execução dev/headless, não porcentagem de CPU nem garantia de desempenho em outros computadores. Nenhum commit/push foi realizado.

## Refinamento das estações e experimento de dados — 28/10/2026

Esta rodada substitui somente a composição **alternativa** anteriormente descrita nos resultados históricos. Agora a sequência equipamento/painel é direita/esquerda/direita/esquerda/direita. `alternatingScrollSegments()` recebe conectores e limites das fileiras, passa verticalmente pela coluna do equipamento e atravessa o intervalo com curvas quadráticas de raio limitado. Não é um espelhamento do sprite nem um desvio atrás do texto. O layout padrão mantém a construção cúbica anterior.

Legibilidade: descrições 13 → 14 px; demonstrações 12 → 13 px, detalhes de captura/rota 11 → 13 px e legendas de exemplo 9 → 10 px. Textos pequenos auxiliares ficam em 12 px. O espaço equipamento/painel passa de 24 para 32 px no desktop padrão e para 40 px na alternativa. Os intervalos verticais da alternativa são 36 px para acomodar a travessia, sem seções de tela inteira. As fontes gerais e a seção dos terminais não foram modificadas.

Arquivos desta rodada: `ScrollJourney.tsx`, `geometry.ts`/teste, `journey.css`, `PacketScenes.tsx`, novos `DataPreview.tsx`/teste, `src/i18n/catalogs/journey.ts`, `scripts/journey-review.mjs` e este documento. Os arquivos de terminal real e ilustrativo, a homepage clássica, o background, os assets, engine e persistência permanecem intactos.

**64 testes em sete arquivos**, TypeScript e build aprovados. O módulo experimental agora possui **23,05 kB JS / 7,94 kB gzip** e **15,91 kB CSS / 3,56 kB gzip**; nenhuma biblioteca foi adicionada. O aviso de chunk grande do editor já existia.

Validação final: **122 casos Chromium aprovados** (103 compartilhados + 19 da jornada), zero exceções JS e zero downloads. A matriz verificou lados corretos e amostrou o percurso a cada 2 px, com margem de 2 px ao redor dos painéis: nenhuma interseção na composição alternativa em 390/700/1024/1440, Graphite Dark/Classic Light. Também verificou pulsos que terminam e reagem ao retorno, os três idiomas, o preview opcional, pausa/replay e reduced motion. Os 60 pontos da matriz principal tiveram erro máximo de **0,501 px**. As cinco estações padrão medem **1.263 px** em 1440/PT-BR, contra cerca de 1.256 px antes: fontes maiores sem expansão significativa da página.

Revisão: cinco PNGs principais em `.playwright-mcp/reviews/`; **66 capturas / 62 imagens únicas** na galeria `.playwright-mcp/reviews/raw/2026-10-28--packet-journey-composition/index.html`. A revisão anterior foi arquivada, sem apagar originais. `data-preview-review.mp4`, na mesma pasta, tem **31,98 s / 727 frames reais**, aproximadamente **30 fps durante movimentos** e 22,7 fps médios, com timestamps preservados. Inclui o ciclo do preview e o scroll alternativo. As capturas confirmam a reaparição do pequeno documento junto ao Server; o experimento permanece exclusivamente opt-in.

Limitação visual intencional: para manter o cabo fora dos textos, a alternativa usa trechos horizontais maiores com cantos arredondados; tem uma aparência mais diagramática que as curvas livres da composição padrão. No mobile, a alternância é simplificada. O preview representa dados abstratos, não transferência real de arquivos. A medição diagnóstica da thread principal em 1,5 s foi 0 ms de JS parado versus 12,66 ms reproduzindo (tarefas: 1,29 / 27,23 ms); não é benchmark de CPU/bateria, nem uma medição isolada do preview.

`git diff --check` aprovado. Hashes dos arquivos protegidos, dos terminais e do componente principal da homepage temática foram conferidos. Não houve commit nem push; trabalhos locais anteriores foram preservados.

## Ritmo e movimento por estações — 28/10/2026

Diagnóstico: o controlador anterior já mantinha conectores/comprimentos em cache, sem renders React por frame. O filtro de 65 ms perseguia qualquer pequena variação da posição de scroll e podia parar entre conectores. A comparação Chromium instrumentou `getBoundingClientRect()` durante os gestos: **zero chamadas nos dois modos**, sem alteração do contador de medições da geometria. Isso confirma o comportamento observado sem atribuí-lo a um gargalo de layout que não foi encontrado.

O modo padrão agora escolhe estações. Há somente um objeto de movimento substituível, sem fila, com easing limitado ao caminho existente. Ao parar a roda depois da ativação, o ponto termina no conector. A seleção muda ao cruzar o ponto médio entre estações, com margem de 14 px em cada direção. Assim que uma estação anterior é selecionada, o movimento inverte da posição exibida; não espera a animação antiga terminar. Scroll rápido pode escolher diretamente a última estação relevante, com duração máxima de 1,1 s para todo o deslocamento. Pequenos movimentos dentro da faixa de histerese conservam o destino.

Resize remapeia a fração percorrida entre os mesmos dois conectores. A primeira medição após F5 escolhe o destino correspondente à posição restaurada, sem replay dos trechos anteriores. Offscreen, documento oculto e reduced motion não mantêm o rAF de movimento. Nenhum handler de wheel/touch é bloqueado. O modo `scrollMotion=continuous` permanece como comparação reversível, sem preferência persistente ou novo controle na interface.

Hero: apenas a pausa de ida no Router mudou, de 2.520 para **1.260 ms**. A duração total passou de 22,5 para **21,24 s**; as durações de movimento, as outras pausas, os controles, autoplay/loop e o preview DATA permanecem sincronizados. O teste de DATA verifica os novos instantes derivados da chegada/saída do Server. Terminais: duas passagens em **2 s**, sem repetição infinita, nos dois consoles; fundos, tipografia, comandos e introdução de 3,2 s mantidos.

Arquivos: `stationMotion.ts`/teste, `ScrollJourney.tsx`, `geometry.ts`/teste, `DataPreview.test.ts`, `PacketScenes.tsx` (metadados de duração/progresso para revisão), `TerminalShowcase.tsx`, `journey.css`, runner de revisão e este documento. **68 testes em oito arquivos**, TypeScript e build aprovados. Bundle experimental: **24,27 kB JS / 8,47 kB gzip**, **16,24 kB CSS / 3,60 kB gzip**. Continua o aviso preexistente de chunk grande do editor; nenhuma dependência foi instalada.

Resultado final: **123 casos Chromium aprovados**, zero exceções JS e zero downloads. As 60 chegadas da matriz de larguras/idiomas tiveram desvio máximo inferior a **0,001 px**, pois agora o destino é o próprio conector, sem o arredondamento do scroll interferir na distância final do pacote. F5 intermediário, resize, dois temas, quatro larguras, reduced motion, cancelamento/reversão e saída da seção foram exercitados. Os eventos `mouseWheel` CDP simulam deltas de touchpad; não foi utilizado um touchpad físico, e a matriz de resize não equivale a testar todos os níveis de zoom do navegador por sua interface nativa.

Comparação no mesmo enquadramento: após parar em 40% do intervalo de scroll entre as duas primeiras estações, o modo contínuo ficou em progresso **0,092143**, no meio do trajeto. O modo por estações permaneceu no primeiro conector (**0**) até cruzar o limiar; depois completou a ida mesmo sem novos eventos de scroll. Ambos registraram zero leituras de retângulos e zero novas medições geométricas durante a sequência. Não foi inferida uma melhora de CPU a partir dessa comparação: a mudança principal é o modelo de interação.

Revisão: **68 capturas / 64 imagens únicas**, quatro PNGs principais em `.playwright-mcp/reviews/`, extras e galeria em `.playwright-mcp/reviews/raw/2026-10-28--packet-journey-rhythm/index.html`. `station-motion-review.mp4` na mesma pasta registra hero, duas passagens luminosas e scroll lento/rápido/reversão: **22,77 s / 537 frames reais**, aproximadamente **30 fps durante movimentos** e 23,54 fps médios. Timestamps VFR preservados, sem frames interpolados, usando ffmpeg já instalado. Originais e revisões anteriores conservados. `git diff --check` aprovado; sem commit/push.

## Refinamento editorial e hierarquia — 29/10/2026

Título principal: **Build. Connect. Understand. / Bauen. Verbinden. Verstehen. / Construa. Conecte. Entenda.** Cada frase ocupa sua própria linha. O apoio apresenta construção, exploração e aprendizado prático. `headline=break-fix` permite comparar a alternativa em quatro passos sem mudar o padrão nem criar uma preferência.

O card do hero mantém uma única indicação visível de demonstração ilustrativa. Títulos/descrições de cena são breves; protocolo e status normais permanecem somente na camada acessível. Falhas/carregamento de assets continuam com aviso visível. Foram removidos o rodapé técnico e a indicação duplicada na coluna de texto. Nenhuma funcionalidade de reprodução foi removida.

Uma barra reúne Anterior, três indicadores de cena, Próximo, Play/Pause e Replay. Os ícones são SVG pequenos, com nomes acessíveis e tooltips traduzidos. Os indicadores têm alvos de 32 × 38 px; a maioria dos outros controles usa pelo menos 36 × 38 px. Play/Pause mantém texto no desktop e ícone identificado por aria-label no mobile. Tab, Enter/Espaço, setas e Home/End continuam disponíveis. Foco visível usa os tokens existentes.

Os nomes visíveis do hero são PC/Computer/Computador, Switch, Router/Roteador e Server/Servidor. Os IDs internos usados como chaves não foram alterados. Rótulos técnicos abaixo dos sprites do scroll foram removidos; os próprios conectores continuam medidos pelo controlador existente.

Tipografia seletiva, apenas sob `.journey-page`: título até 66 px (antes 58), apoio 19 px (17), títulos de seção 24 px (21), títulos dos painéis 23 px (21) e descrições 15,5 px (14). A navegação e textos auxiliares também receberam incrementos menores. As fontes e cores internas dos consoles não mudaram. No desktop a partir de 901 px de largura e 760 px de altura, o hero usa `min-height: calc(100svh - 140px)` para considerar a navegação e centralizar o conteúdo. Mobile/janelas baixas mantêm altura natural, sem bloquear scroll ou esconder controles. A regra afeta somente a homepage experimental.

Os textos DE/EN/PT-BR foram revisados para reduzir repetições e jargão. A ideia **Future network defense challenge / Netzwerkverteidigung** foi registrada na seção de ideias futuras de `docs/DESIGN.md`, sem anúncio de funcionalidade disponível ou implementação de exercício.

Arquivos desta rodada: `ThematicHome.tsx`, `PacketScenes.tsx` (apenas apresentação), `ScrollJourney.tsx` (remoção dos rótulos), `journey.css`, catálogo `journey.ts`, runner de revisão, `docs/DESIGN.md` e este documento. Foram conferidos hashes de **11 blocos/arquivos**: os dois efeitos controladores e os módulos de geometria, movimento, DATA, sprites, terminais, EnergyBorder e restauração permanecem idênticos. Timeline continua em **21,24 s**. Os resultados das etapas anteriores acima são históricos, não descrevem a quantidade atual de controles/textos visíveis.

Validação: **68 testes direcionados em oito arquivos**, TypeScript, build e `git diff --check` aprovados. **124 verificações funcionais Chromium** passaram, com zero exceções JavaScript e zero downloads. A matriz editorial acrescenta **60 combinações**: DE/EN/PT-BR × Graphite Dark/Classic Light × 390/700/1024/1440/1920 × equivalentes de 100%/120%. O zoom foi emulado por viewport CSS e deviceScaleFactor correspondentes; não foi acionado o zoom nativo pela UI do navegador. Nenhum overflow horizontal ou controle fora do card nas 60 combinações. Em 30 combinações desktop, a seção dos terminais ficou depois da primeira viewport. Também foi conferida janela de 600 px de altura com título/apoio ampliados, mantendo acesso aos controles por scroll.

Enter nativo nos indicadores e no botão Próximo foi exercitado com códigos de tecla completos no CDP; os testes anteriores continuam verificando autoplay, pausa/Replay, setas/Home/End, F5 e reduced motion. O gerador inicialmente rejeitou metadados com `pt-BR` em maiúsculas; os IDs das capturas foram normalizados para `pt-br`, o runner foi corrigido e a galeria foi gerada separadamente a partir das mesmas imagens, sem recapturar ou apagar os originais.

Revisão: **130 capturas / 126 imagens únicas**, com quatro PNGs prontos em `.playwright-mcp/reviews/`: `01-hero-before`, `02-hero-after`, `03-controls-before`, `04-controls-after`. Primeira tela comparada em 1440 × 950, Graphite/DE, mesma cena manual; detalhes dos controles em 720 × 240. As imagens anteriores vieram da revisão real precedente e foram preservadas; o detalhe anterior é apenas um recorte mecânico. Galeria completa: `.playwright-mcp/reviews/raw/2026-10-29--packet-journey-editorial/index.html`. Os exemplos em 390 px/120% e 1920 px foram inspecionados visualmente, além das asserções de layout. A alternativa em quatro passos fica nas extras; o título principal em três passos é a recomendação editorial.

Bundle experimental: **25,57 kB JS / 8,81 kB gzip**, **16,90 kB CSS / 3,77 kB gzip**. Nenhuma dependência foi adicionada. Permanece o aviso preexistente sobre o chunk do editor. Homepage clássica, engine, banco, manifests e trabalhos locais anteriores preservados. Sem commit/push.

## Polimento final de navegação e textos — 29/10/2026

- Hero: **Start a new project / Continue learning**, com **Browse projects / Explore exercises** como links secundários. Traduções naturais DE/EN/PT-BR ficam no catálogo `journey.ts`, sem alterar os textos da homepage clássica. Os destinos são, respectivamente, `app.html?home=new`, `app.html`, `app.html?home=load` e `app.html?home=exercises`. O catálogo de planos vazio continua exibindo a explicação existente; não há rota fictícia nem criação implícita ao visitar a homepage.
- A homepage temática usa temporariamente Graphite Dark por `applyUiTheme`, sem chamar `setTheme`, alterar localStorage ou remover temas. Ao desmontar, reaplica a preferência atual do store. Editor e homepage clássica mantêm a preferência salva. O seletor de tema foi removido somente da página experimental.
- Não havia seletor de backgrounds na homepage: o controle auditado era de UI Theme. O preset de canvas `original` tem `image: null`, portanto recebeu o nome visual **Classic Blue**, sem alterar seu ID, imagem, default, persistência ou outros fundos. O tema Original do editor continua disponível.
- Bandeiras foram experimentadas apenas no DOM do navegador descartável. Chromium/Windows mostrou letras de país (por exemplo, `GB`), não as bandeiras. Foi mantido o select nativo com os nomes escritos, sem novo componente ou dependência.
- A seção usa **INSIDE NETLAB / NETLAB ENTDECKEN / CONHEÇA O NETLAB**. Os cinco exemplos receberam rótulos específicos traduzidos: Connection, Switch Ports, Routing, Packet Capture e Quick Check. O primeiro mostra `PC → Switch`; o segundo não repete a descrição de atividade. Redes IPv4, tabela e pergunta/resposta ARP foram preservadas.
- Avisos repetidos foram retirados do hero e das barras dos dois consoles. Uma única nota discreta informa que são exemplos visuais, sem tráfego real. Conteúdo, digitação, cores e efeitos dos terminais não foram alterados.
- A medição em 1440 × 950 encontrou a transição para o Switch com conector em **662 px (69,7% da viewport)** e região da estação entre **531 e 763 px**. A seleção já antecede a passagem do conector pela linha de leitura de 58%; não foi constatado atraso do controlador que justificasse mudar o ritmo aprovado. Foram mantidos linha, histerese, durações, reversão, retargeting e geometria. As capturas comparativas têm os mesmos enquadramentos; textos podem influenciar naturalmente a altura do conteúdo, sem offsets novos.

Arquivos desta rodada: `ThematicHome.tsx`, `PacketScenes.tsx`, `ScrollJourney.tsx`, `TerminalShowcase.tsx` (somente markup/textos), `src/i18n/catalogs/journey.ts`, `src/i18n/i18n.test.ts`, `src/canvasBackground.ts` (somente label), `scripts/journey-review.mjs` e este documento. Nenhuma alteração CSS foi necessária. Não promove a experiência a homepage padrão.

Validação focada: **80 testes em oito arquivos**, TypeScript, build e `git diff --check` aprovados. Chromium isolado: quatro acessos reais, lista vazia de projetos, F5/idioma, preservação de tema/background, retorno à clássica/editor, **24 combinações** de DE/EN/PT-BR × 390/700/1440/1920 × equivalentes de 100%/120%, sem overflow horizontal. Zoom equivalente via viewport CSS/deviceScaleFactor, não pelo menu nativo. O aviso de chunk grande do editor permanece preexistente. Nenhum dado do perfil real foi acessado.

A regressão Chromium completa da jornada terminou com **125 verificações aprovadas**, sem exceções JavaScript nem erro do runner/galeria. Inclui DATA, autoplay, pausa/replay, scroll rápido/reverso, reduced motion, teclado, restauração e chegada aos conectores. Os checks históricos de contraste em Classic Light continuam disponíveis por override de atributo DOM exclusivo do teste; não reintroduzem um seletor na página nem gravam esse tema.

Capturas: **seis PNGs principais** em `.playwright-mcp/reviews/`: `01-hero-before.png`, `02-hero-after.png`, `03-terminals-before.png`, `04-terminals-after.png`, `05-stations-before.png`, `06-stations-after.png`. Galeria/extras: `raw/2026-10-29--packet-journey-final-polish/index.html` (159 registros / 151 imagens únicas). Inclui a experiência descartada com bandeiras e as matrizes responsivas. As revisões anteriores foram arquivadas, sem apagar originais. Sem commit ou push.

## Checkpoint antes da promoção — 29/10/2026

Os dois ajustes editoriais finais usam o catálogo existente: o subtítulo de INSIDE NETLAB convida a acompanhar a conexão entre dispositivos; a frase inferior dos consoles apresenta layouts e cores personalizáveis, nos três idiomas. A frase continua pequena e centralizada, sem alteração de CSS. Esses textos substituem as descrições anteriores registradas nas etapas acima.

Auditoria final: **323 testes relevantes em 28 arquivos**, TypeScript, build e `git diff --check` (incluindo arquivos novos preparados no índice) aprovados. A rodada combinada Chromium passou **138 verificações**, sem exceções JavaScript ou downloads, em perfil/origem descartáveis. Uma primeira execução foi interrompida quando uma limpeza de whitespace coincidiu com o recarregamento do Vite; a repetição completa ocorreu com os arquivos estáveis e terminou sem falhas. O aviso preexistente de chunk grande do editor permanece.

Código, testes e documentação foram revisados para o checkpoint. Screenshots, vídeos, logs, caches, perfis de navegador, assets experimentais e `dist` permanecem fora dos commits pelas regras de ignore existentes. A homepage temática continua opt-in por `experience=journey`, os protótipos foram preservados e nenhuma promoção para `/` foi realizada. Não houve acesso a dados reais nem push.

## Promoção à homepage principal — 29/10/2026

`/` agora abre diretamente o Packet Journey com composição alternada, DATA, movimento por estações, autoplay/looping e Graphite Dark. Os tempos, os dois controladores, geometria, CSS, assets, terminais, efeitos e restauração do scroll foram comparados com o checkpoint e preservados. A retirada dos links de protótipos libera naturalmente o espaço que ocupavam, sem novas regras de layout. A homepage clássica continua disponível em `?experience=classic`; protótipos individuais e overrides permanecem documentados no início deste arquivo.

`experience.ts` centraliza a seleção de homepage e os defaults visuais. Não escreve preferências nem acessa a engine ou IndexedDB. Graphite Dark continua sendo uma aplicação temporária ao documento da homepage; o editor recupera seu tema salvo. Os quatro CTAs preservam os destinos e os handlers existentes. A clássica é carregada sob demanda somente quando solicitada.

Validação: **245 testes relevantes em 19 arquivos**, TypeScript, build e `git diff --check` aprovados. **139 verificações Chromium** passaram sem exceções JavaScript ou downloads, incluindo abertura de plano salvo pela lista pública, retomada de rascunhos, novo projeto, exercícios, retorno do editor, Share Links, fallback clássico, URLs anteriores, F5/idiomas, DATA, autoplay/loop, scroll reverso, reduced motion e teclado. A nova matriz de `/` cobre DE/EN/PT-BR em 390/700/1440 px; as matrizes anteriores também conferem 1024/1920 px e zoom equivalente a 120%. Nenhum dado do navegador real foi acessado. Permanece somente o aviso preexistente do build sobre o tamanho do chunk do editor.

Revisão: **6 PNGs principais**, todos capturados em `/`, em `.playwright-mcp/reviews/`: `01-homepage-en.png`, `02-homepage-de.png`, `03-homepage-pt-br.png`, `04-homepage-mobile.png`, `05-terminals.png`, `06-stations.png`. Extras e galeria: `raw/2026-10-29--packet-journey-official/index.html` (167 registros / 162 imagens únicas). Revisões anteriores arquivadas e artefatos ignorados pelo Git. Arquivos desta rodada: `src/home/main.tsx`, `experience.ts`/teste, `journey/ThematicHome.tsx`, seletores de defaults em `PacketScenes.tsx`/`ScrollJourney.tsx`, catálogo `journey.ts`, os dois runners de revisão e os documentos de homepage. Sem commit ou push.
