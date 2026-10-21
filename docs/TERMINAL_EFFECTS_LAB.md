# Terminal Visual Effects Lab

Os 12 presets continuam implementados. O menu **Terminal settings** apresenta
**Background style** por família e **Variation** somente quando há múltiplas
opções: Aurora Soft/Balanced, Lines Subtle/Flow/Spectrum e Signal Matrix.
**Original styles** mantém Diagonal, Dual Glow, Aurora Lines e Aurora Flow.
O padrão permanece Diagonal; a intensidade continua global e as cores, individuais.

**Show experimental styles**, desligado ao abrir o menu, revela Aurora Vivid,
Signal Minimal/Pulse e os três Gradient Mesh. Um experimental já selecionado
permanece representado mesmo com o checkbox desligado. Isso também vale para
configurações importadas e restauradas após F5: não há substituição silenciosa,
conversão de IDs ou migração de backgrounds. O código dos efeitos não foi alterado
na reorganização. A árvore local não contém estilos chamados Classic ou Gradient
Mesh anteriores ao Lab; os quatro nomes originais foram mantidos conforme confirmado.

## Presets e comparativos

As 21 capturas experimentais do Chromium são referências locais, não versionadas.
Elas podem não existir em um clone do repositório. Quando presentes, ficam em
`docs/img/aurora-flow-four-panels.png`, `docs/img/aurora-flow-grouped.png` e
`docs/img/terminal-effects/*.png`, caminhos específicos ignorados pelo Git.
Os PNGs não são carregados pelos backgrounds: os efeitos funcionais são gerados
pelo código TypeScript/CSS/SVG, que permanece versionado.

As capturas anteriores ao Lab mostram Aurora Flow com quatro painéis e agrupado.
No Lab, os comparativos locais `compare-aurora.png`, `compare-lines.png`,
`compare-signal.png` e `compare-mesh.png` usam quatro painéis, Host / Server /
Router / Firewall, intensidade 80%, fonte e conteúdo iguais. As capturas
individuais usam os nomes `fx-*.png` dentro da mesma pasta local.

| Família | Presets | Composição |
| --- | --- | --- |
| Aurora | Aurora Soft, Aurora Balanced, Aurora Vivid | Luz difusa discreta; faixas sobrepostas; dobras luminosas mais expressivas |
| Aurora Lines | Lines Subtle, Lines Flow, Lines Spectrum | Poucos fios quase horizontais; dois feixes ondulados; trama mais rica com acentos pontuais |
| Signal / Wireframe | Signal Minimal, Signal Pulse, Signal Matrix | Trilhas nas extremidades; caminhos de sinal com pontos; malha horizontal e diagonal |
| Gradient Mesh | Mesh Ambient, Mesh Prism, Mesh Deep Glow | Nuvem difusa central; focos em várias regiões; luz lateral com centro escuro |

Também foram conferidos painel único (`single.png`), Group by type com seleção,
abas e cadeado (`grouped.png`) e janela estreita com cor personalizada (`narrow.png`).
Esses nomes descrevem os registros locais, sem criar links que quebrem no GitHub.
Capturas descartáveis de novas verificações devem ficar em `.playwright-mcp/`,
`test-results/` ou `playwright-report/`, igualmente ignorados pelo Git.

## Implementação

- `src/terminalEffects.ts` contém catálogo, IDs estáveis `fx-*` e composições SVG
  originais. Alterar um nome visível não muda o ID persistido.
- O SVG é uma imagem de fundo local por terminal, sem novos elementos sobre o
  xterm, listeners, loops de animação ou contextos Canvas/WebGL. O navegador
  dimensiona a imagem; os traços usam `non-scaling-stroke`.
- Gradientes radiais, faixas Bézier e caminhos geométricos definem as composições.
  Somente as faixas largas de Aurora e Lines Flow recebem um pequeno blur SVG
  de região limitada, durante a rasterização da imagem. Texto, cursor, seleção,
  linhas e demais elementos da interface nunca passam por esse filtro.
- A cor individual é combinada com tons auxiliares por tipo, reutilizando
  `terminalFlowColors()`. Todos os tons passam pelo limite de luminância
  existente antes de compor o SVG; sobreposição usa alfa normal, sem soma de luz.
  A intensidade zero resulta na base escura uniforme.
