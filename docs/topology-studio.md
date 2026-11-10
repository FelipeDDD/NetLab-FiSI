# Topology Studio (Beta)

### Cores do documento e controles de tabelas — 10/11/2026

Prévia e relatórios usam um esquema claro explícito somente dentro do documento,
com `color-scheme: only light`; o SVG independente também declara a proteção.
O tema do editor permanece intacto. Há um limite comprovado no Chromium quando
o escurecimento forçado é combinado com preferência de sistema clara; Vivaldi
não foi validado neste ambiente. Diagnóstico, testes e capturas antes/depois:
[document-colors.md](document-colors.md).

Removidos os parágrafos de instruções de arraste/escala. A seção de tabelas
continua expansível, contendo restaurar posições, lista e todos os controles,
sem alterar geometria, mecanismos de redimensionamento ou dados exportados.

### Simplificação final do snapshot — 08/11/2026

Após a auditoria abaixo, foi decidido usar somente a captura feita na abertura.
A seção `Dokumenthilfe & Aktualisieren`, seu botão, timestamp e texto de ajuda
foram removidos. Saíram também o setter/handler de atualização manual, o import
exclusivo da ação, quatro chaves de tradução nos três idiomas e o CSS exclusivo.
`Dokumentationsinhalte` continua disponível no Technical Report.

Fechar e reabrir captura os dados atuais do simulador e reaplica os ajustes
salvos pelo mecanismo existente. A prévia aberta permanece fixa mesmo quando
o simulador recebe um IP por DHCP; a simulação não é pausada automaticamente.
Persistência, reconciliação por IDs, snapshot interno e exportadores foram
preservados. Não foram criados alertas, controles ou sincronização contínua.

A revisão nativa passou com IP, rota e nome alterados, equipamento adicionado,
quatro layouts preservados, F5 e exportações reais SVG/PNG/HTML/PDF. Também
verificou ausência da seção nos três idiomas, presença dos conteúdos técnicos
e DHCP atualizado somente na reabertura. Os testes antigos que acionavam o
botão agora fecham/reabrem o Studio. Passaram os 195 testes relevantes,
TypeScript e diff-check; resultados em
`.playwright-mcp/reviews/studio-snapshot/native-final-results.json`.
Sem commit, push, merge ou deploy; alterações locais anteriores preservadas.

### Histórico: auditoria anterior do snapshot — 08/11/2026

A captura técnica é criada por `useState(capture)` ao montar o Studio. Fechar
remove o componente; reabrir captura novamente `sim.net` e os dados visuais
atuais. `restoreStudioPresentation` reaplica a apresentação salva e utiliza
`reconcilePageSession` por IDs estáveis. Não há snapshot técnico antigo no
envelope de apresentação. Esse fluxo já atendia à atualização na reabertura
e não foi reimplementado.

`Aufnahme aktualisieren` também tem utilidade com o Studio aberto: o modal
não pausa a simulação. Foi verificado um DHCP iniciado antes da abertura,
concluído pelo relógio normal do simulador enquanto o Studio permanecia aberto.
A prévia ficou com a captura anterior; clicar no botão mostrou o IP recebido
`10.20.1.100`, preservando a apresentação. Por isso, a condição solicitada para
remover a seção `Dokumenthilfe & Aktualisieren` não se confirmou. A seção, o
botão e o timestamp foram mantidos; nenhuma tradução ficou obsoleta.

Atualizar captura não descarta o draft: troca o DTO técnico em memória e
reconcilia posições, dimensões/configurações de tabelas, aliases, textos e os
quatro formatos. A altura natural de uma tabela pode mudar quando suas rotas
mudam. A apresentação permanece no draft pelo autosave existente. Descartar
um draft é outra operação, explícita no workspace, que descarta suas alterações
não salvas, inclusive as da apresentação; a atualização do Studio não chama
esse mecanismo.

Limites existentes: novos dispositivos ficam disponíveis nos seletores, mas
não são automaticamente acrescentados a uma seleção já personalizada. IDs
removidos são reconciliados; uma tabela cujo equipamento foi removido mantém
sua identidade/configuração e sinaliza a falta de dados. Campos desconhecidos
ou incompatíveis continuam usando os avisos e as proteções existentes, sem
substituição automática apenas por abrir o Studio. Rotas RIP aprendidas e
caches não integram a documentação; rotas estáticas, redes conectadas e
gateways de interface são capturados.

Validação: `node scripts/test-studio-snapshot.mjs`, em perfil/banco descartáveis,
cobre três cenários novos: alterar IP/rota/nome e adicionar equipamento com o
Studio fechado; reabrir/F5 preservando os quatro layouts e textos; exportar
SVG/PNG/HTML/PDF; concluir DHCP com o Studio aberto e atualizar a captura.
Os 195 testes relevantes de Studio/metadados e TypeScript passaram.
Evidências em `.playwright-mcp/reviews/studio-snapshot/`. Não foram feitas
capturas de tela porque não houve mudança visual. Nenhuma alteração de
produção, geometria, simulador, commit, push, merge ou deploy nesta auditoria.

Abra **Datei → Exportieren → Topology Studio (Beta)**. A ferramenta prepara um
documento separado; não altera a configuração da rede nem pausa a simulação.
A apresentação é salva automaticamente no draft do plano pelo armazenamento existente.
Os exportadores anteriores continuam disponíveis e mantêm a implementação anterior.

## Utilização

- **Clean Diagram:** diagrama monocromático com nomes, A4 horizontal inicialmente.
- **Technical Report:** diagrama com IPv4/interfaces, inventário, interfaces dos
  routers/firewalls, tabelas de roteamento desses dispositivos e conexões físicas.
- **Presentation:** texto maior, cabos/acentos coloridos e Markierungen suaves.

Os presets são pontos de partida. Depois, escolha conteúdo, dispositivos e cor,
papel A4/A3, orientação, margens e tamanho do texto. Cada seção possui sua própria
seleção de dispositivos, independente dos dispositivos visíveis no diagrama.
O título e o subtítulo do trabalho são personalizáveis; a assinatura discreta
**NetLab-FiSI · Topology Studio** permanece em todas as páginas exportadas.
Data de captura e formato da folha não aparecem como texto no documento.
O rodapé opcional é independente e preserva as datas digitadas pelo usuário.
Na interface atual, o nome do software é fixo no topo da folha, com a assinatura
abaixo e a linha horizontal. Título/subtítulo opcionais ficam centralizados
depois da linha. Campos vazios não acrescentam texto; o antigo título padrão
exato `NetLab-FiSI` é recuperado como campo vazio para evitar duplicação.
As opções ficam em seções recolhíveis: Documento, Conteúdo do diagrama,
Dispositivos e nomes de apresentação, Blocos de documentação e, no Technical
Report, Conteúdos da documentação. As marcações do canvas são preservadas nos
dados, mas não são desenhadas pelo Studio. Os detalhes atuais estão na seção
de refinamento da interface ao final deste documento.
Posições e tamanhos de apresentação ficam separados por A4/A3 e retrato/paisagem
inclusive após fechar e reabrir: uma primeira visita começa com geometria própria; voltar recupera
os ajustes daquele formato. Presets mantêm a folha ativa.
A tabela de conexões contém apenas cabos cujas **duas** extremidades estão
selecionadas nessa seção. Associações WLAN são tracejadas no diagrama e ficam
fora da tabela física. Ocultar um equipamento nunca cria cabos entre seus vizinhos.

Nomes de apresentação valem somente para o diagrama. Tabelas técnicas mantêm os
nomes reais para não confundir uma personalização visual com a configuração.
Título, subtítulo, anotação livre e nota de rodapé são escapados como texto, não interpretados.
**Mover diagrama** ativa a translação conjunta dos equipamentos e das áreas visíveis,
com desfazer próprio. **Nota de rodapé** fica vazia por padrão e aceita três linhas;
em relatórios com várias páginas, aparece somente na última. A observação técnica
fixa antiga foi removida. Os detalhes e limites atuais estão na seção final.

A captura fica fixa durante a edição. Fechar e reabrir captura novamente os
dados técnicos, mantém aliases/seleções de IDs sobreviventes e disponibiliza
novos dispositivos nos seletores sem incluí-los automaticamente. Para selecionar
tudo novamente, utilize **Alle** no seletor ou redefina o preset.

O zoom da prévia é independente do React Flow. SVG e PNG exportam o diagrama;
HTML exporta o documento com as seções selecionadas e CSS próprio. **Drucken /
Als PDF speichern** imprime o iframe do documento, não o editor. No diálogo do
navegador, escolha a impressora ou **Salvar como PDF**. Não há download direto de
PDF. O navegador/impressora ainda pode substituir tamanho, margens e escala;
confira essas opções antes de confirmar a impressão.

Fora de um arraste, Escape e o botão de fechar encerram o Studio e restauram o foco
na toolbar. As escolhas de apresentação permanecem no draft. O snapshot técnico,
estado do terminal, caches e histórico temporário não são persistidos pelo Studio.
Ao reabrir, uma nova captura da rede atual alimenta a apresentação recuperada.

**Estado atual:** a seção “Persistência da apresentação e correções do canvas” ao
final documenta a persistência implementada. As seções anteriores de cada etapa
registram sua validação histórica; referências nelas a descarte ao fechar ou
ausência de persistência foram substituídas por esta implementação.

## Arquitetura

Implementação isolada em `src/export/studio/`:

| Arquivo | Responsabilidade |
| --- | --- |
| `model.ts` | Captura síncrona de DTOs próprios, interfaces, configurações de rotas/serviços, conexões e geometria nominal das áreas. Não retém referências ao motor. |
| `options.ts` | `PrintDocumentOptions`, `DiagramOptions`, `ReportSectionOptions`, presets e reconciliação por IDs estáveis. |
| `pageLayouts.ts` | Estado de sessão compartilhado, quatro variantes de geometria, materialização do documento ativo e refresh por IDs. |
| `persistence.ts` | Recuperação da apresentação validada, reconciliação com a captura atual e preparação segura da folha ativa. |
| `../../studioPresentation.ts` | Metadados JSON versionados, validação e cópia sem snapshot técnico ou estado temporário. |
| `diagram.ts` | SVG vetorial branco, ícones próprios, nomes, endereços, cabos e áreas. |
| `geometry.ts` | Medição de texto, cards adaptativos, afastamentos locais, endpoints nas bordas e desvios simples dos cabos, exclusivos do documento derivado. |
| `page.ts` | Área imprimível única, cabeçalho/rodapé e coordenadas usadas por prévia, SVG, PNG, HTML e impressão. |
| `routingBlocks.ts` | Filtros, composição intrínseca, escala física, limites e SVG das Routing Tables, derivados apenas do snapshot. |
| `StudioBlocksPanel.tsx` | Controles independentes de dispositivo, filtros, colunas, largura, posição e remoção dos blocos. |
| `useStudioBlockDrag.ts` | Arraste pelo cabeçalho, ajuste de largura e escala proporcional, com coordenadas de documento e Escape. |
| `devicePositions.ts` | Centros manuais por ID, conversões documento/topologia, limites e conversão do ponteiro compartilhada. |
| `compactLayout.ts` | Uma passagem conservadora de aproximação entre vizinhos conectados, com validação da geometria renderizada. |
| `alignmentGuides.ts` | Bordas/centros reais, candidatos de snap por eixo e recusa de sobreposições/limites. |
| `useStudioDeviceDrag.ts` | Seleção/arraste dos equipamentos, snap/guias transitórias, atualização ao vivo dos cabos e Escape. |
| `report.ts` | Tabelas independentes, filtros e HTML autocontido com paginação conservadora e regras de impressão. |
| `preview.ts` | Escala exclusiva da interface para Fit Width e Fit Page, sem modificar o documento. |
| `TopologyStudio.tsx` | Modal nativo, controles, snapshot na abertura, zoom, downloads e impressão. |
| `messages.ts` | Catálogo DE/EN/PT-BR; reutiliza `translateMessages` e o idioma global. |
| `studio.css` | Layout do Studio usando os tokens dos temas da aplicação. |

A toolbar acrescenta somente a entrada e o carregamento dinâmico do modal. O
Studio pode ser removido retirando essa integração, sem afetar o simulador ou os
exports antigos. Não há alterações de engine, controllers, schemas ou storage.

### Rotas e estados

As tabelas documentam as rotas estáticas configuradas, redes conectadas de
interfaces UP com IPv4 e defaults oriundos de gateways de interface. A deduplicação
de defaults segue o comportamento de `IpDevice.routes()`; o próximo salto e a
interface são campos distintos. Uma rota /0 é identificada como default, além de
sua origem. Os filtros são todas, estáticas/default e conectadas.

**Rotas RIP aprendidas ficam de fora deliberadamente.** `routes()` expira seu
cache RIP no motor, por isso o Studio não a chama na rede viva. Esta versão
documenta configuração, não uma promessa de conectividade ou a seleção efetiva
para todo destino. A nota no documento explica essa limitação. Uma futura API de
consulta não mutável poderá acrescentar RIP com identificação do instante.

Estados de interface/link e endereços DHCP são observações no momento da captura;
não se tornam configuração permanente. Não são exportados ARP, MAC learning,
eventos do Scheduler, leases, contadores ou comandos ativos. DHCP é apresentado
como configuração de pools (inclusive os desabilitados), não como prova de serviço
operacional. DNS, porta HTTP, portas adicionais, forwarding e regras nftables são
opcionais; páginas HTML servidas e conntrack não são copiados.

### Geometria e impressão

