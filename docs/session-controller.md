# Controller de sessão — Fase 5B1

Controller modular, integrado à interface existente e ao aplicativo normal na
Fase 5B2-B. `WorkspaceApplication.tsx` é o único proprietário do boot e dos
listeners. Importar os módulos do controller continua sem efeitos de boot.
Ver [ativação e recuperação](application-boot.md).

## Entrada e módulos

| Arquivo em `src/persistence/` | Responsabilidade |
| --- | --- |
| `sessionController.ts` | Comandos, debounce, fila por rascunho e transições. |
| `sessionBootstrap.ts` | Retomada idempotente e migração explicitamente autorizada. |
| `sessionTypes.ts` | Capacidade do runtime, identidades, estados/resultados. |
| `zustandSessionRuntime.ts` | Adaptador para captura e ativação existentes no store. |
| `openSessionController.ts` | Abertura explícita + start, com recuperação se falhar. |
| `pendingForms.ts`, `usePendingForm.ts` | Checks voláteis de formulários; não armazenam texto. |

Construir controller/adaptador não inicia persistência. `start()` recebe uma
conexão já aberta. `openSessionController({ runtime, repositoryOptions, bootstrap })`
oferece abertura + start para a entrada assíncrona. O chamador deve
encerrar controller e conexão explicitamente.

O store oferece `captureWorkspaceDocument`, `activateWorkspaceDocument`,
`attachWorkspacePersistence` e `workspaceIdentity`. A ativação reutiliza a
projeção/descarte existentes: `topologyGeneration`, terminais, Labs, captura,
relógios e histórico. Apenas o foco é instalado como `sim.net`; redes temporárias
de validação são descartadas sem executar o Scheduler. Rascunhos inativos são dados.

Ao assumir explicitamente o store, cancela o debounce legado pendente e recebe
notificações de configuração/flush. A chave `netsim:autosave:v1` fica protegida
contra escrita. Sem essa conexão, o comportamento legado permanece igual.
Desconectar não copia IndexedDB para o legado nem religa gravações: a proteção
só é reinicializada por boot legado explícito. Não há troca automática de modo.

## API e estados

Operações retornam `SessionResult<T>`, incluindo os erros do repositório e
`runtime-changed`, `unapplied-forms`, `not-started`, `disposed`,
`legacy-recovery-required`. Exceções de observadores não interrompem gravações.

| API | Contrato |
| --- | --- |
| `start({ sessionId?, legacy?, discardStartupChanges?, expectedRuntimeDocument? }?)` | Restaura sessão/foco; repetir no controller pronto é idempotente. O snapshot esperado protege edições anteriores à abertura do banco. |
| `getState()` / `subscribe(listener)` | Snapshot independente e notificações de identidade, sessão, rascunhos, erros e oferta de Share Link. |
| `flush(draftId?)` | Captura configurações aplicadas e aguarda a fila; também permite retry explícito com a revisão original. Sem ID, usa o ativo. |
| `switchDraft(id, { discardUnappliedForms? }?)` | Troca segura entre rascunhos abertos, sem Save manual. |
| `openDocument(document)` | Cria rascunho independente para configuração nova/importada e alterna com segurança. |
| `openPlan(planId)` | Abre plano salvo ou foca seu rascunho existente, preservando modificações. |
| `save()` / `save(name)` | Save / Save As; retorna plano, `savedSequence` e `hasNewerEdits`. |
| `saveOpenDraft(id, name?)` | Save / Save As de uma aba aberta, inclusive inativa, pela mesma fila. |
| `closeDraft(id, { expectedEditSequence, discardChanges?, discardUnappliedForms? })` | Fecha ou descarta com consentimento da sequência exata; mantém memória se houver edições tardias. |
| `reorderTabs(ids)` | Reordena a sessão com CAS, sem ativar outra simulação. |
| `recoveryDocument(draftId?)` | Cópia independente para exportação/recuperação, inclusive após falha. |
| `offerShare(document)` / `acceptShare()` | Oferta em memória; aceitação explícita cria outro rascunho. |
| `dispose()` | Cancela timers/transações e invalida respostas tardias. Não é flush. |

Cada rascunho informa revisão, sequência local/persistida, `pendingPersistence`,
`saving`, `manualSavePending`, base e erro. Persistir rascunho não significa Save
manual. Voltar ao conteúdo exato da base limpa `manualSavePending`; sem base,
continua pendente de Save As. Sessão vazia é válida: ativa topologia vazia e exige
abrir um documento/plano antes de editar. Edição sem identidade é erro recuperável.

Sem ID, `recoveryDocument()` captura a topologia atual; com ID, retorna a última
cópia capturada daquele rascunho. Isso permite recuperar tanto o trabalho anterior
quanto uma topologia substituída por um comando externo, sem confundir identidades.

## Escritas e troca

Debounce inicial: 500 ms. Cada alteração aplicada captura um DTO independente e
incrementa a sequência. Todas as escritas de um rascunho, inclusive Save, usam sua
fila. Confirmações avançam revisão/sequência persistida sem substituir edições
novas pelo snapshot antigo. Edições durante a escrita são gravadas na continuação.
Falhas mantêm memória, bloqueiam retry automático repetido e permitem exportação.
Conflitos não são reenviados com revisão nova para forçar sobrescrita.

Save/Save As reutilizam as transações/CAS/checkpoints da Fase 5A. Autosave não
escreve planos nem cria checkpoints por movimento. Novas edições durante Save
produzem `hasNewerEdits: true` e continuam pendentes de Save manual. Save fica
vinculado à identidade na chamada; se uma troca anterior na fila mudar essa
identidade antes da execução, nenhum outro plano será salvo.

