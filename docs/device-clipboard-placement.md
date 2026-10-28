# Clipboard de equipamentos e inserção no canvas

Implementação de 28/10/2026. Não altera protocolos, documentos, IndexedDB nem os
verificadores de Labs/Übungen. Nenhuma dependência nova.

## Uso e foco

Shift + arrastar mantém a seleção nativa do React Flow. Com o canvas em foco,
Ctrl+C/Cmd+C copia a seleção; Ctrl+V/Cmd+V insere o grupo perto do último cursor
no canvas ou da região visível. As cópias ficam selecionadas. Cada colagem é uma
operação Undo/Redo, incluindo os cabos internos. Repetir a colagem não acumula
offsets no conteúdo copiado nem altera as distâncias relativas dos membros.

O clipboard é interno e temporário: funciona entre planos abertos na mesma
instância, não escreve nem lê o clipboard de texto do sistema e não sobrevive
ao recarregamento da página. Os equipamentos já colados são documentos normais
e sobrevivem a Save/Load, autosave, F5, import/export e troca de planos.

Inputs, textarea, contenteditable, popovers, botões e xterm preservam suas ações
normais. No terminal, Ctrl+C continua interrompendo comandos; colar texto não
duplica dispositivos. O clipboard de equipamentos fica inativo durante desenho
de áreas, edição geométrica, Quick Ping e reencaixe de cabos.

## Política de configurações

| Dado | Política da cópia |
|---|---|
| IDs de equipamentos/cabos | Novos, sem reutilizar IDs da seleção nem do destino |
| MACs | Novos, válidos, distintos dos originais e do destino |
| Nomes | Gerados pelo tipo, únicos no plano de destino |
| Tipo, OS, quantidade/nome de interfaces, estado UP/DOWN, VLANs | Preservados |
| Cor personalizada do equipamento/terminal e dos cabos internos | Preservada pela fonte existente |
| IPv4 estático ou dinâmico atual, gateway, DNS de interface/manual, rotas estáticas | Não copiados; interfaces estáticas passam a `unconfigured` |
| Modo cliente DHCP | Preservado, sem endereço ou lease; solicitar DHCP normalmente |
| Configuração de pools DHCP | Preservada, mas todos os pools ficam desativados |
| RIP | Desativado; forwarding, regras de firewall, DNS/HTTP e outros serviços/configurações permanecem |
| ARP, MAC learning, conntrack, leases, eventos, captura, comandos, sessões xterm | Nunca copiados |
| Cabos/associações com ambos os equipamentos selecionados | Copiados, preservando interfaces reais, meio, latência e aparência |
| Cabos para fora da seleção | Não copiados |
| WLAN | AP e cliente selecionados geram novos IDs/MACs e porta virtual vinculada ao novo cliente; portas virtuais externas são omitidas |
| Markierungen, membros, extensões, progresso de exercícios/Labs | Não copiados |

O toast após colar lembra o reset de IPv4 e a desativação dos pools. A política
evita IPs duplicados e servidores DHCP concorrentes involuntários. Não deduz uma
nova sub-rede nem reescreve regras de firewall, registros DNS ou conteúdo HTTP.
Essas configurações continuam exigindo revisão do usuário antes de reutilizar
uma cópia numa nova rede.

Labs não possuem uma restrição de criação adicional no modelo atual: continuam
permitindo dispositivos extras, como no catálogo. Nomes novos não substituem os
nomes já presentes. Übungen continuam avaliando seus IDs estáveis; cópias não
recebem esses IDs nem progresso/metadados da atividade. Não se alterou avaliação.

## Posicionamento

O drag & drop já existia (`application/netsim`). Foi mantida sua conversão por
`screenToFlowPosition`, inclusive os offsets existentes de encaixe ao cursor.

O clique no catálogo usa, nesta ordem, um dispositivo selecionado, a seleção do
Inspector, o último criado no plano e o centro da área visível. Busca posições
livres num reticulado local com margens de 32 unidades do mundo, priorizando
candidatos dentro da viewport. Há quebra de linha quando a próxima coluna sai
da região visível. Footprints consideram artwork e dimensões medidas, sem
alterar sprites, hitboxes, cabos, anchors ou compensação de legendas.

