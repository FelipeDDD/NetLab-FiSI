# Rechenpraxis — auditoria de variedade e refinamento local

Auditoria em 30/10/2026. A interface de cálculo oferece três adaptadores selecionados; o catálogo autoral completo permanece interno. Os geradores v1, cálculos, corretores e dificuldades **não foram alterados** nesta rodada.

## Referências e disponibilidade real

| Grupo | Referências autorais | Disponível nesta interface |
|---|---:|---|
| A | 6 | Um arquétipo `subnet`: calcular rede, broadcast e hosts utilizáveis; três campos. |
| B | 6 | Um arquétipo `vlsm`: dimensionar quatro demandas (Büro, Technik, Lager, Reserve), com crescimento/reservas conforme a dificuldade. |
| E | 12 | Adaptador reduzido de E02, cenário `gateway` de `cidr`: decidir se o gateway pertence ao subnet do PC. |

Essas 24 referências não são uma sequência de 24 questões escolhida pelos botões. O gerador interno também possui `capacity`, `overlap`, `membership` e seis cenários CIDR (`same-network`, `boundary`, `gateway`, `mixed-masks`, `healthy`, `real-fault`), que não são todos expostos na Rechenpraxis. Os pilotos de topologia E06/E08/E09/D02 pertencem ao fluxo prático separado e não são parte desta amostra matemática.

## Amostra reproduzível e oráculo

Comando: `node scripts/audit-practice-variety.mjs`. Saída JSON em stdout; redirecionar para `.playwright-mcp/` para conservar um relatório local ignorado pelo Git.

Seeds: **`audit-variety-000` até `audit-variety-099`**, para cada uma das três categorias e três dificuldades: **900 variantes**. A mesma receita é gerada duas vezes e comparada integralmente. Uma solução aceita e controles negativos/vazios são avaliados pelos corretores reais. A validade matemática da referência é conferida por um oráculo independente baseado em inteiros BigInt:

- A: máscara binária, AND para rede, broadcast e capacidade.
- B: alinhamento, contenção, capacidade mínima com crescimento, ausência de sobreposição e respeito às reservas.
- E02: comparação do gateway com os limites matemáticos do subnet do PC, sem inferir conectividade.

| Categoria | Dificuldade | Válidas | Enunciados visíveis distintos | Prefixos / padrão |
|---|---|---:|---:|---|
| E02 gateway | Einstieg | 100/100 | 100/100 | /23, /25, /26; 70 Ja, 30 Nein |
| E02 gateway | Mittel | 100/100 | 100/100 | /22, /23, /25, /26, /27; 73 Ja, 27 Nein |
| E02 gateway | Fortgeschritten | 100/100 | 100/100 | /20, /22, /23, /25–/28; 63 Ja, 37 Nein |
| A subnet | Einstieg | 100/100 | 100/100 | /26–/28 |
| A subnet | Mittel | 100/100 | 100/100 | /25–/30 |
| A subnet | Fortgeschritten | 100/100 | 100/100 | /19–/30 |
| B VLSM | Einstieg | 100/100 | 100/100 | Stammnetz /24; demandas /25, /26, /27, /28 |
| B VLSM | Mittel | 100/100 | 100/100 | Stammnetz /23; demandas /24, /26, /27, /28; crescimento 10% no Büro |
| B VLSM | Fortgeschritten | 100/100 | 100/100 | Stammnetz /22; demandas /24, /26, /27, /28; crescimento 10% e reserva fixa /25 |

Não houve repetição exata do problema completo nem dos dados exibidos dentro de cada amostra de 100, incluindo pares consecutivos. Isso não comprova ausência global de colisões para todas as seeds possíveis e não mede eficácia pedagógica.

## O que varia e o que se repete

**A:** mudam endereço e prefixo, portanto limites e capacidade podem mudar. A operação solicitada e os três campos continuam os mesmos. Prefixos menores ampliam as fronteiras possíveis no nível avançado; não há introdução automática de outro tema.

**E02:** mudam PC, máscara e gateway; são três padrões: gateway local utilizável, fora do subnet e endereço de rede/broadcast (o gerador atual usa broadcast). A dificuldade amplia a escolha de prefixos. O exercício pergunta pertencimento, portanto o broadcast continua pertencendo matematicamente ao subnet, com ressalva de endereço não utilizável no feedback. `Nicht eindeutig bestimmbar` é um distrator para esta pergunta específica e não foi resposta correta na amostra; a conectividade real, distinta do pertencimento, permanece não comprovada. O exemplo especial `reference` conserva `192.168.99.60/16` e gateway `192.168.9.1` em todas as dificuldades, conforme o comportamento existente.

