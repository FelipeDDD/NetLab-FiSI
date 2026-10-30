# Rechenpraxis (Beta) — etapa 1

Entrada: **Übungen (Beta) → Subnetting & CIDR üben**. A prática é uma região não modal dentro do canvas, com rolagem interna e botão de fechar. Não abre plano, não executa simulação e não altera o exercício de rede ativo. Os dois exercícios práticos anteriores continuam disponíveis e conservam seu progresso IndexedDB.

## Seleção inicial

- **E02 · Gateway und Subnetz**: PC `192.168.99.60/16`, gateway `192.168.9.1`; uma única escolha entre Ja / Nein / Nicht eindeutig bestimmbar. A pergunta é pertencimento, portanto a resposta é Ja. O feedback distingue isso da conectividade não comprovada. `reference` é a seed reservada para esse exemplo fixo.
- **A · Netz und Broadcast**: variantes do gerador `subnet`; somente rede, broadcast e quantidade de hosts utilizáveis. Não exige preencher todos os oito atributos internos.
- **B · VLSM planen**: variantes `vlsm`; uma rede/CIDR por demanda, respeitando capacidade mínima, crescimento, reserva fixa, alinhamento, contenção e ausência de sobreposição. Alternativas válidas são aceitas.

As 32 definições completas A–E continuam internas. Não são publicadas automaticamente; a etapa 1 não integra complementos de topologia. A [etapa 2](practical-exercises-beta.md) acrescenta quatro projeções práticas separadas (E06/E08/E09/D02), sem alterar os drafts autorais ou a persistência em memória desta prática matemática.

## Uso

As configurações começam recolhidas. O resumo mostra categoria, dificuldade, idioma e seed; `Konfigurieren` exibe/recolhe os mesmos controles, mantendo respostas e feedback. O botão de posição no cabeçalho alterna a janela entre lateral e centro da região do canvas; isso não altera pan, zoom ou documentos. Posição e expansão são estados locais da janela, sem persistência após fechá-la/F5.

`Antwort prüfen` mostra resultados por campo e explicações. Campos vazios são identificados individualmente e não interrompem a avaliação dos demais. Alterar uma resposta invalida o feedback anterior. Nas questões de escolha única Sim/Não, a explicação da correção é suficiente e não existe bloco redundante de solução. `Lösung anzeigen` continua disponível em subnetting/VLSM, não preenche respostas nem concede conclusão: a tentativa passa a indicar que houve consulta à solução.

Após corrigir, `Nächste Aufgabe` aparece no rodapé, inclusive com respostas incorretas ou incompletas. Mantém categoria e dificuldade e usa `createQuestion` com uma seed nova. A UI compara os problemas e tenta até 32 seeds derivadas para impedir repetição consecutiva; a seed final aparece no resumo e reproduz a variante pelos controles normais. Novas seeds automáticas têm oito caracteres hexadecimais; seeds manuais, `reference` e UUIDs antigos conservam seu significado. Se não conseguir outra questão, conserva a resposta atual e apresenta erro. Ao avançar, limpa somente a tentativa anterior da categoria atual (respostas, feedback e solução consultada); tentativas de outras categorias continuam em memória. A questão nova exige uma nova correção antes de avançar novamente.

A escolha Ja/Nein/Nicht eindeutig bestimmbar usa três radios com aparência de botões horizontais, com seleção exclusiva e navegação nativa por teclado. Dados da questão usam colunas CSS Grid para rótulos e valores. A [auditoria de variedade](practice-variety-audit.md) documenta referências, arquétipos expostos, amostra de 900 seeds, dificuldades e limites estruturais do VLSM.

`Andere Variante` cria uma seed nova, mantendo categoria e dificuldade. É possível informar uma seed e usar `Diese Seed öffnen` para reproduzir. A receita exibida contém família, versão, dificuldade, cenário e seed. Trocar de categoria retoma sua variante mais recente; reabrir uma receita já visitada retoma as respostas em memória.

Controles estão traduzidos em DE/EN/PT-BR. Enunciados e explicações permanecem em alemão, com aviso explícito. A mudança de idioma não participa da identidade da tentativa e não perde respostas.

## Arquitetura

| Arquivo | Responsabilidade |
|---|---|
| `src/exercises/practice/model.ts` | Allowlist de três categorias; receita, campos, solução e avaliação seletiva |
| `src/exercises/practice/progression.ts` | Próxima variante reproduzível usando o gerador existente, com proteção contra repetição consecutiva |
| `src/exercises/practice/session.ts` | Estado temporário de tentativas, respostas, feedback, solução consultada e última variante por categoria |
| `src/exercises/practice/PracticeSurface.tsx` | Entrada no menu e carregamento lazy do painel |
| `src/exercises/practice/PracticePanel.tsx` | Formulário genérico pelos descritores; não calcula máscaras ou sub-redes |
| `src/exercises/practice/practice.css` | Layout local e tokens semânticos dos temas |
| `src/i18n/catalogs/practice.ts` | Controles DE/EN/PT-BR |
| `src/terminalShortcuts.ts` | Predicado do atalho físico, chamado pelo handler existente de `App.tsx` |

