# Capítulo 3 — Zwei Netzwerke verbinden (primeira parte)

Reinício do capítulo: [checkpoints, restauração seletiva e Undo/Redo](chapter-restart.md).

Oito etapas, com a mesma janela flutuante e DE/EN/PT-BR:

1. **Was macht ein Router?** — introdução sem check de tarefa; Weiter disponível.
2. **Router verbinden** — cabos reais do Router aos dois switches, na VLAN dos hosts.
3. **Router konfigurieren** — IPv4 de host único em cada rede /24, na interface
   efetivamente ligada à LAN correspondente. Não se exige eth0/eth1 nem endereço .1.
   Forwarding deve permanecer ativo. O Router normal do NetLab já inicia assim.
4. **IPv4 konfigurieren** — conectar PC F ao Switch B e escolher endereço único
   utilizável e máscara /24 da LAN B. A sintaxe âmbar tem placeholders, sem endereço
   pronto. Inspector ou terminal; a configuração efetiva é validada.
5. **Standardgateway konfigurieren** — configurar o campo Gateway de PC A pelo
   Inspector e conferir a rota efetiva. PC E não precisa receber gateway.
6. **Standardroute konfigurieren** — configurar uma rota default no terminal Linux
   de PC F. O Next Hop precisa ser a interface local do Router na LAN B. Uma rota
   default equivalente já funcional conta, inclusive a derivada do campo Gateway;
   não se exige repetir um comando nem criar duplicatas.
7. **Verbindung testen** — Echo Replies reais de A para F e de F para A. Terminal
   pelo teclado e Quick Ping são aceitos; API, verificador, requests e resumos sem
   resposta não contam. A orientação pede encerrar pings contínuos com Ctrl+C.
8. **Diagnose** — tentativa real de B para F. Só o resultado explícito
   `ping: connect: Network is unreachable`, com ausência de rota conferida no início
   e no fim do comando, libera a fase de correção por falta de rota. Terminal e
   Quick Ping publicam esse resultado real. Timeout com uma rota existente não é
   tratado como falta de rota. Depois da correção, exige-se uma nova Echo Reply B→F.
   Gateway no Inspector ou rota estática válida são aceitos. Se B já estiver correto,
   uma resposta real conclui diretamente, sem apagar configurações para provocar falha.

## Dois modos, um contrato

**Weiter zu Kapitel 3** aparece ao concluir a etapa final do Capítulo 2. A continuação
usa o mesmo rascunho, os mesmos objetos, coordenadas, cabos e configurações. A máscara
funcional de D continua intacta, inclusive /27 ou /26. A preparação nunca corrige
silenciosamente a LAN A. Switch ausente, falta de portas, conflitos de IDs/nomes e
pré-requisitos incompatíveis produzem avisos.

**Übungen → Kapitel 3 direkt starten** cria um novo rascunho pelo Session Controller.
A LAN A padrão tem A/B/C/D conectados ao switch, com .10/.20/.30/.12 e /24, sem
gateway. Nenhum recibo dos capítulos 1 ou 2 é criado. A partir da preparação,
os dois modos usam o mesmo `RouterTutorialController`, painel e verificações.

O grupo novo contém Router, Switch B, PC E (192.168.20.10/24, sem gateway) e PC F
(sem IPv4 e sem cabo). Apenas E já está ligado ao Switch B. O Router está desconectado, sem
IPv4, com suas quatro interfaces normais. Os IDs são reservados em `ROUTER_IDS`;
o cabo inicial de E usa `ROUTER_LINKS.e`; `ROUTER_LINKS.f` permanece reservado para
compatibilidade com tentativas antigas.

`store.addRouterTutorialGroup()` usa `freePosition` e as dimensões atuais dos assets
para colocar o grupo à direita da rede existente, com o Router entre os switches.
O início direto organiza A/B acima do Switch e C/D abaixo, conforme as coordenadas
arredondadas do JSON e o diagrama de referência. Switch B fica na mesma linha do
Switch A, com E acima e F abaixo à direita. Na continuação, somente o novo grupo
é posicionado, respeitando a linha do switch e o limite direito da rede já existente.
As configurações e os cabos da referência pronta não são importados. Tentativas
já preparadas conservam suas coordenadas após F5; não há reposicionamento retroativo.
Não move os equipamentos anteriores. A inserção é uma única operação do histórico
normal: Undo/Redo afeta apenas o grupo e seu cabo inicial. O mecanismo RJ45 é intacto.
Na continuação, pan/zoom não é forçado para reenquadrar o grupo: o aluno pode usar
o controle normal de Fit View para ver as duas LANs.

## Persistência e isolamento do histórico

`guided:two-networks:v1:draft:<draftId>` guarda versão do contrato/capítulo, origem
do início, ID de C, preparação, etapa, histórico, hashes A/F/B e a observação histórica
da falha de rota de B. O envelope atual é `schemaVersion: 2`, `chapterVersion: 2`;
o namespace da chave é mantido para localizar e adaptar tentativas anteriores.
A topologia permanece no rascunho existente; não há novo schema ou banco.

A intenção é gravada antes da inserção. Depois da inserção, a topologia é confirmada
antes do recibo de preparação, usando a fila e CAS do repositório. Após interrupção,
somente o grupo reservado exato e ainda inicial pode ser adotado. Dados conflitantes
não são sobrescritos. Remover dispositivos depois de preparar não dispara recriação.

