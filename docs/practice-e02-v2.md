# Rechenpraxis — E02 v2, IPv4 e Espaço

## Escopo e compatibilidade

E02 v2 é uma evolução **somente da Rechenpraxis**, em `src/exercises/practice/gatewayV2.ts`. Não modifica a fábrica v1, referências A–E, exercícios práticos, engine, projetos nem persistência. `createQuestion()` continua usando v1 quando nenhuma versão é informada. A interface inicia novas visitas em E02 v2, com seed curta; o seletor **E02-Version** permite reproduzir explicitamente a v1, inclusive `reference` e UUIDs antigos. A versão aparece no resumo, na receita e na identidade da tentativa. Uma seed isolada não identifica a versão: conservar também categoria, dificuldade e versão ao compartilhar receitas.

Outra variante e Próxima questão mantêm a versão e dificuldade atuais. Alterar manualmente a versão é uma escolha explícita; tentativas de versões diferentes têm IDs diferentes. A fábrica geral continua aceitando apenas v1: receitas da Rechenpraxis v2 devem ser reproduzidas pelo adaptador `createQuestion`, não por `generate`.

O fingerprint de 27 receitas legadas completas permanece:
`b9a7bf5fc1c1dca9ac0a8d408becb221da3c50c26145349526b38f06fd0be2b9`.

## Modalidades

- **Matemática:** “Liegt die Gateway-Adresse rechnerisch im Subnetz des PCs?” Inclui host convencional, rede, broadcast e endereço externo. Rede/broadcast respondem Ja com ressalva explícita sobre uso como gateway; Layer 2 não altera pertencimento.
- **Conectividade:** “Ist das Gateway vom PC aus tatsächlich erreichbar?” Nove observações curtas, sorteadas independentemente dos endereços: resposta ICMP, TCP concluído ou resposta UDP (Ja); gateway desligado sem substituto, PC sem qualquer acesso de rede ou VLANs isoladas sem caminho alternativo (Nein); estado desconhecido, ping sem resposta com filtros desconhecidos ou apenas VLAN prevista sem confirmação operacional (Nicht eindeutig bestimmbar).

Conectividade significa comunicação demonstrada com o gateway, não disponibilidade de todos os serviços. Um ping isolado sem resposta é insuficiente. Os casos B usam endereços locais convencionais para concentrar a decisão nas evidências e evitar pressupor rotas alternativas não documentadas. As dificuldades mantêm as faixas de prefixos da progressão anterior; não acrescentam topologias complexas nem alteram A/B.

## Auditoria reproduzível

Comando: `node scripts/audit-e02-v2.mjs`.
Seeds `e02-v2-audit-0000` a `e02-v2-audit-0999`, em cada dificuldade; **3.000 questões**.
Oráculo matemático independente em BigInt (intervalos de endereço), matriz de evidências independente do corretor, reprodução completa, todas as três respostas testadas por questão.

| Dificuldade | Matemática | Conectividade | B: Ja | B: Nein | B: indeterminada | Dados distintos |
|---|---:|---:|---:|---:|---:|---:|
| Inicial | 523 | 477 | 152 | 172 | 153 | 997/1000 |
| Intermediária | 493 | 507 | 173 | 174 | 160 | 1000/1000 |
| Avançada | 507 | 493 | 164 | 170 | 159 | 1000/1000 |
| Total | 1523 | 1477 | 489 | 516 | 472 | — |

Distribuição: 50,77% A / 49,23% B. Em B: 33,11% Ja / 34,94% Nein / 31,96% indeterminada. Todos os nove cenários aparecem nas três dificuldades. Casos A incluem 376 endereços de rede, 390 broadcasts, 386 hosts locais e 371 externos; zero respostas indeterminadas.

Há três repetições visíveis não necessariamente consecutivas em 1.000 seeds iniciais: seeds distintas não garantem enunciados únicos. A proteção existente de Outra variante/Próxima questão evita repetir imediatamente o mesmo problema. Os nove modelos de observação são intencionalmente finitos; não há rotação pedagógica global ou garantia de alternância exata A/B.

