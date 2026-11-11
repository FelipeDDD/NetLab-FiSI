# NetLab-FiSI — Contexto para continuidade

Atualizado em **11/11/2026**, para continuar entre notebook e desktop.
Este é o **arquivo único de continuidade**: atualizar este resumo nas próximas
rodadas, sem criar cópias TXT ou documentos de contexto concorrentes.
O código, os testes e o Git continuam sendo a fonte de verdade. As seções
históricas abaixo registram decisões antigas e podem ter sido superadas.

## Leia primeiro — auditoria e estado atual em 11/11/2026

**Refinamento pontual de redação — 11/11/2026:** Parte 1, tarefas 1–3,
pede explicitamente ping nos dois sentidos (DE/EN/PT-BR), usando o destaque
âmbar existente. Parte 2, 7/9, cita apenas LAN A; 9/9 mantém IPs e valores
internos das alternativas, retirando os nomes R2/R3. As 16 tarefas, validadores,
checkpoints, progresso, tempestade, engine e imagens permanecem iguais.
Validação: 108 testes em 7 arquivos, 167 verificações Chromium, TypeScript,
build e diff-check aprovados. Commit pontual autorizado somente para redação
e esta nota; alterações locais anteriores de v5/menu/ajudas não são incluídas.
Sem push, merge ou deploy. Logs locais em .playwright-mcp/chapter5-wording-*.

**Consolidação em `main` — 10/11/2026:** este conjunto reúne revisão histórica
do capítulo 5, PC C Linux/Windows, checkpoints e menu das Rodadas 1–3, progresso
independente e refinamentos dos documentos/relatórios. As indicações “somente
local” nas seções abaixo registram o estado anterior a esta consolidação.
Capturas, logs, bancos descartáveis, backups e dependências instaladas ficam fora
do commit. Stash existente preservado; nenhuma mudança de dependências ou deploy.
Consulte o Git para o hash e a situação da publicação autorizada pelo usuário.
Na revisão final, `documentAppearance.test.ts` foi alinhado ao padrão de coleta
do Vitest; seus seis casos agora são executados. A checagem de consolidação
aprovou **304 testes em 28 arquivos** de exportação, metadados e idiomas, além
das validações completas das rodadas anteriores registradas abaixo.

**Capítulo 5 — Rodada 3, somente local:** checkpoints disponibilizados no menu
Übungen (Beta), pelo botão de nova tentativa. Quatro opções: início, Partes 2/3/4.
`AlternativeEntryMenu` reutiliza `FloatingPopover`, com lateral direita/fallback
à esquerda, teclado/Escape/clique fora e Voltar compacto até 760 px. Pai reconhece
o popup filho por referência. Fortsetzen/Netzwerk öffnen preservados.

Indicadores do capítulo 5: check verde para conclusão integral histórica, azul
para tentativa sem conclusão integral histórica, neutro sem tentativa disponível
nem histórico. Texto acessível acompanha as cores; verde prevalece sobre uma nova
prática parcial, cujo contador fica separado. Práticas das Partes 2/3/4 encerram
positivamente em **16/16, 9/9 e 3/3**; resultados integrais seguem **16/22, 9/22 e
3/22**, sem crédito para tarefas fornecidas. Revisão histórica tem pequeno check
verde no box existente, preservando enunciados/ajudas/evidências.

`alternativeLearning.ts` mantém dois registros v1 em `meta`: conclusão independente
e referência à tentativa atual. História só deriva de um único progresso integral
persistido/validado, com origem/versão e data de registro; sem somar tentativas ou
inventar datas/recibos antigos. `setMeta(...,{guards})` confere revisão da origem
na mesma transação do CAS histórico. Falhas são recuperáveis; reinício preserva
a conclusão antes de limpar a tentativa. Metadados não chamam `commitDocument()`.
Falhas específicas do histórico não bloqueiam capítulos 1–4.

As quatro aberturas públicas gravam rascunho/sessão/progresso/checkpoint/marcador
atual juntos. Início normal usa o mesmo triângulo, agora com identidades/controles
preparados antes da transação; não muda o cenário. Menu prefere o capítulo no plano
ativo, depois a última seleção persistida, sem apagar tentativas anteriores.
Histórico é local ao navegador e não acompanha JSON; capítulos 1–4 conservam os
indicadores anteriores, sem novos checkpoints/histórico independente nesta rodada.

**304 testes distintos em 23 arquivos**, **320 verificações Chromium**, TypeScript,
build e diff-check aprovados. Sem erros de navegador; aviso conhecido de chunk
grande permanece. Capturas: `.playwright-mcp/reviews/chapter5-entries-round3/`.
Contratos: `docs/chapter-entry-points.md`. Alterações locais das rodadas anteriores
e stash preservados; sem mudanças no editor de relatórios ou na engine nesta
rodada, sem acesso aos dados reais, commit, push, merge ou deploy.

**Cores dos documentos e controles de tabelas, somente local:** após concluir os
checkpoints do capítulo 5, prévia A4/HTML multipágina receberam `color-scheme:
only light` no documento isolado, esquema explícito de folhas/tabelas e proteção
na raiz do SVG independente. Relatório HTML anterior também protegido. Nenhum
tema global, dado técnico, tutorial ou mecanismo de rede foi alterado. Removidos
os três parágrafos extensos das tabelas em DE/EN/PT-BR; seção expansível preserva
restaurar, lista e controles, aberta inicialmente.

Auto Dark reproduzido em Chromium descartável: sete páginas técnicas. Com
preferência de sistema escura, cores permanecem idênticas ligado/desligado;
com preferência clara, Chromium ignora o opt-out e ainda transforma o relatório.
Limite documentado, sem filtros de compensação; Vivaldi não instalado/testado.
Geometria e conteúdo HTML preservados; PNG exportado idêntico byte a byte.
**269 testes em 24 arquivos**, TypeScript/build/diff-check aprovados, com o aviso
conhecido de chunk grande. Capturas, exportações e PDF locais em
`.playwright-mcp/reviews/document-colors/{before,after}/`; reprodução:
`node scripts/test-document-colors.mjs`. Ver `docs/document-colors.md`.
Alterações locais anteriores preservadas; sem commit, push, merge ou deploy.

**Pontos de entrada do capítulo 5 — Rodada 2, somente local:** acrescentado
`part-4`, tarefa 20, com LANs A/B via R2, PC C fornecido por ID/MAC, LAN C /25
e rotas /24 via R2 e /25 via R3. Enlace R2–R3 inicialmente UP. O baseline técnico
`scenarioBaseline` é separado de `viaBaseline` e dos recibos do aluno: tarefas
1–19 fornecidas, `completed: []`, respostas/recibos nulos, sem `legacy`.
Criação continua atômica com rascunho/sessão/progresso/checkpoint, sem novos stores.

Na tarefa 20, `storm: pending` utiliza a transação existente que grava porta DOWN
e marcador consumido juntos. F5/Undo/navegação não reaplicam o incidente. Reinício
restaura o cenário próprio da Parte 4 antes da falha; consumo do novo incidente
é conciliado com o ticket Undo/Redo. Equipamentos independentes são preservados;
identidades conflitantes bloqueiam a restauração. Recuperação continua exigindo
cobertura integral das LANs e pings reais bidirecionais pelo enlace R1–R3, aceitando
`replace` ou `del` + `add`. Ao final, mensagem DE/EN/PT-BR identifica **conclusão da
prática da Parte 4**, permite explorar a rede e mantém somente **3/22**, sem crédito
retroativo ou conclusão histórica integral.

Validação desta rodada: **277 testes distintos em 21 arquivos**, TypeScript,
build e diff-check aprovados; **180 verificações Chromium**, sem erros, em perfil
e bancos descartáveis. Incluem os três checkpoints avançados, falhas antes/depois
do commit, F5, identidade de PC C, troca de planos, reinício, Undo/Redo, três idiomas
e ambos os temas. Build conserva o aviso conhecido de chunk acima de 500 kB.
Documentação: `docs/chapter-entry-points.md`. As três entradas permanecem somente
na API/harness; faltam submenu, indicadores e conclusão histórica independente
(Rodada 3). Preservadas alterações locais anteriores; sem commit/push/merge/deploy
e sem acesso aos dados reais do usuário.

**Pontos de entrada do capítulo 5 — Rodada 1, somente local:** entradas internas
`part-2` (tarefa 7: transit e LANs A/B prontos, sem rotas entre LANs) e `part-3`
(tarefa 14: A/B funcionando via R2, nenhum PC C). Catálogo tipado/versionado em
`alternativeEntryContract.ts`; builders e inicialização em `alternativeEntries.ts`.
O descritor `entry` identifica configurações/tarefas fornecidas, sem preencher
`completed`, respostas ou recibos anteriores e sem usar `legacy`. Essas tentativas
usam progresso `schemaVersion: 2`; início normal/antigos continuam v1, conteúdo
do capítulo v4/22 tarefas. Isso também faz builds antigos recusarem o novo contrato.

Rascunho, sessão, progresso e checkpoint de reinício são criados na mesma transação
CAS antes da ativação, usando opções `initialization` de `openDocument()` e controles
de `createDraft()`. Sem novos stores ou migração de dados reais. A Parte 3 pode
preparar LAN C a partir da configuração fornecida, sem inventar A/B pings ou Next
Hop respondido. Zurück respeita a primeira tarefa da entrada; nota DE/EN/PT-BR
identifica tarefas fornecidas. PC C Linux/Windows continua exigindo identidade,
conexão, configuração e pings reais. A preparação de R3 eth3 no reinício da entrada
da Parte 3 integra documento/progresso na mesma restauração, preservando Undo/Redo.

Disponível somente por API/harness descartável; nenhum submenu/URL pública ou
novo fluxo de boot. Pendentes: menu, apresentação da conclusão de prática parcial,
conclusão histórica independente e entrada da Parte 4. Terminar as tarefas restantes
não concede 22/22. Ver `docs/chapter-entry-points.md`. Chromium direcionado: **167
verificações aprovadas**, sem erros, incluindo falhas nativas, quota/abort/conflito,
F5 imediato, ambos os cenários até o final, reinício e Undo/Redo. TypeScript/build
aprovados; **269 testes em 22 arquivos** e diff-check aprovados. Preservadas
alterações locais anteriores; sem commit, push, merge ou deploy.

**Revisão didática e PC C Linux/Windows, somente local:** capítulo 5 mantém os
enunciados, sintaxes e Ajuda original recolhida ao revisitar tarefas, inclusive
LPM após a tempestade. Um único box neutro distingue revisão de execução normal;
o primeiro sucesso não é rotulado como revisão. `alternativeReviewEvidence`
seleciona explicações e percursos sustentados por recibos; a volta vem do caminho
registrado, sem presumir simetria. Créditos legados permitem navegar e consultar
a ajuda, mas não inventam pacotes, causas ou comandos exatos. Indicadores e tabela
ao vivo continuam mostrando o estado atual. Sem novos metadados ou migração.

LAN C aceita novo Host Linux **ou Windows**, também no modo aleatório. Mantidos
ID/MAC, baseline de PCs anteriores, eth3 de R3, /25, gateway, nome seguro e
proteção de nomes personalizados. IPv4/Gateway pelo Inspector em ambos; nenhum
comando Windows novo. Superada a limitação histórica de somente Linux na LAN C.
As 22 tarefas, capítulos 1–4, rotas, engine, tempestade e recuperação permanecem.
Chromium: **288 verificações**, sem erros, incluindo Windows até a conclusão,
revisão 13–19, F5, DE/EN/PT-BR, temas e 700 px. TypeScript/build aprovados.
Testes finais: **118 aprovados em 3 arquivos** (controller, seleção de evidências
e idiomas); as demais regressões dos tutoriais passaram na rodada anterior.
Capturas reais e três comparações em `.playwright-mcp/reviews/chapter5-history/`;
abra `index.html`. Preservadas as alterações locais anteriores. Sem commit,
push, merge, deploy ou acesso aos dados reais do usuário.

**Correção do bloqueio de revisão do capítulo 5, somente local:** reproduzido no
Chromium: após a tempestade e F5 na etapa 20 (Parte 4, 1/3), voltar à etapa 13
(Parte 2, 9/9) bloqueava Weiter, embora 1–19 já estivessem concluídas. O controller
exigia novamente o caminho via R2, cuja eth1 agora estava DOWN. Separados crédito
histórico, validade técnica atual (`passed`) e permissão de avanço (`canAdvance`).
A revisão usa somente conclusões registradas e créditos legados já validados;
tarefas nunca comprovadas continuam exigindo condições e evidências reais.
Uma nota DE/EN/PT-BR distingue revisão de aprovação técnica atual. Repetir apenas
um ping não apaga o par histórico de comprovantes; sua atualização exige os dois
sentidos na mesma configuração. Navegar não reaplica a tempestade nem prepara
novamente a LAN C já concluída. Mantidas as 22 tarefas, critérios, engine e dados.

Tentativas afetadas com crédito válido podem ser retomadas sem reiniciar ou
migrar o banco. Se o aluno removeu/recriou PC C, a revisão continua disponível,
mas o vínculo original ID/MAC é preservado: nenhum host é adotado ou equipamento
restaurado silenciosamente. Etapas ainda não concluídas permanecem bloqueadas
quando a rede está danificada; esta correção não reconstrói a topologia do aluno.
Regressões incluem /24 após /25, etapas 13–22, F5, tentativas antigas, recuperação,
créditos ausentes e PC C removido/recriado. Validação: **237 testes em 18 arquivos**,
**252 verificações Chromium**, sem erros de navegador, TypeScript e build aprovados
(somente aviso conhecido de chunk >500 kB). Bancos e tentativas de teste isolados;
nenhum dado real do navegador alterado. Sem commit, push, merge ou deploy.

