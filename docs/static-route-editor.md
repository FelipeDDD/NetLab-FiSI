# Editor de rotas estáticas

Inspector → Routing de Router/Firewall: “+ Adicionar” e lápis nas entradas
**explicitamente armazenadas** em `IpDevice.staticRoutes`. Connected, RIP e
defaults derivados do campo Gateway da interface continuam somente leitura.
O formulário substitui a tabela na própria aba; salvar, excluir e cancelar
retornam à tabela. Formulários abertos registram valores não aplicados pelo
guard existente; não são persistidos por campo.
O lápis fica na extremidade direita da célula final da entrada, na mesma linha
de destino/Next Hop, sem criar outra linha ou coluna na tabela.

`staticRouteEdit.ts` faz validação sintática com os mesmos utilitários da CLI.
Como `ip route add/replace`, rejeita bits de host no destino; aceita `default`
e `/0`. Reutiliza diretamente `addRoute`, `replaceRoute` e `delRoute` para as
regras de interface, escolha automática, duplicatas e substituição. Não há
outro algoritmo de roteamento. Quando uma interface é indicada explicitamente,
a engine atual não exige que o Next Hop pertença à sua subnet; a GUI preserva
esse mesmo comportamento educacional da CLI, sem prometer conectividade.

A preparação usa um objeto temporário com uma cópia própria do array de rotas
e a visão de interfaces da instância original. Apenas os métodos síncronos de
edição/consulta são chamados; não se cria dispositivo, Network, processo ou
encaminhamento paralelo. A tabela real só recebe o resultado completo após
sucesso. Alterar destino não remove primeiro a rota real antiga e mantém a
posição da entrada. Erros deixam os dados anteriores intactos.

A assinatura de edição inclui identidade da instância, array de rotas e
configuração/estado das interfaces e enlaces. Mudanças concorrentes fazem a
operação falhar com aviso localizado: cancelar e reabrir, sem rebase silencioso.
Duplicatas antigas não são apagadas ou unificadas: a edição ambígua é bloqueada,
e a mensagem orienta a correção explícita pelo terminal.

`store.editStaticRoute` aplica uma única operação existente `set-static-routes`,
compatível com Undo/Redo durante a sessão. Alterações externas/CLI ainda podem
invalidar histórico incompatível, como antes. A pilha não sobrevive a F5.
Rotas efetivas seguem o autosave do rascunho, Save/Load e JSON existentes; não
há novos schemas nem mudanças no motor. Falhas de armazenamento continuam
usando a recuperação global existente, sem declaração de commit antecipado.

O capítulo 6 mantém instruções e validadores. A Ajuda fechada da etapa 5 contém
`GuidedVisualHelp` com `staticRoutingVisualHelp[4]`, já usado no capítulo 5.
Os três assets foram inspecionados: exemplos `192.168.50.0/24` e `10.0.5.2`,
distintos da solução LPM. Não se geraram imagens novas. Zoom/fechamento e idioma
usam o visualizador existente.

Validação: testes de planejamento/loja, atomicidade na mudança de destino,
erros, concorrência, defaults, identidades, proteção de Connected/RIP/gateway,
CLI, documentos e Undo/Redo. O roteiro `node scripts/test-static-route-editor.mjs`
executa o cenário LPM com remoção GUI da `/25`, inclusão GUI de `/32`, pings
reais pelo caminho curto/longo, edição refletida na CLI, conflito real com CLI,
cancelamento, F5, reinício, três idiomas e ajuda visual. Bancos e perfil são
descartáveis; capturas ficam ignoradas em
`.playwright-mcp/reviews/static-route-editor/`.

Resultado final: **295 testes em 26 arquivos**, **113 verificações Chromium**,
zero erros de navegador, TypeScript, build e diff-check aprovados. O aviso de
chunks acima de 500 kB no build é preexistente. Sem commit ou publicação.
