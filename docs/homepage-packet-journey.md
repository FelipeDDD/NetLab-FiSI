# Homepage oficial: Packet Journey

## Entradas e isolamento

- `/` abre a homepage completa, sem flags. Em desenvolvimento: `http://localhost:5173/`.
- `/app.html` continua sendo a entrada independente do editor.
- `experience`, `demo`, `stations`, `dataPreview`, `scrollMotion` e `headline` são ignorados na homepage. URLs antigas abrem a apresentação oficial; não há redirecionamento nem reescrita da query/hash.
- A homepage clássica e os modos exclusivos de protótipo foram removidos. São recuperáveis no checkpoint `311e70c` (promoção), precedido por `254ab0c` e `01b64ab`.

A homepage não importa engine, store de rede, React Flow, xterm, Session Controller ou repositório de projetos. Não abre IndexedDB, cria planos ou inicia migrações. A antiga leitura de planos recentes era exclusiva da homepage clássica e foi removida; planos salvos continuam acessíveis pelo diálogo do editor.

Graphite Dark é aplicado apenas ao documento da homepage. A preferência de tema/background do editor não é sobrescrita. O idioma DE/EN/PT-BR usa a preferência compartilhada `netlab:language:v1` (DE na ausência de escolha).

## Navegação real

| Ação (EN) | Destino |
| --- | --- |
| Start a new project | `./app.html?home=new` |
| Continue learning | `./app.html` |
| Browse projects | `./app.html?home=load` |
| Explore exercises | `./app.html?home=exercises` |
| Browse Labs, no encerramento | `./app.html?home=labs` |

`src/home/navigation.ts` mantém `editorHref`, `readHomeIntent` e `consumeHomeIntent`. O editor consome a intenção uma única vez, após seu boot normal. Share Links continuam tendo prioridade sobre uma intenção de criação. Retomar usa a recuperação existente; visitar a homepage não abre uma segunda simulação. URLs de projeto por ID permanecem compatíveis.

## Arquitetura definitiva

| Arquivo | Responsabilidade |
| --- | --- |
| `src/home/main.tsx` | Entrada React, idioma, CSS compartilhado da homepage e carregamento da apresentação. |
| `src/home/journey/ThematicHome.tsx` | Composição oficial, ações, idioma, tema temporário e restauração do scroll. |
| `PacketScenes.tsx` | Hero de três cenas: autoplay/loop, pausa, replay, teclado, assets prontos e visibilidade. |
| `geometry.ts` | Trajeto e timeline do hero, câmera, conectores e geometrias desktop/mobile do scroll. |
| `DataPreview.tsx` | Documento DATA no PC e servidor, derivado exclusivamente do progresso do hero. |
| `ScrollJourney.tsx` | Cinco estações alternadas, medição dos conectores SVG e controller por estações. |
| `stationMotion.ts` | Destino, histerese, deslocamento suave e remapeamento após resize. |
| `scrollRestore.ts` | Posição de scroll por entrada de histórico, incluindo F5 e voltar. |
| `JourneyArtwork.tsx`, `Packet.tsx` | PNGs compartilhados com o editor e indicador SVG persistente. |
| `arrival.ts`, `EnergyBorder.tsx` | Chegada, iluminação e bordas SVG, sem engine. |
| `TerminalShowcase.tsx` | HTML ilustrativo Linux/Windows; não executa comandos nem cria sessões xterm. |
| `src/home/home.css`, `journey.css` | Estilos da homepage; tokens gerais vêm de `themes.css`. |
| `src/i18n/catalogs/journey.ts`, `home.ts` | Conteúdo aprovado e textos de navegação/footer. |

Os nomes `Journey`, `DataPreview` e a classe `journey-scroll-alternate` identificam componentes ativos, não opções experimentais. `scrollSegments()` continua necessário para o corredor mobile; somente `follow()`/`scrollProgress()` do antigo scroll contínuo foram removidos. Nenhum PNG era exclusivo dos protótipos removidos; todos os assets foram preservados.

## Comportamento visual preservado

### Hero

- **Build. Connect. Understand.**, traduções aprovadas e nomes localizados dos dispositivos.
- Timeline de **21.240 ms**, centralizada em `geometry.ts`; movimento total 10.800 ms, leitura 9.540 ms e reset 900 ms. Pausa do router 1.260 ms, chegada 550 ms, busca manual 650 ms.
- Um indicador persistente percorre o mesmo cabo SVG; a câmera acompanha o trajeto. A resposta retorna a partir de 13.500 ms, sem importar ICMP real.
- DATA está sempre habilitado. O documento aparece e converge para `(140,170)` no PC e reaparece no servidor durante a pausa existente. Não tem relógio próprio nem representa transferência real de arquivo.
- Autoplay começa após `Image.decode()` e quando visível. Falha de asset deixa a ilustração estática com aviso; pausa manual não é desfeita ao voltar à viewport.
- Reduced motion mantém cenas estáticas e controles de cena; DATA não anima. Documento oculto/offscreen suspende os frames.

### Terminais ilustrativos