As coordenadas originais são a referência comum dos centros dos cards. O conteúdo
visível define largura e altura: nomes e informações são medidos com as fontes
do SVG no navegador, com quebra de palavras/tokens longos e sem reduzir IPs a
fontes minúsculas. A largura fica entre 112 e 304 unidades; a altura cresce com
as linhas necessárias. Sem DOM, a medição usa uma estimativa conservadora.

Somente pares em colisão recebem pequenos afastamentos, preferindo a direção da
separação original, inclusive em diagonais, sem inverter esquerda/direita ou acima/abaixo. Dispositivos
distantes não se movem para distribuir espaço. Reparos locais podem causar
pequenas diferenças de alinhamento entre cards de alturas distintas. Se os
reparos limitados não bastarem, o espaço da forma original é ampliado
proporcionalmente; posições coincidentes usam IDs estáveis como desempate, pois
não existe uma direção original a preservar. Não há formação de linhas/colunas,
auto-layout do grafo nem alterações do snapshot/editor.

Os cabos são calculados depois dos tamanhos e afastamentos. Saem e chegam às
bordas de seus cards reais; uma reta é preferida. Havendo um card no caminho,
tentam-se apenas desvios simples de uma ou duas dobras. Etiquetas conservam os
nomes das interfaces e procuram espaços livres junto ao respectivo extremo,
considerando também as etiquetas já colocadas. Cabos, dobras, etiquetas e títulos
das áreas entram nos limites utilizados pelo ajuste proporcional à página. O
aviso de densidade considera a menor fonte visível e colisões sem solução.
Os ícones continuam vetoriais, sem reutilizar ou modificar os PNGs do canvas.

Não há garantia de preservação pixel a pixel nem roteamento perfeito em redes
arbitrariamente densas: obstáculos que exigem mais dobras e etiquetas sem espaço
podem permanecer, com o aviso de densidade. Nesses casos, prefira A3, seleção de
um subconjunto ou SVG ampliável. Não se inventam conexões para resolver geometria.

Markierungen usam `markingBounds()` a 1× nominal e `unionPath()` existentes,
incluindo extensões, deslocamento e tamanho de texto. A representação é aproximada:
ícones/cards têm dimensões diferentes dos assets e o afastamento dos cards pode
colocá-los além dos limites originais das áreas. Áreas não são redes/VLANs.

O diagrama é ajustado à página; topologias muito extensas podem ficar pequenas
em A4. A interface avisa quando a escala reduz a legibilidade. A3, texto maior,
seleção de um subconjunto ou SVG ampliável são alternativas. Não há mosaico de
um diagrama em várias folhas nesta versão.

As tabelas mantêm seu tamanho de texto, continuam por linhas, repetem cabeçalhos
e permitem quebras naturais de impressão sem recortar conteúdo em alturas fixas.
A paginação prévia estima a altura das linhas de forma conservadora. Textos
extraordinariamente longos, fontes substituídas pelo sistema e opções do diálogo
de impressão podem mudar a distribuição final; o browser pode continuar páginas
sem cortar texto. A impressão foi conferida em A4/A3, ambas as orientações.

## Extensão futura e limites

- Novo preset: acrescentar ao tipo/`printPreset()`, seletor e catálogo.
- Nova seção: tipo e `REPORT_SECTIONS`, coletor DTO e `reportTables()`; criar testes
  dos dados reais e de seleção/escape antes de expor o controle.
- Novo símbolo: adicionar ao mapa SVG em `diagram.ts`, sem alterar assets do editor.
- Opções só vivem na sessão do modal. Persistência por plano,
  reordenação de seções, legendas avançadas e geração direta de PDF ficaram para
  depois. Não há segundo React Flow ou editor gráfico. Os blocos de Routing Table possuem arraste de apresentação, separado dos cards dos equipamentos.

## Validação reproduzível

```text
npm test -- src/export/studio src/export/export.test.ts src/i18n/i18n.test.ts
node scripts/test-studio-geometry.mjs
node scripts/test-topology-studio.mjs
node scripts/test-topology-blocks.mjs
node scripts/test-topology-devices.mjs
npm test
npm run build
git diff --check
```

O roteiro usa o harness Chromium/IndexedDB existente com perfil e banco
descartáveis, downloads isolados e verificação de ausência de bancos vazados.
Confere um documento com mais de dez dispositivos, três routers, seleção,
aliases, refresh, filtros, downloads SVG/PNG/HTML reais, impressão nativa e PDFs
via CDP nas quatro combinações de papel/orientação. Testa três idiomas, quatro
temas e 700/1440 px, além de fechamento, foco e integridade do plano.

Capturas principais ficam em `.playwright-mcp/reviews/`; fontes, exemplos
baixados e PDFs de inspeção em `raw/topology-studio-staging/`. O gerador Visual
Review arquiva as capturas anteriores sem apagar os originais. Todos esses
artefatos são ignorados pelo Git.

### Etapa 1 — regressões geométricas

`geometry.fixture.ts` reproduz A/B/C acima do Zentralrouter D, com switches e
computadores acima; inclui também os documentos reais dos Capítulos 4 e 5,
redes horizontal/vertical, dispositivos próximos/coincidentes, nomes longos,
múltiplas interfaces e um cabo com obstáculo intermediário. A referência visual
mostra esquematicamente as coordenadas de entrada, sem capturar ou modificar o
canvas do simulador.

`test-studio-geometry.mjs` usa Chromium descartável para conferir 396 combinações
(11 cenários × 3 presets × A4/A3 × 2 orientações × 3 tamanhos de texto). Mede os
`getBBox()` reais de textos/cards/etiquetas, ordem relativa, colisões, endpoints,
interseções de cabos, corte na página e imutabilidade dos dados. Gera SVGs,
capturas e quatro PDFs do cenário dos quatro routers em
`.playwright-mcp/reviews/topology-geometry/`. O roteiro integrado continua
verificando downloads reais SVG/PNG/HTML e impressão nativa.

Para registrar uma base antes de outra alteração, copie `diagram.ts` para
`diagram-before.ts` nesse diretório e execute o roteiro com `--before`. Ele
conserva essa implementação para comparar com o renderer atual. Sem a cópia,
`--before` registra a implementação vigente. Depois execute sem argumentos;
`comparison-four-routers.png` e `.html` mostram referência, antes e depois,
com o diagrama ampliado para inspeção. As capturas individuais mantêm também
o enquadramento da página para avaliar o espaço utilizado.

Na validação de 06/11/2026, as 396 combinações passaram sem inversões, colisões
entre cards/etiquetas, texto cortado ou cabos atravessando cards. Os downloads
reais SVG/PNG/HTML e a impressão/PDF também passaram no roteiro integrado. O
cenário dos quatro routers foi reproduzido a partir da descrição; não havia um
arquivo de projeto fornecido para essa topologia.

O launcher do Edge instalado neste Windows pode sair antes do processo real do
navegador e causar falhas de inicialização/limpeza nos harnesses existentes.
Para a revisão local foi usado um preload descartável, em
`.playwright-mcp/reviews/topology-geometry/edge-launcher-preload.mjs`, que passa
`--edge-skip-compat-layer-relaunch` ao Edge. Nenhum harness existente foi alterado
para esse contorno; logs das tentativas e das execuções finais estão no mesmo
diretório. O novo roteiro de geometria já inclui essa flag quando detecta Edge.

Resultado final: **152 arquivos / 2.786 testes passaram**, executados com
`--maxWorkers=2 --minWorkers=1` e o adaptador local do Edge. TypeScript, build,
roteiro original completo do Studio e `git diff --check` também passaram. A
checagem de whitespace foi aplicada ainda aos novos arquivos não rastreados.


## Etapas 1.5 e 2 — hierarquia e Routing Tables na página

### Cards dos equipamentos

Switches priorizam ícone e nome, com tipo opcional. Ativar **Schnittstellen** não
empilha mais portas no card do switch. **Schnittstellen am Kabel** identifica cada
extremidade pela tupla dispositivo/interface do link real. As tabelas convencionais
de interfaces/conexões continuam completas e independentes.

Routers e hosts separam nome/tipo, interfaces IPv4/CIDR e um rodapé opcional.
Desativar interfaces mantém os IPs na ordem do snapshot. Interfaces conectadas
sem endereço podem mostrar seu nome, quando solicitado, sem fabricar um IPv4.
**Gateways / Default-Routen** inclui gateways configurados, identificando a
interface, e cada rota estática /0 real, incluindo defaults sem próximo salto.
Não se escolhe um gateway único quando existem vários e não se coloca uma
Routing Table inteira dentro do equipamento. Nomes, tipo, corpo e rodapé entram
no cálculo das dimensões; IPs continuam sem redução microscópica de fonte.

O checkpoint 1 foi validado antes de iniciar os blocos: 51 testes do Studio,
TypeScript/build e 396 combinações geométricas no Chromium passaram.

### Adicionar e configurar um bloco

1. Abra **Dokumentationsblock hinzufügen → Routing Table**.
2. Escolha um dispositivo com uma fonte de rotas coerente no snapshot. Switches
   sem pilha IP não aparecem nesse seletor; hosts/servidores com pilha IP podem
   documentar suas próprias rotas, inclusive uma tabela vazia.
3. Escolha todas as rotas capturadas, somente estáticas, diretamente conectadas
   ou defaults. O filtro estático inclui uma /0 estática; o filtro default inclui
   todas as /0 disponíveis, inclusive gateways de interface capturados.
4. Adicione o bloco. Cada adição explícita cria um ID independente. Atualizar a
   prévia, o zoom ou o snapshot não cria cópias. A seção visual é habilitada se
   estava oculta, sem habilitar seções técnicas adicionais.

Cada bloco possui seus próprios filtros de interfaces de saída, colunas e largura
compacta/normal. A coluna Destination é fixa; Next Hop, Dev e Origin são opcionais.
O filtro de interface restringe o filtro de tipo e nunca o substitui. Nenhuma
interface selecionada significa **nenhuma rota**, não todas silenciosamente.
O contador `visíveis / capturadas`, somente no painel de configuração do bloco, identifica o efeito dos filtros.

Os blocos usam os nomes reais dos dispositivos para documentação técnica; aliases
continuam exclusivos dos cards. Rotas conectadas, gateways e estáticas vêm do DTO
capturado pelo Studio. RIP aprendido continua fora da captura, conforme a nota
do documento. Renderizar ou arrastar não consulta o motor nem observa pings.

### Posição, escala e recuperação

Arraste pelo cabeçalho. O movimento usa o sistema de coordenadas da área
imprimível, em pixels de documento a 96 dpi; os controles X/Y apresentam essas
coordenadas em milímetros. A posição não pertence ao viewport nem ao zoom do
iframe. O contorno muda discretamente durante o arraste; ao soltar, a posição
entra nas opções de apresentação. Escape cancela o movimento atual e preserva
o Studio; fora de um arraste, fecha o modal como antes. X/Y também permitem
reposicionamento por teclado.

A posição inicial procura cantos/margens e uma grade simples de espaços livres,
considerando cards, etiquetas, cabos e outros blocos. Não modifica a topologia
nem posições já escolhidas. Se não encontrar espaço, usa uma posição previsível
e mostra aviso de sobreposição. **Diagrammskalierung** reduz apenas o desenho
da rede para liberar espaço; é diferente de **Vorschauzoom**, que só muda a
visualização. Adicionar, mover ou remover tabelas não recalcula o enquadramento
da rede; a área para a nota técnica já é reservada antes do primeiro bloco.

**Position wiederherstellen** procura novamente uma posição inicial para aquele
bloco, mantendo os demais. **Alle Blockpositionen wiederherstellen** repete essa
operação para todos, na ordem dos blocos. Não são Undo/Redo nem um histórico de
posições. Remover um bloco não remove o equipamento ou qualquer rota.

O arraste fica limitado ao conteúdo imprimível, abaixo do cabeçalho e acima das
notas. Mudanças de papel, margens ou tamanho do conteúdo podem limitar a posição
exibida para manter o bloco dentro dessa área. Um bloco não empurra outro.

### Prévia e exportações

A primeira página visual do HTML incorpora **o mesmo SVG completo** usado pelo
download SVG e pela rasterização PNG, incluindo título, assinatura e notas. O PDF
imprime essa mesma página. Não há posição de tabela aplicada apenas por CSS na
prévia. Os blocos ficam fora da transformação do desenho da rede, diretamente
nas coordenadas da página, e conservam tamanho físico proporcional entre formatos.

Clean Diagram e Presentation não criam tabelas automaticamente. Technical Report
mantém suas seções convencionais. Os blocos são preservados quando se troca o
preset; a nota nos controles explica que as tabelas convencionais são independentes
e podem ser incluídas junto com os blocos. Só adicionar blocos não gera páginas
técnicas extras. Ocultar explicitamente a seção visual os omite de HTML/impressão;
eles continuam disponíveis no SVG/PNG e nas opções do Studio.

### Refresh e limites

Refresh atualiza os dados de uma só vez e conserva IDs, posições e filtros dos
blocos. Filtros de interfaces removidas são restringidos aos nomes ainda válidos;
se nenhum sobreviver, a seleção permanece vazia. Um dispositivo removido conserva
o bloco associado ao mesmo ID, com aviso explícito e sem exibir rotas antigas.
É preciso escolher outro dispositivo explicitamente para substituir a associação.

Não há roteamento perfeito de tabelas nem detecção sofisticada de espaços livres.
Sobreposições escolhidas manualmente geram aviso, sem mover automaticamente a
rede ou outros blocos. Use A3, reduza a escala do desenho, altere a largura/colunas
ou filtre rotas. Uma tabela maior que a área disponível conserva todas as linhas
na prévia, identifica a limitação e bloqueia os exports que a incluiriam; isso
evita gerar um arquivo silenciosamente cortado. Um relatório convencional com a
seção visual desativada continua exportável independentemente desse bloco.

