# Netzwerkdiagnose — preview de desenvolvimento

## Abrir localmente

Com `npm run dev` ativo, abrir **http://localhost:5173/__diagnosis_preview__**.

A rota é fornecida exclusivamente pelo middleware `configureServer` do Vite (`apply: 'serve'`). Não existe HTML de produção correspondente, link na navegação pública ou alteração em `/app.html`. O entry também exige `import.meta.env.DEV` e o pathname exato. `vite preview`/deploy de `dist` não monta esta interface (um servidor pode responder com seu fallback habitual para URLs desconhecidas).

É uma página isolada com a aparência da Rechenpraxis. Não abre planos, não instancia a engine, não restaura sessões e não importa App, store de simulação ou terminais. Tema do preview, respostas e progresso são estados React desta visita. O idioma reutiliza o store i18n existente e sua preferência `netlab:language:v1`; nenhuma outra preferência ou dado de projeto é gravado. F5 limpa as respostas. Fechar/reabrir o painel na mesma visita conserva a questão e respostas.

## Fluxo

### Formato padrão: ND02 v3

A **v3 · Hosts & Subnetzmaske** é o padrão ao abrir o preview e ao selecionar ND02. Em **Konfigurieren → Version**, v1 e v2 continuam disponíveis para comparação. ND05 continua exclusivamente v1. O seletor não converte seeds antigas silenciosamente: versão, dificuldade e seed definem explicitamente o caso. Outra variante/Próxima questão preservam a versão escolhida. Não há migração de dados. Somente a ND02 v3 também está publicada como **Subnetzgrenzen** na Rechenpraxis principal; as demais versões e ND05 continuam internas.

As três perguntas da v3 são fixas: pertencimento matemático (`rechnerisch` sublinhado), host utilizável e máscara decimal pontuada. O candidato nunca coincide com o PC; a segunda pergunta não avalia conflitos, routers ou conectividade. As seis posições de fronteira mantêm peso de 80%; os demais casos são hosts internos, incluindo .0/.255 quando válidos. Prefixos /21–/28 conforme a dificuldade, todos compatíveis com o começo `255.255.`.

O campo textual inicia com `255.255.`; ao receber foco nesse estado, o cursor fica no final. Não há placeholder revelando a resposta. Exige quatro octetos decimais de 0 a 255, sem zeros redundantes; espaços externos são ignorados. Respostas incompletas/malformadas bloqueiam a divulgação conjunta. Quatro octetos válidos mas incorretos recebem correção normal, mesmo que não formem máscara contígua. Alterar qualquer resposta recolhe todo o gabarito. Enter envia o formulário; Espaço só avança fora dos controles após correção. A explicação da máscara decompõe os bits por octeto e o Rechenweg compartilhado permanece único.

`boundariesV3.ts` possui seleção versionada própria e reutiliza somente os fatos de endereçamento do algoritmo v2 imutável, com seed interna separada. Não altera arquivos nem resultados antigos. A v3 exclui a receita `self`. Auditoria: `node scripts/audit-nd02-v3.mjs --check-review`. [Exemplos e distribuição v3](nd02-v3-examples.md).

### Idiomas da v3

O seletor DE/PT-BR/EN fica sempre visível no cabeçalho do preview, mesmo com configurações recolhidas. O mesmo `LanguageSelector`/`useLanguage` existe também na toolbar do editor, após Ajuda (ou após Menü em largura compacta). A preferência é compartilhada; eventos `storage` atualizam o idioma entre abas. Não se cria um segundo sistema de idioma ou persistência de respostas.

`nd02Messages.ts` contém os templates estáticos revisados dos três idiomas, compartilhados com a Rechenpraxis; `previewMessages.ts` acrescenta somente os controles exclusivos do preview. `presentationV3.ts` escolhe as justificativas por papel do endereço e fatos calculados, nunca interpretando textos alemães. Usa `translateMessages`, a mesma interpolação/fallback do i18n principal. `boundariesV3.ts`, receitas, gabaritos e fingerprints continuam intactos. Os exemplos autorais versionados permanecem em alemão.

