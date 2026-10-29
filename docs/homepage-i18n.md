# Homepage React, navegação e idiomas

## Entradas atuais

`/` é a homepage Packet Journey; `/app.html` é o editor independente. A homepage clássica e os seletores de protótipos foram removidos. Antigos parâmetros de apresentação são ignorados sem reescrever query/hash. Arquitetura, efeitos e validação visual: [homepage-packet-journey.md](homepage-packet-journey.md).

As quatro ações usam `src/home/navigation.ts`: criar (`home=new`), retomar (sem intenção), abrir (`home=load`) e exercícios (`home=exercises`). Labs usa `home=labs`. Intenções são consumidas após o boot do editor; links de projeto por ID e Share Links mantêm seu tratamento existente. A homepage não lê nem modifica IndexedDB, não migra autosave e não carrega a engine. A listagem de projetos fica no diálogo existente do editor.

Graphite Dark é uma aparência local da homepage, sem substituir o tema/background salvo do editor. Ao voltar ao editor, seus guards de persistência, sessão e preferências continuam sendo os existentes.

## Sistema de idiomas

- `src/i18n/index.ts`: idiomas, normalização, interpolação e `useTranslation()`.
- Catálogos tipados por domínio: `common`, `home`, `journey`, `navigation`, `workspace`, `exercises` em `src/i18n/catalogs/`.
- Inglês é a origem das chaves (`as const`); DE/PT-BR usam `Record<keyof typeof en, string>`. Chaves ausentes/extras são erros de TypeScript.
- `translate(language, key, values)` usa inglês quando um texto válido está indisponível. Nunca mostra a chave ao usuário.
- Interpolações são texto escapado por React, sem HTML traduzido. Nomes personalizados, comandos, IPs e documentos não são traduzidos.
- Preferência: `netlab:language:v1`. Ausência → DE, sem escrita. Escolha válida persistida tem prioridade; acesso negado ao localStorage permite escolha temporária. O evento `storage` sincroniza idiomas entre abas.
- O hook usa Zustand, sem depender do store da rede ou de documentos. `installLanguageDocument()` atualiza `html.lang` e devolve cleanup; trocar idioma não remonta React Flow nem recria xterm.
- `LanguageSelector` está na homepage e em Einstellungen. O editor continua parcialmente traduzido.

## Traduzir ou ampliar

1. Adicionar chave EN, DE e PT-BR no domínio apropriado, com placeholders idênticos.
2. Usar `const { t, language } = useTranslation()` e `t('workspace.deleteNamed', { name: plan.name })`, por exemplo.
3. Usar `language` apenas na formatação de datas/contagens; plurais novos precisam de variantes explícitas apropriadas.
4. Adicionar consumidores aos testes de chaves estáticas/órfãs em `src/i18n/i18n.test.ts`. Famílias dinâmicas são enumeradas, não ignoradas genericamente.
5. Conferir teclado, foco, textos longos e mobile no Chromium.

Para um novo idioma: registrar código BCP 47/nome nativo em `LANGUAGES` e adicionar o catálogo em cada domínio. Não alterar a política de default nem migrar silenciosamente preferências. Traduções de conteúdo pedagógico exigem um processo separado.

## Cobertura e limites

Traduzidos: homepage, navegação principal/compacta, ações e diálogos de planos, retorno à homepage, seletor de idioma, menu Beta e estados de progresso. Inspector, Palette, parte de Settings, exportação, Packet Capture, chrome do terminal, boot/recuperação/conflitos e vários estados de workspace ainda contêm textos originais. Labs, enunciados e saída técnica conservam seu idioma.

O inventário histórico [i18n-audit.md](i18n-audit.md) registra a etapa inicial, incluindo arquivos depois removidos. A fonte de verdade atual são os catálogos, seus consumidores e testes.

## Validação

```powershell
node node_modules/vitest/vitest.mjs run src/home src/i18n src/projects src/workspace src/persistence
node scripts/test-homepage.mjs
node scripts/test-journey.mjs
npm run build
git diff --check
```

O primeiro runner verifica navegação e dados sintéticos; o segundo, efeitos e layout. Ambos usam o harness Chromium existente com perfil/origem descartáveis e isolamento de downloads. Nunca executar esses cenários de dados contra o perfil pessoal.

Testes cobrem idioma/default/fallback, paridade/interpolação, chaves órfãs, markup, navegação real, planos existentes, F5, recuperação, Share Links e preservação de IDs/sessão xterm durante troca de idioma. O build separa homepage e editor; o aviso preexistente de chunk grande do editor não é uma dependência da homepage.
