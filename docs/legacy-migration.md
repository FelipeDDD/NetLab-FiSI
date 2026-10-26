# Migração recuperável do autosave legado — Fase 4

Serviço explícito, independente do boot e da interface. **Não está ativado no
aplicativo**, não escolhe um projeto ativo e não substitui o autosave atual.
Não abre um banco sozinho: recebe um repositório já aberto e uma capacidade
somente de leitura para `netsim:autosave:v1`.

A preparação da primeira sessão no [controller 5B1](session-controller.md)
reutiliza este serviço somente com `legacy.migrate: true` explícito. A integração
normal permanece desativada; os testes usam apenas perfil/bancos descartáveis.

## Contratos e arquivos

- `projects/legacyTypes.ts`: origem, arquivo bruto, marcador, resultados e erros.
- `projects/legacySource.ts`: leitura protegida, fingerprint e arquivos de recuperação.
- `projects/legacyInspection.ts`: validação conservadora contra perda por normalização.
- `projects/legacyMigration.ts`: transação de criação, retomada e verificação.
- `projects/repository.ts`: criação opcional com checkpoint inicial e leitura
  consistente de projeto + controles + checkpoint.

Exportações estão em `src/projects/index.ts`:

| API | Contrato |
| --- | --- |
| `readLegacyAutosave(storage, origin)` | Distingue ausência, texto presente (inclusive vazio) e erro de leitura. |
| `identifyLegacySource(original)` | Produz fingerprint e chaves estáveis do arquivo/marcador. |
| `inspectLegacyTopology(rawText)` | Prepara um documento v1 sem alterar `sim.net`; recusa perdas silenciosas. |
| `migrateLegacyAutosave(options)` | Migra ou reconhece uma migração já confirmada; nunca escreve em localStorage. |
| `loadLegacyArchive(repository, archiveKey)` | Recupera e verifica a cópia bruta sem depender da topologia atual. |
| `createLegacyRecoveryFile(rawText)` | Retorna nome, MIME, encoding e bytes para futura exportação; não baixa nem grava arquivos. |
| `readLegacyRecoveryFile(file)` | Reconstrói exatamente o texto exportado. |

`migrateLegacyAutosave` recebe `repository`, `storage: Pick<Storage, 'getItem'>`,
`origin` explícita, nome opcional, `AbortSignal` e relógio opcional para testes.
O nome padrão é `Topologia recuperada` e só vale na criação; tentativas repetidas
não renomeiam projetos já editados.

Se a abertura do IndexedDB falhar, o futuro controller deve permanecer no modo
legado e pode usar `readLegacyAutosave` + `createLegacyRecoveryFile` para
recuperação. O serviço também trata falhas das operações do repositório,
incluindo conexão indisponível/fechada, quota e cancelamento.

## Origem, fingerprint e cópia bruta

A origem contém `storage: 'localStorage'`, `key: 'netsim:autosave:v1'` e a
identidade de origem fornecida pelo chamador (normalmente `location.origin`).
Essa identidade deve permanecer estável na integração futura.

O algoritmo `sha256-utf16le-v1` calcula SHA-256 sobre os code units UTF-16LE
exatos do texto, sem BOM. Não faz trim, parse ou normalização antes do hash.
Isso também distingue strings malformadas com surrogates isolados, que uma
conversão UTF-8 comum substituiria pelo mesmo caractere de reposição.

As chaves incluem hashes separados da origem e do conteúdo:

`legacy-autosave:v1:<hash-da-origem>:<hash-do-conteúdo>:raw|migration`

Mesma origem e mesmo texto geram a mesma identidade. Outra origem ou qualquer
mudança no texto, inclusive whitespace, gera conteúdo distinto. Não há deduplicação
semântica que descarte versões originais potencialmente importantes.

O arquivo em `meta` contém schema próprio, procedência, fingerprint, texto exato,
data da captura e eventual diagnóstico. O marcador contém o mesmo vínculo de
origem, ID do projeto, chave do arquivo, fingerprint do documento canônico e
revisões iniciais. Os controles não alteram a versão estrutural do banco ou os
formatos `ProjectDocument v1` e `netsim v1`.

