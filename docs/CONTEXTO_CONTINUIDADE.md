# Continuidade entre escola e casa

**Passagem de 20/11/2026 · branch `main`.** O tutorial progressivo NAT/PAT agora abre em **Exercícios (Beta) → Tutoriais guiados → Tutorial progressivo — NAT/PAT**. Tentativas anteriores usam o mesmo formato de progresso. O cenário **Internet simulada** continua em Labs.

A entrega inclui o SVG da regra inicial, o editor de `masquerade` em **Router Borda → Inspector → Firewall** com prévia copiável de `nft`, e a conclusão da Etapa 3 em duas partes. Primeiro, o aluno confirma o HTTP traduzido no navegador de PC2. Em seguida, a demonstração comprova duas conexões simultâneas e apresenta o Conntrack. Consulte o [guia NAT/PAT](progressive-nat-pat.md) para o comando equivalente e o roteiro de revisão.

TypeScript e build passaram. A revisão descartável em Chromium passou 107 verificações, incluindo as duas formas de configurar NAT, HTTP manual, PAT simultâneo, F5 e Save/Load. A suíte completa ainda aponta uma falha preexistente no teste de visibilidade do salto ARP do Capítulo 4, reproduzida também na base `58529f9`.

## Retomar em casa

Atualize a `main` a partir de `origin/main` se o checkout de casa estiver limpo e puder avançar diretamente. A pendência é o teste manual com aluno. Na Etapa 3, confira a edição da regra pelo Inspector ou pelo terminal, reabra `http://198.51.100.80` no PC2 e só então execute a demonstração de PAT. Abra **Firewall → Conntrack** logo após o teste para comparar as portas externas. Verifique se as instruções bastam para encontrar os mapeamentos.
