# Ajuda visual opcional dos exercícios

O capítulo 4 associa a ajuda visual à etapa 2, que consulta a tabela de R1 com `ip route`, e à etapa 4, que configura uma rota estática em R2. O botão fica ao lado de `Hilfe` e funciona independentemente do texto recolhido.

`src/tutorials/tutorialVisualHelp.ts` contém a associação entre etapa, título, descrição acessível e imagens por idioma. Para futuras imagens, basta adicionar uma associação e reutilizar `GuidedVisualHelp` com uma chave por etapa. Não há estado de progresso, persistência ou comandos de simulação nesse componente.

Os conjuntos são referenciados diretamente em `output/imagens-ip-route-sem-setas/` e `output/imagens-rotas-estaticas-referencia/`. O Vite inclui os arquivos no build; nenhuma cópia adicional de origem foi criada. Falhas de carregamento mostram uma mensagem com o idioma solicitado, sem substituir a imagem por outro idioma. O [padrão visual](padrao-imagens-didaticas.md) reúne as diretrizes para futuras imagens.

O visualizador acompanha a posição do painel. Com pelo menos 760 px disponíveis à direita, abre um card sem bloquear os demais controles. Nos outros casos, usa um diálogo modal nativo. A imagem começa ajustada à largura; o botão de escala alterna entre 50% da resolução original e ajuste à largura, com rolagem quando necessária. O botão de abertura também fecha o card, com rótulo atualizado nos três idiomas. Fechar por × ou Escape devolve o foco ao botão. O modal mantém a navegação por Tab dentro da janela. Trocar de etapa, recolher ou fechar o tutorial desmonta o visualizador.

## Verificação

- `src/tutorials/tutorialVisualHelp.test.ts`: associação das duas etapas, presença dos arquivos por idioma, posicionamento e botão acessível.
- `scripts/guided-visual-help-review.mjs`, integrado ao teste nativo do capítulo 4: abertura, fechamento, independência de Hilfe, idiomas, escala, Escape/foco, temas, larguras 1440/1024/390, recolhimento e saída da etapa. Compara documento e transformação do canvas antes e depois.
- Capturas solicitadas: `.playwright-mcp/reviews/guided-visual-help/referencias-chatgpt/`.

A interface geral do simulador já excede a largura disponível no cenário de 390 px. O teste verifica que o card fica dentro da tela e não aumenta essa largura anterior; o visualizador não altera o layout do simulador.