Arquivos e marcadores existentes nunca são substituídos por outro conteúdo.
Se um arquivo bruto já existe, sua revisão participa do CAS da criação; seu
conteúdo, data e diagnóstico são preservados. A revisão de controle pode crescer
nessa confirmação, sem mudar o arquivo. Não há limpeza automática desses dados.

## Fluxo transacional

1. Ler o legado com tratamento de exceções; ausência encerra sem criar registros.
2. Capturar sua identidade e preparar/validar o documento fora da transação.
3. Consultar um marcador existente antes de tentar criar outro projeto.
4. Para uma fonte válida ainda não migrada, reservar UUID independente dos
   equipamentos e criar projeto, documento, checkpoint inicial, arquivo bruto
   e marcador na mesma transação dos quatro stores.
5. Aguardar `transaction.complete`.
6. Ler projeto, controles e checkpoint em uma única transação de leitura.
7. Conferir identidades, texto bruto, revisões e fingerprints antes de retornar
   `migrated` ou `already-migrated`.

O repositório mantém seu contrato de checkpoints anteriores à revisão atual:
`createProject({ initialCheckpoint: true, ... })` cria checkpoint 1 e documento
atual na revisão 2, com o mesmo conteúdo, atomicamente. Chamadas normais sem essa
opção continuam criando revisão 1 e nenhum checkpoint. O motivo `initial` é uma
extensão aditiva do registro de checkpoint; stores, chaves e versões não mudam.

O checkpoint inicial segue a política limitada do repositório e pode ser podado
após edições. A cópia bruta e o marcador ficam em `meta`, independentes dessa
retenção. Reexecutar a migração após edições reconhece o marcador, sem exigir
que o documento atual ainda seja igual ao inicial. Se o checkpoint 1 continuar
presente, seu conteúdo também é verificado.

`loadProjectRecoveryState(id, { controlKeys, checkpointRevision, includeDeleted })`
faz a leitura consistente necessária para essa confirmação, sem hashing ou
esperas externas dentro da transação.

## Validação sem conversão parcial

A migração usa os leitores legados existentes, mas compara a fonte com o
documento preparado. São aceitas compatibilidades conhecidas: interfaces
implícitas, switches com `ifaces: []`, cores antigas, defaults de terminal,
DHCP legado e representações equivalentes de IPs, portas e registros DNS.

Links inválidos, tipos desconhecidos, formatos futuros e campos que seriam
descartados ou ajustados destrutivamente são recusados. Isso inclui cores
órfãs/inválidas, opções visuais desconhecidas e valores que seriam limitados
silenciosamente. Uma fonte recusada recebe somente um arquivo bruto com
diagnóstico: não recebe projeto, checkpoint nem marcador de migração concluída.

Essa política é intencionalmente conservadora. Uma fonte que o importador comum
normalizaria pode exigir revisão manual antes de ser migrada. O original continua
disponível integralmente na chave e no arquivo; nenhuma demo é criada pelo serviço.

## Idempotência, falhas e retomada

| Situação | Resultado |
| --- | --- |
| Chave inexistente | `absent`, sem projeto recuperado artificial. |
| JSON inválido/versão futura/perda de campos | `rejected` com diagnóstico e arquivo bruto confirmado. |
| Leitura/fingerprint/IDB falha | `failed`, com etapa, diagnóstico e texto original quando ele pôde ser lido. |
| Falha ao arquivar fonte inválida | Também conserva `sourceDiagnostic`, além do erro de armazenamento. |
| Interrupção antes do commit | Todos os registros da tentativa sofrem rollback; nova tentativa pode criar o projeto. |
| Interrupção depois do commit e antes da verificação | O marcador fica `committed`; a chamada não confirma sucesso e pode informar `committedProjectId`. A próxima tentativa verifica o bundle existente. |
| Duas abas concorrentes | CAS do marcador/arquivo permite um único bundle; a outra aba verifica o vencedor. Há um limite de tentativas para contenção. |
| Projeto migrado editado/excluído | `already-migrated` retorna o projeto atual/tombstone, sem sobrescrever edições nem recriar o excluído. |
| Marcador/arquivo inconsistente | Falha de integridade, sem reparo ou recriação automática. |

