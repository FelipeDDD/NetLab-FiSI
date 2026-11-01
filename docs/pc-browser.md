# PC Desktop e navegador educacional

## Abrir e testar

Selecionar um **Host Linux/Windows** (ou Notebook), abrir **Allgemein** no Inspector e clicar em **Desktop**, ao lado de Terminal. No Desktop, abrir **Web Browser**. Windows e Linux usam o mesmo componente e a mesma pilha de rede.

Também é possível clicar com o botão direito no PC/Notebook e escolher **Browser öffnen / Open Browser / Abrir navegador**, abrindo diretamente o aplicativo. O menu usa o `FloatingPopover` existente, permite Shift+F10/tecla de menu no node focado e fecha com Escape ou clique externo. Não há botão novo sobre o sprite. Reabrir pelo menu no mesmo dispositivo foca a janela existente, sem duplicá-la ou reiniciar a navegação.

Topologia mínima:

1. PC `192.168.1.10/24` e Server `192.168.1.20/24`, ligados diretamente ou pelo mesmo Switch/VLAN.
2. No Server, ativar HTTP em **Dienste**, porta 80, e configurar o corpo da página. Exemplo: `<h1>Serviceportal</h1><p>Willkommen!</p><a href="/index.html">Startseite</a>`.
3. No navegador, abrir `http://192.168.1.20` ou `http://192.168.1.20/index.html`.
4. Para nomes, ativar DNS, criar o registro A `server.lab → 192.168.1.20` e configurar esse servidor DNS no PC. Abrir `http://server.lab`.
5. Entre subnets, configurar gateways, rotas de ida/retorno, forwarding e filtros conforme a rede. O navegador não configura esses valores automaticamente.

URLs com porta explícita são aceitas, por exemplo `http://server.lab:8080/` quando o serviço HTTP usa 8080. Voltar, avançar, links e atualizar fazem novas solicitações pela rede simulada. **Packets** registra o tráfego quando a captura está ativa.

## Funcionamento real e simplificações

`requestPage()` reutiliza `resolveHost()` e `IpDevice.httpGet()`. Nomes usam o DNS configurado no PC; IPv4 literal segue diretamente à pilha IP. ARP, seleção de interface/rota/gateway, bridge/VLAN, forwarding, firewall, conexão TCP e resposta HTTP seguem os fluxos existentes da engine. Os eventos aparecem nas animações Live e no Packet Capture existentes. Não existe `fetch`, iframe ou acesso à internet real para navegar.

O TCP/HTTP já é um modelo educacional de flags, portas e mensagens estruturadas; não implementa todo o TCP/IP ou um navegador de internet. São suportados GET, texto, títulos, listas, ênfase, código e links. Não há CSS de páginas, JavaScript, imagens externas, formulários, downloads, cookies, autenticação, redirects automáticos ou um filesystem web. Replay didático de ping continua independente; não foi criado replay Guided específico para HTTP.

O serviço HTTP preexistente tem **uma página configurável**, sem coleção de arquivos. `/` e `/index.html` servem esse corpo; query strings não mudam a página. Outros caminhos agora recebem **HTTP 404 Not Found produzido pelo servidor**, visível como pacote de resposta, em vez de um erro inventado pela UI. Antes, qualquer caminho retornava a mesma página. Isso não altera o schema nem reescreve configurações HTTP salvas.

Conteúdo é analisado em um `<template>` inerte cujos nós nunca são inseridos na página. Apenas texto e elementos permitidos são reconstruídos com React, sem atributos fornecidos pelo serviço. Scripts, estilos, imagens, iframes e outros recursos são descartados. Links viram controles locais que chamam a engine; não são hyperlinks reais para os IPs simulados. Existem limites de conteúdo (100.000 caracteres), profundidade e quantidade de nós para evitar renderização excessiva.

## Falhas, pausa e cancelamento

- Nome não resolvido: falha do resolver existente; não presume NXDOMAIN quando a engine só informa falha temporária.
- Sem rota/interface operacional ou gateway que falhou nas tentativas ARP: resultado inacessível da engine.
- Serviço desligado/porta fechada ou REJECT que envia recusa: conexão recusada; a UI recomenda verificar serviço, porta e filtros, sem atribuir uma causa única.
- DROP silencioso: timeout, sem afirmar qual equipamento causou a perda.
- TCP aberto sem resposta HTTP: resposta HTTP ausente, separada da falha de conexão.
- HTTP 200/404: status e corpo realmente recebidos pelo PC.

Timeouts usam exclusivamente o Scheduler. Uma navegação inicia Run somente quando a pausa é a automática de ativação/restauração. Pausa manual é preservada e explicada na janela; Run continua disponível na toolbar. Abrir o Desktop ou o Browser não inicia tráfego ou a simulação por si só.

