# Übungen (Beta) — etapa 2: piloto prático

## Publicação gradual

**Übungen (Beta)** contém os dois exercícios anteriores e **quatro novas projeções de aluno**, identificadas como *Praxis-Pilot · Beta*. Não publica integralmente a fábrica de 32 drafts. A prática matemática A/B/E02 da etapa 1 continua independente, em memória.

| Exercício / ID público v1 | Critérios automáticos | Edição permitida / alternativas |
|---|---|---|
| E06 · `pilot-e06-v1` | 2 endereços/máscaras, 2 decisões de rota local, 2 pings direcionais, estrutura | Nenhuma mudança de rede necessária: a configuração inicial já passa. Nomes e apresentação podem mudar. |
| E08 · `pilot-e08-v1` | 4 endereços/máscaras, forwarding do router, 2 decisões de next hop, 2 pings, estrutura | Rotas e gateway de Büro. Default, rota específica ou gateway do formulário IPv4 são aceitos quando a rota efetiva atende ao destino. |
| E09 · `pilot-e09-v1` | 4 endereços/máscaras, forwarding, 2 decisões de next hop, 2 pings, estrutura | Máscara de Büro conforme os segmentos do enunciado; endereço de host e demais valores permanecem. Ping que funciona através de uma hostroute com máscara errada não basta. |
| D02 · `pilot-d02-v1` | 6 endereços/máscaras, forwarding em West/Ost, 2 decisões de next hop, 2 pings, estrutura | Rotas estáticas em West/Ost. Rotas específicas e defaults funcionais são aceitos para a comunicação exigida entre Büro e Lager. Falta de retorno reprova. |

O resultado é **Technische Anforderungen erfüllt**. Não certifica domínio pedagógico ou todas as aplicações da rede. A explicação de ARP, decisão local/remota e diagnóstico do caminho é **discussão manual não pontuada**, explicitamente indicada no painel. Não existe botão que finja validar essa explicação.

## Uso

1. `Starten` cria outro rascunho/aba, sem substituir o projeto pessoal. Formulários não aplicados continuam bloqueando a troca pelo Session Controller.
2. Ler o enunciado alemão e editar normalmente pelo Inspector, terminais e demais ferramentas. Não há aplicação automática da solução.
3. `Lösung prüfen` protege o rascunho pendente e usa os verificadores reais. Mostra quatro grupos: endereçamento, rotas, conectividade e estrutura. `Prüfdetails` expande cada critério; não apresenta a referência de solução.
4. A verificação inicia Run e envia pacotes ICMP reais. Pause continua disponível; usar Run para prosseguir. `Prüfung abbrechen` cancela a avaliação, sem desfazer a configuração do aluno.
5. `Fortsetzen` retoma a aba existente. `Neuer Versuch`/`Erneut starten` abre outra tentativa e conserva a anterior; nunca reseta silenciosamente um rascunho modificado.

Navegação, estados e botões usam a i18n DE/EN/PT-BR; enunciados e feedback pedagógico permanecem em alemão. Ao abrir/retomar um exercício prático, a sobreposição da prática matemática é fechada sem apagar suas respostas em memória.

## Auditoria dos 15 cenários executáveis

Os números abaixo são os critérios **engine de origem**, antes da proteção estrutural e das rotas efetivas adicionadas pelo adaptador. Não representam cobertura completa de publicação.