**Ajustes após a auditoria, somente local:** base `main`, HEAD `07d4ee6`, limpa
ao início. A instrução atual proíbe **commit, push, merge e deploy**, prevalecendo
sobre autorizações históricas abaixo. Etapa 17 esclarece LAN C física /25 versus
rota /24 mais abrangente, sem fornecer rede calculada ou Next Hop. Etapa 21
distingue as rotas para LAN C/LAN B e o retorno para toda LAN A; ensina `replace`
e reconhece `del` + `add` equivalente. DE/EN/PT-BR. Sete casos da auditoria foram
incorporados aos testes existentes: cobertura integral, /32 isoladas/exceções,
Next Hop/interface e pings diretos nos dois sentidos. As 22 tarefas, validadores,
máscaras, rotas, tempestade, LPM e simulação permanecem inalterados.
Validação: **134 testes direcionados em 5 arquivos**, **251 verificações Chromium**
sem erros de navegador, TypeScript, build e diff-check aprovados. O teste visual
permite a LAN física /25 no enunciado 17, mantendo a proibição de rede /24 resolvida
e Next Hops; etapa 21 conserva os dois checkpoints e reconhece `del` + `add`.

**Consolidação Git autorizada em 10/11/2026:** o usuário solicitou revisar os
arquivos, atualizar este Markdown e, passando a auditoria, criar o commit e fazer
push. Essa autorização substitui as proibições históricas de commit/push abaixo.
Não autoriza merge, rebase, force push ou deploy. `vercel.json` continua com
`git.deploymentEnabled: false`; nenhuma configuração de publicação foi alterada.
Base conferida: `main`, HEAD `8f4dcdc`, remoto
`https://github.com/FelipeDDD/NetLab-FiSI.git`; após fetch, sem divergência com
`origin/main`. Confirmar o commit final com `git log -1`, `git status` e o remoto
ao continuar em outro computador, sem presumir sincronização pelo texto histórico.

O lote tem **24 arquivos**: capítulo 5 v4 com 22 tarefas (4 + 9 + 6 + 3),
aprendizagem progressiva e antes/depois do LPM com provas ICMP reais, migrações,
tempestade única e recuperação com `ip route replace`; nomes seguros de PC C,
cores de sintaxe dos tutoriais, rejeição de destinos de rota com bits de host,
testes e documentação. Os seis PNGs DE/EN/PT-BR já versionados e referenciados
permanecem idênticos, 1672×941; não há novos assets nem mudanças no Studio.
Capturas, comparações, perfis, logs, scripts auxiliares locais e `dist/` ficam
ignorados e fora do commit. A triagem dos candidatos não encontrou padrões de
credenciais/chaves privadas ou arquivos temporários inesperados.

Próximos passos: concluir o teste manual didático do capítulo 5 com o usuário;
tratar separadamente o futuro editor de rotas pela interface. Limitações mantidas:
somente Linux na LAN C; nomes sem proveniência segura não são alterados; a
transação da tempestade encerra processos transitórios, preservando configurações
e histórico; comprovantes antigos recebem crédito histórico sem inventar pings.
Capturas locais não viajam pelo Git e devem ser copiadas separadamente se forem
necessárias no outro computador. Os detalhes e validações das rodadas seguem abaixo.

Auditoria final em 10/11: **3.036 testes em 181 arquivos**, **251 verificações
Chromium** do fluxo/persistência, TypeScript, build e `git diff --check` aprovados;
sem falhas nem erros de navegador. Mantém-se o aviso conhecido de chunk JS acima
de 500 kB. Não foi necessário corrigir código nesta auditoria. Logs e manifesto
dos 24 candidatos em `.playwright-mcp/final-nov10-*` (locais, ignorados).

**Revisão didática e comparações do capítulo 5, somente local:** enunciados
14–18 deixam gateway/Next Hops para o aluno descobrir; IPv4 de PC C e a LAN
física /25 permanecem iguais. Ajuda recolhida em 16 contém rede e sintaxe
genérica, sem Next Hop resolvido. Em 17, a ajuda ensina a obter a rede /24;
18 mantém explicitamente a /24. Em 19, antes/depois e retorno vêm dos caminhos
já comprovados; a regra LPM continua na ajuda ou após a escolha correta.
Etapas 20/21 não têm dropdown; recuperação explica add/replace sem comandos
resolvidos, mantém exatamente dois checkpoints e distingue as duas rotas de
R1 para PC C da LAN física. Tentativas legadas ainda sem prova de falha mantêm
a orientação manual existente como nota, sem novo incidente.
A renomeação segura já ocorria ao conectar o Linux-PC à eth3, antes de IPv4;
essa lógica foi preservada e a ajuda esclarece a mudança do nome padrão.
Sem histórico seguro, ou se houver nome personalizado/colisão, o nome real é mantido.
As 22 tarefas, validadores, engine, persistência e tempestade não foram alterados.
Capturas reais das sete etapas prioritárias, em DE/Graphite Dark e viewport
1440×1000, ficam em `.playwright-mcp/reviews/chapter5-didactic/antes/` e
`depois/`; comparações ANTES | DEPOIS ficam somente em
`.playwright-mcp/reviews/chapter5-didactic/referencias-chatgpt/`.
O harness opcional `NETLAB_DIDACTIC_CAPTURE=antes|depois` usa comandos e pings
legítimos; não acrescenta atalhos ao produto. Sem commit/push/merge/deploy.
Validação: **134 testes em 6 arquivos** e **251 verificações Chromium**,
sem erros de navegador; três idiomas, Dark/Light, cores nos seis temas,
700/1024/1440 px, F5, migração, provas históricas, tempestade e Undo/Redo.
TypeScript, build e diff-check aprovados. As sete comparações foram inspecionadas;
galeria em `.playwright-mcp/reviews/chapter5-didactic/index.html`.

**Acabamento visual dos tutoriais, somente local:** `TutorialCommand` mantém
apenas sintaxe/palavras-chave em âmbar; IPs, máscaras, interfaces, números e
placeholders ficam neutros, sem alterar textos/parâmetros ou o terminal real.
PC C recebe o nome `PC C` somente com vínculo ID/MAC, nome padrão e histórico de
criação confirmados, sem renomeação manual ou colisão. `lpm.pc.nameChecked` opcional
registra a decisão antes da ação para Undo/F5 não repetirem a renomeação. Nomes
sem origem verificável (ex.: histórico perdido no F5 anterior ao vínculo),
personalizados, com colisão ou com comprovantes antigos são mantidos por segurança.
Renomear manualmente continua possível. Etapas, validadores, rotas, tempestade e
as **22 tarefas** permanecem; Rodadas 1–3 preservadas. Sem commit/push/merge/deploy.
Validação: **3.036 testes em 181 arquivos**, **203 verificações Chromium**,
DE/EN/PT-BR e os seis temas, TypeScript, build e diff-check aprovados. Capturas
organizadas em `.playwright-mcp/reviews/tutorial-polish/referencias-chatgpt/`.

**Rodada 3 — Parte 4, somente local:** as Rodadas 1 e 2 foram preservadas.
Continuam proibidos commit, push, merge e deploy. O capítulo 5 conserva
**22 tarefas (4 + 9 + 6 + 3)** e o experimento LPM. Na primeira entrada em 20,
a tempestade desativa R2 eth1, mantendo cabo R2–R3 e todas as configurações.
A porta e o marcador `storm` são confirmados juntos pela transação CAS existente
`SessionController.commitDocument`; não há mecanismo narrativo genérico.
Marcadores `applied`/`adopted` impedem nova aplicação ao reabrir, navegar,
usar F5, retry ou Undo/Redo. Enlace já indisponível é adotado sem novas mudanças.
Tentativas v4 antigas já na Parte 4 recebem `legacy`, preservando a falha manual;
as ainda nas partes anteriores recebem `pending`. O progresso permanece v4,
sem novo banco ou schema de topologia. Marcadores inválidos são recusados.
Etapa 20 exige falha real A → R1 → R2, antes da explicação sobre rotas antigas
e falta de failover. Etapa 21 ensina add/replace e verifica duas rotas efetivas;
22 exige novos pings diretos A ↔ B e mantém a exploração livre. /24 e /25 de LAN C
e seus comprovantes permanecem; etapas LPM concluídas podem ser revisitadas como
histórico, sem recalcular recibos contra a indisponibilidade posterior.
Undo da tempestade restaura a porta sem repetir o incidente. Reinício explícito
do capítulo restaura também o marcador inicial; Undo do reinício recupera o
documento e marcador anteriores. Nova tentativa é independente.
Cabos Ethernet indisponíveis recebem tracejado discreto, preservando a cor.
**Limitação:** a transação reutilizada reativa o documento e encerra processos
transitórios em andamento. Não restaura pings; configurações, posições, preferências
salvas de UI e histórico de edição são preservados. Terminais podem ser reabertos.
Em erro ambíguo após commit, usar a recuperação
existente/F5, sem reaplicar a falha. Detalhes: `docs/alternative-paths-tutorial.md`.
Validação final da Rodada 3: **3.015 testes em 180 arquivos**, **196 verificações
Chromium**, TypeScript, build e diff-check aprovados. Cobre interrupção antes/depois
do commit, edição concorrente antes do incidente, adoção de enlace já indisponível,
estado legado, ida/retorno reais, navegação para LPM comprovado, F5, planos,
Undo/Redo/reinício, DE/EN/PT-BR e ambos os temas. Capturas finais separadas em
`.playwright-mcp/reviews/chapter5-round3/referencias-chatgpt/`. Nenhuma mudança na
engine, dependências, configuração de deploy, assets ou na lógica do experimento LPM.
O teste manual didático do usuário e o futuro editor visual de rotas seguem pendentes.

**Rodada 2 — LPM progressivo e prefixos, somente local:** autorizada após a
Rodada 1 abaixo, cujas alterações locais foram preservadas. Continuam proibidos
commit, push, merge e deploy. O capítulo 5 agora tem **22 tarefas (4 + 9 + 6 + 3)**,
progresso **v4**: etapa 16 configura R2 e comprova R2 → C; 17 configura a /24 em
R1 e comprova A → R1 → R2 → R3 → C; 18 adiciona a /25 sem remover a /24 e exige
novo ping A → R1 → R3 → C; 19 compara os caminhos e ensina LPM somente entre
rotas correspondentes. Etapas 20–22 conservam falha de enlace/troca manual.
Cada fase distingue rota e Echo Reply reais. Retornos assimétricos são aceitos
e seus saltos observados são persistidos. A inclusão da /25 preserva a prova
anterior da /24. API/texto isolado/ping de outra etapa não criam comprovantes.
Rotas antecipadas não são apagadas: a interface orienta recuperação manual.
Migração v1 → v2 → v3 → v4 conserva rede, IDs/MACs, checkpoints e tentativas
concluídas. Da v3, etapas 16/17 parciais retomam em 16; antiga 17 concluída ganha
`lpm.experiment.legacy`, com crédito explícito para 16–19 e três novos recibos
nulos. A antiga teoria mantém `lpm.legacy`. Não inventar o caminho /24 a partir
do `pathReply` antigo. Nova tentativa oferece o experimento completo.
`ip route add/replace` agora rejeitam destino IPv4 com bits de host, conforme
o Linux. Não mudar o parser CIDR global: `ip address add ...130/25`, /32,
default canônico, rotas conectadas e importação de projetos antigos continuam
válidos. Editor visual de rotas, métricas e redundância automática seguem fora
do escopo. Detalhes e referência Linux em `docs/alternative-paths-tutorial.md`.
Validação final da Rodada 2: **3.009 testes em 180 arquivos**, **176 verificações
Chromium**, TypeScript, build e diff-check aprovados. Inclui migrações v1–v4,
prefixos add/replace, /32/interface/default e restauração antiga, experimentos
com pings reais/API recusada, provas históricas, retornos distintos, F5, troca de
planos, reinício/Undo/Redo, DE/EN/PT-BR e Graphite Dark/Classic Light em 700–1440 px.
Permanece o aviso conhecido de chunk JS acima de 500 kB. Capturas finais separadas:
`.playwright-mcp/reviews/chapter5-round2/referencias-chatgpt/`. O teste manual
didático do capítulo 5 pelo usuário e o editor visual de rotas continuam pendentes.

**Rodada 1 didática/UX implementada, somente local:** a instrução atual proíbe
commit, push, merge e deploy. Esta restrição prevalece sobre as autorizações
históricas abaixo. No capítulo 5, ajuda de gateway também na LAN B (recolhida),
feedback da falta de retorno somente após pacotes reais e rota ausente no ponto
de parada, caminhos acima dos indicadores/pergunta e rótulo didático somente
`PC C`, mantendo o nome real e ID/MAC do projeto. O feedback é transitório;
progresso/validadores e F5 permanecem iguais. PC C ainda exige Linux pelo
reconhecimento atual, agora explicado na ajuda; Windows não foi habilitado.
Na Rodada 1, LPM/prefixos e editor visual de rotas ficaram fora do escopo;
a Rodada 2 acima amplia somente LPM/prefixos. Validação da Rodada 1:
**112 testes em 6 arquivos**, **149 verificações
Chromium** (DE/EN/PT-BR, Graphite Dark/Classic Light, F5, Undo/Redo e fluxo completo),
TypeScript, build e diff-check aprovados. Capturas finais em pasta separada:
`.playwright-mcp/reviews/chapter5-round1/referencias-chatgpt/`.
Ver `docs/alternative-paths-tutorial.md`.

Este resumo prevalece sobre os registros históricos abaixo. O checkout foi
conferido em 09/11: branch `main` limpa, HEAD **`2a1b91f`**, sincronizado com
`origin/main` em `https://github.com/FelipeDDD/NetLab-FiSI.git`; o HEAD remoto foi
consultado e coincidia com essa base. Não presumir que o trabalho está sincronizado:
conferir `git status`, `git log` e o remoto no computador de destino. O usuário
**confirmou o commit dos 175 arquivos aprovados e o push de `main` para
`origin/main`**. Não fazer merge, rebase ou force push; interromper se houver
divergência ou erro. A instrução mais recente determina **não realizar deploy
na Vercel nem no GitHub Pages nesta etapa**, substituindo a autorização de deploy
dada durante a auditoria. Publicação futura exige nova instrução e acesso ao projeto.
`vercel.json` mantém os deploys automáticos por Git desativados; a autorização
deste update não reativa permanentemente essa automação. Não há `.vercel/project.json`,
CLI Vercel disponível no PATH ou token Vercel configurado nesta sessão; será
necessário vincular/autenticar o projeto ou usar acesso existente ao dashboard.
Na rodada atual, o workflow obsoleto `.github/workflows/deploy.yml` foi removido:
GitHub Pages já está desativado no repositório. Hospedagem atual: Vercel com deploy
manual. `vercel.json` e os demais workflows não foram alterados.
Após a revisão, o usuário autorizou **commit e push para `origin/main`** das
alterações desta rodada: remoção do workflow Pages, posição do Ping-Animation por
plano, refinamentos dos tutoriais 1–5 e atividade prática de LPM com LAN C.
Essa autorização substitui as restrições anteriores de commit/push desta rodada;
**deploy, merge, rebase e force push continuam fora do escopo**. Para retomar em
outro computador, consultar o HEAD real com `git log -1` e verificar a sincronização;
`2a1b91f` acima registra a base anterior à consolidação. Stash e backups locais
devem continuar preservados; capturas, logs e arquivos temporários ficam fora do Git.
Validação final da consolidação: **2.996 testes em 180 arquivos passaram com
Node 24**, além de TypeScript, build e diff-check. Revisões Chromium dos tutoriais
e da posição do ping foram aprovadas nos bancos descartáveis. Dependências,
`package-lock.json` e configuração da Vercel permanecem inalterados nesta rodada.