Título, três perguntas, justificativas, feedback, validação da máscara, cálculo compartilhado e controles do preview estão traduzidos. A ênfase usa `rechnerisch` / `matematicamente` / `mathematically`; atributos `lang` acompanham o conteúdo. Idioma não é dependência da geração nem dispara substituição de questão: seed, IPs, respostas, máscara parcial e resultado da correção permanecem. As explicações são renderizadas novamente no novo idioma a partir dos mesmos fatos. ND02 v1/v2 e ND05 mantêm os enunciados/explicações autorais alemães e sua identificação `lang="de"`.

Exemplo de justificativa para candidato igual à rede:

- DE: Die Gateway-Adresse ist die Netzadresse, keine nutzbare Hostadresse.
- PT-BR: O endereço do gateway é o endereço de rede, não um endereço de host utilizável.
- EN: The gateway address is the network address, not a usable host address.

### Versões anteriores preservadas

ND02 v2 tem três perguntas: pertencimento, adequação numérica como gateway de outro router e uma pergunta de fronteira (rede, broadcast, primeiro/último host, próxima subnet do mesmo tamanho ou pertencimento de outro endereço). Todas são corrigidas conjuntamente; **Rechenweg** aparece uma vez após a correção. Os cálculos são exclusivamente matemáticos, sem inferência sobre conectividade.

Implementação isolada em `boundariesV2.ts`: seleção ponderada de seis posições calculadas (80%) e hosts internos (20%, incluindo coincidência com a própria IP e hosts .0/.255). Prefixos: Einstieg /24–/26; Mittel /23–/28; Fortgeschritten /21, /22, /23, /26, /27, /28. Os blocos privados têm espaço para os dois vizinhos; a conversão IPv4 rejeita qualquer valor fora de 0–2³²−1. Textos são templates fixos preenchidos por fatos calculados.

Auditoria: `node scripts/audit-nd02-v2.mjs --check-review`; testes com oráculo BigInt independente sobre 3.000 seeds. Os [dez exemplos completos](nd02-v2-examples.md) incluem seed, perguntas, gabarito, justificativas e cálculo compartilhado. Para regenerar esse documento deliberadamente: `--write-review`.

1. Escolher ND02 ou ND05, e Einstieg/Mittel/Fortgeschritten.
2. Usar a seed curta criada automaticamente ou inserir uma seed manual e clicar em **Diese Seed öffnen**. Versão, dificuldade e seed reproduzem o cenário correspondente.
3. ND02 apresenta diretamente **Gateway und Subnetz**, PC/CIDR e gateway: duas perguntas na v1, três na v2/v3. ND05 conserva cenário, evidências e premissas. Responder a todas as perguntas.
4. **Alle Antworten prüfen** avalia o conjunto. Se faltar resposta válida, apenas indica campos pendentes: não revela gabarito, explicações ou exemplos de nenhuma pergunta.
5. Com o conjunto completo, mostra resultado por pergunta, resposta correta e explicação específica. Os exemplos hipotéticos existentes aparecem somente quando o contrato inclui alternativas.
6. **Nächste Aufgabe (Leertaste)** gera outra questão na mesma dificuldade/arquétipo. A correção move foco ao título; Espaço funciona ali e não interfere com radios, inputs, selects, botões, composição, modificadores, repetição ou diálogos. A lógica é a mesma regra compartilhada da Rechenpraxis. Outra variante pode ser usada antes da correção.

Alterar uma resposta invalida a **avaliação inteira** e recolhe todas as explicações. Expandir/recolher configurações e trocar tema/idioma não apaga respostas. Trocar arquétipo, dificuldade ou aplicar uma seed inicia uma nova tentativa. Seeds inválidas conservam a questão e as respostas anteriores. Não há persistência de progresso.

## Contratos e ausência de spoilers

O adaptador `previewModel.ts` usa o gerador existente sem alterações. A projeção inicial contém apenas título neutro, cenário, evidências textuais e prompts/opções. Não apresenta classificação do candidato, IDs das receitas (`network`, `broadcast`, `self` etc.), basis, respostas ou explicações. A receita técnica completa fica disponível em detalhes apenas após a correção conjunta.

