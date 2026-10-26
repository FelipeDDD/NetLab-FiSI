# Rascunhos e sessões — Fase 5A

Infraestrutura disponível em `repository.workspace`, criada junto à conexão
explícita de `openProjectRepository`. Importar o módulo não abre bancos, não lê
localStorage nem ativa redes. Esta fase não instala controller, boot, autosave,
migração, abas ou comandos visuais de Save/Load.

O controller da Fase 5B1 está documentado em
[session-controller.md](session-controller.md). A [interface da Fase 5B2-A](workspace-ui.md)
foi ativada no aplicativo pela [Fase 5B2-B](application-boot.md). As referências
a integração futura abaixo descrevem a fronteira original da Fase 5A.

## Dados e versões

Os quatro stores e `PROJECT_DATABASE_VERSION = 1` permanecem iguais. Planos
nomeados continuam em `projects`/`documents`, com checkpoints limitados em
`revisions`. Não há conversão dos registros existentes.

Os novos registros são `MetaRecord` com chave, revisão e valor JSON tipado:

| Chave em `meta` | Valor |
| --- | --- |
| `workspace:v1:draft:<UUID>` | `DraftRecord`: documento aberto ou marcador de fechamento. |
| `workspace:v1:session:<UUID>` | `SessionRecord`: IDs dos rascunhos, ordem, foco e datas. |

`WORKSPACE_RECORD_VERSION = 1` versiona esses valores, independentemente da
estrutura do banco, de `ProjectDocument.schemaVersion = 1` e de `netsim v1`.
Revisões interna/externa devem coincidir. Versões desconhecidas, documentos
ilegíveis e referências inconsistentes são recusados sem reparo automático.
`setMeta` e controles genéricos de `createProject` não podem escrever no namespace
reservado `workspace:v1:`; os arquivos/marcadores `legacy-autosave:` são preservados.

Um `OpenDraft` tem UUID próprio e estável, `sessionId`, documento atual,
`revision`, `editSequence`, `dirty`, datas e `base` opcional. A base guarda
`planId`, revisão/nome do plano, `saveId` (`<planId>@<revision>`), data e uma cópia
JSON canônica do documento do último Save. Isso permite detectar retorno ao
conteúdo salvo mesmo se outra aba modificar o plano ou seus checkpoints forem
podados. O custo inicial é uma cópia adicional do documento por rascunho associado;
não há histórico de movimentos. Chaves de objetos são ordenadas para comparação,
arrays preservam ordem e campos opcionais `undefined` são omitidos como no export.

`dirty` indica necessidade de **Save manual**. Um rascunho duravelmente persistido
pode continuar `dirty: true`. Sem base, ele continua pendente de Save As mesmo se
seu documento for vazio. A ausência de persistência das edições ainda em memória
é outro estado, que o controller deverá acompanhar separadamente.

Uma sessão pode estar vazia; nesse caso `activeDraftId` é `null`. Em sessões com
abas, o foco deve pertencer à lista, que não admite duplicatas. Cada rascunho
pertence a uma sessão. `restoreSession` retorna um snapshot consistente, com os
rascunhos na ordem das abas, sem recarregar suas versões a partir dos planos.
Assim, um plano excluído ou alterado não elimina as configurações do rascunho.
As datas da sessão registram alterações na lista/foco; autosave de documento não
incrementa a revisão ou a atividade da sessão.

## API

As operações retornam `RepositoryResult<T>` e usam a conexão, classificação de
falhas e política de checkpoints do repositório. Escritas aceitam `WriteOptions`
com `signal?: AbortSignal`. IDs opcionais devem ser UUIDs previamente reservados.