### Revisão pontual dos tutoriais 1–5

- Comandos Linux em blocos e trechos de instruções/ajudas usam o componente
  compartilhado `TutorialCommand`/`TutorialText` e âmbar do tema. Saídas de
  terminal, tabelas e IPs isolados mantêm sua apresentação. Exemplos genéricos
  de rotas usam rede/CIDR nos três idiomas; conceitos de prefixo são preservados.
- Capítulo 1, etapa 7: IPv4 de PC C aceita Inspector ou terminal. Cabo, identidade,
  IP e máscara reais são revalidados, inclusive após F5; o registro antigo de
  comando continua compatível. As etapas de ping mantêm suas exigências existentes.
- Capítulo 2, etapa 3: título neutro antes do teste; pergunta sobre a falha somente
  após a evidência real já exigida pelo verificador.
- Capítulo 5, etapa 7: explicação de falta de rota em R1 somente com ICMP e caminho
  observados compatíveis e ausência de rota confirmada. Resposta bem-sucedida e
  outras falhas recebem feedback próprio. A causa específica não é inferida de
  comprovantes históricos após F5; nova execução permite observá-la novamente.
- Menu: Capítulo 3 mantém `Direkt starten`; capítulos 4/5 distinguem início
  independente (`Kapitel starten`), retomada e nova tentativa. DE/EN/PT-BR.
- **Editor visual de rotas permanece pendente**, para etapa separada. Esta revisão
  não implementa comandos Windows nem promete configuração de rotas pelo Inspector.
- Validação desta revisão: **479 testes em 18 arquivos**, TypeScript, build e
  `git diff --check` aprovados. Chromium com perfis/bancos descartáveis: capítulos
  1–3 (**139 verificações**), 4 (**109**) e 5 (**111**), sem falhas ou erros de
  navegador. Cobertura inclui Inspector/terminal, F5, progresso, DE/EN/PT-BR,
  Graphite Dark/Classic Light e 700/1440 px. Capturas nos diretórios existentes
  `.playwright-mcp/reviews/raw/guided-tutorial/`, `chapter4-minimal/` e
  `chapter5-minimal/` (artefatos locais, fora do Git).

### Capítulo 4 — Statisches Routing

- Implementado com **11 etapas: 8 + 3**, progresso de versão 2 e migração da
  versão anterior. R1/R2/R3 começam alinhados; LAN C nova é inserida acima de R2,
  com PC C acima do Switch C. Posições personalizadas existentes não são migradas.
- Textos mínimos DE/EN/PT-BR, um único `Hilfe` recolhido nas tarefas pertinentes;
  sem `Weitere Hilfe`, `Adressplan` ou parágrafos visíveis de condições de conclusão.
- Ajuda visual independente do texto nos passos **2/8 (`ip route`)** e
  **4/8 (rota estática em R2)**. Visualizador lateral ou modal responsivo,
  abrir/fechar, Escape, foco, ajuste à largura e 50% da resolução original.
- Última etapa verifica automaticamente A→B, B→A, A→C, C→A, B→C e C→B, usando
  `Shell/runPing`, `ping -c 1`, respostas reais e comprovantes da configuração.
  Uma direção por vez; aguarda comando e animação antes da seguinte. Usa 2×
  temporariamente e restaura a velocidade anterior. Falhas não concluem o capítulo;
  permitem repetir. Sair/reiniciar cancela a sequência. Tentativa concluída não
  reinicia automaticamente ao reabrir/F5. Pausa manual exige o Run existente.
- A orquestração admite somente seus comandos API identificados; probes API
  externos continuam sem comprovar tarefas. Persistência, CAS e checkpoints/Undo
  permanecem integrados. Consultar [static-routing-tutorial.md](static-routing-tutorial.md)
  e `src/tutorials/StaticRoutingTutorialController.ts`.

### Capítulo 5 — Alternative Wege

- Ampliado para **22 etapas: 4 + 9 + 6 + 3**, progresso **versão 4**. Depois da
  comprovação A ↔ B por R2 e de Next Hop, as tarefas 14–19 ensinam LPM com uma
  LAN C real e o experimento antes/depois. Falha/alternativa de LAN B ficam em 20–22.
- Ao entrar na atividade, prepara somente R3 eth3 com `192.168.30.129/25`.
  O aluno cria um PC Linux, conecta à eth3 e configura `192.168.30.130/25`,
  gateway/default efetivo `192.168.30.129`. Nome/posição livres; vínculo por ID/MAC
  somente com host novo conectado à porta correta, usando baseline persistida.
- Ping local C → R3 comprovado; depois R2 recebe rota para LAN C via `10.0.23.2`
  e o aluno comprova R2 → C. R1 usa primeiro `192.168.30.0/24 via 10.0.12.2`,
  com ping por R2; depois acrescenta `192.168.30.128/25 via 10.0.13.2` e comprova
  novo ping direto por R3. A pergunta de LPM aparece após observar ambos os
  caminhos. Retorno é real e pode ser assimétrico. Maior CIDR vence somente
  entre rotas correspondentes. Nenhuma mudança na engine/animação.
- Provas A/B e local C–R3 têm escopos próprios; acrescentar LAN C ou suas rotas
  não invalida provas anteriores. Hashes globais antigos continuam reconhecidos;
  normalização de um par válido ocorre junta. A falha posterior de enlace conserva
  seu baseline completo e as proteções contra atribuição incorreta de causa.
- Intenção antes da edição, topologia antes do recibo, CAS e recuperação de gravação
  interrompida. F5 não duplica PCs nem restaura processos. Checkpoint/reinício inclui
  C somente após vínculo seguro; equipamento independente ou identidade reutilizada
  não é apagado. PC ainda não vinculado permanece preservado, por segurança.
- Migração v1 → v2 → v3 → v4 preserva rede e histórico. Antiga etapa 14 não concluída
  abre a nova prática. Atividade teórica antiga já concluída recebe crédito
  histórico explícito (`lpm.legacy`), sem inventar PC/pings; conclusões anteriores
  continuam concluídas. Nova tentativa oferece o fluxo prático completo.
- Instruções e ajudas concisas nos três idiomas; no máximo um `Hilfe`, sem
  submenus ou respostas antecipadas no corpo das perguntas. Evidências dos enlaces
  são independentes, com pacotes reais; configuração parcial não é sucesso final.
- **O teste manual didático pelo usuário continua pendente**, agora incluindo
  criação de PC C, observação de ida/retorno distintos e conclusão da LAN B.
- Histórico da expansão v3: **487 testes em 18 arquivos**, TypeScript, build e
  `git diff --check` aprovados. Chromium: **113 verificações** no roteiro completo
  com banco/perfil descartáveis, sem falhas ou erros de navegador. Inclui criação
  por arraste, /24 e /25 reais, F5 na criação, migração da antiga etapa 14, três
  idiomas, LPM em Dark/Light e 700 px, conclusão, reinício e Undo/Redo. Capturas em
  `.playwright-mcp/reviews/raw/alternative-paths-staging/` e organização existente
  de `chapter5-minimal/`. Consolidação via commit/push autorizada após a revisão;
  nenhum deploy foi solicitado.
- Referências: [alternative-paths-tutorial.md](alternative-paths-tutorial.md),
  `AlternativePathsController.ts`, `AlternativePathsPanel.tsx` e
  `alternativePathsProgress.ts` em `src/tutorials/`.

### Topology Studio (Beta)

- Implementação própria em `src/export/studio/`, carregada sob demanda pelo menu
  Export. Usa posições originais como referência, cards adaptativos, separação
  local, endpoints nas bordas e geometria independente do canvas do simulador.
- Presets Clean, Presentation e Technischer Bericht; A4/A3, retrato/paisagem,
  layouts de apresentação independentes por formato, escala, aliases, títulos,
  subtítulos, Routing Tables selecionáveis/editáveis e rodapé opcional.
- Reposicionamento individual e global do diagrama, ajuste de tabelas, layout
  compacto, alinhamento magnético, guias de distância e inversão vertical.
  Esses controles alteram apresentação, não configurações/IPs da rede.
- Branding obrigatório NetLab-FiSI, assinatura discreta Topology Studio, título e
  subtítulo personalizáveis; sem metadados automáticos de data/captura/formato no
  documento. SVG, PNG, HTML e impressão/PDF preservados.
- Captura dados técnicos **ao abrir**. Fechar, alterar a topologia e reabrir
  atualiza IPs/rotas/dispositivos, reconciliando a apresentação existente. A seção
  `Dokumenthilfe & Aktualisieren`, seu botão e timestamp foram removidos;
  `Dokumentationsinhalte` continua presente. Não há sincronização contínua.
- Apresentação persistida em `ui.topologyStudio` no Topology JSON e nos rascunhos.
  `src/studioPresentation.ts` valida/repara campos; versões futuras desconhecidas
  permanecem opacas e geram aviso. `persistence.ts` e `pageLayouts.ts` reconciliam
  os dados atuais sem descartar silenciosamente o documento.
- Referência de detalhes/limites: [topology-studio.md](topology-studio.md).

### Imagens didáticas — incluir os seis assets no Git

Os PNGs aprovados são arquivos de execução da aplicação, não capturas de teste.
`src/tutorials/tutorialVisualHelp.ts` os referencia com `new URL(..., import.meta.url)`;
o Vite os inclui no build. Todos medem **1672 × 941** e os hashes foram conferidos.

- `output/imagens-ip-route-sem-setas/ip-route-de.png`
- `output/imagens-ip-route-sem-setas/ip-route-en.png`
- `output/imagens-ip-route-sem-setas/ip-route-pt-BR.png`
- `output/imagens-rotas-estaticas-referencia/rota-estatica-de.png`
- `output/imagens-rotas-estaticas-referencia/rota-estatica-en.png`
- `output/imagens-rotas-estaticas-referencia/rota-estatica-pt-BR.png`

Não sobrescrever assets aprovados. O padrão visual está em
[padrao-imagens-didaticas.md](padrao-imagens-didaticas.md), e a integração em
[guided-visual-help.md](guided-visual-help.md). Os três PNGs mais antigos em
`output/imagens-ip-route/` foram preservados localmente, mas não são consumidos
pelo código e ficam fora do commit. O `.gitignore` permite somente os seis acima
dentro de `output/`; novas imagens futuras exigem inclusão explícita.

### Canvas, terminal e Ping-Animation

- Drop de cabos usa o alvo visual efetivo e coordenadas subpixel; melhorias de
  hitbox/hover dos botões Terminal e Quick Ping em zoom baixo. Ver
  `src/canvasDropTarget.ts` e [device-actions-and-presentation.md](device-actions-and-presentation.md).
- Quick Ping usa indicador passivo discreto com origem/destino e Escape;
  múltiplos IPs continuam exigindo escolha explícita no popover existente.
- Help do terminal tem ícone e texto Hilfe/Help/Ajuda, modo compacto por largura
  do painel e cadeado independente. Conteúdo/comandos do terminal preservados.
- Ping-Animation arrastável pelo cabeçalho, limitado ao canvas/dock; slider e
  checkboxes independentes. Sem opt-in de posição, retorna ao padrão ao reabrir. Cálculo
  de limites compartilhado com exercícios, sem acoplamento dos componentes.
  O painel aparece com um salto observado; não tem atraso deliberado de drag.
  Texto redundante de animação reduzida removido.
- `Lembrar velocidade`/`Remember speed`/`Geschwindigkeit merken`: opt-in global
  em `netlab:ping-animation-preference:v1` no localStorage. Só ações manuais gravam;
  mudanças temporárias automáticas não sobrescrevem. Sem opt-in, usa o padrão
  0,25× na inicialização. Desmarcar desativa a lembrança sem alterar o ping atual.
- **`Position merken` / `Remember position` / `Lembrar posição` implementado**:
  preferência opcional `ui.pingAnimationPosition` no documento v1, com opt-in e
  coordenadas relativas ao canvas. Cada plano/rascunho conserva sua escolha em
  troca de abas, reabertura e F5; Save/Load e JSON usam a serialização existente.
  Projetos antigos continuam centralizados, sem mudança de schema IndexedDB.
  Desmarcar limpa a preferência e recentraliza o painel. Arraste/setas registram
  posições manuais; resize do navegador/dock apenas limita a posição exibida e
  não destrói a escolha salva. A velocidade global e os 2× temporários continuam
  independentes. Ver [device-actions-and-presentation.md](device-actions-and-presentation.md).
- A causalidade visual ARP→IP e os erros ICMP usam metadados de observação;
  alterações em `engine/network.ts` e `engine/ipdevice.ts` apenas associam esses
  eventos à apresentação, sem mudar scheduler, encaminhamento ou protocolo.

### Validação desta auditoria

- Rodada Pages/posição por plano: **383 testes direcionados**, **107 verificações
  Chromium** (perfil/banco descartáveis), TypeScript, build e `git diff --check`
  aprovados. Cobre dois planos, opt-in/opt-out, reabertura, F5, Save/JSON,
  redimensionamento, idiomas/temas e independência da velocidade global.
  Mantém o aviso conhecido de chunk acima de 500 kB. Sem commit/push/deploy.
- Suíte completa: **2.983 testes / 178 arquivos**, todos aprovados.
- TypeScript e build de produção aprovados, incluindo os seis PNGs. Permanece o
  aviso conhecido de chunk JS acima de 500 kB; não houve mudança de bibliotecas.