Linux vermelho e Windows azul, exemplos de comandos existentes, introdução de 3,2 segundos e duas passagens luminosas em 2 segundos. O efeito executa uma vez, pausa fora da área visível e respeita reduced motion. Texto de personalização e cores/timings permanecem os aprovados. Não é o terminal xterm do editor.

### Scroll Journey

- Cinco estações: conexão, switch, roteamento, captura e exercício. Desktop alterna direita/esquerda/direita/esquerda/direita; até 800 px mantém equipamentos à esquerda.
- Conectores reais medidos via `getBoundingClientRect()` e `ResizeObserver`; cálculo também responde a fontes, idioma e resize. Curvas desktop passam pelos intervalos de 36 px entre fileiras, fora dos painéis. PNGs não são espelhados.
- Linha de leitura em 58% da viewport; seleção por ponto médio com histerese de 14 px. Velocidade nominal 750 px/s, deslocamentos limitados a 300–1.100 ms.
- Uma única transição substituível: inversão parte da posição corrente, sem fila. O movimento termina no conector mesmo após parar o scroll; não bloqueia wheel/touch.
- Geometria/distâncias calculadas nas mudanças reais de layout, não a cada frame. Resize remapeia a fração entre os mesmos conectores; F5 recupera o destino relevante sem reproduzir trechos anteriores.
- Chegada ilumina portas, textos e bordas; efeitos voltam ao normal. Reduced motion, visibilidade e cleanup dos listeners preservados.

## Limpeza realizada

Removidos `Home.tsx`, `HomeTopology.tsx`, `recentPlans.ts`, `experience.ts` e seus testes exclusivos, traduções órfãs, CSS exclusivo da homepage antiga e controles de protótipos. Eliminadas as alternativas de título, hero sem DATA, composição anterior e scroll contínuo.

`homepage-review.mjs` e `journey-review.mjs` continuam úteis: o primeiro valida navegação/persistência, o segundo animação/layout. Foram retirados testes de UI removida, comparações experimentais e a experiência local de bandeiras. Permanecem testes de recuperação, projetos, Share Links, sessões, idiomas e geometrias efetivamente utilizadas.

## Validação reproduzível

```powershell
node node_modules/vitest/vitest.mjs run src/home src/i18n src/projects src/workspace src/persistence
node node_modules/typescript/bin/tsc --noEmit
npm run build
$env:NETLAB_HOMEPAGE_REVIEW='1'
$env:NETLAB_JOURNEY_REVIEW='1'
node scripts/test-project-repository.mjs
git diff --check
```

O runner usa Chromium real, perfil descartável e porta efêmera em `127.0.0.1`; não acessa o perfil pessoal ou `localhost:5173`. Cenários incluem dados sintéticos, quatro CTAs, projeto salvo, Share Link, retorno/F5, banco incompatível, editor com xterm e simulação ativos, URLs antigas, DE/EN/PT-BR, 390/700/1024/1440/1920 px, zoom equivalente, ciclo completo DATA, Pause/Play/Replay, scroll rápido/reverso e reduced motion. Exceções JS e downloads inesperados são verificados pelo harness.

Capturas principais são publicadas em `.playwright-mcp/reviews/`, extras/galeria em `raw/`; revisões anteriores vão para `archive/`. Capturas, vídeos, logs, build e perfis permanecem ignorados pelo Git.

### Resultado da limpeza — 29/10/2026

- **238 testes / 18 arquivos** aprovados, mais **137 verificações Chromium** no runner combinado. TypeScript, build e `git diff --check` aprovados.
- Zero exceções JS e downloads inesperados. Os testes usaram somente dados sintéticos/perfis descartáveis.
- Matriz editorial comparada ao relatório da promoção: **60/60 cenários com medidas idênticas**, incluindo temas de contraste em teste, idiomas, larguras e escalas equivalentes. Inspeção das capturas desktop/mobile e das estações também preservou a composição.
- Erro máximo de chegada medido: hero **0,000063 px**, scroll **0,000629 px**. Timeline de 21.240 ms, ciclo completo DATA, pausa/replay e reversão aprovados.
- 148 registros de captura (147 imagens distintas), dos quais seis PNGs principais publicados para revisão.

Medição por tamanho real dos arquivos minificados em `dist/assets`, antes/depois do mesmo comando de build:

| Medida | Antes | Depois |
| --- | ---: | ---: |
| JS próprio `ThematicHome` | 25.410 bytes | 24.120 bytes |
| CSS da homepage (`main` + `ThematicHome`) | 25.612 bytes | 19.952 bytes |
| Chunk JS clássico `Home` | 8.974 bytes | removido |
| Todos os bundles JS/CSS, incluindo editor/compartilhados | 1.544.966 bytes | 1.519.955 bytes |
| Soma gzip desses bundles | 454.588 bytes | 446.323 bytes |

Redução total: **25.011 bytes minificados / 8.265 bytes gzip**. O total não representa o download inicial da homepage. O bundler redistribuiu helpers compartilhados entre chunks; não houve remoção de funcionalidades do editor. Permanece o aviso preexistente de chunk do editor acima de 500 kB.
