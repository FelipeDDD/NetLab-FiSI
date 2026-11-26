# Continuidade entre escola e casa

**Passagem de 24/11/2026 · branch `main`.** O Modem Bridge agora tem variantes branca e grafite e contadores de tráfego por porta. O Packet Inspector e as animações do canvas têm filtros independentes. Em uma transmissão capturada, **Investigar percurso** abre o diagnóstico com saltos correlacionados e evidências de rota, ARP, NAT/PAT e firewall. Veja os guias do [Modem Bridge](modem-bridge.md) e da [inspeção de pacotes](packet-animation.md).

Os últimos ajustes destacam a transmissão selecionada no diagnóstico, distinguem requisições, respostas e erros ICMP e retiram os IDs internos dos enlaces da descrição. O Packet Inspector abre com filtros recolhidos, tem divisória redimensionável e alterna a prioridade com o Terminal Dock quando os painéis se sobrepõem.

**Publicação de 26/11/2026.** O navegador permite escolher um Host real em **+** e mantém uma guia por Host. No NAT/PAT, o Servidor Web está mais à direita e o cabo sai reto do Router Borda. O catálogo mostra o Modem branco em temas escuros e grafite em temas claros. [Guia do navegador](pc-browser.md)

**Revisão de 26/11/2026.** Tutoriais guiados tem um cabeçalho destacado abaixo de Prática de cálculo. Abas sem nome usam o título do tutorial quando há vínculo confirmado. **Novo plano** acompanha a última aba e fica na borda direita quando as abas precisam rolar. O estado recolhido acompanha a tentativa durante a sessão. A conclusão histórica do NAT/PAT aparece no menu junto do progresso da tentativa atual. O painel do Capítulo 6 usa rótulos acessíveis e ajuda visual no idioma ativo. [Guia NAT/PAT](progressive-nat-pat.md)

## Retomar em 27/11/2026

Atualize a `main` a partir de `origin/main` se o checkout permitir avanço direto.

1. Revisar o tutorial NAT/PAT em DE, EN e PT-BR. O painel, as dicas, as mensagens e a ilustração da regra já acompanham o idioma ativo. Na etapa 3, conferir com um aluno o HTTP de PC2 e a comparação das portas externas em **Firewall → Conntrack**. [Guia do tutorial](progressive-nat-pat.md)
2. Publicar a versão atualizada na Vercel após revisar a tradução. O formulário Tally já foi publicado e testado em desenvolvimento, e o ID já está configurado na Vercel. [Configuração do Tally](feedback-tally.md)

Para depois, revisar manualmente o diagnóstico com ICMP sem rota, NAT/PAT e terminal aberto. VLAN Trunk 802.1Q segue como candidata a uma próxima implementação.

## Validação

A tradução do NAT/PAT passou em 138 testes direcionados e 109 verificações em Chromium. O fluxo incluiu troca de idioma, Save/Load, F5, tentativa legada e PAT com duas conexões reais. TypeScript e build passaram.

A regressão Chromium do capítulo 6 verifica os controles compartilhados de movimentação, restauração, recolhimento, expansão e reinício ao alternar DE, EN e PT-BR durante a mesma tentativa. [Roteiro de revisão](../scripts/lpm-tutorial-review.mjs)

A suíte completa ainda sinaliza a falha conhecida de visibilidade de um salto ARP no Capítulo 4 (`staticRoutingPresentation.test.ts`), já reproduzida na base `58529f9`.