- Chromium: Studio/interface/exportações **112 verificações** e capítulo 5
  **111 verificações**, aprovadas com perfis e bancos descartáveis.
- Chromium: capítulo 4 **109 verificações** e Quick Ping/velocidade/preferência
  **106 verificações**, aprovadas. A sequência de 2× não sobrescreve o opt-in.
- Chromium: snapshot/reabertura/persistência/exportações e interações do canvas
  **108 verificações**, aprovadas; 120 trajetos de hover e 120 conexões sem falha.
- Demais roteiros e resultado final da auditoria são registrados no resumo
  entregue ao usuário; consultar os logs locais `final-git-audit-*.log` em
  `.playwright-mcp/` quando este mesmo checkout estiver disponível.
- Triagem dos arquivos candidatos sem tokens/chaves privadas reconhecíveis,
  arquivos de credenciais ou caminhos pessoais de anexos. Capturas, logs,
  `node_modules/`, `dist/`, perfis e demais outputs continuam ignorados.
- Não transportar `.env`, credenciais, caches, banco/perfil do navegador pelo Git.
  Topologias pessoais e dados IndexedDB precisam de exportação/importação própria.

### Pendências e como continuar em outro computador

1. Conferir branch, commit e alterações locais antes de atualizar. Depois da
   sincronização autorizada, no outro computador usar `git fetch origin` e,
   somente se a árvore estiver apropriada, `git pull --ff-only`. Não sobrescrever
   trabalho local nem resolver divergências por reset/force. Este resumo não é
   prova de que um push aconteceu; verificar o histórico.
2. Ler este arquivo e os documentos da área. Usar Node **22** como referência
   de CI; esta auditoria local rodou em Node **24.21.0**. `npm ci`, `npm run dev`,
   depois **http://localhost:5173/app.html**. `.npmrc` desativa symlinks (`bin-links=false`)
   por compatibilidade com o volume de trabalho; scripts invocam os binários via Node.
   Preservar a origem `localhost:5173` para não aparentar perda dos dados locais.
3. Próximo trabalho: **teste manual do capítulo 5** pelo usuário. Registrar
   dificuldades didáticas reais antes de novas mudanças.
4. Trabalho futuro: definir a **configuração de rotas pela interface**, com
   escopo e validação próprios. Não antecipar implementação nem mudar protocolos.
5. Limites conhecidos: textos/blocos manuais longos podem colidir no Studio;
   ajustar escala/posições ou usar A3 conforme os avisos. A interface geral pode
   exceder a largura em 390 px; o visualizador mantém seus próprios limites.
   Algumas ajudas técnicas antigas ainda estão somente em alemão. Preferências
   dependem do armazenamento do navegador; não sincronizam entre computadores.
6. Para reproduzir: `npm test`, `npm run build`, `git diff --check` e os runners
   `test-static-routing-tutorial.mjs`, `test-alternative-paths-tutorial.mjs`,
   `test-studio-interface.mjs`, `test-studio-snapshot.mjs` e
   `test-ping-control-drag.mjs` em `scripts/`. Os runners procuram Chrome/Edge/
   Chromium; `NETLAB_CHROMIUM_PATH` permite indicar um binário existente. Não usam
   o perfil ou banco pessoal. Em Windows restrito, o esbuild e Chromium podem
   exigir permissão de execução fora do sandbox; isso não é falha do código.
7. Capturas para revisão devem continuar organizadas em pastas próprias
   `.playwright-mcp/reviews/<rodada>/referencias-chatgpt/`, somente PNGs finais.
   Logs/PDFs/JSONs ficam fora dessa pasta. Esses artefatos não entram no commit;
   código, testes, documentação e os seis assets aprovados entram juntos.

## Histórico — estado consolidado em 04/11/2026

### Novidades verificadas neste checkout

- Checkout inicialmente limpo em `main`, HEAD `0760a2e` — **Capítulo 2 já implementado**.
  Os commits `6212209` (regressões E08) e `60ecbeb` (Slate Circuit como default)
  também estão presentes. As referências anteriores abaixo são históricas.
- O Capítulo 2, **Subnetzmaske verstehen**, continua o mesmo rascunho, adiciona PC D
  e usa observações reais de terminal e Quick Ping. Aceita máscaras funcionais como
  /27, /26 e /24 sem exigir /24. Ver [tutorial-subnet-mask.md](tutorial-subnet-mask.md).
- Nova implementação local: **Capítulo 3 — Zwei Netzwerke verbinden**, oito etapas.
  A continuação mantém o rascunho e as configurações; o início direto abre outro
  rascunho com LAN A funcional, sem marcar os capítulos anteriores como concluídos.
  Acrescenta um grupo Router/Switch B/E/F com posicionamento livre e uma só operação
  de Undo/Redo. Portas do Router são validadas pelo cabo e pela LAN, não por eth0/eth1.
- O progresso usa `guided:two-networks:v1:draft:<draftId>` no mesmo IndexedDB.
  Preparação tem intenção durável e recuperação idempotente. Controllers anteriores
  ficam inativos nesse rascunho para preservar seus metadados históricos, inclusive
  quando o gateway de A muda. PC F começa sem cabo/IPv4. As tarefas distinguem
  Gateway de A pelo Inspector e rota default de F pelo terminal; os testes reais
  são A↔F. O diagnóstico final observa a falta de rota de B e exige nova resposta
  B→F após correção, sem provocar falhas artificiais em uma configuração já correta.
  `Wiederholen` no centro do rodapé muda para `Bestätigen` no primeiro clique;
  o segundo confirma Gateway/rota usando Undo/Redo. Escape/navegação cancelam; situações
  ambíguas são recusadas sem reset parcial. O envelope de progresso v2 adapta o v1,
  conserva a topologia antiga e guarda o histórico A/E sem reutilizá-lo como A/F.
  Não há segundo Router, novas imagens ou mudanças nos algoritmos de rede.
  Ver [tutorial-two-networks.md](tutorial-two-networks.md).
- Validação dos refinamentos: **427 testes direcionados em 8 arquivos**, incluindo
  os três controllers, traduções, terminais, histórico e exemplos da ajuda; TypeScript e build
  passaram, assim como `git diff --check`. A revisão Chromium passou em **137
  verificações** dos capítulos e **106** da ajuda (execuções separadas), com perfil e
  IndexedDB descartáveis: dois modos completos, configurações antecipadas, diagnóstico,
  repetição/Undo/Redo, adaptação v1, F5, idiomas e temas em 700/1440 px.
- Os capítulos anteriores e os seis exercícios Beta conservam textos e
  verificações existentes.

### Referências flutuantes do terminal

- Operações Linux de `ip route` podem ser destacadas por **Anheften** na
  `Terminal — Befehlsreferenz`. A ajuda permanece aberta para selecionar até
  duas referências distintas; há feedback para duplicatas e limite atingido.
  Ao fechar a ajuda, as janelas podem ser arrastadas ou movidas por teclado,
  fechadas individualmente e usadas junto ao terminal, Inspector e tutorial.
- Os painéis reutilizam o catálogo e a apresentação existentes, são limitados à
  área visível e não persistem após F5. Conteúdo existente em alemão; controles
  novos traduzidos em DE/EN/PT-BR. Ver [terminal-command-reference.md](terminal-command-reference.md).
- Validação da referência: **409 testes direcionados** e **115 verificações
  Chromium**, incluindo F5, arraste, cópia, idiomas, temas e telas de 700/1440 px;
  TypeScript, build e `git diff --check` passaram. Chromium usou perfil e banco
  descartáveis; capturas de revisão são artefatos locais, não arquivos do projeto.
- Na consolidação de 04/11, a suíte completa passou em **2.700 testes / 142
  arquivos**. Foi corrigido o acesso a `document` na renderização sem navegador
  do provedor de referências; o build de produção também passou.

### Git e sincronização

- `Kapitel neu starten` agora usa checkpoint local por capítulo/rascunho, capturado
  antes da preparação. Documento e progresso são restaurados atomicamente, com CAS,
  confirmação não modal e Undo/Redo. Casos antigos sem checkpoint oferecem tentativa
  independente; não há reconstrução retroativa. Capítulo 3 preserva a LAN anterior e
  só desfaz gateways/rotas identificáveis como seus. Ver [chapter-restart.md](chapter-restart.md).
- O runner `node scripts/test-chapter-restart.mjs` passou em **147 verificações Chromium**,
  com banco descartável: três capítulos, dois modos do capítulo 3, F5, Undo/Redo,
  conflitos, quota/abort, edição local concorrente e fallback para nova tentativa.
  A suíte completa passou em **2.692 testes / 141 arquivos**, além de TypeScript,
  build e `git diff --check`.

- Branch `main`, remoto `https://github.com/FelipeDDD/NetLab-FiSI.git`.
- Base desta implementação local: **`0760a2e`**. Conferir alterações pendentes e
  a situação da branch remota antes da próxima sincronização.
- Commits anteriores relevantes:
  - `316264d` — atraso inicial do autoplay da homepage e limpeza do rodapé.
  - `867e178` — branding NetLab-FiSI, textos e auditoria editorial.
  - `cb4af20` — defaults visuais, fontes locais/web, testes e documentação.
  - `ac758f9` — ferramentas de rede e interações do workspace.
  - `e109471` — exercícios, resumos de gateway e apresentação do canvas.
- Esta consolidação reúne painéis de exercícios, ajuda IPv4, Handles e tutorial
  guiado com recuperação local. No notebook, conferir `git status` e atualizar
  a branch antes de continuar; não presumir que uma cópia anterior já os contém.
- Não descartar mudanças locais, não usar reset/clean/force e não mexer em stashes.

### Aprendizagem guiada e ajuda — consolidação de 03/11/2026

- Os seis exercícios Beta têm instruções compactas, resumo `N/M Prüfungen bestanden`,
  detalhes e orientações recolhíveis. Seus critérios, topologias, versões e progresso
  permanecem os mesmos. O painel usa `ExercisePanelFrame`: arraste pelo cabeçalho,
  teclado, reset e limites da área visível, sem escrever no viewport ou na rede.
  Rechenpraxis continua com seus controles próprios.
- **Hilfe → IPv4 konfigurieren** também abre pelo Inspector e pelo tutorial, num
  modal com foco restaurado e DE/EN/PT-BR. Exemplos selecionáveis, sem botões de
  cópia. Documentar somente os comandos reais: Linux `ip address add` exige uma
  interface sem IPv4 e não configura gateway; Windows usa `ipconfig /all` para
  consulta e não implementa configuração via `netsh`. Ver [learning-help.md](learning-help.md).
- Handles ficam ocultos sem hover, aparecem por foco/touch e durante conexões,
  com área clicável de 18×18 px e indicador visual menor. O encaixe RJ45 do Switch,
  mapeamento das portas, geometria dos dispositivos e engine foram preservados.
- **Übungen → Geführte Tutorials → Erste Verbindung** tem oito etapas no mesmo
  capítulo/rascunho: cabo de A, IPv4 de A, ping A→B, Ctrl+C, novo PC C Linux,
  cabo de C, IPv4 de C pelo terminal e ping C→B com introdução ao ARP/cache.
  PC C recebe esse nome se estiver livre, preservando seu ID. Não há novos capítulos,
  notas ou alterações nos seis exercícios Beta. Comandos por API, Quick Ping e
  sondas não comprovam as ações exigidas do aluno. `terminalCommandEvents.ts`
  observa a execução real e distingue término normal de interrupção por Ctrl+C.
- **Persistência do tutorial já implementada:** `tutorialProgress.ts` usa o store
  `meta` existente, chave `guided:v1:draft:<draftId>`, com versão, etapa, histórico,
  vínculos dos dispositivos e hashes de evidências. A topologia continua exclusivamente
  no rascunho normal. A fila confirma o rascunho antes de gravar os metadados com CAS;
  falhas/conflitos não autorizam sobrescrita silenciosa. Não há alteração de schema,
  duplicação da topologia ou persistência de processos/caches/saída xterm.
- F5 restaura o painel e revalida a configuração. Eventos históricos válidos são
  preservados, mas ping em andamento não é restaurado: a orientação pede repetição.
  **Fortsetzen** retoma sem duplicar; **Neu starten** cria outra tentativa e mantém
  as abas anteriores. Sessões antigas sem metadados continuam planos normais.
  Save/Load/JSON não transferem automaticamente essa associação para outro rascunho.
  Encerramento abrupto ainda pode perder alterações não confirmadas em disco.
- Referências: [tutorial-first-connection.md](tutorial-first-connection.md) e
  [guided-learning-roadmap.md](guided-learning-roadmap.md). Capítulos seguintes,
  incluindo a proposta de E09 guiado, continuam sujeitos a discussão; não iniciá-los
  automaticamente. Os critérios publicados do E09 permanecem intactos.
- Capturas e logs de revisão ficam em `.playwright-mcp/`, ignorados pelo Git.
  Os runners usam perfil e IndexedDB descartáveis; não acessar dados reais para testes.
- Validação final desta consolidação em **03/11/2026**, Node **24.21.0**:
  **408 testes direcionados em 9 arquivos**, TypeScript/build e `git diff --check`
  passaram. Chromium: **124 verificações** no runner de tutorial/exercícios e
  **106 verificações** no de ajuda IPv4, sem falhas ou erros de browser. Os runners
  compartilham regressões do repositório; esses números não são casos únicos somados
  nem uma execução da suíte completa. Comandos: `node scripts/test-guided-tutorial.mjs`
  e `node scripts/test-learning-help.mjs`. Dependências e lockfile não mudaram.


### Defaults e nomes aprovados

- UI Theme padrão de primeiro acesso: **Graphite Dark**, ID `graphite-dark`.
  Ausência da chave `netlab:ui-theme:v1` usa esse default sem gravá-la.
- O tema de ID interno `original` agora aparece como **Midnight Blue**.
  Foi uma mudança exclusivamente de nome; sua paleta ficou intacta. O usuário
  não quer "Original" como nome de tema/opção. **Não renomear o ID persistido.**
- Valores salvos válidos continuam prioritários. O valor legado `midnight-blue`
  continua resolvendo para `original` (nome visível Midnight Blue), sem regravar
  localStorage nem restaurar uma paleta antiga que já havia sido removida.