A troca prepara o destino, confirma persistência da origem e grava foco com CAS
da sessão e da revisão preparada (`expectedActiveDraftRevision` em
`setSessionLayout`). `openPlanDraft` aceita `options.activate: false` para registrar
sem mudar o foco existente antes da transição. Defaults anteriores são preservados.
Edições durante o commit de foco são capturadas/persistidas novamente. Não há
espera entre a última checagem e a ativação síncrona. Falhas preservam a rede
atual/terminais; preparações abandonadas são descartadas. Sucesso limpa caches,
eventos, pacotes, buffers xterm e Undo/Redo, restaurando configuração e Labs.

Runtime e IndexedDB não compartilham transação. Se uma edição/formulário tardio
falhar após commit de foco, tenta compensar o foco anterior com CAS e mantém a
rede atual. Outra aba pode impedir essa compensação: não sobrescreve o vencedor
nem ativa o destino. A futura UI deverá apresentar erro/cópia local, sem prometer
que foco no disco e rede em memória coincidam após essa falha.

## Retomada e fontes

Sem ID explícito, `session-controller:v1:resume` em `meta` identifica a sessão.
Na ausência do marcador, escolhe a sessão anterior de atividade mais recente ou
reserva IDs e primeira configuração com CAS. Depois cria sessão/primeiro rascunho
atomicamente. Interrupção antes da criação, perda de resposta após commit e dois
primeiros boots concorrentes reutilizam os IDs, sem sessões duplicadas.

A reserva conserva a configuração/plano inicial para retomar sem trocar a fonte;
não há limpeza automática dessa cópia. Sessão existente, inclusive vazia, não
recebe outra aba inicial por F5. ID explícito é só restaurado e não altera a
seleção padrão. Registros incompatíveis falham sem fallback para demo.

Edição durante start assíncrono preserva a rede atual. Mudanças aplicadas nesse
intervalo bloqueiam retry até recuperação/exportação ou
`discardStartupChanges: true` explícito. Retry não autoriza descarte silencioso.

Migração requer `legacy: { storage, origin, migrate: true }`, com capacidade somente
de leitura. Só ocorre sem sessão/reserva anterior e reutiliza
`migrateLegacyAutosave`. Preserva bytes, arquivo bruto, marcador e checkpoints.
Falha, rejeição, fonte alterada ou plano migrado excluído exigem recuperação.
Sessão existente tem prioridade; outra versão do legado exige decisão futura.

Banco indisponível não conecta/ativa o runtime. `openSessionController` retorna
`legacyMode: true`, diagnóstico e recuperação exata da fonte legada fornecida.
O chamador mantém o fluxo atual; nenhum fallback sobrescreve planos ou legado.
Share Links são ofertas separadas, sem novo listener de URL. Aceitação cria outro
rascunho. Uma oferta nova não pode substituir uma aceitação já enfileirada.
Oferta não aceita permanece volátil, como no fluxo legado atual.
Uma nova oferta recebida durante a aceitação anterior permanece pendente.

## Formulários e Fase 5B2

Checks foram conectados a `useInspectorDraft` (nome, serviços, DNS, SSID, VLAN,
textos no blur), `InterfaceIpv4Panel` (inclusive valores inválidos/incompletos) e
`DhcpPoolCard` (aplicação por botão). Usam refs para detectar edição antes do próximo
render e removem checks ao desmontar. O registro contém callbacks booleanos, sem
valores de campos. DHCP mantém marca conservadora até aplicar, mesmo ao redigitar
valores originais. Não há persistência por campo.

`unapplied-forms` impede troca até aplicação ou decisão explícita de descarte.
O chamador do override `discardUnappliedForms` deve coordenar os controles durante
a transição. O mesmo registro é usado na guarda de fechamento do boot normal.

As [Fases 5B2-A/B](workspace-ui.md) implementam abas/Save/Load/fechamento,
diálogos, recuperação, roteamento de fontes externas e integração ao boot.
Substituir topologia por fora do controller muda a identidade e bloqueia
gravações/trocas até recuperação; comandos legados não devem contornar essa fronteira.

`applicationLifecycle.ts` instala a guarda e os flush antecipados no boot normal.
IndexedDB é assíncrono: não garante flush ao encerrar, nem recuperação de edição
sem commit. Os testes F5/reinício recuperam rascunhos confirmados, incluindo
alterações sem Save manual. Não simulam queda de energia, fsync ou eviction.

## Validação isolada

`sessionController.browser.ts` cobre A → B → A, debounce, respostas atrasadas,
novas edições durante Save/troca, falhas/abort/conflitos, formulários, revisão do
destino, retomada interrompida/concorrente, migração e Share Link. Usa também
Zustand, xterm e formulário IPv4 React reais. Verifica terminais, Scheduler,
histórico, Labs e invariância do autosave legado.

O runner existente inclui F5 e encerramento/reabertura do Chromium com perfil,
portas e bancos descartáveis `netlab-idb-test-<UUID>`. Casos do repositório não
executam boot. A suíte adicional `applicationBoot.test.ts` executa o boot real
com banco redirecionado no harness. `sessionController.test.ts` cobre indisponibilidade e
registro de checks. Não há dependências novas.

```powershell
node node_modules/vitest/vitest.mjs run src/projects/repository.test.ts src/persistence/sessionController.test.ts src/persistence/persistenceSafety.test.ts src/persistence/topologyDocument.test.ts src/components/Inspector.test.ts src/components/InterfaceIpv4Panel.test.ts src/components/DhcpPoolsPanel.test.ts
node node_modules/typescript/bin/tsc --noEmit
npm test
npm run build
git diff --check
```
