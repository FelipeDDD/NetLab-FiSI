# Reinício seguro dos capítulos guiados

O ícone `↻` no cabeçalho abre uma confirmação não modal. O primeiro clique não
restaura a rede nem zera progresso: apenas confirma a disponibilidade do checkpoint
e aguarda as gravações normais pendentes. Escape, clique fora, navegação e troca
de rascunho fecham o popover. **Bestätigen** usa âmbar nos temas existentes;
os textos seguem DE/EN/PT-BR.

## Checkpoint e ciclo de preparação

`guided:checkpoint:v1:<draftId>:<chapterId>` é um registro tipado em `meta`.
Guarda UUID da tentativa, versão do contrato, configuração anterior à preparação,
configuração inicial preparada e progresso inicial do próprio capítulo. Não inclui
processos, buffers xterm, caches, eventos ou pacotes. Continua usando os quatro stores
e a versão estrutural existentes do IndexedDB.

Cada runtime oferece dois hooks opcionais compartilhados: `before` grava a origem
antes da preparação; `prepared` captura a configuração no limite da inserção e
finaliza o checkpoint após confirmar a topologia persistida. Mudanças na origem
durante essa preparação são recusadas. Uma preparação interrompida só pode completar
um checkpoint cuja origem já exista e cujos dados ainda sejam verificáveis.

Não se cria checkpoint retroativo para tentativas antigas. Checkpoint ausente,
incompleto, inválido ou incompatível desabilita a restauração e permite iniciar outra
tentativa sem apagar a anterior. Para capítulos 1/2, essa alternativa começa uma
nova sequência de tutoriais; para o capítulo 3, usa o início direto existente.

Há um checkpoint inicial por capítulo e rascunho; reiniciar não acrescenta uma
revisão técnica por movimento nem cria um histórico ilimitado no banco.

## Restauração seletiva

`chapterRestartDocument()` calcula um DTO novo sem modificar a simulação ativa.
IDs, MACs e identidade da tentativa são conferidos antes de qualquer gravação.

- **Capítulo 1:** restaura seus três dispositivos iniciais, remove somente PC C
  identificado no progresso e restaura os cabos iniciais. Dispositivos adicionais
  independentes permanecem; conexões ambíguas com trabalho adicional bloqueiam o reset.
- **Capítulo 2:** restaura PC D e seu cabo a partir do checkpoint. O estado de entrada
  do Capítulo 1 deve continuar compatível com seu fingerprint; posições anteriores
  não são substituídas. Mudanças incompatíveis nessa base exigem outra tentativa.
- **Capítulo 3:** restaura Router, Switch B, E e F para o estado inicial capturado.
  Nos dispositivos anteriores, só restaura os gateways de A/B e remove rotas novas
  para LAN B/default cujo Next Hop seja identificável como o Router deste capítulo.
  Rotas anteriores devem continuar presentes, sem alterações. DNS, rotas para outros
  destinos e posições de dispositivos anteriores são preservados. Gateways/rotas
  ambíguos, IDs reutilizados, dispositivos anteriores ausentes, cabos incompatíveis
  ou uma LAN anterior inválida bloqueiam a operação inteira.

Dispositivos comprovadamente pertencentes ao capítulo podem ser recuperados se
foram apagados, mediante confirmação explícita. F5 e abertura do popover não
reinserem equipamentos. Cabos que exigiriam apagar uma conexão alheia ao capítulo
impedem a restauração. Não há reset global nem alteração nos protocolos.

Se já existe progresso de um capítulo posterior nesse rascunho, reiniciar um
capítulo anterior é bloqueado para preservar esse trabalho; a alternativa é uma
tentativa separada. O mecanismo nunca apaga capítulos posteriores silenciosamente.

## Transação, concorrência e recuperação

`WorkspaceRepository.updateDraft()` aceita controles CAS e guardas de metadados.
`SessionController.commitDocument()` usa essa capacidade na fila normal do rascunho:
documento, progresso inicial e guarda do checkpoint são confirmados em **uma única
transação IndexedDB**. As revisões dos outros capítulos são verificadas sem
reescrever seus conteúdos. Sucesso só é declarado após o commit.

A confirmação guarda documento esperado, rascunho e revisões. Configurações novas,
formulários pendentes, troca de rascunho ou conflito de outra conexão impedem o reset.
Uma edição aplicada durante a escrita aborta a transação quando ainda é possível.
Quota, conflito e abort preservam documento e progresso anteriores atomicamente.

Só depois do commit o runtime ativa o DTO resultante pelo mecanismo existente,
descartando estados transitórios e comandos ativos. Os controllers são suspensos
durante a operação e recarregados da persistência após o sucesso, sem salvar seus
caches de progresso anteriores sobre o reset. Nenhuma segunda simulação é executada.

Na janela excepcional em que o commit já venceu uma edição local ou a ativação
falha, não há anúncio de sucesso: a cópia local anterior continua recuperável,
novas gravações desse rascunho são bloqueadas e é necessário exportar a cópia local
e recarregar a sessão consistente do banco. Não se força um segundo overwrite.

## Undo/Redo e limites

O reinício gera uma operação `chapter-restore` no histórico normal. Undo/Redo também
gravam documento e progresso juntos, com CAS e validação da configuração esperada.
Os snapshots são somente DTOs locais e seguem o limite existente de 50 operações;
não restauram processos nem caches. Uma mudança intermediária incompatível bloqueia
esse Undo/Redo em vez de sobrescrever trabalho recente.

F5 recupera a configuração e a etapa já confirmadas; como no editor existente,
não persiste a pilha de Undo/Redo. O checkpoint inicial continua disponível.

## Validação

```text
node node_modules/vitest/vitest.mjs run src/tutorials/chapterCheckpoints.test.ts
node scripts/test-chapter-restart.mjs
npm test
npm run build
git diff --check
```

O runner usa perfil e IndexedDB descartáveis e percorre os três capítulos, incluindo
continuação e início direto do capítulo 3. Cobre confirmação/cancelamento, idiomas,
Undo/Redo, F5, preservação do progresso anterior, conflito entre duas conexões,
quota após o put do rascunho, abort nativo, edição local concorrente, checkpoints
ausentes/inválidos e nova tentativa independente. Capturas reais ficam em
`.playwright-mcp/reviews/raw/chapter-restart/`, fora do Git.

Para capítulos futuros, reutilizar os hooks, serviço e popover e definir
explicitamente o validador do progresso e os campos/dispositivos pertencentes
àquele capítulo. Não há restauração genérica que deduza propriedade a partir
do estado atual.

Resultado em 04/11/2026: **2.692 testes em 141 arquivos** na suíte completa e
**147 verificações Chromium** no roteiro de reinício, sem falhas ou erros de
navegador. TypeScript, build e `git diff --check` aprovados. O build mantém o
aviso existente sobre o tamanho do bundle.