- Canvas independente do UI Theme: **Slate Circuit**, `choice: 'bg3'`,
  `intensity: 100`, `dots: false`, `animation: 'shooting'` (Shooting Star). Não alterar esses defaults
  nem sobrescrever escolhas existentes por interpretar preferências como bugs.
- Terminal novo/Reset: `style: 'fx-signal-pulse'`, `intensity: 100`,
  `fontSize: 14`, `fontFamily: 'consolas'`. O preset Pulse deve aparecer
  selecionado mesmo com "Show experimental styles" desmarcado.
- Novos planos gravam a aparência completa explicitamente. Campos ausentes em
  documentos antigos preservam seus valores históricos: Diagonal, 80%, System,
  13 px. Preferências explicitamente salvas nunca são substituídas por defaults.
- Idioma padrão: **alemão**, sem detecção do navegador. DE/EN/PT-BR podem ser
  escolhidos; a escolha fica em `netlab:language:v1` e é reutilizada.

### Refinamentos locais dos exercícios Beta

- Menu Übungen agrupado por assunto, sem novos drafts publicados. Categorias
  da Rechenpraxis usam nomes pedagógicos, com navegação DE/EN/PT-BR.
- Rechenpraxis inicia em **Subnetzgrenzen (ND02 v3)**, dificuldade iniciante,
  quando não existe uma questão ativa. Fechar/reabrir preserva a questão atual.
- Novas tentativas usam posições 18% mais espaçadas e enquadramento inicial
  com `maxZoom: 0.65`. F5/reabertura de uma tentativa associada ao draft usa o
  mesmo limite de 0.65×. Durante a sessão, abas visitadas recuperam zoom/pan de um cache em
  memória, sem novo fit. Não reposicionar tentativas existentes.
- Ping oferece 0.25× por padrão (800 ms/link no cursor atual); Live permanece
  em 200 ms/link e preferências antigas de velocidade não são reativadas.
- O Inspector explica rotas default explícitas/RIP separadamente do gateway
  da interface. Não sincronizar esses dados automaticamente.
  Allgemein mostra só o endereço selecionado, ou `—` se ausente/concorrente;
  Netzwerk mantém a origem e a escolha por ordem do simulador.
- E06 recebe explicação da máscara /16 após verificação; discussões dos demais
  pilotos são opcionais, sem status de avaliação pendente. Critérios v1 intactos.
- Detalhes e validações: [exercise-usability.md](exercise-usability.md).
  Conferir o Git para identificar o checkpoint que consolida esta rodada.

### Fontes dos terminais

- Fontes adicionais: JetBrains Mono, Fira Code, IBM Plex Mono e Source Code Pro.
  WOFF2 Regular/Bold estão em `public/assets/fonts/`, com versões fixadas,
  licenças OFL e fontes de origem no README desse diretório.
- Consolas é somente local. Não copiar, converter ou distribuir fonte Microsoft.
  Na ausência dela, carregar JetBrains Mono dos assets do próprio NetLab sem
  mudar o valor salvo `consolas`.
- `src/terminalFonts.ts` carrega somente a família de um terminal visível,
  compartilha pedidos entre painéis e usa cache HTTP/URLs versionadas.
  Nenhuma fonte web deve baixar só por abrir a homepage ou o editor vazio.
- `TerminalPanelView.tsx` aplica a fonte após carregar e usa a infraestrutura
  `observeTerminalSize`/FitAddon/refresh. Cancelar callbacks de uma preferência
  anterior ao trocar/ocultar painéis; preservar buffers, entrada e sessões xterm.
- Ligaduras ficam desativadas por CSS (`font-variant-ligatures`, `liga`, `calt`).
  Não adicionar addon de ligaduras nem recriar terminais para trocar fonte.
- Referências: [terminal-fonts.md](terminal-fonts.md), [defaults.md](defaults.md),
  [ui-themes.md](ui-themes.md).

### Homepage e branding

- `/` é a homepage Packet Journey; editor em `/app.html`.
- O primeiro autoplay espera **725 ms** para permitir ver o DATA inicial.
  Comandos manuais não esperam; não adicionar esse atraso a cada loop/replay.
  Implementação em `src/home/journey/PacketScenes.tsx`.
- O rodapé não deve exibir "Simuliertes Verhalten ersetzt keine echte Hardware."
  nem equivalentes EN/PT-BR. A frase foi removida de `home.about` nos três idiomas.
- Marca oficial **NetLab-FiSI**, nome curto NetLab. Terminal, ajuda e artefatos
  gerados já foram atualizados. Não repetir uma substituição global de `netsim`.
- Permanecem intencionais: `app: 'netsim'`, versões de schema, chaves antigas,
  `application/netsim`, nomes de downloads, package name, SSIDs de compatibilidade,
  URLs antigas ainda não verificadas, copyright e referências a terceiros.
- A auditoria em [branding-audit.md](branding-audit.md) é um levantamento anterior
  à limpeza: serve como classificação de riscos, não lista atual de pendências.

### Funcionalidades recentes que já estão implementadas

- **Rechenpraxis:** Subnetting A, VLSM B, Gateway E02 v1/v2 e **Subnetzgrenzen
  ND02 v3** publicados no painel principal. Não implementar essa integração de novo.
- ND02 v3 tem três perguntas: pertencimento matemático, host utilizável e máscara;
  começa com `255.255.`, corrige em conjunto, oferece justificativas e Rechenweg.
  DE/PT-BR/EN podem mudar sem perder seed, respostas ou máscara parcial.
  Espaço avança após correção, respeitando controles/foco. Seeds/fingerprints
  versionados precisam ser preservados.
- O preview `http://localhost:5173/__diagnosis_preview__` continua exclusivo de
  desenvolvimento; versões históricas e ND05 internos não devem ser publicados
  por acidente. Ver [network-diagnosis-preview.md](network-diagnosis-preview.md).
- PC/Notebook têm Desktop e Web Browser simulado, janela compacta móvel e
  redimensionável, menu de contexto e erros DE/PT-BR/EN educativos. Usam a rede
  simulada; não navegam na internet real. Ver [pc-browser.md](pc-browser.md).
- DNS: editor preserva quebras de linha, valida cada registro e não salva um lote
  parcialmente inválido. Wi-Fi mostra APs reais elegíveis; APs novos usam
  `NetLab-WiFi`, preservando SSIDs anteriores. Ver `src/dnsRecords.ts`,
  `src/components/HostWireless.tsx` e respectivos testes.
- Save/Load, rascunhos, IndexedDB, associação Wi-Fi, cabos, Markierungen,
  clipboard e guias ópticas já existem. Ler implementação antes de ampliar.
  Restrições e histórico arquitetural estão nas seções seguintes.

### Arquivos para começar a investigar

- `src/uiTheme.ts`, `src/themes.css`, `src/buttons.css`: aparência da UI.
- `src/canvasBackground.ts`: imagem, intensidade, pontos e animação do Canvas.
- `src/terminalAppearance.ts`, `src/terminalFonts.ts`,
  `src/components/TerminalPanelView.tsx`, `src/components/terminalDockLayout.ts`:
  preferências e apresentação do terminal; `src/terminals.ts` mantém as sessões.
- `src/projects/projectDocument.ts`: criação de plano com aparência explícita;
  `src/workspace/WorkspaceUI.tsx` e `src/persistence/sessionController.ts`: abas,
  criação, fechamento e restauração. Não misturar UI Theme/background com documento.
- `src/exercises/practice/PracticePanel.tsx` e `model.ts`: prática publicada;
  `src/exercises/diagnosis/boundariesV3.ts`: gerador matemático preservado.
- `src/main.tsx` inicia o workspace assíncrono; `src/home/main.tsx` é a entrada
  separada da homepage. Engine em `src/engine/`, comandos em `src/commands/`,
  React Flow em `src/components/Flow.tsx` e estado central em `src/store.ts`.

### Como retomar o desenvolvimento no notebook

1. Entregar/abrir este documento. Conferir `git status`, `git log -3 --oneline`
   e `git remote -v`. Com a árvore limpa, `git pull --ff-only` deve trazer a base
   sincronizada; não sobrescrever trabalho local para forçar a atualização.
2. Confirmar que a base contém `ac758f9` e a consolidação posterior descrita
   no resumo acima. Consultar `git log -3` e atualizar a branch pelo remoto.
3. Usar as dependências do lockfile. No Windows, preferir `npm.cmd` se a política
   do PowerShell bloquear `npm.ps1`. Iniciar com `npm.cmd run dev`.
4. Abrir `http://localhost:5173/` ou `http://localhost:5173/app.html`. Vite mantém
   localhost:5173 com strictPort. Se houver EACCES/reserva do Windows, investigar
   processo/faixa excluída; não alterar WinNAT/WSL/Hyper-V sem autorização.
5. Git não transfere localStorage, IndexedDB ou projetos pessoais. Para trabalhar
   na mesma topologia, exportar/importar JSON separadamente. Localhost e Vercel,
   portas e perfis diferentes têm armazenamentos independentes.
6. Perguntar qual será a próxima tarefa. **Não há nova implementação pendente
   autorizada neste documento.** Não refazer tarefas antigas listadas abaixo.
7. Atualizar este mesmo arquivo ao registrar outra continuidade. Evitar copiar
   segredos, dados pessoais, projetos reais, dumps de browser ou logs extensos.

### Validação e cuidados

- Última validação completa antes dos commits: **2.608 testes, 134 arquivos**,
  TypeScript, build e `git diff --check` aprovados.
- Rechenpraxis: **140 verificações Chromium** aprovadas no perfil descartável;
  default Subnetzgrenzen, outras categorias, idiomas, respostas e F5 cobertos.
  As quatro projeções JSON estão sincronizadas; o catálogo interno continua
  ausente dos bundles públicos.
- Comando em série: `npm.cmd test -- --maxWorkers=1 --minWorkers=1`.
  Alguns testes abrem Chromium com perfil/banco/porta descartáveis e podem levar
  alguns minutos. Não usar o perfil real para testar migração ou recuperação.
- `npm.cmd run build` inclui `tsc --noEmit`; `npm.cmd run preview` serve o build.
  Resta apenas o aviso já conhecido de chunks acima de 500 kB.
- `node scripts/test-terminal-fonts.mjs`, após build, validou **109 cenários**:
  fontes, fallback, primeiro acesso, UI Theme, Canvas, F5, Save/Load e Reset.
  O harness precisa de Chromium instalado (ou `NETLAB_CHROMIUM_PATH`); não
  instalar browsers/dependências automaticamente.
- A revisão final excluiu capturas, vídeos, caches, perfis, dist, assets-tests,
  backups e dados locais dos commits. As oito fontes WOFF2 e quatro licenças
  são assets necessários e foram incluídos. Licença/copyright principal intactos.
- A codificação UTF-8 do relatório de branding foi corrigida. Ao editar textos
  com PowerShell antigo, evitar round-trips ANSI que corrompam acentos.

---

## Histórico — atualização de 30/10/2026 (superada pelo resumo acima)

## Atualização de 30/10/2026 — Rechenpraxis e Netzwerkdiagnose

- Rechenpraxis publicada: A Subnetting, B VLSM e E02 v1/v2. O feedback de alternativa incorreta destaca também a correta, preservando a escolha do aluno. O título mantém foco programático sem outline; controles interativos conservam seus indicadores. Ver [practice-e02-v2.md](practice-e02-v2.md).
- [Auditoria atual](educational-archetypes-audit.md): 32 drafts internos, seis exercícios de simulação publicados no Beta e cinco Labs legados. Para disponibilidade dos exercícios, esta auditoria substitui as contagens e descrições históricas abaixo.
- Netzwerkdiagnose continua **interno, sem interface ou novos menus**: [etapa 1](network-diagnosis-pilot.md), oito casos fixos; [etapa 2](network-diagnosis-generation.md), 12 receitas determinísticas ND02/ND05, dificuldades e 12 exemplos completos para revisão humana. Fontes/testes em src/exercises/diagnosis; auditoria offline em scripts/audit-diagnosis-generation.mjs.
- Validação do piloto: 917 testes direcionados, TypeScript, build e amostragem de 1.200 seeds. Testes de comparação documental aceitam LF/CRLF para continuidade entre computadores.
- Próxima decisão: revisar a qualidade dos 12 exemplos e dos níveis antes de ampliar receitas ou publicar conteúdo. E02 v1/v2, oito referências fixas, engine e dados salvos foram preservados.

## Histórico de implementação — decisões e entregas anteriores

- **Homepage oficial (29/10/2026):** `/` abre Packet Journey com DATA, cinco
  estações alternadas, movimento por estações e hero de 21,24 segundos.
  Homepage clássica e seletores de protótipos removidos; URLs experimentais
  antigas abrem a versão oficial. `/app.html`, projetos, Share Links e
  preferências do editor preservados. Homepage não abre IndexedDB nem engine.
  Graphite Dark local à homepage; idiomas DE/EN/PT-BR persistem separadamente.
  Checkpoint da promoção: `311e70c`. Consulte
  [homepage-packet-journey.md](homepage-packet-journey.md) e
  [homepage-i18n.md](homepage-i18n.md). Verifique `git status`/`git log` antes
  de presumir sincronização: os commits desta rodada não incluem push.

- **Markierungen implementado:** botão compacto na toolbar, seleção Shift, seis
  cores, intensidade, edição de membros por IDs e seleção por título. Extensões
  retangulares formam L/U/T por união SVG; modo temporário permite mover,
  redimensionar e remover extensões. A Hauptfläche também é redimensionável,
  mesmo sem extensões: offsets opcionais nas quatro bordas são aplicados sobre
  os limites automáticos dos membros. Geometria em coordenadas do mundo,
  independente do zoom; legendas mantêm sua compensação visual separada.
  Save/Load, JSON, F5, abas e Undo/Redo reutilizam os fluxos existentes, sem novo
  schema IndexedDB. Ver [area-markings.md](area-markings.md). Prints e logs ficam
  ignorados em `.playwright-mcp/`; não os incluir nos commits.