Parar, trocar URL ou fechar cancela a observação atual; os novos controles opcionais de sockets também removem a sessão HTTP/TCP e seu timeout. Pacotes já enviados e trabalho ARP/DNS em andamento não são desfeitos artificialmente. Nenhuma resposta antiga é aplicada a uma navegação nova. Alterar rede/serviço e tentar novamente utiliza a configuração atual.

## Mensagens educativas de erro

`browser/errorPresentation.ts` mapeia resultados observados para títulos naturais DE/EN/PT-BR, um código familiar quando aplicável e um bloco curto **O que significa?**. `BrowserErrorPanel.tsx` reutiliza os tokens do tema. Detalhes internos como `unreachable` ou mensagens do console não são renderizados.

| Evidência recebida | Código de apresentação |
|---|---|
| Nome não resolvido | `ERR_NAME_NOT_RESOLVED` |
| Destino/rota inacessível | `ERR_ADDRESS_UNREACHABLE` |
| Conexão recusada | `ERR_CONNECTION_REFUSED` |
| Tentativa de conexão expirada | `ERR_CONNECTION_TIMED_OUT` |
| TCP estabelecido, mas sem resposta HTTP até o prazo (`empty`) | `ERR_TIMED_OUT` |
| Resposta HTTP 403/404 recebida | O status HTTP real, sem inventar código de transporte |

