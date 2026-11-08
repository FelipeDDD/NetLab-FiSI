# Ações definitivas e Quick Ping

Terminal e Ping usam o mesmo componente `DeviceActions`: círculos de 28 px,
respectivamente nos cantos superior esquerdo e direito, a 3 px das margens.
Aparecem no hover, seleção ou foco; a origem do Quick Ping continua destacada.
O badge do sistema foi deslocado apenas na horizontal para liberar o Terminal.
Sprites, dimensões dos nodes, quatro Handles, cabos e captions não mudaram.
Os parâmetros `deviceActions=a/b` e o código de comparação foram removidos.
Hover e seleção usam a identidade existente do equipamento, com tintas leves,
borda e brilho moderado. `prefers-reduced-motion` desativa as transições.

## Quick Ping

`store.beginQuickPing(id)` inicia a escolha; clicar no destino chama
`chooseQuickPingTarget(id, address?)`. Esc, Abbrechen ou clicar novamente na ação
da origem cancelam. A ativação de outra topologia e a remoção dos dispositivos
referenciados eliminam o estado temporário. Durante a escolha, drag, conexão de
cabos e atalhos de movimento dos nodes ficam suspensos; cancelar os libera.
A reconexão de cabos cancela a escolha de ping e vice-versa.
Durante a seleção, o canvas usa um cursor de alvo de 28 px, com o ponto de clique
no centro. Ele fica verde sobre dispositivos que oferecem um IPv4 elegível;
isso indica seleção disponível, sem prometer alcance ou resposta ao ping.
Concluir/cancelar restaura o cursor normal. Os SVGs ficam em `public/assets/cursors/`.

Somente dispositivos com terminal iniciam Quick Ping. Qualquer dispositivo IP
com endereço unicast configurado elegível pode ser destino, inclusive smartphone.
Endereços iguais são agrupados por interface. Um único IPv4 distinto utilizável é
automático; dois ou mais sempre exigem escolha, mesmo se só um estiver na subnet
da origem. Cada tentativa oferece novamente a lista inteira, sem preferência
memorizada. O seletor compacto fica acima do próprio destino, acompanha pan/zoom
e passa para baixo quando falta espaço acima; limita largura e permite scroll
em janelas estreitas. Cada opção mostra o IP e suas interfaces. Setas,
Home/End e Enter permitem escolher; Tab sai do menu. Escape ou Abbrechen cancelam sem enviar.
O pan no canvas mantém o seletor aberto enquanto o destino está visível.
Isso não testa nem promete
conectividade: endereço configurado em interface desligada ainda pode falhar.
IPs/gateways nunca são atribuídos ou corrigidos pela ferramenta.

`openTerminal` e `getSession` reutilizam a sessão existente. A API
`Session.executeQuickPing()` compartilha fila de entrada, prompt, histórico,
`submit()` e `Shell.exec` com o Enter do terminal:

- Linux: `ping -c 4 ENDEREÇO`.
- Windows: `ping -n 4 ENDEREÇO`.

Não há segundo motor, sucesso sintético ou lógica paralela de ARP/VLAN/rotas/
firewall. A política existente `needsScheduler` libera somente uma pausa de
ativação/restauração; nunca libera Pause manual. Um comando em execução impede
o envio e produz orientação para interrompê-lo com Ctrl+C; nunca é cancelado
automaticamente. Se estiver livre, o Quick Ping descarta apenas a entrada parcial
e limpa a tela visível (CSI 2J/H), mantendo histórico de comandos e scrollback.
Escritas pendentes de Ctrl+C/edição são processadas antes da preparação na mesma
fila; um `^C` antigo no output não representa um comando ativo. A resposta por
callback é `accepted`, `busy`, `cancelled` ou `disposed`.
`accepted` confirma a submissão pelo shell, não a resposta do destino.
A fila bloqueia entradas concorrentes até concluir a pintura/submissão; dispose
invalida callbacks pendentes. O botão e o clique de destino não duplicam sessões.
Cancelar durante a preparação impede o envio e remove a linha preparada. A API
geral `executeCommand()` conserva seu comportamento de proteger entradas parciais.
Os ícones têm uma pequena pressão por CSS, mais sutil no Terminal; Ping mantém
destaque enquanto escolhe o destino. Não mudam de tamanho/posição e respeitam
`prefers-reduced-motion`.

## Velocidade e abas