Enquanto esse rascunho é conduzido pelo Capítulo 3, os controllers anteriores ficam
inativos antes de revalidar/gravar suas evidências. Seus registros não são alterados
por novas interfaces, equipamentos ou pelo gateway de A. Esse pequeno contrato de
suspensão também se aplica durante a descoberta dos metadados após F5. Sem registro
de Capítulo 3, os capítulos anteriores continuam com o comportamento normal.

F5 restaura etapa e topologia sem novas inserções. Recibos são conferidos por hash
da configuração; com configuração diferente deixam de valer. Os hashes históricos
permanecem armazenados: Undo pode tornar válido um recibo da configuração exata anterior.
Não há restauração de comandos,
pacotes ou caches. Trocar de aba e voltar conserva os recibos válidos. **Zurück**
revisita as oito instruções sem desfazer a topologia. Falhas e conflitos de armazenamento
conservam o estado local e exibem aviso; não há rebase automático dos metadados.

## Compatibilidade e repetição

Tentativas de seis etapas são adaptadas no leitor de metadados. Dispositivos, IDs,
posições, configurações e cabos existentes permanecem intactos, inclusive o cabo
antigo de F. O histórico completo anterior fica em `legacy`; provas A↔E não são
reutilizadas para A↔F. A antiga etapa 6 abre a nova etapa 6, que valida a rota de F.
A adaptação permanece interna, sem aviso técnico no painel didático. Dados
desconhecidos são recusados sem sobrescrever a topologia.

**Wiederholen**, nas etapas 5/6, fica no centro do rodapé, entre Zurück e Weiter.
O primeiro clique muda o mesmo botão para **Bestätigen**, com cor de atenção;
o segundo executa a restauração existente, após revalidar as proteções. O escopo
permanece no tooltip. Não há botões extras ou expansão do painel. Escape, navegação,
troca de plano, saída da etapa e F5 descartam a confirmação pendente.
Uma confirmação guarda ID do rascunho, referência da rede e configuração exata;
trocas de plano, edições intermediárias ou formulários pendentes impedem o reset.
Na etapa 5, somente o Gateway de A é removido pela operação normal de IPv4.
Na etapa 6, somente a única rota default estática efetiva de F é removida; outras
rotas permanecem. Cada alteração usa uma operação de Undo/Redo e o autosave normal.
Rotas derivadas de Gateway, defaults duplicadas ou configuração ambígua são recusadas
com aviso, sem reset parcial. Não há reset global nem restauração de caches/processos.

## Suporte confirmado e limites

- O Inspector configura IPv4 de cada interface do Router pelo contrato normal.
- O Linux simulado aceita `ip address add` em interface ainda sem IPv4. Para alterar
  uma existente, usar Inspector ou remover e adicionar explicitamente. O comando não
  configura gateway. Não foram adicionados comandos ou protocolos.
- Gateway de A usa o campo do Inspector. A etapa 6 ensina a rota default existente
  no Linux. A ajuda IPv4 diferencia endereço/máscara, Gateway e rota default com
  exemplos genéricos na rede de documentação 192.0.2.0/24, sem solução pronta do tutorial.
- O capítulo não altera o Scheduler, o funcionamento de ICMP/ARP, velocidades ou
  Packet Capture. Também não acrescenta segundo Router, imagens, Windows ou DHCP.
- Exportar/importar JSON ou abrir um plano como outro rascunho não transfere progresso.

## Validação

```text
node node_modules/vitest/vitest.mjs run src/tutorials/RouterTutorialController.test.ts src/tutorials/SubnetTutorialController.test.ts src/tutorials/TutorialController.test.ts src/i18n/i18n.test.ts src/terminals.test.ts src/learningHelp.test.ts src/topologyEdits.test.ts src/topologyHistory.test.ts
node scripts/test-router-tutorial.mjs
node scripts/test-learning-help.mjs
npm run build
git diff --check
```

O runner Chromium percorre os capítulos anteriores antes da continuação, verifica
os metadados antigos, o modo direto sem conclusões artificiais, F5, terminal, Quick
Ping, idiomas e os temas em 700/1440 px. Usa perfil/IndexedDB descartáveis. Capturas
em `.playwright-mcp/reviews/raw/router-tutorial/`, fora do Git.

Em 04/11/2026: 427 testes direcionados em oito arquivos, TypeScript e build aprovados;
137 verificações Chromium do fluxo completo (continuação e início direto) e 106 da
ajuda em execução separada, sem erros de navegador. O modo direto também testa B
configurado antecipadamente via rota Linux e adaptação de um registro v1 preservando
a topologia. Os testes unitários cobrem defaults incorretas, duplicadas, derivadas
do campo Gateway, confirmação obsoleta e preparação v1 interrompida.

A limpeza posterior do painel foi validada com 61 testes direcionados (controller
e catálogos), TypeScript/build e 138 verificações Chromium. O teste de apresentação
confere DE/EN/PT-BR nos dois temas, confirmação no mesmo botão central sem expansão,
cancelamento por Escape/navegação/troca de plano/F5, Undo/Redo e migração sem aviso
visual, mantendo os metadados `legacy`. A lógica das duas fases da etapa 8 permanece intacta.
