# Markierungen — áreas visuais

As marcações são metadados opcionais de apresentação da topologia. Não são
VLANs, grupos físicos nem novos dispositivos da simulação.

## Uso

1. Segure **Shift** e arraste um retângulo sobre pelo menos dois equipamentos.
2. Abra **Markierungen** na toolbar. Em janelas estreitas, o botão mostra somente
   o ícone e conserva seu nome acessível/tooltip.
3. Escolha nome opcional, uma das seis cores e intensidade de 5% a 50%
   (padrão 18%). A área tracejada é uma prévia temporária.
4. Clique **Bereich markieren** para confirmar.

Para editar, escolha a área no seletor **Bereich** do mesmo popover. Nome, cor e
intensidade são aplicados imediatamente; o popover permanece aberto. **Neu**
volta à criação. **Bereich entfernen** remove somente a marcação. Escape/clique
fora fecha o editor; a prévia não confirmada é descartada.

O seletor mostra uma amostra da cor, o nome completo (incluindo Unicode) e a
quantidade de equipamentos. Pode ser usado por clique, touch ou teclado: setas,
Home/End e Enter; Escape primeiro recolhe a lista, depois fecha o editor. A área
em edição ganha um contorno discretamente reforçado, removido ao fechar.

Também é possível abrir a edição clicando no título da área no canvas, ou
focando o título e pressionando Enter/Espaço. Somente o texto recebe eventos;
a superfície e o contorno continuam transparentes a cliques. A seleção dos
equipamentos é independente e permanece intacta. Durante Quick Ping/reencaixe,
os títulos ficam inertes para não competir com essas operações.

### Acrescentar e remover membros

1. Selecione um ou mais equipamentos com Shift no canvas.
2. Abra **Markierungen** e escolha a área existente.
3. **Auswahl hinzufügen** inclui somente os selecionados ainda não associados.
4. **Auswahl entfernen** retira somente os selecionados que pertencem à área.

Os limites se atualizam imediatamente. IDs não se duplicam e o mesmo aparelho
pode pertencer a mais de uma marcação. Nenhum equipamento, cabo ou configuração
é excluído ao remover uma associação. As ações ficam desabilitadas quando não
há mudança aplicável. Se a seleção retiraria todos os membros, a remoção é
bloqueada com uma explicação em alemão: use **Bereich entfernen** para apagar
explicitamente a área. Cada alteração de membros tem seu próprio Undo/Redo.

O contorno automático continua sendo um retângulo envolvente. Um equipamento removido da
associação pode continuar geometricamente dentro da região se estiver entre os
demais membros; isso não o reinsere na lista nem altera sua posição. Não são
criadas formas recortadas ou buracos para excluir equipamentos intermediários.

### Extensões geométricas (L/U/T)

Clique com o botão direito no **fundo** de uma área e escolha **Teilfläche
hinzufügen**. Em sobreposições, o menu identifica os nomes/cores e permite escolher
qual área modificar. Os eventos dos nodes e cabos têm prioridade; não há uma
superfície clicável permanente cobrindo o canvas. O hit-testing usa os retângulos
reais da área, não a caixa envolvente da união (o vazio de um U fica livre).

Arraste um retângulo para desenhar a extensão. Ela precisa tocar uma borda por
um trecho ou sobrepor a área existente; contato somente por um canto não basta.
Retângulos menores que 12 unidades do canvas não são aceitos. Uma tentativa
inválida mantém o modo de desenho aberto, com explicação. Escape cancela sem
gravar a prévia. Um desenho válido encerra o modo e registra uma operação de Undo.

**Teilflächen bearbeiten** mostra somente durante a edição a região principal e os retângulos manuais
tracejados. Clique em uma extensão para selecioná-la; arraste seu interior para mover
ou uma das quatro alças para redimensionar. O botão **Teilfläche entfernen** remove
somente a parte selecionada. Escape ou **Fertig (Esc)** encerra. O retângulo da
extensão também recebe foco por Tab e pode ser movido com setas (Shift aumenta o
passo); os botões permanecem acessíveis por teclado. O dropdown da toolbar oferece
as mesmas entradas para adicionar/editar partes, inclusive quando estão separadas.

### Ajustar a região principal

**Teilflächen bearbeiten** também está disponível sem extensões. Selecione a
**Hauptfläche** e arraste uma das quatro alças para expandir ou reduzir as bordas.
As alças recebem foco por Tab; setas ajustam o canto e Shift aumenta o passo.
O interior seleciona a base, sem deslocar os membros nem permitir apagá-la como
se fosse uma extensão. **Teilfläche entfernen** fica desabilitado nessa seleção.

O ajuste grava somente quatro `baseOffsets` opcionais (`left`, `top`, `right`,
`bottom`), em coordenadas do mundo. Valores positivos expandem para fora e
negativos reduzem a borda. A base automática continua sendo recalculada pelos
membros; os ajustes são aplicados depois. Extensões não são reposicionadas.
Reduzir a base pode deixar equipamentos fora dela: a marcação é decorativa.

Dimensões derivadas nunca ficam menores que 12 unidades. Se mudanças posteriores
dos membros fizerem as bordas se cruzarem, o tamanho é limitado durante o cálculo,
sem reescrever os offsets salvos. Valores não finitos são rejeitados; quatro zeros
omitem o metadado. Documentos antigos continuam sem qualquer ajuste implícito.
Cada arraste confirmado cria um único Undo; prévias e cancelamento não são salvos.

