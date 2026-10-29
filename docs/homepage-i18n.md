# Homepage React e idiomas

## Auditoria antes da implementação

- `/index.html` era uma landing page HTML/CSS herdada do NetSim. `/app.html` é uma entrada independente no build Vite; os URLs serão mantidos.
- `main.tsx` delega o boot a `workspace/WorkspaceApplication.tsx`: abre o repositório, migra de forma protegida, restaura a sessão pausada e instala um único conjunto de listeners. A homepage não deve importar esse módulo, `store.ts`, xterm ou a engine.
- `WorkspaceUI.tsx` já oferece criação de rascunhos, lista de planos e operações protegidas contra formulários pendentes. `Toolbar.tsx` abre Labs e `ExerciseMenu`. Links da homepage devem encaminhar intenções a esses fluxos, depois do boot, sem substituir a sessão.
- `projects/repository.ts` separa metadados (`projects`) dos documentos e revisões. Abrir o repositório normal pode criar o banco; a listagem da homepage deve ser somente leitura, sem criar/atualizar/migrar armazenamento. Não consultar documentos para montar cards recentes.
- `uiTheme.ts` e `themes.css` oferecem tokens semânticos e preferência independente. Background, layout e aparência do terminal permanecem separados.
- Não havia catálogo/hook de tradução. A UI mistura alemão/inglês, os Labs e enunciados têm idioma próprio; comandos e contratos não podem ser traduzidos por substituição global.
- A fábrica de exercícios é interna; somente o catálogo publicado em `exercises/beta.ts` deve ser anunciado como acessível. Não alterar verificadores nem `resolveBy: 'id'`.

## Decisões

Homepage React separada, sem simulação decorativa real. SVG ilustrativo com interação explícita e animação curta; não há timer contínuo. Idioma é uma preferência de apresentação independente, sem alterar documentos ou esquema IndexedDB. Inglês é o catálogo-base; sem preferência, alemão mantém a experiência atual, também em perfis novos. A tradução do editor será gradual e explícita.

## Implementação e navegação

| Arquivos | Responsabilidade |
|---|---|
| `index.html`, `src/home/main.tsx` | Entrada React da homepage; aplica tema salvo e idioma. Não importa boot do editor. |
| `src/home/Home.tsx`, `home.css` | Hero, ações reais, planos recentes, capacidades, Labs e aviso de cobertura parcial. Layout separado do CSS do editor, usando os tokens existentes. |
| `src/home/HomeTopology.tsx` | SVG com router, switch, hosts e server. Seleção por mouse/Enter/Espaço e descrição da função. Comunicação explicitamente ilustrativa. |
| `src/home/recentPlans.ts` | Leitura somente dos stores `projects` e marcador `meta`; não lê topologias, revisões ou rascunhos. Ordena por atualização e omite excluídos. |
| `src/projects/projectMetadata.ts` | Validação leve extraída sem mudanças de comportamento; `projectDocument.ts` reexporta a API anterior. |
| `src/home/navigation.ts`, `components/Toolbar.tsx` | Intenções transitórias em `/app.html?home=new\|load\|labs\|exercises\|plan`. IDs de planos validados; links relativos funcionam também em subdiretórios. |
| `workspace/WorkspaceUI.tsx` | Novo acesso `openPlan(id)` reutiliza o mesmo guard e controller da lista existente. Demais handlers não foram reimplementados. |
| `i18n/HomeLink.tsx`, `workspace/WorkspaceApplication.tsx`, `app.html` | Retorno traduzido à homepage, inclusive na recuperação; instalação/remoção do listener de idioma. |

As intenções só são consumidas depois de o boot normal concluir. São retiradas da URL com `replaceState` antes da ação, para F5 não duplicar criações. Outros parâmetros e hashes permanecem. Share Links conservam o fluxo de oferta/aceitação e têm precedência; nunca são importados silenciosamente pela homepage. Um erro ao abrir um plano é tratado pelos avisos/recuperação existentes.

