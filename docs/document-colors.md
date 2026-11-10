# Cores dos documentos e Auto Dark — 10/11/2026

O Topology Studio mantém o tema do editor. Sua prévia é um documento HTML
independente no iframe; o relatório exportado é o mesmo documento, com várias
folhas. Somente esses documentos usam `color-scheme: only light`, com fundo e
texto explícitos nas folhas/tabelas. O SVG independente também declara o opt-out
na raiz. O relatório HTML anterior recebe a mesma declaração, em seu próprio
documento, sem alterar o tema global do NetLab.

## Diagnóstico

A regra anterior era `color-scheme: light`: declarar suporte ao tema claro não
impede o escurecimento automático. A primeira folha contém um SVG com retângulo
branco; as demais usam fundos HTML. O algoritmo pode preservar esse SVG e
transformar as folhas HTML, explicando a diferença entre capa e páginas técnicas.
Textos, ícones e linhas SVG já usam `fill`/`stroke` explícitos; não foi necessário
reescrever cores, opacidades, dados ou geometria. As regras de impressão preservam
as cores explícitas; `print-color-adjust` não é uma proteção contra Auto Dark.

O Chromium descartável reproduziu a alteração na prévia e o escurecimento das
sete páginas do relatório. A combinação exata do Vivaldi relatada pelo usuário
não foi testada: não há Vivaldi instalado neste notebook.

## Compatibilidade comprovada e limite

- Auto Dark **com preferência de sistema escura**: prévia nos dois temas,
  sete páginas HTML, SVG independente, relatório anterior e impressão mantêm
  pixels idênticos com a transformação ligada/desligada após a proteção.
- Auto Dark **com preferência de sistema clara**: o Chromium ainda transforma
  o relatório, embora o esquema computado seja `light only`. Essa combinação
  contorna o opt-out na implementação do navegador. Não foram acrescentados
  filtros inversos, substituições de cores ou regras globais para compensá-la.
- Extensões e variantes de Forced Dark podem ignorar a indicação do documento.
  Portanto, não há garantia de correção no Vivaldi. Se continuar alterando o
  relatório, será necessário desativar essa transformação para visualizá-lo;
  conferir a prévia de impressão/PDF continua recomendado.

Referências primárias: [opt-out documentado pelo Chrome](https://developer.chrome.com/blog/auto-dark-theme),
[implementação do cálculo de esquema no Blink](https://chromium.googlesource.com/chromium/src/+/9aedf6eb308762ca837ac2c207f9111d469ed0b8/third_party/blink/renderer/core/style/computed_style.cc)
(ramo `force_dark && !prefers_dark`) e
[emulação nativa por CDP](https://chromedevtools.github.io/devtools-protocol/tot/Emulation/#method-setAutoDarkModeOverride).

## Controles de tabelas

Removidos os três parágrafos explicativos e suas strings DE/EN/PT-BR. A seção
“Tabellen verschieben und skalieren” continua expansível, agora contendo o botão
de restaurar e a lista de tabelas, aberta inicialmente para preservar o acesso
aos controles. Arraste, redimensionamento, escala proporcional, Escape, posições
numéricas e limites de texto mantêm os mecanismos anteriores.

## Reprodução e artefatos

`node scripts/test-document-colors.mjs` executa a revisão nativa em perfil e
IndexedDB descartáveis. Não usa dados reais nem apenas `prefers-color-scheme`:
combina a preferência de sistema com `Emulation.setAutoDarkModeOverride` e
compara capturas reais. A preferência clara é registrada como limite conhecido,
enquanto a preferência escura exige igualdade de pixels. Sem arquivos de
referência locais, ainda valida o comportamento atual; com eles, compara também
geometria, conteúdo HTML e PNG. `NETLAB_DOCUMENT_COLOR_REVIEW=before` permite
capturar uma referência antes de uma alteração futura.

Capturas, HTML/SVG/PNG reais, PDF e resultados ficam localmente em
`.playwright-mcp/reviews/document-colors/before/` e `after/`, ignorados pelo Git.
Na revisão desta entrega, geometria e conteúdo técnico do HTML foram preservados;
o PNG exportado permaneceu byte a byte idêntico ao anterior.

Validação final: **269 testes em 24 arquivos**, TypeScript, build e diff-check
aprovados. Roteiro Chromium com **106 verificações** (incluindo a infraestrutura
de persistência reutilizada), sem erros de navegador. Gestos nativos confirmaram
arraste, largura, escala proporcional, Escape, recolher/expandir e restauração.
Verificados DE/EN/PT-BR, Graphite Dark/Classic Light e modal em 1440/700 px.
O PDF antes/depois mantém sete páginas. Permanece o aviso conhecido de chunk
grande no build; nenhuma dependência foi adicionada.