Grupos são somente transladados. Nem membros entre si nem dispositivos existentes
são reposicionados. Áreas coloridas não bloqueiam a inserção e não recebem
membros automaticamente. Se a viewport está cheia ou o grupo é maior que ela,
a posição livre pode ficar fora da tela; não há pan, zoom ou Fit View automático.
A busca usa caixas e margem, não um algoritmo global de packing, nem roteia cabos.

## Arquivos

- `src/deviceClipboard.ts`: captura de configuração, política e remapeamento.
- `src/devicePlacement.ts`: footprints, busca de espaço e coordenadas visíveis.
- `src/store.ts`: clipboard temporário, inserção e integração ao histórico.
- `src/topologyHistory.ts`: operação `paste-devices`, reutilizando a restauração
  validada de dispositivos e conexões já existente em `topologyEdits.ts`.
- `src/topologyShortcuts.ts`, `src/components/Flow.tsx`: foco e atalhos locais.
- `src/components/Palette.tsx`: clique inteligente, drag existente preservado.
- Testes nesses módulos e `src/terminals.test.ts`; runner
  `scripts/test-device-editing.mjs` / `scripts/device-editing-review.mjs`.
- `scripts/test-project-repository.mjs`: apenas integração do novo review ao
  harness descartável, mantendo isolamento de dados e downloads.
- `scripts/area-markings-review.mjs`: agora exige duplicação real, sem criar área.

## Investigação histórica

Foram consultados os logs de todas as refs locais, a evolução de `clipboard.ts`
e 29 revisões dos arquivos de canvas/store. Não foi encontrado handler anterior
de cópia/colagem de dispositivos; ocorrências antigas de clipboard são texto,
configurações e Share Link. Isso não prova ausência em branches/remotos que não
existam neste checkout, mas não há evidência local de regressão da duplicação.

## Validação

```powershell
node scripts/test-device-editing.mjs
node scripts/test-area-markings.mjs
node node_modules/vitest/vitest.mjs run src/deviceClipboard.test.ts src/devicePlacement.test.ts src/topologyShortcuts.test.ts src/terminals.test.ts src/topologyHistory.test.ts src/topologyEdits.test.ts src/areaMarkings.test.ts src/markingGeometry.test.ts src/exercises/exerciseIdentity.test.ts src/labs/labs.test.ts src/persistence/topologyDocument.test.ts src/persistence/persistenceSafety.test.ts
npm.cmd run build
git diff --check
```

Os testes de Chromium utilizam perfil, porta e banco temporários, sem acessar
dados reais. Capturas e logs ficam em `.playwright-mcp/`, fora do Git.

Resultado: **401 testes direcionados em 12 arquivos**, TypeScript, build e
`git diff --check` aprovados. No Chromium, **109 casos** no runner de clipboard
e **117** no de Markierungen (incluem os cenários comuns do harness, não somar
como testes distintos). Sem erros de JavaScript ou downloads no review.

Foram exercitados: um PC, quatro PCs selecionados com Shift, espaçamento exato,
colagem repetida, seleção das cópias, Undo/Redo, cabos internos/exclusão de cabos
externos, dez cliques no catálogo, inserção perto da seleção, DataTransfer do
catálogo com zoom/pan em 0,5×/1×/2×, campos do Inspector, Ctrl+C interrompendo ping
no xterm real, texto colado no terminal, Save/Load, importação JSON, F5, troca de
planos e tentativa real de Übung sem alteração de progresso/identidade. A busca
em 300 dispositivos e WLAN remapeada também têm testes de unidade direcionados.

Revisão com Graphite Dark/Classic Light em 1440/700 px: quatro PNGs principais na
raiz de `.playwright-mcp/reviews/` e cinco capturas completas em
`raw/2026-10-28--device-clipboard-placement/`. O aviso de build sobre chunk acima
de 500 kB permanece; não é uma falha nova de TypeScript/build.