**B:** mudam a rede-base e as quantidades exatas de hosts. Entretanto, as faixas do gerador mantêm os mesmos tamanhos mínimos de blocos em cada dificuldade. Nas 100 seeds por nível, houve **somente um padrão estrutural por nível**:

- Büro: 76–100 hosts no Einstieg; 136–180 no Mittel; 166–220 no Fortgeschritten (os dois últimos com crescimento de 10%).
- Technik: 35–45; Lager: 16–20; Reserve: 7–8, em todos os níveis.
- Aumentar a dificuldade altera a rede-pai, acrescenta crescimento e depois uma reserva fixa; conserva quatro demandas com os mesmos nomes e ordem.

Assim, a variedade numérica é real, mas **Outra variante não significa outro arquétipo**. Especialmente VLSM pode parecer repetitivo, pois a distribuição dos prefixos se mantém. Isso é uma limitação do desenho atual, não um erro matemático. Alterar faixas, número de demandas ou cenários mudaria as receitas v1 e o escopo pedagógico, por isso não foi feito.

## Botões e seeds

- **Andere Variante**: gera outra receita na categoria/dificuldade atuais; pode ser usado antes da correção. Conserva tentativas anteriores em memória, como a navegação existente.
- **Nächste Aufgabe**: requer correção, inclusive incompleta/incorreta; gera outra receita na mesma categoria/dificuldade e descarta somente a tentativa anterior da categoria atual.
- Ambos reutilizam `nextQuestion` e evitam repetir consecutivamente o problema, com até 32 tentativas determinísticas. Não selecionam outra definição do catálogo.
- Novas seeds automáticas têm **oito caracteres hexadecimais** (`00000000`–`ffffffff`), usando quatro bytes de `crypto.getRandomValues`. Em caso de repetição, o retry produz outra seed curta por hash determinístico. Não há promessa de unicidade global: são 32 bits; a proteção é contra repetição consecutiva.
- O gerador recebe a seed final como string opaca. `reference`, UUIDs antigos, sufixos antigos e seeds manuais não são convertidos, normalizados ou reinterpretados. A reprodução continua dependendo também da categoria, dificuldade e versão.
- Respostas seguem em memória, sem persistência após F5. Abrir/recolher configuração não modifica a seed atual nem as respostas.

A auditoria antes/depois também comparou 27 receitas com `reference`, `37b3c848-b226-44c2-93eb-0337af1ce011-0` e `manuell-büro`, nos três níveis/categorias. SHA-256 idêntico: `b9a7bf5fc1c1dca9ac0a8d408becb221da3c50c26145349526b38f06fd0be2b9`. O relatório completo da amostra também ficou idêntico antes/depois.

## Interface e arquivos

Escolha única usa `<fieldset>`/`<legend>` e radios nativos apresentados como três botões horizontais. Um único valor é selecionado, setas movem a seleção, Tab navega e o foco é visível. Os mesmos valores `yes/no/unknown` são enviados ao corretor; rótulos DE/EN/PT-BR são preservados. Formulários numéricos mantêm seus controles.

Os dados continuam vindo dos textos atuais, separados no primeiro `:` somente para apresentação em `<dl>` com colunas CSS Grid: rótulos e valores têm alinhamento estável; valores são monoespaçados e podem quebrar em janelas estreitas. Nenhum dado pedagógico foi reescrito.

Arquivos desta rodada: `PracticePanel.tsx`, `practice.css`, `progression.ts`, novo `seeds.ts`, `practice.test.ts`, catálogo i18n `practice.ts`, `scripts/practice-review.mjs`, novo `scripts/audit-practice-variety.mjs` e esta documentação. As alterações locais anteriores da janela, estado de tentativas e documentação de uso foram preservadas.

Validação final: **937 testes relevantes em oito arquivos**, **119 verificações no Chromium isolado**, TypeScript, build e `git diff --check` aprovados; zero erros de navegador. A revisão cobre seleção por mouse e setas, exclusividade, DE/EN/PT-BR, alinhamento, seeds curtas/reprodução, próxima questão, configurações, posição lateral/central, xterm e F5. Conferidos Graphite Dark e Classic Light em 1440/700/390 px, incluindo os três botões horizontais nas duas larguras menores. Seis capturas reais, cinco PNGs principais em `.playwright-mcp/reviews/`; extras e galeria em `raw/2026-10-30--practice-choice-seeds/`. Artefatos ignorados pelo Git. Permanecem os avisos existentes de SSR `useLayoutEffect` no teste da homepage e chunk maior que 500 kB no build. Nenhum commit ou push nesta rodada.