Opções são definidas pelo **conceito**, nunca pelo gabarito:

- Pertencimento, validade numérica de gateway e observação de um teste completo: Ja / Nein.
- Possibilidade de comunicação e atribuição de causa: Ja / Nein / Nicht eindeutig bestimmbar, inclusive nos casos em que as evidências determinam Ja ou Nein.

No ND02 v1/v2, somente a apresentação omite a introdução e o parágrafo de escopo; `numerisch` aparece sublinhado na segunda pergunta. A validade continua sendo a do endereço proposto como gateway local do PC, não de um endereço para qualquer host: rede, broadcast, endereço fora da subnet e a própria IP do PC continuam recusados pelo contrato antigo. A v3 tem o novo contrato de host utilizável e não gera a própria IP como candidato. As explicações completas permanecem após a correção conjunta. ND05 conserva integralmente a apresentação das premissas. Nenhum texto versionado anterior, receita, fingerprint, caso fixo ou comportamento E02 v1/v2 foi modificado. Nenhuma receita `power`/`disconnected` foi adicionada. Exemplos hipotéticos de alvo desligado que já existem na v1 continuam apenas nas explicações pós-correção; não são fatos novos do enunciado.

### Limites editoriais preservados

ND05 Einstieg tem somente `nd05-timeout`: novas seeds variam IPs/contagens, não o raciocínio. Em Mittel/Fortgeschritten, a seleção automática inclui outras receitas elegíveis e pode continuar escolhendo receitas básicas. Isso está documentado em [geração](network-diagnosis-generation.md). Ampliar a variedade de Einstieg ou alterar as premissas para outra redação exige discussão e uma versão futura; não foi feito neste preview.

Próxima questão remove a receita explícita resolvida antes de chamar o gerador, para permitir que a nova seed escolha entre as receitas do nível. Faz até 32 tentativas determinísticas para evitar repetir imediatamente o mesmo enunciado. Não garante unicidade global nem altera o gerador v1. Seed, arquétipo e dificuldade reproduzem a seleção automática; a receita completa retornada reproduz igualmente o caso.

O código autoral com respostas pode ser inspecionado nas ferramentas de desenvolvimento. O isolamento visa testes manuais sem spoilers na interface e ausência de publicação; não é uma plataforma de provas com gabarito protegido contra inspeção de código.

## Reutilização e isolamento de produção

- `ChoiceField.tsx`: extração dos radios/botões existentes, sem mudança de comportamento da Rechenpraxis pública.
- `practice.css`, tokens, traduções existentes, `randomPracticeSeed`, `retryPracticeSeed` e `practiceNextShortcut`: reutilizados.
- Estado local simples no componente do preview, sem novo store, framework de avaliação ou persistência.
- `previewEntry.tsx` importa somente apresentação; o gerador usa os utilitários IPv4 puros já existentes, sem instância de rede.
- `scripts/check-diagnosis-preview-build.mjs` executa um build Vite normal e permite explicitamente somente `boundariesV3.ts`, sua dependência imutável `boundariesV2.ts`, `presentationV3.ts` e `nd02Messages.ts`. Rejeita todos os outros módulos de diagnóstico emitidos, incluindo preview, catálogo autoral/pilot e gerador interno ND05, além de marcadores específicos. Confere o grafo real emitido, não somente nomes minificados.

## Validação desta etapa

### Internacionalização ND02 v3

