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

Somente dispositivos com terminal iniciam Quick Ping. Qualquer dispositivo IP
com endereço unicast configurado elegível pode ser destino, inclusive smartphone.
Endereços iguais são agrupados por interface. Um único endereço é automático;
com vários, uma única opção na sub-rede da origem é preferida. Caso contrário,
o painel oferece a lista simples de endereços. Isso não testa nem promete
conectividade: endereço configurado em interface desligada ainda pode falhar.
IPs/gateways nunca são atribuídos ou corrigidos pela ferramenta.

`openTerminal` e `getSession` reutilizam a sessão existente. A nova API
`Session.executeCommand()` compartilha fila de entrada, prompt, histórico,
`submit()` e `Shell.exec` com o Enter do terminal:

- Linux: `ping -c 4 ENDEREÇO`.
- Windows: `ping -n 4 ENDEREÇO`.

Não há segundo motor, sucesso sintético ou lógica paralela de ARP/VLAN/rotas/
firewall. A política existente `needsScheduler` libera somente uma pausa de
ativação/restauração; nunca libera Pause manual. Um comando já em execução ou
texto ainda digitado impede o envio e produz aviso, sem apagar a entrada.
A chamada pode retornar `accepted`, `busy`, `unapplied-input` ou `disposed`.
`accepted` confirma a submissão à fila do terminal, não a resposta do destino.
A fila bloqueia entradas concorrentes até concluir a pintura/submissão; dispose
invalida callbacks pendentes. O botão e o clique de destino não duplicam sessões.

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

A revisão Chromium também cobre ping por terminal Linux/Windows, captura pelo
dropdown superior, uma bolinha por frame, mudança de velocidade sem saltos,
fechamento manual e automático e ausência de controles didáticos em Packets.
Os resultados e capturas ficam na galeria local; o build mantém apenas o aviso
conhecido de tamanho de chunk acima de 500 kB.
