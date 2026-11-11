# Kapitel 4 · Statisches Routing

O capítulo tem início direto e tentativa própria em **Übungen (Beta) → Geführte
Tutorials**. Continuar abre o mesmo rascunho; Direkt starten cria outro sem substituir
o anterior. Os capítulos 1–3 e os exercícios Beta mantêm seus fluxos.

## Conclusão histórica no menu — 11/11/2026

O menu mantém separadas a tentativa atual para retomar e a conclusão histórica.
Antes, a leitura parava no primeiro draft do capítulo, de modo que uma tentativa
incompleta podia esconder outra concluída. Não havia histórico independente para
este capítulo; a mudança v5 do capítulo 5 não apagou os seus comprovantes.

`staticRoutingLearning.ts` registra uma conclusão integral verificável em
`guided:chapter-completion:v1:static-routing`, usando o store `meta` existente.
Exige as onze tarefas e os seis recibos finais válidos. CAS e guard da revisão
da origem impedem registrar um progresso alterado durante a verificação. A data
é a do registro, sem inventar a data de conclusão de tentativas antigas.

Gravação final, leitura de tentativa antiga válida e reinício preservam essa
conclusão. O menu examina todos os drafts disponíveis para recuperar o histórico;
uma tentativa incompleta atual continua sendo o destino de Retomar, mas não
remove o check verde. Seu contador aparece separadamente. F5, nova tentativa,
reinício ou fechamento posterior do draft não apagam o histórico registrado.
Falhas desses metadados são isoladas ao capítulo 4 e admitem retry.

Não há alteração de validadores, pings, schema do progresso ou dados de topologia.
Conclusões antigas só podem ser recuperadas quando há histórico ou progresso
persistido verificável; sem esses registros, não se concede crédito por inferência.

## Blueprints e oito tarefas

O blueprint inicial prepara sete equipamentos e seis enlaces Ethernet:

```text
PC A — Switch A — R1 — R2 — R3 — Switch B — PC B
```

| Rede | Endereços preparados |
| --- | --- |
| LAN A · 192.168.10.0/24 | PC A .10, gateway/R1 eth0 .1 |
| Trânsito R1–R2 · 10.0.12.0/30 | R1 eth1 .1, R2 eth0 .2 |
| Trânsito R2–R3 · 10.0.23.0/30 | R2 eth1 .1, R3 eth0 .2 |
| LAN B · 192.168.20.0/24 | PC B .20, gateway/R3 eth1 .1 |

Os routers começam com encaminhamento ativo, RIP desativado e sem as rotas
estáticas entre LANs. A UI apresenta instruções DE/EN/PT-BR, Adressplan recolhível
e dicas progressivas. A configuração fica a cargo do aluno; somente a verificação
final executa pings automaticamente.

1. Ping real A → B: falha de rede identificada em R1, ou Echo Reply se a rede já
   tiver sido corretamente configurada antecipadamente. Timeout genérico não basta.
2. Identificar o primeiro router sem rota para B, a partir da configuração atual.
   Se o hinweg já está correto, aceita **Keine Route fehlt**. Pode-se consultar
   `ip route` ou a tabela existente no Inspector; não se exige uma string de comando.
3. Validar o encaminhamento estático de R1/R2 para toda a LAN B.
4. Validar o encaminhamento estático de R3/R2 para toda a LAN A.
5. Obter Echo Replies reais A → B e B → A.
6. Após clicar **Szenario 2 starten**, adicionar Switch C e PC C a R2 eth2. O aluno
   configura LAN C em 192.168.30.0/24 e seu gateway.
7. Configurar o acesso estático de R1/R3 a toda a LAN C, preservando o retorno.
8. Obter seis Echo Replies: A → B, B → A, A → C, C → A, B → C e C → B.

O segundo blueprint contém somente a extensão prevista: switch, PC e dois cabos.
Não substitui R1/R2/R3 nem seus endereços, rotas ou posições. O posicionamento da
extensão usa o mecanismo existente para procurar espaço livre acima de R2,
com PC C acima do Switch C. Isso afeta somente novas inserções: posições já
persistidas e os equipamentos das LANs A/B não são reposicionados.
Voltar de etapa não desfaz a expansão nem cria equipamentos outra vez.

## Critérios reais e evidências

`staticRoutingConditions()` consulta a rota efetivamente escolhida por
`lookupRoute()`. Inspeciona os limites de todas as rotas que intersectam a /24:
rotas agregadas, default ou combinações de rotas menores são aceitas se cobrirem
o intervalo de hosts inteiro com o next hop adjacente correto. Uma rota /32 para
o PC isolado não basta. Rotas mais específicas incorretas também são detectadas.
As identidades e o endereçamento do backbone preparado são preservados; LAN C
aceita diferentes pares de endereços de host únicos e gateway/default efetivo via R2.