Ao concluir a Etapa 2, somente Routing Tables tinham arraste; a Etapa 3 abaixo
acrescenta os cards. A Etapa 3.5 acrescenta largura por arraste e Fit Page. Continuam fora de escopo
edição de cabos, altura manual, persistência permanente dos blocos ou
alterações do simulador, tutoriais e Markierungen. Fechar o Studio descarta tudo.

### Evidências reproduzíveis

`node scripts/test-topology-blocks.mjs` executa o roteiro original do Studio e
mais sete cenários de blocos: rede simples; A/B/C acima de D com duas/três tabelas
em A4/A3; arraste em zoom ajustado/50%/125% e cancelamento; filtros/colunas/presets
e recuperação; refresh/remoção; conteúdo denso/oversized; impressão nativa e PDFs.
Há comparação das coordenadas/conteúdo com downloads reais SVG, PNG e HTML,
checagem do texto renderizado, do plano intacto e da ausência de páginas extras.

As evidências desta rodada estão em `.playwright-mcp/reviews/topology-blocks/`:

- `cards-before-after.png`: hierarquia anterior e nova, usando a cópia inicial
  do renderer conservada em `before/src/` antes do checkpoint 1.
- `01-one-table.png`, `03-two-tables.png`, `04-three-tables-a4.png` e
  `05-three-tables-a3.png`: prévia real do Studio.
- `one-table-preview-export.png`, `two-tables-preview-export.png` e
  `three-tables-preview-export.png`: SVG da prévia ao lado do PNG baixado.
- `three-tables-A4.pdf` e `three-tables-A3.pdf`: páginas reais de impressão.
- `06-removed-device.png` e `07-dense-two-tables.png`: avisos e limitações.

As comparações de imagem podem apresentar diferenças de antialiasing entre SVG
inline e PNG; texto, posições e dimensões usam o mesmo modelo. O contorno de
arraste e os controles do Studio ficam só na prévia e não são exportados.

O contorno descartável do launcher do Edge, já descrito acima, foi reutilizado
para os harnesses existentes no Windows. A integração acrescentada está em
`scripts/topology-blocks-review.mjs`, sem modificar sistemas centrais.

Validação final desta rodada: **154 arquivos / 2.799 testes passaram** na suíte
completa; os **124 testes direcionados** passaram após os últimos ajustes visuais.
Também passaram TypeScript/build, `git diff --check`, a matriz de 396 combinações
geométricas e os sete cenários nativos de blocos, incluindo DE/EN/PT-BR, limites
de arraste, três zooms, filtros de interface, PDF A4/A3 e relatórios convencionais
com um bloco oversized excluído da seção visual. Não houve erros de navegador.


## Etapa 3 — reposicionamento manual dos equipamentos

Clique em um card na prévia para selecioná-lo e arraste o próprio card para
ajustar sua posição de apresentação. Não há handles nem edição de IPs, rotas,
interfaces ou conexões. O contorno identifica o equipamento ativo; durante o
movimento, fica destacado e pode indicar uma colisão. Os cabos acompanham o card
antes de soltar o ponteiro. Soltar confirma o centro escolhido; Escape durante
o arraste cancela o movimento e mantém o Studio aberto.

A barra discreta acima da prévia mostra o equipamento selecionado e contém:

- **Position wiederherstellen:** remove apenas a posição manual do selecionado
  e volta à posição automática calculada para o snapshot/opções atuais.
- **Alle Gerätepositionen wiederherstellen:** remove todas as posições manuais
  dos equipamentos. As Routing Tables, seus filtros e suas posições permanecem.

Um clique sem movimento apenas seleciona o card; não cria uma posição manual.
Fora de um arraste, Escape continua fechando o Studio. Os destaques de seleção
e movimento são exclusivos da prévia; a impressão nativa os remove temporariamente
e os restaura depois. Exportar SVG/PNG/HTML não inclui esses destaques.

### Coordenadas e aplicação das posições

`PrintDocumentOptions.devicePositions` associa IDs estáveis ao **centro do card
em pixels de documento**, a 96 dpi, relativos à área imprimível. Não guarda pixels
da janela nem do zoom. O snapshot e as posições reais dos dispositivos não recebem
nenhuma escrita. As posições continuam descartáveis ao fechar o modal.

O layout automático original faz a separação local e o ajuste proporcional à
página. Somente depois são aplicados os centros manuais, convertidos pela inversa
da transformação do desenho. Eles não participam dos limites usados para ajustar
o desenho à página. Assim, arrastar um card não muda a escala, o enquadramento,
outros cards, as Routing Tables ou a posição das Markierungen.

O componente memoriza essa referência automática. Alterar centros manuais ou
editar tabelas não executa novamente a separação/ajuste. Durante o arraste, apenas
o card ativo e as camadas de cabos/etiquetas são atualizados, uma vez por quadro,
sem recarregar o iframe. A posição entra nas opções ao soltar. A conversão do
ponteiro usa o mesmo helper de coordenadas das Routing Tables, com a matriz do
SVG no espaço client do iframe; Fit Width, 50%, 100% e 125% foram conferidos.

As conexões continuam sendo as do snapshot. Seus endpoints são recalculados nas
bordas atuais dos cards; desvios simples e etiquetas usam os mesmos renderizadores
da exportação. Os nomes das portas vêm das extremidades reais dos links. O caminho
não é deduzido pela proximidade dos equipamentos.

### Conteúdo, papel, recuperação e snapshot

Alterar conteúdo, preset, papel, margens ou escala pode modificar as dimensões e
a referência automática, como antes. Centros manuais válidos são mantidos em
coordenadas de documento; se necessário, são limitados previsivelmente à área de
conteúdo imprimível. O tamanho do card acompanha o conteúdo atual. Não há uma nova
resolução de colisões aplicada às posições manuais.

Os presets e **Vorlage zurücksetzen** mantêm os ajustes dos equipamentos e das
tabelas. Use os controles específicos de recuperação para restaurar as posições.
Refresh conserva centros associados a IDs sobreviventes e elimina os de IDs
removidos. Nomes semelhantes não transferem uma posição antiga para outro ID.
Um equipamento oculto por seleção pode conservar seu ajuste enquanto existir no
snapshot. A seleção ativa é limpa quando o dispositivo deixa de existir.

Markierungen continuam na posição/limites anteriores da apresentação. Um card
pode sair temporariamente da área colorida; isso não modifica a área, não muda
grupos e não atribui subnet/VLAN. Ainda não existe agrupamento automático.

### Exportação e limites conhecidos

A geometria final é usada pelo mesmo SVG da prévia, download SVG, PNG, primeira
página do HTML e impressão/PDF. O movimento transitório do ponteiro não é um layout
CSS separado: ao soltar, a posição confirmada produz esse mesmo modelo comum.

Cards são limitados à área de conteúdo imprimível; cabos e etiquetas recalculados
também procuram permanecer nela. Sobreposições com outros cards ou tabelas geram
aviso, sem mover os outros elementos. Caminhos que exigem mais dobras que o desvio
simples atual podem continuar atravessando cards, com aviso. Conexões entre cards
deliberadamente sobrepostos podem ficar pouco visíveis; não são substituídas.

Uma mudança de papel/orientação pode aproximar posições absolutas que antes
cabiam em uma folha maior. Não há compensação automática entre equipamentos e
tabelas: reposicione, restaure o elemento desejado ou use folha/escala adequadas.
Se uma tabela cobrir um equipamento, mova a tabela pelo cabeçalho para acessar o
card ou use a recuperação de todas as posições dos equipamentos. Não há mudança
automática de ordem de empilhamento nem envio de elementos para trás/frente.

Até a Etapa 3, não havia maximização, Fit Page ou resize das tabelas; essas
interações estão descritas na Etapa 3.5 abaixo. Continuam fora de escopo
persistência permanente, novos presets, edição do projeto real e Undo/Redo.
As apresentações de interfaces/gateways e as tabelas convencionais permanecem.

### Checkpoints e evidências

O checkpoint 1 foi validado antes da interação: 65 testes do Studio e TypeScript,
incluindo centros de documento, tamanho variável, limites, IDs e geometria fixa
dos demais elementos. O checkpoint 2 validou arraste nativo, endpoints e exports
antes da revisão visual final. A matriz automática de 396 combinações continuou
passando, com o mapa manual vazio.

`node scripts/test-topology-devices.mjs` executa também as regressões anteriores
do Studio e dos blocos. Os oito cenários de equipamentos cobrem: router com dois
computadores; B lateral/D vertical na rede dos quatro routers; duas tabelas fixas;
conteúdo variável; quatro zooms, A4/A3, orientações, margens, limites e presets;
SVG/PNG/HTML/PDF e impressão sem destaque; recuperação; refresh e remoção de IDs.

Os arquivos estão em `.playwright-mcp/reviews/topology-devices/`:

- `01-small-original.png` e `02-small-adjusted.png`: rede pequena antes/depois.
- `03-four-original.png` e `04-four-adjusted.png`: quatro routers antes/depois.
- `05-devices-and-tables.png`: equipamentos ajustados com duas Routing Tables.
- `06-content-resized.png` e `07-restored-devices.png`: conteúdo e recuperação.
- `devices-and-tables-preview-export.png` e `final-adjusted-preview-export.png`:
  comparação da geometria da prévia com o PNG realmente baixado.
- `adjusted-A4-landscape.pdf`, `adjusted-A4-portrait.pdf` e equivalentes A3:
  documentos reais, com coordenadas/conteúdo verificados antes da impressão.

O contorno local descartável do launcher do Edge continua documentado na etapa
anterior. Nenhum sistema central foi modificado para implementar o arraste.

Validação final da Etapa 3: **155 arquivos / 2.806 testes passaram** na execução
completa sem concorrência; **131 testes direcionados**, os oito cenários nativos
e as 396 combinações geométricas também passaram. TypeScript, build e
`git diff --check` passaram, incluindo whitespace dos arquivos não rastreados.
A primeira execução concorrente teve uma falha de inicialização do Edge; a
execução final usou `--maxWorkers=1 --minWorkers=1` e o mesmo contorno local do
launcher, sem alterar os harnesses para resolver isso. Não houve erros de
navegador na revisão dos equipamentos, blocos e exports.

## Etapa 3.5 — Usabilidade e acabamento

### Checkpoint 1: tabelas compactas e gateways

O contador de rotas visíveis/capturadas aparece somente no painel de configuração
de cada bloco. O SVG compartilhado não contém o contador nem reserva sua antiga
faixa de 25 px. Título, cabeçalho e linhas têm espaçamento vertical discretamente
menor, com as mesmas fontes de 11/12/13 px. A altura resulta das linhas realmente
visíveis, incluindo quebras e mensagens de seleção vazia/dispositivo removido.

Nas tabelas flutuantes, rotas diretamente conectadas usam Connected / Direkt /
Conectado. Um Next Hop real permanece literal. As tabelas técnicas convencionais
e os dados capturados não mudaram.

Nos cards, um gateway configurado é omitido apenas se uma rota /0 capturada
possuir exatamente o mesmo par (interface, próximo salto). Esse par aparece
como Default; pares diferentes continuam separados. Defaults duplicados de
origens distintas só se unem visualmente quando esse par é idêntico. Uma rota
específica não participa da deduplicação; um gateway sem /0 continua Gateway.

### Checkpoint 2: maximização e Fit Page

Maximieren / Wiederherstellen usa o viewport com 6 px de margem. Restaurar
reaplica as dimensões normais do modal; não usa a API de fullscreen. Em telas
pequenas continuam valendo as regras responsivas do Studio.

Ganze Seite / Fit Page / Página inteira considera largura e altura disponíveis,
incluindo as bordas e o entorno da folha. Recalcula com ResizeObserver ao
maximizar, restaurar e mudar a janela. Mantém a folha atual de um relatório com
várias páginas; não reduz o relatório inteiro a uma única miniatura. O espaço
externo da prévia foi reduzido de 12 para 8 px. Fit Width e os zooms manuais
continuam disponíveis. `preview.ts` calcula exclusivamente a escala da interface;
papel, escala do diagrama e coordenadas físicas não são alterados.

### Checkpoint 3: largura por arraste

O canto inferior direito aparece ao passar o ponteiro sobre a tabela ou
selecioná-la. Arrastá-lo ajusta somente a largura; o cabeçalho continua movendo
o bloco. A borda esquerda e o topo permanecem fixos durante o resize. Colunas,
quebras e altura são recalculadas com todas as rotas, sem altura manual ou
truncamento de IP/CIDR. Escape cancela o gesto e restaura a geometria anterior.

`RoutingBlockOptions.customWidth` guarda a largura em pixels físicos de documento
(96 dpi), apenas durante a sessão. Presets, zoom e refresh conservam esse valor.
O dropdown mostra a largura personalizada em mm; escolher Compact/Normal remove
o valor personalizado e recupera a largura padrão. X/Y continuam editáveis por
teclado na seção inicialmente recolhida Erweiterte Positionierung / Advanced
positioning / Posicionamento avançado.

O mínimo depende das colunas: 180 px mais 45 px por coluna opcional. O máximo
é a distância da borda esquerda até o limite direito imprimível. Para expandir
mais, mova primeiro a tabela para a esquerda. Se estreitar aumentaria a altura
além do espaço inferior, o gesto para na largura que ainda mantém as rotas
inteiras. Nenhum outro bloco, card, cabo ou Markierung é deslocado.

