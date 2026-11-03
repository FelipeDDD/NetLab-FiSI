# Capítulo 2 — Subnetzmaske verstehen

Após concluir as oito etapas de **Erste Verbindung**, o botão **Weiter zu Kapitel 2**
continua no mesmo rascunho. Não abre outro plano nem substitui a topologia.

## Fluxo

1. **Subnetzmaske ermitteln:** o aluno executa `ip addr` no terminal Linux de PC D
   e converte o prefixo encontrado. O campo começa com `255.255.`, sem exemplo ou
   placeholder com a solução. Apenas uma consulta real iniciada pelo teclado e
   uma resposta correta habilitam a próxima etapa.
2. **Verbindung funktioniert:** uma demonstração executa `ping -c 8 192.168.10.10`
   por `Session.executeCommand()`. São pacotes e respostas reais, exibidos no xterm.
   A primeira Echo Reply já confirma a demonstração; o aluno pode interromper com
   Ctrl+C e avançar. As oito solicitações prolongam a observação, sem mudar a
   cadência do motor ou a velocidade global das animações. Terminal ocupado,
   texto não enviado e seleção são respeitados; há repetição manual. Uma execução
   aceita pelo terminal também ativa Run, inclusive após uma pausa manual.
3. **Warum funktioniert der Ping nicht?:** exige um ping do aluno para PC B.
   Só a saída exata `ping: connect: Network is unreachable`, com rota ausente e
   configuração inicial operacional, comprova a falha. A explicação aparece depois.
4. **Netzwerk korrigieren:** o aluno altera a máscara pelo Inspector ou terminal,
   sem receber o comando nem o valor esperado. O IPv4 continua `192.168.10.12`, sem
   gateway. São aceitos prefixos que produzam rotas conectadas em eth0 para A/B/C;
   por exemplo, os testes confirmam `/27`, `/26` e `/24`. Uma rota estática não
   substitui a correção da máscara.
5. **Verbindung erneut testen:** exige novos Echo Replies de PC B e PC C em pings
   iniciados pelo teclado de PC D ou pelo Quick Ping dos atalhos de hover.
   A conclusão depende das duas evidências, não do clique ou envio da solicitação.

**Zurück** altera apenas a etapa, sem desfazer a rede. Na primeira etapa, retorna
à apresentação do Capítulo 1. A transição volta a abrir o Capítulo 2 existente.
Os textos usam os catálogos DE/EN/PT-BR e a mesma janela compacta do tutorial.

## Preparação e histórico

PC D usa o ID reservado `tutorial-02-d` e o cabo `tutorial-02-d-link`.
É um Host Linux com `192.168.10.12/28`, sem gateway. A criação escolhe uma porta
Ethernet livre, ativa e na VLAN dos PCs existentes. O posicionamento reutiliza
`freePosition`, preservando os demais equipamentos e suas coordenadas.

`store.addSubnetTutorialPC()` registra equipamento e cabo numa única operação do
histórico existente. Undo remove somente essa inserção; Redo a restaura.
Não altera a preferência Linux/Windows do catálogo. Conflitos de ID/nome, Switch
ausente, portas indisponíveis ou pré-requisitos inválidos produzem avisos.
Um PC D removido depois da preparação não é recriado automaticamente.

## Persistência e evidências

- O registro original `guided:v1:draft:<draftId>` continua no formato v1, com oito
  etapas. Sua assinatura desconsidera apenas PC D e os cabos ligados a esse ID,
  permitindo que o Capítulo 2 preserve as evidências históricas do Capítulo 1.
- O novo registro independente `guided:subnet-mask:v1:draft:<draftId>` armazena
  etapa, resposta parcial, preparação, demonstração e evidências do Capítulo 2.
  Usa o mesmo repositório de metadados e CAS, sem mudar schemas de projeto/IndexedDB.
- A intenção é persistida antes da inserção. Se houver interrupção antes do recibo
  de preparação, só o equipamento e cabo reservados com configuração esperada
  podem ser reconhecidos; IDs conflitantes nunca são substituídos.
- A demonstração automática é marcada duravelmente antes da chamada ao terminal.
  Após F5 não há execução automática, nem restauração de comandos ativos. Se a
  demonstração tiver sido interrompida ou bloqueada, usa-se o botão de repetição.
- Comandos automáticos conservam `source: api`. Consulta e falha esperada exigem
  `source: keyboard`; somente a etapa final aceita também `source: quick-ping`.
  Dispositivo, rede, comando e origem da resposta precisam corresponder à etapa.
  Mudanças de configuração ou de plano invalidam observações em andamento.
- Os recibos finais são vinculados à configuração por SHA-256. Uma edição de rede
  exige novas respostas; F5 e troca de plano preservam recibos da mesma configuração.
- Topologia é gravada antes dos recibos. Falhas de persistência mantêm os dados
  locais, exibem aviso e bloqueiam a demonstração automática sem confirmação.

O Scheduler e a política global de pausa permanecem independentes do tutorial.
A demonstração retoma Run apenas se o terminal aceitar o comando; uma tentativa
bloqueada não retoma nem interrompe o comando do aluno. Não há repetição simultânea
enquanto a demonstração está ativa. O evento `finished` sozinho e o
percentual de perda não são usados como prova de sucesso ou de ausência de rota.

O progresso pertence ao rascunho local, como no Capítulo 1. Exportar/importar só a
topologia ou abri-la como outro rascunho não transfere automaticamente os recibos.

## Verificação

```text
npm test -- src/tutorials/SubnetTutorialController.test.ts src/tutorials/TutorialController.test.ts src/terminals.test.ts src/i18n/i18n.test.ts
node scripts/test-subnet-tutorial.mjs
```

O roteiro Chromium reutiliza o perfil e IndexedDB descartáveis existentes. Executa
as oito etapas reais do Capítulo 1 antes do novo capítulo, incluindo recuperação,
falhas, Undo/Redo, pings, idiomas, Graphite Dark e Classic Light em 700/1440 px.
Capturas e logs ficam em `.playwright-mcp/`, ignorados pelo Git.
