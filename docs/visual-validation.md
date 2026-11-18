# Política de validação visual

Testes automatizados e verificações funcionais continuam cobrindo os idiomas,
temas e tamanhos de viewport relevantes. Capturas de tela são evidência visual,
não substituem nem limitam essa cobertura.

- Para uma mudança visual, gerar normalmente zero ou uma captura representativa,
  de preferência Graphite Dark no tamanho desktop.
- Adicionar captura compacta, segundo tema ou outro idioma somente quando isso
  ajudar a investigar um problema ou validar uma mudança visual relevante.
- Não criar capturas em matriz para cada idioma, tema e viewport por padrão.
- Não abrir, anexar ao contexto ou manter várias imagens semelhantes sem uma
  comparação visual que justifique isso.
- Em revisão maior, comparação antes/depois ou investigação de regressão, capturas
  adicionais são apropriadas. Declarar o motivo e manter os artefatos ignorados
  pelo Git, seguindo o roteiro específico do recurso.

Scripts de revisão podem executar várias combinações para verificar layout,
conteúdo e comportamento. Isso não exige salvar uma imagem por combinação.
Preserve as verificações automatizadas dos roteiros ao reduzir apenas a produção
de imagens. Testes funcionais não devem ser removidos ou enfraquecidos para
reduzir capturas.

Registros históricos em `docs/` podem mencionar matrizes ou quantidades de imagens
geradas em revisões antigas; são relatórios daquela rodada, não requisitos para
novas tarefas. Para validação atual, esta política prevalece sobre exemplos
históricos de capturas.