| API em `repository.workspace` | Contrato |
| --- | --- |
| `createSession({ id?, initialTab? }?, options?)` | Cria sessão vazia ou primeira aba atomicamente. `initialTab` aceita `{ kind: 'new', document, id? }` ou `{ kind: 'plan', planId, id? }`. |
| `listSessions()` | Descobre sessões persistidas sem depender de memória ou sessionStorage. Ordena por atividade da sessão. |
| `restoreSession(sessionId)` | Lê lista, foco e todos os documentos em uma transação; não ativa simulação. |
| `loadDraft(draftId)` | Lê documento aberto ou marcador fechado, inclusive para diagnóstico. |
| `createDraft(sessionId, expectedSessionRevision, { document, id?, activate? }, options?)` | Adiciona rascunho independente e atualiza sessão no mesmo commit. Não cria plano salvo. Ativa por padrão. |
| `openPlanDraft(sessionId, expectedSessionRevision, planId, options?)` | Carrega plano ativo para novo rascunho limpo. Se já estiver aberto nessa sessão, foca a aba preservando seu rascunho, inclusive modificações. `options.activate: false` registra sem mudar o foco existente, para o controller. |
| `updateDraft(draftId, { expectedRevision, editSequence, document }, options?)` | Persiste somente o rascunho, recalcula `dirty` e incrementa sua revisão. Não altera planos, sessão ou checkpoints. |
| `setSessionLayout(sessionId, expectedRevision, { draftIds?, activeDraftId?, expectedActiveDraftRevision? }, options?)` | Reordena/foca abas existentes. Exige permutação exata; não adiciona ou ressuscita abas. A revisão opcional impede focar documento alterado desde a preparação. |
| `saveDraft(draftId, { revision, editSequence }, options?)` | Save explícito na revisão-base do plano. Grava documento, metadados, checkpoint e nova base do rascunho atomicamente. Sem mudanças, é leitura validada sem checkpoint extra. Sem base, retorna `draft-not-saved`. |
| `saveAsDraft(draftId, { revision, editSequence }, name, options?)` | Cria outro plano a partir do documento atual do rascunho, atualiza sua base e mantém ID/posição da aba. Preserva o plano anterior. Não cria checkpoint inicial artificial. |
| `closeDraft(sessionId, expectedSessionRevision, draftId, token, options?)` | Fecha rascunho limpo e atualiza lista/foco atomicamente. Rascunho modificado exige Save ou descarte explícito. Plano excluído/ausente também impede fechamento comum, preservando a cópia recuperável. |
| `discardDraft(sessionId, expectedSessionRevision, draftId, token, options?)` | Descarte explícito da cópia de trabalho e remoção da aba no mesmo commit. Nunca modifica o plano salvo. |

Fechar a aba ativa seleciona sua vizinha à direita ou, se ausente, à esquerda.
Fechar outra aba mantém o foco. Um `ClosedDraft` conserva apenas identidade,
revisão, sequência e datas: não guarda documento/base. Não pode ser reaberto ou
recriado com o mesmo ID. Sessões vazias e esses marcadores não são removidos
automaticamente; uma futura política de limpeza deverá preservar a proteção
contra escritores antigos. Não há lixeira ou histórico visual.

## Transações, concorrência e confirmações

Cada operação lê, valida e grava dentro de uma única transação IndexedDB. Save e
Save As usam os mesmos helpers transacionais dos planos existentes, sem encadear
chamadas públicas independentes. Os quatro stores participam do escopo existente.
Nenhum sucesso é retornado antes de `transaction.complete`; quota, cancelamento,
falha de requisição e abort revertem todas as escritas, inclusive poda de checkpoints.
Fechamento/versionchange/indisponibilidade seguem os resultados tipados existentes.

Há três contadores diferentes: revisão do plano, revisão do rascunho e sequência
de edição local. A sessão também tem revisão própria, somente para lista/foco.
Atualizar rascunho exige sua revisão atual e sequência estritamente maior que a
persistida. Save/Save As/fechamento exigem revisão e sequência exatamente iguais
ao documento persistido. Um Save compara também a revisão-base do plano: outra
aba não pode sobrescrevê-lo silenciosamente. Renomear ou recuperar o plano em
outra aba também produz conflito conservador.

Conflitos são `draft-conflict`, `session-conflict` ou `conflict` (plano), com
revisões; `stale-edit` informa as sequências. O chamador mantém a cópia local para
recuperação, exportação ou duplicação explícita. Deve reler o estado vencedor
para comparar, sem simplesmente reenviar a cópia perdedora com revisão atualizada.
`deleted` impede Save no plano excluído, mas restauração/edição do rascunho e
Save As continuam possíveis. `draft-closed` impede gravações atrasadas. Criação
usa `add`, portanto reaproveitar ID fechado é `already-exists` e reverte a sessão.