Em papel/orientação menores, o desenho limita a largura ao espaço disponível e
reposiciona apenas o próprio bloco quando necessário para mantê-lo na folha.
A largura solicitada permanece na sessão e volta a ser usada em papel maior.
Conteúdo que não cabe nem na largura máxima conserva todas as linhas e o aviso
de tamanho excedido; exportações visuais continuam bloqueadas até a correção.
Não há redistribuição automática entre tabelas e equipamentos.

O hook de arraste existente também trata resize. Durante o gesto somente o
conteúdo do bloco ativo é redesenhado. A captura do ponteiro fica em uma camada
SVG separada, para sobreviver às quebras de texto. Ao soltar, uma atualização
do modelo gera o mesmo SVG da prévia, PNG, HTML e impressão. Captura, seleção e
alça existem somente na prévia, fora da string exportada, e são ocultas antes
da impressão. Exportar fica indisponível durante gestos incompletos.

### Validação e evidências desta etapa

`node scripts/test-topology-usability.mjs` executa os cenários anteriores do
Studio, blocos e equipamentos, além dos cenários dirigidos desta etapa. `NETLAB_STUDIO_USABILITY_CHECKPOINT=2`
permite parar após validar maximização/Fit Page. As regressões de blocos e cards
continuam em `node scripts/test-topology-devices.mjs`.

Evidências locais em `.playwright-mcp/reviews/topology-usability/`:

- `compact-before-after.png`: renderer anterior preservado versus renderer atual,
  com o mesmo snapshot de três rotas, em alemão.
- `2560-normal-fit-page.png` / `2560-maximized-fit-page.png`: modal normal e
  maximizado; equivalentes em 1440 e 700 px.
- `resize-table-before-after.png` e `resize-before.png` / `resize-after.png`: seis rotas antes/depois da largura
  personalizada, na topologia com A/B/C acima de D e switches/computadores acima.
- `resized-final-preview.png`: equipamentos e tabelas ajustados na prévia.
- `resized-preview-png.png`, `resized.svg`, `resized.png` e `resized.html`:
  comparação e downloads reais do mesmo documento.
- `resized-A4-landscape.pdf`, `resized-A4-portrait.pdf` e equivalentes A3:
  PDFs impressos pelo Chromium, sem geração direta de PDF na aplicação.

As dimensões e os textos de cada tabela, posições dos cards e cabos são
comparados entre prévia, SVG baixado e documento enviado à impressão. O PNG é
gerado desse mesmo SVG em 3x. A matriz verifica A4/A3, duas orientações, Fit
Page/Width/50%/100%/125%, cancelamento, três tabelas independentes, equipamento
movido após resize, presets, refresh, recuperação e ausência de controles na
impressão. Os testes unitários incluem zero/uma/três/dez rotas, idiomas,
filtros, defaults equivalentes/distintos e limites de largura/altura.

Limites mantidos: não há persistência permanente, altura manual, Undo/Redo,
edição de cabos, novos presets ou redimensionamento de cards. Sobreposições
deliberadas continuam possíveis e geram aviso. A alça não faz auto-layout;
reposicionar conteúdo ou escolher A3 continua sendo uma decisão do usuário.

A captura SVG dos equipamentos também recebeu a mesma proteção: uma perda
temporária com o botão ainda pressionado mantém o gesto, enquanto
pointercancel ou perda efetiva cancelam. Escape cancela antes de fechar o modal.

A galeria `review.html` reúne as evidências. `normal-maximized.png` compara
as janelas e `resized-preview-png-pdf.png` inclui o PDF A3 realmente renderizado
com Poppler, junto da prévia e do PNG baixado.

Validação final da Etapa 3.5: **158 arquivos / 2.821 testes passaram**
na suíte completa serial; **146 testes direcionados**, **27 cenários nativos
do Studio**, **27 downloads verificados** e **396 combinações geométricas**
passaram. Não houve erros de navegador na revisão final. TypeScript, build e
`git diff --check` passaram, incluindo whitespace de 38 arquivos não rastreados.
Os quatro PDFs A4/A3 têm uma página, foram lidos e renderizados com Poppler.

A revisão usa o contorno local do launcher Edge descrito acima. O helper
de novas abas aguarda brevemente se o socket de depuração anunciado ainda não
aceitar conexão. Os gestos do harness enviam explicitamente o estado do botão
e aguardam a aplicação do scroll antes do hit test nativo. Esses cuidados
pertencem somente à infraestrutura de teste.

## Etapa 3.6 — Refinamento visual e escala proporcional

### Checkpoint 1: gateways e grupos internos dos cards

`Gateways / Default-Routen` controla os endereços. A opção subordinada
`Gateway-Schnittstellen anzeigen` controla os nomes de suas interfaces,
independentemente de `Schnittstellen`, que continua controlando os demais dados
do card. Clean e Presentation começam com essa opção desligada; Technical a
mantém disponível ligada. Quando o controle principal está desligado, a opção
subordinada fica desabilitada sem perder sua escolha.

Os formatos são `Default: 172.16.0.1` e `Default: 172.16.0.1 (eth0)`, ou
`Gateway: ...` para um gateway sem /0 equivalente. A deduplicação continua usando
somente pares reais (interface, próximo salto) idênticos. Encaminhamentos de
interfaces diferentes continuam separados, mesmo quando seus endereços coincidem.
Sem os nomes, essas linhas podem parecer iguais; ative a opção subordinada para
identificar as interfaces. Não há deduplicação baseada somente no texto visível.

Cada card mede separadamente nome, tipo, informações e gateways, com a mesma
fonte do SVG. Ascendentes/descendentes medidos no canvas recebem arredondamento
conservador para os limites efetivos do SVG em escala fracionária. O ícone
reserva seus 40 px; o primeiro grupo começa pelo menos 8 px depois dele. Grupos
técnicos ficam separados do nome/tipo, e o divisor de gateways possui folga dos
dois lados. A altura resulta somente dos grupos ativos e das quebras reais.
Cards sem dados adicionais continuam compactos, sem alterar os assets vetoriais.

Limites: interfaces ocultas deixam de identificar visualmente encaminhamentos
com o mesmo endereço; os dados permanecem distintos. Cards muito informativos
ou com nomes longos ainda podem precisar de A3 ou de menor seleção de conteúdo.
Não há alteração dos cards do simulador ou das tabelas técnicas convencionais.

### Checkpoint 2: segmentos simples e endpoints reais

O exportador mantém a preferência por um único segmento livre entre as bordas.
Centros quase alinhados compartilham uma projeção nas faces correspondentes,
evitando uma inclinação pequena causada por ajustes locais ou tamanhos distintos.
A tolerância é pequena, limitada a 10 unidades de topologia; diagonais reais
continuam diagonais. Não há movimento de dispositivos para alinhar cabos.

Somente obstáculos reais acionam os desvios simples já existentes. Pontos
repetidos/colineares são retirados; segmentos muito curtos recebem uma penalidade
na escolha entre alternativas livres. Obstáculos intermediários reservam também
uma pequena folga para o traço. Endpoints são recalculados depois de arraste ou
mudança de conteúdo. IDs, ordem das duas extremidades e nomes das interfaces
continuam sendo os da conexão capturada; etiquetas seguem o endpoint associado.

Limites: não existe roteador ortogonal genérico. Colocações deliberadamente
sobrepostas ou obstáculos densos podem continuar sem alternativa simples, com o
aviso existente. Nada foi alterado nos cabos, handles ou React Flow do canvas.

### Checkpoint 3: dois tipos de redimensionamento das Routing Tables

- **Borda direita, cursor horizontal:** ajusta a largura, redistribui colunas e
  recalcula quebras/altura, preservando o tamanho físico da fonte atual.
- **Canto inferior direito, cursor diagonal:** escala proporcionalmente a tabela
  inteira, preservando a composição interna, inclusive título, fontes, padding,
  bordas, divisórias e quebras. Não reorganiza colunas nem remove rotas.

Os controles usam marcas e tooltips diferentes, aparecem na seleção/hover e
mantêm a captura fora do conteúdo redesenhado. O feedback geométrico é imediato;
Escape restaura largura/escala anteriores. Os dois modos mantêm o canto superior
esquerdo fixo durante o gesto, sem deslocar outros blocos, equipamentos ou áreas.
X/Y continuam em posicionamento avançado e o cabeçalho continua movendo a tabela.

`RoutingBlockOptions.scale` é uma escolha da sessão, independente do zoom.
`baseWidth/baseHeight` descrevem a composição sem escala; `width/height` são seus
limites físicos. O SVG aplica um `scale()` uniforme no conteúdo interno do bloco,
dentro da translação da posição. Essa mesma geometria integra a prévia, SVG,
PNG, HTML e PDF impresso. A camada de controles não pertence ao SVG exportado.

Ao confirmar a escala, a largura intrínseca atual é conservada. A composição
compacta existente de 300 px continua válida mesmo com todas as colunas. O mínimo
do ajuste de largura considera as colunas e é limitado a esse padrão compacto.
IPv4/CIDR que necessitam de quebra passam a quebrar entre octetos, mantendo todos
os caracteres e sem separar um número no meio. A escala proporcional não cria
novas quebras.

O painel oferece percentuais por tabela e recuperação de tamanho. Escolher uma
largura Compact/Normal preserva a escala; `Restaurar tamanho padrão da tabela`
recupera Compact e 100%, independentemente da posição, filtros e colunas.
Presets e refresh conservam largura/escala associadas ao bloco. Fechar o Studio
descarta a apresentação, como antes.

Os mínimos são **95% em Small, 85% em Normal e 80% em Large**, reservando pelo
menos aproximadamente **7 pt para o menor cabeçalho na folha física**. O máximo
é 150%, também limitado pelo espaço à direita e abaixo. O arraste usa passos de
0,1 ponto percentual; não depende do número de pixels da prévia. Para ampliar
mais, mova primeiro a tabela para um espaço maior ou escolha A3.

Ao trocar papel/orientação, uma tabela proporcional preserva sua composição;
a escala efetiva pode ser limitada ao espaço disponível. Se necessário, apenas
o próprio bloco é limitado às margens. Se nem o mínimo legível couber, todas as
linhas permanecem e o aviso/tamanho excedido bloqueia a exportação visual.
Tabelas antigas sem escala explícita mantêm o comportamento anterior de largura.

Limites: restaurar um tamanho maior pode exigir limitar a posição do próprio
bloco se não houver espaço até a borda. Sobreposições continuam possíveis,
com os limites físicos reais atualizando os avisos; não há auto-layout. A4 retrato
pode exigir reduzir a tabela, mover blocos ou ajustar a escala do diagrama.
Não há altura manual, persistência permanente, novos presets, novos assets ou
edição de dados reais. As tabelas convencionais do relatório são independentes.

### Reprodução e evidências

`node scripts/test-topology-refinement.mjs` inclui as regressões anteriores do
Studio, equipamentos, blocos e usabilidade, seguidas dos cenários desta etapa.
Para executar somente os novos cenários, use `NETLAB_STUDIO_REFINEMENT_ONLY=1`;
`NETLAB_STUDIO_REFINEMENT_CHECKPOINT=1` encerra após a matriz de cards no Chromium.
O contorno local do launcher Edge descrito nas etapas anteriores continua válido.

Evidências em `.playwright-mcp/reviews/topology-refinement/`:

- `cards-before-after.png`: renderer anterior preservado e renderer atual, com
  nome longo, quatro interfaces, gateways e texto Large.
- `cables-before-after.png`: mesmas bordas/centros, antes/depois da projeção comum.
- `portrait-before-scale.png` / `portrait-after-scale.png`: três tabelas em
  A4 retrato na rede A/B/C/D com Markierungen.
- `table-scale-before-after.png`: a mesma tabela de seis rotas em 100% e 80%.
- `portrait-final-preview.png`, `scaled.svg`, `scaled.png` e `scaled.html`:
  resultado preparado e downloads reais, após largura, escala e movimento de C.
- `preview-png.png`: comparação do SVG confirmado e do PNG realmente exportado.
- `scaled-A4-portrait.pdf`, `scaled-A4-landscape.pdf` e equivalentes A3:
  impressão real via Chromium, com conteúdo e geometria comparados à prévia.

Testes unitários cobrem os grupos de texto em três presets e tamanhos, hosts,
switches e routers com uma a quatro interfaces; gateways equivalentes/distintos;
cabos horizontais/verticais/diagonais e obstáculos; escala versus largura,
composição compacta, limites físicos, refresh e preservação das demais tabelas.
A revisão nativa cobre ambos os handles, Escape, Fit Page/Width/50%/100%/125%,
modal normal/maximizado, presets, movimento de equipamentos, recuperação,
limites A4/A3 e exportações sem controles de edição.

Validação final da Etapa 3.6: **161 arquivos / 2.841 testes passaram**
na suíte completa serial; **166 testes direcionados**, **34 cenários nativos
integrados**, **30 downloads verificados** e **396 combinações geométricas**
passaram. Os sete cenários novos também passaram na conferência final de
A4 retrato, com orientação explicitamente validada após alternar presets.
Não houve erros de navegador. TypeScript, build e `git diff --check` passaram,
incluindo whitespace dos 43 arquivos não rastreados. Os quatro PDFs foram
lidos e renderizados com Poppler, com uma página por papel/orientação.

A galeria `review.html` e a captura `preview-png-pdf.png` reúnem as evidências.
A comparação final utiliza a mesma folha **A4 retrato** no SVG, PNG e PDF;
o harness restabelece essa orientação depois dos presets, que a redefinem
como parte do comportamento existente. As diferenças de suavização de fontes
entre vetor, raster e renderização do PDF não alteram as coordenadas.

## Layout compacto e alinhamento magnético

### Checkpoint 1 — compactação explícita e reversível

