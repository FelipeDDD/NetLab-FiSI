# Defaults de apresentação

Consolidação de 28/10/2026. Nenhuma preferência real de navegador foi lida ou
reescrita para definir defaults globais. Valores pessoais não identificáveis
com segurança conservaram seus defaults anteriores.

## Canvas

`src/canvasBackground.ts` define `DEFAULT_BACKGROUND`:

- Blue Circuit (`bg2`, `background-blue-circuit.png`).
- Intensidade 100%, pontos ativados, animação Off: valores anteriores mantidos.
- Ausência/invalidade de preferência usa a mesma constante na normalização.
- Escolhas válidas salvas, incluindo Classic Blue, têm prioridade. A leitura não
  grava no localStorage. Overrides temporários por URL continuam funcionando.
- Os dez backgrounds permanecem disponíveis. UI Theme, viewport e grid não
  foram modificados. Uma restauração pelo objeto `DEFAULT_BACKGROUND` produz o
  mesmo resultado de uma preferência ausente; não foi adicionado controle novo.

## Terminais: novos defaults de aparência (02/11/2026)

Free Panels (`free`) já era o padrão no store e no normalizador; não houve
necessidade de mudar código de organização. Documentos que guardam `by-type`
continuam abrindo com Group by type. Nenhuma preferência foi migrada à força.

`src/terminalAppearance.ts` define para novos projetos e Reset:

- Background style `fx-signal-pulse` (Signal / Wireframe → Pulse), intensidade 100%.
- Fonte `consolas`, tamanho 14 px.
- Consolas usa a instalação local; na ausência dela, JetBrains Mono é carregada
  dos assets livres do NetLab. Há outras três fontes WOFF2 sob demanda; detalhes
  e licenças em [terminal-fonts.md](terminal-fonts.md).
- Projetos novos gravam os quatro campos explicitamente, inclusive no workspace.
- Campos ausentes em documentos existentes/importados conservam os valores
  históricos: Diagonal, 80%, fonte System e 13 px. A leitura desses arquivos
  é independente de futuras mudanças nos defaults de criação.
- O preset experimental selecionado continua visível com Show experimental
  styles desmarcado; os demais experimentos permanecem ocultos.
- Cores por categoria, paleta ANSI e regras de contraste existentes.

Documentos existentes preservam estilo, intensidade, cores e fontes escolhidas.
Não foram promovidos a defaults: sessões abertas, dispositivos, aba ativa,
comandos, histórico xterm, posições, larguras de colunas ou cadeados do projeto.
Larguras/cadeados e ordem das abas mantêm os mecanismos próprios de preferências.
Dock inicial continua 280 px; até cinco painéis visíveis, mínimo de 220 px por
painel, sessões extras em abas. Não se modificou esse comportamento.

## Validação da consolidação de 28/10/2026

- 580 testes direcionados em 19 arquivos, incluindo preferências, terminais,
  Markierungen, clipboard, posicionamento, histórico, Labs/Übungen e persistência.
- Chromium: 107 casos no harness de defaults (103 comuns e quatro cenários
  específicos), sem erros JS nem downloads. Perfil, banco e porta descartáveis.
- Perfil novo com Blue Circuit/Free Panels; todas as opções de fundo; restauração
  do default; perfil personalizado com Verde 2, Classic Light, Courier 16 px,
  estilo/intensidade próprios e Group by type após Save/Load, abas e F5.
- Duas/três sessões xterm e largura manual bloqueada de 300 px preservada.
- TypeScript, build e `git diff --check` aprovados. Permanece apenas o aviso
  existente de bundle acima de 500 kB. Nenhuma dependência adicionada.

Comandos: `node scripts/test-defaults.mjs`, testes Vitest direcionados,
`npm.cmd run build`. Screenshots, logs, perfis e resultados de build permanecem
ignorados pelo Git. Os commits de Markierungen e fábrica de Netzwerk existentes
não são reescritos; esta consolidação não inclui push.

## Verificação final de 02/11/2026

Os valores já estavam corretos: terminal Pulse/100%/Consolas/14 px e Canvas
Blue Circuit/100%/pontos ligados/animação Off. Esta rodada reforçou testes sem
alterar as constantes ou o comportamento funcional da aplicação.

- 466 testes direcionados aprovados: normalização, documentos antigos e
  personalizados, importação, novos projetos, demonstrações, Reset e fontes.
- 108 cenários do harness Chromium aprovados, incluindo o preview do build
  de produção em perfil e origem descartáveis. Sem erros JS.
- Primeiro acesso sem preferência de Canvas ou projeto: Blue Circuit exato;
  abrir configurações não grava uma preferência de Canvas.
- Save, novo plano, Reset, F5 e volta ao plano salvo mantêm a aparência de
  cada documento independente do background global personalizado.
- Fontes adicionais, carregamento sob demanda e fallback de Consolas testados
  no mesmo preview. TypeScript, build e verificação de whitespace aprovados.

### Localhost e hospedagem

`netlab:canvas-background:v1` é lida do localStorage da origem atual. Localhost
(incluindo a porta) e o domínio Vercel possuem preferências e bancos separados.
Um perfil existente pode ter uma escolha anterior válida, que prevalece sobre
os defaults; `?background=...` também pode substituir temporariamente o fundo
sem gravar essa escolha. Isso pode explicar diferenças entre ambientes.
Esta verificação não inspecionou nem modificou preferências reais da Vercel ou
do usuário, portanto não atribui uma diferença observada a uma causa específica.

## UI Theme: padrão corrigido em 02/11/2026

`src/uiTheme.ts` define `DEFAULT_UI_THEME = 'graphite-dark'`. Ausência de
preferência usa Graphite Dark sem gravar uma escolha no localStorage. IDs
válidos salvos continuam prioritários; `midnight-blue` e valores inválidos já
armazenados continuam resolvendo para `original`, sem reescrever o valor bruto.
O nome exibido de `original` é **Midnight Blue**. Apenas o rótulo mudou; o ID
persistido foi mantido para que preferências antigas exibam o novo nome.
Nenhuma paleta foi alterada.
O default do Canvas Blue Circuit é independente e permanece intacto.
