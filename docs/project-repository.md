# Repositório IndexedDB de projetos — Fase 3

Infraestrutura independente, ainda **não integrada ao aplicativo**. Importar
`src/projects/index.ts` não abre bancos, não acessa localStorage e não ativa redes.
Boot, autosave legado, Labs, importações, Share Links e interface permanecem com
o comportamento das Fases 1/2. Não há migração automática nem catálogo visual.

## Versões e armazenamento

| Versão | Contrato |
| --- | --- |
| `PROJECT_DATABASE_VERSION = 1` | Estrutura do IndexedDB; banco padrão `netlab-projects`. |
| `PROJECT_DOCUMENT_VERSION = 1` | Envelope `{ schemaVersion: 1, topology }`. |
| Topologia `app: 'netsim', version: 1` | Formato existente, sem renomear seus identificadores. |

O banco só é aberto por `openProjectRepository(options)`. A criação de schema
ocorre exclusivamente em um banco novo (`oldVersion === 0`); bancos de versão
futura ou de estrutura incompatível são recusados, nunca apagados/reconstruídos.

| Store | Chave | Conteúdo e índices |
| --- | --- | --- |
| `projects` | `id` | UUID, nome, `createdAt`, `updatedAt`, `lastOpenedAt`, revisão e `deletedAt`. Índices `byUpdatedAt`, `byLastOpenedAt`. |
| `documents` | `projectId` | Documento atual e a mesma revisão presente nos metadados. |
| `revisions` | `[projectId, revision]` | Checkpoints anteriores com nome, instante da versão e motivo. Índice `byProject`. |
| `meta` | `key` | Valores JSON com revisão própria; inclui o marcador reservado `repository:schema`. |

Datas são milissegundos desde o Unix epoch; a revisão inteira, não a data,
determina concorrência. `lastOpenedAt` começa em `null`. IDs de projeto são UUIDs
criptográficos e não alteram IDs de equipamentos, interfaces, MACs ou links.

## Documento persistente

`normalizeProjectDocument` reutiliza `prepareTopologyDocument` e
`captureTopologyDocument`. Uma rede temporária é validada e descartada sem
avançar o Scheduler ou tocar em `sim.net`. O resultado é um DTO independente,
com os campos persistentes reconhecidos pela serialização existente.

Isso mantém configurações da rede, posições, cores, aparência dos terminais e
Lab/progresso. Preserva as compatibilidades conhecidas de switches com
`ifaces: []`, cores antigas, fontes legadas e configuração DHCP. Formas legadas
são normalizadas para a representação canônica atual, sem modificar a entrada.
Campos de execução/objetos extras não entram no documento: ARP, MAC learning,
leases, eventos, pacotes, sessões xterm e Undo/Redo não são checkpoints de projeto.

Versões futuras são erros `incompatible-document`. Documentos malformados são
`invalid-document`; não há persistência parcial ou reparo automático.

## API pública

As operações assíncronas retornam `RepositoryResult<T>`:
`{ ok: true, value }` ou `{ ok: false, error }`. Falhas operacionais não exigem
que a interface capture exceções. O chamador conserva seu documento local para
oferecer exportação ou cópia em caso de conflito.

