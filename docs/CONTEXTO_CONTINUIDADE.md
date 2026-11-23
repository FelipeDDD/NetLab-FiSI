# Continuidade entre escola e casa

**Passagem de 23/11/2026 · branch `main`.** A revisão atual de **Exercícios (Beta) → Tutoriais guiados → Tutorial progressivo — NAT/PAT** preserva as etapas 1 e 2 comprovadas ao revisitar após a correção do NAT. Se ainda faltar responder à comparação SYN após F5, o painel orienta a refazer a captura. O catálogo fica acessível com o Packet Inspector aberto e o [navegador simulado](pc-browser.md) usa uma janela compartilhada, com até três guias e sessões separadas por Host.

## Retomar em casa

Atualize a `main` a partir de `origin/main` se o checkout estiver limpo e puder avançar diretamente. No próximo teste com aluno, confira a troca entre PC1 e PC2 na mesma janela e a revisão das etapas 1 e 2 após F5. Na Etapa 3, confirme o HTTP de PC2 após corrigir o NAT, execute a demonstração de PAT e abra **Firewall → Conntrack** para comparar as portas externas. O [guia do tutorial](progressive-nat-pat.md) reúne o fluxo e o roteiro de revisão.

A escolha do destaque para termos técnicos segue aberta. A está na comparação dos SYN, B na configuração de PC2 e C em `eth1` e `Conntrack` na última tela. C recebeu avaliação positiva e permanece como está até a decisão.

A suíte completa ainda sinaliza a falha conhecida de visibilidade de um salto ARP no Capítulo 4 (`staticRoutingPresentation.test.ts`), já reproduzida na base `58529f9`.
