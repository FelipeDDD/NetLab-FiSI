# Interface de planos e sessões — Fases 5B2-A / 5B2-B

Interface construída na Fase 5B2-A e integrada ao boot normal na Fase 5B2-B.
`WorkspaceApplication.tsx` abre o controller antes de montar App; o fluxo normal
usa a mesma interface testada. Ver [boot e recuperação](application-boot.md).

## Componentes e comportamento

`src/workspace/WorkspaceUI.tsx` contém o provider da interface, a barra de abas,
diálogos e ações de recuperação. O provider recebe controller/conexão já abertos;
não cria outro mecanismo de armazenamento. `WorkspaceViewport` enquadra documentos
ativados uma única vez usando as dimensões medidas pelo React Flow, sem remontar
motor, editor ou terminais. `workspace.css` usa os tokens dos temas existentes.
Resize, zoom do navegador, seleção e alterações nos painéis preservam x/y/zoom.
Depois desse enquadramento inicial, somente navegação ou Fit View explícitos
devem alterar o viewport; adicionar um node também não reenquadra a topologia,
inclusive o primeiro equipamento de um plano vazio. O botão Fit View continua
disponível para reenquadramento explícito. O React Flow não executa um segundo
fit inicial enquanto o workspace controla a ativação.

Regressões de viewport: `node scripts/test-viewport.mjs` (ou
`node node_modules/vitest/vitest.mjs run src/workspace/viewport.test.ts`). O runner
reutiliza o perfil descartável/IndexedDB isolado da suíte existente, mede
`getViewport()` em 700/1440 px, testa painéis, resize, planos/F5 e zoom real do
navegador em 100/125/150%. A sonda de leitura é injetada somente pelo servidor
de testes. Não há acesso ao perfil nem aos dados reais do usuário.

Cabos antigos sem metadados de aparência recebem uma projeção visual da regra
automática existente (`resolvedCableAppearances`). Cores automáticas explícitas
e escolhas manuais salvas são preservadas; renderizar não reescreve documentos,
baselines ou preferências. A projeção é compartilhada entre cabos, pontas RJ45,
marcadores de IP e cards de interfaces.

`App` e `Toolbar` detectam a presença do provider. Sem ele, mantêm a barra e o
fluxo legado. Com ele, a barra de planos aparece abaixo do menu e Datei oferece:
Neu, Öffnen…, Speichern, Speichern unter…, Plan schließen, Gespeicherte Pläne…,
JSON importieren…, Export e Share link.

- Cada aba mostra o nome ou `Unbenannt`, uma marca discreta de Save pendente e
  fechamento. Abas inativas representam documentos, sem simulação em execução.
- Neu cria rascunho vazio independente. Load abre plano em outra aba ou foca seu
  rascunho existente, inclusive se houver alterações sem Save.
- Save atualiza somente o plano associado. Sem plano, pede nome para Save As.
  Save As usa o conteúdo atual e preserva o plano anterior.
- A lista de planos é simples, sem lixeira visual ou histórico. Delete exige
  confirmação, usa a exclusão recuperável existente e preserva rascunhos abertos.
- Arrastar reordena abas. Setas/Home/End alternam; Alt+Seta move a aba focada na
  ordem. Ordem/foco são gravados pelo controller e retomados por F5.
- A última aba pode ser fechada. A sessão vazia é preservada, com ações para
  criar/abrir plano; a área de edição fica inativa até existir outro documento.
- Um rascunho sem plano salvo e idêntico ao documento vazio canônico fecha sem
  diálogo, desde que não haja formulário pendente, gravação pendente ou erro.
  A decisão compara o documento completo, não apenas a quantidade de equipamentos;
  os contratos de autosave, dirty/Save As e persistência permanecem iguais.

A indicação de topo distingue `Wird gesichert…`, alterações ainda em gravação,
`Entwurf gesichert · nicht gespeichert`, `Gespeichert` e `Speicherfehler`.
Rascunho persistido continua diferente de plano salvo manualmente. O debounce e
os checkpoints seguem os contratos da Fase 5A/5B1; não há checkpoint por movimento.

Em 700 px, o catálogo fica inicialmente recolhido no modo experimental e pode
ser expandido. O Inspector usa largura compacta e reserva espaço, em vez de
cobrir o canvas. Essas escolhas não substituem preferências do layout normal.
O teste verifica 700/1440 px em Graphite Dark e Classic Light, sem overflow da
página, com Inspector e terminal reais.

## Fechamento, formulários e erros

Fechar um rascunho com alterações abre `Speichern / Verwerfen / Abbrechen`.
Salvar antes de fechar aguarda o Save correto e confere a sequência de edição.
Novas alterações durante essa espera impedem descarte silencioso. Uma aba
inativa pode ser salva/fechada sem ativar sua simulação.

Formulários não aplicados usam os checks voláteis da Fase 5B1. Troca/abertura
avisa e oferece cancelamento ou descarte explícito. No fechamento, o diálogo
explica que Save inclui somente configurações já aplicadas. Cancelar preserva os
campos. Não há persistência por campo ou restauração de buffers de formulário.