O Quick Ping abre automaticamente a barra inferior **Ping-Animation**, com um
slider Langsam/Normal/Schnell (0,5×/1×/2×). O padrão é 1×; a escolha controla
somente o cursor visual do ping, com uma bolinha por vez. A barra fecha 3 segundos
após a última animação e o fim do comando, ou manualmente. Packets mantém botão,
seta, aparência e captura/inspeção, sem controles de animação. O Scheduler fica
em 1×. As APIs técnicas anteriores continuam disponíveis internamente. Ver
[packet-animation.md](packet-animation.md) para os contratos e limites.

A barra de planos ficou 6 px mais baixa (2 px no padding superior e 4 px na
aba). Os alvos das abas mantêm pelo menos 32 px; fechar, indicador, ordem,
atalhos e drag continuam usando a infraestrutura existente.

## Validação

Refinamento de 02/11/2026: 308 testes direcionados (seleção de endereço,
posicionamento e terminais), TypeScript, build e diff-check aprovados.
A revisão Chromium focada concluiu 105 verificações sem erros, usando perfil e
bancos descartáveis. As duas novas regressões verificam seleção repetida após
conclusão/cancelamento, um único IP local entre vários, todos os IPs em subnets
remotas, duplicados e endereços inválidos; o popover cobre teclado, pan/zoom,
reposicionamento e 700/1440 px nos dois temas.
Para repetir esse recorte, definir NETLAB_DEVICE_ACTION_REVIEW=1 e
NETLAB_QUICK_PING_REVIEW=1 ao executar scripts/test-project-repository.mjs.
O recorte evita os testes históricos de layout/tempo que interromperam a
revisão ampla antes da conclusão. Capturas acima/abaixo ficam na organização
existente em .playwright-mcp/reviews/.

```powershell
node scripts/test-device-actions.mjs
node node_modules/vitest/vitest.mjs run src/quickPing.test.ts src/terminals.test.ts src/packetAnimation.test.ts src/guidedPacket.test.ts src/engine/visualTrace.test.ts src/workspace/viewport.test.ts
node node_modules/typescript/bin/tsc --noEmit
npm run build
git diff --check
```

O harness existente usa Chromium com perfil e bancos descartáveis. A revisão
mede Linux/Windows em Host/Notebook, 700/1440 px, ambos os temas, zooms
0,5/0,75/1 e estados normal/hover/selecionado/foco. Valida ausência de sobreposição,
geometria estável, ping real Linux/Windows, terminal reutilizado, seleção de IP,
Esc, mudança de plano, falhas de VLAN/rota, barra inferior e velocidade. As capturas
reais e a galeria ficam em `.playwright-mcp/reviews/`, pela organização existente.
Dados reais do navegador, Save/Load, schema IndexedDB e protocolos não mudaram.

## Continuidade de hover e drop de cabos — 07/11/2026

As legendas IPv4 de routers podem tornar a seleção mais larga que o asset.
O contorno anterior era um pseudo-elemento sem eventos: atravessar essa faixa
até os botões encerrava o hover. `.device-interaction-region` agora recebe os
eventos exatamente dentro dos insets já usados pelo contorno. A geometria visual
de assets, legendas, seleção, botões e handles permanece igual. O hover termina
normalmente ao sair; os controles não ficam permanentemente visíveis.

O drop de conexão agora considera essa mesma região real, em client coordinates
(pan/zoom já aplicados pelo DOM), em vez de depender apenas do raio dos handles.
O `PointerEvent` fornece o ponto fracionário que o `mouseup` da biblioteca
arredondava nos zooms pequenos. `canvasDropTarget.ts` exige um destino único;
overlays, exterior e sobreposição ambígua não produzem conexões. Handles
explícitos continuam utilizáveis. `Flow.tsx` encaminha uma só tentativa à
validação existente de interfaces, preservando limites, portas e click-connect.

`scripts/test-canvas-interaction.mjs` reproduz hover lento/diagonal e drops reais
em 25/50/65/100/125%, incluindo routers com três/quatro IPv4, PCs, switches,
servidores, interfaces ocupadas, destino cheio, exterior e sobreposição. Os
retângulos de assets, rótulos, handles e controles são comparados antes/depois.
Resultados e capturas estão em `.playwright-mcp/reviews/canvas-studio-persistence/`;
somente os PNGs finais de referência ficam em `referencias-chatgpt/`.

Validação: 120 trajetos de hover sem interrupção e 120 drops sem falhas em pontos
válidos, além dos casos de capacidade e ambiguidade. No baseline dos routers,
36 dos 60 trajetos interrompiam os controles. A comparação visual final reproduz
a hitbox antiga desabilitando só o novo elemento transparente e captura o mesmo
ponto em 50%, com geometria idêntica. Suíte completa: 166 arquivos / 2.880 testes;
TypeScript, build e diff-check aprovados.

