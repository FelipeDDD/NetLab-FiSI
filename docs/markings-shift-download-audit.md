# Markierungen: seleção, desenho explícito e downloads de testes

Auditoria de 28/10/2026. Nenhum arquivo existente em Downloads foi movido, apagado
ou sobrescrito. Nenhum dado real de navegador foi alterado. Commit/push não fazem
parte desta correção.

## Conflito de Shift

A versão local anterior observava `userSelectionRect` e executava
`setPendingMarkingRect` em `onSelectionEnd`. Assim, a seleção múltipla também
ativava a criação de uma área. Esse vínculo foi removido.

O novo acesso é **Markierungen → Neue Fläche zeichnen**. Uma superfície temporária
usa o mesmo sistema de coordenadas do editor de extensões, cursor crosshair e
limite mínimo existente. Ao soltar um retângulo válido, ela é desmontada e o editor
compacto abre. **Bereich speichern** confirma; Escape/**Abbrechen** cancela.

Shift, arraste de seleção, clique em dispositivos e demais interações normais
não produzem prévias. Áreas automáticas/livres, bounds, offsets, L/U/T, união SVG,
histórico e documentos existentes mantêm seus contratos.

### Limitação encontrada em Ctrl+C/Ctrl+V na auditoria inicial

**Atualização posterior:** o clipboard de equipamentos foi implementado na rodada
seguinte; consulte [`device-clipboard-placement.md`](device-clipboard-placement.md).
O texto abaixo registra o diagnóstico anterior à implementação.

Neste checkout não há handlers de copiar/colar equipamentos ou seleção no canvas,
nem esse comportamento automático na versão instalada do React Flow. Existem
cópia de IP, configuração nftables, Share Link e clipboard do xterm. A validação
envia Ctrl+C/Ctrl+V com quatro PCs selecionados e confirma que a seleção não vira
marcação; não afirma que os quatro equipamentos foram duplicados. Implementar
clipboard de topologia seria uma tarefa separada, com novos IDs/MACs e histórico.

## Inventário dos downloads do aplicativo

| Origem | Arquivos/ação | Gatilho encontrado |
|---|---|---|
| `src/store.ts` | `netsim-topology.json`, configs ZIP, containerlab, compose, SVG, PNG, relatório HTML | Ações explícitas Export na toolbar |
| `src/store.ts` | `netsim-attempt-*.json` | Exportação explícita de tentativa de Lab |
| `src/store.ts` | `netsim-autosave-original.json`, `netsim-import-original.json` | Botões explícitos de recuperação do modo legado |
| `src/workspace/WorkspaceUI.tsx` | `NetLab-Backup.json` ou nome do plano | **Backup exportieren**, inclusive conflito de uma aba inativa |
| `src/workspace/WorkspaceApplication.tsx` | `netlab-autosave-original.json` | **Original exportieren** na recuperação de boot |
| `src/workspace/WorkspaceApplication.tsx` | `netlab-storage-recovery.json` | **Speicher-Backup exportieren** |
| `src/workspace/reviewEntry.tsx` | Original legado | Botão de recuperação no entrypoint exclusivamente de testes |

`src/export/diagram.ts` também cria um blob URL para converter SVG em PNG; isso
não inicia um download por si só. Importação e Share Link não baixam arquivos.
`saveNow` grava no localStorage legado ou delega ao controller; não chama export.
Save/Save As/Load, rascunhos e recovery não chamam esses downloads sem os botões.
As rotinas de produção e a política de recuperação não foram alteradas.

## Evidência da origem dos arquivos observados

Foram inspecionados somente arquivos com os quatro prefixos informados pelo usuário:

- 12 `netlab-autosave-original`: seis correspondem exatamente à entrada sintética
  inválida `  {unsupported original` (23 bytes); seis contêm o nome sintético
  `Desktop-Legacy` da fixture de boot (778 bytes).
- Seis `NetLab-Backup` contêm `Recover this local draft`, nome introduzido pelo
  teste de erro de quota (2619 bytes).
- Seis `netlab-storage-recovery` contêm um draft com `schemaVersion: 99`, adulteração
  intencional do teste de documento incompatível.
- Dois `netsim-topology.json` não têm origem demonstrável apenas pelo nome. Não
  foram classificados como defeito do aplicativo nem apagados.

Os primeiros 24 têm correspondência específica com
`scripts/application-boot-review.mjs`, que clica os botões de recuperação para
testá-los. Não são evidência de exportação espontânea pelo IndexedDB.

### Causa do vazamento para Downloads

O runner já criava um perfil temporário, mas não definia um diretório global de
downloads. O review de boot chamava `Browser.setDownloadBehavior({behavior:'deny'})`
somente no início. Depois do cenário de fechar/reabrir Chromium, o novo processo
voltava à política padrão. Os cenários seguintes clicavam **Backup exportieren**,
**Original exportieren** e **Speicher-Backup exportieren**; o perfil temporário
ainda usava a pasta Downloads do Windows. Repetir a suíte produzia cópias numeradas.

## Correção e validação reutilizável

`scripts/test-project-repository.mjs` configura `allowAndName`, com destino
`<perfil-descartável>/downloads`, **em cada lançamento**, antes de navegar para
qualquer página da aplicação. Isso também cobre reinícios, novas abas e todos os
runners que reutilizam o harness. Se a configuração falhar, o lançamento não
retorna uma página pronta para executar testes.

O runner observa `Browser.downloadWillBegin`/`Browser.downloadProgress` e registra
nome sugerido, operação, geração do processo, conclusão, tamanho e SHA-256. Os
arquivos são salvos por GUID, lidos e verificados somente dentro da pasta temporária.
A limpeza existente remove exclusivamente o perfil recém-criado e validado sob
o diretório temporário do sistema. Os bloqueios pontuais dos reviews de boot e
workspace foram retirados para permitir testar os downloads reais nesse destino.

O review de boot exige **zero** downloads em inicialização, autosave, Save/Save As,
restauração, F5, reabertura, Share Link e recuperação sem clique. Exige a contagem
correta nos casos que solicitam exportação, incluindo o submenu Export real.
O relatório JSON do runner mantém a correlação arquivo → cenário responsável.

```powershell
node scripts/test-area-markings.mjs
node scripts/test-application-boot.mjs
node scripts/test-workspace-ui.mjs
node node_modules/vitest/vitest.mjs run src/areaMarkings.test.ts src/markingGeometry.test.ts src/terminals.test.ts src/persistence/topologyDocument.test.ts src/persistence/persistenceSafety.test.ts
```

Esses comandos usam perfis, portas e bancos descartáveis; não usar o perfil real
para reproduzir cenários de falha. Logs e screenshots continuam sob
`.playwright-mcp/`, ignorados pelo Git.

## Resultado desta validação

- 328 testes direcionados passaram em cinco arquivos (geometria, marcações,
  histórico/store e segurança da persistência).
- Chromium real: 117 casos no runner de Markierungen, 116 no de boot e 122 no
  de workspace UI, sem falhas nem erros de JavaScript. Esses totais incluem
  cenários comuns do harness e não devem ser somados como testes distintos.
- O boot registrou seis downloads explicitamente solicitados; workspace UI,
  quatro. Todos concluídos e verificados por tamanho/SHA-256 dentro do perfil
  temporário. Os cenários de boot sem exportação exigiram zero downloads.
- Os hashes dos arquivos sintéticos de original legado e backup de quota
  coincidiram com os arquivos antigos encontrados em Downloads.
- A comparação final dos 26 arquivos relevantes em Downloads manteve nomes,
  tamanhos e SHA-256 idênticos à leitura inicial. Nenhum arquivo foi manipulado.
- Shift selecionou quatro PCs sem prévia de área. O desenho explícito, abertura
  automática do editor, Save/Cancel/Escape, retorno à seleção, sobreposição,
  L/U/T, redimensionamento, Undo/Redo, recarga, Save As e troca de planos foram
  exercitados em perfil descartável. Capturas em 700/1440 px e nos dois temas.
- TypeScript, build e `git diff --check` passaram. O build conserva o aviso de
  chunk acima de 500 kB; nenhuma dependência foi adicionada.

As quatro capturas principais estão em `.playwright-mcp/reviews/`; as 19 capturas
da rodada e o índice ficam na revisão `raw/2026-10-28--area-marking-free-areas/`.
Logs da execução estão em `.playwright-mcp/explicit-drawing-review.log`,
`.playwright-mcp/download-isolation-review.log` e
`.playwright-mcp/workspace-download-review.log`.