O controller observa a saída real dos comandos do terminal e do Quick Ping,
correlacionando origem, destino, comando, etapa e configuração. Comandos `api` externos,
cliques, pacotes enviados e respostas de outros dispositivos não contam como
sucesso. Pings concorrentes mantêm candidatos separados por ID de comando.
Os seis indicadores finais precisam de respostas na mesma configuração.

As evidências persistidas contêm hashes da configuração permanente, excluindo
posições, caches e processos. F5 não restaura comandos ativos nem repete a
verificação de uma tentativa já concluída.
Alterar a configuração invalida as respostas atuais; mover equipamentos não.
O contador representa tarefas efetivamente validadas. **Netzwerk frei erkunden**
fecha somente o painel. Reabrir pelo menu mantém a rede e o progresso.

## Persistência, recuperação e reinício

- Progresso versionado: `guided:static-routing:v1:draft:<draftId>` no store `meta`
  existente. Sem mudança de schema do IndexedDB ou dos projetos.
- `StaticRoutingProgressStore` usa CAS e confirma a topologia antes da evidência,
  como os outros capítulos. Falha de gravação fica visível e bloqueia avanço.
- A expansão grava a intenção antes de inserir equipamentos. Uma inserção
  interrompida pode ser reconhecida uma vez se o grupo novo ainda corresponder
  exatamente à inserção inicial. Configuração ambígua gera aviso e é preservada.
- Após a confirmação da expansão, F5 não recria dispositivos apagados. A remoção
  pode ser desfeita pelo histórico existente; a preparação é uma única operação.
- Checkpoint inicial usa `ChapterRestartService`, confirmação existente, transação
  documento/progresso e Undo/Redo. Reiniciar retorna ao cenário 1 da mesma tentativa.
  Nova tentativa é uma ação separada e preserva a tentativa anterior.
- O reset conhece explicitamente os dispositivos pertencentes ao capítulo e as
  identidades MAC da extensão. Preserva equipamentos independentes e recusa
  conexões externas ou IDs reutilizados que tornem a restauração ambígua.

## Arquivos e validação

`staticRoutingChapter.ts` contém o blueprint, invariantes e critérios de rotas;
`StaticRoutingTutorialController.ts` controla tarefas/evidências/transição;
`staticRoutingProgress.ts` armazena progresso; `StaticRoutingTutorialPanel.tsx`
reutiliza o frame, checkpoints e encerramento existentes. O catálogo
`src/i18n/catalogs/guidedStatic.ts` contém os três idiomas.

```text
npm test -- --run src/tutorials/staticRoutingChapter.test.ts src/tutorials/StaticRoutingTutorialController.test.ts
node scripts/test-static-routing-tutorial.mjs
node scripts/test-router-tutorial.mjs
npm test
npm run build
git diff --check
```

O roteiro Chromium usa perfil e IndexedDB descartáveis, comandos nativos no xterm,
interfaces reais, F5, alternância de planos, retomada, reinício e Undo/Redo. As
capturas principais ficam em `.playwright-mcp/reviews/`; o gerador Visual Review
arquiva as anteriores. Os artefatos não entram no Git.

O capítulo é um laboratório de rotas estáticas com backbone definido. Não é um
verificador genérico de topologias arbitrárias, não configura RIP e não introduz
uma biblioteca pública de blueprints. Não foram necessárias mudanças no motor.

## Verificação automática da última etapa

Na etapa 11, a abertura do painel inicia A→B, B→A, A→C, C→A, B→C e C→B,
um `ping -c 1` por direção. Usa o mesmo `Shell/runPing` dos terminais, sem ocupar
sua entrada, mudar o scheduler ou fabricar eventos de sucesso. A identidade
privada de cada comando permite somente a execução pertencente à sequência;
probes API externos continuam rejeitados. A saída real passa pelo validador e
pela persistência de comprovantes já existentes.

A próxima direção aguarda a conclusão do comando e da sua animação observada.
O player existente usa 2× temporariamente; o valor anterior volta ao terminar,
cancelar ou detectar mudança de configuração/rede. Os indicadores mostram
pendente, em execução, confirmado ou falhou. Falhas permitem repetir a sequência.
Uma pausa manual é respeitada: o painel indica continuar pelo Run existente.

Voltar, recolher/fechar o painel, trocar de plano ou reiniciar cancela somente o
comando pertencente à verificação, removendo seus timers pelo cancelamento nativo.
Uma verificação interrompida pode ser repetida pelo botão da etapa. Ao recarregar
uma etapa final ainda incompleta, uma nova sequência pode começar; comprovantes
anteriores permanecem sujeitos ao hash da configuração. Tentativas concluídas
não iniciam outra sequência automaticamente, inclusive após F5 e Undo/Redo.

Os testes do controller cobrem Request/Reply reais correlacionados por origem,
destino, ID e sequência, concorrência máxima de um ping automático, falha/retentativa,
cancelamento e restauração da velocidade. O roteiro Chromium verifica o fluxo,
Fit View, idiomas, F5 e reset. Capturas desta rodada:
`.playwright-mcp/reviews/chapter4-final-refinements/referencias-chatgpt/`.