**Layout kompakter gestalten / Make layout more compact / Compactar layout**
fica junto da escala do diagrama. Só o clique executa a operação. Abrir o Studio,
trocar preset, papel, orientação ou zoom não executa novas compactações.
**Kompaktierung rückgängig / Undo compaction / Desfazer compactação** recupera
as posições anteriores à última compactação bem-sucedida. Não é um histórico
geral de edição. Uma tentativa sem movimento mantém a recuperação anterior e
mostra um aviso discreto de que não há ajuste seguro.

`compactOffsets` guarda deslocamentos em unidades de topologia relativos aos
centros automáticos. Assim, os cards compactados acompanham a mesma transformação
global dos demais cards ao trocar papel, orientação ou escala, sem executar outra
compactação. `devicePositions` continua sendo a escolha manual em coordenadas do
documento e tem prioridade.
Cards com centro manual ficam fixos em qualquer compactação posterior. Arrastar
depois da compactação cria uma escolha manual normalmente; desfazer a compactação
preserva esse arraste, as edições das tabelas e as demais opções posteriores.
Restaurar a posição de um card remove seus dois centros de apresentação; restaurar
todas as posições também limpa a recuperação de compactação. Esses controles
existentes continuam disponíveis. Refresh filtra ambos os mapas por ID, e presets
preservam ambos. Fechar o modal descarta tudo, sem persistência no projeto.

A geometria usa uma única passagem em ordem estável de IDs. Cada card automático
recebe uma proposta baseada apenas nos vizinhos realmente conectados: 10% do
espaço livre excedente por extremidade, até 32 pixels de documento por operação.
Se ambas as pontas puderem se aproximar, a redução do vão pode se aproximar de
20%; nós intermediários com atrações opostas podem ficar parados. Folgas pequenas
não geram propostas. Eixos de conexões já alinhadas são conservados. Não há
redistribuição em linhas, simulação de forças ou novo ajuste global de escala.

Cada proposta tenta somente o deslocamento inteiro, metade e um quarto. A solução
precisa reduzir a soma das distâncias das conexões sem aumentar o comprimento total
dos cabos visíveis. Mantém a ordem original nos dois eixos, margens e folga de pelo
menos 12 pixels de documento, aumentada conforme o texto. Folgas já menores não
podem piorar. Recalcula endpoints e etiquetas antes de aceitar; recusa novas
sobreposições de cards, etiquetas ou tabelas, novos cabos obstruídos e novos cabos
atravessando tabelas. Cabos ocultos também são verificados contra os cards.
Routing Tables mantêm suas posições e dimensões exatas. O transform global do
diagrama e as Markierungen não se movem. A fonte, o snapshot e o plano original
continuam inalterados.

Se um card estava completamente contido em um retângulo de uma Markierung visível,
continua dentro de algum retângulo dessa mesma área. Isso é apenas uma proteção
geométrica. Não interpreta VLANs/subnets nem cria agrupamentos. Um card contido
somente na união de vários retângulos, ou uma área ocultada, não recebe essa
restrição adicional. Áreas e títulos não são remodelados para acompanhar os cards.

Limites: a operação pode ser pequena ou nula em redes densas, com muitos pins
manuais, tabelas ou etiquetas. Uma redução uniforme de 15–25% não é garantida.
Não corrige sobreposições existentes, não amplia automaticamente os cards nem
refaz o aproveitamento da página; a escala atual permanece sob controle do usuário.
Trocar papel/conteúdo ainda pode limitar posições e exigir ajustes ou A3, como no
arraste manual existente. Desfazer restaura deslocamentos de apresentação, sem reverter
papel, conteúdo ou outros controles alterados depois.

### Checkpoint 2 — guias e snap durante o arraste

**Ausrichtungshilfen / Alignment guides / Guias de alinhamento** começa habilitado
na sessão do Studio. Desabilitar permite o arraste livre anterior; presets e zoom
não mudam essa preferência. Apenas o equipamento ativo se move.

São referências as bordas esquerda/direita, centros em X, bordas superior/inferior
e centros em Y dos limites reais de cada card, inclusive com dimensões diferentes.
Compara borda com a mesma borda e centro com centro. A referência mais próxima de
cada eixo pode gerar um snap de até **6 pixels visuais**. A conversão considera
o CTM do SVG e a escala CSS do iframe: Fit Page, Fit Width e zoom manual conservam
a mesma tolerância de tela. O ponteiro continua livre fora desse intervalo;
o movimento deriva sempre do início do gesto, sem acumular correções de snap.

Tenta o par de eixos mais próximo e depois cada eixo isoladamente. Recusa snaps
que ultrapassem margens ou encostem em outros cards/tabelas com menos de 3 pixels
de documento de folga. Tabelas não são referências de alinhamento e seus gestos
não passam por esse helper. Não procura alternativas distantes quando o candidato
mais próximo é inseguro.

As linhas ciano tracejadas só existem em uma camada transitória da prévia, acima
do SVG comum, com espessura visual constante e sem interceptar eventos. São legíveis
sobre a folha branca nos temas existentes. Ao soltar, cancelar, perder efetivamente a captura,
fechar ou imprimir, as linhas são removidas. Escape continua restaurando o gesto
sem fechar o Studio. Exportar fica bloqueado durante o gesto; guias/seleção/handles
não integram SVG, PNG, HTML ou PDF. Cabos e nomes reais das interfaces são
recalculados pelo mecanismo do documento, sem alterações no simulador.

### Reprodução e capturas para referência

`node scripts/test-topology-compact.mjs` executa a abertura básica anterior e a
revisão nativa desta rodada. `NETLAB_STUDIO_COMPACT_CHECKPOINT=1` encerra após a
compactação; `NETLAB_STUDIO_COMPACT_FULL=1` inclui todas as revisões anteriores de
blocos, equipamentos, usabilidade e refinamento. O adapter local do Edge descrito
nas etapas anteriores continua necessário neste ambiente. Os gestos legados que
verificam deltas exatos usam explicitamente o modo livre; os novos cenários testam
o snap habilitado por padrão.

Evidências e logs ficam em `.playwright-mcp/reviews/topology-compact/`.
**Somente as cinco imagens finais, prontas para selecionar todas e enviar ao
ChatGPT, ficam na subpasta `referencias-chatgpt/`:**

1. `01-compactacao-a4-retrato-antes-depois.png`: A/B/C acima de D, PCs e switches
   acima, mesma escala e A4 Hochformat antes/depois do clique.
2. `02-guia-vertical-centros-durante-arraste.png`: centro em X com card de outro tamanho.
3. `03-guia-horizontal-bordas-durante-arraste.png`: bordas inferiores durante o gesto.
4. `04-integracao-previa-png-a4-retrato.png`: documento preparado e PNG realmente baixado.
5. `05-integracao-previa-png-pdf-a4-retrato.png`: prévia, PNG e PDF A4 retrato renderizado
   com Poppler, com as mesmas margens físicas na comparação.

Essa pasta não recebe HTMLs, PDFs, logs, capturas de falha ou imagens intermediárias.
`review.html` permanece no diretório de revisão, junto dos downloads reais
`final.svg`, `final.png`, `final.html` e dos quatro `final-A4/A3-portrait/landscape.pdf`.
O helper local `render_pdfs.py` faz QA somente de leitura com o Poppler já
instalado; `capture-review.mjs` monta a comparação após essa renderização.

Na matriz de impressão, cada folha é comparada à sua própria prévia. Uma tabela
manual pode sobrepor a rede ao mudar papel/orientação, pois conserva suas
coordenadas de documento enquanto o diagrama é ajustado proporcionalmente. O
aviso existente permanece ativo; nesse caso, a revisão prepara a folha pelos
campos de posição existentes antes de imprimir. Isso não acrescenta movimento
automático de tabelas ao produto. A comparação tripla usa exatamente o mesmo
A4 retrato do SVG e PNG baixados, sem essa mudança de posição.

Validação final desta rodada: **163 arquivos / 2.862 testes** na suíte completa
serial; **122 testes direcionados do Studio** (21 novos); **41 cenários nativos
integrados** e **33 downloads verificados**, sem erros de navegador. Os sete
cenários novos também passaram na conferência final das folhas preparadas, com
três downloads reais adicionais. TypeScript, build e `git diff --check` passaram,
incluindo whitespace dos **49 arquivos não rastreados** do Studio/docs/harnesses.
Os quatro PDFs A4/A3 foram lidos e renderizados com Poppler, com uma página por
papel/orientação, e inspecionados visualmente.

A matriz de compactação mede fontes reais no Chromium em **396 combinações**
(11 topologias, três presets, A4/A3, duas orientações e três tamanhos de texto),
sem inversões, novas sobreposições ou novas obstruções; 936 ajustes individuais
foram aceitos no conjunto. Inclui a rede com A/B/C sobre D, capítulos 4/5, linhas,
triângulos, rede horizontal/vertical, dispositivos próximos/coincidentes,
obstáculos e nomes/interfaces longos. Os testes unitários acrescentam dois PCs
afastados de um switch, pins manuais, áreas e tabelas. Há regressão específica
para os offsets acompanharem papel/orientação/escala, mantendo D abaixo dos três
routers. A matriz anterior de geometria também é executada separadamente.

Nenhum commit, push, merge ou deploy foi realizado. As alterações locais
anteriores foram preservadas; não houve mudança de canvas, engine, dados reais,
schemas, persistência, tutoriais, assets ou bibliotecas.

## Layouts independentes por formato de página

Esta etapa substitui o reaproveitamento de posições entre folhas descrito nas
limitações anteriores. Há quatro variantes na sessão atual: **A4 Querformat,
A4 Hochformat, A3 Querformat e A3 Hochformat**. Fechar o Studio descarta as quatro;
nenhum layout é gravado no plano, no storage ou no snapshot técnico.

### Causa e separação do estado

Antes, `devicePositions` guardava centros em pixels físicos do documento e cada
Routing Table guardava posição, largura e escala nesse mesmo espaço. Alterar
papel/orientação recalculava a transformação automática, mas reaplicava esses
centros e caixas da outra folha. Apenas alguns cards tinham posições manuais:
os demais acompanhavam a transformação nova. Isso podia misturar duas geometrias,
criar sobreposições e alongar cabos. Os offsets proporcionais da compactação não
resolviam os centros e caixas manuais absolutos.

`StudioPageSession` separa opções compartilhadas de `PagePresentation`, indexada
por `paper-orientation`. O snapshot permanece único no componente.

| Compartilhado | Exclusivo da variante |
| --- | --- |
| Snapshot, seleção de dispositivos e seções, aliases e conteúdo visível | Centros manuais dos equipamentos |
| Título, subtítulo, anotações, preset, cor e idioma | Offsets da compactação |
| Identidade/ordem/dispositivo de cada tabela | Posição, preset de largura, largura personalizada e escala da tabela |
| Filtros de rotas/interfaces e colunas das tabelas | Recuperação da última compactação e seu aviso |
| Margens, escala do diagrama e tamanho do texto | Somente os ajustes necessários para desenhar aquela folha |

Zoom, maximização e a opção de guias continuam sendo preferências da interface,
independentes do documento. A altura de uma tabela continua derivada das rotas,
colunas, largura, fonte e escala; mudar um filtro compartilhado pode mudar sua
altura em todas as variantes, sem apagar as larguras/escalas solicitadas.

`activePageOptions()` materializa apenas a variante ativa no mesmo
`PrintDocumentOptions` já usado por geometria, hooks, SVG e relatório. Não duplica
snapshots nem listas completas de tabelas nas quatro variantes. A definição de
cada bloco existe uma vez; as variantes contêm somente sua geometria por ID.
O restante dos renderizadores e os mecanismos de cards, cabos, snap, largura e
escala proporcional não foram substituídos.

### Primeira visita e recuperação

Ao selecionar uma combinação ainda não visitada, ela começa sem centros manuais,
offsets ou recuperação de compactação de outra folha. O renderer automático
existente calcula o desenho proporcional apropriado a essa área, mantendo as
posições originais do snapshot como referência. Os blocos compartilhados recebem
Compact/100% e uma posição calculada pelo scan seguro existente, considerando
cards, etiquetas, cabos e tabelas já colocadas. Não importa o tamanho personalizado
da folha de origem e não move os cards para acomodar tabelas.

Ao voltar a uma combinação visitada, seus centros, offsets, tamanhos/posições de
tabelas e desfazer da compactação são recuperados. A troca não executa compactação,
não recupera posições padrão por cima das edições e não apaga a outra variante.
As conexões e etiquetas são recalculadas sobre essa geometria usando os IDs e
interfaces reais. Com os mesmos conteúdos, margens, fonte e escala, a recuperação
geométrica é exata, incluindo endpoints e dimensões das tabelas.

Os presets agora alteram o conteúdo compartilhado mantendo o papel e a orientação
ativos. Essa exceção ao reset antigo evita navegar implicitamente para A4
paisagem. Mantêm os blocos existentes e os ajustes de todas as variantes. Outros
campos ainda seguem os defaults do preset, como antes.

### Tabelas, compactação e recuperação

Adicionar uma tabela acrescenta uma única definição compartilhada com um novo ID.
Na folha ativa ela usa a posição inicial existente do painel. Em outra variante,
é colocada com tamanho inicial próprio na próxima visita, sem deslocar tabelas já
editadas. Remover um bloco o retira de todas as variantes e elimina suas geometrias;
voltar de orientação não o recria. Escolher outro dispositivo/filtro/coluna modifica
a mesma definição do bloco, sem substituir identidades de outros blocos.

Arrastar, redimensionar, escalar e restaurar posição/tamanho de tabelas afeta
somente a geometria ativa. Restaurar um equipamento ou todos os equipamentos
também se limita à folha ativa. O algoritmo de compactação e suas proteções são os
mesmos da etapa anterior; o resultado e o desfazer agora pertencem à variante.
Não é possível desfazer em retrato uma compactação feita em paisagem.