- 118 testes em 9 arquivos: paridade de chaves/placeholders, apresentação das nove receitas nos três idiomas e regressões do diagnóstico, Rechenpraxis e i18n.
- Auditorias v1/v2/v3 com `--check-review` aprovadas; receitas, exemplos, fingerprints e geradores preservados.
- Chromium descartável: 136 verificações aprovadas, sem erros de navegador. Ciclos DE → PT-BR → EN → DE antes de responder, com respostas parciais, máscara `255.255.` e `255.255.25`, respostas completas, correção certa/errada e edição posterior. Seeds, dados, respostas e correção permanecem idênticos durante a troca.
- Seis papéis representativos conferidos: rede, broadcast, último host, subnet vizinha, host `.0` e host `.255`. Seletor do editor validado em 700/1440 px; preview em Graphite Dark 1440 px e Classic Light 390 px.
- TypeScript, build (484 módulos emitidos; nenhum diagnóstico no bundle público) e `git diff --check` aprovados. Avisos preexistentes de SSR `useLayoutEffect` e chunk grande permanecem.
- Capturas atuais: `01-nd02-v3-desktop.png` (DE), `02-nd02-i18n-pt-br.png` e `03-nd02-i18n-en.png`. Somente a preferência global de idioma é persistida; respostas continuam transitórias.

### Consolidação ND02 v3

- 83 testes direcionados em 7 arquivos, incluindo 3.000 seeds v3 e 3.000 seeds v2 com oráculos BigInt independentes, correção textual e fingerprints anteriores.
- `audit-nd02-v3.mjs --check-review`: 81,7%, 80,5% e 80,2% de cenários de fronteira em 1.000 seeds por nível; nove exemplos reproduzíveis.
- `audit-nd02-v2.mjs --check-review` e `audit-diagnosis-generation.mjs --check-review`: exemplos/fingerprints anteriores intactos.
- Chromium descartável: 134 verificações, sem falhas ou erros de navegador. Campo inicial/cursor, preenchimento por sufixo, máscara errada/incompleta, edição posterior, Enter, Espaço, versões antigas, reprodução, idioma, temas e layouts 1440/390 px.
- TypeScript, build com inspeção de 484 módulos emitidos (nenhum diagnóstico no bundle público) e `git diff --check` aprovados. O aviso já existente de chunk grande do editor permanece.
- Quatro PNGs selecionados em `.playwright-mcp/reviews/`: `01-nd02-v3-desktop.png`, `02-nd02-v3-desktop-checked.png`, `03-nd02-v3-mobile-checked.png`, `04-nd02-v3-mobile.png`. Capturas anteriores arquivadas pelo fluxo existente.

### Histórico da primeira integração

- **1.000 testes em 12 arquivos**, incluindo os fingerprints existentes, oráculos dos geradores, contratos das opções, avaliação conjunta completa/incompleta/incorreta e reprodução/progressão.
- `node scripts/audit-diagnosis-generation.mjs --check-review`: doze exemplos e fingerprint v1 preservados; auditoria de 1.200 casos/2.400 perguntas.
- `node scripts/test-diagnosis-preview.mjs`: **132 verificações Chromium**, incluindo regressões da Rechenpraxis e fluxo novo. Perfil, porta e bancos de testes descartáveis; zero erros de navegador.
- ND02 e ND05: todas as 12 receitas em nível elegível, todas as combinações de arquétipo/dificuldade, seeds manuais/inválidas, opções nativas, feedback incorreto, edição que recolhe gabarito, exemplos hipotéticos, três idiomas, Espaço e foco, F5 e ausência de gravações no storage.
- Revisão visual real: Graphite Dark 1440px; Classic Light 700px e 390px; rolagem interna e ausência de overflow horizontal.
- TypeScript aprovado; build com **484 módulos emitidos inspecionados**, nenhum do diagnóstico; `git diff --check` aprovado. Avisos preexistentes: SSR `useLayoutEffect` nos testes da homepage e chunk maior que 500 kB.

```powershell
npm test -- src/exercises/diagnosis src/exercises/practice src/exercises/factory src/i18n/i18n.test.ts src/terminalShortcuts.test.ts
node node_modules/typescript/bin/tsc --noEmit
node scripts/audit-diagnosis-generation.mjs --check-review
node scripts/check-diagnosis-preview-build.mjs
node scripts/test-diagnosis-preview.mjs
git diff --check
```

Capturas selecionadas em `.playwright-mcp/reviews/` (3 PNGs); originais/galeria em `raw/2026-10-30--diagnosis-preview/`. O gerador existente arquiva revisões anteriores. Artefatos, logs, perfis e build continuam ignorados pelo Git. Sem dependências novas, commit ou push.
