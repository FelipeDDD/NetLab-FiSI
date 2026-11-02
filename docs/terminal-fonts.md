# Fontes do terminal

O padrão continua **Consolas 14 px**. System, Cascadia Code e Courier New
continuam sendo opções locais. JetBrains Mono, Fira Code, IBM Plex Mono e
Source Code Pro usam os WOFF2 distribuídos pelo próprio NetLab.

- `src/terminalAppearance.ts`: IDs persistidos, nomes e pilhas CSS. Preferências
  salvas e fallbacks históricos continuam passando pelo mesmo normalizador.
- `src/terminalFonts.ts`: carrega somente Regular e Bold da família de um
  terminal visível. Não há preload, CSS remoto, CDN ou requisição ao importar o
  módulo. FontFace faz o download da origem do aplicativo; uma Promise por
  família evita pedidos duplicados entre painéis. URLs versionadas permitem
  reutilizar o cache HTTP do navegador conforme os headers do servidor.
- Consolas é verificada com `FontFace` usando apenas `local("Consolas")`.
  `document.fonts.check()` sozinho não comprova a instalação de uma fonte.
  Ausência ou acesso local bloqueado usa JetBrains Mono. Falhas no download
  mantêm uma pilha local/monoespaçada e permitem tentar novamente depois.
- `TerminalPanelView.tsx` aplica a família ao xterm somente quando ela estiver
  carregada. A alteração pública de `fontFamily` recalcula as métricas, e
  `observeTerminalSize` agenda FitAddon/refresh num frame. Trocar a preferência,
  ocultar ou desmontar o painel cancela callbacks antigos; não recria sessões.
- `.term-host .xterm` desativa ligaduras e os recursos OpenType `liga`/`calt`.
  Operadores de comandos continuam compostos por caracteres separados; não é
  carregado nenhum addon de ligaduras do xterm.

As fontes são usadas somente pelo terminal; labels do canvas, fontes da UI e
backgrounds não são alterados. Arquivos de origem e licenças constam em
[`public/assets/fonts/README.md`](../public/assets/fonts/README.md).

## Validação reutilizável

`node scripts/test-terminal-fonts.mjs` reutiliza o harness Chromium existente,
com perfil, banco e porta descartáveis. Executar `npm.cmd run build` antes:
o teste usa um servidor Vite **preview** do build de produção. Confere ausência
de downloads na homepage/editor sem terminal, seleção das quatro famílias,
Regular/Bold, texto parcial, fit, ligaduras, reutilização, F5, preferência salva
e fallback para JetBrains quando a disponibilidade local de Consolas é negada.

Testes Vitest: `src/terminalFonts.test.ts`, `src/terminalAppearance.test.ts`,
`src/components/terminalDockLayout.test.ts`,
`src/components/TerminalAppearanceControls.test.ts` e `src/terminals.test.ts`.