| Fonte | Engine | Situação nesta etapa |
|---|---:|---|
| C01 máscara incorreta apesar do ping | 9 | Interno; candidato a adaptador com escopo de edição/estrutura e enunciado de aluno. |
| C02 novos postos /28 | 9 | Interno; `inSubnet` não garante host utilizável, reservas e unicidade. Mantém critério manual obrigatório. |
| C03 rede incorreta | 9 | Interno; ainda sem política publicada de preservação e revisão do enunciado. |
| C04 conflito de endereços | 9 | Interno; mesma lacuna de unicidade/host válido de C02. Ping pode passar mesmo em configurações inadequadas. |
| D01 gateway | 9 | Interno por seleção gradual; E08 já cobre essa classe de falha. Não é ausência de suporte do motor. |
| D02 dois routers | 10 | Publicado como piloto, com política adicional e verificação dos dois next hops. |
| D03 forwarding | 16 | Interno; verifica forwarding/policies mas ainda precisa de adaptador de preservação e enunciado sem reparação antecipada. |
| D04 retorno /32 | 15 | Interno; candidatos/alternativas existem, mas escopo de edição e caminho efetivo exigem revisão própria. |
| E01 prática /23 funcional | 4 | Interno; E06 é a amostra saudável escolhida. |
| E05 prática VLANs | 4 | Interno; critério manual inclui preservação e justificativa; não publicar apenas com ping. |
| E06 prática /16 funcional | 4 | Publicado. Proteção estrutural automatizada; justificativa explicitamente manual. |
| E07 prática máscaras divergentes | 4 | Interno; exige revisão de soluções alternativas e escopo permitido. |
| E08 prática gateway incorreto | 7 | Publicado com rotas efetivas e estrutura. |
| E09 prática máscara ampla | 7 | Publicado com rotas efetivas e estrutura. |
| E12 prática empresarial | 13 | Interno; várias falhas e caminhos saudáveis precisam de política própria, sem ampliar este piloto. |

A/B e os demais E são problemas de cálculo, não topologias executáveis. Os drafts C/D mencionam limitações gerais de preservação mesmo quando não têm um critério `manual` dedicado; a ausência desse campo não significa cobertura integral.

## Arquitetura e segurança

- `practicalPublication.ts`: **somente autoria/testes**, allowlist explícita e enunciados sem a explicação de reparo dos drafts. Não altera os drafts originais. Publicação v1 tem IDs separados da fábrica e dos dois exercícios antigos.
- `generate-practical-beta.mjs`: gera apenas `practicalStudents.json` e `practicalRules.json`. Não gera referência solucionada, comandos, alternativas de autor ou toda a fábrica. `practicalTypes.ts` define o contrato dos critérios.
- `beta.ts`: preserva `BETA_EXERCISES`/`betaChecks` legados e expõe `AVAILABLE_EXERCISES`/`exerciseChecks` para a seleção integrada.
- `practicalChecker.ts`: critérios passivos no nível de exercícios; reutiliza `IpDevice.lookupRoute`, `serializeNetwork` e `labs/checker.runChecks`. **Nenhum protocolo ou algoritmo da engine foi alterado.**
- Estrutura compara os dados permanentes canônicos da topologia inicial, retirando somente nome/posição e os campos explicitamente permitidos. Preserva identidades, tipos, interfaces, MACs, estado administrativo, conexões e configurações não liberadas (incluindo VLAN, serviços, firewall e RIP). As restrições são declaradas no enunciado. Apresentação fora do documento de rede não participa.
- Regras de endereçamento fixo só são usadas onde o enunciado exige preservar o plano. Rotas permitidas **não** são comparadas byte a byte à referência: decisões efetivas de next hop e tráfego determinam se atendem aos destinos exigidos. A direção das conexões não muda seu significado.
- `ExerciseController` conserva a associação ao draft, CAS e guardas de identidade de rede, sequência de edição, documento, formulário pendente e cancelamento. Mudanças durante a execução invalidam o resultado; callbacks antigos não concedem conclusão em outra aba.
- A avaliação usa a simulação ativa, como os exercícios anteriores. Não escreve endereços, rotas, cabos nem configuração persistente. **Testes aquecem ARP/MAC/conntrack e aparecem em captura/animação**; isso é tráfego transitório real, não um clone oculto da topologia. Cancelar interrompe novos checks e a confirmação, mas não recolhe pacotes já enviados. Fechar/trocar o draft descarta a simulação anterior pelo fluxo existente.
- Verificadores são executados no cliente, não constituem uma fronteira antifraude. Os critérios técnicos podem ser inspecionados no bundle, mas a interface não revela a topologia de referência.

