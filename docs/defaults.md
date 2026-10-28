# Defaults de apresentação

Consolidação de 28/10/2026. Nenhuma preferência real de navegador foi lida ou
reescrita para definir defaults globais. Valores pessoais não identificáveis
com segurança conservaram seus defaults anteriores.

## Canvas

`src/canvasBackground.ts` define `DEFAULT_BACKGROUND`:

- Blue Circuit (`bg2`, `background-blue-circuit.png`).
- Intensidade 100%, pontos ativados, animação Off: valores anteriores mantidos.
- Ausência/invalidade de preferência usa a mesma constante na normalização.
- Escolhas válidas salvas, incluindo Original, têm prioridade. A leitura não
  grava no localStorage. Overrides temporários por URL continuam funcionando.
- Os dez backgrounds permanecem disponíveis. UI Theme, viewport e grid não
  foram modificados. Uma restauração pelo objeto `DEFAULT_BACKGROUND` produz o
  mesmo resultado de uma preferência ausente; não foi adicionado controle novo.

## Terminais: valores existentes preservados

Free Panels (`free`) já era o padrão no store e no normalizador; não houve
necessidade de mudar código de organização. Documentos que guardam `by-type`
continuam abrindo com Group by type. Nenhuma preferência foi migrada à força.

`src/terminalAppearance.ts` conserva:

- Background style `diagonal`, intensidade 80%.
- Fonte `system`: Consolas, Cascadia Mono, Liberation Mono, monospace.
- Constante de tamanho padrão 14 px; fallback legado 13 px quando o documento
  não possui tamanho de fonte, inclusive os documentos vazios do workspace atual.
- Cores por categoria, paleta ANSI e regras de contraste existentes.

Documentos existentes preservam estilo, intensidade, cores e fontes escolhidas.
Não foram promovidos a defaults: sessões abertas, dispositivos, aba ativa,
comandos, histórico xterm, posições, larguras de colunas ou cadeados do projeto.
Larguras/cadeados e ordem das abas mantêm os mecanismos próprios de preferências.
Dock inicial continua 280 px; até cinco painéis visíveis, mínimo de 220 px por
painel, sessões extras em abas. Não se modificou esse comportamento.

## Validação

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
