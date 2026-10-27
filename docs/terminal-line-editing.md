# Edição da linha de comando

Linux e Windows usam o mesmo editor em `src/terminals.ts`. O shell recebe a
linha inteira somente no Enter; parser, comandos, Run/Pause e protocolos não
participam da edição.

- Left/Right movem o cursor sem apagar; Home/End vão ao início/fim da entrada.
- Backspace apaga antes do cursor; Delete apaga na posição do cursor.
- Texto digitado ou colado é inserido, sem sobrescrever o sufixo.
- Up/Down percorrem o histórico da sessão. Voltar abaixo do comando mais recente
  restaura o rascunho anterior e sua posição de edição. Down fora do histórico
  preserva a entrada atual.
- O prompt fica fora do buffer editável. Os limites impedem apagar ou mover o
  cursor para dentro dele.

O buffer continua sendo uma string, acompanhado de um offset UTF-16 para
inserção e exclusão. Os deslocamentos usam `Intl.Segmenter` para não cortar
pares de surrogates, acentos combinantes ou sequências de emoji. A largura
visual continua sendo a do xterm existente; não há outro cálculo de `wcwidth`,
addon Unicode ou promessa de renderização de fontes/emoji além do xterm.

Ao editar no meio, o editor repinta a entrada e localiza o cursor pelas células
que o xterm acabou de renderizar (`terminalLine.ts`), incluindo quebras visuais,
caracteres largos e a margem direita. Mudanças de largura/fonte passam pela
mesma fila e preservam a posição lógica. Enter e Ctrl+C levam a apresentação
ao fim antes de emitir a nova linha, evitando escrever em cima do sufixo.

A fila existente serializa entrada, seleção, repintura e resize com callbacks
de `term.write`. O decodificador em `terminalInput.ts` mantém sequências de
tecla e colagens delimitadas inteiras, mesmo quando chegam agrupadas ou
fragmentadas; sequências de tecla não viram texto executável. A colagem mantém
a normalização anterior: controles são removidos e quebras viram espaços,
sem execução automática.

Ctrl+A/Cmd+A continua selecionando o comando inteiro para substituir/copiar.
Ctrl+C copia uma seleção ou interrompe o comando em execução. Enquanto um
comando executa, a edição e o histórico ficam bloqueados, preservando sua
saída assíncrona e seu cancelamento. Cada sessão mantém seu próprio buffer,
cursor e histórico ao alternar abas ou mover colunas. Fechar a sessão descarta
esse estado transitório; ele não entra em Save/Load.

## Verificação

Testes de lógica e integração: `terminalInput.test.ts`, `terminalLine.test.ts`
e `terminals.test.ts`, junto das suítes de seleção, atalhos, colunas e layout.

Chromium real, com perfil e banco descartáveis:

```powershell
node scripts/test-terminal-editing.mjs
```

O script reutiliza o runner existente e monta explicitamente a aplicação de
teste. Cobre Linux/Windows, Graphite Dark/Classic Light, inserção, exclusão,
Home/End, histórico/rascunho, Unicode, colagem, seleção, margem exata,
quebras visuais, resize, fonte, movimento entre colunas, comandos assíncronos
e Ctrl+C. As capturas ficam em `.playwright-mcp/reviews/raw/terminal-editing/`.

Validação em 27/10/2026 com Node 24: **370 testes direcionados em 7 arquivos**
e **115 verificações no Chromium** passaram, incluindo 12 cenários do editor.
TypeScript, build e `git diff --check` passaram. O build mantém o aviso existente
de chunk acima de 500 kB. Nenhuma dependência foi adicionada.
