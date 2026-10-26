# Boot normal e recuperação — Fase 5B2-B

O aplicativo normal usa IndexedDB e o Session Controller. A interface da Fase
5B2-A foi reutilizada, sem outro editor de planos ou mecanismo paralelo de Save.
Não há parâmetro experimental necessário para habilitar o fluxo.

## Ordem da inicialização

1. `main.tsx` carrega estilos e chama `mountWorkspaceApplication`.
2. Antes de qualquer operação assíncrona, `protectLegacyAutosave()` cancela o
   debounce antigo e impede permanentemente gravações em `netsim:autosave:v1`
   nessa página. `boot`, retry e substituição legados não podem remover a cerca.
3. A tela de inicialização captura a configuração local e o original legado.
   Abre `netlab-projects`, retoma a sessão e, somente quando necessário, chama
   o serviço existente `migrateLegacyAutosave()` com capacidade de leitura.
4. Ordem, foco e documentos dos rascunhos são restaurados. Só o documento ativo
   é preparado/ativado. O adaptador pausa a simulação, reinicia relógios, eventos,
   caches, captura, histórico e sessões xterm pela fronteira de ativação existente.
5. O provider existente monta App/React Flow, abas e comandos. Não há segundo
   autosave, listener legado de Share Link ou simulação em segundo plano por aba.

Sessões vazias continuam vazias. Sem sessão nem legado, inicia um rascunho vazio,
sem inserir demo. Import JSON, Demo, Labs, exemplos e aceitação de Share Links
criam rascunhos independentes pelo controller; não substituem outro documento.
As sessões xterm são preservadas durante uso normal do plano, mas **não** são
checkpoints persistentes e são descartadas ao trocar/restaurar a topologia.

## Migração e falhas

- O original localStorage nunca é removido, sobrescrito ou atualizado. Marcador,
  arquivo bruto e transação existentes mantêm a migração idempotente.
- Uma sessão existente tem prioridade sobre o legado. O serviço não importa
  novamente o legado a cada F5, nem tenta conciliá-lo com edições posteriores.
- Legado inválido/incompatível não vira demo. O boot mostra recuperação e permite
  baixar o original exato, a configuração local e um backup bruto de IndexedDB.
- IndexedDB indisponível não autoriza fallback gravável no legado: isso poderia
  criar duas fontes de verdade. Retry é explícito; nenhum plano é reconstruído,
  substituído ou apagado para esconder um erro.
- `readRecoveryArchive()` lê todos os stores e suas chaves numa transação somente
  de leitura, sem versão solicitada, upgrade ou criação de banco. O JSON bruto
  é diagnóstico para recuperação; não é um arquivo de topologia diretamente
  importável e não há restauração automática de versões desconhecidas.
- Mudanças locais durante a abertura são comparadas com o snapshot anterior à
  operação. Retry mantém essa referência; não autoriza descartá-las. Exportar
  primeiro e recarregar é a decisão explícita para abandonar a cópia em memória.
  Uma remontagem com rede já ativa também exige recuperação/reload.
- Cancelar impede ativação tardia. Uma transação já confirmada pode permanecer
  no banco e será descoberta no retry; cancelar não apaga registros confirmados.
- CAS/revisões e conflitos entre abas continuam vigentes. Nenhuma falha inicia
  overwrite forçado, limpeza de caches para mascarar erros ou recriação de planos.

## Ciclo de página

`applicationLifecycle.ts` antecipa flush em blur, página oculta e pagehide. O
debounce do controller continua responsável pelo uso normal; falhas/conflitos
não recebem tentativas automáticas por esses eventos. Os listeners possuem
cleanup e não são instalados pelo simples import dos módulos de persistência.

`beforeunload` captura alterações aplicadas e solicita o aviso nativo quando há
gravações pendentes, comandos de persistência em curso, alterações locais durante
o boot ou formulários ainda não aplicados. Rascunho já confirmado em IndexedDB
**não** exige Save manual. Nomear/salvar um plano continua sendo outra operação.
O navegador decide se apresenta o aviso (por exemplo, exige interação prévia).
Não há promessa de completar operações assíncronas durante o encerramento,
nem proteção contra remoção do perfil, limpeza do navegador ou falha do disco.

## Validação e primeiro teste com dados reais

O runner `scripts/test-application-boot.mjs` reutiliza o Chromium/CDP existente,
com perfil temporário próprio, fixtures e bancos `netlab-idb-test-*`. Inclui
migração repetida, três abas modificadas, fechamento/reabertura do processo,
F5 de `app.html`, Save/Save As, JSON, Share Link, quota, ausência de IndexedDB,
documentos incompatíveis e exportações. A entrada normal também é exercitada:
somente no harness, o nome do banco é redirecionado para um banco descartável.
Nenhuma flag de teste foi adicionada ao boot de produção.

```powershell
node scripts/test-application-boot.mjs
node node_modules/vitest/vitest.mjs run
node node_modules/typescript/bin/tsc --noEmit
npm run build
git diff --check
```

O teste novo roda também na suíte completa, quando Chromium está disponível.
O runner gera capturas em `.playwright-mcp/reviews/`, fora do Git; os originais e
as capturas extras ficam preservados no fluxo Visual Review existente.

Para o primeiro teste manual, após os checks aprovados:

1. Exporte um JSON de segurança da topologia atual e guarde uma cópia externa.
2. Feche outras abas NetLab, inclusive versões antigas que ainda gravam no legado.
3. Use a **mesma origem** do navegador onde estão os dados (host, protocolo e
   porta fazem parte da origem); outro computador/origem não recebe IndexedDB
   ou localStorage através do Git.
4. Abra `/app.html`, confira a aba recuperada e o início pausado, altere algo
   pequeno e espere `Entwurf gesichert` antes de F5. Save As pode nomear o plano.
5. Se surgir recuperação, exporte os dados oferecidos; não limpe o storage nem
   tente substituir o conteúdo antigo por uma demo.

Os dados reais do usuário não foram usados para testar a migração.

## Servidor de desenvolvimento no Windows

`npm run dev` usa `http://localhost:5173/app.html`, com hostname explícito e porta
estrita, preservando a origem dos dados antigos. Não muda automaticamente de porta.
No desktop, o diagnóstico de 26/10/2026 encontrou uma exclusão TCP ativa
5143–5242 em IPv4 e IPv6, sem listener na 5173. Bind em `localhost`, `::1` e
`127.0.0.1` retorna `EACCES`. A faixa dinâmica TCP está em 1024–15000 nas duas
famílias. HNS, WinNAT e Hyper-V Compute estão ativos; WSL não está instalado.
Esses dados não identificam com certeza o proprietário da exclusão.

A porta 5400 foi testada como alternativa, mas é outra origem: os dados antigos
não aparecem automaticamente nela. Ela não permanece como padrão. Não limpar
o storage nem trocar o hostname para resolver o bloqueio. Mudanças nas reservas,
faixas dinâmicas ou serviços de rede exigem autorização prévia do usuário.

Após autorização, parar temporariamente somente WinNAT, iniciar o Vite na 5173
e religar WinNAT permitiu recuperar a origem antiga. `app.html` respondeu HTTP
200 antes e depois da restauração do serviço. Apenas o controle do serviço
exigiu UAC; o Vite foi iniciado sem elevação. Não foram alteradas manualmente
reservas, faixas dinâmicas ou configurações de Hyper-V/WSL, nem dados do navegador.
Essa operação não é uma correção permanente: o Windows pode voltar a reservar
a porta após reinicializações. O projeto não reinicia serviços automaticamente.