Refinamento posterior de zoom baixo: os botões Terminal/Quick Ping passam a
buscar 24 px de tela, limitados à largura interna da seleção com 4 px de
separação e ao espaço que mantém o centro clicável livre dos handles. Em 25%
isso resulta em 21,25 px nos routers e 17,25 px nos PCs da fixture; em 50/65%
chega a 24 px e em 100% os 28 px originais permanecem. O ajuste de escala em
`DeviceActions.tsx` cresce para dentro dos mesmos cantos; não muda a região de
hover/drop, handles, IP copiável ou validação dos cabos. Medidas e cliques reais
em 25/50/65/100%, incluindo cópia de IPv4, estão em
`.playwright-mcp/reviews/studio-distance-flip-hover/` e documentados em
[topology-studio.md](topology-studio.md).

A revisão Chromium também cobre ping por terminal Linux/Windows, captura pelo
dropdown superior, uma bolinha por frame, mudança de velocidade sem saltos,
fechamento manual e automático e ausência de controles didáticos em Packets.
Os resultados e capturas ficam na galeria local; o build mantém apenas o aviso
conhecido de tamanho de chunk acima de 500 kB.

### Quick Ping e controle móvel: refinamento de usabilidade

A seleção de destino mostra somente um indicador passivo de uma linha com a
origem, a instrução e Escape, localizado em DE/EN/PT-BR. Ele não captura cliques
nem cria um diálogo ou menu. A escolha explícita de IPv4 para destinos com vários
endereços continua usando o popover já existente; erros de seleção continuam
visíveis no indicador. O cancelamento por Escape permanece no canvas.

Auditoria do `Ping-Animation`: sua montagem depende de uma sessão de ping com
pelo menos um salto no player. `useEffect` torna o controle visível; não há timer
de bloqueio do drag. O único timer é o de ocultação após o fim da animação.
O teste de primeira aparição confirmou o cabeçalho como alvo real do ponteiro e
arraste nativo iniciado cerca de 44 ms após montar no ping normal e 6 ms no Quick
Ping, sem espera de 1–1,5 s. Esses tempos são medidas locais, não garantias de
latência. A disponibilidade da animação ainda depende de transmissões reais.

Ao pressionar o cabeçalho, a posição deixa imediatamente de ser recentralizada
automaticamente; o ResizeObserver ainda limita o painel à área visível se o dock
ou canvas mudar de tamanho. Slider, fechamento e retorno à posição padrão foram
preservados. O texto `Animation gekürzt · Details in Packets` e sua regra CSS foram
removidos; não havia traduções dessa frase no catálogo. Não houve mudança no
player, protocolo, duração de eventos, captura ou inspeção de pacotes.

Validação: `node scripts/test-ping-control-drag.mjs` cobre seleção/cancelamento,
três idiomas, dois temas, drag na primeira aparição com ping normal e Quick Ping,
viewport/dock, slider e reabertura. Os snapshots das posições dos equipamentos e
do zoom permanecem iguais após mover o controle. Capturas desta rodada:
`.playwright-mcp/reviews/quick-ping-usability/referencias-chatgpt/`.

### Lembrar velocidade da animação

A checkbox abaixo do slider habilita explicitamente a preferência global
`netlab:ping-animation-preference:v1` no localStorage, seguindo o padrão das
preferências locais da interface. Não entra no documento de uma topologia,
checkpoint, exportação ou progresso dos exercícios. Na ausência de preferência
válida, começa desmarcada e usa o padrão de 0,25×; chaves antigas de velocidade
não implicam consentimento para lembrar.

Somente o slider registra a velocidade manual; a checkbox salva essa escolha
quando ativada. Mudanças técnicas via `setPacketAnimationSpeed`, como os 2×
temporários do capítulo 4 e sua restauração, não gravam a preferência. Marcar a
checkbox durante esse override também guarda a última escolha manual.
Desmarcar não altera a animação em andamento; desativa a preferência persistida,
e a próxima inicialização volta ao padrão. Durante a mesma sessão, o slider
continua com o comportamento anterior. Armazenamento bloqueado não impede
o uso dos controles, mas a escolha pode não sobreviver ao fechamento do navegador.

Validação: leitura inválida/legada, opt-in/opt-out e override automático em
`src/pingAnimationPreference.test.ts`; F5, topologias, idiomas e temas em
`scripts/ping-speed-preference-review.mjs`; sequência automática e F5 do capítulo 4
com preferência habilitada no roteiro do capítulo. Captura:
`.playwright-mcp/reviews/ping-speed-preference/referencias-chatgpt/`.