O refresh reconcilia centros manuais, offsets e a recuperação de compactação em
todas as variantes por IDs válidos. Não atribui um centro removido a outro ID.
Definições de tabelas continuam usando a política anterior: um dispositivo
removido é indicado como ausente, sem mostrar rotas antigas nem substituí-lo por
outro equipamento. Filtros de interfaces são conciliados com o snapshot novo.

### Revalidação e limites

Margens, conteúdo, tamanho de texto e escala do diagrama são compartilhados;
alterá-los recalcula os limites efetivos. Os centros e tamanhos solicitados ficam
guardados, mesmo quando o renderer precisa limitá-los à área imprimível. Restaurar
esses controles recupera o ajuste pedido sem perder a variante salva. O tamanho
do papel e sua orientação são a chave da variante; margens não criam variantes
adicionais.

Não há garantia de ausência de colisões depois de deslocamentos deliberados ou
de mudanças globais no conteúdo. Os avisos de colisão/etiquetas/cabos continuam
ativos. O posicionamento inicial de tabelas usa o scan simples já existente;
se não houver espaço livre, mantém o aviso, sem reorganizar toda a rede. Se uma
tabela exceder a folha, preserva todas as linhas e bloqueia a exportação visual
conforme a regra anterior, até escolher folha/conteúdo/tamanho adequados.

Não foi acrescentado auto-layout, agrupamento por Markierungen, alteração de
guias, novos presets, persistência permanente ou modificação do canvas/simulador.

### Testes e referências desta rodada

`node scripts/test-topology-page-layouts.mjs` executa a abertura básica e os novos
cenários nativos. `NETLAB_STUDIO_PAGE_LAYOUTS_FULL=1` inclui todas as revisões
anteriores do Studio. O adapter local do Edge descrito acima continua válido.
As regressões antigas escolhem explicitamente o formato de suas referências;
o teste de largura retorna à variante na qual aquela largura foi editada.

Os testes unitários de `pageLayouts.test.ts` verificam primeira visita, recuperação
exata nos quatro formatos, configuração compartilhada, adição/remoção, compactação,
restores, IDs após refresh, mudanças globais e tabela excedida sem perda de rotas.
A revisão nativa utiliza A/B/C acima de D e PCs/switches acima, dois blocos reais,
arraste de cards, largura/escala por gesto, filtros, novas tabelas, zoom/Fit Page,
Fit Width, maximização, snap, Escape, restore e refresh em todas as variantes.

Evidências e arquivos intermediários ficam em
`.playwright-mcp/reviews/topology-page-layouts/`. A subpasta **`referencias-chatgpt/`
contém somente cinco PNGs finais numerados**, prontos para selecionar todos:

1. `01-a4-querformat-ajustado.png` — equipamentos e duas tabelas editados.
2. `02-a4-hochformat-primeira-abertura.png` — automática, sem copiar ajustes de paisagem.
3. `03-a4-hochformat-ajustado.png` — edição independente de retrato.
4. `04-a4-querformat-restaurado.png` — recuperação exata da primeira composição.
5. `05-previa-exportacao-a4-hochformat.png` — prévia e PNG realmente exportado.

SVG, PNG, HTML e os quatro PDFs impressos são guardados fora dessa pasta de
referência. Cada PDF é comparado ao documento ativo daquela variante; a troca
de formato não reposiciona manualmente tabelas para mascarar o problema original.

Validação final: **164 arquivos / 2.870 testes** na suíte completa serial,
**130 testes direcionados do Studio** (oito novos), **47 cenários nativos
integrados** (seis novos) e **36 downloads verificados**, sem erros de navegador.
As **396 combinações de geometria** e as **396 de compactação** passaram.
TypeScript, build e `git diff --check` passaram; o whitespace dos **53 arquivos
não rastreados** do Studio, documentação e harnesses também foi conferido.

As posições/dimensões e os endpoints foram comparados exatamente entre visitas
e entre a prévia e os documentos exportados. No cenário A4 paisagem, as capturas
ajustada e restaurada também têm SHA-256 idêntico. Os quatro PDFs A4/A3 têm uma
página, foram lidos e renderizados com Poppler e conferidos visualmente, sem
controles de edição ou cortes. `review.html` reúne as cinco referências e os
downloads, mantendo a pasta de envio somente com PNGs.

Nenhum commit, push, merge ou deploy. Alterações locais anteriores preservadas.

## Persistência da apresentação e correções do canvas — 07/11/2026

Esta seção substitui as limitações históricas de persistência das etapas acima.

### Onde fica salvo

O campo opcional `topology.ui.topologyStudio`, versão 1, acompanha o
`ProjectDocument` existente. O setter do store notifica o mesmo autosave dos
drafts; o controller grava no IndexedDB, com sua fila, sequência de edição e
verificação de concorrência existentes. Não há outro banco, chave global de
layout, migração de schema ou snapshot técnico duplicado.

Fechar o Studio, trocar de aba e F5 recuperam o draft e a apresentação. **Salvar
plano** continua estabelecendo a versão nomeada, como para as outras edições do
NetLab. Descartar explicitamente um draft com alterações também descarta sua
apresentação não salva na versão nomeada. Não é preciso salvar a cada ajuste.
O rodapé do Studio mostra o estado do autosave e informa falhas; a recuperação e
a nova tentativa usam os controles existentes do workspace. Uma falha mantém os
dados em memória, sem fingir que foram gravados; também é possível exportar JSON.

São persistidos o preset, folha ativa, título/subtítulo/anotação, acento, margens,
texto, escala, seleções de conteúdo/dispositivos, aliases, filtros, colunas e
definições das Routing Tables, além da preferência de alinhamento magnético.
Cada uma das quatro folhas tem seus centros manuais, offsets da compactação,
posições, larguras e escalas de tabelas. `Reset preset` atua na folha ativa e
preserva as demais variantes. Abrir não reaplica compactação nem reorganiza
personalizações. Zoom, maximização, seleção, arraste, guias transitórias e
histórico temporário de desfazer compactação ficam fora dos metadados.

### Rede atual, isolamento e portabilidade

Ao abrir, a captura técnica vem da rede atual; enquanto aberto, o botão de
atualizar conserva seu comportamento anterior. O layout usa IDs estáveis,
elimina posições de equipamentos removidos e nunca as reaproveita por nome ou
índice. Uma Routing Table cujo equipamento desapareceu conserva sua identidade
e mostra o aviso existente. Novos equipamentos ficam disponíveis nos seletores;
a seleção personalizada não é ampliada silenciosamente.

Cada draft carrega seu próprio documento e cópias independentes dos metadados.
Uma geração da topologia impede escritas de um Studio antigo após trocar o
plano; o modal fecha nessa troca. A fila existente impede que a confirmação de
uma gravação antiga marque uma edição mais nova como salva. As alterações de
apresentação não mudam interfaces, IPs, links ou histórico de configuração.

**Topology JSON transporta a apresentação**, por cópia de valor. Arquivos antigos
sem o campo abrem com os padrões existentes. Campos incompletos ganham valores
padrão; posições não finitas, dimensões/escalas inválidas e IDs inválidos são
tratados individualmente. O Studio avisa sobre reparos. Metadados de uma versão
futura são transportados sem interpretação: abrir mostra aviso e não os
sobrescreve; editar a apresentação substitui-os pela versão suportada, conforme
o aviso. Exportadores de infraestrutura e relatórios técnicos mantêm seus dados.

### Correções localizadas do canvas

O contorno de seleção era desenhado por um pseudo-elemento sem eventos de
ponteiro. Em routers com legendas IPv4 largas, havia uma faixa entre o asset e
os controles fora da região real de hover. Um elemento transparente agora cobre
exatamente os mesmos insets do contorno existente. Asset, legendas, bordas,
handles e botões não mudaram de tamanho ou posição; sair da região oculta os
controles normalmente.

O drop anterior dependia da proximidade dos handles do React Flow, que não
correspondia à seleção inteira. Além disso, o `mouseup` da biblioteca arredondava
coordenadas fracionárias em 25% de zoom. A conexão agora resolve o ponto físico
de soltura nas regiões reais em coordenadas de cliente, preservando a precisão
do `PointerEvent`. O destino precisa ser único e realmente estar sob o cursor;
overlays e áreas sobrepostas não escolhem um aparelho arbitrário. Um drop em
handle explícito continua válido. A operação chama uma única vez a validação
existente de interfaces/capacidade; não cria portas nem altera rotas de cabos.

### Reprodução e referências

`node scripts/test-canvas-interaction.mjs` cobre trajetos lentos/diagonais e drops
reais nos zooms 25%, 50%, 65%, 100% e 125%, geometria visual inalterada, capacidade,
sobreposição e click-connect. `node scripts/test-studio-persistence.mjs` cobre
quatro routers, três tabelas, quatro folhas, fechar/reabrir, F5, isolamento de
planos, JSON, falhas/atrasos de gravação e os quatro formatos de exportação.
`NETLAB_STUDIO_PERSISTENCE_FULL=1` inclui as revisões nativas anteriores do Studio.
Os harnesses usam perfis e bancos descartáveis e não alteram projetos do usuário.

Resultados, PDFs, downloads e galeria ficam em
`.playwright-mcp/reviews/canvas-studio-persistence/`. A subpasta
`referencias-chatgpt/` contém somente oito PNGs finais numerados: hover e cabo
antes/depois, Studio antes de fechar/reaberto/após F5 e prévia versus PNG. Pode
selecionar todos os arquivos dessa subpasta para enviar como referência.

Validação desta entrega: **166 arquivos / 2.880 testes** na suíte completa,
**55 cenários nativos do Studio**, sendo oito novos de persistência, **40 downloads**
verificados e nenhum erro de navegador. As matrizes de geometria e compactação
passaram em **396 combinações cada**. Foram aprovados **120 trajetos de hover** e
**120 drops**, mais capacidade, sobreposição, handle explícito e click-connect.
No baseline dos routers, 36 dos 60 trajetos interrompiam o hover; no código
corrigido, nenhum. TypeScript, build e `git diff --check` passaram, assim como
a conferência adicional de whitespace dos **62 arquivos não rastreados**.

A comparação visual de hover usa o mesmo ponto em 50%: a hitbox anterior é
reproduzida desabilitando apenas o novo elemento transparente no navegador
descartável; o contorno e todos os retângulos permanecem idênticos. As capturas
de cabo usam a execução anterior e a corrigida. As posições, dimensões e
endpoints das quatro folhas são comparados exatamente entre fechar/reabrir, F5
e exportar. Os quatro PDFs têm uma página e foram lidos, renderizados com
Poppler e conferidos visualmente. A data da captura técnica muda ao reabrir,
porque não se restaura um snapshot antigo. Nenhum commit, push, merge ou deploy;
as alterações locais anteriores foram preservadas.

## Guias de distância, inversão vertical e controles em zoom baixo — 07/11/2026

### Referências temporárias de distância

Com **Alignment guides / Ausrichtungshilfen** ativo, arrastar um card também
procura simetria em relação ao centro de um terceiro aparelho e espaçamentos
iguais numa linha/coluna. No triângulo, o aparelho do outro lado deve compartilhar
uma borda ou centro horizontal com o card arrastado; o aparelho central pode
estar distante e abaixo. A medida é a projeção horizontal entre centros, nunca
o comprimento diagonal dos cabos. A guia tracejada destaca o eixo central.

Para espaçamento regular, as medidas usam as bordas reais que ficam frente a
frente. Assim, cards de larguras diferentes podem ter a mesma folga. A referência
usa vizinhos consecutivos na mesma linha/coluna, inclusive ao acrescentar um
quarto card ou ao posicionar um card entre dois outros. Apenas o card arrastado
se move. Tabelas são obstáculos, não referências de alinhamento.

Mostra-se no máximo uma comparação numérica, por exemplo **120 px ↔ 120 px**,
além das guias de bordas/centros existentes. Valores são pixels do documento
(96 dpi), arredondados a uma casa decimal; mudar o zoom não muda a medida.
Traços e rótulos mantêm tamanho confortável na tela. O snap conserva a tolerância
existente de 6 pixels de tela, convertida para unidades do documento, e mantém
a referência escolhida enquanto ela continuar dentro dessa tolerância. Não há
atração de longa distância: referências podem estar distantes, mas o ajuste
do card precisa ser pequeno. Snap que criaria colisão ou sairia da página é
recusado. Desligar Alignment guides desliga tanto as linhas quanto o snap.

As cotas só existem no overlay de arraste e desaparecem ao soltar, cancelar com
Escape ou imprimir. Não entram no SVG/PNG/HTML/PDF nem nos metadados persistidos.
Não há editor de cotas ou alteração das conexões.

### Espelhar verticalmente

**Vertikal spiegeln / Flip vertically / Espelhar verticalmente** fica junto dos
controles de alinhamento. A operação espelha os centros dos cards visíveis em
torno do centro da extensão vertical atual, considerando suas alturas reais:
`y novo = menor topo + maior fundo − y atual`. A extensão ocupada permanece a
mesma e os cards continuam dentro da área imprimível. Não há novo auto-layout,
mudança de escala, inversão de ícones/textos ou alteração horizontal intencional.
Cabos e etiquetas são recalculados pelo renderizador existente.

Apenas o mapa de posições da folha ativa muda. A4/A3 e retrato/paisagem mantêm
as demais variantes. O resultado usa a persistência já existente e acompanha
fechar/reabrir, F5 e Topology JSON. Os cards continuam arrastáveis e podem usar
as mesmas guias magnéticas; restaurar posições continua disponível.