Diálogos nativos fornecem foco modal/Escape. Comandos assíncronos da interface
são bloqueados contra duplicação; a área principal fica `inert` durante a espera.
O motor ainda pode concluir atividades: os contadores/CAS do controller protegem
contra essas alterações tardias. Simples alternância entre rascunhos preservados
não exige Save manual nem confirmação de perda de topologia.

Falhas mostram mensagens curtas em alemão e ações para repetir, exportar backup
ou cancelar. Retry repete a operação original com a identidade/revisão original;
não força a versão vencedora. Erro de JSON não reutiliza retry de outro comando.
Backup exporta o DTO da cópia local afetada, inclusive se ela estiver inativa.
Erros em diálogo também permitem exportar sem abandonar esse diálogo.

Plano salvo excluído não é recriado por Save. O rascunho pode ser exportado,
salvo como outro plano ou descartado explicitamente. Falha no primeiro start
não instala uma demo sobre a sessão; a tela oferece retry/cancelamento e, quando
fornecido, exportação exata do original legado. Documentos incompatíveis ficam
preservados; a interface não repara ou apaga registros automaticamente.

Fechamento no IndexedDB e ativação do runtime não compartilham uma transação.
Se outra edição chegar depois do commit de fechamento, o controller mantém a
cópia em memória para exportação e acusa erro; não recria a aba encerrada. Os
testes de controller cobrem esse limite, CAS do vizinho preparado, fechamento de
aba inativa e consentimento antigo de descarte.

## Importação, exemplos e compartilhamento

JSON, Demo, Labs e exemplos entram por `openDocument`, em outro rascunho.
`createDemoDocument` apenas extrai a construção temporária da demo já existente;
`loadDemo` legado continua aplicando esse mesmo documento. Protocolos não mudam.

Exportação JSON/configurações/diagramas e geração do Share Link mantêm o contrato
atual. O listener do boot recebe o link como oferta separada; aceitar cria
outro rascunho e cancelar só remove a oferta. A sessão restaurada não é substituída.
O boot normal instala esse listener uma única vez; o autosave legado fica cercado.

## Entrada e testes isolados

`src/workspace/reviewEntry.tsx` é uma entrada somente de revisão. Ela exige
`/__workspace_ui_test__` e banco `netlab-idb-test-<UUID>` explícito. A rota é
servida apenas pelo runner local; não consta em `vite.config.ts` ou nos HTMLs
públicos. Não é acessível como opção comum de `/app.html`. Migração de teste
exige fonte fornecida e `legacy.migrate: true`; não obtém o autosave real sozinho.

```powershell
node scripts/test-workspace-ui.mjs
node node_modules/vitest/vitest.mjs run src/workspace/workspaceUI.test.ts src/projects/repository.test.ts src/persistence/sessionController.test.ts src/persistence/persistenceSafety.test.ts src/persistence/topologyDocument.test.ts src/App.test.ts src/paletteLayout.test.ts
node node_modules/typescript/bin/tsc --noEmit
npm test
npm run build
git diff --check
```

O runner reutiliza IndexedDB nativo, Chromium com perfil temporário e portas
descartáveis. A suíte UI cobre 1/2/3 planos, Save/Save As/Load, confirmações,
ordem/foco/F5, sessão vazia, formulários, Delete, erros, duas abas concorrentes,
backup da cópia correta, JSON/Share Links e falhas no primeiro start. Também
confirma que `/app.html` oferece recuperação quando IndexedDB está indisponível.
`workspaceUI.test.ts` verifica a suíte Chromium e as mensagens/estados. A suíte
adicional `applicationBoot.test.ts` testa o boot normal, migração e F5.

O runner usa `scripts/visual-review.mjs`, seguindo [visual-review.md](visual-review.md):
seis PNGs selecionados ficam diretamente em `.playwright-mcp/reviews/` e a galeria
completa (19 capturas), manifesto e resultados ficam no subdiretório datado de
`raw/`. `raw/current.json` indica a galeria atual. Iterações anteriores são
preservadas em `archive/`; as fontes de teste ficam em `raw/workspace-ui-staging/`.
Todo o diretório é ignorado pelo Git, conforme a organização existente.
O script não instala navegador/dependências e falha explicitamente se não houver
Chromium; Vitest marca esses casos como skipped se o executável não existir.

## Ativação — Fase 5B2-B

A entrada assíncrona está conectada ao boot normal e ao build, reutilizando o
provider. O legado não é apagado ao confirmar migração. Falhas não autorizam
fallback gravável no legado; mostram recuperação/exportação e retry explícito.
Os detalhes e o roteiro do primeiro teste real estão em [application-boot.md](application-boot.md).

O listener de pagehide apenas tenta flush; não garante commit ao
encerrar o navegador. Beforeunload avisa sobre edições ainda não persistidas e
formulários, sem exigir Save de um rascunho já confirmado. O rollout normal
antecipa flush também em blur e documento oculto. Eviction e demais browsers
continuam exigindo validação específica.
Nem queda de energia nem dados nunca confirmados têm recuperação garantida.

Conflitos continuam conservadores: há exportação da cópia local e cancelamento,
sem merge automático ou substituição forçada. Não há lixeira visual, histórico
extenso ou checkpoints pedagógicos novos. Os testes não usaram dados reais.