### Exemplos reais (v2, dificuldade inicial)

| Seed | Dados | Resposta |
|---|---|---|
| `e02-v2-audit-0002` | PC `10.58.14.3/23`, gateway `10.58.14.0`; pertencimento matemático | Ja; é endereço de rede, não gateway convencional |
| `e02-v2-audit-0011` | PC `10.155.0.202/26`, gateway `10.155.0.193`; Echo Reply atual recebido | Ja |
| `e02-v2-audit-0013` | PC `10.89.1.197/26`, gateway `10.89.1.193`; equipamento desligado, sem substituto | Nein |
| `e02-v2-audit-0024` | PC `10.157.1.8/26`, gateway `10.157.1.1`; ping sem resposta, estado/filtros desconhecidos | Nicht eindeutig bestimmbar |

## Apresentação e teclado

Refinamento de 30/10/2026: após verificar uma alternativa incorreta, a escolha do aluno recebe marca vermelha e “Nicht richtig”; a alternativa correta recebe marca verde e “Richtig”, sem ser selecionada automaticamente. Ícones e texto complementam as cores nos dois temas. Respostas vazias não revelam o gabarito, uma nova escolha limpa o feedback e respostas corretas conservam a apresentação positiva existente. Campos de A/B continuam com correção individual.

O título que recebe foco programático mantém o foco de leitura, mas não exibe outline. A regra CSS é restrita a esse título; botões, radios e demais controles mantêm indicadores de teclado. A revisão em scripts/e02-review.mjs cobre correção, nova tentativa, Espaço, botão de avanço e navegação por Tab/Shift+Tab/Enter.

`Ipv4Value.tsx` apresenta cada octeto em 3ch, com separadores de 1ch e CIDR preservado. Nenhum espaço é inserido no texto; os spans são inline/inline-block para manter a seleção/cópia nativa contínua. Valores não IPv4 continuam como texto. Em telas menores que 420px, rótulos ficam acima dos valores para evitar compressão, mantendo os pontos dos endereços alinhados. Fonte monoespaçada e nomes acessíveis preservam o endereço original.

Espaço físico (`code=Space`) usa a mesma operação do botão após correção, inclusive resposta errada. O handler está na região da prática; não existe listener global novo. A correção devolve foco ao título, permitindo avançar imediatamente. Ignora campos, radios, botões, selects, links, conteúdo editável, diálogos, composição, modificadores, eventos já consumidos e repetição. Outros painéis/xterm ficam fora do escopo. Só chama `preventDefault` quando a nova questão é criada. O comportamento global de Espaço/pan do React Flow não foi alterado.

## Verificação

- `npm test -- src/exercises/practice src/exercises/factory src/i18n/i18n.test.ts src/terminalShortcuts.test.ts`
- `node scripts/audit-e02-v2.mjs`
- `node scripts/audit-practice-variety.mjs` (900 variantes v1 e fingerprint legado)
- `node scripts/test-practice.mjs` (Chromium descartável, revisão adicional em `scripts/e02-review.mjs`)
- TypeScript, build e `git diff --check`.

Resultado desta rodada: **945 testes direcionados**, **123 verificações Chromium**, zero erros de navegador, auditoria v2 de 3.000 questões e auditoria v1 de 900 questões aprovadas. TypeScript, build e diff-check aprovados. Persistem apenas os avisos já existentes de `useLayoutEffect` no SSR da homepage durante testes e chunk de produção maior que 500 kB. Revisão visual realizada em Graphite Dark e Classic Light, 1440/700/390 px, com seleção/cópia real do texto, foco, teclas, tradução, feedback e versão explícita.

Capturas e relatórios brutos ficam ignorados em `.playwright-mcp`; o gerador de revisão arquiva capturas anteriores. Nenhum perfil real, projeto salvo ou stash é usado. Respostas continuam temporárias e não persistem após F5.