| API | Efeito |
| --- | --- |
| `openProjectRepository(options?)` | Abre explicitamente uma conexão validada. |
| `createProject({ name, document, id?, control?, initialCheckpoint? }, options?)` | Cria revisão 1; com checkpoint inicial, cria checkpoint 1 e atual 2 atomicamente. `id` opcional é um UUID previamente reservado. Usa `add`, nunca upsert. |
| `listProjects({ includeDeleted?, sortBy? }?)` | Lista somente metadados; ordena por `updatedAt` ou `lastOpenedAt`, decrescente. |
| `loadProject(id, { includeDeleted? }?)` | Retorna metadados + documento consistente em uma transação de leitura. |
| `loadProjectRecoveryState(id, options)` | Lê projeto, controles e checkpoint opcional na mesma transação para confirmar um bundle. |
| `updateProject(id, expectedRevision, document, options?)` | Atualiza conteúdo, incrementa revisão e cria checkpoint anterior. |
| `renameProject(id, expectedRevision, name, options?)` | Preserva conteúdo e registra nova revisão/checkpoint. |
| `duplicateProject(id, expectedRevision, name, options?)` | Copia o documento da revisão conferida para outro UUID; não altera a origem. |
| `deleteProject(id, expectedRevision, options?)` | Exclusão recuperável; mantém documento e tombstone com nova revisão. |
| `restoreDeletedProject(id, expectedRevision, options?)` | Restauração explícita de um tombstone, com nova revisão. |
| `markOpened(id, options?)` | Atualiza atividade; não modifica `updatedAt`, revisão do documento ou checkpoints. |
| `listCheckpoints(id)` | Lista metadados das versões anteriores, mais recente primeiro. |
| `loadCheckpoint(id, revision)` | Preview independente; não altera o projeto nem ativa uma rede. |
| `restoreCheckpoint(id, checkpointRevision, expectedRevision, options?)` | Restaura conteúdo em uma nova revisão; mantém nome atual e protege o estado anterior. |
| `getMeta(key)` | Consulta um controle ou retorna `null`. |
| `setMeta({ key, expectedRevision, value }, options?)` | Compare-and-set de controle; `expectedRevision: null` significa criação. |
| `close()` | Fecha explicitamente, sem reabrir em segundo plano. |

`options` de escrita aceita `signal?: AbortSignal`. Nomes têm de 1 a 200
caracteres após trim. A ausência de uma revisão válida nunca autoriza gravação.
Não há expiração automática, exclusão definitiva nem reaproveitamento de UUIDs.

## Atomicidade e concorrência

Cada mutação lê e confere a revisão dentro da mesma transação `readwrite` que
grava metadados, documento e checkpoint e poda checkpoints excedentes. Os quatro
stores participam do escopo; isso também permite incluir controles na criação.
A serialização nativa dessas transações protege escritores de conexões/abas
diferentes. Nenhuma mensagem BroadcastChannel é necessária para a correção.