Uma segunda aplicação consecutiva, sem alterar o documento, recupera exatamente
as posições e o estado automático/manual anterior. Uma referência temporária
na janela evita diferenças de arredondamento; ela não integra o JSON nem o
histórico de Undo. Depois de fechar ou alterar a geometria, o botão aplica a
reflexão geométrica sobre as posições atuais, sem restaurar um estado antigo.

Routing Tables não se movem. Se o espelhamento causar sobreposição, o aviso
existente permanece e o usuário decide onde colocar o bloco. **Limitação com
Markierungen:** a inversão fica desabilitada enquanto áreas estiverem visíveis,
com uma explicação junto do botão. É possível ocultá-las no controle de conteúdo
antes de espelhar. Elas conservam sua geometria original; reexibi-las pode
exigir revisar a apresentação. Não se espelham áreas ou agrupamentos
silenciosamente, e o canvas principal não oferece essa operação.

### Botões de ação no canvas

Os botões Terminal e Quick Ping buscam um mínimo de **24 px de tela** em zoom
baixo, ancorados nos mesmos cantos superiores e crescendo para dentro da seleção.
O tamanho é limitado à largura disponível para manter os dois botões separados
por pelo menos 4 px e impedir que o centro clicável fique sobre um handle lateral.
Na fixture em 25%, os 7 px anteriores passam a 21,25 px nos routers, 17,25 px nos
PCs e aproximadamente 22,7 px nos servidores. O mínimo de 24 px cede à geometria
existente quando necessário; ampliar sem esse limite impediria iniciar cabos
ou clicar no centro da ação. Em
50% e 65%, todos atingem 24 px; em 100%, os 28 px originais são idênticos.
Switches continuam sem ações de terminal/ping, conforme o comportamento atual.

O ajuste é exclusivo dos botões em `DeviceActions.tsx` e CSS. Quando ampliados,
os handles existentes têm prioridade na interseção residual com a borda dos
botões, sem mudar sua geometria. Não muda nodes,
assets, legendas, handles, a região transparente de hover/drop, a validação dos
cabos ou o IP copiável. O tamanho não amplia a área de drop e não sai do contorno
para invadir aparelhos vizinhos. A cópia de IPv4 é exercitada separadamente dos
cliques em Terminal/Quick Ping na revisão nativa.

### Código e reprodução

- `distanceGuides.ts`: candidatos conservadores de simetria/espaçamento e medidas.
- `alignmentGuides.ts`: combina os candidatos com bordas/centros e rejeita colisões.
- `drawDistanceGuides.ts` e `useStudioDeviceDrag.ts`: overlay temporário, snap e limpeza.
- `verticalFlip.ts` e `TopologyStudio.tsx`: reflexão de posições e reversão consecutiva.
- `scripts/test-studio-distance-flip.mjs`: gestos reais, quatro formatos, persistência,
  Markierungen, tabelas, JSON, SVG/PNG/HTML e impressão/PDF. Definir
  `NETLAB_STUDIO_DISTANCE_FLIP_FULL=1` inclui as regressões anteriores do Studio.
- `NETLAB_CANVAS_ACTION_MINIMUM_REVIEW=1 node scripts/test-canvas-interaction.mjs`:
  mínimos dos botões, cliques reais, cópia de IP e geometria em 25/50/65/100%.
  Sem essa variável, o mesmo script executa a regressão de hover e cabos.

Capturas comparativas e resultados ficam em
`.playwright-mcp/reviews/studio-distance-flip-hover/`. A subpasta
`referencias-chatgpt/` contém somente os nove PNGs finais numerados, prontos para
selecionar todos e enviar. Logs, PDF, JSON, downloads e galeria ficam fora dela.

Validação: **168 arquivos / 2.887 testes** na suíte completa; **17 testes
direcionados** de alinhamento, distância e reflexão, sendo sete novos; **61
cenários nativos do Studio**, sendo seis novos, e **43 downloads verificados**,
sem erros de navegador. A revisão exercita os valores das medidas em Fit Page,
50%, 100% e 125%, cancelamento com Escape, guias desligadas, inversão dupla com
comparação exata de coordenadas/estado automático, isolamento de A4 paisagem,
recuperação após F5/JSON, edição após inverter, tabelas fixas e áreas visíveis.
O PDF A4 retrato foi lido/renderizado com Poppler e conferido visualmente.
TypeScript, build e `git diff --check` passaram; o whitespace de **69 arquivos
não rastreados** também foi conferido. O build mantém o aviso conhecido de chunk
acima de 500 kB. Nenhum commit, push, merge ou deploy; alterações locais anteriores
preservadas.

A regressão final do canvas aprovou **120 trajetos de hover e 120 drops**, sem
interrupções ou falhas em pontos válidos, mais destino/origem sem portas,
áreas sobrepostas, handle explícito e click-connect. Os botões foram clicados
no centro em todos os quatro zooms; copiar IPv4 permaneceu uma operação separada,
sem iniciar cabos. Os retângulos de nodes, assets, labels, handles e região de
drop permaneceram idênticos. Uma interferência detectada durante a revisão em
25% foi resolvida limitando o diâmetro e mantendo a prioridade dos handles,
em vez de ampliar a área de drop ou mudar a validação.

## Mover diagrama, rodapé opcional e limpeza da apresentação — 07/11/2026

### Movimento conjunto e áreas

**Diagramm verschieben / Move diagram / Mover diagrama**, na barra contextual,
alterna entre mover o conjunto e o arraste individual. O modo ativo tem botão
destacado, instrução própria e cursor de movimento. Arraste qualquer equipamento,
cabo ou área visível da topologia. Títulos, subtítulos, notas e Routing Tables
ficam fora dessa ferramenta e mantêm suas posições.

O movimento deriva um único vetor nas coordenadas do documento, limitado pela
união dos retângulos reais de todos os cards e áreas visíveis, inclusive seus
títulos. Não executa separação, compactação ou snap; não aplica clamps individuais.
Os centros resultantes são gravados no mesmo `devicePositions` usado pelo arraste
individual. Cards automáticos passam a ter centros explícitos nessa folha.
Os offsets de compactação existentes continuam preservados, subordinados aos
centros manuais. Cabos/endpoints/etiquetas são recalculados pelo renderizador.

Markierungen são DTOs de geometria da captura, não containers de React Flow.
Elas acompanham o mesmo vetor em uma cópia derivada. Somente para essas áreas,
`areaOffset` guarda uma translação de apresentação em pixels do documento na
variante ativa; não é um segundo posicionamento dos equipamentos nem uma cópia
das coordenadas originais. As áreas do canvas e o snapshot não são alterados.
Áreas ocultas não participam do movimento; ao reexibi-las, revise sua relação
com os cards, assim como após movimentos individuais. A inversão vertical mantém
sua restrição anterior com áreas visíveis.

Escape cancela o gesto inteiro. **Desfazer movimento do diagrama** recupera o mapa
anterior de centros e a posição das áreas, preservando ajustes individuais que
já existiam. Há uma devolução temporária por formato; ela não é persistida nem
substitui o Undo do simulador. Reposicionar novamente cards, mudar dimensões,
limites da folha ou captura das áreas invalida essa devolução em vez de restaurar
um estado incompatível. **Restaurar todas as posições** também restaura a posição
de apresentação das áreas da folha ativa.

Se o conjunto já ultrapassar a área imprimível, não se tenta corrigi-lo por
auto-layout durante o arraste. Uma área que ultrapasse os limites após mudar
conteúdo, folha ou importar geometria causa aviso operacional e bloqueia a saída
visual até restaurar posições, ocultar a área ou escolher uma folha adequada.
Sobreposição com tabelas continua usando o aviso existente, sem mover os blocos.

O mapa de centros e `areaOffset` são específicos de A4/A3 e retrato/paisagem,
recuperados no draft, após fechar/F5 e por Topology JSON v1. Metadados antigos
sem o campo continuam válidos; valores inválidos são tratados individualmente.
Modo ativo, ponteiro e devolução temporária ficam fora do armazenamento.

### Apresentação limpa e nota de rodapé

A observação fixa sobre snapshot, conectividade, RIP/leases/caches foi removida
de todos os presets e idiomas, incluindo a interface e SVG/PNG/HTML/PDF. O texto
automático de rodapé sobre WLAN também não é inserido. Permanecem todos os dados
técnicos selecionados, as associações WLAN tracejadas e os alertas operacionais
de colisão, tamanho, cabos sem caminho e conteúdo fora da folha.

**Fußnote / Footer note / Nota de rodapé** é texto simples compartilhado entre
as quatro folhas. Começa vazio, preserva quebras explícitas e aceita no máximo
três linhas lógicas e 600 caracteres. Não aceita HTML executável. Linhas longas
são medidas com a fonte real e podem quebrar; se excederem três linhas impressas
na folha atual, aparece um aviso para reduzir o texto e a exportação aguarda a
correção. Não se reduz silenciosamente a fonte nem se exporta texto truncado.

A nota usa Arial 11 px, entrelinha de 15 px, alinhamento à esquerda e posição
fixa perto da margem inferior. O espaço é reservado na geometria compartilhada
da página, inclusive para os limites de cards e tabelas. Sem texto, não há nota
nem sua reserva adicional. Os números de página dos relatórios têm faixa própria.

SVG e PNG representam uma página e incluem a nota nessa página. Em HTML/PDF com
mais páginas, a nota sai da primeira página visual e aparece apenas na última,
nas mesmas coordenadas físicas em relação à área útil. Os demais rodapés e
números permanecem. A paginação das tabelas reserva espaço conservador para a
nota e continua permitindo que o navegador cresça/quebre conteúdo em linhas
seguras, sem alturas fixas que cortem tabelas. A escolha manual de papel/escala
no diálogo de impressão ainda pode substituir o CSS, como antes.

O texto é persistido em `shared.footerNote` pelo mecanismo existente e acompanha
F5, troca de formato e JSON. Presets/reset continuam pontos de partida com nota
vazia, assim como outros textos do documento; não alteram variantes geométricas
de outras folhas.

### Dica contextual e implementação

Depois de concluir o primeiro reposicionamento, uma dica recomenda selecionar
primeiro as informações que serão exibidas. Ela não interrompe o gesto, não usa
modal e não integra documentos exportados. A dispensa é persistida em
`positioningTipDismissed`, junto dos metadados do Studio. Abrir a ferramenta não
mostra a dica constantemente; ela só surge depois de um reposicionamento quando
ainda não foi dispensada.

`diagramMovement.ts` calcula o vetor e os centros; `useStudioDeviceDrag.ts`
reutiliza captura de ponteiro, Escape e atualização ao vivo; `pageLayouts.ts`
mantém o offset das áreas por folha. `footerText.ts`, `footerMarkup.ts`, `page.ts`
e `report.ts` compartilham normalização, medição e coordenadas da nota. Não há
novo banco, migração ampla, auto-layout, seleção múltipla ou mudança no simulador.
A prévia é marcada como pendente em um layout effect, antes do carregamento do
iframe; isso evita que um carregamento rápido deixe a impressão desabilitada
após um resize. Testes antigos de posição usam tolerância de ponto flutuante na
conversão geométrica e continuam comparando os mapas persistidos exatamente.

Para reproduzir: `node scripts/test-studio-move-footer.mjs`. A variável
`NETLAB_STUDIO_MOVE_FOOTER_FULL=1` acrescenta todas as revisões nativas anteriores.
Resultados, PDFs e galeria ficam em `.playwright-mcp/reviews/studio-move-footer/`.
A subpasta `referencias-chatgpt/` contém somente os sete PNGs finais numerados,
prontos para selecionar todos e enviar. Capturas intermediárias ficam fora dela.

Validação final: **170 arquivos / 2.894 testes** na suíte completa, **151 testes
direcionados** do Studio/metadados em 20 arquivos, **68 cenários nativos do Studio**
(sete novos) e **51 downloads verificados**, sem erros de navegador. O checkpoint
de movimento foi validado separadamente antes de alterar os avisos e o rodapé:
18 testes direcionados, três cenários nativos, TypeScript, build e diff-check.

A integração cobre informações IPv4/interfaces/gateways antes de posicionar,
cards manuais de tamanhos diferentes, áreas, tabelas independentes, quatro
folhas, vários zooms, Escape, desfazer, F5 e downloads/importações reais de
Topology JSON. A comparação de translação exige o mesmo vetor para cada card
e área, sem mover as tabelas. Testam-se os três presets/idiomas sem a observação
fixa e a recuperação da dispensa da dica.

Os quatro PDFs A4/A3 com nota têm uma página cada. O relatório manteve as cinco
páginas previstas e contém a nota somente na quinta. Os PDFs foram lidos e
renderizados com Poppler e conferidos visualmente; o navegador também verifica
que tabelas, nota e número não se sobrepõem. TypeScript, build e
`git diff --check` passaram; o whitespace dos **76 arquivos não rastreados**
também foi conferido. Permanece apenas o aviso conhecido de tamanho de chunk
no build. Nenhum commit, push, merge ou deploy; alterações locais anteriores
preservadas.

## Rodada conservadora de estabilização antes da publicação

### Cabeçalho e identificação do software

A auditoria inicial encontrou a linha automática com data de captura e formato
de folha, sem a assinatura `Topology Studio`. Após autorização explícita para
implementar o cabeçalho nesta pasta, essa linha foi substituída pela assinatura
fixa e discreta **NetLab-FiSI · Topology Studio**. A identificação permanece
obrigatória mesmo com título vazio ou personalizado e em páginas sem diagrama.