`Continue` abre `/app.html` sem intenção e deixa a recuperação existente restaurar abas e rascunhos. `New` pede um rascunho independente; nunca substitui planos anteriores. `Open` abre o diálogo existente. Labs e Übungen abrem seus menus atuais, não executam um exercício ao visitar a homepage. Ao retornar à homepage há navegação de documento: os mesmos guards de fechamento e gravação antecipada continuam ativos. A homepage não mantém uma segunda engine em background.

O catálogo beta publicado contém **2 exercícios** (`betaStudents.json`). A fábrica e seus 20 drafts não foram expostos. Títulos/enunciados originais são mantidos.

## Segurança da listagem

`readRecentPlans()` abre o IndexedDB **sem versão**, aborta `onupgradeneeded` em perfis sem banco e fecha a conexão após a transação readonly. Valida a versão/marcador e usa a validação original de metadados. Não chama migração, Session Controller, `loadProject()` nem grava `lastOpenedAt`. Dados incompatíveis, acesso negado e timeout produzem uma mensagem com tentativa novamente e acesso ao editor/recuperação; não são mascarados como uma lista vazia. A lista é um snapshot da visita, atualizado ao recarregar; não é um novo sistema de documentos.

## Sistema de idiomas

- `src/i18n/index.ts`: idiomas, chave `netlab:language:v1`, normalização, interpolação e hook `useTranslation()`.
- Catálogos separados: `common`, `home`, `navigation`, `workspace`, `exercises` em `src/i18n/catalogs/`.
- Cada domínio declara inglês como origem (`as const`) e DE/PT-BR como `Record<keyof typeof en, string>`. Chaves ausentes/extras são erros de TypeScript.
- `translate(language, key, values)` usa inglês se uma mensagem válida estiver indisponível. Nunca retorna a chave como texto. Chaves de chamadas React são tipadas por domínio.
- `{name}`, `{date}` e `{count}` são placeholders; passe valores explicitamente. React escapa texto, não há HTML traduzido ou `dangerouslySetInnerHTML`.
- Contagem de planos usa `Intl.PluralRules`; datas nas listas migradas usam `Intl.DateTimeFormat`/locale escolhido. Novos plurais devem ter variantes explícitas apropriadas ao idioma.
- Zustand já era dependência do projeto; o hook compartilha somente uma preferência de apresentação. Não depende do store de rede, de documentos ou do histórico.
- Ausência de preferência → `de`, sem escrever no armazenamento. Valor salvo válido tem prioridade. Falha de localStorage permite usar a escolha nesta visita. F5/restauração usam a preferência salva; o evento `storage` sincroniza mudanças de idioma entre abas.
- `installLanguageDocument()` atualiza `html.lang` e devolve cleanup. A troca não remonta App/React Flow, não troca IDs e não recria xterm.
- Seletor na homepage e em Einstellungen. A tradução parcial do editor é avisada em ambos os locais.

### Traduzir um componente

1. Escolher/criar um catálogo por domínio; não colocar conteúdo de protocolos no catálogo de UI.
2. Adicionar chave e texto EN, DE e PT-BR, preservando os mesmos placeholders.
3. Usar o hook:

```tsx
const { t, language } = useTranslation();
return <button title={t('workspace.deleteNamed', { name: plan.name })}>
  {t('workspace.delete')}
</button>;
```

4. Usar `language` em formatação de datas/contagens, nunca para alterar IPs, comandos ou dados persistidos.
5. Adicionar o arquivo ao teste de chaves estáticas/órfãs. Famílias de chaves dinâmicas têm listas explícitas nos testes, não uma exclusão geral.
6. Conferir teclado, foco e textos longos em Chromium.

### Adicionar idioma

Registrar o código BCP 47 e nome nativo em `LANGUAGES`, adicionar o catálogo desse idioma em **cada domínio** e executar TypeScript/testes de paridade/interpolação. O seletor usa o registro automaticamente. Não mudar a política de default nem mapear silenciosamente preferências antigas. Traduções pedagógicas exigem um processo separado por conteúdo/versão.

## Cobertura nesta etapa

