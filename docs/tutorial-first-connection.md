# Tutorial guiado 01 — Erste Verbindung (protótipo)

Reinício do capítulo: [checkpoints e limites de segurança](chapter-restart.md).

Continuidade implementada: [Capítulo 2 — Subnetzmaske verstehen](tutorial-subnet-mask.md),
no mesmo rascunho, com progresso independente e preservação das oito etapas abaixo.

Entrada: **Übungen (Beta) → Geführte Tutorials → Erste Verbindung**. A entrada é
separada dos seis exercícios publicados e não escreve em `exercises:beta:v1`.
Uma nova execução abre um rascunho normal pelo Session Controller; planos existentes
permanecem abertos. Se esse rascunho já estiver aberto, a entrada o retoma.

## Fluxo do aluno

1. **Kabel verbinden:** PC A começa sem IPv4 e sem cabo; PC B já está ligado ao
   switch com `192.168.10.20/24`. Só o cabo real entre os IDs de PC A e do switch
   habilita **Weiter**. Um cabo em outro lugar não basta.
2. **IPv4 konfigurieren:** reconhecer `192.168.10.10/24` aplicado em `eth0` de PC A,
   pelo Inspector ou pelos comandos Linux existentes. Formulários pendentes não
   confirmam a etapa. O link contextual abre a ajuda IPv4 sem trocar de plano.
3. **Verbindung testen:** o aluno digita `ping 192.168.10.20` no terminal de PC A.
   Uma Echo Reply real avança automaticamente para a quarta etapa. Variantes com
   contagem `-c`/`-n` também fornecem evidência se suportadas pelo terminal.
4. **Ping beenden:** o aluno interrompe o ping ativo de PC A com **Strg+C**.
   O evento de término do mesmo comando deve indicar interrupção pelo teclado;
   término automático, outro terminal e texto literal `Ctrl+C` não concluem.
   Se o ping já terminou, executar novamente e interromper após uma resposta.
   Só então aparecem a confirmação final e a explicação sobre comunicação local
   sem gateway.
5. **PC C hinzufügen:** ao entrar nesta etapa, registrar os IDs existentes.
   Identificar o primeiro novo Host Linux criado depois disso; PC A, PC B,
   notebooks, servidores e hosts Windows não concluem a ação. Mostrar o nome
   real do dispositivo identificado e renomeá-lo para `PC C` se esse nome estiver
   livre. A ação normal de renomeação ocorre após a criação, preservando ID,
   configuração, cabos e ordem do histórico; não impor posição.
6. **Kabel verbinden:** validar um cabo físico entre esse PC C e o switch original.
7. **IPv4 im Terminal konfigurieren:** exigir submissão pelo teclado no terminal
   Linux de PC C, `ip address add 192.168.10.30/24 dev eth0`, com `eth0` sem
   endereço antes e com o endereço correto ao terminar. Inspector e API não
   fornecem essa evidência; um comando rejeitado por endereço já existente também não.
8. **Verbindung testen:** reconhecer uma Echo Reply do comando de ping digitado
   em PC C para PC B. Mostrar explicação da rede local compartilhada e orientar
   **Strg + C**, sem acrescentar uma etapa obrigatória de interrupção.
   Antes do ping, uma introdução explica ARP e ressalva que uma entrada válida
   no cache dispensa nova consulta. Ao terminar o mesmo ping bem-sucedido
   (por Ctrl+C ou contagem), mostrar **Tutorial abgeschlossen!**. A aprovação
   da etapa continua dependendo somente da Echo Reply real.

As etapas usam um círculo cinza pendente e check verde com texto de confirmação.
Comandos e atalhos têm destaque âmbar monoespaçado nos dois temas. A expansão
não recria a rede nem o rascunho. A evidência da primeira comunicação acompanha
apenas a configuração dos dispositivos e cabos originais, para que adicionar PC C
não apague a conclusão anterior. Alterações em A/B ainda invalidam essa evidência.
Na etapa 4, ocultar a instrução pendente após Ctrl+C. Na etapa 7, a orientação
longa de remoção de IP só aparece quando `eth0` já contém um endereço.

O painel reutiliza `ExercisePanelFrame`: arraste, reset, recolhimento e rolagem.
Mostra uma etapa por vez, usa **Weiter** nas duas primeiras e permite **Zurück**
sem alterar a rede. Não há nota, perguntas teóricas ou sondas automáticas.
Os textos e controles usam DE/EN/PT-BR; os comandos mantêm sua sintaxe.

## Contratos pequenos

- `firstConnection.ts`: fábrica explícita da topologia inicial, IDs estáveis,
  contrato `GuidedChapter` (ID, versão própria e etapas) e leitura das condições.
  Não reutiliza IDs/versões/progresso dos exercícios Beta.
- `TutorialController`: coordena o passo, o histórico e o rascunho existente.
  Lê a única simulação ativa e não altera parâmetros para satisfazer uma condição.
  Campos incompletos, rede substituída, rascunho fechado e conflitos de abertura
  preservam o fluxo normal do Session Controller.