- `terminalStyleOptions.ts` define os grupos e a visibilidade na UI. Os selects
  nativos têm nomes acessíveis explícitos; a família não cria um segundo estado
  persistido, pois é derivada do ID atual. Não há sliders adicionais.
- `terminalAppearance.ts` continua normalizando e persistindo `style`. Autosave
  e JSON import/export usam os mesmos metadados `ui`, incluindo os 12 IDs novos.
  Arquivos antigos e IDs desconhecidos conservam os fallbacks existentes.
- O `useMemo` existente evita gerar imagens em ticks/pacotes. Alterar aparência
  não chama `term.write()`, não recria sessões nem altera medidas dos painéis.

Referências visuais consultadas: [Aurora](https://reactbits.dev/backgrounds/aurora),
[Line Waves](https://reactbits.dev/backgrounds/line-waves),
[Floating Lines](https://reactbits.dev/backgrounds/floating-lines) e
[Background Studio](https://reactbits.dev/tools/background-studio).
Nenhum código, shader ou asset desses projetos foi incorporado. Não há novas
dependências nem requisitos de licença de terceiros para os novos desenhos.

## Validação e limites

- No checkpoint inicial do Lab, 121 testes direcionados foram aprovados: 60 de aparência, 14 dos efeitos, 3 dos
  controles e 44 de persistência/sessões. Todos os IDs novos percorrem a
  exportação/importação real; há testes de autosave e comandos ativos por família.
- Na reorganização do menu: 19 testes dos controles/opções e 44 de persistência
  aprovados, mais TypeScript. Chromium confirmou troca de famílias e variações,
  ocultação sem perda de experimentos selecionados, cor individual, quatro
  sessões preservadas, menu estreito e recarga com o preset experimental intacto.
- TypeScript aprovado. Suíte completa e build de produção não executados nesta etapa.
- Todos os presets foram vistos e capturados no Chromium. Conferidos intensidade
  0/80/100, cores personalizadas, seleção, menus, abas agrupadas, quatro painéis,
  cadeados, redimensionamento por teclado, largura mínima e rolagem horizontal.
- Quatro pings simultâneos continuaram recebendo respostas de 320 ms durante as
  trocas de preset; as instâncias de sessão permaneceram iguais. Após recarga,
  preset/intensidade/cores retornaram e nenhuma sessão reabriu automaticamente.
- Em amostra curta de 90 quadros por estilo no ambiente local, com quatro pings,
  Diagonal, Aurora Vivid e Signal Matrix tiveram mediana de 16,7 ms e p95 de
  16,8 ms entre quadros. Isso verifica fluidez nesta máquina, não substitui uma
  medição de CPU/GPU ou testes em equipamentos de laboratório mais lentos.
- As imagens são pequenas descrições vetoriais (menos de 15 KB de SVG por preset
  nos testes), mas redimensionamento e mudanças de cor/intensidade exigem nova
  pintura/rasterização. Não existe trabalho contínuo dos efeitos em repouso.
- Todos são estáticos, inclusive Signal Pulse: não há movimento para desativar
  nem exceções a `prefers-reduced-motion`. A composição se adapta à proporção do
  painel, portanto uma onda fica mais esticada em um terminal muito largo.
- O contraste de pelo menos 4,5:1 cobre a paleta ANSI normal, texto e cursor
  existentes. ANSI dim e true-color arbitrário continuam sujeitos ao xterm.

## Avaliação visual

**Aurora Balanced**, **Lines Flow** e **Mesh Deep Glow** oferecem o melhor
equilíbrio inicial entre identidade, profundidade e leitura. **Mesh Ambient** e
**Aurora Soft** são as opções menos cansativas. **Signal Pulse** tem a identidade
mais próxima de sinais e redes; **Signal Minimal** é propositalmente quase preto.

**Lines Spectrum** e **Signal Matrix** merecem avaliação em monitores menores:
as linhas ficam mais densas sob muito texto. **Aurora Vivid** é útil para comparar
uma direção mais expressiva, mas pode pedir intensidade menor no uso prolongado.
Nenhuma dessas avaliações altera o padrão ou remove opções; o laboratório existe
para permitir essa escolha visual.