Esses rótulos seguem os significados dos [erros de rede do Chromium](https://chromium.googlesource.com/chromium/src/+/main/net/base/net_error_list.h). Não representam um erro emitido pelo navegador hospedeiro. `ERR_EMPTY_RESPONSE` não é usado: a engine informa ausência de resposta antes do timeout, sem comprovar fechamento da conexão pelo servidor. URL inválida, HTTPS não implementado e falha desconhecida não recebem códigos artificiais de SSL ou diagnóstico específico.

O adaptador compartilhado `commands/resolve.ts` agora devolve também uma razão estruturada, mantendo os textos e o comportamento dos comandos existentes: DNS indisponível na configuração ativa, nome sem registro, resolução sem resposta utilizável ou recusa. O sinal `timeout` do resolver também pode resultar de uma falha local de envio; por isso o texto não afirma que o prazo necessariamente se esgotou. Nenhum protocolo foi alterado.

Após resolução bem-sucedida, `requestPage()` conserva somente evidências de apresentação (nome, IP e indicação de uso de DNS). Se a conexão falhar depois, a UI mostra **DNS resolvido: nome → IP**, distinguindo essa fase de falha DNS. Um timeout não é atribuído automaticamente a firewall, e recusa não é atribuída exclusivamente ao serviço final.

Para 403/404, o servidor foi alcançado e devolveu HTTP. O corpo original permanece disponível em **Resposta do servidor**, recolhido para evitar duplicar a página de erro em janelas pequenas. O serviço de página única atual ainda produz somente 200/404; o mapeamento 403 é testado como contrato de apresentação de um status recebido, sem criar uma funcionalidade de autorização ou gerar 403 na UI.

Validação desta rodada: **362 testes em 7 arquivos** (incluindo regressões de comandos, terminais e Packet Capture), **112 verificações Chromium**, TypeScript, build e `git diff --check`. HTTP 403 foi conferido em testes de apresentação; HTTP 200/404 e falhas de rede foram conferidos usando a engine. Capturas principais: `01-browser-error-dns.png`, `02-browser-error-refused.png`, `03-browser-error-mobile.png`; galeria e extras em `.playwright-mcp/reviews/raw/2026-11-01--pc-browser--02/`.

## HTTPS

Não há TLS, certificados, criptografia ou cadeado de segurança. Uma URL `https://` exibe essa limitação e não solicita uma página HTTPS.

O botão explícito **TCP-Port 443 testen (ohne TLS)** (ou a porta indicada na URL) reutiliza `connectTcp()` para testar somente a conectividade TCP. Porta aberta não é apresentada como HTTPS funcional ou conexão segura. Um serviço TCP genérico na porta 443 basta para esse teste; nenhuma requisição HTTP é enviada pelo probe.

## Estado e layout

Uma janela de Desktop por vez, independente das sessões xterm. O Browser pode ser fechado/reaberto no mesmo Desktop; fechar o Desktop descarta seu histórico. Não há persistência de páginas ou progresso, nem alteração de IndexedDB, documentos de topologia ou Undo/Redo.

A janela usa tokens dos temas existentes e não redimensiona React Flow. Em telas estreitas fica sobre a área central, podendo cobrir o Inspector temporariamente. Fechar a janela revela os painéis anteriores, preservando seleção, posições e viewport. Escape fecha primeiro o Browser e depois o Desktop. Excluir o PC ou trocar o plano invalida a referência à instância antiga e fecha a janela, sem associá-la a outro dispositivo com o mesmo ID.

### Janela compacta, movimento e tamanho

Desktop e Browser compartilham uma moldura inicial de **600 × 420 px**. Arrastar qualquer um dos dois cabeçalhos move essa janela; arrastar bordas/cantos redimensiona. As áreas de interação ficam dentro da moldura e não acrescentam overflow. Não existe uma segunda instância de Browser criada ao alternar Desktop/Browser.

Limites em `browser/windowGeometry.ts`: mínimo de **360 × 280 px**, reduzido somente se a área disponível for menor, e máximo limitado à área central do aplicativo, com margem de 8 px. São coordenadas CSS da interface, independentes do zoom/pan do React Flow. `ResizeObserver` acompanha a área disponível, inclusive abertura do dock e mudanças de viewport, sem desmontar a janela ou seus filhos. O tamanho preferido pode ser recuperado ao voltar de uma janela estreita, desde que o usuário não tenha redimensionado manualmente nesse intervalo.

Cabeçalhos e bordas são focáveis: setas movem/redimensionam em passos de 5 px; Shift usa 20 px. Escape durante o gesto cancela a alteração geométrica; fora dele conserva o fechamento existente. Pointer capture e `touch-action` seguem o padrão dos painéis redimensionáveis, com suporte a mouse e toque. Histórico, endereço digitado, resposta carregada e requisição atual não são alterados por movimento ou redimensionamento. Posição e tamanho são transitórios desta janela, sem novas preferências ou dados no projeto.

## Arquivos e validação

- `src/browser/request.ts`: URLs, resolução, HTTP e probe TCP.
- `src/browser/content.tsx`: renderização restrita e inerte.
- `src/browser/desktopState.ts`, `DesktopSurface.tsx`, `PCDesktop.tsx`, `browser.css`, `messages.ts`: estado transitório, abertura, janela, temas e DE/EN/PT-BR.
- `src/browser/windowGeometry.ts`, `useDesktopWindow.ts`, `windowGeometry.test.ts`: geometria limitada, gestos e regressões de janela única.
- `src/components/DeviceContextMenu.tsx`, `src/components/Flow.tsx`: menu contextual reutilizando o popover e eventos de nodes existentes.
- `src/engine/ipdevice.ts`: handles opcionais de cancelamento e resposta 404 do serviço de página única.
- `src/App.tsx`, `src/components/Inspector.tsx`: integração discreta.
- `src/browser/request.test.ts`, `scripts/browser-review.mjs`, `scripts/test-browser.mjs`, `scripts/test-project-repository.mjs`: testes reais e revisão isolada.

```powershell
npm test -- src/browser src/commands/services.test.ts src/components/Inspector.test.ts src/terminals.test.ts src/packetCapture.test.ts
node scripts/test-browser.mjs
npm run build
git diff --check
```

Os cenários automatizados incluem mesma subnet, roteamento, DNS, gateway incorreto/ausente, firewall DROP/REJECT, HTTP desligado, porta TCP genérica, 404, mudanças de interfaces/serviço/conexão e cancelamento. A revisão Chromium usa perfil e IndexedDB descartáveis, verifica ausência de execução de scripts/recursos reais e testa Windows/Linux, histórico, pausa manual, probe sem TLS e layouts 1440/700/390 px.

Resultado desta implementação: **364 testes direcionados em 5 arquivos** e **109 verificações Chromium**, sem falhas nem erros de navegador; TypeScript e build aprovados (somente o aviso preexistente de chunk grande). Três capturas principais ignoradas pelo Git em `.playwright-mcp/reviews/`: `01-desktop-windows.png`, `02-browser-http-desktop.png`, `03-browser-http-mobile.png`. Outros três exemplos (404, TCP sem TLS e 700 px) e galeria em `raw/2026-10-31--pc-browser/`. Revisões anteriores são arquivadas pelo fluxo Visual Review existente.

Rodada de janelas compactas: **57 testes direcionados em 4 arquivos** (geometria, janela única, requisições, Inspector e atalhos) e **111 verificações Chromium**, sem falhas ou erros de navegador. Conferidos 600 × 420 px iniciais, dois cabeçalhos, oito bordas/cantos, teclado, toque em mobile, menu por mouse/Shift+F10, ausência de duplicatas, histórico/página preservados e nenhuma alteração do documento ou viewport durante os gestos. Capturas atualizadas nos mesmos três nomes principais; sete capturas e galeria em `raw/2026-11-01--pc-browser/`, incluindo a janela redimensionada. Engine e lógica de requisições não foram alteradas nesta rodada.