Título e subtítulo continuam editáveis, o rodapé opcional permanece independente
e nenhuma observação genérica foi acrescentada. A assinatura ocupa a mesma
linha de 10 px e preserva a posição da régua, o início da área útil e todas as
coordenadas de cards, cabos, áreas e tabelas. Os três presets compartilham a
definição de `page.ts`, usada pelo SVG/PNG e pelo HTML/impressão/PDF. As páginas
de tabelas em `report.ts` usam a mesma assinatura, sem alterar conteúdo,
paginação ou defaults do Technical Report. A data de captura continua no
snapshot interno, sem aparecer no documento; a escolha de papel continua no
CSS de impressão. Datas digitadas pelo usuário no rodapé são preservadas.

`header.test.ts` acrescenta 38 testes: a matriz de 36 combinações de
DE/EN/PT-BR, presets e folhas, campos vazios/sem diagrama e independência da
geometria em relação à data capturada. `header-audit.json` registra a auditoria
atual; a pasta `header-before/` mantém a implementação e as saídas anteriores.

### Correção isolada dos cabos

Um caso reproduzível tinha trajeto reto livre, mas recebia três segmentos
porque a margem de exclusão de outro card era maior que os traços desenhados.
A margem passou de 2 para 1,6 unidades de documento: 0,9 do semitraço do cabo,
0,6 da borda do card e 0,1 compensando a tolerância interna de `crossesCard`.
O mesmo algoritmo, os endpoints nas bordas e os desvios necessários foram
preservados. Não houve reorganização, alteração de posições manuais ou mudança
na geometria do canvas principal.

O teste novo falha na implementação anterior e passa após a correção. Ele
também aproxima o obstáculo até haver interseção real dos traços e exige o
desvio nesse segundo caso. As duas capturas usam o mesmo SVG de produto e
os mesmos cards: apenas o roteamento anterior/atual difere. Cabos paralelos
podem continuar compartilhando segmentos; separá-los ou implementar roteamento
manual/generalizado fica fora desta rodada.

### Canvas, ping e rede ampliada

A revisão nativa cobre hover contínuo até os botões, abertura de Terminal e
Quick Ping, cópia de IP, drops e esgotamento de interfaces em 25%, 50%, 65% e
100%. Dois drops reais entre o mesmo router e switch ocupam `eth0/eth0` e
`eth1/eth1`. Os arquivos de produção do canvas e da animação foram comparados
com o backup inicial e permaneceram iguais.

Quatro comandos reais `ping -c 1` receberam resposta: LAN simples, segunda
sub-rede pelo enlace paralelo, caminho A–D–C e host entre LANs por múltiplos
routers. O caminho ICMP observado pelo simulador foi reproduzido com a
reprodução guiada existente, verificando os pontos visíveis em cada enlace
e sua proximidade ao traçado SVG. A ausência de animação relatada na versão
antiga não foi reproduzida nesses percursos. Essa conferência controlada não
garante cada frame em todos os navegadores ou velocidades. ICMP, ARP, TTL,
roteamento e animação de produção não foram modificados.

A fixture descartável contém quatro routers, três switches, seis hosts,
duas sub-redes e duas portas reais de router no SW-A, sem IPs duplicados.
Ela amplia a revisão anterior de movimentos, guias, compactação, inversão,
três Routing Tables, quatro layouts independentes, fechamento/F5 e Topology
JSON. Não é carregada pela aplicação normal. As saídas da matriz e os PDFs
ficam fora da pasta de referências.

### Reprodução e evidências

`node scripts/test-studio-stabilization.mjs` executa as verificações direcionadas
de canvas/ping e a integração do Studio com a rede ampliada. Definir
`NETLAB_STABILITY_FULL=1` inclui as revisões nativas anteriores; definir
`NETLAB_STABILITY_CANVAS_ONLY=1` limita a execução à auditoria de canvas/ping.
O runner requer um Chromium disponível, como os demais scripts do projeto.

Os resultados desta rodada ficam em
`.playwright-mcp/reviews/studio-stabilization/`. A subpasta
`referencias-chatgpt/` contém **somente quatro PNGs finais numerados**, antes e
depois do cabo e do cabeçalho: pode selecionar todos para enviar. Não foram acrescentadas
capturas de funcionalidades sem mudança visual. A galeria `review.html`
reúne as imagens e os resultados da auditoria do cabeçalho.

Na matriz física de 12 combinações de preset/folha, as medidas reais dos
textos SVG não excederam as bordas dos 13 cards e não houve colisão entre
cards. Os 21 PDFs gerados (47 páginas, incluindo o relatório de seis páginas)
passaram na leitura com Poppler: contagem de páginas conforme o HTML,
identificação obrigatória, ausência da observação genérica e nota uma única
vez na última página quando preenchida. Renderizações representativas de
A4/A3 e da primeira/última página do relatório foram conferidas visualmente.

### Resultado e ocorrência intermitente

A suíte completa passou com **171 arquivos / 2.933 testes**; a suíte direcionada
do Studio/metadados passou com **21 arquivos / 190 testes**. A execução nativa
final passou com **77 cenários do Studio**, as duas auditorias novas de
canvas/ping e **59 downloads verificados**, sem erros de navegador. TypeScript,
build, `git diff --check` e whitespace dos **81 arquivos não rastreados**
passaram. Permanece o aviso conhecido de chunk acima de 500 kB.

Uma execução ampla anterior fechou o Studio durante o cancelamento de resize
com Escape. A causa não foi isolada. A revisão dirigida passou, inclusive
com Escape mantido por 400 ms durante movimento global, e a repetição completa
passou também pelo resize nos diferentes zooms. A ocorrência permanece
registrada como intermitente e merece conferência manual antes da publicação;
não foi aplicada alteração especulativa nos hooks de gesto. O log anterior
foi preservado separadamente do resultado final.

A publicação não foi realizada. Nenhum commit, push, merge ou deploy foi
realizado; as alterações locais anteriores foram preservadas.

## Refinamento da interface e usabilidade

### Checkpoint 1: documento, títulos e atualização da prévia

O cabeçalho agora tem NetLab-FiSI em destaque, a assinatura Topology Studio
abaixo e a linha de separação. Os títulos do trabalho são opcionais,
centralizados abaixo dessa linha. Títulos personalizados, subtítulos e rodapé
permanecem salvos; a leitura do antigo valor padrão exato NetLab-FiSI o converte
em título vazio. Não há heurística que apague outros títulos. Não foi adicionado
um ícone ou asset obrigatório.

A área dos títulos é medida por linhas reais, com quebra de texto. Cards e
Routing Tables com posições manuais mantêm as âncoras durante essas edições.
Uma colisão entre texto do título e card, tabela, etiqueta ou cabo produz aviso,
sem deslocar os elementos. Uma âncora válida próxima à margem também não é
puxada para dentro quando o texto aumenta o tamanho renderizado dos cards:
o corte real é avisado e exige ajuste antes da exportação. Coordenadas
importadas que estejam fora da própria página continuam usando a recuperação
segura anterior. A topologia automática usa a área restante; não houve mudança
na medição intrínseca dos cards ou no roteador de cabos.

O flicker era causado pela navegação de srcDoc a cada alteração do HTML.
updatePreview.ts atualiza o documento existente sincronamente, mantendo o
iframe e os elementos article de cada página. O conteúdo SVG é atualizado e
os hooks de interação são religados na mesma atualização, antes da pintura.
A captura técnica não é recriada por digitação e o autosave continua ativo.
O HTML canônico atual fica em data-preview-html no iframe para as revisões;
SVG/PNG/HTML usam o mesmo resultado e a impressão lê o documento atualizado.
Os scripts de revisão passaram a ler esse HTML atual, em vez do srcdoc inicial.

A prova nativa digitou letra por letra com a página rolada em 90 px, zoom de
125% e um card selecionado: zero eventos load, mesmo Document e mesmo article,
scroll e zoom iguais, seleção preservada e rodapé idêntico ao texto salvo.
Título, subtítulo e alias foram editados no mesmo contexto. O primeiro
checkpoint passou isoladamente antes da reorganização dos controles.

### Checkpoint 2: lateral organizada e estado dos presets

StudioSection.tsx concentra o estado local aberto/fechado dos menus. Documento
e Conteúdo do diagrama começam abertos. Dispositivos e nomes de apresentação
começa fechado e reúne visibilidade e alias numa única lista. Rodapé, layout,
alinhamento e ajuda ficam em submenus. Os dois campos de cada par compartilham
espaço; os acentos usam os tokens existentes do tema, sem copiar a navegação
ou acrescentar funcionalidades do mockup. O modal do Studio foi mantido.

Blocos de documentação tem seu próprio destaque. Adicionar Routing Table é
recolhível; cada tabela identifica o equipamento e a quantidade de rotas, com
edição inicialmente fechada. O bug de reabertura vinha do atributo open fixo
em cada details: ele foi removido. Os painéis agora continuam fechados após
editar filtros, arrastar, redimensionar ou editar texto em outro campo. As
instruções extensas foram movidas para ajuda contextual recolhível.

Conteúdos da documentação aparece apenas no Technical Report. Ao alternar
presets, changePrintPreset mantém títulos, aliases, rodapé, escolha de
dispositivos e as quatro variantes geométricas. A seleção técnica de seções,
dispositivos, filtro de rotas e anotação é lembrada em shared.reportSettings,
um campo opcional no mesmo envelope versão 1, validado pelo leitor existente.
A recuperação pelo IndexedDB e pelo Topology JSON preserva essa memória.
Os defaults do relatório continuam iguais; Reset preset segue sendo uma ação
explícita de restauração dos defaults.

Markierungen e seus títulos não aparecem nos controles e não entram nas novas
saídas do Studio, inclusive quando um draft antigo guarda diagram.areas=true.
A captura, as marcações do projeto, os flags anteriores e os offsets salvos
não são apagados. Presentation começa com areas=false. A função de movimento
continua capaz de tratar áreas visíveis, mas não há áreas herdadas visíveis
nesta versão. Não foram criadas marcações próprias do Studio.

### Checkpoint 3: seleção e movimento

Clicar num card seleciona; clicar em espaço vazio desmarca. A indicação de
aparelho selecionado só existe enquanto há seleção real e desaparece também
quando esse aparelho é ocultado. Ativar movimento global limpa a seleção
individual e destaca a barra e o botão ativo. Clicar novamente retorna ao
movimento individual. Não há seleção múltipla nova.

Escape cancela primeiro um arraste ativo. Fora dele, sai do modo global ou
limpa a seleção; sem um estado de edição ativo, continua fechando o Studio.
O callback usado pelo iframe consulta o estado atual, evitando uma ação
obsoleta depois de selecionar um aparelho. Repetições da mesma tecla não
fecham o modal em sequência. Movimento global, limites imprimíveis e undo
foram verificados com um vetor igual em todos os cards; as tabelas permanecem
independentes. O terceiro checkpoint passou antes da matriz final.

### Validação e artefatos

Executar node scripts/test-studio-interface.mjs para a revisão nativa em
perfil e banco descartáveis. NETLAB_STUDIO_INTERFACE_CHECKPOINT=1, 2 ou 3
interrompe após validar o checkpoint correspondente; sem a variável, executa
também persistência e exportações. São nove cenários nativos novos, além dos
checks do repositório usados pelo runner. Não abre o banco normal do usuário.

A rede de revisão contém quatro routers, três switches, seis hosts e quatro
Routing Tables. A revisão verifica fechamento/reabertura, F5, quatro layouts
independentes e download/importação reais de Topology JSON; os campos e as
coordenadas persistidas são comparados estruturalmente. As conversões visuais
usam tolerância de um milionésimo de pixel para erro de ponto flutuante.

A matriz de 36 variantes cobre três presets, DE/EN/PT-BR e quatro folhas.
Há nove downloads SVG/PNG/HTML reais e um Topology JSON, mais doze PDFs
impressos diretamente pelo Chromium. A primeira página HTML usa o mesmo SVG
exportado; os cards do SVG baixado têm a mesma geometria da prévia e os PNGs
usam a escala de saída existente. O QA de PDF confere tamanho físico, todas as
páginas previstas, branding e títulos presentes, metadados automáticos ausentes
e rodapé somente na última página. Os doze PDFs totalizam 39 páginas e foram
lidos com Poppler; primeira/última páginas representativas foram renderizadas
e inspecionadas. Os menus também foram exercitados em 1100, 800 e 480 px,
sem overflow horizontal, nos três idiomas, com navegação por teclado.

A suíte completa passou com 172 arquivos / 2.938 testes; os testes direcionados
do Studio/metadados passaram com 22 arquivos / 195 testes. TypeScript, build
e diff-check passaram. Permanece o aviso conhecido de chunk acima de 500 kB.

Artefatos em .playwright-mcp/reviews/studio-interface/. A subpasta
referencias-chatgpt contém somente seis PNGs finais numerados: três presets,
edição recolhível dos blocos e telas menores em PT-BR/EN. Logs, PDFs,
renderizações e JSONs ficam fora dela. review.html reúne as capturas e as
provas. As capturas de folha inteira usam 50% de escala do diagrama para
acomodar as quatro tabelas e demonstram essa configuração; o aviso de
diagrama denso recomenda A3, maior escala ou inspeção vetorial quando adequado.

Limites: títulos muito longos e conteúdo manual podem colidir; o Studio avisa
e deixa o ajuste com o usuário. O estado aberto/fechado dos menus é temporário
e reinicia ao abrir a ferramenta. Um texto personalizado exatamente igual ao
antigo título padrão NetLab-FiSI é indistinguível desse default na migração.
Não há áreas editáveis próprias do Studio nesta rodada. Nenhuma alteração no
canvas principal, simulação, capítulos 4/5, commit, push, merge ou deploy.