`model.ts` reutiliza `generate`, `solve`, `grade` e `diagnose`; não importa `catalog`, drafts, topologias ou `networkTools`. Para VLSM, critérios individuais delegam ao corretor existente; sobreposições entre respostas usam o resolvedor `overlap`. Não há fórmulas duplicadas no JSX.

Os descritores suportam IPv4, prefixo, máscara, inteiro, CIDR e escolha única. A primeira seleção só renderiza os tipos necessários. Classificações usam valores estáveis independentes do idioma. Escolha múltipla e novos adaptadores podem ser acrescentados posteriormente, quando houver um exercício que os demande.

O painel e os módulos de cálculo são carregados apenas ao abrir a prática. O bundle contém o código matemático necessário, mas não o catálogo autoral de 32 drafts. Soluções são calculáveis no cliente: esta é uma ferramenta de estudo, não uma fronteira de segurança contra consulta de respostas.

## Persistência deliberadamente temporária

O progresso existente `exercises:beta:v1` associa tentativas a drafts de topologia, com CAS, conclusão e recuperação pelo Session Controller. Usá-lo diretamente para respostas matemáticas introduziria uma associação falsa a projetos.

Nesta etapa, a prática usa somente memória. **F5 ou fechar o navegador apaga essas tentativas.** O aviso aparece no painel. Não grava localStorage, IndexedDB, documentos, checkpoints ou progresso antigo. Não concede conquistas nem afirma que respostas foram salvas.

A identidade contém categoria/exercício, versão de conteúdo, versão do gerador, dificuldade, cenário e seed. A estrutura de tentativa separa respostas, avaliação e consulta à solução. Uma etapa futura pode persistir esses DTOs em metadados com namespace próprio e CAS, sem alterar topologias; isso ainda não está implementado.

## Atalho internacional

O único handler existente de abrir/recolher o dock usa `KeyboardEvent.code === 'Backquote'`, a tecla física à esquerda do 1. Aceita o evento `key: 'Dead'` fora de edição, além de `'`, `` ` `` e `^`, sem criar atalhos por caractere.

Repeat, composição já iniciada, eventos consumidos e Ctrl/Alt/Meta/Shift são ignorados. A proteção existente para input, textarea, select, contenteditable, popovers, xterm e todo o terminal dock é preservada. **Dentro do xterm a tecla continua disponível para digitação**; Escape permite voltar ao editor antes de usar o atalho. Sem sessões abertas, a tecla não cria um terminal.

## Validação

```powershell
node node_modules/vitest/vitest.mjs run src/exercises src/terminalShortcuts.test.ts src/topologyShortcuts.test.ts src/i18n/i18n.test.ts
node scripts/test-practice.mjs
npm run build
node scripts/validate-network-factory.mjs --check-bundle
git diff --check
```

O harness Chromium reutiliza perfil temporário, banco `netlab-idb-test-*`, porta aleatória e política de downloads isolada. Testa os dois exercícios práticos antigos, novos formulários, respostas incompletas, solução separada, reprodução de seed, idioma, memória durante navegação, F5 sem persistência matemática, teclas internacionais e proteção de campos/xterm. Capturas: Graphite Dark 1440 px, Classic Light 700 px e mobile 390 px.

O refinamento de UX acrescenta verificação de configurações inicialmente recolhidas, expansão por teclado sem perda de respostas, próxima questão após erro, limpeza restrita à tentativa anterior, reprodução da seed nova e posição lateral/central sem alteração do viewport/documento. Validação: 81 testes direcionados (prática, traduções e atalhos), 118 verificações Chromium, TypeScript, build e `git diff --check` aprovados. A comparação visual reúne sete capturas, com cinco PNGs principais selecionados para compartilhar. Permanecem os avisos existentes de SSR `useLayoutEffect` nos testes da homepage e de chunk maior que 500 kB no build.

Artefatos ficam em `.playwright-mcp/reviews/`, ignorados pelo Git; capturas anteriores são arquivadas pelo gerador existente. Nenhum dado do perfil real é usado.

## E02 v2

A Rechenpraxis oferece agora E02 v2 com pertencimento matemático e conectividade baseada em evidências. A v1 permanece selecionável e reproduzível, sem mudanças na fábrica. Consulte [practical E02 v2](practice-e02-v2.md) para compatibilidade, exemplos, distribuição de 3.000 seeds, apresentação IPv4 por octetos e o atalho físico Espaço após correção.