Os controles e prévias não alteram a simulação, os membros ou as posições dos
equipamentos. Cada arraste confirmado gera uma única operação de Undo/Redo. Uma
extensão pode ser movida para longe da base; nada é reposicionado ou apagado para
forçar continuidade depois da criação. Quando os membros se movem, apenas a base
automática é recalculada. As extensões permanecem nas coordenadas originais e a
mesma marcação pode temporariamente ter ilhas separadas, corrigíveis pelo editor.
Cobrir um equipamento com uma extensão **não** o adiciona aos membros.

`src/markingGeometry.ts` usa compressão das coordenadas X/Y dos retângulos e
extrai as bordas das células expostas. Bordas internas são eliminadas e os loops
recebem cantos suavizados em um único path SVG com preenchimento `evenodd`.
Assim, sobreposições da mesma marcação não acumulam opacidade; vazios internos e
ilhas separadas são preservados. Sem extensões, o retângulo arredondado original
é mantido. Não há dependência de biblioteca geométrica, grade ou snap-to-grid.

## Modelo e persistência

- `src/areaMarkings.ts`: modelo, paleta, validação e cálculo dos limites.
- `src/markingGeometry.ts`: união ortogonal, hit-testing e validação dos retângulos.
- `src/components/MarkingGeometryEditor.tsx`: menu contextual e edição temporária.
- `src/components/AreaMarkings.tsx` / `areaMarkings.css`: camada SVG em coordenadas
  do React Flow, prévia e controles com os tokens do tema existente.
- `src/store.ts` / `src/topologyHistory.ts`: ações e histórico compartilhado.
- `src/persistence/topologyDocument.ts`: captura/restauração de `ui.areaMarkings`.

Cada registro contém `id`, `name`, `color`, `intensity` e `deviceIds`. Os membros
são identificados por IDs estáveis, não por nomes. Os limites são derivados das
posições/dimensões atuais dos nodes e de suas legendas na escala nominal de 1×.
Mover um membro não move os demais.

O zoom visual das legendas não altera os limites da região automática: L/U/T e
suas junções permanecem idênticos em coordenadas do mundo, e somente o viewport
transforma o desenho. `markingBounds` conserva o argumento opcional de zoom por
compatibilidade, mas o ignora. Renderização, hit-testing e validação de novas
extensões compartilham esse mesmo cálculo. O editor continua convertendo o
ponteiro por `screenToFlowPosition`, sem compensação adicional.

Em zoom reduzido, legendas compensadas podem ocupar mais espaço que sua caixa
nominal e ultrapassar a margem da região em casos densos ou com várias linhas.
A camada não recorta os dispositivos; prioriza-se a estabilidade da forma sem
aumentar margens nem alterar a legibilidade existente. Extensões antigas não são
reposicionadas: se uma junção dependia dos limites ampliados de um zoom reduzido,
ela pode ficar separada da base nominal, como já ocorria ao voltar para 1×.

O campo opcional `extensions` contém `{ id, x, y, width, height }` para cada parte,
em unidades do mundo React Flow. IDs e posições são preservados por Save/Load,
Save As, autosave, F5, troca de planos, JSON e histórico. Não é acrescentado um
campo vazio aos registros antigos. Prévia de extensão e modo de edição são
transitórios; não entram no documento nem no autosave.

O fluxo existente de documentos preserva os dados em Save/Load, Save As,
rascunhos automáticos, troca de planos e JSON exportado/importado. Não há nova
store ou versão de IndexedDB. Documentos antigos sem o campo continuam válidos.
Registros visuais inválidos e referências a dispositivos inexistentes são
ignorados na leitura; nenhum dado de rede é reconfigurado.

Criar, editar e remover usam o Undo/Redo da topologia. Ajustes consecutivos na
mesma sessão de edição são reunidos em uma operação; uma operação intermediária
de topologia interrompe esse agrupamento. Excluir equipamentos remove suas
referências e apaga uma área somente quando ela não tem mais membros. O Undo
da exclusão restaura também a associação original.

Prévia e seleção da marcação são transitórias e não são salvas. Labs e
verificadores de Übungen não foram modificados. O recurso não implementa desenho
livre, arraste de grupos nem inclusão de áreas
no exportador de diagramas SVG; a exportação JSON preserva as marcações.

## Validação reutilizável

```powershell
node node_modules/vitest/vitest.mjs run src/markingGeometry.test.ts src/areaMarkings.test.ts src/terminals.test.ts src/persistence/topologyDocument.test.ts
node scripts/test-area-markings.mjs
```

O segundo comando reutiliza o harness Chromium/IndexedDB existente, com perfil,
porta e banco descartáveis. Exercita Shift real, seletor com amostras e teclado,
títulos interativos, associação sobreposta, proteção do último membro, L/U/T,
desenho, cancelamento, movimento/redimensionamento de partes, opacidade uniforme, histórico,
conexões, persistência, recarregamento, zoom/pan e larguras
700–1440 px nos temas Graphite Dark e Classic Light. Publica cinco PNGs
selecionados na raiz de `.playwright-mcp/reviews/`; a revisão anterior é arquivada
pelo gerador Visual Review, sem apagar as capturas originais. Os artefatos são
ignorados pelo Git.

Validação de consolidação em 28/10/2026: 663 testes direcionados em 13 arquivos
(incluindo a fábrica interna de exercícios) e 116 casos do harness Chromium,
dos quais 13 exercitam Markierungen. A base foi redimensionada por ponteiro sem
extensões e com um L, com um Undo por gesto; extensões permaneceram independentes.
Também foram conferidos offsets após movimento de membro, zoom 0,5×/1×/2×,
Save/Save As, JSON, troca de planos e recarga, em Graphite Dark e Classic Light.
TypeScript, build e `git diff --check` passaram. O aviso existente de chunk acima
de 500 kB continua; não foram adicionadas dependências.