O resultado de sucesso aguarda `transaction.complete`. Sucesso de `add`/`put`
isolado não confirma commit. Erros nativos e cancelamentos aguardam abort; as
alterações anteriores permanecem intactas. Requisições enfileiradas em paralelo
também têm suas rejeições tratadas quando uma chamada lança DOMException
sincronamente. Dentro de transações só se aguardam requisições IndexedDB,
sem timers, rede ou callbacks externos. Referência: [IndexedDB: ciclo e
agendamento das transações](https://www.w3.org/TR/IndexedDB/#transaction-lifecycle).

`conflict` inclui revisão esperada e metadados atuais. Um projeto excluído retorna
`deleted` com o tombstone; uma aba antiga não pode usar update ou create com o
mesmo UUID para ressuscitá-lo. Após restauração explícita, a revisão continua
crescendo, portanto revisões anteriores à exclusão continuam inválidas.

`markOpened` é a exceção intencional ao incremento de revisão: representa uso,
não edição. Sua transação preserva os campos lidos mais recentemente e não
invalida documentos abertos em outras abas.

## Checkpoints e recuperação

O limite inicial é cinco checkpoints por projeto, configurável na abertura por
`checkpointLimit` entre 1 e 100. O estado anterior de cada update, rename,
delete ou restauração vira checkpoint. A revisão atual fica em `documents`;
checkpoints sempre têm revisão menor. A poda acontece no mesmo commit da edição.
Mudar o limite só aplica a política nas mutações seguintes; abrir um banco não
inicia exclusões em segundo plano. Cada instância aplica seu limite na escrita.

Preview é somente leitura. Restaurar exige a revisão atual e produz um novo
número, sem voltar o contador. Se o documento atual estiver corrompido ou for de
versão futura, checkpoints válidos ainda podem ser listados/lidos. Nesse caso,
criar outro projeto a partir do checkpoint permite recuperação preservando o
original; restaurar por cima de um documento ilegível é recusado.

O limite restringe checkpoints por projeto, não o tamanho de cada documento,
a quantidade de projetos ou a soma de tombstones. Projetos excluídos conservam
dados até existir uma política explícita de descarte. Backups externos continuam
necessários: checkpoints ficam no mesmo armazenamento do navegador.

## Falhas e ciclo da conexão

Erros distinguem conflitos, exclusão, ausência de projeto/checkpoint, controles
concorrentes, documento inválido/incompatível, dados corrompidos, quota,
indisponibilidade, abertura bloqueada, cancelamento e conexão fechada.

`versionchange` fecha a conexão e avisa `onConnectionStateChange`; chamadas
posteriores retornam `version-changed`. Fechamento inesperado retorna
`unavailable`. O chamador precisa reabrir explicitamente, sem tentativa de
downgrade ou migração. Exceções no observador não impedem o fechamento.

`blocked` encerra a tentativa com resultado tipado. Também existe timeout
configurável (`openTimeoutMs`, padrão 5000 ms). Como um open request não tem
cancelamento nativo, um upgrade que só for liberado depois do erro é abortado,
e conexões tardias são fechadas. Isso evita criação/upgrade silencioso posterior.

## Fronteira para a Fase 4

A infraestrutura aceita criação atômica de projeto + controles genéricos:
`createProject` pode receber um UUID prealocado e `control` com marcadores,
fingerprints ou texto bruto, todos com CAS. Duas tentativas concorrentes de
criar o mesmo marcador não deixam projetos duplicados após o conflito.

**Isso não executa uma migração automaticamente.** O serviço explícito da Fase 4
está documentado em [legacy-migration.md](legacy-migration.md). Ele reutiliza
essas operações e o motivo de checkpoint `initial`, sem alterar as versões
existentes. Integração com boot/autosave continua reservada à Fase 5.

## Infraestrutura da Fase 5A

`repository.workspace` oferece rascunhos e sessões tipados em `meta`, mantendo
os quatro stores e as versões existentes. Save/Save As atualizam planos somente
por comando explícito; atualizações de rascunho não criam checkpoints. O namespace
`workspace:v1:` é reservado contra escritas via controles genéricos.
Contratos, concorrência, fechamento e requisitos restantes do controller estão
em [workspace-drafts.md](workspace-drafts.md). A infraestrutura ainda não é
chamada pelo boot, autosave legado ou migração.

O [controller opt-in da Fase 5B1](session-controller.md) reutiliza essas APIs.
`setSessionLayout` ganhou CAS opcional da revisão ativa preparada;
`openPlanDraft` pode registrar sem mudar o foco com `options.activate: false`.
São extensões aditivas, sem alterar stores, schema ou defaults existentes.

O fechamento também aceita `expectedActiveDraftRevision` nas opções, permitindo
conferir o vizinho preparado antes do commit. A [interface 5B2-A](workspace-ui.md)
usa esse contrato sem alterar o schema ou ativar o banco no boot normal.

## Testes sem dados reais

```powershell
node node_modules/vitest/vitest.mjs run src/projects/repository.test.ts
node scripts/test-project-repository.mjs
node node_modules/typescript/bin/tsc --noEmit
npm test
npm run build
git diff --check
```

O script usa IndexedDB nativo, servidor em porta descartável, página de teste
sem boot do aplicativo e perfil Chromium novo no diretório temporário. Cada
caso usa `netlab-idb-test-<UUID>`, fecha conexões e apaga somente seu banco de
teste. O perfil criado pelo script é removido após a execução. Há um cenário
com duas abas reais, além das duas conexões em uma aba. Um sentinel fictício
verifica que o autosave legado permanece intacto e que o banco padrão não abre.

Não há emulador IndexedDB nem dependência nova. O script procura Chrome,
Chromium ou Edge; pode-se informar `NETLAB_CHROMIUM_PATH`. Na suíte Vitest,
casos de navegador aparecem como skipped quando não há executável disponível.
O script standalone falha explicitamente nesse caso. Nada é instalado sozinho.

Quota, fechamento anormal e falhas de requisição são injetados na fronteira
nativa do perfil descartável; os testes não esgotam disco real. Crashes de
energia, políticas de eviction e todos os motores de navegador não são cobertos.