Escritas de rascunho e Saves retornam
`acknowledgement: { draftId, revision, editSequence }`. O helper
`assessDraftAcknowledgement(ack, local)` distingue aceitar uma revisão de confirmar
o conteúdo local atual. Exemplo: confirmação da sequência 7 pode atualizar a
revisão conhecida enquanto a memória já está na sequência 8; não confirma a 8,
não deve substituir seu documento e não confirma Save manual. Respostas de outro
rascunho, de revisão anterior ou após fechamento local são ignoradas.

O controller da Fase 5B deverá serializar a fila por rascunho, incrementar a
sequência em cada alteração aplicada, persistir a edição atual antes do Save e
checar se houve novas edições durante a espera. Se houver, deverá persistir/validar
a nova sequência antes de concluir o comando. Deve cancelar/deixar inválidas as
operações pendentes ao fechar a aba e aplicar respostas somente à identidade e
sequência capturadas. O repositório não observa memória da UI nem promete
recuperar alterações que nunca chegaram a um commit.

## Conteúdo e integração futura

O documento passa pelos contratos da Fase 2 (`prepareTopologyDocument` e
`captureTopologyDocument`) e pela projeção existente do repositório. Preserva
configuração, posições, aparência, metadados/progresso de Labs já serializados.
Não inclui ARP/MAC dinâmicos, pacotes, fila/relógio do Scheduler, sessões/buffers
xterm, Undo/Redo ou texto de formulário ainda não aplicado. Redes temporárias de
validação são descartadas; nenhuma rede passa a ser `sim.net`.

Formulários não aplicados exigirão aviso ao trocar ou fechar planos, independentemente
de `dirty`: o rascunho contém somente configurações aplicadas. Não há persistência
por campo nesta fase. A simples troca de abas com documentos preservados não
precisará de confirmação de perda de topologia.

Para a Fase 5B ainda faltam controller/fila/debounce e seus estados de erro,
interface Save/Save As/Load/Delete/abas, seleção da sessão a retomar, integração
com `activateTopologyNetwork` mantendo uma única simulação e tratamento de
formulários. Checkpoints pedagógicos futuros continuam separados dos técnicos.

Migração e Share Links têm destinos prontos (`initialTab: plan` e `initialTab: new`),
mas não são chamados aqui. A integração deverá verificar uma sessão existente
antes de criar outra, coordenar uma identidade estável para a primeira sessão
legada e retomar com segurança se houver interrupção entre migração e abertura.
O arquivo bruto/marcador da Fase 4 e `netsim:autosave:v1` não devem ser removidos
como efeito dessa abertura. Fonte legada alterada, plano já excluído e prioridade
entre sessão restaurada/Share Link exigem decisão explícita no controller.

## Validação

`workspace.test.ts` verifica confirmações assíncronas. Os casos de
`workspace.browser.ts`, incluídos em `repository.test.ts`, usam IndexedDB nativo:
Save/Save As, independência dos planos, restauração, conflitos, revisões antigas,
fechamento, escrita atrasada, rollback/abort/quota, DTO v1 e compatibilidade com a
migração. O runner `scripts/test-project-repository.mjs` acrescenta duas abas
reais e encerra/reabre o Chromium com o mesmo perfil descartável para recuperar
ordem, foco e conteúdo não salvo. Não depende de sessionStorage.

```powershell
node node_modules/vitest/vitest.mjs run src/projects/repository.test.ts src/projects/workspace.test.ts src/projects/legacyMigration.test.ts
node node_modules/typescript/bin/tsc --noEmit
npm test
npm run build
git diff --check
```

O perfil é novo em diretório temporário, com bancos `netlab-idb-test-<UUID>`.
Não há boot da aplicação, abertura do banco padrão, dados reais ou dependências
novas. Quota/falhas são injetadas na fronteira nativa; o teste de reinício usa
fechamento normal do processo, sem simular queda de energia ou eviction do navegador.