- `terminalCommandEvents.ts`: canal local de observação do caminho real de submissão
  xterm. Distingue teclado/colagem, Quick Ping e API; observadores não podem
  interromper a execução. Não modifica parser, comandos, protocolos ou Scheduler.
- A conclusão usa a saída que `runPing` emite **depois de receber uma Echo Reply**,
  associada ao comando digitado em PC A, destino esperado, rede, rascunho ativo e
  assinatura da configuração. Não usa animações, replay, presença de pacotes ou
  uma requisição enviada como prova de sucesso. Sondas do verificador não passam
  por essa submissão; Quick Ping e API são ignorados.

A leitura da linha de resposta é um limite deliberado deste MVP: caso o formato
de saída de ping mude, os testes devem acompanhar essa mudança. A saída não é
uma fronteira antifraude. Alterações aplicadas depois do sucesso invalidam a prova
da configuração anterior; é preciso repetir o ping.

## Recuperação e futuros capítulos

A topologia usa o autosave de rascunhos e Save/Load normais. O progresso fica no
store `meta` existente, em `guided:v1:draft:<draftId>`, separado de exercícios Beta
e de planos manuais. Não há schema IndexedDB novo nem outra cópia da topologia.
`tutorialProgress.ts` contém o contrato, sua validação e a fila de gravação.

O registro guarda versão do contrato/tutorial, ID do rascunho, data da tentativa,
etapa 1–8, etapas historicamente concluídas, IDs de A/B/Switch/C, IDs existentes
antes da etapa 5 e evidências mínimas dos comandos. Evidências de ping guardam
somente um hash SHA-256 da configuração relevante e flags de término/interrupção;
nunca guardam saída xterm, processos, caches ARP, pacotes ou Scheduler.

Antes de gravar o progresso, a fila chama `SessionController.flush(draftId)`.
São dois commits conservadores: primeiro a topologia, depois os metadados com
CAS. Se o segundo falhar ou o navegador fechar entre ambos, a rede permanece
recuperável e a orientação pode voltar a um passo anterior. Assinaturas e condições
de estado são revalidadas mesmo se a topologia mudar entre os commits. Conflitos
não são rebaseados nem sobrescritos automaticamente; a UI indica falha e conserva
o estado local. A API só confirma metadados após o commit do repositório.

Na restauração, apenas rascunhos abertos na sessão são consultados. A tentativa da
aba ativa reabre seu painel; as demais são recuperadas quando focadas. Cabos,
IPv4, tipo/OS e identidade de C são conferidos novamente. O histórico não é usado
para inventar uma submissão de terminal ou uma Echo Reply. Eventos comprovados
continuam válidos somente para a configuração registrada. Um ping em execução
não é restaurado: na etapa 4, ou no encerramento pendente da etapa 8, a orientação
pede repetir o comando, aguardar resposta e interromper com Ctrl+C. Uma conclusão
já comprovada permanece concluída se a configuração ainda corresponder.

**Fortsetzen** foca a tentativa existente sem criar rede/rascunho. **Neu starten**
é uma ação explícita que cria outra tentativa e conserva as abas anteriores.
Cada tentativa guarda progresso separado e pode ser retomada pela sua aba.
Fechar um rascunho não o recria por meio de metadados atrasados.

Sessões antigas sem esse registro permanecem planos normais. Dados incompletos
ou versões desconhecidas geram aviso e não são reescritos nem causam perda da
topologia. Abrir um plano salvo como novo rascunho ou importar JSON não associa
automaticamente progresso: o contrato é local e vinculado à tentativa original.
Mudanças ainda não confirmadas no disco podem ser perdidas em encerramento
abrupto; formulários não aplicados continuam fora do autosave.

Capítulos futuros devem manter o mesmo `draftId` e os IDs existentes, adicionando
dispositivos/configurações pelos mecanismos normais de edição. A fábrica inicial
é exclusiva de um laboratório novo; não deve ser chamada a cada capítulo.
O ID/versão do tutorial e a vinculação dos dispositivos permitem estender a mesma
tentativa em capítulos futuros, que ainda exigem seus próprios contratos/testes.
Não há capítulos de Router, ARP guiado, DHCP, DNS ou Firewall nesta entrega.

## Validação

```powershell
node node_modules/vitest/vitest.mjs run src/tutorials/TutorialController.test.ts src/terminals.test.ts src/exercises/exerciseController.test.ts src/exercises/practicalChecker.test.ts src/i18n/i18n.test.ts
node scripts/test-guided-tutorial.mjs
npm run build
git diff --check
```

O Chromium usa perfil, origem de teste e banco `netlab-idb-test-*` descartáveis.
O roteiro cobre cabo pela interface, IP incorreto/correto no Inspector, comandos
Linux, ajuda, painel flutuante, ping incorreto, exclusão de sondas/Quick Ping,
sucesso via teclado, retorno ao plano pessoal, temas e recuperação honesta após
recarregar. A expansão cobre PC C com tipo/OS incorretos, cabo errado, IPv4
apenas pelo Inspector, comando no terminal errado, ping sem resposta e Quick Ping,
retorno pelas oito instruções e indicadores pendentes/concluídos.
Capturas do fluxo em `.playwright-mcp/reviews/raw/guided-tutorial/`.
