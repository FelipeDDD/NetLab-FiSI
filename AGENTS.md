# Trabalhar no NetLab-FiSI

Ao retomar trabalho de outro computador, confira a branch, o HEAD e `git status --short --branch`. Leia o [contexto de continuidade](docs/CONTEXTO_CONTINUIDADE.md) para localizar o trabalho em aberto. Mudanças ainda locais podem existir em apenas uma das máquinas.

## Reutilização por tipo de tarefa

Antes de criar um componente, asset ou comportamento, encontre um exemplo em uso no mesmo fluxo. Confira o componente que ele monta e o teste que cobre sua interação.

Nas instruções guiadas, comandos executáveis de terminal usam o amarelo do tema, em linha ou em blocos. Trate endereços, interfaces e termos conceituais pelo papel que desempenham no texto.

| Tarefa | Por onde começar |
| --- | --- |
| Tutorial com instruções progressivas | O [capítulo LPM](src/tutorials/LpmPanel.tsx) exemplifica a moldura `ExercisePanelFrame`, o progresso `ChapterStepProgress`, comandos em `TutorialCommand`, dicas recolhíveis, confirmações de ações e navegação no rodapé. O [menu guiado](src/tutorials/TutorialUI.tsx) abre ou retoma a tentativa. Use os verificadores da atividade para confirmar ações reais. |
| Ilustração ou ajuda visual | Compare com os assets do [padrão de imagens didáticas](docs/padrao-imagens-didaticas.md). Para integrar, siga o [guia de ajuda visual](docs/guided-visual-help.md) e reutilize `GuidedVisualHelp` no painel. Ele já oferece botão, escala, posicionamento, Escape e retorno do foco. |
| Cenário para abrir em Labs, exercício prático ou questão de cálculo | Consulte o [guia de autoria de Labs](docs/LAB_AUTHORING.md), o [guia de exercícios práticos](docs/practical-exercises-beta.md) ou a [Rechenpraxis](docs/calculation-practice.md), conforme a experiência solicitada. O formato em que a tentativa guarda progresso, por si só, não determina o menu. |
| Planos, rascunhos e retomada | Consulte o [Session Controller](docs/session-controller.md) e as [garantias de persistência](docs/persistence-safety.md) antes de alterar a abertura ou recuperação de documentos. |

## Validação e entrega

- Reutilize os testes e roteiros do recurso. Para mudanças visuais, siga a [política de validação visual](docs/visual-validation.md). Os comandos de desenvolvimento e build estão em [CONTRIBUTING.md](CONTRIBUTING.md).
- Preserve alterações locais, arquivos novos, stashes e dados do navegador. Use perfis ou bancos descartáveis para testar persistência. Faça commit, push, integração de branches ou deploy somente quando a tarefa autorizar a operação.

## Manutenção da documentação

Faça a limpeza principalmente ao encerrar uma sessão para continuar em outro computador e ao concluir uma funcionalidade.

- Use o contexto de continuidade como passagem de turno. Registre o trabalho em aberto, o que ainda está local e o próximo passo. Substitua as informações superadas a cada atualização.
- Retire do contexto tarefas concluídas, problemas resolvidos, resultados antigos de testes e instruções temporárias que perderam a utilidade.
- Registre decisões arquiteturais e padrões aprovados nos guias específicos. No contexto, inclua apenas o link pertinente.
- Nos planejamentos, identifique o que era proposta histórica, o que foi implementado e o que continua pendente.
- Antes de descartar ou atualizar uma informação importante, confira o código e os documentos vigentes. Se restar dúvida, indique o ponto que precisa de confirmação.
- Prefira documentos curtos. Reutilize referências existentes para evitar conteúdo duplicado e arquivos desnecessários.