- **Fábrica interna de Netzwerk:** 20 novos drafts em `src/exercises/factory/`,
  separados dos cinco drafts anteriores e dos dois exercícios Beta publicados.
  São seis fundamentais, seis VLSM, quatro configurações e quatro diagnósticos.
  O gerador v1 tem cinco famílias determinísticas por seed/dificuldade/versão;
  150 variantes são conferidas por oráculo independente. Os oito práticos usam
  a engine real; unicidade/host válido em C02/C04 ainda exige revisão manual.
  Não há UI de respostas matemáticas nem publicação dos novos drafts. Soluções
  ficam fora do bundle público; `validate-network-factory.mjs --check-bundle`
  complementa a inspeção. Ver [arquitetura](network-exercise-factory.md) e
  [catálogo completo](network-exercise-catalog.md). Não reimplementar ou publicar
  automaticamente. Markierungen foi consolidado localmente em `b7bc871`; esta
  consolidação não inclui push. Conferir `git status -sb` antes de retomar em
  outro computador; commits locais só estarão disponíveis após sincronização.

- **Rodada de usabilidade concluída (`7abb278`):** Inspector mantém o CIDR visível
  e sincroniza a máscara; labels do canvas continuam sem `/x`. Routing tem checkbox
  de IP-Forwarding compartilhando o estado real com `sysctl`, persistência e Undo/Redo.
  Quick Ping prepara o terminal pela fila existente: descarta entrada parcial e limpa
  a tela visível quando livre, preservando histórico e comandos ativos. Ctrl+C simples/
  duplo e cancelamento durante preparação foram testados. Free Panels preserva ordem
  de abertura e ordem manual sem reordenar painéis novos ao restaurar slots antigos.
  O cursor vira alvo azul ao selecionar Ping e verde-escuro (`#166534`) sobre destinos
  com IPv4 elegível; verde não é garantia de conectividade. Tudo já foi commitado/pushado.
  Não repetir esse pacote de implementação por causa de prompts antigos.

- **Übungen (Beta) implementado (`adee445`):** menu independente de Labs, com
  `fisi-office-warehouse-routing` e `fisi-service-portal`. Abre um rascunho separado,
  mostra enunciado/requisitos e verifica somente ao clicar em **Überprüfen**, usando
  a rede real da tentativa e os checks compartilhados. Conclusão só fica confirmada
  após commit da gravação CAS em `meta`, chave `exercises:beta:v1`, sem novo schema.
  F5/reinício e troca de planos preservam progresso; repetir mantém a conclusão anterior.
  Importações não geram conquistas. A associação é ao ID do rascunho original.
  Checks dos exercícios exigem `resolveBy: 'id'`: nomes editáveis/Unicode não alteram
  a identidade. Labs legados mantêm busca por nome. Trocas/edições durante um check
  invalidam callbacks antigos. As projeções `betaStudents.json`/`betaChecks.json` não
  incluem soluções; os outros três exercícios permanecem drafts internos.
  Ver [Beta](exercises-beta.md) e [autoria de drafts](exercise-drafts.md).

- **Inspector/Terminal sobrepostos:** o Inspector normal à direita mantém a
  altura útil abaixo do header e pode cobrir o dock. Clique ou foco real
  trazem o painel à frente; scroll e hover não alteram prioridade. Estado só no React,
  sem persistência. A faixa superior do dock à esquerda e o topo do Inspector
  permitem recuperar ambos. Layout de Packets mantém fallback existente.
  Não altera dimensões por foco nem o viewport. Ver [terminal-layout.md](terminal-layout.md).

- **Correções de Ping-Animation e Run:** fila visual com tentativa atual + uma
  pendente; Ctrl+C descarta ciclos não iniciados. Broadcast ARP mostra filhos
  simultaneamente nos links reais, preservando VLAN e causalidade. Run falhava
  quando xterm era criado antes dos callbacks do store; sessões existentes agora
  incorporam esses callbacks. Pause manual é preservado e mostra dica de Run.
  Ver [packet-animation.md](packet-animation.md). Sem mudança de intervalos,
  pacotes, Scheduler ou persistência.

- **Limpeza ARP:** Linux `ip neigh show`, `ip neigh flush all` e `ip neigh flush
  dev eth0`; Windows `arp -a`, `arp -d *` e `arp -d IP`. Botão **ARP-Cache leeren**
  nas tabelas ARP do Inspector. Todos usam `IpDevice.clearArpCache`, sem alterar
  configuração, persistência ou tempo da simulação. Argumentos desconhecidos
  não viram mais consulta silenciosa. Ver [arp-cache.md](arp-cache.md).

- **Edição interativa do terminal:** editor compartilhado Linux/Windows com
  Left/Right, Home/End, Backspace/Delete, inserção no cursor e histórico que
  preserva o rascunho. Reutiliza a fila do xterm; não altera parser, Run/Pause
  ou persistência. Ver [terminal-line-editing.md](terminal-line-editing.md).

- **DHCP global no Router:** Inspector → Dienste contém o controle global,
  independente dos flags dos pools. CLI Linux: `systemctl start|stop|status
  kea-dhcp4-server`, somente DHCPv4 Server, sem Relay/Cisco IOS. O campo opcional
  `dhcpServerEnabled` mantém compatibilidade v1 e é restaurado com a sessão.
  Ver [global-dhcp.md](global-dhcp.md). Terminal nos equipamentos usa fundo preto
  e símbolo branco, mantendo o círculo atual; ping/animações não mudaram nesta etapa.

- **Fase 5B2-B concluída**, commit `c7ffdd3`, sobre `433f264` (5B2-A).
  Boot normal assíncrono, planos/rascunhos, restauração pausada, migração legada
  somente leitura e recuperação estão integrados. Ver [application-boot.md](application-boot.md).
  Nenhum dado real foi usado nos testes automatizados. A etapa inclui fechamento
  imediato de rascunhos vazios sem alterações e origem fixa `localhost:5173`.
  Antes de continuar em outro PC, sincronizar `main` e conferir `git status`/`git log`.
  Git não transfere os dados do navegador. Ver também o diagnóstico de WinNAT em
  [application-boot.md](application-boot.md).
- Contratos atuais: [segurança](persistence-safety.md), [repositório](project-repository.md),
  [migração](legacy-migration.md), [rascunhos](workspace-drafts.md),
  [controller](session-controller.md) e [interface 5B2-A](workspace-ui.md).
- **Viewport corrigido:** `WorkspaceViewport` só enquadra uma vez por ativação
  de documento. Inspector, Palette, terminal, browser zoom e resize não alteram
  `getViewport()`. Fit View manual continua funcionando. Não reintroduzir fit
  em efeitos de largura/altura nem um segundo controlador de zoom.
- **Pacotes corrigidos:** Live respeita `parentTransferId`,
  `echoRequestTransferId` e `arpRequestTransferId`; Guided inclui ARP e ICMP.
  Os metadados de causalidade são observação separada, não payload de protocolo.
- **Controles definitivos e Quick Ping:** Terminal/Ping nos cantos superiores,
  botões redondos de 28 px; alternativas A/B removidas. Quick Ping usa o shell
  existente (Linux `-c 4`, Windows `-n 4`), escolha simples de IPv4 e cancelamento.
  A barra inferior temporária Ping-Animation contém o único slider 0,5×/1×/2×,
  mostra uma bolinha por vez e fecha 3 segundos após o fim visual/comando.
  Packets preserva botão/dropdown e captura/inspeção, sem modos ou replay na UX.
  APIs didáticas anteriores seguem internas; Scheduler fixo em 1×.
  Causalidade ARP/ICMP, Run de ativação e Pause manual preservados.
- **Comandos após restauração:** `pauseReason` diferencia pausa de ativação e
  pausa manual. Comandos ativos marcados `needsScheduler` (ping, DHCP etc.)
  liberam somente a primeira, por uma política central em store/terminals.
  Pause manual é respeitado, inclusive entre planos; Step/Replay não ligam Run.
  Abrir plano/terminal não inicia tráfego. O marcador não é persistido.
- **Legibilidade concluída:** nomes 14 px; IPv4/estados 13 px; interfaces 11 px;
  compensação compartilhada `clamp(1, zoom ** -0.9, 1.85)` em `DeviceLabels`.
  Formulários importantes usam 13/14 px. Sprites, hitboxes, Handles e anchors
  mantidos; xterm mantém a preferência própria de 14 px. Não escalar o sprite
  para resolver texto nem remover o espaçador que preserva métricas de layout.
- **Auditoria eth2/eth3:** reproduzido cabo AP em eth2 sem IP e eth3 desconectada
  com IP; documento/motor/Inspector concordaram. Canvas lista IPv4 configurados;
  cor depende do link da interface. Não houve reindexação em migração/Save/Load/F5.
  Não reparar automaticamente a topologia real nem atribuir causa sem snapshot.
- **Leases:** último IPv4 DHCP/gateway/DNS pode continuar salvo; leases, caches,
  negociações e eventos antigos não são restaurados. Não há expiração/renovação
  automática real de leases, apesar do texto Linux `renewal in 43200 seconds`.
- Testes direcionados, TypeScript, build e revisões Chromium passaram. Os
  resultados da suíte pré-commit estão na seção 6. Nenhum perfil/dado real foi
  usado. O build mantém aviso de chunk acima de 500 kB, sem falha.
- No notebook, atualizar `main` sem sobrescrever trabalho local e executar
  `npm ci`. Não executar `npm audit fix --force` ou upgrades majors automaticamente.
- Git transfere código/documentação, **não** IndexedDB/localStorage ou screenshots
  locais. Exportar/copiar separadamente qualquer topologia real necessária.

Referências recentes: [pacotes](packet-animation.md),
[viewport](workspace-ui.md), [legibilidade](device-legibility.md),
[auditoria DHCP e Run](interface-dhcp-audit.md),
[ações definitivas, Quick Ping e modos](device-actions-and-presentation.md),
[Übungen Beta](exercises-beta.md) e [drafts independentes](exercise-drafts.md).

## 1. Visão geral e mapa do projeto

O NetLab-FiSI é um simulador didático de redes executado no navegador, sem backend
necessário para a simulação. Permite montar topologias, configurar dispositivos,
executar um subconjunto de comandos reais e observar o tráfego simulado.
Não executa kernels Linux, Windows, Android ou iOS reais.

Tecnologias: React 18, TypeScript, Vite 5, Zustand 5, React Flow 12 (`@xyflow/react`),
xterm.js com FitAddon, Vitest 2, CSS Custom Properties, tsParticles para efeitos
visuais, `lz-string` para links compartilháveis e `fflate` para exportações ZIP.
Consultar `package.json` e `package-lock.json` antes de atualizar versões.

| Área | Arquivos e responsabilidades principais |
| --- | --- |
| Entradas | `index.html`: landing page; `app.html`: aplicação; `src/main.tsx`: estilos, tema, boot e montagem React |
| Layout | `src/App.tsx`, `src/styles.css`: toolbar, Palette, canvas, Inspector, Packet Inspector e dock inferior |
| Estado/coordenador | `src/store.ts`: ações da UI, integração com motor, histórico, persistência, sessões e Labs |
| Motor compartilhado | `src/sim.ts`: referência mutável única `sim.net`, usada pelo store, terminais e componentes |
| Rede | `src/engine/network.ts`, `device.ts`, `factory.ts`, `types.ts`: dispositivos, interfaces, links e transmissões |
| Tempo | `src/engine/scheduler.ts`: fila determinística de eventos em milissegundos virtuais |
| Protocolos | `src/engine/ipdevice.ts`, `ip.ts`, `ipv4Config.ts`, `switch.ts`, `dhcpPools.ts`, `firewall.ts`, `conntrack.ts` |
| Serialização | `src/engine/serialize.ts`: configuração dos dispositivos, posições, interfaces e links |
| Canvas | `src/components/Flow.tsx`, `DeviceNode.tsx`, `FloatingEdge.tsx`, `DeviceArtwork.tsx` |
| Cabos/pacotes | `src/cableGeometry.ts`, `deviceArtwork.ts`, `components/PacketLayer.tsx`, `packetAnimation.ts`, `packetCapture.ts`, `guidedPacket.ts` |
| Gerenciamento de cabos | `src/cableAppearance.ts`, `cableInteraction.ts`, `deviceColors.ts`, `components/CableManager.tsx` |
| Alinhamento | `src/alignmentGuides.ts`, `alignmentPreferences.ts`, `components/useSmartAlignment.ts`, `AlignmentGuides.tsx` |
| Inspectors | `src/components/Inspector.tsx` e componentes compartilhados: `InterfaceConnection`, `InterfaceIpv4Panel`, `DhcpPoolsPanel`, `DiagnosticTables`, `HostWireless` |
| Terminais | `src/terminals.ts`, `commands/shell.ts`, `terminalPanels.ts`, `terminalPanelPreferences.ts`, `terminalTabPreferences.ts` e componentes `Terminal*` |
| Temas/visual | `src/uiTheme.ts`, `themes.css`, `buttons.css`, `canvasBackground.ts`, `backgroundParticles.ts` |
| Histórico | `src/topologyHistory.ts`, `topologyEdits.ts`, `topologyShortcuts.ts`, integrados pelo store |
| Ensino/exportação | `src/labs/`, `components/LabPanel.tsx`, `src/export/` |
| Assets ativos | `public/assets/devices/` e `public/assets/backgrounds/` |

### Ambiente e comandos

A CI usa **Node 22** e `npm ci`. Não existe requisito `engines` em `package.json`;
Node 22 é a referência verificada no workflow, não uma exigência inferida de `@types/node`.
O `.npmrc` contém `bin-links=false`; os scripts chamam as ferramentas via `node`
diretamente para funcionar também em volumes sem suporte a symlinks.

| Comando | Finalidade |
| --- | --- |
| `npm ci` | Instalar exatamente as dependências do lockfile no notebook |
| `npm run dev` | Servidor Vite; abrir `/app.html` na URL/porta informada |
| `npm test` | Executar todos os testes Vitest |
| `npm run test:watch` | Testes em modo watch |
| `node node_modules/typescript/bin/tsc --noEmit` | Verificar TypeScript sem build |
| `npm run build` | TypeScript e build Vite das duas entradas; executar quando necessário/autorizado |
| `npm run preview` | Servir um build já existente |
| `git diff --check` | Verificar problemas de whitespace nas alterações rastreadas |

## 2. Funcionalidades implementadas

### Dispositivos, interfaces e Wi-Fi