O estado `committed` do marcador registra apenas o commit atômico. O serviço só
declara sucesso depois da leitura de confirmação; não persiste um marcador
de “verificação concluída” antes de verificar. Uma resposta perdida após commit
também é resolvida pela mesma retomada, sem exigir desfazer gravações confirmadas.

## Fonte alterada e Share Link

localStorage e IndexedDB não compartilham transações. O serviço protege o
snapshot lido e relê a origem após a verificação, retornando `sourceAfter`:
`unchanged`, `changed` (com o novo texto) ou `unavailable` (com diagnóstico).
Ele nunca tenta restaurar a chave para a versão capturada.

Uma chamada seguinte com conteúdo diferente cria outro projeto e outro arquivo,
mantendo o projeto anterior, inclusive suas edições. Mudanças intermediárias que
nunca chegaram a ser lidas pelo serviço não formam um journal automático.

O serviço não consulta `location.hash`, não consome `#t=` nem ativa a rede. Um
Share Link não interfere na leitura da chave legada. Na Fase 5, o controller
deverá proteger o legado antes de selecionar conteúdo compartilhado; **esse hook
de boot ainda não existe em produção**. A prioridade atual de carregamento não
foi modificada nesta fase.

## Recuperação, downgrade e limites

Exportação usual: UTF-8 com o texto original, sem JSON.stringify do conteúdo.
Para strings com UTF-16 malformado, o arquivo de recuperação usa UTF-16LE com
BOM e deve ser reaberto com `readLegacyRecoveryFile`, preservando cada code unit.
Esse caso excepcional não deve ser entregue diretamente ao importador JSON
comum, que espera texto UTF-8. O serviço não tenta “corrigir” JSON inválido.

A chave antiga permanece disponível para a versão anterior do aplicativo.
Edições futuras no IndexedDB **não** aparecem nela automaticamente; não existe
espelhamento de projetos diferentes para o mesmo slot. O conteúdo
`loadProject(...).document.topology` continua no formato v1 para uma futura
exportação compatível. As exportações atuais do aplicativo não mudaram.

Fingerprints exigem Web Crypto em contexto seguro (HTTPS/localhost); uma falha
preserva a fonte e permite exportação, sem usar um hash mais fraco. Arquivos
brutos não são podados automaticamente, portanto novas versões consomem espaço.
Limpeza do navegador/eviction e queda de energia não podem ser resolvidas por
esta camada; backups externos continuam necessários.

## Verificação e integração ainda desativada

Os testes usam fontes fictícias, bancos `netlab-idb-test-<UUID>` e Chromium com
perfil descartável. Incluem duas abas reais, reload após commit, abort/quota,
retomada, tombstones, versões inválidas e preservação exata do localStorage.
Quota e interrupções são injetadas; não se esgota disco nem se usa perfil real.

```powershell
node node_modules/vitest/vitest.mjs run src/projects/legacyMigration.test.ts src/projects/repository.test.ts
node scripts/test-project-repository.mjs
node node_modules/typescript/bin/tsc --noEmit
npm test
npm run build
git diff --check
```

Continuam desativados: migração automática, seleção de IndexedDB no boot,
autosave por projeto, alternância de projetos e telas de gerenciamento.
A Fase 5 ainda precisa coordenar salvamento assíncrono, projeto ativo, falhas de
abertura, mudanças de origem durante a migração e tratamento separado de Share
Links. As fronteiras de captura/preparação/ativação das Fases 1/2 permanecem as
mesmas; nenhuma operação deste serviço descarta sessões ou altera `sim.net`.