Traduzidos: homepage completa, navegação principal/compacta, ações de planos no menu, formulários de salvar/abrir/listar/excluir, retorno à homepage, seletor de idioma, menu beta e seus estados de progresso. Nomes personalizados permanecem literalmente iguais.

Pendentes: Inspector, Palette, maioria de Settings, detalhes de exportação e Packet Capture, chrome do terminal, mensagens de boot/recuperação/conflito, estados da barra de planos, confirmação de fechamento e formulários pendentes, painel de verificação de exercícios. Labs/enunciados e saída técnica dos comandos conservam o idioma original. Veja `docs/i18n-audit.md` para inventário por módulo/arquivo, riscos e glossário DE/EN/PT-BR.

## Acessibilidade, visual e performance

- Identidade de laboratório: graphite/charcoal, ciano moderado, traços de rede e bordas discretas. Sem dependências novas, fontes externas, PNG novo, blur ou 3D.
- Duas colunas no hero, seção compacta de planos e seis capacidades; mobile reorganiza sem ocultar os acessos principais.
- Tokens de tema existentes, inclusive Classic Light; nenhum default ou preferência de tema/background alterado.
- Links nativos para navegação, labels de selects, skip link, foco visível, feedback SVG por teclado e descrição `aria-live`.
- O sinal SVG só anima após interação, uma vez por 1,6 s. Sem intervalos contínuos. Interrompido ao ocultar a página; `prefers-reduced-motion` remove animação/transições. Desmontagem/navegação encerra toda a ilustração.
- Build: homepage não carrega engine, React Flow, xterm ou tsParticles; JS inicial aproximadamente 170 kB / 57 kB gzip, incluindo React, Zustand, catálogos e helpers compartilhados. O chunk próprio da homepage tem aproximadamente 9 kB / 3,2 kB gzip. Não é um benchmark de CPU.
- Contraste medido em Chromium: botão principal 10,15:1 Graphite e 5,62:1 Classic Light; texto principal 15,34:1 / 12,14:1; texto secundário do hero 11,30:1 / 6,48:1. Não substitui uma auditoria WCAG completa.

## Validação reproduzível

```powershell
node node_modules/vitest/vitest.mjs run src/home src/i18n src/projects src/workspace src/exercises/exerciseIdentity.test.ts src/exercises/exerciseController.test.ts src/uiTheme.test.ts src/App.test.ts src/deviceClipboard.test.ts src/devicePlacement.test.ts src/areaMarkings.test.ts src/markingGeometry.test.ts src/inspectorLayout.test.ts src/persistence/persistenceSafety.test.ts
node scripts/test-homepage.mjs
npm run build
git diff --check
node scripts/audit-ui-strings.mjs
```

O review usa Chromium real via CDP, o harness existente, perfil temporário e porta descartável. Download policy é isolada em cada processo. Os cenários da homepage usam o nome real do banco somente nessa origem descartável, removendo-o ao terminar; não acessam o perfil normal nem `localhost:5173`.

Testes incluem perfis novos, preferências e F5, metadados reais sintéticos, registros excluídos, escape de nomes, readonly sem mutação, banco incompatível, URLs, idioma com xterm/simulação ativos, retomada, novos planos, menus e conteúdo publicado, teclado, reduced motion e matriz 390/700/1024/1440 × DE/EN/PT-BR × Graphite/Classic. Casos existentes cobrem boot, recuperação, reinício do navegador, planos, viewport, clipboard, áreas e identidade dos exercícios.

Resultado desta rodada: **261 testes / 18 arquivos aprovados**, **116 casos no runner Chromium da homepage** (103 compartilhados + 13 específicos), sem exceções JS ou downloads. TypeScript, build e `git diff --check` aprovados. O build mantém o aviso preexistente de chunk do editor acima de 500 kB; nenhum pacote novo foi instalado.

Capturas são publicadas pelo gerador existente: 4 PNGs principais em `.playwright-mcp/reviews/`, 2 extras e galeria em `raw/`; a revisão anterior é arquivada sem apagar originais. Tudo permanece ignorado pelo Git. Não há novos commits nem push nesta tarefa.