Os tipos reais estão em `DeviceKind` e são criados por `createDevice`.

| Tipo | Interfaces/comportamento atual |
| --- | --- |
| Host | `eth0`; perfil Linux ou Windows para apresentação/comandos; pode adicionar `wlan0` pela UI |
| Notebook | Reutiliza Host; `eth0` e `wlan0`, com configurações IPv4 independentes e perfil Linux/Windows |
| Smartphone | Somente `wlan0`; configuração e diagnósticos pela UI; sem terminal xterm |
| Switch | 8 portas Ethernet por padrão; capacidade real ajustável de 1 a 24, nomes `eth0`…`eth23` |
| Router | 4 interfaces Ethernet; IP forwarding habilitado inicialmente |
| Firewall dedicado | 4 interfaces Ethernet e forwarding; chains input/forward/output predeclaradas com política ACCEPT inicial |
| Server | 1 interface Ethernet; mesma base IP e serviços compartilhados |
| Wi-Fi AP | Bridge L2; 8 interfaces Ethernet por padrão e interfaces wireless virtuais criadas por associação |

- Adicionar portas ao Switch não recria interfaces existentes nem muda seus MACs.
  A redução remove somente a última porta, após verificar cabo, VLAN, estado
  administrativo e outras configurações relevantes. Não desconectar silenciosamente.
- `NetInterface` separa `medium`, estado administrativo, endereço, modo IPv4,
  gateway, DNS e referência ao link. Estado administrativo e link operacional são conceitos diferentes.
- A associação Wi-Fi é funcional: busca APs da topologia, verifica SSID/alcance,
  cria `Link` wireless e encaminha tráfego pela bridge. Não ocupa uma RJ45 do AP.
- Nesta versão, clientes **não podem manter links Ethernet e WLAN simultâneos**;
  é necessário desconectar o link existente antes da troca. As configurações
  das interfaces permanecem independentes. Não habilitar dual-homing sem estudar rotas, ARP e DNS.
- Alcance do AP: 50–500 m, padrão 250, com escala didática de `180 / 250`
  unidades do canvas por metro em `wirelessRange.ts`. Pan/zoom não alteram o alcance.
  Não é um modelo físico de rádio.
- SSID incompatível, distância e estados administrativos afetam `Link.operational`.
  A associação existente pode continuar representada como inativa e voltar a operar
  quando as condições melhorarem. A linha inativa fica tracejada/apagada e não transmite pacotes.
- Cobertura visual: `Auto`, `Always`, `Hidden`; acompanha os APs e não intercepta cliques.
  Não confundir `wifiCenter`, usado no alcance funcional, com as âncoras ópticas de alinhamento.

### Protocolos e serviços

- ARP, IPv4, ICMP/ping/traceroute, TTL, erros de encaminhamento e tabelas de rotas.
  Rotas Connected, Static e RIP compartilham a infraestrutura IP; seleção considera prefixos.
- Switch e AP fazem aprendizado/forwarding MAC com isolamento por VLAN de acesso.
  Entradas dinâmicas expiram após **300 segundos simulados**, com reaprendizado
  atualizando o instante. Limpezas de portas/conexões usam a arquitetura existente.
  MAC learning é estado temporário, não configuração persistente.
- Router/Firewall oferecem forwarding e RIP. Firewall possui modelo compartilhado
  para comandos `nft` e `iptables`, políticas/veredictos, conntrack, logs e NAT
  implementado, incluindo masquerade/SNAT/DNAT. É um subconjunto didático, não nftables completo.
- TCP/UDP simplificados, teste de portas e listeners (`nc`, `ss`), DNS A e HTTP
  simulados; serviços atravessam os mesmos links e podem ser filtrados pelo firewall.
- **DHCP por interface está implementado**, inclusive através de Switch/AP:
  pools independentes, gateway/DNS distribuídos, validação de sub-rede e conflitos,
  ativação individual e visualização de leases. Não existe DHCP Relay automático.
- `IpDevice.dhcpPools` guarda os pools; `dhcpServer` ainda existe para compatibilidade
  legada. `legacyPoolInterface`, `dhcpConfiguration` e `applyDhcpConfiguration`
  coordenam isso. Não remover o estado legado apenas porque não há toggle global redundante na UI.
- Configurações dos pools são serializadas; mapas de leases, ARP, conntrack,
  eventos pendentes e tabelas aprendidas não são restaurados como snapshots de execução.

### Simulação, terminais e Inspector

- Scheduler usa tempo virtual. O store avança o motor conforme Pause/Run e
  velocidade; timers do navegador coordenam a UI, não devem substituir relógios
  virtuais em aging ou protocolos.
- Relógio e apresentação dos pacotes são tecnicamente independentes, mas a UI
  agora expõe apenas Live/Schrittmodus e Run/Pause, com os ritmos fixos acima.
  Pausa de reprodução, Step e Replay não equivalem ao Pause do motor.
- Packet Inspector apresenta observações do tráfego; a animação deve seguir os
  links e a geometria compartilhada, nunca escolher destinos por proximidade visual.
- Terminais pertencem a Host, Notebook, Server, Router e Firewall; Switch, AP e
  Smartphone não recebem xterm. `getSession` preserva uma sessão por dispositivo.
  Comandos incluem `ip`, `arp`, `ping`, `traceroute`, `sysctl`, `nft`, `iptables`,
  `conntrack`, `ss`, `nc`, `dhclient`, `dig`, `curl`, `hostname`, além do adaptador Windows.
  Consultar `help`/parsers; não presumir suporte a qualquer comando do sistema real.
- Dock: redimensionamento vertical, recolhimento pela barra, abas, atalhos,
  movimentação de abas/painéis e modos **Free panels / Group by type**.
- **Distribuição automática dos terminais já concluída:** até cinco colunas;
  mudanças no número de colunas equalizam somente os painéis desbloqueados.
  A partir do sexto terminal, Free panels usa abas na última coluna; Group by type
  mantém abas no grupo correspondente. Nenhuma sessão é encerrada por esse limite.
- Cadeados são individuais e preservam pixels contra redistribuição automática.
  Redimensionar explicitamente um divisor continua permitido, inclusive junto
  a painel bloqueado, mantendo a semântica anterior.
- Mínimo de 220 px por coluna; falta de espaço gera rolagem horizontal **dentro
  dos terminais**. `Gleichmäßig verteilen` fica em Terminal Settings → Layout.
  Altura total do dock não muda por causa dessa ação.
- FitAddon é acionado pela infraestrutura `ResizeObserver` + coalescência por
  animation frame. Não recriar xterm para redimensionar/reagrupar. Abas ocultas
  reajustam dimensões ao reaparecer.
- Inspector: abas por tipo, formulários IPv4 compartilhados, expansão de interfaces,
  tabelas e configurações existentes. Rascunhos não devem desaparecer ao trocar abas.
  Largura ajustável entre 290 e 470 px, com preferência persistente.
- O input IPv4 do Inspector mantém `endereço/prefixo` visível; CIDR e máscara
  sincronizam nos dois sentidos. Dados do motor continuam com prefixo. Labels do canvas mostram IPv4
  sem sufixo, podem empilhar interfaces e distinguem configuração armazenada de link ativo.

### Cabos, âncoras e apresentação

- React Flow trabalha com posições em coordenadas do canvas e zoom entre 25%
  e 250%; o fit inicial limita-se a 125%. Não remonte o canvas ao mudar painéis
  nem converta coordenadas persistidas em pixels da viewport. Mudanças nos
  painéis não reenquadram; adicionar o primeiro node num plano vazio também não.
- Straight e Hybrid usam `cableGeometry.ts` tanto nos edges quanto no PacketLayer.
  Preservar oclusão atrás dos PNGs, segmentos frontais RJ45 e pontos de pacote.
- Os quatro Handles são pontos visuais de arraste, **não quatro portas físicas**.
  O Switch desenha 16 RJ45, mas mantém até 24 interfaces lógicas; slots visuais
  são distribuídos por conexão, não uma equivalência fixa com `ethX`.
  LEDs dinâmicos acompanham os slots mapeados; conexões extras usam fallback visual.
- Hover/seleção de cabos destacam trajeto, endpoints e interfaces correspondentes.
  Menu de contexto permite cores, remoção e reencaixe.
- Cores são metadados de apresentação em `ui.cableColors`, com modo auto/manual;
  **não são VLANs, sub-redes ou estado operacional**. `deviceColors.ts` centraliza
  a paleta de categorias; não confundir com cores personalizadas dos terminais.
- Cor automática usa identidade do vizinho e evita colisões em links incidentes
  a Router/Firewall. Não recolore toda a topologia continuamente. Cores manuais
  são preservadas; Auto recalcula explicitamente. JSON/Share Link preservam os metadados.
- Links antigos sem metadados usam a projeção somente leitura
  `resolvedCableAppearances` / `useCableAppearances`, compartilhada entre cabos,
  pontas RJ45, labels e Inspector. Não reescrever documentos/baselines para
  corrigir cor ausente. Switch→Router prioriza a cor do Switch quando disponível.
- Reencaixe escolhe a extremidade pela posição clicada no trajeto e usa a primeira
  interface Ethernet compatível disponível no destino. Voltar à interface original
  é permitido como restauração sem alteração. Preview/Esc não desligam o link real.
  O commit valida e reaproveita objeto/ID/latência, limpando apenas estados afetados.
  Wireless é reassociado pelas configurações WLAN, não pelo reencaixe Ethernet.
- Undo/Redo inclui cores e reencaixe. Não restaurar artificialmente caches ARP/MAC
  ou pacotes antigos ao reexecutar operações de configuração.
- Alinhamento horizontal usa `getVisualAlignmentPoint`: Router, Firewall, AP,
  Notebook e Smartphone reutilizam os anchors atuais dos cabos; PC/Server usam
  faixas ópticas no artwork (75%/66,5% da altura, mais 6 px de inset).
  **Switch mantém seu centro como caso especial; eixo vertical continua pelo centro geométrico.**
- Tolerância de 8 px visuais corrigida por zoom, no máximo uma guia por eixo,
  somente durante drag; Alt ignora snap. Multi-select recebe uma translação comum.
  `Ausrichtungshilfen` liga/desliga guias e snap; preferência independente do background.

### Temas, backgrounds e navegação

- Separar **UI Theme**, **Canvas Background** e **Layout**. Nenhum deve trocar
  configurações da rede ou remontar React Flow.
- Temas: Original (**padrão**), Graphite Dark (preferência visual atual do usuário),
  Deep Teal, Classic Light e Slate Gray. Midnight Blue foi retirado; ID antigo
  resolve para Original. Registro em `uiTheme.ts`, tokens em `themes.css`,
  dimensões/layout em `styles.css`, botões compartilhados em `buttons.css`.
- Interface cards usam **B / Graphite Accent** como base; comparação A temporária
  por `?interfaceCards=elevated`. A cor da barra de estado continua verde/âmbar/cinza,
  separada da identidade do vizinho e da cor do cabo.
- Console xterm mantém aparência/configuração próprias; chrome/abas respeitam
  a cor de terminal existente. Não aplicar filtros de brilho no console ou nos PNGs inteiros.
- Backgrounds atuais: Original, Verde 1, Verde 2, Cyan Circuit, Blue Circuit,
  Slate Circuit, Carbon Circuit, Titanium Circuit, Graphite Clean e Azure Circuit.
  Registro em `canvasBackground.ts`; imagens fixas à janela, cover, intensidade
  e pontos configuráveis. URL `?background=<id>` continua disponível para comparação.
- Animações opcionais: Off (padrão), Emerald Dust, Fireflies, Teal Drift e
  Shooting Star; respeitam movimento reduzido/visibilidade. tsParticles limitado
  a 30 FPS; o cometa tem camada própria. São efeitos de fundo, não pacotes de rede.
- Toolbar: Datei, Labs, Einstellungen e Hilfe; Undo/Redo, Run/Pause
  e Packets à direita; Menü compacto abaixo de 1100 px. Export possui submenu.
- Palette: Geräte/Werkzeuge, duas colunas e categorias recolhíveis; Werkzeuge
  ainda é um espaço reservado. A faixa inteira recolhida pode reabrir o catálogo.
  Minimap é oculto inicialmente e tem controle próprio.

### Persistência e exportações

- Boot normal: `WorkspaceApplication` abre IndexedDB/Session Controller e
  recupera planos, ordem/foco e rascunhos, com uma única simulação ativa pausada.
  Draft autosave tem debounce de 500 ms; Save manual e Save As são operações
  separadas. JSON, Labs, exemplos e Share Links abrem rascunhos independentes.
- `netsim:autosave:v1` é a fonte legada protegida, migrada idempotentemente.
  Não apagar/sobrescrever essa chave. Falhas/incompatibilidades oferecem
  recuperação/exportação, não substituição silenciosa por demo. `boot()` legado
  ainda existe para compatibilidade/testes; não religar seus listeners junto ao controller.
- Formato base continua `app: 'netsim', version: 1`; identificadores antigos
  são compatibilidade, não motivo para renomear tudo ao atualizar a marca.
- JSON salva dispositivos, interfaces/MACs, IPv4, links, posições, regras,
  serviços, SSID/alcance/VLANs e estado de Lab, mais metadados UI aplicáveis.
  Switch é reconstruído com a capacidade correta **antes** de restaurar links.
  `ifaces: []` é o atalho legado específico para oito portas; layouts inválidos
  continuam sendo rejeitados, sem fallback genérico.
- Share Link usa JSON comprimido no hash `#t=`. Também existem ZIP de configs,
  Containerlab, Compose, SVG/PNG e relatório HTML. Diagramas/configs exportados
  não reproduzem necessariamente todos os detalhes cosméticos do canvas.
- Tema, background, layout do Inspector/Packet Inspector/Palette, cobertura,
  guias e preferências de painéis/abas têm suas próprias chaves locais.
  Não assumir que todas as preferências visuais acompanham o JSON de topologia.
- F5/importação recriam o motor; não preservam sessões xterm abertas, buffers,
  comandos em execução, histórico Undo/Redo nem captura de pacotes em memória.
  Preferências de apresentação das sessões permanecem conforme seus módulos.

## 3. Decisões de arquitetura e UX a preservar