## Persistência: o que é e não é retomado

Não há nova estrutura IndexedDB. O registro existente **`exercises:beta:v1`** associa cada tentativa a um `draftId` e mantém a primeira conclusão por exercício/versão. A topologia é propriedade exclusiva do Session Controller.

- Autosave, F5 e reabertura da sessão preservam aba, configuração e associação; o feedback detalhado é recalculado ao clicar novamente em verificar.
- Save/Save As na **mesma aba** não muda a tentativa. Os planos pessoais e os demais drafts não são sobrescritos.
- **Fechar a aba e abrir o plano salvo novamente cria outro draft**: a topologia é recuperada, mas não há reassociação automática da tentativa. O aviso aparece no painel. A conclusão histórica permanece no perfil; `Erneut starten` cria uma nova tentativa inicial.
- JSON/Share Link transportam topologia, não progresso, tentativas ou resultados. Importar uma solução pronta não concede conclusão nem associa um exercício.
- Histórico de conclusão não equivale a “este novo estado está correto”: mudanças limpam o resultado corrente, conservando a conquista anterior.
- Undo/Redo permanece o histórico normal da topologia, sem incluir os pacotes de avaliação. Não se promete persistência desse histórico após F5.
- Metadados incompatíveis ou falha de gravação são reportados e preservados; nenhum sucesso de salvamento é simulado.

## Validação e manutenção

```powershell
node scripts/generate-practical-beta.mjs
npm test -- src/exercises src/persistence/sessionController.test.ts src/i18n/i18n.test.ts
node scripts/test-practical-exercises.mjs
npm run build
node scripts/validate-network-factory.mjs --check-bundle
git diff --check
```

Testes reais cobrem estados iniciais/referência, alternativas de rota/gateway, caminho de retorno incompleto, rede já correta, alteração estrutural com ping bem-sucedido, nomes Unicode, interfaces/VLAN, configuração não modificada pelos checks, cancelamento, reinício, metadados e invalidadores existentes.

O harness reutiliza Chromium com perfil temporário, porta aleatória, banco `netlab-idb-test-*` e downloads isolados. Inclui os exercícios anteriores, proteção do plano pessoal, edição IPv4, Undo/Redo, F5, Save/Load, troca de plano, xterm, menu responsivo, DE/EN/PT-BR e Graphite Dark/Classic Light em 1440/700 px. Capturas em `.playwright-mcp/reviews/`; extras/resultados em `raw/practical-beta-staging/`, sempre fora do Git. Nenhum dado real é usado.

Resultado em 29/10/2026: **985 testes direcionados em 12 arquivos e 117 verificações Chromium aprovados**, zero erros de navegador. TypeScript, build, controle de ausência do catálogo autoral no bundle e `git diff --check` aprovados. Permanecem os avisos preexistentes de `useLayoutEffect` no teste SSR da homepage e chunk de aplicação maior que 500 kB no build. Ainda é um piloto para testes manuais do usuário.

Arquivos desta etapa: `src/exercises/{beta.ts,exerciseController.ts,ExerciseUI.tsx,exercises.css,practicalTypes.ts,practicalPublication.ts,practicalStudents.json,practicalRules.json,practicalChecker.ts,practicalChecker.test.ts,exerciseController.test.ts}`, `src/i18n/catalogs/exercises.ts`, `scripts/{generate-practical-beta.mjs,test-practical-exercises.mjs,practical-exercises-review.mjs,test-project-repository.mjs,exercise-beta-review.mjs}` e os documentos `practical-exercises-beta.md`, `exercises-beta.md`, `calculation-practice.md`, `network-exercise-factory.md`. Alterações anteriores de CIDR, prática matemática e atalho físico foram preservadas, sem consolidá-las em commit.

Próximas etapas: testes manuais do piloto; revisar a redação/escopo de C01 e D04; criar validação explícita de unicidade/endereços reservados antes de C02/C04; decidir conscientemente se tentativas devem ser portáveis para planos salvos e exportações. Não publicar o restante só porque a referência executa com sucesso.