1. Manter protocolos no motor, apresentação nos componentes/helpers e operações
   transacionais no store. Usar factory/serialização/histórico existentes.
2. Não duplicar DHCP, DNS, ARP ou o modelo de links para novos dispositivos.
3. Não mudar IDs, MACs, interfaces e links para resolver apenas um problema visual.
4. Não criar uma segunda geometria de cabos: FloatingEdge, PacketLayer e segmentos
   frontais precisam concordar. PNGs originais devem permanecer intactos.
5. Preservar estado durante preview, menus e drag; só confirmar alterações de rede
   após validação. Escape deve cancelar sem efeitos permanentes.
6. Layout compacto, contraste/foco acessíveis, sinais textuais de estado, cores
   semânticas separadas. Graphite Dark é o alvo favorito, mas Original/Classic Light
   também precisam continuar utilizáveis.
7. Preservar divisores por mouse/teclado e rolagem interna. Não mascarar problemas
   estruturais com `overflow: hidden` global, alturas arbitrárias ou `!important`.
8. Preferências e topologia são coisas diferentes; não misturar undo da rede com
   opções visuais nem usar relógio real para o motor.

Documentos complementares: [cabos](cable-management.md),
[alinhamento](alignment-guides.md), [terminais](terminal-layout.md),
[temas](ui-themes.md), [Visual Review](visual-review.md).
A documentação de entrada usa NetLab-FiSI; ADRs e auditorias preservam referências históricas a NetSim;
conferir sempre o código atual antes de tratá-los como inventário definitivo.

## 4. Histórico do Git e transferência entre computadores

- Branch inspecionado: **`main`**. Remoto: `origin`, repositório `FelipeDDD/NetLab-FiSI`.
- Último commit de aplicação sincronizado: **`7abb278`** —
  `fix: refine inspector, quick ping and terminal panel behavior`.
- **`adee445`** — `feat: add beta exercises with persistent progress and stable device identity`.
- **`bdd2133`** — `feat: consolidate UI, terminal and network improvements`.
- **`46b897f`** — `feat: refine packet presentation, viewport and device actions`:
  causalidade ARP/ICMP, Live/Schrittmodus, viewport, legibilidade, Run por comandos,
  auditoria DHCP, variantes A/B e regressões. As variantes A/B foram removidas depois;
  os controles definitivos e o Quick Ping já estão integrados.
- **`c7ffdd3`** — Save/Load, recuperação segura e ativação normal do workspace.
- `433f264` integra as Fases 1–5B2-A; `13460d1` contém temas, cabos e terminais.
- Anteriores relevantes: `9c7e315` (toolbar/Palette e restauração do Switch),
  `047a315` (assets, clientes Wi-Fi e DHCP por interface), `e42cd95` (MAC aging),
  `99eba26` (Hybrid/interatividade de links).
- A versão canônica em `docs/CONTEXTO_CONTINUIDADE.md` acompanha o código no Git;
  o arquivo da raiz aponta para esta versão.
- Auditoria da consolidação recente: em `public/assets` entraram somente os dois
  SVGs de cursor em `cursors/`. Nenhuma alteração em PNGs dos equipamentos,
  `docs/img`, dependências ou lockfile. Fontes, testes, fixtures sintéticas,
  runners e documentação foram incluídos; prints, logs, bancos, backups,
  topologias reais e arquivos de autenticação ficaram fora.
  `docs/img/screenshot.jpg` já era documentação rastreada e referenciada, não um descarte.
- `.gitignore` exclui `.playwright-mcp/`, `assets-tests/`, `node_modules/`, `dist/`,
  `samples/`, coverage/resultados de testes, logs/scratch e `.env` locais.
  Não remover originais de capturas sem autorização nem adicionar pastas inteiras indiscriminadamente.
- O Git **não transfere IndexedDB nem localStorage**. Antes de sair deste computador, exportar
  a topologia de trabalho pelo aplicativo como JSON e copiá-la separadamente.
  No notebook, importar esse JSON e escolher novamente tema/background/layout se necessário.
  Porta/origem do servidor também define qual localStorage o navegador utiliza.
- Prints estão só no computador que os gerou. O gerador reutilizável foi
  commitado, mas o exemplo depende de capturas locais; não é um pacote de imagens.
  Instalações, processos de servidor e sessões de terminal não viajam pelo Git.

## 5. Próximas tarefas — não reimplementar o que já existe

### Estado consolidado — aguardar uma nova tarefa do usuário

- Não há escolha A/B pendente. Terminal/Ping têm posição definitiva e Quick Ping
  funciona pelo shell real; cursor e feedback de pressão também estão implementados.
- O pacote CIDR/forwarding/Quick Ping/Free Panels já foi concluído e sincronizado.
  Corrigir somente regressões reproduzidas, sem reimplementar esses recursos.
- Limpeza ARP já existe no CLI e no Inspector; consultar `docs/arp-cache.md`.
- Não criar outro motor de ping nem iniciar Run ao simplesmente abrir planos/menus.
  Pause manual, captura, animações e mecanismos didáticos internos devem ser preservados.
- Übungen Beta já permite abrir, resolver, verificar e persistir conclusão dos dois
  exercícios publicados. Não misturar esse catálogo com os cinco Labs nem expor
  soluções de referência ao aluno. Próximos exercícios dependem de autorização/revisão.

### Terminais: já implementados, somente verificar regressões quando pertinente

**Distribuição automática e até cinco painéis existem desde `13460d1`.**
Não iniciar uma segunda implementação. Para mudanças na área, conferir:

- Abrir 1, 2, 3, 4 e 5 colunas; fechar colunas e conferir divisão igualitária.
- Redimensionar manualmente; abrir novas colunas com um, vários ou todos os
  cadeados ativos e confirmar a preservação das larguras bloqueadas.
- Abrir sexto terminal, alternar abas, manter input/histórico/comandos e testar
  separar uma aba quando houver espaço para outra coluna.
- Conferir mínimo de 220 px, rolagem interna em 700 px, layout em 1440 px,
  `Gleichmäßig verteilen`, Free/Group by type e retorno de preferências locais.
- Ajustar somente problemas reproduzidos; não trocar a semântica dos cadeados,
  recriar sessões ou redimensionar o dock inteiro para equalizar as colunas.

### Planejamento futuro — ainda não implementado

- Gerenciamento avançado de planos, pastas, lixeira, histórico ampliado e outras
  melhorias de organização. **Abas de planos, IndexedDB, drafts, Save/Save As/Load,
  migração e recuperação já estão implementados.** Não confundir isso com abas xterm.
- Expandir o catálogo independente de Übungen; os drafts IPv4, DHCP e firewall
  ainda exigem revisão humana em alguns critérios. Backend, geração por API de IA,
  publicação automática e um histórico genérico de tentativas não estão implementados.
- Possível integração com DAAproject: planejamento, sem integração encontrada no código atual.

O controller mantém somente uma `sim.net` ativa, usando documentos preparados,
fronteiras de ativação e proteção de formulários/escritas pendentes. Não abrir
simulações paralelas nem contornar o controller para trocar planos.

## 6. Testes e limitações atuais

Validação histórica da consolidação de **28/10/2026**: **516 testes direcionados
em 20 arquivos**, **109 casos do harness Chromium** (incluindo os seis cenários de
usabilidade), TypeScript, build e `git diff --check` passaram. O harness usa perfil,
porta e IndexedDB descartáveis. A regressão anterior de Übungen também passou com
F5, reinício completo, nomes Unicode, homônimos, exclusão e preservação de conclusões.
Não interpretar os 516 como uma execução da suíte completa.

Referência histórica de suíte completa em **27/10/2026**: **1.185 testes em 88 arquivos**
(`vitest run --maxWorkers=2 --minWorkers=1`). TypeScript, build Vite e
`git diff --check` também passaram. O build avisa sobre chunk grande; não falha.
Isso não é uma execução da CI remota nem validação das ferramentas reais abaixo.
`.github/workflows/ci.yml` define testes, build e validação de configs exportadas
com ferramentas reais; uma execução Vitest local não equivale a essa validação externa.

Verificações direcionadas úteis:

```powershell
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vitest/vitest.mjs run src/terminalPanels.test.ts src/terminals.test.ts src/terminalTabPreferences.test.ts src/components/terminalDockLayout.test.ts
node node_modules/vitest/vitest.mjs run src/alignmentGuides.test.ts src/alignmentPreferences.test.ts src/cableEditing.test.ts src/engine/cableReconnect.test.ts
node node_modules/vitest/vitest.mjs run src/engine/dhcpPools.test.ts src/engine/dhcpRoutingTrace.test.ts src/engine/wirelessRange.test.ts src/engine/mobileClients.test.ts
node node_modules/vitest/vitest.mjs run src/engine/switchCapacity.test.ts src/engine/switchRestore.test.ts src/labs/labs.test.ts src/labs/persistence.test.ts
node node_modules/vitest/vitest.mjs run src/exercises/ src/labs/checkerIdentity.test.ts
node scripts/validate-exercise-drafts.mjs
node scripts/test-exercise-beta.mjs
node scripts/test-usability-refinements.mjs
git diff --check
```

Outros testes relevantes: `cableGeometry`, `deviceArtwork`, `guidedPacket`,
`packetAnimation`, `packetCapture`, `engine/macAging`, `Inspector`, `uiTheme`,
`topologyEdits` e `terminalShortcuts`. Usar `npm test` para validação ampla quando
necessário; não executar build/suíte inteira automaticamente em toda pequena alteração.

Runners Chromium adicionais, com perfil/IndexedDB descartáveis e sem novas dependências:

```powershell
node scripts/test-viewport.mjs
node scripts/test-interface-audit.mjs
node scripts/test-device-actions.mjs
# Nova comparação de legibilidade: capturar baseline ANTES de editar:
node scripts/test-legibility.mjs before
# Depois da alteração visual da próxima rodada:
node scripts/test-legibility.mjs after
```

O último exige baseline local em `.playwright-mcp/reviews/raw/legibility-before/`;
o Git não fornece essas imagens/medições. Não executar `before` depois da mudança
e chamá-lo de registro histórico. Os outros runners geram os próprios fixtures.
`viewportProbe.browser.tsx` é sonda apenas de testes, injetada pelo Vite do harness;
não importar no boot normal. Ver também os documentos específicos citados no início.

Cuidados/limitações confirmados:

- Os dois testes antigos de aparência de terminal que comparavam `ui` inteiro
  foram corrigidos: autosave agora inclui `cableColors`; os testes verificam sua
  preservação no reset. Não retirar o campo para satisfazer expectativas antigas.
- Vitest roda em Node. Testes que importam store/xterm podem exigir mocks locais
  de `@xterm/xterm`/`@xterm/addon-fit`, como em `terminals.test.ts`; Settings puros
  usam mock do store. Não definir `self` globalmente para mascarar dependência de browser.
- Wi-Fi não simula WPA, autenticação, interferência ou intensidade de sinal.
  Notebook não opera Ethernet e WLAN simultaneamente nesta versão.
- Não há IPv6, VLAN trunk/802.1Q, stacking, módulos de hardware nem editor visual
  completo de regras de firewall. Não apresentar controles fictícios para isso.
- Apenas Switch tem capacidade configurável de 1–24 portas. Não generalizar a
  expansão para Router/Firewall/AP sem revisar factory, validação e serialização.
- Não assumir desempenho validado para 100–300 dispositivos. Renderização,
  animação, labels e tabelas grandes precisam de medição específica antes de otimizar.
- Autosave é best-effort e captura configuração, não um checkpoint completo do
  runtime. Exportar JSON é a forma prática de levar a rede para outro computador.

Revisão visual recente em Chromium: Graphite Dark/Classic Light, 700/1440 px,
3/4/5 terminais, sexto em aba, cadeados e comandos em andamento. Um ping real
simulado terminou com 5 respostas e 0% de perda durante ajustes de tamanho.
As capturas foram mantidas fora do Git, organizadas por `scripts/visual-review.mjs`:
raiz de `.playwright-mcp/reviews/` só com PNGs selecionados, demais em `raw/`/`archive/`.
Ao entregar prints, preferir link ao primeiro PNG para “Open in Explorer” abrir
a localização correta. Não gerar/apagar capturas antigas indiscriminadamente.

## 7. Como retomar o desenvolvimento

1. No notebook, abrir o repositório atualizado no VS Code e pedir ao Codex para
   ler `docs/CONTEXTO_CONTINUIDADE.md` e os módulos
   relacionados à tarefa escolhida; não depender do histórico do chat.
2. Conferir `git status --short`, `git branch --show-current`, `git remote -v`
   e `git log -5 --oneline`. Em uma árvore apropriada para atualização, usar
   `git fetch origin` e `git pull --ff-only`. Confirmar que o commit de refinamentos
   descrito na seção 4 chegou; não sobrescrever alterações locais/divergências.
3. Usar o Node da referência de CI, instalar com `npm ci` e iniciar `npm run dev`.
   Abrir **`http://localhost:5173/app.html`**. Vite usa `localhost`, 5173 e strictPort.
   Se houver EACCES/reserva WinNAT, diagnosticar sem trocar origem, limpar dados,
   mexer em reservas ou parar serviços sem autorização. `127.0.0.1` é outra origem.
4. Importar o JSON da topologia de trabalho exportado separadamente. Selecionar
   Graphite Dark e as preferências desejadas, pois o navegador pode começar com Original.
5. Consultar a nova tarefa do usuário e o estado consolidado da seção 5.
   Save/Load, distribuição dos terminais, viewport, Quick Ping e Übungen Beta já existem.
   Não transformar propostas em tarefas autorizadas sem instrução do usuário.
6. Fazer mudanças pequenas e reversíveis, preservar sessões/IDs e executar os
   testes direcionados e TypeScript. Usar Chromium para mudanças visuais; manter
   topologia, zoom e enquadramento iguais nas comparações.
7. Não instalar dependências, alterar assets, executar build ou fazer commit/push
   sem necessidade/autorização da tarefa. Inspecionar o diff e os arquivos a incluir
   antes de sincronizar. Não copiar tokens, credenciais, perfis de autenticação,
   `.env`, caches nem arquivos privados entre computadores por este documento.

O estado aqui é um ponto de partida verificável. Atualizar este arquivo quando
decisões ou funcionalidades mudarem, diferenciando sempre implementado de planejado.
